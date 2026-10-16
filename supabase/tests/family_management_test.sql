begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

create function tests.h(p_token text) returns bytea language sql immutable as $$
	select sha256(convert_to(p_token, 'UTF8'));
$$;

-- The account Auth would create for a reservation: the reserved id with the reserved email.
create function tests.create_account(p_id uuid, p_email text) returns void
language sql security definer set search_path = '' as $$
	insert into auth.users (id, email, aud, role, raw_user_meta_data)
	values (p_id, p_email, 'authenticated', 'authenticated', jsonb_build_object('display_name', split_part(p_email, '@', 1)));
$$;

-- Claim as the current role: answers state/member and keeps the reserved id in tests.claimed.
create function tests.claim(p_token text, p_email text) returns text language plpgsql as $$
declare
	r record;
begin
	select * into r from app.claim_family_invitation(tests.h(p_token), p_email);
	perform set_config('tests.claimed', coalesce(r.user_id::text, ''), true);
	return r.state || '/' || r.member::text;
end;
$$;

create function tests.complete(p_user_id uuid) returns text language plpgsql as $$
declare
	r record;
begin
	select * into r from app.complete_family_invitation(p_user_id);
	return coalesce(r.family_id::text, 'none') || '/' || r.joined::text;
end;
$$;

create function tests.reservation(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
	select user_id from app.family_invitation_reservations where email = p_email;
$$;

create function tests.login_as(p_user_id uuid) returns void language plpgsql as $$
begin
	perform tests.login_with_claims(jsonb_build_object('sub', p_user_id, 'role', 'authenticated'));
end;
$$;

grant execute on function tests.h(text), tests.claim(text, text), tests.complete(uuid), tests.reservation(text),
	tests.create_account(uuid, text) to authenticated, anon;

-- Tables: RLS, no direct privileges
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relrowsecurity
			and c.relname in ('family_invitations', 'family_invitation_reservations', 'family_joins', 'family_removals', 'account_deletions')
		order by 1),
	array['account_deletions', 'family_invitation_reservations', 'family_invitations', 'family_joins', 'family_removals'],
	'new tables exist with RLS');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace
			and c.relname in ('family_invitations', 'family_invitation_reservations', 'family_joins', 'family_removals', 'account_deletions')
			and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
				or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
		order by 1),
	array[]::text[], 'no direct privileges for users');

-- Creation: family admins only, idempotent on the id
select tests.login('bruno');
select throws_ok($$select app.create_family_invitation(tests.family('Rossi'), gen_random_uuid(), tests.h('x'))$$, '42501', null, 'a member cannot create');
select throws_ok($$select app.create_family_invitation(gen_random_uuid(), gen_random_uuid(), tests.h('x'))$$, '42501', null, 'unknown family');
reset role;
select tests.login('anna');
select lives_ok($$select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a001', tests.h('l1-old'))$$, 'admin creates');
select lives_ok($$select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a001', tests.h('l1'))$$, 'repeat with a new token');
reset role;
select is((select count(*) from app.family_invitations where id = '00000000-0000-4000-8000-00000000a001'), 1::bigint, 'one row');
select is((select token_hash from app.family_invitations where id = '00000000-0000-4000-8000-00000000a001'), tests.h('l1'), 'token replaced');
select ok((select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
	from app.family_invitations where id = '00000000-0000-4000-8000-00000000a001'), 'valid for 7 days');
select tests.login('carla');
select throws_ok($$select app.create_family_invitation(tests.family('Bianchi'), '00000000-0000-4000-8000-00000000a001', tests.h('zz'))$$, 'P0A05', null, 'id used by others');

-- Revocation
reset role;
select tests.login('anna');
select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a002', tests.h('l2'));
select lives_ok($$select app.revoke_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a002')$$, 'admin revokes');
select lives_ok($$select app.revoke_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a002')$$, 'revoking again has no effect');
select throws_ok($$select app.revoke_family_invitation(tests.family('Bianchi'), '00000000-0000-4000-8000-00000000a001')$$, '42501', null, 'not admin of that family');
select throws_ok($$select app.revoke_family_invitation(tests.family('Rossi'), gen_random_uuid())$$, 'P0A06', null, 'unknown link');
reset role;
select is((select revoke_reason from app.family_invitations where id = '00000000-0000-4000-8000-00000000a002'), 'manual', 'manual reason');
select ok((select revoked_by = tests.uid('anna') from app.family_invitations where id = '00000000-0000-4000-8000-00000000a002'), 'revoked by');
select tests.login('bruno');
select throws_ok($$select app.revoke_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a001')$$, '42501', null, 'a member cannot revoke');
select throws_ok($$select * from app.family_invitations_view(tests.family('Rossi'))$$, '42501', null, 'a member cannot list');
select throws_ok($$select * from app.family_joins_view(tests.family('Rossi'))$$, '42501', null, 'a member cannot list joins');

-- Public reading by token
reset role;
select tests.become('anon');
select is((select family_name || '|' || invited_by_name || '|' || accounts_available::text
	from app.family_invitation_by_token(tests.h('l1'))), 'test-Rossi|Anna|true', 'usable link readable');
select is((select count(*) from app.family_invitation_by_token(tests.h('l2'))), 0::bigint, 'revoked: no row');
select is((select count(*) from app.family_invitation_by_token(tests.h('l1-old'))), 0::bigint, 'replaced token: no row');
select is((select count(*) from app.family_invitation_by_token(tests.h('nope'))), 0::bigint, 'unknown: no row');
select throws_ok($$select * from app.family_invitations$$, '42501', null, 'anon has no table access');

-- Claim: a new email reserves an id, a repeat gets the same id
select is(tests.claim('l1', ' New1@X.it '), 'create/false', 'new email: create');
select set_config('tests.new1', current_setting('tests.claimed'), true);
select is(tests.claim('l1', 'new1@x.it'), 'create/false', 'repeat: create');
select is(current_setting('tests.claimed'), current_setting('tests.new1'), 'same reserved id');
select throws_ok($$select tests.claim('l1', 'bruno@test.local')$$, 'P0A03', null, 'email with an account');
select is(tests.claim('l2', 'new2@x.it'), 'unavailable/false', 'revoked link: unavailable');
select is(tests.claim('nope', 'new2@x.it'), 'unavailable/false', 'unknown link: unavailable');
reset role;
select is((select count(*) from app.family_invitation_reservations where email = 'new1@x.it'), 1::bigint, 'one reservation (weak password retried)');
select is((select status from app.family_invitation_reservations where email = 'new1@x.it'), 'reserved', 'reserved');
select is((select count(*) from app.family_invitation_reservations where email = 'new2@x.it'), 0::bigint, 'no reservation on a revoked link');

-- Completion
select tests.become('anon');
select throws_ok($$select tests.complete(gen_random_uuid())$$, 'P0A01', null, 'unknown reservation');
select throws_ok(format('select tests.complete(%L)', current_setting('tests.new1')), 'P0A01', null, 'account not created yet');
reset role;
select tests.create_account(current_setting('tests.new1')::uuid, 'other@x.it');
select tests.become('anon');
select throws_ok(format('select tests.complete(%L)', current_setting('tests.new1')), 'P0A01', null, 'account with another email');
reset role;
delete from auth.users where id = current_setting('tests.new1')::uuid;
select tests.create_account(current_setting('tests.new1')::uuid, 'new1@x.it');
select tests.become('anon');
select is(tests.complete(current_setting('tests.new1')::uuid), tests.family('Rossi')::text || '/true', 'completed');
select is(tests.complete(current_setting('tests.new1')::uuid), tests.family('Rossi')::text || '/true', 'repeat without effects');
reset role;
select is((select role from app.family_members where family_id = tests.family('Rossi') and user_id = current_setting('tests.new1')::uuid), 'member', 'member');
select is((select current_family_id from app.profile_preferences where user_id = current_setting('tests.new1')::uuid), tests.family('Rossi'), 'shown family');
select is((select count(*) from app.family_joins where user_id = current_setting('tests.new1')::uuid), 1::bigint, 'one join row');
select is((select mode from app.family_joins where user_id = current_setting('tests.new1')::uuid), 'new_account', 'new account');
select is((select status from app.family_invitation_reservations where email = 'new1@x.it'), 'joined', 'reservation joined');
select tests.become('anon');
select is(tests.claim('l1', 'new1@x.it'), 'joined/true', 'claim after joining: joined, no writes');
reset role;
select is((select count(*) from app.family_joins where user_id = current_setting('tests.new1')::uuid), 1::bigint, 'still one join row');

-- Terminal state: accepted, removed, claim again → joined with member false, nothing written
insert into app.family_removals (family_id, user_id, removed_by) values (tests.family('Rossi'), current_setting('tests.new1')::uuid, tests.uid('anna'));
delete from app.family_members where family_id = tests.family('Rossi') and user_id = current_setting('tests.new1')::uuid;
select tests.become('anon');
select is(tests.claim('l1', 'new1@x.it'), 'joined/false', 'removed: joined, not a member');
select is(tests.complete(current_setting('tests.new1')::uuid), tests.family('Rossi')::text || '/false', 'complete after removal: nothing');
reset role;
select is((select count(*) from app.family_members where family_id = tests.family('Rossi') and user_id = current_setting('tests.new1')::uuid), 0::bigint, 'still out');
select is((select count(*) from app.family_joins where user_id = current_setting('tests.new1')::uuid), 1::bigint, 'no new join row');

-- Status and join for registered users; removal after the link blocks, a later link works
select tests.login_as(current_setting('tests.new1')::uuid);
select is((select count(*) from app.family_invitation_status(tests.h('l1'))), 0::bigint, 'removed after the link: no status');
select throws_ok($$select app.join_family(tests.h('l1'))$$, 'P0A01', null, 'removed after the link: join refused');
reset role;
select tests.login('dario');
select is((select family_name || '|' || already_member::text from app.family_invitation_status(tests.h('l1'))), 'test-Rossi|false', 'status for another user');
select is(app.join_family(tests.h('l1')), tests.family('Rossi'), 'dario joins');
select is((select already_member from app.family_invitation_status(tests.h('l1'))), true, 'already member');
select is(app.join_family(tests.h('l1')), tests.family('Rossi'), 'repeat as a member');
reset role;
select tests.login('carla');
select throws_ok($$select app.join_family(tests.h('l2'))$$, 'P0A01', null, 'revoked link');
select is((select count(*) from app.family_invitation_status(tests.h('l2'))), 0::bigint, 'revoked link: no status');
reset role;
select is((select role from app.family_members where family_id = tests.family('Rossi') and user_id = tests.uid('dario')), 'member', 'joined as member');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('dario')), tests.family('Rossi'), 'join sets the shown family');
select is((select count(*) from app.family_joins where user_id = tests.uid('dario')), 1::bigint, 'one join row for the repeat');
select is((select mode from app.family_joins where user_id = tests.uid('dario')), 'existing_account', 'existing account');
-- Voluntary leave writes no removal: the same link lets the person back in, with a new join row
delete from app.family_members where family_id = tests.family('Rossi') and user_id = tests.uid('dario');
select tests.login('dario');
select is(app.join_family(tests.h('l1')), tests.family('Rossi'), 'back after leaving');
reset role;
select is((select count(*) from app.family_joins where user_id = tests.uid('dario')), 2::bigint, 'new join row after leaving');
-- A link created after the removal works for the removed person
select tests.login('anna');
select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a003', tests.h('l3'));
reset role;
select tests.login_as(current_setting('tests.new1')::uuid);
select is((select already_member from app.family_invitation_status(tests.h('l3'))), false, 'later link: status');
select is(app.join_family(tests.h('l3')), tests.family('Rossi'), 'later link: joins');
reset role;

-- Join closes a reserved reservation of the same person; complete then writes nothing
select tests.become('anon');
select is(tests.claim('l3', 'gina-new@x.it'), 'create/false', 'gina-new reserves');
reset role;
select tests.create_account(tests.reservation('gina-new@x.it'), 'gina-new@x.it');
select tests.login_as(tests.reservation('gina-new@x.it'));
select is(app.join_family(tests.h('l3')), tests.family('Rossi'), 'joins before complete');
reset role;
select is((select status from app.family_invitation_reservations where email = 'gina-new@x.it'), 'joined', 'join closes the reservation');
select tests.become('anon');
select is(tests.complete(tests.reservation('gina-new@x.it')), tests.family('Rossi')::text || '/true', 'complete after join');
reset role;
select is((select count(*) from app.family_joins where user_id = tests.reservation('gina-new@x.it')), 1::bigint, 'one join row');
-- Variant: Auth creates, complete has not run, the person is already a member: joined, no second row
select tests.become('anon');
select is(tests.claim('l3', 'ugo@x.it'), 'create/false', 'ugo reserves');
reset role;
select tests.create_account(tests.reservation('ugo@x.it'), 'ugo@x.it');
insert into app.family_members (family_id, user_id, role) values (tests.family('Rossi'), tests.reservation('ugo@x.it'), 'member');
select tests.become('anon');
select is(tests.complete(tests.reservation('ugo@x.it')), tests.family('Rossi')::text || '/true', 'already a member: joined');
reset role;
select is((select count(*) from app.family_joins where user_id = tests.reservation('ugo@x.it')), 0::bigint, 'no join row');
select is((select status from app.family_invitation_reservations where email = 'ugo@x.it'), 'joined', 'reservation joined');
-- Removal after the link, complete still to do: closed, no membership
select tests.become('anon');
select is(tests.claim('l3', 'vera@x.it'), 'create/false', 'vera reserves');
reset role;
select tests.create_account(tests.reservation('vera@x.it'), 'vera@x.it');
insert into app.family_removals (family_id, user_id) values (tests.family('Rossi'), tests.reservation('vera@x.it'));
select tests.become('anon');
select is(tests.complete(tests.reservation('vera@x.it')), tests.family('Rossi')::text || '/false', 'removed before complete: closed');
reset role;
select is((select status from app.family_invitation_reservations where email = 'vera@x.it'), 'closed', 'reservation closed');
select is((select count(*) from app.family_members where user_id = tests.reservation('vera@x.it')), 0::bigint, 'no membership');
select tests.become('anon');
select is(tests.claim('l3', 'vera@x.it'), 'closed/false', 'closed with an account: closed');

-- A reserved reservation on a revoked link: closed (with the account) or unavailable (without), state kept
select is(tests.claim('l3', 'walt@x.it'), 'create/false', 'walt reserves');
select is(tests.claim('l3', 'xena@x.it'), 'create/false', 'xena reserves');
reset role;
select tests.create_account(tests.reservation('walt@x.it'), 'walt@x.it');
-- Expired but open: a reserved reservation can still be completed later (rule of A)
update app.family_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-00000000a003';
select tests.become('anon');
select is((select count(*) from app.family_invitation_by_token(tests.h('l3'))), 0::bigint, 'expired: no public row');
select is(tests.claim('l3', 'xena@x.it'), 'create/false', 'expired, reserved: create');
select is(tests.claim('l3', 'new-after-expiry@x.it'), 'unavailable/false', 'expired: no new reservation');
reset role;
select tests.login('anna');
select is((select count(*) from app.family_invitations_view(tests.family('Rossi')) where id = '00000000-0000-4000-8000-00000000a003'), 1::bigint,
	'expired link with pending reservations still listed');
select is((select expired from app.family_invitations_view(tests.family('Rossi')) where id = '00000000-0000-4000-8000-00000000a003'), true, 'marked expired');
select lives_ok($$select app.revoke_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a003')$$, 'revoke an expired open link');
reset role;
select tests.become('anon');
select is(tests.claim('l3', 'walt@x.it'), 'closed/false', 'revoked with an account: closed');
select is(tests.claim('l3', 'xena@x.it'), 'unavailable/false', 'revoked without an account: unavailable');
reset role;
select is((select status from app.family_invitation_reservations where email = 'xena@x.it'), 'closed', 'closed state persisted');
select tests.become('anon');
select is(tests.claim('l3', 'xena@x.it'), 'unavailable/false', 'closed without an account stays unavailable');
reset role;

-- Cap: 10 reservations per link, then unavailable; the public read says no accounts; registered users still join
select tests.login('anna');
select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a004', tests.h('l4'));
reset role;
select tests.become('anon');
select tests.claim('l4', 'cap' || n || '@x.it') from generate_series(1, 9) n;
select is((select accounts_available from app.family_invitation_by_token(tests.h('l4'))), true, 'nine: accounts available');
select is(tests.claim('l4', 'cap10@x.it'), 'create/false', 'tenth reserves');
select is((select accounts_available from app.family_invitation_by_token(tests.h('l4'))), false, 'ten: no accounts');
select is(tests.claim('l4', 'cap11@x.it'), 'unavailable/false', 'eleventh refused');
select is(tests.claim('l4', 'cap3@x.it'), 'create/false', 'an existing reservation is still returned at the cap');
reset role;
select is((select count(*) from app.family_invitation_reservations r join app.family_invitations i on i.id = r.invitation_id
	where i.token_hash = tests.h('l4')), 10::bigint, 'ten reservations');
select tests.login('elena');
select is(app.join_family(tests.h('l4')), tests.family('Rossi'), 'registered user joins after the cap');
reset role;

-- View: usable links, names only of current members, registrations
delete from app.family_members where family_id = tests.family('Rossi') and user_id = current_setting('tests.new1')::uuid;
select tests.login('anna');
select is((select registrations || '/' || pending_registrations from app.family_invitations_view(tests.family('Rossi'))
	where id = '00000000-0000-4000-8000-00000000a004'), '10/10', 'registrations counted');
select is((select count(*) from app.family_invitations_view(tests.family('Rossi'))
	where id = '00000000-0000-4000-8000-00000000a002'), 0::bigint, 'revoked not listed');
reset role;
update app.family_members set role = 'family_admin' where family_id = tests.family('Rossi') and user_id = tests.uid('bruno');
select tests.login('bruno');
select app.create_family_invitation(tests.family('Rossi'), '00000000-0000-4000-8000-00000000a005', tests.h('l5'));
reset role;
delete from app.family_members where family_id = tests.family('Rossi') and user_id = tests.uid('bruno');
select tests.login('anna');
select is((select created_by_name from app.family_invitations_view(tests.family('Rossi'))
	where id = '00000000-0000-4000-8000-00000000a005'), null, 'author no longer a member: no name');
select is((select created_by_name from app.family_invitations_view(tests.family('Rossi'))
	where id = '00000000-0000-4000-8000-00000000a004'), 'Anna', 'author name');
select is((select count(*) from app.family_joins_view(tests.family('Rossi'))
	where user_name is null and mode = 'new_account'), 1::bigint, 'former member unnamed in the joins');
select is((select user_name from app.family_joins_view(tests.family('Rossi')) where mode = 'existing_account' order by joined_at limit 1),
	'Dario', 'current member named in the joins');
select ok((select bool_and(invitation_created_by_name = 'Anna') from app.family_joins_view(tests.family('Rossi'))), 'link author named');
reset role;

-- Family deleted: reservations stay without references, found again by token and email
select tests.login('carla');
select app.create_family_invitation(tests.family('Bianchi'), '00000000-0000-4000-8000-00000000b001', tests.h('b1'));
reset role;
select tests.become('anon');
select is(tests.claim('b1', 'yuri@x.it'), 'create/false', 'yuri reserves');
select is(tests.claim('b1', 'zoe@x.it'), 'create/false', 'zoe reserves');
reset role;
select tests.create_account(tests.reservation('yuri@x.it'), 'yuri@x.it');
delete from app.families where id = tests.family('Bianchi');
select is((select count(*) from app.family_invitation_reservations where email in ('yuri@x.it', 'zoe@x.it')
	and family_id is null and invitation_id is null), 2::bigint, 'reservations kept without references');
select tests.become('anon');
select is(tests.claim('b1', 'yuri@x.it'), 'closed/false', 'deleted family, with an account: closed');
select is(tests.claim('b1', 'zoe@x.it'), 'unavailable/false', 'deleted family, without an account: unavailable');
select is(tests.complete(tests.reservation('yuri@x.it')), 'none/false', 'complete without the family');
select is(tests.claim('b1', 'new-b@x.it'), 'unavailable/false', 'no new reservation');
reset role;

-- create_family keeps its behaviour and refuses a deleted account
select tests.login('gina');
select lives_ok($$select app.create_family('00000000-0000-4000-8000-0000000000f9', 'test-Gina', 'metric', 'Europe/Rome')$$, 'create_family still works');
reset role;
insert into app.account_deletions (user_id, requested_by) values (tests.uid('gina'), tests.uid('gina'));
select tests.login('gina');
select throws_ok($$select app.create_family(gen_random_uuid(), 'test-Gina2', 'metric', 'Europe/Rome')$$, '42501', null, 'deleted account cannot create');
select throws_ok($$select app.join_family(tests.h('l4'))$$, '42501', null, 'deleted account cannot join');
reset role;
select tests.become('anon');
select is(app.account_id_deleted(tests.uid('gina')), true, 'deleted id');
select is(app.account_id_deleted(tests.uid('anna')), false, 'live id');
reset role;


-- ===== Members, roles, leaving, deletion (task 2) =====
create function tests.make_family(p_name text, p_admin text, p_members text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
	v_id uuid;
	v_name text;
begin
	insert into app.families (name) values ('test-' || p_name) returning id into v_id;
	insert into app.family_members (family_id, user_id, role) values (v_id, tests.uid(p_admin), 'family_admin');
	foreach v_name in array p_members loop
		insert into app.family_members (family_id, user_id, role) values (v_id, tests.uid(v_name), 'member');
	end loop;
	return v_id;
end;
$$;
create function tests.role_in(p_family text, p_user text) returns text
language sql stable security definer set search_path = '' as $$
	select role from app.family_members where family_id = tests.family(p_family) and user_id = tests.uid(p_user);
$$;
create function tests.reason(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
	select revoke_reason from app.family_invitations where id = p_id;
$$;
grant execute on function tests.role_in(text, text), tests.reason(uuid) to authenticated, anon;
select tests.create_user(n) from unnest(array['pa', 'pb', 'pc', 'qa', 'qb', 'qc']) n;
select tests.make_family('P', 'pa', array['pb', 'pc']);
select tests.make_family('Q', 'qa', array[]::text[]);

-- Roles
select tests.login('pb');
select throws_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pc'), 'family_admin')$$, '42501', null, 'a member cannot change roles');
reset role;
select tests.login('pa');
select throws_ok($$select app.set_family_member_role(gen_random_uuid(), tests.uid('pc'), 'member')$$, '42501', null, 'unknown family');
select throws_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pb'), 'owner')$$, '22023', null, 'invalid role');
select throws_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('gina'), 'member')$$, 'P0A14', null, 'not a member');
select throws_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pa'), 'member')$$, 'P0A09', null, 'last admin cannot step down');
select lives_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pb'), 'family_admin')$$, 'promote');
select lives_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pb'), 'family_admin')$$, 'same role: no effect');
select is(tests.role_in('P', 'pb'), 'family_admin', 'promoted');
reset role;
select tests.login('pb');
select app.create_family_invitation(tests.family('P'), '00000000-0000-4000-8000-00000000c001', tests.h('p1'));
select app.create_family_invitation(tests.family('P'), '00000000-0000-4000-8000-00000000c002', tests.h('p2'));
reset role;
select tests.become('anon');
select is(tests.claim('p2', 'rp@x.it'), 'create/false', 'reservation on the link of pb');
reset role;
update app.family_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-00000000c002';
select tests.login('pa');
select lives_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pb'), 'member')$$, 'demote');
select is(tests.reason('00000000-0000-4000-8000-00000000c001'), 'creator_demoted', 'usable link revoked on demotion');
select is(tests.reason('00000000-0000-4000-8000-00000000c002'), 'creator_demoted', 'expired open link revoked on demotion');
reset role;
select tests.become('anon');
select is(tests.claim('p2', 'rp@x.it'), 'unavailable/false', 'reservation on the revoked link closes');
reset role;
select tests.login('pa');
select app.set_family_member_role(tests.family('P'), tests.uid('pb'), 'family_admin');
select lives_ok($$select app.set_family_member_role(tests.family('P'), tests.uid('pa'), 'member')$$, 'step down with another admin');
select is(tests.role_in('P', 'pa'), 'member', 'stepped down');
reset role;

-- Removal
select tests.login('pa');
select throws_ok($$select app.remove_family_member(tests.family('P'), tests.uid('pc'))$$, '42501', null, 'a member cannot remove');
reset role;
select tests.login('pb');
select throws_ok($$select app.remove_family_member(tests.family('P'), tests.uid('pb'))$$, '22023', null, 'removing oneself');
select app.set_family_member_role(tests.family('P'), tests.uid('pa'), 'family_admin');
reset role;
select tests.login('pa');
select app.create_family_invitation(tests.family('P'), '00000000-0000-4000-8000-00000000c003', tests.h('p3'));
reset role;
insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('pa'), tests.recipe('pasta-al-pomodoro'), 5),
	(tests.uid('pb'), tests.recipe('pasta-al-pomodoro'), 1);
select is((select average from app.family_scores where family_id = tests.family('P') and recipe_id = tests.recipe('pasta-al-pomodoro')),
	3.00, 'average of both');
select tests.login('pb');
select lives_ok($$select app.remove_family_member(tests.family('P'), tests.uid('pa'))$$, 'remove');
select lives_ok($$select app.remove_family_member(tests.family('P'), tests.uid('pa'))$$, 'remove again: no effect');
reset role;
select is((select count(*) from app.family_removals where family_id = tests.family('P') and user_id = tests.uid('pa')), 1::bigint, 'one removal row');
select is((select removed_by from app.family_removals where family_id = tests.family('P') and user_id = tests.uid('pa')), tests.uid('pb'), 'removed by');
select is(tests.role_in('P', 'pa'), null, 'no longer a member');
select is(tests.reason('00000000-0000-4000-8000-00000000c003'), 'creator_removed', 'links revoked on removal');
select is((select average || '/' || votes from app.family_scores where family_id = tests.family('P') and recipe_id = tests.recipe('pasta-al-pomodoro')),
	'1.00/1', 'the removed member leaves the average');
select is((select count(*) from app.ratings where user_id = tests.uid('pa')), 1::bigint, 'the rating stays');

-- Leaving
select tests.login('qa');
select throws_ok($$select app.leave_family(tests.family('Q'), null)$$, 'P0A10', null, 'sole member must delete');
reset role;
insert into app.family_members (family_id, user_id, role) values (tests.family('Q'), tests.uid('qb'), 'member'), (tests.family('Q'), tests.uid('qc'), 'member');
select tests.login('qa');
select app.create_family_invitation(tests.family('Q'), '00000000-0000-4000-8000-00000000d001', tests.h('q1'));
reset role;
select tests.become('anon');
select is(tests.claim('q1', 'rq@x.it'), 'create/false', 'reservation on the link of qa');
reset role;
update app.family_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-00000000d001';
select tests.login('qa');
select throws_ok($$select app.leave_family(tests.family('Q'), null)$$, 'P0A13', null, 'last admin needs a successor');
select throws_ok($$select app.leave_family(tests.family('Q'), tests.uid('qa'))$$, 'P0A13', null, 'oneself is not a successor');
select throws_ok($$select app.leave_family(tests.family('Q'), tests.uid('gina'))$$, 'P0A13', null, 'successor not a member');
select lives_ok($$select app.leave_family(tests.family('Q'), tests.uid('qb'))$$, 'leave naming a successor');
select throws_ok($$select app.leave_family(tests.family('Q'), tests.uid('qb'))$$, '42501', null, 'leaving again: forbidden');
reset role;
select is(tests.role_in('Q', 'qb'), 'family_admin', 'successor promoted');
select is(tests.role_in('Q', 'qa'), null, 'left');
select is(tests.reason('00000000-0000-4000-8000-00000000d001'), 'creator_left', 'expired open link revoked on leaving');
select is((select count(*) from app.family_removals where family_id = tests.family('Q')), 0::bigint, 'leaving writes no removal');
select tests.become('anon');
select is(tests.claim('q1', 'rq@x.it'), 'unavailable/false', 'reservation on the link closes');
reset role;
select tests.login('qc');
select throws_ok($$select app.leave_family(tests.family('Q'), tests.uid('qb'))$$, 'P0A13', null, 'a member names no successor');
select lives_ok($$select app.leave_family(tests.family('Q'), null)$$, 'a member leaves');
reset role;
select is(tests.role_in('Q', 'qc'), null, 'member left');

-- Deletion view
select tests.login('franco');
select is((select name || '|' || member_names::text || '|' || week_count || '|' || can_delete from app.family_deletion_view(tests.family('Verdi'))),
	'test-Verdi|["Franco"]|1|true', 'deletion summary');
reset role;
select tests.login('anna');
select throws_ok($$select * from app.family_deletion_view(tests.family('Verdi'))$$, '42501', null, 'not a member');
reset role;
select tests.login('dario');
select is((select can_delete from app.family_deletion_view(tests.family('Rossi'))), false, 'a member cannot delete');
select throws_ok($$select app.delete_family(tests.family('Rossi'))$$, '42501', null, 'a member cannot delete');
reset role;

-- Deletion: everything of the family goes, the rest stays
select set_config('tests.rossi', tests.family('Rossi')::text, true);
select set_config('tests.rossi_week', tests.week('Rossi')::text, true);
insert into app.weekly_jobs (family_id, target_week) values (tests.family('Rossi'), '2026-10-19');
insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('dario'), tests.recipe('pasta-al-pomodoro'), 4)
	on conflict do nothing;
select ok((select count(*) from app.family_invitations where family_id = tests.family('Rossi')) > 0, 'Rossi has links');
select ok((select count(*) from app.meal_slots where week_id = tests.week('Rossi')) > 0, 'Rossi has meals');
select tests.login('anna');
select lives_ok($$select app.delete_family(tests.family('Rossi'))$$, 'admin deletes');
reset role;
select is(
	(select count(*) from app.family_members where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.weeks where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.meal_slots where week_id = current_setting('tests.rossi_week')::uuid)
	+ (select count(*) from app.meal_changes c join app.meal_slots s on s.id = c.meal_slot_id where s.week_id = current_setting('tests.rossi_week')::uuid)
	+ (select count(*) from app.meal_actions where week_id = current_setting('tests.rossi_week')::uuid)
	+ (select count(*) from app.shopping_lists where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.recipe_exclusions where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_ingredients where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_books where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_tried_recipes where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.weekly_jobs where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.temporary_lists where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_invitations where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_joins where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.family_removals where family_id = current_setting('tests.rossi')::uuid)
	+ (select count(*) from app.families where id = current_setting('tests.rossi')::uuid),
	0::bigint, 'nothing of the family left');
select ok((select count(*) from app.family_invitation_reservations where token_hash in (tests.h('l3'), tests.h('l4'))
	and family_id is null and invitation_id is null) > 0, 'reservations stay without references');
select is((select count(*) from app.ratings where user_id = tests.uid('dario')), 1::bigint, 'ratings stay');
select is((select count(*) from app.families where id = tests.family('Verdi')), 1::bigint, 'other families stay');
select is((select count(*) from auth.users where id = tests.uid('dario')), 1::bigint, 'accounts stay');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('dario')), null, 'shown family cleared');

-- ===== Account deletion (task 3) =====
create function tests.alive(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.profiles where user_id = p_user_id);
$$;
create function tests.plan_outcome(p_plan jsonb, p_family uuid) returns text language sql immutable as $$
	select f ->> 'outcome' from jsonb_array_elements(p_plan -> 'families') f where (f ->> 'familyId')::uuid = p_family;
$$;
grant execute on function tests.alive(uuid), tests.plan_outcome(jsonb, uuid) to authenticated, anon, app_job;
select tests.create_user(n) from unnest(array['da', 'db', 'dc', 'dd', 'df']) n;
select tests.make_family('S1', 'db', array[]::text[]);
select tests.make_family('S2', 'da', array['dc', 'dd']);
select tests.make_family('S3', 'da', array[]::text[]);
select tests.make_family('S4', 'df', array['dc']);
select set_config('tests.s2', tests.family('S2')::text, true);
select set_config('tests.s3', tests.family('S3')::text, true);
-- da joins S1 with a link, creates links in S2 (one expired with a reservation), rates a recipe
select tests.login('db');
select app.create_family_invitation(tests.family('S1'), '00000000-0000-4000-8000-00000000e001', tests.h('s1'));
reset role;
select tests.login('da');
select app.join_family(tests.h('s1'));
select app.create_family_invitation(tests.family('S2'), '00000000-0000-4000-8000-00000000e002', tests.h('s2a'));
select app.create_family_invitation(tests.family('S2'), '00000000-0000-4000-8000-00000000e003', tests.h('s2b'));
reset role;
select tests.become('anon');
select tests.claim('s2b', 'rs@x.it');
reset role;
update app.family_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-00000000e003';
insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('da'), tests.recipe('pasta-al-pomodoro'), 3);

-- The last app admin
select tests.login('elena');
select is((app.account_deletion_plan(tests.uid('elena')) ->> 'lastAppAdmin')::boolean, true, 'elena is the last app admin');
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('elena'), '{}', '{}'), 'P0A08', null, 'last app admin cannot be deleted');
reset role;
insert into app.user_roles (user_id, role) values (tests.uid('da'), 'app_admin');
select tests.login('da');
select app.create_app_invitation('00000000-0000-4000-8000-00000000e101', tests.h('ai1'), 'invited-by-da@x.it', '[]');
reset role;
-- App invitations addressed to da: the one da accepted, one still pending for the email (sent
-- before the account existed), one revoked; and one for someone else.
insert into app.app_invitations (id, token_hash, email, created_by, expires_at, status, reserved_user_id, reserved_at, accepted_by, accepted_at, revoked_at)
values
	('00000000-0000-4000-8000-00000000e112', tests.h('ai-accepted'), 'da@test.local', tests.uid('elena'), now() + interval '7 days',
		'accepted', tests.uid('da'), now(), tests.uid('da'), now(), null),
	('00000000-0000-4000-8000-00000000e113', tests.h('ai-pending'), 'da@test.local', tests.uid('elena'), now() + interval '7 days',
		'pending', null, null, null, null, null),
	('00000000-0000-4000-8000-00000000e114', tests.h('ai-revoked'), 'da@test.local', tests.uid('elena'), now() + interval '7 days',
		'revoked', null, null, null, null, now()),
	('00000000-0000-4000-8000-00000000e115', tests.h('ai-other'), 'someone-else@x.it', tests.uid('elena'), now() + interval '7 days',
		'pending', null, null, null, null, null);

-- Plan
select tests.login('dc');
select throws_ok(format('select app.account_deletion_plan(%L)', tests.uid('da')), '42501', null, 'neither the person nor an app admin');
reset role;
select tests.login('elena');
select throws_ok(format('select app.account_deletion_plan(%L)', gen_random_uuid()), 'P0A07', null, 'unknown user');
select set_config('tests.plan', app.account_deletion_plan(tests.uid('da'))::text, true);
reset role;
select is(tests.plan_outcome(current_setting('tests.plan')::jsonb, tests.family('S1')), 'stays', 'stays');
select is(tests.plan_outcome(current_setting('tests.plan')::jsonb, tests.family('S2')), 'needs_successor', 'needs a successor');
select is(tests.plan_outcome(current_setting('tests.plan')::jsonb, tests.family('S3')), 'deleted', 'deleted');
select is((select jsonb_agg(c ->> 'displayName' order by c ->> 'displayName') from jsonb_array_elements(current_setting('tests.plan')::jsonb -> 'families') f,
	jsonb_array_elements(f -> 'candidates') c where (f ->> 'familyId')::uuid = tests.family('S2')), '["Dc", "Dd"]'::jsonb, 'candidates');
select is((current_setting('tests.plan')::jsonb ->> 'lastAppAdmin')::boolean, false, 'not the last app admin');
select is((current_setting('tests.plan')::jsonb ->> 'openInvitations')::int, 3, 'open links and pending app invitations');
select is((current_setting('tests.plan')::jsonb ->> 'pending')::boolean, false, 'not pending');
select tests.login('da');
select is(app.account_deletion_plan(tests.uid('da')) -> 'families', current_setting('tests.plan')::jsonb -> 'families', 'same plan for oneself');

-- Begin: refusals write nothing
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('dc')), '{}'),
	'P0A11', null, 'different set of deleted families');
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), '{}', array[tests.family('S3')]),
	'P0A13', null, 'missing successor');
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('gina')), array[tests.family('S3')]),
	'P0A13', null, 'successor not a member');
reset role;
select tests.login('dc');
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('dc')), array[tests.family('S3')]),
	'42501', null, 'someone else without app_admin');
reset role;
-- An agent cannot delete families
select tests.login_with_claims(jsonb_build_object('sub', tests.uid('da'), 'role', 'authenticated', 'client_id', gen_random_uuid()));
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('dc')), array[tests.family('S3')]),
	'P0A15', null, 'agent request deleting a family');
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), '{}', '{}'),
	'P0A15', null, 'agent request with a stale plan: the page, not a conflict');
reset role;
-- client_id present but null: an agent for the server (channelOf), so an agent here too
select tests.login_with_claims(jsonb_build_object('sub', tests.uid('da'), 'role', 'authenticated', 'client_id', null));
select throws_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('dc')), array[tests.family('S3')]),
	'P0A15', null, 'client_id null counts as an agent, as on the server');
reset role;
select ok(tests.alive(tests.uid('da')), 'nothing written');

-- Begin
select tests.login('da');
select lives_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), json_build_object(tests.family('S2'), tests.uid('dc')), array[tests.family('S3')]),
	'deletion begins');
select lives_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('da'), '{}', '{}'), 'second call: no effect');
reset role;
select is(tests.role_in('S2', 'dc'), 'family_admin', 'successor promoted');
select is((select count(*) from app.families where id = current_setting('tests.s3')::uuid), 0::bigint, 'sole-member family deleted');
select is((select count(*) from app.families where id = tests.family('S1')), 1::bigint, 'other family stays');
select is(tests.reason('00000000-0000-4000-8000-00000000e002'), 'creator_deleted', 'link revoked');
select is(tests.reason('00000000-0000-4000-8000-00000000e003'), 'creator_deleted', 'expired open link revoked');
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-00000000e101'), 'revoked', 'app invitation revoked');
select is((select count(*) from app.app_invitations where email = 'da@test.local'), 0::bigint, 'no app invitation keeps the email');
select is((select status || '/' || coalesce(email, '-') from app.app_invitations where id = '00000000-0000-4000-8000-00000000e112'),
	'accepted/-', 'accepted app invitation: kept, without the email');
select is((select status || '/' || coalesce(email, '-') from app.app_invitations where id = '00000000-0000-4000-8000-00000000e113'),
	'revoked/-', 'pending app invitation for the email: revoked, without the email');
select is((select status || '/' || coalesce(email, '-') from app.app_invitations where id = '00000000-0000-4000-8000-00000000e114'),
	'revoked/-', 'revoked app invitation for the email: without the email');
select is((select status || '/' || coalesce(email, '-') from app.app_invitations where id = '00000000-0000-4000-8000-00000000e115'),
	'pending/someone-else@x.it', 'app invitation of someone else unchanged');
select throws_ok($$update app.app_invitations set email = null where id = '00000000-0000-4000-8000-00000000e115'$$,
	'23514', null, 'a pending app invitation needs its email');
select is(
	(select count(*) from app.ratings where user_id = tests.uid('da'))
	+ (select count(*) from app.user_roles where user_id = tests.uid('da'))
	+ (select count(*) from app.family_members where user_id = tests.uid('da'))
	+ (select count(*) from app.profiles where user_id = tests.uid('da'))
	+ (select count(*) from app.profile_preferences where user_id = tests.uid('da'))
	+ (select count(*) from app.family_joins where user_id = tests.uid('da')),
	0::bigint, 'app data of the person deleted');
select is((select requested_by from app.account_deletions where user_id = tests.uid('da')), tests.uid('da'), 'pending row');
select is((select count(*) from auth.users where id = tests.uid('da')), 1::bigint, 'the account is still in Auth');
select tests.login('da');
select throws_ok($$select app.create_family(gen_random_uuid(), 'test-After', 'metric', 'Europe/Rome')$$, '42501', null, 'no family after the deletion began');
reset role;
select tests.login('elena');
select throws_ok(format('select app.set_user_role(%L, %L, true)', tests.uid('da'), 'app_admin'), 'P0A07', null, 'no role for a pending account');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('ai2'), 'da@test.local', '[]')$$, 'P0A03', null, 'email still taken');
select is((select count(*) from app.admin_account_deletions() where user_id = tests.uid('da')), 1::bigint, 'admins see the pending row');
select is((select count(*) from app.app_invitations_view() where email = 'da@test.local'), 0::bigint, 'the admin view has no email of da');
select is((select coalesce(email, '-') || '/' || status from app.app_invitations_view() where id = '00000000-0000-4000-8000-00000000e112'),
	'-/accepted', 'the admin view lists the accepted invitation without the email');
select is((app.account_deletion_plan(tests.uid('da')) ->> 'pending')::boolean, true, 'plan says pending');
reset role;
select tests.login('dc');
select throws_ok($$select * from app.admin_account_deletions()$$, '42501', null, 'app admins only');
reset role;

-- Agent request without families to delete proceeds
select tests.login_with_claims(jsonb_build_object('sub', tests.uid('dd'), 'role', 'authenticated', 'client_id', gen_random_uuid()));
select lives_ok(format('select app.begin_account_deletion(%L, %L, %L)', tests.uid('dd'), '{}', '{}'), 'agent request with no family to delete');
reset role;
select ok(not tests.alive(tests.uid('dd')), 'deleted');

-- Attempts and closing (job)
select tests.become('app_job');
select is((select count(*) from app.pending_account_deletions('5 minutes') where user_id = tests.uid('da')), 0::bigint, 'recent rows are left alone');
select is((select count(*) from app.pending_account_deletions('-1 minute') where user_id = tests.uid('da')), 1::bigint, 'idle rows are resumed');
select is(app.record_account_deletion_attempt(tests.uid('da'), 'auth_admin_failed'), 1, 'failed attempt counted');
select throws_ok(format('select app.record_account_deletion_attempt(%L, null)', tests.uid('da')), '55000', null, 'cannot close while in Auth');
reset role;
select is((select last_error from app.account_deletions where user_id = tests.uid('da')), 'auth_admin_failed', 'last error');
select set_config('tests.da', tests.uid('da')::text, true);
delete from auth.users where id = current_setting('tests.da')::uuid;
select tests.become('app_job');
select is(app.record_account_deletion_attempt(current_setting('tests.da')::uuid, null), 1, 'closed');
reset role;
select ok((select completed_at is not null from app.account_deletions where user_id = current_setting('tests.da')::uuid), 'completed');
select is((select accepted_by is null and email is null from app.app_invitations where id = '00000000-0000-4000-8000-00000000e112'),
	true, 'after Auth: the accepted invitation has neither the account nor the email');
select throws_ok(format($$insert into auth.users (id, email, aud, role) values (%L, 'da2@x.it', 'authenticated', 'authenticated')$$, current_setting('tests.da')),
	'P0A01', null, 'a deleted id cannot get a profile again');
select is((select count(*) from auth.users where email = 'da2@x.it'), 0::bigint, 'no account left');
select tests.become('anon');
select is(app.account_id_deleted(current_setting('tests.da')::uuid), true, 'deleted id');
reset role;

-- One email reserved on two links: the deletion clears it from both, counts unchanged
select tests.login('franco');
select app.create_family_invitation(tests.family('Verdi'), '00000000-0000-4000-8000-00000000e004', tests.h('v1'));
reset role;
select tests.become('anon');
select tests.claim('s1', 'eve@x.it');
select set_config('tests.u1', current_setting('tests.claimed'), true);
select tests.claim('v1', 'eve@x.it');
select set_config('tests.u2', current_setting('tests.claimed'), true);
reset role;
select tests.create_account(current_setting('tests.u2')::uuid, 'eve@x.it');
select tests.become('anon');
select is(tests.complete(current_setting('tests.u2')::uuid), tests.family('Verdi')::text || '/true', 'eve joins Verdi');
reset role;
select tests.login_as(current_setting('tests.u2')::uuid);
select lives_ok(format('select app.begin_account_deletion(%L, %L, %L)', current_setting('tests.u2'), '{}', '{}'), 'eve deletes the account');
reset role;
select is((select count(*) from app.family_invitation_reservations where email = 'eve@x.it'), 0::bigint, 'the email is gone from every reservation');
select is((select string_agg(status, ',' order by status) from app.family_invitation_reservations
	where user_id in (current_setting('tests.u1')::uuid, current_setting('tests.u2')::uuid)), 'closed,joined', 'states');
select is((select count(*) from app.family_invitation_reservations where invitation_id = '00000000-0000-4000-8000-00000000e001'), 1::bigint, 'count of L1 unchanged');
select is((select count(*) from app.family_invitation_reservations where invitation_id = '00000000-0000-4000-8000-00000000e004'), 1::bigint, 'count of L2 unchanged');
select is((select count(*) from app.family_joins where user_id = current_setting('tests.u2')::uuid), 0::bigint, 'no join row of the person');
select tests.become('anon');
select throws_ok(format('select tests.complete(%L)', current_setting('tests.u1')), 'P0A01', null, 'the other reservation cannot complete');
select throws_ok($$select tests.claim('s1', 'eve@x.it')$$, 'P0A03', null, 'the email stays taken until Auth deletes the account');
reset role;
delete from auth.users where id = current_setting('tests.u2')::uuid;
select tests.become('anon');
select is(tests.claim('s1', 'eve@x.it'), 'create/false', 'a new registration gets a new id');
select isnt(current_setting('tests.claimed'), current_setting('tests.u1'), 'new id');
reset role;

-- Roles need a profile; a new account from an app invitation still gets its roles
select throws_ok(format($$insert into app.user_roles (user_id, role) values (%L, 'recipe_curator')$$, tests.uid('dd')), 'P0A07', null, 'no role without a profile');
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-00000000e102', tests.h('ai3'), 'fresh@x.it', '["recipe_curator"]');
reset role;
select tests.become('anon');
select set_config('tests.fresh', (select user_id::text from app.claim_app_invitation(tests.h('ai3'), 'fresh@x.it')), true);
reset role;
select tests.create_account(current_setting('tests.fresh')::uuid, 'fresh@x.it');
select tests.become('anon');
select lives_ok(format('select app.complete_app_invitation(%L, %L)', tests.h('ai3'), current_setting('tests.fresh')), 'app invitation completes');
reset role;
select is((select count(*) from app.user_roles where user_id = current_setting('tests.fresh')::uuid), 1::bigint, 'role granted');

select * from finish();
rollback;
