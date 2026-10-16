import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID, type FakeData } from '../../api/fake/fakeApi';
import { createNewFamilyData } from '../../api/fake/family';
import type { Api } from '../../api/types';
import { setOnline } from '../../test/connectivity';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

const FEDERICO = { id: 'user-federico', email: 'federico@example.com' };
const ANNA = { id: 'user-anna', email: 'anna@example.com' };
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  setOnline(true);
  Reflect.deleteProperty(navigator, 'share');
});

/** A fake backend on data the test can shape, for the person given. */
function setup(user: { id: string; email: string } = FEDERICO, change?: (data: FakeData) => void) {
  const data = createFakeData(user);
  change?.(data);
  const api = createFakeApi({ getLocale: () => 'it-IT', data, latencyMs: 0 });
  const backend = createStubBackend(user, 'supabase');
  return { data, api, backend };
}

const makeAdmin = (data: FakeData, userId: string) => {
  data.family.members.find((m) => m.id === userId)!.role = 'family_admin';
};

/** Two open links made by Anna. */
function annaLinks(data: FakeData) {
  for (const n of [1, 2]) {
    const now = Date.now();
    data.family.links.push({
      id: `00000000-0000-4000-8000-00000000a20${n}`, token: `anna${n}`.padEnd(43, 'y'), createdBy: 'user-anna',
      createdAt: new Date(now - n * 1000).toISOString(), expiresAt: new Date(now + 7 * DAY).toISOString(), revokedAt: null, registrations: []
    });
  }
}

const card = async (title: string) => within((await screen.findByRole('heading', { name: title, level: 2 })).closest('section')!);
const sheet = async () => within(await screen.findByRole('dialog'));
/** Commands that depend on the open links wait for the list. */
async function enabled(name: string) {
  const button = (await screen.findByRole('button', { name })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
}
const roleOf = (name: string) => screen.getByText(name, { selector: '.row-main' }).closest('li')!.querySelector('.label-chip')!.textContent;

describe('members', () => {
  it('gives an administrator actions on the other people, never on their own name', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Azioni per Anna' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Azioni per Tom' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Azioni per Federico/ })).toBeNull();
    expect(screen.queryByText(/chiedi un link/)).toBeNull();
  });

  it('tells a member which administrators to ask, without actions, links or joins', async () => {
    const { api, backend } = setup(ANNA);
    renderApp('/profile/family', { api, backend });
    expect(await screen.findByText('Anna (tu)')).toBeTruthy();
    expect(screen.getByText('Per invitare qualcuno chiedi un link a: Federico.')).toBeTruthy();
    expect(screen.getAllByText('Dal 1 settembre', { selector: 'small' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Azioni per/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Link d’invito' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ingressi con i link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Esci dalla famiglia' })).toBeTruthy();
  });

  it('makes a member administrator at once, without a confirmation', async () => {
    const { api, backend } = setup();
    const setMemberRole = vi.spyOn(api.family, 'setMemberRole');
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Azioni per Anna'));
    const actions = await sheet();
    expect(actions.getByRole('heading', { name: 'Anna' })).toBeTruthy();
    fireEvent.click(actions.getByRole('button', { name: 'Rendi amministratore' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(setMemberRole).toHaveBeenCalledWith(expect.objectContaining({ familyId: DEMO_FAMILY_ID, userId: 'user-anna', role: 'family_admin' }), expect.anything());
    await waitFor(() => expect(roleOf('Anna')).toBe('Amministratore'));
  });

  it('makes an administrator without links a member at once', async () => {
    const { api, backend } = setup(FEDERICO, (data) => makeAdmin(data, 'user-anna'));
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Azioni per Anna'));
    fireEvent.click((await sheet()).getByRole('button', { name: 'Rendi membro' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(roleOf('Anna')).toBe('Membro'));
  });

  it('asks before making an administrator with links a member, naming the links that stop', async () => {
    const { api, backend, data } = setup(FEDERICO, (d) => {
      makeAdmin(d, 'user-anna');
      annaLinks(d);
    });
    renderApp('/profile/family', { api, backend });
    const links = await card('Link d’invito');
    expect(await links.findAllByText('Link di Anna')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Azioni per Anna' }));
    const actions = await sheet();
    fireEvent.click(actions.getByRole('button', { name: 'Rendi membro' }));
    expect(await actions.findByText('I 2 link d’invito creati da Anna smetteranno di valere.')).toBeTruthy();
    expect(roleOf('Anna')).toBe('Amministratore');
    fireEvent.click(actions.getByRole('button', { name: 'Rendi membro' }));
    await waitFor(() => expect(roleOf('Anna')).toBe('Membro'));
    await waitFor(() => expect(links.queryByText('Link di Anna')).toBeNull());
    expect(data.family.links.filter((l) => l.createdBy === 'user-anna' && !l.revokedAt)).toHaveLength(0);
  });

  it('shows the last_admin text when the family would have no administrator', async () => {
    const { api, backend } = setup(FEDERICO, (data) => makeAdmin(data, 'user-anna'));
    api.family.setMemberRole = (async () => {
      throw new ApiError('last_admin');
    }) as unknown as Api['family']['setMemberRole'];
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Azioni per Anna'));
    const actions = await sheet();
    fireEvent.click(actions.getByRole('button', { name: 'Rendi membro' }));
    expect((await actions.findByRole('alert')).textContent).toBe('Serve almeno un altro amministratore: nominane uno prima.');
  });

  it('removes a person after the confirmation, with the line about their links', async () => {
    const { api, backend } = setup(FEDERICO, (d) => {
      makeAdmin(d, 'user-anna');
      annaLinks(d);
    });
    renderApp('/profile/family', { api, backend });
    expect(await (await card('Link d’invito')).findAllByText('Link di Anna')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Azioni per Anna' }));
    const actions = await sheet();
    fireEvent.click(actions.getByRole('button', { name: 'Rimuovi dalla famiglia' }));
    expect(actions.getByText('I voti di Anna non conteranno più nella media della famiglia e le sue modifiche resteranno come «ex membro». Per rientrare servirà un link d’invito nuovo.')).toBeTruthy();
    expect(actions.getByText('I 2 link d’invito creati da Anna smetteranno di valere.')).toBeTruthy();
    fireEvent.click(actions.getByRole('button', { name: 'Rimuovi Anna' }));
    await waitFor(() => expect(screen.queryByText('Anna', { selector: '.row-main' })).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes a person without links with the confirmation only', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Azioni per Tom'));
    const actions = await sheet();
    fireEvent.click(actions.getByRole('button', { name: 'Rimuovi dalla famiglia' }));
    expect(actions.queryByText(/smetteranno di valere/)).toBeNull();
    fireEvent.click(actions.getByRole('button', { name: 'Rimuovi Tom' }));
    await waitFor(() => expect(screen.queryByText('Tom', { selector: '.row-main' })).toBeNull());
  });

  it('lists the links with author, expiry, registrations and the expired ones still to complete', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    const links = await card('Link d’invito');
    expect(links.getByText('Chi apre il link entra come membro. Ogni link vale 7 giorni e si può usare più volte; con lo stesso link si possono registrare al massimo 10 persone nuove.')).toBeTruthy();
    expect(await links.findAllByText('Link di Federico')).toHaveLength(2);
    expect(links.getByText(/^Scade /)).toBeTruthy();
    expect(links.getByText('Scaduto: 1 registrazione da completare')).toBeTruthy();
    expect(links.getByText('1 persona registrata con questo link')).toBeTruthy();
    expect(links.getAllByRole('button', { name: 'Revoca' })).toHaveLength(2);
  });

  it('creates a link and opens the sheet with the link, Copy, Share and the note', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    const { api, backend } = setup();
    const create = vi.spyOn(api.familyInvitations, 'create');
    renderApp('/profile/family', { api, backend });
    const links = await card('Link d’invito');
    expect(await links.findAllByText('Link di Federico')).toHaveLength(2);
    fireEvent.click(links.getByRole('button', { name: 'Crea un link d’invito' }));
    const shared = await sheet();
    const code = await shared.findByLabelText('Link d’invito');
    expect(code.textContent).toMatch(/\/invite#[A-Za-z0-9_-]{43}$/);
    expect(shared.getByRole('button', { name: 'Copia' })).toBeTruthy();
    expect(shared.getByText('Il link si vede solo ora: se lo perdi, crea un nuovo link.')).toBeTruthy();
    fireEvent.click(shared.getByRole('button', { name: 'Condividi' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Entra in Famiglia Folloni', url: code.textContent }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ familyId: DEMO_FAMILY_ID, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    await waitFor(() => expect(links.getAllByText('Link di Federico')).toHaveLength(3));
  });

  it('revokes a link after a short confirmation', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    const links = await card('Link d’invito');
    expect(await links.findAllByText('Link di Federico')).toHaveLength(2);
    fireEvent.click(links.getAllByRole('button', { name: 'Revoca' })[0]!);
    const confirm = await sheet();
    expect(confirm.getByRole('heading', { name: 'Revocare il link?' })).toBeTruthy();
    expect(confirm.getByText('Chi lo ha ricevuto non potrà più usarlo.')).toBeTruthy();
    fireEvent.click(confirm.getByRole('button', { name: 'Revoca' }));
    await waitFor(() => expect(links.getAllByText('Link di Federico')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the joins with name or «ex membro», date, link author and «Account nuovo»', async () => {
    const { api, backend } = setup(FEDERICO, (data) => {
      data.family.members.push({ id: 'user-sara', displayName: 'Sara', role: 'member', joinedAt: new Date().toISOString() });
      data.family.joins.push({ joinedAt: new Date().toISOString(), mode: 'existing_account', userId: 'user-sara', invitationId: '00000000-0000-4000-8000-00000000f101' });
    });
    renderApp('/profile/family', { api, backend });
    const joins = await card('Ingressi con i link');
    const rows = await joins.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Sara')).toBeTruthy();
    expect(within(rows[0]!).queryByText('Account nuovo')).toBeNull();
    expect(within(rows[1]!).getByText('ex membro')).toBeTruthy();
    expect(within(rows[1]!).getByText('Account nuovo')).toBeTruthy();
    expect(within(rows[1]!).getByText(/^con il link di Federico del \d+ \w+$/)).toBeTruthy();
  });

  it('says when nobody has joined with a link yet', async () => {
    const { api, backend } = setup(FEDERICO, (data) => {
      data.family.joins.length = 0;
    });
    renderApp('/profile/family', { api, backend });
    expect(await (await card('Ingressi con i link')).findByText('Nessuno è ancora entrato con un link.')).toBeTruthy();
  });

  it('disables every command offline', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    const links = await card('Link d’invito');
    expect(await links.findAllByText('Link di Federico')).toHaveLength(2);
    act(() => setOnline(false));
    expect((screen.getByRole('button', { name: 'Azioni per Anna' }) as HTMLButtonElement).disabled).toBe(true);
    expect((links.getByRole('button', { name: 'Crea un link d’invito' }) as HTMLButtonElement).disabled).toBe(true);
    for (const revoke of links.getAllByRole('button', { name: 'Revoca' })) expect((revoke as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Esci dalla famiglia' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables the commands inside an open sheet when the connection drops', async () => {
    const { api, backend } = setup();
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Azioni per Anna'));
    const actions = await sheet();
    act(() => setOnline(false));
    expect((actions.getByRole('button', { name: 'Rendi amministratore' }) as HTMLButtonElement).disabled).toBe(true);
    expect((actions.getByRole('button', { name: 'Rimuovi dalla famiglia' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('leaving the family', () => {
  it('the only member is sent to the deletion of the family', async () => {
    const { api, backend } = setup(FEDERICO, (data) => {
      data.family.members = data.family.members.filter((m) => m.id === 'user-federico');
    });
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Esci dalla famiglia'));
    const leave = await sheet();
    expect(leave.getByRole('heading', { name: 'Esci da Famiglia Folloni' })).toBeTruthy();
    expect(leave.getByText('Sei l’unico membro: per uscire elimina la famiglia.')).toBeTruthy();
    expect(leave.getByRole('link', { name: 'Elimina la famiglia' }).getAttribute('href')).toBe(`/profile/family/delete?family=${DEMO_FAMILY_ID}`);
    expect(leave.queryByRole('button', { name: /^Esci$|Nomina ed esci/ })).toBeNull();
  });

  it('the last administrator must choose a successor, sees their links stop, then leaves to /menu', async () => {
    const { api, backend, data } = setup();
    const leaveCall = vi.spyOn(api.family, 'leave');
    const { history } = renderApp('/profile/family', { api, backend });
    expect(await (await card('Link d’invito')).findAllByText('Link di Federico')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Esci dalla famiglia' }));
    const leave = await sheet();
    expect(leave.getByText('Sei l’unico amministratore: scegli chi lo diventa al tuo posto.')).toBeTruthy();
    expect(leave.getByText('I tuoi 2 link d’invito smetteranno di valere.')).toBeTruthy();
    const confirm = leave.getByRole('button', { name: 'Nomina ed esci' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(leave.getByRole('radio', { name: 'Anna' }));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(leaveCall).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, successorId: 'user-anna' }, expect.anything());
    expect(data.family.members.find((m) => m.id === 'user-anna')?.role).toBe('family_admin');
  });

  it('a member leaves with the plain confirmation and lands on /profile when another family remains', async () => {
    const { api, backend } = setup(ANNA, (data) => {
      data.createdFamilies.push({ id: '00000000-0000-4000-8000-0000000000f2', data: createNewFamilyData({ name: 'Casa al mare', timeZone: 'Europe/Rome', measurementSystem: 'metric' }, ANNA.id) });
    });
    const leaveCall = vi.spyOn(api.family, 'leave');
    const { history } = renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Esci dalla famiglia'));
    const leave = await sheet();
    expect(leave.getByText('Non vedrai più il menu e la spesa di questa famiglia. Per rientrare servirà un link d’invito.')).toBeTruthy();
    expect(leave.queryByText(/link d’invito smetteranno/)).toBeNull();
    expect(leave.queryByRole('radio')).toBeNull();
    fireEvent.click(leave.getByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
    expect(leaveCall).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID }, expect.anything());
  });

  it('an administrator with another administrator leaves without a successor', async () => {
    const { api, backend } = setup(FEDERICO, (data) => makeAdmin(data, 'user-anna'));
    const { history } = renderApp('/profile/family', { api, backend });
    expect(await (await card('Link d’invito')).findAllByText('Link di Federico')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Esci dalla famiglia' }));
    const leave = await sheet();
    expect(leave.getByText('I tuoi 2 link d’invito smetteranno di valere.')).toBeTruthy();
    expect(leave.queryByRole('radio')).toBeNull();
    fireEvent.click(leave.getByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });

  it('moves to the successor choice when the server answers invalid on successorId', async () => {
    const { api, backend, data } = setup(FEDERICO, (d) => makeAdmin(d, 'user-anna'));
    const { history } = renderApp('/profile/family', { api, backend });
    expect(await (await card('Link d’invito')).findAllByText('Link di Federico')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Esci dalla famiglia' }));
    const leave = await sheet();
    // Meanwhile Anna stopped being an administrator: a successor is now needed.
    data.family.members.find((m) => m.id === 'user-anna')!.role = 'member';
    fireEvent.click(leave.getByRole('button', { name: 'Esci' }));
    expect(await leave.findByText('Ora sei l’unico amministratore: scegli chi lo diventa al tuo posto.')).toBeTruthy();
    const confirm = leave.getByRole('button', { name: 'Nomina ed esci' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(history.location.pathname).toBe('/profile/family');
    fireEvent.click(leave.getByRole('radio', { name: 'Tom' }));
    fireEvent.click(confirm);
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(data.family.members.find((m) => m.id === 'user-tom')?.role).toBe('family_admin');
  });

  it('cannot leave offline', async () => {
    const { api, backend } = setup(ANNA);
    renderApp('/profile/family', { api, backend });
    fireEvent.click(await enabled('Esci dalla famiglia'));
    const leave = await sheet();
    act(() => setOnline(false));
    expect((leave.getByRole('button', { name: 'Esci' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
