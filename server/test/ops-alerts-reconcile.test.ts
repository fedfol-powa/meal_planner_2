import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';
import { alertMessage } from '../src/ops-alerts/messages.ts';
import { reconcileAlerts } from '../src/ops-alerts/reconcile.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { MemoryBucket } from './support/r2.ts';

/**
 * The hourly reconciliation (spec W15, section 5): every alert recoverable from the persisted
 * states of the last 7 days, finished ones included. The shared database holds other files' jobs
 * and deletions: each test asserts on its own ids, and the rows this file creates go in afterAll.
 */
describe.skipIf(!hasDatabase)('reconciliation of operational alerts', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let startedAt: Date;
	const deletions: string[] = [];
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 2, fetch_types: false });
		[{ now: startedAt }] = await db.admin<{ now: Date }[]>`select clock_timestamp() as now`;
	});
	afterAll(async () => {
		if (db) {
			// Only rows created while this file ran: other files' rows stay.
			await db.admin`delete from app.ops_alerts where created_at >= ${startedAt}`;
			if (deletions.length > 0) await db.admin`delete from app.account_deletions where user_id in ${db.admin(deletions)}`;
		}
		await sql?.end();
		await db?.close();
	});
	afterEach(() => vi.restoreAllMocks());

	const quiet = () => ({ info: vi.spyOn(console, 'log').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) });
	const alert = async (event: string, key: string) =>
		(await db.admin<{ details: string; subject: string }[]>`select details::text as details, subject from app.ops_alerts where event = ${event} and key = ${key}`)[0];
	/** A bucket with an export for each of these UTC dates. */
	const bucketWith = (...dates: string[]) => {
		const bucket = new MemoryBucket();
		for (const date of dates) bucket.objects.set(`exports/${date}T02-30Z.json.gz.enc`, { body: new Uint8Array(), customMetadata: {} });
		return bucket;
	};
	const envWith = (bucket?: MemoryBucket) => ({ HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUPS: bucket?.asBucket() }) as unknown as Env;
	const job = async (familyId: string, week: string, status: string, updatedAt: string) =>
		db.admin`insert into app.weekly_jobs (family_id, target_week, status, updated_at) values (${familyId}, ${week}, ${status}, ${updatedAt})`;

	it('raises weekly_job_abandoned for a job abandoned in the last 7 days, not for an older one', async () => {
		quiet();
		const recent = await db.createFamily([]);
		const old = await db.createFamily([]);
		await job(recent, '2030-01-07', 'abandoned', '2030-01-14T10:00:00Z');
		await job(old, '2029-12-24', 'abandoned', '2030-01-01T10:00:00Z');
		await reconcileAlerts(sql, envWith(bucketWith()), new Date('2030-01-15T10:00:00Z'));
		const row = await alert('weekly_job_abandoned', `${recent}:2030-01-07`);
		expect(row?.subject).toBe('[Cosa si mangia] Menu abbandonato per una famiglia');
		expect(JSON.parse(row!.details)).toEqual({ familyId: recent, weekStart: '2030-01-07', attempts: 0 });
		expect(await alert('weekly_job_abandoned', `${old}:2029-12-24`)).toBeUndefined();
	});

	it('raises weekly_job_overdue for jobs open at the Thursday 08:00 threshold of the last 7 days, in each family time zone', async () => {
		quiet();
		// Week of Monday 4 March 2030: threshold Thursday 28 February, 08:00 in Rome = 07:00Z, 08:00 in New York = 13:00Z.
		const pending = await db.createFamily([]);
		const failed = await db.createFamily([]);
		const doneLate = await db.createFamily([]);
		const doneEarly = await db.createFamily([]);
		const newYork = await db.createFamily([]);
		const notYet = await db.createFamily([]);
		const tooOld = await db.createFamily([]);
		await db.admin`update app.families set time_zone = 'America/New_York' where id = ${newYork}`;
		await job(pending, '2030-03-04', 'pending', '2030-02-27T19:00:00Z');
		await job(failed, '2030-03-04', 'failed', '2030-02-28T08:00:00Z');
		await job(doneLate, '2030-03-04', 'done', '2030-02-28T07:30:00Z'); // after the threshold
		await job(doneEarly, '2030-03-04', 'done', '2030-02-27T19:30:00Z'); // before it: no alert
		await job(newYork, '2030-03-04', 'pending', '2030-02-27T19:00:00Z'); // its threshold has not passed yet
		await job(notYet, '2030-03-11', 'pending', '2030-02-27T19:00:00Z'); // next week's threshold is a week later
		await job(tooOld, '2030-02-18', 'pending', '2030-02-13T19:00:00Z'); // threshold 14 February: out of the window
		await reconcileAlerts(sql, envWith(bucketWith()), new Date('2030-02-28T12:00:00Z'));
		const overdue = async (familyId: string, week = '2030-03-04') => alert('weekly_job_overdue', `${familyId}:${week}`);
		expect((await overdue(pending))?.subject).toBe('[Cosa si mangia] Menu in ritardo per una famiglia');
		expect(JSON.parse((await overdue(pending))!.details)).toEqual({ familyId: pending, weekStart: '2030-03-04' });
		expect(await overdue(failed)).toBeDefined();
		expect(await overdue(doneLate)).toBeDefined();
		expect(await overdue(doneEarly)).toBeUndefined();
		expect(await overdue(newYork)).toBeUndefined();
		expect(await overdue(notYet, '2030-03-11')).toBeUndefined();
		expect(await overdue(tooOld, '2030-02-18')).toBeUndefined();
		// Later the same day New York's threshold passes too.
		await reconcileAlerts(sql, envWith(bucketWith()), new Date('2030-02-28T14:00:00Z'));
		expect(await overdue(newYork)).toBeDefined();
	});

	it('an overdue job that never raised, then closed done: the reconciliation still raises it', async () => {
		quiet();
		const familyId = await db.createFamily([]);
		await job(familyId, '2030-04-08', 'pending', '2030-04-03T19:00:00Z');
		// Interrupted before any alert; the job then succeeds on Friday.
		await db.admin`update app.weekly_jobs set status = 'done', updated_at = '2030-04-05T09:00:00Z' where family_id = ${familyId}`;
		await reconcileAlerts(sql, envWith(bucketWith()), new Date('2030-04-06T09:00:00Z'));
		expect(await alert('weekly_job_overdue', `${familyId}:2030-04-08`)).toBeDefined();
	});

	it('raises backup_export_missing for each past UTC date without an export, today only from 05:00', async () => {
		quiet();
		// 2030-05-01 … 2030-05-07: exports for all but the 3rd; today (the 8th) has none yet.
		const bucket = bucketWith('2030-05-02', '2030-05-04', '2030-05-05', '2030-05-06', '2030-05-07');
		await reconcileAlerts(sql, envWith(bucket), new Date('2030-05-08T04:00:00Z'));
		expect(JSON.parse((await alert('backup_export_missing', '2030-05-03'))!.details)).toEqual({ reason: 'missing' });
		expect(await alert('backup_export_missing', '2030-05-08')).toBeUndefined(); // before 05:00
		expect(await alert('backup_export_missing', '2030-05-01')).toBeUndefined(); // outside the 7 days
		expect(await alert('backup_export_missing', '2030-05-02')).toBeUndefined();
		await reconcileAlerts(sql, envWith(bucket), new Date('2030-05-08T05:00:00Z'));
		expect(JSON.parse((await alert('backup_export_missing', '2030-05-08'))!.details)).toEqual({ reason: 'missing' });
	});

	it('without the BACKUPS binding the missing dates have the reason not_configured', async () => {
		quiet();
		await reconcileAlerts(sql, envWith(undefined), new Date('2030-06-10T06:00:00Z'));
		for (const date of ['2030-06-04', '2030-06-07', '2030-06-10'])
			expect(JSON.parse((await alert('backup_export_missing', date))!.details), date).toEqual({ reason: 'not_configured' });
		expect(await alert('backup_export_missing', '2030-06-03')).toBeUndefined();
	});

	it('a deletion with three failures that later completed still raises account_deletion_overdue', async () => {
		quiet();
		const completed = randomUUID();
		const stuck = randomUUID();
		const fewFailures = randomUUID();
		const old = randomUUID();
		deletions.push(completed, stuck, fewFailures, old);
		await db.admin`
			insert into app.account_deletions (user_id, requested_at, attempts, completed_at) values
				(${completed}, now() - interval '1 day', 3, now()),
				(${stuck}, now() - interval '2 hours', 4, null),
				(${fewFailures}, now() - interval '1 day', 2, null),
				(${old}, now() - interval '8 days', 5, null)`;
		await reconcileAlerts(sql, envWith(bucketWith()), new Date());
		const row = await alert('account_deletion_overdue', completed);
		expect(row?.subject).toBe('[Cosa si mangia] Cancellazione di un account bloccata');
		expect(JSON.parse(row!.details)).toEqual({ userId: completed, attempts: 3 });
		expect(await alert('account_deletion_overdue', stuck)).toBeDefined();
		expect(await alert('account_deletion_overdue', fewFailures)).toBeUndefined();
		expect(await alert('account_deletion_overdue', old)).toBeUndefined();
	});

	it('never throws: each rule fails alone and logs only a code', async () => {
		const logs = quiet();
		const broken = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		await broken.end();
		const failingBucket = { list: () => Promise.reject(new Error('r2 down')) } as unknown as R2Bucket;
		await expect(reconcileAlerts(broken, { HYPERDRIVE: { connectionString: '' }, BACKUPS: failingBucket } as unknown as Env, new Date())).resolves.toBeUndefined();
		const failures = logs.error.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(failures.map((f) => f.rule).sort()).toEqual(['abandoned', 'deletions', 'export', 'overdue']);
		for (const failure of failures) {
			expect(failure.event).toBe('ops_alert_reconcile_failed');
			expect(Object.keys(failure).sort()).toEqual(['code', 'event', 'rule']);
		}
	});

	it('the ops-alert-test script writes one ops_alert_test row for the day, with the body of the other alerts', async () => {
		const day = '2030-07-01';
		const script = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'scripts', 'ops-alert-test.sql'), 'utf8').replaceAll(":'day'", `'${day}'`);
		await db.admin.unsafe(script);
		await db.admin.unsafe(script); // a second run changes nothing
		const rows = await db.admin<{ details: string; subject: string; body: string; created_at: Date; attempts: number }[]>`
			select details::text as details, subject, body, created_at, attempts from app.ops_alerts where event = 'ops_alert_test' and key = ${day}`;
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(JSON.parse(row!.details)).toEqual({});
		expect(row!.attempts).toBe(0);
		const createdAt = new Date(Math.floor(row!.created_at.getTime() / 1000) * 1000);
		expect({ subject: row!.subject, body: row!.body }).toEqual(alertMessage('ops_alert_test', day, {}, createdAt));
	});
});
