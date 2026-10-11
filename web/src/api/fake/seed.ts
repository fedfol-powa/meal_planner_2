import type { Locale } from '../../i18n/translate';
import type { FamilyRole } from '../types';

export const DEMO_FAMILY_ID = 'family-main';
export const DEMO_USER_ID = 'user-federico';
export const DEMO_FAMILY = { id: DEMO_FAMILY_ID, name: 'Famiglia Folloni', timeZone: 'Europe/Rome' };

export interface DemoPerson { id: string; displayName: string; email: string; locale: Locale; role: FamilyRole }
export const DEMO_PEOPLE: DemoPerson[] = [
  { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT', role: 'family_admin' },
  { id: 'user-anna', displayName: 'Anna', email: 'anna@example.com', locale: 'it-IT', role: 'member' },
  { id: 'user-tom', displayName: 'Tom', email: 'tom@example.com', locale: 'en-GB', role: 'member' }
];

/** Changes on the week of 5 October 2026 (before the date shift). Marco is a former member. */
export const DEMO_CHANGES = [
  { slotId: '2026-10-05-dinner', updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10', note: null },
  { slotId: '2026-10-07-lunch', updatedBy: 'user-marco', updatedAt: '2026-10-01T20:40', note: null },
  { slotId: '2026-10-08-lunch', updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30', note: 'Doppia dose, avanza per venerdì' }
];

export interface DemoRating { userId: string; recipeId: string; stars: number }

/** Federico's ratings from the origin project; Anna's and Tom's invented, deterministic. */
export function seedRatings(federico: { recipeId: string; stars: number }[]): DemoRating[] {
  const ratings: DemoRating[] = federico.map((r) => ({ userId: 'user-federico', ...r }));
  federico.forEach((r, index) => {
    if (index % 2 === 0) ratings.push({ userId: 'user-anna', recipeId: r.recipeId, stars: Math.max(1, r.stars - 1) });
    if (index % 3 === 0) ratings.push({ userId: 'user-tom', recipeId: r.recipeId, stars: Math.min(5, r.stars + 1) });
  });
  return ratings;
}
