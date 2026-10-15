import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { renderApp } from '../../test/renderApp';

const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('/admin users', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows Utenti above the invitations, with roles as labels and «Tu»', async () => {
    renderApp('/admin', { api: adminApi() });
    const users = await screen.findByRole('heading', { name: 'Utenti' });
    const invitations = screen.getByRole('heading', { name: 'Inviti all’app' });
    expect(users.compareDocumentPosition(invitations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const me = (await screen.findByText(/· Tu/)).closest('a')!;
    expect(within(me).getByText('amministratore dell’app')).toBeTruthy();
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
  });

  it('searches once after typing stops, keeping the previous list meanwhile', async () => {
    const api = adminApi();
    const list = vi.spyOn(api.users, 'list');
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    list.mockClear();
    const search = screen.getByRole('searchbox', { name: 'Cerca per nome o email' });
    fireEvent.change(search, { target: { value: 'o' } });
    fireEvent.change(search, { target: { value: 'osp' } });
    expect(screen.getByText('ospite@example.com')).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalledWith({ query: 'osp' }, expect.anything()));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('says when nobody matches and when there are more', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'zzz' } });
    expect(await screen.findByText('Nessun utente')).toBeTruthy();
    vi.spyOn(api.users, 'list').mockResolvedValue({ users: [], more: true });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'z' } });
    expect(await screen.findByText('Ci sono altri utenti: restringi la ricerca.')).toBeTruthy();
  });

  /** Another administrator appears and takes the role away from the signed-in person. */
  async function demoteElsewhere(api: ReturnType<typeof adminApi>) {
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
  }
  const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value } });
  /** Nothing of the administration is in the page: no data, no search, no commands. */
  function nothingShown() {
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuovo invito' })).toBeNull();
  }

  it('a forbidden search hides data and commands at once, keeps them hidden if the profile cannot be read, then denies access', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    await demoteElsewhere(api);
    const profileRead = deferred<never>();
    const realProfile = api.profile.get.bind(api.profile);
    const getProfile = vi.spyOn(api.profile, 'get').mockImplementation(() => profileRead.promise);
    search('o');
    await waitFor(() => expect(getProfile).toHaveBeenCalled());
    nothingShown(); // the profile read is still pending: the cached profile (still admin) is not trusted
    profileRead.reject(new ApiError('internal'));
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    nothingShown();
    getProfile.mockImplementation(realProfile);
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    nothingShown();
  });

  it('a forbidden answer while the profile still says app_admin reads the sections again', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    const list = vi.spyOn(api.users, 'list').mockRejectedValueOnce(new ApiError('forbidden'));
    search('o');
    // The forbidden search, then the sections mounted again and read from scratch (empty search).
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(list).toHaveBeenLastCalledWith({}, expect.anything());
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
    expect((screen.getByRole('searchbox', { name: 'Cerca per nome o email' }) as HTMLInputElement).value).toBe('');
  });

  it('opens the detail of a user', async () => {
    const { history } = renderApp('/admin', { api: adminApi() });
    fireEvent.click((await screen.findByText('ospite@example.com')).closest('a')!);
    await waitFor(() => expect(history.location.pathname).toBe('/admin/users/00000000-0000-4000-8000-00000000a5e1'));
  });
});
