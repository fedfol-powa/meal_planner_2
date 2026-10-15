begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- The local database also holds users of the server tests: the checks below look only
-- at the fixture people, except where the test first removes other administrators.

-- Permissions: app admins only
select tests.login('dario');
select throws_ok($$select * from app.admin_users('', 50)$$, '42501', null, 'list: app admins only');
select throws_ok($$select * from app.admin_user(tests.uid('anna'))$$, '42501', null, 'detail: app admins only');
select throws_ok($$select * from app.admin_user_families(tests.uid('anna'))$$, '42501', null, 'families: app admins only');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, '42501', null, 'set role: app admins only');
reset role;

-- An account with no profile, no roles and no family (spec W10, delivery of A)
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-0000000000a1', 'orphan_100%@test.local', 'authenticated', 'authenticated');
delete from app.profiles where user_id = '00000000-0000-4000-8000-0000000000a1';

select tests.login('elena');
select is((select display_name from app.admin_users('orphan', 50)), 'orphan_100%', 'no profile: name from the email');
select is((select roles from app.admin_users('orphan', 50)), '[]'::jsonb, 'no roles: empty array');

-- Search: name or email, case only, %, _ and \ as text
select is((select count(*) from app.admin_users('ANNA', 50) where id = tests.uid('anna')), 1::bigint, 'name, any case');
select is((select count(*) from app.admin_users('anna@TEST', 50) where id = tests.uid('anna')), 1::bigint, 'email, any case');
select is((select count(*) from app.admin_users('100%', 50)), 1::bigint, '% is text');
select is((select count(*) from app.admin_users('n_a', 50) where id = tests.uid('anna')), 0::bigint, '_ is text, not a wildcard');
select is((select count(*) from app.admin_users('\', 50)), 0::bigint, 'a backslash is text');
select is((select count(*) from app.admin_users('D''Angelo', 50)), 0::bigint, 'an apostrophe is text');
select is((select roles from app.admin_users('elena', 50)), '["app_admin"]'::jsonb, 'roles as a jsonb array');

-- Limit: one row more than asked, so the server knows there are more
select is((select count(*) from app.admin_users('', 2)), 3::bigint, 'limit + 1 rows');
select throws_ok($$select * from app.admin_users('', 0)$$, '22023', null, 'limit too small');
select throws_ok($$select * from app.admin_users('', 201)$$, '22023', null, 'limit too large');

-- Detail and families: name and role only
select is((select last_app_admin from app.admin_user(tests.uid('anna'))), false, 'not an admin: not the last one');
select is((select count(*) from app.admin_user(gen_random_uuid())), 0::bigint, 'unknown user: no row');
select is(
	array(select name || ':' || role from app.admin_user_families(tests.uid('anna')) order by 1),
	array['test-Bianchi:member', 'test-Rossi:family_admin'], 'families by name and role');
reset role;
-- proargnames holds p_user_id, then the output columns: nothing but name and role.
select is(
	(select array_agg(a order by n) from unnest((select proargnames from pg_proc where proname = 'admin_user_families')) with ordinality as x(a, n) where n > 1),
	array['name', 'role'], 'families: only name and role');

-- Set role: idempotent both ways, granted_by recorded, bad role refused, unknown user refused
select tests.login('elena');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, 'grant curator');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', true)$$, 'grant again');
reset role;
select is((select count(*) from app.user_roles where user_id = tests.uid('anna') and role = 'recipe_curator'), 1::bigint, 'one row');
select is((select granted_by from app.user_roles where user_id = tests.uid('anna') and role = 'recipe_curator'), tests.uid('elena'), 'granted_by is the caller');
select tests.login('elena');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', false)$$, 'remove curator');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'recipe_curator', false)$$, 'remove again');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'root', true)$$, '22023', null, 'unknown role');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', null)$$, '22023', null, 'null granted');
select throws_ok($$select app.set_user_role(gen_random_uuid(), 'recipe_curator', true)$$, 'P0A07', null, 'unknown user');
reset role;
select is((select count(*) from app.user_roles where user_id = tests.uid('anna')), 0::bigint, 'anna has no roles');

-- Last app admin: the other administrators of the database go first (rolled back at the end)
delete from app.user_roles where role = 'app_admin' and user_id <> tests.uid('elena');
select tests.login('elena');
select is((select last_app_admin from app.admin_user(tests.uid('elena'))), true, 'elena is the last admin');
select throws_ok($$select app.set_user_role(tests.uid('elena'), 'app_admin', false)$$, 'P0A08', null, 'the last admin keeps the role');
select lives_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', true)$$, 'appoint anna');
select is((select last_app_admin from app.admin_user(tests.uid('elena'))), false, 'no longer the last');
select lives_ok($$select app.set_user_role(tests.uid('elena'), 'app_admin', false)$$, 'elena gives up her role');
select throws_ok($$select * from app.admin_users('', 50)$$, '42501', null, 'and loses access at once');
reset role;
select tests.login('anna');
select throws_ok($$select app.set_user_role(tests.uid('anna'), 'app_admin', false)$$, 'P0A08', null, 'anna is now the last admin');
reset role;

-- No direct writes for users
select tests.login('anna');
select throws_ok($$insert into app.user_roles (user_id, role) values (tests.uid('bruno'), 'app_admin')$$, '42501', null, 'no direct insert');
select throws_ok($$delete from app.user_roles$$, '42501', null, 'no direct delete');
reset role;

select * from finish();
rollback;
