-- Weeks, meals, change log, ratings and scores. Spec sections 2, 3 and 5.
-- Week family and Monday, slot week, date and meal type are immutable for users: the
-- grants list only the content columns.

create table app.weeks (
	id uuid primary key default gen_random_uuid(),
	family_id uuid not null references app.families (id) on delete cascade,
	starts_on date not null check (extract(isodow from starts_on) = 1),
	generated_at timestamptz,
	unique (family_id, starts_on),
	unique (id, family_id)
);

create table app.meal_slots (
	id uuid primary key default gen_random_uuid(),
	week_id uuid not null references app.weeks (id) on delete cascade,
	date date not null,
	meal_type text not null check (meal_type in ('lunch', 'dinner')),
	recipe_id uuid references app.recipes (id) on delete restrict,
	free_text text,
	servings smallint not null check (servings >= 0),
	note text check (char_length(note) <= 200),
	-- null = the app (generation)
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	unique (week_id, date, meal_type),
	check (recipe_id is null or free_text is null)
);
create index meal_slots_recipe on app.meal_slots (recipe_id);

-- Security invoker on purpose: the week is read with the caller's RLS. A week the user
-- cannot access (another family's or missing) is not found, the check is skipped and
-- the insert fails on the policy in both cases alike; the job sees every week.
create function app.check_meal_slot_date()
returns trigger language plpgsql set search_path = '' as $$
declare
	v_starts_on date;
begin
	select starts_on into v_starts_on from app.weeks where id = new.week_id;
	if v_starts_on is null then
		return new;
	end if;
	if new.date < v_starts_on or new.date > v_starts_on + 6 then
		raise exception 'meal date % outside the week starting %', new.date, v_starts_on using errcode = '23514';
	end if;
	return new;
end;
$$;

create trigger meal_slots_check_date
	before insert on app.meal_slots
	for each row execute function app.check_meal_slot_date();

create table app.meal_changes (
	id uuid primary key default gen_random_uuid(),
	meal_slot_id uuid not null references app.meal_slots (id) on delete cascade,
	actor_id uuid references auth.users (id) on delete set null,
	channel text not null check (channel in ('web', 'mcp', 'import')),
	before jsonb not null,
	after jsonb not null,
	undoes uuid,
	created_at timestamptz not null default now(),
	unique (id, meal_slot_id),
	-- An undo refers to a change of the same slot (a swap logs one change per slot).
	foreign key (undoes, meal_slot_id) references app.meal_changes (id, meal_slot_id) on delete cascade
);
create index meal_changes_slot on app.meal_changes (meal_slot_id, created_at);

create table app.ratings (
	user_id uuid not null references auth.users (id) on delete cascade,
	recipe_id uuid not null references app.recipes (id) on delete cascade,
	stars smallint not null check (stars between 1 and 5),
	updated_at timestamptz not null default now(),
	primary key (user_id, recipe_id)
);
create index ratings_recipe on app.ratings (recipe_id);

alter table app.weeks enable row level security;
alter table app.meal_slots enable row level security;
alter table app.meal_changes enable row level security;
alter table app.ratings enable row level security;

-- Authorisation: true only for records of the user's families; false for others and
-- for missing records alike.
create function app.can_access_week(p_week_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.weeks w where w.id = p_week_id and app.is_member(w.family_id)
	);
$$;

create function app.can_access_slot(p_slot_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = p_slot_id and app.is_member(w.family_id)
	);
$$;

-- Internal resolvers for the counters' triggers: nobody else executes them.
create function app.week_family_id(p_week_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
	select family_id from app.weeks where id = p_week_id;
$$;

create function app.slot_family_id(p_slot_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
	select w.family_id from app.meal_slots s join app.weeks w on w.id = s.week_id where s.id = p_slot_id;
$$;

-- R1: when a meal becomes past (15:30 lunch, 23:00 dinner, family time zone)...
create function app.meal_passed_at(p_date date, p_meal_type text, p_time_zone text)
returns timestamptz language sql stable set search_path = '' as $$
	select (p_date + case p_meal_type when 'lunch' then time '15:30' when 'dinner' then time '23:00' end)
		at time zone p_time_zone;
$$;

-- ...and which version it shows: the one in force then; the first one if the meal is
-- older than the first publication; null if the recipe was never published.
create function app.recipe_version_at(p_recipe_id uuid, p_instant timestamptz)
returns integer language sql stable set search_path = '' as $$
	select coalesce(max(version) filter (where published_at <= p_instant), min(version))
	from app.recipe_versions
	where recipe_id = p_recipe_id;
$$;

revoke execute on function app.check_meal_slot_date(), app.can_access_week(uuid), app.can_access_slot(uuid),
	app.week_family_id(uuid), app.slot_family_id(uuid), app.meal_passed_at(date, text, text),
	app.recipe_version_at(uuid, timestamptz) from public;
grant execute on function app.can_access_week(uuid), app.can_access_slot(uuid) to authenticated;
grant execute on function app.meal_passed_at(date, text, text), app.recipe_version_at(uuid, timestamptz)
	to authenticated, app_job;

grant select, insert on app.weeks, app.meal_slots, app.meal_changes, app.ratings to authenticated;
grant update (generated_at) on app.weeks to authenticated;
grant update (recipe_id, free_text, servings, note, updated_by, updated_at) on app.meal_slots to authenticated;
grant update (stars, updated_at), delete on app.ratings to authenticated;

create policy weeks_member on app.weeks for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));
create policy meal_slots_member on app.meal_slots for all to authenticated
	using (app.can_access_week(week_id)) with check (app.can_access_week(week_id));
create policy meal_changes_read on app.meal_changes for select to authenticated
	using (app.can_access_slot(meal_slot_id));
create policy meal_changes_insert on app.meal_changes for insert to authenticated
	with check (actor_id = (select auth.uid()) and app.can_access_slot(meal_slot_id));

create policy ratings_read on app.ratings for select to authenticated
	using (user_id = (select auth.uid()) or app.shares_family(user_id));
create policy ratings_write on app.ratings for all to authenticated
	using (user_id = (select auth.uid()))
	with check (
		user_id = (select auth.uid())
		and exists (select 1 from app.recipes r where r.id = recipe_id and r.status <> 'draft')
	);

-- A meal may cite a never-published recipe (imported history): its members see it.
create policy recipes_read_cited_draft on app.recipes for select to authenticated
	using (
		status = 'draft'
		and exists (select 1 from app.meal_slots s where s.recipe_id = recipes.id and app.can_access_week(s.week_id))
	);

-- Average of the current members' ratings, per family and recipe.
create view app.family_scores with (security_invoker = true) as
	select m.family_id, r.recipe_id, round(avg(r.stars), 2) as average, count(*) as votes
	from app.ratings r
	join app.family_members m on m.user_id = r.user_id
	group by m.family_id, r.recipe_id;

-- Anonymous average over everyone, for the cold start of the planner. Owned by
-- postgres and not security_invoker on purpose: it aggregates past RLS.
create view app.global_scores as
	select recipe_id, round(avg(stars), 2) as average, count(*) as votes
	from app.ratings
	group by recipe_id;

grant select on app.family_scores, app.global_scores to authenticated, app_job;
