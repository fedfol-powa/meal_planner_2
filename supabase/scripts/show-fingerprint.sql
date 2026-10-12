-- Prints the fingerprint of schema app (read only). Run: node scripts/prod-sql.ts --preview show-fingerprint
select pg_temp.app_fingerprint() as fingerprint;
