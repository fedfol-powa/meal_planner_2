import type { LockManagerLike } from '../features/shopping/queue/locks';

/**
 * Web Locks in memory, shared by the tabs of one test: one holder per name, the others wait in
 * order; a lock is released when its callback ends or when the tab holding it closes.
 */
export function createLockHub() {
  const tails = new Map<string, Promise<void>>();
  return {
    tab() {
      const closers = new Set<() => void>();
      let closed = false;
      const manager: LockManagerLike = {
        request<T>(name: string, callback: () => Promise<T>): Promise<T> {
          let release: () => void = () => {};
          const released = new Promise<void>((resolve) => (release = resolve));
          const before = tails.get(name) ?? Promise.resolve();
          tails.set(name, before.then(() => released));
          return before.then(async () => {
            if (closed) {
              release();
              return new Promise<T>(() => {});
            }
            closers.add(release);
            try {
              return await callback();
            } finally {
              closers.delete(release);
              release();
            }
          });
        }
      };
      return {
        locks: manager,
        /** The tab goes away: its locks are released, its callbacks never finish. */
        close() {
          closed = true;
          closers.forEach((release) => release());
          closers.clear();
        }
      };
    }
  };
}
