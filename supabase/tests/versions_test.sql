-- Counters with real, distinct transactions and rollbacks. Test data are committed
-- here and removed at the end.
\ir helpers/cleanup.psql
\ir helpers/setup.psql
begin;
\ir helpers/fixtures.psql
commit;
select no_plan();

-- One transaction, two changes: one bump
select tests.family_version('Rossi') as rossi, tests.family_version('Bianchi') as bianchi,
	tests.family_version('Verdi') as verdi, tests.catalogue_version() as catalogue \gset
begin;
select tests.login('bruno');
update app.meal_slots set servings = 5 where meal_type = 'lunch';
update app.meal_slots set servings = 6 where meal_type = 'lunch';
commit;
select is(tests.family_version('Rossi'), :rossi::bigint + 1, 'one transaction, one bump');
select is(tests.family_version('Verdi'), :verdi::bigint, 'Verdi unchanged');
select is(tests.family_version('Bianchi'), :bianchi::bigint, 'Bianchi unchanged');
select is(tests.catalogue_version(), :catalogue::bigint, 'catalogue unchanged');

-- Two transactions: two bumps
select tests.family_version('Rossi') as rossi \gset
begin;
select tests.login('bruno');
update app.meal_slots set servings = 7 where meal_type = 'lunch';
commit;
begin;
select tests.login('bruno');
update app.meal_slots set servings = 8 where meal_type = 'lunch';
commit;
select is(tests.family_version('Rossi'), :rossi::bigint + 2, 'two transactions, two bumps');

-- Rollback: no bump
select tests.family_version('Rossi') as rossi \gset
begin;
select tests.login('bruno');
update app.meal_slots set servings = 9 where meal_type = 'lunch';
rollback;
select is(tests.family_version('Rossi'), :rossi::bigint, 'rolled back, no bump');

-- A generated week of 14 meals: one bump
select tests.family_version('Verdi') as verdi \gset
begin;
select tests.become('app_job');
insert into app.weeks (family_id, starts_on) values (tests.family('Verdi'), '2026-10-19');
insert into app.meal_slots (week_id, date, meal_type, servings)
	select w.id, w.starts_on + d, m, 2
	from app.weeks w, generate_series(0, 6) d, unnest(array['lunch', 'dinner']) m
	where w.family_id = tests.family('Verdi') and w.starts_on = '2026-10-19';
commit;
select is(tests.family_version('Verdi'), :verdi::bigint + 1, 'one bump for 14 meals');

-- Ratings and names grow every family of the user; the locale is personal
select tests.family_version('Rossi') as rossi, tests.family_version('Bianchi') as bianchi,
	tests.family_version('Verdi') as verdi \gset
begin;
select tests.login('anna');
update app.ratings set stars = 4 where user_id = tests.uid('anna');
commit;
select is(tests.family_version('Rossi'), :rossi::bigint + 1, 'Anna''s rating: Rossi');
select is(tests.family_version('Bianchi'), :bianchi::bigint + 1, 'Anna''s rating: Bianchi');
select is(tests.family_version('Verdi'), :verdi::bigint, 'not Verdi');
begin;
select tests.login('franco');
update app.profiles set locale = 'it-IT' where user_id = tests.uid('franco');
commit;
select is(tests.family_version('Verdi'), :verdi::bigint, 'locale is personal: no bump');
begin;
select tests.login('franco');
update app.profiles set display_name = 'Frank' where user_id = tests.uid('franco');
commit;
select is(tests.family_version('Verdi'), :verdi::bigint + 1, 'a new name is shown to the family');

-- Drafts: invisible to families and catalogue, except the name of a cited draft
select tests.family_version('Rossi') as rossi, tests.family_version('Verdi') as verdi,
	tests.catalogue_version() as catalogue \gset
begin;
select tests.login('dario');
update app.recipe_drafts set content = '{"x": 1}', revision = 2 where recipe_id = tests.recipe('new-draft');
insert into app.recipe_draft_saves (draft_id, revision, content, channel)
	select id, 2, '{}', 'mcp' from app.recipe_drafts where recipe_id = tests.recipe('new-draft');
commit;
select is(tests.catalogue_version(), :catalogue::bigint, 'draft content does not touch the catalogue');
select is(tests.family_version('Rossi'), :rossi::bigint, 'nor the families');
begin;
select tests.login('dario');
update app.recipes set name = '{"it-IT": "Bozza rinominata"}' where id = tests.recipe('new-draft');
commit;
select is(tests.family_version('Rossi'), :rossi::bigint + 1, 'a cited draft renamed: the family citing it');
select is(tests.family_version('Verdi'), :verdi::bigint, 'not the others');
select is(tests.catalogue_version(), :catalogue::bigint, 'nor the catalogue');

-- Published content: one catalogue bump per transaction, families untouched
select tests.family_version('Rossi') as rossi, tests.catalogue_version() as catalogue \gset
begin;
select tests.login('dario');
update app.recipes set tags = '{quick}' where id = tests.recipe('pasta-al-pomodoro');
update app.ingredients set is_pantry = true where id = tests.ingredient('pasta');
commit;
select is(tests.catalogue_version(), :catalogue::bigint + 1, 'published changes: one bump');
select is(tests.family_version('Rossi'), :rossi::bigint, 'catalogue changes do not touch families');

-- Reading the counters; writing them is not possible
begin;
select tests.login('bruno');
select ok((select version from app.catalogue_state) = tests.catalogue_version(), 'catalogue counter is readable');
select throws_ok($$update app.catalogue_state set version = 0$$, '42501', null, 'catalogue counter is not writable');
select throws_ok(format($$select app.bump_family_version(%L)$$, tests.family('Rossi')), '42501', null, 'users cannot bump counters');
commit;

-- Rows that do not change what families see
select tests.family_version('Rossi') as rossi, tests.family_version('Bianchi') as bianchi \gset
insert into app.temporary_lists (family_id, items) values (tests.family('Rossi'), '[]');
insert into app.weekly_jobs (family_id, target_week) values (tests.family('Rossi'), '2026-10-19');
select is(tests.family_version('Rossi'), :rossi::bigint, 'temporary lists and jobs do not bump');

-- Shopping and membership do
update app.shopping_list_items set checked = true where shopping_list_id = tests.shopping_list('Rossi');
select is(tests.family_version('Rossi'), :rossi::bigint + 1, 'shopping bumps');
delete from app.family_members where user_id = tests.uid('carla');
select is(tests.family_version('Bianchi'), :bianchi::bigint + 1, 'membership bumps');

-- Deleting a family cascades through every trigger
select lives_ok($$delete from app.families where name = 'test-Verdi'$$, 'family deletion with every trigger');

select * from finish();

\ir helpers/cleanup.psql
drop schema tests cascade;
revoke usage on schema extensions from app_job;
