import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { getMenuDates, getOpeningTarget, getWeekView, pickSelectedDate, resolveWeekStart, setMealCooked } from './meals';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});

beforeEach(() => { db = createInitial().db; });

describe('getOpeningTarget', () => {
	it('opens on today when today has meals', () => {
		expect(getOpeningTarget(db, ctx())).toEqual({ ok: true, value: { kind: 'day', date: '2026-10-06', weekStartsOn: '2026-10-05' } });
	});
	it('opens on the next day with meals when today has none', () => {
		for (const w of db.weeks) w.slots = w.slots.filter((s) => s.date !== '2026-10-06');
		expect(getOpeningTarget(db, ctx())).toMatchObject({ ok: true, value: { date: '2026-10-07' } });
	});
	it('reports no weeks for a family without weeks', () => {
		expect(getOpeningTarget(db, ctx({ familyId: 'family-grandparents' }))).toEqual({ ok: true, value: { kind: 'no_weeks' } });
	});
	it('refuses a family the user does not belong to', () => {
		expect(getOpeningTarget(db, ctx({ userId: 'user-tom', familyId: 'family-grandparents' }))).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('getWeekView', () => {
	it('builds seven days and hides the week not yet generated', () => {
		const view = getWeekView(db, ctx(), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		expect(view.value.days).toHaveLength(7);
		expect(view.value).not.toHaveProperty('status');
		expect(getWeekView(db, ctx(), '2026-10-12')).toEqual({ ok: false, error: 'not_found' });
	});
	it('shows the generated week after Wednesday 20:00', () => {
		expect(getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-12').ok).toBe(true);
	});
	it('marks past meals, free meals, empty slots and last changes', () => {
		const view = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		const meals = view.value.days.flatMap((d) => d.meals);
		expect(meals.find((m) => m.slotId === '2026-10-06-lunch')?.isPast).toBe(true);
		expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.isPast).toBe(false);
		expect(meals.some((m) => m.kind === 'free')).toBe(true);
		expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.lastChange).toEqual({ userName: 'Anna', at: '2026-10-02T21:30' });
		const draft = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-12');
		expect(draft.ok && draft.value.days.flatMap((d) => d.meals).filter((m) => m.kind === 'empty')).toHaveLength(1);
	});
	it('scales ingredients to the slot servings and localises names', () => {
		const view = getWeekView(db, ctx({ userId: 'user-tom' }), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		const meal = view.value.days[1].meals.find((m) => m.kind === 'recipe' && m.ingredients)!;
		const recipe = db.recipes.find((r) => r.id === meal.recipe!.id)!;
		const first = db.ingredients.find((i) => i.id === recipe.ingredients[0].ingredientId)!;
		expect(meal.ingredients![0].name).toBe(first.name['en-GB']);
		expect(meal.recipe!.name).toBe(recipe.name['en-GB']);
		expect(meal.recipe!.translationMissing).toBe(false);
		const line = recipe.ingredients[0].quantity;
		if (line.kind === 'amount') {
			expect(meal.ingredients![0].quantity).toEqual({ ...line, value: (line.value * meal.servings) / recipe.baseServings! });
		}
	});
	it('shows former members as null names', () => {
		db.families[0].members = db.families[0].members.filter((m) => m.userId !== 'user-anna');
		const view = getWeekView(db, ctx(), '2026-10-05');
		const meal = view.ok ? view.value.days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-08-lunch') : null;
		expect(meal?.lastChange?.userName).toBeNull();
	});
	it('treats past meals with unknown cooked as cooked, without any week closing', () => {
		const view = getWeekView(db, ctx(), '2026-09-28');
		if (!view.ok) throw new Error(view.error);
		expect(view.value.days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-02-dinner')?.cooked).toBe(true);
		const future = getWeekView(db, ctx(), '2026-10-05');
		expect(future.ok && future.value.days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-09-dinner')?.cooked).toBeNull();
	});

});

describe('setMealCooked', () => {
	it('marks a past meal as not cooked in a week pending close and records the author', () => {
		expect(setMealCooked(db, ctx(), '2026-10-02-dinner', false)).toMatchObject({ ok: true, value: { cooked: false } });
		const slot = db.weeks.flatMap((w) => w.slots).find((s) => s.id === '2026-10-02-dinner')!;
		expect(slot).toMatchObject({ cooked: false, updatedBy: 'user-federico', updatedAt: '2026-10-06T12:00' });
	});
	it('allows not cooked on past meals of any week, including September', () => {
		expect(setMealCooked(db, ctx(), '2026-09-22-dinner', false)).toMatchObject({ ok: true, value: { cooked: false } });
	});
	it('refuses future meals and offline use', () => {
		expect(setMealCooked(db, ctx(), '2026-10-09-dinner', false)).toEqual({ ok: false, error: 'not_allowed' });
		expect(setMealCooked(db, ctx({ offline: true }), '2026-10-02-dinner', false)).toEqual({ ok: false, error: 'offline' });
	});

});

describe('pickSelectedDate', () => {
	it('keeps the preferred day only if it belongs to the week, else the opening day, else Monday', () => {
		const view = getWeekView(db, ctx(), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		expect(pickSelectedDate(view.value, '2026-10-09', '2026-10-06')).toBe('2026-10-09');
		expect(pickSelectedDate(view.value, '2026-09-30', '2026-10-06')).toBe('2026-10-06');
		expect(pickSelectedDate(view.value, '2026-09-30', '2026-09-30')).toBe('2026-10-05');
		expect(pickSelectedDate(view.value, null, null)).toBe('2026-10-05');
	});
});

describe('getMenuDates', () => {
	it('lists the days that have meals, sorted, without weeks not yet generated', () => {
		const result = getMenuDates(db, ctx());
		if (!result.ok) throw new Error(result.error);
		expect(result.value[0]).toBe('2026-09-21');
		expect(result.value.at(-1)).toBe('2026-10-11');
		expect(new Set(result.value).size).toBe(result.value.length);
		expect([...result.value].sort()).toEqual(result.value);
	});
	it('includes the generated week once visible and refuses non members', () => {
		const later = getMenuDates(db, ctx({ now: '2026-10-08T09:00' }));
		expect(later.ok && later.value.at(-1)).toBe('2026-10-18');
		expect(getMenuDates(db, ctx({ userId: 'user-tom', familyId: 'family-grandparents' }))).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('invalid or hidden days', () => {
	it('returns not_found for a malformed date instead of throwing', () => {
		expect(getWeekView(db, ctx(), 'garbage')).toEqual({ ok: false, error: 'not_found' });
	});
	it('resolves the first candidate day whose week is visible, else the fallback', () => {
		expect(resolveWeekStart(db, ctx(), ['garbage', '2026-10-14', '2026-09-23'], '2026-10-05')).toBe('2026-09-21');
		expect(resolveWeekStart(db, ctx(), [null, '2026-08-03'], '2026-10-05')).toBe('2026-10-05');
	});
});

describe('draft recipes in past meals', () => {
	it('lets curators open the draft but not members, and nobody rate it', () => {
		const slot = db.weeks.find((w) => w.startsOn === '2026-09-28')!.slots.find((s) => s.id === '2026-09-29-lunch')!;
		slot.recipeId = 'polpettine-tacchino-skottle';
		const meal = (userId: string) => {
			const view = getWeekView(db, ctx({ userId }), '2026-09-28');
			if (!view.ok) throw new Error(view.error);
			return view.value.days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-09-29-lunch')!;
		};
		expect(meal('user-federico')).toMatchObject({ canOpenRecipe: true, canRate: false, ingredients: null });
		expect(meal('user-anna')).toMatchObject({ canOpenRecipe: false, canRate: false });
	});
});
