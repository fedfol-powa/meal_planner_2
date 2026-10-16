import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { resumeAccountDeletions } from '../src/account/resume.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';

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
	afterAll(async () => {
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

	it('logs no email, name or token', async () => {
		const idle = await pending(6);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await resumeAccountDeletions(actors.env, now);
		expect(JSON.stringify(logs.mock.calls)).not.toContain('@');
		logs.mockRestore();
		expect((await row(idle)).completed).toBe(true);
	});
});
