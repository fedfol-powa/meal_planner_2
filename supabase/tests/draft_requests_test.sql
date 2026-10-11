-- startRevision requests answered with a revision already open (W3, wave 2).
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.login('dario');
select lives_ok($$insert into app.recipe_draft_requests (id, draft_id, requested_by)
	values ('d0d0d0d0-0000-4000-8000-000000000001', (select id from app.recipe_drafts where recipe_id = tests.recipe('new-draft')), tests.uid('dario'))$$,
	'a curator records a request');
select is((select count(*) from app.recipe_draft_requests where id = 'd0d0d0d0-0000-4000-8000-000000000001'), 1::bigint, 'and reads it');
select throws_ok($$insert into app.recipe_draft_requests (id, draft_id)
	values ('d0d0d0d0-0000-4000-8000-000000000001', (select id from app.recipe_drafts where recipe_id = tests.recipe('new-draft')))$$,
	'23505', null, 'a request answers once');
select throws_ok($$insert into app.recipe_draft_requests (id, draft_id) values (gen_random_uuid(), gen_random_uuid())$$,
	'23503', null, 'only for an existing draft');
select throws_ok($$update app.recipe_draft_requests set draft_id = draft_id$$, '42501', null, 'never changed');
select throws_ok($$delete from app.recipe_draft_requests$$, '42501', null, 'never deleted');

reset role;
select tests.login('bruno');
select is((select count(*) from app.recipe_draft_requests), 0::bigint, 'members who are not curators see nothing');
select throws_ok($$insert into app.recipe_draft_requests (id, draft_id) values (gen_random_uuid(), gen_random_uuid())$$,
	'42501', null, 'nor write');

reset role;
select ok(not has_table_privilege('anon', 'app.recipe_draft_requests', 'select'), 'anon reads nothing');

-- The author can leave the app: the request stays, without the author.
delete from auth.users where id = tests.uid('dario');
select is((select requested_by from app.recipe_draft_requests where id = 'd0d0d0d0-0000-4000-8000-000000000001'), null::uuid, 'author cleared');

select * from finish();
rollback;
