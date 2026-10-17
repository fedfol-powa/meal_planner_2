import type postgres from 'postgres';
import { withDbOn } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { sendEmail } from '../mail/transport.ts';
import { alertMessage, type AlertDetails, type AlertEvent } from './messages.ts';

export type { AlertEvent } from './messages.ts';

type AlertEnv = Pick<Env, 'RESEND_API_KEY' | 'OPS_ALERT_EMAIL' | 'MAILPIT_API_URL'>;

/** SQLSTATE only: error messages can carry data. */
function sqlState(error: unknown): string {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' ? code : 'unknown';
}

/**
 * Records an alert in its own `job` transaction, never in the one of the work that raised it.
 * True only when the row was inserted; a duplicate (event, key) or a failure answers false.
 */
export async function insertAlert(sql: postgres.Sql, alert: { event: AlertEvent; key: string; details: AlertDetails }): Promise<boolean> {
	try {
		const createdAt = new Date();
		const { subject, body } = alertMessage(alert.event, alert.key, alert.details, createdAt);
		const inserted = await withDbOn(sql, { kind: 'job' }, async (tx) => {
			const rows = await tx`
				insert into app.ops_alerts (event, key, details, subject, body, created_at)
				values (${alert.event}, ${alert.key}, ${JSON.stringify(alert.details)}::text::jsonb, ${subject}, ${body}, ${createdAt.toISOString()}::timestamptz)
				on conflict (event, key) do nothing
				returning event`;
			return rows.length === 1;
		});
		if (inserted) logEvent('ops_alert_raised', { alert: alert.event, key: alert.key });
		return inserted;
	} catch (error) {
		logEvent('ops_alert_insert_failed', { alert: alert.event, code: sqlState(error) }, 'error');
		return false;
	}
}

/**
 * One delivery round (spec W15, section 5). Each row is claimed atomically in a short
 * transaction, sent with no transaction open, and its outcome recorded in another one.
 * Never throws.
 */
export async function deliverAlerts(sql: postgres.Sql, env: AlertEnv, options: { fetch?: typeof fetch } = {}): Promise<void> {
	try {
		await expire(sql);
		await prune(sql);
		const to = env.OPS_ALERT_EMAIL;
		if (!to || !(env.RESEND_API_KEY || env.MAILPIT_API_URL)) {
			logEvent('ops_alert_not_configured', {}, 'error');
			return;
		}
		const candidates = await withDbOn(sql, { kind: 'job' }, (tx) =>
			tx<{ event: string; key: string }[]>`
				select event, key from app.ops_alerts
				where sent_at is null and closed_at is null
					and created_at > now() - interval '24 hours'
					and (claimed_at is null or claimed_at < now() - interval '15 minutes')
				order by created_at`,
		);
		for (const { event, key } of candidates) {
			try {
				await deliverOne(sql, env, to, event, key, options);
			} catch (error) {
				logEvent('ops_alert_failed', { alert: event, key, code: sqlState(error) }, 'error');
			}
		}
	} catch (error) {
		logEvent('ops_alert_delivery_failed', { code: sqlState(error) }, 'error');
	}
}

async function expire(sql: postgres.Sql): Promise<void> {
	const rows = await withDbOn(sql, { kind: 'job' }, (tx) =>
		tx<{ event: string; key: string }[]>`
			update app.ops_alerts set closed_at = now(), closed_reason = 'expired'
			where sent_at is null and closed_at is null and created_at < now() - interval '24 hours'
			returning event, key`,
	);
	for (const { event, key } of rows) logEvent('ops_alert_expired', { alert: event, key }, 'error');
}

async function prune(sql: postgres.Sql): Promise<void> {
	await withDbOn(sql, { kind: 'job' }, (tx) => tx`delete from app.ops_alerts where created_at < now() - interval '90 days'`);
}

async function deliverOne(sql: postgres.Sql, env: AlertEnv, to: string, event: string, key: string, options: { fetch?: typeof fetch }): Promise<void> {
	const claimed = await withDbOn(sql, { kind: 'job' }, (tx) =>
		tx<{ subject: string; body: string }[]>`
			update app.ops_alerts set claimed_at = now(), attempts = attempts + 1
			where event = ${event} and key = ${key} and sent_at is null and closed_at is null
				and created_at > now() - interval '24 hours'
				and (claimed_at is null or claimed_at < now() - interval '15 minutes')
			returning subject, body`,
	);
	if (claimed.length !== 1) return;
	const result = await sendEmail(env, { to, subject: claimed[0]!.subject, text: claimed[0]!.body, idempotencyKey: `${event}/${key}` }, { fetch: options.fetch });
	if (result.ok) {
		await withDbOn(sql, { kind: 'job' }, (tx) => tx`update app.ops_alerts set sent_at = now() where event = ${event} and key = ${key} and sent_at is null and closed_at is null`);
		logEvent('ops_alert_sent', { alert: event, key });
	} else if (result.status === 409 && result.code !== 'concurrent_idempotent_requests') {
		await withDbOn(sql, { kind: 'job' }, (tx) => tx`update app.ops_alerts set closed_at = now(), closed_reason = 'ambiguous' where event = ${event} and key = ${key} and sent_at is null and closed_at is null`);
		logEvent('ops_alert_ambiguous', { alert: event, key }, 'error');
	} else {
		await withDbOn(sql, { kind: 'job' }, (tx) => tx`update app.ops_alerts set claimed_at = null where event = ${event} and key = ${key} and sent_at is null and closed_at is null`);
		logEvent('ops_alert_failed', { alert: event, key, status: result.status }, 'error');
	}
}
