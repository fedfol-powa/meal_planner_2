import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID, type FakeData } from '../../api/fake/fakeApi';
import { createNewFamilyData } from '../../api/fake/family';
import { FAKE_FAMILY_INVITE_TOKEN } from '../../api/fake/fakeFamilyInvitations';
import { createMemoryStore, isRevokedMark, readMark, revokedKey } from '../../api/persister';
import { familyOfKey } from '../../api/queries';
import { useSession } from '../../session/SessionScope';
import type { Session } from '../../session/session';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';

const FEDERICO = { id: 'user-federico', email: 'federico@example.com' };
const ANNA = { id: 'user-anna', email: 'anna@example.com' };
const OTHER = { id: '00000000-0000-4000-8000-0000000000f2', name: 'Casa al mare', timeZone: 'Europe/Rome', measurementSystem: 'metric' as const };
const created = (userId: string) => ({ id: OTHER.id, data: createNewFamilyData(OTHER, userId) });
const DELETE_PATH = `/profile/family/delete?family=${DEMO_FAMILY_ID}`;
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => setOnline(true));

function setup(user = FEDERICO, change?: (data: FakeData) => void) {
  const data = createFakeData(user);
  change?.(data);
  const api = createFakeApi({ getLocale: () => 'it-IT', data, latencyMs: 0 });
  const backend = createStubBackend(user, 'supabase');
  return { data, api, backend, store: createMemoryStore() };
}

/** The session of the page, to look at what the device keeps. */
function probe() {
  const seen: { session: Session | null } = { session: null };
  function Probe() {
    seen.session = useSession();
    return null;
  }
  return { seen, extra: <Probe /> };
}

const familyViews = (session: Session) =>
  session.queryClient.getQueryCache().getAll().filter((query) => familyOfKey(query.queryKey) === DEMO_FAMILY_ID && query.state.data !== undefined);

describe('family deletion page', () => {
  it('shows an administrator what is deleted, what stays and the red button', async () => {
    const { api, backend } = setup();
    renderApp(DELETE_PATH, { api, backend });
    expect(await screen.findByRole('heading', { name: 'Famiglia Folloni', level: 2 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Elimina la famiglia', level: 1 })).toBeTruthy();
    expect(screen.getByText('Vengono cancellati per tutti i membri (Anna, Federico, Tom):')).toBeTruthy();
    expect(screen.getByText(/^menu e storico \(\d+ settiman[ae]\)$/)).toBeTruthy();
    expect(screen.getByText('note, liste della spesa, impostazioni, «non proporre più» e link d’invito')).toBeTruthy();
    expect(screen.getByText('Restano gli account, i voti personali, le altre famiglie e il ricettario.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elimina Famiglia Folloni' })).toBeTruthy();
    expect(screen.queryByText('Solo un amministratore della famiglia può eliminarla.')).toBeNull();
  });

  it('tells a member that only an administrator can delete the family, without the button', async () => {
    const { api, backend } = setup(ANNA);
    renderApp(DELETE_PATH, { api, backend });
    expect(await screen.findByText('Solo un amministratore della famiglia può eliminarla.')).toBeTruthy();
    expect(screen.getByText('Restano gli account, i voti personali, le altre famiglie e il ricettario.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Elimina / })).toBeNull();
  });

  it('writes nothing when the page opens', async () => {
    const { api, backend } = setup();
    const writes = [vi.spyOn(api.family, 'delete'), vi.spyOn(api.family, 'leave'), vi.spyOn(api.family, 'removeMember'), vi.spyOn(api.family, 'setMemberRole')];
    const getDeletion = vi.spyOn(api.family, 'getDeletion');
    renderApp(DELETE_PATH, { api, backend });
    expect(await screen.findByRole('button', { name: 'Elimina Famiglia Folloni' })).toBeTruthy();
    expect(getDeletion).toHaveBeenCalledWith(expect.objectContaining({ familyId: DEMO_FAMILY_ID }), expect.anything());
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it('deletes after the confirmation and opens the menu when no family remains', async () => {
    const { api, backend, data } = setup();
    const remove = vi.spyOn(api.family, 'delete');
    const { history } = renderApp(DELETE_PATH, { api, backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Elimina Famiglia Folloni' }));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(remove).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID }, expect.anything());
    expect(data.family.deleted).toBe(true);
  });

  it('deletes and opens the profile when another family remains', async () => {
    const { api, backend } = setup(FEDERICO, (data) => data.createdFamilies.push(created(FEDERICO.id)));
    const { history } = renderApp(DELETE_PATH, { api, backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Elimina Famiglia Folloni' }));
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
  });

  it('cannot delete offline', async () => {
    const { api, backend } = setup();
    renderApp(DELETE_PATH, { api, backend });
    const button = (await screen.findByRole('button', { name: 'Elimina Famiglia Folloni' })) as HTMLButtonElement;
    setOnline(false);
    await waitFor(() => expect(button.disabled).toBe(true));
  });

  it('shows the revoked access state when the family is no longer accessible', async () => {
    const { api, backend } = setup();
    vi.spyOn(api.family, 'getDeletion').mockRejectedValue(new ApiError('forbidden'));
    renderApp(DELETE_PATH, { api, backend });
    expect(await screen.findByText('Non hai accesso a questa famiglia.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Elimina / })).toBeNull();
  });
});

describe('family data on the device after leaving, deleting and joining (spec W11, «Dati sul dispositivo»)', () => {
  it('leave and delete revoke before navigating', async () => {
    for (const path of ['/profile/family', DELETE_PATH]) {
      const { api, backend, store } = setup(ANNA, (data) => {
        // Anna is the administrator who deletes; leaving needs no successor.
        data.family.members.find((m) => m.id === 'user-anna')!.role = 'family_admin';
      });
      const { seen, extra } = probe();
      const { history, unmount } = renderApp(path, { api, backend, store, extra });
      const atNavigation: boolean[] = [];
      history.subscribe(() => atNavigation.push(seen.session!.isRevoked(DEMO_FAMILY_ID) && familyViews(seen.session!).length === 0));
      if (path === DELETE_PATH) fireEvent.click(await screen.findByRole('button', { name: 'Elimina Famiglia Folloni' }));
      else {
        const leave = (await screen.findByRole('button', { name: 'Esci dalla famiglia' })) as HTMLButtonElement;
        await waitFor(() => expect(leave.disabled).toBe(false));
        fireEvent.click(leave);
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Esci' }));
      }
      await waitFor(() => expect(history.location.pathname).toBe('/menu'));
      expect(atNavigation[0]).toBe(true);
      // Revoked in the record of the device: the revocation is newer than the last confirmation (the profile read before).
      await waitFor(() => expect(isRevokedMark(readMark(store.entries.get(revokedKey('user-anna', DEMO_FAMILY_ID))))).toBe(true));
      unmount();
    }
  });

  it('leave then join restores the family without old data', async () => {
    const { api, backend, store } = setup(ANNA);
    const { seen, extra } = probe();
    const { history } = renderApp('/profile/family', { api, backend, store, extra });
    const leave = (await screen.findByRole('button', { name: 'Esci dalla famiglia' })) as HTMLButtonElement;
    await waitFor(() => expect(leave.disabled).toBe(false));
    expect(familyViews(seen.session!).length).toBeGreaterThan(0);
    fireEvent.click(leave);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(seen.session!.isRevoked(DEMO_FAMILY_ID)).toBe(true);

    history.push(`/invite#${FAKE_FAMILY_INVITE_TOKEN}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Entra nella famiglia' }));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    await waitFor(() => expect(seen.session!.isRevoked(DEMO_FAMILY_ID)).toBe(false));
    const mark = await vi.waitFor(() => {
      const saved = store.entries.get(revokedKey('user-anna', DEMO_FAMILY_ID)) as { revokedAt: number; restoredAt: number };
      expect(saved.restoredAt).toBeGreaterThan(saved.revokedAt);
      return saved;
    });
    // Whatever the family shows now was read after the return.
    for (const query of familyViews(seen.session!)) expect((query.state.data as { producedAt?: number }).producedAt ?? 0).toBeGreaterThan(mark.revokedAt);
    expect(screen.queryByText('Non hai accesso a questa famiglia.')).toBeNull();
  });

  it('removal, new link, join restores the family', async () => {
    const { api, backend, data, store } = setup(ANNA);
    const { seen, extra } = probe();
    const { history } = renderApp('/profile/family', { api, backend, store, extra });
    expect(await screen.findByText('Anna (tu)')).toBeTruthy();

    // Federico removes Anna on his device, then makes a new link.
    data.family.members = data.family.members.filter((m) => m.id !== 'user-anna');
    data.family.removals.push({ userId: 'user-anna', at: new Date(Date.now() - 1000).toISOString() });
    const token = 'nuovo'.padEnd(43, 'z');
    data.family.links.push({ id: '00000000-0000-4000-8000-00000000a301', token, createdBy: 'user-federico', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * DAY).toISOString(), revokedAt: null, registrations: [] });
    // Anna's profile is read again (focus, another screen): the family is gone from it.
    await seen.session!.queryClient.invalidateQueries({ queryKey: ['profile'] });
    await waitFor(() => expect(seen.session!.isRevoked(DEMO_FAMILY_ID)).toBe(true));
    expect(familyViews(seen.session!)).toEqual([]);

    history.push(`/invite#${token}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Entra nella famiglia' }));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    await waitFor(() => expect(seen.session!.isRevoked(DEMO_FAMILY_ID)).toBe(false));
    expect(data.family.members.some((m) => m.id === 'user-anna')).toBe(true);
  });
});
