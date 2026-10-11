import type { Tx } from '../../src/db.ts';

/**
 * The transaction, but once its first statement has answered, `after` runs (for example a
 * publication committed on another connection) before the code under test sees the rows.
 */
export function interleaved(tx: Tx, after: () => Promise<unknown>): Tx {
	let done = false;
	return ((strings: TemplateStringsArray, ...values: unknown[]) =>
		(tx as any)(strings, ...values).then(async (rows: unknown) => {
			if (!done) {
				done = true;
				await after();
			}
			return rows;
		})) as unknown as Tx;
}
