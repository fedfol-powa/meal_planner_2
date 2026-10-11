import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, createSupabaseBackend, signInFailure, type AuthClient } from './supabaseBackend';

type Listener = (event: string, session: { user: { id: string; email?: string } } | null) => void;

function setup(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  let listener: Listener = () => {};
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: {} }, error: null })),
    ...overrides
  };
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
  const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', { auth: auth as unknown as AuthClient, storage });
  return { auth, stored, backend, emit: (event: string, session: Parameters<Listener>[1]) => listener(event, session) };
}

describe('supabase backend', () => {
  it('maps sign-in errors to our reasons', () => {
    expect(signInFailure({ code: 'invalid_credentials', status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(signInFailure({ status: 500 })).toBe('unknown');
  });
  it('signs out of this device only and leaves nothing stored even when the service fails', async () => {
    const { auth, stored, backend } = setup({ signOut: vi.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })) });
    stored.set(AUTH_STORAGE_KEY, '{}');
    stored.set(`${AUTH_STORAGE_KEY}-code-verifier`, 'x');
    await expect(backend.signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stored.size).toBe(0);
  });
  it('tells a verified session, an unverifiable one and no session apart', async () => {
    const user = { id: 'u1', email: 'anna@example.com' };
    const signedIn = setup({ getSession: vi.fn(async () => ({ data: { session: { user } }, error: null })) });
    expect(await signedIn.backend.check()).toEqual({ status: 'signedIn', user });
    const offline = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })) });
    offline.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await offline.backend.check()).toEqual({ status: 'unverified', user });
    const refused = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400 } })) });
    refused.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await refused.backend.check()).toEqual({ status: 'signedOut' });
    expect(await setup().backend.check()).toEqual({ status: 'signedOut' });
  });
  it('reports sign-ins, sign-outs and new tokens with their kind, ignoring empty initial events', () => {
    const { backend, emit } = setup();
    const listener = vi.fn();
    backend.onChange(listener);
    emit('INITIAL_SESSION', null);
    expect(listener).not.toHaveBeenCalled();
    const user = { id: 'u1', email: 'a@example.com' };
    emit('SIGNED_IN', { user });
    expect(listener).toHaveBeenLastCalledWith({ type: 'SIGNED_IN', user });
    emit('TOKEN_REFRESHED', { user });
    expect(listener).toHaveBeenLastCalledWith({ type: 'TOKEN_REFRESHED', user });
    emit('SIGNED_OUT', null);
    expect(listener).toHaveBeenLastCalledWith({ type: 'SIGNED_OUT', user: null });
  });
  it('renews the session once on request', async () => {
    expect(await setup().backend.refresh()).toBe(true);
    const refused = setup({ refreshSession: vi.fn(async () => ({ data: { session: null }, error: { status: 400 } })) });
    expect(await refused.backend.refresh()).toBe(false);
  });
});
