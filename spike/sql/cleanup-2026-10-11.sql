-- Spike only: one-off cleanup of 11 October 2026 (schema, test users, OAuth clients
-- registered by Claude Code and Codex against the spike Worker).
begin;
drop schema if exists spike cascade;
delete from auth.oauth_clients
where created_at::date = '2026-10-11'
	and client_name in ('Claude Code (cosa-si-mangia-spike)', 'Codex');
delete from auth.users
where email in ('spike-a@cosasimangia.test', 'spike-b@cosasimangia.test');
commit;
select
	(select count(*) from auth.users) as users,
	(select count(*) from auth.oauth_clients) as oauth_clients,
	exists (select 1 from information_schema.schemata where schema_name = 'spike') as spike_schema;
