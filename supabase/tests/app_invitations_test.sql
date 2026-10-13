begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

create function tests.h(p_token text) returns bytea language sql immutable as $$
	select sha256(convert_to(p_token, 'UTF8'));
$$;
grant execute on function tests.h(text) to authenticated, anon;

-- Creation: app admins only, normalised email, allowed roles as jsonb
select tests.login('dario');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t0'), 'new@x.it', '[]')$$, '42501', null, 'only app admins create');
reset role;
select tests.login('elena');
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000001', tests.h('t1'), '  New@X.it ', '["recipe_curator"]')$$, 'app admin creates');
reset role;
select is((select email from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'new@x.it', 'email normalised');
select is((select roles from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), '{recipe_curator}'::text[], 'roles stored');
select tests.login('elena');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t2'), 'b@x.it', '["root"]')$$, '23514', null, 'unknown role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '["app_admin","app_admin"]')$$, '23514', null, 'duplicate role');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '{"a":1}')$$, '23514', null, 'roles not an array');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t3'), 'b@x.it', '[1]')$$, '23514', null, 'roles not strings');
select throws_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t4'), 'DARIO@test.local', '[]')$$, 'P0A03', null, 'email with an account');
select lives_ok($$select app.create_app_invitation(gen_random_uuid(), tests.h('t4b'), 'two@x.it', '["recipe_curator","app_admin"]')$$, 'two roles');

-- A new invitation to the same email replaces the pending one
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t5'), 'new@x.it', '[]')$$, 'second invitation');
reset role;
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000001'), 'revoked', 'first one revoked');
select tests.login('elena');
-- Repeating the same id gives a new token, no duplicate
select lives_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t6'), 'new@x.it', '[]')$$, 'repeat');
reset role;
select is((select count(*) from app.app_invitations where email = 'new@x.it' and status = 'pending'), 1::bigint, 'one pending');
select is((select token_hash from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), tests.h('t6'), 'token replaced');
select tests.login('elena');
select throws_ok($$select app.create_app_invitation('00000000-0000-4000-8000-000000000002', tests.h('t7'), 'other@x.it', '[]')$$, 'P0A05', null, 'same id, other email');
select is((select roles from app.app_invitations_view() where id = '00000000-0000-4000-8000-000000000002'), '[]'::jsonb, 'view gives jsonb roles');

-- RLS: only app admins read
reset role;
select tests.login('dario');
select is((select count(*) from app.app_invitations), 0::bigint, 'non admins read nothing');
select throws_ok($$update app.app_invitations set status = 'accepted'$$, '42501', null, 'no direct writes');
select throws_ok($$select app.claim_app_invitation(tests.h('t6'), 'new@x.it')$$, '42501', null, 'authenticated cannot claim');

-- Public reading by token: no email
reset role;
select tests.become('anon');
select is((select roles from app.app_invitation_by_token(tests.h('t6'))), '[]'::jsonb, 'valid invitation is readable');
select is((select count(*) from app.app_invitation_by_token(tests.h('t1'))), 0::bigint, 'revoked: no row');
select is((select count(*) from app.app_invitation_by_token(tests.h('nope'))), 0::bigint, 'unknown: no row');
select throws_ok($$select * from app.app_invitations$$, '42501', null, 'anon has no table access');

-- Claim: email check, reservation reused (values compared through set_config, never a table read as anon)
select throws_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'other@x.it')$$, 'P0A02', null, 'other email');
select is((select email from app.claim_app_invitation(tests.h('t6'), ' NEW@x.it')), 'new@x.it', 'email compared normalised');
select set_config('tests.first', (select user_id::text from app.claim_app_invitation(tests.h('t6'), 'new@x.it')), true);
select is((select user_id::text from app.claim_app_invitation(tests.h('t6'), 'new@x.it')), current_setting('tests.first'), 'same reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t1'), 'new@x.it')$$, 'P0A01', null, 'revoked cannot be claimed');

-- Expiry: before reservation refused, after reservation still valid
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 1::bigint, 'reserved and expired is still valid');
select lives_ok($$select * from app.claim_app_invitation(tests.h('t6'), 'new@x.it')$$, 'reserved and expired can be claimed again');
reset role;
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000003', tests.h('t8'), 'late@x.it', '[]');
reset role;
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000003';
select tests.become('anon');
select is((select count(*) from app.app_invitation_by_token(tests.h('t8'))), 0::bigint, 'expired without reservation');
select throws_ok($$select * from app.claim_app_invitation(tests.h('t8'), 'late@x.it')$$, 'P0A01', null, 'expired cannot be claimed');

-- Completion: needs the reserved id existing in auth.users with the invitation email
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), gen_random_uuid())$$, 'P0A01', null, 'other id');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'P0A01', null, 'reserved id not in auth.users yet');
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.first')::uuid, 'wrong@x.it', 'authenticated', 'authenticated');
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'P0A01', null, 'reserved id with another email');
reset role;
update auth.users set email = 'new@x.it' where id = current_setting('tests.first')::uuid;
update app.app_invitations set roles = '{recipe_curator}' where id = '00000000-0000-4000-8000-000000000002';
select tests.become('anon');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'completes even though expired after the reservation');
select lives_ok($$select app.complete_app_invitation(tests.h('t6'), current_setting('tests.first')::uuid)$$, 'repeat is a no-op');
select is((select count(*) from app.app_invitation_by_token(tests.h('t6'))), 0::bigint, 'used: no row');
reset role;
select is((select status from app.app_invitations where id = '00000000-0000-4000-8000-000000000002'), 'accepted', 'accepted');
select is((select array_agg(role) from app.user_roles where user_id = current_setting('tests.first')::uuid), '{recipe_curator}'::text[], 'roles granted');
select is((select granted_by from app.user_roles where user_id = current_setting('tests.first')::uuid), tests.uid('elena'), 'granted by the author');

-- Revoked after the reservation, also when already expired: completion refused
select tests.login('elena');
select app.create_app_invitation('00000000-0000-4000-8000-000000000004', tests.h('t9'), 'gone@x.it', '[]');
reset role;
select tests.become('anon');
select set_config('tests.r9', (select user_id::text from app.claim_app_invitation(tests.h('t9'), 'gone@x.it')), true);
reset role;
insert into auth.users (id, email, aud, role) values (current_setting('tests.r9')::uuid, 'gone@x.it', 'authenticated', 'authenticated');
update app.app_invitations set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-000000000004';
select tests.login('elena');
select lives_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000004')$$, 'revoke an expired pending invitation');
select lives_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000004')$$, 'revoke again is a no-op');
select throws_ok($$select app.revoke_app_invitation('00000000-0000-4000-8000-000000000002')$$, 'P0A04', null, 'accepted cannot be revoked');
select throws_ok($$select app.revoke_app_invitation(gen_random_uuid())$$, 'P0A06', null, 'unknown');
reset role;
select tests.become('anon');
select throws_ok($$select app.complete_app_invitation(tests.h('t9'), current_setting('tests.r9')::uuid)$$, 'P0A01', null, 'revoked after reservation');

-- The admin view
reset role;
select tests.login('elena');
select is((select created_by_name from app.app_invitations_view() where id = '00000000-0000-4000-8000-000000000004'), 'Elena', 'author name');
reset role;
select tests.login('dario');
select throws_ok($$select * from app.app_invitations_view()$$, '42501', null, 'view for app admins only');

select * from finish();
rollback;
