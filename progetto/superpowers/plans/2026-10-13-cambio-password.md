# Cambio della password dal Profilo: piano di implementazione

> **Per gli agenti che eseguono:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, un task alla volta. I passi usano le
> caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** chi è entrato cambia la propria password da `/profile/password`, con verifica
della password attuale, senza email e senza toccare Worker e database.

**Architettura:** la SPA verifica la password attuale con un accesso di prova in un client
supabase-js isolato (niente persistenza, `storageKey` propria), chiude quella sessione, poi
chiama `updateUser({ password, current_password })` sulla sessione del dispositivo. Il metodo
vive in `AuthBackend`; la pagina usa una validazione pura e mostra esiti tradotti.

**Stack:** React 19 + TanStack Router, supabase-js 2.117.3, Vitest con jsdom, Supabase locale
(CLI 2.120.0, gotrue v2.197.0).

**Spec:** `progetto/superpowers/specs/2026-10-13-cambio-password.md` (leggila prima di
iniziare; la specifica principale resta il riferimento, sezioni 1, 7, 13).

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano.
- Testi per l'utente in `it-IT` ed `en-GB`, nel file nuovo `web/src/i18n/messages/password.ts`.
- Nessuna dipendenza nuova. Nessuna migrazione, operazione oRPC o strumento MCP.
- Minimo nella SPA: `PASSWORD_MIN_LENGTH = 8` (code point); massimo `PASSWORD_MAX_BYTES = 72`
  (byte UTF-8). Le password non si tagliano.
- `supabase/config.toml`: solo `minimum_password_length = 8`; `secure_password_change` resta
  `false`, `password_requirements` resta `""`.
- Impostazioni di Supabase in produzione: non si toccano.
- Client di prova: `storageKey` `cosasimangia-auth-check`, `persistSession: false`,
  `autoRefreshToken: false`, `detectSessionInUrl: false`, archivio in memoria.
- Comandi dalla radice del worktree `/Users/fedfol/Projects/meal_planner_2/.worktrees/password`.
  I test web si lanciano con `npm test -w web -- <file>`.
- Commit piccoli in italiano, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Cinque casi che la spec implica e che i test dei task coprono esplicitamente:

1. **Doppio invio** (Invio premuto due volte, doppio tocco sull'iPhone): una sola chiamata a
   `changePassword` → test nel Task 3.
2. **Cambio di lingua dopo un errore**: il messaggio segue la lingua nuova, perché si conserva
   il motivo e non il testo → test nel Task 3.
3. **Password incollata con spazi o lettere accentate**: gli spazi restano, «è» conta come un
   carattere, oltre 72 byte errore sul campo invece di un errore generico del server → test
   nel Task 1.
4. **Passo 3 fallito dopo una verifica riuscita**: la sessione del dispositivo resta identica
   e la sessione di prova non resta sul server → test nei Task 2 e 4.
5. **Client di prova che disturba il dispositivo**: nessun evento, nessuna scrittura,
   nessun `BroadcastChannel` → test nel Task 2 con il client vero di supabase-js.

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
/** bcrypt reads at most 72 bytes: Supabase refuses longer passwords with a generic error. */
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

### Task 2: `changePassword` nell'interfaccia di autenticazione

**File:**
- Modifica: `web/src/auth/backend.ts` (tipi, metodo nell'interfaccia, modalità finta)
- Modifica: `web/src/auth/supabaseBackend.ts`
- Modifica: `web/src/test/stubBackend.ts`
- Test: `web/src/auth/supabaseBackend.test.ts`, nuovo `web/src/auth/checkClient.test.ts`

**Interfacce:**
- Produce, in `backend.ts`:
  ```ts
  export type ChangePasswordFailure =
    | 'current_invalid' | 'weak_length' | 'weak_characters' | 'same_password'
    | 'session_expired' | 'rate_limited' | 'network' | 'unknown';
  export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };
  // in AuthBackend:
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
  ```
- Produce, in `supabaseBackend.ts`:
  ```ts
  export const CHECK_STORAGE_KEY = 'cosasimangia-auth-check';
  export type CheckClient = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signOut'>;
  export function createCheckClient(url: string, publishableKey: string, fetchImpl?: typeof fetch): CheckClient;
  export function changePasswordFailure(error: { code?: string; status?: number; name?: string; reasons?: string[] }, step: 'verify' | 'update'): ChangePasswordFailure;
  // AuthClient gains 'updateUser'; deps gains createCheckClient?: () => CheckClient
  ```
- Produce, in `stubBackend.ts`: `nextChangePassword: ChangePasswordResult`,
  `changePasswordCalls: { current: string; next: string }[]`, `holdChangePassword(): (result: ChangePasswordResult) => void`.

- [ ] **Passo 1: test della mappatura e dei passi, che falliscono**

In `supabaseBackend.test.ts`: aggiungi `updateUser` al client finto di `setup` e un
`createCheckClient` iniettabile. Sostituisci l'intestazione di `setup` con questa versione
(il resto del file resta uguale):

```ts
import { AuthRetryableFetchError, AuthSessionMissingError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY, changePasswordFailure, createSupabaseBackend, signInFailure, type AuthClient, type CheckClient, type OAuthApi } from './supabaseBackend';

const deviceSession = { user: { id: 'u1', email: 'anna@example.com' }, access_token: 'device-token' };

function setup(overrides: Partial<Record<keyof AuthClient, unknown>> = {}, checkOverrides: Partial<Record<keyof CheckClient, unknown>> = {}) {
  let listener: Listener = () => {};
  const calls: string[] = [];
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: {} }, error: null })),
    updateUser: vi.fn(async () => {
      calls.push('update');
      return { data: { user: deviceSession.user }, error: null };
    }),
    ...overrides
  };
  const check = {
    signInWithPassword: vi.fn(async () => {
      calls.push('verify');
      return { data: {}, error: null };
    }),
    signOut: vi.fn(async () => {
      calls.push('close-check');
      return { error: null };
    }),
    ...checkOverrides
  };
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
  const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', {
    auth: auth as unknown as AuthClient,
    createCheckClient: () => check as unknown as CheckClient,
    storage
  });
  return { auth, check, calls, stored, backend, emit: (event: string, session: Parameters<Listener>[1]) => listener(event, session) };
}
const signedIn = { getSession: vi.fn(async () => ({ data: { session: deviceSession }, error: null })) };
```

Poi aggiungi in fondo al `describe('supabase backend', …)`:

```ts
  it('maps password change errors to our reasons', () => {
    expect(changePasswordFailure({ code: 'invalid_credentials', status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'current_password_mismatch', status: 400 }, 'update')).toBe('current_invalid');
    expect(changePasswordFailure(new AuthWeakPasswordError('weak', 422, ['characters']), 'update')).toBe('weak_characters');
    expect(changePasswordFailure(new AuthWeakPasswordError('weak', 422, ['length']), 'update')).toBe('weak_length');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['pwned'] }, 'update')).toBe('weak_length');
    expect(changePasswordFailure({ code: 'same_password', status: 422 }, 'update')).toBe('same_password');
    expect(changePasswordFailure(new AuthSessionMissingError(), 'update')).toBe('session_expired');
    expect(changePasswordFailure({ status: 401 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'session_not_found', status: 403 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'refresh_token_not_found', status: 400 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'over_request_rate_limit', status: 429 }, 'verify')).toBe('rate_limited');
    expect(changePasswordFailure({ status: 429 }, 'update')).toBe('rate_limited');
    expect(changePasswordFailure(new AuthRetryableFetchError('offline', 0), 'verify')).toBe('network');
    expect(changePasswordFailure({ status: 0 }, 'update')).toBe('network');
    expect(changePasswordFailure({ status: 400 }, 'update')).toBe('unknown');
    expect(changePasswordFailure({ status: 500 }, 'update')).toBe('unknown');
  });
  it('checks the current password apart, closes that check, then changes it on this device', async () => {
    const { auth, check, calls, backend } = setup(signedIn);
    expect(await backend.changePassword('old-password', 'new-password')).toEqual({ ok: true });
    expect(calls).toEqual(['verify', 'close-check', 'update']);
    expect(check.signInWithPassword).toHaveBeenCalledWith({ email: 'anna@example.com', password: 'old-password' });
    expect(check.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password', current_password: 'old-password' });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it('changes nothing when the current password is wrong', async () => {
    const { auth, backend } = setup(signedIn, {
      signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: 'invalid_credentials', status: 400, name: 'AuthApiError' } }))
    });
    expect(await backend.changePassword('wrong', 'new-password')).toEqual({ ok: false, reason: 'current_invalid' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('goes on when closing the check session fails', async () => {
    const { auth, backend } = setup(signedIn, { signOut: vi.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })) });
    expect(await backend.changePassword('old-password', 'new-password')).toEqual({ ok: true });
    expect(auth.updateUser).toHaveBeenCalled();
  });
  it('reports an expired session without any call when this device has none', async () => {
    const { check, auth, backend } = setup();
    expect(await backend.changePassword('old-password', 'new-password')).toEqual({ ok: false, reason: 'session_expired' });
    expect(check.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('leaves the device session as it was when the change itself fails', async () => {
    const { auth, stored, backend } = setup({
      ...signedIn,
      updateUser: vi.fn(async () => ({ data: { user: null }, error: { code: 'same_password', status: 422, name: 'AuthApiError' } }))
    });
    stored.set(AUTH_STORAGE_KEY, JSON.stringify(deviceSession));
    const before = new Map(stored);
    expect(await backend.changePassword('old-password', 'old-password!')).toEqual({ ok: false, reason: 'same_password' });
    expect(stored).toEqual(before);
    expect((await auth.getSession()).data.session).toBe(deviceSession);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
```

- [ ] **Passo 2: test dell'isolamento con il client vero, che fallisce**

`web/src/auth/checkClient.test.ts`. Usa supabase-js vero con un `fetch` finto: prova che il
client di prova non tocca archivio, eventi e canale del dispositivo.

```ts
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, CHECK_STORAGE_KEY, createCheckClient } from './supabaseBackend';

const URL_ = 'http://127.0.0.1:54321';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'anna@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-13T00:00:00Z' };
const tokenAnswer = () => Response.json({ access_token: 'check-token', refresh_token: 'check-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });

/** Answers sign-in and logout like Supabase Auth; records the paths. */
function fakeAuthFetch() {
  const paths: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    paths.push(`${url.pathname}${url.search}`);
    if (url.pathname.endsWith('/token')) return tokenAnswer();
    if (url.pathname.endsWith('/logout')) return new Response(null, { status: 204 });
    return new Response('{}', { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, paths };
}

afterEach(() => localStorage.clear());

describe('check client', () => {
  it('uses its own storage key, never the device one', () => {
    expect(CHECK_STORAGE_KEY).not.toBe(AUTH_STORAGE_KEY);
  });
  it('signs in and out without storage, device events or a shared channel', async () => {
    // The device: a real client on the app's storage key, with a listener and its tab channel.
    const device = createClient(URL_, 'key', { auth: { storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false, detectSessionInUrl: false } });
    const deviceEvents: string[] = [];
    device.auth.onAuthStateChange((event) => void deviceEvents.push(event));
    const channelMessages: unknown[] = [];
    const tabs = new BroadcastChannel(AUTH_STORAGE_KEY);
    tabs.onmessage = (message) => void channelMessages.push(message.data);
    // Counts the channels opened from here on (the device opened its own above).
    const Original = globalThis.BroadcastChannel;
    let opened = 0;
    globalThis.BroadcastChannel = class extends Original {
      constructor(name: string) {
        super(name);
        opened += 1;
      }
    };
    await new Promise((resolve) => setTimeout(resolve, 0));
    deviceEvents.length = 0;
    const storageBefore = { ...localStorage };

    const { fetchImpl, paths } = fakeAuthFetch();
    const check = createCheckClient(URL_, 'key', fetchImpl);
    const signedIn = await check.signInWithPassword({ email: 'anna@example.com', password: 'old-password' });
    expect(signedIn.error).toBeNull();
    expect((await check.signOut({ scope: 'local' })).error).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(paths).toEqual(['/auth/v1/token?grant_type=password', '/auth/v1/logout?scope=local']);
    expect(opened).toBe(0);
    expect({ ...localStorage }).toEqual(storageBefore);
    expect(deviceEvents).toEqual([]);
    expect(channelMessages).toEqual([]);
    tabs.close();
    globalThis.BroadcastChannel = Original;
  });
});
```

- [ ] **Passo 3: verificare che falliscano**

Esegui: `npm test -w web -- src/auth/supabaseBackend.test.ts src/auth/checkClient.test.ts`
Atteso: FAIL (`changePasswordFailure`, `createCheckClient`, `CHECK_STORAGE_KEY` non esportati;
`updateUser` non nel tipo).

- [ ] **Passo 4: tipi e modalità finta in `backend.ts`**

Dopo `SignInResult` aggiungi:

```ts
/** Outcomes of a password change (spec «Cambio della password», table of errors). */
export type ChangePasswordFailure =
  | 'current_invalid'
  | 'weak_length'
  | 'weak_characters'
  | 'same_password'
  | 'session_expired'
  | 'rate_limited'
  | 'network'
  | 'unknown';
export type ChangePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure };
```

In `AuthBackend`, dopo `signOut`:

```ts
  /** Checks `current` with a throwaway sign-in, then sets `next` on this device's session; other sessions end. */
  changePassword(current: string, next: string): Promise<ChangePasswordResult>;
```

In `createFakeBackend`, dopo `signOut`: `changePassword: async () => ({ ok: true }),`.

- [ ] **Passo 5: implementazione Supabase**

In `supabaseBackend.ts`:

```ts
import type { AgentAuthorization, AuthBackend, AuthorizationFailure, AuthorizationResult, AuthUser, ChangePasswordFailure, SignInFailure } from './backend';

export const AUTH_STORAGE_KEY = 'cosasimangia-auth';
/** The throwaway client that checks the current password: never the device's key, storage or tab channel. */
export const CHECK_STORAGE_KEY = 'cosasimangia-auth-check';
export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut' | 'refreshSession' | 'updateUser'>;
export type CheckClient = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signOut'>;

/** No persistence (so no BroadcastChannel), memory storage, own key: invisible to the device's session. */
export function createCheckClient(url: string, publishableKey: string, fetchImpl?: typeof fetch): CheckClient {
  const memory = new Map<string, string>();
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: CHECK_STORAGE_KEY,
      storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) }
    },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {})
  }).auth;
}

type AuthErrorLike = { code?: string; status?: number; name?: string; reasons?: string[] };

/** Supabase Auth answers (gotrue v2.197.0) to our reasons; `verify` is the throwaway sign-in. */
export function changePasswordFailure(error: AuthErrorLike, step: 'verify' | 'update'): ChangePasswordFailure {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited';
  if (error.code === 'current_password_mismatch') return 'current_invalid';
  if (step === 'verify' && (error.code === 'invalid_credentials' || error.status === 400)) return 'current_invalid';
  if (error.code === 'weak_password') return error.reasons?.includes('characters') ? 'weak_characters' : 'weak_length';
  if (error.code === 'same_password') return 'same_password';
  if (
    error.name === 'AuthSessionMissingError' ||
    error.status === 401 ||
    error.code === 'session_not_found' ||
    error.code === 'refresh_token_not_found'
  )
    return 'session_expired';
  return 'unknown';
}
```

`AuthWeakPasswordError` di supabase-js ha `code: 'weak_password'` e `reasons`: verificalo nel
test del Passo 1; se `code` mancasse, aggiungi `|| error.name === 'AuthWeakPasswordError'`.

Nella firma di `createSupabaseBackend` aggiungi `createCheckClient?: () => CheckClient` a
`deps` e, dopo `const oauth = …`:

```ts
  const newCheckClient = deps.createCheckClient ?? (() => createCheckClient(url, publishableKey));
```

Nel valore restituito, dopo `signOut`:

```ts
    async changePassword(current, next) {
      const { data } = await auth.getSession();
      const email = data.session?.user.email;
      if (!email) return { ok: false, reason: 'session_expired' };
      // 1. The current password, checked apart: the device's session and its listeners see nothing.
      const check = newCheckClient();
      const verified = await check.signInWithPassword({ email, password: current });
      if (verified.error) return { ok: false, reason: changePasswordFailure(verified.error, 'verify') };
      // 2. Close the check session; if that fails, step 3 ends it with the other sessions.
      await check.signOut({ scope: 'local' }).catch(() => undefined);
      // 3. The change, on this device's session; the server checks current_password too when the project asks it.
      const { error } = await auth.updateUser({ password: next, current_password: current });
      return error ? { ok: false, reason: changePasswordFailure(error, 'update') } : { ok: true };
    },
```

- [ ] **Passo 6: stub dei test**

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

- [ ] **Passo 7: verificare che passino, typecheck compreso**

Esegui: `npm test -w web -- src/auth/ && npm run typecheck -w web`
Atteso: PASS; nessun errore di tipo (anche gli altri `AuthBackend` scritti a mano nei test,
se ce ne sono: `grep -rn "mode: 'supabase'" web/src --include=*.ts*` e aggiungi
`changePassword` dove manca).

- [ ] **Passo 8: commit**

```bash
git add web/src/auth web/src/test/stubBackend.ts
git commit -m "Cambio password: changePassword nell'autenticazione, con client di prova isolato"
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
  `PASSWORD_MIN_LENGTH` (Task 1); `AuthBackend.changePassword`, `ChangePasswordFailure`;
  `StubBackend.nextChangePassword`, `changePasswordCalls`, `holdChangePassword` (Task 2).
- Produce: rotta `/profile/password`, componente `PasswordPage`, `IconName` con `'lock'`.

- [ ] **Passo 1: testi**

`web/src/i18n/messages/password.ts` (tono e parole come `auth.ts` e `profile.ts`; ritocchi
ammessi senza cambiare il senso):

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
  'password.field.required': 'Campo obbligatorio.',
  'password.field.too_short': 'Servono almeno {min} caratteri.',
  'password.field.too_long': 'La password è troppo lunga.',
  'password.field.mismatch': 'Le due password non coincidono.',
  'password.field.same_as_current': 'La nuova password è uguale a quella attuale.',
  'password.error.current_invalid': 'La password attuale non è corretta.',
  'password.error.weak_length': 'La nuova password è troppo corta.',
  'password.error.weak_characters': 'La nuova password deve contenere altri tipi di caratteri (lettere, numeri o simboli).',
  'password.error.same_password': 'La nuova password è uguale a quella attuale.',
  'password.error.session_expired': 'La sessione è scaduta: accedi di nuovo e riprova.',
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
  'password.field.required': 'Required.',
  'password.field.too_short': 'At least {min} characters are needed.',
  'password.field.too_long': 'The password is too long.',
  'password.field.mismatch': 'The two passwords don’t match.',
  'password.field.same_as_current': 'The new password is the same as the current one.',
  'password.error.current_invalid': 'The current password is wrong.',
  'password.error.weak_length': 'The new password is too short.',
  'password.error.weak_characters': 'The new password needs other kinds of characters (letters, numbers or symbols).',
  'password.error.same_password': 'The new password is the same as the current one.',
  'password.error.session_expired': 'Your session has expired: sign in again and retry.',
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
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_USER, type ChangePasswordFailure } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const field = (label: string) => screen.findByLabelText(label) as Promise<HTMLInputElement>;
async function fill(current: string, next: string, confirm = next) {
  fireEvent.change(await field('Password attuale'), { target: { value: current } });
  fireEvent.change(await field('Nuova password'), { target: { value: next } });
  fireEvent.change(await field('Conferma la nuova password'), { target: { value: confirm } });
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));

describe('password page', () => {
  it('lets password managers fill and save the fields', async () => {
    renderApp('/profile/password', { backend: createStubBackend(DEMO_USER) });
    expect((await field('Password attuale')).autocomplete).toBe('current-password');
    expect((await field('Nuova password')).autocomplete).toBe('new-password');
    expect((await field('Conferma la nuova password')).autocomplete).toBe('new-password');
    expect(screen.getByText(/gli altri dispositivi e gli agenti collegati dovranno accedere di nuovo/)).toBeTruthy();
    expect(screen.getByText('Almeno 8 caratteri.')).toBeTruthy();
  });
  it('shows field errors without sending anything', async () => {
    const backend = createStubBackend(DEMO_USER);
    renderApp('/profile/password', { backend });
    await fill('old-password', 'short', 'other');
    submit();
    expect(await screen.findByText('Servono almeno 8 caratteri.')).toBeTruthy();
    expect(screen.getByText('Le due password non coincidono.')).toBeTruthy();
    expect((await field('Nuova password')).getAttribute('aria-invalid')).toBe('true');
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
    ['same_password', 'La nuova password è uguale a quella attuale.'],
    ['session_expired', 'La sessione è scaduta: accedi di nuovo e riprova.'],
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
    expect((await field('Password attuale')).getAttribute('aria-invalid')).toBe('true');
  });
  it('waits for the connection', async () => {
    renderApp('/profile/password', { backend: createStubBackend(DEMO_USER) });
    await field('Password attuale');
    act(() => setOnline(false));
    expect(await screen.findByText('Serve la connessione per cambiare la password.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambia password' })).toHaveProperty('disabled', true);
  });
  it('speaks British English, and an error follows a change of language', async () => {
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

Per «un errore segue il cambio di lingua»: lo stato conserva il motivo (`ChangePasswordFailure`)
e il testo si calcola a ogni render con `t`. Se `renderApp` offre un modo di cambiare lingua
nello stesso albero (vedi `test/LanguageSwitch.tsx` e come lo usano altri test con `extra`),
estendi l'ultimo test: errore in inglese, cambio a it-IT, poi
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
.fieldError { margin: 0; color: var(--danger); font-size: 0.875rem; font-weight: 400; }
.hint { margin: 0; color: var(--muted); font-size: 0.875rem; font-weight: 400; }
```

`PasswordPage.tsx`:

```tsx
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import type { ChangePasswordFailure } from '../../auth/backend';
import { PASSWORD_MIN_LENGTH, validatePasswordChange, type PasswordField, type PasswordFieldErrors } from '../../auth/passwordChange';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from './BackToProfile';
import styles from './PasswordPage.module.css';

const EMPTY: Record<PasswordField, string> = { current: '', next: '', confirm: '' };
const AUTOCOMPLETE: Record<PasswordField, string> = { current: 'current-password', next: 'new-password', confirm: 'new-password' };
/** Server outcomes shown on a field; the others go above the button. */
const FIELD_OF: Partial<Record<ChangePasswordFailure, PasswordField>> = {
  current_invalid: 'current',
  weak_length: 'next',
  weak_characters: 'next',
  same_password: 'next'
};

/** Password change (spec «Cambio della password»): checked here, sent to Supabase Auth only. */
export function PasswordPage() {
  const t = useT();
  const { backend } = useAuth();
  const online = useOnline();
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  // The reason, not the text: a change of language translates it again.
  const [failure, setFailure] = useState<ChangePasswordFailure | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap or Enter before React re-renders must not send twice.
  const sending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !online) return;
    const errors = validatePasswordChange(values);
    setFieldErrors(errors);
    setFailure(null);
    setDone(false);
    if (Object.keys(errors).length > 0) return;
    sending.current = true;
    setBusy(true);
    const result = await backend.changePassword(values.current, values.next);
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      setValues(EMPTY);
      setDone(true);
    } else setFailure(result.reason);
  }

  const serverField = failure ? FIELD_OF[failure] : undefined;
  const messageOf = (name: PasswordField): string | null => {
    const local = fieldErrors[name];
    if (local) return t(`password.field.${local}`, { min: PASSWORD_MIN_LENGTH });
    return failure && serverField === name ? t(`password.error.${failure}`) : null;
  };
  const input = (name: PasswordField, label: string, hint?: string) => {
    const message = messageOf(name);
    const describedBy = [message && `password-${name}-error`, hint && `password-${name}-hint`].filter(Boolean).join(' ') || undefined;
    return (
      <label className="field">
        {label}
        <input
          type="password"
          name={name}
          autoComplete={AUTOCOMPLETE[name]}
          value={values[name]}
          disabled={busy}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
        />
        {hint && <span id={`password-${name}-hint`} className={styles.hint}>{hint}</span>}
        {message && <span id={`password-${name}-error`} className={styles.fieldError} role="alert">{message}</span>}
      </label>
    );
  };

  return (
    <section className="secondary-view app-view" aria-labelledby="password-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('password.title')} titleId="password-title" />
        <form className="settings-card" onSubmit={submit} noValidate>
          {input('current', t('password.current'))}
          {input('next', t('password.next'), t('password.hint', { min: PASSWORD_MIN_LENGTH }))}
          {input('confirm', t('password.confirm'))}
          <p className="meta-line">{t('password.warning')}</p>
          {failure && !serverField && <p className="form-error" role="alert">{t(`password.error.${failure}`)}</p>}
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

Se `t` rifiuta le chiavi composte (`password.field.${…}`) per il tipo `MessageKey`, usa un
cast come fanno `LoginPage` (`t(\`auth.error.${failure}\`)`) e `PreferencesPage`: guarda come
sono tipizzate lì e fai lo stesso.

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

Il test del Passo 2 cerca il link con `/Cambia password/`: il nome accessibile comprende anche
il suggerimento, va bene.

- [ ] **Passo 7: verificare che passino**

Esegui: `npm test -w web -- src/routes/ src/auth/ && npm run typecheck -w web`
Atteso: PASS. Poi tutta la suite web (`npm test -w web`): la riga nuova non deve rompere altri
test del Profilo che contano le righe; se uno lo fa, aggiorna l'attesa e annotalo nel commit.

- [ ] **Passo 8: commit**

```bash
git add web/src
git commit -m "Cambio password: pagina /profile/password e voce nel Profilo"
```

---

### Task 4: Minimo locale a 8 e prova sullo stack locale

**File:**
- Modifica: `supabase/config.toml` (`minimum_password_length`)
- Crea: `web/src/auth/changePassword.stack.test.ts`
- Crea: `scripts/password/password-stack.sh`
- Modifica: `.github/workflows/ci.yml`

**Interfacce:**
- Consuma: `createSupabaseBackend(url, key, deps)` con `changePassword` (Task 2).
- Produce: lo script `scripts/password/password-stack.sh`, lanciabile in locale e in CI.

- [ ] **Passo 1: configurazione locale**

In `supabase/config.toml`, riga di `minimum_password_length`:

```toml
# 8, as the web app's minimum (spec «Cambio della password»); production: optional dashboard step.
minimum_password_length = 8
```

Riavvia lo stack locale del worktree (`supabase stop && supabase start`, con il wrapper di
Podman se serve) e verifica: `curl -s -X POST "$API_URL/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d '{"email":"short@example.test","password":"1234567"}'`
→ `weak_password`.

- [ ] **Passo 2: test sullo stack, che fallisce prima della configurazione o dello script**

`web/src/auth/changePassword.stack.test.ts`. Gira solo con le variabili dello stack (dallo
script del Passo 3); senza, si salta come le suite del database del server.

```ts
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseBackend } from './supabaseBackend';

const URL_ = process.env.STACK_SUPABASE_URL;
const KEY = process.env.STACK_SUPABASE_PUBLISHABLE_KEY;
const DB = process.env.STACK_DB_URL;
const LOCAL = /^(http|postgresql):\/\/(postgres:postgres@)?(127\.0\.0\.1|localhost)[:/]/;

describe.skipIf(!URL_ || !KEY || !DB)('password change on the local stack', () => {
  if (URL_ && DB) for (const url of [URL_, DB]) if (!LOCAL.test(url)) throw new Error(`Local stack only: ${url}`);
  const sql = postgres(DB!, { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());
  beforeEach(() => localStorage.clear());

  /** A fresh person (local sign-ups are on), so the seed users keep password123. */
  async function person(password = 'first-password') {
    const email = `password-${crypto.randomUUID()}@example.test`;
    const anon = createClient(URL_!, KEY!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({ email, password });
    if (error || !data.user) throw error ?? new Error('sign-up');
    return { email, id: data.user.id };
  }
  /** This device: the app's backend, signed in through its own sign-in. */
  async function device(email: string, password: string) {
    const backend = createSupabaseBackend(URL_!, KEY!, { storage: localStorage });
    expect(await backend.signIn(email, password)).toEqual({ ok: true });
    return backend;
  }
  const canSignIn = async (email: string, password: string) =>
    !(await createClient(URL_!, KEY!, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password })).error;
  const sessions = async (userId: string) => Number((await sql`select count(*)::int as n from auth.sessions where user_id = ${userId}`)[0]!.n);

  it('changes the password and keeps this device signed in', async () => {
    const { email } = await person();
    const backend = await device(email, 'first-password');
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: true });
    expect(await canSignIn(email, 'second-password')).toBe(true);
    expect(await canSignIn(email, 'first-password')).toBe(false);
    expect(await backend.refresh()).toMatchObject({ kind: 'ok' });
  });
  it('refuses a wrong current password and changes nothing', async () => {
    const { email } = await person();
    const backend = await device(email, 'first-password');
    expect(await backend.changePassword('not-the-password', 'second-password')).toEqual({ ok: false, reason: 'current_invalid' });
    expect(await canSignIn(email, 'first-password')).toBe(true);
  });
  it('lets the server refuse a weak or unchanged password', async () => {
    const { email } = await person();
    const backend = await device(email, 'first-password');
    // Below the local minimum of 8: the server's answer, without the form's own check.
    expect(await backend.changePassword('first-password', 'abc123')).toEqual({ ok: false, reason: 'weak_length' });
    expect(await backend.changePassword('first-password', 'first-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(await canSignIn(email, 'first-password')).toBe(true);
  });
  it('reports an expired session when this device’s session was closed elsewhere', async () => {
    const { email, id } = await person();
    const backend = await device(email, 'first-password');
    await sql`delete from auth.sessions where user_id = ${id}`;
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: false, reason: 'session_expired' });
    expect(await canSignIn(email, 'first-password')).toBe(true);
  });
  it('ends the other web sessions and leaves no check session behind', async () => {
    const { email, id } = await person();
    const other = createClient(URL_!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: otherSignIn } = await other.auth.signInWithPassword({ email, password: 'first-password' });
    const backend = await device(email, 'first-password');
    expect(await backend.changePassword('first-password', 'second-password')).toEqual({ ok: true });
    expect((await other.auth.refreshSession({ refresh_token: otherSignIn.session!.refresh_token })).error).not.toBeNull();
    expect(await sessions(id)).toBe(1);
  });
  it('leaves no check session behind when the change itself fails', async () => {
    const { email, id } = await person();
    const backend = await device(email, 'first-password');
    expect(await sessions(id)).toBe(1);
    expect(await backend.changePassword('first-password', 'first-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(await sessions(id)).toBe(1);
  });
});
```

Note per chi esegue: `jsdom` ha `localStorage` grazie a `--no-experimental-webstorage` già
nella configurazione di Vitest; `fetch` è quello di Node. Se per la sessione cancellata a
mano Supabase risponde con un codice diverso da quelli della tabella, **non** allargare la
mappatura a caso: annota il codice reale, aggiorna tabella della spec e `changePasswordFailure`
con un test unitario, e dillo nel messaggio di stato.

- [ ] **Passo 3: script**

`scripts/password/password-stack.sh` (eseguibile, `chmod +x`):

```bash
#!/usr/bin/env bash
# scripts/password/password-stack.sh — the password change against the local stack
# (`supabase start` with supabase/config.toml). Used by CI; runnable locally.
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
  npm test -w web -- src/auth/changePassword.stack.test.ts
```

Con le tre variabili impostate la suite non si salta mai, quindi in CI un fallimento non
passa inosservato. Controllo una tantum: togli `STACK_DB_URL` dallo script, Vitest deve
mostrare la suite «skipped»; poi rimettila.

- [ ] **Passo 4: verificare sullo stack locale**

Esegui: `scripts/password/password-stack.sh` (con lo stack del worktree avviato)
Atteso: 6 test PASS. Poi `npm test -w web` senza variabili: la suite risulta saltata.

- [ ] **Passo 5: CI**

In `.github/workflows/ci.yml`, subito dopo `- run: scripts/oauth/agents-e2e.sh`:

```yaml
      # Password change on the local stack: wrong current password, weak, expired session, other sessions.
      - run: scripts/password/password-stack.sh
```

- [ ] **Passo 6: commit**

```bash
git add supabase/config.toml web/src/auth/changePassword.stack.test.ts scripts/password .github/workflows/ci.yml
git commit -m "Cambio password: minimo locale a 8 e prova sullo stack locale in CI"
```

---

### Task 5: Prova che il cambio chiude gli agenti

**File:**
- Modifica: `scripts/oauth/agents-e2e.mjs` (nuovo blocco 6, prima di `process.exit`)

**Interfacce:**
- Consuma: gli helper già nello script (`register`, `connect`, `refresh`, `channelEverywhere`,
  `refusedEverywhere`, `refusedGrant`, `is`, `check`, `read`, `AUTH`, `KEY`).
- Produce: l'esito della prova, che conferma o corregge l'avviso della pagina.

Il cambio qui passa da `PUT /auth/v1/user` con `current_password`, la stessa richiesta che fa
`updateUser` al passo 3 di `changePassword`: la chiusura delle sessioni la decide Supabase su
quella richiesta.

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
	const clientP = await register('E2E agent P');
	const agent = await connect(clientP, web.access_token);
	await channelEverywhere('agent P before the password change', agent.access_token, 'mcp');
	const changed = await read(await fetch(`${AUTH}/user`, {
		method: 'PUT',
		headers: { apikey: KEY, authorization: `Bearer ${web.access_token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ password: 'second-password', current_password: 'first-password' }),
	}));
	is('password changed from the web', changed.status, 200);
	await refusedEverywhere('agent P after the password change', agent.access_token);
	refusedGrant('refresh token of agent P refused after the password change', await refresh(clientP, agent.refresh_token));
	await channelEverywhere('web session that changed the password', web.access_token, 'web');
}
```

- [ ] **Passo 2: eseguire la prova**

Esegui: `npm run build -w web && scripts/oauth/agents-e2e.sh` (stack del worktree avviato)
Atteso: tutte le righe `ok`, comprese le nuove del blocco 6.

- [ ] **Passo 3: se la prova smentisce la spec**

Se l'agente resta attivo dopo il cambio: **fermati**. Togli «e gli agenti collegati» da
`password.warning` e `password.done` (it e en) e dai test del Task 3, rovescia le attese del
blocco 6 per documentare il comportamento reale (`channelEverywhere` invece di
`refusedEverywhere`), aggiorna nella spec le sezioni «Cosa fa Supabase Auth», «Scelte del
brainstorming» punto 3 e «Decisioni da riportare», e scrivi `STATO: DOMANDA` al coordinatore
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

Stack locale del worktree avviato; Worker con `wrangler dev` come in `server/README` o nello
script degli agenti; SPA con `npm run dev -w web` (porta 5174). Crea un utente con
`supabase` locale (`POST /auth/v1/signup`, password `first-password`) e una famiglia se la
pagina del Profilo la richiede per mostrarsi (vedi `supabase/seed.sql` per gli utenti di
prova: in alternativa usa `anna@example.test` / `password123` e, alla fine, rimetti
`password123` cambiandola dalla pagina stessa).

- [ ] **Passo 2: percorso con agent-browser**

Con la skill `agent-browser`, prima a 390×844 e poi a 1280×800:
1. accesso, Profilo, riga «Cambia password» visibile con il lucchetto;
2. pagina vuota: screenshot;
3. invio con nuova corta e conferma diversa: errori sotto i campi, screenshot;
4. password attuale sbagliata: errore sul campo, screenshot;
5. cambio riuscito: messaggio, campi vuoti, ancora dentro (torna al Profilo), screenshot;
6. offline (emulazione offline del browser): riga e pulsante disattivato, screenshot;
7. esci e rientra con la nuova password.

Controlla: niente scroll orizzontale a 390 px, campi alti almeno 44 px, testi del tono delle
altre pagine del Profilo (`design/design.md`, `design/percorsi.md`). Se il Mac va in standby,
segui la nota sulle schermate (caffeinate e sessione nuova).

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
realizzate (1, 7, 13), il passo facoltativo in dashboard da portare all'utente. Poi
`STATO: PR_APERTA <url>`.
