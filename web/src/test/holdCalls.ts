import { act } from '@testing-library/react';
import type { Api } from '../api/types';

/** A gate the test opens: calls made before it wait, later calls go through. */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>((done) => (open = done));
  return { opened, open: () => act(async () => open()) };
}

/** Holds `method` of `area` until the gate opens. */
export function holdCalls<A extends keyof Api, M extends keyof Api[A]>(api: Api, area: A, method: M) {
  const g = gate();
  const original = api[area][method] as unknown as (...args: unknown[]) => Promise<unknown>;
  (api[area] as Record<M, unknown>)[method] = (...args: unknown[]) => g.opened.then(() => original(...args));
  return g;
}
