begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Counts limited to the test data: the seed and local data do not matter.
reset role;
select tests.become('app_job');
select is((select count(*) from app.families where name like 'test-%'), 3::bigint, 'job reads every family');
select is((select count(*) from app.family_members m join app.families f on f.id = m.family_id where f.name like 'test-%'), 5::bigint, 'and their members');
select is((select count(*) from app.family_books where family_id = tests.family('Rossi')), 1::bigint, 'books');
select is((select count(*) from app.family_ingredients where family_id = tests.family('Rossi')), 1::bigint, 'avoided ingredients');
select is((select count(*) from app.recipe_exclusions where family_id = tests.family('Verdi')), 1::bigint, 'exclusions');
select is((select count(*) from app.family_tried_recipes where family_id = tests.family('Rossi')), 1::bigint, 'tried recipes');
select is((select count(*) from app.weeks w join app.families f on f.id = w.family_id where f.name like 'test-%'), 2::bigint, 'weeks');
select is((select count(*) from app.meal_slots where week_id in (tests.week('Rossi'), tests.week('Verdi'))), 3::bigint, 'meals, as planner history');
select is((select count(*) from app.ratings where recipe_id = tests.recipe('pasta-al-pomodoro')), 4::bigint, 'ratings');
select is((select count(*) from app.recipes where slug like 'test-%'), 2::bigint, 'published and archived recipes, no drafts');
select is((select count(*) from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro')), 3::bigint, 'recipe ingredients');
select is((select count(*) from app.ingredients where slug like 'test-%'), 3::bigint, 'ingredients');
select ok((select count(*) from app.family_scores where family_id = tests.family('Rossi')) > 0, 'family scores');

select throws_ok($$select * from app.profiles$$, '42501', null, 'no profiles');
select throws_ok($$select * from app.user_roles$$, '42501', null, 'no global roles');
select throws_ok($$select * from app.recipe_drafts$$, '42501', null, 'no drafts');
select throws_ok($$select * from app.meal_changes$$, '42501', null, 'no change log');
select throws_ok($$select * from app.shopping_lists$$, '42501', null, 'no shopping');
select throws_ok($$select * from app.temporary_lists$$, '42501', null, 'no temporary lists');
select throws_ok(format($$select app.week_family_id(%L)$$, tests.week('Rossi')), '42501', null, 'no internal resolvers');
select throws_ok(format($$select app.is_member(%L)$$, tests.family('Rossi')), '42501', null, 'no user authorisation functions');

select lives_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Bianchi'), '2026-10-19')
	on conflict do nothing$$, 'dispatcher is idempotent');
select lives_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Bianchi'), '2026-10-19')
	on conflict do nothing$$, 'twice');
select is(tests.affected($$update app.weekly_jobs set status = 'done', attempts = attempts + 1 where family_id = tests.family('Bianchi')$$), 1::bigint, 'job updates its rows');
select throws_ok($$update app.weekly_jobs set family_id = gen_random_uuid()$$, '42501', null, 'a job keeps its family');
select lives_ok($$insert into app.weeks (family_id, starts_on, generated_at) values (tests.family('Bianchi'), '2026-10-19', now())$$, 'job creates a week');
select lives_ok($$insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
	select id, '2026-10-19', 'lunch', tests.recipe('pasta-al-pomodoro'), 2 from app.weeks where family_id = tests.family('Bianchi')$$, 'and its meals');
select is(tests.affected(format($$update app.meal_slots set servings = 3 where week_id = %L and meal_type = 'lunch'$$, tests.week('Verdi'))), 1::bigint, 'job changes meal contents');
select throws_ok(format($$update app.meal_slots set week_id = %L$$, tests.week('Rossi')), '42501', null, 'job does not move meals');
select throws_ok($$update app.weeks set starts_on = '2026-10-26'$$, '42501', null, 'job does not move weeks');
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Bianchi'), '2026-10-19')$$, '23505', null, 'concurrent runs cannot duplicate a week');
select throws_ok(format($$insert into app.meal_slots (week_id, date, meal_type, servings) values (%L, '2026-11-30', 'lunch', 2)$$, tests.week('Verdi')),
	'23514', null, 'the job keeps the date check on every family');
select lives_ok(format($$insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings) values (%L, '2026-10-13', 'lunch', %L, 2)$$, tests.week('Verdi'), tests.recipe('new-draft')),
	'the import path links a draft to a meal');
select throws_ok($$update app.families set settings = '{}'$$, '42501', null, 'job does not change families');
select throws_ok($$delete from app.weeks$$, '42501', null, 'job does not delete weeks');

reset role;
select tests.login('anna');
select throws_ok($$select * from app.weekly_jobs$$, '42501', null, 'users do not see the jobs');

reset role;
select throws_ok($$insert into app.weekly_jobs (family_id, target_week, status) values (tests.family('Rossi'), '2026-10-19', 'lost')$$, '23514', null, 'status vocabulary');
select throws_ok($$insert into app.weekly_jobs (family_id, target_week) values (tests.family('Rossi'), '2026-10-20')$$, '23514', null, 'target is a Monday');

select * from finish();
rollback;
