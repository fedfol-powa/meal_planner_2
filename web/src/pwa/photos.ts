import type { Session } from '../session/session';

/**
 * The cache of the worker (sw-rules.ts, PHOTO_CACHE), written again here: importing a worker module
 * from the page would put it in a chunk shared with sw.js, which a classic worker cannot load.
 */
export const PHOTO_CACHE_NAME = 'cosasimangia-photos-v1';

/** How long the sign-out waits for the worker before deleting the cache itself. */
const ANSWER_TIMEOUT_MS = 2000;

interface PhotoDeps {
  serviceWorker?: { controller: { postMessage(message: unknown, transfer: Transferable[]): void } | null } | null;
  caches?: { delete(name: string): Promise<boolean> } | null;
}

/**
 * Empties the cache of the photos seen (spec W12, section 7). The worker in control clears it
 * and moves its epoch, so a photo answer in flight does not store itself again; without a worker,
 * or without its answer in time, the page deletes the cache itself. Never throws.
 */
export async function clearPhotos(deps: PhotoDeps = defaults()): Promise<void> {
  const controller = deps.serviceWorker?.controller;
  if (controller) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(resolve, ANSWER_TIMEOUT_MS);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve();
      };
      try {
        controller.postMessage({ type: 'clear-photos' }, [channel.port2]);
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
  await deps.caches?.delete(PHOTO_CACHE_NAME).catch(() => false);
}

function defaults(): PhotoDeps {
  return {
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null,
    caches: typeof caches !== 'undefined' ? caches : null
  };
}

/** The photos belong to the recipe book, not to a family, but go with the session like the copy of the views. */
export function registerPhotoCleanup(session: Session, clear: () => Promise<void> = clearPhotos): void {
  session.onClose(clear);
}
