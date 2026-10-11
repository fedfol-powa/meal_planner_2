import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { cacheKey, createMemoryStore, markRevoked, revokedKey } from '../api/persister';
import { queryKeys } from '../api/queries';
import { createMemoryHub } from '../test/memoryChannel';
import { createSession, persisterOf, type RenewResult } from './session';
import { readPreference, userScope, writePreference } from './localePreference';

describe('session', () => {
  it('closes once: clears the cache, deletes the stored copy and the language choice', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), { timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } });
    writePreference(userScope('a'), 'en-GB');
    const session = createSession('a', store);
    session.queryClient.setQueryData(queryKeys.me('it-IT'), { version: 'v', data: 'me' });
    await session.close();
    await session.close();
    expect(session.isClosed()).toBe(true);
    expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(store.entries.has(cacheKey('a'))).toBe(false);
    expect(readPreference(userScope('a'))).toBeNull();
    expect(await persisterOf(session)?.restoreClient()).toBeUndefined();
  });
  it('revokes a family: its views leave the cache, the others stay', () => {
    const session = createSession('a', createMemoryStore());
    session.queryClient.setQueryData(queryKeys.week('f1', '2026-10-05', 'it-IT'), { version: 'v', data: 1 });
    session.queryClient.setQueryData(queryKeys.week('f2', '2026-10-05', 'it-IT'), { version: 'v', data: 2 });
    const before = session.revision();
    session.revoke('f1');
    expect(session.isRevoked('f1')).toBe(true);
    expect(session.revision()).toBeGreaterThan(before);
    expect(session.queryClient.getQueryData(queryKeys.week('f1', '2026-10-05', 'it-IT'))).toBeUndefined();
    expect(session.queryClient.getQueryData(queryKeys.week('f2', '2026-10-05', 'it-IT'))).toBeDefined();
  });
  it('remembers only the latest request per object', () => {
    const session = createSession('a', createMemoryStore());
    const first = session.track('rating:r1');
    const second = session.track('rating:r1');
    const other = session.track('rating:r2');
    expect(session.isLatest('rating:r1', first)).toBe(false);
    expect(session.isLatest('rating:r1', second)).toBe(true);
    expect(session.isLatest('rating:r2', other)).toBe(true);
  });
});

const refused = () => new ApiError('unauthorized');
/** A call refused once with unauthorized, then answered. */
const refusedOnce = (value: string) => vi.fn().mockRejectedValueOnce(refused()).mockResolvedValue(value);

const OK: RenewResult = { kind: 'ok', userId: 'a' };
const REJECTED: RenewResult = { kind: 'rejected' };

function withRenewal() {
  let answer: (result: RenewResult) => void = () => {};
  const refresh = vi.fn(() => new Promise<RenewResult>((resolve) => (answer = resolve)));
  const end = vi.fn();
  return { refresh, end, renew: (ok: boolean | RenewResult) => answer(typeof ok === 'boolean' ? (ok ? OK : REJECTED) : ok) };
}

describe('unauthorized: one renewal per session (second review, C3)', () => {
  it('shares one renewal among concurrent refusals and repeats each call once', async () => {
    const { refresh, end, renew } = withRenewal();
    const session = createSession('a', createMemoryStore(), { refresh, end });
    const calls = [refusedOnce('one'), refusedOnce('two'), refusedOnce('three')];
    const answers = Promise.all(calls.map((run) => session.call(run)));
    await vi.waitFor(() => expect(calls.every((run) => run.mock.calls.length === 1)).toBe(true));
    renew(true);
    expect(await answers).toEqual(['one', 'two', 'three']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
  it('ends the session once when the repeated calls are refused again', async () => {
    const end = vi.fn();
    const session = createSession('a', createMemoryStore(), { refresh: async () => OK, end });
    const always = () => vi.fn().mockRejectedValue(refused());
    const results = await Promise.allSettled([session.call(always()), session.call(always())]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it('repeats at once a call that started before a renewal that already succeeded', async () => {
    const refresh = vi.fn(async () => OK);
    const session = createSession('a', createMemoryStore(), { refresh, end: vi.fn() });
    let refuseOld: (error: unknown) => void = () => {};
    const old = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (refuseOld = reject)))
      .mockResolvedValue('old');
    const slow = session.call(old);
    expect(await session.call(refusedOnce('new'))).toBe('new');
    refuseOld(refused());
    expect(await slow).toBe('old');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('ends the session once when the renewal fails', async () => {
    const end = vi.fn();
    const session = createSession('a', createMemoryStore(), { refresh: async () => REJECTED, end });
    const results = await Promise.allSettled([session.call(refusedOnce('x')), session.call(refusedOnce('y'))]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('drops the outcome of a renewal that ends after the session closed (renewed: %s)', async (ok) => {
    const { refresh, end, renew } = withRenewal();
    const session = createSession('a', createMemoryStore(), { refresh, end });
    const run = refusedOnce('late');
    const answer = session.call(run);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    // Another identity arrives: this session is over before its renewal ends.
    await session.close();
    renew(ok);
    await expect(answer).rejects.toThrow('unauthorized');
    expect(run).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
});

describe('revoked families across tabs (second review, C4)', () => {
  it('marks the family on the device and tells the other tabs', async () => {
    const store = createMemoryStore();
    const hub = createMemoryHub();
    const session = createSession('a', store, { channel: hub.channel(), now: () => 100 });
    session.revoke('f1');
    await vi.waitFor(() => expect(store.entries.get(revokedKey('a', 'f1'))).toBe(100));
    expect(hub.sent).toEqual([{ type: 'revoked', userId: 'a', familyId: 'f1' }]);
    session.revoke('f2', { announce: false });
    expect(hub.sent).toHaveLength(1);
  });
  it('lifts the mark when a read of the family started after the revocation succeeds', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'a', 'f1', 100);
    const session = createSession('a', store, { now: () => 200 });
    expect(await session.call(async () => 'week', 'f1')).toBe('week');
    await vi.waitFor(() => expect(store.entries.has(revokedKey('a', 'f1'))).toBe(false));
  });
  it('keeps the mark for a read that started before the revocation', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'a', 'f1', 100);
    const session = createSession('a', store, { now: () => 50 });
    await session.call(async () => 'week', 'f1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.entries.get(revokedKey('a', 'f1'))).toBe(100);
  });
});
