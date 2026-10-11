-- Identity: profiles, global roles, session check for immediate revocation.

create table app.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null check (btrim(display_name) <> ''),
	locale text not null default 'it-IT' check (locale in ('it-IT', 'en-GB')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table app.user_roles (
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('recipe_curator', 'app_admin')),
	granted_by uuid references auth.users (id) on delete set null,
	granted_at timestamptz not null default now(),
	primary key (user_id, role)
);

alter table app.profiles enable row level security;
alter table app.user_roles enable row level security;

-- New auth user → profile. Name and locale from the metadata, if any.
create function app.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	insert into app.profiles (user_id, display_name, locale)
	values (
		new.id,
		coalesce(
			nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
			nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
			'User'
		),
		case
			when new.raw_user_meta_data ->> 'locale' in ('it-IT', 'en-GB') then new.raw_user_meta_data ->> 'locale'
			else 'it-IT'
		end
	)
	on conflict (user_id) do nothing;
	return new;
end;
$$;

create trigger create_profile_after_insert
	after insert on auth.users
	for each row execute function app.create_profile_for_new_user();

create function app.has_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.user_roles
		where user_id = (select auth.uid()) and role = p_role
	);
$$;

-- The token's session still exists and has not expired: a JWT of a closed session
-- (sign out, deleted account, revoked agent) is refused by the server.
-- plpgsql: a malformed session_id must be refused before the cast, which a SQL
-- function may evaluate early.
create function app.session_is_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
	v_session_id text := auth.jwt() ->> 'session_id';
begin
	if coalesce(v_session_id, '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
		return false;
	end if;
	return exists (
		select 1 from auth.sessions s
		where s.id = v_session_id::uuid
			and s.user_id = auth.uid()
			and (s.not_after is null or s.not_after > now())
	);
end;
$$;

revoke execute on function app.create_profile_for_new_user(), app.has_role(text), app.session_is_active() from public;
grant execute on function app.has_role(text), app.session_is_active() to authenticated;

grant select on app.profiles to authenticated;
grant update (display_name, locale, updated_at) on app.profiles to authenticated;
grant select on app.user_roles to authenticated;

-- Replaced in the families migration: co-members see each other.
create policy profiles_select_own on app.profiles
	for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on app.profiles
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy user_roles_select_own on app.user_roles
	for select to authenticated using (user_id = (select auth.uid()));
