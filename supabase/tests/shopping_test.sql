begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.login('bruno');
select is((select count(*) from app.shopping_lists), 1::bigint, 'Rossi list');
select is((select count(*) from app.shopping_list_checks), 1::bigint, 'Rossi checks');
select is((select count(*) from app.shopping_list_items), 1::bigint, 'Rossi items');
select is((select count(*) from app.temporary_lists), 2::bigint, 'Rossi temporary lists');
select ok(app.can_access_list(tests.shopping_list('Rossi')), 'own list');
select ok(not app.can_access_list(gen_random_uuid()), 'missing list');
select throws_ok(format($$select app.list_family_id(%L)$$, tests.shopping_list('Rossi')), '42501', null, 'the family of a list is not disclosed');
select lives_ok($$insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check, checked_by)
	values (tests.shopping_list('Rossi'), tests.ingredient('tomatoes'), '', '{"mass_g": 600}', tests.uid('bruno'))
	on conflict (shopping_list_id, ingredient_id, variety_key) do update set quantity_at_check = excluded.quantity_at_check, checked_by = excluded.checked_by$$,
	'setChecked is an upsert');
select is((select quantity_at_check from app.shopping_list_checks), '{"mass_g": 600}'::jsonb, 'last save wins');
select throws_ok($$update app.shopping_list_checks set quantity_at_check = '600'$$, '23514', null, 'canonical quantity is an object');
select throws_ok($$update app.shopping_list_checks set ingredient_id = tests.ingredient('pasta')$$, '42501', null, 'a check keeps its item');
select lives_ok($$insert into app.shopping_list_added_back (shopping_list_id, ingredient_id, variety_key, added_by)
	values (tests.shopping_list('Rossi'), tests.ingredient('salt'), '', tests.uid('bruno'))$$, 'put an excluded ingredient back');
select lives_ok($$insert into app.shopping_list_items (id, shopping_list_id, text, created_by)
	values ('5b0c4f3e-1111-4c4b-9b67-2f6c0c8a0002', tests.shopping_list('Rossi'), 'Latte', tests.uid('bruno')) on conflict (id) do nothing$$, 'free item with client id');
select lives_ok($$insert into app.shopping_list_items (id, shopping_list_id, text, created_by)
	values ('5b0c4f3e-1111-4c4b-9b67-2f6c0c8a0002', tests.shopping_list('Rossi'), 'Latte', tests.uid('bruno')) on conflict (id) do nothing$$, 'replayed from the offline queue');
select is((select count(*) from app.shopping_list_items), 2::bigint, 'no duplicate item');
select throws_ok($$insert into app.shopping_list_items (shopping_list_id, text) values (tests.shopping_list('Rossi'), '  ')$$, '23514', null, 'item text not blank');
select throws_ok($$update app.shopping_list_items set shopping_list_id = gen_random_uuid()$$, '42501', null, 'an item keeps its list');
select throws_ok($$update app.shopping_lists set week_id = gen_random_uuid()$$, '42501', null, 'a list keeps its week');

reset role;
select tests.login('franco');
select is((select count(*) from app.shopping_lists), 0::bigint, 'Franco sees no Rossi list');
select is((select count(*) from app.shopping_list_checks), 0::bigint, 'nor its checks');
select is((select count(*) from app.temporary_lists), 0::bigint, 'nor its temporary lists');
select ok(not app.can_access_list(tests.shopping_list('Rossi')), 'other family''s list');
select is(tests.affected($$update app.shopping_list_items set checked = true$$), 0::bigint, 'cannot tick Rossi items');
select throws_ok(format($$insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check) values (%L, %L, '', '{}')$$,
	tests.shopping_list('Rossi'), tests.ingredient('pasta')), '42501', null, 'cannot check items of another family');
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Verdi'), tests.week('Rossi')), '23503', null, 'a list cannot point to a week of another family');
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Rossi'), tests.week('Rossi')), '42501', null, 'cannot create lists for another family');

-- Bring!: the public page reads one list by token, nothing else
reset role;
select tests.become('anon');
select is(app.temporary_list_by_token('test-valid-token'), '["400 g Pomodori"]'::jsonb, 'valid token');
select is(app.temporary_list_by_token('test-expired-token'), null::jsonb, 'expired token');
select is(app.temporary_list_by_token('unknown'), null::jsonb, 'unknown token');
select throws_ok($$select * from app.temporary_lists$$, '42501', null, 'anon cannot read the table');
select throws_ok($$select * from app.recipes$$, '42501', null, 'anon cannot read the catalogue');
select throws_ok($$select app.can_access_list(gen_random_uuid())$$, '42501', null, 'anon cannot call can_access_list');

-- Integrity, as owner
reset role;
select throws_ok(format($$insert into app.shopping_lists (family_id, week_id) values (%L, %L)$$,
	tests.family('Rossi'), tests.week('Rossi')), '23505', null, 'one list per week');
insert into app.temporary_lists (family_id, items) values (tests.family('Rossi'), '["x"]');
select is((select length(token) from app.temporary_lists where items = '["x"]'), 48, 'random token by default');

select * from finish();
rollback;
