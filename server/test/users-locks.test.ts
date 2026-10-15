import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { asUser, holdTransaction, stillPending } from './support/hold.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
const LOCK_WAIT_TIMEOUT_MS = 3000;
/** Nothing listens there: the second connection fails before it can report its backend. */
const UNREACHABLE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/postgres';

describe.skipIf(!hasDatabase)('last app admin under concurrency', () => {
	let actors: Actors;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
	});
	afterAll(() => actors?.close());

	const admins = async (count: number) => {
		const people: string[] = [];
		for (let i = 0; i < count; i++) {
			const person = await actors.user();
			await actors.db.grantGlobalRole(person.userId, 'app_admin');
			people.push(person.userId);
		}
		restore = await onlyAppAdmins(actors.db.admin, people);
		return people;
	};
	const appAdmins = async () =>
		(await actors.db.admin<{ user_id: string }[]>`select user_id from app.user_roles where role = 'app_admin'`).map((r) => r.user_id).sort();

	/**
	 * Starts `target`'s app_admin removal as `caller` on a connection of its own. `pid` resolves with
	 * the backend before the call and rejects if the transaction fails before reporting it;
	 * `outcome` resolves with 'ok' or the SQLSTATE (or the error's message), never rejecting.
	 */
	function removeAs(caller: string, target: string, url = adminUrl) {
		const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
		let gotPid!: (pid: number) => void;
		let noPid!: (error: unknown) => void;
		const pid = new Promise<number>((resolve, reject) => ((gotPid = resolve), (noPid = reject)));
		const outcome = sql
			.begin(async (tx) => {
				const [{ pid: backend }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
				gotPid(backend);
				await asUser(tx, caller);
				await tx`select app.set_user_role(${target}::uuid, 'app_admin', false)`;
			})
			.then(
				() => 'ok',
				(error: { code?: string; message?: string }) => {
					noPid(error); // no effect once the pid was given
					return String(error.code ?? error.message);
				},
			)
			.finally(() => sql.end());
		return { pid, outcome };
	}
	/** True once the backend waits on an advisory lock (the reliable check); false after the timeout. */
	async function waitsOnAdvisoryLock(pid: number): Promise<boolean> {
		const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const [row] = await actors.db.admin<{ wait_event_type: string | null; wait_event: string | null }[]>`
				select wait_event_type, wait_event from pg_stat_activity where pid = ${pid}`;
			if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory') return true;
			await new Promise((r) => setTimeout(r, 20));
		}
		return false;
	}
	/**
	 * First removal held open, second one on its own connection. However the steps end, the first
	 * transaction is released and both outcomes are collected before the test goes on (and before
	 * `afterEach` restores the fixtures): without the lock both transactions still end and the
	 * final count shows the broken invariant. A start-up error is thrown after that, never left pending.
	 */
	async function race(first: [string, string], second: [string, string], secondUrl = adminUrl) {
		// Rejects (nothing to release) if the first removal itself fails: see holdTransaction.
		const held = await holdTransaction(adminUrl, async (tx) => {
			await asUser(tx, first[0]);
			await tx`select app.set_user_role(${first[1]}::uuid, 'app_admin', false)`;
		});
		let removal: ReturnType<typeof removeAs> | undefined;
		let waited = false;
		let pendingAfter200ms = false;
		let stepError: unknown;
		try {
			removal = removeAs(...second, secondUrl);
			pendingAfter200ms = await stillPending(removal.outcome);
			waited = await waitsOnAdvisoryLock(await removal.pid);
		} catch (error) {
			stepError = error;
		}
		// Both settle whatever happens: release errors are collected, not allowed to skip the outcome.
		const [released, code] = await Promise.all([
			held.release().then(() => null, (error: unknown) => error),
			removal ? removal.outcome : Promise.resolve('not started'),
		]);
		if (stepError) throw stepError;
		if (released) throw released;
		return { code, waited, pendingAfter200ms };
	}

	it('runs user transactions in read committed, which the check after the lock relies on', async () => {
		const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
		try {
			const person = await actors.user();
			const claims = { sub: person.userId, role: 'authenticated' as const, session_id: person.sessionId, exp: Math.floor(Date.now() / 1000) + 60 };
			const level = await withDbOn(sql, { kind: 'user', claims }, async (tx) => (await tx<{ transaction_isolation: string }[]>`show transaction_isolation`)[0]!.transaction_isolation);
			expect(level).toBe('read committed');
		} finally {
			await sql.end();
		}
	});

	it('two admins removing each other: the second, already demoted, is refused; one admin remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, b!], [b!, a!]);
		expect(await appAdmins()).toEqual([a]);
		expect(result.code).toBe('42501');
		expect(result.waited).toBe(true);
		expect(result.pendingAfter200ms).toBe(true);
	});

	it('two admins each giving up their own role: the second gets P0A08; one admin remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, a!], [b!, b!]);
		expect(await appAdmins()).toEqual([b]);
		expect(result.code).toBe('P0A08');
		expect(result.waited).toBe(true);
	});

	it('an admin demoted while waiting can no longer remove app_admin', async () => {
		const [a, b, c] = await admins(3);
		const result = await race([a!, b!], [b!, c!]);
		expect(await appAdmins()).toEqual([a, c].sort());
		expect(result.code).toBe('42501');
		expect(result.waited).toBe(true);
	});

	it('a second connection failing before its pid ends the race and releases the first transaction', async () => {
		const [a, b, c] = await admins(3);
		await expect(race([a!, b!], [b!, c!], UNREACHABLE_URL)).rejects.toBeTruthy();
		// The first removal was released (committed): nothing was left open.
		expect(await appAdmins()).toEqual([a, c].sort());
		const [{ open }] = await actors.db.admin<{ open: number }[]>`
			select count(*)::int as open from pg_stat_activity where state like 'idle in transaction%' and pid <> pg_backend_pid()`;
		expect(open).toBe(0);
	});

	it('a failing first removal rejects at once instead of waiting', async () => {
		const [a] = await admins(1);
		const outsider = await actors.user();
		const error = await race([outsider.userId, a!], [a!, a!]).then(() => null, (e: { code?: string }) => e);
		expect(error?.code).toBe('42501');
		expect(await appAdmins()).toEqual([a]);
	});
});
