import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { cacheKey, createMemoryStore, markRevoked, revokedKey } from '../api/persister';
import { queryKeys } from '../api/queries';
import { createMemoryHub } from '../test/memoryChannel';
import { createSession, persisterOf, SessionClosedError, type RenewResult } from './session';
import { readPreference, userScope, writePreference } from './localePreference';

describe('session', () => {
  it('closes once: clears the cache, deletes the stored copy and the language choice', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), { timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } });
    writePreference(userScope('a'), 'en-GB');
    const session = createSession('a', store);
    session.queryClient.setQueryData(queryKeys.profile('it-IT'), { version: 'v', data: 'profile' });
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
    await expect(answer).rejects.toBeInstanceOf(SessionClosedError);
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
    await vi.waitFor(() => expect(store.entries.get(revokedKey('a', 'f1'))).toEqual({ revokedAt: 100, restoredAt: 0 }));
    expect(hub.sent).toEqual([{ type: 'revoked', userId: 'a', familyId: 'f1', revokedAt: 100 }]);
    session.revoke('f2', { announce: false });
    expect(hub.sent).toHaveLength(1);
  });
  it('a read of the family alone never restores it: only a profile or a join does (decision 23)', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'a', 'f1', 100);
    const session = createSession('a', store, { now: () => 200 });
    await vi.waitFor(() => expect(session.isRevoked('f1')).toBe(true));
    expect(await session.call(async () => 'week', 'f1')).toBe('week');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.entries.get(revokedKey('a', 'f1'))).toEqual({ revokedAt: 100, restoredAt: 0 });
    expect(session.isRevoked('f1')).toBe(true);
  });
  it('restores with the start of the confirmation and tells the other tabs', async () => {
    const store = createMemoryStore();
    const hub = createMemoryHub();
    const session = createSession('a', store, { channel: hub.channel(), now: () => 100 });
    session.revoke('f1', { announce: false });
    expect(session.restore('f1', 90)).toBe(false);
    expect(session.restore('f1', 120)).toBe(true);
    expect(session.isRevoked('f1')).toBe(false);
    await vi.waitFor(() => expect(store.entries.get(revokedKey('a', 'f1'))).toEqual({ revokedAt: 100, restoredAt: 120 }));
    expect(hub.sent).toEqual([
      { type: 'restored', userId: 'a', familyId: 'f1', startedAt: 90 },
      { type: 'restored', userId: 'a', familyId: 'f1', startedAt: 120 }
    ]);
  });
});

describe('session hooks for the shopping queue (second PR, W4 interface)', () => {
  it('shares one renewal among explicit renewals and the one inside call', async () => {
    const { refresh, end, renew } = withRenewal();
    const session = createSession('a', createMemoryStore(), { refresh, end });
    const explicit = [session.renew(), session.renew()];
    const call = session.call(refusedOnce('read'));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    renew(OK);
    expect(await Promise.all(explicit)).toEqual([OK, OK]);
    expect(await call).toBe('read');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
  it('closes the session completely, hooks included, before a rejected renewal answers', async () => {
    const order: string[] = [];
    const session = createSession('a', createMemoryStore(), {
      refresh: async () => REJECTED,
      end: async (s) => {
        order.push('end');
        await s.close();
        order.push('closed');
      }
    });
    session.onClose(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('hook');
    });
    expect(await session.renew()).toEqual(REJECTED);
    order.push('answered');
    expect(order).toEqual(['end', 'hook', 'closed', 'answered']);
    expect(session.isClosed()).toBe(true);
  });
  it('changes nothing when the renewal finds no network', async () => {
    const end = vi.fn();
    const session = createSession('a', createMemoryStore(), { refresh: async () => ({ kind: 'network' }), end });
    expect(await session.renew()).toEqual({ kind: 'network' });
    await expect(session.call(refusedOnce('x'))).rejects.toMatchObject({ code: 'network' });
    expect(end).not.toHaveBeenCalled();
    expect(session.isClosed()).toBe(false);
  });
  it('answers rejected on a closed session without contacting Supabase', async () => {
    const refresh = vi.fn(async () => OK);
    const session = createSession('a', createMemoryStore(), { refresh });
    await session.close();
    expect(await session.renew()).toEqual(REJECTED);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('never runs a call on a closed session', async () => {
    const session = createSession('a', createMemoryStore());
    await session.close();
    const run = vi.fn(async () => 'x');
    await expect(session.call(run)).rejects.toBeInstanceOf(SessionClosedError);
    expect(run).not.toHaveBeenCalled();
  });
  it('rejects with SessionClosedError when the renewal inside call is rejected', async () => {
    const session = createSession('a', createMemoryStore(), { refresh: async () => REJECTED, end: (s) => s.close() });
    const run = refusedOnce('x');
    await expect(session.call(run)).rejects.toBeInstanceOf(SessionClosedError);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('awaits every close hook after the stored copy is gone, even when one throws or rejects', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), { timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } });
    const session = createSession('a', store);
    const seen: string[] = [];
    session.onClose(() => {
      seen.push(`first:${store.entries.has(cacheKey('a'))}`);
      throw new Error('sync');
    });
    session.onClose(async () => {
      seen.push('second');
      throw new Error('async');
    });
    session.onClose(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push('third');
    });
    const removed = vi.fn(async () => undefined);
    session.onClose(removed)();
    await session.close();
    expect(seen).toEqual(['first:false', 'second', 'third']);
    expect(removed).not.toHaveBeenCalled();
  });
  it('calls the revoke hooks for local and announced revocations, never once closed', async () => {
    const session = createSession('a', createMemoryStore());
    const seen: string[] = [];
    session.onRevoke(() => {
      throw new Error('broken hook');
    });
    session.onRevoke(async (familyId) => {
      seen.push(familyId);
    });
    const off = session.onRevoke((familyId) => void seen.push(`removed:${familyId}`));
    off();
    session.revoke('f1');
    session.revoke('f2', { announce: false });
    await session.close();
    session.revoke('f3');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['f1', 'f2']);
  });
  it('exposes its store and channel', () => {
    const store = createMemoryStore();
    const channel = createMemoryHub().channel();
    expect(createSession('a', store, { channel }).store).toBe(store);
    expect(createSession('a', store, { channel }).channel).toBe(channel);
    expect(createSession('a', store).channel).toBeNull();
  });
  it('closes itself and repeats nothing when the renewal is for another user', async () => {
    const end = vi.fn();
    const session = createSession('a', createMemoryStore(), { refresh: async () => ({ kind: 'ok', userId: 'b' }), end });
    const run = refusedOnce('x');
    await expect(session.call(run)).rejects.toBeInstanceOf(SessionClosedError);
    expect(run).toHaveBeenCalledTimes(1);
    expect(session.isClosed()).toBe(true);
    // B's session is not this one's to end: no sign-out.
    expect(end).not.toHaveBeenCalled();
    expect(await session.renew()).toEqual(REJECTED);
  });
});
