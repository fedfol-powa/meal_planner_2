import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { alertMessage } from '../src/ops-alerts/messages.ts';
import { deliverAlerts, insertAlert, type AlertEvent } from '../src/ops-alerts/index.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';

const ENV = { RESEND_API_KEY: 're_test', OPS_ALERT_EMAIL: 'ops@example.test' };

type Call = { key: string; to: string; subject: string; text: string; html: unknown };
type Reply = { status: number; name?: string };

/** Fake Resend: records the calls for the keys of one test, answers 200 to everything else. */
function fakeResend(prefix: string, reply: (call: Call) => Reply | Promise<Reply> = () => ({ status: 200 })) {
	const calls: Call[] = [];
	const impl = (async (url: string | URL | Request, init?: RequestInit) => {
		expect(String(url)).toBe('https://api.resend.com/emails');
		const headers = init!.headers as Record<string, string>;
		const body = JSON.parse(String(init!.body)) as { to: string[]; subject: string; text: string; html?: unknown };
		const call: Call = { key: headers['idempotency-key']!, to: body.to[0]!, subject: body.subject, text: body.text, html: body.html };
		if (!call.key.includes(prefix)) return new Response('{}', { status: 200 });
		calls.push(call);
		const { status, name } = await reply(call);
		return new Response(JSON.stringify(name ? { name } : {}), { status });
	}) as typeof fetch;
	return { calls, fetch: impl };
}

describe.skipIf(!hasDatabase)('operational alerts', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
	});
	afterAll(async () => {
		if (db) await db.admin`delete from app.ops_alerts where key like 't7-%'`;
		await sql?.end();
		await db?.close();
	});
	afterEach(() => vi.restoreAllMocks());

	const quiet = () => ({ info: vi.spyOn(console, 'log').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) });
	const newKey = () => `t7-${randomUUID()}`;
	const raise = async (key: string, event: AlertEvent = 'backup_export_missing') => insertAlert(sql, { event, key, details: { reason: 'failed' } });
	const row = async (key: string) =>
		(await db.admin<{ sent_at: Date | null; claimed_at: Date | null; closed_at: Date | null; closed_reason: string | null; attempts: number }[]>`
			select sent_at, claimed_at, closed_at, closed_reason, attempts from app.ops_alerts where key = ${key}`)[0];
	const age = (key: string, interval: string, column = 'created_at') =>
		db.admin.unsafe(`update app.ops_alerts set ${column} = now() - interval '${interval}' where key = $1`, [key]);
	const lines = (spy: { mock: { calls: unknown[][] } }): string[] => spy.mock.calls.map((c) => String(c[0]));

	it('inserts once: a duplicate answers false and keeps the first body', async () => {
		const logs = quiet();
		const key = newKey();
		expect(await raise(key)).toBe(true);
		expect(await insertAlert(sql, { event: 'backup_export_missing', key, details: { reason: 'missing' } })).toBe(false);
		const [r] = await db.admin<{ details: { reason: string }; subject: string; body: string; created_at: Date }[]>`
			select details::text as details, subject, body, created_at from app.ops_alerts where key = ${key}`;
		expect(JSON.parse(r.details as unknown as string)).toEqual({ reason: 'failed' });
		expect(r.subject).toBe('[Cosa si mangia] Esportazione notturna mancante');
		expect(r.body).toBe(alertMessage('backup_export_missing', key, { reason: 'failed' }, r.created_at).body);
		expect(lines(logs.info).filter((l) => l.includes('ops_alert_raised') && l.includes(key))).toHaveLength(1);
	});

	it('never throws: a failing insert answers false and logs only the code', async () => {
		const logs = quiet();
		const broken = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		await broken.end();
		expect(await insertAlert(broken, { event: 'ops_alert_test', key: newKey(), details: {} })).toBe(false);
		expect(logs.error).toHaveBeenCalled();
		expect(await deliverAlerts(broken, ENV, { fetch: fakeResend('x').fetch })).toBeUndefined();
	});

	it('builds the subjects of the spec and a body without addresses', () => {
		const at = new Date('2026-10-17T10:11:12Z');
		const subjects: Record<AlertEvent, string> = {
			weekly_job_overdue: '[Cosa si mangia] Menu in ritardo per una famiglia',
			weekly_job_abandoned: '[Cosa si mangia] Menu abbandonato per una famiglia',
			backup_export_missing: '[Cosa si mangia] Esportazione notturna mancante',
			account_deletion_overdue: '[Cosa si mangia] Cancellazione di un account bloccata',
			ops_alert_test: '[Cosa si mangia] Prova degli allarmi',
		};
		for (const [event, subject] of Object.entries(subjects) as [AlertEvent, string][]) {
			const m = alertMessage(event, 'k', { attempts: 3, familyId: 'f1', note: null }, at);
			expect(m.subject).toBe(subject);
			const body = m.body.split('\n');
			expect(body).toContain('attempts: 3');
			expect(body).toContain('familyId: f1');
			expect(m.body).toContain('2026-10-17 10:11:12 UTC');
			expect(body.at(-1)).toBe(`Dettagli nei log del Worker (evento ${event})`);
			expect(m.body).not.toContain('@');
		}
	});

	it('sends text only, to the configured address, with the key <event>/<key>', async () => {
		const logs = quiet();
		const key = newKey();
		await raise(key);
		const resend = fakeResend(key);
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		expect(resend.calls).toHaveLength(1);
		const [call] = resend.calls;
		expect(call).toMatchObject({ key: `backup_export_missing/${key}`, to: 'ops@example.test', subject: '[Cosa si mangia] Esportazione notturna mancante', html: undefined });
		expect(call.text).toContain('reason: failed');
		const r = await row(key);
		expect(r.sent_at).not.toBeNull();
		expect(r.attempts).toBe(1);
		expect(lines(logs.info).filter((l) => l.includes('ops_alert_sent') && l.includes(key))).toHaveLength(1);
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		expect(resend.calls).toHaveLength(1);
	});

	it('two concurrent deliveries make one call', async () => {
		quiet();
		const key = newKey();
		await raise(key);
		const resend = fakeResend(key, async () => (await new Promise((r) => setTimeout(r, 100)), { status: 200 }));
		await Promise.all([deliverAlerts(sql, ENV, { fetch: resend.fetch }), deliverAlerts(sql, ENV, { fetch: resend.fetch })]);
		expect(resend.calls).toHaveLength(1);
		expect((await row(key)).attempts).toBe(1);
	});

	it('does not take a recent claim again, and retries a lost answer after 15 minutes with the same key and body', async () => {
		quiet();
		const key = newKey();
		await raise(key);
		// First attempt: the answer is lost (the Worker stops after the call): simulate with a rewound row.
		const first = fakeResend(key);
		await deliverAlerts(sql, ENV, { fetch: first.fetch });
		await db.admin`update app.ops_alerts set sent_at = null, claimed_at = now() - interval '5 minutes' where key = ${key}`;
		const recent = fakeResend(key);
		await deliverAlerts(sql, ENV, { fetch: recent.fetch });
		expect(recent.calls).toHaveLength(0);
		await age(key, '16 minutes', 'claimed_at');
		const later = fakeResend(key);
		await deliverAlerts(sql, ENV, { fetch: later.fetch });
		expect(later.calls).toHaveLength(1);
		expect(later.calls[0]).toMatchObject({ key: first.calls[0].key, subject: first.calls[0].subject, text: first.calls[0].text });
		expect((await row(key)).attempts).toBe(2);
	});

	it('releases the claim on a failure and on a concurrent-idempotency 409', async () => {
		const logs = quiet();
		const [a, b, c] = [newKey(), newKey(), newKey()];
		for (const k of [a, b, c]) await raise(k);
		const replies = new Map<string, Reply>([
			[`backup_export_missing/${a}`, { status: 500 }],
			[`backup_export_missing/${b}`, { status: 409, name: 'concurrent_idempotent_requests' }],
		]);
		const resend = fakeResend('t7-', (call) => replies.get(call.key) ?? { status: 429 });
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		for (const k of [a, b, c]) {
			const r = await row(k);
			expect(r.claimed_at, k).toBeNull();
			expect(r.sent_at).toBeNull();
			expect(r.closed_at).toBeNull();
		}
		const failed = lines(logs.error).filter((l) => l.includes('ops_alert_failed'));
		expect(failed.some((l) => l.includes('"status":500'))).toBe(true);
		expect(failed.some((l) => l.includes('"status":429'))).toBe(true);
	});

	it('a 409 of idempotency closes the row as ambiguous, with no retry; also when the recipient changed', async () => {
		const logs = quiet();
		const key = newKey();
		await raise(key);
		const sent: string[] = [];
		const resend = fakeResend(key, (call) => {
			sent.push(call.to);
			return call.to === 'other@example.test' ? { status: 409, name: 'invalid_idempotent_request' } : { status: 500 };
		});
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		expect((await row(key)).closed_at).toBeNull();
		await age(key, '16 minutes', 'claimed_at');
		await db.admin`update app.ops_alerts set claimed_at = null where key = ${key}`;
		await deliverAlerts(sql, { ...ENV, OPS_ALERT_EMAIL: 'other@example.test' }, { fetch: resend.fetch });
		const r = await row(key);
		expect(r.closed_reason).toBe('ambiguous');
		expect(r.closed_at).not.toBeNull();
		expect(r.sent_at).toBeNull();
		expect(lines(logs.error).filter((l) => l.includes('ops_alert_ambiguous') && l.includes(key))).toHaveLength(1);
		await db.admin`update app.ops_alerts set claimed_at = null where key = ${key}`;
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		expect(resend.calls).toHaveLength(2);
	});

	it('expires unsent rows older than 24 hours without sending them', async () => {
		const logs = quiet();
		const key = newKey();
		await raise(key);
		await age(key, '25 hours');
		const resend = fakeResend(key);
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		expect(resend.calls).toHaveLength(0);
		const r = await row(key);
		expect(r.closed_reason).toBe('expired');
		expect(r.closed_at).not.toBeNull();
		expect(lines(logs.error).filter((l) => l.includes('ops_alert_expired') && l.includes(key))).toHaveLength(1);
	});

	it('does not expire sent rows, and deletes rows older than 90 days', async () => {
		quiet();
		const [sentKey, oldKey, freshKey] = [newKey(), newKey(), newKey()];
		for (const k of [sentKey, oldKey, freshKey]) await raise(k);
		await db.admin`update app.ops_alerts set sent_at = now() where key = ${sentKey}`;
		await age(sentKey, '30 hours');
		await age(oldKey, '91 days');
		await age(freshKey, '89 days');
		await db.admin`update app.ops_alerts set sent_at = now() where key = ${freshKey}`;
		await deliverAlerts(sql, ENV, { fetch: fakeResend('none').fetch });
		expect((await row(sentKey)).closed_at).toBeNull();
		expect(await row(oldKey)).toBeUndefined();
		expect(await row(freshKey)).toBeDefined();
	});

	it('without secrets it claims nothing, calls nothing and logs ops_alert_not_configured', async () => {
		const logs = quiet();
		const key = newKey();
		await raise(key);
		const fetchSpy = vi.fn(async () => new Response('{}'));
		for (const env of [{}, { RESEND_API_KEY: 're_test' }, { OPS_ALERT_EMAIL: 'ops@example.test' }]) {
			await deliverAlerts(sql, env, { fetch: fetchSpy as unknown as typeof fetch });
		}
		expect(fetchSpy).not.toHaveBeenCalled();
		const r = await row(key);
		expect(r.attempts).toBe(0);
		expect(r.claimed_at).toBeNull();
		expect(lines(logs.error).some((l) => l.includes('ops_alert_not_configured'))).toBe(true);
	});

	it('logs and bodies contain no address', async () => {
		const logs = quiet();
		const key = newKey();
		await raise(key);
		const resend = fakeResend(key, () => ({ status: 500 }));
		await deliverAlerts(sql, ENV, { fetch: resend.fetch });
		await deliverAlerts(sql, {}, {});
		const [r] = await db.admin<{ body: string; details: unknown }[]>`select body, details::text as details from app.ops_alerts where key = ${key}`;
		expect(r.body).not.toContain('@');
		expect(JSON.stringify(r.details)).not.toContain('@');
		for (const l of [...lines(logs.info), ...lines(logs.error)]) expect(l).not.toContain('@');
	});
});
