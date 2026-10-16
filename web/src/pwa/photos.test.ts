import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../api/persister';
import { createSession } from '../session/session';
import { clearPhotos, registerPhotoCleanup } from './photos';
import { PHOTO_CACHE } from './sw-rules';

describe('photo cache of the page (W12)', () => {
  it('asks the worker in control to clear it and waits for the answer', async () => {
    const remove = vi.fn(async () => true);
    const controller = {
      postMessage: vi.fn((message: unknown, ports: MessagePort[]) => {
        expect(message).toEqual({ type: 'clear-photos' });
        ports[0]!.postMessage({ type: 'photos-cleared' });
      })
    };
    await clearPhotos({ serviceWorker: { controller }, caches: { delete: remove } });
    expect(controller.postMessage).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(PHOTO_CACHE);
  });

  it('without a worker in control deletes the cache directly', async () => {
    const remove = vi.fn(async () => true);
    await clearPhotos({ serviceWorker: { controller: null }, caches: { delete: remove } });
    expect(remove).toHaveBeenCalledWith(PHOTO_CACHE);
  });

  it('a worker that does not answer does not hold the sign-out', async () => {
    vi.useFakeTimers();
    try {
      const remove = vi.fn(async () => true);
      const done = clearPhotos({ serviceWorker: { controller: { postMessage: () => undefined } }, caches: { delete: remove } });
      await vi.advanceTimersByTimeAsync(2000);
      await done;
      expect(remove).toHaveBeenCalledWith(PHOTO_CACHE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the photo cache when the session closes', async () => {
    const session = createSession('a', createMemoryStore());
    const clear = vi.fn(async () => undefined);
    registerPhotoCleanup(session, clear);
    expect(clear).not.toHaveBeenCalled();
    await session.close();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('the name of the photo cache', () => {
  it('is the worker’s, written twice so that the page never imports the worker modules', async () => {
    const { PHOTO_CACHE: ofWorker } = await import('./sw-rules');
    const { PHOTO_CACHE_NAME } = await import('./photos');
    expect(PHOTO_CACHE_NAME).toBe(ofWorker);
  });
});
