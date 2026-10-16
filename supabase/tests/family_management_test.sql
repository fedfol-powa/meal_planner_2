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

select * from finish();
rollback;
