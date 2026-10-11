import postgres from 'postgres';
import type { Claims } from './auth.ts';

export type Tx = postgres.TransactionSql;

/** Who a transaction acts as. The technical user `app_server` sees nothing by itself. */
export type DbIdentity = { kind: 'user'; claims: Claims } | { kind: 'anon' } | { kind: 'job' };

/**
 * Runs `fn` in a transaction under the chosen role. `set local` and the `true` flag of
 * `set_config` keep role and claims inside this transaction, so they never leak to the
 * next request that reuses the same pooled connection, after a commit or a rollback.
 */
export async function withDbOn<T>(sql: postgres.Sql, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return (await sql.begin(async (tx) => {
		switch (identity.kind) {
			case 'user':
				await tx`select set_config('request.jwt.claims', ${JSON.stringify(identity.claims)}, true)`;
				await tx`set local role authenticated`;
				break;
			case 'anon':
				await tx`set local role anon`;
				break;
			case 'job':
				await tx`set local role app_job`;
				break;
		}
		return fn(tx);
	})) as T;
}

/** One client per request: Hyperdrive owns the real pool. */
export async function withDb<T>(connectionString: string, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T> {
	const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await withDbOn(sql, identity, fn);
	} finally {
		// A failing close must not hide the result or the original error.
		await sql.end().catch(() => {});
	}
}
