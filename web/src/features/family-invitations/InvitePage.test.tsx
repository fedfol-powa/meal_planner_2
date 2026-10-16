import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { fakeClients } from '../../api/fake/fakeApi';
import { DEMO_FAMILY } from '../../api/fake/seed';
import type { Api } from '../../api/types';
import type { AuthUser } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { setFamilyInvitationClient } from './client';

const TOKEN = 'f'.repeat(43);
const FAMILY_ID = DEMO_FAMILY.id;
const GIULIA: AuthUser = { id: 'user-giulia', email: 'giulia@x.it' };

const publicClient = (overrides = {}) => ({
  get: vi.fn(async () => ({ familyName: 'Rossi', invitedBy: 'Federico', accountsAvailable: true })),
  accept: vi.fn(async ({ email }: { email: string }) => ({ email, joined: true })),
  ...overrides
});

type Status = Api['familyInvitations']['status'];
type Join = Api['family']['join'];

/** The fake backend of a signed-in person, with the link's status and join replaced. */
function withLink(calls: { status?: Status; join?: Join }) {
  const clients = fakeClients({ latencyMs: 0 });
  return (user: AuthUser | null) => {
    const forLocale = clients(user);
    return (locale: Parameters<typeof forLocale>[0]) => {
      const api = forLocale(locale);
      return {
        ...api,
        familyInvitations: { ...api.familyInvitations, ...(calls.status ? { status: calls.status } : {}) },
        family: { ...api.family, ...(calls.join ? { join: calls.join } : {}) }
      };
    };
  };
}
const valid = (alreadyMember = false) => vi.fn<Status>(async () => ({ familyId: FAMILY_ID, familyName: 'Rossi', invitedBy: 'Federico', alreadyMember }));

function fill() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'giulia@x.it' } });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Giulia' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'segreta123' } });
  fireEvent.change(screen.getByLabelText('Ripeti la password'), { target: { value: 'segreta123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crea l’account ed entra' }));
}

describe('/invite (family)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  describe('states', () => {
    it('loading', async () => {
      setFamilyInvitationClient(publicClient({ get: vi.fn(() => new Promise(() => {})) }));
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
      expect(await screen.findByText('Caricamento…')).toBeTruthy();
    });

    it('unusable link: one message for every case', async () => {
      setFamilyInvitationClient(publicClient({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
      expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
      expect(screen.getByText('Chiedi un link nuovo a un amministratore della famiglia')).toBeTruthy();
    });

    it('malformed token: the same message, without asking the server', async () => {
      const client = publicClient();
      setFamilyInvitationClient(client);
      renderApp('/invite#short', { backend: createStubBackend(null) });
      expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
      expect(client.get).not.toHaveBeenCalled();
    });

    it('unusable link with an account open: the same message', async () => {
      const status = vi.fn<Status>(async () => { throw new ApiError('invitation_unavailable'); });
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: withLink({ status }) });
      expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
      expect(screen.getByText('Chiedi un link nuovo a un amministratore della famiglia')).toBeTruthy();
    });

    it('too many attempts, and «Riprova» reads the link again', async () => {
      const get = vi.fn().mockRejectedValueOnce(new ApiError('rate_limited')).mockResolvedValue({ familyName: 'Rossi', invitedBy: 'Federico', accountsAvailable: true });
      setFamilyInvitationClient(publicClient({ get }));
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
      expect(await screen.findByText('Troppi tentativi. Riprova tra un minuto.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
      expect(await screen.findByLabelText('Email')).toBeTruthy();
    });

    it('valid, signed out: family, who invites, the form and the sign-in link', async () => {
      setFamilyInvitationClient(publicClient());
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
      expect(await screen.findByRole('heading', { name: 'Entra in Rossi' })).toBeTruthy();
      expect(screen.getByText('Federico ti invita a condividere menu e spesa della famiglia')).toBeTruthy();
      for (const label of ['Email', 'Nome', 'Password', 'Ripeti la password']) expect(screen.getByLabelText(label)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Crea l’account ed entra' })).toBeTruthy();
      expect(screen.getByText(/Hai già un account\?/)).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Accedi per entrare' })).toBeTruthy();
      expect(screen.queryByRole('navigation')).toBeNull();
    });

    it('valid, signed out, without who invites', async () => {
      setFamilyInvitationClient(publicClient({ get: vi.fn(async () => ({ familyName: 'Rossi', invitedBy: null, accountsAvailable: true })) }));
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
      expect(await screen.findByText('Hai ricevuto un link d’invito')).toBeTruthy();
    });

    it('valid, signed in: «Entri come» and «Entra nella famiglia»', async () => {
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: withLink({ status: valid() }) });
      expect(await screen.findByRole('heading', { name: 'Entra in Rossi' })).toBeTruthy();
      expect(screen.getByText('Federico ti invita a condividere menu e spesa della famiglia')).toBeTruthy();
      expect(await screen.findByText(/^Entri come /)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Entra nella famiglia' })).toBeTruthy();
      expect(screen.queryByLabelText('Email')).toBeNull();
    });

    it('valid, signed in: «Entra nella famiglia» joins, shows the family and opens the menu', async () => {
      let profile: (() => Promise<Awaited<ReturnType<Join>>>) | null = null;
      const join = vi.fn<Join>(async () => profile!());
      const createApi = withLink({ status: valid(), join });
      const capture = (user: AuthUser | null) => (locale: Parameters<ReturnType<typeof createApi>>[0]) => {
        const api = createApi(user)(locale);
        profile = () => api.profile.get({});
        return api;
      };
      const { history } = renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: capture });
      fireEvent.click(await screen.findByRole('button', { name: 'Entra nella famiglia' }));
      await waitFor(() => expect(join).toHaveBeenCalledWith({ token: TOKEN }, expect.anything()));
      await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    });

    it('valid, signed in: «Entra nella famiglia» is off offline', async () => {
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: withLink({ status: valid() }) });
      const button = await screen.findByRole('button', { name: 'Entra nella famiglia' });
      setOnline(false);
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    });

    it('a link that stopped working when joining: the message of unusable links', async () => {
      const join = vi.fn<Join>(async () => { throw new ApiError('invitation_unavailable'); });
      renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: withLink({ status: valid(), join }) });
      fireEvent.click(await screen.findByRole('button', { name: 'Entra nella famiglia' }));
      expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
    });

    it('already a member: «Fai già parte di» and «Apri il menu»', async () => {
      const { history } = renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(GIULIA), createApi: withLink({ status: valid(true) }) });
      expect(await screen.findByRole('heading', { name: 'Fai già parte di Rossi' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));
      await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    });
  });

  it('the account form creates the account, signs in and opens the menu', async () => {
    const client = publicClient();
    setFamilyInvitationClient(client);
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalledWith({ token: TOKEN, email: 'giulia@x.it', displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('giulia@x.it', 'segreta123'));
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });

  it('the sign-in link keeps the token through redirect and comes back to the invitation', async () => {
    setFamilyInvitationClient(publicClient());
    const status = valid();
    const backend = createStubBackend(null);
    const { history } = renderApp(`/invite#${TOKEN}`, { backend, createApi: withLink({ status }) });
    fireEvent.click(await screen.findByRole('link', { name: 'Accedi per entrare' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(new URLSearchParams(history.location.search).get('redirect')).toBe(`/invite#${TOKEN}`);
    backend.setUser(GIULIA); // the sign-in of the login page
    await waitFor(() => expect(history.location.pathname).toBe('/invite'));
    expect(history.location.hash).toBe(`#${TOKEN}`);
    expect(await screen.findByRole('button', { name: 'Entra nella famiglia' })).toBeTruthy();
    expect(status).toHaveBeenCalledWith({ token: TOKEN }, expect.anything());
  });

  it('without accountsAvailable there is no form but the sign-in link stays', async () => {
    setFamilyInvitationClient(publicClient({ get: vi.fn(async () => ({ familyName: 'Rossi', invitedBy: 'Federico', accountsAvailable: false })) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByText('Questo invito non vale più per creare un account: chiedi un link nuovo')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Crea l’account ed entra' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Accedi per entrare' })).toBeTruthy();
  });

  it('another account open offers sign out and continue', async () => {
    setFamilyInvitationClient(publicClient());
    const backend = createStubBackend(GIULIA);
    const { history } = renderApp(`/invite#${TOKEN}`, { backend, createApi: withLink({ status: valid() }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(backend.signOutCalls).toBe(1);
    expect(history.location.pathname).toBe('/invite');
    expect(history.location.hash).toBe(`#${TOKEN}`);
  });

  it('joined false shows the ready account text and opens login with the email', async () => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async ({ email }: { email: string }) => ({ email, joined: false })) }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Questo invito non vale più, ma il tuo account è pronto: entra con email e password')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('when sign-in fails after the creation, leads to the login page with the email (texts of A)', async () => {
    setFamilyInvitationClient(publicClient());
    const backend = createStubBackend(null);
    vi.spyOn(backend, 'signIn').mockResolvedValue({ ok: false, reason: 'invalid_credentials' });
    const { history } = renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Il tuo account è pronto: entra con la password che hai scelto la prima volta.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('an existing account: the error of A with the link to sign in', async () => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async () => { throw new ApiError('not_allowed', { reason: 'account_exists' }); }) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(/Esiste già un account con questa email/)).toBeTruthy();
  });

  it('the account form is off offline', async () => {
    setFamilyInvitationClient(publicClient());
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    const button = await screen.findByRole('button', { name: 'Crea l’account ed entra' });
    setOnline(false);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it('a late answer after leaving the page neither signs in nor navigates', async () => {
    let answer!: () => void;
    const accept = vi.fn(({ email }: { email: string }) => new Promise<{ email: string; joined: boolean }>((r) => (answer = () => r({ email, joined: true }))));
    setFamilyInvitationClient(publicClient({ accept }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(accept).toHaveBeenCalled());
    history.push('/login');
    answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(signIn).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe('/login');
  });

  it('/invite/app stays the app invitation', async () => {
    setFamilyInvitationClient(publicClient());
    renderApp(`/invite/app#${'a'.repeat(43)}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: /Questo invito non vale più|Hai un invito per Cosa si mangia\?/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entra in Rossi' })).toBeNull();
  });
});
