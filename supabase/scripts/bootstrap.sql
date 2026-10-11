-- First users and family of the real project (milestone A: no invitations yet).
-- 1. Create the users by hand: Authentication > Users > Add user (email, password,
--    "Auto Confirm User").
-- 2. Fill in the two lists below. The family is identified by its id: generate it
--    once (select gen_random_uuid()), write it here and keep it for any rerun.
-- 3. Run the whole script in the SQL editor. Safe to run again, also after renaming
--    the family in the app: an existing family is never changed.
begin;

create temporary table input_family (
	id uuid not null,
	name text not null,
	measurement_system text not null,  -- 'metric' or 'uk_imperial'
	time_zone text not null
) on commit drop;

insert into input_family values ('00000000-0000-0000-0000-000000000000', 'Family name', 'metric', 'Europe/Rome');

create temporary table input_people (
	email text not null,
	display_name text not null,
	locale text not null,          -- 'it-IT' or 'en-GB'
	family_role text not null,     -- 'family_admin' or 'member'
	global_roles text[] not null   -- any of 'recipe_curator', 'app_admin'
) on commit drop;

insert into input_people values
	('person@example.com', 'Name', 'it-IT', 'family_admin', array['app_admin', 'recipe_curator']);

do $$
declare
	v_missing text;
	v_existing text;
begin
	if (select count(*) from input_family) <> 1 then
		raise exception 'input_family must have exactly one row';
	end if;
	if exists (select 1 from input_family where id = '00000000-0000-0000-0000-000000000000') then
		raise exception 'write the family id first: select gen_random_uuid()';
	end if;
	select string_agg(i.email, ', ') into v_missing
	from input_people i
	where not exists (select 1 from auth.users u where lower(u.email) = lower(i.email));
	if v_missing is not null then
		raise exception 'create these users first: %', v_missing;
	end if;
	if not exists (select 1 from input_people where family_role = 'family_admin') then
		raise exception 'the family needs at least one family_admin';
	end if;
	select f.name into v_existing from app.families f join input_family i on i.id = f.id;
	if v_existing is not null then
		raise notice 'family already exists as "%": kept unchanged', v_existing;
	end if;
end;
$$;

insert into app.families (id, name, measurement_system, time_zone)
	select id, name, measurement_system, time_zone from input_family
on conflict (id) do nothing;

insert into app.profiles (user_id, display_name, locale)
	select u.id, i.display_name, i.locale
	from input_people i join auth.users u on lower(u.email) = lower(i.email)
on conflict (user_id) do update set display_name = excluded.display_name, locale = excluded.locale, updated_at = now();

insert into app.user_roles (user_id, role)
	select u.id, r.role
	from input_people i
	join auth.users u on lower(u.email) = lower(i.email)
	cross join lateral unnest(i.global_roles) as r (role)
on conflict do nothing;

-- Memberships go to the declared id only, never to a family found by name.
insert into app.family_members (family_id, user_id, role)
	select f.id, u.id, i.family_role
	from input_people i
	join auth.users u on lower(u.email) = lower(i.email)
	cross join input_family f
on conflict (family_id, user_id) do update set role = excluded.role;

select u.email, p.display_name, p.locale, fam.name as family, m.role as family_role,
	(select string_agg(r.role, ', ') from app.user_roles r where r.user_id = u.id) as global_roles
from input_people i
join auth.users u on lower(u.email) = lower(i.email)
join app.profiles p on p.user_id = u.id
cross join input_family f
join app.families fam on fam.id = f.id
left join app.family_members m on m.user_id = u.id and m.family_id = f.id;

commit;
