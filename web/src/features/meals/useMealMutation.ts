import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../api/errors';
import { runMealMutation, type MealMutationName } from '../../api/mutations';
import type { MealActionResult } from '../../api/types';
import { isOnline } from '../../lib/connectivity';
import { useCurrentLocale, useSession } from '../../session/SessionScope';

/** Sends one meal action with a new id; refused at once offline (offline: false in the contract). */
export function useMealMutation<I>(name: MealMutationName, familyId: string, weekStartsOn: string, call: (input: I & { id: string }) => Promise<MealActionResult>) {
  const session = useSession();
  const currentLocale = useCurrentLocale();
  return useMutation({
    meta: { familyId },
    mutationFn: async (input: I) => {
      if (!isOnline()) throw new ApiError('network');
      const id = crypto.randomUUID();
      return runMealMutation({ queryClient: session.queryClient, session, currentLocale }, name, familyId, weekStartsOn, () => call({ ...input, id }));
    }
  });
}
