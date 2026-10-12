-- Fingerprint of every row of schema app (detail spec of the production launch, section 8): the
-- condition for removing a family or resetting the data. Any write after the last launch baseline
-- changes it. Excluded: profile_preferences (display preferences, no content of the family).
create or replace function pg_temp.app_fingerprint() returns text language plpgsql as $$
declare
	v_table text;
	v_hash text;
	v_all text := '';
begin
	for v_table in
		select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' and c.relname not in ('profile_preferences')
		order by c.relname
	loop
		execute format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) from app.%I t', E'\n', '', v_table) into v_hash;
		v_all := v_all || v_table || ':' || v_hash || E'\n';
	end loop;
	return md5(v_all);
end;
$$;

-- Every table of schema app in name order (the same order everywhere: no deadlock between our scripts).
-- A concurrent write waits for the end of this transaction.
create or replace function pg_temp.lock_app_tables(p_mode text) returns void language plpgsql as $$
declare
	v_table text;
begin
	if p_mode not in ('exclusive', 'access exclusive') then
		raise exception 'unexpected lock mode %', p_mode;
	end if;
	for v_table in select format('app.%I', c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' order by c.relname
	loop
		execute format('lock table %s in %s mode', v_table, p_mode);
	end loop;
end;
$$;

-- Start of a bootstrap applied with prod-sql.sh --launch: the first launch baseline only comes from a
-- database without families, where there is nothing to protect.
create or replace function pg_temp.launch_start() returns void language plpgsql as $$
begin
	perform pg_temp.lock_app_tables('exclusive');
	if exists (select 1 from app.families) then
		raise exception 'a family already exists: no launch baseline (rerun the bootstrap without --launch)';
	end if;
end;
$$;
