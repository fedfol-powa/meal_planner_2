import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { durationOf, familyScoresOf, historyOf, originDir, publishable, slug, type OriginRecipe } from './origin.ts';

const origin = (over: Partial<OriginRecipe>): OriginRecipe => ({
	id: 'x', nome: 'X', tipo: 'web', tempo: '20 min', libro: null, porzioni_base: 2,
	ingredienti: [{ nome: 'Ceci', quantita: '200 g' }], feedback: null, tag: [], storico: [], ...over
});

describe('origin data', () => {
	it('slugs Italian names like the prototype', () => {
		expect(slug('Cipolla rossa di Tropea (o 1 cipollotto)')).toBe('cipolla-rossa-di-tropea-o-1-cipollotto');
		expect(slug('Petto di pollo')).toBe('petto-di-pollo');
		expect(slug('Caffè perché più')).toBe('caffe-perche-piu');
	});
	it('reads durations: ranges take the maximum, "+" adds up, text without numbers is unknown', () => {
		expect(durationOf('25-30 min')).toBe(30);
		expect(durationOf('20 min + 40 min forno')).toBe(60);
		expect(durationOf('10-15 min (stimati)')).toBe(15);
		expect(durationOf('Secondo confezione')).toBeNull();
		expect(durationOf(null)).toBeNull();
	});
	it('reads hours and refuses units it does not know', () => {
		expect(durationOf('1 ora')).toBe(60);
		expect(durationOf('1 h')).toBe(60);
		expect(durationOf('1 h 30 min')).toBe(90);
		expect(durationOf('1,5 ore')).toBe(90);
		expect(durationOf('1-2 ore')).toBe(120);
		expect(durationOf('20 minuti + 1 ora di forno')).toBe(80);
		expect(durationOf('2 giorni')).toBeNull();
		expect(durationOf('30')).toBeNull();
	});
	it('keeps only recipes with verified ingredients and reference servings', () => {
		expect(publishable(origin({}))).toBe(true);
		expect(publishable(origin({ ingredienti: null }))).toBe(false);
		expect(publishable(origin({ porzioni_base: null }))).toBe(false);
	});
	it('turns the history into dated meals, skipping meals not cooked and later ones', () => {
		const r = origin({ storico: [
			{ settimana: '2026-09-07', pasto: 'ven-cena', cucinata: true },
			{ settimana: '2026-09-14', pasto: 'lun-pranzo', cucinata: false },
			{ settimana: '2026-10-12', pasto: 'mar-pranzo', cucinata: null }
		] });
		expect(historyOf([r], '2026-10-12')).toEqual([{ date: '2026-09-11', mealType: 'dinner', recipeId: 'x' }]);
	});
	it('converts B feedback to stars', () => {
		expect(familyScoresOf([origin({ id: 'a', feedback: 1 }), origin({ id: 'b', feedback: 4 }), origin({ id: 'c', feedback: null })])).toEqual({ a: 1, b: 5 });
	});
});

describe('originDir', () => {
	const created: string[] = [];
	const tempDir = () => {
		const dir = mkdtempSync(join(tmpdir(), 'origin-'));
		created.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it('finds the origin project next to the repository, also from a worktree under .worktrees/', () => {
		const base = tempDir();
		mkdirSync(join(base, 'meal_planner'));
		mkdirSync(join(base, 'meal_planner_2', '.worktrees', 'branch'), { recursive: true });
		expect(originDir(join(base, 'meal_planner_2'), {})).toBe(join(base, 'meal_planner'));
		expect(originDir(join(base, 'meal_planner_2', '.worktrees', 'branch'), {})).toBe(join(base, 'meal_planner'));
	});
	it('prefers MEAL_PLANNER_ORIGIN and fails clearly when nothing is found', () => {
		const base = tempDir();
		expect(originDir(base, { MEAL_PLANNER_ORIGIN: '/somewhere' })).toBe('/somewhere');
		expect(() => originDir(base, {})).toThrow(/MEAL_PLANNER_ORIGIN/);
	});
});
