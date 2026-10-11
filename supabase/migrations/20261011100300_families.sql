-- Families, members, family preferences. Spec sections 2 and 7.

create table app.families (
	id uuid primary key default gen_random_uuid(),
	-- Not unique: the bootstrap script identifies families by id.
	name text not null check (btrim(name) <> ''),
	-- Only the values the family changed; the server fills in the domain defaults.
	settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
	measurement_system text not null default 'metric' check (measurement_system in ('metric', 'uk_imperial')),
	time_zone text not null default 'Europe/Rome',
	data_version bigint not null default 1,
	data_version_xid xid8,
	created_at timestamptz not null default now()
);

create function app.check_time_zone()
returns trigger language plpgsql set search_path = '' as $$
begin
	if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
		raise exception 'invalid time zone: %', new.time_zone using errcode = '22023';
	end if;
	return new;
end;
$$;

create trigger families_check_time_zone
	before insert or update of time_zone on app.families
	for each row execute function app.check_time_zone();

create table app.family_members (
	family_id uuid not null references app.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('family_admin', 'member')),
	joined_at timestamptz not null default now(),
	primary key (family_id, user_id)
);
create index family_members_user on app.family_members (user_id);

create table app.family_books (
	family_id uuid not null references app.families (id) on delete cascade,
	book_id uuid not null references app.books (id),
	primary key (family_id, book_id)
);

create table app.family_ingredients (
	family_id uuid not null references app.families (id) on delete cascade,
	ingredient_id uuid not null references app.ingredients (id),
	restriction text not null check (restriction in ('avoid', 'limit')),
	weekly_max integer check (weekly_max > 0),
	primary key (family_id, ingredient_id),
	check ((restriction = 'limit') = (weekly_max is not null))
);

create table app.recipe_exclusions (
	family_id uuid not null references app.families (id) on delete cascade,
	recipe_id uuid not null references app.recipes (id),
	reason text,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	primary key (family_id, recipe_id)
);

-- Recipes the family already tried, without a date (R4, triedUndated of the import).
-- Not used by the planner yet.
create table app.family_tried_recipes (
	family_id uuid not null references app.families (id) on delete cascade,
	recipe_id uuid not null references app.recipes (id),
	source text not null check (source in ('import')),
	created_at timestamptz not null default now(),
	primary key (family_id, recipe_id)
);

alter table app.families enable row level security;
alter table app.family_members enable row level security;
alter table app.family_books enable row level security;
alter table app.family_ingredients enable row level security;
alter table app.recipe_exclusions enable row level security;
alter table app.family_tried_recipes enable row level security;

create function app.is_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members
		where family_id = p_family_id and user_id = (select auth.uid())
	);
$$;

create function app.is_family_admin(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members
		where family_id = p_family_id and user_id = (select auth.uid()) and role = 'family_admin'
	);
$$;

create function app.shares_family(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1
		from app.family_members mine
		join app.family_members theirs on theirs.family_id = mine.family_id
		where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
	);
$$;

revoke execute on function app.check_time_zone(), app.is_member(uuid), app.is_family_admin(uuid),
	app.shares_family(uuid) from public;
grant execute on function app.is_member(uuid), app.is_family_admin(uuid), app.shares_family(uuid)
	to authenticated;

grant select on app.families to authenticated;
grant update (name, settings, measurement_system, time_zone) on app.families to authenticated;
grant select, delete on app.family_members to authenticated;
grant update (role) on app.family_members to authenticated;
grant select, insert, delete on app.family_books, app.family_ingredients, app.recipe_exclusions,
	app.family_tried_recipes to authenticated;
grant update (restriction, weekly_max) on app.family_ingredients to authenticated;

create policy families_read on app.families for select to authenticated
	using (app.is_member(id));
create policy families_update on app.families for update to authenticated
	using (app.is_family_admin(id)) with check (app.is_family_admin(id));

create policy family_members_read on app.family_members for select to authenticated
	using (app.is_member(family_id));
-- The last-admin rule lives in the operations (spec section 2).
create policy family_members_update on app.family_members for update to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy family_members_delete on app.family_members for delete to authenticated
	using (app.is_family_admin(family_id) or user_id = (select auth.uid()));

create policy family_books_read on app.family_books for select to authenticated
	using (app.is_member(family_id));
create policy family_books_admin on app.family_books for all to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy family_ingredients_read on app.family_ingredients for select to authenticated
	using (app.is_member(family_id));
create policy family_ingredients_admin on app.family_ingredients for all to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy family_tried_recipes_read on app.family_tried_recipes for select to authenticated
	using (app.is_member(family_id));
create policy family_tried_recipes_admin on app.family_tried_recipes for all to authenticated
	using (app.is_family_admin(family_id)) with check (app.is_family_admin(family_id));
create policy recipe_exclusions_member on app.recipe_exclusions for all to authenticated
	using (app.is_member(family_id)) with check (app.is_member(family_id));

-- Co-members see each other's names.
drop policy profiles_select_own on app.profiles;
create policy profiles_read on app.profiles for select to authenticated
	using (user_id = (select auth.uid()) or app.shares_family(user_id));
