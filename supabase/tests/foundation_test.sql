begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select has_schema('app');
select ok(not has_schema_privilege('public', 'app', 'USAGE'), 'PUBLIC has no usage on app');
select ok(has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated uses app');
select ok(has_schema_privilege('anon', 'app', 'USAGE'), 'anon uses app');
select ok(has_schema_privilege('app_job', 'app', 'USAGE'), 'app_job uses app');

select ok(pg_has_role('app_server', 'authenticated', 'SET'), 'app_server can become authenticated');
select ok(pg_has_role('app_server', 'anon', 'SET'), 'app_server can become anon');
select ok(pg_has_role('app_server', 'app_job', 'SET'), 'app_server can become app_job');
select ok(not pg_has_role('app_server', 'authenticated', 'USAGE'), 'app_server does not inherit authenticated');
select ok((select rolcanlogin from pg_roles where rolname = 'app_server'), 'app_server can log in');
select ok(not (select rolcanlogin from pg_roles where rolname = 'app_job'), 'app_job cannot log in');

select ok(app.is_localized_text('{"it-IT": "Pomodori", "en-GB": "Tomatoes"}'), 'both locales');
select ok(app.is_localized_text('{"it-IT": "Pomodori", "en-GB": null}'), 'missing translation is the domain''s business');
select ok(app.is_localized_text(null), 'null is allowed');
select ok(not app.is_localized_text('{"fr-FR": "Tomates"}'), 'unknown locale');
select ok(not app.is_localized_text('"Pomodori"'), 'not an object');
select ok(not app.is_localized_text('{"it-IT": 3}'), 'not a string');
select ok(app.is_localized_list('{"it-IT": ["pomodoro"], "en-GB": []}'), 'lists of strings');
select ok(not app.is_localized_list('{"it-IT": [1]}'), 'list of numbers');
select ok(not app.is_localized_list('{"it-IT": "pomodoro"}'), 'not a list');
select ok(not app.is_localized_list('[]'), 'not an object');

select ok(not has_function_privilege('public', 'app.is_localized_text(jsonb)', 'EXECUTE'), 'PUBLIC cannot execute');
select ok(not has_function_privilege('anon', 'app.is_localized_text(jsonb)', 'EXECUTE'), 'anon cannot execute');
select ok(has_function_privilege('authenticated', 'app.is_localized_text(jsonb)', 'EXECUTE'), 'authenticated can');
select ok(has_function_privilege('app_job', 'app.is_localized_list(jsonb)', 'EXECUTE'), 'app_job can');

select * from finish();
rollback;
