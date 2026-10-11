import { call, ORPCError } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

// The controlled point of the generation: these families' generations fail.
const failing = vi.hoisted(() => new Set<string>());
vi.mock('../../src/menu/plan.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu/plan.ts')>();
	return {
		planWeek: (input: { familyId: string }) => {
			if (failing.has(input.familyId)) throw new Error('planner failure');
			return actual.planWeek(input as never);
		},
	};
});

describe.skipIf(!hasDatabase)('menu reads', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let reader: { userId: string; sessionId: string };
	let readerToken: string;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		reader = await db.createUser();
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
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

	const weekStarts = async (familyId: string) =>
		(await db.admin<{ s: string }[]>`select starts_on::text as s from app.weeks where family_id = ${familyId} order by 1`).map((r) => r.s);

	it('generates the rest of the current week on the first opening and opens on today', async () => {
		const familyId = await memberFamily();
		const now = new Date('2026-10-13T14:00:00Z'); // Tuesday 16:00 in Rome: from Tuesday dinner
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, now);
		expect(result).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' } });
		expect(await weekStarts(familyId)).toEqual(['2026-10-12']);
		const [{ first }] = await db.admin<{ first: string }[]>`
			select min(s.date::text || ' ' || s.meal_type) as first from app.meal_slots s join app.weeks w on w.id = s.week_id where w.family_id = ${familyId}`;
		expect(first).toBe('2026-10-13 dinner');
	});

	it('answers with next week after Wednesday 20:00 even to a client holding the old version, then unchanged', async () => {
		const familyId = await memberFamily();
		const before = await read('getOpening', { familyId, today: '2026-10-14' }, new Date('2026-10-14T17:59:00Z'));
		expect(await weekStarts(familyId)).toEqual(['2026-10-12']);
		const after = await read('getOpening', { familyId, today: '2026-10-14', knownVersion: before.version }, new Date('2026-10-14T18:00:00Z'));
		expect(after.unchanged).toBe(false);
		expect(await weekStarts(familyId)).toEqual(['2026-10-12', '2026-10-19']);
		const again = await read('getOpening', { familyId, today: '2026-10-14', knownVersion: after.version }, new Date('2026-10-14T18:05:00Z'));
		expect(again).toEqual({ unchanged: true, version: after.version });
	});

	it('generates on getDates too', async () => {
		const dates = await memberFamily();
		const result = await read('getDates', { familyId: dates, month: '2026-10' }, new Date('2026-10-13T08:00:00Z'));
		expect(await weekStarts(dates)).toEqual(['2026-10-12']);
		expect(result.data).toContain('2026-10-13');
		expect(result.data).not.toContain('2026-10-12'); // Monday's meals were already past
	});

	it('opens on a freshly generated week with no suitable recipe', async () => {
		const familyId = await memberFamily();
		await db.admin`insert into app.recipe_exclusions (family_id, recipe_id) select ${familyId}, id from app.recipes where status = 'published'`;
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toEqual({ kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' });
		const [{ recipes }] = await db.admin<{ recipes: number }[]>`
			select count(s.recipe_id)::int as recipes from app.meal_slots s join app.weeks w on w.id = s.week_id where w.family_id = ${familyId}`;
		expect(recipes).toBe(0);
	});

	it('still reads when the generation fails, and logs it', async () => {
		const familyId = await memberFamily();
		failing.add(familyId);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toEqual({ kind: 'no_weeks' });
		expect(await weekStarts(familyId)).toEqual([]); // the savepoint undid the week
		const events = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(events).toContainEqual({ event: 'lazy_generation_failed', familyId, weekStart: '2026-10-12', code: 'Error' });
		logs.mockRestore();
	});

	it('opens in the five cases of the spec', async () => {
		const fx = menuFixtures(db);
		const now = new Date('2026-10-13T08:00:00Z');
		const opening = async (familyId: string) => (await read('getOpening', { familyId, today: '2026-10-13' }, now)).data;
		// 1. no weeks (generation fails): no_weeks
		const none = await memberFamily();
		failing.add(none);
		expect(await opening(none)).toEqual({ kind: 'no_weeks' });
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
		failing.add(earlier);
		const w4 = await fx.insertWeek(earlier, '2026-10-05');
		await fx.insertSlot(w4, { date: '2026-10-07', mealType: 'lunch', freeText: 'Fuori' });
		await fx.insertSlot(w4, { date: '2026-10-10', mealType: 'lunch' });
		expect(await opening(earlier)).toEqual({ kind: 'day', date: '2026-10-10', weekStartsOn: '2026-10-05' });
		// 5. weeks without slots: Monday of the latest week
		const bare = await memberFamily();
		failing.add(bare);
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
		failing.add(familyId); // only the days written here
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
