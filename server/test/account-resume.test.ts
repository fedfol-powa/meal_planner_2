import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { resumeAccountDeletions } from '../src/account/resume.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';

// Recording an alert for these users fails as a failing table would: insertAlert's own error path.
const alertsFailing = vi.hoisted(() => new Set<string>());
vi.mock('../src/ops-alerts/index.ts', async (original) => {
	const actual = await original<typeof import('../src/ops-alerts/index.ts')>();
	const failingSql = { begin: () => Promise.reject(Object.assign(new Error('permission denied'), { code: '42501' })) } as unknown as postgres.Sql;
	return {
		...actual,
		insertAlert: (sql: postgres.Sql, alert: Parameters<typeof actual.insertAlert>[1]) =>
			actual.insertAlert(alertsFailing.has(String(alert.details.userId)) ? failingSql : sql, alert),
	};
});

describe.skipIf(!hasDatabase)('resume of account deletions (hourly)', () => {
	let actors: Actors;
	let auth: ReturnType<typeof installFakeAuth>;
	beforeAll(async () => {
		actors = await setupActors();
		auth = installFakeAuth(actors.db);
	});
	// Rows left pending by other tests are not idle: each test resumes only its own.
	beforeEach(async () => {
		await actors.db.admin`update app.account_deletions set last_attempt_at = now() where completed_at is null`;
	});
	// Every resume of this file may raise alerts for its own users, the older tests' included: the
	// rows created while it ran go.
	let startedAt: Date;
	beforeAll(async () => {
		[{ now: startedAt }] = await actors.db.admin<{ now: Date }[]>`select clock_timestamp() as now`;
	});
	afterAll(async () => {
		if (startedAt) await actors.db.admin`delete from app.ops_alerts where event = 'account_deletion_overdue' and created_at >= ${startedAt}`;
		auth?.restore();
		await actors?.close();
	});

	const now = new Date();
	/** A deletion whose first transaction ran: the row is pending, the account still in Auth. */
	const pending = async (idleMinutes: number, attempts = 0) => {
		const person = await actors.user();
		await actors.db.admin.begin(async (tx) => {
			await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: person.userId, role: 'authenticated' })}, true)`;
			await tx`select app.begin_account_deletion(${person.userId}::uuid, '{}'::jsonb, '{}'::uuid[])`;
		});
		await actors.db.admin`
			update app.account_deletions set requested_at = now() - make_interval(mins => ${idleMinutes}), attempts = ${attempts},
				last_attempt_at = case when ${attempts} > 0 then now() - make_interval(mins => ${idleMinutes}) end
			where user_id = ${person.userId}`;
		return person.userId;
	};
	const row = async (userId: string) =>
		(await actors.db.admin<{ attempts: number; completed: boolean }[]>`
			select attempts, completed_at is not null as completed from app.account_deletions where user_id = ${userId}`)[0]!;
	const events = (spy: MockInstance) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));

	it('resumes rows idle for five minutes and skips newer ones', async () => {
		const idle = await pending(6);
		const recent = await pending(1);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		expect(events(logs)).toContainEqual({ event: 'account_deletion_resumed', userId: idle });
		logs.mockRestore();
		expect(await row(idle)).toEqual({ attempts: 0, completed: true });
		expect(await row(recent)).toEqual({ attempts: 0, completed: false });
	});

	it('closes a row when Auth answers 404', async () => {
		const gone = await pending(10);
		await actors.db.admin`delete from auth.users where id = ${gone}`;
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		logs.mockRestore();
		expect((await row(gone)).completed).toBe(true);
	});

	it('logs account_deletion_overdue at error level from the third failure', async () => {
		const stuck = await pending(70, 2);
		auth.failNextDelete(503);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		expect(events(logs)).toContainEqual({ event: 'account_deletion_failed', userId: stuck, code: 'status_503', attempts: 3 });
		expect(events(errors)).toContainEqual({ event: 'account_deletion_overdue', userId: stuck, attempts: 3 });
		logs.mockRestore();
		errors.mockRestore();
		expect(await row(stuck)).toEqual({ attempts: 3, completed: false });
		// No giving up: the next run tries again.
		await actors.db.admin`update app.account_deletions set last_attempt_at = now() - interval '1 hour' where user_id = ${stuck}`;
		const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		quiet.mockRestore();
		expect((await row(stuck)).completed).toBe(true);
	});

	const alertRow = async (userId: string) =>
		(await actors.db.admin<{ details: string; sent: boolean }[]>`
			select details::text as details, sent_at is not null as sent from app.ops_alerts where event = 'account_deletion_overdue' and key = ${userId}`)[0];
	const alerting = { OPS_ALERT_EMAIL: 'ops@example.test' };
	const quiet = () => [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})] as const;
	// Not vi.restoreAllMocks(): it would also remove the fake Auth.
	const loud = (spies: readonly MockInstance[]) => spies.forEach((spy) => spy.mockRestore());

	it('raises account_deletion_overdue at the third failure and delivers it at once', async () => {
		const stuck = await pending(70, 2);
		auth.failNextDelete(503);
		const mailsBefore = auth.mails.length;
		const spies = quiet();
		await resumeAccountDeletions({ ...actors.env, ...alerting }, now);
		loud(spies);
		const row = await alertRow(stuck);
		expect(JSON.parse(row!.details)).toEqual({ userId: stuck, attempts: 3 });
		expect(row!.sent).toBe(true);
		const mail = auth.mails.slice(mailsBefore).find((m) => m.text.includes(stuck));
		expect(mail).toMatchObject({ to: 'ops@example.test', subject: '[Cosa si mangia] Cancellazione di un account bloccata' });
	});

	it('no alert before the third failure', async () => {
		const early = await pending(70, 1);
		auth.failNextDelete(503);
		const spies = quiet();
		await resumeAccountDeletions({ ...actors.env, ...alerting }, now);
		loud(spies);
		expect(await alertRow(early)).toBeUndefined();
	});

	it('the resume completes when the alert table fails', async () => {
		const stuck = await pending(70, 2);
		alertsFailing.add(stuck);
		auth.failNextDelete(503);
		const spies = quiet();
		await expect(resumeAccountDeletions({ ...actors.env, ...alerting }, now)).resolves.toBeUndefined();
		const errors = events(spies[1]);
		loud(spies);
		alertsFailing.delete(stuck);
		expect(errors).toContainEqual({ event: 'ops_alert_insert_failed', alert: 'account_deletion_overdue', code: '42501' });
		expect(await row(stuck)).toEqual({ attempts: 3, completed: false });
		expect(await alertRow(stuck)).toBeUndefined();
	});

	it('the resume completes when the mail transport fails: the alert waits for the next delivery', async () => {
		const stuck = await pending(70, 2);
		auth.failNextDelete(503);
		auth.failNextMail(500);
		const spies = quiet();
		await expect(resumeAccountDeletions({ ...actors.env, ...alerting }, now)).resolves.toBeUndefined();
		loud(spies);
		expect(await row(stuck)).toEqual({ attempts: 3, completed: false });
		expect((await alertRow(stuck))?.sent).toBe(false);
	});

	it('logs no email, name or token', async () => {
		const idle = await pending(6);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		expect(JSON.stringify(logs.mock.calls)).not.toContain('@');
		logs.mockRestore();
		expect((await row(idle)).completed).toBe(true);
	});
});
