import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { DeletionFamily } from '@app/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID } from '../../api/fake/fakeApi';
import { cacheKey, createMemoryStore } from '../../api/persister';
import { useSession } from '../../session/SessionScope';
import type { Session } from '../../session/session';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';

const FEDERICO = { id: 'user-federico', email: 'federico@example.com' };
const PATH = '/profile/account/delete';
const HOME = '00000000-0000-4000-8000-0000000000a1';
const SEA = '00000000-0000-4000-8000-0000000000a2';
const SOLO = '00000000-0000-4000-8000-0000000000a3';
const ANNA = { userId: '00000000-0000-4000-8000-0000000000b1', displayName: 'Anna' };
const TOM = { userId: '00000000-0000-4000-8000-0000000000b2', displayName: 'Tom' };
const MARCO = { userId: '00000000-0000-4000-8000-0000000000b3', displayName: 'Marco' };
const LIA = { userId: '00000000-0000-4000-8000-0000000000b4', displayName: 'Lia' };

afterEach(() => setOnline(true));

type Plan = Awaited<ReturnType<ReturnType<typeof createFakeApi>['account']['getDeletionPlan']>>;
const plan = (families: DeletionFamily[], extra: Partial<Plan> = {}): Plan => ({
  families, lastAppAdmin: false, openInvitations: 0, pending: false, connectedAgents: 0, ...extra
});
const family = (familyId: string, name: string, outcome: DeletionFamily['outcome'], candidates: DeletionFamily['candidates'] = []): DeletionFamily => ({
  familyId, name, outcome, candidates
});

/** The fake Api of Federico with the plans given, one per read (the last one repeats). */
function setup(...plans: Plan[]) {
  const data = createFakeData(FEDERICO);
  const api = createFakeApi({ getLocale: () => 'it-IT', data, latencyMs: 0 });
  if (plans.length) {
    const reads = vi.fn();
    plans.forEach((p, index) => (index === plans.length - 1 ? reads.mockResolvedValue(p) : reads.mockResolvedValueOnce(p)));
    api.account.getDeletionPlan = reads as unknown as typeof api.account.getDeletionPlan;
  }
  const backend = createStubBackend(FEDERICO, 'supabase');
  return { api, backend, store: createMemoryStore() };
}

const confirmButton = () => screen.findByRole('button', { name: 'Cancella l’account' }) as Promise<HTMLButtonElement>;
const card = (name: string) => screen.getByRole('region', { name });

describe('account deletion page', () => {
  it('shows each family with its outcome and the choice of the successor', async () => {
    const { api, backend } = setup(
      plan([family(HOME, 'Famiglia Folloni', 'stays'), family(SEA, 'Casa al mare', 'needs_successor', [ANNA, TOM]), family(SOLO, 'Solo io', 'deleted')])
    );
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { name: 'Le tue famiglie', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cancella l’account', level: 1 })).toBeTruthy();
    expect(within(card('Famiglia Folloni')).getByText('La famiglia continua senza di te.')).toBeTruthy();
    expect(within(card('Casa al mare')).getByText('Sei l’unico amministratore: prima scegli chi lo diventa.')).toBeTruthy();
    expect(within(card('Solo io')).getByText('Sei l’unico membro: la famiglia e tutti i suoi dati vengono eliminati.')).toBeTruthy();
    const choice = within(card('Casa al mare')).getByRole('group', { name: 'Nuovo amministratore' });
    expect(within(choice).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual(['Anna', 'Tom']);
    expect(within(card('Famiglia Folloni')).queryByRole('radio')).toBeNull();
    expect(screen.getByText('Restano le ricette pubblicate e le modifiche ai menu, mostrate come «ex membro».')).toBeTruthy();
  });

  it('keeps the red button disabled until every family has a successor', async () => {
    const { api, backend } = setup(plan([family(SEA, 'Casa al mare', 'needs_successor', [ANNA, TOM])]));
    renderApp(PATH, { api, backend });
    const button = await confirmButton();
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Tom' }));
    expect(button.disabled).toBe(false);
  });

  it('the last app administrator cannot delete the account', async () => {
    const { api, backend } = setup(plan([family(HOME, 'Famiglia Folloni', 'stays')], { lastAppAdmin: true }));
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { name: 'Non puoi ancora cancellare l’account' })).toBeTruthy();
    expect(screen.getByText('Sei l’unico amministratore dell’app: nomina prima un altro amministratore dall’amministrazione.')).toBeTruthy();
    expect((await confirmButton()).disabled).toBe(true);
  });

  it('is disabled offline', async () => {
    const { api, backend } = setup(plan([family(HOME, 'Famiglia Folloni', 'stays')]));
    renderApp(PATH, { api, backend });
    const button = await confirmButton();
    expect(button.disabled).toBe(false);
    setOnline(false);
    await waitFor(() => expect(button.disabled).toBe(true));
  });

  it('tells what goes, with the connected agents and the open links', async () => {
    const { api, backend } = setup(plan([family(HOME, 'Famiglia Folloni', 'stays')], { connectedAgents: 2, openInvitations: 3 }));
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { name: 'Cosa viene cancellato' })).toBeTruthy();
    expect(screen.getByText('Nome, email, voti e accessi, compresi quelli degli agenti collegati.')).toBeTruthy();
    expect(screen.getByText('Si scollegano anche i tuoi 2 agenti.')).toBeTruthy();
    expect(screen.getByText('I tuoi 3 inviti ancora attivi smettono di funzionare.')).toBeTruthy();
  });

  it('says nothing about agents and links when there are none', async () => {
    const { api, backend } = setup(plan([family(HOME, 'Famiglia Folloni', 'stays')]));
    renderApp(PATH, { api, backend });
    expect(await screen.findByText('Nome, email, voti e accessi, compresi quelli degli agenti collegati.')).toBeTruthy();
    expect(screen.queryByText(/agent[ei]\.$/)).toBeNull();
    expect(screen.queryByText(/smett[eo]no? di funzionare/)).toBeNull();
  });

  it('on conflict reads the plan again and keeps the choices still valid', async () => {
    const before = plan([family(HOME, 'Famiglia Folloni', 'needs_successor', [ANNA, TOM]), family(SEA, 'Casa al mare', 'needs_successor', [MARCO, LIA])]);
    // Lia left «Casa al mare» meanwhile; «Solo io» now goes with the account.
    const after = plan([
      family(HOME, 'Famiglia Folloni', 'needs_successor', [ANNA, TOM]),
      family(SEA, 'Casa al mare', 'needs_successor', [MARCO]),
      family(SOLO, 'Solo io', 'deleted')
    ]);
    const { api, backend } = setup(before, after);
    const remove = vi.fn().mockRejectedValueOnce(new ApiError('conflict')).mockResolvedValue({ completed: true });
    api.account.delete = remove as unknown as typeof api.account.delete;
    renderApp(PATH, { api, backend });
    fireEvent.click(await screen.findByRole('radio', { name: 'Tom' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Lia' }));
    fireEvent.click(await confirmButton());
    expect((await screen.findByRole('alert')).textContent).toBe('Qualcosa è cambiato nelle tue famiglie: controlla di nuovo');
    expect(await screen.findByRole('region', { name: 'Solo io' })).toBeTruthy();
    expect(remove).toHaveBeenNthCalledWith(1, { successors: { [HOME]: TOM.userId, [SEA]: LIA.userId }, deletedFamilies: [] }, expect.anything());
    expect((screen.getByRole('radio', { name: 'Tom' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Marco' }) as HTMLInputElement).checked).toBe(false);
    expect((await confirmButton()).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Marco' }));
    fireEvent.click(await confirmButton());
    await waitFor(() =>
      expect(remove).toHaveBeenNthCalledWith(2, { successors: { [HOME]: TOM.userId, [SEA]: MARCO.userId }, deletedFamilies: [SOLO] }, expect.anything())
    );
  });

  it.each([true, false])('after the answer (completed: %s) closes the session and opens the sign-in page with «Account cancellato.»', async (completed) => {
    const { api, backend, store } = setup();
    const remove = vi.spyOn(api.account, 'delete');
    if (!completed) remove.mockResolvedValue({ completed: false });
    const seen: { session: Session | null } = { session: null };
    function Probe() {
      seen.session = useSession();
      return null;
    }
    const { history } = renderApp(PATH, { api, backend, store, extra: <Probe /> });
    const session = await waitFor(() => {
      expect(seen.session?.userId).toBe(FEDERICO.id);
      return seen.session!;
    });
    fireEvent.click(await screen.findByRole('radio', { name: 'Anna' }));
    fireEvent.click(await confirmButton());
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(remove).toHaveBeenCalledWith({ successors: { [DEMO_FAMILY_ID]: 'user-anna' }, deletedFamilies: [] }, expect.anything());
    expect(await screen.findByText('Account cancellato.')).toBeTruthy();
    expect(session.isClosed()).toBe(true);
    expect(store.entries.has(cacheKey(FEDERICO.id))).toBe(false);
    expect(backend.signOutCalls).toBe(1);
  });
});
