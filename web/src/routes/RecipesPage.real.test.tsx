import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { realClients } from '../api/clients';
import { createRpcClient } from '../api/rpc';
import { renderApp } from '../test/renderApp';
import { createRpcTestServer, SERVER_PROFILE, SERVER_RECIPE } from '../test/rpcServer';
import { createStubBackend } from '../test/stubBackend';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Real mode composed as in the app: realClients → oRPC link → RPC handler of the contract (PR #19 review, finding 1). */
function realApp(path: string) {
  const server = createRpcTestServer();
  const backend = createStubBackend({ id: 'a', email: 'a@example.com' });
  const rpc = createRpcClient({ getCredentials: () => backend.getCredentials(), fetch: server.fetch });
  const view = renderApp(path, { backend, createApi: realClients({ rpc, latencyMs: 0 }) });
  return { server, ...view };
}

describe('recipe book on the real client', () => {
  it('reads, opens and rates with the family of the real profile, never with demo ids', async () => {
    const { server, history } = realApp('/recipes');
    expect(await screen.findByRole('heading', { name: 'Ricetta dal server' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Scheda ricetta' }));
    await screen.findByText('400 g');
    fireEvent.click(screen.getByLabelText('Dai 4 stelle a Ricetta dal server'));
    await screen.findByLabelText(/Il tuo voto: 4 stelle/);
    // A visit to the menu, served by the Worker too (W1), reads with the same family.
    history.push('/menu');
    await waitFor(() => expect(server.openingSeen.map((opening) => opening.familyId)).toEqual([SERVER_PROFILE.currentFamilyId]));

    expect(server.recipeCalls.map((call) => call.op)).toEqual(['recipes.search', 'recipes.get', 'ratings.set']);
    for (const { input } of server.recipeCalls) expect(input.familyId).toBe(SERVER_PROFILE.currentFamilyId);
    expect(server.recipeCalls.slice(1).map(({ input }) => input.recipeId)).toEqual([SERVER_RECIPE.recipe.id, SERVER_RECIPE.recipe.id]);
    const sentIds = server.recipeCalls.flatMap(({ input }) => ['familyId', 'recipeId', 'slotId'].map((key) => input[key]).filter((value) => value !== undefined));
    expect(sentIds.every((id) => typeof id === 'string' && UUID.test(id))).toBe(true);
    const paths = server.fetch.mock.calls.map(([request]) => new URL(request.url).pathname);
    expect(paths.every((path) => /^\/api\/rpc\/(session|profile|recipes|ratings|menu)\//.test(path))).toBe(true);
    await waitFor(() => expect(paths).toContain('/api/rpc/profile/get'));
  });
});
