# Collegamento degli agenti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collegare gli agenti MCP all'account con il server OAuth 2.1 di Supabase: pagina di consenso `/authorize`, pagina «Collega un agente» con «Agenti collegati» e «Scollega», operazioni `agents.list` e `agents.disconnect` con i loro strumenti MCP.

**Architecture:** le autorizzazioni vivono in Supabase Auth. Il server legge l'elenco con una funzione SQL `security definer` sulle tabelle `auth` e scollega chiamando `DELETE /auth/v1/user/oauth/grants` con il token di chi chiede; la revoca è immediata perché il server verifica già a ogni richiesta che la sessione esista. Il web usa supabase-js per il consenso e il client oRPC per elenco e scollegamento.

**Tech Stack:** TypeScript, oRPC 1.15.5, zod 4, Postgres.js, pgTAP, React 19, TanStack Router e Query, `@supabase/supabase-js` 2.117.3, Vitest, Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md` (subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezione 13).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano; testi per l'utente in `it-IT` ed `en-GB`.
- Nessuna dipendenza nuova.
- Contratto: ogni operazione con `op({ mcp, offline, role })`; errori solo a codici; nessuna lettura versionata per `agents.list` (niente `reads`).
- Web: niente aggiornamenti ottimistici; dopo una mutazione si rilegge l'elenco.
- Migrazioni: solo file nuovi con timestamp; `execute` revocato a `public` su ogni funzione; test pgTAP per ogni migrazione.
- File condivisi toccati solo per registrare l'area: `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`, `server/src/env.ts`, `server/wrangler.jsonc`, `server/.env.example`, `server/test/support/requests.ts`, `supabase/config.toml`, `supabase/tests/coverage_test.sql`, `web/src/router.tsx`, `web/src/api/types.ts`, `web/src/api/fake/fakeApi.ts`, `web/src/i18n/messages/index.ts`, `web/src/auth/backend.ts`, `web/src/auth/supabaseBackend.ts`, `web/src/test/stubBackend.ts`, `web/src/components/Icon.tsx`.
- Testi veritieri: mai frasi come «non può cambiare la password»; l'agente «agisce con il tuo account» e «Scollega» lo blocca.
- Nessuna modifica al progetto Supabase di produzione `lronuqvtjdhfyychnscr`: i passi esterni li fa l'utente (spec, «Passi esterni»).
- Comandi locali: `export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH` (con l'errore di Podman per stack nuovi vedi `progetto/coordinamento/messaggi/w2-podman.md`). Server: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<porta db>/postgres npm test -w server`.

## Review Focus

- `authorization_id` scaduto o già usato (la persona riapre una scheda vecchia): la pagina deve dire «Richiesta non valida o scaduta» e non mostrare «Consenti» → test in Task 7.
- Doppio clic su «Consenti» o «Scollega» con rete lenta: una sola chiamata, pulsanti disabilitati durante l'attesa → test in Task 7 e Task 8.
- Supabase Auth irraggiungibile o lento durante lo scollegamento: `internal` dopo al massimo 5 secondi, nessun falso «scollegato» → test in Task 3.
- Un agente che scollega se stesso via MCP: la risposta arriva, la richiesta successiva prende 401 → test in Task 4.
- Nome del client vuoto o lunghissimo (registrazione dinamica aperta): si mostra un nome di ripiego e il testo va a capo senza rompere la riga → test in Task 2 (nome vuoto) e Task 8 (nome di ripiego).

---

### Task 1: Area `agents` del contratto

**Files:**
- Create: `contract/src/agents/operations.ts`
- Create: `contract/src/agents/index.ts`
- Create: `contract/src/agents/agents-contract.test.ts`
- Modify: `contract/src/contract.ts` (registrazione dell'area)
- Modify: `contract/src/index.ts` (riesportazione)

**Interfaces:**
- Produces: `agentsContract`, `connectedAgentSchema`, `type ConnectedAgent = { clientId: string; name: string; connectedAt: string; lastUsedAt: string | null; current: boolean }`; `contract.agents.list` (input `{}`) e `contract.agents.disconnect` (input `{ clientId: string }`, output `{ clientId: string }`).

- [ ] **Step 1: Write the failing test**

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
			lastUsedAt: null,
			current: false,
		};
		expect(connectedAgentSchema.parse(agent)).toEqual(agent);
	});

	it('refuses a client id that is not a UUID', () => {
		const input = contract.agents.disconnect['~orpc'].inputSchema!;
		expect(input['~standard'].validate({ clientId: 'claude' })).toMatchObject({ issues: expect.any(Array) });
		expect(input['~standard'].validate({ clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' })).toMatchObject({ value: { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' } });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run contract/src/agents/agents-contract.test.ts`
Expected: FAIL, `Cannot find module './operations.ts'`.

- [ ] **Step 3: Write minimal implementation**

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
	/** Last token issue or renewal of any session of the client; null without sessions. */
	lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
	/** The caller is this client (MCP channel with the same `client_id`). */
	current: z.boolean(),
});
export type ConnectedAgent = z.infer<typeof connectedAgentSchema>;

export const agentsContract = {
	list: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({ method: 'GET', path: '/agents', summary: 'Agents (MCP clients) you have connected to your account, most recently used first' })
		.input(z.object({}))
		.output(z.array(connectedAgentSchema)),
	disconnect: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/agents/disconnect',
			summary: 'Disconnect an agent from your account: its access ends at once, including this agent if it is the caller',
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run contract/src/agents/agents-contract.test.ts && npm test -w contract && npm run typecheck -w contract`
Expected: PASS (anche `contract.test.ts` e il controllo dei metadati di `check.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add contract/src/agents contract/src/contract.ts contract/src/index.ts
git commit -m "Agenti: area agents del contratto (elenco e scollegamento)"
```

---

### Task 2: Funzione `app.connected_agents()`

**Files:**
- Create: `supabase/migrations/20261011200000_connected_agents.sql`
- Create: `supabase/tests/connected_agents_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenco delle funzioni eseguibili da `authenticated`)

**Interfaces:**
- Produces: `app.connected_agents() returns table (client_id uuid, name text, connected_at timestamptz, last_used_at timestamptz)`, eseguibile da `authenticated`, solo righe di `auth.uid()`.

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
	$$select client_id::text, name, connected_at, last_used_at from app.connected_agents() order by connected_at$$,
	$$values
		('a0000000-0000-4000-8000-000000000001', 'Claude Code', '2026-10-01 10:00+00'::timestamptz, '2026-10-10 09:30+00'::timestamptz),
		('a0000000-0000-4000-8000-000000000003', '', '2026-10-04 10:00+00'::timestamptz, null::timestamptz)$$,
	'active grants only, last use from live sessions of the client, empty name when missing');

select tests.login('bruno');
select results_eq(
	$$select client_id::text, last_used_at from app.connected_agents()$$,
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

Run: `supabase db reset && supabase test db`
Expected: FAIL in `connected_agents_test.sql` (`function app.connected_agents() does not exist`) e in `coverage_test.sql`.

- [ ] **Step 3: Write minimal implementation**

```sql
-- supabase/migrations/20261011200000_connected_agents.sql
-- Agents (OAuth clients of Supabase Auth) the caller has allowed: active grants, with the
-- last token issue or renewal of their live sessions. Authorisations live in Supabase
-- Auth; disconnecting goes through its API, never through this schema.
create function app.connected_agents()
returns table (client_id uuid, name text, connected_at timestamptz, last_used_at timestamptz)
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

### Task 3: Revoca del grant tramite Supabase Auth e chiave pubblica nel Worker

**Files:**
- Create: `server/src/agents/grants.ts`
- Create: `server/src/agents/grants.test.ts`
- Modify: `server/src/env.ts`
- Modify: `server/wrangler.jsonc` (`vars`)
- Modify: `server/.env.example`
- Modify: `server/test/support/requests.ts` (`testEnv`)

**Interfaces:**
- Produces: `revokeGrant(options: { supabaseUrl: string; publishableKey: string; accessToken: string; clientId: string; fetch?: typeof fetch }): Promise<void>` che lancia `appError('unauthorized')` su 401/403 e `GrantRevocationError` (errore generico → `internal`) su rete, timeout e altri stati; `Env.SUPABASE_PUBLISHABLE_KEY: string`.

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

	it('treats "no active grant" as already disconnected', async () => {
		const { fetch } = fakeFetch(() => Response.json({ error_code: 'oauth_consent_not_found' }, { status: 404 }));
		await expect(revokeGrant(options(fetch))).resolves.toBeUndefined();
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

/** Supabase Auth could not revoke the grant: an outage, answered as `internal`. */
export class GrantRevocationError extends Error {
	override name = 'GrantRevocationError';
}

/**
 * Revokes the caller's grant to an OAuth client through Supabase Auth, which deletes that
 * client's sessions for this user: the session check of every request then refuses its
 * tokens. 204 and 404 (no active grant) both mean "not connected any more".
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
	if (response.status === 204 || response.status === 404) return;
	if (response.status === 401 || response.status === 403) throw appError('unauthorized');
	throw new GrantRevocationError(`Supabase Auth answered ${response.status}`);
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
Expected: PASS; typecheck pulito.

- [ ] **Step 5: Commit**

```bash
git add server/src/agents/grants.ts server/src/agents/grants.test.ts server/src/env.ts server/wrangler.jsonc server/.env.example server/test/support/requests.ts
git commit -m "Agenti: revoca del grant tramite Supabase Auth e chiave pubblica nel Worker"
```

---

### Task 4: Gestori `agents.list` e `agents.disconnect` con strumenti MCP

**Files:**
- Create: `server/src/agents/router.ts`
- Create: `server/test/agents.test.ts`
- Modify: `server/src/router.ts` (registrazione)

**Interfaces:**
- Consumes: `contract.agents` (Task 1), `app.connected_agents()` (Task 2), `revokeGrant` (Task 3), `Implementer` da `server/src/pipeline.ts`, `context.tx`, `context.token`, `context.clientId`, `context.env`.
- Produces: `agentsRouter(os: Implementer)`; strumenti MCP `agents_list` (readOnlyHint true) e `agents_disconnect`.

- [ ] **Step 1: Write the failing test**

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
	async function connect(userId: string, clientId: string, at: { grantedAt: string; usedAt: string }) {
		await actors.db.admin`
			insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at)
			values (${crypto.randomUUID()}, ${userId}, ${clientId}, 'openid', ${at.grantedAt})
			on conflict (user_id, client_id) do nothing`;
		const sessionId = crypto.randomUUID();
		await actors.db.admin`
			insert into auth.sessions (id, user_id, oauth_client_id, updated_at) values (${sessionId}, ${userId}, ${clientId}, ${at.usedAt})`;
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId, email: `${userId}@test.local`, client_id: clientId });
		return { token, sessionId, client: rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token) };
	}

	/** What Supabase does on DELETE /user/oauth/grants: consent revoked, sessions of the client deleted. */
	async function supabaseRevokes(userId: string, clientId: string) {
		await actors.db.admin`update auth.oauth_consents set revoked_at = now() where user_id = ${userId} and client_id = ${clientId}`;
		await actors.db.admin`delete from auth.sessions where user_id = ${userId} and oauth_client_id = ${clientId}`;
	}

	function stubSupabase(status: number) {
		const calls: { url: string; init?: RequestInit }[] = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			calls.push({ url: String(input), init });
			return new Response(null, { status });
		});
		return calls;
	}

	it('lists the own agents, most recently used first, never other people\'s', async () => {
		const anna = await actors.user();
		const bruno = await actors.user();
		const claude = await oauthClient('Claude Code');
		const codex = await oauthClient('Codex');
		const silent = await oauthClient(null);
		await connect(anna.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', usedAt: '2026-10-10T09:30:00Z' });
		await connect(anna.userId, codex, { grantedAt: '2026-10-02T10:00:00Z', usedAt: '2026-10-11T08:00:00Z' });
		await connect(anna.userId, silent, { grantedAt: '2026-10-03T10:00:00Z', usedAt: '2026-10-03T10:00:00Z' });
		await actors.db.admin`delete from auth.sessions where oauth_client_id = ${silent}`;
		await connect(bruno.userId, claude, { grantedAt: '2026-10-05T10:00:00Z', usedAt: '2026-10-11T12:00:00Z' });

		expect(await anna.client.agents.list({})).toEqual([
			{ clientId: codex, name: 'Codex', connectedAt: '2026-10-02T10:00:00.000Z', lastUsedAt: '2026-10-11T08:00:00.000Z', current: false },
			{ clientId: claude, name: 'Claude Code', connectedAt: '2026-10-01T10:00:00.000Z', lastUsedAt: '2026-10-10T09:30:00.000Z', current: false },
			{ clientId: silent, name: '', connectedAt: '2026-10-03T10:00:00.000Z', lastUsedAt: null, current: false },
		]);
	});

	it('marks the calling agent as current, over MCP', async () => {
		const carla = await actors.user();
		const claude = await oauthClient('Claude Code');
		const agent = await connect(carla.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', usedAt: '2026-10-11T10:00:00Z' });
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
		const calls = stubSupabase(204);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe(`${TEST_SUPABASE_URL}/auth/v1/user/oauth/grants?client_id=${clientId}`);
		expect(calls[0]!.init?.headers).toEqual({ authorization: `Bearer ${elena.token}`, apikey: 'sb_publishable_test' });
		vi.restoreAllMocks();
		stubSupabase(404);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
	});

	it('answers internal when Supabase Auth fails, unauthorized when it refuses the token', async () => {
		const franco = await actors.user();
		stubSupabase(500);
		expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('internal');
		vi.restoreAllMocks();
		stubSupabase(401);
		expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('unauthorized');
	});

	it('after the revocation the agent token is refused on MCP, RPC and REST; the rest keeps working', async () => {
		const gina = await actors.user();
		const a = await oauthClient('Agent A');
		const b = await oauthClient('Agent B');
		const agentA = await connect(gina.userId, a, { grantedAt: '2026-10-01T10:00:00Z', usedAt: '2026-10-11T10:00:00Z' });
		const agentB = await connect(gina.userId, b, { grantedAt: '2026-10-01T10:00:00Z', usedAt: '2026-10-11T10:00:00Z' });
		// The agent disconnects itself: the answer arrives, then Supabase has removed its sessions.
		stubSupabase(204);
		expect(await agentA.client.agents.disconnect({ clientId: a })).toEqual({ clientId: a });
		vi.restoreAllMocks();
		await supabaseRevokes(gina.userId, a);

		expect((await mcp(actors.app, actors.env, agentA.token, 'tools/call', { name: 'session_whoami', arguments: {} })).status).toBe(401);
		expect((await errorOf(agentA.client.session.whoami({}))).code).toBe('unauthorized');
		expect((await rest(actors.app, actors.env, 'GET', '/api/session/whoami', agentA.token)).status).toBe(401);

		expect((await agentB.client.session.whoami({})).channel).toBe('mcp');
		expect((await gina.client.session.whoami({})).channel).toBe('web');
		expect((await gina.client.agents.list({})).map((agent) => agent.clientId)).toEqual([b]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- test/agents.test.ts`
Expected: FAIL (`agents` assente nel router: le chiamate rispondono `not_found` o il typecheck dei test segnala `agents` mancante).

- [ ] **Step 3: Write minimal implementation**

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
	last_used_at: Date | null;
}

/** Most recently used first, agents without sessions last, then the newest connection. */
function byLastUse(a: ConnectedAgent, b: ConnectedAgent): number {
	if (a.lastUsedAt !== b.lastUsedAt) {
		if (a.lastUsedAt === null) return 1;
		if (b.lastUsedAt === null) return -1;
		return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
	}
	return a.connectedAt < b.connectedAt ? 1 : a.connectedAt > b.connectedAt ? -1 : 0;
}

export function agentsRouter(os: Implementer) {
	return {
		list: os.agents.list.handler(async ({ context }) => {
			const rows = await context.tx<AgentRow[]>`
				select client_id, name, connected_at, last_used_at from app.connected_agents()`;
			return rows
				.map((row) => ({
					clientId: row.client_id,
					name: row.name,
					connectedAt: row.connected_at.toISOString(),
					lastUsedAt: row.last_used_at?.toISOString() ?? null,
					current: row.client_id === context.clientId,
				}))
				.sort(byLastUse);
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

In `server/src/router.ts` aggiungere `import { agentsRouter } from './agents/router.ts';` e, nell'oggetto passato a `os.router`, `agents: agentsRouter(os),` dopo `catalogue: catalogueRouter(os),`.

Se Postgres.js restituisce i `timestamptz` come stringhe invece che `Date` (controllare con `grep -rn "toISOString\|types:" server/src/db.ts server/src/*/views.ts`), convertire con `new Date(value).toISOString()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS, compresi `test/agents.test.ts` e i test esistenti di MCP che contano gli strumenti (se un test elenca tutti gli strumenti, aggiungere `agents_list` e `agents_disconnect` nell'ordine atteso).

- [ ] **Step 5: Commit**

```bash
git add server/src/agents/router.ts server/test/agents.test.ts server/src/router.ts
git commit -m "Agenti: elenco e scollegamento nel server, con strumenti MCP"
```

---

### Task 5: Server OAuth locale, documentazione e verifica ripetibile della revoca

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/README.md`
- Modify: `server/README.md`
- Create: `scripts/oauth/revocation-check.mjs`

**Interfaces:**
- Consumes: stack Supabase locale con le migrazioni e il seed (`anna@example.test`, `bruno@example.test`, password `password123`), Worker locale (`wrangler dev`), strumento `session_whoami`.
- Produces: `node scripts/oauth/revocation-check.mjs` che esce con 0 se la revoca si comporta come nella spec, 1 altrimenti.

- [ ] **Step 1: Configurazione locale**

In `supabase/config.toml`:

```toml
[auth]
# …
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

- [ ] **Step 2: Write the verification script**

```js
// scripts/oauth/revocation-check.mjs
// Local check of agent disconnection (spec «Collegamento degli agenti»): two agents of the
// same person, one revoked; its unexpired token must be refused on MCP, RPC and REST,
// the other agent, the web session and another person's agent must keep working.
// Only against the local stack: it registers OAuth clients.
//   SUPABASE_URL (default http://127.0.0.1:54321), APP_URL (default http://127.0.0.1:8787),
//   SUPABASE_PUBLISHABLE_KEY (from `supabase status`).
import { createHash, randomBytes } from 'node:crypto';

const SUPABASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const AUTH = `${SUPABASE}/auth/v1`;
const APP = process.env.APP_URL ?? 'http://127.0.0.1:8787';
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const REDIRECT = 'http://127.0.0.1:9/callback';
if (!KEY) throw new Error('SUPABASE_PUBLISHABLE_KEY is required (supabase status)');
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE)) throw new Error('Local stack only');

const b64url = (bytes) => bytes.toString('base64url');
let failures = 0;
const expect = (label, actual, expected) => {
	const ok = actual === expected;
	if (!ok) failures += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

async function json(response) {
	const text = await response.text();
	try {
		return { status: response.status, body: JSON.parse(text) };
	} catch {
		return { status: response.status, body: text };
	}
}

async function login(email) {
	const r = await json(await fetch(`${AUTH}/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: KEY, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'password123' }),
	}));
	if (r.status !== 200) throw new Error(`sign-in of ${email}: ${r.status}`);
	return r.body;
}

async function register(name) {
	const r = await json(await fetch(`${AUTH}/oauth/clients/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
	}));
	if (r.status >= 300) throw new Error(`registration: ${r.status} ${JSON.stringify(r.body)}`);
	return r.body.client_id;
}

/** The flow an agent and the /authorize page perform together, through the same APIs. */
async function connect(clientId, webToken) {
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	const query = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'openid email profile', state: 's' });
	const start = await fetch(`${AUTH}/oauth/authorize?${query}`, { redirect: 'manual' });
	const id = new URL(start.headers.get('location')).searchParams.get('authorization_id');
	const headers = { apikey: KEY, authorization: `Bearer ${webToken}`, 'content-type': 'application/json' };
	await fetch(`${AUTH}/oauth/authorizations/${id}`, { headers });
	const consent = await json(await fetch(`${AUTH}/oauth/authorizations/${id}/consent`, { method: 'POST', headers, body: JSON.stringify({ action: 'approve' }) }));
	const code = new URL(consent.body.redirect_url).searchParams.get('code');
	const token = await json(await fetch(`${AUTH}/oauth/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT }),
	}));
	if (token.status !== 200) throw new Error(`token: ${token.status}`);
	return token.body;
}

const mcp = async (token) => (await fetch(`${APP}/mcp`, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
	body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'session_whoami', arguments: {} } }),
})).status;
// oRPC RPC protocol: the input travels as {"json": …}.
const rpc = async (token) => (await fetch(`${APP}/api/rpc/session/whoami`, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({ json: {} }),
})).status;
const rest = async (token) => (await fetch(`${APP}/api/session/whoami`, { headers: { authorization: `Bearer ${token}` } })).status;

const anna = await login('anna@example.test');
const bruno = await login('bruno@example.test');
const clientA = await register('Revocation check A');
const clientB = await register('Revocation check B');
const a = await connect(clientA, anna.access_token);
const b = await connect(clientB, anna.access_token);
const brunoA = await connect(clientA, bruno.access_token);

for (const [label, token] of [['agent A', a.access_token], ['agent B', b.access_token], ['web', anna.access_token]]) {
	expect(`${label} on MCP before`, await mcp(token), 200);
}

const revoke = await fetch(`${AUTH}/user/oauth/grants?client_id=${clientA}`, { method: 'DELETE', headers: { apikey: KEY, authorization: `Bearer ${anna.access_token}` } });
expect('revocation', revoke.status, 204);

expect('agent A on MCP', await mcp(a.access_token), 401);
expect('agent A on RPC', await rpc(a.access_token), 401);
expect('agent A on REST', await rest(a.access_token), 401);
expect('agent B on MCP', await mcp(b.access_token), 200);
expect('web on RPC', await rpc(anna.access_token), 200);
expect('same client for Bruno on MCP', await mcp(brunoA.access_token), 200);
const refresh = await fetch(`${AUTH}/oauth/token`, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: clientA }),
});
expect('agent A refresh', refresh.status, 400);

process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it against the local stack**

Run:

```bash
supabase stop && supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
supabase db reset
# server/.env: connection as app_server, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY of `supabase status`
npm run build -w web && npm run dev -w server   # in a second terminal
SUPABASE_PUBLISHABLE_KEY=<publishable key> node scripts/oauth/revocation-check.mjs
```

Expected: every line `ok`, exit code 0. RPC returns 401 for `unauthorized` (oRPC maps the code to its status).

- [ ] **Step 4: Documentation**

`supabase/README.md`, dopo il paragrafo «Per accedere con Auth locale…», aggiungere:

```markdown
### Agenti MCP in locale

`config.toml` attiva il server OAuth 2.1 (percorso di consenso `/authorize`, registrazione
dinamica) e usa come Site URL il Vite di sviluppo (`http://127.0.0.1:5174`), dove vive la
pagina di consenso. Per collegare Claude Code allo stack locale: Worker su 8787
(`npm run dev -w server`), web su 5174 (`npm run dev -w web`), poi
`claude mcp add --transport http --scope user cosasimangia-local http://127.0.0.1:8787/mcp`
e `/mcp` › Authenticate. `node scripts/oauth/revocation-check.mjs` verifica che
scollegare un agente renda subito inutilizzabili i suoi token. Se `supabase start` fallisce
con «failed to copy secret file into container», vedi
`progetto/coordinamento/messaggi/w2-podman.md`.
```

`server/README.md`, nel punto 2 di «Sviluppo locale», aggiungere dopo la frase sulla connessione: «e la chiave pubblica (`SUPABASE_PUBLISHABLE_KEY`, da `supabase status`), usata per scollegare gli agenti tramite Supabase Auth».

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml supabase/README.md server/README.md scripts/oauth/revocation-check.mjs
git commit -m "Agenti: server OAuth locale e verifica ripetibile della revoca"
```

---

### Task 6: Consenso nel backend di autenticazione del web

**Files:**
- Modify: `web/src/auth/backend.ts`
- Modify: `web/src/auth/supabaseBackend.ts`
- Modify: `web/src/auth/supabaseBackend.test.ts`
- Modify: `web/src/test/stubBackend.ts`

**Interfaces:**
- Produces (in `web/src/auth/backend.ts`):

```ts
export type AgentAuthorization =
  | { kind: 'consent'; id: string; clientName: string }
  | { kind: 'redirect'; url: string };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';
export type AuthorizationResult<T> = { ok: true; value: T } | { ok: false; reason: AuthorizationFailure };
// AuthBackend gains:
getAuthorization(id: string): Promise<AuthorizationResult<AgentAuthorization>>;
decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<AuthorizationResult<string>>; // value: URL to go to
export const DEMO_AUTHORIZATION: AgentAuthorization; // { kind: 'consent', id: 'demo', clientName: 'Claude Code' }
```

- `StubBackend` gains `authorization: AuthorizationResult<AgentAuthorization>`, `decision: AuthorizationResult<string>`, `decisions: { id: string; decision: 'approve' | 'deny' }[]`, `holdDecision(): (result: AuthorizationResult<string>) => void`.

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

  it('reads a request that needs consent, with the client name', async () => {
    const api = oauth({
      getAuthorizationDetails: vi.fn(async () => ({
        data: { authorization_id: 'auth-1', redirect_uri: 'http://localhost/cb', client: { id: 'c', name: 'Claude Code', uri: '', logo_uri: '' }, user: { id: 'u', email: 'a@x' }, scope: 'openid' },
        error: null
      }))
    });
    const backend = createSupabaseBackend('http://sb', 'key', { auth: fakeAuth(), storage: memoryStorage(), oauth: api });
    expect(await backend.getAuthorization('auth-1')).toEqual({ ok: true, value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code' } });
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
  | { kind: 'consent'; id: string; clientName: string }
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
export const DEMO_AUTHORIZATION: AgentAuthorization = { kind: 'consent', id: 'demo', clientName: 'Claude Code' };
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
        ? { ok: true, value: { kind: 'consent', id: data.authorization_id, clientName: data.client.name ?? '' } }
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
  /** The next decideAuthorization() waits until the returned function answers it. */
  holdDecision(): (result: AuthorizationResult<string>) => void;
```

e nell'oggetto `backend`:

```ts
    authorization: { ok: true, value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code' } },
    decision: { ok: true, value: 'http://127.0.0.1:9/callback?code=x' },
    decisions: [],
    async getAuthorization() {
      return backend.authorization;
    },
    async decideAuthorization(id, decision) {
      backend.decisions.push({ id, decision });
      if (heldDecision) {
        const held = heldDecision;
        heldDecision = null;
        return held;
      }
      return backend.decision;
    },
    holdDecision() {
      let answer!: (result: AuthorizationResult<string>) => void;
      heldDecision = new Promise((resolve) => (answer = resolve));
      return answer;
    },
```

con `let heldDecision: Promise<AuthorizationResult<string>> | null = null;` accanto alle altre variabili `held…` e i tipi importati da `../auth/backend`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/auth && npm run typecheck -w web`
Expected: PASS; typecheck pulito (tutti gli `AuthBackend` implementano i due metodi).

- [ ] **Step 5: Commit**

```bash
git add web/src/auth/backend.ts web/src/auth/supabaseBackend.ts web/src/auth/supabaseBackend.test.ts web/src/test/stubBackend.ts
git commit -m "Agenti: richiesta di consenso nel backend di autenticazione del web"
```

---

### Task 7: Pagina di consenso `/authorize`

**Files:**
- Create: `web/src/features/agents/AuthorizePage.tsx`
- Create: `web/src/features/agents/AuthorizePage.module.css`
- Create: `web/src/features/agents/AuthorizePage.test.tsx`
- Create: `web/src/features/agents/leave.ts`
- Create: `web/src/features/agents/search.ts`
- Create: `web/src/i18n/messages/agents.ts`
- Modify: `web/src/i18n/messages/index.ts`
- Modify: `web/src/router.tsx`

**Interfaces:**
- Consumes: `AuthBackend.getAuthorization`, `decideAuthorization`, `signOut` (Task 6), `useAuth()`, `useProfile()` (`web/src/session/useFamily`), `useOnline()`, `useT()`.
- Produces: `leavePage.to(url: string): void` (navigazione fuori dalla SPA, sostituibile nei test), `validateAuthorizeSearch(raw: Record<string, unknown>): { authorization_id?: string }`, rotta `/authorize`, dizionario `agents.ts` con le chiavi `authorize.*` e (Task 8) `agents.*`, `client.*`, `copy.*`.

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/features/agents/AuthorizePage.test.tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { leavePage } from './leave';

describe('agent consent page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('shows who asks, with which account, what it can do, and allows once', async () => {
    const backend = createStubBackend(DEMO_USER);
    const hold = backend.holdDecision();
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    expect(await screen.findByRole('heading', { name: 'Claude Code vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
    expect(screen.getByText('È il nome con cui l’agente si presenta.')).toBeTruthy();
    expect(screen.getByText(DEMO_USER.email)).toBeTruthy();
    expect(screen.getByText(/Agirà con il tuo account, come se fossi tu/)).toBeTruthy();
    expect(screen.getByText('Eliminare una famiglia resta possibile solo nell’app.')).toBeTruthy();
    expect(screen.getByText('Puoi bloccarlo quando vuoi: Profilo › Collega un agente › Scollega.')).toBeTruthy();
    expect(screen.queryByText(/password|credenziali/i)).toBeNull();
    const allow = screen.getByRole('button', { name: 'Consenti' });
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    hold({ ok: true, value: 'http://127.0.0.1:9/callback?code=x' });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=x'));
    expect(backend.decisions).toEqual([{ id: 'auth-1', decision: 'approve' }]);
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
    backend.authorization = { ok: true, value: { kind: 'consent', id: 'auth-1', clientName: 'Codex' } };
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
  });

  it('asks to sign in first and comes back here', async () => {
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(null) });
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain(encodeURIComponent('/authorize?authorization_id=auth-1'));
  });

  it('switches account: signs out on this device and goes to the sign-in page', async () => {
    const backend = createStubBackend(DEMO_USER);
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Non sei tu? Cambia account' }));
    await waitFor(() => expect(backend.signOutCalls).toBe(1));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
  });

  it('offline: explains that the connection is needed and offers no buttons', async () => {
    setOnline(false);
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByText('Serve la connessione per collegare un agente.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();
  });
});
```

Se `createStubBackend(null)` imposta lo stato `signedOut` e la rotta di login conserva `redirect` nella query (vedi `validateLoginSearch`), il test di accesso passa così; se `stubBackend.signOut` non porta lo stato a `signedOut`, nel test «switches account» chiamare `backend.setUser(null)` dopo il clic, come fanno gli altri test di uscita.

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
// web/src/i18n/messages/agents.ts
export const it = {
  'authorize.title': '{client} vuole usare Cosa si mangia con il tuo account',
  'authorize.nameNote': 'È il nome con cui l’agente si presenta.',
  'authorize.account': 'Account',
  'authorize.notYou': 'Non sei tu? Cambia account',
  'authorize.can': 'Cosa potrà fare',
  'authorize.acts': 'Agirà con il tuo account, come se fossi tu: per esempio leggere e cambiare il menu, la spesa e la famiglia.',
  'authorize.actsCurator': 'Potrà anche gestire il ricettario.',
  'authorize.actsAdmin': 'Potrà anche amministrare l’app.',
  'authorize.familyDeletion': 'Eliminare una famiglia resta possibile solo nell’app.',
  'authorize.block': 'Puoi bloccarlo quando vuoi: Profilo › Collega un agente › Scollega.',
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
  'authorize.nameNote': 'This is the name the agent gives itself.',
  'authorize.account': 'Account',
  'authorize.notYou': 'Not you? Switch account',
  'authorize.can': 'What it will be able to do',
  'authorize.acts': 'It will act with your account, as if it were you: for example reading and changing the menu, the shopping and the family.',
  'authorize.actsCurator': 'It will also be able to manage the recipe book.',
  'authorize.actsAdmin': 'It will also be able to administer the app.',
  'authorize.familyDeletion': 'Deleting a family is still only possible in the app.',
  'authorize.block': 'You can block it whenever you like: Profile › Connect an agent › Disconnect.',
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
import { useAuth } from '../../auth/AuthProvider';
import type { AgentAuthorization, AuthorizationFailure } from '../../auth/backend';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { leavePage } from './leave';
import styles from './AuthorizePage.module.css';

const route = getRouteApi('/authorize');

type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'failed' }
  | { kind: 'leaving' }
  | { kind: 'consent'; request: Extract<AgentAuthorization, { kind: 'consent' }> };

/** Consent opened by an agent in the browser (spec section 13, round 6): who asks, as whom, allow or cancel. */
export function AuthorizePage() {
  const t = useT();
  const { state, backend } = useAuth();
  const online = useOnline();
  const { authorization_id: id } = route.useSearch();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [deciding, setDeciding] = useState(false);
  // A second click arrives before the re-render: the ref, not the state, keeps it to one call.
  const sending = useRef(false);
  const [decisionFailure, setDecisionFailure] = useState<AuthorizationFailure | null>(null);
  const usable = online && state.status === 'signedIn' && state.verified;

  const load = useCallback(async () => {
    if (!id) return setPhase({ kind: 'invalid' });
    setPhase({ kind: 'loading' });
    const result = await backend.getAuthorization(id);
    if (!result.ok) return setPhase({ kind: result.reason === 'not_found' ? 'invalid' : 'failed' });
    if (result.value.kind === 'redirect') {
      setPhase({ kind: 'leaving' });
      return leavePage.to(result.value.url);
    }
    setPhase({ kind: 'consent', request: result.value });
  }, [backend, id]);

  useEffect(() => {
    if (usable) void load();
  }, [usable, load]);

  async function decide(decision: 'approve' | 'deny') {
    if (phase.kind !== 'consent' || sending.current) return;
    sending.current = true;
    setDeciding(true);
    setDecisionFailure(null);
    const result = await backend.decideAuthorization(phase.request.id, decision);
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
      {usable && phase.kind === 'consent' && (
        <Consent clientName={phase.request.clientName} deciding={deciding} failure={decisionFailure} onDecide={decide} onSwitch={() => void backend.signOut()} />
      )}
    </main>
  );
}

function Consent(props: {
  clientName: string;
  deciding: boolean;
  failure: AuthorizationFailure | null;
  onDecide: (decision: 'approve' | 'deny') => void;
  onSwitch: () => void;
}) {
  const t = useT();
  const { state } = useAuth();
  const profile = useProfile().data;
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');
  const roles = profile?.user.globalRoles ?? [];
  return (
    <>
      <h1 className={`entry-title ${styles.title}`}>{t('authorize.title', { client: props.clientName || '?' })}</h1>
      <p className="meta-line">{t('authorize.nameNote')}</p>
      <div className={styles.account}>
        <span className={styles.label}>{t('authorize.account')}</span>
        {profile && <strong>{profile.user.displayName}</strong>}
        <span>{email}</span>
        <button type="button" className={styles.plain} onClick={props.onSwitch}>{t('authorize.notYou')}</button>
      </div>
      <h2 className={styles.heading}>{t('authorize.can')}</h2>
      <p>{t('authorize.acts')}</p>
      {roles.includes('recipe_curator') && <p>{t('authorize.actsCurator')}</p>}
      {roles.includes('app_admin') && <p>{t('authorize.actsAdmin')}</p>}
      <p>{t('authorize.familyDeletion')}</p>
      <p>{t('authorize.block')}</p>
      {props.failure && <p className="form-error" role="alert">{t(props.failure === 'network' ? 'error.network' : 'error.unknown')}</p>}
      <div className={styles.actions}>
        <button type="button" className="text-button primary wide" disabled={props.deciding} onClick={() => props.onDecide('approve')}>{t('authorize.allow')}</button>
        <button type="button" className="text-button wide" disabled={props.deciding} onClick={() => props.onDecide('deny')}>{t('authorize.deny')}</button>
      </div>
    </>
  );
}
```

Le chiavi `error.network` ed `error.unknown`: usare quelle già presenti in `web/src/i18n/messages/errors.ts` (controllare i nomi con `grep -n "network\|unknown" web/src/i18n/messages/errors.ts` e allinearle).

```css
/* web/src/features/agents/AuthorizePage.module.css — round 6 consent, design.md tokens */
.title { overflow-wrap: anywhere; }
.account { display: grid; gap: 2px; margin: 16px 0; padding: 12px 16px; border-radius: 8px; background: var(--paper); box-shadow: var(--card-shadow); overflow-wrap: anywhere; }
.label { color: var(--muted); font-size: 0.8125rem; }
.plain { justify-self: start; min-height: 36px; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
.heading { margin: 20px 0 6px; font-size: 1rem; }
.actions { display: grid; gap: 10px; margin-top: 28px; }
```

In `web/src/router.tsx`:

```tsx
import { AuthorizePage } from './features/agents/AuthorizePage';
import { validateAuthorizeSearch } from './features/agents/search';

// Agent consent (spec section 13): no navbar; signing in first comes back here.
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
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/agents web/src/i18n/messages/agents.ts web/src/i18n/messages/index.ts web/src/router.tsx
git commit -m "Agenti: pagina di consenso /authorize"
```

---

### Task 8: Pagina «Collega un agente» e dati degli agenti nel web

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

**Interfaces:**
- Consumes: `api.agents.list({})`, `api.agents.disconnect({ clientId })` (Task 1, tipizzati da `SERVER_AREAS`), `useQueryDeps()`, `BottomSheet`, `PageHeader`, `BackToProfile`, `useOnline`, `useProfile`.
- Produces: `agentsQuery(deps: QueryDeps)` con chiave `['agents', 'list', {}]`; `CLIENT_GUIDES`, `CLIENT_ORDER`, `guideFor(name: string): ClientKey | null`, `mcpUrl(origin: string): string`, `SERVICE_NAME = 'cosasimangia'`; `formatLastAccess(locale, iso, now?)`; rotta `/profile/agents`.

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
import { formatLastAccess } from './format';

describe('formatLastAccess', () => {
  const now = new Date('2026-10-11T16:00:00+02:00');
  it('says today with the time, otherwise day, month and time, on the device clock', () => {
    expect(formatLastAccess('it-IT', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('oggi alle 14:05');
    expect(formatLastAccess('en-GB', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('today at 14:05');
    expect(formatLastAccess('it-IT', '2026-10-09T07:30:00Z', now, 'Europe/Rome')).toBe('9 ottobre, 09:30');
  });
});
```

```tsx
// web/src/features/agents/AgentsPage.test.tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

describe('«Collega un agente»', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('gives the address, the four clients with commands, sign-in, examples and the family note', async () => {
    renderApp('/profile/agents');
    expect(await screen.findByRole('heading', { name: 'Collega un agente' })).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeTruthy();
    for (const name of ['Claude Code', 'Codex CLI', 'Claude Desktop', 'ChatGPT']) expect(screen.getByText(name, { selector: 'summary' })).toBeTruthy();
    expect(screen.getByText(`claude mcp add --transport http --scope user cosasimangia ${window.location.origin}/mcp`)).toBeTruthy();
    expect(screen.getAllByText('Passaggi non ancora provati con questo servizio.')).toHaveLength(2);
    expect(screen.getByText(/l’agente agisce con il tuo account, finché non lo scolleghi/)).toBeTruthy();
    expect(screen.getByText('«Cosa mangiamo stasera?»')).toBeTruthy();
    expect(screen.getByText(/Eliminare una famiglia si fa solo nell’app/)).toBeTruthy();
    expect(screen.queryByText(/password|credenziali/i)).toBeNull();
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
    expect(within(row).getByText(/Collegato il .* · ultimo accesso/)).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    expect(within(sheet).getByText(/non potrà più usare l’app con il tuo account/)).toBeTruthy();
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
      { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7', name: '', connectedAt: '2026-10-01T10:00:00Z', lastUsedAt: null, current: false }
    ]);
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Agente senza nome', { selector: '.row-main' })).closest('li')!;
    expect(within(row).queryByText(/ultimo accesso/)).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText(/togli il servizio dalle impostazioni del tuo agente/)).toBeTruthy();
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

export interface FakeAgent { clientId: string; name: string; connectedAt: string; lastUsedAt: string | null }

/** Fake mode: one agent connected an hour ago, so the list and «Scollega» can be tried. */
export function createFakeAgentsData(now = new Date()): FakeAgent[] {
  return [
    {
      clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
      name: 'Claude Code',
      connectedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      lastUsedAt: new Date(now.getTime() - 3_600_000).toISOString()
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
export function formatLastAccess(locale: Locale, iso: string, now = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(at);
  if (day.format(at) === day.format(now)) return locale === 'it-IT' ? `oggi alle ${time}` : `today at ${time}`;
  const date = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'long' }).format(at);
  return `${date}, ${time}`;
}
```

Se il progetto preferisce le stringhe «oggi alle» nei dizionari, spostarle in `agents.today` (`'oggi alle {time}'` / `'today at {time}'`) e passare `t` a `formatLastAccess`; il test resta uguale.

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
import { formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { useProfile } from '../../session/useFamily';
import { agentsQuery } from './api';
import { ClientGuide } from './ClientGuide';
import { CLIENT_GUIDES, guideFor, mcpUrl } from './clientGuides';
import { CopyField } from './CopyField';
import { formatLastAccess } from './format';
import styles from './AgentsPage.module.css';

/** «Collega un agente» (spec section 13, round 6): address, clients, sign-in, examples, connected agents. */
export function AgentsPage() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const queryClient = useQueryClient();
  const online = useOnline();
  const curator = useProfile().data?.user.globalRoles.includes('recipe_curator') ?? false;
  const url = mcpUrl(window.location.origin);
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
                      {agent.lastUsedAt
                        ? t('agents.connectedOnLast', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)), last: formatLastAccess(locale, agent.lastUsedAt) })
                        : t('agents.connectedOn', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)) })}
                    </small>
                  </span>
                  <button type="button" className="text-button" disabled={!online} onClick={() => setLeaving(agent)}>{t('agents.disconnect')}</button>
                </li>
              ))}
            </ul>
          )}
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
  'agents.signInBody': 'Al primo uso l’agente apre il browser: accedi a Cosa si mangia e consenti l’accesso. Da quel momento l’agente agisce con il tuo account, finché non lo scolleghi qui sotto.',
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
  'agents.connectedOnLast': 'Collegato il {date} · ultimo accesso {last}',
  'agents.disconnect': 'Scollega',
  'agents.disconnectTitle': 'Scollegare {client}?',
  'agents.disconnectBody': '{client} non potrà più usare l’app con il tuo account finché non lo autorizzi di nuovo. Per toglierlo anche dal client: {how}',
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
  'agents.signInBody': 'The first time, the agent opens the browser: sign in to Cosa si mangia and allow access. From then on the agent acts with your account, until you disconnect it below.',
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
  'agents.connectedOnLast': 'Connected on {date} · last access {last}',
  'agents.disconnect': 'Disconnect',
  'agents.disconnectTitle': 'Disconnect {client}?',
  'agents.disconnectBody': '{client} will no longer be able to use the app with your account until you authorise it again. To remove it from the client too: {how}',
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
git add web/src/features/agents web/src/api/types.ts web/src/api/fake/fakeApi.ts web/src/api/fake/fakeAgents.ts web/src/i18n/messages/agents.ts web/src/router.tsx
git commit -m "Agenti: pagina «Collega un agente» con agenti collegati e scollegamento"
```

---

### Task 9: Voce «Collega un agente» nel Profilo

**Files:**
- Modify: `web/src/routes/ProfilePage.tsx`
- Modify: `web/src/routes/ProfilePage.test.tsx`
- Modify: `web/src/components/Icon.tsx` (icona `link`)
- Modify: `web/src/i18n/messages/agents.ts` (chiavi del Profilo)

**Interfaces:**
- Consumes: `agentsQuery` (Task 8), rotta `/profile/agents` (Task 8).

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

### Task 10: Verifica completa e prova con Claude Code vero

**Files:**
- Nessun file nuovo; eventuali correzioni nei file dei task precedenti.

- [ ] **Step 1: Test, typecheck e build di tutto il repository**

Run:

```bash
supabase db reset && supabase test db
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:<porta db>/postgres npm test --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run build -w web
```

Expected: tutto verde; nessun test saltato per mancanza del database.

- [ ] **Step 2: Verifica ripetibile della revoca**

Run (stack con Auth e Worker locali come nel Task 5): `SUPABASE_PUBLISHABLE_KEY=<chiave> node scripts/oauth/revocation-check.mjs`
Expected: tutte le righe `ok`, uscita 0.

- [ ] **Step 3: Claude Code vero contro lo stack locale**

1. `npm run dev -w server` (8787) e `npm run dev -w web` (5174).
2. `claude mcp add --transport http --scope user cosasimangia-local http://127.0.0.1:8787/mcp`, poi in Claude Code `/mcp` › cosasimangia-local › Authenticate.
3. Nel browser: accesso come `anna@example.test`, schermata di consenso con «Claude Code» (o il nome registrato), «Consenti».
4. Chiedere a Claude Code «chi sono?» (`session_whoami` → `channel: mcp`) e «quali agenti ho collegato?» (`agents_list`, `current: true`).
5. Nella pagina `/profile/agents` del web: l'agente compare con «ultimo accesso»; «Scollega» → conferma.
6. Chiedere di nuovo «chi sono?»: Claude Code riceve 401 e propone di autenticarsi di nuovo.
7. Togliere il servizio: `claude mcp remove cosasimangia-local`.

Expected: ogni passo come descritto; annotare nella PR eventuali differenze (nome registrato dal client, testi del client).

- [ ] **Step 4: Prova visiva con agent-browser**

Con la skill agent-browser, a larghezza iPhone (390 px) e porta 8767 secondo le «Interfacce decise» (o la 5174 del Vite di sviluppo): `/authorize?authorization_id=demo` in modalità finta, `/profile/agents` con un agente e senza, foglio di conferma, voce del Profilo; confrontare con `design/design.md` e con il prototipo (`/authorize?client=claude_code`, `/profile/agents`). Correggere spaziature o testi che vanno a capo male, poi rieseguire i test del web.

- [ ] **Step 5: Commit delle correzioni e stato**

```bash
git add -A
git commit -m "Agenti: correzioni dopo la verifica completa"   # solo se ci sono correzioni
```

Poi push del branch e PR verso `main` secondo il protocollo dei worker (`STATO: PR_APERTA <url>`); prima della prova sul Worker pubblicato, `STATO: DOMANDA` con i passi esterni della spec (sezione «Passi esterni per la produzione»).
