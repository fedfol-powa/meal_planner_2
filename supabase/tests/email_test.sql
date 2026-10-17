begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- W15: operational alerts, password emails of invitations, the "not confirmed" label.
-- Spec: progetto/superpowers/specs/2026-10-17-email.md, sections 2, 5 and 8.

create function tests.h(p_token text) returns bytea language sql immutable as $$
	select sha256(convert_to(p_token, 'UTF8'));
$$;

-- State of a password email as the current role, compact: state, name or '-'.
create function tests.app_mail(p_token text, p_email text) returns text language plpgsql as $$
declare
	r record;
begin
	select * into r from app.app_invitation_password_email(tests.h(p_token), p_email);
	return r.state || '/' || coalesce(r.email, '-');
end;
$$;

create function tests.family_mail(p_token text, p_email text, p_first boolean) returns text language plpgsql as $$
declare
	r record;
begin
	select * into r from app.family_invitation_password_email(tests.h(p_token), p_email, p_first);
	return r.state || '/' || coalesce(r.family_name, '-');
end;
$$;

create function tests.email_of(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
	select email from auth.users where id = p_user_id;
$$;

grant execute on function tests.email_of(uuid) to authenticated;
grant execute on function tests.h(text), tests.app_mail(text, text), tests.family_mail(text, text, boolean) to anon, authenticated;

-- Accounts made from invitations, unconfirmed (no password known), and the closed invitations.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
	('00000000-0000-4000-8000-0000000000e1', 'app.new@test.local', 'authenticated', 'authenticated', '{"display_name": "App"}'),
	('00000000-0000-4000-8000-0000000000e2', 'fam.new@test.local', 'authenticated', 'authenticated', '{"display_name": "Fam"}'),
	('00000000-0000-4000-8000-0000000000e3', 'fam.closed@test.local', 'authenticated', 'authenticated', '{"display_name": "Closed"}'),
	('00000000-0000-4000-8000-0000000000e4', 'fam.late@test.local', 'authenticated', 'authenticated', '{"display_name": "Late"}');
insert into app.app_invitations (id, token_hash, email, roles, created_by, expires_at, status, reserved_user_id, reserved_at, accepted_by, accepted_at) values
	('00000000-0000-4000-8000-0000000000f1', tests.h('app-ok'), 'app.new@test.local', '{}', tests.uid('elena'), now() + interval '7 days',
		'accepted', '00000000-0000-4000-8000-0000000000e1', now(), '00000000-0000-4000-8000-0000000000e1', now()),
	('00000000-0000-4000-8000-0000000000f2', tests.h('app-pending'), 'app.pending@test.local', '{}', tests.uid('elena'), now() + interval '7 days',
		'pending', null, null, null, null);
insert into app.family_invitations (id, family_id, token_hash, created_by, expires_at) values
	('00000000-0000-4000-8000-0000000000f3', tests.family('Rossi'), tests.h('fam'), tests.uid('anna'), now() + interval '7 days'),
	-- Expired after the reservation was made: the name still comes with the first email.
	('00000000-0000-4000-8000-0000000000f4', tests.family('Rossi'), tests.h('fam-late'), tests.uid('anna'), now() - interval '1 day');
insert into app.family_invitation_reservations (user_id, invitation_id, family_id, token_hash, email, status, finished_at) values
	('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000f3', tests.family('Rossi'), tests.h('fam'), 'fam.new@test.local', 'joined', now()),
	('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000f3', tests.family('Rossi'), tests.h('fam'), 'fam.closed@test.local', 'closed', now()),
	('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000f4', tests.family('Rossi'), tests.h('fam-late'), 'fam.late@test.local', 'joined', now()),
	(gen_random_uuid(), '00000000-0000-4000-8000-0000000000f3', tests.family('Rossi'), tests.h('fam'), 'fam.reserved@test.local', 'reserved', null);
insert into app.family_members (family_id, user_id, role) values
	(tests.family('Rossi'), '00000000-0000-4000-8000-0000000000e2', 'member'),
	(tests.family('Rossi'), '00000000-0000-4000-8000-0000000000e4', 'member');

-- Tables: shape, RLS and privileges
select has_table('app', 'ops_alerts', 'ops_alerts exists');
select has_table('app', 'password_emails', 'password_emails exists');
select col_is_pk('app', 'ops_alerts', array['event', 'key'], 'ops_alerts: one row per event and key');
select col_is_pk('app', 'password_emails', 'user_id', 'password_emails: one row per person');
select ok((select relrowsecurity from pg_class where oid = 'app.ops_alerts'::regclass), 'ops_alerts has RLS');
select ok((select relrowsecurity from pg_class where oid = 'app.password_emails'::regclass), 'password_emails has RLS');
select throws_ok($$insert into app.ops_alerts (event, key, subject, body) values ('other', 'k', 's', 'b')$$, '23514', null, 'unknown event refused');
select throws_ok($$insert into app.ops_alerts (event, key, subject, body, closed_at, closed_reason) values ('ops_alert_test', 'k', 's', 'b', now(), 'lost')$$,
	'23514', null, 'unknown closing reason refused');
select lives_ok($$insert into app.ops_alerts (event, key, subject, body) values ('ops_alert_test', 'owner', 's', 'b')$$, 'a valid row');
select throws_ok($$insert into app.ops_alerts (event, key, subject, body) values ('ops_alert_test', 'owner', 's', 'b')$$, '23505', null, 'same event and key refused');
select is(
	array(select r || ':' || t from unnest(array['authenticated', 'anon', 'app_job']) r, unnest(array['app.password_emails']) t
		where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE')),
	array[]::text[], 'password_emails: no direct privileges for anon, authenticated, app_job');
select is(
	array(select r from unnest(array['authenticated', 'anon']) r where has_table_privilege(r, 'app.ops_alerts', 'SELECT,INSERT,UPDATE,DELETE')),
	array[]::text[], 'ops_alerts: nothing for users');

select tests.become('app_job');
select lives_ok($$insert into app.ops_alerts (event, key, details, subject, body) values ('weekly_job_overdue', 'f:2026-10-12', '{"familyId": "f"}', 's', 'b')$$, 'app_job inserts');
select is((select count(*) from app.ops_alerts where key = 'f:2026-10-12'), 1::bigint, 'app_job reads');
select is(tests.affected($$update app.ops_alerts set claimed_at = now() where key = 'f:2026-10-12'$$), 1::bigint, 'app_job updates');
select is(tests.affected($$delete from app.ops_alerts where key = 'f:2026-10-12'$$), 1::bigint, 'app_job deletes');
select throws_ok($$select * from app.password_emails$$, '42501', null, 'app_job does not read password_emails');
reset role;
select tests.become('authenticated');
select throws_ok($$select * from app.ops_alerts$$, '42501', null, 'authenticated does not read ops_alerts');
reset role;
select tests.become('anon');
select throws_ok($$select * from app.ops_alerts$$, '42501', null, 'anon does not read ops_alerts');
select throws_ok($$select * from app.password_emails$$, '42501', null, 'anon does not read password_emails');
reset role;
select ok(has_table_privilege('app_backup', 'app.ops_alerts', 'SELECT'), 'app_backup reads ops_alerts');
select ok(has_table_privilege('app_backup', 'app.password_emails', 'SELECT'), 'app_backup reads password_emails');
select ok(not has_table_privilege('app_backup', 'app.ops_alerts', 'INSERT,UPDATE,DELETE'), 'app_backup does not write ops_alerts');

-- Password email of an app invitation: authorised by link and email of the closed reservation
select tests.become('anon');
select is(tests.app_mail('app-other', 'app.new@test.local'), 'unavailable/-', 'app: another link');
select is(tests.app_mail('app-ok', 'someone@test.local'), 'unavailable/-', 'app: another email');
select is(tests.app_mail('app-pending', 'app.pending@test.local'), 'unavailable/-', 'app: not closed');
select is(tests.app_mail('app-ok', '  App.New@TEST.local '), 'send/app.new@test.local', 'app: first send, normalised email');
select is(tests.app_mail('app-ok', 'app.new@test.local'), 'too_soon/app.new@test.local', 'app: again within 60 seconds');
reset role;
select is((select user_id from app.password_emails where user_id = '00000000-0000-4000-8000-0000000000e1'),
	'00000000-0000-4000-8000-0000000000e1'::uuid, 'the send is recorded');
update app.password_emails set sent_at = now() - interval '61 seconds' where user_id = '00000000-0000-4000-8000-0000000000e1';
select tests.become('anon');
select is(tests.app_mail('app-ok', 'app.new@test.local'), 'send/app.new@test.local', 'app: send again after 60 seconds');
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000e1';
select tests.become('anon');
select is(tests.app_mail('app-ok', 'app.new@test.local'), 'not_needed/app.new@test.local', 'app: confirmed, nothing to send');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-0000000000e1';
select tests.become('anon');
select is(tests.app_mail('app-ok', 'app.new@test.local'), 'unavailable/-', 'app: account deleted');
reset role;
select is((select user_id from app.app_invitation_password_email(tests.h('app-other'), 'x@test.local')), null::uuid, 'unavailable: no user id');

-- Password email of a family invitation: name only for the first email of a joined member
select tests.become('anon');
select is(tests.family_mail('fam', 'other@test.local', true), 'unavailable/-', 'family: another email');
select is(tests.family_mail('other', 'fam.new@test.local', true), 'unavailable/-', 'family: another link');
select is(tests.family_mail('fam', 'fam.reserved@test.local', true), 'unavailable/-', 'family: reservation not closed');
select is(tests.family_mail('fam', 'Fam.New@test.local', true), 'send/test-Rossi', 'family: first email with the name');
select is(tests.family_mail('fam', 'fam.new@test.local', true), 'too_soon/test-Rossi', 'family: again within 60 seconds');
select is(tests.family_mail('fam', 'fam.closed@test.local', true), 'send/-', 'family: closed reservation, no name');
select is(tests.family_mail('fam-late', 'fam.late@test.local', true), 'send/test-Rossi', 'family: link expired after the reservation, still the name');
reset role;
update app.password_emails set sent_at = now() - interval '61 seconds';
select tests.become('anon');
select is(tests.family_mail('fam', 'fam.new@test.local', false), 'send/-', 'family: resend never has the name');
reset role;
update app.password_emails set sent_at = now() - interval '61 seconds';
delete from app.family_members where user_id = '00000000-0000-4000-8000-0000000000e2';
select tests.become('anon');
select is(tests.family_mail('fam', 'fam.new@test.local', true), 'send/-', 'family: removed member, no name');
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000e3';
select tests.become('anon');
select is(tests.family_mail('fam', 'fam.closed@test.local', false), 'not_needed/-', 'family: confirmed, nothing to send');
reset role;
select tests.login('anna');
select throws_ok($$select * from app.family_invitation_password_email(tests.h('fam'), 'fam.new@test.local', false)$$, '42501', null, 'authenticated cannot call');
select throws_ok($$select * from app.app_invitation_password_email(tests.h('app-ok'), 'app.new@test.local')$$, '42501', null, 'authenticated cannot call');
reset role;

-- The label: members read it for their family, app admins for a page of users
update auth.users set email_confirmed_at = now() where email in ('anna@test.local', 'bruno@test.local');
insert into app.family_members (family_id, user_id, role) values (tests.family('Rossi'), '00000000-0000-4000-8000-0000000000e2', 'member');
select tests.login('bruno');
select is(
	array(select tests.email_of(f.user_id) || ':' || f.unconfirmed from app.family_email_unconfirmed(tests.family('Rossi')) f order by 1),
	array['anna@test.local:false', 'bruno@test.local:false', 'fam.late@test.local:true', 'fam.new@test.local:true'],
	'a member reads the label of the family');
select ok(app.family_email_unconfirmed_version(tests.family('Rossi')) ~ '^[0-9a-f]{32}$', 'version is an md5');
select set_config('tests.v1', app.family_email_unconfirmed_version(tests.family('Rossi')), true);
select throws_ok($$select * from app.family_email_unconfirmed(tests.family('Bianchi'))$$, '42501', null, 'not a member: refused');
select throws_ok($$select app.family_email_unconfirmed_version(tests.family('Bianchi'))$$, '42501', null, 'not a member: version refused');
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000e2';
select tests.login('bruno');
select isnt(app.family_email_unconfirmed_version(tests.family('Rossi')), current_setting('tests.v1'), 'a member confirms: the version changes');
select set_config('tests.v2', app.family_email_unconfirmed_version(tests.family('Rossi')), true);
reset role;
-- Swap at the same count: e4 confirmed, e2 back to unconfirmed (made by the test as owner).
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-0000000000e4';
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-0000000000e2';
select tests.login('bruno');
select is((select count(*) from app.family_email_unconfirmed(tests.family('Rossi')) where unconfirmed), 1::bigint, 'still one unconfirmed');
select isnt(app.family_email_unconfirmed_version(tests.family('Rossi')), current_setting('tests.v2'), 'swap at the same count: the version changes');
reset role;
select tests.become('anon');
select throws_ok($$select * from app.family_email_unconfirmed(gen_random_uuid())$$, '42501', null, 'anon cannot read the label');
reset role;

select tests.login('elena');
select is(
	(select unconfirmed from app.admin_email_unconfirmed(array[tests.uid('anna'), tests.uid('carla')]) where user_id = tests.uid('carla')),
	true, 'app admin reads the label');
select is((select count(*) from app.admin_email_unconfirmed(array[tests.uid('anna'), tests.uid('carla')])), 2::bigint, 'one row per id');
select throws_ok($$select * from app.admin_email_unconfirmed(array(select gen_random_uuid() from generate_series(1, 201)))$$, '22023', null, 'at most 200 ids');
reset role;
select tests.login('anna');
select throws_ok($$select * from app.admin_email_unconfirmed(array[tests.uid('anna')])$$, '42501', null, 'not an app admin: refused');
reset role;

-- Overdue account deletions: at least N attempts in the window, completed included; app_job only
insert into app.account_deletions (user_id, requested_at, attempts, completed_at) values
	('00000000-0000-4000-8000-0000000000d1', now() - interval '1 day', 3, null),
	('00000000-0000-4000-8000-0000000000d2', now() - interval '2 days', 4, now()),
	('00000000-0000-4000-8000-0000000000d3', now() - interval '1 day', 2, null),
	('00000000-0000-4000-8000-0000000000d4', now() - interval '8 days', 5, null);
select tests.become('app_job');
select is(
	array(select user_id::text || ':' || attempts from app.overdue_account_deletions(3, interval '7 days')
		where user_id::text like '00000000-0000-4000-8000-0000000000d%' order by 1),
	array['00000000-0000-4000-8000-0000000000d1:3', '00000000-0000-4000-8000-0000000000d2:4'],
	'three attempts or more in 7 days, completed included');
reset role;
select tests.login('elena');
select throws_ok($$select * from app.overdue_account_deletions(3, interval '7 days')$$, '42501', null, 'users cannot list overdue deletions');
reset role;

-- Pruning of password emails: app_job only, rows older than 7 days
insert into app.password_emails (user_id, sent_at) values
	('00000000-0000-4000-8000-0000000000c1', now() - interval '8 days'),
	('00000000-0000-4000-8000-0000000000c2', now() - interval '6 days');
select tests.become('app_job');
select ok(app.prune_password_emails() >= 1, 'prune answers the count');
reset role;
select is(
	array(select user_id::text from app.password_emails where user_id::text like '00000000-0000-4000-8000-0000000000c%'),
	array['00000000-0000-4000-8000-0000000000c2'], 'only rows older than 7 days are gone');
select tests.login('elena');
select throws_ok($$select app.prune_password_emails()$$, '42501', null, 'users cannot prune');
reset role;
select tests.become('anon');
select throws_ok($$select app.prune_password_emails()$$, '42501', null, 'anon cannot prune');
reset role;

select * from finish();
rollback;
