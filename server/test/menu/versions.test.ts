import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Claims } from '../../src/auth.ts';
import { withDb } from '../../src/db.ts';
import { mealPassedCount, mealRecipeVersions, mealRecipeVersionsAt } from '../../src/menu/versions.ts';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';

const name = (it: string) => ({ 'it-IT': it, 'en-GB': `${it} (en)` });
const at = (iso: string) => new Date(iso);

/** Every call runs as a family member: the behaviour meant for users (spec section 5, R1). */
describe.skipIf(!hasDatabase)('mealRecipeVersions', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	async function member() {
		const { userId, sessionId } = await db.createUser();
		const familyId = await db.createFamily([{ userId, role: 'member' }]);
		const claims = { sub: userId, role: 'authenticated', session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 } as Claims;
		return { familyId, claims };
	}
	async function weekOf(familyId: string, startsOn: string) {
		const [{ id }] = await db.admin<{ id: string }[]>`
			insert into app.weeks (family_id, starts_on) values (${familyId}, ${startsOn})
			on conflict (family_id, starts_on) do update set starts_on = excluded.starts_on returning id`;
		return id;
	}

	it('uses the version in force when the meal passed, the first one for older meals, the current one for open meals, null for drafts', async () => {
		const cat = catalogueFixture(db);
		const { familyId, claims } = await member();
		const recipe = await cat.recipe({ name: name('Zuppa'), createdAt: at('2026-01-10T00:00:00Z') });
		await cat.publishVersion(recipe, { name: name('Zuppa nuova') }, at('2026-01-20T12:00:00Z'));
		const draft = await cat.draft({ 'it-IT': 'Bozza' });
		const before = await cat.meal(familyId, recipe, '2026-01-05', 'dinner'); // before the first publication
		const atV1 = await cat.meal(familyId, recipe, '2026-01-12', 'dinner');
		const draftSlot = await cat.meal(familyId, draft, '2026-01-13', 'lunch');
		const open = await cat.meal(familyId, recipe, '2026-02-02', 'lunch');
		const past = await weekOf(familyId, '2026-01-12');
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, free_text, servings) values (${past}, '2026-01-14', 'lunch', 'Pizza', 2)`;
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, servings) values (${past}, '2026-01-14', 'dinner', 2)`;

		const read = async (startsOn: string, family = familyId) =>
			withDb(db.appServerUrl, { kind: 'user', claims }, async (tx) =>
				mealRecipeVersionsAt(tx, family, await weekOf(familyId, startsOn), at('2026-01-25T00:00:00Z')),
			);
		expect(await read('2026-01-05')).toEqual([{ slotId: before, recipeId: recipe, version: 1, isPast: true }]);
		expect(await read('2026-01-12')).toEqual([
			{ slotId: atV1, recipeId: recipe, version: 1, isPast: true },
			{ slotId: draftSlot, recipeId: draft, version: null, isPast: true },
		]);
		expect(await read('2026-02-02')).toEqual([{ slotId: open, recipeId: recipe, version: 2, isPast: false }]);
		const stranger = await db.createFamily([]);
		expect(await read('2026-01-12', stranger)).toEqual([]);
	});

	it('switches exactly at 15:30 and 23:00 in the family time zone, for both meals and after a time zone change', async () => {
		const cat = catalogueFixture(db);
		const { familyId, claims } = await member();
		// Rome, Wednesday 14 October 2026 (UTC+2): lunch passes at 13:30Z, dinner at 21:00Z.
		const lunch = await cat.recipe({ name: name('Pranzo'), createdAt: at('2026-01-01T00:00:00Z') });
		await cat.publishVersion(lunch, { name: name('Pranzo v2') }, at('2026-10-14T13:31:00Z'));
		const dinner = await cat.recipe({ name: name('Cena'), createdAt: at('2026-01-01T00:00:00Z') });
		await cat.publishVersion(dinner, { name: name('Cena v2') }, at('2026-10-14T21:01:00Z'));
		const sharp = await cat.recipe({ name: name('Puntuale'), createdAt: at('2026-01-01T00:00:00Z') });
		// Thursday's dinner passes at 21:00Z on the 15th, exactly when its second version is published.
		await cat.publishVersion(sharp, { name: name('Puntuale v2') }, at('2026-10-15T21:00:00Z'));
		await cat.meal(familyId, lunch, '2026-10-14', 'lunch');
		await cat.meal(familyId, dinner, '2026-10-14', 'dinner');
		await cat.meal(familyId, sharp, '2026-10-15', 'dinner');
		const week = await weekOf(familyId, '2026-10-12');

		const read = (iso: string) =>
			withDb(db.appServerUrl, { kind: 'user', claims }, async (tx) =>
				(await mealRecipeVersionsAt(tx, familyId, week, at(iso))).map((v) => [v.recipeId, v.version, v.isPast]),
			);

		expect(await read('2026-10-14T13:29:59Z')).toEqual([[lunch, 2, false], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-14T13:30:00Z')).toEqual([[lunch, 1, true], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-14T13:30:01Z')).toEqual([[lunch, 1, true], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-14T20:59:59Z')).toEqual([[lunch, 1, true], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-14T21:00:00Z')).toEqual([[lunch, 1, true], [dinner, 1, true], [sharp, 2, false]]);
		expect(await read('2026-10-14T21:00:01Z')).toEqual([[lunch, 1, true], [dinner, 1, true], [sharp, 2, false]]);
		// A version published exactly when the meal passes is the one in force.
		expect(await read('2026-10-15T20:59:59Z')).toEqual([[lunch, 1, true], [dinner, 1, true], [sharp, 2, false]]);
		expect(await read('2026-10-15T21:00:00Z')).toEqual([[lunch, 1, true], [dinner, 1, true], [sharp, 2, true]]);

		// New York (UTC-4): lunch on the 14th passes at 19:30Z, after the second version of 13:31Z.
		await db.admin`update app.families set time_zone = 'America/New_York' where id = ${familyId}`;
		expect(await read('2026-10-14T19:29:59Z')).toEqual([[lunch, 2, false], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-14T19:30:00Z')).toEqual([[lunch, 2, true], [dinner, 2, false], [sharp, 2, false]]);
		// Dinner on the 14th passes at 03:00Z on the 15th, after the second version of 21:01Z.
		expect(await read('2026-10-15T02:59:59Z')).toEqual([[lunch, 2, true], [dinner, 2, false], [sharp, 2, false]]);
		expect(await read('2026-10-15T03:00:00Z')).toEqual([[lunch, 2, true], [dinner, 2, true], [sharp, 2, false]]);
	});

	it('counts the meals of the week already past at the same instant, every slot included', async () => {
		const cat = catalogueFixture(db);
		const { familyId, claims } = await member();
		const recipe = await cat.recipe({ name: name('Conta'), createdAt: at('2026-01-01T00:00:00Z') });
		await cat.meal(familyId, recipe, '2026-10-14', 'lunch');
		const week = await weekOf(familyId, '2026-10-12');
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, free_text, servings) values (${week}, '2026-10-14', 'dinner', 'Pizza', 2)`;
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, servings) values (${week}, '2026-10-15', 'lunch', 2)`;
		const count = (iso: string | null, family = familyId) =>
			withDb(db.appServerUrl, { kind: 'user', claims }, (tx) => mealPassedCount(tx, family, week, iso ? at(iso) : null));
		// Rome: lunch on the 14th passes at 13:30Z, dinner at 21:00Z, lunch on the 15th at 13:30Z.
		expect(await count('2026-10-14T13:29:59Z')).toBe(0);
		expect(await count('2026-10-14T13:30:00Z')).toBe(1);
		expect(await count('2026-10-14T20:59:59Z')).toBe(1);
		expect(await count('2026-10-14T21:00:00Z')).toBe(2);
		expect(await count('2026-10-15T13:30:00Z')).toBe(3);
		expect(await count(null)).toBe(0); // the transaction instant, before 2026-10-14
		expect(await count('2026-10-15T13:30:00Z', await db.createFamily([]))).toBe(0);
	});

	it('reads at the transaction instant without an explicit one', async () => {
		const cat = catalogueFixture(db);
		const { familyId, claims } = await member();
		const recipe = await cat.recipe({ name: name('Sempre'), createdAt: at('2020-01-01T00:00:00Z') });
		await cat.publishVersion(recipe, { name: name('Sempre v2') }, at('2020-06-01T00:00:00Z'));
		await cat.meal(familyId, recipe, '2020-03-02', 'lunch');
		await cat.meal(familyId, recipe, '2099-03-02', 'lunch');
		const read = async (startsOn: string) =>
			withDb(db.appServerUrl, { kind: 'user', claims }, async (tx) =>
				(await mealRecipeVersions(tx, familyId, await weekOf(familyId, startsOn))).map((v) => [v.version, v.isPast]),
			);
		expect(await read('2020-03-02')).toEqual([[1, true]]);
		expect(await read('2099-03-02')).toEqual([[2, false]]);
	});
});
