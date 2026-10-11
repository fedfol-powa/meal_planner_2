begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Reading: Elena (app admin, no family, not a curator) sees the published catalogue only
reset role;
select tests.login('elena');
select is((select count(*) from app.recipes where slug like 'test-%'), 2::bigint, 'published and archived recipes, no drafts');
select is((select count(*) from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro')), 3::bigint, 'recipe ingredients');
select is((select count(*) from app.ingredients where slug like 'test-%'), 3::bigint, 'ingredients');
select is((select count(*) from app.books where slug like 'test-%'), 1::bigint, 'books');
select is((select count(*) from app.recipe_versions where recipe_id = tests.recipe('pasta-al-pomodoro')), 2::bigint, 'published versions');
select is((select count(*) from app.recipe_drafts), 0::bigint, 'no drafts');
select is((select count(*) from app.recipe_draft_saves), 0::bigint, 'no draft saves');
select is((select count(*) from app.recipe_status_changes), 0::bigint, 'no status history');
select is((select count(*) from app.ingredient_versions), 0::bigint, 'no ingredient history');

-- Writing: refused to non-curators
select throws_ok($$insert into app.recipes (slug) values ('test-sneaky')$$, '42501', null, 'non-curator cannot create recipes');
select is(tests.affected($$update app.recipes set tags = '{x}' where slug = 'test-pasta-al-pomodoro'$$), 0::bigint, 'non-curator cannot edit recipes');
select is(tests.affected($$delete from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro')$$), 0::bigint, 'non-curator cannot delete projections');
select throws_ok($$insert into app.ingredients (slug, name, department) values ('test-x', '{}', 'other')$$, '42501', null, 'non-curator cannot create ingredients');
select throws_ok($$insert into app.recipe_versions (recipe_id, version, content, channel) values (tests.recipe('pasta-al-pomodoro'), 3, '{}', 'web')$$, '42501', null, 'non-curator cannot publish');

-- Curator
reset role;
select tests.login('dario');
select is((select count(*) from app.recipes where slug like 'test-%'), 3::bigint, 'curator sees drafts');
select is((select count(*) from app.recipe_drafts where recipe_id = tests.recipe('new-draft')), 1::bigint, 'curator sees the draft');
select is((select count(*) from app.recipe_draft_saves s join app.recipe_drafts d on d.id = s.draft_id where d.recipe_id = tests.recipe('new-draft')), 1::bigint, 'curator sees draft history');
select lives_ok($$insert into app.recipes (slug, name) values ('test-another-draft', '{"it-IT": "Altra"}')$$, 'curator creates a draft recipe');
select is(tests.affected($$update app.recipes set tags = '{quick}' where slug = 'test-pasta-al-pomodoro'$$), 1::bigint, 'curator edits any recipe');
select throws_ok($$update app.recipes set created_by = null where slug = 'test-pasta-al-pomodoro'$$, '42501', null, 'creation data is immutable');
select throws_ok($$delete from app.recipes where slug = 'test-another-draft'$$, '42501', null, 'recipes are never deleted, not even drafts');
select throws_ok($$delete from app.ingredients where slug = 'test-tomatoes'$$, '42501', null, 'ingredients are archived, not deleted');
select throws_ok($$delete from app.books where slug = 'test-cucchiaio'$$, '42501', null, 'books are archived, not deleted');
select is(tests.affected($$update app.ingredients set archived_at = now(), archived_by = tests.uid('dario') where slug = 'test-tomatoes'$$), 1::bigint, 'curator archives an ingredient');
select is(tests.affected($$update app.books set archived_at = now() where slug = 'test-cucchiaio'$$), 1::bigint, 'curator archives a book');
select is(tests.affected($$delete from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro') and position = 1$$), 1::bigint, 'projection lines are rewritten');

-- Draft lifecycle: no physical deletion, closing keeps the history
select is(tests.affected($$update app.recipe_drafts set closed_at = now(), closed_by = tests.uid('dario'), outcome = 'discarded' where recipe_id = tests.recipe('new-draft')$$), 1::bigint, 'discarding closes the draft');
select throws_ok($$update app.recipe_drafts set content = '{"x": 1}' where recipe_id = tests.recipe('new-draft')$$, '55000', null, 'a closed draft is immutable');
select throws_ok($$delete from app.recipe_drafts where recipe_id = tests.recipe('new-draft')$$, '42501', null, 'drafts are never deleted');
select throws_ok($$delete from app.recipe_draft_saves$$, '42501', null, 'draft saves are never deleted');
select is((select count(*) from app.recipe_draft_saves s join app.recipe_drafts d on d.id = s.draft_id where d.recipe_id = tests.recipe('new-draft')), 1::bigint, 'history kept after discarding');
select lives_ok($$insert into app.recipe_drafts (recipe_id, kind, content, revision, created_by, updated_by) values (tests.recipe('new-draft'), 'new', '{}', 1, tests.uid('dario'), tests.uid('dario'))$$, 'the same recipe gets a new draft');
select throws_ok($$insert into app.recipe_drafts (recipe_id, kind, content, revision) values (tests.recipe('new-draft'), 'new', '{}', 1)$$, '23505', null, 'one open draft per recipe');
select lives_ok($$insert into app.recipe_drafts (id, recipe_id, kind, base_version, content, revision) values ('b0b0b0b0-0000-4000-8000-000000000001', tests.recipe('pasta-al-pomodoro'), 'revision', 2, '{}', 1)$$, 'revision of a published recipe');
select lives_ok($$insert into app.recipe_versions (recipe_id, version, content, published_by, channel) values (tests.recipe('pasta-al-pomodoro'), 3, '{}', tests.uid('dario'), 'mcp')$$, 'curator publishes version 3');
select is(tests.affected($$update app.recipes set version = 3 where slug = 'test-pasta-al-pomodoro'$$), 1::bigint, 'current version moves');
select is(tests.affected($$update app.recipe_drafts set closed_at = now(), closed_by = tests.uid('dario'), outcome = 'published' where id = 'b0b0b0b0-0000-4000-8000-000000000001'$$), 1::bigint, 'publishing closes the draft');
select lives_ok($$insert into app.recipe_drafts (recipe_id, kind, base_version, content, revision) values (tests.recipe('pasta-al-pomodoro'), 'revision', 3, '{}', 1)$$, 'a later revision opens a new draft');
select throws_ok($$update app.recipe_drafts set closed_at = now() where recipe_id = tests.recipe('pasta-al-pomodoro') and closed_at is null$$, '23514', null, 'closing needs an outcome');

-- Append-only history
select throws_ok($$update app.recipe_versions set content = '{"x": 1}'$$, '42501', null, 'versions are immutable');
select throws_ok($$delete from app.recipe_versions$$, '42501', null, 'versions are never deleted');
select throws_ok($$update app.recipe_status_changes set status = 'archived'$$, '42501', null, 'status history is immutable');
select throws_ok($$delete from app.ingredient_versions$$, '42501', null, 'ingredient history is never deleted');
select throws_ok($$update app.recipe_draft_saves set content = '{}'$$, '42501', null, 'draft saves keep their content');
select is(tests.affected($$update app.recipe_draft_saves set overwritten = true where draft_id in (select id from app.recipe_drafts where recipe_id = tests.recipe('new-draft'))$$), 1::bigint, 'a save can be marked as overwritten');
select throws_ok($$update app.recipe_drafts set closed_by = null where recipe_id = tests.recipe('new-draft') and closed_at is not null$$, '55000', null, 'users cannot clear the authors of a closed draft');

-- Author names: two curators with no family in common see each other's name, only
-- through the function; nobody else does
reset role;
select tests.login('gina');
select lives_ok($$insert into app.recipe_draft_saves (draft_id, revision, content, saved_by, channel)
	select id, 2, '{}', tests.uid('gina'), 'web' from app.recipe_drafts where recipe_id = tests.recipe('new-draft') and closed_at is null$$, 'Gina saves Dario''s draft');
select is((select display_name from app.catalogue_author_names() where user_id = tests.uid('dario')), 'Dario', 'Gina reads the name of Dario');
select is((select count(*) from app.profiles where user_id = tests.uid('dario')), 0::bigint, 'but not his profile');
select is(pg_get_function_result('app.catalogue_author_names()'::regprocedure), 'TABLE(user_id uuid, display_name text)', 'only id and name');
reset role;
select tests.login('dario');
select is((select display_name from app.catalogue_author_names() where user_id = tests.uid('gina')), 'Gina', 'Dario reads the name of Gina');
select is((select count(*) from app.catalogue_author_names() where user_id = tests.uid('elena')), 0::bigint, 'people who wrote nothing are not listed');
reset role;
select tests.login('elena');
select is((select count(*) from app.catalogue_author_names()), 0::bigint, 'non-curators read no author');
reset role;
select tests.become('anon');
select throws_ok($$select * from app.catalogue_author_names()$$, '42501', null, 'anon cannot call it');
reset role;
select tests.become('app_job');
select throws_ok($$select * from app.catalogue_author_names()$$, '42501', null, 'the job does not need it');
reset role;
select tests.login('dario');

-- Revocation with the same token: the curator role is read at every query
reset role;
delete from app.user_roles where user_id = tests.uid('dario') and role = 'recipe_curator';
set local role authenticated;
select is((select count(*) from app.recipes where slug like 'test-%'), 2::bigint, 'after revocation only published and archived recipes');
select is((select count(*) from app.recipe_drafts), 0::bigint, 'after revocation no drafts');
select throws_ok($$insert into app.recipes (slug) values ('test-late')$$, '42501', null, 'after revocation no writes');
select is((select count(*) from app.catalogue_author_names()), 0::bigint, 'after revocation no author names');

-- Integrity, as owner
reset role;
select throws_ok($$insert into app.recipes (slug, status, version, name, description, source_type, duration_minutes, base_servings, carbohydrate_group, is_fresh_fish, has_vegetables, category, meal_type, is_heavy)
	values ('test-incomplete', 'published', 1, '{"it-IT": "X", "en-GB": "X"}', '{"it-IT": "X", "en-GB": "X"}', 'home', 10, 2, 'none', false, false, 'pan', 'lunch', false)$$,
	'23514', null, 'published recipe needs the planner attributes');
select throws_ok($$insert into app.recipes (slug, status, version) values ('test-bad-status', 'draft', 1)$$, '23514', null, 'draft means never published');
select throws_ok($$insert into app.recipes (slug, status, version) values ('test-bad-status-2', 'published', 0)$$, '23514', null, 'published means version > 0');
select throws_ok($$insert into app.recipes (slug, name) values ('test-fr', '{"fr-FR": "Pâtes"}')$$, '23514', null, 'only it-IT and en-GB');
select throws_ok($$insert into app.recipes (slug, seasons) values ('test-monsoon', '{monsoon}')$$, '23514', null, 'seasons vocabulary');
select throws_ok($$insert into app.recipes (slug, protein_group) values ('test-meat', 'meat')$$, '23514', null, 'protein vocabulary');
select throws_ok($$insert into app.recipes (slug, origin_type) values ('test-origin', 'casetta')$$, '23514', null, 'origin type vocabulary');
select throws_ok($$insert into app.recipes (slug) values ('Bad Slug')$$, '23514', null, 'slug format');
select throws_ok($$insert into app.books (slug, title) values ('test-cucchiaio', 'Copia')$$, '23505', null, 'book slug unique');
select throws_ok($$insert into app.ingredients (slug, name, department) values ('test-x', '{"it-IT": "X"}', 'garden')$$, '23514', null, 'departments of W4');
select throws_ok($$insert into app.recipe_drafts (recipe_id, kind, content, revision) values (tests.recipe('old-minestrone'), 'revision', '{}', 1)$$, '23514', null, 'a revision has a base version');
select throws_ok($$insert into app.recipe_drafts (recipe_id, kind, base_version, content, revision) values (tests.recipe('old-minestrone'), 'new', 1, '{}', 1)$$, '23514', null, 'a new draft has no base version');
select throws_ok($$delete from app.ingredients where slug = 'test-pasta'$$, '23503', null, 'an ingredient with history cannot disappear');

-- Ingredient lines
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, source_text, is_primary) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('salt'), 'grosso', 'to_taste', 'x', true)$$, '23505', null, 'one primary ingredient');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, quantity_kind, source_text) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('pasta'), 'to_taste', 'x')$$, '23505', null, 'same ingredient only with another variety');
select lives_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit, source_text) values (tests.recipe('pasta-al-pomodoro'), 9, tests.ingredient('pasta'), '{"it-IT": "Integrale", "en-GB": "Wholemeal"}', 'integrale', 'amount', 2, 'piece', 'Pasta integrale: 2')$$, 'same ingredient with a variety');
select throws_ok($$insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety_key, quantity_kind, source_text) values (tests.recipe('pasta-al-pomodoro'), 10, tests.ingredient('salt'), 'fino', 'to_taste', '  ')$$, '23514', null, 'source text required');

-- Quantity: the three allowed cases and every partial combination
select throws_ok($$select tests.insert_line('amount', 1, null, null)$$, '23514', null, 'amount without unit');
select throws_ok($$select tests.insert_line('amount', null, 'g', null)$$, '23514', null, 'amount without quantity');
select throws_ok($$select tests.insert_line('amount', 1, 'g', '{"it-IT": "un po''"}')$$, '23514', null, 'amount with text');
select throws_ok($$select tests.insert_line('to_taste', 1, null, null)$$, '23514', null, 'to taste with quantity');
select throws_ok($$select tests.insert_line('to_taste', null, 'g', null)$$, '23514', null, 'to taste with unit');
select throws_ok($$select tests.insert_line('to_taste', null, null, '{"it-IT": "un po''"}')$$, '23514', null, 'to taste with text');
select throws_ok($$select tests.insert_line('text', null, null, null)$$, '23514', null, 'text without text');
select throws_ok($$select tests.insert_line('text', 1, null, '{"it-IT": "un po''"}')$$, '23514', null, 'text with quantity');
select throws_ok($$select tests.insert_line('text', null, 'g', '{"it-IT": "un po''"}')$$, '23514', null, 'text with unit');
select lives_ok($$select tests.insert_line('amount', 1, 'g', null)$$, 'amount');
delete from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro') and position = 20;
select lives_ok($$select tests.insert_line('to_taste', null, null, null)$$, 'to taste');
delete from app.recipe_ingredients where recipe_id = tests.recipe('pasta-al-pomodoro') and position = 20;
select lives_ok($$select tests.insert_line('text', null, null, '{"it-IT": "un po''", "en-GB": "a little"}')$$, 'text');

-- Equivalences: one per ingredient, scope, dimension and preparation (or none)
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping')$$, '23502', null, 'source required');
select is(app.unit_dimension('kg'), 'mass', 'every mass unit is mass');
select is(app.unit_dimension('uk_pint'), 'volume', 'British pint is a volume');
select is(app.unit_dimension('tbsp'), 'tbsp', 'tbsp is a dimension of its own');
select is(app.unit_dimension('clove'), 'clove', 'each counted unit is a dimension of its own');
select is(app.unit_dimension('cup'), null::text, 'unknown code');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'piece', 'g', 0, 'shopping', 'test')$$, '23514', null, 'positive factor');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'g', 'piece', 0.008, 'shopping', 'test')$$, 'generic equivalence');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'kg', 'piece', 8, 'shopping', 'test')$$, '23505', null, 'one generic per dimension');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'kg', 'piece', 8, 'recipe', 'test')$$, 'another scope');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'piece', 'g', 120, 'shopping', 'test')$$, 'piece next to mass');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'slice', 'g', 20, 'shopping', 'test')$$, 'slice next to piece');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'tbsp', 'g', 15, 'shopping', 'test')$$, 'tbsp on its own');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('tomatoes'), 'tsp', 'g', 5, 'shopping', 'test')$$, 'tsp apart from tbsp');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source) values (tests.ingredient('tomatoes'), 'g', 'piece', 0.02, 'shopping', 'succo', 'test')$$, 'specific equivalence next to the generic one');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source) values (tests.ingredient('tomatoes'), 'g', 'piece', 0.05, 'shopping', 'scorza', 'test')$$, 'another preparation');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source) values (tests.ingredient('tomatoes'), 'kg', 'piece', 20, 'shopping', 'succo', 'test')$$, '23505', null, 'one per preparation');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source) values (tests.ingredient('pasta'), 'g', 'piece', 1, 'shopping', '  ', 'test')$$, '23514', null, 'no blank preparation');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'cup', 'g', 100, 'recipe', 'test')$$, '23502', null, 'unknown from unit');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'us_cup', 'grams', 100, 'recipe', 'test')$$, '23514', null, 'unknown to unit');

-- Source: blank as for JavaScript's trim, in inserts and in curators' updates
reset role;
select tests.login('gina');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', '')$$, '23514', null, 'insert: empty source');
select throws_ok($$update app.ingredient_unit_equivalences set source = '' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: empty source');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'\t\t')$$, '23514', null, 'insert: tabs source');
select throws_ok($$update app.ingredient_unit_equivalences set source = E'\t\t' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: tabs source');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'\n \r\n')$$, '23514', null, 'insert: line breaks source');
select throws_ok($$update app.ingredient_unit_equivalences set source = E'\n \r\n' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: line breaks source');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'\u00a0')$$, '23514', null, 'insert: no-break space source');
select throws_ok($$update app.ingredient_unit_equivalences set source = E'\u00a0' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: no-break space source');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'\u3000')$$, '23514', null, 'insert: ideographic space source');
select throws_ok($$update app.ingredient_unit_equivalences set source = E'\u3000' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: ideographic space source');
select throws_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'\ufeff\u2009')$$, '23514', null, 'insert: BOM and thin space source');
select throws_ok($$update app.ingredient_unit_equivalences set source = E'\ufeff\u2009' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$, '23514', null, 'update: BOM and thin space source');
select lives_ok($$insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (tests.ingredient('pasta'), 'g', 'piece', 0.01, 'shopping', E'  Manuale\u00a0')$$, 'insert: text with spaces around');
select is(tests.affected($$update app.ingredient_unit_equivalences set source = E'\tLibro, p. 3 ' where ingredient_id = tests.ingredient('tomatoes') and scope = 'shopping' and from_dimension = 'mass' and preparation is null$$), 1::bigint, 'update: text with spaces around');
reset role;

-- Deleting the authors of closed drafts: references cleared, the rest intact
do $$
declare
	v_recipe uuid;
begin
	perform tests.create_user('hugo');
	perform tests.create_user('ivo');
	perform tests.create_user('luca');
	insert into app.recipes (slug, name) values ('test-discarded-draft', '{"it-IT": "Scartata"}') returning id into v_recipe;
	insert into app.recipe_drafts (id, recipe_id, kind, base_version, content, revision, created_by, updated_by, closed_at, closed_by, outcome) values
		('d0d0d0d0-0000-4000-8000-000000000001', v_recipe, 'new', null, '{"v": 1}', 2,
			tests.uid('hugo'), tests.uid('ivo'), now(), tests.uid('luca'), 'discarded'),
		('d0d0d0d0-0000-4000-8000-000000000002', tests.recipe('pasta-al-pomodoro'), 'revision', 1, '{"v": 2}', 2,
			tests.uid('hugo'), tests.uid('ivo'), now(), tests.uid('luca'), 'published');
	insert into app.recipe_draft_saves (draft_id, revision, content, saved_by, channel) values
		('d0d0d0d0-0000-4000-8000-000000000001', 1, '{"s": 1}', tests.uid('hugo'), 'web'),
		('d0d0d0d0-0000-4000-8000-000000000002', 1, '{"s": 2}', tests.uid('ivo'), 'mcp');
end;
$$;
create temporary table closed_drafts_before as
	select id, recipe_id, kind, base_version, content, revision, created_at, updated_at, closed_at, outcome
	from app.recipe_drafts where id::text like 'd0d0d0d0-%';
select lives_ok($$delete from auth.users where id = tests.uid('hugo')$$, 'the creator of closed drafts can be deleted');
select is((select count(*) from app.recipe_drafts where id::text like 'd0d0d0d0-%' and created_by is null), 2::bigint, 'creator cleared');
select lives_ok($$delete from auth.users where id = tests.uid('ivo')$$, 'the last modifier can be deleted');
select is((select count(*) from app.recipe_drafts where id::text like 'd0d0d0d0-%' and updated_by is null), 2::bigint, 'last modifier cleared');
select lives_ok($$delete from auth.users where id = tests.uid('luca')$$, 'whoever closed them can be deleted');
select is((select count(*) from app.recipe_drafts where id::text like 'd0d0d0d0-%' and closed_by is null), 2::bigint, 'closer cleared');
select set_eq(
	$$select id, recipe_id, kind, base_version, content, revision, created_at, updated_at, closed_at, outcome
		from app.recipe_drafts where id::text like 'd0d0d0d0-%'$$,
	$$select * from closed_drafts_before$$,
	'content, revision, identity and outcome unchanged');
select is((select array_agg(content::text order by content::text) from app.recipe_draft_saves where draft_id::text like 'd0d0d0d0-%'),
	array['{"s": 1}', '{"s": 2}'], 'saves kept with their content');

-- Deleting an author keeps the catalogue
delete from auth.users where id = tests.uid('dario');
select is((select count(*) from app.recipe_versions where recipe_id = tests.recipe('pasta-al-pomodoro') and published_by is null), 3::bigint, 'versions kept, author cleared');

select * from finish();
rollback;
