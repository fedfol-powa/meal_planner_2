import postgres from 'postgres';

type Sql = postgres.TransactionSql;
/** Runs `work` in a transaction on its own admin connection and keeps it open until `release()`. */
export async function holdTransaction(url: string, work: (tx: Sql) => Promise<void>) {
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	let release!: () => void;
	let ready!: () => void;
	const released = new Promise<void>((r) => (release = r));
	const isReady = new Promise<void>((r) => (ready = r));
	const done = sql.begin(async (tx) => { await work(tx); ready(); await released; }).finally(() => sql.end());
	await isReady;
	return { release: async () => { release(); await done; } };
}
/** As the given app user, inside a held transaction. */
export async function asUser(tx: Sql, userId: string) {
	await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
	await tx`set local role authenticated`;
}
/** Still waiting after a short while: blocked on a lock (the final assertions do not depend on it). */
export const stillPending = (promise: Promise<unknown>) =>
	Promise.race([promise.then(() => false, () => false), new Promise<boolean>((r) => setTimeout(() => r(true), 200))]);
