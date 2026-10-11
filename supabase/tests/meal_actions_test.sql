begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Truthful content of a slot, as the server writes it in meal_changes.
create function tests.content(p_slot uuid) returns jsonb language sql as $$
	select jsonb_build_object('recipeId', recipe_id, 'freeText', free_text, 'servings', servings, 'note', note)
	from app.meal_slots where id = p_slot
$$;
grant execute on function tests.content(uuid) to authenticated;

-- Two more drafts (owner): B cited by a new Rossi slot, C cited by nobody; V cited only by
-- Verdi and discarded (another family's closed draft).
insert into app.recipes (slug, name) values ('test-draft-b', '{"it-IT": "Bozza B", "en-GB": null}'), ('test-draft-c', '{"it-IT": "Bozza C", "en-GB": null}');
insert into app.recipe_drafts (recipe_id, kind, content, revision, created_by, updated_by)
	select id, 'new', '{}', 1, tests.uid('anna'), tests.uid('anna') from app.recipes where slug in ('test-draft-b', 'test-draft-c');
insert into app.meal_slots (id, week_id, date, meal_type, recipe_id, servings)
	values ('c0c0c0c0-0000-4000-8000-0000000000b0', tests.week('Rossi'), '2026-10-13', 'lunch', tests.recipe('draft-b'), 2);
insert into app.recipes (slug, name) values ('test-draft-v', '{"it-IT": "Bozza V", "en-GB": null}');
insert into app.recipe_drafts (recipe_id, kind, content, revision, closed_at, outcome)
	values (tests.recipe('draft-v'), 'new', '{}', 1, now(), 'discarded');
update app.meal_slots set recipe_id = tests.recipe('draft-v'), free_text = null where id = 'c0c0c0c0-0000-4000-8000-000000000003';

\set lunch '''c0c0c0c0-0000-4000-8000-000000000001'''
\set dinner '''c0c0c0c0-0000-4000-8000-000000000002'''
\set slotb '''c0c0c0c0-0000-4000-8000-0000000000b0'''
\set verdi '''c0c0c0c0-0000-4000-8000-000000000003'''

-- A swap where the slot holding the draft is updated FIRST: rule (b).
reset role;
select tests.login('anna');
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000001', %L, tests.uid('anna'), 'web', 'swap', array[%L, %L]::uuid[])$$,
	tests.week('Rossi'), :dinner, :lunch), 'member records an action on two slots of the week');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%L, tests.uid('anna'), 'web', tests.content(%L), tests.content(%L), 'e0000000-0000-4000-8000-000000000001'),
	       (%L, tests.uid('anna'), 'web', tests.content(%L), tests.content(%L), 'e0000000-0000-4000-8000-000000000001')$$,
	:dinner, :dinner, :lunch, :lunch, :lunch, :dinner), 'truthful rows of the swap, before any update');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000001',
	updated_by = tests.uid('anna'), updated_at = clock_timestamp() where id = %L$$, tests.recipe('pasta-al-pomodoro'), :dinner)),
	1::bigint, 'the draft slot takes the pasta first: its last citation goes away');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000001',
	updated_by = tests.uid('anna'), updated_at = clock_timestamp() where id = %L$$, tests.recipe('new-draft'), :lunch)),
	1::bigint, 'rule (b): the draft moves within the same action');

-- Undo of the swap, both slots: rule (c) brings the draft back to the dinner.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
	values ('e0000000-0000-4000-8000-000000000002', %L, tests.uid('anna'), 'web', 'undo', array[%L, %L]::uuid[], 'e0000000-0000-4000-8000-000000000001')$$,
	tests.week('Rossi'), :lunch, :dinner), 'undo action');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
	select c.meal_slot_id, tests.uid('anna'), 'web', tests.content(c.meal_slot_id), c.before, c.id, 'e0000000-0000-4000-8000-000000000002'
	from app.meal_changes c where c.action_id = 'e0000000-0000-4000-8000-000000000001'$$, 'undo rows point to the undone rows');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000002'
	where id = %L$$, tests.recipe('pasta-al-pomodoro'), :lunch)), 1::bigint, 'lunch back to the pasta');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000002'
	where id = %L$$, tests.recipe('new-draft'), :dinner)), 1::bigint, 'rule (c): dinner back to the draft');

-- Two drafts swapping (dinner: new-draft, slot B: draft-b), the dinner updated first.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000005', %L, tests.uid('anna'), 'web', 'swap', array[%L, %L]::uuid[])$$,
	tests.week('Rossi'), :dinner, :slotb), 'swap of two drafts');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%L, tests.uid('anna'), 'web', tests.content(%L), tests.content(%L), 'e0000000-0000-4000-8000-000000000005'),
	       (%L, tests.uid('anna'), 'web', tests.content(%L), tests.content(%L), 'e0000000-0000-4000-8000-000000000005')$$,
	:dinner, :dinner, :slotb, :slotb, :slotb, :dinner), 'rows of the two-draft swap');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000005' where id = %L$$,
	tests.recipe('draft-b'), :dinner)), 1::bigint, 'draft B reaches the dinner');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000005' where id = %L$$,
	tests.recipe('new-draft'), :slotb)), 1::bigint, 'the first draft reaches slot B');

-- Free meal on the last citation of draft B, then undo: rule (c); refused once the draft is closed.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000003', %L, tests.uid('anna'), 'web', 'set_free', array[%L]::uuid[])$$, tests.week('Rossi'), :dinner), 'set_free action');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%L, tests.uid('anna'), 'web', tests.content(%L), tests.content(%L) || '{"recipeId": null, "freeText": "Fuori"}', 'e0000000-0000-4000-8000-000000000003')$$,
	:dinner, :dinner, :dinner), 'set_free row');
select is(tests.affected(format($$update app.meal_slots set recipe_id = null, free_text = 'Fuori', last_action_id = 'e0000000-0000-4000-8000-000000000003'
	where id = %L$$, :dinner)), 1::bigint, 'the last citation of draft B goes away');
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
	values ('e0000000-0000-4000-8000-000000000004', %L, tests.uid('anna'), 'web', 'undo', array[%L]::uuid[], 'e0000000-0000-4000-8000-000000000003')$$,
	tests.week('Rossi'), :dinner), 'undo of the free meal');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
	select %L, tests.uid('anna'), 'web', tests.content(%L), c.before, c.id, 'e0000000-0000-4000-8000-000000000004'
	from app.meal_changes c where c.action_id = 'e0000000-0000-4000-8000-000000000003'$$, :dinner, :dinner), 'undo row');
select is(app.meal_action_restores_closed_draft('e0000000-0000-4000-8000-000000000003'), false, 'undoing the free meal brings back an open draft');
select is((select provolatile from pg_proc where oid = 'app.meal_action_restores_closed_draft(uuid)'::regprocedure), 'v'::"char",
	'volatile: it locks the recipes it would bring back, then checks with a new snapshot');
savepoint closed;
reset role;
select is(tests.affected($$update app.recipe_drafts set closed_at = now(), outcome = 'discarded'
	where recipe_id = tests.recipe('draft-b') and closed_at is null$$), 1::bigint, 'draft B is discarded');
select tests.login('anna');
select is(app.meal_action_restores_closed_draft('e0000000-0000-4000-8000-000000000003'), true,
	'Anna learns the draft is closed, although she no longer sees the recipe');
select throws_ok(format($$update app.meal_slots set recipe_id = %L, free_text = null, last_action_id = 'e0000000-0000-4000-8000-000000000004'
	where id = %L$$, tests.recipe('draft-b'), :dinner), '42501', null, 'a closed draft does not come back');
reset role;
select tests.login('franco');
select is(app.meal_action_restores_closed_draft('e0000000-0000-4000-8000-000000000003'), false, 'Franco learns nothing about a Rossi action');
rollback to savepoint closed;
reset role;
select tests.login('anna');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, free_text = null, last_action_id = 'e0000000-0000-4000-8000-000000000004'
	where id = %L$$, tests.recipe('draft-b'), :dinner)), 1::bigint, 'an open draft comes back with the undo');

-- Without evidence, an uncited draft is still refused, whatever the action.
select throws_ok(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000004' where id = %L$$,
	tests.recipe('draft-c'), :dinner), '42501', null, 'an uncited draft never reaches a meal');

-- The change log cannot lie, and actions cannot point elsewhere.
select throws_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%L, tests.uid('anna'), 'web', '{"recipeId": null, "freeText": null, "servings": 9, "note": null}', '{}', 'e0000000-0000-4000-8000-000000000001')$$, :lunch),
	'42501', null, 'a before that is not the slot''s content is refused');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000003' where id = %L$$, :lunch),
	'42501', null, 'last_action_id of an action that did not change the slot');
select throws_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values (gen_random_uuid(), %L, tests.uid('anna'), 'web', 'set_note', array[%L]::uuid[])$$, tests.week('Rossi'), :verdi),
	'42501', null, 'an action with a slot of another family');
select throws_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values (gen_random_uuid(), %L, tests.uid('bruno'), 'web', 'set_note', array[%L]::uuid[])$$, tests.week('Rossi'), :lunch),
	'42501', null, 'only as oneself');
select throws_ok($$update app.meal_actions set kind = 'swap'$$, '42501', null, 'actions are never changed');
select throws_ok($$delete from app.meal_actions$$, '42501', null, 'actions are never deleted');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000001', tests.uid('anna'), 'web', '{}', '{}')$$, 'rows without an action stay as before (no evidence)');
-- A forged citation of another family's closed draft, in a row without an action, proves nothing.
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000001', tests.uid('anna'), 'web', jsonb_build_object('recipeId', %L), '{}')$$,
	tests.recipe('draft-v')), 'a forged before without an action is accepted as before');
select is(app.meal_action_restores_closed_draft('e0000000-0000-4000-8000-000000000001'), false,
	'the function reads only the rows of the action: the forged row reveals nothing');
select throws_ok(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000001' where id = %L$$,
	tests.recipe('draft-v'), :lunch), '42501', null, 'and links nothing');

-- Another member cannot use Anna's action; another family cannot see or use it.
reset role;
select tests.login('bruno');
select is((select count(*) from app.meal_actions), 5::bigint, 'Bruno reads the family''s actions');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000001' where id = %L$$, :lunch),
	'42501', null, 'Bruno cannot claim Anna''s action');
reset role;
select tests.login('franco');
select is((select count(*) from app.meal_actions), 0::bigint, 'Franco sees no Rossi actions');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000001' where id = %L$$, :verdi),
	'42501', null, 'an action of another week is refused (the trigger, before the foreign key)');

select * from finish();
rollback;
