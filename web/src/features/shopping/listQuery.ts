import type { ShoppingListView } from '@app/contract';
import { queryOptions, type Query, type QueryClient } from '@tanstack/react-query';
import { readThrough, type QueryDeps, type Versioned } from '../../api/queries';
import type { Locale } from '../../i18n/translate';
import type { SendResult } from './queue/queue';

export const shoppingListKey = (familyId: string, weekStartsOn: string, locale: Locale) =>
  ['shopping', 'getWeekList', { familyId, weekStartsOn, locale }] as const;

export function shoppingListQuery({ api, queryClient, locale }: QueryDeps, familyId: string, weekStartsOn: string) {
  const queryKey = shoppingListKey(familyId, weekStartsOn, locale);
  return queryOptions({
    queryKey,
    queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.shopping.getWeekList({ familyId, weekStartsOn, knownVersion })),
    select: (value: Versioned<ShoppingListView>) => value.data
  });
}

/** The reads of one list, in every language. */
const isList = (familyId: string, weekStartsOn: string) => (query: Query) => {
  const [area, operation, input] = query.queryKey as [unknown, unknown, { familyId?: unknown; weekStartsOn?: unknown } | undefined];
  return area === 'shopping' && operation === 'getWeekList' && input?.familyId === familyId && input.weekStartsOn === weekStartsOn;
};

/**
 * A confirmed answer becomes the base of the list: reads of the list still running started before
 * the confirmation, so they are cancelled first and never overwrite it (W5's mutation model). The
 * answer is in one language; the others are read again.
 */
export async function applyConfirmedList(
  queryClient: QueryClient,
  familyId: string,
  weekStartsOn: string,
  result: SendResult,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const matches = isList(familyId, weekStartsOn);
  await queryClient.cancelQueries({ predicate: matches });
  // Checked again after the wait: the session may have closed or the family been revoked meanwhile.
  if (!isCurrent()) return;
  const key = shoppingListKey(familyId, weekStartsOn, result.data.locale);
  queryClient.setQueryData<Versioned<ShoppingListView>>(key, { version: result.version, data: result.data });
  void queryClient.invalidateQueries({ predicate: (query) => matches(query) && query.queryKey[2] !== undefined && (query.queryKey[2] as { locale?: unknown }).locale !== result.data.locale });
}
