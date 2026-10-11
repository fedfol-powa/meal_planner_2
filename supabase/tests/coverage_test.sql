begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Tables
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and not c.relrowsecurity order by 1),
	array[]::text[], 'every app table has RLS');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'v')
			and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
				or has_table_privilege('public', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
		order by 1),
	array[]::text[], 'anon and PUBLIC have no table privileges');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'v')
			and has_table_privilege('app_server', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
		order by 1),
	array[]::text[], 'app_server has no privileges without switching role');
select is(
	(select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')),
	0::bigint, 'nothing in public');

-- Functions: ACLs equal to the table of the spec
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('public', p.oid, 'EXECUTE') order by 1),
	array[]::text[], 'PUBLIC executes nothing');
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1),
	array['temporary_list_by_token'], 'anon executes only the Bring! function');
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1),
	array['can_access_list', 'can_access_slot', 'can_access_week', 'catalogue_author_names', 'connected_agents', 'has_role', 'is_family_admin',
		'is_localized_list', 'is_localized_text', 'is_member', 'meal_passed_at', 'recipe_is_cited', 'recipe_version_at',
		'session_is_active', 'shares_family', 'unit_dimension'],
	'authenticated executes only authorisation and pure functions');
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('app_job', p.oid, 'EXECUTE') order by 1),
	array['is_localized_list', 'is_localized_text', 'meal_passed_at', 'recipe_version_at', 'unit_dimension'],
	'app_job executes only pure functions');
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and has_function_privilege('app_server', p.oid, 'EXECUTE') order by 1),
	array[]::text[], 'app_server executes nothing without switching role');
select is(
	array(select p.proname::text collate "C" from pg_proc p
		where p.pronamespace = 'app'::regnamespace and p.prosecdef
			and not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')
		order by 1),
	array[]::text[], 'every security definer function pins an empty search_path');

-- Internal functions, called directly
reset role;
select tests.become('anon');
select throws_ok($$select app.bump_catalogue_version()$$, '42501', null, 'anon cannot bump the catalogue');
select throws_ok($$select app.bump_family_version(gen_random_uuid())$$, '42501', null, 'anon cannot bump a family');
select throws_ok($$select app.week_family_id(gen_random_uuid())$$, '42501', null, 'anon cannot resolve families');
select throws_ok($$select app.is_member(gen_random_uuid())$$, '42501', null, 'anon cannot call is_member');
reset role;
select tests.login('bruno');
select throws_ok($$select app.bump_catalogue_version()$$, '42501', null, 'users cannot bump the catalogue');
select throws_ok($$select app.bump_families_of_user(gen_random_uuid())$$, '42501', null, 'users cannot bump families');
select throws_ok($$select app.list_family_id(gen_random_uuid())$$, '42501', null, 'users cannot resolve families');

reset role;
select ok(exists (select 1 from cron.job where jobname = 'purge-temporary-lists'), 'expired temporary lists are purged');

select * from finish();
rollback;
