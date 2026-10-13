import { describe, expect, it } from 'vitest';
import { claimReload, settleReload } from './update-rules';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items
  };
}

describe('reload attempts', () => {
  it('allows a reload, then refuses the same one without progress', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    // Reloaded, still B under C: the reload did not converge.
    expect(claimReload(storage, 'B', 'C')).toBe(false);
  });
  it('allows the same pair again once page and worker were aligned (B → C → B → C)', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    settleReload(storage); // the page is C under C
    expect(claimReload(storage, 'C', 'B')).toBe(true);
    settleReload(storage); // B under B
    expect(claimReload(storage, 'B', 'C')).toBe(true);
  });
  it('a different pair is progress', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    expect(claimReload(storage, 'B', 'D')).toBe(true);
  });
  it('never reloads without a working sessionStorage', () => {
    expect(claimReload(null, 'A', 'B')).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      }
    };
    expect(claimReload(throwing, 'A', 'B')).toBe(false);
    expect(() => settleReload(throwing)).not.toThrow();
  });
});
