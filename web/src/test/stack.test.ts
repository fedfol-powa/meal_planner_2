import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestAuthClient } from './stack';

describe('the Auth client of the stack fixtures', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('leaves no listener behind after creation, initialisation and disposal, again and again', async () => {
    // Listeners on window and document still registered, per target and event.
    const live = new Map<string, Set<unknown>>();
    for (const [name, target] of [['window', window], ['document', document]] as const) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
        const key = `${name}:${type}`;
        live.set(key, (live.get(key) ?? new Set()).add(listener));
        add(type, listener as EventListener, options as AddEventListenerOptions);
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type: string, listener: unknown, options?: unknown) => {
        live.get(`${name}:${type}`)?.delete(listener);
        remove(type, listener as EventListener, options as EventListenerOptions);
      });
    }
    const leftOver = () => Object.fromEntries([...live].filter(([, listeners]) => listeners.size > 0).map(([key, listeners]) => [key, listeners.size]));

    for (let round = 0; round < 3; round += 1) {
      const auth = createTestAuthClient('http://127.0.0.1:54321', 'sb_publishable_test');
      expect((await auth.getSession()).data.session).toBeNull();
      await auth.dispose();
      expect(leftOver()).toEqual({});
    }
  });
});
