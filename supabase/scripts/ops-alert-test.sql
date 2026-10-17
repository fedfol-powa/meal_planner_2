-- Test of the operational alerts after the release (spec W15, section 9, point 9). Writes one
-- ops_alert_test row keyed by the day of the test; the next hourly run sends it to OPS_ALERT_EMAIL
-- and records sent_at. Subject and body as the server builds them (section 5): title, creation time
-- in UTC, pointer to the Worker logs. A second run on the same day changes nothing.
-- Run: node scripts/prod-sql.ts --apply ops-alert-test --set day=<YYYY-MM-DD> --confirm <operation>
insert into app.ops_alerts (event, key, subject, body)
select 'ops_alert_test', (:'day'::date)::text, '[Cosa si mangia] Prova degli allarmi',
	concat_ws(chr(10),
		'Prova degli allarmi',
		'Creato il ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC',
		'Dettagli nei log del Worker (evento ops_alert_test)')
on conflict (event, key) do nothing
returning event, key, created_at;
