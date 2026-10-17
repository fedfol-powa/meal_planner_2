import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setBrowserLanguages } from '../../test/browserLanguages';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';

const INTRO = 'Scrivi l’email del tuo account: ti mandiamo un link per scegliere una password nuova.';
const SENT = 'Se l’email ha un account, ti abbiamo mandato un link per scegliere una password nuova. Controlla anche la posta indesiderata.';

function send(email = 'giulia@x.it') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Manda il link' }));
}

describe('/password/forgot', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the form in the shape of the entry pages', async () => {
    renderApp('/password/forgot', { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Password dimenticata' })).toBeTruthy();
    expect(screen.getByText(INTRO)).toBeTruthy();
    expect(screen.getByText('Cosa si mangia?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Torna all’accesso' }).getAttribute('href')).toBe('/login');
  });

  it('writes the email of the parameter in advance', async () => {
    renderApp('/password/forgot?email=giulia%40x.it', { backend: createStubBackend(null) });
    expect(((await screen.findByLabelText('Email')) as HTMLInputElement).value).toBe('giulia@x.it');
  });

  it('sends the link and says the same thing whether the account exists or not', async () => {
    const backend = createStubBackend(null);
    renderApp('/password/forgot', { backend });
    await screen.findByLabelText('Email');
    send(' giulia@x.it ');
    expect(await screen.findByText(SENT)).toBeTruthy();
    expect(screen.getByText('Il link vale 24 ore.')).toBeTruthy();
    expect(backend.passwordEmailCalls).toEqual(['giulia@x.it']);
    expect(screen.getByRole('link', { name: 'Torna all’accesso' }).getAttribute('href')).toBe('/login?email=giulia%40x.it');
  });

  it('the per-address limit counts as sent (the backend answers ok)', async () => {
    // supabaseBackend maps the 429 «only request this after N seconds» to { ok: true }.
    const backend = createStubBackend(null);
    backend.nextPasswordEmail = { ok: true };
    renderApp('/password/forgot', { backend });
    await screen.findByLabelText('Email');
    send();
    expect(await screen.findByText(SENT)).toBeTruthy();
  });

  it('«Manda di nuovo» appears after 60 seconds and sends again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backend = createStubBackend(null);
    renderApp('/password/forgot', { backend });
    await screen.findByLabelText('Email');
    send();
    await screen.findByText(SENT);
    expect(screen.queryByRole('button', { name: 'Manda di nuovo' })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Manda di nuovo' }));
    await waitFor(() => expect(backend.passwordEmailCalls).toEqual(['giulia@x.it', 'giulia@x.it']));
    expect(screen.queryByRole('button', { name: 'Manda di nuovo' })).toBeNull();
  });

  it('the limit of the project', async () => {
    const backend = createStubBackend(null);
    backend.nextPasswordEmail = { ok: false, reason: 'project_limit' };
    renderApp('/password/forgot', { backend });
    await screen.findByLabelText('Email');
    send();
    expect((await screen.findByRole('alert')).textContent).toBe('Abbiamo inviato troppe email in poco tempo. Riprova tra qualche minuto.');
    expect(screen.queryByText(SENT)).toBeNull();
  });

  it('network and other errors', async () => {
    const backend = createStubBackend(null);
    backend.nextPasswordEmail = { ok: false, reason: 'network' };
    renderApp('/password/forgot', { backend });
    await screen.findByLabelText('Email');
    send();
    expect((await screen.findByRole('alert')).textContent).toBe('Controlla la connessione e riprova');
    backend.nextPasswordEmail = { ok: false, reason: 'unknown' };
    send();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Qualcosa non ha funzionato: riprova.'));
  });

  it('offline: the banner, and the command is disabled', async () => {
    renderApp('/password/forgot', { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    setOnline(false);
    expect(await screen.findByText('Sei offline: puoi consultare i dati già caricati.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Manda il link' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('speaks British English', async () => {
    setBrowserLanguages(['en-GB']);
    renderApp('/password/forgot', { backend: createStubBackend(null), locale: 'en-GB' });
    expect(await screen.findByRole('heading', { name: 'Forgotten password' })).toBeTruthy();
  });
});
