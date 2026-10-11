-- Citations of a recipe across families and the authors of ingredient changes (W3, wave 2).
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.login('dario');
select ok(app.recipe_is_cited(tests.recipe('new-draft')), 'a meal of a family dario is not in cites the draft');
select ok(not app.recipe_is_cited(tests.recipe('old-minestrone')), 'no meal cites the archived recipe');

reset role;
select tests.login('bruno');
select throws_ok(format('select app.recipe_is_cited(%L)', tests.recipe('new-draft')), '42501', null, 'members who are not curators are refused');

reset role;
select ok(not has_function_privilege('anon', 'app.recipe_is_cited(uuid)', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('public', 'app.recipe_is_cited(uuid)', 'execute'), 'public cannot execute');
select ok(has_function_privilege('authenticated', 'app.recipe_is_cited(uuid)', 'execute'), 'authenticated can execute');

-- Revocation is immediate with the same claims.
delete from app.user_roles where user_id = tests.uid('dario') and role = 'recipe_curator';
select tests.login('dario');
select throws_ok(format('select app.recipe_is_cited(%L)', tests.recipe('new-draft')), '42501', null, 'a revoked curator is refused');
reset role;
insert into app.user_roles (user_id, role) values (tests.uid('dario'), 'recipe_curator');

-- Author names include who changed an ingredient (gina has written nothing else in the fixtures).
insert into app.ingredient_versions (ingredient_id, version, content, changed_by, channel)
	values (tests.ingredient('salt'), 2, '{}', tests.uid('gina'), 'mcp');
select tests.login('dario');
select ok(exists (select 1 from app.catalogue_author_names() where user_id = tests.uid('gina')), 'ingredient authors are named to curators');
reset role;
select tests.login('bruno');
select is((select count(*) from app.catalogue_author_names()), 0::bigint, 'nothing for non-curators');

select * from finish();
rollback;
