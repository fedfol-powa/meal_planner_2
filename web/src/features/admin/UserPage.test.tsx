import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { renderApp } from '../../test/renderApp';

const adminApi = (locale: 'it-IT' | 'en-GB' = 'it-IT') => createFakeApi({ getLocale: () => locale, latencyMs: 0, globalRoles: ['app_admin'] });
const curator = () => screen.findByRole('switch', { name: /Curatore del ricettario/ }) as Promise<HTMLInputElement>;
const appAdmin = () => screen.findByRole('switch', { name: /Amministratore dell’app/ }) as Promise<HTMLInputElement>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('/admin/users/$userId', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows email, roles, and no families for the invited account', async () => {
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: adminApi() });
    expect(await screen.findByRole('heading', { name: 'Ospite', level: 1 })).toBeTruthy();
    expect(screen.getByText('ospite@example.com')).toBeTruthy();
    expect((await curator()).checked).toBe(false);
    expect(screen.getByText('Nessuna famiglia')).toBeTruthy();
    expect(screen.getByText('Si vedono solo nome e ruolo.')).toBeTruthy();
    expect(screen.queryByText('Questo è il tuo account')).toBeNull();
    expect(screen.queryByText(/Elimina/)).toBeNull();
  });

  it('labels the detail of an account whose email is not confirmed yet, and not the others', async () => {
    const api = adminApi();
    const real = api.users.get.bind(api.users);
    vi.spyOn(api.users, 'get').mockImplementation(async (input) => {
      const result = await real(input);
      return { ...result, user: { ...result.user, emailUnconfirmed: true } };
    });
    const first = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    expect(await screen.findByText("Non ha ancora confermato l'email")).toBeTruthy();
    first.unmount();
    vi.restoreAllMocks();
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: adminApi() });
    await screen.findByText('ospite@example.com');
    expect(screen.queryByText(/Non ha ancora confermato/)).toBeNull();
  });

  it('marks one’s own account, in Italian and in English', async () => {
    const first = renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi() });
    expect(await screen.findByText('Questo è il tuo account')).toBeTruthy();
    first.unmount();
    // The app follows the profile's language: the demo person's is Italian until changed.
    const english = adminApi('en-GB');
    await english.profile.update({ locale: 'en-GB' });
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api: english, locale: 'en-GB' });
    expect(await screen.findByText('This is your account')).toBeTruthy();
  });

  it('keeps both switches locked until the confirmed state is shown, then keeps it if the reread fails', async () => {
    const api = adminApi();
    const realGet = api.users.get.bind(api.users);
    const reread = deferred<never>();
    let gets = 0;
    // The first read is real; every later one (the reread the registry starts) hangs, then fails.
    vi.spyOn(api.users, 'get').mockImplementation((input) => (gets++ === 0 ? realGet(input) : reread.promise));
    const answer = deferred<void>();
    const realSet = api.users.setRole.bind(api.users);
    const setRole = vi.spyOn(api.users, 'setRole').mockImplementation(async (input) => {
      await answer.promise;
      return realSet(input);
    });
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const box = await curator();
    fireEvent.click(box);
    fireEvent.click(box);
    await waitFor(() => expect(setRole).toHaveBeenCalledTimes(1));
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect((await appAdmin()).disabled).toBe(true);
    answer.resolve();
    // The answer of setRole is the confirmed state: shown at once, while the reread still hangs.
    await waitFor(async () => expect((await curator()).checked).toBe(true));
    expect((await curator()).disabled).toBe(false);
    reread.reject(new ApiError('internal'));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect((await curator()).checked).toBe(true);
    expect(setRole).toHaveBeenCalledTimes(1);
    expect(setRole).toHaveBeenCalledWith({ id: FAKE_GUEST_ID, role: 'recipe_curator', granted: true }, expect.anything());
  });

  it('asks before appointing an administrator', async () => {
    const api = adminApi();
    const setRole = vi.spyOn(api.users, 'setRole');
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    fireEvent.click(await appAdmin());
    const sheet = await screen.findByRole('dialog', { name: 'Nominare Ospite amministratore dell’app?' });
    expect(setRole).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Nomina' }));
    await waitFor(async () => expect((await appAdmin()).checked).toBe(true));
  });

  it('locks the last administrator’s switch with the reason', async () => {
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi() });
    const box = await appAdmin();
    expect(box.disabled).toBe(true);
    expect(screen.getByText('È l’unico amministratore dell’app: nominane un altro prima.')).toBeTruthy();
  });

  it('giving up one’s own role asks, then leads to the profile without the administration', async () => {
    const api = adminApi();
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    const { history } = renderApp(`/admin/users/${DEMO_USER_ID}`, { api });
    fireEvent.click(await appAdmin());
    const sheet = await screen.findByRole('dialog', { name: 'Rinunciare al ruolo di amministratore?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Rinuncia' }));
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
    await waitFor(() => expect(screen.queryByText('Amministrazione dell’app')).toBeNull());
  });

  it('after a demotion made elsewhere, the next tap hides the user at once, then shows «Non hai accesso»', async () => {
    const api = adminApi();
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const box = await curator();
    // Another administrator appears and takes the role away from the signed-in person.
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    const profileRead = deferred<never>();
    const realProfile = api.profile.get.bind(api.profile);
    const getProfile = vi.spyOn(api.profile, 'get').mockImplementation(() => profileRead.promise);
    fireEvent.click(box);
    await waitFor(() => expect(getProfile).toHaveBeenCalled());
    // The profile read hangs: the cached profile still says app_admin, and is not trusted.
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    profileRead.reject(new ApiError('internal'));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    getProfile.mockImplementation(realProfile);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('after a forbidden and a failed check, leaving and reopening the page shows nothing until a check succeeds', async () => {
    const api = adminApi();
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const box = await curator();
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    const realProfile = api.profile.get.bind(api.profile);
    const getProfile = vi.spyOn(api.profile, 'get').mockRejectedValue(new ApiError('internal'));
    vi.spyOn(api.users, 'get').mockRejectedValue(new ApiError('internal'));
    fireEvent.click(box);
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    // Out and back in, with every read still failing: the earlier permission is not reused.
    await history.push('/profile');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Utenti', level: 1 })).toBeNull());
    await history.push(`/admin/users/${FAKE_GUEST_ID}`);
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    getProfile.mockImplementation(realProfile);
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a forbidden answer while still app_admin shows the user again, read from scratch', async () => {
    const api = adminApi();
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    const get = vi.spyOn(api.users, 'get');
    vi.spyOn(api.users, 'setRole').mockRejectedValueOnce(new ApiError('forbidden'));
    fireEvent.click(await curator());
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
    expect((await curator()).checked).toBe(false);
  });

  it('an older answer never replaces a newer one for the same user, also after leaving and reopening the page', async () => {
    const api = adminApi();
    const realSet = api.users.setRole.bind(api.users);
    const realGet = api.users.get.bind(api.users);
    let hangReads = false;
    vi.spyOn(api.users, 'get').mockImplementation((input) => (hangReads ? new Promise(() => undefined) : realGet(input)));
    const slow = deferred<void>();
    let calls = 0;
    vi.spyOn(api.users, 'setRole').mockImplementation(async (input) => {
      const first = calls++ === 0;
      const answer = await realSet(input); // written at once on the "server"
      if (first) await slow.promise; // its answer arrives late
      return answer;
    });
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    fireEvent.click(await curator()); // give curator: the answer is late
    await waitFor(() => expect(calls).toBe(1));
    await history.push('/admin');
    await screen.findByRole('heading', { name: 'Utenti' }); // the detail is really left (unmounted)
    await history.push(`/admin/users/${FAKE_GUEST_ID}`);
    await waitFor(async () => expect((await curator()).checked).toBe(true)); // read again: given
    fireEvent.click(await curator()); // take it away: answered at once
    await waitFor(async () => expect((await curator()).checked).toBe(false));
    hangReads = true; // no reread can fix a wrong write from now on
    slow.resolve(); // the older answer (curator given) arrives last
    await new Promise((r) => setTimeout(r, 20));
    expect((await curator()).checked).toBe(false);
  });

  it('after a failed change the detail is read again: a last_app_admin refusal locks the switch with the reason', async () => {
    const api = adminApi();
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api });
    const box = await appAdmin();
    expect(box.disabled).toBe(false);
    // Meanwhile the other administrator goes: the signed-in person is now the last one.
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: false });
    fireEvent.click(box);
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Rinunciare al ruolo di amministratore?' })).getByRole('button', { name: 'Rinuncia' }));
    expect(await screen.findByText('È l’unico amministratore dell’app: nominane un altro prima.')).toBeTruthy();
    expect((await appAdmin()).disabled).toBe(true);
    expect((await appAdmin()).checked).toBe(true);
  });

  it('shows not found for an unknown id', async () => {
    renderApp('/admin/users/00000000-0000-4000-8000-000000000000', { api: adminApi() });
    expect(await screen.findByText('Contenuto non trovato.')).toBeTruthy();
  });

  it('refuses people without app_admin', async () => {
    renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: [] }) });
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
  });
});

describe('/admin/users/$userId deletion', () => {
  afterEach(() => vi.restoreAllMocks());

  /** The guest with a deletion started on 14 October and the failed attempts given. */
  function pending(attempts: number) {
    const api = adminApi();
    const realGet = api.users.get.bind(api.users);
    vi.spyOn(api.users, 'get').mockImplementation(async (input) => {
      const detail = await realGet(input);
      return { ...detail, user: { ...detail.user, deletion: { requestedAt: '2026-10-14T09:00:00Z', attempts } } };
    });
    return api;
  }

  it('offers the deletion of another user below the families', async () => {
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api: adminApi() });
    const link = await screen.findByRole('link', { name: 'Cancella l’utente' });
    const families = screen.getByRole('heading', { name: 'Famiglie' });
    expect(families.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Per cancellare il tuo account usa le tue preferenze.')).toBeNull();
    fireEvent.click(link);
    await waitFor(() => expect(history.location.pathname).toBe(`/admin/users/${FAKE_GUEST_ID}/delete`));
  });

  it('sends one’s own account to the preferences', async () => {
    renderApp(`/admin/users/${DEMO_USER_ID}`, { api: adminApi() });
    expect(await screen.findByText('Per cancellare il tuo account usa le tue preferenze.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Account e preferenze' }).getAttribute('href')).toBe('/profile/preferences');
    expect(screen.queryByRole('link', { name: 'Cancella l’utente' })).toBeNull();
  });

  it('a deletion in progress replaces the switches with the notice and «Completa la cancellazione»', async () => {
    const api = pending(2);
    const remove = vi.spyOn(api.users, 'delete');
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    expect(await screen.findByText('Cancellazione in corso dal 14 ottobre')).toBeTruthy();
    expect(screen.getByText('2 tentativi non riusciti')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cancella l’utente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Completa la cancellazione' }));
    await waitFor(() => expect(history.location.pathname).toBe('/admin'));
    expect(remove).toHaveBeenCalledWith({ id: FAKE_GUEST_ID, successors: {}, deletedFamilies: [] }, expect.anything());
    expect(await screen.findByText('Utente cancellato: Ospite.')).toBeTruthy();
  });

  it('says nothing of attempts before the first failure; an unfinished completion stays on the page', async () => {
    const api = pending(0);
    const remove = vi.spyOn(api.users, 'delete').mockResolvedValue({ completed: false });
    const { history } = renderApp(`/admin/users/${FAKE_GUEST_ID}`, { api });
    expect(await screen.findByText('Cancellazione in corso dal 14 ottobre')).toBeTruthy();
    expect(screen.queryByText(/non riuscit/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Completa la cancellazione' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(history.location.pathname).toBe(`/admin/users/${FAKE_GUEST_ID}`);
    expect(await screen.findByRole('button', { name: 'Completa la cancellazione' })).toBeTruthy();
  });
});
