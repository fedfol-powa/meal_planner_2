import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStack, sessionIdOf, stack, type StackPerson } from '../test/stack';
import { AUTH_STORAGE_KEY } from './supabaseBackend';

describe.skipIf(!stack)('password change on the local stack', () => {
  const env = stack ? createStack() : null!;
  afterAll(() => env.cleanup());
  beforeEach(() => localStorage.clear());
  afterEach(() => env.disposeClients());

  /** This device: the app's backend holding the sign-up session, as after a sign-in. */
  function device(person: StackPerson) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(person.session));
    return env.backend();
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
