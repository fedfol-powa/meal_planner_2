import type { ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import { realClients } from '../../api/clients';
import { createRpcClient } from '../../api/rpc';
import { DEMO_USER } from '../../auth/backend';
import { addDays } from '../../lib/calendar';
import { createRpcTestServer, SERVER_RECIPE } from '../../test/rpcServer';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

export const LUNCH = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const DINNER = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
export const NEXT_LUNCH = '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';

const meal = (slotId: string, date: string, mealType: 'lunch' | 'dinner', free: string | null): MealView => ({
  slotId, date, mealType, kind: free ? 'free' : 'recipe', recipe: free ? null : SERVER_RECIPE.recipe,
  freeText: free, servings: 4, ingredients: free ? null : SERVER_RECIPE.ingredients, note: null,
  rating: free ? null : SERVER_RECIPE.rating, canOpenRecipe: !free, lastChange: null
});

const week = (startsOn: string, meals: MealView[]): WeekView => ({
  startsOn,
  days: Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startsOn, i);
    return { date, meals: meals.filter((m) => m.date === date) };
  })
});

/** Thursday 8 October with a recipe lunch and a free dinner, Monday 12 with a lunch, from the test server. */
export function realMealsApp(path = '/menu', options: { locale?: 'it-IT' | 'en-GB'; strict?: boolean; extra?: ReactNode } = {}) {
  const server = createRpcTestServer();
  server.answerMenu({
    opening: { kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' },
    weeks: [
      week('2026-10-05', [meal(LUNCH, '2026-10-08', 'lunch', null), meal(DINNER, '2026-10-08', 'dinner', 'Pizza')]),
      week('2026-10-12', [meal(NEXT_LUNCH, '2026-10-12', 'lunch', null)])
    ]
  });
  const backend = createStubBackend(DEMO_USER);
  const rpc = createRpcClient({ getCredentials: () => backend.getCredentials(), fetch: server.fetch });
  return { server, ...renderApp(path, { backend, createApi: realClients({ rpc, latencyMs: 0 }), locale: options.locale, strict: options.strict, extra: options.extra }) };
}
