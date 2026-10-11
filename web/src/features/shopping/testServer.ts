import type { ShoppingListView } from '@app/contract';
import { vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import type { Api } from '../../api/types';
import { FAMILY, listView, queued } from './fixtures';
import type { ShoppingOperation } from './queue/ops';
import { applyPending } from './queue/pending';
import { listExport } from './exportText';

type Deferred = { resolve: () => void; reject: (error: unknown) => void };

/**
 * Tests only: the shopping area of a server holding one list, with the fixtures as its base.
 * Absolute operations are applied in order; reads and writes can be held or refused.
 */
export function createShoppingServer(base: () => ShoppingListView = listView, familyId = FAMILY) {
  const applied: ShoppingOperation[] = [];
  const held: { reads: Deferred[]; writes: Deferred[] } = { reads: [], writes: [] };
  let holdReads = 0;
  let holdWrites = 0;
  const failures: ApiError[] = [];
  const view = (locale: ShoppingListView['locale'] = 'it-IT'): ShoppingListView => ({
    ...applyPending(base(), familyId, applied.map((op) => queued(op))).view,
    locale
  });
  const wait = async (kind: 'reads' | 'writes') => {
    if (kind === 'reads' ? holdReads === 0 : holdWrites === 0) return;
    if (kind === 'reads') holdReads -= 1;
    else holdWrites -= 1;
    await new Promise<void>((resolve, reject) => held[kind].push({ resolve, reject }));
  };
  const online = () => {
    if (!navigator.onLine) throw new ApiError('network');
  };
  const write = (locale: () => ShoppingListView['locale']) => async (input: ShoppingOperation['input'] & object, kind: ShoppingOperation['kind']) => {
    online();
    calls.push(kind);
    const failure = failures.shift();
    if (failure) throw failure;
    applied.push({ kind, input } as ShoppingOperation);
    // The answer is computed when the request arrives; a held one is lost or late after it.
    const answer = { version: `v${applied.length}`, data: view(locale()) };
    await wait('writes');
    return answer;
  };
  const calls: string[] = [];
  const reads = vi.fn();
  const createLink = vi.fn(async (): Promise<{ url: string; expiresAt: string }> => {
    online();
    if (listExport(view()).lines.length === 0) throw new ApiError('invalid', { issues: [{ path: [], code: 'empty_list' }] });
    return { url: 'https://api.getbring.com/rest/bringrecipes/deeplink?url=x&source=web', expiresAt: new Date().toISOString() };
  });

  function area(getLocale: () => ShoppingListView['locale'] = () => 'it-IT'): Api['shopping'] {
    const send = write(getLocale);
    return {
      async getWeekList(input) {
        online();
        reads(input);
        if (input.familyId !== familyId) throw new ApiError('forbidden');
        if (input.weekStartsOn !== base().weekStartsOn) throw new ApiError('not_found');
        const answer = { unchanged: false as const, version: `v${applied.length}`, data: view(getLocale()) };
        await wait('reads');
        return answer;
      },
      setItemChecked: (input) => send(input, 'setItemChecked'),
      setAddedBack: (input) => send(input, 'setAddedBack'),
      addFreeItem: (input) => send(input, 'addFreeItem'),
      setFreeItemChecked: (input) => send(input, 'setFreeItemChecked'),
      removeFreeItem: (input) => send(input, 'removeFreeItem'),
      exportList: async () => listExport(view()),
      createBringLink: createLink
    };
  }

  return {
    applied,
    calls,
    reads,
    createLink,
    /** Replaces the list the server computes (e.g. portions changed by another member). */
    setBase(next: () => ShoppingListView) {
      base = next;
    },
    view,
    area,
    /** The whole client: the fake one with this shopping area. */
    api(locale: ShoppingListView['locale'] = 'it-IT'): Api {
      return { ...createFakeApi({ getLocale: () => locale, latencyMs: 0 }), shopping: area(() => locale) };
    },
    holdNextRead() {
      holdReads += 1;
    },
    holdNextWrite() {
      holdWrites += 1;
    },
    releaseRead() {
      held.reads.shift()?.resolve();
    },
    releaseWrite(error?: unknown) {
      const next = held.writes.shift();
      if (error) next?.reject(error);
      else next?.resolve();
    },
    failNext(error: ApiError) {
      failures.push(error);
    }
  };
}
