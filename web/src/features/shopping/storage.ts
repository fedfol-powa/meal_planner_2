import { registerUserKeyPrefix } from '../../api/persister';

/** The queue of each person on this device, one key per user. */
export const QUEUE_PREFIX = 'shopping-queue:';
export const queueKey = (userId: string) => `${QUEUE_PREFIX}${userId}`;

/**
 * Called by main.tsx before rendering: from the first purge on, other people's queues left on the
 * disk are deleted, also when the shopping list was never opened (second review, finding 2).
 */
export function registerShoppingStorage(): void {
  registerUserKeyPrefix(QUEUE_PREFIX);
}
