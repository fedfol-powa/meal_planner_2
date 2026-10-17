import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { withDbOn } from '../../src/db.ts';
import { ensureWeeks, lockFamilyWeeks } from '../../src/menu/generation.ts';
import { runWeeklyJobOn } from '../../src/menu/job.ts';
import { reconcileAlerts } from '../../src/ops-alerts/reconcile.ts';
import type { Env } from '../../src/env.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { menuFixtures } from '../support/menu.ts';

// The controlled point of the generation: these families' generations fail.
const failing = vi.hoisted(() => new Set<string>());
vi.mock('../../src/menu/plan.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu/plan.ts')>();
	return {
		planWeek: (input: { familyId: string }) => {
			if (failing.has(input.familyId)) throw new Error('planner failure');
			return actual.planWeek(input as never);
		},
	};
});

// The job's status writes: these families' abandoned and failed saves fail.
const savesFailing = vi.hoisted(() => new Set<string>());
vi.mock('../../src/menu/job-status.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu/job-status.ts')>();
	const guard = (familyId: string) => {
		if (savesFailing.has(familyId)) throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
	};
	return {
		markAbandoned: async (...args: Parameters<typeof actual.markAbandoned>) => (guard(args[1]), actual.markAbandoned(...args)),
		markFailed: async (...args: Parameters<typeof actual.markFailed>) => (guard(args[1]), actual.markFailed(...args)),
	};
});

// Recording an alert for these families fails as a failing table would: insertAlert's own error path.
const alertsFailing = vi.hoisted(() => new Set<string>());
vi.mock('../../src/ops-alerts/index.ts', async (original) => {
	const actual = await original<typeof import('../../src/ops-alerts/index.ts')>();
	const failingSql = { begin: () => Promise.reject(Object.assign(new Error('permission denied'), { code: '42501' })) } as unknown as postgres.Sql;
	return {
		...actual,
		insertAlert: (sql: postgres.Sql, alert: Parameters<typeof actual.insertAlert>[1]) =>
			actual.insertAlert(alertsFailing.has(String(alert.details.familyId)) ? failingSql : sql, alert),
	};
});

/** A fake Resend for the immediate delivery: records the idempotency keys it receives. */
function fakeResend(status = 200) {
	const keys: string[] = [];
	const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
		keys.push((init!.headers as Record<string, string>)['idempotency-key']!);
		return new Response('{}', { status });
	}) as typeof fetch;
	return { keys, delivery: { env: { RESEND_API_KEY: 're_test', OPS_ALERT_EMAIL: 'ops@example.test' }, fetch: impl } };
}

/** Each run serves only the families of its test: the shared test database holds many more. */
describe.skipIf(!hasDatabase)('weekly job', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	let startedAt: Date;
	beforeAll(async () => {
		[{ now: startedAt }] = await db.admin<{ now: Date }[]>`select clock_timestamp() as now`;
	});
	afterAll(async () => {
		// The alerts raised while this file ran: its own families' and the reconciliation's.
		await db.admin`delete from app.ops_alerts where created_at >= ${startedAt}`;
		await sql.end();
		await db.close();
	});
	const alertRow = async (event: string, key: string) =>
		(await db.admin<{ details: string; sent: boolean }[]>`select details::text as details, sent_at is not null as sent from app.ops_alerts where event = ${event} and key = ${key}`)[0];

	const jobRow = async (familyId: string, week: string) =>
		(await db.admin<{ status: string; attempts: number; error: string | null }[]>`select status, attempts, error from app.weekly_jobs where family_id = ${familyId} and target_week = ${week}`)[0];
	const hasWeek = async (familyId: string, startsOn: string) =>
		(await db.admin`select 1 from app.weeks where family_id = ${familyId} and starts_on = ${startsOn}`).length === 1;
	const events = (spy: MockInstance) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));

	it('does nothing before Wednesday 20:00 and generates next week after it, in each family time zone', async () => {
		const rome = await db.createFamily([]);
		const newYork = await db.createFamily([]);
		await menuFixtures(db).setTimeZone(newYork, 'America/New_York');
		await runWeeklyJobOn(sql, new Date('2026-10-13T12:00:00Z'), { families: [rome, newYork] });
		expect(await jobRow(rome, '2026-10-19')).toBeUndefined();
		await runWeeklyJobOn(sql, new Date('2026-10-14T18:30:00Z'), { families: [rome, newYork] }); // 20:30 in Rome, 14:30 in New York
		expect(await hasWeek(rome, '2026-10-19')).toBe(true);
		expect(await jobRow(rome, '2026-10-19')).toMatchObject({ status: 'done', attempts: 1 });
		expect(await hasWeek(newYork, '2026-10-19')).toBe(false);
		await runWeeklyJobOn(sql, new Date('2026-10-15T00:30:00Z'), { families: [rome, newYork] }); // 20:30 in New York
		expect(await hasWeek(newYork, '2026-10-19')).toBe(true);
	});

	it('isolates a failing family and retries it on the next run', async () => {
		const broken = await db.createFamily([]);
		const healthy = await db.createFamily([]);
		failing.add(broken);
		await runWeeklyJobOn(sql, new Date('2026-10-21T18:30:00Z'), { families: [broken, healthy] });
		expect(await jobRow(broken, '2026-10-26')).toMatchObject({ status: 'failed', attempts: 1, error: 'Error' });
		expect(await hasWeek(healthy, '2026-10-26')).toBe(true);
		failing.delete(broken);
		await runWeeklyJobOn(sql, new Date('2026-10-21T19:30:00Z'), { families: [broken, healthy] });
		expect(await jobRow(broken, '2026-10-26')).toMatchObject({ status: 'done', attempts: 2, error: null });
	});

	it('marks done a week the lazy generation already created', async () => {
		const familyId = await db.createFamily([]);
		await menuFixtures(db).insertWeek(familyId, '2026-11-02');
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2026-11-02')`;
		await runWeeklyJobOn(sql, new Date('2026-10-28T19:30:00Z'), { families: [familyId] });
		expect(await jobRow(familyId, '2026-11-02')).toMatchObject({ status: 'done' });
	});

	it('retries a job failed until Sunday on Monday, from the meals still open', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-04T19:30:00Z'), { families: [familyId] }); // Wednesday 20:30: job for 9 November fails
		await runWeeklyJobOn(sql, new Date('2026-11-08T21:00:00Z'), { families: [familyId] }); // Sunday 22:00: fails again
		failing.delete(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-09T14:00:00Z'), { families: [familyId] }); // Monday 15:00 in Rome
		expect(await jobRow(familyId, '2026-11-09')).toMatchObject({ status: 'done', attempts: 3 });
		const [first] = await db.admin<{ date: string; meal_type: string }[]>`
			select s.date::text, s.meal_type from app.meal_slots s join app.weeks w on w.id = s.week_id
			where w.family_id = ${familyId} and w.starts_on = '2026-11-09' order by s.date, s.meal_type desc limit 1`;
		expect(first).toEqual({ date: '2026-11-09', meal_type: 'lunch' }); // 15:00 < 15:30: Monday lunch still open
	});

	it('abandons a job whose week is over, with an error log, and handles the new one', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-11T19:30:00Z'), { families: [familyId] }); // job for 16 November fails
		failing.delete(familyId);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2026-11-25T19:30:00Z'), { families: [familyId] }); // two weeks later, Wednesday 20:30
		expect(await jobRow(familyId, '2026-11-16')).toMatchObject({ status: 'abandoned' });
		expect(await hasWeek(familyId, '2026-11-16')).toBe(false);
		expect(events(errors)).toContainEqual(expect.objectContaining({ event: 'weekly_job_abandoned', familyId, weekStart: '2026-11-16' }));
		expect(await jobRow(familyId, '2026-11-30')).toMatchObject({ status: 'done' });
		errors.mockRestore();
	});

	it('logs an overdue job from the Thursday 08:00 before its week, also on Monday', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2026-12-02T19:30:00Z'), { families: [familyId] }); // Wednesday: failed, not overdue
		expect(events(logs)).not.toContainEqual(expect.objectContaining({ event: 'weekly_job_overdue', familyId }));
		await runWeeklyJobOn(sql, new Date('2026-12-07T09:00:00Z'), { families: [familyId] }); // Monday of the job's week
		expect(events(logs)).toContainEqual(expect.objectContaining({ event: 'weekly_job_overdue', familyId, weekStart: '2026-12-07' }));
		logs.mockRestore();
		failing.delete(familyId);
	});

	it('raises weekly_job_abandoned after the abandonment and delivers it at once', async () => {
		const familyId = await db.createFamily([]);
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2031-03-03')`;
		const resend = fakeResend();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = await runWeeklyJobOn(sql, new Date('2031-03-12T19:30:00Z'), { families: [familyId], alerts: resend.delivery });
		vi.restoreAllMocks();
		expect(result.abandoned).toBe(1);
		const row = await alertRow('weekly_job_abandoned', `${familyId}:2031-03-03`);
		expect(JSON.parse(row!.details)).toEqual({ familyId, weekStart: '2031-03-03', attempts: 0 });
		expect(row!.sent).toBe(true);
		expect(resend.keys).toContain(`weekly_job_abandoned/${familyId}:2031-03-03`);
	});

	it('confirms the abandonment when recording the alert fails, and the next reconciliation raises it', async () => {
		const familyId = await db.createFamily([]);
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2031-04-07')`;
		alertsFailing.add(familyId);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = await runWeeklyJobOn(sql, new Date('2031-04-16T19:30:00Z'), { families: [familyId], alerts: fakeResend().delivery });
		expect(result.abandoned).toBe(1);
		expect(await jobRow(familyId, '2031-04-07')).toMatchObject({ status: 'abandoned' });
		expect(events(errors)).toContainEqual({ event: 'ops_alert_insert_failed', alert: 'weekly_job_abandoned', code: '42501' });
		expect(await alertRow('weekly_job_abandoned', `${familyId}:2031-04-07`)).toBeUndefined();
		alertsFailing.delete(familyId);
		await reconcileAlerts(sql, { HYPERDRIVE: { connectionString: '' } } as unknown as Env, new Date());
		vi.restoreAllMocks();
		expect(JSON.parse((await alertRow('weekly_job_abandoned', `${familyId}:2031-04-07`))!.details)).toEqual({ familyId, weekStart: '2031-04-07', attempts: 0 });
	});

	it('completes the run when Resend fails: the alert stays for the next delivery', async () => {
		const familyId = await db.createFamily([]);
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2031-05-05')`;
		const resend = fakeResend(500);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = await runWeeklyJobOn(sql, new Date('2031-05-14T19:30:00Z'), { families: [familyId], alerts: resend.delivery });
		vi.restoreAllMocks();
		expect(result).toMatchObject({ abandoned: 1 });
		expect(await jobRow(familyId, '2031-05-19')).toMatchObject({ status: 'done' });
		expect(resend.keys).toContain(`weekly_job_abandoned/${familyId}:2031-05-05`);
		expect((await alertRow('weekly_job_abandoned', `${familyId}:2031-05-05`))!.sent).toBe(false);
	});

	it('raises weekly_job_overdue when a job already overdue fails, not before the threshold', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		const resend = fakeResend();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2031-06-04T19:30:00Z'), { families: [familyId], alerts: resend.delivery }); // Wednesday: failed, not overdue
		expect(await alertRow('weekly_job_overdue', `${familyId}:2031-06-09`)).toBeUndefined();
		await runWeeklyJobOn(sql, new Date('2031-06-05T07:30:00Z'), { families: [familyId], alerts: resend.delivery }); // Thursday 09:30 in Rome
		failing.delete(familyId);
		vi.restoreAllMocks();
		const row = await alertRow('weekly_job_overdue', `${familyId}:2031-06-09`);
		expect(JSON.parse(row!.details)).toEqual({ familyId, weekStart: '2031-06-09' });
		expect(resend.keys).toContain(`weekly_job_overdue/${familyId}:2031-06-09`);
	});

	it('serialises the job and the lazy generation of one family: both weeks once, no failure', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		const now = new Date('2026-12-16T20:00:00Z'); // Wednesday 21:00 in Rome: current and next week both missing
		const holder = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let locked!: () => void;
		const isLocked = new Promise<void>((resolve) => (locked = resolve));
		const lock = withDbOn(holder, { kind: 'job' }, async (tx) => {
			await lockFamilyWeeks(tx, familyId);
			locked();
			await held;
		});
		await isLocked;
		const job = runWeeklyJobOn(sql, now, { families: [familyId] });
		const lazy = withDbOn(sql, { kind: 'user', claims }, async (tx) => {
			await ensureWeeks(tx, familyId, now);
			return (await tx<{ s: string }[]>`select starts_on::text as s from app.weeks where family_id = ${familyId} order by 1`).map((r) => r.s);
		});
		await new Promise((r) => setTimeout(r, 100)); // both are waiting on the lock
		release();
		const [, , seen] = await Promise.all([lock, job, lazy]);
		expect(seen).toEqual(['2026-12-14', '2026-12-21']);
		expect((await db.admin`select 1 from app.weeks where family_id = ${familyId}`).length).toBe(2);
		await holder.end();
	});

	it('the weekly job skips a family deleted during the run with weekly_job_family_gone', async () => {
		const fx = menuFixtures(db);
		const { familyId } = await fx.member();
		const holder = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let locked!: () => void;
		const isLocked = new Promise<void>((resolve) => (locked = resolve));
		const lock = withDbOn(holder, { kind: 'job' }, async (tx) => {
			await lockFamilyWeeks(tx, familyId);
			locked();
			await held;
		});
		await isLocked;
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		// Selected as an open job, then waiting on the family lock while the family is deleted.
		const job = runWeeklyJobOn(sql, new Date('2026-12-16T20:00:00Z'), { families: [familyId] });
		await new Promise((r) => setTimeout(r, 100));
		await db.admin`delete from app.families where id = ${familyId}`;
		release();
		const [, result] = await Promise.all([lock, job]);
		expect(result.failed).toBe(0);
		expect(events(logs)).toContainEqual({ event: 'weekly_job_family_gone', familyId, weekStart: '2026-12-21' });
		expect(events(logs).map((e) => e.event)).not.toContain('weekly_job_failed');
		logs.mockRestore();
		await holder.end();
	});

	it('keeps serving the other families when saving abandoned or failed fails, and leaves those jobs recoverable', async () => {
		const abandoning = await db.createFamily([]);
		const failingSave = await db.createFamily([]);
		const healthy = await db.createFamily([]);
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${abandoning}, '2026-12-28'), (${failingSave}, '2027-01-11')`;
		failing.add(failingSave);
		savesFailing.add(abandoning);
		savesFailing.add(failingSave);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		// Wednesday 13 January 2027, 20:30 in Rome: the job of 28 December is over, the one of 11 January
		// is open, and next week (18 January) is due for all three; jobs run by week, so the healthy
		// family's new job comes after both failures.
		const result = await runWeeklyJobOn(sql, new Date('2027-01-13T19:30:00Z'), { families: [abandoning, failingSave, healthy] });
		expect(await jobRow(healthy, '2027-01-18')).toMatchObject({ status: 'done' });
		expect(await hasWeek(healthy, '2027-01-18')).toBe(true);
		expect(await jobRow(abandoning, '2026-12-28')).toMatchObject({ status: 'pending', attempts: 0 }); // the next run abandons it
		expect(await jobRow(failingSave, '2027-01-11')).toMatchObject({ status: 'pending', attempts: 0 }); // the next run retries it
		expect(events(errors)).toContainEqual({ event: 'weekly_job_status_failed', familyId: abandoning, weekStart: '2026-12-28', status: 'abandoned', code: '40P01' });
		expect(events(errors)).toContainEqual({ event: 'weekly_job_status_failed', familyId: failingSave, weekStart: '2027-01-11', status: 'failed', code: '40P01' });
		expect(events(errors).some((e) => e.event === 'weekly_job_abandoned' && e.familyId === abandoning)).toBe(false);
		expect(result.generated).toBeGreaterThanOrEqual(2); // the healthy family and the abandoning one's new week
		errors.mockRestore();
		logs.mockRestore();
		savesFailing.clear();
		failing.delete(failingSave);
		await runWeeklyJobOn(sql, new Date('2027-01-13T20:30:00Z'), { families: [abandoning, failingSave] });
		expect(await jobRow(abandoning, '2026-12-28')).toMatchObject({ status: 'abandoned' });
		expect(await jobRow(failingSave, '2027-01-11')).toMatchObject({ status: 'done' });
	});

});
