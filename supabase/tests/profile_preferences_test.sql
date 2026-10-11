begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Fixtures: Anna is admin of Rossi and member of Bianchi, Bruno is member of Rossi, Verdi
-- has only Franco.
select has_table('app', 'profile_preferences', 'the shown family has its own table');

-- Anna shows Bianchi
select tests.login('anna');
select is(tests.affected(format($$insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('anna'), %L)$$, tests.family('Bianchi'))),
	1::bigint, 'Anna writes her choice');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('anna')),
	tests.family('Bianchi'), 'Anna reads her choice');
select throws_ok(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Verdi')),
	'23503', null, 'a family Anna is not in is refused');
select is(tests.affected(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Rossi'))),
	1::bigint, 'Anna switches to Rossi');
select is(tests.affected(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Bianchi'))),
	1::bigint, 'and back to Bianchi');

-- Bruno, only in Rossi, never sees nor changes Anna's choice
reset role;
select tests.login('bruno');
select is((select count(*) from app.profile_preferences), 0::bigint, 'Bruno does not read Anna''s choice');
select is(tests.affected(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Rossi'))),
	0::bigint, 'Bruno cannot change Anna''s choice');
select throws_ok(format($$insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('anna'), %L)$$, tests.family('Rossi')),
	'42501', null, 'Bruno cannot write a row for Anna');
select throws_ok($$delete from app.profile_preferences$$, '42501', null, 'rows are never deleted directly');
select throws_ok($$update app.profile_preferences set user_id = tests.uid('anna')$$, '42501', null, 'user_id is not writable');
select is(tests.affected(format($$insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('bruno'), %L)$$, tests.family('Rossi'))),
	1::bigint, 'Bruno writes his own choice');
select is((select count(*) from app.profile_preferences), 1::bigint, 'Bruno sees only his own row');

-- Leaving the shown family clears it; the row stays
reset role;
delete from app.family_members where family_id = tests.family('Bianchi') and user_id = tests.uid('anna');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('anna')), null::uuid,
	'cleared when the membership goes');
select is((select count(*) from app.profile_preferences where user_id = tests.uid('anna')), 1::bigint, 'the row stays');

-- Deleting the user removes the row with the profile
delete from auth.users where id = tests.uid('bruno');
select is((select count(*) from app.profile_preferences where user_id = tests.uid('bruno')), 0::bigint, 'gone with the user');

select * from finish();
rollback;
