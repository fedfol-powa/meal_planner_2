import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb, withDbOn } from '../src/db.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('withDb', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	const userClaims = (userId: string, sessionId: string) => ({
		sub: userId,
		role: 'authenticated' as const,
		session_id: sessionId,
		exp: Math.floor(Date.now() / 1000) + 3600,
	});

	it('acts as the user with the claims', async () => {
		const { userId, sessionId } = await db.createUser();
		const [row] = await withDb(db.appServerUrl, { kind: 'user', claims: userClaims(userId, sessionId) }, (tx) =>
			tx<{ role: string; uid: string }[]>`select current_user as role, auth.uid()::text as uid`,
		);
		expect(row).toEqual({ role: 'authenticated', uid: userId });
	});

	it('acts as anon and as the job role', async () => {
		const anon = await withDb(db.appServerUrl, { kind: 'anon' }, (tx) => tx<{ role: string }[]>`select current_user as role`);
		const job = await withDb(db.appServerUrl, { kind: 'job' }, (tx) => tx<{ role: string }[]>`select current_user as role`);
		expect(anon[0].role).toBe('anon');
		expect(job[0].role).toBe('app_job');
	});

	async function stateAfter(sql: postgres.Sql) {
		const [row] = await sql<{ role: string; claims: string | null }[]>`
			select current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims`;
		return row;
	}

	it('leaves nothing behind on a reused connection after a commit', async () => {
		const { userId, sessionId } = await db.createUser();
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await withDbOn(sql, { kind: 'user', claims: userClaims(userId, sessionId) }, async () => {});
			expect(await stateAfter(sql)).toEqual({ role: 'app_server', claims: null });
		} finally {
			await sql.end();
		}
	});

	it('leaves nothing behind on a reused connection after a rollback', async () => {
		const { userId, sessionId } = await db.createUser();
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await expect(
				withDbOn(sql, { kind: 'user', claims: userClaims(userId, sessionId) }, async (tx) => {
					await tx`select 1`;
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');
			expect(await stateAfter(sql)).toEqual({ role: 'app_server', claims: null });
		} finally {
			await sql.end();
		}
	});

	it('sees no table as app_server without a chosen role', async () => {
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await expect(sql`select * from app.profiles`).rejects.toThrow(/permission denied/);
		} finally {
			await sql.end();
		}
	});
});
