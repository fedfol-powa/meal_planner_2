import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { expireFakeInvitation, fakeTokenOf } from '../../api/fake/fakeAppInvitations';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { DEMO_USER_ID } from '../../api/fake/seed';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

describe('/admin', () => {
afterEach(() => vi.restoreAllMocks());

it('creates an invitation, shows the link once with copy, and lists it', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
  const create = vi.spyOn(api.appInvitations, 'create');
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'nuova@x.it' } });
  fireEvent.click(within(sheet).getByLabelText('Curatore del ricettario'));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ id: expect.any(String), email: 'nuova@x.it', roles: ['recipe_curator'] }, expect.anything()));
  expect(await within(sheet).findByText(/\/invite\/app#/)).toBeTruthy();
  expect(within(sheet).getByText('Il link si vede solo ora: se lo perdi, crea un nuovo link.')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
  const row = (await screen.findByText('nuova@x.it')).closest('li')!;
  expect(within(row).getByText('curatore del ricettario')).toBeTruthy();
  expect(within(row).queryByText(/invite\/app#/)).toBeNull();
});

const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });

it('«Nuovo link» recreates the invitation with the same email and roles', async () => {
  const api = adminApi();
  const first = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'zia@x.it', roles: ['app_admin'] });
  const create = vi.spyOn(api.appInvitations, 'create');
  renderApp('/admin', { api });
  const row = (await screen.findByText('zia@x.it')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Nuovo link' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith({ id: expect.any(String), email: 'zia@x.it', roles: ['app_admin'] }, expect.anything()));
  expect(create.mock.calls[0]![0].id).not.toBe(first.invitation.id);
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  expect(await within(sheet).findByText(/\/invite\/app#/)).toBeTruthy();
});

it('revokes after confirmation', async () => {
  const api = adminApi();
  const { invitation } = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'via@x.it', roles: [] });
  const revoke = vi.spyOn(api.appInvitations, 'revoke');
  renderApp('/admin', { api });
  const row = (await screen.findByText('via@x.it')).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Revoca' }));
  const confirm = await screen.findByRole('dialog', { name: 'Revocare l’invito?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: invitation.id }, expect.anything()));
  expect(await within((await screen.findByText('via@x.it')).closest('li')!).findByText(/^Revocato il /)).toBeTruthy();
});

it('one creation per tap burst, and a late answer of a closed sheet never shows its link', async () => {
  const api = adminApi();
  const answers: (() => void)[] = [];
  const real = api.appInvitations.create.bind(api.appInvitations);
  // Written at once (as the database commits A, then B), answered when the test says.
  const create = vi.spyOn(api.appInvitations, 'create').mockImplementation((input) => {
    const done = real(input);
    return new Promise((resolve) => answers.push(() => void done.then(resolve)));
  });
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  let sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'a@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1)); // attempt A, still waiting
  await new Promise((r) => setTimeout(r, 20));
  expect(create).toHaveBeenCalledTimes(1); // the second tap was blocked
  fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nuovo invito' }));
  sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'a@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' })); // attempt B
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  answers[1]!(); // B answers first
  const shown = (await within(sheet).findByText(/\/invite\/app#/)).textContent!;
  answers[0]!(); // A answers late: its link was replaced by B (same email) and must not appear
  await new Promise((r) => setTimeout(r, 20));
  expect(within(sheet).getByText(/\/invite\/app#/).textContent).toBe(shown);
  const pending = (await api.appInvitations.list({})).invitations.filter((i) => i.email === 'a@x.it' && i.status === 'pending');
  expect(pending).toHaveLength(1);
  expect(shown.endsWith(fakeTokenOf(api, pending[0]!.id))).toBe(true); // the shown link is the valid one
});

it('a retry with the same data keeps the id; a change of email or roles is a new invitation', async () => {
  const api = adminApi();
  const create = vi.spyOn(api.appInvitations, 'create').mockRejectedValueOnce(new ApiError('internal')).mockRejectedValueOnce(new ApiError('internal')).mockRejectedValueOnce(new ApiError('internal'));
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  const send = async (calls: number) => {
    fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(calls));
  };
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'uno@x.it' } });
  await send(1);
  await send(2); // the same: perhaps written, its answer lost
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'due@x.it' } });
  await send(3);
  fireEvent.click(within(sheet).getByLabelText('Curatore del ricettario'));
  await send(4);
  const ids = create.mock.calls.map((call) => call[0].id);
  expect(ids[1]).toBe(ids[0]);
  expect(new Set([ids[0], ids[2], ids[3]]).size).toBe(3);
});

it('the error of an earlier revocation does not show on another invitation', async () => {
  const api = adminApi();
  await api.appInvitations.create({ id: crypto.randomUUID(), email: 'prima@x.it', roles: [] });
  await api.appInvitations.create({ id: crypto.randomUUID(), email: 'seconda@x.it', roles: [] });
  vi.spyOn(api.appInvitations, 'revoke').mockRejectedValueOnce(new ApiError('internal'));
  renderApp('/admin', { api });
  fireEvent.click(within((await screen.findByText('prima@x.it')).closest('li')!).getByRole('button', { name: 'Revoca' }));
  let confirm = await screen.findByRole('dialog', { name: 'Revocare l’invito?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Revoca' }));
  expect(await within(confirm).findByRole('alert')).toBeTruthy();
  fireEvent.click(within(confirm).getByRole('button', { name: 'Chiudi' }));
  fireEvent.click(within((await screen.findByText('seconda@x.it')).closest('li')!).getByRole('button', { name: 'Revoca' }));
  confirm = await screen.findByRole('dialog', { name: 'Revocare l’invito?' });
  expect(within(confirm).getByText('seconda@x.it')).toBeTruthy();
  expect(within(confirm).queryByRole('alert')).toBeNull();
});

it('revokes an expired invitation too', async () => {
  const api = adminApi();
  const { invitation } = await api.appInvitations.create({ id: crypto.randomUUID(), email: 'old@x.it', roles: [] });
  expireFakeInvitation(api, invitation.id); // helper of fakeAppInvitations: moves expiresAt to the past
  const revoke = vi.spyOn(api.appInvitations, 'revoke');
  renderApp('/admin', { api });
  const row = (await screen.findByText('old@x.it')).closest('li')!;
  expect(within(row).getByText(/^Scaduto il /)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button', { name: 'Revoca' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Revocare l’invito?' })).getByRole('button', { name: 'Revoca' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: invitation.id }, expect.anything()));
});

it('says when the email already has an account', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'gia@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
});

it('turns «Questa email ha già un account» into a link to the user (fake mode answers account_exists)', async () => {
  const { history } = renderApp('/admin', { api: adminApi() });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'OSPITE@example.com' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
  fireEvent.click(await within(sheet).findByRole('link', { name: 'Apri l’utente' }));
  await waitFor(() => expect(history.location.pathname).toBe(`/admin/users/${FAKE_GUEST_ID}`));
});

it('keeps only the text when the user cannot be found', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  vi.spyOn(api.users, 'list').mockResolvedValue({ users: [], more: false });
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'altro@example.com' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await within(sheet).findByText('Questa email ha già un account')).toBeTruthy();
  await new Promise((r) => setTimeout(r, 20));
  expect(within(sheet).queryByRole('link', { name: 'Apri l’utente' })).toBeNull();
});

it('links the user of the latest attempt even when the searches answer in reverse order, and drops the link when the email changes', async () => {
  const api = adminApi();
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  const answers = new Map<string, (value: { users: { id: string; displayName: string; email: string; roles: []; deletion: null }[]; more: boolean }) => void>();
  vi.spyOn(api.users, 'list').mockImplementation((input) => new Promise((resolve) => answers.set(input.query ?? '', resolve)));
  const row = (id: string, email: string) => ({ users: [{ id, displayName: email, email, roles: [] as [], deletion: null }], more: false });
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  const field = within(sheet).getByLabelText('Email');
  fireEvent.change(field, { target: { value: 'a@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(answers.has('a@x.it')).toBe(true));
  fireEvent.change(field, { target: { value: 'b@x.it' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  await waitFor(() => expect(answers.has('b@x.it')).toBe(true));
  answers.get('b@x.it')!(row('00000000-0000-4000-8000-0000000000b0', 'b@x.it'));
  const link = await within(sheet).findByRole('link', { name: 'Apri l’utente' });
  answers.get('a@x.it')!(row('00000000-0000-4000-8000-0000000000a0', 'a@x.it'));
  await new Promise((r) => setTimeout(r, 20));
  expect(within(sheet).getByRole('link', { name: 'Apri l’utente' }).getAttribute('href')).toBe('/admin/users/00000000-0000-4000-8000-0000000000b0');
  expect(link.getAttribute('href')).toBe('/admin/users/00000000-0000-4000-8000-0000000000b0');
  fireEvent.change(field, { target: { value: 'c@x.it' } });
  expect(within(sheet).queryByRole('link', { name: 'Apri l’utente' })).toBeNull();
});

it('a forbidden search for account_exists hides the administration and denies access', async () => {
  const api = adminApi();
  renderApp('/admin', { api });
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo invito' }));
  const sheet = await screen.findByRole('dialog', { name: 'Nuovo invito' });
  // Another administrator appears and takes the role away; the creation still answers account_exists.
  await api.users.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
  await api.users.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
  vi.spyOn(api.appInvitations, 'create').mockRejectedValue(new ApiError('not_allowed', { reason: 'account_exists' }));
  fireEvent.change(within(sheet).getByLabelText('Email'), { target: { value: 'ospite@example.com' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Crea il link' }));
  expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Nuovo invito' })).toBeNull();
  expect(screen.queryByText('ospite@example.com')).toBeNull();
});

it('is closed to people without app_admin', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const list = vi.spyOn(api.appInvitations, 'list');
  renderApp('/admin', { api });
  expect(await screen.findByText('Non hai accesso a questa pagina')).toBeTruthy();
  // The page's own link back, besides the one of the bottom bar.
  expect(screen.getAllByRole('link', { name: 'Profilo' }).length).toBeGreaterThan(1);
  expect(list).not.toHaveBeenCalled();
});

it('disables the commands offline', async () => {
  renderApp('/admin', { api: adminApi() });
  const button = (await screen.findByRole('button', { name: 'Nuovo invito' })) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  setOnline(false);
  await waitFor(() => expect(button.disabled).toBe(true));
  setOnline(true);
});
});
