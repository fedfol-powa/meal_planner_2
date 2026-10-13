-- W9 (wave 3, activity A): app invitations and families created by their users.
-- Spec: progetto/superpowers/specs/2026-10-13-inviti-app.md, section 1.

-- Allowed global roles, no duplicates. Used by the CHECK below: a CHECK cannot hold a subquery.
create function app.app_invitation_roles_valid(p_roles text[]) returns boolean
language sql immutable set search_path = '' as $$
	select p_roles is not null
		and p_roles <@ array['recipe_curator', 'app_admin']::text[]
		and cardinality(p_roles) = (select count(distinct r) from unnest(p_roles) r);
$$;

-- Roles arrive from the Worker as a jsonb array of strings (no text[] serializer without fetch_types).
create function app.app_invitation_roles_from_jsonb(p_roles jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
	v_roles text[];
begin
	if p_roles is null or jsonb_typeof(p_roles) <> 'array'
		or exists (select 1 from jsonb_array_elements(p_roles) e where jsonb_typeof(e) <> 'string') then
		raise exception 'roles must be an array of strings' using errcode = '23514';
	end if;
	v_roles := array(select jsonb_array_elements_text(p_roles));
	if not app.app_invitation_roles_valid(v_roles) then
		raise exception 'invalid roles' using errcode = '23514';
	end if;
	return v_roles;
end;
$$;

create table app.app_invitations (
	id uuid primary key,
	token_hash bytea not null unique check (octet_length(token_hash) = 32),
	email text not null check (email = lower(btrim(email)) and email <> '' and length(email) <= 320),
	roles text[] not null default '{}' check (app.app_invitation_roles_valid(roles)),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
	revoked_at timestamptz,
	revoked_by uuid references auth.users (id) on delete set null,
	reserved_user_id uuid,
	reserved_at timestamptz,
	accepted_by uuid references auth.users (id) on delete set null,
	accepted_at timestamptz,
	check (status <> 'accepted' or (accepted_at is not null and reserved_user_id is not null)),
	check (status <> 'revoked' or revoked_at is not null),
	check (status <> 'pending' or (accepted_at is null and revoked_at is null))
);
create unique index app_invitations_one_pending on app.app_invitations (email) where status = 'pending';

alter table app.app_invitations enable row level security;
create policy app_invitations_read on app.app_invitations for select to authenticated using (app.has_role('app_admin'));
grant select on app.app_invitations to authenticated;

-- Valid for the link: pending, and not expired unless already reserved (spec W9, question 4).
create function app.app_invitation_usable(p_row app.app_invitations) returns boolean
language sql stable set search_path = '' as $$
	select p_row.status = 'pending' and (p_row.expires_at > now() or p_row.reserved_user_id is not null);
$$;

create function app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles jsonb)
returns app.app_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(p_email));
	v_roles text[];
	v_row app.app_invitations;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	v_roles := app.app_invitation_roles_from_jsonb(p_roles);
	-- FOR UPDATE cannot lock a row that does not exist yet: serialise on the id, then the email.
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:id:' || p_id::text, 0));
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:email:' || v_email, 0));
	if exists (select 1 from auth.users u where lower(u.email) = v_email) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	-- Same order everywhere: id lock, email lock, then the row lock, and the row checked again under it.
	select * into v_row from app.app_invitations where id = p_id for update;
	if found then
		if v_row.created_by is distinct from auth.uid() or v_row.status <> 'pending'
			or v_row.email <> v_email or v_row.roles <> v_roles then
			raise exception 'id in use' using errcode = 'P0A05';
		end if;
		update app.app_invitations set token_hash = p_token_hash where id = p_id returning * into v_row;
		return v_row;
	end if;
	update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
		where email = v_email and status = 'pending';
	insert into app.app_invitations (id, token_hash, email, roles, created_by, expires_at)
		values (p_id, p_token_hash, v_email, v_roles, auth.uid(), now() + interval '7 days')
		returning * into v_row;
	return v_row;
end;
$$;

-- Any pending row, expired or not: a reserved and expired invitation can still be closed, so it must be stoppable.
create function app.revoke_app_invitation(p_id uuid)
returns app.app_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_row app.app_invitations;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	select * into v_row from app.app_invitations where id = p_id;
	if not found then raise exception 'unknown invitation' using errcode = 'P0A06'; end if;
	-- The locks of create_app_invitation, in the same order, then the row lock.
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:id:' || p_id::text, 0));
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:email:' || v_row.email, 0));
	select * into v_row from app.app_invitations where id = p_id for update;
	if v_row.status = 'accepted' then raise exception 'already accepted' using errcode = 'P0A04'; end if;
	if v_row.status = 'pending' then
		update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
			where id = p_id returning * into v_row;
	end if;
	return v_row;
end;
$$;

create function app.app_invitations_view()
returns table (id uuid, email text, roles jsonb, status text, created_by uuid, created_by_name text,
	created_at timestamptz, expires_at timestamptz, accepted_by_name text, accepted_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select i.id, i.email, to_jsonb(i.roles), i.status, i.created_by, c.display_name, i.created_at, i.expires_at,
			a.display_name, i.accepted_at, i.revoked_at
		from app.app_invitations i
		left join app.profiles c on c.user_id = i.created_by
		left join app.profiles a on a.user_id = i.accepted_by
		order by i.created_at desc;
end;
$$;

create function app.app_invitation_by_token(p_token_hash bytea)
returns table (invited_by_name text, roles jsonb)
language sql stable security definer set search_path = '' as $$
	select p.display_name, to_jsonb(i.roles)
	from app.app_invitations i left join app.profiles p on p.user_id = i.created_by
	where i.token_hash = p_token_hash and app.app_invitation_usable(i);
$$;

create function app.claim_app_invitation(p_token_hash bytea, p_email text)
returns table (user_id uuid, email text) language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(p_email));
	v_row app.app_invitations;
begin
	select * into v_row from app.app_invitations i where i.token_hash = p_token_hash for update;
	if not found or not app.app_invitation_usable(v_row) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if v_row.email <> v_email then
		raise exception 'email mismatch' using errcode = 'P0A02';
	end if;
	if exists (select 1 from auth.users u where lower(u.email) = v_email
		and u.id is distinct from v_row.reserved_user_id) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	if v_row.reserved_user_id is null then
		update app.app_invitations set reserved_user_id = gen_random_uuid(), reserved_at = now()
			where id = v_row.id returning * into v_row;
	end if;
	return query select v_row.reserved_user_id, v_row.email;
end;
$$;

create function app.complete_app_invitation(p_token_hash bytea, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_row app.app_invitations;
begin
	select * into v_row from app.app_invitations i where i.token_hash = p_token_hash;
	if not found then raise exception 'invitation unavailable' using errcode = 'P0A01'; end if;
	-- The locks of create_app_invitation, in the same order, then the row read again under its lock:
	-- a renewal meanwhile changed the token hash, and this link is no longer the invitation's.
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:id:' || v_row.id::text, 0));
	perform pg_advisory_xact_lock(hashtextextended('app_invitation:email:' || v_row.email, 0));
	select * into v_row from app.app_invitations i where i.id = v_row.id for update;
	if v_row.token_hash <> p_token_hash or v_row.status = 'revoked' or v_row.reserved_user_id is distinct from p_user_id then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if v_row.status = 'accepted' then
		if v_row.accepted_by = p_user_id then return; end if;
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = v_row.email) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	with accepted as (
		update app.app_invitations set status = 'accepted', accepted_by = p_user_id, accepted_at = now()
		where id = v_row.id returning roles, created_by
	)
	insert into app.user_roles (user_id, role, granted_by)
		select p_user_id, r, a.created_by from accepted a, unnest(a.roles) r
		on conflict do nothing;
end;
$$;

create function app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	v_user uuid := auth.uid();
begin
	if v_user is null then raise exception 'sign-in required' using errcode = '42501'; end if;
	if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then
		raise exception 'invalid name' using errcode = '23514';
	end if;
	-- Two creations with the same id wait for each other instead of colliding on the key.
	perform pg_advisory_xact_lock(hashtextextended('family:create:' || p_id::text, 0));
	if exists (select 1 from app.families where id = p_id) then
		if app.is_family_admin(p_id) then return p_id; end if;
		raise exception 'id in use' using errcode = 'P0A05';
	end if;
	insert into app.families (id, name, measurement_system, time_zone)
		values (p_id, btrim(p_name), p_measurement_system, p_time_zone);
	insert into app.family_members (family_id, user_id, role) values (p_id, v_user, 'family_admin');
	insert into app.profile_preferences (user_id, current_family_id) values (v_user, p_id)
		on conflict (user_id) do update set current_family_id = excluded.current_family_id, updated_at = now();
	return p_id;
end;
$$;

revoke execute on function app.app_invitation_roles_valid(text[]) from public;
revoke execute on function app.app_invitation_roles_from_jsonb(jsonb) from public;
revoke execute on function app.app_invitation_usable(app.app_invitations) from public;
revoke execute on function app.create_app_invitation(uuid, bytea, text, jsonb) from public;
revoke execute on function app.revoke_app_invitation(uuid) from public;
revoke execute on function app.app_invitations_view() from public;
revoke execute on function app.app_invitation_by_token(bytea) from public;
revoke execute on function app.claim_app_invitation(bytea, text) from public;
revoke execute on function app.complete_app_invitation(bytea, uuid) from public;
revoke execute on function app.create_family(uuid, text, text, text) from public;
grant execute on function app.create_app_invitation(uuid, bytea, text, jsonb) to authenticated;
grant execute on function app.revoke_app_invitation(uuid) to authenticated;
grant execute on function app.app_invitations_view() to authenticated;
grant execute on function app.create_family(uuid, text, text, text) to authenticated;
grant execute on function app.app_invitation_by_token(bytea) to anon;
grant execute on function app.claim_app_invitation(bytea, text) to anon;
grant execute on function app.complete_app_invitation(bytea, uuid) to anon;
