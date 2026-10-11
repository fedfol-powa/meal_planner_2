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

type Read = 'getOpening' | 'getWeek' | 'getDates';

describe.skipIf(!hasDatabase)('menu reads', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let reader: { userId: string; sessionId: string };
	let readerToken: string;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		reader = await db.createUser();
		readerToken = await keys.sign({ sub: reader.userId, session_id: reader.sessionId });
	});
	afterAll(() => db?.close());

	const memberFamily = () => db.createFamily([{ userId: reader.userId, role: 'member' }]);
	const read = (op: Read, input: Record<string, unknown>, now: Date) =>
		call(router.menu[op] as any, input, {
			context: contextFor(keys, readerToken, db.appServerUrl, () => now),
			path: ['menu', op],
			interceptors: [mapErrors],
		}) as Promise<any>;

	it('opens in the five cases of the spec', async () => {
		const fx = menuFixtures(db);
		const now = new Date('2026-10-13T08:00:00Z');
		const opening = async (familyId: string) => (await read('getOpening', { familyId, today: '2026-10-13' }, now)).data;
		// 1. no weeks: no_weeks
		expect(await opening(await memberFamily())).toEqual({ kind: 'no_weeks' });
		// 2. first day from today with content
		const content = await memberFamily();
		const w2 = await fx.insertWeek(content, '2026-10-12');
		await fx.insertSlot(w2, { date: '2026-10-13', mealType: 'lunch' });
		await fx.insertSlot(w2, { date: '2026-10-15', mealType: 'dinner', freeText: 'Pizza' });
		expect(await opening(content)).toEqual({ kind: 'day', date: '2026-10-15', weekStartsOn: '2026-10-12' });
		// 3. only empty slots from today: the first of them ("No suitable recipe" stays visible)
		const empty = await memberFamily();
		const w3 = await fx.insertWeek(empty, '2026-10-12');
		await fx.insertSlot(w3, { date: '2026-10-14', mealType: 'lunch' });
		await fx.insertSlot(w3, { date: '2026-10-16', mealType: 'lunch' });
		expect(await opening(empty)).toEqual({ kind: 'day', date: '2026-10-14', weekStartsOn: '2026-10-12' });
		// 4. only earlier slots: the last of them
		const earlier = await memberFamily();
		const w4 = await fx.insertWeek(earlier, '2026-10-05');
		await fx.insertSlot(w4, { date: '2026-10-07', mealType: 'lunch', freeText: 'Fuori' });
		await fx.insertSlot(w4, { date: '2026-10-10', mealType: 'lunch' });
		expect(await opening(earlier)).toEqual({ kind: 'day', date: '2026-10-10', weekStartsOn: '2026-10-05' });
		// 5. weeks without slots: Monday of the latest week
		const bare = await memberFamily();
		await fx.insertWeek(bare, '2026-09-28');
		await fx.insertWeek(bare, '2026-10-05');
		expect(await opening(bare)).toEqual({ kind: 'day', date: '2026-10-05', weekStartsOn: '2026-10-05' });
	});

	it('opens on the family local date without today, and changes the answer when the day changes with no write', async () => {
		const fx = menuFixtures(db);
		const familyId = await memberFamily();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', freeText: 'A' });
		await fx.insertSlot(week, { date: '2026-10-13', mealType: 'lunch', freeText: 'B' });
		// 23:30Z on Monday is already Tuesday in Rome.
		const monday = await read('getOpening', { familyId }, new Date('2026-10-12T08:00:00Z'));
		expect(monday.data).toEqual({ kind: 'day', date: '2026-10-12', weekStartsOn: '2026-10-12' });
		const tuesday = await read('getOpening', { familyId, knownVersion: monday.version }, new Date('2026-10-12T23:30:00Z'));
		expect(tuesday).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13' } });
		const again = await read('getOpening', { familyId, knownVersion: tuesday.version }, new Date('2026-10-13T08:00:00Z'));
		expect(again).toEqual({ unchanged: true, version: tuesday.version });
	});

	it("uses the client's today within a day of the family date and rejects a farther one before answering unchanged", async () => {
		const fx = menuFixtures(db);
		const familyId = await memberFamily();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-16', mealType: 'lunch', freeText: 'C' });
		const now = new Date('2026-10-15T10:00:00Z');
		const { version, data } = await read('getOpening', { familyId, today: '2026-10-16' }, now);
		expect(data).toEqual({ kind: 'day', date: '2026-10-16', weekStartsOn: '2026-10-12' });
		const error = await errorOf(read('getOpening', { familyId, today: '2026-10-20', knownVersion: version }, now));
		expect(error.code).toBe('invalid');
		expect(error.data).toMatchObject({ issues: [{ path: ['today'], code: 'out_of_range' }] });
	});

	it('reads in a family time zone', async () => {
		const fx = menuFixtures(db);
		const familyId = await memberFamily();
		await fx.setTimeZone(familyId, 'America/New_York');
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-12', mealType: 'dinner', freeText: 'A' });
		await fx.insertSlot(week, { date: '2026-10-13', mealType: 'lunch', freeText: 'B' });
		// 02:00Z on Tuesday is still Monday evening in New York.
		expect((await read('getOpening', { familyId }, new Date('2026-10-13T02:00:00Z'))).data).toMatchObject({ date: '2026-10-12' });
	});

	it('lists the days with a menu in a month, empty slots included', async () => {
		const fx = menuFixtures(db);
		const familyId = await memberFamily();
		const week = await fx.insertWeek(familyId, '2026-09-28');
		await fx.insertSlot(week, { date: '2026-09-30', mealType: 'lunch', freeText: 'A' });
		await fx.insertSlot(week, { date: '2026-10-01', mealType: 'lunch' });
		await fx.insertSlot(week, { date: '2026-10-01', mealType: 'dinner', freeText: 'B' });
		await fx.insertSlot(week, { date: '2026-10-04', mealType: 'dinner', freeText: 'C' });
		const result = await read('getDates', { familyId, month: '2026-10' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toEqual(['2026-10-01', '2026-10-04']);
	});

	it('refuses a family the reader does not belong to', async () => {
		const other = await db.createFamily([]);
		const error = await errorOf(read('getOpening', { familyId: other }, new Date('2026-10-13T08:00:00Z')));
		expect(error.code).toBe('forbidden');
	});
});
