import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';
import type { Locale } from '../../i18n/translate';

export const mealKeys = {
  suggestions: (familyId: string, slotId: string, offset: number, locale: Locale) => ['meals', 'getSuggestions', { familyId, slotId, offset, locale }] as const
};

/** Not versioned (spec of the revision, 4): read when the sheet opens, always from the server. */
export function suggestionsQuery({ api, locale }: QueryDeps, familyId: string, slotId: string, offset: number) {
  return queryOptions({
    queryKey: mealKeys.suggestions(familyId, slotId, offset, locale),
    queryFn: () => api.meals.getSuggestions({ familyId, slotId, offset }),
    staleTime: 0
  });
}
