begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Visibility
reset role;
select tests.login('bruno');
select is((select array_agg(name order by name) from app.families), array['test-Rossi'], 'Bruno sees Rossi only');
select is((select count(*) from app.family_members), 2::bigint, 'Bruno sees the Rossi members');
select is((select count(*) from app.profiles), 2::bigint, 'Bruno sees himself and Anna');
select is((select count(*) from app.family_books), 1::bigint, 'Rossi books');
select is((select count(*) from app.family_ingredients), 1::bigint, 'Rossi avoided ingredients');
select is((select count(*) from app.family_tried_recipes), 1::bigint, 'Rossi tried recipes');
select is((select count(*) from app.recipe_exclusions), 0::bigint, 'Verdi exclusions are hidden');
select ok(app.is_member(tests.family('Rossi')), 'member of Rossi');
select ok(not app.is_member(tests.family('Verdi')), 'not member of Verdi');
select ok(not app.is_member(gen_random_uuid()), 'not member of a family that does not exist');
select ok(not app.is_family_admin(tests.family('Rossi')), 'not admin of Rossi');
reset role;
select tests.login('anna');
select is((select array_agg(name order by name) from app.families), array['test-Bianchi', 'test-Rossi'], 'Anna sees both her families');
select is((select count(*) from app.family_members), 4::bigint, 'Anna sees members of both');
select is((select count(*) from app.profiles), 3::bigint, 'Anna sees Bruno and Carla');
reset role;
select tests.login('elena');
select is((select count(*) from app.families), 0::bigint, 'app admin sees no family');
select is((select count(*) from app.family_members), 0::bigint, 'app admin sees no members');
reset role;
select tests.login('dario');
select is((select count(*) from app.families), 0::bigint, 'curator sees no family');

-- Settings: family admins only, and only their own family
reset role;
select tests.login('bruno');
select is(tests.affected($$update app.families set settings = '{"x": 1}'$$), 0::bigint, 'member cannot change settings');
select throws_ok($$insert into app.families (name) values ('test-Nuova')$$, '42501', null, 'families are created by the bootstrap script for now');
reset role;
select tests.login('anna');
select is(tests.affected($$update app.families set settings = '{"x": 1}' where name = 'test-Rossi'$$), 1::bigint, 'admin changes settings');
select is(tests.affected($$update app.families set settings = '{"x": 1}' where name = 'test-Bianchi'$$), 0::bigint, 'Anna is only a member of Bianchi');
select throws_ok($$update app.families set data_version = 99$$, '42501', null, 'counter is not writable');
select throws_ok($$update app.families set id = gen_random_uuid()$$, '42501', null, 'family id is immutable');
select throws_ok($$update app.families set settings = '[]' where name = 'test-Rossi'$$, '23514', null, 'settings is an object');
select throws_ok($$update app.families set time_zone = 'Mars/Olympus' where name = 'test-Rossi'$$, '22023', null, 'valid IANA time zone');
select lives_ok($$update app.families set time_zone = 'Europe/London' where name = 'test-Rossi'$$, 'time zone change');
select throws_ok($$delete from app.families where name = 'test-Rossi'$$, '42501', null, 'family deletion is not in milestone A');

-- Membership
select is(tests.affected($$update app.family_members set role = 'family_admin' where user_id = tests.uid('bruno')$$), 1::bigint, 'admin promotes a member');
select is(tests.affected($$update app.family_members set role = 'family_admin' where user_id = tests.uid('carla')$$), 0::bigint, 'Anna cannot change Bianchi roles');
select throws_ok($$update app.family_members set family_id = tests.family('Bianchi') where user_id = tests.uid('bruno')$$, '42501', null, 'a membership cannot move to another family');
reset role;
select tests.login('carla');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('bruno')$$), 0::bigint, 'Carla cannot remove Rossi members');
reset role;
select tests.login('bruno');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('anna') and family_id = tests.family('Bianchi')$$), 0::bigint, 'Bruno cannot touch Bianchi');
select is(tests.affected($$delete from app.family_members where user_id = tests.uid('bruno')$$), 1::bigint, 'Bruno leaves Rossi');
select is((select count(*) from app.families), 0::bigint, 'after leaving, Rossi is hidden');

-- Books, avoided ingredients and tried recipes: admins; exclusions: members
reset role;
select tests.login('anna');
select lives_ok($$delete from app.family_books where family_id = tests.family('Rossi')$$, 'admin manages books');
select throws_ok($$insert into app.family_ingredients (family_id, ingredient_id, restriction) values (tests.family('Bianchi'), tests.ingredient('salt'), 'avoid')$$, '42501', null, 'Anna is not a Bianchi admin');
select lives_ok($$insert into app.family_tried_recipes (family_id, recipe_id, source) values (tests.family('Rossi'), tests.recipe('old-minestrone'), 'import')$$, 'admin records a tried recipe');
select lives_ok($$insert into app.recipe_exclusions (family_id, recipe_id, created_by) values (tests.family('Bianchi'), tests.recipe('pasta-al-pomodoro'), tests.uid('anna'))$$, 'members manage exclusions');
select throws_ok($$insert into app.recipe_exclusions (family_id, recipe_id) values (tests.family('Verdi'), tests.recipe('pasta-al-pomodoro'))$$, '42501', null, 'not in another family');
select throws_ok($$update app.recipe_exclusions set reason = 'x'$$, '42501', null, 'exclusions are not edited');
reset role;
select tests.login('carla');
select throws_ok($$insert into app.family_tried_recipes (family_id, recipe_id, source) values (tests.family('Rossi'), tests.recipe('old-minestrone'), 'import')$$, '42501', null, 'tried recipes only in one''s family');

-- Revocation with the same token: removal from Bianchi applies at the next query
reset role;
select tests.login('anna');
select ok(app.is_member(tests.family('Bianchi')), 'Anna is a Bianchi member');
reset role;
delete from app.family_members where user_id = tests.uid('anna') and family_id = tests.family('Bianchi');
set local role authenticated;
select is((select array_agg(name order by name) from app.families), array['test-Rossi'], 'removal applies at once, same token');
select ok(not app.is_member(tests.family('Bianchi')), 'is_member follows the removal');
select throws_ok($$insert into app.recipe_exclusions (family_id, recipe_id) values (tests.family('Bianchi'), tests.recipe('old-minestrone'))$$, '42501', null, 'no more writes in Bianchi');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.family_ingredients (family_id, ingredient_id, restriction) values (tests.family('Verdi'), tests.ingredient('pasta'), 'limit')$$, '23514', null, 'limit needs weekly_max');
select throws_ok($$insert into app.family_members (family_id, user_id, role) values (tests.family('Verdi'), tests.uid('anna'), 'owner')$$, '23514', null, 'family role vocabulary');
select throws_ok($$insert into app.family_tried_recipes (family_id, recipe_id, source) values (tests.family('Verdi'), tests.recipe('pasta-al-pomodoro'), 'guess')$$, '23514', null, 'tried recipes come from the import');
delete from auth.users where id = tests.uid('carla');
select is((select count(*) from app.family_members where user_id is not distinct from tests.uid('carla')), 0::bigint, 'membership deleted with the user');
select is((select count(*) from app.family_members where family_id = tests.family('Bianchi')), 0::bigint, 'Bianchi has no members left');

select * from finish();
rollback;
