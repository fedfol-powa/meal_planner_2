import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { DeletionFamily } from '@app/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

const HOME = '00000000-0000-4000-8000-0000000000a1';
const SEA = '00000000-0000-4000-8000-0000000000a2';
const SOLO = '00000000-0000-4000-8000-0000000000a3';
const TOM = { userId: '00000000-0000-4000-8000-0000000000b2', displayName: 'Tom' };
const MARCO = { userId: '00000000-0000-4000-8000-0000000000b3', displayName: 'Marco' };
const LIA = { userId: '00000000-0000-4000-8000-0000000000b4', displayName: 'Lia' };
const PATH = `/admin/users/${FAKE_GUEST_ID}/delete`;

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

const adminApi = (globalRoles: ('app_admin' | 'recipe_curator')[] = ['app_admin']) => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles });
type Plan = Awaited<ReturnType<ReturnType<typeof createFakeApi>['users']['getDeletionPlan']>>;
const plan = (families: DeletionFamily[], extra: Partial<Plan> = {}): Plan => ({
  families, lastAppAdmin: false, openInvitations: 0, pending: false, user: { id: FAKE_GUEST_ID, displayName: 'Ospite', email: 'ospite@example.com' }, ...extra
});
const family = (familyId: string, name: string, outcome: DeletionFamily['outcome'], candidates: DeletionFamily['candidates'] = []): DeletionFamily => ({
  familyId, name, outcome, candidates
});

/** The fake Api of an app administrator with the plans given, one per read (the last one repeats). */
function setup(...plans: Plan[]) {
  const api = adminApi();
  if (plans.length) {
    const reads = vi.fn();
    plans.forEach((p, index) => (index === plans.length - 1 ? reads.mockResolvedValue(p) : reads.mockResolvedValueOnce(p)));
    api.users.getDeletionPlan = reads as unknown as typeof api.users.getDeletionPlan;
  }
  return api;
}

const confirmButton = () => screen.findByRole('button', { name: 'Cancella Ospite definitivamente' }) as Promise<HTMLButtonElement>;
const card = (name: string) => screen.getByRole('region', { name });

describe('/admin/users/$userId/delete', () => {
  it('tells the outcome of each family in the third person', async () => {
    const api = setup(
      plan([family(HOME, 'Famiglia Folloni', 'stays'), family(SEA, 'Casa al mare', 'needs_successor', [TOM, MARCO]), family(SOLO, 'Solo io', 'deleted')], { openInvitations: 3 })
    );
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { name: 'Cancella Ospite', level: 1 })).toBeTruthy();
    expect(screen.getByText('ospite@example.com')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Le sue famiglie', level: 2 })).toBeTruthy();
    expect(within(card('Famiglia Folloni')).getByText('La famiglia continua senza Ospite.')).toBeTruthy();
    expect(within(card('Casa al mare')).getByText('Ospite è l’unico amministratore: prima scegli chi lo diventa.')).toBeTruthy();
    expect(within(card('Solo io')).getByText('Ospite è l’unico membro: la famiglia e tutti i suoi dati vengono eliminati.')).toBeTruthy();
    expect(screen.getByText('Si cancellano nome, email, voti e accessi, anche quelli degli agenti collegati.')).toBeTruthy();
    expect(screen.getByText('I suoi 3 inviti ancora attivi smettono di funzionare.')).toBeTruthy();
    // Decision 11: no number of agents in the third person.
    expect(screen.queryByText(/agent[ei]\.$/)).toBeNull();
    expect(screen.queryByText('Il tuo account')).toBeNull();
  });

  it('says nothing about links when there are none', async () => {
    renderApp(PATH, { api: setup(plan([])) });
    expect(await screen.findByText('Si cancellano nome, email, voti e accessi, anche quelli degli agenti collegati.')).toBeTruthy();
    expect(screen.queryByText(/smett[eo]no? di funzionare/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Le sue famiglie' })).toBeNull();
  });

  it('keeps the red button disabled until every family has a successor, and offline', async () => {
    renderApp(PATH, { api: setup(plan([family(SEA, 'Casa al mare', 'needs_successor', [TOM, MARCO])])) });
    const button = await confirmButton();
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Tom' }));
    expect(button.disabled).toBe(false);
    setOnline(false);
    await waitFor(() => expect(button.disabled).toBe(true));
  });

  it('the last app administrator cannot be deleted', async () => {
    renderApp(PATH, { api: setup(plan([], { lastAppAdmin: true })) });
    expect(await screen.findByRole('heading', { name: 'È l’unico amministratore dell’app: nomina prima un altro amministratore.' })).toBeTruthy();
    expect((await confirmButton()).disabled).toBe(true);
  });

  it('sends one’s own account to the preferences', async () => {
    renderApp(`/admin/users/${DEMO_USER_ID}/delete`, { api: adminApi() });
    expect(await screen.findByText('Per cancellare il tuo account usa le tue preferenze.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Account e preferenze' }).getAttribute('href')).toBe('/profile/preferences');
    expect(screen.queryByRole('button', { name: /definitivamente/ })).toBeNull();
  });

  it('on conflict reads the plan again and keeps the choices still valid', async () => {
    const before = plan([family(HOME, 'Famiglia Folloni', 'needs_successor', [TOM, MARCO]), family(SEA, 'Casa al mare', 'needs_successor', [MARCO, LIA])]);
    const after = plan([
      family(HOME, 'Famiglia Folloni', 'needs_successor', [TOM, MARCO]),
      family(SEA, 'Casa al mare', 'needs_successor', [MARCO]),
      family(SOLO, 'Solo io', 'deleted')
    ]);
    const api = setup(before, after);
    const remove = vi.fn().mockRejectedValueOnce(new ApiError('conflict')).mockResolvedValue({ completed: true });
    api.users.delete = remove as unknown as typeof api.users.delete;
    renderApp(PATH, { api });
    fireEvent.click(await screen.findByRole('radio', { name: 'Tom' }));
    fireEvent.click(within(card('Casa al mare')).getByRole('radio', { name: 'Lia' }));
    fireEvent.click(await confirmButton());
    expect((await screen.findByRole('alert')).textContent).toBe('Qualcosa è cambiato nelle sue famiglie: controlla di nuovo');
    expect(await screen.findByRole('region', { name: 'Solo io' })).toBeTruthy();
    expect(remove).toHaveBeenNthCalledWith(1, { id: FAKE_GUEST_ID, successors: { [HOME]: TOM.userId, [SEA]: LIA.userId }, deletedFamilies: [] }, expect.anything());
    expect((within(card('Famiglia Folloni')).getByRole('radio', { name: 'Tom' }) as HTMLInputElement).checked).toBe(true);
    expect((await confirmButton()).disabled).toBe(true);
    fireEvent.click(within(card('Casa al mare')).getByRole('radio', { name: 'Marco' }));
    fireEvent.click(await confirmButton());
    await waitFor(() =>
      expect(remove).toHaveBeenNthCalledWith(2, { id: FAKE_GUEST_ID, successors: { [HOME]: TOM.userId, [SEA]: MARCO.userId }, deletedFamilies: [SOLO] }, expect.anything())
    );
  });

  it('after the deletion opens /admin in place of the page, with «Utente cancellato»', async () => {
    const api = adminApi();
    const remove = vi.spyOn(api.users, 'delete');
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    await screen.findByText('ospite@example.com');
    history.push(PATH);
    fireEvent.click(await confirmButton());
    await waitFor(() => expect(history.location.pathname).toBe('/admin'));
    expect(remove).toHaveBeenCalledWith({ id: FAKE_GUEST_ID, successors: {}, deletedFamilies: [] }, expect.anything());
    expect((await screen.findByText('Utente cancellato: Ospite.')).getAttribute('role')).toBe('status');
    await waitFor(() => expect(screen.queryByText('ospite@example.com')).toBeNull());
    // The page was replaced: going back skips it.
    history.back();
    await waitFor(() => expect(history.location.pathname).toBe(`/admin/users/${FAKE_GUEST_ID}`));
  });

  it('is behind the administration’s access check', async () => {
    const api = adminApi([]);
    const plan = vi.spyOn(api.users, 'getDeletionPlan');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { name: 'Non hai accesso a questa pagina' })).toBeTruthy();
    expect(plan).not.toHaveBeenCalled();
  });
});
