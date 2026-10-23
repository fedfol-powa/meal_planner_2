import { call, ORPCError } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapErrors } from '../../src/errors.ts';
import { router } from '../../src/router.ts';
import { contextFor } from '../support/context.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { createTestKeys, type TestKeys } from '../support/keys.ts';
import { menuFixtures } from '../support/menu.ts';

async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

type Op = 'getNewWeek' | 'markWeekSeen' | 'getWeek' | 'getOpening';

// Thursday 22 October 2026, 10:00 in Rome: the week of the 26th is due since Wednesday 20:00.
const THURSDAY = new Date('2026-10-22T08:00:00Z');

/** The green dot of the new week (spec W24, sections 3 and 5.1). */
describe.skipIf(!hasDatabase)('menu new week', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let reader: { userId: string; sessionId: string; token: string };
	let other: { userId: string; sessionId: string; token: string };
	let fx: ReturnType<typeof menuFixtures>;

	const userWithToken = async () => {
		const user = await db.createUser();
		return { ...user, token: await keys.sign({ sub: user.userId, session_id: user.sessionId }) };
	};

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
		reader = await userWithToken();
		other = await userWithToken();
	});
	afterAll(() => db?.close());

	const as = (user: { token: string }, op: Op, input: Record<string, unknown>, now = THURSDAY) =>
		call(router.menu[op] as any, input, {
			context: contextFor(keys, user.token, db.appServerUrl, () => now),
			path: ['menu', op],
			interceptors: [mapErrors],
		}) as Promise<any>;
	const read = (op: Op, input: Record<string, unknown>, now = THURSDAY) => as(reader, op, input, now);

	/** A family of the reader and the other user, created on 1 October. */
	const oldFamily = async () => {
		const familyId = await db.createFamily([
			{ userId: reader.userId, role: 'member' },
			{ userId: other.userId, role: 'member' },
		]);
		await fx.setFamilyCreatedAt(familyId, '2026-10-01T08:00:00Z');
		return familyId;
	};
	const views = async () => (await db.admin<{ n: number }[]>`select count(*)::int as n from app.menu_week_views`)[0]!.n;
	const weekCount = async (familyId: string, startsOn: string) =>
		(await db.admin<{ n: number }[]>`select count(*)::int as n from app.weeks where family_id = ${familyId} and starts_on = ${startsOn}`)[0]!.n;

	it('shows the new week until the person marks it seen, for that person only', async () => {
		const familyId = await oldFamily();
		await fx.insertWeek(familyId, '2026-10-19');
		await fx.insertWeek(familyId, '2026-10-26');
		expect(await read('getNewWeek', { familyId })).toEqual({ weekStartsOn: '2026-10-26' });
		expect(await read('markWeekSeen', { familyId, weekStartsOn: '2026-10-26' })).toEqual({ ok: true });
		expect(await read('getNewWeek', { familyId })).toEqual({ weekStartsOn: null });
		// Idempotent.
		expect(await read('markWeekSeen', { familyId, weekStartsOn: '2026-10-26' })).toEqual({ ok: true });
		expect(await as(other, 'getNewWeek', { familyId })).toEqual({ weekStartsOn: '2026-10-26' });
	});

	it('writes nothing for a week other than the new one', async () => {
		const familyId = await oldFamily();
		await fx.insertWeek(familyId, '2026-10-19');
		await fx.insertWeek(familyId, '2026-10-26');
		const before = await views();
		expect(await read('markWeekSeen', { familyId, weekStartsOn: '2026-10-19' })).toEqual({ ok: true });
		expect(await read('markWeekSeen', { familyId, weekStartsOn: '2026-11-02' })).toEqual({ ok: true });
		expect(await views()).toBe(before);
		expect(await read('getNewWeek', { familyId })).toEqual({ weekStartsOn: '2026-10-26' });
	});

	it('leaves the family version unchanged', async () => {
		const familyId = await oldFamily();
		await fx.insertWeek(familyId, '2026-10-19');
		await fx.insertWeek(familyId, '2026-10-26');
		const before = await read('getWeek', { familyId, weekStartsOn: '2026-10-26' });
		await read('markWeekSeen', { familyId, weekStartsOn: '2026-10-26' });
		const after = await read('getWeek', { familyId, weekStartsOn: '2026-10-26', knownVersion: before.version });
		expect(after).toEqual({ unchanged: true, version: before.version });
	});

	it('is forbidden to a non-member', async () => {
		const familyId = await db.createFamily([]);
		await fx.setFamilyCreatedAt(familyId, '2026-10-01T08:00:00Z');
		expect((await errorOf(read('getNewWeek', { familyId }))).code).toBe('forbidden');
		expect((await errorOf(read('markWeekSeen', { familyId, weekStartsOn: '2026-10-26' }))).code).toBe('forbidden');
	});

	it('generates the missing new week first, as the other menu reads', async () => {
		// The Wednesday job failed: the week of the 26th does not exist yet.
		const familyId = await oldFamily();
		await fx.insertWeek(familyId, '2026-10-19');
		expect(await weekCount(familyId, '2026-10-26')).toBe(0);
		expect(await read('getNewWeek', { familyId })).toEqual({ weekStartsOn: '2026-10-26' });
		expect(await weekCount(familyId, '2026-10-26')).toBe(1);
	});

	it('runs alongside getOpening: the family lock creates the week once', async () => {
		const familyId = await oldFamily();
		await fx.insertWeek(familyId, '2026-10-19');
		const [newWeek] = await Promise.all([read('getNewWeek', { familyId }), read('getOpening', { familyId, today: '2026-10-22' })]);
		expect(newWeek).toEqual({ weekStartsOn: '2026-10-26' });
		expect(await weekCount(familyId, '2026-10-26')).toBe(1);
	});
});
