import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_USER, type ChangePasswordFailure } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { LanguageSwitch } from '../../test/LanguageSwitch';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const field = (label: string) => screen.findByLabelText(label, { exact: true }) as Promise<HTMLInputElement>;
async function fill(current: string, next: string, confirm = next) {
  fireEvent.change(await field('Password attuale'), { target: { value: current } });
  fireEvent.change(await field('Nuova password'), { target: { value: next } });
  fireEvent.change(await field('Conferma la nuova password'), { target: { value: confirm } });
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
// Not one of the demo people: the fake profile keeps the language the app started with.
const GUEST = { id: 'user-guest', email: 'guest@example.com' };
const describedBy = (input: HTMLElement) =>
  (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent);

describe('password page', () => {
  it('names the fields the same before and after errors, with hint and errors described', async () => {
    renderApp('/profile/password', { backend: createStubBackend(DEMO_USER) });
    const next = await field('Nuova password');
    expect(next.id).toBe('password-next');
    expect(next.autocomplete).toBe('new-password');
    expect((await field('Password attuale')).autocomplete).toBe('current-password');
    expect((await field('Conferma la nuova password')).autocomplete).toBe('new-password');
    expect(describedBy(next)).toEqual(['Almeno 8 caratteri.']);
    expect(screen.getByText(/gli altri dispositivi e gli agenti collegati dovranno accedere di nuovo/)).toBeTruthy();
    await fill('old-password', 'short', 'other');
    submit();
    await screen.findByText('Servono almeno 8 caratteri.');
    // Same accessible names after the errors: the texts sit outside the labels.
    expect(await field('Nuova password')).toBe(next);
    expect(next.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(next)).toEqual(['Almeno 8 caratteri.', 'Servono almeno 8 caratteri.']);
    expect(describedBy(await field('Conferma la nuova password'))).toEqual(['Le due password non coincidono.']);
  });
  it('shows field errors without sending anything', async () => {
    const backend = createStubBackend(DEMO_USER);
    renderApp('/profile/password', { backend });
    await fill('', 'new-password', 'new-password');
    submit();
    expect(await screen.findByText('Campo obbligatorio.')).toBeTruthy();
    expect(backend.changePasswordCalls).toEqual([]);
  });
  it('sends once, blocks the form while sending, then empties it and confirms', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdChangePassword();
    renderApp('/profile/password', { backend });
    await fill('old-password', 'new-password');
    submit();
    // Second tap and Enter while sending: still one call.
    const form = (await field('Nuova password')).form!;
    fireEvent.submit(form);
    fireEvent.click(form.querySelector('button[type="submit"]')!);
    expect(await screen.findByRole('button', { name: 'Cambio in corso…' })).toHaveProperty('disabled', true);
    expect((await field('Password attuale')).disabled).toBe(true);
    expect(backend.changePasswordCalls).toEqual([{ current: 'old-password', next: 'new-password' }]);
    await act(async () => answer({ ok: true }));
    expect(await screen.findByText(/^Password cambiata\./)).toBeTruthy();
    expect((await field('Password attuale')).value).toBe('');
    expect((await field('Nuova password')).value).toBe('');
    expect((await field('Conferma la nuova password')).value).toBe('');
  });
  const cases: [ChangePasswordFailure, string][] = [
    ['current_invalid', 'La password attuale non è corretta.'],
    ['weak_length', 'La nuova password è troppo corta.'],
    ['weak_characters', 'La nuova password deve contenere altri tipi di caratteri (lettere, numeri o simboli).'],
    ['weak', 'La nuova password non è abbastanza sicura: scegline un’altra.'],
    ['same_password', 'La nuova password è uguale a quella attuale.'],
    ['session_expired', 'La sessione è scaduta: accedi di nuovo e riprova.'],
    ['reauthentication_needed', 'Il servizio chiede una conferma via email, che l’app non gestisce: avvisa l’amministratore.'],
    ['rate_limited', 'Troppi tentativi: riprova tra qualche minuto.'],
    ['network', 'Non riesco a raggiungere il servizio: controlla la connessione.'],
    ['unknown', 'Cambio non riuscito: riprova tra poco.']
  ];
  it.each(cases)('explains %s and keeps what was typed', async (reason, text) => {
    const backend = createStubBackend(DEMO_USER);
    backend.nextChangePassword = { ok: false, reason };
    renderApp('/profile/password', { backend });
    await fill('old-password', 'new-password');
    submit();
    expect(await screen.findByText(text)).toBeTruthy();
    expect((await field('Password attuale')).value).toBe('old-password');
    expect((await field('Nuova password')).value).toBe('new-password');
  });
  it('puts a wrong current password on its field', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.nextChangePassword = { ok: false, reason: 'current_invalid' };
    renderApp('/profile/password', { backend });
    await fill('wrong', 'new-password');
    submit();
    await screen.findByText('La password attuale non è corretta.');
    const current = await field('Password attuale');
    expect(current.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(current)).toEqual(['La password attuale non è corretta.']);
  });
  it('leads to the sign-in page after an expired session', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.nextChangePassword = { ok: false, reason: 'session_expired' };
    renderApp('/profile/password', { backend });
    await fill('old-password', 'new-password');
    submit();
    fireEvent.click(await screen.findByRole('button', { name: 'Accedi di nuovo' }));
    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
    expect(backend.signOutCalls).toBe(1);
  });
  it('empties the fields when the account changed', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.nextChangePassword = { ok: false, reason: 'account_changed' };
    renderApp('/profile/password', { backend });
    await fill('old-password', 'new-password');
    submit();
    expect(await screen.findByText('Il cambio si è interrotto perché l’account su questo dispositivo è cambiato.')).toBeTruthy();
    expect((await field('Password attuale')).value).toBe('');
    expect((await field('Nuova password')).value).toBe('');
  });
  it('drops an answer that arrives for a person no longer on this device', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdChangePassword();
    renderApp('/profile/password', { backend });
    await fill('old-password', 'new-password');
    submit();
    await screen.findByRole('button', { name: 'Cambio in corso…' });
    act(() => backend.setUser({ id: 'user-other', email: 'other@example.com' }));
    await act(async () => answer({ ok: true }));
    expect(screen.queryByText(/^Password cambiata\./)).toBeNull();
  });
  it('waits for the connection', async () => {
    renderApp('/profile/password', { backend: createStubBackend(DEMO_USER) });
    await field('Password attuale');
    act(() => setOnline(false));
    expect(await screen.findByText('Serve la connessione per cambiare la password.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambia password' })).toHaveProperty('disabled', true);
  });
  it('speaks British English', async () => {
    const backend = createStubBackend(GUEST);
    backend.nextChangePassword = { ok: false, reason: 'current_invalid' };
    renderApp('/profile/password', { backend, locale: 'en-GB' });
    fireEvent.change(await field('Current password'), { target: { value: 'wrong' } });
    fireEvent.change(await field('New password'), { target: { value: 'new-password' } });
    fireEvent.change(await field('Confirm the new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The current password is wrong.')).toBeTruthy();
  });
  it('translates the outcome again when the language changes', async () => {
    const backend = createStubBackend(GUEST);
    backend.nextChangePassword = { ok: false, reason: 'current_invalid' };
    renderApp('/profile/password', { backend, locale: 'en-GB', extra: <LanguageSwitch /> });
    fireEvent.change(await field('Current password'), { target: { value: 'wrong' } });
    fireEvent.change(await field('New password'), { target: { value: 'new-password' } });
    fireEvent.change(await field('Confirm the new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await screen.findByText('The current password is wrong.');
    fireEvent.click(screen.getByRole('button', { name: 'test: italiano' }));
    expect(await screen.findByText('La password attuale non è corretta.')).toBeTruthy();
  });
});
