import { useQueryClient } from '@tanstack/react-query';
import { errorKey, toApiError } from '../../api/errors';
import { familyOfKey } from '../../api/queries';
import { useT } from '../../i18n/LocaleProvider';
import { useSession } from '../../session/SessionScope';
import { noticesOf } from './sessionState';

/**
 * Errors of the meal actions. `message` only translates, so it may run while rendering; `handle`
 * runs once per outcome: not_found and not_allowed read the meal's week again, and not_found
 * closes the sheet, its message staying in the Menu (PR #33 review, 2).
 */
export function useMealErrors(familyId: string, weekStartsOn: string) {
  const t = useT();
  const queryClient = useQueryClient();
  const session = useSession();
  const message = (error: unknown): string => {
    const { code, data } = toApiError(error);
    if (code === 'not_found') return t('meals.gone');
    // The imported draft the undo would bring back was published or closed by a curator meanwhile.
    if (code === 'not_allowed' && (data as { reason?: string } | undefined)?.reason === 'draft_closed') return t('meals.draftClosed');
    if (code === 'not_allowed') return t('meals.undoRefused');
    if (code === 'network') return t('meals.offline');
    return t(errorKey(error));
  };
  const handle = (error: unknown, closeSheet?: () => void) => {
    const { code } = toApiError(error);
    if (code !== 'not_found' && code !== 'not_allowed') return;
    void queryClient.invalidateQueries({
      queryKey: ['menu', 'getWeek'],
      predicate: (q) => familyOfKey(q.queryKey) === familyId && (q.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn
    });
    if (code === 'not_found' && closeSheet) {
      if (!session.isClosed()) noticesOf(session).add({ kind: 'gone' });
      closeSheet();
    }
  };
  return { message, handle };
}
