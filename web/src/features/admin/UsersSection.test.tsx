import { focusManager } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { LanguageSwitch } from '../../test/LanguageSwitch';
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

  it('after a forbidden and a failed check, a late answer and leaving and reopening /admin show nothing until a check succeeds', async () => {
    const api = adminApi();
    const { history } = renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    await demoteElsewhere(api);
    const realList = api.users.list.bind(api.users);
    const late = deferred<Awaited<ReturnType<typeof api.users.list>>>();
    const list = vi.spyOn(api.users, 'list').mockImplementation((input) => (input.query === 'o' ? late.promise : realList(input)));
    const realProfile = api.profile.get.bind(api.profile);
    const getProfile = vi.spyOn(api.profile, 'get').mockRejectedValue(new ApiError('internal'));
    vi.spyOn(api.appInvitations, 'list').mockRejectedValue(new ApiError('internal'));
    search('o'); // answers late
    await waitFor(() => expect(list).toHaveBeenCalledWith({ query: 'o' }, expect.anything()));
    search('os'); // forbidden
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    // The answer of the earlier search arrives: it was for a view no longer allowed.
    late.resolve({ users: [{ id: FAKE_GUEST_ID, displayName: 'Ospite', email: 'ospite@example.com', roles: ['app_admin'] }], more: false });
    await new Promise((r) => setTimeout(r, 20));
    nothingShown();
    // Out and back in, the profile still failing and the list never answering: the earlier
    // permission is not reused, and no copy of the earlier list is shown.
    list.mockImplementation(() => new Promise(() => undefined));
    await history.push('/profile');
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
    await history.push('/admin');
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    nothingShown();
    getProfile.mockImplementation(realProfile);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    nothingShown();
  });

  it('a profile read started before the forbidden does not give access back when it answers', async () => {
    const api = adminApi();
    const { history } = renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    const stillAdmin = await api.profile.get({});
    const early = deferred<typeof stillAdmin>();
    // The first read hangs and will answer with the profile from before; later ones fail.
    const getProfile = vi.spyOn(api.profile, 'get').mockImplementationOnce(() => early.promise).mockRejectedValue(new ApiError('internal'));
    focusManager.setFocused(false);
    focusManager.setFocused(true); // the window comes back: the profile is read again
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    await demoteElsewhere(api);
    vi.spyOn(api.users, 'list').mockRejectedValueOnce(new ApiError('forbidden')).mockImplementation(() => new Promise(() => undefined));
    vi.spyOn(api.appInvitations, 'list').mockImplementation(() => new Promise(() => undefined));
    search('o');
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
    early.resolve(stillAdmin); // the answer from before arrives
    await new Promise((r) => setTimeout(r, 20));
    nothingShown();
    // The check made a request of its own, which failed.
    expect(getProfile).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    await history.push('/profile');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Amministrazione dell’app' })).toBeNull());
    await history.push('/admin');
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    nothingShown();
  });

  it('after a check confirms the role is gone, the profile cached in another language does not bring the page back', async () => {
    const api = adminApi();
    renderApp('/admin', { api, extra: <LanguageSwitch /> });
    await screen.findByText('ospite@example.com');
    // The profile, still with app_admin, is cached in both languages.
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    await screen.findByRole('searchbox', { name: 'Search by name or email' });
    fireEvent.click(screen.getByRole('button', { name: 'test: italiano' }));
    await screen.findByRole('searchbox', { name: 'Cerca per nome o email' });
    await demoteElsewhere(api);
    search('o');
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    vi.spyOn(api.profile, 'get').mockRejectedValue(new ApiError('internal'));
    vi.spyOn(api.users, 'list').mockImplementation(() => new Promise(() => undefined));
    vi.spyOn(api.appInvitations, 'list').mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    expect(await screen.findByText('You don’t have access to this page')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New invitation' })).toBeNull();
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
