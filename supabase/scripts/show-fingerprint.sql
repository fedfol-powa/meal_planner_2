-- Prints the fingerprint of schema app (read only). Run with scripts/prod-sql.sh --preview.
begin;
select pg_temp.app_fingerprint() as fingerprint;
commit;
