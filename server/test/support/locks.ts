import postgres from 'postgres';
import type { TestDatabase } from './db.ts';

type Sql = postgres.TransactionSql;
const LOCK_WAIT_TIMEOUT_MS = 3000;

/**
 * Runs `work` in a transaction on a connection of its own. `pid` resolves with the backend before
 * the work starts; `outcome` resolves with the work's result as `{ ok }` or `{ code }` (the SQLSTATE
 * or the message), never rejecting.
 */
export function startTransaction<T>(url: string, work: (tx: Sql) => Promise<T>) {
	const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
	let gotPid!: (pid: number) => void;
	let noPid!: (error: unknown) => void;
	const pid = new Promise<number>((resolve, reject) => ((gotPid = resolve), (noPid = reject)));
	const outcome = sql
		.begin(async (tx) => {
			const [{ pid: backend }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
			gotPid(backend);
			return work(tx);
		})
		.then(
			(ok) => ({ ok: ok as T, code: undefined }),
			(error: { code?: string; message?: string }) => {
				noPid(error);
				return { ok: undefined, code: String(error.code ?? error.message) };
			},
		)
		.finally(() => sql.end());
	return { pid, outcome };
}

/**
 * True once the backend waits on a lock (`wait_event_type = 'Lock'`), of the given event when set
 * (`advisory`, `tuple`, `transactionid`); false after the timeout.
 */
export async function waitsOnLock(db: TestDatabase, pid: number, events?: string[]): Promise<boolean> {
	const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const [row] = await db.admin<{ wait_event_type: string | null; wait_event: string | null }[]>`
			select wait_event_type, wait_event from pg_stat_activity where pid = ${pid}`;
		if (row?.wait_event_type === 'Lock' && (!events || events.includes(row.wait_event ?? ''))) return true;
		await new Promise((r) => setTimeout(r, 20));
	}
	return false;
}

/** As the given app user (or anon), inside a transaction. */
export async function actAs(tx: Sql, userId: string | null, claims: Record<string, unknown> = {}) {
	if (userId === null) {
		await tx`set local role anon`;
		return;
	}
	await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated', ...claims })}, true)`;
	await tx`set local role authenticated`;
}
