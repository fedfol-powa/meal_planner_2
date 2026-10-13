import { AuthClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { sessionIdOf as readSessionId } from '../auth/passwordChangeRequests';
import { AUTH_OPTIONS, createSupabaseBackend } from '../auth/supabaseBackend';

/** The local stack, from scripts/password/password-stack.sh; null outside it (suites skip). */
const url = process.env.STACK_SUPABASE_URL;
const key = process.env.STACK_SUPABASE_PUBLISHABLE_KEY;
const db = process.env.STACK_DB_URL;
/** Sign-ups are off locally too (spec W9): people are created with the admin API. */
const secret = process.env.STACK_SUPABASE_SECRET_KEY;
const LOCAL = /^(http|postgresql):\/\/(postgres:postgres@)?(127\.0\.0\.1|localhost)[:/]/;
export const stack = url && key && db && secret ? { url, key, db, secret } : null;
if (stack) for (const target of [stack.url, stack.db]) if (!LOCAL.test(target)) throw new Error(`Local stack only: ${target}`);

export interface StackPerson { email: string; id: string; session: { access_token: string; refresh_token: string; expires_at: number; user: unknown } }

export const sessionIdOf = (accessToken: string): string => readSessionId(accessToken)!;

/**
 * The Auth client of the fixtures: the app's options and the headers supabase-js gives its own
 * Auth client, without the rest of createClient (Realtime's socket would leave listeners on
 * window that dispose() cannot reach). Disposed after each test.
 */
export function createTestAuthClient(base: string, apikey: string) {
  return new AuthClient({ url: `${base}/auth/v1`, headers: { Authorization: `Bearer ${apikey}`, apikey }, ...AUTH_OPTIONS });
}

export function createStack() {
  if (!stack) throw new Error('No local stack');
  const { url: base, key: apikey, db: dbUrl, secret } = stack;
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  const created: string[] = [];
  const clients: ReturnType<typeof createTestAuthClient>[] = [];
  const headers = { apikey, 'content-type': 'application/json' };
  const post = (path: string, body: object, token?: string) =>
    fetch(`${base}/auth/v1${path}`, { method: 'POST', headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers, body: JSON.stringify(body) });

  return {
    sql,
    /** The app's real backend on this device's storage; its Auth client goes with `disposeClients`. */
    backend(options: { fetch?: typeof fetch } = {}) {
      const auth = createTestAuthClient(base, apikey);
      clients.push(auth);
      return createSupabaseBackend(base, apikey, { auth, oauth: auth.oauth, storage: localStorage, ...options });
    },
    /** After each test, before the storage is reused: no listeners or renewal timers left behind. */
    async disposeClients() {
      await Promise.all(clients.splice(0).map((client) => client.dispose()));
    },
    /** A fresh person, created with the admin API (sign-ups are off locally too), then signed in on this device. */
    async person(password = 'first-password'): Promise<StackPerson> {
      const email = `password-${crypto.randomUUID()}@example.test`;
      const made = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: secret, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, email_confirm: true })
      });
      if (!made.ok) throw new Error(`admin create: ${made.status}`);
      const response = await post('/token?grant_type=password', { email, password });
      const session = (await response.json()) as StackPerson['session'] & { user: { id: string } };
      if (!response.ok || !session.access_token) throw new Error(`sign-in: ${response.status}`);
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
