begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select plan(3);

reset role;
select tests.become('app_job');
insert into app.weekly_jobs (family_id, target_week, status) values (tests.family('Rossi'), '2026-11-02', 'failed');
select is(
	tests.affected($$update app.weekly_jobs set status = 'abandoned', updated_at = now() where family_id = tests.family('Rossi') and target_week = '2026-11-02'$$),
	1::bigint, 'the job closes a job whose week is over'
);
select is((select status from app.weekly_jobs where family_id = tests.family('Rossi') and target_week = '2026-11-02'), 'abandoned', 'abandoned is a status');
select throws_ok($$update app.weekly_jobs set status = 'lost' where family_id = tests.family('Rossi')$$, '23514', null, 'other values are still refused');

select * from finish();
rollback;
