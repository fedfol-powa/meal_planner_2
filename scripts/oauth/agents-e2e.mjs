// scripts/oauth/agents-e2e.mjs
// End-to-end check of agent connection (spec «Collegamento degli agenti», «Prova end-to-end
// in CI»): real tokens of the local OAuth server, the real Worker, disconnection only through
// agents.disconnect. Local stack only: it registers OAuth clients and forces an expiry.
//   SUPABASE_URL (default http://127.0.0.1:54321), APP_URL (default http://127.0.0.1:8787),
//   SITE_URL (default http://127.0.0.1:5174), DB_URL (default the local database),
//   SUPABASE_PUBLISHABLE_KEY (from `supabase status`).
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const SUPABASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const AUTH = `${SUPABASE}/auth/v1`;
const APP = process.env.APP_URL ?? 'http://127.0.0.1:8787';
const SITE = process.env.SITE_URL ?? 'http://127.0.0.1:5174';
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const REDIRECT = 'http://127.0.0.1:9/callback';
const LOCAL = /^(http|postgresql):\/\/(postgres:postgres@)?(127\.0\.0\.1|localhost)[:/]/;
if (!KEY) throw new Error('SUPABASE_PUBLISHABLE_KEY is required (supabase status)');
for (const url of [SUPABASE, APP, DB]) if (!LOCAL.test(url)) throw new Error(`Local stack only: ${url}`);

let failures = 0;
function check(label, ok, detail = '') {
	if (!ok) failures += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `: ${detail}`}`);
}
const is = (label, actual, expected) => check(label, actual === expected, `${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);

async function read(response) {
	const text = await response.text();
	// MCP may answer as an event stream: the JSON-RPC message is the last data line.
	const data = response.headers.get('content-type')?.includes('text/event-stream')
		? text.split('\n').filter((line) => line.startsWith('data:')).at(-1)?.slice(5)
		: text;
	try {
		return { status: response.status, headers: response.headers, body: JSON.parse(data ?? '') };
	} catch {
		return { status: response.status, headers: response.headers, body: text };
	}
}
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
const pkce = () => {
	const verifier = randomBytes(32).toString('base64url');
	return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

async function login(email) {
	const r = await read(await fetch(`${AUTH}/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'password123' }),
	}));
	if (r.status !== 200) throw new Error(`sign-in of ${email}: ${r.status}`);
	return r.body;
}

async function register(name, redirect = REDIRECT) {
	const r = await read(await fetch(`${AUTH}/oauth/clients/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
	}));
	if (r.status >= 300) throw new Error(`registration: ${r.status} ${JSON.stringify(r.body)}`);
	return r.body.client_id;
}

/** The agent's first leg: /oauth/authorize, which sends the browser to the consent page. */
async function authorize(clientId, { redirect = REDIRECT, state = randomBytes(8).toString('hex'), challenge } = {}) {
	const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'openid email profile', state });
	const response = await fetch(`${AUTH}/oauth/authorize?${query}`, { redirect: 'manual' });
	return { response, location: response.headers.get('location') ?? '', state };
}

/** What the /authorize page does through supabase-js: read the request, then decide. */
const asWeb = (webToken) => ({ apikey: KEY, authorization: `Bearer ${webToken}`, 'content-type': 'application/json' });
const details = async (id, webToken) => read(await fetch(`${AUTH}/oauth/authorizations/${id}`, { headers: asWeb(webToken) }));
const decide = async (id, webToken, action) =>
	read(await fetch(`${AUTH}/oauth/authorizations/${id}/consent`, { method: 'POST', headers: asWeb(webToken), body: JSON.stringify({ action }) }));

async function exchange(clientId, code, verifier, redirect = REDIRECT) {
	return read(await fetch(`${AUTH}/oauth/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect }),
	}));
}
async function refresh(clientId, refreshToken) {
	return read(await fetch(`${AUTH}/oauth/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
	}));
}

/**
 * Authorisation code through the consent page's APIs; Supabase skips the consent while the
 * grant is active (`expectConsent` false), else the person approves.
 */
async function codeFor(clientId, webToken, { expectConsent } = {}) {
	const { verifier, challenge } = pkce();
	const start = await authorize(clientId, { challenge });
	const id = new URL(start.location).searchParams.get('authorization_id');
	let redirectUrl = (await details(id, webToken)).body.redirect_url;
	if (expectConsent !== undefined) is(`consent ${expectConsent ? 'asked' : 'skipped'} for ${clientId.slice(0, 8)}`, !redirectUrl, expectConsent);
	if (!redirectUrl) redirectUrl = (await decide(id, webToken, 'approve')).body.redirect_url;
	const back = new URL(redirectUrl);
	is('state comes back unchanged', back.searchParams.get('state'), start.state);
	return { code: back.searchParams.get('code'), verifier };
}

async function connect(clientId, webToken, { expectConsent = true } = {}) {
	const { code, verifier } = await codeFor(clientId, webToken, { expectConsent });
	const token = await exchange(clientId, code, verifier);
	if (token.status !== 200) throw new Error(`token: ${token.status} ${JSON.stringify(token.body)}`);
	return token.body;
}

// The Worker's three transports, with the bodies checked, not only the status.
async function mcp(token, name, args = {}) {
	return read(await fetch(`${APP}/mcp`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
	}));
}
const toolResult = (r) => (r.status === 200 && !r.body.result?.isError ? JSON.parse(r.body.result.content[0].text) : null);
// oRPC RPC protocol: the input travels as {"json": …}, the output comes back the same way.
async function rpc(token, path, input = {}) {
	return read(await fetch(`${APP}/api/rpc/${path}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ json: input }),
	}));
}
const rest = async (token) => read(await fetch(`${APP}/api/session/whoami`, { headers: { authorization: `Bearer ${token}` } }));

/** session.whoami on MCP, RPC and REST answers the expected channel. */
async function channelEverywhere(label, token, channel) {
	is(`${label}: MCP channel`, toolResult(await mcp(token, 'session_whoami'))?.channel, channel);
	is(`${label}: RPC channel`, (await rpc(token, 'session/whoami')).body?.json?.channel, channel);
	is(`${label}: REST channel`, (await rest(token)).body?.channel, channel);
}
/** Refused on every transport: 401 with WWW-Authenticate on MCP. */
async function refusedEverywhere(label, token) {
	const onMcp = await mcp(token, 'session_whoami');
	is(`${label}: MCP status`, onMcp.status, 401);
	check(`${label}: MCP WWW-Authenticate`, /^Bearer /.test(onMcp.headers.get('www-authenticate') ?? ''));
	is(`${label}: RPC status`, (await rpc(token, 'session/whoami')).status, 401);
	is(`${label}: REST status`, (await rest(token)).status, 401);
}
/** test.removeFamily is webOnly: an agent is sent to the page, the web goes through (positive control). */
async function webOnlyEverywhere(label, token, familyId, expected) {
	const url = `${APP}/family/${familyId}/delete`;
	const viaMcp = await mcp(token, 'test_removeFamily', { familyId });
	const viaRpc = await rpc(token, 'test/removeFamily', { familyId });
	const viaRest = await read(await fetch(`${APP}/api/test/remove-family`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ familyId }),
	}));
	if (expected === 'web_only') {
		const tool = viaMcp.status === 200 && viaMcp.body.result?.isError ? JSON.parse(viaMcp.body.result.content[0].text) : null;
		is(`${label}: MCP web_only`, tool?.code, 'web_only');
		is(`${label}: MCP url`, tool?.data?.url, url);
		is(`${label}: RPC web_only`, viaRpc.body?.json?.code, 'web_only');
		is(`${label}: RPC url`, viaRpc.body?.json?.data?.url, url);
		is(`${label}: REST status`, viaRest.status, 403);
		is(`${label}: REST web_only`, viaRest.body?.code, 'web_only');
		is(`${label}: REST url`, viaRest.body?.data?.url, url);
	} else {
		is(`${label}: RPC goes through`, viaRpc.body?.json?.ok, true);
		is(`${label}: REST goes through`, viaRest.body?.ok, true);
	}
}
const refusedGrant = (label, r) => check(label, r.status >= 400 && r.status < 500 && !r.body?.access_token, `${r.status} ${JSON.stringify(r.body)}`);

// 0. Asymmetric signing keys: the Worker accepts ES256 and RS256 only.
const jwks = await read(await fetch(`${AUTH}/.well-known/jwks.json`));
check('asymmetric signing key', jwks.body.keys?.some((key) => ['ES256', 'RS256'].includes(key.alg)), JSON.stringify(jwks.body));
check('SPA served by the Worker at /authorize', (await fetch(`${APP}/authorize?authorization_id=x`)).status === 200);

const anna = await login('anna@example.test');
const bruno = await login('bruno@example.test');
const clientA = await register('E2E agent A');
const clientB = await register('E2E agent B');

// 1. OAuth boundaries (Supabase's job, proven through our integration).
{
	const { verifier, challenge } = pkce();
	const start = await authorize(clientA, { challenge, state: 'state-123' });
	const at = new URL(start.location);
	is('authorize goes to the consent page of the Site URL', `${at.origin}${at.pathname}`, `${SITE}/authorize`);
	const id = at.searchParams.get('authorization_id');
	const request = await details(id, anna.access_token);
	is('consent request names the client', request.body.client?.id, clientA);
	const back = new URL((await decide(id, anna.access_token, 'approve')).body.redirect_url);
	is('state comes back with the code', back.searchParams.get('state'), 'state-123');
	refusedGrant('wrong code_verifier refused', await exchange(clientA, back.searchParams.get('code'), verifier.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))));

	// Grant now active: the next codes come without consent, one per check.
	const swapped = await codeFor(clientA, anna.access_token);
	refusedGrant('code of client A refused for client B', await exchange(clientB, swapped.code, swapped.verifier));
	const once = await codeFor(clientA, anna.access_token);
	is('first use of a code', (await exchange(clientA, once.code, once.verifier)).status, 200);
	refusedGrant('code reuse refused', await exchange(clientA, once.code, once.verifier));

	const bad = await authorize(clientA, { challenge: pkce().challenge, redirect: 'http://127.0.0.1:9/not-registered' });
	check('unregistered redirect_uri refused, never redirected to', !bad.location.startsWith('http://127.0.0.1:9/not-registered'), `${bad.response.status} ${bad.location}`);
	check('unregistered redirect_uri gives no consent request', !bad.location.includes('authorization_id='), bad.location);

	const denied = await authorize(clientB, { challenge: pkce().challenge, state: 'state-deny' });
	const deniedId = new URL(denied.location).searchParams.get('authorization_id');
	// Like the page: the request is read first (Supabase binds it to the person), then refused.
	await details(deniedId, anna.access_token);
	const deniedUrl = new URL((await decide(deniedId, anna.access_token, 'deny')).body.redirect_url);
	is('cancel sends access_denied', deniedUrl.searchParams.get('error'), 'access_denied');
	is('cancel keeps the state', deniedUrl.searchParams.get('state'), 'state-deny');

	const expired = await authorize(clientB, { challenge: pkce().challenge });
	const expiredId = new URL(expired.location).searchParams.get('authorization_id');
	const sql = postgres(DB, { max: 1, onnotice: () => {} });
	// Column names and the check expires_at > created_at verified on gotrue v2.197.0.
	await sql`update auth.oauth_authorizations set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute' where authorization_id = ${expiredId}`;
	await sql.end();
	check('expired request refused', (await details(expiredId, anna.access_token)).status >= 400);
}
// Revoke what step 1 created, so the rest starts from a known state (through the app, like everything else).
await rpc(anna.access_token, 'agents/disconnect', { clientId: clientA });

// 2. Real tokens: client_id and the mcp channel, also after a renewal.
const a1 = await connect(clientA, anna.access_token);
const a2 = await connect(clientA, anna.access_token, { expectConsent: false });
const b = await connect(clientB, anna.access_token);
const brunoA = await connect(clientA, bruno.access_token);
is('agent token carries client_id', claims(a1.access_token).client_id, clientA);
await channelEverywhere('agent A of Anna', a1.access_token, 'mcp');
await channelEverywhere('web of Anna', anna.access_token, 'web');
const renewed = await refresh(clientA, a1.refresh_token);
is('renewal of agent A', renewed.status, 200);
is('renewed token keeps client_id', claims(renewed.body.access_token).client_id, clientA);
await channelEverywhere('agent A of Anna after renewal', renewed.body.access_token, 'mcp');
// web_only with real tokens, before and after the renewal; the web session is the positive control.
const sqlFamily = postgres(DB, { max: 1, onnotice: () => {} });
const [{ family_id: annaFamily }] = await sqlFamily`
	select m.family_id from app.family_members m join auth.users u on u.id = m.user_id
	where u.email = 'anna@example.test' and m.role = 'family_admin' limit 1`;
await sqlFamily.end();
await webOnlyEverywhere('agent A of Anna', a1.access_token, annaFamily, 'web_only');
await webOnlyEverywhere('agent A of Anna after renewal', renewed.body.access_token, annaFamily, 'web_only');
await webOnlyEverywhere('web of Anna', anna.access_token, annaFamily, 'allowed');
const a1Now = { access_token: renewed.body.access_token, refresh_token: renewed.body.refresh_token };

// 3. The list: one row per client, with the last renewal.
const listed = (await rpc(anna.access_token, 'agents/list')).body?.json ?? [];
is('agent A listed once though authorised twice', listed.filter((row) => row.clientId === clientA).length, 1);
check('agent A has a last renewal', typeof listed.find((row) => row.clientId === clientA)?.lastRenewedAt === 'string');
is('the web is not an agent: no current row', listed.some((row) => row.current), false);

// 4. Anna disconnects A from the web, through agents.disconnect.
is('disconnect A from the web', (await rpc(anna.access_token, 'agents/disconnect', { clientId: clientA })).body?.json?.clientId, clientA);
await refusedEverywhere('first session of A', a1Now.access_token);
await refusedEverywhere('second session of A', a2.access_token);
refusedGrant('first refresh token of A refused', await refresh(clientA, a1Now.refresh_token));
refusedGrant('second refresh token of A refused', await refresh(clientA, a2.refresh_token));
await channelEverywhere('agent B of Anna still works', b.access_token, 'mcp');
await channelEverywhere('web of Anna still works', anna.access_token, 'web');
await channelEverywhere('agent A of Bruno still works', brunoA.access_token, 'mcp');
is('disconnecting again still answers', (await rpc(anna.access_token, 'agents/disconnect', { clientId: clientA })).body?.json?.clientId, clientA);
await connect(clientA, anna.access_token); // reconnecting asks the consent again (checked inside)

// 5. B disconnects itself over MCP: the answer arrives, the next request is refused.
const own = await mcp(b.access_token, 'agents_disconnect', { clientId: clientB });
is('agent B disconnects itself: answer', toolResult(own)?.clientId, clientB);
await refusedEverywhere('agent B after disconnecting itself', b.access_token);
await channelEverywhere('web of Anna after B left', anna.access_token, 'web');

process.exit(failures ? 1 : 0);
