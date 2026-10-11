// Time-dependent parts of the recipe views, decided on the device (spec of W6, decision 7): the
// server sends every planned meal with the instant it passes, and the answer may stay «unchanged».
type MealType = 'lunch' | 'dinner';
export interface MealOccurrence { date: string; mealType: MealType; passesAt: string }

const passed = (meal: MealOccurrence, now: Date) => Date.parse(meal.passesAt) <= now.getTime();

/** Date of the last meal eaten as of `now`: an upcoming meal that has passed wins. */
export function lastEatenOn(view: { lastEatenOn: string | null; upcoming: MealOccurrence[] }, now: Date): string | null {
  const latest = view.upcoming.filter((meal) => passed(meal, now)).map((meal) => meal.date).sort().at(-1);
  return latest ?? view.lastEatenOn;
}

/** Last five past meals, newest first: the upcoming meals that have passed, then the history. */
export function pastMeals(view: { history: { date: string; mealType: MealType }[]; upcoming: MealOccurrence[] }, now: Date) {
  const fresh = view.upcoming.filter((meal) => passed(meal, now)).map(({ date, mealType }) => ({ date, mealType }));
  return [...fresh.reverse(), ...view.history].slice(0, 5);
}

/** "Recently eaten" order again, only when a meal has passed since the read; missing dates last. */
export function resortByLastEaten<T extends { recipe: { name: string }; lastEatenOn: string | null; upcoming: MealOccurrence[] }>(
  items: T[], now: Date, reversed: boolean, locale: string
): T[] {
  if (!items.some((item) => item.upcoming.some((meal) => passed(meal, now)))) return items;
  const byName = (a: T, b: T) => a.recipe.name.localeCompare(b.recipe.name, locale);
  return items
    .map((item) => ({ item, key: lastEatenOn(item, now) }))
    .sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? byName(a.item, b.item) : a.key === null ? 1 : -1;
      if (a.key === b.key) return byName(a.item, b.item);
      return (reversed ? -1 : 1) * (a.key < b.key ? 1 : -1);
    })
    .map(({ item }) => item);
}

/** The next instant a meal of these views passes, if any. */
export function nextBoundary(upcomingLists: MealOccurrence[][], now: Date): Date | null {
  const times = upcomingLists.flat().map((meal) => Date.parse(meal.passesAt)).filter((time) => time > now.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
