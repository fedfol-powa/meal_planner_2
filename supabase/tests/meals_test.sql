begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Visibility
reset role;
select tests.login('bruno');
select is((select count(*) from app.weeks), 1::bigint, 'Bruno sees the Rossi week');
select is((select count(*) from app.meal_slots), 2::bigint, 'Bruno sees the Rossi meals');
select is((select count(*) from app.meal_changes), 1::bigint, 'Bruno sees the Rossi change log');
select is((select count(*) from app.recipes where slug like 'test-%'), 3::bigint, 'the draft cited by a Rossi meal is visible');
select is((select name ->> 'it-IT' from app.recipes where id = tests.recipe('new-draft')), 'Bozza nuova', 'its name is readable');
reset role;
select tests.login('franco');
select is((select count(*) from app.meal_slots), 1::bigint, 'Franco sees the Verdi meal');
select is((select count(*) from app.meal_changes), 0::bigint, 'Franco sees no Rossi changes');
select is((select count(*) from app.recipes where slug like 'test-%'), 2::bigint, 'the draft cited by Rossi stays hidden from Verdi');
reset role;
select tests.login('carla');
select is((select count(*) from app.weeks), 0::bigint, 'Bianchi has no week');
select is((select count(*) from app.recipes where slug like 'test-%'), 2::bigint, 'and no cited draft');
reset role;
select tests.login('elena');
select is((select count(*) from app.weeks), 0::bigint, 'app admin sees no week');

-- Authorisation functions: own, other, missing
reset role;
select tests.login('bruno');
select ok(app.can_access_week(tests.week('Rossi')), 'own week');
select ok(not app.can_access_week(tests.week('Verdi')), 'other family''s week');
select ok(not app.can_access_week(gen_random_uuid()), 'missing week');
select ok(app.can_access_slot('c0c0c0c0-0000-4000-8000-000000000001'), 'own slot');
select ok(not app.can_access_slot('c0c0c0c0-0000-4000-8000-000000000003'), 'other family''s slot');
select ok(not app.can_access_slot(gen_random_uuid()), 'missing slot');
select throws_ok(format($$select app.week_family_id(%L)$$, tests.week('Verdi')), '42501', null, 'the family of a week is not disclosed');
select throws_ok(format($$select app.slot_family_id(%L)$$, gen_random_uuid()), '42501', null, 'nor the family of a slot');
reset role;
select tests.become('anon');
select throws_ok($$select app.can_access_week(gen_random_uuid())$$, '42501', null, 'anon cannot call can_access_week');

-- Writing meals
reset role;
select tests.login('bruno');
select lives_ok($$insert into app.meal_slots (week_id, date, meal_type, free_text, servings)
	values (tests.week('Rossi'), '2026-10-13', 'lunch', 'Avanzi', 2)$$, 'member adds a meal');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings)
	values (tests.week('Verdi'), '2026-10-13', 'lunch', 2)$$, '42501', null, 'not in another family');
select is(tests.affected($$update app.meal_slots set servings = 4 where id = 'c0c0c0c0-0000-4000-8000-000000000003'$$), 0::bigint, 'cannot change Verdi meals');
select is(tests.affected($$update app.meal_slots set servings = 3, updated_by = tests.uid('bruno') where id = 'c0c0c0c0-0000-4000-8000-000000000002'$$), 1::bigint, 'member changes a Rossi meal');
select throws_ok($$delete from app.meal_slots$$, '42501', null, 'meals are changed, not deleted');

-- The date check reads no week the user cannot access: a date outside the week is
-- refused in one's own week; in another family's week and in a missing one the
-- refusal is the same, and tells nothing about that week
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings)
	values (tests.week('Rossi'), '2026-11-30', 'lunch', 2)$$, '23514', null, 'own week: date outside the week');
select is(
	tests.error_of(format($$insert into app.meal_slots (week_id, date, meal_type, servings) values (%L, '2026-11-30', 'lunch', 2)$$, tests.week('Verdi'))),
	tests.error_of(format($$insert into app.meal_slots (week_id, date, meal_type, servings) values (%L, '2026-11-30', 'lunch', 2)$$, gen_random_uuid())),
	'another family''s week and a missing week give the same refusal');
select matches(
	tests.error_of(format($$insert into app.meal_slots (week_id, date, meal_type, servings) values (%L, '2026-11-30', 'lunch', 2)$$, tests.week('Verdi'))),
	'^42501: ', 'the refusal is the row-level security one');

-- Identity of weeks and slots is immutable: Anna, in Rossi and Bianchi, cannot move a
-- meal or a week from one of her families to the other
reset role;
insert into app.weeks (id, family_id, starts_on) values ('b1b1b1b1-0000-4000-8000-000000000001', tests.family('Bianchi'), '2026-10-12');
select tests.login('anna');
select ok(app.can_access_week('b1b1b1b1-0000-4000-8000-000000000001'), 'Anna reaches the Bianchi week');
select throws_ok($$update app.meal_slots set week_id = 'b1b1b1b1-0000-4000-8000-000000000001' where id = 'c0c0c0c0-0000-4000-8000-000000000002'$$, '42501', null, 'a Rossi meal cannot move to a Bianchi week');
select throws_ok($$update app.meal_slots set date = '2026-10-14' where id = 'c0c0c0c0-0000-4000-8000-000000000002'$$, '42501', null, 'a meal keeps its date');
select throws_ok($$update app.meal_slots set meal_type = 'lunch' where id = 'c0c0c0c0-0000-4000-8000-000000000002'$$, '42501', null, 'a meal keeps its meal type');
select throws_ok(format($$update app.weeks set starts_on = '2026-10-19' where id = %L$$, tests.week('Rossi')), '42501', null, 'a week keeps its Monday');
select throws_ok(format($$update app.weeks set family_id = %L where id = %L$$, tests.family('Bianchi'), tests.week('Rossi')), '42501', null, 'a Rossi week cannot move to Bianchi');
reset role;
select is((select week_id from app.meal_slots where id = 'c0c0c0c0-0000-4000-8000-000000000002'), tests.week('Rossi'), 'the meal is still in Rossi');
select is((select family_id from app.weeks where id = tests.week('Rossi')), tests.family('Rossi'), 'the week is still of Rossi');
delete from app.weeks where id = 'b1b1b1b1-0000-4000-8000-000000000001';
select tests.login('anna');
select is(tests.affected($$update app.meal_slots set recipe_id = null, free_text = 'Pizza', note = 'swap' where id = 'c0c0c0c0-0000-4000-8000-000000000001'$$), 1::bigint, 'a swap updates the contents');

-- Change log
reset role;
select tests.login('bruno');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000002', tests.uid('bruno'), 'mcp', '{}', '{}')$$, 'member logs a change');
select throws_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000002', tests.uid('anna'), 'web', '{}', '{}')$$, '42501', null, 'only as oneself');
select throws_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000003', tests.uid('bruno'), 'web', '{}', '{}')$$, '42501', null, 'not on another family''s slot');
select throws_ok($$update app.meal_changes set after = '{"x": 1}'$$, '42501', null, 'change log is immutable');
select throws_ok($$delete from app.meal_changes$$, '42501', null, 'change log is never deleted');
select lives_ok($$insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after)
	values ('7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001', 'c0c0c0c0-0000-4000-8000-000000000002', tests.uid('bruno'), 'web', '{}', '{}')
	on conflict (id) do nothing$$, 'client id');
select lives_ok($$insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after)
	values ('7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001', 'c0c0c0c0-0000-4000-8000-000000000002', tests.uid('bruno'), 'web', '{}', '{}')
	on conflict (id) do nothing$$, 'repeating it is harmless');
select is((select count(*) from app.meal_changes where id = '7d1f6f39-6f0e-4c4b-9b67-2f6c0c8a0001'), 1::bigint, 'no duplicate');

-- Undo: only a change of the same slot
select lives_ok($$insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after, undoes)
	values ('a1a1a1a1-0000-4000-8000-000000000002', 'c0c0c0c0-0000-4000-8000-000000000001', tests.uid('bruno'), 'web', '{}', '{}',
		'a1a1a1a1-0000-4000-8000-000000000001')$$, 'undo on the same slot');
select throws_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes)
	values ('c0c0c0c0-0000-4000-8000-000000000002', tests.uid('bruno'), 'web', '{}', '{}', 'a1a1a1a1-0000-4000-8000-000000000001')$$,
	'23503', null, 'undo on another slot');
reset role;
select tests.login('franco');
select throws_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes)
	values ('c0c0c0c0-0000-4000-8000-000000000003', tests.uid('franco'), 'web', '{}', '{}', 'a1a1a1a1-0000-4000-8000-000000000001')$$,
	'23503', null, 'undo across families');

-- Ratings
reset role;
select tests.login('bruno');
select is((select count(*) from app.ratings), 2::bigint, 'Bruno sees Rossi ratings');
select throws_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('anna'), tests.recipe('old-minestrone'), 2)$$, '42501', null, 'not on behalf of others');
select throws_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('bruno'), tests.recipe('new-draft'), 2)$$, '42501', null, 'drafts cannot be rated');
select lives_ok($$insert into app.ratings (user_id, recipe_id, stars) values (tests.uid('bruno'), tests.recipe('old-minestrone'), 2)$$, 'archived recipes can be rated');
select is(tests.affected($$update app.ratings set stars = 4 where user_id = tests.uid('bruno') and recipe_id = tests.recipe('pasta-al-pomodoro')$$), 1::bigint, 'own rating');
select is(tests.affected($$update app.ratings set stars = 5 where user_id = tests.uid('anna')$$), 0::bigint, 'not Anna''s');
select throws_ok($$update app.ratings set recipe_id = tests.recipe('old-minestrone') where user_id = tests.uid('bruno')$$, '42501', null, 'a rating keeps its recipe');
select throws_ok($$update app.ratings set stars = 6 where user_id = tests.uid('bruno')$$, '23514', null, 'stars 1-5');
select is((select average from app.family_scores where family_id = tests.family('Rossi') and recipe_id = tests.recipe('pasta-al-pomodoro')), 4.50::numeric, 'family average (5 and 4)');
select is((select count(*) from app.family_scores where family_id <> tests.family('Rossi')), 0::bigint, 'no other family scores');
reset role;
select tests.login('anna');
select is((select count(*) from app.ratings), 4::bigint, 'Anna sees Rossi and Bianchi ratings');
reset role;
select tests.login('elena');
select is((select average from app.global_scores where recipe_id = tests.recipe('pasta-al-pomodoro')), 3.50::numeric, 'anonymous global average (5, 4, 4, 1)');

-- Revocation with the same token: after removal, Bruno's week is out of reach
reset role;
select tests.login('bruno');
select ok(app.can_access_week(tests.week('Rossi')), 'before removal');
select is((select name ->> 'it-IT' from app.recipes where id = tests.recipe('new-draft')), 'Bozza nuova', 'the cited draft before removal');
reset role;
delete from app.family_members where user_id = tests.uid('bruno');
set local role authenticated;
select ok(not app.can_access_week(tests.week('Rossi')), 'after removal, same token');
select is((select count(*) from app.meal_slots), 0::bigint, 'no meals after removal');
select is((select count(*) from app.recipes where id = tests.recipe('new-draft')), 0::bigint, 'the cited draft is hidden after removal');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Rossi'), '2026-10-13')$$, '23514', null, 'weeks start on Monday');
select throws_ok($$insert into app.weeks (family_id, starts_on) values (tests.family('Rossi'), '2026-10-12')$$, '23505', null, 'one week per family and Monday');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings) values (tests.week('Rossi'), '2026-10-19', 'lunch', 2)$$, '23514', null, 'date inside the week');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, servings) values (tests.week('Rossi'), '2026-10-12', 'lunch', 2)$$, '23505', null, 'one slot per date and meal');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings) values (tests.week('Rossi'), '2026-10-14', 'lunch', tests.recipe('pasta-al-pomodoro'), 'Pizza', 2)$$, '23514', null, 'recipe or free text, not both');
select throws_ok($$insert into app.meal_slots (week_id, date, meal_type, note, servings) values (tests.week('Rossi'), '2026-10-14', 'dinner', repeat('x', 201), 2)$$, '23514', null, 'note up to 200 characters');
select throws_ok($$delete from app.recipes where slug = 'test-new-draft'$$, '23503', null, 'a cited recipe cannot disappear');

-- R1: passed instant and version shown
select is(app.meal_passed_at('2026-10-12', 'lunch', 'Europe/Rome'), '2026-10-12 13:30:00+00'::timestamptz, 'lunch passes at 15:30 Rome');
select is(app.meal_passed_at('2026-10-12', 'dinner', 'Europe/Rome'), '2026-10-12 21:00:00+00'::timestamptz, 'dinner passes at 23:00 Rome');
select is(app.meal_passed_at('2026-10-25', 'lunch', 'Europe/Rome'), '2026-10-25 14:30:00+00'::timestamptz, 'day summer time ends');
select is(app.meal_passed_at('2026-03-29', 'lunch', 'Europe/Rome'), '2026-03-29 13:30:00+00'::timestamptz, 'day summer time starts');
select is(app.meal_passed_at('2026-10-12', 'dinner', 'Europe/London'), '2026-10-12 22:00:00+00'::timestamptz, 'another time zone');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-10-05 12:00+02'), 1, 'version in force then');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-10-11 12:00+02'), 2, 'current version');
select is(app.recipe_version_at(tests.recipe('pasta-al-pomodoro'), '2026-09-01 12:00+02'), 1, 'before the first publication: the first version');
select is(app.recipe_version_at(tests.recipe('new-draft'), '2026-10-11 12:00+02'), null::integer, 'never published: no version');

-- Deletions: users leave the log as "former member"; families go with their log
delete from auth.users where id = tests.uid('anna');
select is((select count(*) from app.meal_changes where actor_id is null), 1::bigint, 'change kept, actor cleared');
select is((select count(*) from app.meal_changes where undoes = 'a1a1a1a1-0000-4000-8000-000000000001'), 1::bigint, 'the undo chain exists');
select lives_ok($$delete from app.families where name = 'test-Rossi'$$, 'a family with undo chains can be deleted');
select is((select count(*) from app.meal_changes where id::text like 'a1a1a1a1-%'), 0::bigint, 'the chain went with the family');

select * from finish();
rollback;
