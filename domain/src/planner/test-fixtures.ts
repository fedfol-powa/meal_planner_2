import { creaRanges, DEFAULT_KNOWN_NEW, DEFAULT_WEIGHTS } from './settings.ts';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, type PlannerInput, type PlannerRecipe, type PlannerSettings, type SlotSetting } from './types.ts';

export function recipe(id: string, over: Partial<PlannerRecipe> = {}): PlannerRecipe {
	return {
		id,
		durationMinutes: 20,
		mealType: 'both',
		proteinGroup: 'vegetarian',
		isFreshFish: false,
		carbohydrateGroup: 'none',
		category: 'other',
		hasVegetables: true,
		isHeavy: false,
		seasons: [],
		primaryIngredientId: null,
		ingredients: [],
		bookId: null,
		...over
	};
}

const slot = (servings: number, fixedText: string | null = null, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText, maxMinutes });

/** Shaped like the curator's family (origin REGOLE.md): 12 planned meals, Friday fish, no fresh fish on Monday. */
export function familySettings(): PlannerSettings {
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
		groupRanges: creaRanges(),
		weights: { ...DEFAULT_WEIGHTS }
	};
}

/** A varied catalogue: protein, carbohydrate, category and time cycle with the index. */
export function syntheticCatalogue(size = 60): PlannerRecipe[] {
	return Array.from({ length: size }, (_, i) => {
		const carbohydrateGroup = CARBOHYDRATE_GROUPS[i % CARBOHYDRATE_GROUPS.length];
		return recipe(`r${String(i).padStart(2, '0')}`, {
			proteinGroup: PROTEIN_GROUPS[i % PROTEIN_GROUPS.length],
			isFreshFish: PROTEIN_GROUPS[i % PROTEIN_GROUPS.length] === 'fish' && i % 3 !== 0,
			carbohydrateGroup,
			category: CATEGORIES[(i * 3) % CATEGORIES.length],
			durationMinutes: [10, 15, 20, 25, 30, 40][i % 6],
			mealType: carbohydrateGroup === 'pasta' ? 'lunch' : (['both', 'both', 'dinner', 'lunch'] as const)[i % 4],
			isHeavy: i % 9 === 0,
			hasVegetables: i % 4 !== 0,
			primaryIngredientId: `ingredient-${i % 15}`,
			ingredients: [{ ingredientId: `ingredient-${i % 15}`, isOptional: false }]
		});
	});
}

export function baseInput(over: Partial<PlannerInput> = {}): PlannerInput {
	return {
		familyId: 'family-test',
		weekStart: '2026-10-12',
		settings: familySettings(),
		recipes: syntheticCatalogue(),
		ownedBookIds: [],
		exclusions: [],
		restrictions: [],
		familyScores: {},
		globalScores: {},
		history: [],
		...over
	};
}
