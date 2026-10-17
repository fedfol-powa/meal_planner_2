-- W15 (wave 3, activity D): operational alerts, password emails of invitations, the label
-- "not confirmed yet". Spec: progetto/superpowers/specs/2026-10-17-email.md, sections 2, 5 and 11.
-- Additive: new tables and functions only.

-- Operational alerts: one row per event and key; subject and body are fixed at creation.
create table app.ops_alerts (
	event text not null check (event in ('weekly_job_overdue', 'weekly_job_abandoned', 'backup_export_missing', 'account_deletion_overdue', 'ops_alert_test')),
	key text not null,
	details jsonb not null default '{}',
	subject text not null,
	body text not null,
	created_at timestamptz not null default now(),
	claimed_at timestamptz,
	sent_at timestamptz,
	closed_at timestamptz,
	closed_reason text check (closed_reason in ('expired', 'ambiguous')),
	attempts int not null default 0,
	primary key (event, key)
);
alter table app.ops_alerts enable row level security;
create policy ops_alerts_job on app.ops_alerts for all to app_job using (true) with check (true);
grant select, insert, update, delete on app.ops_alerts to app_job;
grant select on app.ops_alerts to app_backup;

-- Last "choose your password" email per person: spacing and authorisation of the sends.
-- Written only by the two functions below; no direct privileges for the app roles.
create table app.password_emails (
	user_id uuid primary key,
	sent_at timestamptz not null
);
alter table app.password_emails enable row level security;
grant select on app.password_emails to app_backup;

-- Records a send for the user unless one happened in the last 60 seconds. Two concurrent
-- callers: the second waits on the row and sees the first one's time, so only one gets true.
create function app.record_password_email(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
	v_count int;
begin
	insert into app.password_emails as e (user_id, sent_at) values (p_user_id, now())
		on conflict on constraint password_emails_pkey do update set sent_at = excluded.sent_at
		where e.sent_at < now() - interval '60 seconds';
	get diagnostics v_count = row_count;
	return v_count = 1;
end;
$$;

-- State of the password email for a user: unavailable, not_needed, too_soon or send.
create function app.password_email_state(p_user_id uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
begin
	if p_user_id is null
		or not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = p_email) then
		return 'unavailable';
	end if;
	if exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null) then
		return 'not_needed';
	end if;
	if app.record_password_email(p_user_id) then return 'send'; end if;
	return 'too_soon';
end;
$$;

-- The closed app invitation of this link for this email (spec W15, section 2).
create function app.app_invitation_password_email(p_token_hash bytea, p_email text)
returns table (user_id uuid, email text, state text)
language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_user uuid;
	v_state text;
begin
	select i.reserved_user_id into v_user from app.app_invitations i
		where i.token_hash = p_token_hash and i.email = v_email and i.status = 'accepted';
	v_state := app.password_email_state(v_user, v_email);
	if v_state = 'unavailable' then
		return query select null::uuid, null::text, v_state;
		return;
	end if;
	return query select v_user, v_email, v_state;
end;
$$;

-- The closed family reservation of this link for this email. The family name only for the
-- first email of a joined reservation whose person is still a member.
create function app.family_invitation_password_email(p_token_hash bytea, p_email text, p_first boolean)
returns table (user_id uuid, email text, family_name text, state text)
language plpgsql security definer set search_path = '' as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_res app.family_invitation_reservations;
	v_name text;
	v_state text;
begin
	select * into v_res from app.family_invitation_reservations r
		where r.token_hash = p_token_hash and r.email = v_email and r.status in ('joined', 'closed');
	v_state := app.password_email_state(v_res.user_id, v_email);
	if v_state = 'unavailable' then
		return query select null::uuid, null::text, null::text, v_state;
		return;
	end if;
	if p_first and v_res.status = 'joined' and v_res.family_id is not null then
		select f.name into v_name from app.families f
			where f.id = v_res.family_id
				and exists (select 1 from app.family_members m where m.family_id = f.id and m.user_id = v_res.user_id);
	end if;
	return query select v_res.user_id, v_email, v_name, v_state;
end;
$$;

-- The label: reads from auth.users only whether the email is confirmed.
create function app.family_email_unconfirmed(p_family_id uuid)
returns table (user_id uuid, unconfirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
	if not app.is_member(p_family_id) then
		raise exception 'members only' using errcode = '42501';
	end if;
	return query
		select m.user_id, u.email_confirmed_at is null
		from app.family_members m join auth.users u on u.id = m.user_id
		where m.family_id = p_family_id;
end;
$$;

-- Fingerprint of the (member, unconfirmed) pairs: changes with any member's value, also at the same count.
create function app.family_email_unconfirmed_version(p_family_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.is_member(p_family_id) then
		raise exception 'members only' using errcode = '42501';
	end if;
	return md5(coalesce((
		select string_agg(m.user_id::text || ':' || (u.email_confirmed_at is null)::text, ',' order by m.user_id)
		from app.family_members m join auth.users u on u.id = m.user_id
		where m.family_id = p_family_id), ''));
end;
$$;

create function app.admin_email_unconfirmed(p_user_ids uuid[])
returns table (user_id uuid, unconfirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if cardinality(p_user_ids) > 200 then
		raise exception 'at most 200 ids' using errcode = '22023';
	end if;
	return query select u.id, u.email_confirmed_at is null from auth.users u where u.id = any(p_user_ids);
end;
$$;

-- Deletions with at least p_min_attempts failures requested in the window, completed or not:
-- the alert reconciliation also recovers an event whose work finished later.
create function app.overdue_account_deletions(p_min_attempts int, p_since interval)
returns table (user_id uuid, attempts int)
language sql stable security definer set search_path = '' as $$
	select d.user_id, d.attempts from app.account_deletions d
	where d.attempts >= p_min_attempts and d.requested_at > now() - p_since
	order by d.requested_at;
$$;

create function app.prune_password_emails() returns int
language plpgsql security definer set search_path = '' as $$
declare
	v_count int;
begin
	delete from app.password_emails where sent_at < now() - interval '7 days';
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

revoke execute on function app.record_password_email(uuid) from public;
revoke execute on function app.password_email_state(uuid, text) from public;
revoke execute on function app.app_invitation_password_email(bytea, text) from public;
revoke execute on function app.family_invitation_password_email(bytea, text, boolean) from public;
revoke execute on function app.family_email_unconfirmed(uuid) from public;
revoke execute on function app.family_email_unconfirmed_version(uuid) from public;
revoke execute on function app.admin_email_unconfirmed(uuid[]) from public;
revoke execute on function app.overdue_account_deletions(int, interval) from public;
revoke execute on function app.prune_password_emails() from public;
grant execute on function app.app_invitation_password_email(bytea, text) to anon;
grant execute on function app.family_invitation_password_email(bytea, text, boolean) to anon;
grant execute on function app.family_email_unconfirmed(uuid) to authenticated;
grant execute on function app.family_email_unconfirmed_version(uuid) to authenticated;
grant execute on function app.admin_email_unconfirmed(uuid[]) to authenticated;
grant execute on function app.overdue_account_deletions(int, interval) to app_job;
grant execute on function app.prune_password_emails() to app_job;
