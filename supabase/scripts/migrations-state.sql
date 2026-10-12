-- Migrations applied and app roles present (read only; runbook R4 and R5). Before the first migration
-- the table does not exist yet: "relation supabase_migrations.schema_migrations does not exist".
-- Run: node scripts/prod-sql.ts --preview migrations-state
select count(*) as applied from supabase_migrations.schema_migrations;
select count(*) as app_roles from pg_roles where rolname in ('app_server', 'app_job', 'app_backup');
