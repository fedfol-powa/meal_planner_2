begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Profile created by the trigger
select is((select display_name from app.profiles where user_id = tests.uid('dario')), 'Dario', 'name from metadata');
select is((select locale from app.profiles where user_id = tests.uid('franco')), 'en-GB', 'locale from metadata');
insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'no.meta@test.local', 'authenticated', 'authenticated');
select is((select p.display_name from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'no.meta@test.local'), 'no.meta', 'name from email');
select is((select p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'no.meta@test.local'), 'it-IT', 'default locale');
insert into auth.users (id, email, aud, role, raw_user_meta_data)
	values (gen_random_uuid(), 'fr@test.local', 'authenticated', 'authenticated', '{"locale": "fr-FR"}');
select is((select p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = 'fr@test.local'), 'it-IT', 'unsupported locale falls back');

-- Profiles: people without a family see only themselves
reset role;
select tests.login('dario');
select is((select count(*) from app.profiles), 1::bigint, 'Dario sees only his profile');
select is(tests.affected($$update app.profiles set display_name = 'Dario R.' where user_id = tests.uid('dario')$$), 1::bigint, 'Dario renames himself');
select is(tests.affected($$update app.profiles set display_name = 'Hacked' where user_id = tests.uid('elena')$$), 0::bigint, 'Dario cannot rename Elena');
select throws_ok($$update app.profiles set locale = 'fr-FR' where user_id = tests.uid('dario')$$, '23514', null, 'locale is checked');
select throws_ok($$update app.profiles set user_id = tests.uid('elena') where user_id = tests.uid('dario')$$, '42501', null, 'user_id is not writable');
select throws_ok($$insert into app.profiles (user_id, display_name) values (gen_random_uuid(), 'X')$$, '42501', null, 'profiles are created only by the trigger');

-- Global roles
select is((select count(*) from app.user_roles), 1::bigint, 'Dario sees only his role');
select ok(app.has_role('recipe_curator'), 'Dario is a curator');
select ok(not app.has_role('app_admin'), 'Dario is not an app admin');
select throws_ok($$insert into app.user_roles (user_id, role) values (tests.uid('dario'), 'app_admin')$$, '42501', null, 'roles are not self-assigned');
reset role;
select tests.login('elena');
select is((select role from app.user_roles), 'app_admin', 'Elena sees only her role');
select ok(not app.has_role('recipe_curator'), 'app admin is not a curator');

-- Sessions (immediate revocation)
reset role;
select tests.login('dario', tests.create_session('dario'));
select ok(app.session_is_active(), 'active session');
reset role;
select tests.login('dario', tests.create_session('elena'));
select ok(not app.session_is_active(), 'session of another user');
reset role;
select tests.login('dario', tests.create_session('dario', now() - interval '1 minute'));
select ok(not app.session_is_active(), 'expired session');
reset role;
select tests.login('dario', gen_random_uuid());
select ok(not app.session_is_active(), 'unknown session');
reset role;
select tests.login('dario');
select ok(not app.session_is_active(), 'no session_id claim');
reset role;
select tests.login_with_claims(jsonb_build_object('sub', tests.uid('dario'), 'role', 'authenticated', 'session_id', 'abc'));
select ok(not app.session_is_active(), 'malformed session_id');

-- anon executes none of these
reset role;
select tests.become('anon');
select throws_ok($$select app.has_role('app_admin')$$, '42501', null, 'anon cannot call has_role');
select throws_ok($$select app.session_is_active()$$, '42501', null, 'anon cannot call session_is_active');
select throws_ok($$select * from app.profiles$$, '42501', null, 'anon cannot read profiles');

-- Deleting a user removes profile and roles (counted by the saved id: the seed has
-- another Dario)
reset role;
select tests.uid('dario') as dario_id \gset
delete from auth.users where id = :'dario_id';
select is((select count(*) from app.profiles where user_id = :'dario_id'), 0::bigint, 'profile deleted with the user');
select is((select count(*) from app.user_roles where user_id = :'dario_id'), 0::bigint, 'roles deleted with the user');

select * from finish();
rollback;
