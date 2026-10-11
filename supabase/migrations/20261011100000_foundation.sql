-- Foundation: private schema, roles of the server and of the weekly job.
-- The app schema is not exposed by the Data API: the server reaches it directly.

create schema app;
revoke all on schema app from public;

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'app_job') then
		create role app_job nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'app_server') then
		-- Password set by hand on each project, never in migrations.
		create role app_server login noinherit;
	end if;
end;
$$;

grant authenticated, anon, app_job to app_server;
-- The creator of a role cannot switch to it (Postgres 16+): postgres, which runs the
-- tests and the administration, may become app_job without inheriting its rights.
grant app_job to postgres with inherit false, set true;
grant usage on schema app to authenticated, anon, app_job;

-- {"it-IT": text, "en-GB": text}; completeness is checked by the domain on publish.
create function app.is_localized_text(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
	select case
		when value is null then true
		when jsonb_typeof(value) <> 'object' then false
		else not exists (
			select 1 from jsonb_each(value) e
			where e.key not in ('it-IT', 'en-GB') or jsonb_typeof(e.value) not in ('string', 'null')
		)
	end;
$$;

-- {"it-IT": [text], "en-GB": [text]}
create function app.is_localized_list(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
	select case
		when value is null then true
		when jsonb_typeof(value) <> 'object' then false
		else not exists (
			select 1 from jsonb_each(value) e
			where e.key not in ('it-IT', 'en-GB')
				or case
					when jsonb_typeof(e.value) <> 'array' then true
					else exists (select 1 from jsonb_array_elements(e.value) x where jsonb_typeof(x) <> 'string')
				end
		)
	end;
$$;

-- New functions are executable by PUBLIC: revoke, then grant per role (every migration).
revoke execute on function app.is_localized_text(jsonb), app.is_localized_list(jsonb) from public;
grant execute on function app.is_localized_text(jsonb), app.is_localized_list(jsonb) to authenticated, app_job;
