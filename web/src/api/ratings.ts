import { useMutation, type Query, type QueryClient } from '@tanstack/react-query';
import { useSession } from '../session/SessionScope';
import { familyOfKey, useQueryDeps, type Versioned } from './queries';
import type { MealView, RatingSummary, RecipeDetailView, WeekView } from './types';

const patchMeal = (meal: MealView, recipeId: string, summary: RatingSummary): MealView =>
  meal.recipe?.id === recipeId && meal.rating ? { ...meal, rating: summary } : meal;

const ofFamily = (familyId: string) => (query: Query) => familyOfKey(query.queryKey) === familyId;
const showsRatings = (query: Query) =>
  (query.queryKey[0] === 'menu' && query.queryKey[1] === 'getWeek') || (query.queryKey[0] === 'recipes' && query.queryKey[1] === 'get');

/**
 * The server's answer reaches the views of the same family that show the recipe; lists whose
 * membership or order depend on ratings are read again instead of being patched (spec, voto).
 * Reads of those views still running started before the confirmation: they are cancelled first,
 * so their answers never overwrite the rating (second review, C5).
 */
export async function applyRating(
  queryClient: QueryClient,
  familyId: string,
  recipeId: string,
  summary: RatingSummary,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const affected = (query: Query) => ofFamily(familyId)(query) && showsRatings(query);
  const running = queryClient.getQueryCache().findAll({ predicate: affected, fetchStatus: 'fetching' });
  await queryClient.cancelQueries({ predicate: affected });
  if (!isCurrent()) return;
  queryClient.setQueriesData<Versioned<WeekView>>({ queryKey: ['menu', 'getWeek'], predicate: ofFamily(familyId) }, (old) =>
    old && { ...old, data: { ...old.data, days: old.data.days.map((d) => ({ ...d, meals: d.meals.map((m) => patchMeal(m, recipeId, summary)) })) } }
  );
  queryClient.setQueriesData<Versioned<RecipeDetailView>>({ queryKey: ['recipes', 'get'], predicate: ofFamily(familyId) }, (old) =>
    old && old.data.recipe.id === recipeId ? { ...old, data: { ...old.data, rating: summary } } : old
  );
  void queryClient.invalidateQueries({ queryKey: ['recipes', 'search'], predicate: ofFamily(familyId) });
  // Cancelled reads that had nothing to show start again, now after the rating.
  const empty = running.filter((query) => query.state.data === undefined);
  if (empty.length) void queryClient.invalidateQueries({ predicate: (query) => empty.includes(query) });
}

export interface RateInput { recipeId: string; stars: number | null }

/** The model for wave 2 mutations: send, show the pending state, apply only confirmed and current answers. */
export function useRateRecipe(familyId: string) {
  const { api, queryClient } = useQueryDeps();
  const session = useSession();
  return useMutation({
    meta: { familyId },
    mutationFn: async ({ recipeId, stars }: RateInput) => {
      const token = session.track(`rating:${recipeId}`);
      const summary = await api.ratings.set({ familyId, recipeId, stars });
      return { summary, token };
    },
    onSuccess: async ({ summary, token }, { recipeId }) => {
      const current = () => !session.isClosed() && session.isLatest(`rating:${recipeId}`, token);
      if (current()) await applyRating(queryClient, familyId, recipeId, summary, current);
    }
  });
}
