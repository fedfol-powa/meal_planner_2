import postgres from 'postgres';
import type { Claims, Env } from './auth.ts';

export type Tx = postgres.TransactionSql;

/**
 * Runs `fn` in a transaction acting as the user: RLS policies and `auth.uid()` see the
 * verified claims. `set local` keeps role and claims inside this transaction, so they never
 * leak to the next request that reuses the same pooled connection.
 */
export async function withUserDb<T>(env: Env, claims: Claims, fn: (tx: Tx) => Promise<T>): Promise<T> {
	// One client per request: Hyperdrive owns the real pool.
	const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false });
	try {
		return (await sql.begin(async (tx) => {
			await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
			await tx`set local role authenticated`;
			return fn(tx);
		})) as T;
	} finally {
		await sql.end();
	}
}
