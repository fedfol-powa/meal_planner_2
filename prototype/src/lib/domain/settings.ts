import { FOOD_GROUPS, type DishKind, type FamilySettings, type FoodGroup, type GroupRange, type MealType, type Recipe, type SlotSetting } from './types';

/** Default weekly ranges of spec section 3 (CREA 2018 frequencies adapted to about 12 planned meals). */
export const CREA_RANGES: Record<FoodGroup, GroupRange> = {
	fish: { min: 2, max: 3 },
	legumes: { min: 2, max: 4 },
	white_meat: { min: 1, max: 3 },
	red_meat: { min: 0, max: 1 },
	cured_meat: { min: 0, max: 1 },
	eggs: { min: 1, max: 2 },
	cheese: { min: 0, max: 2 },
	potatoes: { min: 0, max: 2 },
	heavy: { min: 0, max: 1 }
};

export const DEFAULT_KNOWN_NEW = { known: 7, new: 5, tolerance: 1 };
export const MAX_SERVINGS = 12;
export const TIME_LIMITS = [15, 20, 30, 45, 60] as const;

const plain = (servings: number): SlotSetting => ({ servings, fixedText: null, maxMinutes: null });

/** New family (round 4): every lunch and dinner planned for 2, no fixed meals, limits or rules. */
export function defaultSettings(servings = 2): FamilySettings {
	return {
		slots: { lunch: Array.from({ length: 7 }, () => plain(servings)), dinner: Array.from({ length: 7 }, () => plain(servings)) },
		rules: [],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: structuredClone(CREA_RANGES)
	};
}

/** Weekday of an ISO date, Monday = 0. */
export function weekdayOf(date: string): number {
	return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function slotSetting(settings: FamilySettings, date: string, mealType: MealType): SlotSetting {
	return settings.slots[mealType][weekdayOf(date)];
}

const DISH_TAGS: Record<DishKind, string> = { pasta: 'pasta', rice: 'riso', bread_wrap: 'pane-wrap', skottle: 'skottle' };

export function isDishKind(recipe: Pick<Recipe, 'tags'>, dish: DishKind): boolean {
	return recipe.tags.includes(DISH_TAGS[dish]);
}

/** Demo classification of a recipe into the weekly food groups, from protein group and tags. */
export function foodGroupsOf(recipe: Pick<Recipe, 'proteinGroup' | 'tags'>): FoodGroup[] {
	const groups: FoodGroup[] = [];
	if (recipe.proteinGroup === 'fish') groups.push('fish');
	if (recipe.proteinGroup === 'legumes') groups.push('legumes');
	if (recipe.proteinGroup === 'white_meat') groups.push('white_meat');
	if (recipe.proteinGroup === 'meat') groups.push('red_meat');
	if (recipe.proteinGroup === 'eggs') groups.push('eggs');
	if (recipe.tags.includes('patate')) groups.push('potatoes');
	return groups;
}

/** Validates settings coming from the interface; null when valid, otherwise the first problem. */
export function settingsProblem(settings: FamilySettings): string | null {
	for (const meal of ['lunch', 'dinner'] as const) {
		const row = settings.slots[meal];
		if (row.length !== 7) return 'slots';
		for (const s of row) {
			if (!Number.isInteger(s.servings) || s.servings < 0 || s.servings > MAX_SERVINGS) return 'servings';
			if (s.fixedText !== null && (s.fixedText.trim() === '' || s.fixedText.length > 60)) return 'fixedText';
			if (s.maxMinutes !== null && !(TIME_LIMITS as readonly number[]).includes(s.maxMinutes)) return 'maxMinutes';
		}
	}
	for (const r of settings.rules) if ('weekday' in r && (r.weekday < 0 || r.weekday > 6)) return 'rules';
	const { known, new: fresh, tolerance } = settings.knownNew;
	if ([known, fresh, tolerance].some((n) => !Number.isInteger(n) || n < 0 || n > 14)) return 'knownNew';
	for (const g of FOOD_GROUPS) {
		const range = settings.groupRanges[g];
		if (!range || range.min < 0 || range.max > 14 || range.min > range.max) return 'groupRanges';
	}
	return null;
}
