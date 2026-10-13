import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheKey, createMemoryStore } from '../api/persister';
import { DEMO_FAMILY_ID } from '../api/fake/seed';
import { DEMO_USER } from '../auth/backend';
import { env } from '../env';
import { MONDAY } from '../features/shopping/fixtures';
import { queueKey } from '../features/shopping/storage';
import { createShoppingServer } from '../features/shopping/testServer';
import { setOnline } from '../test/connectivity';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';

const SHOPPING = `/shopping/${MONDAY}?day=2026-10-14`;
const originalBuild = env.buildVersion;
afterEach(() => {
  (env as { buildVersion: string }).buildVersion = originalBuild;
});

/** One opening of the app on the same device (store), with the build given: a reload into a new version. */
function openApp(store: ReturnType<typeof createMemoryStore>, server: ReturnType<typeof createShoppingServer>, path: string, build: string) {
  (env as { buildVersion: string }).buildVersion = build;
  return renderApp(path, { store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
}

const tomatoes = () => screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });

describe('what survives a new version (spec W8)', () => {
  it('the shopping list saved by one build opens offline after the app reloaded on the Menu with another', async () => {
    const store = createMemoryStore();
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const first = openApp(store, server, SHOPPING, '2026-10-13T08:00:00.000Z');
    await tomatoes();
    // The persister writes at most once a second.
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey(DEMO_USER.id)))).toContain('Pomodori'), { timeout: 3000 });
    first.unmount();
    // New version, opened on the Menu: the list is not read again, and the copy is written again.
    const second = openApp(store, server, '/menu', '2026-10-14T08:00:00.000Z');
    await screen.findByRole('navigation', { name: 'Giorni della settimana' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    second.unmount();
    // At the supermarket, offline.
    setOnline(false);
    const readsBefore = server.reads.mock.calls.length;
    openApp(store, server, SHOPPING, '2026-10-14T08:00:00.000Z');
    expect(await tomatoes()).toBeTruthy();
    expect(server.reads.mock.calls.length).toBe(readsBefore);
  });
  it('the queued changes keep their identifiers across a new version and leave with them', async () => {
    const store = createMemoryStore();
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const first = openApp(store, server, SHOPPING, '2026-10-13T08:00:00.000Z');
    fireEvent.click(await tomatoes());
    setOnline(false);
    const record = () => store.entries.get(queueKey(DEMO_USER.id)) as { ops: { op: { input: { id: string } } }[] } | undefined;
    // Offline before the click lands: one queued change on the device.
    await waitFor(() => expect(record()?.ops.length).toBe(1));
    const ids = record()!.ops.map((queued) => queued.op.input.id);
    first.unmount();
    openApp(store, server, SHOPPING, '2026-10-14T08:00:00.000Z');
    await tomatoes();
    expect(record()!.ops.map((queued) => queued.op.input.id)).toEqual(ids);
    setOnline(true);
    await waitFor(() => expect(server.calls).toContain('setItemChecked'));
    expect(server.applied.map((operation) => operation.input.id)).toContain(ids[0]);
  });
});
