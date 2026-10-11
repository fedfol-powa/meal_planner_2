# Collegamento degli agenti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collegare gli agenti MCP all'account con il server OAuth 2.1 di Supabase: pagina di consenso `/authorize`, pagina «Collega un agente» con «Agenti collegati» e «Scollega», operazioni `agents.list` e `agents.disconnect` con i loro strumenti MCP, prova end-to-end in CI.

**Architecture:** le autorizzazioni vivono in Supabase Auth. Il server legge l'elenco con una funzione SQL `security definer` sulle tabelle `auth` e scollega chiamando `DELETE /auth/v1/user/oauth/grants` con il token di chi chiede; la revoca è immediata perché il server verifica già a ogni richiesta che la sessione esista. Il web usa supabase-js per il consenso e il client oRPC per elenco e scollegamento. La CI prova il percorso reale con lo stack locale (server OAuth attivo) e `wrangler dev`.

**Tech Stack:** TypeScript, oRPC 1.15.5, zod 4, Postgres.js, pgTAP, React 19, TanStack Router e Query, `@supabase/supabase-js` 2.117.3, Vitest, Testing Library, Supabase CLI 2.120.0, wrangler.

**Spec:** `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md` (subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezione 13). Rilievi della review: `progetto/coordinamento/revisioni/w2-agenti-spec-piano.md`.

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano; testi per l'utente in `it-IT` ed `en-GB`.
- Nessuna dipendenza nuova.
- Contratto: ogni operazione con `op({ mcp, offline, role })`; errori solo a codici; nessuna lettura versionata per `agents.list` (niente `reads`).
- Web: niente aggiornamenti ottimistici; dopo una mutazione si rilegge l'elenco.
- Migrazioni: solo file nuovi con timestamp; `execute` revocato a `public` su ogni funzione; test pgTAP per ogni migrazione.
- File condivisi toccati solo dove serve (da dichiarare nella PR): `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`, `server/src/env.ts`, `server/wrangler.jsonc`, `server/.env.example`, `server/test/support/requests.ts`, `supabase/config.toml`, `supabase/tests/coverage_test.sql`, `.github/workflows/ci.yml`, `web/vite.config.ts`, `web/src/vite-env.d.ts`, `web/src/env.ts`, `web/src/router.tsx`, `web/src/api/types.ts`, `web/src/api/fake/fakeApi.ts`, `web/src/i18n/messages/index.ts`, `web/src/auth/backend.ts`, `web/src/auth/supabaseBackend.ts`, `web/src/test/stubBackend.ts`, `web/src/test/renderApp.tsx`, `web/src/components/Icon.tsx`.
- Testi veritieri (decisione del coordinatore, rilievo 1): consenso, pagina e conferma di «Scollega» dicono che l'agente agisce con il tuo account, che può anche cambiare la password e chiudere le tue sessioni, e che «Scollega» revoca l'autorizzazione e le sessioni di quell'agente, non accessi ottenuti in altro modo. Mai promesse di blocco totale. I test verificano la presenza di queste frasi.
- «Ultimo rinnovo dell'accesso», mai «ultimo uso» o «ultimo accesso» (decisione del coordinatore, rilievo 10).
- Nessuna modifica al progetto Supabase di produzione `lronuqvtjdhfyychnscr`: i passi esterni li fa l'utente (spec, «Passi esterni»).
- Comandi locali: `export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH` (con l'errore di Podman per stack nuovi vedi `progetto/coordinamento/messaggi/w2-podman.md`). I test del server con il database si lanciano **sempre** con `TEST_DATABASE_URL` esplicito, altrimenti la suite viene saltata e un rosso atteso sembrerebbe verde: `export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` (porta da `supabase status`). Un'esecuzione è valida solo se l'uscita di Vitest non riporta file `skipped`.
- Ogni commit lascia verdi typecheck e test dei pacchetti toccati: per questo contratto e gestori stanno nello stesso task (Task 3).
- Una sola PR verso `main` alla fine (Task 9).

## Review Focus

- `authorization_id` scaduto o già usato (la persona riapre una scheda vecchia): la pagina deve dire «Richiesta non valida o scaduta» e non mostrare «Consenti» → test in Task 6; scadenza reale in CI → Task 4.
- Risposte arrivate tardi su `/authorize` (pagina lasciata, cambio account, due caricamenti): nessuna navigazione verso il callback di una richiesta abbandonata → test in Task 6.
- «Consenti» prima che si conoscano i ruoli: disabilitato finché il profilo dell'identità corrente non è letto → test in Task 6.
- Doppio clic su «Consenti» o «Scollega» con rete lenta: una sola chiamata, pulsanti disabilitati durante l'attesa → test in Task 6 e Task 7.
- Supabase Auth irraggiungibile, lento o con un 404 qualunque durante lo scollegamento: `internal` dopo al massimo 5 secondi, nessun falso «scollegato», l'agente resta attivo → test in Task 2 e Task 3.
- Un agente che scollega se stesso via MCP: la risposta arriva, la richiesta successiva prende 401 → test in Task 3 e prova reale in Task 4.
- Nome del client vuoto, lunghissimo o ostile (registrazione dinamica aperta): nome di ripiego, testo semplice che va a capo → test in Task 1 (nome vuoto), Task 6 e Task 7.

---

### Task 1: Funzione `app.connected_agents()`

**Files:**
- Create: `supabase/migrations/20261011200000_connected_agents.sql`
- Create: `supabase/tests/connected_agents_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenco delle funzioni eseguibili da `authenticated`)

**Interfaces:**
- Produces: `app.connected_agents() returns table (client_id uuid, name text, connected_at timestamptz, last_renewed_at timestamptz)`, eseguibile da `authenticated`, solo righe di `auth.uid()`.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/connected_agents_test.sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_type, token_endpoint_auth_method, client_name) values
	('a0000000-0000-4000-8000-000000000001', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', 'Claude Code'),
	('a0000000-0000-4000-8000-000000000002', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', 'Codex'),
	('a0000000-0000-4000-8000-000000000003', 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', null);
insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) values
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', 'openid', '2026-10-01 10:00+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000002', 'openid', '2026-10-02 10:00+00', '2026-10-03 10:00+00'),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000003', 'openid', '2026-10-04 10:00+00', null),
	(gen_random_uuid(), tests.uid('bruno'), 'a0000000-0000-4000-8000-000000000001', 'openid', '2026-10-05 10:00+00', null);
insert into auth.sessions (id, user_id, oauth_client_id, updated_at, not_after) values
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-10 08:00+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-10 09:30+00', null),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000001', '2026-10-11 09:00+00', '2026-10-01 00:00+00'),
	(gen_random_uuid(), tests.uid('anna'), 'a0000000-0000-4000-8000-000000000002', '2026-10-11 09:00+00', null),
	(gen_random_uuid(), tests.uid('bruno'), 'a0000000-0000-4000-8000-000000000001', '2026-10-11 12:00+00', null);

select tests.login('anna');
select results_eq(
	$$select client_id::text, name, connected_at, last_renewed_at from app.connected_agents() order by connected_at$$,
	$$values
		('a0000000-0000-4000-8000-000000000001', 'Claude Code', '2026-10-01 10:00+00'::timestamptz, '2026-10-10 09:30+00'::timestamptz),
		('a0000000-0000-4000-8000-000000000003', '', '2026-10-04 10:00+00'::timestamptz, null::timestamptz)$$,
	'active grants only, last renewal from live sessions of the client, empty name when missing');

select tests.login('bruno');
select results_eq(
	$$select client_id::text, last_renewed_at from app.connected_agents()$$,
	$$values ('a0000000-0000-4000-8000-000000000001', '2026-10-11 12:00+00'::timestamptz)$$,
	'the same client for another person is that person''s row only');

select tests.login('gina');
select is((select count(*) from app.connected_agents()), 0::bigint, 'nobody else''s agents');

select tests.become('anon');
select throws_ok($$select * from app.connected_agents()$$, '42501', null, 'anon cannot list agents');

select * from finish();
rollback;
```

In `supabase/tests/coverage_test.sql`, nell'elenco «authenticated executes only authorisation and pure functions», inserire `'connected_agents'` dopo `'catalogue_author_names'`:

```sql
	array['can_access_list', 'can_access_slot', 'can_access_week', 'catalogue_author_names', 'connected_agents', 'has_role', 'is_family_admin',
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase db reset && supabase test db` (stack locale avviato come nel Task 4, o `supabase db start`)
Expected: FAIL in `connected_agents_test.sql` (`function app.connected_agents() does not exist`) e in `coverage_test.sql`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- supabase/migrations/20261011200000_connected_agents.sql
-- Agents (OAuth clients of Supabase Auth) the caller has allowed: active grants, with the
-- last token issue or renewal of their live sessions. Authorisations live in Supabase
-- Auth; disconnecting goes through its API, never through this schema.
create function app.connected_agents()
returns table (client_id uuid, name text, connected_at timestamptz, last_renewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
	select c.client_id, coalesce(oc.client_name, ''), c.granted_at, max(s.updated_at)
	from auth.oauth_consents c
	join auth.oauth_clients oc on oc.id = c.client_id
	left join auth.sessions s
		on s.user_id = c.user_id and s.oauth_client_id = c.client_id
		and (s.not_after is null or s.not_after > now())
	where c.user_id = auth.uid() and c.revoked_at is null and oc.deleted_at is null
	group by c.client_id, oc.client_name, c.granted_at
$$;

revoke execute on function app.connected_agents() from public;
grant execute on function app.connected_agents() to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && supabase test db`
Expected: PASS su tutti i file, compresi `connected_agents_test.sql` e `coverage_test.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011200000_connected_agents.sql supabase/tests/connected_agents_test.sql supabase/tests/coverage_test.sql
git commit -m "Agenti: funzione connected_agents sui grant di Supabase Auth"
```

---

### Task 2: Revoca del grant tramite Supabase Auth e chiave pubblica nel Worker

**Files:**
- Create: `server/src/agents/grants.ts`
- Create: `server/src/agents/grants.test.ts`
- Modify: `server/src/env.ts`
- Modify: `server/wrangler.jsonc` (`vars`)
- Modify: `server/.env.example`
- Modify: `server/test/support/requests.ts` (`testEnv`)

**Interfaces:**
- Produces: `revokeGrant(options: { supabaseUrl: string; publishableKey: string; accessToken: string; clientId: string; fetch?: typeof fetch }): Promise<void>` che risolve solo con 204 o con 404 il cui corpo JSON ha `error_code: 'oauth_consent_not_found'`, lancia `appError('unauthorized')` su 401/403 e `GrantRevocationError` (errore generico → `internal`) su rete, timeout, ogni altro 404 e ogni altro stato; `Env.SUPABASE_PUBLISHABLE_KEY: string`.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/agents/grants.test.ts
import { ORPCError } from '@orpc/server';
import { describe, expect, it } from 'vitest';
import { GrantRevocationError, revokeGrant } from './grants.ts';

const CLIENT = '6a046a4a-3adc-4818-b1b1-47c5966d7fa7';

function fakeFetch(answer: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = (async (url: string | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return answer();
	}) as typeof globalThis.fetch;
	return { calls, fetch };
}

const options = (fetch: typeof globalThis.fetch) => ({
	supabaseUrl: 'https://project.supabase.co',
	publishableKey: 'sb_publishable_x',
	accessToken: 'token-1',
	clientId: CLIENT,
	fetch,
});

describe('revokeGrant', () => {
	it('deletes the grant of the client with the caller token and the publishable key', async () => {
		const { calls, fetch } = fakeFetch(() => new Response(null, { status: 204 }));
		await revokeGrant(options(fetch));
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe(`https://project.supabase.co/auth/v1/user/oauth/grants?client_id=${CLIENT}`);
		expect(calls[0]!.init.method).toBe('DELETE');
		expect(calls[0]!.init.headers).toEqual({ authorization: 'Bearer token-1', apikey: 'sb_publishable_x' });
		expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
	});

	it('treats the documented "no active grant" answer as already disconnected', async () => {
		const { fetch } = fakeFetch(() => Response.json({ code: 404, error_code: 'oauth_consent_not_found', msg: 'No active grant found' }, { status: 404 }));
		await expect(revokeGrant(options(fetch))).resolves.toBeUndefined();
	});

	it('never takes another 404 for a revocation', async () => {
		const answers = [
			() => new Response(null, { status: 404 }),
			() => new Response('<html><body>Not Found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } }),
			() => new Response('{"error_code":', { status: 404, headers: { 'content-type': 'application/json' } }),
			() => Response.json({ code: 404, error_code: 'not_found', msg: 'Not found' }, { status: 404 }),
			() => Response.json({ message: 'no Route matched with those values' }, { status: 404 }),
		];
		for (const answer of answers) {
			const { fetch } = fakeFetch(answer);
			await expect(revokeGrant(options(fetch))).rejects.toBeInstanceOf(GrantRevocationError);
		}
	});

	it('refuses with unauthorized when Supabase does not accept the token', async () => {
		for (const status of [401, 403]) {
			const { fetch } = fakeFetch(() => new Response(null, { status }));
			const error = await revokeGrant(options(fetch)).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ORPCError);
			expect((error as ORPCError<string, unknown>).code).toBe('unauthorized');
		}
	});

	it('fails without claiming success on other answers, network errors and timeouts', async () => {
		const answers = [
			() => new Response('boom', { status: 500 }),
			() => new Response(null, { status: 200 }),
			() => Promise.reject(new TypeError('fetch failed')),
			() => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
		];
		for (const answer of answers) {
			const { fetch } = fakeFetch(answer);
			await expect(revokeGrant(options(fetch))).rejects.toBeInstanceOf(GrantRevocationError);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- src/agents/grants.test.ts`
Expected: FAIL, `Cannot find module './grants.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/src/agents/grants.ts
import { appError } from '../errors.ts';

const TIMEOUT_MS = 5000;
/** Supabase Auth's answer when the user has no active grant for the client (verified on gotrue v2.197.0). */
const NO_ACTIVE_GRANT = 'oauth_consent_not_found';

/** Supabase Auth could not revoke the grant: an outage, answered as `internal`. */
export class GrantRevocationError extends Error {
	override name = 'GrantRevocationError';
}

/**
 * Revokes the caller's grant to an OAuth client through Supabase Auth, which deletes that
 * client's sessions for this user: the session check of every request then refuses its
 * tokens. Only 204 and the documented 404 `oauth_consent_not_found` (no active grant) mean
 * "not connected any more": any other answer, including other 404s, is an outage.
 */
export async function revokeGrant(options: {
	supabaseUrl: string;
	publishableKey: string;
	accessToken: string;
	clientId: string;
	fetch?: typeof fetch;
}): Promise<void> {
	const url = new URL('/auth/v1/user/oauth/grants', options.supabaseUrl);
	url.searchParams.set('client_id', options.clientId);
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(url.toString(), {
			method: 'DELETE',
			headers: { authorization: `Bearer ${options.accessToken}`, apikey: options.publishableKey },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (error) {
		throw new GrantRevocationError('Supabase Auth unreachable', { cause: error });
	}
	if (response.status === 204) return;
	if (response.status === 404 && (await errorCode(response)) === NO_ACTIVE_GRANT) return;
	if (response.status === 401 || response.status === 403) throw appError('unauthorized');
	throw new GrantRevocationError(`Supabase Auth answered ${response.status}`);
}

/** `error_code` of a Supabase Auth error body; undefined for HTML, malformed JSON or another shape. */
async function errorCode(response: Response): Promise<string | undefined> {
	try {
		const body: unknown = await response.json();
		const code = (body as { error_code?: unknown } | null)?.error_code;
		return typeof code === 'string' ? code : undefined;
	} catch {
		return undefined;
	}
}
```

`server/src/env.ts`:

```ts
export interface Env {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	/** Publishable (public) key of the Supabase project: Supabase Auth calls made for the user. */
	SUPABASE_PUBLISHABLE_KEY: string;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSETS: Fetcher;
}
```

`server/wrangler.jsonc`, dentro `vars`, dopo `SUPABASE_URL`:

```jsonc
		// Publishable key of the project (public value): Project Settings › API Keys.
		// Replace with the value the user gives the coordinator (spec «Passi esterni», step 3).
		"SUPABASE_PUBLISHABLE_KEY": "sb_publishable_REPLACE_ME"
```

`server/.env.example`, in fondo:

```
# Publishable key of the local Supabase stack (`supabase status`, PUBLISHABLE_KEY).
SUPABASE_PUBLISHABLE_KEY=
```

`server/test/support/requests.ts`, in `testEnv`, dopo `SUPABASE_URL: TEST_SUPABASE_URL,`:

```ts
		SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
```

Poi cercare altri punti che costruiscono un `Env` completo e aggiungere lo stesso campo: `grep -rn "SUPABASE_URL:" server/src server/test`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server -- src/agents/grants.test.ts && npm run typecheck -w server`
Expected: PASS; typecheck pulito (il contratto non cambia in questo task: il router resta completo).

- [ ] **Step 5: Commit**

```bash
git add server/src/agents/grants.ts server/src/agents/grants.test.ts server/src/env.ts server/wrangler.jsonc server/.env.example server/test/support/requests.ts
git commit -m "Agenti: revoca del grant tramite Supabase Auth e chiave pubblica nel Worker"
```

---

### Task 3: Area `agents` del contratto e gestori del server, con strumenti MCP

Contratto e gestori stanno nello stesso task e nello stesso commit: aggiungere `agents` al contratto senza registrarlo in `os.router` rompe il typecheck del server (rilievo 7).

**Files:**
- Create: `contract/src/agents/operations.ts`
- Create: `contract/src/agents/index.ts`
- Create: `contract/src/agents/agents-contract.test.ts`
- Create: `server/src/agents/router.ts`
- Create: `server/test/agents.test.ts`
- Modify: `contract/src/contract.ts` (registrazione dell'area)
- Modify: `contract/src/index.ts` (riesportazione)
- Modify: `server/src/router.ts` (registrazione dei gestori)

**Interfaces:**
- Consumes: `app.connected_agents()` (Task 1), `revokeGrant` e `GrantRevocationError` (Task 2), `Implementer` da `server/src/pipeline.ts`, `context.tx`, `context.token`, `context.clientId`, `context.env`.
- Produces: `agentsContract`, `connectedAgentSchema`, `type ConnectedAgent = { clientId: string; name: string; connectedAt: string; lastRenewedAt: string | null; current: boolean }`; `contract.agents.list` (input `{}`) e `contract.agents.disconnect` (input `{ clientId: string }`, output `{ clientId: string }`); `agentsRouter(os: Implementer)`; strumenti MCP `agents_list` (readOnlyHint true) e `agents_disconnect`.

- [ ] **Step 1: Write the failing tests**

```ts
// contract/src/agents/agents-contract.test.ts
import { describe, expect, it } from 'vitest';
import { contract } from '../contract.ts';
import { connectedAgentSchema } from './operations.ts';

describe('agents contract', () => {
	it('exposes list as a read-only tool and disconnect as a tool, for any user, never offline', () => {
		expect(contract.agents.list['~orpc'].meta).toEqual({ mcp: { readOnly: true }, offline: false, role: 'user' });
		expect(contract.agents.disconnect['~orpc'].meta).toEqual({ mcp: { readOnly: false }, offline: false, role: 'user' });
	});

	it('accepts an agent without sessions and an empty name', () => {
		const agent = {
			clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
			name: '',
			connectedAt: '2026-10-11T16:53:33.041Z',
			lastRenewedAt: null,
			current: false,
		};
		expect(connectedAgentSchema.parse(agent)).toEqual(agent);
	});

	it('tells the agent what disconnecting does and does not end', () => {
		const summary = contract.agents.disconnect['~orpc'].route.summary ?? '';
		expect(summary).toMatch(/revokes its authorisation and ends its sessions/);
		expect(summary).toMatch(/changed password/);
		expect(contract.agents.list['~orpc'].route.summary).toMatch(/not their last use/);
	});

	it('refuses a client id that is not a UUID', () => {
		const input = contract.agents.disconnect['~orpc'].inputSchema!;
		expect(input['~standard'].validate({ clientId: 'claude' })).toMatchObject({ issues: expect.any(Array) });
		expect(input['~standard'].validate({ clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' })).toMatchObject({ value: { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' } });
	});
});
```

Test del server (database locale):

```ts
// server/test/agents.test.ts
import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { TEST_SUPABASE_URL } from './support/keys.ts';
import { mcp, rest, rpcClient, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('agents', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());
	afterEach(() => vi.restoreAllMocks());

	async function oauthClient(name: string | null): Promise<string> {
		const id = crypto.randomUUID();
		await actors.db.admin`
			insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_type, token_endpoint_auth_method, client_name)
			values (${id}, 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', ${name})`;
		return id;
	}

	/** Consent plus one session of the client, as Supabase leaves them after the flow; returns the agent token. */
	async function connect(userId: string, clientId: string, at: { grantedAt: string; renewedAt: string }) {
		await actors.db.admin`
			insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at)
			values (${crypto.randomUUID()}, ${userId}, ${clientId}, 'openid', ${at.grantedAt})
			on conflict (user_id, client_id) do nothing`;
		const sessionId = crypto.randomUUID();
		await actors.db.admin`
			insert into auth.sessions (id, user_id, oauth_client_id, updated_at) values (${sessionId}, ${userId}, ${clientId}, ${at.renewedAt})`;
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId, email: `${userId}@test.local`, client_id: clientId });
		return { token, sessionId, client: rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token) };
	}

	/** What Supabase does on DELETE /user/oauth/grants: consent revoked, sessions of the client deleted. */
	async function supabaseRevokes(userId: string, clientId: string) {
		await actors.db.admin`update auth.oauth_consents set revoked_at = now() where user_id = ${userId} and client_id = ${clientId}`;
		await actors.db.admin`delete from auth.sessions where user_id = ${userId} and oauth_client_id = ${clientId}`;
	}

	/** Supabase Auth answers of DELETE /user/oauth/grants: 204, the documented 404, or an outage. */
	const ANSWERS = {
		revoked: () => new Response(null, { status: 204 }),
		noGrant: () => Response.json({ code: 404, error_code: 'oauth_consent_not_found', msg: 'No active grant found' }, { status: 404 }),
		otherNotFound: () => new Response('<html>Not Found</html>', { status: 404, headers: { 'content-type': 'text/html' } }),
		down: () => new Response('boom', { status: 500 }),
		refused: () => new Response(null, { status: 401 }),
	};

	function stubSupabase(answer: () => Response) {
		const calls: { url: string; init?: RequestInit }[] = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			calls.push({ url: String(input), init });
			return answer();
		});
		return calls;
	}

	it('lists the own agents, most recently renewed first, never other people\'s', async () => {
		const anna = await actors.user();
		const bruno = await actors.user();
		const claude = await oauthClient('Claude Code');
		const codex = await oauthClient('Codex');
		const silent = await oauthClient(null);
		await connect(anna.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-10T09:30:00Z' });
		await connect(anna.userId, codex, { grantedAt: '2026-10-02T10:00:00Z', renewedAt: '2026-10-11T08:00:00Z' });
		await connect(anna.userId, silent, { grantedAt: '2026-10-03T10:00:00Z', renewedAt: '2026-10-03T10:00:00Z' });
		await actors.db.admin`delete from auth.sessions where oauth_client_id = ${silent}`;
		await connect(bruno.userId, claude, { grantedAt: '2026-10-05T10:00:00Z', renewedAt: '2026-10-11T12:00:00Z' });

		expect(await anna.client.agents.list({})).toEqual([
			{ clientId: codex, name: 'Codex', connectedAt: '2026-10-02T10:00:00.000Z', lastRenewedAt: '2026-10-11T08:00:00.000Z', current: false },
			{ clientId: claude, name: 'Claude Code', connectedAt: '2026-10-01T10:00:00.000Z', lastRenewedAt: '2026-10-10T09:30:00.000Z', current: false },
			{ clientId: silent, name: '', connectedAt: '2026-10-03T10:00:00.000Z', lastRenewedAt: null, current: false },
		]);
	});

	it('marks the calling agent as current, over MCP', async () => {
		const carla = await actors.user();
		const claude = await oauthClient('Claude Code');
		const agent = await connect(carla.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'agents_list', arguments: {} });
		expect(result.status).toBe(200);
		expect(toolBody(result)).toEqual([expect.objectContaining({ clientId: claude, current: true })]);
	});

	it('publishes agents_list as read-only and agents_disconnect as a tool', async () => {
		const dario = await actors.user();
		const result = await mcp(actors.app, actors.env, dario.token, 'tools/list');
		const tools = result.body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
		expect(tools.find((t) => t.name === 'agents_list')?.annotations?.readOnlyHint).toBe(true);
		expect(tools.find((t) => t.name === 'agents_disconnect')?.annotations?.readOnlyHint).toBe(false);
	});

	it('disconnects through Supabase Auth with the caller token; already disconnected is fine', async () => {
		const elena = await actors.user();
		const clientId = crypto.randomUUID();
		const calls = stubSupabase(ANSWERS.revoked);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe(`${TEST_SUPABASE_URL}/auth/v1/user/oauth/grants?client_id=${clientId}`);
		expect(calls[0]!.init?.headers).toEqual({ authorization: `Bearer ${elena.token}`, apikey: 'sb_publishable_test' });
		vi.restoreAllMocks();
		stubSupabase(ANSWERS.noGrant);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
	});

	it('answers internal when Supabase Auth fails or answers another 404, unauthorized when it refuses the token', async () => {
		const franco = await actors.user();
		for (const answer of [ANSWERS.down, ANSWERS.otherNotFound]) {
			stubSupabase(answer);
			expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('internal');
			vi.restoreAllMocks();
		}
		stubSupabase(ANSWERS.refused);
		expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('unauthorized');
	});

	it('when the revocation fails the agent keeps working and stays in the list', async () => {
		const hugo = await actors.user();
		const a = await oauthClient('Agent A');
		const agent = await connect(hugo.userId, a, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		stubSupabase(ANSWERS.down);
		expect((await errorOf(hugo.client.agents.disconnect({ clientId: a }))).code).toBe('internal');
		vi.restoreAllMocks();
		expect((await agent.client.session.whoami({})).channel).toBe('mcp');
		expect((await hugo.client.agents.list({})).map((row) => row.clientId)).toEqual([a]);
	});

	it('after the revocation the agent token is refused on MCP, RPC and REST; the rest keeps working', async () => {
		const gina = await actors.user();
		const a = await oauthClient('Agent A');
		const b = await oauthClient('Agent B');
		const agentA = await connect(gina.userId, a, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		const agentB = await connect(gina.userId, b, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		// The agent disconnects itself over MCP: the answer arrives, then Supabase has removed its sessions.
		// Simulated here; the real path, with real tokens and Supabase, is the CI end-to-end check (Task 4).
		stubSupabase(ANSWERS.revoked);
		const own = await mcp(actors.app, actors.env, agentA.token, 'tools/call', { name: 'agents_disconnect', arguments: { clientId: a } });
		expect(own.status).toBe(200);
		expect(own.body.result.isError).toBeFalsy();
		expect(toolBody(own)).toEqual({ clientId: a });
		vi.restoreAllMocks();
		await supabaseRevokes(gina.userId, a);

		const refused = await mcp(actors.app, actors.env, agentA.token, 'tools/call', { name: 'session_whoami', arguments: {} });
		expect(refused.status).toBe(401);
		expect(refused.headers.get('www-authenticate')).toMatch(/^Bearer /);
		expect((await errorOf(agentA.client.session.whoami({}))).code).toBe('unauthorized');
		expect((await rest(actors.app, actors.env, 'GET', '/api/session/whoami', agentA.token)).status).toBe(401);

		expect((await agentB.client.session.whoami({})).channel).toBe('mcp');
		expect((await gina.client.session.whoami({})).channel).toBe('web');
		expect((await gina.client.agents.list({})).map((agent) => agent.clientId)).toEqual([b]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run contract/src/agents/agents-contract.test.ts` e `TEST_DATABASE_URL=$TEST_DATABASE_URL npm test -w server -- test/agents.test.ts`
Expected: FAIL, `Cannot find module './operations.ts'` nel contratto; nel server i test di `agents` falliscono (non `skipped`: con `TEST_DATABASE_URL` assente l'esecuzione non vale).

- [ ] **Step 3: Write minimal implementation**

Contratto:

```ts
// contract/src/agents/operations.ts
import { z } from 'zod';
import { op } from '../op.ts';

export const connectedAgentSchema = z.object({
	/** OAuth client id assigned by Supabase (`auth.oauth_clients.id`). */
	clientId: z.uuid(),
	/** Name the client registered with; not verified, may be empty. */
	name: z.string(),
	/** When the person first allowed this client. */
	connectedAt: z.iso.datetime({ offset: true }),
	/**
	 * Last token issue or renewal of any live session of the client; null without sessions.
	 * Not the last use: a client may renew without calling the app, or call it without renewing.
	 */
	lastRenewedAt: z.iso.datetime({ offset: true }).nullable(),
	/** The caller is this client (MCP channel with the same `client_id`). */
	current: z.boolean(),
});
export type ConnectedAgent = z.infer<typeof connectedAgentSchema>;

export const agentsContract = {
	list: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({
			method: 'GET',
			path: '/agents',
			summary:
				'Agents (MCP clients) you have connected to your account, with the last renewal of their access (not their last use), most recently renewed first',
		})
		.input(z.object({}))
		.output(z.array(connectedAgentSchema)),
	disconnect: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/agents/disconnect',
			summary:
				'Disconnect an agent: revokes its authorisation and ends its sessions at once, including this agent if it is the caller. Access obtained otherwise (for example with a changed password) is not affected',
		})
		.input(z.object({ clientId: z.uuid() }))
		.output(z.object({ clientId: z.uuid() })),
};
```

```ts
// contract/src/agents/index.ts
export * from './operations.ts';
```

In `contract/src/contract.ts` aggiungere l'import `import { agentsContract } from './agents/index.ts';` e, nell'oggetto `contract`, la riga `agents: agentsContract,` dopo `catalogue: catalogueContract,`. In `contract/src/index.ts` aggiungere `export * from './agents/index.ts';` in fondo.

Server:

```ts
// server/src/agents/router.ts
import type { ConnectedAgent } from '@app/contract';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { revokeGrant } from './grants.ts';

interface AgentRow {
	client_id: string;
	name: string;
	connected_at: Date;
	last_renewed_at: Date | null;
}

/** Most recently renewed first, agents without sessions last, then the newest connection. */
function byLastRenewal(a: ConnectedAgent, b: ConnectedAgent): number {
	if (a.lastRenewedAt !== b.lastRenewedAt) {
		if (a.lastRenewedAt === null) return 1;
		if (b.lastRenewedAt === null) return -1;
		return a.lastRenewedAt < b.lastRenewedAt ? 1 : -1;
	}
	return a.connectedAt < b.connectedAt ? 1 : a.connectedAt > b.connectedAt ? -1 : 0;
}

export function agentsRouter(os: Implementer) {
	return {
		list: os.agents.list.handler(async ({ context }) => {
			const rows = await context.tx<AgentRow[]>`
				select client_id, name, connected_at, last_renewed_at from app.connected_agents()`;
			return rows
				.map((row) => ({
					clientId: row.client_id,
					name: row.name,
					connectedAt: row.connected_at.toISOString(),
					lastRenewedAt: row.last_renewed_at?.toISOString() ?? null,
					current: row.client_id === context.clientId,
				}))
				.sort(byLastRenewal);
		}),

		/** Supabase deletes the client's sessions; every next request of that agent is refused. */
		disconnect: os.agents.disconnect.handler(async ({ context, input }) => {
			if (!context.token) throw appError('unauthorized');
			await revokeGrant({
				supabaseUrl: context.env.SUPABASE_URL,
				publishableKey: context.env.SUPABASE_PUBLISHABLE_KEY,
				accessToken: context.token,
				clientId: input.clientId,
			});
			return { clientId: input.clientId };
		}),
	};
}
```

In `server/src/router.ts` (nello stesso commit del contratto: senza, il typecheck del server fallisce con `Property 'agents' is missing`) aggiungere `import { agentsRouter } from './agents/router.ts';` e, nell'oggetto passato a `os.router`, `agents: agentsRouter(os),` dopo `catalogue: catalogueRouter(os),`.

Se Postgres.js restituisce i `timestamptz` come stringhe invece che `Date` (controllare con `grep -rn "toISOString\|types:" server/src/db.ts server/src/*/views.ts`), convertire con `new Date(value).toISOString()`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run contract/src/agents/agents-contract.test.ts && npm test -w contract && npm run typecheck -w contract
TEST_DATABASE_URL=$TEST_DATABASE_URL npm test -w server && npm run typecheck -w server
npm run typecheck -w web
```

Expected: PASS, nessun file `skipped`; compresi `contract.test.ts`, il controllo dei metadati di `check.test.ts`, `test/agents.test.ts` e i test esistenti di MCP che contano gli strumenti (se un test elenca tutti gli strumenti, aggiungere `agents_list` e `agents_disconnect` nell'ordine atteso). Il web compila: `agents` non è ancora in `SERVER_AREAS` (Task 7).

- [ ] **Step 5: Commit**

```bash
git add contract/src/agents contract/src/contract.ts contract/src/index.ts server/src/agents/router.ts server/test/agents.test.ts server/src/router.ts
git commit -m "Agenti: area agents del contratto e gestori del server, con strumenti MCP"
```

---

### Task 4: Server OAuth locale, prova end-to-end e CI

Il percorso reale in CI (rilievo 6): token veri del server OAuth locale, Worker vero, scollegamento solo con `agents.disconnect`, confini PKCE e redirect provati come integrazione (la validazione resta a Supabase, il Worker non la duplica).

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.github/workflows/ci.yml` (modifica dichiarata nella PR)
- Modify: `supabase/README.md`
- Modify: `server/README.md`
- Create: `scripts/oauth/agents-e2e.mjs`
- Create: `scripts/oauth/agents-e2e.sh`

**Interfaces:**
- Consumes: stack Supabase locale con Auth, le migrazioni e il seed (`anna@example.test`, `bruno@example.test`, password `password123`), Worker locale (`wrangler dev`), operazioni `session.whoami`, `agents.list`, `agents.disconnect` (Task 3) su MCP, RPC e REST.
- Produces: `scripts/oauth/agents-e2e.sh` (prepara ed esegue, esce con il codice dello script) e `node scripts/oauth/agents-e2e.mjs` (0 se tutto come nella spec, 1 altrimenti); passo della CI che li esegue a ogni PR.

- [ ] **Step 1: Write the end-to-end script**

```js
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
	const deniedUrl = new URL((await decide(new URL(denied.location).searchParams.get('authorization_id'), anna.access_token, 'deny')).body.redirect_url);
	is('cancel sends access_denied', deniedUrl.searchParams.get('error'), 'access_denied');
	is('cancel keeps the state', deniedUrl.searchParams.get('state'), 'state-deny');

	const expired = await authorize(clientB, { challenge: pkce().challenge });
	const expiredId = new URL(expired.location).searchParams.get('authorization_id');
	const sql = postgres(DB, { max: 1, onnotice: () => {} });
	// Column names checked on gotrue v2.197.0 (`\d auth.oauth_authorizations`).
	await sql`update auth.oauth_authorizations set expires_at = now() - interval '1 minute' where authorization_id = ${expiredId}`;
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
```

```bash
#!/usr/bin/env bash
# scripts/oauth/agents-e2e.sh — runs the agents end-to-end check against the local stack
# (`supabase start` with Auth and the OAuth server of supabase/config.toml). Used by CI;
# runnable locally. Starts `wrangler dev` on 8787 and stops it at the end.
set -euo pipefail
cd "$(dirname "$0")/../.."

status=$(supabase status -o env)
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
API_URL=$(value API_URL)
DB_URL=$(value DB_URL)
KEY=$(value PUBLISHABLE_KEY)
[ -n "$API_URL" ] && [ -n "$DB_URL" ] && [ -n "$KEY" ] || { echo "supabase status: API_URL, DB_URL or PUBLISHABLE_KEY missing (is Auth running?)"; exit 1; }

# The Worker connects as app_server, as through Hyperdrive in production (same password as the server tests).
DB_URL="$DB_URL" node --input-type=module -e "import postgres from 'postgres'; const sql = postgres(process.env.DB_URL, { max: 1 }); await sql.unsafe(\"alter role app_server password 'app_server_test'\"); await sql.end();"
app_url=$(node -e "const u = new URL(process.argv[1]); u.username = 'app_server'; u.password = 'app_server_test'; console.log(u.toString())" "$DB_URL")

[ -f web/dist/index.html ] || npm run build -w web
env_file=server/.env
[ -f "$env_file" ] && { echo "$env_file exists: move it away first, the check writes its own"; exit 1; }
printf 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=%s\nSUPABASE_URL=%s\nSUPABASE_PUBLISHABLE_KEY=%s\n' "$app_url" "$API_URL" "$KEY" > "$env_file"

log=$(mktemp)
(cd server && npx wrangler dev --port 8787 --ip 127.0.0.1 > "$log" 2>&1) &
worker=$!
cleanup() { kill "$worker" 2>/dev/null || true; rm -f "$env_file"; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://127.0.0.1:8787/.well-known/oauth-protected-resource/mcp && break
  sleep 1
done
curl -sf -o /dev/null http://127.0.0.1:8787/.well-known/oauth-protected-resource/mcp || { echo "Worker did not start"; cat "$log"; exit 1; }

SUPABASE_URL="$API_URL" DB_URL="$DB_URL" SUPABASE_PUBLISHABLE_KEY="$KEY" node scripts/oauth/agents-e2e.mjs || { cat "$log"; exit 1; }
```

Durante l'implementazione controllare: i nomi delle variabili di `supabase status -o env` con Auth avviato (`API_URL`, `DB_URL`, `PUBLISHABLE_KEY`) e correggere `value` se diversi; le colonne di `auth.oauth_authorizations` (`authorization_id`, `expires_at`) con `\d`; la forma degli errori di `/oauth/token` (lo script accetta qualunque 4xx senza `access_token`). Se un assunto dello script non regge, si corregge lo script, non il comportamento atteso della spec; se cambia il comportamento atteso, `STATO: DOMANDA`.

- [ ] **Step 2: Run it to verify it fails**

Run (stack con Auth, configurazione di `main`, server OAuth spento):

```bash
chmod +x scripts/oauth/agents-e2e.sh
supabase stop && supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
supabase db reset
scripts/oauth/agents-e2e.sh
```

Expected: FAIL, `registration: 404` (o un altro rifiuto della registrazione dinamica): il server OAuth non è attivo.

- [ ] **Step 3: Configurazione locale**

In `supabase/config.toml`:

```toml
[auth]
# …
# The web app's Vite dev server: the consent page /authorize lives there (spec «Collegamento degli agenti»).
site_url = "http://127.0.0.1:5174"
# …
additional_redirect_urls = ["https://127.0.0.1:3000", "http://127.0.0.1:8787"]
```

```toml
# OAuth server configuration
[auth.oauth_server]
# Agents connect through it (spec section 13); the consent page is the web app's /authorize.
enabled = true
# Path for OAuth consent flow UI
authorization_url_path = "/authorize"
# Allow dynamic client registration: Claude Code and Codex CLI register themselves.
allow_dynamic_registration = true
```

Controllare che lo stack locale firmi i token con una chiave asimmetrica (il Worker accetta solo ES256 e RS256): `curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` deve contenere una chiave con `alg` `ES256` o `RS256`. Lo script lo verifica comunque al primo passo.

- [ ] **Step 4: CI**

In `.github/workflows/ci.yml`, job `check`: lo stack con Auth al posto del solo database, e la prova dopo i test.

```yaml
      # Local Supabase with Auth and the OAuth server (supabase/config.toml); no production credentials.
      - run: supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
      - run: supabase test db
      - run: npm ci
      - run: npm run typecheck
      # CI is set by GitHub Actions: database suites fail instead of being skipped.
      - run: npm test
      # Agents end to end: real OAuth tokens, the Worker under wrangler dev, disconnection through the app.
      - run: npm run build -w web
      - run: scripts/oauth/agents-e2e.sh
```

(`supabase db start` sostituito da `supabase start -x …`, che avvia database, Auth, gateway e PostgREST.) Misurare la durata del job sulla PR rispetto a `main`: se cresce di oltre qualche minuto, spostare avvio di Auth, build e prova in un job separato `agents-e2e` reso obbligatorio, e dirlo nella PR.

- [ ] **Step 5: Run it to verify it passes**

Run:

```bash
supabase stop && supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
supabase db reset
npm run build -w web
scripts/oauth/agents-e2e.sh
```

Expected: ogni riga `ok`, uscita 0. Controllo che lo script sappia fallire sul percorso dell'app: con `agents: agentsRouter(os),` tolto temporaneamente da `server/src/router.ts` (modifica non committata, `wrangler dev` non fa typecheck) le righe `disconnect` diventano `FAIL` e l'uscita è 1; poi ripristinare il file.

- [ ] **Step 6: Documentation**

`supabase/README.md`, dopo il paragrafo «Per accedere con Auth locale…», aggiungere:

```markdown
### Agenti MCP in locale

`config.toml` attiva il server OAuth 2.1 (percorso di consenso `/authorize`, registrazione
dinamica) e usa come Site URL il Vite di sviluppo (`http://127.0.0.1:5174`), dove vive la
pagina di consenso. Per collegare Claude Code allo stack locale: Worker su 8787
(`npm run dev -w server`), web su 5174 (`npm run dev -w web`), poi dalla pagina
Profilo › Collega un agente copia indirizzo e comando (in sviluppo puntano al Worker) e in
Claude Code `/mcp` › Authenticate. `scripts/oauth/agents-e2e.sh` esegue la prova
end-to-end della CI (token reali, scollegamento dall'app e dall'agente). Se
`supabase start` fallisce con «failed to copy secret file into container», vedi
`progetto/coordinamento/messaggi/w2-podman.md`.
```

`server/README.md`, nel punto 2 di «Sviluppo locale», aggiungere dopo la frase sulla connessione: «e la chiave pubblica (`SUPABASE_PUBLISHABLE_KEY`, da `supabase status`), usata per scollegare gli agenti tramite Supabase Auth»; in «Test», dopo la frase sulla CI: «La CI avvia anche Auth (`supabase start`) ed esegue `scripts/oauth/agents-e2e.sh`, la prova end-to-end degli agenti con il Worker».

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml .github/workflows/ci.yml supabase/README.md server/README.md scripts/oauth
git commit -m "Agenti: server OAuth locale e prova end-to-end in CI"
```

---

### Task 5: Consenso nel backend di autenticazione del web

**Files:**
- Modify: `web/src/auth/backend.ts`
- Modify: `web/src/auth/supabaseBackend.ts`
- Modify: `web/src/auth/supabaseBackend.test.ts`
- Modify: `web/src/test/stubBackend.ts`

**Interfaces:**
- Produces (in `web/src/auth/backend.ts`):

```ts
export type AgentAuthorization =
  | { kind: 'consent'; id: string; clientName: string; clientId: string; redirectUri: string; scopes: string[] }
  | { kind: 'redirect'; url: string };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';
export type AuthorizationResult<T> = { ok: true; value: T } | { ok: false; reason: AuthorizationFailure };
// AuthBackend gains:
getAuthorization(id: string): Promise<AuthorizationResult<AgentAuthorization>>;
decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<AuthorizationResult<string>>; // value: URL to go to
export const DEMO_AUTHORIZATION: AgentAuthorization; // a consent of «Claude Code» with the scopes openid, email, profile
```

- `StubBackend` gains `authorization: AuthorizationResult<AgentAuthorization>`, `decision: AuthorizationResult<string>`, `decisions: { id: string; decision: 'approve' | 'deny' }[]`, `holdAuthorization(): (result: AuthorizationResult<AgentAuthorization>) => void`, `holdDecision(): (result: AuthorizationResult<string>) => void` (ogni chiamata trattiene la prossima risposta; più chiamate trattengono risposte successive in ordine, per i test con risposte invertite).

- [ ] **Step 1: Write the failing test**

Aggiungere a `web/src/auth/supabaseBackend.test.ts` (accanto ai test esistenti, che costruiscono il backend con `createSupabaseBackend(url, key, { auth, storage })`):

```ts
describe('agent consent', () => {
  const oauth = (overrides: Partial<Record<'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization', unknown>>) =>
    ({
      getAuthorizationDetails: vi.fn(),
      approveAuthorization: vi.fn(),
      denyAuthorization: vi.fn(),
      ...overrides
    }) as unknown as OAuthApi;

  it('reads a request that needs consent: client name, id, return page and scopes', async () => {
    const api = oauth({
      getAuthorizationDetails: vi.fn(async () => ({
        data: { authorization_id: 'auth-1', redirect_uri: 'http://localhost/cb', client: { id: 'c-1', name: 'Claude Code', uri: '', logo_uri: '' }, user: { id: 'u', email: 'a@x' }, scope: 'openid  email profile ' },
        error: null
      }))
    });
    const backend = createSupabaseBackend('http://sb', 'key', { auth: fakeAuth(), storage: memoryStorage(), oauth: api });
    expect(await backend.getAuthorization('auth-1')).toEqual({
      ok: true,
      value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code', clientId: 'c-1', redirectUri: 'http://localhost/cb', scopes: ['openid', 'email', 'profile'] }
    });
  });

  it('goes straight back to the agent when the grant is already active', async () => {
    const api = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?code=x' }, error: null })) });
    const backend = createSupabaseBackend('http://sb', 'key', { auth: fakeAuth(), storage: memoryStorage(), oauth: api });
    expect(await backend.getAuthorization('auth-1')).toEqual({ ok: true, value: { kind: 'redirect', url: 'http://localhost/cb?code=x' } });
  });

  it('maps missing or expired requests and network failures', async () => {
    const missing = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 404, name: 'AuthApiError', message: 'not found' } })) });
    const offline = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 0, name: 'AuthRetryableFetchError', message: 'fetch failed' } })) });
    const broken = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 500, name: 'AuthApiError', message: 'boom' } })) });
    for (const [api, reason] of [[missing, 'not_found'], [offline, 'network'], [broken, 'unknown']] as const) {
      const backend = createSupabaseBackend('http://sb', 'key', { auth: fakeAuth(), storage: memoryStorage(), oauth: api });
      expect(await backend.getAuthorization('auth-1')).toEqual({ ok: false, reason });
    }
  });

  it('approves or denies without letting the library navigate, and returns where to go', async () => {
    const approve = vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?code=x' }, error: null }));
    const deny = vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?error=access_denied' }, error: null }));
    const backend = createSupabaseBackend('http://sb', 'key', { auth: fakeAuth(), storage: memoryStorage(), oauth: oauth({ approveAuthorization: approve, denyAuthorization: deny }) });
    expect(await backend.decideAuthorization('auth-1', 'approve')).toEqual({ ok: true, value: 'http://localhost/cb?code=x' });
    expect(approve).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true });
    expect(await backend.decideAuthorization('auth-1', 'deny')).toEqual({ ok: true, value: 'http://localhost/cb?error=access_denied' });
    expect(deny).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true });
  });
});
```

`fakeAuth()` e `memoryStorage()` sono i nomi da usare per gli aiuti già presenti nel file di test: se hanno un altro nome, usare quelli esistenti; `OAuthApi` si importa da `./supabaseBackend`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/auth/supabaseBackend.test.ts`
Expected: FAIL (`getAuthorization is not a function` e tipo `OAuthApi` mancante).

- [ ] **Step 3: Write minimal implementation**

In `web/src/auth/backend.ts`, dopo `AuthEvent`:

```ts
/** A consent request opened by an agent (OAuth server of Supabase Auth, spec section 13). */
export type AgentAuthorization =
  | {
      kind: 'consent';
      id: string;
      /** Name the client registered with; not verified. */
      clientName: string;
      /** OAuth client id and registered return page, to tell same-named clients apart. */
      clientId: string;
      redirectUri: string;
      /** Requested scopes (OIDC): data sent to the agent, not limits on what it can do. */
      scopes: string[];
    }
  /** Grant already active: Supabase skips the consent and sends the agent its code. */
  | { kind: 'redirect'; url: string };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';
export type AuthorizationResult<T> = { ok: true; value: T } | { ok: false; reason: AuthorizationFailure };
```

Nell'interfaccia `AuthBackend`:

```ts
  /** The agent's consent request; not_found when missing, expired or already decided. */
  getAuthorization(id: string): Promise<AuthorizationResult<AgentAuthorization>>;
  /** Allows or refuses the request; the value is the agent's URL to go to (code or error). */
  decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<AuthorizationResult<string>>;
```

Dopo `DEMO_USER`:

```ts
/** Fake mode: a demo request, so the consent screen can be seen without Supabase. */
export const DEMO_AUTHORIZATION: AgentAuthorization = {
  kind: 'consent',
  id: 'demo',
  clientName: 'Claude Code',
  clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
  redirectUri: 'http://localhost:33418/callback',
  scopes: ['openid', 'email', 'profile']
};
```

In `createFakeBackend`, nell'oggetto restituito:

```ts
    getAuthorization: async () => ({ ok: true, value: DEMO_AUTHORIZATION }),
    // No agent waits in fake mode: back to the connected agents.
    decideAuthorization: async () => ({ ok: true, value: '/profile/agents' })
```

In `web/src/auth/supabaseBackend.ts`:

```ts
import type { AgentAuthorization, AuthBackend, AuthorizationFailure, AuthorizationResult, AuthUser, SignInFailure } from './backend';

export type OAuthApi = Pick<SupabaseClient['auth']['oauth'], 'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization'>;

export function authorizationFailure(error: { status?: number; name?: string }): AuthorizationFailure {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (error.status === 400 || error.status === 404) return 'not_found';
  return 'unknown';
}
```

Firma e costruzione del client (sostituiscono le righe attuali):

```ts
export function createSupabaseBackend(
  url: string,
  publishableKey: string,
  deps: { auth?: AuthClient; oauth?: OAuthApi; storage?: Pick<Storage, 'getItem' | 'removeItem'> } = {}
): AuthBackend {
  const storage = deps.storage ?? window.localStorage;
  const client = deps.auth
    ? null
    : createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }
      });
  const auth: AuthClient = deps.auth ?? client!.auth;
  const oauth: OAuthApi | null = deps.oauth ?? client?.auth.oauth ?? null;
```

Nell'oggetto restituito, dopo `getCredentials`:

```ts
    async getAuthorization(id): Promise<AuthorizationResult<AgentAuthorization>> {
      if (!oauth) return { ok: false, reason: 'unknown' };
      const { data, error } = await oauth.getAuthorizationDetails(id);
      if (error || !data) return { ok: false, reason: error ? authorizationFailure(error) : 'unknown' };
      return 'authorization_id' in data
        ? {
            ok: true,
            value: {
              kind: 'consent',
              id: data.authorization_id,
              clientName: data.client.name ?? '',
              clientId: data.client.id,
              redirectUri: data.redirect_uri,
              scopes: data.scope.split(' ').filter(Boolean)
            }
          }
        : { ok: true, value: { kind: 'redirect', url: data.redirect_url } };
    },
    async decideAuthorization(id, decision) {
      if (!oauth) return { ok: false, reason: 'unknown' };
      const options = { skipBrowserRedirect: true };
      const { data, error } = decision === 'approve' ? await oauth.approveAuthorization(id, options) : await oauth.denyAuthorization(id, options);
      if (error || !data) return { ok: false, reason: error ? authorizationFailure(error) : 'unknown' };
      return { ok: true, value: data.redirect_url };
    }
```

In `web/src/test/stubBackend.ts`: aggiungere a `StubBackend`

```ts
  /** Answer of getAuthorization (a consent of «Claude Code» by default). */
  authorization: AuthorizationResult<AgentAuthorization>;
  /** Answer of decideAuthorization. */
  decision: AuthorizationResult<string>;
  decisions: { id: string; decision: 'approve' | 'deny' }[];
  /** The next getAuthorization() not yet held waits until the returned function answers it. */
  holdAuthorization(): (result: AuthorizationResult<AgentAuthorization>) => void;
  /** The next decideAuthorization() not yet held waits until the returned function answers it. */
  holdDecision(): (result: AuthorizationResult<string>) => void;
```

e nell'oggetto `backend`:

```ts
    authorization: {
      ok: true,
      value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code', clientId: 'client-1', redirectUri: 'http://127.0.0.1:9/callback', scopes: ['openid', 'email'] }
    },
    decision: { ok: true, value: 'http://127.0.0.1:9/callback?code=x' },
    decisions: [],
    async getAuthorization() {
      return heldAuthorizations.shift() ?? backend.authorization;
    },
    async decideAuthorization(id, decision) {
      backend.decisions.push({ id, decision });
      return heldDecisions.shift() ?? backend.decision;
    },
    holdAuthorization() {
      let answer!: (result: AuthorizationResult<AgentAuthorization>) => void;
      heldAuthorizations.push(new Promise((resolve) => (answer = resolve)));
      return answer;
    },
    holdDecision() {
      let answer!: (result: AuthorizationResult<string>) => void;
      heldDecisions.push(new Promise((resolve) => (answer = resolve)));
      return answer;
    },
```

con `const heldAuthorizations: Promise<AuthorizationResult<AgentAuthorization>>[] = [];` e `const heldDecisions: Promise<AuthorizationResult<string>>[] = [];` accanto alle altre variabili `held…` e i tipi importati da `../auth/backend`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/auth && npm run typecheck -w web`
Expected: PASS; typecheck pulito (tutti gli `AuthBackend` implementano i due metodi).

- [ ] **Step 5: Commit**

```bash
git add web/src/auth/backend.ts web/src/auth/supabaseBackend.ts web/src/auth/supabaseBackend.test.ts web/src/test/stubBackend.ts
git commit -m "Agenti: richiesta di consenso nel backend di autenticazione del web"
```

---

### Task 6: Pagina di consenso `/authorize`

**Files:**
- Create: `web/src/features/agents/AuthorizePage.tsx`
- Create: `web/src/features/agents/AuthorizePage.module.css`
- Create: `web/src/features/agents/AuthorizePage.test.tsx`
- Create: `web/src/features/agents/leave.ts`
- Create: `web/src/features/agents/search.ts`
- Create: `web/src/features/agents/scopes.ts`
- Create: `web/src/i18n/messages/agents.ts`
- Modify: `web/src/i18n/messages/index.ts`
- Modify: `web/src/router.tsx`
- Modify: `web/src/test/renderApp.tsx` (opzione `channel`, per vedere i messaggi alle altre schede)

**Interfaces:**
- Consumes: `AuthBackend.getAuthorization`, `decideAuthorization` (Task 5), `useAuth()`, `useSignOut()` (`web/src/session/SessionScope`), `useProfile()` (`web/src/session/useFamily`), `isBlocking`, `useOnline()`, `useT()`.
- Produces: `leavePage.to(url: string): void` (navigazione fuori dalla SPA, sostituibile nei test), `validateAuthorizeSearch(raw: Record<string, unknown>): { authorization_id?: string }`, `scopeKey(scope: string): MessageKey | null`, rotta `/authorize`, dizionario `agents.ts` con le chiavi `authorize.*` e (Task 7) `agents.*`, `client.*`, `copy.*`; `renderApp(path, { channel })`.

Regole della pagina (spec, «Pagina di consenso»), che i test fissano:

- **Generazioni** (rilievo 2): ogni lettura della richiesta apre una generazione nuova; uscita dalla pagina, cambio account, cambio di `authorization_id` e «Riprova» chiudono quella in corso. Lettura e decisione, al ritorno, aggiornano lo stato o navigano solo se la loro generazione è ancora quella corrente.
- **Profilo prima di «Consenti»** (rilievo 3): «Consenti» è attivo solo con il profilo dell'identità corrente letto; in caricamento o in errore resta disabilitato, «Annulla» no.
- **Cambia account** (rilievo 4): `useSignOut()`, la chiusura comune di «Esci»; la guardia della rotta porta al login con il ritorno alla richiesta.
- **Testi veritieri** (rilievo 1): poteri su password e sessioni, effetto limitato di «Scollega».

- [ ] **Step 1: Write the failing test**

In `web/src/test/renderApp.tsx` aggiungere l'opzione `channel?: SessionChannel` (tipo da `../session/channel`) e passare `channel={options.channel ?? createMemoryHub().channel()}` ad `AppRoot`.

```tsx
// web/src/features/agents/AuthorizePage.test.tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { createMemoryStore } from '../../api/persister';
import { DEMO_USER } from '../../auth/backend';
import { queueKey } from '../shopping/storage';
import { setOnline } from '../../test/connectivity';
import { createMemoryHub } from '../../test/memoryChannel';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { leavePage } from './leave';

const OTHER = { id: 'user-other', email: 'bruno@example.test' };
const consent = (overrides: Partial<{ id: string; clientName: string }> = {}) => ({
  ok: true as const,
  value: { kind: 'consent' as const, id: 'auth-1', clientName: 'Claude Code', clientId: 'client-1', redirectUri: 'http://127.0.0.1:9/callback', scopes: ['openid', 'email'], ...overrides }
});

describe('agent consent page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('shows who asks, with which account, what it can do on the account, the data and the limits of «Scollega»; allows once', async () => {
    const backend = createStubBackend(DEMO_USER);
    const hold = backend.holdDecision();
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    expect(await screen.findByRole('heading', { name: 'Claude Code vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
    expect(screen.getByText('È il nome con cui l’agente si presenta: non è verificato.')).toBeTruthy();
    expect(screen.getByText(DEMO_USER.email)).toBeTruthy();
    expect(screen.getByText(/Agirà con il tuo account, come se fossi tu/)).toBeTruthy();
    expect(screen.getByText(/Potrà anche cambiare la password del tuo account e chiudere le tue sessioni/)).toBeTruthy();
    expect(screen.getByText('Eliminare una famiglia resta possibile solo nell’app.')).toBeTruthy();
    expect(screen.getByText(/revoca questa autorizzazione e le sessioni dell’agente/)).toBeTruthy();
    expect(screen.getByText(/Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala/)).toBeTruthy();
    expect(screen.queryByText(/quando vuoi|bloccarlo/)).toBeNull();
    // Scopes: what the agent receives, not limits.
    expect(screen.getByText('un identificativo del tuo account')).toBeTruthy();
    expect(screen.getByText('il tuo indirizzo email')).toBeTruthy();
    expect(screen.getByText(/non ciò che può fare/)).toBeTruthy();
    // Details to tell same-named clients apart.
    expect(screen.getByText('client-1')).toBeTruthy();
    expect(screen.getByText('http://127.0.0.1:9/callback')).toBeTruthy();

    const allow = await screen.findByRole('button', { name: 'Consenti' });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    hold({ ok: true, value: 'http://127.0.0.1:9/callback?code=x' });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=x'));
    expect(backend.decisions).toEqual([{ id: 'auth-1', decision: 'approve' }]);
  });

  it('adds the global roles once the profile is read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    vi.spyOn(api.profile, 'get').mockResolvedValue({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator', 'app_admin'] } });
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    expect(await screen.findByText('Potrà anche gestire il ricettario.')).toBeTruthy();
    expect(screen.getByText('Potrà anche amministrare l’app.')).toBeTruthy();
  });

  it('keeps «Consenti» disabled until the profile of this person is read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    let answer!: (value: typeof profile) => void;
    vi.spyOn(api.profile, 'get').mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    const allow = await screen.findByRole('button', { name: 'Consenti' });
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sto leggendo il tuo profilo…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(false);
    answer({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator'] } });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Potrà anche gestire il ricettario.')).toBeTruthy();
  });

  it('with the profile in error: no «Consenti», a retry, «Annulla» still there', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const read = vi.spyOn(api.profile, 'get').mockRejectedValue(new ApiError('internal'));
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    expect(await screen.findByText(/Non è stato possibile leggere il tuo profilo/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(false);
    read.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('shows a hostile or very long client name as plain text', async () => {
    const backend = createStubBackend(DEMO_USER);
    const hostile = `<img src=x onerror="alert(1)">${'Claude'.repeat(40)}`;
    backend.authorization = consent({ clientName: hostile });
    const { container } = renderApp('/authorize?authorization_id=auth-1', { backend });
    expect(await screen.findByRole('heading', { name: `${hostile} vuole usare Cosa si mangia con il tuo account` })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('refuses and sends the agent its error', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.decision = { ok: true, value: 'http://127.0.0.1:9/callback?error=access_denied' };
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?error=access_denied'));
    expect(backend.decisions).toEqual([{ id: 'auth-1', decision: 'deny' }]);
  });

  it('goes straight back to the agent when it is already connected', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=y' } };
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=y'));
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();
  });

  it('says the request is not valid when it is missing, expired or already used', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: false, reason: 'not_found' };
    renderApp('/authorize?authorization_id=old', { backend });
    expect(await screen.findByRole('heading', { name: 'Richiesta non valida o scaduta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();

    renderApp('/authorize', { backend: createStubBackend(DEMO_USER) });
    expect((await screen.findAllByRole('heading', { name: 'Richiesta non valida o scaduta' })).length).toBe(2);
  });

  it('lets the person try again after a network failure', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: false, reason: 'network' };
    renderApp('/authorize?authorization_id=auth-1', { backend });
    const retry = await screen.findByRole('button', { name: 'Riprova' });
    backend.authorization = consent({ clientName: 'Codex' });
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
  });

  describe('late answers never act on an abandoned request', () => {
    it('answers in reverse order after the request changed: only the current one counts', async () => {
      const backend = createStubBackend(DEMO_USER);
      const first = backend.holdAuthorization();
      const second = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      history.push('/authorize?authorization_id=auth-2');
      second(consent({ id: 'auth-2', clientName: 'Codex' }));
      expect(await screen.findByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
      first({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=old' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
    });

    it('leaving the page while the request is read', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      history.push('/profile');
      answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=late' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
    });

    it('leaving the page while the decision is sent', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdDecision();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      const allow = await screen.findByRole('button', { name: 'Consenti' });
      await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(allow);
      history.push('/profile');
      answer({ ok: true, value: 'http://127.0.0.1:9/callback?code=late' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
    });

    it('another account signs in while the request is read', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      backend.setUser(OTHER);
      answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=of-the-first' } });
      expect(await screen.findByText(OTHER.email)).toBeTruthy();
      expect(leave).not.toHaveBeenCalled();
    });

    it('another account signs in while the decision is sent', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdDecision();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      renderApp('/authorize?authorization_id=auth-1', { backend });
      const allow = await screen.findByRole('button', { name: 'Consenti' });
      await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(allow);
      backend.setUser(OTHER);
      answer({ ok: true, value: 'http://127.0.0.1:9/callback?code=of-the-first' });
      expect(await screen.findByText(OTHER.email)).toBeTruthy();
      expect(leave).not.toHaveBeenCalled();
      // The new person's request is loaded afresh: «Consenti» usable again, not stuck on the old decision.
      await waitFor(() => expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(false));
    });
  });

  it('asks to sign in first and comes back here', async () => {
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(null) });
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain(encodeURIComponent('/authorize?authorization_id=auth-1'));
  });

  it('switches account with the common sign-out, even when Supabase fails, and comes back to the request', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.signOutError = new Error('Auth unreachable');
    const store = createMemoryStore();
    store.entries.set(queueKey(DEMO_USER.id), { ops: [], notices: [], seq: 0 });
    const hub = createMemoryHub();
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend, store, channel: hub.channel() });
    fireEvent.click(await screen.findByRole('button', { name: 'Non sei tu? Cambia account' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain(encodeURIComponent('/authorize?authorization_id=auth-1'));
    expect(hub.sent).toContainEqual({ type: 'signedOut', userId: DEMO_USER.id });
    await waitFor(() => expect(store.entries.has(queueKey(DEMO_USER.id))).toBe(false));
    expect(backend.signOutCalls).toBe(1);

    backend.setUser(OTHER);
    await waitFor(() => expect(history.location.pathname).toBe('/authorize'));
    expect(await screen.findByText(OTHER.email)).toBeTruthy();
  });

  it('offline: explains that the connection is needed and offers no buttons', async () => {
    setOnline(false);
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByText('Serve la connessione per collegare un agente.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();
  });
});
```

Note per chi implementa: se il client delle query ritenta gli errori, il test del profilo in errore usa un codice che non si ritenta o i timer finti, come gli altri test di errore del web; `createMemoryStore()` espone `entries` come nei test della spesa (`ShoppingPage.test.tsx`); la coda della spesa è una chiave per utente registrata con `registerUserKeyPrefix`, che la chiusura comune cancella dopo l'uscita. Se la forma del valore in coda è controllata alla lettura, usare quella di `ShoppingPage.test.tsx`. Se la coda non sparisse con «Esci» nemmeno oggi, l'atteso è lo stesso di «Esci» (vedi i test di `SessionScope`): il test confronta con quel comportamento, non lo cambia.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/features/agents/AuthorizePage.test.tsx`
Expected: FAIL, `Cannot find module './leave'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/features/agents/leave.ts
/** Leaves the app for the agent's URL (its local callback); replaced in tests, where jsdom cannot navigate. */
export const leavePage = {
  to(url: string): void {
    window.location.assign(url);
  }
};
```

```ts
// web/src/features/agents/search.ts
export interface AuthorizeSearch { authorization_id?: string }

/** The id Supabase appends to the consent URL; anything else is dropped. */
export function validateAuthorizeSearch(raw: Record<string, unknown>): AuthorizeSearch {
  const id = raw.authorization_id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) ? { authorization_id: id } : {};
}
```

```ts
// web/src/features/agents/scopes.ts
import type { MessageKey } from '../../i18n/translate';

/** OIDC scopes Supabase offers: what the agent receives at sign-in, not what it can do. */
const SCOPES: Record<string, MessageKey> = {
  openid: 'authorize.scope.openid',
  email: 'authorize.scope.email',
  profile: 'authorize.scope.profile',
  phone: 'authorize.scope.phone',
  offline_access: 'authorize.scope.offline_access'
};

/** The sentence for a requested scope; null for an unknown one, shown as it is. */
export function scopeKey(scope: string): MessageKey | null {
  return Object.hasOwn(SCOPES, scope) ? SCOPES[scope]! : null;
}
```

```ts
// web/src/i18n/messages/agents.ts
export const it = {
  'authorize.title': '{client} vuole usare Cosa si mangia con il tuo account',
  'authorize.nameNote': 'È il nome con cui l’agente si presenta: non è verificato.',
  'authorize.account': 'Account',
  'authorize.notYou': 'Non sei tu? Cambia account',
  'authorize.can': 'Cosa potrà fare',
  'authorize.acts': 'Agirà con il tuo account, come se fossi tu: per esempio leggere e cambiare il menu, la spesa e la famiglia.',
  'authorize.actsCurator': 'Potrà anche gestire il ricettario.',
  'authorize.actsAdmin': 'Potrà anche amministrare l’app.',
  'authorize.authPowers': 'Potrà anche cambiare la password del tuo account e chiudere le tue sessioni, anche nel browser e degli altri agenti. Consenti solo agli agenti di cui ti fidi.',
  'authorize.familyDeletion': 'Eliminare una famiglia resta possibile solo nell’app.',
  'authorize.profileLoading': 'Sto leggendo il tuo profilo…',
  'authorize.profileFailed': 'Non è stato possibile leggere il tuo profilo: senza, non puoi consentire l’accesso.',
  'authorize.data': 'Dati che riceverà',
  'authorize.dataNote': 'Riguardano i dati che l’agente riceve all’accesso, non ciò che può fare.',
  'authorize.scope.openid': 'un identificativo del tuo account',
  'authorize.scope.email': 'il tuo indirizzo email',
  'authorize.scope.profile': 'il nome del tuo profilo di accesso',
  'authorize.scope.phone': 'il numero di telefono, se c’è',
  'authorize.scope.offline_access': 'restare collegato senza chiederti di nuovo l’accesso',
  'authorize.details': 'Dettagli dell’agente',
  'authorize.clientId': 'Identificativo',
  'authorize.redirectUri': 'Pagina di ritorno',
  'authorize.disconnect': 'Puoi scollegarlo da Profilo › Collega un agente: revoca questa autorizzazione e le sessioni dell’agente. Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala.',
  'authorize.allow': 'Consenti',
  'authorize.deny': 'Annulla',
  'authorize.leaving': 'Torno all’agente…',
  'authorize.invalid': 'Richiesta non valida o scaduta',
  'authorize.invalidBody': 'Riprova dall’agente: ti aprirà una pagina nuova.',
  'authorize.failed': 'Non è stato possibile leggere la richiesta.',
  'authorize.retry': 'Riprova',
  'authorize.offline': 'Serve la connessione per collegare un agente.'
};

export const en: Record<keyof typeof it, string> = {
  'authorize.title': '{client} wants to use Cosa si mangia with your account',
  'authorize.nameNote': 'This is the name the agent gives itself: it is not verified.',
  'authorize.account': 'Account',
  'authorize.notYou': 'Not you? Switch account',
  'authorize.can': 'What it will be able to do',
  'authorize.acts': 'It will act with your account, as if it were you: for example reading and changing the menu, the shopping and the family.',
  'authorize.actsCurator': 'It will also be able to manage the recipe book.',
  'authorize.actsAdmin': 'It will also be able to administer the app.',
  'authorize.authPowers': 'It will also be able to change your account password and end your sessions, including in the browser and those of other agents. Only allow agents you trust.',
  'authorize.familyDeletion': 'Deleting a family is still only possible in the app.',
  'authorize.profileLoading': 'Reading your profile…',
  'authorize.profileFailed': 'Your profile could not be read: without it, you cannot allow access.',
  'authorize.data': 'Data it will receive',
  'authorize.dataNote': 'These are the data the agent receives when it signs in, not limits on what it can do.',
  'authorize.scope.openid': 'an identifier of your account',
  'authorize.scope.email': 'your email address',
  'authorize.scope.profile': 'the name of your sign-in profile',
  'authorize.scope.phone': 'your phone number, if there is one',
  'authorize.scope.offline_access': 'staying connected without asking you again',
  'authorize.details': 'Agent details',
  'authorize.clientId': 'Identifier',
  'authorize.redirectUri': 'Return page',
  'authorize.disconnect': 'You can disconnect it from Profile › Connect an agent: this revokes the authorisation and the agent’s sessions. It does not end access obtained otherwise: if the agent has changed your password, change it.',
  'authorize.allow': 'Allow',
  'authorize.deny': 'Cancel',
  'authorize.leaving': 'Going back to the agent…',
  'authorize.invalid': 'Invalid or expired request',
  'authorize.invalidBody': 'Try again from the agent: it will open a new page.',
  'authorize.failed': 'The request could not be read.',
  'authorize.retry': 'Try again',
  'authorize.offline': 'You need a connection to connect an agent.'
};
```

In `web/src/i18n/messages/index.ts`: `import * as agents from './agents';` e aggiungere `...agents.it` all'oggetto `it` e `...agents.en` all'oggetto `en` (prima di `...errors.*`).

```tsx
// web/src/features/agents/AuthorizePage.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { isBlocking } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import type { AgentAuthorization, AuthorizationFailure } from '../../auth/backend';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import { useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import { leavePage } from './leave';
import { scopeKey } from './scopes';
import styles from './AuthorizePage.module.css';

const route = getRouteApi('/authorize');

type ConsentRequest = Extract<AgentAuthorization, { kind: 'consent' }>;
type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'failed' }
  | { kind: 'leaving' }
  | { kind: 'consent'; request: ConsentRequest };

/** Consent opened by an agent in the browser (spec section 13, round 6): who asks, as whom, allow or cancel. */
export function AuthorizePage() {
  const t = useT();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const online = useOnline();
  const { authorization_id: id } = route.useSearch();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  const usable = online && state.status === 'signedIn' && state.verified;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [deciding, setDeciding] = useState(false);
  const [decisionFailure, setDecisionFailure] = useState<AuthorizationFailure | null>(null);
  // Generation of (person, request): an answer of an older one changes nothing and never
  // navigates (review, finding 2). A second click arrives before the re-render: the ref, not
  // the state, keeps the decision to one call.
  const generation = useRef(0);
  const sending = useRef(false);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    sending.current = false;
    setDeciding(false);
    setDecisionFailure(null);
    if (!id) return setPhase({ kind: 'invalid' });
    setPhase({ kind: 'loading' });
    const result = await backend.getAuthorization(id);
    if (generation.current !== mine) return;
    if (!result.ok) return setPhase({ kind: result.reason === 'not_found' ? 'invalid' : 'failed' });
    if (result.value.kind === 'redirect') {
      setPhase({ kind: 'leaving' });
      return leavePage.to(result.value.url);
    }
    setPhase({ kind: 'consent', request: result.value });
  }, [backend, id]);

  useEffect(() => {
    if (!usable || !userId) return;
    void load();
    // Leaving the page, another person or another request: this generation ends.
    return () => {
      generation.current += 1;
    };
  }, [usable, userId, load]);

  async function decide(decision: 'approve' | 'deny') {
    if (phase.kind !== 'consent' || sending.current) return;
    const mine = generation.current;
    sending.current = true;
    setDeciding(true);
    setDecisionFailure(null);
    const result = await backend.decideAuthorization(phase.request.id, decision);
    if (generation.current !== mine) return;
    if (!result.ok) {
      sending.current = false;
      setDeciding(false);
      if (result.reason === 'not_found') return setPhase({ kind: 'invalid' });
      return setDecisionFailure(result.reason);
    }
    setPhase({ kind: 'leaving' });
    leavePage.to(result.value);
  }

  return (
    <main className="entry-page" id="app-content">
      <p className="entry-brand">{t('auth.brand')}</p>
      {!usable && <p className="meta-line">{t('authorize.offline')}</p>}
      {usable && phase.kind === 'loading' && <p className="meta-line" aria-busy="true">…</p>}
      {usable && phase.kind === 'leaving' && <p className="meta-line">{t('authorize.leaving')}</p>}
      {usable && phase.kind === 'invalid' && (
        <>
          <h1 className="entry-title">{t('authorize.invalid')}</h1>
          <p className="meta-line">{t('authorize.invalidBody')}</p>
        </>
      )}
      {usable && phase.kind === 'failed' && (
        <>
          <p className="form-error" role="alert">{t('authorize.failed')}</p>
          <button type="button" className="text-button wide" onClick={() => void load()}>{t('authorize.retry')}</button>
        </>
      )}
      {usable && phase.kind === 'consent' && userId && (
        // The common sign-out of «Esci» (review, finding 4): the route guard then opens the sign-in page with the way back here.
        <Consent request={phase.request} userId={userId} deciding={deciding} failure={decisionFailure} onDecide={decide} onSwitch={() => void signOut()} />
      )}
    </main>
  );
}

function Consent(props: {
  request: ConsentRequest;
  userId: string;
  deciding: boolean;
  failure: AuthorizationFailure | null;
  onDecide: (decision: 'approve' | 'deny') => void;
  onSwitch: () => void;
}) {
  const t = useT();
  const { state } = useAuth();
  const read = useProfile();
  // The roles shown must be those of this person: «Consenti» waits for them (review, finding 3).
  const profile = read.data?.user.id === props.userId ? read.data : undefined;
  const blocked = read.isError && isBlocking(read.error, !!profile);
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');
  const roles = profile?.user.globalRoles ?? [];
  const { request } = props;
  return (
    <>
      <h1 className={`entry-title ${styles.title}`}>{t('authorize.title', { client: request.clientName || '?' })}</h1>
      <p className="meta-line">{t('authorize.nameNote')}</p>
      <div className={styles.account}>
        <span className={styles.label}>{t('authorize.account')}</span>
        {profile && <strong>{profile.user.displayName}</strong>}
        <span>{email}</span>
        <button type="button" className={styles.plain} onClick={props.onSwitch}>{t('authorize.notYou')}</button>
      </div>
      <h2 className={styles.heading}>{t('authorize.can')}</h2>
      <p>{t('authorize.acts')}</p>
      {!profile && !blocked && <p className="meta-line" aria-busy="true">{t('authorize.profileLoading')}</p>}
      {blocked && (
        <>
          <p className="form-error" role="alert">{t('authorize.profileFailed')}</p>
          <button type="button" className="text-button" onClick={() => void read.refetch()}>{t('authorize.retry')}</button>
        </>
      )}
      {roles.includes('recipe_curator') && <p>{t('authorize.actsCurator')}</p>}
      {roles.includes('app_admin') && <p>{t('authorize.actsAdmin')}</p>}
      <p>{t('authorize.authPowers')}</p>
      <p>{t('authorize.familyDeletion')}</p>
      <h2 className={styles.heading}>{t('authorize.data')}</h2>
      <ul className={styles.scopes}>
        {request.scopes.map((scope) => {
          const key = scopeKey(scope);
          return <li key={scope}>{key ? t(key) : scope}</li>;
        })}
      </ul>
      <p className="meta-line">{t('authorize.dataNote')}</p>
      <details className={styles.details}>
        <summary>{t('authorize.details')}</summary>
        <dl>
          <dt>{t('authorize.clientId')}</dt>
          <dd>{request.clientId}</dd>
          <dt>{t('authorize.redirectUri')}</dt>
          <dd>{request.redirectUri}</dd>
        </dl>
      </details>
      <p>{t('authorize.disconnect')}</p>
      {props.failure && <p className="form-error" role="alert">{t(props.failure === 'network' ? 'error.network' : 'error.unknown')}</p>}
      <div className={styles.actions}>
        <button type="button" className="text-button primary wide" disabled={props.deciding || !profile} onClick={() => props.onDecide('approve')}>{t('authorize.allow')}</button>
        <button type="button" className="text-button wide" disabled={props.deciding} onClick={() => props.onDecide('deny')}>{t('authorize.deny')}</button>
      </div>
    </>
  );
}
```

`<details>` chiuso: Testing Library trova comunque il testo di `dd` (è nel DOM); i test non dipendono dall'apertura. Le chiavi `error.network` ed `error.unknown`: usare quelle già presenti in `web/src/i18n/messages/errors.ts` (controllare i nomi con `grep -n "network\|unknown" web/src/i18n/messages/errors.ts` e allinearle). Il profilo è letto con la chiave per persona di `profileQuery`: dopo un cambio account la sessione è nuova e `read.data` è della persona nuova; il confronto con `userId` resta come difesa.

```css
/* web/src/features/agents/AuthorizePage.module.css — round 6 consent, design.md tokens */
.title { overflow-wrap: anywhere; }
.account { display: grid; gap: 2px; margin: 16px 0; padding: 12px 16px; border-radius: 8px; background: var(--paper); box-shadow: var(--card-shadow); overflow-wrap: anywhere; }
.label { color: var(--muted); font-size: 0.8125rem; }
.plain { justify-self: start; min-height: 36px; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
.heading { margin: 20px 0 6px; font-size: 1rem; }
.scopes { margin: 4px 0; padding-left: 20px; }
.details { margin: 12px 0; overflow-wrap: anywhere; }
.details summary { min-height: 36px; font-weight: 700; cursor: pointer; }
.details dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 4px 0 0; font-size: 0.8125rem; }
.details dd { margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
.actions { display: grid; gap: 10px; margin-top: 28px; }
```

In `web/src/router.tsx`:

```tsx
import { AuthorizePage } from './features/agents/AuthorizePage';
import { validateAuthorizeSearch } from './features/agents/search';

// Agent consent (spec section 13): no navbar; signing in first comes back here, also after «Cambia account».
const authorizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/authorize',
  validateSearch: validateAuthorizeSearch,
  beforeLoad: ({ context, location }) => {
    if (context.auth.status === 'signedOut') throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
  },
  component: AuthorizePage
});
```

e nel `routeTree`: `rootRoute.addChildren([loginRoute, authorizeRoute, appRoute.addChildren([...])])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/features/agents/AuthorizePage.test.tsx src/router.test.tsx && npm run typecheck -w web`
Expected: PASS. Eseguire il file di test anche 5 volte di fila (`for i in 1 2 3 4 5; do npm test -w web -- src/features/agents/AuthorizePage.test.tsx || break; done`): i test sulle risposte tardive non devono essere instabili.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/agents web/src/i18n/messages/agents.ts web/src/i18n/messages/index.ts web/src/router.tsx web/src/test/renderApp.tsx
git commit -m "Agenti: pagina di consenso /authorize"
```

---

### Task 7: Pagina «Collega un agente» e dati degli agenti nel web

**Files:**
- Create: `web/src/features/agents/api.ts`
- Create: `web/src/features/agents/clientGuides.ts`
- Create: `web/src/features/agents/clientGuides.test.ts`
- Create: `web/src/features/agents/format.ts`
- Create: `web/src/features/agents/format.test.ts`
- Create: `web/src/features/agents/CopyField.tsx`
- Create: `web/src/features/agents/ClientGuide.tsx`
- Create: `web/src/features/agents/AgentsPage.tsx`
- Create: `web/src/features/agents/AgentsPage.module.css`
- Create: `web/src/features/agents/AgentsPage.test.tsx`
- Create: `web/src/api/fake/fakeAgents.ts`
- Modify: `web/src/api/types.ts` (`'agents'` in `SERVER_AREAS`)
- Modify: `web/src/api/fake/fakeApi.ts` (stato e area `agents`)
- Modify: `web/src/i18n/messages/agents.ts` (chiavi della pagina)
- Modify: `web/src/router.tsx` (rotta `/profile/agents`)
- Modify: `web/vite.config.ts`, `web/src/vite-env.d.ts`, `web/src/env.ts` (origine del servizio in sviluppo, rilievo 9)

**Interfaces:**
- Consumes: `api.agents.list({})`, `api.agents.disconnect({ clientId })` (Task 3, tipizzati da `SERVER_AREAS`), `useQueryDeps()`, `BottomSheet`, `PageHeader`, `BackToProfile`, `useOnline`, `useProfile`.
- Produces: `agentsQuery(deps: QueryDeps)` con chiave `['agents', 'list', {}]`; `CLIENT_GUIDES`, `CLIENT_ORDER`, `guideFor(name: string): ClientKey | null`, `mcpUrl(origin: string): string`, `SERVICE_NAME = 'cosasimangia'`; `env.serviceOrigin: string | null` (origine del Worker sul Vite di sviluppo, `null` altrove); `formatRenewal(locale, iso, now?, timeZone?)`; rotta `/profile/agents`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/features/agents/clientGuides.test.ts
import { describe, expect, it } from 'vitest';
import { CLIENT_GUIDES, CLIENT_ORDER, guideFor, mcpUrl } from './clientGuides';

describe('client guides', () => {
  it('builds the service address and the commands from the origin', () => {
    const url = mcpUrl('https://cosasimangia.qunidi.it');
    expect(url).toBe('https://cosasimangia.qunidi.it/mcp');
    expect(CLIENT_GUIDES.claude_code.steps[0]!.command?.(url)).toBe('claude mcp add --transport http --scope user cosasimangia https://cosasimangia.qunidi.it/mcp');
    expect(CLIENT_GUIDES.codex.steps.map((s) => s.command?.(url))).toEqual(['codex mcp add cosasimangia --url https://cosasimangia.qunidi.it/mcp', 'codex mcp login cosasimangia']);
    expect(CLIENT_ORDER).toEqual(['claude_code', 'codex', 'claude_desktop', 'chatgpt']);
  });

  it('marks the clients not yet tried with this service', () => {
    expect(CLIENT_ORDER.filter((key) => CLIENT_GUIDES[key].unverified)).toEqual(['claude_desktop', 'chatgpt']);
  });

  it('recognises a client from the name it registered with, or none', () => {
    expect(guideFor('Claude Code (cosasimangia)')).toBe('claude_code');
    expect(guideFor('Codex')).toBe('codex');
    expect(guideFor('ChatGPT')).toBe('chatgpt');
    expect(guideFor('Claude')).toBe('claude_desktop');
    expect(guideFor('')).toBeNull();
    expect(guideFor('My script')).toBeNull();
  });
});
```

```ts
// web/src/features/agents/format.test.ts
import { describe, expect, it } from 'vitest';
import { formatRenewal } from './format';

describe('formatRenewal', () => {
  const now = new Date('2026-10-11T16:00:00+02:00');
  it('says today with the time, otherwise day, month and time, on the device clock', () => {
    expect(formatRenewal('it-IT', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('oggi alle 14:05');
    expect(formatRenewal('en-GB', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('today at 14:05');
    expect(formatRenewal('it-IT', '2026-10-09T07:30:00Z', now, 'Europe/Rome')).toBe('9 ottobre, 09:30');
  });
});
```

```tsx
// web/src/features/agents/AgentsPage.test.tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

describe('«Collega un agente»', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('gives the address, the four clients with commands, sign-in with the agent powers, examples and the family note', async () => {
    renderApp('/profile/agents');
    expect(await screen.findByRole('heading', { name: 'Collega un agente' })).toBeTruthy();
    // In tests (and in production) the service is on the page origin; only the Vite dev server points elsewhere.
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeTruthy();
    for (const name of ['Claude Code', 'Codex CLI', 'Claude Desktop', 'ChatGPT']) expect(screen.getByText(name, { selector: 'summary' })).toBeTruthy();
    expect(screen.getByText(`claude mcp add --transport http --scope user cosasimangia ${window.location.origin}/mcp`)).toBeTruthy();
    expect(screen.getAllByText('Passaggi non ancora provati con questo servizio.')).toHaveLength(2);
    expect(screen.getByText(/l’agente agisce con il tuo account e può anche cambiare la password e chiudere le tue sessioni/)).toBeTruthy();
    expect(screen.getByText(/revoca la sua autorizzazione e le sue sessioni/)).toBeTruthy();
    expect(screen.getByText('«Cosa mangiamo stasera?»')).toBeTruthy();
    expect(screen.getByText(/Eliminare una famiglia si fa solo nell’app/)).toBeTruthy();
    expect(screen.queryByText(/finché non lo autorizzi di nuovo|quando vuoi/)).toBeNull();
  });

  it('copies the address', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderApp('/profile/agents');
    const address = (await screen.findByText(`${window.location.origin}/mcp`)).closest('div')!;
    fireEvent.click(within(address).getByRole('button', { name: 'Copia' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/mcp`));
    expect(await within(address).findByRole('button', { name: 'Copiato' })).toBeTruthy();
  });

  it('lists the connected agents and disconnects one after confirmation, then reads the list again', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const disconnect = vi.spyOn(api.agents, 'disconnect');
    const list = vi.spyOn(api.agents, 'list');
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Claude Code', { selector: '.row-main' })).closest('li')!;
    expect(within(row).getByText(/Collegato il .* · ultimo rinnovo dell’accesso /)).toBeTruthy();
    expect(screen.getByText('L’ultimo rinnovo è l’ultima volta che l’agente ha rinnovato il suo accesso: non dice quando ha usato l’app.')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    expect(within(sheet).getByText(/Revoca l’autorizzazione di Claude Code e chiude le sue sessioni/)).toBeTruthy();
    expect(within(sheet).getByText(/Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala/)).toBeTruthy();
    expect(within(sheet).getByText(/claude mcp remove cosasimangia/)).toBeTruthy();
    const confirm = within(sheet).getByRole('button', { name: 'Scollega' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
    expect(disconnect.mock.calls[0]![0]).toEqual({ clientId: expect.any(String) });
    expect(await screen.findByText('Claude Code scollegato.')).toBeTruthy();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText('Claude Code', { selector: '.row-main' })).toBeNull();
  });

  it('shows a fallback name and the generic removal for an unknown client', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'list').mockResolvedValue([
      { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7', name: '', connectedAt: '2026-10-01T10:00:00Z', lastRenewedAt: null, current: false }
    ]);
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Agente senza nome', { selector: '.row-main' })).closest('li')!;
    expect(within(row).queryByText(/ultimo rinnovo/)).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText(/togli il servizio dalle impostazioni del tuo agente/)).toBeTruthy();
  });

  it('keeps the sheet open with the error when Supabase Auth fails: the agent stays connected', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'disconnect').mockRejectedValue(new ApiError('internal'));
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Claude Code', { selector: '.row-main' })).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scollega' }));
    expect(await within(sheet).findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Claude Code scollegato.')).toBeNull();
    expect(screen.getByText('Claude Code', { selector: '.row-main' })).toBeTruthy();
  });

  it('says when no agent is connected, and disables «Scollega» offline', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    renderApp('/profile/agents', { api });
    const button = await screen.findByRole('button', { name: 'Scollega' });
    setOnline(false);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    setOnline(true);
    vi.spyOn(api.agents, 'list').mockResolvedValue([]);
    renderApp('/profile/agents', { api });
    expect(await screen.findByText('Nessun agente collegato.')).toBeTruthy();
  });

  it('shows the curator example only to curators', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    vi.spyOn(api.profile, 'get').mockResolvedValue({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator'] } });
    renderApp('/profile/agents', { api });
    expect(await screen.findByText('Le istruzioni sugli ingredienti l’agente le legge dal servizio.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w web -- src/features/agents`
Expected: FAIL (`./clientGuides`, `./format`, `api.agents` mancanti).

- [ ] **Step 3: Write minimal implementation**

`web/src/api/types.ts`: `export const SERVER_AREAS = ['session', 'profile', 'recipes', 'ratings', 'menu', 'family', 'shopping', 'agents'] as const …`.

```ts
// web/src/api/fake/fakeAgents.ts
import type { ConnectedAgent } from '@app/contract';
import { ApiError } from '../errors';

export interface FakeAgent { clientId: string; name: string; connectedAt: string; lastRenewedAt: string | null }

/** Fake mode: one agent connected an hour ago, so the list and «Scollega» can be tried. */
export function createFakeAgentsData(now = new Date()): FakeAgent[] {
  return [
    {
      clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
      name: 'Claude Code',
      connectedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      lastRenewedAt: new Date(now.getTime() - 3_600_000).toISOString()
    }
  ];
}

export function createFakeAgents(agents: FakeAgent[], latencyMs?: number) {
  const wait = async () => {
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  };
  return {
    async list(): Promise<ConnectedAgent[]> {
      await wait();
      return agents.map((agent) => ({ ...agent, current: false }));
    },
    async disconnect({ clientId }: { clientId: string }): Promise<{ clientId: string }> {
      if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new ApiError('invalid');
      await wait();
      const index = agents.findIndex((agent) => agent.clientId === clientId);
      if (index !== -1) agents.splice(index, 1);
      return { clientId };
    }
  };
}
```

In `web/src/api/fake/fakeApi.ts`: importare `createFakeAgents, createFakeAgentsData, type FakeAgent` da `./fakeAgents`; aggiungere a `FakeData` il campo `readonly agents: FakeAgent[];`; in `createFakeData` restituire anche `agents: createFakeAgentsData()`; nell'oggetto `api` di `createFakeApi` aggiungere `agents: createFakeAgents(state.agents, options.latencyMs),`; in `withTransport` aggiungere `agents: wrap(api.agents)`.

```ts
// web/src/features/agents/api.ts
import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';

/** Not versioned: the grants live in Supabase Auth, outside the version counters. */
export function agentsQuery({ api }: QueryDeps) {
  return queryOptions({ queryKey: ['agents', 'list', {}] as const, queryFn: () => api.agents.list({}) });
}
```

```ts
// web/src/features/agents/clientGuides.ts
import type { MessageKey } from '../../i18n/translate';

export const SERVICE_NAME = 'cosasimangia';
/** The MCP endpoint of the service whose origin is given (env.serviceOrigin or the page). */
export const mcpUrl = (origin: string) => `${origin}/mcp`;

export type ClientKey = 'claude_code' | 'codex' | 'claude_desktop' | 'chatgpt';
export interface GuideStep { text: MessageKey; command?: (url: string) => string }
export interface ClientGuideSpec {
  name: MessageKey;
  steps: GuideStep[];
  /** How to remove the service from the client too (shown when disconnecting). */
  remove: MessageKey;
  /** Not yet tried with this service (spec section 15): the page says so. */
  unverified?: true;
}

// Claude Code and Codex CLI verified on 11 October 2026 (spike/REPORT.md, Context7); the other two not yet.
export const CLIENT_GUIDES: Record<ClientKey, ClientGuideSpec> = {
  claude_code: {
    name: 'client.claude_code',
    steps: [
      { text: 'client.claude_code.step1', command: (url) => `claude mcp add --transport http --scope user ${SERVICE_NAME} ${url}` },
      { text: 'client.claude_code.step2' }
    ],
    remove: 'client.claude_code.remove'
  },
  codex: {
    name: 'client.codex',
    steps: [
      { text: 'client.codex.step1', command: (url) => `codex mcp add ${SERVICE_NAME} --url ${url}` },
      { text: 'client.codex.step2', command: () => `codex mcp login ${SERVICE_NAME}` }
    ],
    remove: 'client.codex.remove'
  },
  claude_desktop: {
    name: 'client.claude_desktop',
    steps: [{ text: 'client.claude_desktop.step1' }, { text: 'client.claude_desktop.step2' }, { text: 'client.claude_desktop.step3' }],
    remove: 'client.claude_desktop.remove',
    unverified: true
  },
  chatgpt: {
    name: 'client.chatgpt',
    steps: [{ text: 'client.chatgpt.step1' }, { text: 'client.chatgpt.step2' }, { text: 'client.chatgpt.step3' }],
    remove: 'client.chatgpt.remove',
    unverified: true
  }
};
export const CLIENT_ORDER: readonly ClientKey[] = ['claude_code', 'codex', 'claude_desktop', 'chatgpt'];

/** The guide for a registered client name (not verified: a hint for the removal text only). */
export function guideFor(name: string): ClientKey | null {
  const lower = name.toLowerCase();
  if (lower.includes('claude code')) return 'claude_code';
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('chatgpt') || lower.includes('openai')) return 'chatgpt';
  if (lower.includes('claude')) return 'claude_desktop';
  return null;
}
```

```ts
// web/src/features/agents/format.ts
import type { Locale } from '../../i18n/translate';

/** «oggi alle 14:05», else «9 ottobre, 09:30», on the device clock (the instant comes from the server). */
export function formatRenewal(locale: Locale, iso: string, now = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(at);
  if (day.format(at) === day.format(now)) return locale === 'it-IT' ? `oggi alle ${time}` : `today at ${time}`;
  const date = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'long' }).format(at);
  return `${date}, ${time}`;
}
```

Se il progetto preferisce le stringhe «oggi alle» nei dizionari, spostarle in `agents.today` (`'oggi alle {time}'` / `'today at {time}'`) e passare `t` a `formatRenewal`; il test resta uguale.

```tsx
// web/src/features/agents/CopyField.tsx
import { useRef, useState } from 'react';
import { useT } from '../../i18n/LocaleProvider';
import styles from './AgentsPage.module.css';

/** A command or address to copy (round 6): monospace, scrolls on narrow screens, select-all fallback. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT();
  const code = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const range = document.createRange();
      if (code.current) range.selectNodeContents(code.current);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.copy}>
      <code ref={code} aria-label={label}>{value}</code>
      <button type="button" className="text-button" onClick={() => void copy()}>{copied ? t('copy.copied') : t('copy.copy')}</button>
    </div>
  );
}
```

```tsx
// web/src/features/agents/ClientGuide.tsx
import { Icon } from '../../components/Icon';
import { useT } from '../../i18n/LocaleProvider';
import { CLIENT_GUIDES, CLIENT_ORDER } from './clientGuides';
import { CopyField } from './CopyField';
import styles from './AgentsPage.module.css';

/** The four clients as an accordion (round 6 review), numbered steps with commands to copy. */
export function ClientGuide({ url }: { url: string }) {
  const t = useT();
  return (
    <div className={styles.accordion}>
      {CLIENT_ORDER.map((key) => {
        const guide = CLIENT_GUIDES[key];
        return (
          <details key={key}>
            <summary>{t(guide.name)}<Icon name="chevron-right" /></summary>
            <ol className={styles.steps}>
              {guide.steps.map((step) => (
                <li key={step.text}>
                  {t(step.text)}
                  {step.command && <CopyField value={step.command(url)} label={t(guide.name)} />}
                </li>
              ))}
            </ol>
            {guide.unverified && <p className={styles.note}>{t('agents.unverified')}</p>}
          </details>
        );
      })}
    </div>
  );
}
```

Il test cerca i nomi con `selector: 'summary'`: `getByText` confronta il testo del nodo `summary`, che contiene anche l'icona SVG senza testo, quindi corrisponde.

```tsx
// web/src/features/agents/AgentsPage.tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { errorKey, isBlocking } from '../../api/errors';
import { useQueryDeps } from '../../api/queries';
import type { ConnectedAgent } from '@app/contract';
import { BottomSheet } from '../../components/BottomSheet';
import { Loading } from '../../components/Loading';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { env } from '../../env';
import { formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { useProfile } from '../../session/useFamily';
import { agentsQuery } from './api';
import { ClientGuide } from './ClientGuide';
import { CLIENT_GUIDES, guideFor, mcpUrl } from './clientGuides';
import { CopyField } from './CopyField';
import { formatRenewal } from './format';
import styles from './AgentsPage.module.css';

/** «Collega un agente» (spec section 13, round 6): address, clients, sign-in, examples, connected agents. */
export function AgentsPage() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const queryClient = useQueryClient();
  const online = useOnline();
  const curator = useProfile().data?.user.globalRoles.includes('recipe_curator') ?? false;
  // Production: the Worker serves the SPA and /mcp on one origin. Vite dev: the Worker it forwards /api to (review, finding 9).
  const url = mcpUrl(env.serviceOrigin ?? window.location.origin);
  const agents = useQuery(agentsQuery(deps));
  const [leaving, setLeaving] = useState<ConnectedAgent | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // A second click arrives before the re-render: the ref keeps it to one call.
  const sending = useRef(false);
  const nameOf = (agent: ConnectedAgent) => agent.name || t('agents.unnamed');
  const disconnect = useMutation({
    mutationFn: (agent: ConnectedAgent) => deps.api.agents.disconnect({ clientId: agent.clientId }),
    onSuccess: (_result, agent) => {
      setLeaving(null);
      setDone(t('agents.disconnected', { client: nameOf(agent) }));
      // No optimistic update: the list is read again from the server.
      void queryClient.invalidateQueries({ queryKey: ['agents', 'list'] });
    }
  });
  const blocked = agents.isError && isBlocking(agents.error, !!agents.data);
  const confirm = (agent: ConnectedAgent) => {
    if (sending.current) return;
    sending.current = true;
    disconnect.mutate(agent, { onSettled: () => (sending.current = false) });
  };
  const removal = (agent: ConnectedAgent) => {
    const key = guideFor(agent.name);
    return key ? t(CLIENT_GUIDES[key].remove) : t('agents.removeGeneric');
  };

  return (
    <section className="secondary-view app-view" aria-labelledby="agents-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('agents.title')} titleId="agents-title" />

        <section className="settings-card" aria-labelledby="address-title">
          <h2 id="address-title">{t('agents.address')}</h2>
          <CopyField value={url} label={t('agents.address')} />
        </section>

        <section className="settings-card" aria-labelledby="client-title">
          <h2 id="client-title">{t('agents.choose')}</h2>
          <ClientGuide url={url} />
        </section>

        <section className="settings-card" aria-labelledby="sign-in-title">
          <h2 id="sign-in-title">{t('agents.signIn')}</h2>
          <p>{t('agents.signInBody')}</p>
        </section>

        <section className="settings-card" aria-labelledby="try-title">
          <h2 id="try-title">{t('agents.try')}</h2>
          <p>{t('agents.tryBody')}</p>
          <ul className={styles.examples}>
            <li>{t('agents.tryExample1')}</li>
            <li>{t('agents.tryExample2')}</li>
          </ul>
          {curator && (
            <>
              <h3 className={styles.subheading}>{t('agents.curatorExample')}</h3>
              <ul className={styles.examples}><li>{t('agents.curatorExampleBody')}</li></ul>
              <p className="meta-line">{t('agents.curatorGuide')}</p>
            </>
          )}
          <p className="meta-line">{t('agents.familyDeletion')}</p>
        </section>

        <section className="settings-card" aria-labelledby="connected-title">
          <h2 id="connected-title">{t('agents.connected')}</h2>
          {done && <p className="meta-line" role="status">{done}</p>}
          {blocked && <QueryError error={agents.error} onRetry={() => void agents.refetch()} />}
          {!blocked && !agents.data && <Loading />}
          {agents.data && agents.data.length === 0 && <p className="meta-line">{t('agents.none')}</p>}
          {agents.data && agents.data.length > 0 && (
            <ul className="row-list">
              {agents.data.map((agent) => (
                <li key={agent.clientId} className={styles.agent}>
                  <span className="row-main">
                    {nameOf(agent)}
                    <small>
                      {agent.lastRenewedAt
                        ? t('agents.connectedOnRenewed', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)), last: formatRenewal(locale, agent.lastRenewedAt) })
                        : t('agents.connectedOn', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)) })}
                    </small>
                  </span>
                  <button type="button" className="text-button" disabled={!online} onClick={() => setLeaving(agent)}>{t('agents.disconnect')}</button>
                </li>
              ))}
            </ul>
          )}
          {agents.data && agents.data.length > 0 && <p className="meta-line">{t('agents.renewalNote')}</p>}
        </section>
      </div>

      <BottomSheet open={leaving !== null} title={leaving ? t('agents.disconnectTitle', { client: nameOf(leaving) }) : ''} onClose={() => setLeaving(null)}>
        {leaving && (
          <>
            <p>{t('agents.disconnectBody', { client: nameOf(leaving), how: removal(leaving) })}</p>
            {disconnect.isError && <p className="meta-line" role="alert">{t(errorKey(disconnect.error))}</p>}
            <div className={styles.sheetActions}>
              <button type="button" className="text-button" onClick={() => setLeaving(null)}>{t('agents.cancel')}</button>
              <button type="button" className="text-button danger" disabled={!online || disconnect.isPending} onClick={() => confirm(leaving)}>{t('agents.disconnect')}</button>
            </div>
          </>
        )}
      </BottomSheet>
    </section>
  );
}
```

`agent.connectedAt.slice(0, 10)` dà la data UTC; è accettabile per «Collegato il» (differenza solo a cavallo della mezzanotte UTC). Se `formatDayMonth` vuole un `IsoDate` tipizzato, fare il cast come negli altri punti del web (`as IsoDate`).

```css
/* web/src/features/agents/AgentsPage.module.css — round 6, design.md tokens */
.copy { display: flex; align-items: center; gap: 8px; margin: 8px 0 12px; }
.copy code { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); font: 0.8125rem/1.5 ui-monospace, 'SF Mono', Menlo, monospace; white-space: pre; overflow-x: auto; user-select: all; }
.copy button { flex: none; }
.accordion details { border-top: 1px solid var(--rule); }
.accordion details:last-child { border-bottom: 1px solid var(--rule); }
.accordion summary { display: flex; align-items: center; justify-content: space-between; min-height: 48px; font-weight: 700; cursor: pointer; list-style: none; }
.accordion summary::-webkit-details-marker { display: none; }
.accordion summary svg { transition: transform 0.15s; }
.accordion details[open] summary svg { transform: rotate(90deg); }
.accordion details[open] { padding-bottom: 12px; }
.steps { margin: 0; padding-left: 20px; }
.steps li { margin: 0 0 8px; }
.note { margin: 4px 0 0; color: var(--muted); font-size: 0.8125rem; }
.examples { margin: 4px 0 12px; padding-left: 20px; }
.examples li { margin: 4px 0; }
.subheading { margin: 16px 0 4px; font-size: 1rem; }
.agent { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; overflow-wrap: anywhere; }
.sheetActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
```

Aggiungere a `web/src/i18n/messages/agents.ts`, nell'oggetto `it`:

```ts
  'agents.title': 'Collega un agente',
  'agents.address': 'Indirizzo del servizio',
  'agents.choose': 'Il tuo agente',
  'agents.unverified': 'Passaggi non ancora provati con questo servizio.',
  'agents.signIn': 'Accesso',
  'agents.signInBody': 'Al primo uso l’agente apre il browser: accedi a Cosa si mangia e consenti l’accesso. Da quel momento l’agente agisce con il tuo account e può anche cambiare la password e chiudere le tue sessioni. «Scollega» qui sotto revoca la sua autorizzazione e le sue sessioni.',
  'agents.try': 'Prova il collegamento',
  'agents.tryBody': 'Chiedi all’agente, per esempio:',
  'agents.tryExample1': '«Cosa mangiamo stasera?»',
  'agents.tryExample2': '«Aggiungi il latte alla lista della spesa di questa settimana.»',
  'agents.curatorExample': 'Per i curatori',
  'agents.curatorExampleBody': '«Aggiungi al ricettario questa ricetta: <link>. Chiedimi quello che manca e salvala come bozza finché non è completa.»',
  'agents.curatorGuide': 'Le istruzioni sugli ingredienti l’agente le legge dal servizio.',
  'agents.familyDeletion': 'Eliminare una famiglia si fa solo nell’app: se lo chiedi all’agente, ti darà il link della pagina in cui confermare.',
  'agents.connected': 'Agenti collegati',
  'agents.none': 'Nessun agente collegato.',
  'agents.unnamed': 'Agente senza nome',
  'agents.connectedOn': 'Collegato il {date}',
  'agents.connectedOnRenewed': 'Collegato il {date} · ultimo rinnovo dell’accesso {last}',
  'agents.renewalNote': 'L’ultimo rinnovo è l’ultima volta che l’agente ha rinnovato il suo accesso: non dice quando ha usato l’app.',
  'agents.disconnect': 'Scollega',
  'agents.disconnectTitle': 'Scollegare {client}?',
  'agents.disconnectBody': 'Revoca l’autorizzazione di {client} e chiude le sue sessioni: da subito non potrà più usare l’app con questo collegamento. Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala. Per toglierlo anche dal client: {how}',
  'agents.removeGeneric': 'togli il servizio dalle impostazioni del tuo agente.',
  'agents.disconnected': '{client} scollegato.',
  'agents.cancel': 'Annulla',
  'client.claude_code': 'Claude Code',
  'client.codex': 'Codex CLI',
  'client.chatgpt': 'ChatGPT',
  'client.claude_desktop': 'Claude Desktop',
  'client.claude_code.step1': 'Nel terminale aggiungi il servizio:',
  'client.claude_code.step2': 'Apri Claude Code, scrivi /mcp, scegli cosasimangia e accedi: si apre il browser.',
  'client.claude_code.remove': 'claude mcp remove cosasimangia',
  'client.codex.step1': 'Nel terminale aggiungi il servizio (Codex apre il browser per l’accesso):',
  'client.codex.step2': 'Se serve accedere di nuovo:',
  'client.codex.remove': 'codex mcp remove cosasimangia',
  'client.chatgpt.step1': 'In ChatGPT apri Impostazioni › App e connettori › Avanzate e attiva la modalità sviluppatore.',
  'client.chatgpt.step2': 'Crea un connettore: nome «Cosa si mangia», indirizzo del servizio qui sopra, autenticazione OAuth.',
  'client.chatgpt.step3': 'Accedi nel browser e consenti l’accesso.',
  'client.chatgpt.remove': 'elimina il connettore nelle impostazioni di ChatGPT.',
  'client.claude_desktop.step1': 'In Claude apri Impostazioni › Connettori e scegli «Aggiungi connettore personalizzato».',
  'client.claude_desktop.step2': 'Nome «Cosa si mangia» e indirizzo del servizio qui sopra, poi «Aggiungi».',
  'client.claude_desktop.step3': 'Premi «Collega», accedi nel browser e consenti l’accesso.',
  'client.claude_desktop.remove': 'rimuovi il connettore nelle impostazioni di Claude.',
  'copy.copy': 'Copia',
  'copy.copied': 'Copiato',
```

e nell'oggetto `en`:

```ts
  'agents.title': 'Connect an agent',
  'agents.address': 'Service address',
  'agents.choose': 'Your agent',
  'agents.unverified': 'Steps not yet tried with this service.',
  'agents.signIn': 'Signing in',
  'agents.signInBody': 'The first time, the agent opens the browser: sign in to Cosa si mangia and allow access. From then on the agent acts with your account and can also change your password and end your sessions. «Disconnect» below revokes its authorisation and its sessions.',
  'agents.try': 'Try the connection',
  'agents.tryBody': 'Ask the agent, for example:',
  'agents.tryExample1': '“What are we having tonight?”',
  'agents.tryExample2': '“Add milk to this week’s shopping list.”',
  'agents.curatorExample': 'For curators',
  'agents.curatorExampleBody': '“Add this recipe to the recipe book: <link>. Ask me for anything missing and keep it as a draft until it is complete.”',
  'agents.curatorGuide': 'The agent reads the instructions about ingredients from the service.',
  'agents.familyDeletion': 'Deleting a family is only possible in the app: if you ask the agent, it gives you the link to the page where you confirm.',
  'agents.connected': 'Connected agents',
  'agents.none': 'No agents connected.',
  'agents.unnamed': 'Unnamed agent',
  'agents.connectedOn': 'Connected on {date}',
  'agents.connectedOnRenewed': 'Connected on {date} · access last renewed {last}',
  'agents.renewalNote': 'The last renewal is the last time the agent renewed its access: it does not say when it last used the app.',
  'agents.disconnect': 'Disconnect',
  'agents.disconnectTitle': 'Disconnect {client}?',
  'agents.disconnectBody': 'Revokes the authorisation of {client} and ends its sessions: from now on it can no longer use the app through this connection. It does not end access obtained otherwise: if the agent has changed your password, change it. To remove it from the client too: {how}',
  'agents.removeGeneric': 'remove the service in your agent’s settings.',
  'agents.disconnected': '{client} disconnected.',
  'agents.cancel': 'Cancel',
  'client.claude_code': 'Claude Code',
  'client.codex': 'Codex CLI',
  'client.chatgpt': 'ChatGPT',
  'client.claude_desktop': 'Claude Desktop',
  'client.claude_code.step1': 'In the terminal, add the service:',
  'client.claude_code.step2': 'Open Claude Code, type /mcp, choose cosasimangia and sign in: the browser opens.',
  'client.claude_code.remove': 'claude mcp remove cosasimangia',
  'client.codex.step1': 'In the terminal, add the service (Codex opens the browser to sign in):',
  'client.codex.step2': 'If you need to sign in again:',
  'client.codex.remove': 'codex mcp remove cosasimangia',
  'client.chatgpt.step1': 'In ChatGPT open Settings › Apps & Connectors › Advanced and turn on developer mode.',
  'client.chatgpt.step2': 'Create a connector: name “Cosa si mangia”, the service address above, OAuth authentication.',
  'client.chatgpt.step3': 'Sign in in the browser and allow access.',
  'client.chatgpt.remove': 'delete the connector in ChatGPT’s settings.',
  'client.claude_desktop.step1': 'In Claude open Settings › Connectors and choose “Add custom connector”.',
  'client.claude_desktop.step2': 'Name “Cosa si mangia” and the service address above, then “Add”.',
  'client.claude_desktop.step3': 'Press “Connect”, sign in in the browser and allow access.',
  'client.claude_desktop.remove': 'remove the connector in Claude’s settings.',
  'copy.copy': 'Copy',
  'copy.copied': 'Copied',
```

Prima di committare, ricontrollare con Context7 i comandi di Claude Code (`claude mcp add --transport http`, `claude mcp remove`) e di Codex CLI (`codex mcp add <nome> --url`, `codex mcp login`, `codex mcp remove`) e correggere testi e test se la sintassi è cambiata.

Origine del servizio in sviluppo (rilievo 9). `web/vite.config.ts`, nell'oggetto restituito da `defineConfig`:

```ts
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion),
      // «Collega un agente» shows `${origin}/mcp`: in production the Worker serves SPA and /mcp on one
      // origin; the Vite dev server forwards only /api, so the page shows the Worker's origin there.
      __SERVICE_ORIGIN__: JSON.stringify(mode === 'development' ? new URL(apiTarget).origin : null)
    },
```

`web/src/vite-env.d.ts`: `declare const __SERVICE_ORIGIN__: string | null;`. `web/src/env.ts`, nell'oggetto `env`:

```ts
  /** Origin of the service (MCP) when it is not the page's: the Worker behind the Vite dev server; null elsewhere. */
  serviceOrigin: __SERVICE_ORIGIN__,
```

Vitest gira in modalità `test`, quindi nei test `serviceOrigin` è `null` e la pagina mostra l'origine di jsdom. La verifica del valore in sviluppo è nella prova del Task 9 (indirizzo copiato dalla pagina sul Vite 5174).

In `web/src/router.tsx`:

```tsx
import { AgentsPage } from './features/agents/AgentsPage';
const agentsRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile/agents', component: AgentsPage });
```

e aggiungere `agentsRoute` ai figli di `appRoute`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w web && npm run typecheck -w web`
Expected: PASS, compresi i test dell'API finta (`fakeApi.test.ts`, che controlla che ogni area sia dietro `withTransport`).

- [ ] **Step 5: Commit**

```bash
git add web/src/features/agents web/src/api/types.ts web/src/api/fake/fakeApi.ts web/src/api/fake/fakeAgents.ts web/src/i18n/messages/agents.ts web/src/router.tsx web/vite.config.ts web/src/vite-env.d.ts web/src/env.ts
git commit -m "Agenti: pagina «Collega un agente» con agenti collegati e scollegamento"
```

---

### Task 8: Voce «Collega un agente» nel Profilo

**Files:**
- Modify: `web/src/routes/ProfilePage.tsx`
- Modify: `web/src/routes/ProfilePage.test.tsx`
- Modify: `web/src/components/Icon.tsx` (icona `link`)
- Modify: `web/src/i18n/messages/agents.ts` (chiavi del Profilo)

**Interfaces:**
- Consumes: `agentsQuery` (Task 7), rotta `/profile/agents` (Task 7).

- [ ] **Step 1: Write the failing test**

Aggiungere a `web/src/routes/ProfilePage.test.tsx`:

```tsx
it('opens «Collega un agente» from the account section, with the number of connected agents', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const { history } = renderApp('/profile', { api });
  const row = await screen.findByRole('link', { name: /Collega un agente/ });
  expect(await within(row).findByText('1 agente collegato')).toBeTruthy();
  vi.spyOn(api.agents, 'list').mockResolvedValue([]);
  fireEvent.click(row);
  await waitFor(() => expect(history.location.pathname).toBe('/profile/agents'));
});

it('suggests the clients when no agent is connected', async () => {
  const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  vi.spyOn(api.agents, 'list').mockResolvedValue([]);
  renderApp('/profile', { api });
  expect(await screen.findByText('Claude, ChatGPT o Codex con MCP')).toBeTruthy();
});
```

(Importare `createFakeApi`, `within`, `fireEvent`, `waitFor`, `vi` se il file non li importa già.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/routes/ProfilePage.test.tsx`
Expected: FAIL, link «Collega un agente» non trovato.

- [ ] **Step 3: Write minimal implementation**

`web/src/components/Icon.tsx`, nell'elenco dei percorsi (stesso disegno del prototipo):

```tsx
  link: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
```

`web/src/i18n/messages/agents.ts`, in `it`:

```ts
  'profile.agents': 'Collega un agente',
  'profile.agentsHint': 'Claude, ChatGPT o Codex con MCP',
  'profile.agentsCount.one': '1 agente collegato',
  'profile.agentsCount.other': '{count} agenti collegati',
```

in `en`:

```ts
  'profile.agents': 'Connect an agent',
  'profile.agentsHint': 'Claude, ChatGPT or Codex through MCP',
  'profile.agentsCount.one': '1 agent connected',
  'profile.agentsCount.other': '{count} agents connected',
```

`web/src/routes/ProfilePage.tsx`: importare `useQuery` (già importato), `agentsQuery` da `../features/agents/api`; nel componente `ProfilePage` leggere `const agents = useQuery(agentsQuery(deps));` e, nella lista della sezione «Account», dopo la voce «Account e preferenze»:

```tsx
            <li>
              <Link to="/profile/agents" className="row-link">
                <Icon name="link" />
                <span className="row-main">
                  {t('profile.agents')}
                  <small>{agents.data?.length ? t('profile.agentsCount', { count: agents.data.length }) : t('profile.agentsHint')}</small>
                </span>
                <Icon name="chevron-right" />
              </Link>
            </li>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/routes/ProfilePage.test.tsx && npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/ProfilePage.tsx web/src/routes/ProfilePage.test.tsx web/src/components/Icon.tsx web/src/i18n/messages/agents.ts
git commit -m "Agenti: voce «Collega un agente» nel Profilo"
```

---

### Task 9: Verifica completa, prova con Claude Code vero e PR

**Files:**
- Nessun file nuovo; eventuali correzioni nei file dei task precedenti.

- [ ] **Step 1: Test, typecheck e build di tutto il repository, come la CI**

Run:

```bash
supabase db reset && supabase test db
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres CI=1 npm test
npm run typecheck
npm run build -w web
scripts/oauth/agents-e2e.sh
```

Expected: tutto verde; nessun test saltato (`CI=1` fa fallire le suite del database invece di saltarle); lo script end-to-end con ogni riga `ok`.

- [ ] **Step 2: Claude Code vero contro lo stack locale, con l'indirizzo copiato dalla pagina**

1. `npm run dev -w server` (8787) e `npm run dev -w web` (5174), con `web/.env.local` che punta all'Auth locale (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` da `supabase status`).
2. Nel browser, su `http://127.0.0.1:5174`, accesso come `anna@example.test`, Profilo › Collega un agente: copiare con «Copia» l'indirizzo del servizio e il comando di Claude Code. Atteso: l'indirizzo è quello del Worker (`http://localhost:8787/mcp`, non la 5174).
3. Controllare la scoperta con l'indirizzo copiato: `curl -s <origine copiata>/.well-known/oauth-protected-resource/mcp` deve indicare come `resource` proprio l'indirizzo copiato e come server di autorizzazione l'Auth locale; `curl -si <indirizzo copiato>` senza token risponde 401 con `WWW-Authenticate` che rimanda a quei metadati.
4. Incollare nel terminale il comando copiato (nome `cosasimangia`; se esiste già un servizio con quel nome, toglierlo prima con `claude mcp remove cosasimangia`), poi in Claude Code `/mcp` › cosasimangia › Authenticate.
5. Nel browser: schermata di consenso con «Claude Code» (o il nome registrato), testi su password e sessioni, dati richiesti, dettagli dell'agente; «Consenti».
6. Chiedere a Claude Code «chi sono?» (`session_whoami` → `channel: mcp`) e «quali agenti ho collegato?» (`agents_list`, `current: true`).
7. Nella pagina `/profile/agents`: l'agente compare con «ultimo rinnovo dell'accesso» e la riga che lo spiega; «Scollega» → conferma con i testi sui limiti.
8. Chiedere di nuovo «chi sono?»: Claude Code riceve 401 e propone di autenticarsi di nuovo.
9. Togliere il servizio con il comando indicato nel foglio di conferma: `claude mcp remove cosasimangia`.

Expected: ogni passo come descritto; annotare nella PR eventuali differenze (nome registrato dal client, testi del client).

- [ ] **Step 3: Prova visiva con agent-browser**

Con la skill agent-browser, a larghezza iPhone (390 px) e porta 8767 secondo le «Interfacce decise» (o la 5174 del Vite di sviluppo): `/authorize?authorization_id=demo` in modalità finta (con il profilo e, per un attimo, senza: «Consenti» disabilitato), `/profile/agents` con un agente e senza, foglio di conferma, voce del Profilo; confrontare con `design/design.md` e con il prototipo (`/authorize?client=claude_code`, `/profile/agents`). La schermata di consenso è più lunga del prototipo (poteri, dati, dettagli): controllare che «Consenti» e «Annulla» restino raggiungibili e leggibili. Correggere spaziature o testi che vanno a capo male, poi rieseguire i test del web.

- [ ] **Step 4: Commit delle correzioni**

```bash
git add -A
git commit -m "Agenti: correzioni dopo la verifica completa"   # solo se ci sono correzioni
```

- [ ] **Step 5: Una sola PR**

Push del branch e PR verso `main` secondo il protocollo dei worker (`STATO: PR_APERTA <url>`). Nella descrizione: cosa fa, come è stato verificato (compresa la prova con Claude Code), sezioni della specifica realizzate, file condivisi toccati (elenco dei «Global Constraints»), la modifica di `.github/workflows/ci.yml` con la durata del job prima e dopo, e i passi esterni ancora da fare. Prima della prova sul Worker pubblicato, `STATO: DOMANDA` con i prerequisiti e i passi esterni della spec (sezione «Passi esterni per la produzione»).
