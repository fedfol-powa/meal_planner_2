import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import type { Versioned } from '../../api/queries';
import { setOnline } from '../../test/connectivity';
import { renderSession } from '../../test/sessionHarness';
import { createStubBackend } from '../../test/stubBackend';
import type { ShoppingListView } from '@app/contract';
import { FAMILY, grams, MONDAY, ops, RICE, TOMATO, USER } from './fixtures';
import { shoppingListKey } from './listQuery';
import { ShoppingQueueProvider } from './ShoppingQueueProvider';
import { createShoppingServer } from './testServer';
import { useShoppingList, type ShoppingListState } from './useShoppingList';

function setup() {
  const server = createShoppingServer();
  let state: ShoppingListState | null = null;
  let client: QueryClient | null = null;
  function Probe() {
    state = useShoppingList(FAMILY, MONDAY);
    client = useQueryClient();
    return null;
  }
  renderSession(
    <ShoppingQueueProvider locks={null}>
      <Probe />
    </ShoppingQueueProvider>,
    { backend: createStubBackend({ id: USER, email: 'u@example.com' }), api: () => server.api() }
  );
  return {
    server,
    state: () => state!,
    cached: () => client!.getQueryData<Versioned<ShoppingListView>>(shoppingListKey(FAMILY, MONDAY, 'it-IT'))?.data,
    client: () => client!
  };
}

const checkedIn = (view: ShoppingListView | undefined) =>
  (view?.departments ?? []).flatMap((d) => d.items).filter((i) => i.checked).map((i) => i.ingredientId).sort();

describe('useShoppingList', () => {
  it('shows a queued tick over the cached view without writing it into the cache', async () => {
    const world = setup();
    await waitFor(() => expect(world.state().view).not.toBeNull());
    setOnline(false);
    await act(() => world.state().act(ops.tick(TOMATO), 'Pomodori'));
    expect(checkedIn(world.state().view!.view)).toEqual([TOMATO]);
    expect(world.state().pendingCount).toBe(1);
    expect(world.state().view!.pendingKeys.has(`${TOMATO}~`)).toBe(true);
    expect(checkedIn(world.cached())).toEqual([]);
  });

  it('puts the server answer in the cache once confirmed', async () => {
    const world = setup();
    await waitFor(() => expect(world.state().view).not.toBeNull());
    await act(() => world.state().act(ops.tick(TOMATO), 'Pomodori'));
    await waitFor(() => expect(world.state().pendingCount).toBe(0));
    expect(checkedIn(world.cached())).toEqual([TOMATO]);
    expect(checkedIn(world.state().view!.view)).toEqual([TOMATO]);
  });

  it('keeps the confirmed change in the cache and the failed one in the layer', async () => {
    const world = setup();
    await waitFor(() => expect(world.state().view).not.toBeNull());
    setOnline(false);
    await act(() => world.state().act(ops.tick(TOMATO), 'Pomodori'));
    await act(() => world.state().act(ops.tick(RICE, grams(300)), 'Riso'));
    world.server.holdNextWrite();
    world.server.holdNextWrite();
    setOnline(true);
    await waitFor(() => expect(world.server.calls).toHaveLength(1));
    world.server.releaseWrite();
    await waitFor(() => expect(world.server.calls).toHaveLength(2));
    world.server.releaseWrite(new ApiError('network'));
    await waitFor(() => expect(checkedIn(world.cached())).toEqual([TOMATO]));
    await waitFor(() => expect(world.state().pendingCount).toBe(1));
    expect(checkedIn(world.state().view!.view)).toEqual([RICE, TOMATO].sort());
  });

  it('never lets a read started before a confirmation overwrite it', async () => {
    const world = setup();
    await waitFor(() => expect(world.state().view).not.toBeNull());
    world.server.holdNextRead();
    // Not in act: the read is held, so an async act scope would stay open across the next ones.
    void world.client().invalidateQueries({ queryKey: ['shopping'] });
    await waitFor(() => expect(world.server.reads).toHaveBeenCalledTimes(2));
    await act(() => world.state().act(ops.tick(TOMATO), 'Pomodori'));
    await waitFor(() => expect(world.state().pendingCount).toBe(0));
    world.server.releaseRead();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(checkedIn(world.cached())).toEqual([TOMATO]);
  });
});
