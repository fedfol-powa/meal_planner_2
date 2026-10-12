begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_type, token_endpoint_auth_method, client_name) values
	('a0000000-0000-4000-8000-000000000001', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', 'Claude Code'),
	('a0000000-0000-4000-8000-000000000002', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', 'Codex'),
	('a0000000-0000-4000-8000-000000000003', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', null);
insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) values
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', 'openid', '2026-10-01 10:00+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000002', 'openid', '2026-10-02 10:00+00', '2026-10-03 10:00+00'),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000003', 'openid', '2026-10-04 10:00+00', null),
	(gen_random_uuid(), tests.uid('bruno'), 'a0000000-0000-4000-8000-000000000001', 'openid', '2026-10-05 10:00+00', null);
insert into auth.sessions (id, user_id, oauth_client_id, updated_at, not_after) values
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-10 08:00+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-10 09:30+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-11 09:00+00', '2026-10-01 00:00+00'),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000002', '2026-10-11 09:00+00', null),
	(gen_random_uuid(), tests.uid('bruno'), 'a0000000-0000-4000-8000-000000000001', '2026-10-11 12:00+00', null);

select tests.login('anna');
select results_eq(
	$$select client_id::text, name, connected_at, last_renewed_at from app.connected_agents() order by connected_at$$,
	$$values
		('a0000000-0000-4000-8000-000000000001', 'Claude Code', '2026-10-01 10:00+00'::timestamptz, '2026-10-10 09:30+00'::timestamptz),
		('a0000000-0000-4000-8000-000000000003', '', '2026-10-04 10:00+00'::timestamptz, null::timestamptz)$$,
	'active grants only, last renewal from live sessions of the client, empty name when missing');

select tests.login('bruno');
select results_eq(
	$$select client_id::text, last_renewed_at from app.connected_agents()$$,
	$$values ('a0000000-0000-4000-8000-000000000001', '2026-10-11 12:00+00'::timestamptz)$$,
	'the same client for another person is that person''s row only');

select tests.login('gina');
select is((select count(*) from app.connected_agents()), 0::bigint, 'nobody else''s agents');

select tests.become('anon');
select throws_ok($$select * from app.connected_agents()$$, '42501', null, 'anon cannot list agents');

select * from finish();
rollback;
