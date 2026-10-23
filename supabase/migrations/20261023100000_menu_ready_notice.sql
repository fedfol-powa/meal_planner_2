-- W24: "next week's menu is ready" notice, by email and with a green dot on the calendar.
-- Spec: progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md, sections 3 and 4.
-- Additive: a preference column, new tables and functions only.

-- The emails are on unless the person switched them off; the row may be missing.
alter table app.profile_preferences add column menu_emails boolean not null default true;
grant update (menu_emails, updated_at) on app.profile_preferences to authenticated;

-- Weeks each person has seen: the green dot goes away at the first view. Leaving the family,
-- being removed, deleting the family or the account remove the rows.
create table app.menu_week_views (
	family_id uuid not null,
	user_id uuid not null,
	week_start date not null,
	seen_at timestamptz not null default now(),
	primary key (family_id, user_id, week_start),
	foreign key (family_id, user_id) references app.family_members (family_id, user_id) on delete cascade
);
alter table app.menu_week_views enable row level security;
grant select, insert on app.menu_week_views to authenticated;
grant select on app.menu_week_views to app_backup;
create policy menu_week_views_read on app.menu_week_views for select to authenticated
	using (user_id = (select auth.uid()) and app.is_member(family_id));
create policy menu_week_views_insert on app.menu_week_views for insert to authenticated
	with check (user_id = (select auth.uid()) and app.is_member(family_id));

-- One row per family and announced week: the recipients are chosen once, at the announcement.
create table app.menu_announcements (
	family_id uuid not null references app.families (id) on delete cascade,
	week_start date not null,
	created_at timestamptz not null default now(),
	primary key (family_id, week_start)
);

-- One email per family, week and person; subject and bodies fixed at the announcement (snapshot).
create table app.menu_emails (
	family_id uuid not null,
	week_start date not null,
	user_id uuid not null references app.profiles (user_id) on delete cascade,
	subject text not null,
	html text not null,
	text text not null,
	created_at timestamptz not null default now(),
	first_attempt_at timestamptz,
	claimed_at timestamptz,
	sent_at timestamptz,
	closed_at timestamptz,
	closed_reason text check (closed_reason in ('expired', 'ambiguous', 'skipped')),
	attempts int not null default 0,
	primary key (family_id, week_start, user_id),
	foreign key (family_id, week_start) references app.menu_announcements (family_id, week_start) on delete cascade
);

-- Menu emails reserved per UTC day: the cap of section 5.5, shared by concurrent deliveries.
create table app.menu_email_budget (
	day date primary key,
	reserved int not null check (reserved >= 0)
);

alter table app.menu_announcements enable row level security;
alter table app.menu_emails enable row level security;
alter table app.menu_email_budget enable row level security;
create policy menu_announcements_job on app.menu_announcements for all to app_job using (true) with check (true);
create policy menu_emails_job on app.menu_emails for all to app_job using (true) with check (true);
create policy menu_email_budget_job on app.menu_email_budget for all to app_job using (true) with check (true);
grant select, insert, update, delete on app.menu_announcements, app.menu_emails, app.menu_email_budget to app_job;
grant select on app.menu_announcements, app.menu_emails, app.menu_email_budget to app_backup;

-- The week to announce (section 3): the Monday after the local week, once its Wednesday 20:00
-- has passed, if the week exists and the family existed at the Wednesday 20:00 before it.
-- No membership check: app_job only; members go through new_menu_week.
create function app.menu_week_to_announce(p_family_id uuid, p_now timestamptz) returns date
language sql stable security definer set search_path = '' as $$
	select w.starts_on
	from app.families f
	cross join lateral (select p_now at time zone f.time_zone as local) l
	cross join lateral (select date_trunc('week', l.local)::date + 7 as starts_on) n
	join app.weeks w on w.family_id = f.id and w.starts_on = n.starts_on
	where f.id = p_family_id
		and l.local >= date_trunc('week', l.local) + interval '2 days 20 hours'
		and f.created_at < ((n.starts_on - 5) + time '20:00') at time zone f.time_zone;
$$;

-- The green dot: the week to announce until the person has seen it.
create function app.new_menu_week(p_family_id uuid, p_now timestamptz) returns date
language plpgsql stable security definer set search_path = '' as $$
declare
	v_week date;
begin
	if not app.is_member(p_family_id) then
		raise exception 'members only' using errcode = '42501';
	end if;
	v_week := app.menu_week_to_announce(p_family_id, p_now);
	if v_week is null or exists (
		select 1 from app.menu_week_views v
		where v.family_id = p_family_id and v.user_id = (select auth.uid()) and v.week_start = v_week
	) then
		return null;
	end if;
	return v_week;
end;
$$;

-- Members with the emails on and a confirmed address; family_count for the subject.
create function app.menu_email_recipients(p_family_id uuid)
returns table (user_id uuid, locale text, family_count int)
language sql stable security definer set search_path = '' as $$
	select m.user_id, p.locale, (select count(*)::int from app.family_members o where o.user_id = m.user_id)
	from app.family_members m
	join app.profiles p on p.user_id = m.user_id
	join auth.users u on u.id = m.user_id
	left join app.profile_preferences pp on pp.user_id = m.user_id
	where m.family_id = p_family_id and coalesce(pp.menu_emails, true) and u.email_confirmed_at is not null
	order by m.user_id;
$$;

-- The final check before each send: the address only while the person is a member, has the
-- emails on and the address confirmed.
create function app.menu_email_address(p_family_id uuid, p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
	select u.email
	from app.family_members m
	join auth.users u on u.id = m.user_id
	left join app.profile_preferences pp on pp.user_id = m.user_id
	where m.family_id = p_family_id and m.user_id = p_user_id
		and coalesce(pp.menu_emails, true) and u.email_confirmed_at is not null;
$$;

-- The meals of a week for the email. The meals of the new week are all future, so by R1
-- (server/src/menu/versions.ts) they show the current published version; a never-published
-- recipe shows its own name, as the menu does. The photo is the current one.
create function app.menu_email_week(p_family_id uuid, p_week_start date)
returns table (date date, meal_type text, recipe_name jsonb, free_text text, photo_key text)
language sql stable security definer set search_path = '' as $$
	select s.date, s.meal_type,
		case when r.status <> 'draft' and v.version is not null then v.content -> 'name' else r.name end,
		s.free_text, p.storage_key
	from app.weeks w
	join app.meal_slots s on s.week_id = w.id
	left join app.recipes r on r.id = s.recipe_id
	left join app.recipe_versions v on v.recipe_id = r.id and v.version = nullif(r.version, 0)
	left join app.recipe_photos p on p.recipe_id = r.id and p.removed_at is null
	where w.family_id = p_family_id and w.starts_on = p_week_start
	order by s.date, s.meal_type desc;
$$;

revoke execute on function app.menu_week_to_announce(uuid, timestamptz) from public;
revoke execute on function app.new_menu_week(uuid, timestamptz) from public;
revoke execute on function app.menu_email_recipients(uuid) from public;
revoke execute on function app.menu_email_address(uuid, uuid) from public;
revoke execute on function app.menu_email_week(uuid, date) from public;
grant execute on function app.new_menu_week(uuid, timestamptz) to authenticated;
grant execute on function app.menu_week_to_announce(uuid, timestamptz) to app_job;
grant execute on function app.menu_email_recipients(uuid) to app_job;
grant execute on function app.menu_email_address(uuid, uuid) to app_job;
grant execute on function app.menu_email_week(uuid, date) to app_job;

-- First release: every existing week counts as announced, without emails, so a release between
-- Thursday and Sunday does not send the email of a menu prepared days before (section 4.3).
insert into app.menu_announcements (family_id, week_start)
	select family_id, starts_on from app.weeks
	on conflict do nothing;
