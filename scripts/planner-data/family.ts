// The curator's family settings, from the origin project's rules (../meal_planner/progetto/REGOLE.md):
// diners matrix, Saturday dinner free, Sunday lunch pizza, quick Monday and Wednesday dinners (20 min),
// pasta only at lunch, fish on Friday, no fishmonger fish on Monday (canned fish allowed, the user on
// 8 October 2026), 7 known and 5 new ± 1, cucumbers as rare
// as possible. Not expressible with the rule templates: no skottle on Monday evening.
import { CREA_RANGES, DEFAULT_KNOWN_NEW, DEFAULT_WEIGHTS, type IngredientRestriction, type PlannerRecipe, type PlannerSettings, type SlotSetting } from '../../domain/src/planner/index.ts';

const slot = (servings: number, fixedText: string | null = null, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText, maxMinutes });

export function curatorFamilySettings(): PlannerSettings {
	return {
		slots: {
			lunch: [slot(2), slot(3), slot(3), slot(3), slot(3), slot(4), slot(4, 'Pizza')],
			dinner: [slot(2, null, 20), slot(4), slot(2, null, 20), slot(4), slot(4), slot(4, 'Cena libera'), slot(4)]
		},
		rules: [
			{ kind: 'only_lunch', dish: 'pasta' },
			{ kind: 'at_least_one', group: 'fish', weekday: 4 },
			{ kind: 'never_fresh_fish', weekday: 0 }
		],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: structuredClone(CREA_RANGES),
		weights: { ...DEFAULT_WEIGHTS }
	};
}

/** Cucumbers are liked little: limited to one recipe a week. */
export function curatorRestrictions(recipes: PlannerRecipe[]): IngredientRestriction[] {
	const cucumbers = new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.ingredientId)).filter((id) => id.startsWith('cetriol')));
	return [...cucumbers].map((ingredientId) => ({ ingredientId, restriction: 'limit', weeklyMax: 1 }));
}
