begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
-- Test-only rights, rolled back with the transaction: postgres may become app_backup,
-- and app_backup may call pgTAP. Production grants neither.
grant app_backup to postgres with inherit false, set true;
grant usage on schema extensions to app_backup;
select no_plan();

select ok((select rolbypassrls and not rolcanlogin from pg_roles where rolname = 'app_backup'), 'app_backup is NOLOGIN BYPASSRLS');
select ok(pg_has_role('app_server', 'app_backup', 'SET') and not pg_has_role('app_server', 'app_backup', 'USAGE'),
	'app_server switches to app_backup without inheriting it');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and not has_table_privilege('app_backup', c.oid, 'SELECT') order by 1),
	array[]::text[], 'app_backup reads every app table');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind in ('r', 'v')
			and has_table_privilege('app_backup', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') order by 1),
	array[]::text[], 'app_backup writes nothing');
select is(
	array(select r from unnest(array['authenticated', 'anon', 'app_job', 'app_server', 'public']) r
		where has_function_privilege(r, 'app.backup_auth_rows()', 'EXECUTE')),
	array[]::text[], 'only app_backup reads the users of Auth');
select is(
	array(select c.relname::text from pg_class c
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r'
			and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p') order by 1),
	array[]::text[], 'every app table has a primary key (deterministic export order)');
select is(
	(select count(*) from pg_class where relnamespace = 'app'::regnamespace and relkind = 'S')
		+ (select count(*) from pg_attribute a join pg_class c on c.oid = a.attrelid
			where c.relnamespace = 'app'::regnamespace and a.attnum > 0 and a.attidentity <> ''),
	0::bigint, 'no sequences or identity columns in app: the restore does not realign them (spec 2026-10-11-esportazione-r2)');
select is(
	array(select c.relname || '.' || a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
		where c.relnamespace = 'app'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
			and a.atttypid = 'xid8'::regtype order by 1),
	array['catalogue_state.version_xid', 'families.data_version_xid'],
	'xid8 markers are those of XID_MARKERS in server/src/backup/restore.ts');

-- A table created later by a migration is readable too.
create table app.backup_probe (id uuid primary key);
select ok(has_table_privilege('app_backup', 'app.backup_probe', 'SELECT'), 'default privileges cover new tables');
drop table app.backup_probe;

select set_config('tests.rossi', tests.family('Rossi')::text, true);
set local role app_backup;
select is((select count(*) from app.families where id = current_setting('tests.rossi')::uuid), 1::bigint,
	'RLS does not hide families from app_backup');
select ok(jsonb_array_length(app.backup_auth_rows()->'users') >= 1, 'app_backup reads the users through the function');
select ok(jsonb_typeof(app.backup_auth_rows()->'identities') = 'array', 'and the identities');
select throws_ok($$select count(*) from auth.users$$, '42501', null, 'but not the auth schema directly');
select throws_ok($$update app.families set name = 'x'$$, '42501', null, 'app_backup does not write');
reset role;

select * from finish();
rollback;
