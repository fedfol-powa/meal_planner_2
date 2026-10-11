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

type User = { userId: string; sessionId: string };

describe.skipIf(!hasDatabase)('menu.getWeek', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let reader: User;
	let englishReader: User;
	let familyId: string;
	let otherFamily: string;

	// Saturday 10 October 2026: the lazy generation only adds the current week, which these tests ignore.
	const now = new Date('2026-10-10T08:00:00Z');
	const readAs = async (user: User, input: Record<string, unknown>, at = now) =>
		call(router.menu.getWeek as any, input, {
			context: contextFor(keys, await keys.sign({ sub: user.userId, session_id: user.sessionId }), db.appServerUrl, () => at),
			path: ['menu', 'getWeek'],
			interceptors: [mapErrors],
		}) as Promise<any>;
	const read = (input: Record<string, unknown>, at?: Date) => readAs(reader, input, at);
	const mealsOf = (week: any) => week.data.days.flatMap((d: any) => d.meals);
	const on = (meals: any[], date: string, mealType = 'lunch') => meals.find((m: any) => m.date === date && m.mealType === mealType);

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		const fx = menuFixtures(db);
		reader = await db.createUser();
		englishReader = await db.createUser({ locale: 'en-GB' });
		const leaver = await db.createUser();
		familyId = await db.createFamily([
			{ userId: reader.userId, role: 'member' },
			{ userId: englishReader.userId, role: 'member' },
			{ userId: leaver.userId, role: 'member' },
		]);
		otherFamily = await db.createFamily([]);

		const soup = await fx.publishRecipe({ name: 'Zuppa', publishedAt: '2026-01-10T00:00:00Z' });
		await fx.publishVersion(soup, '2026-01-20T12:00:00Z');
		const draft = await fx.draftRecipe('Bozza');
		const past = await fx.insertWeek(familyId, '2026-01-12');
		await fx.insertSlot(past, { date: '2026-01-12', mealType: 'dinner', recipeId: soup });
		await fx.insertSlot(past, { date: '2026-01-13', mealType: 'lunch', recipeId: draft });
		await fx.insertSlot(past, { date: '2026-01-14', mealType: 'lunch', freeText: 'Pizza' });
		await fx.insertSlot(past, { date: '2026-01-14', mealType: 'dinner' });
		await fx.insertSlot(past, { date: '2026-01-15', mealType: 'lunch', freeText: 'Fuori', updatedBy: leaver.userId });
		await fx.insertSlot(past, { date: '2026-01-16', mealType: 'lunch', freeText: 'Avanzi', updatedBy: reader.userId });
		await fx.insertSlot(past, { date: '2026-01-17', mealType: 'lunch', recipeId: soup, servings: 4 });
		await fx.insertSlot(past, { date: '2026-01-17', mealType: 'dinner', recipeId: soup, servings: 2 });
		await fx.insertSlot(past, { date: '2026-01-18', mealType: 'lunch', recipeId: soup, servings: 0 });
		await db.admin`delete from app.family_members where family_id = ${familyId} and user_id = ${leaver.userId}`;
		const future = await fx.insertWeek(familyId, '2099-01-05');
		await fx.insertSlot(future, { date: '2099-01-05', mealType: 'lunch', recipeId: soup });
	});
	afterAll(() => db?.close());

	it('composes seven days with recipe, free and empty meals, R1 versions and the last change', async () => {
		const week = await read({ familyId, weekStartsOn: '2026-01-12' });
		const meals = mealsOf(week);
		expect(week.data.startsOn).toBe('2026-01-12');
		expect(week.data.days.map((d: any) => d.date)).toEqual(['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16', '2026-01-17', '2026-01-18']);
		expect(on(meals, '2026-01-12', 'dinner').recipe.name).toBe('Zuppa'); // version 1, not "Zuppa v2"
		expect(on(meals, '2026-01-12', 'dinner')).toMatchObject({ kind: 'recipe', canOpenRecipe: true, rating: { familyCount: 0, myStars: null } });
		expect(on(meals, '2026-01-12', 'dinner').ingredients).toHaveLength(1);
		expect(on(meals, '2026-01-13')).toMatchObject({ kind: 'recipe', ingredients: null, rating: null, canOpenRecipe: false, recipe: { name: 'Bozza' } });
		expect(on(meals, '2026-01-14')).toMatchObject({ kind: 'free', freeText: 'Pizza', recipe: null, ingredients: null, rating: null });
		expect(on(meals, '2026-01-14', 'dinner')).toMatchObject({ kind: 'empty', recipe: null, freeText: null, ingredients: null });
		expect(week.data.days[2].meals.map((m: any) => m.mealType)).toEqual(['lunch', 'dinner']);
		expect(on(meals, '2026-01-15').lastChange).toEqual({ userName: null, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) });
		expect(on(meals, '2026-01-16').lastChange.userName).toEqual(expect.any(String));
		expect(on(meals, '2026-01-12', 'dinner').lastChange).toBeNull();
	});

	it('builds one RecipeRef per meal with its servings: different servings, different lines; zero servings at the reference servings', async () => {
		const meals = mealsOf(await read({ familyId, weekStartsOn: '2026-01-12' }));
		// The fixture document has 2 reference servings and 100 g per line.
		expect(on(meals, '2026-01-17', 'lunch').ingredients[0].amount).toBe('200 g');
		expect(on(meals, '2026-01-17', 'dinner').ingredients[0].amount).toBe('100 g');
		expect(on(meals, '2026-01-18', 'lunch')).toMatchObject({ servings: 0, ingredients: [{ amount: '100 g' }] });
	});

	it("shows the current version for future meals, in the reader's language", async () => {
		const italian = await read({ familyId, weekStartsOn: '2099-01-05' });
		expect(italian.data.days[0].meals[0].recipe.name).toBe('Zuppa v2');
		const english = await readAs(englishReader, { familyId, weekStartsOn: '2099-01-05' });
		expect(english.data.days[0].meals[0].recipe.name).toBe('Zuppa (en)');
	});

	it('answers not_found for a missing week and forbidden for another family', async () => {
		expect((await errorOf(read({ familyId, weekStartsOn: '2030-01-07' }))).code).toBe('not_found');
		expect((await errorOf(read({ familyId: otherFamily, weekStartsOn: '2026-01-12' }))).code).toBe('forbidden');
	});

	it('generates the current week on its first read and shows it', async () => {
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
		const fresh = await db.createFamily([{ userId: reader.userId, role: 'member' }]);
		const week = await read({ familyId: fresh, weekStartsOn: '2026-10-12' }, new Date('2026-10-13T08:00:00Z'));
		const meals = mealsOf(week);
		expect(meals[0]).toMatchObject({ date: '2026-10-13', mealType: 'lunch' }); // Monday was already past
		expect(meals.every((m: any) => m.lastChange === null)).toBe(true);
	});
});

/** R1 and the cache (review of PR #15): the version of getWeek follows the meals that pass, at the instant R1 uses. */
describe.skipIf(!hasDatabase)('menu.getWeek across the meal thresholds', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let reader: User;
	let familyId: string;
	let soup: string;
	let stew: string;
	let fx: ReturnType<typeof menuFixtures>;

	const read = async (at: string, knownVersion?: string) =>
		call(router.menu.getWeek as any, { familyId, weekStartsOn: '2026-10-12', ...(knownVersion ? { knownVersion } : {}) }, {
			context: contextFor(keys, await keys.sign({ sub: reader.userId, session_id: reader.sessionId }), db.appServerUrl, () => new Date(at)),
			path: ['menu', 'getWeek'],
			interceptors: [mapErrors],
		}) as Promise<any>;
	const nameOn = (week: any, mealType: string) => week.data.days[2].meals.find((m: any) => m.mealType === mealType).recipe.name;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		fx = menuFixtures(db);
		reader = await db.createUser();
		familyId = await db.createFamily([{ userId: reader.userId, role: 'member' }]);
		soup = await fx.publishRecipe({ name: 'Zuppa', publishedAt: '2026-01-01T00:00:00Z' });
		stew = await fx.publishRecipe({ name: 'Stufato', publishedAt: '2026-01-01T00:00:00Z' });
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-14', mealType: 'lunch', recipeId: soup });
		await fx.insertSlot(week, { date: '2026-10-14', mealType: 'dinner', recipeId: stew });
		await fx.insertWeek(familyId, '2026-10-19'); // no lazy generation in between
	});
	afterAll(() => db?.close());

	it('answers fresh when a meal passes after a concurrent publication, at 15:30 and at 23:00', async () => {
		// Rome, Wednesday 14 October: lunch passes at 13:30Z, dinner at 21:00Z.
		const first = await read('2026-10-14T13:29:59Z');
		expect(nameOn(first, 'lunch')).toBe('Zuppa');
		// A read that began just before 15:30 sees a version published just after it: lunch still open, current version.
		await fx.publishVersion(soup, '2026-10-14T13:30:01Z');
		const racing = await read('2026-10-14T13:29:59Z', first.version);
		expect(nameOn(racing, 'lunch')).toBe('Zuppa v2');
		// Once lunch has passed nothing else changed, yet the answer must show the version in force at 15:30.
		const passed = await read('2026-10-14T13:31:00Z', racing.version);
		expect(passed.unchanged).toBe(false);
		expect(nameOn(passed, 'lunch')).toBe('Zuppa');
		expect(await read('2026-10-14T13:45:00Z', passed.version)).toEqual({ unchanged: true, version: passed.version });

		await fx.publishVersion(stew, '2026-10-14T21:00:01Z');
		const racingDinner = await read('2026-10-14T20:59:59Z', passed.version);
		expect(nameOn(racingDinner, 'dinner')).toBe('Stufato v2');
		const dinnerPassed = await read('2026-10-14T21:01:00Z', racingDinner.version);
		expect(dinnerPassed.unchanged).toBe(false);
		expect(nameOn(dinnerPassed, 'dinner')).toBe('Stufato');
		expect(await read('2026-10-14T21:30:00Z', dinnerPassed.version)).toEqual({ unchanged: true, version: dinnerPassed.version });
	});
});
