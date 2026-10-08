// Reads the origin project's recipe book, read only (AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { addDays, mealIndex, type IsoDate, type PastMeal } from '../../domain/src/planner/index.ts';

export interface OriginRecipe {
	id: string;
	nome: string;
	tipo: 'web' | 'youtube' | 'libro' | 'casa';
	tempo?: string | null;
	libro?: { titolo: string } | null;
	porzioni_base: number | null;
	ingredienti: { nome: string; quantita: string | number }[] | null;
	feedback: number | null;
	tag: string[];
	storico?: { settimana: string; pasto: string; cucinata: boolean | null }[] | null;
}

/**
 * The origin project sits next to this repository. From a worktree under .worktrees/ it is three levels
 * up; MEAL_PLANNER_ORIGIN overrides both.
 */
export function originDir(root: string, env: Record<string, string | undefined> = process.env): string {
	if (env.MEAL_PLANNER_ORIGIN) return env.MEAL_PLANNER_ORIGIN;
	const found = [resolve(root, '../meal_planner'), resolve(root, '../../../meal_planner')].find((dir) => existsSync(dir));
	if (!found) throw new Error('Origin project not found next to the repository: set MEAL_PLANNER_ORIGIN');
	return found;
}

export function readOriginRecipes(originDirectory: string): OriginRecipe[] {
	const text = readFileSync(resolve(originDirectory, 'ricettario/ricette.yaml'), 'utf8');
	return (parse(text) as { ricette: OriginRecipe[] }).ricette;
}

/** Same slugs as the prototype demo data. */
export function slug(text: string): string {
	return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const AMOUNT = String.raw`(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(minuti|min|ore|ora|h)\b`;
const number = (text: string) => Number(text.replace(',', '.'));

/**
 * Minutes from the origin's free text: "25-30 min" → 30 (ranges take the maximum), "20 min + 40 min forno"
 * → 60, "1 h 30 min" → 90, "1,5 ore" → 90. Null without numbers, or when a number has no known unit
 * ("2 giorni", "30"): better no duration than a wrong one.
 */
export function durationOf(text: string | null | undefined): number | null {
	if (!text || !/\d/.test(text)) return null;
	let total = 0;
	for (const part of text.split('+')) {
		let rest = part;
		for (const match of part.matchAll(new RegExp(AMOUNT, 'gi'))) {
			const value = Math.max(number(match[1]), match[2] ? number(match[2]) : 0);
			total += /^(ore|ora|h)$/i.test(match[3]) ? value * 60 : value;
			rest = rest.replace(match[0], '');
		}
		if (/\d/.test(rest)) return null;
	}
	return Math.round(total);
}

export function publishable(recipe: OriginRecipe): boolean {
	return (recipe.ingredienti?.length ?? 0) > 0 && !!recipe.porzioni_base;
}

const DAY_KEYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Meals before `before`; meals explicitly not cooked are left out (review R4 still open). */
export function historyOf(recipes: OriginRecipe[], before: IsoDate): PastMeal[] {
	const meals: PastMeal[] = [];
	for (const recipe of recipes) {
		for (const entry of recipe.storico ?? []) {
			if (entry.cucinata === false) continue;
			const [day, meal] = entry.pasto.split('-');
			const date = addDays(String(entry.settimana), DAY_KEYS.indexOf(day));
			if (date >= before) continue;
			meals.push({ date, mealType: meal === 'pranzo' ? 'lunch' : 'dinner', recipeId: recipe.id });
		}
	}
	return meals.sort((a, b) => mealIndex(a.date, a.mealType) - mealIndex(b.date, b.mealType));
}

/** B feedback as the curator's stars (spec section 8): B=1, BB=3, BBB=4, BBBB=5. */
const FEEDBACK_TO_STARS: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

export function familyScoresOf(recipes: OriginRecipe[]): Record<string, number> {
	return Object.fromEntries(recipes.filter((r) => r.feedback !== null && FEEDBACK_TO_STARS[r.feedback]).map((r) => [r.id, FEEDBACK_TO_STARS[r.feedback as number]]));
}
