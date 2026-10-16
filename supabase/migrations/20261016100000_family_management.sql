-- W11 (wave 3, activity C): family invitations, members and roles, leaving, family deletion,
-- account deletion. Spec: progetto/superpowers/specs/2026-10-16-gestione-famiglia.md, section 1.
-- Additive: new tables and functions; app.create_family is redefined with the same signature.
--
-- LOCK ORDER, for every function here and every future path (spec, section 1):
--   1. pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0)), only for who can remove app_admin;
--   2. user lock 'user_memberships:<user id>' (users in id order), then profile and account_deletions checked again;
--   3. email lock 'registration_email:<normalised email>';
--   4. app.families rows FOR UPDATE, in id order, before any write on rows of the family;
--   5. app.family_invitations rows; 6. app.family_invitation_reservations rows; 7. the rest.
-- Who starts from a token hash or a reservation reads without locks, takes the locks in this
-- order and reads again under them. Family paths never take app_admin_roles.

-- Tables

create table app.family_invitations (
	id uuid primary key,
	family_id uuid not null references app.families (id) on delete cascade,
	token_hash bytea not null unique check (octet_length(token_hash) = 32),
	created_by uuid references auth.users (id) on delete set null,
	-- Clock time: compared with family_removals.removed_at, also inside one transaction.
	created_at timestamptz not null default clock_timestamp(),
	expires_at timestamptz not null,
	revoked_at timestamptz,
	revoked_by uuid references auth.users (id) on delete set null,
	revoke_reason text check (revoke_reason in ('manual', 'creator_left', 'creator_removed', 'creator_demoted', 'creator_deleted')),
	check ((revoked_at is null) = (revoke_reason is null))
);
create index family_invitations_family on app.family_invitations (family_id, created_at desc);

-- New accounts reserved from a link. Found again by token hash and email even after the family
-- is deleted; the rows of an invitation, in any state, are its cap counter.
create table app.family_invitation_reservations (
	user_id uuid primary key,
	invitation_id uuid references app.family_invitations (id) on delete set null,
	family_id uuid references app.families (id) on delete set null,
	token_hash bytea not null,
	email text check (email = lower(btrim(email)) and email <> '' and length(email) <= 320),
	status text not null check (status in ('reserved', 'joined', 'closed')),
	reserved_at timestamptz not null default now(),
	finished_at timestamptz,
	check ((status = 'reserved') = (finished_at is null))
);
create unique index family_invitation_reservations_token_email
	on app.family_invitation_reservations (token_hash, email) where email is not null;
create index family_invitation_reservations_invitation on app.family_invitation_reservations (invitation_id);

-- Joins through a link: who, with which link, when. Names are read from current members only.
create table app.family_joins (
	id uuid primary key default gen_random_uuid(),
	family_id uuid not null references app.families (id) on delete cascade,
	invitation_id uuid not null references app.family_invitations (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	mode text not null check (mode in ('new_account', 'existing_account')),
	joined_at timestamptz not null default clock_timestamp()
);
create index family_joins_family on app.family_joins (family_id, joined_at desc);

-- A removal blocks the links of the family created before it. Leaving writes nothing here.
create table app.family_removals (
	-- Every app table has a primary key: deterministic export order (backup_test).
	id uuid primary key default gen_random_uuid(),
	family_id uuid not null references app.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	removed_by uuid references auth.users (id) on delete set null,
	removed_at timestamptz not null default clock_timestamp()
);
create index family_removals_family_user on app.family_removals (family_id, user_id, removed_at desc);

-- Account deletions started; the row outlives the user and holds no personal data.
create table app.account_deletions (
	user_id uuid primary key,
	requested_by uuid,
	requested_at timestamptz not null default now(),
	attempts int not null default 0,
	last_error text,
	last_attempt_at timestamptz,
	completed_at timestamptz
);

alter table app.family_invitations enable row level security;
alter table app.family_invitation_reservations enable row level security;
alter table app.family_joins enable row level security;
alter table app.family_removals enable row level security;
alter table app.account_deletions enable row level security;

-- Helpers (not executable by users)

-- Usable for new joins and reservations: not revoked, not expired.
create function app.family_invitation_usable(p_row app.family_invitations) returns boolean
language sql stable set search_path = '' as $$
	select p_row.revoked_at is null and p_row.expires_at > now();
$$;

-- The person was removed from the family after the link was created: the link no longer lets them in.
create function app.removed_after_link(p_invitation app.family_invitations, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_removals r
		where r.family_id = p_invitation.family_id and r.user_id = p_user_id and r.removed_at >= p_invitation.created_at
	);
$$;

-- Name of a link author only while a member of the family.
create function app.member_name(p_family_id uuid, p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
	select p.display_name from app.profiles p
	join app.family_members m on m.user_id = p.user_id and m.family_id = p_family_id
	where p.user_id = p_user_id;
$$;

create function app.lock_user_memberships(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
	select pg_advisory_xact_lock(hashtextextended('user_memberships:' || p_user_id::text, 0));
$$;

-- The user still has a profile and no deletion started: checked right after the user lock.
create function app.account_alive(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.profiles where user_id = p_user_id)
		and not exists (select 1 from app.account_deletions where user_id = p_user_id);
$$;

-- New membership from a link: member row, join record, shown family.
create function app.add_member_from_link(p_invitation app.family_invitations, p_user_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
	insert into app.family_members (family_id, user_id, role) values (p_invitation.family_id, p_user_id, 'member');
	insert into app.family_joins (family_id, invitation_id, user_id, mode)
		values (p_invitation.family_id, p_invitation.id, p_user_id, p_mode);
	insert into app.profile_preferences (user_id, current_family_id) values (p_user_id, p_invitation.family_id)
		on conflict (user_id) do update set current_family_id = excluded.current_family_id, updated_at = now();
end;
$$;

-- create_family of activity A, redefined: user lock and profile check first (spec, section 1).
create or replace function app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	v_user uuid := auth.uid();
begin
	if v_user is null then raise exception 'sign-in required' using errcode = '42501'; end if;
	if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then
		raise exception 'invalid name' using errcode = '23514';
	end if;
	-- A deletion of this account holding the lock may have just removed the profile.
	perform app.lock_user_memberships(v_user);
	if not app.account_alive(v_user) then raise exception 'account deleted' using errcode = '42501'; end if;
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

-- Family invitations

create function app.create_family_invitation(p_family_id uuid, p_id uuid, p_token_hash bytea)
returns app.family_invitations language plpgsql security definer set search_path = '' as $$
declare
	v_row app.family_invitations;
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	select * into v_row from app.family_invitations where id = p_id for update;
	if found then
		-- A repeat after a lost answer: the new link replaces one never shown.
		if v_row.family_id = p_family_id and v_row.revoked_at is null and v_row.created_by = auth.uid() then
			update app.family_invitations set token_hash = p_token_hash where id = p_id returning * into v_row;
			return v_row;
		end if;
		raise exception 'id in use' using errcode = 'P0A05';
	end if;
	begin
		insert into app.family_invitations (id, family_id, token_hash, created_by, expires_at)
			values (p_id, p_family_id, p_token_hash, auth.uid(), now() + interval '7 days')
			returning * into v_row;
	exception when unique_violation then
		raise exception 'id in use' using errcode = 'P0A05';
	end;
	return v_row;
end;
$$;

-- Any open link, expired or not: an expired link can still close a reserved reservation.
create function app.revoke_family_invitation(p_family_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_row app.family_invitations;
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	select * into v_row from app.family_invitations where id = p_id and family_id = p_family_id for update;
	if not found then raise exception 'unknown invitation' using errcode = 'P0A06'; end if;
	if v_row.revoked_at is null then
		update app.family_invitations set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = 'manual'
			where id = p_id;
	end if;
end;
$$;

-- Usable links and expired open links with pending reservations, newest first.
create function app.family_invitations_view(p_family_id uuid)
returns table (id uuid, created_by uuid, created_by_name text, created_at timestamptz, expires_at timestamptz,
	registrations int, pending_registrations int, expired boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
	if not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	return query
		select i.id, i.created_by, app.member_name(i.family_id, i.created_by), i.created_at, i.expires_at,
			coalesce(c.total, 0)::int, coalesce(c.pending, 0)::int, i.expires_at <= now()
		from app.family_invitations i
		left join lateral (
			select count(*) as total, count(*) filter (where r.status = 'reserved') as pending
			from app.family_invitation_reservations r where r.invitation_id = i.id
		) c on true
		where i.family_id = p_family_id and i.revoked_at is null
			and (i.expires_at > now() or coalesce(c.pending, 0) > 0)
		order by i.created_at desc;
end;
$$;

create function app.family_joins_view(p_family_id uuid)
returns table (joined_at timestamptz, mode text, user_name text, invitation_id uuid,
	invitation_created_by_name text, invitation_created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
	if not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	return query
		select j.joined_at, j.mode, app.member_name(j.family_id, j.user_id), j.invitation_id,
			app.member_name(i.family_id, i.created_by), i.created_at
		from app.family_joins j
		join app.family_invitations i on i.id = j.invitation_id
		where j.family_id = p_family_id
		order by j.joined_at desc
		limit 50;
end;
$$;

create function app.family_invitation_by_token(p_token_hash bytea)
returns table (family_name text, invited_by_name text, accounts_available boolean)
language sql stable security definer set search_path = '' as $$
	select f.name, app.member_name(i.family_id, i.created_by),
		(select count(*) from app.family_invitation_reservations r where r.invitation_id = i.id) < 10
	from app.family_invitations i
	join app.families f on f.id = i.family_id
	where i.token_hash = p_token_hash and app.family_invitation_usable(i);
$$;

-- Reserves (or finds) the account of a new person. Never raises for outcomes that write a state,
-- so the transaction commits it; 'unavailable' is answered as invitation_unavailable by the server.
create function app.claim_family_invitation(p_token_hash bytea, p_email text)
returns table (user_id uuid, email text, state text, member boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_res app.family_invitation_reservations;
	v_inv app.family_invitations;
	v_has_account boolean;
	v_member boolean;
begin
	if v_email = '' then raise exception 'email required' using errcode = '22023'; end if;
	-- 1. Email lock first: registrations of the same email queue here, before any decision.
	perform pg_advisory_xact_lock(hashtextextended('registration_email:' || v_email, 0));

	-- 2. An existing reservation for this link and email.
	select * into v_res from app.family_invitation_reservations r where r.token_hash = p_token_hash and r.email = v_email;
	if found then
		if v_res.family_id is not null then
			perform 1 from app.families f where f.id = v_res.family_id for update;
		end if;
		if v_res.invitation_id is not null then
			perform 1 from app.family_invitations i where i.id = v_res.invitation_id for update;
		end if;
		select * into v_res from app.family_invitation_reservations r where r.user_id = v_res.user_id for update;
		select * into v_inv from app.family_invitations i where i.id = v_res.invitation_id;
		v_has_account := exists (select 1 from auth.users u where u.id = v_res.user_id);
		v_member := v_res.family_id is not null and exists (
			select 1 from app.family_members m where m.family_id = v_res.family_id and m.user_id = v_res.user_id);
		if v_res.status = 'joined' then
			return query select v_res.user_id, v_res.email, 'joined'::text, v_member;
			return;
		end if;
		if v_res.status = 'closed' then
			return query select v_res.user_id, v_res.email,
				case when v_has_account then 'closed' else 'unavailable' end, v_member;
			return;
		end if;
		if v_inv.id is null or v_res.family_id is null or v_inv.revoked_at is not null then
			update app.family_invitation_reservations set status = 'closed', finished_at = now()
				where family_invitation_reservations.user_id = v_res.user_id;
			return query select v_res.user_id, v_res.email,
				case when v_has_account then 'closed' else 'unavailable' end, false;
			return;
		end if;
		if v_member then
			update app.family_invitation_reservations set status = 'joined', finished_at = now()
				where family_invitation_reservations.user_id = v_res.user_id;
			return query select v_res.user_id, v_res.email, 'joined'::text, true;
			return;
		end if;
		-- Reserved, also on an expired link (rule of A): the account is (re)created.
		return query select v_res.user_id, v_res.email, 'create'::text, false;
		return;
	end if;

	-- 3. A new registration.
	select * into v_inv from app.family_invitations i where i.token_hash = p_token_hash;
	if not found then
		return query select null::uuid, v_email, 'unavailable'::text, false;
		return;
	end if;
	perform 1 from app.families f where f.id = v_inv.family_id for update;
	select * into v_inv from app.family_invitations i where i.id = v_inv.id for update;
	if not found or not app.family_invitation_usable(v_inv) then
		return query select null::uuid, v_email, 'unavailable'::text, false;
		return;
	end if;
	if exists (select 1 from auth.users u where lower(u.email) = v_email) then
		raise exception 'account exists' using errcode = 'P0A03';
	end if;
	if (select count(*) from app.family_invitation_reservations r where r.invitation_id = v_inv.id) >= 10 then
		return query select null::uuid, v_email, 'unavailable'::text, false;
		return;
	end if;
	insert into app.family_invitation_reservations (user_id, invitation_id, family_id, token_hash, email, status)
		values (gen_random_uuid(), v_inv.id, v_inv.family_id, p_token_hash, v_email, 'reserved')
		on conflict (token_hash, email) where email is not null do nothing;
	select * into v_res from app.family_invitation_reservations r where r.token_hash = p_token_hash and r.email = v_email;
	return query select v_res.user_id, v_res.email, 'create'::text, false;
end;
$$;

create function app.account_id_deleted(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.account_deletions where user_id = p_user_id);
$$;

-- After Auth created the reserved account: the membership, by reservation (works without the family).
create function app.complete_family_invitation(p_user_id uuid)
returns table (family_id uuid, joined boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
	v_res app.family_invitation_reservations;
	v_inv app.family_invitations;
	v_member boolean;
begin
	select * into v_res from app.family_invitation_reservations r where r.user_id = p_user_id;
	if not found then raise exception 'invitation unavailable' using errcode = 'P0A01'; end if;
	perform app.lock_user_memberships(p_user_id);
	if v_res.email is null
		or not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = v_res.email)
		or not app.account_alive(p_user_id) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	if v_res.family_id is not null then
		perform 1 from app.families f where f.id = v_res.family_id for update;
	end if;
	if v_res.invitation_id is not null then
		perform 1 from app.family_invitations i where i.id = v_res.invitation_id for update;
	end if;
	select * into v_res from app.family_invitation_reservations r where r.user_id = p_user_id for update;
	select * into v_inv from app.family_invitations i where i.id = v_res.invitation_id;
	v_member := v_res.family_id is not null and exists (
		select 1 from app.family_members m where m.family_id = v_res.family_id and m.user_id = p_user_id);
	if v_res.status <> 'reserved' then
		return query select v_res.family_id, v_member;
		return;
	end if;
	if v_inv.id is null or v_res.family_id is null or v_inv.revoked_at is not null
		or app.removed_after_link(v_inv, p_user_id) then
		update app.family_invitation_reservations r set status = 'closed', finished_at = now() where r.user_id = p_user_id;
		return query select v_res.family_id, false;
		return;
	end if;
	update app.family_invitation_reservations r set status = 'joined', finished_at = now() where r.user_id = p_user_id;
	if not v_member then
		perform app.add_member_from_link(v_inv, p_user_id, 'new_account');
	end if;
	return query select v_res.family_id, true;
end;
$$;

create function app.family_invitation_status(p_token_hash bytea)
returns table (family_id uuid, family_name text, invited_by_name text, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
	v_inv app.family_invitations;
begin
	select * into v_inv from app.family_invitations i where i.token_hash = p_token_hash;
	if not found then return; end if;
	if not app.is_member(v_inv.family_id)
		and (not app.family_invitation_usable(v_inv) or app.removed_after_link(v_inv, auth.uid())) then
		return;
	end if;
	return query
		select f.id, f.name, app.member_name(f.id, v_inv.created_by), app.is_member(f.id)
		from app.families f where f.id = v_inv.family_id;
end;
$$;

create function app.join_family(p_token_hash bytea)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
	v_user uuid := auth.uid();
	v_inv app.family_invitations;
begin
	if v_user is null then raise exception 'sign-in required' using errcode = '42501'; end if;
	select * into v_inv from app.family_invitations i where i.token_hash = p_token_hash;
	if not found then raise exception 'invitation unavailable' using errcode = 'P0A01'; end if;
	perform app.lock_user_memberships(v_user);
	if not app.account_alive(v_user) then raise exception 'account deleted' using errcode = '42501'; end if;
	perform 1 from app.families f where f.id = v_inv.family_id for update;
	select * into v_inv from app.family_invitations i where i.id = v_inv.id for update;
	if not found then raise exception 'invitation unavailable' using errcode = 'P0A01'; end if;
	if app.is_member(v_inv.family_id) then return v_inv.family_id; end if;
	if not app.family_invitation_usable(v_inv) or app.removed_after_link(v_inv, v_user) then
		raise exception 'invitation unavailable' using errcode = 'P0A01';
	end if;
	perform app.add_member_from_link(v_inv, v_user, 'existing_account');
	-- A repeat of the public accept finds nothing left to complete.
	update app.family_invitation_reservations r set status = 'joined', finished_at = now()
		where r.user_id = v_user and r.family_id = v_inv.family_id and r.status = 'reserved';
	return v_inv.family_id;
end;
$$;

revoke execute on function app.family_invitation_usable(app.family_invitations) from public;
revoke execute on function app.removed_after_link(app.family_invitations, uuid) from public;
revoke execute on function app.member_name(uuid, uuid) from public;
revoke execute on function app.lock_user_memberships(uuid) from public;
revoke execute on function app.account_alive(uuid) from public;
revoke execute on function app.add_member_from_link(app.family_invitations, uuid, text) from public;
revoke execute on function app.create_family_invitation(uuid, uuid, bytea) from public;
revoke execute on function app.revoke_family_invitation(uuid, uuid) from public;
revoke execute on function app.family_invitations_view(uuid) from public;
revoke execute on function app.family_joins_view(uuid) from public;
revoke execute on function app.family_invitation_by_token(bytea) from public;
revoke execute on function app.claim_family_invitation(bytea, text) from public;
revoke execute on function app.account_id_deleted(uuid) from public;
revoke execute on function app.complete_family_invitation(uuid) from public;
revoke execute on function app.family_invitation_status(bytea) from public;
revoke execute on function app.join_family(bytea) from public;
grant execute on function app.create_family_invitation(uuid, uuid, bytea) to authenticated;
grant execute on function app.revoke_family_invitation(uuid, uuid) to authenticated;
grant execute on function app.family_invitations_view(uuid) to authenticated;
grant execute on function app.family_joins_view(uuid) to authenticated;
grant execute on function app.family_invitation_status(bytea) to authenticated;
grant execute on function app.join_family(bytea) to authenticated;
grant execute on function app.family_invitation_by_token(bytea) to anon;
grant execute on function app.claim_family_invitation(bytea, text) to anon;
grant execute on function app.account_id_deleted(uuid) to anon;
grant execute on function app.complete_family_invitation(uuid) to anon;

-- Members, roles, leaving, deletion. Every function locks the family row first (missing family:
-- 42501, as for someone else's family), then checks the caller again under the lock: two
-- administrators leaving or demoting each other queue on the row and the second sees the first.

-- Revokes the open links (expired or not) created by a person; the caller holds the family locks.
-- p_family_id null: every family (account deletion, which locked them all).
create function app.revoke_invitations_of(p_family_id uuid, p_user_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare
	v_count int;
begin
	update app.family_invitations
		set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
		where created_by = p_user_id and revoked_at is null and (p_family_id is null or family_id = p_family_id);
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

create function app.set_family_member_role(p_family_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_role text;
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	if p_role is null or p_role not in ('family_admin', 'member') then
		raise exception 'unknown role' using errcode = '22023';
	end if;
	select role into v_role from app.family_members where family_id = p_family_id and user_id = p_user_id;
	if not found then raise exception 'not a member' using errcode = 'P0A14'; end if;
	if v_role = p_role then return; end if;
	if p_role = 'member' then
		if not exists (select 1 from app.family_members
			where family_id = p_family_id and role = 'family_admin' and user_id <> p_user_id) then
			raise exception 'last family admin' using errcode = 'P0A09';
		end if;
		perform app.revoke_invitations_of(p_family_id, p_user_id, 'creator_demoted');
	end if;
	update app.family_members set role = p_role where family_id = p_family_id and user_id = p_user_id;
end;
$$;

-- The caller stays an administrator: the last administrator is never at stake here.
create function app.remove_family_member(p_family_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	if p_user_id = auth.uid() then raise exception 'use leave' using errcode = '22023'; end if;
	if not exists (select 1 from app.family_members where family_id = p_family_id and user_id = p_user_id) then
		return;
	end if;
	insert into app.family_removals (family_id, user_id, removed_by) values (p_family_id, p_user_id, auth.uid());
	perform app.revoke_invitations_of(p_family_id, p_user_id, 'creator_removed');
	delete from app.family_members where family_id = p_family_id and user_id = p_user_id;
end;
$$;

create function app.leave_family(p_family_id uuid, p_successor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_user uuid := auth.uid();
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_member(p_family_id) then
		raise exception 'not a member' using errcode = '42501';
	end if;
	if not exists (select 1 from app.family_members where family_id = p_family_id and user_id <> v_user) then
		raise exception 'sole member' using errcode = 'P0A10';
	end if;
	if app.is_family_admin(p_family_id) and not exists (select 1 from app.family_members
		where family_id = p_family_id and role = 'family_admin' and user_id <> v_user) then
		if p_successor_id is null or p_successor_id = v_user or not exists (select 1 from app.family_members
			where family_id = p_family_id and user_id = p_successor_id) then
			raise exception 'successor required' using errcode = 'P0A13';
		end if;
		update app.family_members set role = 'family_admin' where family_id = p_family_id and user_id = p_successor_id;
	elsif p_successor_id is not null then
		raise exception 'no successor needed' using errcode = 'P0A13';
	end if;
	perform app.revoke_invitations_of(p_family_id, v_user, 'creator_left');
	delete from app.family_members where family_id = p_family_id and user_id = v_user;
end;
$$;

create function app.family_deletion_view(p_family_id uuid)
returns table (name text, member_names jsonb, week_count int, can_delete boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
	if not app.is_member(p_family_id) then
		raise exception 'members only' using errcode = '42501';
	end if;
	return query
		select f.name,
			coalesce((select jsonb_agg(p.display_name order by lower(p.display_name), p.user_id)
				from app.family_members m join app.profiles p on p.user_id = m.user_id
				where m.family_id = f.id), '[]'::jsonb),
			(select count(*)::int from app.weeks w where w.family_id = f.id),
			app.is_family_admin(f.id)
		from app.families f where f.id = p_family_id;
end;
$$;

-- The cascade removes memberships, weeks, meals, logs, lists, exclusions, settings, links, joins,
-- removals, jobs and temporary lists; reservations stay with null references (spec, decision 17).
create function app.delete_family(p_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
	perform 1 from app.families where id = p_family_id for update;
	if not found or not app.is_family_admin(p_family_id) then
		raise exception 'family admins only' using errcode = '42501';
	end if;
	delete from app.families where id = p_family_id;
end;
$$;

revoke execute on function app.revoke_invitations_of(uuid, uuid, text) from public;
revoke execute on function app.set_family_member_role(uuid, uuid, text) from public;
revoke execute on function app.remove_family_member(uuid, uuid) from public;
revoke execute on function app.leave_family(uuid, uuid) from public;
revoke execute on function app.family_deletion_view(uuid) from public;
revoke execute on function app.delete_family(uuid) from public;
grant execute on function app.set_family_member_role(uuid, uuid, text) to authenticated;
grant execute on function app.remove_family_member(uuid, uuid) to authenticated;
grant execute on function app.leave_family(uuid, uuid) to authenticated;
grant execute on function app.family_deletion_view(uuid) to authenticated;
grant execute on function app.delete_family(uuid) to authenticated;

-- Account deletion (spec, sections 1 and 4): the first transaction deletes the app data and
-- writes a pending row; the server then deletes the Auth account and closes the row.

-- Decision 18: a role needs the recipient's profile. FOR KEY SHARE queues an assignment in
-- progress with begin_account_deletion, which deletes the profile before the roles (step 10).
create function app.user_roles_require_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	perform 1 from app.profiles where user_id = new.user_id for key share;
	if not found then raise exception 'unknown user' using errcode = 'P0A07'; end if;
	return new;
end;
$$;
create trigger user_roles_require_profile before insert on app.user_roles
	for each row execute function app.user_roles_require_profile();

-- A deleted id never gets a profile again: Auth cannot recreate it (the profile is created by
-- the trigger on auth.users, in the same transaction).
create function app.profiles_reject_deleted_ids() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	if exists (select 1 from app.account_deletions where user_id = new.user_id) then
		raise exception 'deleted account' using errcode = 'P0A01';
	end if;
	return new;
end;
$$;
create trigger profiles_reject_deleted_ids before insert on app.profiles
	for each row execute function app.profiles_reject_deleted_ids();

-- What happens to each family of the user: stays, needs_successor (with the candidates), deleted.
create function app.account_deletion_families(p_user_id uuid)
returns table (family_id uuid, name text, outcome text, candidates jsonb)
language sql stable security definer set search_path = '' as $$
	select f.id, f.name, o.outcome,
		case when o.outcome = 'needs_successor' then coalesce((
			select jsonb_agg(jsonb_build_object('userId', x.user_id, 'displayName', p.display_name)
				order by lower(p.display_name), x.user_id)
			from app.family_members x join app.profiles p on p.user_id = x.user_id
			where x.family_id = f.id and x.user_id <> p_user_id), '[]'::jsonb)
		else '[]'::jsonb end
	from app.family_members m
	join app.families f on f.id = m.family_id
	cross join lateral (
		select case
			when not exists (select 1 from app.family_members x where x.family_id = f.id and x.user_id <> p_user_id) then 'deleted'
			when m.role = 'family_admin' and not exists (select 1 from app.family_members x
				where x.family_id = f.id and x.user_id <> p_user_id and x.role = 'family_admin') then 'needs_successor'
			else 'stays'
		end as outcome
	) o
	where m.user_id = p_user_id
	order by lower(f.name), f.id;
$$;

create function app.is_last_app_admin(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.user_roles where user_id = p_user_id and role = 'app_admin')
		and not exists (select 1 from app.user_roles where user_id <> p_user_id and role = 'app_admin');
$$;

create function app.account_deletion_plan(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	if p_user_id is distinct from auth.uid() and not app.has_role('app_admin') then
		raise exception 'not allowed' using errcode = '42501';
	end if;
	if not exists (select 1 from auth.users where id = p_user_id) then
		raise exception 'unknown user' using errcode = 'P0A07';
	end if;
	return jsonb_build_object(
		'families', coalesce((select jsonb_agg(jsonb_build_object('familyId', d.family_id, 'name', d.name,
			'outcome', d.outcome, 'candidates', d.candidates)) from app.account_deletion_families(p_user_id) d), '[]'::jsonb),
		'lastAppAdmin', app.is_last_app_admin(p_user_id),
		'openInvitations', (select count(*) from app.family_invitations where created_by = p_user_id and revoked_at is null)
			+ (select count(*) from app.app_invitations where created_by = p_user_id and status = 'pending'),
		'pending', exists (select 1 from app.account_deletions where user_id = p_user_id and completed_at is null)
	);
end;
$$;

create function app.begin_account_deletion(p_user_id uuid, p_successors jsonb, p_deleted_families uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
	v_email text;
	v_families uuid[];
	v_deleted uuid[];
	v_family record;
	v_successor text;
begin
	-- 1. RULE of activity B (app.set_user_role): every path that removes app_admin takes this lock
	-- and, under it, checks again both the caller and the number of administrators.
	perform pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0));
	-- 2. Authorisation under the lock: oneself, or still an app admin.
	if p_user_id is distinct from auth.uid() and not app.has_role('app_admin') then
		raise exception 'not allowed' using errcode = '42501';
	end if;
	-- 3. Already started: the Auth step resumes it.
	if exists (select 1 from app.account_deletions where user_id = p_user_id) then return; end if;
	select lower(btrim(email)) into v_email from auth.users where id = p_user_id;
	if not found then raise exception 'unknown user' using errcode = 'P0A07'; end if;
	-- 4.
	if app.is_last_app_admin(p_user_id) then raise exception 'last app admin' using errcode = 'P0A08'; end if;
	-- 5. User lock (no new membership from here), email lock (no new reservation), then the
	-- families of the user, of their open links and of their reservations, in id order; then links, reservations.
	perform app.lock_user_memberships(p_user_id);
	if v_email is not null and v_email <> '' then
		perform pg_advisory_xact_lock(hashtextextended('registration_email:' || v_email, 0));
	end if;
	select coalesce(array_agg(distinct x.id order by x.id), '{}') into v_families from (
		select family_id as id from app.family_members where user_id = p_user_id
		union select family_id from app.family_invitations where created_by = p_user_id and revoked_at is null
		union select family_id from app.family_invitation_reservations
			where family_id is not null and (user_id = p_user_id or email = v_email)
	) x;
	perform 1 from app.families where id = any (v_families) order by id for update;
	perform 1 from app.family_invitations
		where family_id = any (v_families) or (created_by = p_user_id and revoked_at is null)
		order by id for update;
	perform 1 from app.family_invitation_reservations where user_id = p_user_id or email = v_email
		order by user_id for update;
	-- 6. The plan again, under the locks.
	select coalesce(array_agg(d.family_id order by d.family_id), '{}') into v_deleted
		from app.account_deletion_families(p_user_id) d where d.outcome = 'deleted';
	-- Decision 20: an agent (client_id in the token, as channelOf) never deletes a family. Checked
	-- first: whatever the agent passed, the answer is the page of the app.
	if auth.jwt() ->> 'client_id' is not null and cardinality(v_deleted) > 0 then
		raise exception 'web only' using errcode = 'P0A15';
	end if;
	if v_deleted <> coalesce((select array_agg(distinct x order by x) from unnest(p_deleted_families) x), '{}') then
		raise exception 'plan changed' using errcode = 'P0A11';
	end if;
	for v_family in select d.family_id from app.account_deletion_families(p_user_id) d where d.outcome = 'needs_successor' loop
		v_successor := p_successors ->> v_family.family_id::text;
		if v_successor is null or not exists (select 1 from app.family_members m
			where m.family_id = v_family.family_id and m.user_id::text = v_successor and m.user_id <> p_user_id) then
			raise exception 'successor required' using errcode = 'P0A13';
		end if;
	end loop;
	-- 7. Successors.
	update app.family_members m set role = 'family_admin'
		from app.account_deletion_families(p_user_id) d
		where d.outcome = 'needs_successor' and m.family_id = d.family_id
			and m.user_id::text = p_successors ->> d.family_id::text;
	-- 8. Links, app invitations, reservations (by id or email), join records.
	perform app.revoke_invitations_of(null, p_user_id, 'creator_deleted');
	update app.app_invitations set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
		where created_by = p_user_id and status = 'pending';
	update app.family_invitation_reservations
		set email = null,
			status = case when status = 'reserved' then 'closed' else status end,
			finished_at = coalesce(finished_at, now())
		where user_id = p_user_id or email = v_email;
	delete from app.family_joins where user_id = p_user_id;
	-- 9. Families with the user as sole member.
	delete from app.families where id = any (v_deleted);
	-- 10. Profile first (decision 18), then roles, ratings, memberships.
	delete from app.profiles where user_id = p_user_id;
	delete from app.user_roles where user_id = p_user_id;
	delete from app.ratings where user_id = p_user_id;
	delete from app.family_members where user_id = p_user_id;
	-- 11.
	insert into app.account_deletions (user_id, requested_by) values (p_user_id, auth.uid());
end;
$$;

create function app.pending_account_deletions(p_older_than interval)
returns table (user_id uuid, attempts int)
language sql stable security definer set search_path = '' as $$
	select d.user_id, d.attempts from app.account_deletions d
	where d.completed_at is null and coalesce(d.last_attempt_at, d.requested_at) < now() - p_older_than
	order by d.requested_at;
$$;

create function app.record_account_deletion_attempt(p_user_id uuid, p_error text) returns int
language plpgsql security definer set search_path = '' as $$
declare
	v_attempts int;
begin
	if p_error is null then
		if exists (select 1 from auth.users where id = p_user_id) then
			raise exception 'account still in Auth' using errcode = '55000';
		end if;
		update app.account_deletions set completed_at = coalesce(completed_at, now())
			where user_id = p_user_id returning attempts into v_attempts;
	else
		update app.account_deletions
			set attempts = attempts + 1, last_error = p_error, last_attempt_at = now()
			where user_id = p_user_id returning attempts into v_attempts;
	end if;
	if not found then raise exception 'unknown deletion' using errcode = 'P0A07'; end if;
	return v_attempts;
end;
$$;

create function app.admin_account_deletions()
returns table (user_id uuid, requested_at timestamptz, attempts int, last_error text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select d.user_id, d.requested_at, d.attempts, d.last_error from app.account_deletions d
		where d.completed_at is null order by d.requested_at;
end;
$$;

revoke execute on function app.user_roles_require_profile() from public;
revoke execute on function app.profiles_reject_deleted_ids() from public;
revoke execute on function app.account_deletion_families(uuid) from public;
revoke execute on function app.is_last_app_admin(uuid) from public;
revoke execute on function app.account_deletion_plan(uuid) from public;
revoke execute on function app.begin_account_deletion(uuid, jsonb, uuid[]) from public;
revoke execute on function app.pending_account_deletions(interval) from public;
revoke execute on function app.record_account_deletion_attempt(uuid, text) from public;
revoke execute on function app.admin_account_deletions() from public;
grant execute on function app.account_deletion_plan(uuid) to authenticated;
grant execute on function app.begin_account_deletion(uuid, jsonb, uuid[]) to authenticated;
grant execute on function app.admin_account_deletions() to authenticated;
grant execute on function app.pending_account_deletions(interval) to app_job;
grant execute on function app.record_account_deletion_attempt(uuid, text) to app_job;
