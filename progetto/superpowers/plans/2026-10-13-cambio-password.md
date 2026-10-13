# Cambio della password dal Profilo: piano di implementazione

> **Per gli agenti che eseguono:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, un task alla volta. I passi usano le
> caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** chi è entrato cambia la propria password da `/profile/password`, con verifica
della password attuale, senza email e senza toccare Worker e database.

**Architettura:** la SPA legge una volta la sessione del dispositivo (utente, email, access
token), verifica la password attuale con una richiesta diretta di accesso
(`POST /auth/v1/token`), revoca subito quella sessione di prova con il suo token, controlla che
sul dispositivo ci sia ancora lo stesso utente e cambia la password con `PUT /auth/v1/user` e il
token catturato. Nessun client supabase-js per prova e cambio: niente archivio, eventi o
ascoltatori da gestire, e il token del cambio non può diventare quello di un altro account. Il
metodo vive in `AuthBackend`; la pagina usa una validazione pura e mostra esiti tradotti.

**Stack:** React 19 + TanStack Router, supabase-js 2.117.3 (solo per la sessione del
dispositivo), `fetch`, Vitest con jsdom, Supabase locale (CLI 2.120.0, gotrue v2.197.0).

**Spec:** `progetto/superpowers/specs/2026-10-13-cambio-password.md` (leggila prima di
iniziare; la specifica principale resta il riferimento, sezioni 1, 7, 13). Correzioni della
review in `progetto/coordinamento/messaggi/w7-01-review-spec.md`.

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano.
- Testi per l'utente in `it-IT` ed `en-GB`, nel file nuovo `web/src/i18n/messages/password.ts`.
- Nessuna dipendenza nuova. Nessuna migrazione, operazione oRPC o strumento MCP.
- Minimo nella SPA: `PASSWORD_MIN_LENGTH = 8` (code point); massimo `PASSWORD_MAX_BYTES = 72`
  (byte UTF-8). Le password non si tagliano.
- `supabase/config.toml`: solo `minimum_password_length = 8`; `secure_password_change` resta
  `false`, `password_requirements` resta `""`.
- Impostazioni di Supabase in produzione: non si toccano.
- Richieste a Supabase Auth: intestazioni `apikey: <chiave pubblica>`,
  `content-type: application/json`, `x-supabase-api-version: 2024-01-01`; `Authorization`
  solo col token indicato da ciascun passo (mai letto di nuovo dal client condiviso).
- Comandi dalla radice del worktree `/Users/fedfol/Projects/meal_planner_2/.worktrees/password`.
  I test web si lanciano con `npm test -w web -- <file>`.
- Commit piccoli in italiano, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Casi che la spec implica e che i test dei task coprono esplicitamente:

1. **Cambio d'account o uscita in un'altra scheda durante l'operazione**: nessuna richiesta col
   token di B, esito `account_changed`, la pagina scarta l'esito o svuota i campi → test nei
   Task 2 e 3.
2. **Rete assente al momento sbagliato**: rinnovo impossibile → `network` (non «sessione
   scaduta»); revoca della prova fallita due volte → esito del cambio invariato → test nel
   Task 2.
3. **Doppio invio** (Invio premuto due volte, doppio tocco sull'iPhone): una sola chiamata a
   `changePassword` → test nel Task 3.
4. **Password incollata con spazi o lettere accentate**: gli spazi restano, «è» conta come un
   carattere, oltre 72 byte errore sul campo → test nel Task 1.
5. **Sessione revocata sul server mentre la pagina è aperta**: messaggio, «Accedi di nuovo»,
   pagina di accesso con i dati locali cancellati → test nei Task 3 e 4 (stub e stack reale).

---

### Task 1: Validazione del modulo

**File:**
- Crea: `web/src/auth/passwordChange.ts`
- Test: `web/src/auth/passwordChange.test.ts`

**Interfacce:**
- Produce:
  ```ts
  export const PASSWORD_MIN_LENGTH = 8;
  export const PASSWORD_MAX_BYTES = 72;
  export type PasswordField = 'current' | 'next' | 'confirm';
  export type PasswordFieldError = 'required' | 'too_short' | 'too_long' | 'mismatch' | 'same_as_current';
  export type PasswordFieldErrors = Partial<Record<PasswordField, PasswordFieldError>>;
  export function validatePasswordChange(input: Record<PasswordField, string>): PasswordFieldErrors;
  ```

- [ ] **Passo 1: test che falliscono**

```ts
import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, validatePasswordChange } from './passwordChange';

const valid = { current: 'old-password', next: 'new-password', confirm: 'new-password' };

describe('validatePasswordChange', () => {
  it('accepts a complete, different, confirmed password', () => {
    expect(validatePasswordChange(valid)).toEqual({});
  });
  it('asks for every field', () => {
    expect(validatePasswordChange({ current: '', next: '', confirm: '' })).toEqual({ current: 'required', next: 'required', confirm: 'required' });
  });
  it('needs at least 8 characters, counting code points', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePasswordChange({ ...valid, next: 'abcdefg', confirm: 'abcdefg' }).next).toBe('too_short');
    expect(validatePasswordChange({ ...valid, next: 'abcdefgh', confirm: 'abcdefgh' })).toEqual({});
    // Seven letters, one of them accented (two bytes in UTF-8): still seven characters.
    expect(validatePasswordChange({ ...valid, next: 'perché1', confirm: 'perché1' }).next).toBe('too_short');
  });
  it('refuses more than 72 bytes, bcrypt’s limit', () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    const at = 'a'.repeat(72);
    const over = 'a'.repeat(71) + 'è';
    expect(validatePasswordChange({ ...valid, next: at, confirm: at })).toEqual({});
    expect(validatePasswordChange({ ...valid, next: over, confirm: over }).next).toBe('too_long');
  });
  it('keeps spaces: they are part of the password', () => {
    const spaced = '  new-password  ';
    expect(validatePasswordChange({ ...valid, next: spaced, confirm: spaced })).toEqual({});
    expect(validatePasswordChange({ ...valid, next: spaced, confirm: 'new-password' }).confirm).toBe('mismatch');
    expect(validatePasswordChange({ current: 'secret-one ', next: 'secret-one', confirm: 'secret-one' })).toEqual({});
  });
  it('wants the confirmation equal to the new password', () => {
    expect(validatePasswordChange({ ...valid, confirm: 'new-passwork' })).toEqual({ confirm: 'mismatch' });
  });
  it('wants a new password different from the current one', () => {
    expect(validatePasswordChange({ current: 'same-password', next: 'same-password', confirm: 'same-password' })).toEqual({ next: 'same_as_current' });
  });
  it('reports several fields at once', () => {
    expect(validatePasswordChange({ current: '', next: 'short', confirm: 'other' })).toEqual({ current: 'required', next: 'too_short', confirm: 'mismatch' });
  });
});
```

- [ ] **Passo 2: verificare che falliscano**

Esegui: `npm test -w web -- src/auth/passwordChange.test.ts`
Atteso: FAIL, modulo `./passwordChange` assente.

- [ ] **Passo 3: implementazione minima**

```ts
/** Checks of the password form before anything is sent (spec «Validazione del modulo»). */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads at most 72 bytes: Supabase refuses longer passwords (`validation_failed`). */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordField = 'current' | 'next' | 'confirm';
export type PasswordFieldError = 'required' | 'too_short' | 'too_long' | 'mismatch' | 'same_as_current';
export type PasswordFieldErrors = Partial<Record<PasswordField, PasswordFieldError>>;

/** Passwords are taken as typed: no trimming, spaces count. */
export function validatePasswordChange({ current, next, confirm }: Record<PasswordField, string>): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  if (!current) errors.current = 'required';
  if (!next) errors.next = 'required';
  else if ([...next].length < PASSWORD_MIN_LENGTH) errors.next = 'too_short';
  else if (new TextEncoder().encode(next).length > PASSWORD_MAX_BYTES) errors.next = 'too_long';
  else if (next === current) errors.next = 'same_as_current';
  if (!confirm) errors.confirm = 'required';
  else if (next && confirm !== next) errors.confirm = 'mismatch';
  return errors;
}
```

- [ ] **Passo 4: verificare che passino**

Esegui: `npm test -w web -- src/auth/passwordChange.test.ts`
Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src/auth/passwordChange.ts web/src/auth/passwordChange.test.ts
git commit -m "Cambio password: validazione del modulo"
```

---


### Task 2: Richieste a Supabase Auth e `changePassword`

**File:**
- Modifica: `web/src/auth/backend.ts` (tipi, metodo nell'interfaccia, modalità finta)
- Crea: `web/src/auth/passwordChangeRequests.ts`
- Modifica: `web/src/auth/supabaseBackend.ts`
- Modifica: `web/src/test/stubBackend.ts`
- Test: `web/src/auth/passwordChangeRequests.test.ts`, `web/src/auth/supabaseBackend.test.ts`

**Interfacce:**
- Produce, in `backend.ts`:
  ```ts
  export type ChangePasswordFailure =
    | 'current_invalid' | 'weak_length' | 'weak_characters' | 'weak' | 'same_password'
    | 'session_expired' | 'reauthentication_needed' | 'account_changed'
    | 'rate_limited' | 'network' | 'unknown';
  export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };
  // in AuthBackend:
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
  ```
- Produce, in `passwordChangeRequests.ts`:
  ```ts
  export type AuthErrorLike = { code?: string; status?: number; name?: string; reasons?: string[] };
  export interface DeviceSession { userId: string; email: string; accessToken: string }
  export interface SessionRead { session: DeviceSession | null; error: AuthErrorLike | null }
  export interface PasswordChangeDeps {
    url: string;
    publishableKey: string;
    fetch: typeof fetch;
    /** This device's session as the shared client holds it now (read at every step). */
    readSession(): Promise<SessionRead>;
  }
  export function changePasswordFailure(error: AuthErrorLike, step: 'verify' | 'update'): ChangePasswordFailure;
  export function changePasswordWith(deps: PasswordChangeDeps, current: string, next: string): Promise<ChangePasswordResult>;
  ```
- Produce, in `supabaseBackend.ts`: `deps.fetch?: typeof fetch` (default `globalThis.fetch`).
- Produce, in `stubBackend.ts`: `nextChangePassword: ChangePasswordResult`,
  `changePasswordCalls: { current: string; next: string }[]`,
  `holdChangePassword(): (result: ChangePasswordResult) => void`.

- [ ] **Passo 1: test delle richieste, che falliscono**

`web/src/auth/passwordChangeRequests.test.ts`:

```ts
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { changePasswordFailure, changePasswordWith, type DeviceSession, type PasswordChangeDeps, type SessionRead } from './passwordChangeRequests';

const URL_ = 'http://127.0.0.1:54321';
const A: DeviceSession = { userId: 'user-a', email: 'a@example.test', accessToken: 'token-a' };
const B: DeviceSession = { userId: 'user-b', email: 'b@example.test', accessToken: 'token-b' };

type Answer = Response | Promise<Response> | Error;
interface Sent { method: string; path: string; authorization: string | null; apikey: string | null; version: string | null; body: unknown }

/** A fake Supabase Auth: answers per path, records every request. */
function fakeAuth(answers: Partial<Record<'token' | 'logout' | 'user', Answer | Answer[]>> = {}) {
  const sent: Sent[] = [];
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]])) as Record<string, Answer[]>;
  const defaults: Record<string, () => Response> = {
    token: () => Response.json({ access_token: 'check-token', refresh_token: 'check-refresh', user: { id: 'user-a' } }),
    logout: () => new Response(null, { status: 204 }),
    user: () => Response.json({ id: 'user-a' })
  };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const kind = url.pathname.endsWith('/token') ? 'token' : url.pathname.endsWith('/logout') ? 'logout' : 'user';
    sent.push({
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      authorization: headers.get('authorization'),
      apikey: headers.get('apikey'),
      version: headers.get('x-supabase-api-version'),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });
    const queued = queues[kind]?.length ? queues[kind]!.length > 1 ? queues[kind]!.shift()! : queues[kind]![0]! : defaults[kind]!();
    if (queued instanceof Error) throw queued;
    return queued;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
}
const errorAnswer = (status: number, code: string, extra: object = {}) => Response.json({ code, message: code, ...extra }, { status, headers: { 'x-sb-error-code': code } });

function deps(fetchImpl: typeof fetch, reads: (SessionRead | (() => SessionRead))[] = [{ session: A, error: null }]): PasswordChangeDeps {
  let i = 0;
  return {
    url: URL_,
    publishableKey: 'publishable',
    fetch: fetchImpl,
    readSession: async () => {
      const next = reads[Math.min(i++, reads.length - 1)]!;
      return typeof next === 'function' ? next() : next;
    }
  };
}

describe('changePasswordFailure', () => {
  it('maps every Supabase answer to our reasons', () => {
    expect(changePasswordFailure(new AuthRetryableFetchError('offline', 0), 'verify')).toBe('network');
    expect(changePasswordFailure({ name: 'TypeError', status: 0 }, 'update')).toBe('network');
    expect(changePasswordFailure({ code: 'over_request_rate_limit', status: 429 }, 'verify')).toBe('rate_limited');
    expect(changePasswordFailure({ status: 429 }, 'update')).toBe('rate_limited');
    expect(changePasswordFailure({ code: 'current_password_mismatch', status: 400 }, 'update')).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'invalid_credentials', status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['characters'] }, 'update')).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length', 'characters'] }, 'update')).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length'] }, 'update')).toBe('weak_length');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['pwned'] }, 'update')).toBe('weak');
    expect(changePasswordFailure({ code: 'weak_password', status: 422 }, 'update')).toBe('weak');
    expect(changePasswordFailure({ code: 'same_password', status: 422 }, 'update')).toBe('same_password');
    expect(changePasswordFailure({ code: 'reauthentication_needed', status: 400 }, 'update')).toBe('reauthentication_needed');
    expect(changePasswordFailure(new AuthSessionMissingError(), 'update')).toBe('session_expired');
    expect(changePasswordFailure({ status: 401 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'session_not_found', status: 403 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'refresh_token_not_found', status: 400 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'bad_jwt', status: 403 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'validation_failed', status: 400 }, 'update')).toBe('unknown');
    expect(changePasswordFailure({ status: 500 }, 'update')).toBe('unknown');
  });
});

describe('changePasswordWith', () => {
  it('checks the current password, revokes the check, then changes it with the captured token', async () => {
    const { fetchImpl, sent } = fakeAuth();
    expect(await changePasswordWith(deps(fetchImpl), 'old-password', 'new-password')).toEqual({ ok: true });
    expect(sent.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /auth/v1/token?grant_type=password',
      'POST /auth/v1/logout?scope=local',
      'PUT /auth/v1/user'
    ]);
    expect(sent.every((r) => r.apikey === 'publishable' && r.version === '2024-01-01')).toBe(true);
    expect(sent[0]).toMatchObject({ authorization: null, body: { email: 'a@example.test', password: 'old-password' } });
    expect(sent[1]!.authorization).toBe('Bearer check-token');
    expect(sent[2]).toMatchObject({ authorization: 'Bearer token-a', body: { password: 'new-password', current_password: 'old-password' } });
  });
  it('changes nothing and revokes nothing when the current password is wrong', async () => {
    const { fetchImpl, sent } = fakeAuth({ token: errorAnswer(400, 'invalid_credentials') });
    expect(await changePasswordWith(deps(fetchImpl), 'wrong', 'new-password')).toEqual({ ok: false, reason: 'current_invalid' });
    expect(sent.map((r) => r.path)).toEqual(['/auth/v1/token?grant_type=password']);
  });
  it('tries the revocation again once, and a double failure does not change the outcome', async () => {
    const twice = fakeAuth({ logout: [new Response('down', { status: 503 }), new Response(null, { status: 204 })] });
    expect(await changePasswordWith(deps(twice.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: true });
    expect(twice.sent.filter((r) => r.path.startsWith('/auth/v1/logout')).map((r) => r.authorization)).toEqual(['Bearer check-token', 'Bearer check-token']);

    const offline = fakeAuth({ logout: [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')], user: errorAnswer(422, 'same_password') });
    expect(await changePasswordWith(deps(offline.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(offline.sent.filter((r) => r.path.startsWith('/auth/v1/logout'))).toHaveLength(2);
  });
  it('tells a renewal blocked by the network from a session that is over, without any request', async () => {
    const network = fakeAuth();
    expect(await changePasswordWith(deps(network.fetchImpl, [{ session: null, error: new AuthRetryableFetchError('offline', 0) }]), 'a', 'b')).toEqual({ ok: false, reason: 'network' });
    const refused = fakeAuth();
    expect(await changePasswordWith(deps(refused.fetchImpl, [{ session: null, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    const none = fakeAuth();
    expect(await changePasswordWith(deps(none.fetchImpl, [{ session: null, error: null }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    expect([...network.sent, ...refused.sent, ...none.sent]).toEqual([]);
  });
  it('sends no change when another tab switched to B during the check', async () => {
    let answer!: (response: Response) => void;
    const held = new Promise<Response>((resolve) => (answer = resolve));
    const { fetchImpl, sent } = fakeAuth({ token: held });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    device = { session: B, error: null };
    answer(Response.json({ access_token: 'check-token' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.some((r) => r.method === 'PUT')).toBe(false);
    expect(sent.some((r) => r.authorization === 'Bearer token-b')).toBe(false);
  });
  it('sends no change when the person signed out during the check', async () => {
    let answer!: (response: Response) => void;
    const { fetchImpl, sent } = fakeAuth({ token: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    device = { session: null, error: null };
    answer(Response.json({ access_token: 'check-token' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.some((r) => r.method === 'PUT')).toBe(false);
  });
  it('reports a neutral outcome when the account changed while the change was on its way', async () => {
    let answer!: (response: Response) => void;
    const { fetchImpl, sent } = fakeAuth({ user: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    await vi.waitFor(() => expect(sent.some((r) => r.method === 'PUT')).toBe(true));
    device = { session: B, error: null };
    answer(Response.json({ id: 'user-a' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.find((r) => r.method === 'PUT')!.authorization).toBe('Bearer token-a');
  });
  it('reads error codes from the body or only from the header, and survives a body that is not JSON', async () => {
    const weak = fakeAuth({ user: Response.json({ code: 'weak_password', message: 'weak', weak_password: { reasons: ['pwned'] } }, { status: 422 }) });
    expect(await changePasswordWith(deps(weak.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'weak' });
    const headerOnly = fakeAuth({ user: new Response('<html>', { status: 403, headers: { 'x-sb-error-code': 'session_not_found' } }) });
    expect(await changePasswordWith(deps(headerOnly.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'session_expired' });
    const broken = fakeAuth({ user: new Response('<html>', { status: 502 }) });
    expect(await changePasswordWith(deps(broken.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'unknown' });
    const offline = fakeAuth({ token: new TypeError('Failed to fetch') });
    expect(await changePasswordWith(deps(offline.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'network' });
  });
});
```

- [ ] **Passo 2: verificare che falliscano**

Esegui: `npm test -w web -- src/auth/passwordChangeRequests.test.ts`
Atteso: FAIL, modulo `./passwordChangeRequests` assente.

- [ ] **Passo 3: tipi e modalità finta in `backend.ts`**

Dopo `SignInResult`:

```ts
/** Outcomes of a password change (spec «Cambio della password», table of errors). */
export type ChangePasswordFailure =
  | 'current_invalid'
  | 'weak_length'
  | 'weak_characters'
  | 'weak'
  | 'same_password'
  | 'session_expired'
  | 'reauthentication_needed'
  | 'account_changed'
  | 'rate_limited'
  | 'network'
  | 'unknown';
export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };
```

In `AuthBackend`, dopo `signOut`:

```ts
  /** Checks `current` with a throwaway sign-in, then sets `next` with this device's captured session; other sessions end. */
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
```

In `createFakeBackend`, dopo `signOut`: `changePassword: async () => ({ ok: true }),`.

- [ ] **Passo 4: il modulo delle richieste**

`web/src/auth/passwordChangeRequests.ts`:

```ts
import type { ChangePasswordFailure, ChangePasswordResult } from './backend';

/** The version supabase-js sends: errors come as { code, message } (gotrue v2.197.0). */
const API_VERSION = '2024-01-01';

export type AuthErrorLike = { code?: string; status?: number; name?: string; reasons?: string[] };
export interface DeviceSession { userId: string; email: string; accessToken: string }
export interface SessionRead { session: DeviceSession | null; error: AuthErrorLike | null }
export interface PasswordChangeDeps {
  url: string;
  publishableKey: string;
  fetch: typeof fetch;
  /** This device's session as the shared client holds it now (read at every step). */
  readSession(): Promise<SessionRead>;
}

const isNetwork = (error: AuthErrorLike) => error.name === 'AuthRetryableFetchError' || error.status === 0;

/** Supabase Auth answers to our reasons (spec, table of errors); `verify` is the throwaway sign-in. */
export function changePasswordFailure(error: AuthErrorLike, step: 'verify' | 'update'): ChangePasswordFailure {
  if (isNetwork(error)) return 'network';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited';
  if (error.code === 'current_password_mismatch') return 'current_invalid';
  if (step === 'verify' && (error.code === 'invalid_credentials' || error.status === 400)) return 'current_invalid';
  if (error.code === 'weak_password') {
    if (error.reasons?.includes('characters')) return 'weak_characters';
    return error.reasons?.length && error.reasons.every((reason) => reason === 'length') ? 'weak_length' : 'weak';
  }
  if (error.code === 'same_password') return 'same_password';
  if (error.code === 'reauthentication_needed') return 'reauthentication_needed';
  if (
    error.name === 'AuthSessionMissingError' ||
    error.status === 401 ||
    error.code === 'session_not_found' ||
    error.code === 'refresh_token_not_found' ||
    error.code === 'bad_jwt'
  )
    return 'session_expired';
  return 'unknown';
}

type Call = { ok: true; body: unknown } | { ok: false; error: AuthErrorLike };

async function call(deps: PasswordChangeDeps, path: string, init: { method: string; token?: string; body?: object }): Promise<Call> {
  const headers: Record<string, string> = {
    apikey: deps.publishableKey,
    'content-type': 'application/json',
    'x-supabase-api-version': API_VERSION
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let response: Response;
  try {
    response = await deps.fetch(`${deps.url}/auth/v1${path}`, { method: init.method, headers, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch {
    return { ok: false, error: { name: 'TypeError', status: 0 } };
  }
  const body = (await response.json().catch(() => null)) as { code?: unknown; weak_password?: { reasons?: string[] } } | null;
  if (response.ok) return { ok: true, body };
  const code = response.headers.get('x-sb-error-code') ?? (typeof body?.code === 'string' ? body.code : undefined);
  return { ok: false, error: { status: response.status, code, reasons: body?.weak_password?.reasons } };
}

/**
 * Verify, revoke the check, change: all bound to the session captured at the start, never to
 * whatever the shared client holds later (review W7, finding 1). No supabase-js client for the
 * check: nothing stored, no events, no listeners to dispose of.
 */
export async function changePasswordWith(deps: PasswordChangeDeps, current: string, next: string): Promise<ChangePasswordResult> {
  const fail = (reason: ChangePasswordFailure): ChangePasswordResult => ({ ok: false, reason });
  // 0. Capture: the error first, as check() does — a renewal blocked by the network is not an expiry.
  const first = await deps.readSession();
  if (first.error) return fail(isNetwork(first.error) ? 'network' : 'session_expired');
  if (!first.session) return fail('session_expired');
  const captured = first.session;
  const stillSameUser = async () => (await deps.readSession()).session?.userId === captured.userId;

  // 1. The current password, through a sign-in of its own.
  const verified = await call(deps, '/token?grant_type=password', { method: 'POST', body: { email: captured.email, password: current } });
  if (!verified.ok) return fail(changePasswordFailure(verified.error, 'verify'));

  // 2. Revoke that sign-in with its own token, once more if it fails. A double failure leaves it
  //    alive on the server until its refresh token expires or the next successful change (known limit).
  const checkToken = (verified.body as { access_token?: unknown } | null)?.access_token;
  if (typeof checkToken === 'string') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if ((await call(deps, '/logout?scope=local', { method: 'POST', token: checkToken })).ok) break;
    }
  }

  // 3. Another tab signed out or switched account: nothing is sent.
  if (!(await stillSameUser())) return fail('account_changed');

  // 4. The change, with the captured token: Supabase keeps exactly that session and ends the others.
  const changed = await call(deps, '/user', { method: 'PUT', token: captured.accessToken, body: { password: next, current_password: current } });

  // 5. The device moved on meanwhile: a neutral outcome, nothing applied locally.
  if (!(await stillSameUser())) return fail('account_changed');
  return changed.ok ? { ok: true } : fail(changePasswordFailure(changed.error, 'update'));
}
```

- [ ] **Passo 5: verificare che passino**

Esegui: `npm test -w web -- src/auth/passwordChangeRequests.test.ts`
Atteso: PASS.

- [ ] **Passo 6: test del backend, che falliscono**

In `supabaseBackend.test.ts` aggiungi in fondo al `describe('supabase backend', …)` (il client
finto di `setup` non ha `updateUser`: il backend non deve usarlo):

```ts
  it('changes the password with the device session, without touching the shared client', async () => {
    const session = { user: { id: 'u1', email: 'anna@example.com' }, access_token: 'device-token' };
    const sent: { path: string; authorization: string | null }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      sent.push({ path: url.pathname, authorization: new Headers(init?.headers).get('authorization') });
      if (url.pathname.endsWith('/user')) return Response.json({ code: 'same_password', message: 'same' }, { status: 422 });
      if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'check-token' });
      return new Response(null, { status: 204 });
    });
    const auth = {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn()
    };
    const stored = new Map([[AUTH_STORAGE_KEY, JSON.stringify(session)]]);
    const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
    const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', { auth: auth as unknown as AuthClient, storage, fetch: fetchImpl as unknown as typeof fetch });
    expect(await backend.changePassword('old-password', 'old-password!')).toEqual({ ok: false, reason: 'same_password' });
    expect(sent.find((r) => r.path.endsWith('/user'))?.authorization).toBe('Bearer device-token');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(stored.get(AUTH_STORAGE_KEY)).toBe(JSON.stringify(session));
  });
```

Esegui: `npm test -w web -- src/auth/supabaseBackend.test.ts` → FAIL (`changePassword` e
`deps.fetch` assenti).

- [ ] **Passo 7: il backend**

In `supabaseBackend.ts`: importa `changePasswordWith` e `type SessionRead` da
`./passwordChangeRequests`; aggiungi `fetch?: typeof fetch` a `deps`; nel valore restituito,
dopo `signOut`:

```ts
    changePassword(current, next) {
      return changePasswordWith(
        {
          url,
          publishableKey,
          fetch: deps.fetch ?? ((input, init) => globalThis.fetch(input, init)),
          async readSession(): Promise<SessionRead> {
            const { data, error } = await auth.getSession();
            const session = data.session;
            return {
              error: error ?? null,
              session: session ? { userId: session.user.id, email: session.user.email ?? '', accessToken: session.access_token } : null
            };
          }
        },
        current,
        next
      );
    },
```

`AuthClient` non cambia: il backend non usa `updateUser`.

- [ ] **Passo 8: stub dei test**

In `stubBackend.ts`, nell'interfaccia `StubBackend`:

```ts
  /** Answer of changePassword ({ ok: true } by default). */
  nextChangePassword: ChangePasswordResult;
  changePasswordCalls: { current: string; next: string }[];
  /** The next changePassword() waits until the returned function answers it. */
  holdChangePassword(): (result: ChangePasswordResult) => void;
```

Importa `ChangePasswordResult` da `../auth/backend`. Nel corpo, accanto agli altri `held…`:
`let heldChangePassword: Promise<ChangePasswordResult> | null = null;` e nell'oggetto:

```ts
    nextChangePassword: { ok: true },
    changePasswordCalls: [],
    holdChangePassword() {
      let answer: (result: ChangePasswordResult) => void = () => {};
      heldChangePassword = new Promise<ChangePasswordResult>((resolve) => (answer = resolve));
      return answer;
    },
    changePassword(current, next) {
      backend.changePasswordCalls.push({ current, next });
      const pending = heldChangePassword;
      heldChangePassword = null;
      return pending ?? Promise.resolve(backend.nextChangePassword);
    },
```

- [ ] **Passo 9: verificare che passino, typecheck compreso**

Esegui: `npm test -w web -- src/auth/ && npm run typecheck -w web`
Atteso: PASS. Se altri `AuthBackend` scritti a mano nei test non compilano
(`grep -rn "mode: 'supabase'\|mode: 'fake'" web/src`), aggiungi `changePassword` dove manca.

- [ ] **Passo 10: commit**

```bash
git add web/src/auth web/src/test/stubBackend.ts
git commit -m "Cambio password: richieste dirette a Supabase Auth legate alla sessione catturata"
```

---

### Task 3: Pagina, rotta, voce nel Profilo e testi

**File:**
- Crea: `web/src/i18n/messages/password.ts`
- Modifica: `web/src/i18n/messages/index.ts`
- Modifica: `web/src/components/Icon.tsx` (icona `lock`)
- Crea: `web/src/routes/profile/PasswordPage.tsx`, `web/src/routes/profile/PasswordPage.module.css`
- Modifica: `web/src/router.tsx`, `web/src/routes/ProfilePage.tsx`
- Test: `web/src/routes/profile/PasswordPage.test.tsx`, `web/src/routes/ProfilePage.test.tsx`

**Interfacce:**
- Consuma: `validatePasswordChange`, `PasswordField`, `PasswordFieldErrors`,
  `PASSWORD_MIN_LENGTH` (Task 1); `AuthBackend.changePassword`, `ChangePasswordFailure`
  (Task 2); `StubBackend.nextChangePassword`, `changePasswordCalls`, `holdChangePassword`,
  `setUser` (Task 2 ed esistente); `useSignOut` da `web/src/session/SessionScope.tsx`.
- Produce: rotta `/profile/password`, componente `PasswordPage`, `IconName` con `'lock'`, id
  stabili dei campi `password-current`, `password-next`, `password-confirm`.

- [ ] **Passo 1: testi**

`web/src/i18n/messages/password.ts` (tono e parole come `auth.ts` e `profile.ts`; ritocchi
ammessi senza cambiarne il senso):

```ts
export const it = {
  'profile.password': 'Cambia password',
  'profile.passwordHint': 'Scegli una password tua',
  'password.title': 'Cambia password',
  'password.current': 'Password attuale',
  'password.next': 'Nuova password',
  'password.confirm': 'Conferma la nuova password',
  'password.hint': 'Almeno {min} caratteri.',
  'password.warning': 'Dopo il cambio, gli altri dispositivi e gli agenti collegati dovranno accedere di nuovo. Su questo dispositivo resti dentro.',
  'password.submit': 'Cambia password',
  'password.submitting': 'Cambio in corso…',
  'password.offline': 'Serve la connessione per cambiare la password.',
  'password.done': 'Password cambiata. Gli altri dispositivi e gli agenti collegati dovranno accedere di nuovo.',
  'password.signInAgain': 'Accedi di nuovo',
  'password.field.required': 'Campo obbligatorio.',
  'password.field.too_short': 'Servono almeno {min} caratteri.',
  'password.field.too_long': 'La password è troppo lunga.',
  'password.field.mismatch': 'Le due password non coincidono.',
  'password.field.same_as_current': 'La nuova password è uguale a quella attuale.',
  'password.error.current_invalid': 'La password attuale non è corretta.',
  'password.error.weak_length': 'La nuova password è troppo corta.',
  'password.error.weak_characters': 'La nuova password deve contenere altri tipi di caratteri (lettere, numeri o simboli).',
  'password.error.weak': 'La nuova password non è abbastanza sicura: scegline un’altra.',
  'password.error.same_password': 'La nuova password è uguale a quella attuale.',
  'password.error.session_expired': 'La sessione è scaduta: accedi di nuovo e riprova.',
  'password.error.reauthentication_needed': 'Il servizio chiede una conferma via email, che l’app non gestisce: avvisa l’amministratore.',
  'password.error.account_changed': 'Il cambio si è interrotto perché l’account su questo dispositivo è cambiato.',
  'password.error.rate_limited': 'Troppi tentativi: riprova tra qualche minuto.',
  'password.error.network': 'Non riesco a raggiungere il servizio: controlla la connessione.',
  'password.error.unknown': 'Cambio non riuscito: riprova tra poco.'
};

export const en = {
  'profile.password': 'Change password',
  'profile.passwordHint': 'Choose a password of your own',
  'password.title': 'Change password',
  'password.current': 'Current password',
  'password.next': 'New password',
  'password.confirm': 'Confirm the new password',
  'password.hint': 'At least {min} characters.',
  'password.warning': 'After the change, your other devices and connected agents will need to sign in again. You stay signed in on this device.',
  'password.submit': 'Change password',
  'password.submitting': 'Changing…',
  'password.offline': 'You need a connection to change your password.',
  'password.done': 'Password changed. Your other devices and connected agents will need to sign in again.',
  'password.signInAgain': 'Sign in again',
  'password.field.required': 'Required.',
  'password.field.too_short': 'At least {min} characters are needed.',
  'password.field.too_long': 'The password is too long.',
  'password.field.mismatch': 'The two passwords don’t match.',
  'password.field.same_as_current': 'The new password is the same as the current one.',
  'password.error.current_invalid': 'The current password is wrong.',
  'password.error.weak_length': 'The new password is too short.',
  'password.error.weak_characters': 'The new password needs other kinds of characters (letters, numbers or symbols).',
  'password.error.weak': 'The new password is not strong enough: choose another one.',
  'password.error.same_password': 'The new password is the same as the current one.',
  'password.error.session_expired': 'Your session has expired: sign in again and retry.',
  'password.error.reauthentication_needed': 'The service asks for an email confirmation, which the app does not handle: tell the administrator.',
  'password.error.account_changed': 'The change stopped because the account on this device changed.',
  'password.error.rate_limited': 'Too many attempts: try again in a few minutes.',
  'password.error.network': 'The service cannot be reached: check your connection.',
  'password.error.unknown': 'Change failed: please try again shortly.'
} satisfies Record<keyof typeof it, string>;
```

In `index.ts`: `import * as password from './password';` e `...password.it` / `...password.en`
in coda alle due liste.

- [ ] **Passo 2: test della pagina, che falliscono**

`web/src/routes/profile/PasswordPage.test.tsx`:

```tsx
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_USER, type ChangePasswordFailure } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
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
    fireEvent.submit((await field('Nuova password')).form!);
    submit();
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
    const backend = createStubBackend(DEMO_USER);
    backend.nextChangePassword = { ok: false, reason: 'current_invalid' };
    renderApp('/profile/password', { backend, locale: 'en-GB' });
    fireEvent.change(await field('Current password'), { target: { value: 'wrong' } });
    fireEvent.change(await field('New password'), { target: { value: 'new-password' } });
    fireEvent.change(await field('Confirm the new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The current password is wrong.')).toBeTruthy();
  });
});
```

Cambio di lingua dopo un errore: lo stato conserva il motivo (`ChangePasswordFailure`) e il
testo si calcola a ogni render con `t`. Guarda come i test esistenti cambiano lingua nello
stesso albero (`web/src/test/LanguageSwitch.tsx`, passato a `renderApp` con `extra`) e aggiungi
un test: errore in inglese, cambio a it-IT, poi
`await screen.findByText('La password attuale non è corretta.')`.

In `ProfilePage.test.tsx` aggiungi:

```tsx
  it('offers the password change with Supabase only', async () => {
    renderApp('/profile', { backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByRole('link', { name: /Cambia password/ })).toHaveProperty('href', expect.stringContaining('/profile/password'));
  });
```

e nel primo test (modalità finta) l'assenza:
`expect(screen.queryByRole('link', { name: /Cambia password/ })).toBeNull();`

- [ ] **Passo 3: verificare che falliscano**

Esegui: `npm test -w web -- src/routes/profile/PasswordPage.test.tsx src/routes/ProfilePage.test.tsx`
Atteso: FAIL (rotta e riga assenti).

- [ ] **Passo 4: icona**

In `Icon.tsx` aggiungi `'lock'` a `IconName` e in `PATHS`:

```tsx
  lock: <><path d="M5 11h14v10H5Z" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>,
```

- [ ] **Passo 5: pagina**

`PasswordPage.module.css`:

```css
.note { margin: -10px 0 16px; color: var(--muted); font-size: 0.875rem; }
.fieldError { margin: -10px 0 16px; color: var(--danger); font-size: 0.875rem; }
```

(I margini negativi avvicinano il testo al campo, perché `.field` ha `margin-bottom: 16px`;
se nella verifica visiva l'effetto non convince, sistemali lì.)

`PasswordPage.tsx`:

```tsx
import { useRef, useState, type FormEvent } from 'react';
import { useAuth, type AuthState } from '../../auth/AuthProvider';
import type { ChangePasswordFailure } from '../../auth/backend';
import { PASSWORD_MIN_LENGTH, validatePasswordChange, type PasswordField, type PasswordFieldErrors } from '../../auth/passwordChange';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { useT } from '../../i18n/LocaleProvider';
import { useSignOut } from '../../session/SessionScope';
import { BackToProfile } from './BackToProfile';
import styles from './PasswordPage.module.css';

const EMPTY: Record<PasswordField, string> = { current: '', next: '', confirm: '' };
const AUTOCOMPLETE: Record<PasswordField, string> = { current: 'current-password', next: 'new-password', confirm: 'new-password' };
const LABEL = { current: 'password.current', next: 'password.next', confirm: 'password.confirm' } as const;
/** Server outcomes shown under a field; the others go above the button. */
const FIELD_OF: Partial<Record<ChangePasswordFailure, PasswordField>> = {
  current_invalid: 'current',
  weak_length: 'next',
  weak_characters: 'next',
  weak: 'next',
  same_password: 'next'
};
const userOf = (state: AuthState) => (state.status === 'signedIn' ? state.user.id : null);

/** Password change (spec «Cambio della password»): checked here, sent to Supabase Auth only. */
export function PasswordPage() {
  const t = useT();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const online = useOnline();
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  // The reason, not the text: a change of language translates it again.
  const [failure, setFailure] = useState<ChangePasswordFailure | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap or Enter before React re-renders must not send twice.
  const sending = useRef(false);
  // The person shown now: an answer for someone else is dropped.
  const shown = useRef(userOf(state));
  shown.current = userOf(state);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !online) return;
    const errors = validatePasswordChange(values);
    setFieldErrors(errors);
    setFailure(null);
    setDone(false);
    if (Object.keys(errors).length > 0) return;
    const asker = shown.current;
    sending.current = true;
    setBusy(true);
    const result = await backend.changePassword(values.current, values.next);
    sending.current = false;
    setBusy(false);
    // Someone else is on this device now: nothing of the previous account stays on screen.
    if (shown.current !== asker) return setValues(EMPTY);
    if (result.ok) {
      setValues(EMPTY);
      setDone(true);
      return;
    }
    // The previous account's password must not stay on screen for the next one.
    if (result.reason === 'account_changed') setValues(EMPTY);
    setFailure(result.reason);
  }

  const serverField = failure ? FIELD_OF[failure] : undefined;
  const errorOf = (name: PasswordField): string | null => {
    const local = fieldErrors[name];
    if (local) return t(`password.field.${local}`, { min: PASSWORD_MIN_LENGTH });
    return failure && serverField === name ? t(`password.error.${failure}`) : null;
  };
  const input = (name: PasswordField, hint?: string) => {
    const id = `password-${name}`;
    const error = errorOf(name);
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <>
        <div className="field">
          <label htmlFor={id}>{t(LABEL[name])}</label>
          <input
            id={id}
            type="password"
            name={name}
            autoComplete={AUTOCOMPLETE[name]}
            value={values[name]}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
          />
        </div>
        {hint && <p id={`${id}-hint`} className={styles.note}>{hint}</p>}
        {error && <p id={`${id}-error`} className={styles.fieldError} role="alert">{error}</p>}
      </>
    );
  };

  return (
    <section className="secondary-view app-view" aria-labelledby="password-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('password.title')} titleId="password-title" />
        <form className="settings-card" onSubmit={submit} noValidate>
          {input('current')}
          {input('next', t('password.hint', { min: PASSWORD_MIN_LENGTH }))}
          {input('confirm')}
          <p className="meta-line">{t('password.warning')}</p>
          {failure && !serverField && <p className="form-error" role="alert">{t(`password.error.${failure}`)}</p>}
          {failure === 'session_expired' && (
            <button type="button" className="text-button" onClick={() => void signOut()}>{t('password.signInAgain')}</button>
          )}
          {done && <p className="meta-line" role="status">{t('password.done')}</p>}
          {!online && <p className="meta-line">{t('password.offline')}</p>}
          <button type="submit" className="text-button primary wide" disabled={busy || !online}>
            {busy ? t('password.submitting') : t('password.submit')}
          </button>
        </form>
      </div>
    </section>
  );
}
```

Note per chi esegue:
- `AuthState` è esportato da `AuthProvider.tsx`; se non lo fosse, esportalo.
- `.field` di `design/global.css` stila il contenitore con `display: grid`: con `<div
  className="field">` etichetta e campo restano come nelle altre pagine. Controllalo nella
  verifica visiva.
- Se `t` rifiuta le chiavi composte (`password.field.${…}`) per il tipo `MessageKey`, fai come
  `LoginPage` (`t(\`auth.error.${failure}\`)`): guarda come è tipizzato lì e ripeti.
- Il primo test usa `findByLabelText(…, { exact: true })`: deve trovare il campo prima e dopo
  gli errori. È la prova del rilievo 6.

- [ ] **Passo 6: rotta e voce nel Profilo**

In `router.tsx`: `import { PasswordPage } from './routes/profile/PasswordPage';`,
`const passwordRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/password', component: PasswordPage });`
e `passwordRoute` nella lista di `appRoute.addChildren`, dopo `preferencesRoute`.

In `ProfilePage.tsx`, nella scheda «Account», fra la riga delle preferenze e quella degli
agenti (serve `backend` da `useAuth()`: `const { state, backend } = useAuth();`):

```tsx
            {backend.mode === 'supabase' && (
              <li>
                <Link to="/profile/password" className="row-link">
                  <Icon name="lock" />
                  <span className="row-main">{t('profile.password')}<small>{t('profile.passwordHint')}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              </li>
            )}
```

- [ ] **Passo 7: verificare che passino**

Esegui: `npm test -w web -- src/routes/ src/auth/ && npm run typecheck -w web`
Atteso: PASS. Poi tutta la suite web (`npm test -w web`): se un test del Profilo conta le
righe, aggiorna l'attesa e annotalo nel commit.

- [ ] **Passo 8: commit**

```bash
git add web/src
git commit -m "Cambio password: pagina /profile/password e voce nel Profilo"
```

---

### Task 4: Minimo locale a 8 e prove sullo stack locale

**File:**
- Modifica: `supabase/config.toml` (`minimum_password_length`)
- Crea: `web/src/test/stack.ts` (utenti e sessioni di prova sullo stack)
- Crea: `web/src/auth/changePassword.stack.test.ts`
- Crea: `web/src/routes/profile/PasswordPage.stack.test.tsx`
- Crea: `scripts/password/password-stack.sh`
- Modifica: `.github/workflows/ci.yml`

**Interfacce:**
- Consuma: `createSupabaseBackend`, `AUTH_STORAGE_KEY`, `changePassword` (Task 2);
  `PasswordPage` e rotta (Task 3); `renderApp`.
- Produce: `scripts/password/password-stack.sh`, lanciabile in locale e in CI; in
  `web/src/test/stack.ts`:
  ```ts
  export const stack: { url: string; key: string; db: string } | null;
  export interface StackPerson { email: string; id: string; session: { access_token: string; refresh_token: string; expires_at: number; user: unknown } }
  export function sessionIdOf(accessToken: string): string;
  export function createStack(): {
    person(password?: string): Promise<StackPerson>;
    /** Signs in and signs out at once: true when the password works. */
    canSignIn(email: string, password: string): Promise<boolean>;
    /** A second sign-in left open (refresh token returned); closed by the user deletion at the end. */
    openSession(email: string, password: string): Promise<{ access_token: string; refresh_token: string }>;
    refreshWorks(refreshToken: string): Promise<boolean>;
    sessionIds(userId: string): Promise<string[]>;
    sql: import('postgres').Sql;
    cleanup(): Promise<void>;
  };
  ```

- [ ] **Passo 1: configurazione locale**

In `supabase/config.toml`, riga di `minimum_password_length`:

```toml
# 8, as the web app's minimum (spec «Cambio della password»); production: optional dashboard step.
minimum_password_length = 8
```

Riavvia lo stack locale del worktree (`supabase stop && supabase start`, con il wrapper di
Podman se serve) e verifica che una registrazione con 7 caratteri risponda `weak_password`:
`curl -s -X POST "$API_URL/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d '{"email":"short@example.test","password":"1234567"}'`.

- [ ] **Passo 2: supporto comune**

`web/src/test/stack.ts`:

```ts
import postgres from 'postgres';

/** The local stack, from scripts/password/password-stack.sh; null outside it (suites skip). */
const url = process.env.STACK_SUPABASE_URL;
const key = process.env.STACK_SUPABASE_PUBLISHABLE_KEY;
const db = process.env.STACK_DB_URL;
const LOCAL = /^(http|postgresql):\/\/(postgres:postgres@)?(127\.0\.0\.1|localhost)[:/]/;
export const stack = url && key && db ? { url, key, db } : null;
if (stack) for (const target of [stack.url, stack.db]) if (!LOCAL.test(target)) throw new Error(`Local stack only: ${target}`);

export interface StackPerson { email: string; id: string; session: { access_token: string; refresh_token: string; expires_at: number; user: unknown } }

export const sessionIdOf = (accessToken: string): string =>
  (JSON.parse(atob(accessToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id: string }).session_id;

export function createStack() {
  if (!stack) throw new Error('No local stack');
  const { url: base, key: apikey, db: dbUrl } = stack;
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  const created: string[] = [];
  const headers = { apikey, 'content-type': 'application/json' };
  const post = (path: string, body: object, token?: string) =>
    fetch(`${base}/auth/v1${path}`, { method: 'POST', headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers, body: JSON.stringify(body) });

  return {
    sql,
    /** A fresh person (local sign-ups are on); the sign-up session becomes the device session. */
    async person(password = 'first-password'): Promise<StackPerson> {
      const email = `password-${crypto.randomUUID()}@example.test`;
      const response = await post('/signup', { email, password });
      const session = (await response.json()) as StackPerson['session'] & { user: { id: string } };
      if (!response.ok || !session.access_token) throw new Error(`sign-up: ${response.status}`);
      created.push(session.user.id);
      return { email, id: session.user.id, session };
    },
    async canSignIn(email: string, password: string) {
      const response = await post('/token?grant_type=password', { email, password });
      if (!response.ok) return false;
      const { access_token } = (await response.json()) as { access_token: string };
      await post('/logout?scope=local', {}, access_token);
      return true;
    },
    async openSession(email: string, password: string) {
      const response = await post('/token?grant_type=password', { email, password });
      if (!response.ok) throw new Error(`sign-in: ${response.status}`);
      return (await response.json()) as { access_token: string; refresh_token: string };
    },
    async refreshWorks(refreshToken: string) {
      return (await post('/token?grant_type=refresh_token', { refresh_token: refreshToken })).ok;
    },
    async sessionIds(userId: string) {
      return (await sql<{ id: string }[]>`select id::text from auth.sessions where user_id = ${userId} order by id`).map((row) => row.id);
    },
    /** Deletes the people created here; profiles and roles follow (on delete cascade). */
    async cleanup() {
      if (created.length) await sql`delete from auth.users where id = any(${created}::uuid[])`;
      await sql.end();
    }
  };
}
```

`postgres` è già nel repository (dipendenza del server, sollevata alla radice da npm
workspaces). Se il typecheck di `web` non la risolve, dichiarala in `devDependencies` di
`web/package.json` alla stessa versione di `server/package.json`: non è una libreria nuova.

- [ ] **Passo 3: test del backend sullo stack**

`web/src/auth/changePassword.stack.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createStack, sessionIdOf, stack, type StackPerson } from '../test/stack';
import { AUTH_STORAGE_KEY, createSupabaseBackend } from './supabaseBackend';

describe.skipIf(!stack)('password change on the local stack', () => {
  const env = stack ? createStack() : null!;
  afterAll(() => env.cleanup());
  beforeEach(() => localStorage.clear());

  /** This device: the app's backend holding the sign-up session, as after a sign-in. */
  function device(person: StackPerson) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(person.session));
    return createSupabaseBackend(stack!.url, stack!.key, { storage: localStorage });
  }

  it('changes the password and keeps exactly this device’s session', async () => {
    const person = await env.person();
    const backend = device(person);
    const own = sessionIdOf(person.session.access_token);
    expect(await env.sessionIds(person.id)).toEqual([own]);
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: true });
    expect(await env.canSignIn(person.email, 'second-password')).toBe(true);
    expect(await env.canSignIn(person.email, 'first-password')).toBe(false);
    expect(await env.sessionIds(person.id)).toEqual([own]);
    expect(await backend.refresh()).toMatchObject({ kind: 'ok' });
  });
  it('refuses a wrong current password and changes nothing', async () => {
    const person = await env.person();
    const backend = device(person);
    expect(await backend.changePassword('not-the-password', 'second-password')).toEqual({ ok: false, reason: 'current_invalid' });
    expect(await env.canSignIn(person.email, 'first-password')).toBe(true);
    expect(await env.sessionIds(person.id)).toEqual([sessionIdOf(person.session.access_token)]);
  });
  it('lets the server refuse a weak or unchanged password, revoking the check session', async () => {
    const person = await env.person();
    const backend = device(person);
    const own = [sessionIdOf(person.session.access_token)];
    // Below the local minimum of 8: the server's answer, without the form's own check.
    expect(await backend.changePassword('first-password', 'abc123')).toEqual({ ok: false, reason: 'weak_length' });
    expect(await env.sessionIds(person.id)).toEqual(own);
    expect(await backend.changePassword('first-password', 'first-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(await env.sessionIds(person.id)).toEqual(own);
    expect(await env.canSignIn(person.email, 'first-password')).toBe(true);
  });
  it('reports an expired session when this device’s session was ended elsewhere', async () => {
    const person = await env.person();
    const backend = device(person);
    await env.sql`delete from auth.sessions where user_id = ${person.id}`;
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: false, reason: 'session_expired' });
    expect(await env.canSignIn(person.email, 'first-password')).toBe(true);
  });
  it('ends the other sessions', async () => {
    const person = await env.person();
    const other = await env.openSession(person.email, 'first-password');
    const backend = device(person);
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: true });
    expect(await env.refreshWorks(other.refresh_token)).toBe(false);
    expect(await env.sessionIds(person.id)).toEqual([sessionIdOf(person.session.access_token)]);
  });
  it('works with a device session older than 24 hours (secure_password_change off)', async () => {
    const person = await env.person();
    const backend = device(person);
    await env.sql`update auth.sessions set created_at = now() - interval '25 hours' where id = ${sessionIdOf(person.session.access_token)}`;
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: true });
  });
});
```

Note per chi esegue: `jsdom` ha `localStorage` grazie a `--no-experimental-webstorage` già
nella configurazione di Vitest; `fetch` è quello di Node. Se Supabase risponde con un codice
diverso da quelli della tabella (per esempio per la sessione cancellata), **non** allargare la
mappatura a caso: annota il codice reale, aggiorna la tabella della spec e
`changePasswordFailure` con un test unitario, e dillo nel messaggio di stato.

- [ ] **Passo 4: test della pagina con il backend reale sullo stack**

`web/src/routes/profile/PasswordPage.stack.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, createSupabaseBackend } from '../../auth/supabaseBackend';
import { renderApp } from '../../test/renderApp';
import { createStack, stack, type StackPerson } from '../../test/stack';

describe.skipIf(!stack)('password page on the local stack', () => {
  const env = stack ? createStack() : null!;
  afterAll(() => env.cleanup());
  beforeEach(() => localStorage.clear());

  /** The app with the real Supabase backend (data from the fake API: the page needs no Worker). */
  function open(person: StackPerson) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(person.session));
    const backend = createSupabaseBackend(stack!.url, stack!.key, { storage: localStorage });
    return renderApp('/profile/password', { backend });
  }
  const field = (label: string) => screen.findByLabelText(label, { exact: true }) as Promise<HTMLInputElement>;
  async function change(current: string, next: string) {
    fireEvent.change(await field('Password attuale'), { target: { value: current } });
    fireEvent.change(await field('Nuova password'), { target: { value: next } });
    fireEvent.change(await field('Conferma la nuova password'), { target: { value: next } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
  }

  it('changes the password and stays signed in as the same person', async () => {
    const person = await env.person();
    open(person);
    // Read after the client started: it may write the session back once at start-up.
    await field('Password attuale');
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    await change('first-password', 'second-password');
    expect(await screen.findByText(/^Password cambiata\./, {}, { timeout: 5000 })).toBeTruthy();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(stored);
    expect(await env.canSignIn(person.email, 'second-password')).toBe(true);
  });
  it('shows the server’s refusal of a wrong current password on its field', async () => {
    const person = await env.person();
    open(person);
    await change('not-the-password', 'second-password');
    expect(await screen.findByText('La password attuale non è corretta.', {}, { timeout: 5000 })).toBeTruthy();
    expect((await field('Password attuale')).getAttribute('aria-invalid')).toBe('true');
    expect(await env.canSignIn(person.email, 'first-password')).toBe(true);
  });
  it('after a session revoked on the server, leads to the sign-in page and clears this device', async () => {
    const person = await env.person();
    const { history } = open(person);
    await field('Password attuale');
    await env.sql`delete from auth.sessions where user_id = ${person.id}`;
    await change('first-password', 'second-password');
    fireEvent.click(await screen.findByRole('button', { name: 'Accedi di nuovo' }, { timeout: 5000 }));
    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull());
    expect(history.location.pathname).not.toBe('/profile/password');
  });
});
```

Il rifiuto di password debole o uguale non è raggiungibile dal modulo, perché il minimo locale
coincide con quello della SPA: lo coprono il Passo 3 sul backend reale e il Task 3 sulla
pagina. Per la pagina, il rifiuto del server provato è quello della verifica.

- [ ] **Passo 5: script**

`scripts/password/password-stack.sh` (eseguibile, `chmod +x`):

```bash
#!/usr/bin/env bash
# scripts/password/password-stack.sh — the password change against the local stack
# (`supabase start` with supabase/config.toml): backend and page. Used by CI; runnable locally.
#   SUPABASE: the supabase CLI command (default `supabase`), for a stack on other ports.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(${SUPABASE:-supabase} status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] || { echo "supabase status: API_URL, DB_URL or PUBLISHABLE_KEY missing (is Auth running?)"; exit 1; }

STACK_SUPABASE_URL="$API_URL" STACK_SUPABASE_PUBLISHABLE_KEY="$KEY" STACK_DB_URL="$DB_URL" \
  npm test -w web -- src/auth/changePassword.stack.test.ts src/routes/profile/PasswordPage.stack.test.tsx
```

Con le tre variabili impostate le suite non si saltano mai, quindi in CI un fallimento non
passa inosservato. Controllo una tantum: senza variabili (`npm test -w web`) le due suite
risultano «skipped».

- [ ] **Passo 6: verificare sullo stack locale**

Esegui: `scripts/password/password-stack.sh` (stack del worktree avviato)
Atteso: 9 test PASS. Poi `select count(*) from auth.users where email like 'password-%@example.test'`
sul database locale: 0.

- [ ] **Passo 7: CI**

In `.github/workflows/ci.yml`, subito dopo `- run: scripts/oauth/agents-e2e.sh`:

```yaml
      # Password change on the local stack, backend and page: wrong current password, weak, expired session, other sessions.
      - run: scripts/password/password-stack.sh
```

- [ ] **Passo 8: commit**

```bash
git add supabase/config.toml web/src/test/stack.ts web/src/auth/changePassword.stack.test.ts web/src/routes/profile/PasswordPage.stack.test.tsx scripts/password .github/workflows/ci.yml
git commit -m "Cambio password: minimo locale a 8 e prove sullo stack locale in CI"
```

---

### Task 5: Prova che il cambio chiude gli agenti

**File:**
- Modifica: `scripts/oauth/agents-e2e.mjs` (nuovo blocco 6, prima di `process.exit`)

**Interfacce:**
- Consuma: gli helper già nello script (`register`, `connect`, `refresh`, `channelEverywhere`,
  `refusedEverywhere`, `refusedGrant`, `is`, `read`, `AUTH`, `KEY`, `DB`, `postgres`).
- Produce: l'esito della prova, che conferma o corregge l'avviso della pagina.

Il cambio qui passa da `PUT /auth/v1/user` con `current_password` e il token web, la stessa
richiesta del passo 4 di `changePasswordWith`.

- [ ] **Passo 1: il blocco**

```js
// 6. Password change from the web (spec «Cambio della password»): Supabase ends every other
// session of the person, the agents' too; the web session that asked stays.
{
	const email = `password-${randomBytes(6).toString('hex')}@example.test`;
	const signup = await read(await fetch(`${AUTH}/signup`, {
		method: 'POST',
		headers: { apikey: KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'first-password' }),
	}));
	if (signup.status !== 200 || !signup.body.access_token) throw new Error(`sign-up for the password check: ${signup.status} ${JSON.stringify(signup.body)}`);
	const web = signup.body;
	try {
		const clientP = await register('E2E agent P');
		const agent = await connect(clientP, web.access_token);
		await channelEverywhere('agent P before the password change', agent.access_token, 'mcp');
		const changed = await read(await fetch(`${AUTH}/user`, {
			method: 'PUT',
			headers: { apikey: KEY, authorization: `Bearer ${web.access_token}`, 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
			body: JSON.stringify({ password: 'second-password', current_password: 'first-password' }),
		}));
		is('password changed from the web', changed.status, 200);
		await refusedEverywhere('agent P after the password change', agent.access_token);
		refusedGrant('refresh token of agent P refused after the password change', await refresh(clientP, agent.refresh_token));
		await channelEverywhere('web session that changed the password', web.access_token, 'web');
	} finally {
		const sql = postgres(DB, { max: 1, onnotice: () => {} });
		await sql`delete from auth.users where email = ${email}`;
		await sql.end();
	}
}
```

- [ ] **Passo 2: eseguire la prova**

Esegui: `npm run build -w web && scripts/oauth/agents-e2e.sh` (stack del worktree avviato)
Atteso: tutte le righe `ok`, comprese le nuove del blocco 6.

- [ ] **Passo 3: se la prova smentisce la spec**

Se l'agente resta attivo dopo il cambio: **fermati**. Togli «e gli agenti collegati» da
`password.warning` e `password.done` (it e en) e dai test del Task 3, rovescia le attese del
blocco 6 per documentare il comportamento reale (`channelEverywhere` invece di
`refusedEverywhere`), aggiorna nella spec «Cosa fa Supabase Auth», «Scelte del brainstorming e
della review» punto 6 e «Decisioni da riportare», e scrivi `STATO: DOMANDA` al coordinatore
prima di proseguire: cambia un'affermazione di prodotto.

- [ ] **Passo 4: commit**

```bash
git add scripts/oauth/agents-e2e.mjs
git commit -m "Cambio password: prova che il cambio chiude le sessioni degli agenti"
```

---

### Task 6: Verifica nel browser e verifica finale

**File:** nessun file nuovo nel repository (gli screenshot restano nella scratchpad, non si
committano).

- [ ] **Passo 1: avvio**

Stack locale del worktree avviato; Worker con `wrangler dev` come nello script degli agenti;
SPA con `npm run dev -w web` (porta 5174). Crea un utente con una registrazione locale
(`POST /auth/v1/signup`, password `first-password`); se il Profilo chiede una famiglia per
mostrarsi, usa invece `anna@example.test` / `password123` e alla fine rimetti `password123`
cambiandola dalla pagina stessa.

- [ ] **Passo 2: percorso con agent-browser**

Con la skill `agent-browser`, prima a 390×844 e poi a 1280×800:
1. accesso, Profilo, riga «Cambia password» visibile con il lucchetto;
2. pagina vuota: screenshot;
3. invio con nuova corta e conferma diversa: errori sotto i campi, screenshot;
4. password attuale sbagliata: errore sotto il campo, screenshot;
5. cambio riuscito: messaggio, campi vuoti, ancora dentro (torna al Profilo), screenshot;
6. offline (emulazione offline del browser): riga e pulsante disattivato, screenshot;
7. esci e rientra con la nuova password.

Controlla: niente scroll orizzontale a 390 px, campi alti almeno 44 px, distanze fra campo,
suggerimento ed errore, testi del tono delle altre pagine del Profilo (`design/design.md`,
`design/percorsi.md`). Se il Mac va in standby, segui la nota sulle schermate (caffeinate e
sessione nuova).

- [ ] **Passo 3: verifica finale**

Con `superpowers:verification-before-completion`:

```bash
npm run typecheck
npm test
npm run build -w web
scripts/password/password-stack.sh
scripts/oauth/agents-e2e.sh
```

Atteso: tutto verde. Riporta nel messaggio della PR l'esito di ciascun comando.

- [ ] **Passo 4: PR** (secondo il protocollo, dopo il via del coordinatore all'implementazione)

Push del branch e `gh pr create` verso `main`, descrizione in italiano: cosa fa, come è stato
verificato (comandi sopra, prove sullo stack, screenshot descritti), sezioni della specifica
realizzate (1, 7, 13), la precondizione del rilascio («Secure password change» spento) e il
passo facoltativo in dashboard da portare all'utente. Poi `STATO: PR_APERTA <url>`.
