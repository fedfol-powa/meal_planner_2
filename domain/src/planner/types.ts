/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
export const MEAL_TYPES = ['lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
