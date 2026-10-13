export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'pwa-reload';

/**
 * Protection against reloads without convergence (spec W8): the pair of the last automatic
 * reload stays in sessionStorage until page and worker are aligned. The same pair again means the
 * last reload made no progress: no reload. No working storage: no reload at all.
 */
export function claimReload(storage: StorageLike | null, pageVersion: string, workerVersion: string): boolean {
  if (!storage) return false;
  const pair = `${pageVersion}>${workerVersion}`;
  try {
    if (storage.getItem(KEY) === pair) return false;
    storage.setItem(KEY, pair);
    return true;
  } catch {
    return false;
  }
}

/** Page and worker of the same version: the attempt is over. */
export function settleReload(storage: StorageLike | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to do: claimReload refuses without a working storage anyway.
  }
}
