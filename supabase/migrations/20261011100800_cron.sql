-- Housekeeping with pg_cron: temporary Bring! lists expire after 30 minutes.
-- The hourly weekly job comes with the "Menu e job" activity (wave 2).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
	'purge-temporary-lists',
	'*/15 * * * *',
	$$delete from app.temporary_lists where expires_at < now()$$
);
