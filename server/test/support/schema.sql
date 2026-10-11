-- Stand-in for the W2 objects the server relies on, same names as the W2 spec.
-- Applied only with TEST_DB_FIXTURE=1 when the real schema is missing; never in CI.
do $$ begin
	if not exists (select 1 from pg_roles where rolname = 'app_job') then create role app_job nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'app_server') then create role app_server login noinherit; end if;
end $$;
grant authenticated, anon, app_job to app_server;

create schema app;
grant usage on schema app to authenticated, anon, app_job;

create table app.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null check (display_name <> ''),
	locale text not null default 'it-IT' check (locale in ('it-IT', 'en-GB'))
);
create function app.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	insert into app.profiles (user_id, display_name, locale) values (
		new.id,
		coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
		case when new.raw_user_meta_data ->> 'locale' in ('it-IT', 'en-GB') then new.raw_user_meta_data ->> 'locale' else 'it-IT' end
	);
	return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function app.create_profile();

create table app.user_roles (
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('recipe_curator', 'app_admin')),
	primary key (user_id, role)
);
create table app.families (
	id uuid primary key default gen_random_uuid(),
	name text not null check (name <> ''),
	measurement_system text not null default 'metric' check (measurement_system in ('metric', 'uk_imperial')),
	data_version bigint not null default 0
);
create table app.family_members (
	family_id uuid not null references app.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('family_admin', 'member')),
	primary key (family_id, user_id)
);
create table app.catalogue_state (
	id boolean primary key default true check (id),
	version bigint not null default 0
);
insert into app.catalogue_state default values;

create function app.session_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from auth.sessions s
		where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
			and s.user_id = auth.uid()
			and (s.not_after is null or s.not_after > now())
	);
$$;
create function app.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.family_members m where m.family_id = target and m.user_id = auth.uid());
$$;
create function app.is_family_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members m
		where m.family_id = target and m.user_id = auth.uid() and m.role = 'family_admin'
	);
$$;
create function app.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.user_roles r where r.user_id = auth.uid() and r.role = wanted);
$$;
revoke all on function app.session_is_active(), app.is_member(uuid), app.is_family_admin(uuid), app.has_role(text), app.create_profile() from public;
grant execute on function app.session_is_active(), app.is_member(uuid), app.is_family_admin(uuid), app.has_role(text) to authenticated;

alter table app.profiles enable row level security;
alter table app.user_roles enable row level security;
alter table app.families enable row level security;
alter table app.family_members enable row level security;
alter table app.catalogue_state enable row level security;
create policy profiles_own on app.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy user_roles_own on app.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy families_member on app.families for select to authenticated using ((select app.is_member(id)));
create policy family_members_member on app.family_members for select to authenticated using ((select app.is_member(family_id)));
create policy catalogue_state_all on app.catalogue_state for select to authenticated using (true);
grant select on app.profiles, app.user_roles, app.families, app.family_members, app.catalogue_state to authenticated;
