import { useQueryClient } from '@tanstack/react-query';
import { errorKey, toApiError } from '../../api/errors';
import { familyOfKey } from '../../api/queries';
import { useT } from '../../i18n/LocaleProvider';

/** Message for a failed meal action; not_found and not_allowed read the meal's week again. */
export function useMealErrors(familyId: string, weekStartsOn: string) {
  const t = useT();
  const queryClient = useQueryClient();
  return (error: unknown): string => {
    const { code, data } = toApiError(error);
    if (code === 'not_found' || code === 'not_allowed') {
      void queryClient.invalidateQueries({
        queryKey: ['menu', 'getWeek'],
        predicate: (q) => familyOfKey(q.queryKey) === familyId && (q.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn
      });
    }
    if (code === 'not_found') return t('meals.gone');
    // The imported draft the undo would bring back was published or closed by a curator meanwhile.
    if (code === 'not_allowed' && (data as { reason?: string } | undefined)?.reason === 'draft_closed') return t('meals.draftClosed');
    if (code === 'not_allowed') return t('meals.undoRefused');
    if (code === 'network') return t('meals.offline');
    return t(errorKey(error));
  };
}
