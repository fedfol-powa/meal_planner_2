import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family planner settings', () => {
	let actors: Actors;
	let admin: Actor;
	let other: Actor;
	let member: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		other = await actors.user();
		member = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: admin.userId, role: 'family_admin' },
			{ userId: other.userId, role: 'family_admin' },
			{ userId: member.userId, role: 'member' },
		]);
	});
	beforeEach(async () => {
		await actors.db.admin`update app.families set settings = '{}' where id = ${familyId}`;
	});
	afterAll(() => actors?.close());

	const stored = async () => (await actors.db.admin<{ settings: any }[]>`select settings from app.families where id = ${familyId}`)[0]!.settings;
	const setStored = (value: unknown) => actors.db.admin`update app.families set settings = ${actors.db.admin.json(value as never)} where id = ${familyId}`;

	it('writes one meal under its own key and answers the resolved view', async () => {
		const view = await admin.client.family.setMeal({ familyId, mealType: 'lunch', weekday: 6, servings: 4, fixedText: ' Pizza ', maxMinutes: null });
		expect(view.settings.slots.lunch[6]).toEqual({ servings: 4, fixedText: 'Pizza', maxMinutes: null });
		expect(view.settings.slots.lunch).toHaveLength(7);
		expect(await stored()).toEqual({ slots: { lunch: { '6': { servings: 4, fixedText: 'Pizza', maxMinutes: null } } } });
	});

	it('keeps both of two concurrent changes on different days', async () => {
		await Promise.all([
			admin.client.family.setMeal({ familyId, mealType: 'dinner', weekday: 0, servings: 2, fixedText: null, maxMinutes: 20 }),
			other.client.family.setMeal({ familyId, mealType: 'dinner', weekday: 2, servings: 2, fixedText: null, maxMinutes: 20 }),
			other.client.family.setKnownNew({ familyId, known: 6, new: 4, tolerance: 1 }),
		]);
		const settings = await stored();
		expect(Object.keys(settings.slots.dinner).sort()).toEqual(['0', '2']);
		expect(settings.knownNew).toEqual({ known: 6, new: 4, tolerance: 1 });
	});

	it('adds and removes rules by value, idempotently, also concurrently', async () => {
		const fish = { kind: 'at_least_one' as const, group: 'fish' as const, weekday: 4 };
		const pasta = { kind: 'only_lunch' as const, dish: 'pasta' as const };
		await Promise.all([admin.client.family.addRule({ familyId, rule: fish }), other.client.family.addRule({ familyId, rule: pasta })]);
		expect((await stored()).rules).toHaveLength(2);
		const again = await admin.client.family.addRule({ familyId, rule: fish });
		expect(again.settings.rules).toEqual([pasta, fish]);
		expect((await admin.client.family.removeRule({ familyId, rule: fish })).settings.rules).toEqual([pasta]);
		expect((await admin.client.family.removeRule({ familyId, rule: fish })).settings.rules).toEqual([pasta]);
	});

	it('sets quota and ranges, refusing min above max', async () => {
		expect((await admin.client.family.setKnownNew({ familyId, known: 6, new: 4, tolerance: 1 })).settings.knownNew).toEqual({ known: 6, new: 4, tolerance: 1 });
		expect((await admin.client.family.setGroupRange({ familyId, group: 'fish', min: 1, max: 3 })).settings.groupRanges.fish).toEqual({ min: 1, max: 3 });
		const error = await errorOf(admin.client.family.setGroupRange({ familyId, group: 'fish', min: 4, max: 3 }));
		expect(error.code).toBe('invalid');
		expect(error.data.issues[0].path).toEqual(['min']);
		expect((await stored()).groupRanges.fish).toEqual({ min: 1, max: 3 });
	});

	it('refuses out-of-range meals', async () => {
		for (const bad of [
			{ weekday: 7, servings: 2, fixedText: null, maxMinutes: null },
			{ weekday: 1, servings: 13, fixedText: null, maxMinutes: null },
			{ weekday: 1, servings: 2, fixedText: '  ', maxMinutes: null },
			{ weekday: 1, servings: 2, fixedText: null, maxMinutes: 25 },
		]) {
			expect((await errorOf(admin.client.family.setMeal({ familyId, mealType: 'lunch', ...bad } as never))).code, JSON.stringify(bad)).toBe('invalid');
		}
		expect(await stored()).toEqual({});
	});

	it('is for administrators only', async () => {
		const meal = { familyId, mealType: 'lunch' as const, weekday: 1, servings: 2, fixedText: null, maxMinutes: null };
		expect((await errorOf(member.client.family.setMeal(meal))).code).toBe('forbidden');
		expect((await errorOf(member.client.family.addRule({ familyId, rule: { kind: 'never_fresh_fish', weekday: 0 } }))).code).toBe('forbidden');
		expect(await stored()).toEqual({});
	});

	it('saves over malformed parents, keeping the other valid keys', async () => {
		const cases: [unknown, () => Promise<unknown>, (settings: any) => void][] = [
			[
				{ slots: null },
				() => admin.client.family.setMeal({ familyId, mealType: 'lunch', weekday: 1, servings: 3, fixedText: null, maxMinutes: null }),
				(settings) => expect(settings.slots).toEqual({ lunch: { '1': { servings: 3, fixedText: null, maxMinutes: null } } }),
			],
			[
				{ slots: { lunch: 'broken', dinner: { '0': { servings: 2, fixedText: null, maxMinutes: 20 } } } },
				() => admin.client.family.setMeal({ familyId, mealType: 'lunch', weekday: 2, servings: 1, fixedText: null, maxMinutes: null }),
				(settings) =>
					expect(settings.slots).toEqual({
						lunch: { '2': { servings: 1, fixedText: null, maxMinutes: null } },
						dinner: { '0': { servings: 2, fixedText: null, maxMinutes: 20 } },
					}),
			],
			[
				{ groupRanges: [1, 2], knownNew: { known: 6, new: 4, tolerance: 1 } },
				() => admin.client.family.setGroupRange({ familyId, group: 'eggs', min: 1, max: 2 }),
				(settings) => {
					expect(settings.groupRanges).toEqual({ eggs: { min: 1, max: 2 } });
					expect(settings.knownNew).toEqual({ known: 6, new: 4, tolerance: 1 });
				},
			],
			[
				{ rules: 'none' },
				() => admin.client.family.addRule({ familyId, rule: { kind: 'never_fresh_fish', weekday: 0 } }),
				(settings) => expect(settings.rules).toEqual([{ kind: 'never_fresh_fish', weekday: 0 }]),
			],
		];
		for (const [broken, save, check] of cases) {
			await setStored(broken);
			// The page shows defaults for the malformed parts…
			expect((await member.client.family.getSettings({ familyId })).unchanged).toBe(false);
			// …and the next save really lands.
			await save();
			check(await stored());
		}
	});

	it('never exposes or changes the weights', async () => {
		await setStored({ weights: { liking: 5 } });
		const view = await admin.client.family.setKnownNew({ familyId, known: 7, new: 5, tolerance: 1 });
		expect(view.settings).not.toHaveProperty('weights');
		expect((await stored()).weights).toEqual({ liking: 5 });
	});

	it('bumps the family version', async () => {
		const before = await member.client.family.getSettings({ familyId });
		await admin.client.family.setMeal({ familyId, mealType: 'dinner', weekday: 3, servings: 0, fixedText: null, maxMinutes: null });
		expect((await member.client.family.getSettings({ familyId, knownVersion: before.version })).unchanged).toBe(false);
	});
});
