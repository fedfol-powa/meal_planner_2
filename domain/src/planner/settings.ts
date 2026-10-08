import type { FoodGroup, GroupRange, PlannerSettings, ScoreWeights, SlotSetting } from './types.ts';

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

/** Starting weights for the experiment; the report is where they get tuned. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
	liking: 3,
	recency: 1,
	season: 1,
	balance: 2,
	similarity: 4,
	vegetables: 0.5,
	knownNew: 1.5,
	limit: 1,
	rules: 2
};

export const DEFAULT_KNOWN_NEW = { known: 7, new: 5, tolerance: 1 };
/** Meals around a slot that weigh on similarity, across weeks. */
export const SIMILARITY_WINDOW = 6;
/** Days after which "time since last cooked" is at its full value. */
export const FULL_RECENCY_DAYS = 56;
/** A recipe used in the previous 14 days is not proposed again. */
export const RECENT_DAYS = 14;
/** Family score at or below this is excluded, unless there is nothing else. */
export const LOW_SCORE = 2;
/** The choice is weighted among the best few candidates. */
export const TOP_K = 4;
/** The known/new quota applies once the family has cooked this many recipes. */
export const KNOWN_NEW_MIN_COOKED = 10;
/** A recipe not cooked for this many weeks counts as new again for the quota. */
export const KNOWN_WINDOW_WEEKS = 8;
export const MAX_REPAIR_ROUNDS = 20;

/** Default time limit of weekday lunches (decided 8 October 2026); every family can change it. */
export const WEEKDAY_LUNCH_MINUTES = 30;

/** A fresh copy of the CREA ranges, safe to edit (plain JavaScript, no runtime globals). */
export function creaRanges(): Record<FoodGroup, GroupRange> {
	return Object.fromEntries(Object.entries(CREA_RANGES).map(([group, range]) => [group, { ...range }])) as Record<FoodGroup, GroupRange>;
}

const plain = (servings: number, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText: null, maxMinutes });

/** New family (spec section 2): every lunch and dinner for `servings`, weekday lunches within 30 minutes, no fixed meals or rules. */
export function defaultPlannerSettings(servings = 2): PlannerSettings {
	return {
		slots: {
			lunch: Array.from({ length: 7 }, (_, day) => plain(servings, day < 5 ? WEEKDAY_LUNCH_MINUTES : null)),
			dinner: Array.from({ length: 7 }, () => plain(servings))
		},
		rules: [],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: creaRanges(),
		weights: { ...DEFAULT_WEIGHTS }
	};
}
