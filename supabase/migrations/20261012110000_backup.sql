-- Nightly export (spec section 8): a read-only role that sees every row of app and,
-- through one function, the users of Auth. Separate from app_job, which writes meals.

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'app_backup') then
		create role app_backup nologin bypassrls;
	end if;
end;
$$;

-- app_server is NOINHERIT: it reaches these rights only with `set local role app_backup`.
grant app_backup to app_server;
grant usage on schema app to app_backup;
grant select on all tables in schema app to app_backup;
-- Tables created by later migrations (run as postgres) are exported without changes here.
alter default privileges for role postgres in schema app grant select on tables to app_backup;

-- Applied migrations go in the export; the table exists when the Supabase CLI applies them.
do $$
begin
	if to_regclass('supabase_migrations.schema_migrations') is not null then
		grant usage on schema supabase_migrations to app_backup;
		grant select on supabase_migrations.schema_migrations to app_backup;
	end if;
end;
$$;

-- postgres cannot grant usage on the auth schema: a definer function reads the two tables
-- the restore needs (accounts and their sign-in identities), never sessions or tokens.
create function app.backup_auth_rows()
returns jsonb language sql stable security definer set search_path = '' as $$
	select jsonb_build_object(
		'users', coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from auth.users u), '[]'::jsonb),
		'identities', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from auth.identities i), '[]'::jsonb));
$$;
revoke execute on function app.backup_auth_rows() from public;
grant execute on function app.backup_auth_rows() to app_backup;
