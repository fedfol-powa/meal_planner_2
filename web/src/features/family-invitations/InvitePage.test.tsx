import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
type Outcome = 'sent' | 'failed' | 'too_soon' | 'not_needed' | 'not_sent' | 'unavailable';
const FAMILY_ID = DEMO_FAMILY.id;
const GIULIA: AuthUser = { id: 'user-giulia', email: 'giulia@x.it' };

const publicClient = (overrides = {}) => ({
  get: vi.fn(async () => ({ familyName: 'Rossi', invitedBy: 'Federico', accountsAvailable: true })),
  // The answer carries the normalised email, not the field's.
  accept: vi.fn(async (_input: { email: string }) => ({ email: 'giulia@x.it', joined: true, passwordEmail: 'sent' as Outcome })),
  resendPasswordEmail: vi.fn(async (_input: { token: string; email: string; locale: string }) => ({ passwordEmail: 'sent' as 'sent' | 'failed' | 'too_soon' | 'not_needed' | 'unavailable' })),
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

function fill(email = ' Giulia@X.it ') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Giulia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entra nella famiglia' }));
}

const resendButton = () => screen.getByRole('button', { name: 'Rimanda l’email' }) as HTMLButtonElement;
const minute = async () => act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

describe('/invite (family)', () => {
  afterEach(() => {
    vi.useRealTimers();
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
      for (const label of ['Email', 'Nome']) expect(screen.getByLabelText(label)).toBeTruthy();
      expect(screen.queryByLabelText('Password')).toBeNull();
      expect(screen.queryByLabelText('Ripeti la password')).toBeNull();
      expect(screen.getByText('Ti mandiamo un’email per scegliere la password.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Entra nella famiglia' })).toBeTruthy();
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

  it('the account form accepts without a password, never signs in, and asks to check the mail', async () => {
    const client = publicClient();
    setFamilyInvitationClient(client);
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalledWith({ token: TOKEN, email: 'Giulia@X.it', displayName: 'Giulia', locale: 'it-IT' }));
    expect(await screen.findByRole('heading', { name: 'Controlla la posta' })).toBeTruthy();
    expect(screen.getByText('Ti abbiamo mandato un’email a giulia@x.it: apri il link per scegliere la password. Poi entrerai con email e password.')).toBeTruthy();
    expect(screen.getByText('Il link vale 24 ore. Controlla anche la posta indesiderata.')).toBeTruthy();
    expect(screen.queryByText(/Quando entri sarai anche/)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe('/invite');
  });

  it('«Rimanda l’email» is enabled after 60 seconds and resends with the email of the answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = publicClient();
    setFamilyInvitationClient(client);
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    expect(resendButton().disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(resendButton().disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(resendButton().disabled).toBe(false);
    fireEvent.click(resendButton());
    await waitFor(() => expect(client.resendPasswordEmail).toHaveBeenCalledWith({ token: TOKEN, email: 'giulia@x.it', locale: 'it-IT' }));
    await waitFor(() => expect(resendButton().disabled).toBe(true));
  });

  it('a resend answered too_soon keeps the wait; failed lets the person repeat at once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resend = vi.fn().mockResolvedValueOnce({ passwordEmail: 'too_soon' }).mockResolvedValueOnce({ passwordEmail: 'failed' });
    setFamilyInvitationClient(publicClient({ resendPasswordEmail: resend }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Ti abbiamo appena mandato un’email: aspetta un minuto prima di chiederne un’altra.')).toBeTruthy();
    expect(resendButton().disabled).toBe(true);
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Non siamo riusciti a mandare l’email.')).toBeTruthy();
    await waitFor(() => expect(resendButton().disabled).toBe(false));
  });

  it('a resend not needed or unavailable sends to the sign-in page with the email', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resend = vi.fn().mockResolvedValueOnce({ passwordEmail: 'not_needed' });
    setFamilyInvitationClient(publicClient({ resendPasswordEmail: resend }));
    const { history } = renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Il tuo account è pronto: entra con email e password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimanda l’email' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('a resend unavailable points to «Password dimenticata?»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setFamilyInvitationClient(publicClient({ resendPasswordEmail: vi.fn(async () => ({ passwordEmail: 'unavailable' })) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Non possiamo rimandare l’email da qui: usa “Password dimenticata?” dalla pagina di accesso')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
  });

  it('«Email sbagliata? Ricomincia» goes back to the empty form on the same link', async () => {
    const client = publicClient();
    setFamilyInvitationClient(client);
    const { history } = renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    fireEvent.click(screen.getByRole('button', { name: 'Email sbagliata? Ricomincia' }));
    expect((await screen.findByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('');
    expect(history.location.hash).toBe(`#${TOKEN}`);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['failed', 'Non siamo riusciti a mandare l’email.', true],
    ['too_soon', 'Ti abbiamo appena mandato un’email: aspetta un minuto prima di chiederne un’altra.', true],
    ['not_needed', 'Il tuo account è pronto: entra con email e password', false],
    ['not_sent', 'Hai già usato questo link con questa email. Se non hai ancora scelto la password, rimanda l’email; altrimenti entra.', true]
  ] as const)('accept answered %s shows its text', async (passwordEmail, text, resend) => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async () => ({ email: 'giulia@x.it', joined: true, passwordEmail })) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(!!screen.queryByRole('button', { name: 'Rimanda l’email' })).toBe(resend);
    expect(!!screen.queryByRole('link', { name: 'Vai all’accesso' })).toBe(passwordEmail === 'not_needed' || passwordEmail === 'not_sent');
  });

  it('accept answered unavailable: only the message, no commands', async () => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async () => ({ email: 'giulia@x.it', joined: true, passwordEmail: 'unavailable' })) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Non possiamo mandare l’email per questo account. Chiedi un link nuovo a chi ti ha invitato.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimanda l’email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Email sbagliata? Ricomincia' })).toBeNull();
  });

  it('the sign-in link keeps the token in the fragment, never in the query, and comes back to the invitation', async () => {
    setFamilyInvitationClient(publicClient());
    const status = valid();
    const backend = createStubBackend(null);
    const { history } = renderApp(`/invite#${TOKEN}`, { backend, createApi: withLink({ status }) });
    fireEvent.click(await screen.findByRole('link', { name: 'Accedi per entrare' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    // A reload of the sign-in page sends the query to the server, not the fragment (review of the branch).
    expect(new URLSearchParams(history.location.search).get('redirect')).toBe('/invite');
    expect(history.location.search).not.toContain(TOKEN);
    expect(history.location.hash).toBe(`#${TOKEN}`);
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
    expect(screen.queryByRole('button', { name: 'Entra nella famiglia' })).toBeNull();
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

  it('joined false: the link no longer valid but the account ready, with the state of the email below', async () => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async () => ({ email: 'giulia@x.it', joined: false, passwordEmail: 'sent' })) }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    renderApp(`/invite#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Questo invito non vale più, ma il tuo account è pronto')).toBeTruthy();
    expect(screen.getByText(/Ti abbiamo mandato un’email a giulia@x.it/)).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('an existing account: the error of A with the link to sign in', async () => {
    setFamilyInvitationClient(publicClient({ accept: vi.fn(async () => { throw new ApiError('not_allowed', { reason: 'account_exists' }); }) }));
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(/Esiste già un account con questa email/)).toBeTruthy();
    const href = screen.getByRole('link', { name: 'Vai all’accesso' }).getAttribute('href')!;
    expect(href.split('#')[0]).not.toContain(TOKEN);
    expect(href.endsWith(`#${TOKEN}`)).toBe(true);
  });

  it('the account form is off offline', async () => {
    setFamilyInvitationClient(publicClient());
    renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    const button = await screen.findByRole('button', { name: 'Entra nella famiglia' });
    setOnline(false);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it('a late answer after leaving the page changes nothing', async () => {
    let answer!: () => void;
    const accept = vi.fn((_input: { email: string }) => new Promise<{ email: string; joined: boolean; passwordEmail: Outcome }>((r) => (answer = () => r({ email: 'giulia@x.it', joined: true, passwordEmail: 'sent' }))));
    setFamilyInvitationClient(publicClient({ accept }));
    const { history } = renderApp(`/invite#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(accept).toHaveBeenCalled());
    history.push('/login');
    answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(history.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Controlla la posta' })).toBeNull();
  });

  it('/invite/app stays the app invitation', async () => {
    setFamilyInvitationClient(publicClient());
    renderApp(`/invite/app#${'a'.repeat(43)}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: /Questo invito non vale più|Hai un invito per Cosa si mangia\?/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entra in Rossi' })).toBeNull();
  });
});
