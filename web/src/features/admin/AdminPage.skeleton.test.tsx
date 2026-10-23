import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import styles from './AdminPage.module.css';

afterEach(() => vi.restoreAllMocks());

const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const blockCards = () => [...document.querySelectorAll('.secondary-view .skeleton .settings-card.skeleton-card')];
const itemShape = (item: Element) =>
  [...item.children].map((el) => [...el.classList].filter((c) => c !== 'skeleton-line' && c !== 'skeleton-block').join('.') + (el.querySelector(`.${styles.role}`) ? '>role' : ''));

describe('/admin while loading (W22)', () => {
  it('admin: one announcement through the access check and the two lists', async () => {
    const api = adminApi();
    const profile = holdCalls(api, 'profile', 'get');
    const users = holdCalls(api, 'users', 'list');
    const invitations = holdCalls(api, 'appInvitations', 'list');
    renderApp('/admin', { api });
    await waitFor(() => expect(blockCards()).toHaveLength(2));
    const first = blockCards()[0]!;
    expect(first.children[1]!.classList.contains(styles.search!)).toBe(true);
    expect(first.children[2]!.matches('ul.row-list')).toBe(true);
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(loadingStatuses()).toHaveLength(1);
    await profile.open();
    const search = await screen.findByRole('searchbox', { name: 'Cerca per nome o email' });
    expect(blockCards()).toHaveLength(0);
    const usersCard = search.closest('section')!;
    expect(usersCard.querySelectorAll('.row-main.skeleton-block')).toHaveLength(3);
    expect(search.compareDocumentPosition(usersCard.querySelector('.skeleton')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    await users.open();
    await invitations.open();
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('admin: invitation items keep their structure from the check to the list', async () => {
    const api = adminApi();
    const profile = holdCalls(api, 'profile', 'get');
    holdCalls(api, 'appInvitations', 'list');
    renderApp('/admin', { api });
    await waitFor(() => expect(blockCards()).toHaveLength(2));
    const during = [...blockCards()[1]!.querySelectorAll(`.${styles.item}`)];
    expect(during).toHaveLength(2);
    const shape = itemShape(during[0]!);
    expect(shape).toEqual([styles.email, `${styles.roles}>role`, 'meta-line', 'meta-line']);
    await profile.open();
    const heading = await screen.findByRole('heading', { level: 2, name: 'Inviti all’app' });
    const after = [...heading.closest('section')!.querySelectorAll(`.${styles.item}`)];
    expect(after).toHaveLength(2);
    expect(itemShape(after[0]!)).toEqual(shape);
    expect(after[0]!.querySelector(`.${styles.email}.skeleton-block`)).not.toBeNull();
  });

  it('admin: the deleted notice stays next to the loading announcement', async () => {
    const api = adminApi();
    const { history } = renderApp('/profile', { api });
    await screen.findByRole('heading', { level: 1, name: 'Federico' });
    holdCalls(api, 'users', 'list');
    holdCalls(api, 'appInvitations', 'list');
    act(() => history.push('/admin', { userDeleted: 'Anna' }));
    expect(await screen.findByText('Utente cancellato: Anna.')).toBeTruthy();
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Utente cancellato: Anna.')).toBe(true);
  });

  it('admin: the check after a forbidden shows the skeleton, then the outcome', async () => {
    const api = adminApi();
    renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    const check = holdCalls(api, 'profile', 'get');
    vi.spyOn(api.users, 'list').mockRejectedValueOnce(new ApiError('forbidden'));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o email' }), { target: { value: 'o' } });
    await waitFor(() => expect(blockCards()).toHaveLength(2));
    expect(screen.queryByText('ospite@example.com')).toBeNull();
    await check.open();
    expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('admin: an error of a list stays in its card', async () => {
    const api = adminApi();
    api.appInvitations.list = async () => {
      throw new ApiError('internal');
    };
    renderApp('/admin', { api });
    const retry = await screen.findByRole('button', { name: 'Riprova' });
    expect(retry.closest('.settings-card')!.querySelector('#invitations-title')).not.toBeNull();
    await screen.findByText('ospite@example.com');
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('admin: no skeleton with the cached copy', async () => {
    const api = adminApi();
    const { history } = renderApp('/admin', { api });
    await screen.findByText('ospite@example.com');
    act(() => history.push('/profile'));
    await screen.findByRole('heading', { level: 1, name: 'Federico' });
    holdCalls(api, 'users', 'list');
    holdCalls(api, 'appInvitations', 'list');
    act(() => history.push('/admin'));
    expect(await screen.findByText('ospite@example.com')).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});
