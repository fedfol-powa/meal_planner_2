begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select tests.login('dario');
select is(app.create_family('00000000-0000-4000-8000-0000000000f1', 'test-Nuova', 'uk_imperial', 'Europe/London'),
	'00000000-0000-4000-8000-0000000000f1'::uuid, 'created');
reset role;
select is((select role from app.family_members where family_id = '00000000-0000-4000-8000-0000000000f1' and user_id = tests.uid('dario')), 'family_admin', 'creator is admin');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('dario')), '00000000-0000-4000-8000-0000000000f1'::uuid, 'shown family');
select is((select time_zone from app.families where id = '00000000-0000-4000-8000-0000000000f1'), 'Europe/London', 'time zone');
select is((select count(*) from app.weeks where family_id = '00000000-0000-4000-8000-0000000000f1'), 0::bigint, 'no generation inside the function');
select tests.login('dario');
select lives_ok($$select app.create_family('00000000-0000-4000-8000-0000000000f1', 'test-Nuova', 'uk_imperial', 'Europe/London')$$, 'repeat');
reset role;
select is((select count(*) from app.family_members where family_id = '00000000-0000-4000-8000-0000000000f1'), 1::bigint, 'no duplicate');
select tests.login('elena');
select throws_ok($$select app.create_family('00000000-0000-4000-8000-0000000000f1', 'x', 'metric', 'Europe/Rome')$$, 'P0A05', null, 'someone else''s id');
select throws_ok($$select app.create_family(gen_random_uuid(), 'x', 'metric', 'Mars/Base')$$, '22023', null, 'invalid time zone');
select throws_ok($$select app.create_family(gen_random_uuid(), '  ', 'metric', 'Europe/Rome')$$, '23514', null, 'empty name');
reset role;
select tests.become('anon');
select throws_ok($$select app.create_family(gen_random_uuid(), 'x', 'metric', 'Europe/Rome')$$, '42501', null, 'anon cannot create');

select * from finish();
rollback;
