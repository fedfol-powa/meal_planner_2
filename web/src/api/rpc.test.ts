import { ORPCError } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, SessionClosedError } from './errors';
import { createRpcClient } from './rpc';
import { createRpcTestServer as testServer, WHOAMI as whoami } from '../test/rpcServer';
import uploadTooLarge from './fixtures/upload-too-large.rpc.json';

describe('oRPC client (second PR)', () => {
  it('sends the token read at each request, and no header without a token', async () => {
    const server = testServer();
    let token: string | null = 'first';
    const client = createRpcClient({ getCredentials: async () => (token ? { accessToken: token, userId: 'a' } : null), fetch: server.fetch });
    expect(await client.session.whoami({})).toEqual(whoami);
    token = 'second';
    await client.session.whoami({});
    token = null;
    await client.session.whoami({});
    expect(server.seen).toEqual(['Bearer first', 'Bearer second', null]);
    expect(String(server.fetch.mock.calls[0]![0].url)).toBe(new URL('/api/rpc/session/whoami', location.origin).toString());
  });
  it('turns the errors of the contract into ApiError with code and data', async () => {
    const server = testServer();
    const client = createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch: server.fetch });
    server.answer(() => {
      throw new ORPCError('forbidden');
    });
    await expect(client.session.whoami({})).rejects.toEqual(new ApiError('forbidden'));
    const issues = { issues: [{ path: ['stars'], code: 'too_big' }] };
    server.answer(() => {
      throw new ORPCError('invalid', { data: issues });
    });
    const invalid = await client.session.whoami({}).catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(ApiError);
    expect(invalid).toMatchObject({ code: 'invalid', data: issues });
  });
  it('answers unknown for codes outside the contract and for answers that are not oRPC', async () => {
    const server = testServer();
    server.answer(() => {
      throw new ORPCError('TEAPOT');
    });
    const client = createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch: server.fetch });
    await expect(client.session.whoami({})).rejects.toMatchObject({ code: 'unknown' });
    const proxy = createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch: async () => new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } }) });
    await expect(proxy.session.whoami({})).rejects.toMatchObject({ code: 'unknown' });
  });
  it('answers network when the request cannot leave the device', async () => {
    const client = createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(client.session.whoami({})).rejects.toEqual(new ApiError('network'));
  });
  it('passes the signal to the transport and lets an abort through unchanged', async () => {
    let received: AbortSignal | null = null;
    const fetch = (request: Request) =>
      new Promise<Response>((_, reject) => {
        received = request.signal;
        request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const client = createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch });
    const controller = new AbortController();
    const call = client.session.whoami({}, { signal: controller.signal });
    await vi.waitFor(() => expect(received).not.toBeNull());
    controller.abort();
    const error = await call.catch((e: unknown) => e);
    expect(received!.aborted).toBe(true);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });
  it('never sends credentials of another person than the session the call belongs to', async () => {
    const server = testServer();
    const client = createRpcClient({ getCredentials: async () => ({ accessToken: 'token-of-b', userId: 'b' }), fetch: server.fetch });
    await expect(client.session.whoami({}, { context: { sessionUserId: 'a' } })).rejects.toBeInstanceOf(SessionClosedError);
    expect(server.fetch).not.toHaveBeenCalled();
    // The same credentials for B's own session go through.
    expect(await client.session.whoami({}, { context: { sessionUserId: 'b' } })).toEqual(whoami);
  });

  it('an upload over the limit is invalid, not unknown', async () => {
    // Recorded from the real Worker by server/test/photos-upload-limit.test.ts (UPDATE_FIXTURES=1), never written by hand.
    const answer = (body: unknown) => async () => new Response(JSON.stringify(body), { status: uploadTooLarge.status, headers: { 'content-type': 'application/json' } });
    const upload = (body: unknown) =>
      createRpcClient({ getCredentials: async () => ({ accessToken: 't', userId: 'a' }), fetch: answer(body) })
        // Without the file: jsdom's FormData cannot carry a File through the Request of the link; the answer is what counts.
        .catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId: crypto.randomUUID() } as never)
        .catch((error: unknown) => error);
    const refused = await upload(uploadTooLarge.body);
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ code: 'invalid', data: { issues: [{ path: ['file'], code: 'photo_too_large' }] } });
    // A JSON written by hand, as an earlier draft of the plan answered: the client cannot read it.
    const handWritten = await upload({ code: 'invalid', status: 413, data: { issues: [{ path: ['file'], code: 'photo_too_large' }] } });
    expect(handWritten).toMatchObject({ code: 'unknown' });
  });
});
