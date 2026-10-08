/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
export const MEAL_TYPES = ['lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type RecipeMealType = MealType | 'both';
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Main protein of a recipe; vegetarian = none of the others (spec section 3 groups). */
export const PROTEIN_GROUPS = ['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'] as const;
export type ProteinGroup = (typeof PROTEIN_GROUPS)[number];

export const CARBOHYDRATE_GROUPS = ['pasta', 'rice', 'potatoes', 'bread', 'cereals', 'none'] as const;
export type CarbohydrateGroup = (typeof CARBOHYDRATE_GROUPS)[number];

/** Kind of dish, for the similarity penalty ("two woks, two savoury pies"). */
export const CATEGORIES = ['wok', 'skottle', 'oven_bake', 'grill', 'pan', 'soup', 'salad', 'savoury_pie', 'wrap_sandwich', 'burger', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Weekly food groups with ranges (spec section 3); vegetables are a bonus, not a range. */
export const FOOD_GROUPS = ['fish', 'legumes', 'white_meat', 'red_meat', 'cured_meat', 'eggs', 'cheese', 'potatoes', 'heavy'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** Dish kinds a meal rule can name (rule templates of round 4). */
export type DishKind = 'pasta' | 'rice' | 'bread_wrap' | 'skottle';

export interface PlannerRecipe {
	id: string;
	durationMinutes: number | null;
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup;
	carbohydrateGroup: CarbohydrateGroup;
	category: Category;
	hasVegetables: boolean;
	isHeavy: boolean;
	/** Empty means all year. */
	seasons: Season[];
	/** One of the recipe's own ingredient lines, never inferred from the dish name. */
	primaryIngredientId: string | null;
	ingredients: { ingredientId: string; isOptional: boolean }[];
	bookId: string | null;
}

/** One meal of the weekly pattern: servings (0 = not planned), a fixed free meal, a time limit. */
export interface SlotSetting {
	servings: number;
	fixedText: string | null;
	maxMinutes: number | null;
}

/** Rule templates (spec section 2): weekday 0 = Monday. */
export type MealRule =
	| { kind: 'only_lunch'; dish: DishKind }
	| { kind: 'at_least_one'; group: ProteinGroup; weekday: number }
	| { kind: 'never_on'; group: ProteinGroup; weekday: number };

export interface GroupRange {
	min: number;
	max: number;
}

/** Score weights: in families.settings, not shown in the interface. */
export interface ScoreWeights {
	liking: number;
	recency: number;
	season: number;
	balance: number;
	similarity: number;
	vegetables: number;
	knownNew: number;
	limit: number;
}

export interface PlannerSettings {
	/** Seven entries per meal, Monday first. */
	slots: Record<MealType, SlotSetting[]>;
	rules: MealRule[];
	knownNew: { known: number; new: number; tolerance: number };
	groupRanges: Record<FoodGroup, GroupRange>;
	weights: ScoreWeights;
}

export interface IngredientRestriction {
	ingredientId: string;
	restriction: 'avoid' | 'limit';
	weeklyMax: number | null;
}

/** A past meal with a recipe: always counts as eaten (spec section 2). */
export interface PastMeal {
	date: IsoDate;
	mealType: MealType;
	recipeId: string;
}

/**
 * Everything the planner reads. `recipes` is the catalogue visible to the family without books:
 * published and not archived; the planner itself drops excluded recipes and books not owned.
 */
export interface PlannerInput {
	familyId: string;
	/** Monday of the week to generate. */
	weekStart: IsoDate;
	settings: PlannerSettings;
	recipes: PlannerRecipe[];
	ownedBookIds: string[];
	exclusions: string[];
	restrictions: IngredientRestriction[];
	/** Family average stars per recipe. */
	familyScores: Record<string, number>;
	/** Anonymous average over all families, for the cold start. */
	globalScores: Record<string, number>;
	/** Past meals of previous weeks, oldest first. */
	history: PastMeal[];
}

export type SlotContent = { kind: 'recipe'; recipeId: string } | { kind: 'free'; text: string } | { kind: 'no_match' };

export interface PlannedSlot {
	date: IsoDate;
	mealType: MealType;
	servings: number;
	content: SlotContent;
}

export interface PlannedWeek {
	weekStart: IsoDate;
	slots: PlannedSlot[];
}
