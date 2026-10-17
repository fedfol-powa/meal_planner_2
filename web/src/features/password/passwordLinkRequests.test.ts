import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { savePassword, verifyLink } from './passwordLinkRequests';

const URL_ = 'http://127.0.0.1:54321';
const LINK = { email: 'anna@example.test', accessToken: 'link-token' };

function setup(answer: Response | Error) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetchImpl, deps: { url: URL_, publishableKey: 'pub-key', fetch: fetchImpl as unknown as typeof fetch } };
}
const sentOf = (fetchImpl: ReturnType<typeof setup>['fetchImpl']) => {
  const [input, init] = fetchImpl.mock.calls[0]!;
  const headers = new Headers(init?.headers);
  return { url: String(input), method: init?.method, authorization: headers.get('authorization'), apikey: headers.get('apikey'), body: JSON.parse(String(init?.body)) };
};
const refusal = (status: number, code: string) => Response.json({ code, message: 'x' }, { status });

describe('verifyLink', () => {
  it('posts the recovery token hash with the public key and keeps token and email', async () => {
    const { fetchImpl, deps } = setup(Response.json({ access_token: 'link-token', user: { email: 'anna@example.test' } }));
    expect(await verifyLink(deps, 'hash-1')).toEqual({ ok: true, link: LINK });
    expect(sentOf(fetchImpl)).toMatchObject({ url: `${URL_}/auth/v1/verify`, method: 'POST', authorization: null, apikey: 'pub-key', body: { type: 'recovery', token_hash: 'hash-1' } });
  });
  it('treats an expired or used code as an invalid link', async () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(await verifyLink(setup(refusal(status, 'otp_expired')).deps, 'h')).toEqual({ ok: false, reason: 'invalid_link' });
    }
  });
  it('reports a lost request as network and the rest as unknown', async () => {
    expect(await verifyLink(setup(new TypeError('offline')).deps, 'h')).toEqual({ ok: false, reason: 'network' });
    expect(await verifyLink(setup(refusal(500, 'unexpected_failure')).deps, 'h')).toEqual({ ok: false, reason: 'unknown' });
    expect(await verifyLink(setup(refusal(429, 'over_request_rate_limit')).deps, 'h')).toEqual({ ok: false, reason: 'unknown' });
    expect(await verifyLink(setup(Response.json({ user: {} })).deps, 'h')).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('savePassword', () => {
  it("puts the password with the link's token", async () => {
    const { fetchImpl, deps } = setup(Response.json({ id: 'u' }));
    expect(await savePassword(deps, LINK, 'new-password')).toEqual({ ok: true });
    expect(sentOf(fetchImpl)).toMatchObject({ url: `${URL_}/auth/v1/user`, method: 'PUT', authorization: 'Bearer link-token', apikey: 'pub-key', body: { password: 'new-password' } });
    expect(sentOf(fetchImpl).body).toEqual({ password: 'new-password' });
  });
  it('maps the Profile errors', async () => {
    const weak = Response.json({ code: 'weak_password', weak_password: { reasons: ['length'] } }, { status: 422 });
    expect(await savePassword(setup(weak).deps, LINK, 'p')).toEqual({ ok: false, reason: 'weak_length' });
    expect(await savePassword(setup(refusal(422, 'same_password')).deps, LINK, 'p')).toEqual({ ok: false, reason: 'same_password' });
    expect(await savePassword(setup(new TypeError('offline')).deps, LINK, 'p')).toEqual({ ok: false, reason: 'network' });
    expect(await savePassword(setup(refusal(429, 'over_request_rate_limit')).deps, LINK, 'p')).toEqual({ ok: false, reason: 'rate_limited' });
  });
  it('says the link is no longer valid on 401 or a missing session', async () => {
    expect(await savePassword(setup(refusal(401, 'bad_jwt')).deps, LINK, 'p')).toEqual({ ok: false, reason: 'invalid_link' });
    expect(await savePassword(setup(refusal(403, 'session_not_found')).deps, LINK, 'p')).toEqual({ ok: false, reason: 'invalid_link' });
  });
});

describe('the module', () => {
  it('never imports the shared client or the backends', () => {
    const source = readFileSync('src/features/password/passwordLinkRequests.ts', 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).not.toMatch(/supabase-js|supabaseBackend|AuthProvider|lib\/supabase|client/i);
  });
});
