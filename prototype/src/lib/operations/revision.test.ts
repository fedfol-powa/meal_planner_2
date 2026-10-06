import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { setMealCooked } from './meals';
import { rankCandidates } from './suggestions';
import {
	excludeRecipe,
	includeRecipe,
	proposeAnother,
	replaceMealRecipe,
	setMealFree,
	setMealNote,
	getFreeTextSuggestions,
	setMealServings,
	swapMeals,
	undoMealChanges
} from './revision';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const slotOf = (id: string) => db.weeks.flatMap((w) => w.slots).find((s) => s.id === id)!;
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

beforeEach(() => { db = createInitial().db; });

describe('replaceMealRecipe', () => {
	it('replaces the dish, records author, time and a change row, and shows the last change', () => {
		const result = value(replaceMealRecipe(db, ctx({ userId: 'user-anna' }), '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'));
		const slot = slotOf('2026-10-07-dinner');
		expect(slot).toMatchObject({ recipeId: 'frittata-forno-bietole-ricotta', freeText: null, updatedBy: 'user-anna', updatedAt: '2026-10-06T12:00' });
		expect(result.meal.recipe?.id).toBe('frittata-forno-bietole-ricotta');
		expect(result.meal.lastChange).toEqual({ userName: 'Anna', at: '2026-10-06T12:00' });
		expect(db.mealChanges).toHaveLength(1);
		expect(db.mealChanges[0]).toMatchObject({ slotId: slot.id, actorId: 'user-anna', channel: 'web', before: { recipeId: 'hamburger-cavallo' }, after: { recipeId: 'frittata-forno-bietole-ricotta' } });
		expect(result.changeIds).toEqual([db.mealChanges[0].id]);
	});

	it('turns a free or empty slot into a recipe and resets "not cooked"', () => {
		const free = slotOf('2026-10-10-dinner');
		value(replaceMealRecipe(db, ctx(), free.id, 'frittata-forno-bietole-ricotta'));
		expect(free).toMatchObject({ recipeId: 'frittata-forno-bietole-ricotta', freeText: null });
		const past = slotOf('2026-10-05-dinner');
		value(setMealCooked(db, ctx(), past.id, false));
		value(replaceMealRecipe(db, ctx(), past.id, 'frittata-forno-bietole-ricotta'));
		expect(past.cooked).toBeNull();
	});

	it('refuses recipes the family cannot see', () => {
		const draft = db.recipes.find((r) => r.status === 'draft')!;
		expect(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', draft.id)).toEqual({ ok: false, error: 'not_found' });
	});

	it('lets the last save win without any conflict', () => {
		value(replaceMealRecipe(db, ctx({ userId: 'user-anna', now: '2026-10-06T11:00' }), '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'));
		value(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', 'pasta-tonno'));
		expect(slotOf('2026-10-07-dinner')).toMatchObject({ recipeId: 'pasta-tonno', updatedBy: 'user-federico' });
		expect(db.mealChanges).toHaveLength(2);
	});
});

describe('guards on every write', () => {
	const writes = [
		(c: OperationContext) => replaceMealRecipe(db, c, '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'),
		(c: OperationContext) => proposeAnother(db, c, '2026-10-07-dinner'),
		(c: OperationContext) => setMealServings(db, c, '2026-10-07-dinner', 3),
		(c: OperationContext) => swapMeals(db, c, '2026-10-07-dinner', '2026-10-08-dinner'),
		(c: OperationContext) => setMealFree(db, c, '2026-10-07-dinner', 'Pizza'),
		(c: OperationContext) => setMealNote(db, c, '2026-10-07-dinner', 'Nota'),
		(c: OperationContext) => excludeRecipe(db, c, 'frittata-forno-bietole-ricotta')
	];
	it('fails offline and for other families without touching the state', () => {
		const snapshot = JSON.stringify(db);
		for (const write of writes) {
			expect(write(ctx({ offline: true }))).toEqual({ ok: false, error: 'offline' });
			expect(write(ctx({ userId: 'user-tom', familyId: 'family-grandparents' }))).toEqual({ ok: false, error: 'forbidden' });
		}
		expect(JSON.stringify(db)).toBe(snapshot);
	});

	it('does not reach slots of a week not yet visible', () => {
		expect(setMealNote(db, ctx(), '2026-10-14-lunch', 'x')).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('proposeAnother', () => {
	it('moves to the next ranked candidate', () => {
		const ranked = rankCandidates(db, ctx(), slotOf('2026-10-07-dinner')).map((c) => c.recipeId);
		expect(value(proposeAnother(db, ctx(), '2026-10-07-dinner')).meal.recipe?.id).toBe(ranked[0]);
		expect(value(proposeAnother(db, ctx(), '2026-10-07-dinner')).meal.recipe?.id).toBe(ranked[1]);
	});

	it('reports no candidates', () => {
		for (const r of db.recipes) db.exclusions.push({ familyId: 'family-main', recipeId: r.id, createdBy: 'user-anna', createdAt: '2026-10-06T10:00' });
		expect(proposeAnother(db, ctx(), '2026-10-07-dinner')).toEqual({ ok: false, error: 'no_candidates' });
	});
});

describe('setMealServings, setMealFree, setMealNote', () => {
	it('validates servings between 1 and 20', () => {
		expect(value(setMealServings(db, ctx(), '2026-10-07-dinner', 5)).meal.servings).toBe(5);
		for (const bad of [0, 21, 2.5]) expect(setMealServings(db, ctx(), '2026-10-07-dinner', bad)).toEqual({ ok: false, error: 'invalid' });
	});

	it('marks a meal free with a trimmed text of 1 to 60 characters', () => {
		const meal = value(setMealFree(db, ctx(), '2026-10-07-dinner', '  Cena dai nonni ')).meal;
		expect(meal).toMatchObject({ kind: 'free', freeText: 'Cena dai nonni', recipe: null });
		expect(setMealFree(db, ctx(), '2026-10-07-dinner', '   ')).toEqual({ ok: false, error: 'invalid' });
		expect(setMealFree(db, ctx(), '2026-10-07-dinner', 'x'.repeat(61))).toEqual({ ok: false, error: 'invalid' });
	});

	it('sets and removes a note of up to 200 characters', () => {
		expect(value(setMealNote(db, ctx(), '2026-10-07-dinner', ' Senza cipolla ')).meal.note).toBe('Senza cipolla');
		expect(value(setMealNote(db, ctx(), '2026-10-07-dinner', '')).meal.note).toBeNull();
		expect(setMealNote(db, ctx(), '2026-10-07-dinner', 'x'.repeat(201))).toEqual({ ok: false, error: 'invalid' });
	});
});

describe('swapMeals', () => {
	it('swaps dish and note, keeps servings with the slot, and records two changes', () => {
		const a = slotOf('2026-10-07-dinner');
		const b = slotOf('2026-10-08-lunch');
		const [servingsA, servingsB] = [a.servings, b.servings];
		const result = value(swapMeals(db, ctx(), a.id, b.id));
		expect(a).toMatchObject({ recipeId: 'spaghetti-riso-tofu-verdure-wok', note: 'Doppia dose, avanza per venerdì', servings: servingsA });
		expect(b).toMatchObject({ recipeId: 'hamburger-cavallo', note: null, servings: servingsB });
		expect(result.changeIds).toHaveLength(2);
	});

	it('swaps with a free slot', () => {
		value(swapMeals(db, ctx(), '2026-10-07-dinner', '2026-10-10-dinner'));
		expect(slotOf('2026-10-07-dinner')).toMatchObject({ recipeId: null, freeText: 'Cena libera' });
		expect(slotOf('2026-10-10-dinner')).toMatchObject({ recipeId: 'hamburger-cavallo', freeText: null });
	});

	it('refuses itself and slots of another week', () => {
		expect(swapMeals(db, ctx(), '2026-10-07-dinner', '2026-10-07-dinner')).toEqual({ ok: false, error: 'invalid' });
		expect(swapMeals(db, ctx(), '2026-10-07-dinner', '2026-09-30-dinner')).toEqual({ ok: false, error: 'invalid' });
	});
});

describe('excludeRecipe and includeRecipe', () => {
	it('excludes once per family, leaves meals untouched, and can be undone', () => {
		value(excludeRecipe(db, ctx(), 'hamburger-cavallo'));
		value(excludeRecipe(db, ctx(), 'hamburger-cavallo'));
		expect(db.exclusions).toEqual([{ familyId: 'family-main', recipeId: 'hamburger-cavallo', createdBy: 'user-federico', createdAt: '2026-10-06T12:00' }]);
		expect(slotOf('2026-10-07-dinner').recipeId).toBe('hamburger-cavallo');
		value(includeRecipe(db, ctx(), 'hamburger-cavallo'));
		expect(db.exclusions).toEqual([]);
	});
});

describe('undoMealChanges', () => {
	it('restores the previous content and records the undo', () => {
		const { changeIds } = value(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'));
		const views = value(undoMealChanges(db, ctx(), changeIds));
		expect(views[0].recipe?.id).toBe('hamburger-cavallo');
		expect(db.mealChanges).toHaveLength(2);
	});

	it('restores both slots of a swap', () => {
		const { changeIds } = value(swapMeals(db, ctx(), '2026-10-07-dinner', '2026-10-08-lunch'));
		value(undoMealChanges(db, ctx(), changeIds));
		expect(slotOf('2026-10-07-dinner').recipeId).toBe('hamburger-cavallo');
		expect(slotOf('2026-10-08-lunch').note).toBe('Doppia dose, avanza per venerdì');
	});

	it('does nothing when someone changed the slot afterwards', () => {
		const { changeIds } = value(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'));
		value(setMealNote(db, ctx({ userId: 'user-anna' }), '2026-10-07-dinner', 'Ci penso io'));
		expect(undoMealChanges(db, ctx(), changeIds)).toEqual({ ok: false, error: 'not_allowed' });
		expect(slotOf('2026-10-07-dinner')).toMatchObject({ recipeId: 'frittata-forno-bietole-ricotta', note: 'Ci penso io' });
	});

	it('only undoes the user\'s own changes', () => {
		const { changeIds } = value(replaceMealRecipe(db, ctx({ userId: 'user-anna' }), '2026-10-07-dinner', 'frittata-forno-bietole-ricotta'));
		expect(undoMealChanges(db, ctx(), changeIds)).toEqual({ ok: false, error: 'not_allowed' });
	});
});

describe('setMealCooked', () => {
	it('goes through the change log', () => {
		value(setMealCooked(db, ctx(), '2026-10-05-dinner', false));
		expect(db.mealChanges.at(-1)).toMatchObject({ before: { cooked: null }, after: { cooked: false } });
	});
});

describe('getFreeTextSuggestions', () => {
	it('lists the family\'s free texts, most used first, without duplicates', () => {
		expect(value(getFreeTextSuggestions(db, ctx()))).toEqual(['Cena libera', 'Pranzo libero', 'Pizza da asporto']);
		expect(value(getFreeTextSuggestions(db, ctx({ userId: 'user-lucia', familyId: 'family-grandparents' })))).toEqual([]);
	});
});
