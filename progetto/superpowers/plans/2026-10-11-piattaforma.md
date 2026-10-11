# Piattaforma: piano di implementazione

> **Per gli agenti:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, task per task. I passi usano le
> caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** il monorepo con workspace e un Worker che serve SPA, RPC, REST, OpenAPI e
MCP da un contratto unico, con token, contesto, ruolo Postgres, permessi, errori a codici
e letture versionate, provato end-to-end con `session.whoami` contro lo schema di W2.

**Architettura:** npm workspaces (`domain`, `contract`, `server`, `web`) che esportano i
sorgenti TypeScript. `contract` definisce le operazioni con metadati obbligatori ed
errori; `server` le implementa con oRPC tramite un implementatore comune che valida
l'input, verifica il token e i claim, apre la transazione nel ruolo dell'utente, legge
profilo e sessione, applica `webOnly`, controlla il ruolo e gestisce le versioni. Una
`fetch` smista le rotte; `/mcp` controlla token e sessione all'ingresso e genera gli
strumenti dal contratto, lasciando la validazione a oRPC.

**Stack:** TypeScript 6, npm workspaces, oRPC 1.15.5, zod 4, Postgres.js 3, jose 6,
`@modelcontextprotocol/server` 2.3.1, Wrangler 4, Vitest 4 (in Node), CLI di Supabase
per il database locale e di CI.

**Spec:** `progetto/superpowers/specs/2026-10-11-piattaforma.md` (da leggere per prima),
che estende la specifica principale
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 1, 9, 13, 15).
Interfaccia del database: spec di W2
`progetto/superpowers/specs/2026-10-11-schema-e-permessi.md` (su `main` dopo il merge di
W2; prima nel worktree `.worktrees/schema`, solo da leggere).
Codice di partenza provato: `spike/server/src/` (solo da leggere).

Corretto l'11 ottobre 2026 dopo la review di spec e piano
(`progetto/coordinamento/revisioni/w1-spec-piano.md`, sette rilievi applicati).

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti e messaggi di commit in
  italiano, come nella storia del repository.
- Testi per l'utente localizzabili in `it-IT` e `en-GB`.
- Dipendenze ammesse: `@orpc/contract`, `@orpc/server`, `@orpc/openapi`, `@orpc/zod`,
  `@orpc/client` (solo test del server e web), `zod`, `postgres`, `jose`,
  `@modelcontextprotocol/server`, `wrangler`, `@cloudflare/workers-types`, `typescript`,
  `vitest`, `@types/node` (già presente), `yaml` (già presente). Nient'altro.
- Versioni fissate a quelle della prova: oRPC `1.15.5` (l'opzione del generatore OpenAPI
  è `schemaConverters`), zod `4.6.5`, jose `6.2.12`, postgres `3.4.9`, SDK MCP `2.3.1`,
  wrangler `4.149.0`, workers-types `5.20261011.1`.
- Cache di modulo solo con dati già risolti, mai promesse condivise fra richieste.
- Log: mai messaggi d'errore, cause, query, parametri, header o stringhe di connessione;
  solo i campi scelti di `server/src/errors.ts`.
- Nessuna risorsa esterna (Cloudflare, Supabase, segreti GitHub) creata o cambiata senza
  `STATO: DOMANDA` al coordinatore. Nessun merge: lo fa il coordinatore.
- Non toccare `supabase/` (W2), `web/src` (W5), `domain/src` (W3, W4), la specifica
  principale, `AGENTS.md`, `progetto/coordinamento/`.
- Oggetti di W2 usati dal server, tutti nello schema `app` e concentrati in
  `server/src/session.ts`, `server/src/permissions.ts`, `server/src/versions.ts`:
  `app.profiles(user_id, locale)` (creato da trigger su `auth.users`),
  `app.session_is_active()`, `app.is_member(uuid)`, `app.is_family_admin(uuid)`,
  `app.has_role(text)` con `recipe_curator`/`app_admin`, `app.families.data_version`,
  `app.catalogue_state.version`; ruoli `app_server`, `authenticated`, `anon`,
  `app_job`. Se la spec di W2 cambia un nome, si allineano questi tre file e la fixture.
- **Ordine:** la consegna completa (task 11) si apre dopo il merge di W2 e si verifica
  contro le sue migrazioni reali. Prima, solo per sviluppare, la fixture provvisoria con
  `TEST_DB_FIXTURE=1`.

## Focus della review

1. **Versione di un'altra famiglia o lingua**: una `knownVersion` posseduta per la
   famiglia A non vale come «invariato» per la famiglia B con gli stessi contatori (test
   nel task 6).
2. **Header `Authorization` malformato e claim non validi** (`bearer x`, che
   fallisce perché `x` non è un JWT: lo schema si confronta senza distinzione fra maiuscole
   e minuscole come vuole RFC 9110, `Bearer ` vuoto, token non JWT, senza `exp`, `session_id` non UUID, `client_id` vuoto o non
   stringa): sempre `unauthorized`, mai `internal` né canale web, senza arrivare al
   database (test nei task 3, 6 e 7).
3. **Database irraggiungibile**: `internal` con stato 500 e `requestId`, senza la
   stringa di connessione né nel corpo della risposta né nei log (test nei task 4 e 6).
4. **Chiamate concorrenti a cache vuota delle chiavi**: nessuna promessa condivisa, ogni
   richiesta fa il proprio fetch (test nel task 3).
5. **Sessione chiusa con un token ancora valido**: rifiutata su RPC, REST e su ogni
   richiesta MCP, compresi `initialize` e `tools/list`, e prima del rimando `web_only`
   (test nei task 6 e 8).

---

## Mappa dei file

```
contract/src/index.ts               esporta contratto e convenzioni
contract/src/locale.ts              lingue supportate
contract/src/errors.ts              codici, stati HTTP, schemi dei dati
contract/src/op.ts                  costruttore `op` e OperationMeta
contract/src/versioned.ts           input e output delle letture versionate
contract/src/check.ts               controllo delle convenzioni (riusato dal server)
contract/src/contract.ts            il contratto: session.whoami
contract/src/check.test.ts, contract.test.ts
server/package.json, wrangler.jsonc, .env.example, README.md
server/src/env.ts                   tipo Env dei binding
server/src/auth.ts                  verifica del token e dei claim, sorgente delle chiavi, canale
server/src/messages.ts              messaggi degli errori in it-IT e en-GB
server/src/errors.ts                normalizzazione degli errori e log senza segreti
server/src/db.ts                    transazione con scelta del ruolo
server/src/session.ts               profilo e sessione dell'utente
server/src/permissions.ts           controllo dei ruoli con le funzioni di W2
server/src/versions.ts              composizione della versione
server/src/pipeline.ts              implementatore comune con il middleware
server/src/router.ts                implementazione del contratto
server/src/mcp.ts                   strumenti MCP dal contratto, validazione lasciata a oRPC
server/src/well-known.ts            metadati OAuth
server/src/app.ts                   createApp: smistamento delle rotte, ingresso MCP
server/src/index.ts                 Worker di produzione
server/test/support/keys.ts         chiavi e token di prova
server/test/support/db.ts           database di prova
server/test/support/schema.sql      fixture provvisoria con i nomi di W2 (tolta nel task 11)
server/test/support/test-contract.ts contratto e router di prova
server/test/support/context.ts      contesto di prova per chiamare il router senza HTTP
server/test/support/requests.ts     chiamate RPC, REST e MCP verso l'app
server/test/*.test.ts
.github/workflows/ci.yml            job unico con database (task 11)
```

---

### Task 1: Scheletro del monorepo e CI (fatto)

Consegnato con la PR #3 (branch `fondamenta/scheletro`, da `origin/main`): workspace,
`tsconfig.base.json`, una `vitest.config.ts` per workspace, segnaposto di `contract`,
`server` e `web`, CI con typecheck e test. Prima di iniziare il task 2:

- [ ] **Passo 1: porta lo scheletro su `fondamenta/piattaforma`**

Se la PR #3 è unita: `git fetch origin && git merge origin/main`. Altrimenti
`git merge origin/fondamenta/scheletro` (stesso contenuto; il merge di `main` arriverà
dopo senza conflitti).

Run: `npm ci && npm test && npm run typecheck`
Expected: PASS (66 test di `scripts/` e `domain/`, più i due segnaposto).

---

### Task 2: Convenzioni del contratto e `session.whoami`

**File:**
- Crea: `contract/src/locale.ts`, `contract/src/errors.ts`, `contract/src/op.ts`,
  `contract/src/versioned.ts`, `contract/src/check.ts`, `contract/src/contract.ts`,
  `contract/src/check.test.ts`, `contract/src/contract.test.ts`
- Modifica: `contract/src/index.ts`; elimina `contract/src/index.test.ts`

**Interfacce:**
- Produce:
  - `locales`, `type Locale = 'it-IT' | 'en-GB'`, `localeSchema`
  - `errorCodes`, `type ErrorCode`, `isErrorCode(code: string): code is ErrorCode`,
    `errorDefinitions` (stato HTTP e schema dati per codice), `commonErrors`
  - `type Role`, `type VersionScope`, `interface OperationMeta`, `op(meta: OperationMeta)`
  - `versionedInput(schema)`, `versionedOutput(view)`, `isVersionedOutput(schema)`
  - `checkContract(router: object): string[]`
  - `contract`, `type Contract`

- [ ] **Passo 1: test delle convenzioni (falliscono)**

`contract/src/check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkContract } from './check.ts';
import { op } from './op.ts';
import { versionedInput, versionedOutput } from './versioned.ts';

const route = { method: 'POST', path: '/x', summary: 'X' } as const;

describe('checkContract', () => {
	it('accepts a well-formed operation', () => {
		const contract = {
			ok: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
				.route(route)
				.input(z.object({}))
				.output(z.object({})),
		};
		expect(checkContract(contract)).toEqual([]);
	});

	it('reports missing metadata', () => {
		const base = op({ mcp: false, offline: false, role: 'user' });
		const broken = { ...base, '~orpc': { ...base['~orpc'], meta: {} } };
		const contract = { broken: Object.assign(Object.create(Object.getPrototypeOf(base)), broken) };
		expect(checkContract(contract)).toEqual(
			expect.arrayContaining([
				'broken: missing mcp',
				'broken: missing offline',
				'broken: missing role',
			]),
		);
	});

	it('requires an MCP tool for webOnly operations', () => {
		const contract = {
			remove: op({ mcp: false, webOnly: { path: '/family/:familyId/delete' }, offline: false, role: 'familyAdmin' })
				.route(route)
				.input(z.object({ familyId: z.uuid() }))
				.output(z.object({})),
		};
		expect(checkContract(contract)).toContain('remove: webOnly needs mcp exposure to answer web_only');
	});

	it('requires familyId for family roles', () => {
		const contract = {
			member: op({ mcp: false, offline: false, role: 'familyMember' }).route(route).input(z.object({})).output(z.object({})),
		};
		expect(checkContract(contract)).toContain('member: family role needs a uuid familyId input');
	});

	it('requires a client id for offline and creating operations', () => {
		const contract = {
			queue: op({ mcp: false, offline: true, role: 'user' }).route(route).input(z.object({})).output(z.object({})),
			create: op({ mcp: false, offline: false, role: 'user', creates: true }).route(route).input(z.object({ id: z.string() })).output(z.object({})),
		};
		const problems = checkContract(contract);
		expect(problems).toContain('queue: offline or creating operation needs a uuid id input');
		expect(problems).toContain('create: offline or creating operation needs a uuid id input');
	});

	it('rejects optional or nullable identifiers', () => {
		const contract = {
			optionalFamily: op({ mcp: false, offline: false, role: 'familyMember' })
				.route(route).input(z.object({ familyId: z.uuid().optional() })).output(z.object({})),
			nullableFamily: op({ mcp: false, offline: false, role: 'familyAdmin' })
				.route(route).input(z.object({ familyId: z.uuid().nullable() })).output(z.object({})),
			optionalId: op({ mcp: false, offline: true, role: 'user' })
				.route(route).input(z.object({ id: z.uuid().optional() })).output(z.object({})),
		};
		expect(checkContract(contract)).toEqual([
			'optionalFamily: family role needs a uuid familyId input',
			'nullableFamily: family role needs a uuid familyId input',
			'optionalId: offline or creating operation needs a uuid id input',
		]);
	});

	it('rejects a knownVersion that is not an optional string', () => {
		const numeric = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({ knownVersion: z.number().optional() }))
				.output(versionedOutput(z.object({}))),
		};
		expect(checkContract(numeric)).toEqual(['view: versioned read needs an optional string knownVersion input']);
		const required = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({ knownVersion: z.string() }))
				.output(versionedOutput(z.object({}))),
		};
		expect(checkContract(required)).toEqual(['view: versioned read needs an optional string knownVersion input']);
	});

	it('requires the versioned shape for reads', () => {
		const good = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(versionedInput(z.object({})))
				.output(versionedOutput(z.object({ n: z.number() }))),
		};
		expect(checkContract(good)).toEqual([]);
		const bad = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({}))
				.output(z.object({})),
		};
		expect(checkContract(bad)).toEqual([
			'view: versioned read needs an optional string knownVersion input',
			'view: versioned read needs versionedOutput',
		]);
	});

	it('requires method, path and summary', () => {
		const contract = {
			bare: op({ mcp: false, offline: false, role: 'user' }).input(z.object({})).output(z.object({})),
		};
		expect(checkContract(contract)).toContain('bare: route needs method, path and summary');
	});

	it('walks nested routers', () => {
		const contract = {
			area: { inner: op({ mcp: false, offline: true, role: 'user' }).route(route).input(z.object({})).output(z.object({})) },
		};
		expect(checkContract(contract)).toEqual(['area.inner: offline or creating operation needs a uuid id input']);
	});
});
```

`contract/src/contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkContract } from './check.ts';
import { contract } from './contract.ts';
import { errorCodes, errorDefinitions } from './errors.ts';

describe('the published contract', () => {
	it('follows the conventions', () => {
		expect(checkContract(contract)).toEqual([]);
	});

	it('defines a status for every error code', () => {
		for (const code of errorCodes) expect(errorDefinitions[code].status).toBeGreaterThanOrEqual(400);
	});

	it('exposes session.whoami as a read-only tool for any user', () => {
		expect(contract.session.whoami['~orpc'].meta).toEqual({ mcp: { readOnly: true }, offline: false, role: 'user' });
	});
});
```

- [ ] **Passo 2: verifica che falliscano**

Run: `npm test -w contract`
Expected: FAIL, moduli `./check.ts`, `./op.ts`, `./contract.ts` inesistenti.

- [ ] **Passo 3: implementazione**

`contract/src/locale.ts`:

```ts
import { z } from 'zod';

export const locales = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof locales)[number];
export const localeSchema = z.enum(locales);
```

`contract/src/errors.ts`:

```ts
import { z } from 'zod';

/** Error codes of the operations (specification, section 1). Clients translate them. */
export const errorCodes = [
	'unauthorized',
	'forbidden',
	'not_found',
	'invalid',
	'conflict',
	'last_admin',
	'last_app_admin',
	'sole_member',
	'web_only',
	'internal',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export function isErrorCode(code: string): code is ErrorCode {
	return (errorCodes as readonly string[]).includes(code);
}

export const invalidData = z.object({
	issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() })),
});
/** Final shape fixed with the drafts in wave 2. */
export const conflictData = z.object({ by: z.uuid(), at: z.iso.datetime(), fields: z.array(z.string()) });
export const webOnlyData = z.object({ url: z.url() });
/** Correlates the answer with the Worker log line of the unexpected error. */
export const internalData = z.object({ requestId: z.string() });

export const errorDefinitions = {
	unauthorized: { status: 401 },
	forbidden: { status: 403 },
	not_found: { status: 404 },
	invalid: { status: 400, data: invalidData },
	conflict: { status: 409, data: conflictData },
	last_admin: { status: 409 },
	last_app_admin: { status: 409 },
	sole_member: { status: 409 },
	web_only: { status: 403, data: webOnlyData },
	internal: { status: 500, data: internalData },
} as const satisfies Record<ErrorCode, { status: number; data?: z.ZodType }>;

/** Errors every operation can raise; operations add their own with `.errors()`. */
export const commonErrors = {
	unauthorized: errorDefinitions.unauthorized,
	forbidden: errorDefinitions.forbidden,
	invalid: errorDefinitions.invalid,
	web_only: errorDefinitions.web_only,
	internal: errorDefinitions.internal,
};
```

`contract/src/op.ts`:

```ts
import { oc } from '@orpc/contract';
import { commonErrors } from './errors.ts';

export type Role = 'user' | 'familyMember' | 'familyAdmin' | 'curator' | 'appAdmin';
export type VersionScope = 'family' | 'catalogue';

/** Required on every operation: the contract test rejects operations without it. */
export interface OperationMeta {
	/** Exposure as an MCP tool, generated from the contract. */
	mcp: { readOnly: boolean } | false;
	/** Reserved to the web app: MCP callers get `web_only` with this page (`:name` from the input). */
	webOnly?: { path: string };
	/** Can be queued offline: absolute state and a client-generated `id`. */
	offline: boolean;
	role: Role;
	/** Versioned read and the counters it depends on. */
	reads?: VersionScope[];
	/** Creates an entity whose `id` comes from the client. */
	creates?: true;
}

const base = oc.$meta<Partial<OperationMeta>>({}).errors(commonErrors);

/** Starts an operation; the metadata argument makes the exposure choice explicit. */
export function op(meta: OperationMeta) {
	return base.meta(meta);
}
```

`contract/src/versioned.ts`:

```ts
import { z } from 'zod';

const versionedOutputs = new WeakSet<z.ZodType>();

/** Input of a versioned read: the version already held by the client, if any. */
export function versionedInput<T extends z.ZodObject>(schema: T) {
	return schema.extend({ knownVersion: z.string().min(1).max(200).optional() });
}

/** Output of a versioned read: `unchanged` without data, or the fresh view. */
export function versionedOutput<T extends z.ZodType>(view: T) {
	const schema = z.discriminatedUnion('unchanged', [
		z.object({ unchanged: z.literal(true), version: z.string() }),
		z.object({ unchanged: z.literal(false), version: z.string(), data: view }),
	]);
	versionedOutputs.add(schema);
	return schema;
}

export function isVersionedOutput(schema: unknown): boolean {
	return typeof schema === 'object' && schema !== null && versionedOutputs.has(schema as z.ZodType);
}
```

`contract/src/check.ts`:

```ts
import { z } from 'zod';
import type { OperationMeta } from './op.ts';
import { isVersionedOutput } from './versioned.ts';

interface ProcedureDef {
	meta: Partial<OperationMeta>;
	route: { method?: string; path?: string; summary?: string };
	inputSchema?: unknown;
	outputSchema?: unknown;
}

function walk(node: object, path: string[], visit: (def: ProcedureDef, name: string) => void): void {
	if ('~orpc' in node) {
		visit((node as { '~orpc': ProcedureDef })['~orpc'], path.join('.'));
		return;
	}
	for (const [key, child] of Object.entries(node)) {
		if (typeof child === 'object' && child !== null) walk(child, [...path, key], visit);
	}
}

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

/** A required, non-nullable uuid: identifiers that idempotence and permissions rely on. */
function requiresUuid(schema: unknown): boolean {
	if (!(schema instanceof z.ZodType)) return false;
	return (
		accepts(schema, crypto.randomUUID()) &&
		!accepts(schema, 'not-a-uuid') &&
		!accepts(schema, undefined) &&
		!accepts(schema, null)
	);
}

/** An optional string: absent or a version string, never a number or null. */
function isOptionalString(schema: unknown): boolean {
	if (!(schema instanceof z.ZodType)) return false;
	return accepts(schema, undefined) && accepts(schema, 'v1') && !accepts(schema, 1) && !accepts(schema, null);
}

/** Convention problems of every operation in a contract router; empty when all is well. */
export function checkContract(router: object): string[] {
	const problems: string[] = [];
	walk(router, [], (def, name) => {
		const meta = def.meta;
		if (meta.mcp === undefined) problems.push(`${name}: missing mcp`);
		if (typeof meta.offline !== 'boolean') problems.push(`${name}: missing offline`);
		if (meta.role === undefined) problems.push(`${name}: missing role`);
		if (meta.webOnly && meta.mcp === false) problems.push(`${name}: webOnly needs mcp exposure to answer web_only`);
		if (!def.route.method || !def.route.path || !def.route.summary) {
			problems.push(`${name}: route needs method, path and summary`);
		}
		const shape = def.inputSchema instanceof z.ZodObject ? def.inputSchema.shape : undefined;
		if (!shape) {
			problems.push(`${name}: input must be a zod object`);
			return;
		}
		if ((meta.role === 'familyMember' || meta.role === 'familyAdmin') && !requiresUuid(shape.familyId)) {
			problems.push(`${name}: family role needs a uuid familyId input`);
		}
		if ((meta.offline || meta.creates) && !requiresUuid(shape.id)) {
			problems.push(`${name}: offline or creating operation needs a uuid id input`);
		}
		if (meta.reads) {
			if (!isOptionalString(shape.knownVersion)) {
				problems.push(`${name}: versioned read needs an optional string knownVersion input`);
			}
			if (!isVersionedOutput(def.outputSchema)) problems.push(`${name}: versioned read needs versionedOutput`);
		}
	});
	return problems;
}
```

`contract/src/contract.ts`:

```ts
import { z } from 'zod';
import { localeSchema } from './locale.ts';
import { op } from './op.ts';

export const contract = {
	session: {
		whoami: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
			.route({ method: 'GET', path: '/session/whoami', summary: 'Identify the caller, the channel and the language' })
			.input(z.object({}))
			.output(
				z.object({
					userId: z.uuid(),
					channel: z.enum(['web', 'mcp']),
					clientId: z.string().nullable(),
					locale: localeSchema,
				}),
			),
	},
};

export type Contract = typeof contract;
```

`contract/src/index.ts`:

```ts
export { checkContract } from './check.ts';
export { contract, type Contract } from './contract.ts';
export { commonErrors, errorCodes, errorDefinitions, isErrorCode, type ErrorCode } from './errors.ts';
export { localeSchema, locales, type Locale } from './locale.ts';
export { op, type OperationMeta, type Role, type VersionScope } from './op.ts';
export { isVersionedOutput, versionedInput, versionedOutput } from './versioned.ts';
```

Elimina `contract/src/index.test.ts` (sostituito da `contract.test.ts`).

Nota sul test «reports missing metadata»: costruisce un'operazione con metadati vuoti
aggirando `op()`, perché il tipo di `op` li rende già obbligatori. Se la copia del
prototipo non funziona con la classe di oRPC, sostituiscila con
`oc.$meta({}).route(route).input(z.object({})).output(z.object({}))` importando `oc` da
`@orpc/contract`: il test verifica `checkContract`, non il costruttore.

- [ ] **Passo 4: verifica che passino**

Run: `npm test -w contract && npm run typecheck -w contract`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add contract
git commit -m "Contratto: metadati obbligatori, errori a codici, letture versionate e session.whoami"
```

---

### Task 3: Verifica del token, claim obbligatori e canale

**File:**
- Crea: `server/src/env.ts`, `server/src/auth.ts`, `server/test/support/keys.ts`,
  `server/test/auth.test.ts`
- Modifica: `server/package.json` (dipendenze)

**Interfacce:**
- Produce:
  - `interface Env { HYPERDRIVE: Hyperdrive; SUPABASE_URL: string; CF_VERSION_METADATA: WorkerVersionMetadata; ASSETS: Fetcher }`
  - `type Claims` (da `claimsSchema`): `sub` UUID, `role: 'authenticated'`, `session_id`
    UUID, `exp` numero, `client_id?` stringa non vuota, più gli altri claim invariati
  - `type Channel = 'web' | 'mcp'`, `channelOf(claims): Channel`
  - `type KeySource = (forceRefresh: boolean) => Promise<JSONWebKeySet>`
  - `remoteKeySource(supabaseUrl: string): KeySource`
  - `verifyAccessToken(token: string, options: { issuer: string; keys: KeySource }): Promise<Claims>`
  - `bearerToken(header: string | null): string | undefined`
  - test: `createTestKeys(): Promise<TestKeys>` con `keys`, `issuer`,
    `sign(claims: Record<string, unknown> & { sub: string }, options?: { expiresIn?: string; noExpiry?: boolean; kid?: string }): Promise<string>`;
    `sign` aggiunge `role`, `aud` e un `session_id` casuale, sovrascrivibili (passare
    `session_id: undefined` lo toglie)

- [ ] **Passo 1: dipendenze**

Run: `npm install -w server jose@6.2.12 zod@4.6.5`

- [ ] **Passo 2: chiavi di prova**

`server/test/support/keys.ts`:

```ts
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import type { KeySource } from '../../src/auth.ts';

export const TEST_SUPABASE_URL = 'https://test.supabase.local';
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;

export interface TestKeys {
	keys: KeySource;
	issuer: string;
	sign(
		claims: Record<string, unknown> & { sub: string },
		options?: { expiresIn?: string; noExpiry?: boolean; kid?: string },
	): Promise<string>;
}

/** An ES256 key pair like Supabase asymmetric signing keys, served from memory. */
export async function createTestKeys(): Promise<TestKeys> {
	const { publicKey, privateKey } = await generateKeyPair('ES256');
	const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
	const jwks: JSONWebKeySet = { keys: [jwk] };
	return {
		keys: async () => jwks,
		issuer: TEST_ISSUER,
		async sign(claims, options = {}) {
			// JSON drops undefined values: `session_id: undefined` removes the default.
			const payload = JSON.parse(
				JSON.stringify({ role: 'authenticated', aud: 'authenticated', session_id: crypto.randomUUID(), ...claims }),
			);
			const jwt = new SignJWT(payload)
				.setProtectedHeader({ alg: 'ES256', kid: options.kid ?? 'test-key' })
				.setIssuer(TEST_ISSUER)
				.setIssuedAt();
			if (!options.noExpiry) jwt.setExpirationTime(options.expiresIn ?? '1h');
			return jwt.sign(privateKey);
		},
	};
}
```

- [ ] **Passo 3: test (falliscono)**

`server/test/auth.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, channelOf, remoteKeySource, verifyAccessToken } from '../src/auth.ts';
import { createTestKeys, TEST_ISSUER } from './support/keys.ts';

const userId = '11111111-1111-4111-8111-111111111111';

describe('verifyAccessToken', () => {
	it('accepts a valid user token', async () => {
		const t = await createTestKeys();
		const sessionId = crypto.randomUUID();
		const claims = await verifyAccessToken(await t.sign({ sub: userId, session_id: sessionId }), { issuer: TEST_ISSUER, keys: t.keys });
		expect(claims.sub).toBe(userId);
		expect(claims.session_id).toBe(sessionId);
		expect(claims.client_id).toBeUndefined();
	});

	it('keeps a valid client_id', async () => {
		const t = await createTestKeys();
		const claims = await verifyAccessToken(await t.sign({ sub: userId, client_id: 'codex' }), { issuer: TEST_ISSUER, keys: t.keys });
		expect(channelOf(claims)).toBe('mcp');
	});

	it('rejects an expired token or one without expiry', async () => {
		const t = await createTestKeys();
		const expired = await t.sign({ sub: userId }, { expiresIn: '-1m' });
		const endless = await t.sign({ sub: userId }, { noExpiry: true });
		await expect(verifyAccessToken(expired, { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(endless, { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('rejects invalid identity claims', async () => {
		const t = await createTestKeys();
		const cases: Record<string, unknown>[] = [
			{ sub: 'not-a-uuid' },
			{ sub: userId, session_id: undefined },
			{ sub: userId, session_id: 'not-a-uuid' },
			{ sub: userId, client_id: '' },
			{ sub: userId, client_id: false },
			{ sub: userId, client_id: 42 },
		];
		for (const claims of cases) {
			const token = await t.sign(claims as { sub: string });
			await expect(verifyAccessToken(token, { issuer: TEST_ISSUER, keys: t.keys }), JSON.stringify(claims)).rejects.toThrow();
		}
	});

	it('rejects another issuer, audience or role', async () => {
		const t = await createTestKeys();
		await expect(verifyAccessToken(await t.sign({ sub: userId }), { issuer: 'https://other/auth/v1', keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(await t.sign({ sub: userId, aud: 'other' }), { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(await t.sign({ sub: userId, role: 'anon' }), { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('rejects a token signed by another key', async () => {
		const a = await createTestKeys();
		const b = await createTestKeys();
		await expect(verifyAccessToken(await b.sign({ sub: userId }), { issuer: TEST_ISSUER, keys: a.keys })).rejects.toThrow();
	});

	it('rejects garbage', async () => {
		const t = await createTestKeys();
		await expect(verifyAccessToken('not-a-jwt', { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('refetches the keys once for an unknown kid', async () => {
		const t = await createTestKeys();
		const keys = vi.fn(t.keys);
		const token = await t.sign({ sub: userId }, { kid: 'rotated' });
		await expect(verifyAccessToken(token, { issuer: TEST_ISSUER, keys })).rejects.toThrow();
		expect(keys.mock.calls).toEqual([[false], [true]]);
	});
});

describe('remoteKeySource', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('does not share in-flight fetches between concurrent callers', async () => {
		const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
		vi.stubGlobal('fetch', fetchMock);
		const source = remoteKeySource('https://concurrent.supabase.local');
		await Promise.all([source(false), source(false)]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await source(false);
		expect(fetchMock).toHaveBeenCalledTimes(2); // resolved keys are cached
	});
});

describe('bearer header', () => {
	it('reads only well-formed bearer headers', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('bearer abc')).toBe('abc'); // scheme is case-insensitive (RFC 9110)
		expect(bearerToken('Bearer ')).toBeUndefined();
		expect(bearerToken(null)).toBeUndefined();
	});
});
```

- [ ] **Passo 4: verifica che falliscano**

Run: `npm test -w server -- auth`
Expected: FAIL, `../src/auth.ts` inesistente.

- [ ] **Passo 5: implementazione**

`server/src/env.ts`:

```ts
export interface Env {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSETS: Fetcher;
}
```

`server/src/auth.ts`:

```ts
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from 'jose';
import { z } from 'zod';

/**
 * Claims the server relies on, validated after the signature: they are the security
 * boundary (identity, session for revocation, channel). Other claims pass through to
 * Postgres unchanged as `request.jwt.claims`.
 */
const claimsSchema = z.looseObject({
	sub: z.uuid(),
	role: z.literal('authenticated'),
	session_id: z.uuid(),
	exp: z.number(),
	/** Present only on tokens issued by the OAuth server to an agent (MCP channel). */
	client_id: z.string().min(1).optional(),
});

export type Claims = z.infer<typeof claimsSchema>;
export type Channel = 'web' | 'mcp';

export function channelOf(claims: Claims): Channel {
	return claims.client_id === undefined ? 'web' : 'mcp';
}

export type KeySource = (forceRefresh: boolean) => Promise<JSONWebKeySet>;

const KEYS_TTL_MS = 10 * 60 * 1000;

/**
 * Public signing keys of the Supabase project. Only resolved data is shared across
 * requests: a Worker request must never await I/O started by another request (it hangs
 * and gets cancelled), so concurrent callers on an empty cache each fetch.
 */
export function remoteKeySource(supabaseUrl: string): KeySource {
	let cached: { keys: JSONWebKeySet; fetchedAt: number } | undefined;
	return async (forceRefresh) => {
		if (!forceRefresh && cached && Date.now() - cached.fetchedAt < KEYS_TTL_MS) return cached.keys;
		const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
		if (!response.ok) throw new Error(`JWKS unavailable: ${response.status}`);
		const keys = (await response.json()) as JSONWebKeySet;
		cached = { keys, fetchedAt: Date.now() };
		return keys;
	};
}

export async function verifyAccessToken(token: string, options: { issuer: string; keys: KeySource }): Promise<Claims> {
	let keys = await options.keys(false);
	// A rotated key has an unknown `kid`: refetch once before refusing the token.
	const { kid } = decodeProtectedHeader(token);
	if (kid && !keys.keys.some((key) => key.kid === kid)) keys = await options.keys(true);
	const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
		issuer: options.issuer,
		audience: 'authenticated',
		requiredClaims: ['exp', 'sub', 'session_id'],
	});
	const claims = claimsSchema.safeParse(payload);
	if (!claims.success) throw new Error('Token claims are not valid');
	return claims.data;
}

export function bearerToken(header: string | null): string | undefined {
	if (!header?.startsWith('Bearer ')) return undefined;
	const token = header.slice('Bearer '.length).trim();
	return token || undefined;
}
```

Il `remoteKeySource` va creato **una volta per isolate** (task 7), non per richiesta,
altrimenti la cache non serve.

- [ ] **Passo 6: verifica che passino**

Run: `npm test -w server -- auth && npm run typecheck -w server`
Expected: PASS.

- [ ] **Passo 7: commit**

```bash
git add server package-lock.json
git commit -m "Server: verifica dei token di Supabase con claim obbligatori e canale da client_id"
```

---

### Task 4: Errori normalizzati, log senza segreti e messaggi localizzati

**File:**
- Crea: `server/src/messages.ts`, `server/src/errors.ts`, `server/test/errors.test.ts`
- Modifica: `server/package.json` (dipendenze oRPC)

**Interfacce:**
- Consuma: `ErrorCode`, `errorCodes`, `isErrorCode`, `errorDefinitions`, `Locale`, `locales` da `@app/contract`.
- Produce:
  - `messages: Record<ErrorCode, Record<Locale, string>>`, `messageFor(code, locale): string`
  - `appError(code: ErrorCode, data?: unknown): ORPCError<ErrorCode, unknown>`
  - `interface ErrorScope { requestId: string; path?: readonly string[] }`
  - `normalizeError(error: unknown, scope: ErrorScope): ORPCError<ErrorCode, unknown>`
  - `diagnosticOf(error: unknown): { name: string; code?: string }`
  - `mapErrors`: interceptor `({ next, context, path }) => …` per `clientInterceptors`
    degli handler e `interceptors` del client del router; legge `context.requestId`
  - `toolErrorBody(error: unknown, locale: Locale, scope: ErrorScope): { code: ErrorCode; data?: unknown; message: string }`

- [ ] **Passo 1: dipendenze**

Run: `npm install -w server @orpc/server@1.15.5 @orpc/openapi@1.15.5 @orpc/zod@1.15.5 @orpc/contract@1.15.5 && npm install -w server -D @orpc/client@1.15.5`

- [ ] **Passo 2: test (falliscono)**

`server/test/errors.test.ts`:

```ts
import { errorCodes, locales } from '@app/contract';
import { ORPCError, ValidationError } from '@orpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appError, diagnosticOf, normalizeError, toolErrorBody } from '../src/errors.ts';
import { messages } from '../src/messages.ts';

const scope = { requestId: 'req-1', path: ['session', 'whoami'] };

afterEach(() => vi.restoreAllMocks());

describe('messages', () => {
	it('has a non-empty text for every code in both languages', () => {
		for (const code of errorCodes) for (const locale of locales) expect(messages[code][locale].length).toBeGreaterThan(0);
	});
});

describe('normalizeError', () => {
	it('turns input validation into invalid with field paths', () => {
		const validation = new ORPCError('BAD_REQUEST', {
			cause: new ValidationError({
				message: 'Input validation failed',
				issues: [{ message: 'Invalid UUID', path: ['familyId'], code: 'invalid_format' } as never],
				data: {},
			}),
		});
		const error = normalizeError(validation, scope);
		expect(error.code).toBe('invalid');
		expect(error.status).toBe(400);
		expect(error.data).toEqual({ issues: [{ path: ['familyId'], code: 'invalid_format' }] });
	});

	it('keeps known codes', () => {
		const error = normalizeError(appError('forbidden'), scope);
		expect(error.code).toBe('forbidden');
		expect(error.status).toBe(403);
	});

	it('hides unexpected errors as internal with the request id', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = normalizeError(new Error('postgres://user:secret@host/db refused'), scope);
		expect(error.code).toBe('internal');
		expect(error.status).toBe(500);
		expect(error.data).toEqual({ requestId: 'req-1' });
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
	});

	it('logs chosen fields only, never secrets', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const inner = Object.assign(
			new Error('connect ECONNREFUSED postgres://app_server:hunter2@db.local:5432/postgres, Authorization: Bearer eyJhbGciOi.secret'),
			{ code: 'ECONNREFUSED', query: 'select secret_column', parameters: ['hunter2'] },
		);
		normalizeError(new ORPCError('INTERNAL_SERVER_ERROR', { cause: inner }), scope);
		const logged = JSON.stringify(log.mock.calls);
		for (const secret of ['hunter2', 'postgres://', 'Bearer', 'eyJhbGciOi', 'secret_column']) {
			expect(logged).not.toContain(secret);
		}
		expect(logged).toContain('ECONNREFUSED');
		expect(logged).toContain('req-1');
		expect(logged).toContain('session.whoami');
	});
});

describe('diagnosticOf', () => {
	it('takes the innermost name and a code only when it looks like one', () => {
		const pg = Object.assign(new Error('relation "x" does not exist'), { name: 'PostgresError', code: '42P01' });
		expect(diagnosticOf(new Error('outer', { cause: pg }))).toEqual({ name: 'PostgresError', code: '42P01' });
		expect(diagnosticOf(Object.assign(new Error('x'), { code: 'postgres://u:p@h' }))).toEqual({ name: 'Error' });
		expect(diagnosticOf('a string')).toEqual({ name: 'string' });
	});
});

describe('toolErrorBody', () => {
	it('adds the message in the user language', () => {
		expect(toolErrorBody(appError('web_only', { url: 'https://x/family' }), 'en-GB', scope)).toEqual({
			code: 'web_only',
			data: { url: 'https://x/family' },
			message: messages.web_only['en-GB'],
		});
	});
});
```

- [ ] **Passo 3: verifica che falliscano**

Run: `npm test -w server -- errors`
Expected: FAIL, moduli inesistenti.

- [ ] **Passo 4: implementazione**

`server/src/messages.ts`:

```ts
import type { ErrorCode, Locale } from '@app/contract';

/** Texts of the error codes, used only for MCP: the web app translates codes itself. */
export const messages: Record<ErrorCode, Record<Locale, string>> = {
	unauthorized: {
		'it-IT': 'Accesso non valido o scaduto: collega di nuovo l’agente.',
		'en-GB': 'Access is invalid or has expired: connect the agent again.',
	},
	forbidden: {
		'it-IT': 'Non hai i permessi per questa operazione.',
		'en-GB': 'You do not have permission for this operation.',
	},
	not_found: { 'it-IT': 'Elemento non trovato.', 'en-GB': 'Item not found.' },
	invalid: {
		'it-IT': 'Alcuni dati non sono validi: controlla i campi indicati.',
		'en-GB': 'Some data is not valid: check the fields listed.',
	},
	conflict: {
		'it-IT': 'Qualcun altro ha modificato questi dati nel frattempo.',
		'en-GB': 'Someone else changed this data in the meantime.',
	},
	last_admin: {
		'it-IT': 'La famiglia deve avere almeno un amministratore.',
		'en-GB': 'The family must have at least one administrator.',
	},
	last_app_admin: {
		'it-IT': 'L’app deve avere almeno un amministratore.',
		'en-GB': 'The app must have at least one administrator.',
	},
	sole_member: {
		'it-IT': 'Sei l’unico membro: questa operazione eliminerebbe la famiglia.',
		'en-GB': 'You are the only member: this operation would delete the family.',
	},
	web_only: {
		'it-IT': 'Questa operazione si completa solo nell’app: apri il collegamento indicato.',
		'en-GB': 'This operation can only be completed in the app: open the link provided.',
	},
	internal: {
		'it-IT': 'Si è verificato un errore imprevisto. Riprova più tardi.',
		'en-GB': 'An unexpected error occurred. Please try again later.',
	},
};

export function messageFor(code: ErrorCode, locale: Locale): string {
	return messages[code][locale];
}
```

`server/src/errors.ts`:

```ts
import { errorDefinitions, isErrorCode, type ErrorCode, type Locale } from '@app/contract';
import { ORPCError, ValidationError } from '@orpc/server';
import { messageFor } from './messages.ts';

export interface ErrorScope {
	requestId: string;
	path?: readonly string[];
}

export function appError(code: ErrorCode, data?: unknown): ORPCError<ErrorCode, unknown> {
	return new ORPCError(code, { status: errorDefinitions[code].status, data });
}

const CODE_SHAPE = /^[A-Z0-9_]{2,40}$/;

/**
 * Name and code of the innermost cause. Messages, queries, parameters and causes are
 * never logged: they can hold passwords, tokens, connection strings or personal data.
 */
export function diagnosticOf(error: unknown): { name: string; code?: string } {
	let current = error;
	for (let depth = 0; depth < 5 && current instanceof Error && current.cause !== undefined; depth++) current = current.cause;
	const name = current instanceof Error ? current.name : typeof current;
	const code = (current as { code?: unknown } | null)?.code;
	return typeof code === 'string' && CODE_SHAPE.test(code) ? { name, code } : { name };
}

/** Every error leaving an operation becomes one of the contract codes. */
export function normalizeError(error: unknown, scope: ErrorScope): ORPCError<ErrorCode, unknown> {
	if (error instanceof ORPCError) {
		if (error.code === 'BAD_REQUEST' && error.cause instanceof ValidationError) {
			const issues = error.cause.issues.map((issue) => ({
				path: (issue.path ?? []).map((part) => {
					const key = typeof part === 'object' ? part.key : part;
					return typeof key === 'number' ? key : String(key);
				}),
				code: (issue as { code?: string }).code ?? 'invalid',
			}));
			return new ORPCError('invalid', { status: 400, data: { issues } });
		}
		if (isErrorCode(error.code)) return error as ORPCError<ErrorCode, unknown>;
	}
	console.error(
		JSON.stringify({ event: 'unexpected_error', requestId: scope.requestId, path: scope.path?.join('.'), ...diagnosticOf(error) }),
	);
	return new ORPCError('internal', { status: 500, data: { requestId: scope.requestId } });
}

/** Interceptor for handlers and router clients: run, then normalise what is thrown. */
export async function mapErrors<T>(options: {
	next: () => Promise<T>;
	context?: { requestId?: string };
	path?: readonly string[];
}): Promise<T> {
	try {
		return await options.next();
	} catch (error) {
		throw normalizeError(error, { requestId: options.context?.requestId ?? 'unknown', path: options.path });
	}
}

export function toolErrorBody(
	error: unknown,
	locale: Locale,
	scope: ErrorScope,
): { code: ErrorCode; data?: unknown; message: string } {
	const normalized = normalizeError(error, scope);
	return { code: normalized.code, data: normalized.data, message: messageFor(normalized.code, locale) };
}
```

Note:

- `new ORPCError('internal', …)` e `invalid` sono creati senza `cause`: nulla di interno
  finisce nel JSON della risposta.
- Se i tipi di oRPC 1.15.5 non accettano `mapErrors` così com'è in `clientInterceptors`
  o in `interceptors`, adegua solo la firma (le opzioni reali hanno `context`, `path`,
  `next`), non il comportamento.

- [ ] **Passo 5: verifica che passino**

Run: `npm test -w server -- errors && npm run typecheck -w server`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add server package-lock.json
git commit -m "Server: errori normalizzati sui codici del contratto, log senza segreti e messaggi localizzati"
```

---

### Task 5: Transazione con scelta del ruolo e database di prova

**File:**
- Crea: `server/src/db.ts`, `server/test/support/db.ts`, `server/test/support/schema.sql`,
  `server/test/db.test.ts`
- Modifica: `server/package.json` (dipendenza `postgres`)

**Interfacce:**
- Consuma: `Claims` (task 3).
- Produce:
  - `type Tx = postgres.TransactionSql`
  - `type DbIdentity = { kind: 'user'; claims: Claims } | { kind: 'anon' } | { kind: 'job' }`
  - `withDbOn<T>(sql: postgres.Sql, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T>`
  - `withDb<T>(connectionString: string, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T>`
  - test: `hasDatabase: boolean`, `setupDatabase(): Promise<TestDatabase>` con
    `admin: postgres.Sql`, `appServerUrl: string`,
    `createUser(options?: { locale?: Locale }): Promise<{ userId: string; sessionId: string }>`,
    `endSession(sessionId: string): Promise<void>`, `deleteUser(userId: string): Promise<void>`,
    `createFamily(members: { userId: string; role: 'family_admin' | 'member' }[]): Promise<string>`,
    `addMember(familyId: string, userId: string, role: 'family_admin' | 'member'): Promise<void>`,
    `grantGlobalRole(userId: string, role: 'recipe_curator' | 'app_admin'): Promise<void>`,
    `bumpFamily(familyId: string): Promise<void>`, `close(): Promise<void>`

**Database dei test.** `TEST_DATABASE_URL` è la connessione da superutente al Postgres
locale di Supabase avviato con la CLI su Podman (scelta di W2): dalla radice del
repository, con `supabase/` di W2 presente, `supabase db start` (serve `/opt/podman/bin`
nel `PATH` e la VM `podman machine start`), poi
`TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` (porta e
credenziali: verificale con `supabase status`).

- **Schema reale presente** (`app.profiles` esiste): i test lo usano così com'è.
- **Prima del merge di W2**: `supabase/` non è su questo branch. Avvia il database da
  una cartella di appoggio nello scratchpad (`supabase init` lì, poi `supabase db
  start`, senza migrazioni) e lancia i test con `TEST_DB_FIXTURE=1`: la fixture
  provvisoria crea gli oggetti di W2 con gli stessi nomi. Se l'avvio non riesce, scrivi
  `STATO: DOMANDA`; i test senza database non ne dipendono.
- **Schema assente senza `TEST_DB_FIXTURE=1`**: i test falliscono con un messaggio che
  spiega come avviare il database. **In CI** (`CI` impostata) la fixture è rifiutata e
  l'assenza di `TEST_DATABASE_URL` fa fallire i test: nessuna suite saltata.

- [ ] **Passo 1: dipendenza**

Run: `npm install -w server postgres@3.4.9`

- [ ] **Passo 2: fixture provvisoria con i nomi di W2**

`server/test/support/schema.sql` (stessi nomi e firme della spec di W2, sezioni
«Identità», «Famiglie», «Permessi», «Contatori»; solo quanto usa il server; si toglie
nel task 11):

```sql
-- Stand-in for the W2 objects the server relies on, same names as the W2 spec.
-- Applied only with TEST_DB_FIXTURE=1 when the real schema is missing; never in CI.
do $$ begin
	if not exists (select 1 from pg_roles where rolname = 'app_job') then create role app_job nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'app_server') then create role app_server login noinherit; end if;
end $$;
grant authenticated, anon, app_job to app_server;

create schema app;
grant usage on schema app to authenticated, anon, app_job;

create table app.profiles (
	user_id uuid primary key references auth.users (id) on delete cascade,
	display_name text not null check (display_name <> ''),
	locale text not null default 'it-IT' check (locale in ('it-IT', 'en-GB'))
);
create function app.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
	insert into app.profiles (user_id, display_name, locale) values (
		new.id,
		coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
		case when new.raw_user_meta_data ->> 'locale' in ('it-IT', 'en-GB') then new.raw_user_meta_data ->> 'locale' else 'it-IT' end
	);
	return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function app.create_profile();

create table app.user_roles (
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('recipe_curator', 'app_admin')),
	primary key (user_id, role)
);
create table app.families (
	id uuid primary key default gen_random_uuid(),
	name text not null check (name <> ''),
	measurement_system text not null default 'metric' check (measurement_system in ('metric', 'uk_imperial')),
	data_version bigint not null default 0
);
create table app.family_members (
	family_id uuid not null references app.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('family_admin', 'member')),
	primary key (family_id, user_id)
);
create table app.catalogue_state (
	id boolean primary key default true check (id),
	version bigint not null default 0
);
insert into app.catalogue_state default values;

create function app.session_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from auth.sessions s
		where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
			and s.user_id = auth.uid()
			and (s.not_after is null or s.not_after > now())
	);
$$;
create function app.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.family_members m where m.family_id = target and m.user_id = auth.uid());
$$;
create function app.is_family_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from app.family_members m
		where m.family_id = target and m.user_id = auth.uid() and m.role = 'family_admin'
	);
$$;
create function app.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.user_roles r where r.user_id = auth.uid() and r.role = wanted);
$$;
revoke all on function app.session_is_active(), app.is_member(uuid), app.is_family_admin(uuid), app.has_role(text), app.create_profile() from public;
grant execute on function app.session_is_active(), app.is_member(uuid), app.is_family_admin(uuid), app.has_role(text) to authenticated;

alter table app.profiles enable row level security;
alter table app.user_roles enable row level security;
alter table app.families enable row level security;
alter table app.family_members enable row level security;
alter table app.catalogue_state enable row level security;
create policy profiles_own on app.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy user_roles_own on app.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy families_member on app.families for select to authenticated using ((select app.is_member(id)));
create policy family_members_member on app.family_members for select to authenticated using ((select app.is_member(family_id)));
create policy catalogue_state_all on app.catalogue_state for select to authenticated using (true);
grant select on app.profiles, app.user_roles, app.families, app.family_members, app.catalogue_state to authenticated;
```

- [ ] **Passo 3: supporto dei test con il database**

`server/test/support/db.ts`:

```ts
import { readFile } from 'node:fs/promises';
import type { Locale } from '@app/contract';
import postgres from 'postgres';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const inCi = Boolean(env.CI);
const databaseUrl = env.TEST_DATABASE_URL;

// In CI an integration suite must never be skipped: no database is a failure.
if (inCi && !databaseUrl) throw new Error('TEST_DATABASE_URL is required in CI (see .github/workflows/ci.yml)');
export const hasDatabase = Boolean(databaseUrl);

const APP_SERVER_PASSWORD = 'app_server_test';

export interface TestDatabase {
	admin: postgres.Sql;
	/** Connection as the server's technical user, like Hyperdrive in production. */
	appServerUrl: string;
	createUser(options?: { locale?: Locale }): Promise<{ userId: string; sessionId: string }>;
	endSession(sessionId: string): Promise<void>;
	deleteUser(userId: string): Promise<void>;
	createFamily(members: { userId: string; role: 'family_admin' | 'member' }[]): Promise<string>;
	addMember(familyId: string, userId: string, role: 'family_admin' | 'member'): Promise<void>;
	grantGlobalRole(userId: string, role: 'recipe_curator' | 'app_admin'): Promise<void>;
	bumpFamily(familyId: string): Promise<void>;
	close(): Promise<void>;
}

async function ensureSchema(admin: postgres.Sql): Promise<void> {
	const [{ present }] = await admin<{ present: boolean }[]>`select to_regclass('app.profiles') is not null as present`;
	if (present) return;
	if (inCi || env.TEST_DB_FIXTURE !== '1') {
		throw new Error(
			'Schema app is missing: start the local database with the migrations of supabase/ ' +
				'(supabase db start), or set TEST_DB_FIXTURE=1 to use the provisional fixture before the schema is merged.',
		);
	}
	await admin.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}

export async function setupDatabase(): Promise<TestDatabase> {
	if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set');
	const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	await ensureSchema(admin);
	await admin.unsafe(`alter role app_server password '${APP_SERVER_PASSWORD}'`);
	const url = new URL(databaseUrl);
	url.username = 'app_server';
	url.password = APP_SERVER_PASSWORD;

	const addMember = async (familyId: string, userId: string, role: 'family_admin' | 'member') => {
		await admin`insert into app.family_members (family_id, user_id, role) values (${familyId}, ${userId}, ${role})`;
	};

	return {
		admin,
		appServerUrl: url.toString(),
		async createUser(options = {}) {
			const userId = crypto.randomUUID();
			const sessionId = crypto.randomUUID();
			const metadata = { display_name: `Test ${userId.slice(0, 8)}`, locale: options.locale ?? 'it-IT' };
			// The W2 trigger on auth.users creates the profile from the metadata.
			await admin`
				insert into auth.users (id, email, aud, role, raw_user_meta_data)
				values (${userId}, ${`${userId}@test.local`}, 'authenticated', 'authenticated', ${admin.json(metadata)})`;
			await admin`insert into auth.sessions (id, user_id) values (${sessionId}, ${userId})`;
			return { userId, sessionId };
		},
		async endSession(sessionId) {
			await admin`delete from auth.sessions where id = ${sessionId}`;
		},
		async deleteUser(userId) {
			await admin`delete from auth.users where id = ${userId}`;
		},
		async createFamily(members) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.families (name, measurement_system) values ('Test', 'metric') returning id`;
			for (const member of members) await addMember(id, member.userId, member.role);
			return id;
		},
		addMember,
		async grantGlobalRole(userId, role) {
			await admin`insert into app.user_roles (user_id, role) values (${userId}, ${role})`;
		},
		async bumpFamily(familyId) {
			await admin`update app.families set data_version = data_version + 1 where id = ${familyId}`;
		},
		async close() {
			await admin.end();
		},
	};
}
```

Con lo schema reale di W2 gli inserimenti possono richiedere colonne in più (per
esempio `app.user_roles.granted_by`, `app.families.time_zone`) o rifiutare l'aggiornamento
diretto di `data_version`: adegua qui `createFamily`, `grantGlobalRole` e `bumpFamily`
(per esempio facendo crescere il contatore con una scrittura vera su
`app.families.name`), mai il codice del server.

- [ ] **Passo 4: test (falliscono)**

`server/test/db.test.ts`:

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb, withDbOn } from '../src/db.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('withDb', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	const userClaims = (userId: string, sessionId: string) => ({
		sub: userId,
		role: 'authenticated' as const,
		session_id: sessionId,
		exp: Math.floor(Date.now() / 1000) + 3600,
	});

	it('acts as the user with the claims', async () => {
		const { userId, sessionId } = await db.createUser();
		const [row] = await withDb(db.appServerUrl, { kind: 'user', claims: userClaims(userId, sessionId) }, (tx) =>
			tx<{ role: string; uid: string }[]>`select current_user as role, auth.uid()::text as uid`,
		);
		expect(row).toEqual({ role: 'authenticated', uid: userId });
	});

	it('acts as anon and as the job role', async () => {
		const anon = await withDb(db.appServerUrl, { kind: 'anon' }, (tx) => tx<{ role: string }[]>`select current_user as role`);
		const job = await withDb(db.appServerUrl, { kind: 'job' }, (tx) => tx<{ role: string }[]>`select current_user as role`);
		expect(anon[0].role).toBe('anon');
		expect(job[0].role).toBe('app_job');
	});

	async function stateAfter(sql: postgres.Sql) {
		const [row] = await sql<{ role: string; claims: string | null }[]>`
			select current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims`;
		return row;
	}

	it('leaves nothing behind on a reused connection after a commit', async () => {
		const { userId, sessionId } = await db.createUser();
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await withDbOn(sql, { kind: 'user', claims: userClaims(userId, sessionId) }, async () => {});
			expect(await stateAfter(sql)).toEqual({ role: 'app_server', claims: null });
		} finally {
			await sql.end();
		}
	});

	it('leaves nothing behind on a reused connection after a rollback', async () => {
		const { userId, sessionId } = await db.createUser();
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await expect(
				withDbOn(sql, { kind: 'user', claims: userClaims(userId, sessionId) }, async (tx) => {
					await tx`select 1`;
					throw new Error('boom');
				}),
			).rejects.toThrow('boom');
			expect(await stateAfter(sql)).toEqual({ role: 'app_server', claims: null });
		} finally {
			await sql.end();
		}
	});

	it('sees no table as app_server without a chosen role', async () => {
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await expect(sql`select * from app.profiles`).rejects.toThrow(/permission denied/);
		} finally {
			await sql.end();
		}
	});
});
```

- [ ] **Passo 5: verifica che falliscano**

Run: `TEST_DATABASE_URL=<url> TEST_DB_FIXTURE=1 npm test -w server -- db` (senza
`TEST_DB_FIXTURE` se lo schema di W2 è già nel database)
Expected: FAIL, `../src/db.ts` inesistente.

- [ ] **Passo 6: implementazione**

`server/src/db.ts`:

```ts
import postgres from 'postgres';
import type { Claims } from './auth.ts';

export type Tx = postgres.TransactionSql;

/** Who a transaction acts as. The technical user `app_server` sees nothing by itself. */
export type DbIdentity = { kind: 'user'; claims: Claims } | { kind: 'anon' } | { kind: 'job' };

/**
 * Runs `fn` in a transaction under the chosen role. `set local` and the `true` flag of
 * `set_config` keep role and claims inside this transaction, so they never leak to the
 * next request that reuses the same pooled connection, after a commit or a rollback.
 */
export async function withDbOn<T>(sql: postgres.Sql, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return (await sql.begin(async (tx) => {
		switch (identity.kind) {
			case 'user':
				await tx`select set_config('request.jwt.claims', ${JSON.stringify(identity.claims)}, true)`;
				await tx`set local role authenticated`;
				break;
			case 'anon':
				await tx`set local role anon`;
				break;
			case 'job':
				await tx`set local role app_job`;
				break;
		}
		return fn(tx);
	})) as T;
}

/** One client per request: Hyperdrive owns the real pool. */
export async function withDb<T>(connectionString: string, identity: DbIdentity, fn: (tx: Tx) => Promise<T>): Promise<T> {
	const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await withDbOn(sql, identity, fn);
	} finally {
		await sql.end();
	}
}
```

- [ ] **Passo 7: verifica che passino**

Run: `TEST_DATABASE_URL=<url> TEST_DB_FIXTURE=1 npm test -w server -- db && npm test -w server && npm run typecheck -w server`
Expected: PASS con database; senza `TEST_DATABASE_URL` la suite risulta `skipped` e
il resto passa.

- [ ] **Passo 8: commit**

```bash
git add server package-lock.json
git commit -m "Server: transazione nel ruolo scelto (utente, anon, job) e database di prova con i nomi di W2"
```

---

### Task 6: Percorso della richiesta (implementatore comune)

**File:**
- Crea: `server/src/session.ts`, `server/src/permissions.ts`, `server/src/versions.ts`,
  `server/src/pipeline.ts`, `server/src/router.ts`, `server/test/support/test-contract.ts`,
  `server/test/support/context.ts`, `server/test/pipeline.test.ts`

**Interfacce:**
- Consuma: `Claims`, `channelOf` (task 3); `appError`, `mapErrors` (task 4); `withDb`,
  `Tx` (task 5); `OperationMeta`, `Locale`, `checkContract` (task 2).
- Produce:
  - `interface RequestState { locale?: Locale }`
  - `interface RequestContext { env: Env; requestId: string; origin: string; token: string | undefined; verify(token: string): Promise<Claims>; deployId: string; state: RequestState }`
  - `interface OperationContext extends RequestContext { userId: string; channel: Channel; clientId: string | null; locale: Locale; tx: Tx; version?: string }`
  - `createImplementer<C extends AnyContractRouter>(contract: C)`
  - `fresh<T>(context: OperationContext, data: T): { unchanged: false; version: string; data: T }`
  - `webOnlyUrl(origin: string, path: string, input: unknown): string`
  - `loadSession(tx: Tx): Promise<Locale>` (`session.ts`), `checkRole(tx, role, input): Promise<void>`
    (`permissions.ts`), `readVersion(tx, scopes, input, locale, deployId): Promise<string>` (`versions.ts`)
  - `router` (implementazione di `contract`) in `router.ts`
  - test: `testContract`, `testRouter`, `testHandlerCalls`; `contextFor(keys, token, connectionString?)` in `support/context.ts`

- [ ] **Passo 1: contratto e router di prova**

`server/test/support/test-contract.ts`:

```ts
import { op, versionedInput, versionedOutput } from '@app/contract';
import { z } from 'zod';
import { createImplementer, fresh } from '../../src/pipeline.ts';

const empty = z.object({});
const family = z.object({ familyId: z.uuid() });
const ok = z.object({ ok: z.literal(true) });

/** Operations that exercise the request path; never part of the published contract. */
export const testContract = {
	test: {
		member: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
			.route({ method: 'POST', path: '/test/member', summary: 'Member only' }).input(family).output(ok),
		admin: op({ mcp: { readOnly: true }, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/admin', summary: 'Family admin only' }).input(family).output(ok),
		curator: op({ mcp: { readOnly: true }, offline: false, role: 'curator' })
			.route({ method: 'POST', path: '/test/curator', summary: 'Curator only' }).input(empty).output(ok),
		appAdmin: op({ mcp: { readOnly: true }, offline: false, role: 'appAdmin' })
			.route({ method: 'POST', path: '/test/app-admin', summary: 'App admin only' }).input(empty).output(ok),
		removeFamily: op({ mcp: { readOnly: false }, webOnly: { path: '/family/:familyId/delete' }, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/remove-family', summary: 'Web only' }).input(family).output(ok),
		familyView: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
			.route({ method: 'POST', path: '/test/family-view', summary: 'Versioned read' })
			.input(versionedInput(family))
			.output(versionedOutput(z.object({ calls: z.number() }))),
	},
};

export const testHandlerCalls = { familyView: 0 };

const os = createImplementer(testContract);
const done = () => ({ ok: true as const });

export const testRouter = os.router({
	test: {
		member: os.test.member.handler(done),
		admin: os.test.admin.handler(done),
		curator: os.test.curator.handler(done),
		appAdmin: os.test.appAdmin.handler(done),
		removeFamily: os.test.removeFamily.handler(done),
		familyView: os.test.familyView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView })),
	},
});
```

`server/test/support/context.ts`:

```ts
import { verifyAccessToken } from '../../src/auth.ts';
import type { Env } from '../../src/env.ts';
import type { RequestContext } from '../../src/pipeline.ts';
import { TEST_ISSUER, TEST_SUPABASE_URL, type TestKeys } from './keys.ts';

/** A connection string nobody listens on: any database access fails fast. */
export const UNREACHABLE_DB = 'postgres://nobody:secret@127.0.0.1:1/none';

export function contextFor(keys: TestKeys, token: string | undefined, connectionString = UNREACHABLE_DB): RequestContext {
	const env = {
		HYPERDRIVE: { connectionString } as Hyperdrive,
		SUPABASE_URL: TEST_SUPABASE_URL,
		CF_VERSION_METADATA: { id: 'deploy-1', tag: '', timestamp: '' },
		ASSETS: {} as Fetcher,
	} satisfies Env;
	return {
		env,
		requestId: crypto.randomUUID(),
		origin: 'https://app.test',
		token,
		verify: (t) => verifyAccessToken(t, { issuer: TEST_ISSUER, keys: keys.keys }),
		deployId: 'deploy-1',
		state: {},
	};
}
```

- [ ] **Passo 2: test (falliscono)**

`server/test/pipeline.test.ts`:

```ts
import { checkContract } from '@app/contract';
import { call, ORPCError } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mapErrors } from '../src/errors.ts';
import type { RequestContext } from '../src/pipeline.ts';
import { router } from '../src/router.ts';
import { contextFor } from './support/context.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { testContract, testHandlerCalls, testRouter } from './support/test-contract.ts';

let keys: TestKeys;
beforeAll(async () => {
	keys = await createTestKeys();
});

const options = (context: RequestContext) => ({ context, interceptors: [mapErrors] });

async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

const familyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

describe('conventions', () => {
	it('the test contract follows them too', () => {
		expect(checkContract(testContract)).toEqual([]);
	});
});

describe('request path without database', () => {
	// Every case below would fail with `internal` if it reached the (unreachable) database.
	it('rejects a missing or malformed token with unauthorized', async () => {
		for (const token of [undefined, 'not-a-jwt']) {
			const error = await errorOf(call(router.session.whoami, {}, options(contextFor(keys, token))));
			expect(error.code).toBe('unauthorized');
			expect(error.status).toBe(401);
		}
	});

	it('rejects tokens with invalid claims before the database', async () => {
		const tokens = [
			await keys.sign({ sub: userId }, { noExpiry: true }),
			await keys.sign({ sub: userId, session_id: 'not-a-uuid' }),
			await keys.sign({ sub: userId, session_id: undefined }),
			await keys.sign({ sub: userId, client_id: '' }),
			await keys.sign({ sub: userId, client_id: false }),
		];
		for (const token of tokens) {
			expect((await errorOf(call(router.session.whoami, {}, options(contextFor(keys, token))))).code).toBe('unauthorized');
		}
	});

	it('validates the input before anything else', async () => {
		const token = await keys.sign({ sub: userId });
		const error = await errorOf(call(testRouter.test.member, { familyId: 'nope' }, options(contextFor(keys, token))));
		expect(error.code).toBe('invalid');
		expect(error.data).toMatchObject({ issues: [{ path: ['familyId'] }] });
	});

	it('turns an unreachable database into internal without leaking the connection string', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const token = await keys.sign({ sub: userId });
		const context = contextFor(keys, token);
		const error = await errorOf(call(router.session.whoami, {}, options(context)));
		expect(error.code).toBe('internal');
		expect(error.data).toEqual({ requestId: context.requestId });
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
		expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
		log.mockRestore();
	});
});

describe.skipIf(!hasDatabase)('request path with database', () => {
	let db: TestDatabase;
	const asUser = async (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		contextFor(keys, await keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra }), db.appServerUrl);

	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('answers whoami with the profile language', async () => {
		const user = await db.createUser({ locale: 'en-GB' });
		const result = await call(router.session.whoami, {}, options(await asUser(user)));
		expect(result).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
	});

	it('rejects an ended session or a deleted account', async () => {
		const ended = await db.createUser();
		await db.endSession(ended.sessionId);
		expect((await errorOf(call(router.session.whoami, {}, options(await asUser(ended))))).code).toBe('unauthorized');
		const deleted = await db.createUser();
		const context = await asUser(deleted);
		await db.deleteUser(deleted.userId);
		expect((await errorOf(call(router.session.whoami, {}, options(context)))).code).toBe('unauthorized');
	});

	it('checks the session before answering web_only', async () => {
		const admin = await db.createUser({ locale: 'en-GB' });
		const id = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const agent = await asUser(admin, { client_id: 'codex' });
		const error = await errorOf(call(testRouter.test.removeFamily, { familyId: id }, options(agent)));
		expect(error.code).toBe('web_only');
		expect(error.data).toEqual({ url: `https://app.test/family/${id}/delete` });
		expect(agent.state.locale).toBe('en-GB');

		const revoked = await db.createUser();
		const revokedAgent = await asUser(revoked, { client_id: 'codex' });
		await db.endSession(revoked.sessionId);
		expect((await errorOf(call(testRouter.test.removeFamily, { familyId: id }, options(revokedAgent)))).code).toBe('unauthorized');
	});

	it('checks family membership and family administration', async () => {
		const admin = await db.createUser();
		const member = await db.createUser();
		const stranger = await db.createUser();
		const id = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }, { userId: member.userId, role: 'member' }]);
		await expect(call(testRouter.test.member, { familyId: id }, options(await asUser(member)))).resolves.toEqual({ ok: true });
		await expect(call(testRouter.test.admin, { familyId: id }, options(await asUser(admin)))).resolves.toEqual({ ok: true });
		expect((await errorOf(call(testRouter.test.admin, { familyId: id }, options(await asUser(member))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId: id }, options(await asUser(stranger))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId }, options(await asUser(member))))).code).toBe('forbidden');
	});

	it('checks global roles', async () => {
		const curator = await db.createUser();
		const appAdmin = await db.createUser();
		await db.grantGlobalRole(curator.userId, 'recipe_curator');
		await db.grantGlobalRole(appAdmin.userId, 'app_admin');
		await expect(call(testRouter.test.curator, {}, options(await asUser(curator)))).resolves.toEqual({ ok: true });
		await expect(call(testRouter.test.appAdmin, {}, options(await asUser(appAdmin)))).resolves.toEqual({ ok: true });
		expect((await errorOf(call(testRouter.test.appAdmin, {}, options(await asUser(curator))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.curator, {}, options(await asUser(appAdmin))))).code).toBe('forbidden');
	});

	it('answers unchanged without running the handler, and fresh data after a change', async () => {
		const user = await db.createUser();
		const id = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const first = await call(testRouter.test.familyView, { familyId: id }, options(await asUser(user)));
		expect(first.unchanged).toBe(false);
		const calls = testHandlerCalls.familyView;
		const second = await call(testRouter.test.familyView, { familyId: id, knownVersion: first.version }, options(await asUser(user)));
		expect(second).toEqual({ unchanged: true, version: first.version });
		expect(testHandlerCalls.familyView).toBe(calls);
		await db.bumpFamily(id);
		const third = await call(testRouter.test.familyView, { familyId: id, knownVersion: first.version }, options(await asUser(user)));
		expect(third.unchanged).toBe(false);
		expect(third.version).not.toBe(first.version);
	});

	it('never reuses a version across families or languages', async () => {
		const user = await db.createUser();
		const a = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const b = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const viewA = await call(testRouter.test.familyView, { familyId: a }, options(await asUser(user)));
		const viewB = await call(testRouter.test.familyView, { familyId: b, knownVersion: viewA.version }, options(await asUser(user)));
		expect(viewB.unchanged).toBe(false);
		const english = await db.createUser({ locale: 'en-GB' });
		await db.addMember(a, english.userId, 'member');
		const viewEnglish = await call(testRouter.test.familyView, { familyId: a, knownVersion: viewA.version }, options(await asUser(english)));
		expect(viewEnglish.unchanged).toBe(false);
	});
});
```

Nota: aggiungere un membro alla famiglia `a` fa crescere il suo contatore con i trigger
di W2; l'ultimo controllo resta valido perché anche la lingua è diversa.

- [ ] **Passo 3: verifica che falliscano**

Run: `npm test -w server -- pipeline`
Expected: FAIL, `../src/pipeline.ts` e `../src/router.ts` inesistenti.

- [ ] **Passo 4: implementazione**

`server/src/session.ts`:

```ts
import { localeSchema, type Locale } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

/**
 * Profile language and session check in one query. No profile (account deleted: the
 * profile goes with the user) or an ended session (logout, expiry, agent disconnected)
 * refuse the still-valid token.
 */
export async function loadSession(tx: Tx): Promise<Locale> {
	const rows = await tx<{ locale: string; active: boolean }[]>`
		select p.locale, app.session_is_active() as active
		from app.profiles p where p.user_id = auth.uid()`;
	const row = rows[0];
	if (!row || !row.active) throw appError('unauthorized');
	return localeSchema.parse(row.locale);
}
```

`server/src/permissions.ts`:

```ts
import type { Role } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

const familyIdOf = (input: unknown) => (input as { familyId: string }).familyId;

/**
 * Clear errors before the handler, through the W2 helper functions (security definer,
 * based on auth.uid()); row level security stays the real guarantee. A family that does
 * not exist and one the user is not in look the same: forbidden.
 */
export async function checkRole(tx: Tx, role: Role, input: unknown): Promise<void> {
	if (role === 'user') return;
	let rows: { ok: boolean }[];
	switch (role) {
		case 'familyMember':
			rows = await tx`select app.is_member(${familyIdOf(input)}::uuid) as ok`;
			break;
		case 'familyAdmin':
			rows = await tx`select app.is_family_admin(${familyIdOf(input)}::uuid) as ok`;
			break;
		case 'curator':
			rows = await tx`select app.has_role('recipe_curator') as ok`;
			break;
		case 'appAdmin':
			rows = await tx`select app.has_role('app_admin') as ok`;
			break;
	}
	if (!rows[0]?.ok) throw appError('forbidden');
}
```

`server/src/versions.ts`:

```ts
import type { Locale, VersionScope } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

/**
 * Version of a read: the counters it depends on, the language and the deployed Worker.
 * The family id is part of it because every family counter starts from zero. Counters
 * are read before the view in the same transaction, so a version is never newer than
 * the data sent with it.
 */
export async function readVersion(tx: Tx, scopes: VersionScope[], input: unknown, locale: Locale, deployId: string): Promise<string> {
	const parts: string[] = [];
	if (scopes.includes('family')) {
		const familyId = (input as { familyId: string }).familyId;
		const rows = await tx<{ version: string }[]>`select data_version::text as version from app.families where id = ${familyId}`;
		if (!rows[0]) throw appError('forbidden');
		parts.push(`f${familyId}:${rows[0].version}`);
	}
	if (scopes.includes('catalogue')) {
		const rows = await tx<{ version: string }[]>`select version::text as version from app.catalogue_state`;
		parts.push(`c${rows[0]?.version ?? '0'}`);
	}
	parts.push(locale, deployId);
	return parts.join('.');
}
```

`server/src/pipeline.ts`:

```ts
import type { Locale, OperationMeta } from '@app/contract';
import { implement, type AnyContractRouter } from '@orpc/server';
import { channelOf, type Channel, type Claims } from './auth.ts';
import { withDb, type Tx } from './db.ts';
import type { Env } from './env.ts';
import { appError } from './errors.ts';
import { checkRole } from './permissions.ts';
import { loadSession } from './session.ts';
import { readVersion } from './versions.ts';

/** Filled while the request runs, read by MCP to localise errors. */
export interface RequestState {
	locale?: Locale;
}

export interface RequestContext {
	env: Env;
	/** Correlates log lines and `internal` errors of this request. */
	requestId: string;
	/** Origin of the request, for absolute `web_only` URLs. */
	origin: string;
	token: string | undefined;
	verify(token: string): Promise<Claims>;
	deployId: string;
	state: RequestState;
}

export interface OperationContext extends RequestContext {
	userId: string;
	channel: Channel;
	clientId: string | null;
	locale: Locale;
	tx: Tx;
	/** Set for versioned reads: handlers return `fresh(context, view)`. */
	version?: string;
}

export function webOnlyUrl(origin: string, path: string, input: unknown): string {
	const values = (input ?? {}) as Record<string, unknown>;
	const filled = path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(String(values[name] ?? '')));
	return new URL(filled, origin).toString();
}

export function fresh<T>(context: OperationContext, data: T): { unchanged: false; version: string; data: T } {
	if (!context.version) throw new Error('fresh() used outside a versioned read');
	return { unchanged: false, version: context.version, data };
}

async function authenticate(context: RequestContext): Promise<Claims> {
	if (!context.token) throw appError('unauthorized');
	try {
		return await context.verify(context.token);
	} catch {
		throw appError('unauthorized');
	}
}

/**
 * Implementer shared by every operation. Input is validated first (validation index
 * before all middleware), then: token and claims, transaction as the user, profile and
 * session, web-only check, role, version; the handler runs inside the transaction.
 */
export function createImplementer<C extends AnyContractRouter>(contract: C) {
	return implement(contract)
		.$config({ initialInputValidationIndex: Number.NEGATIVE_INFINITY })
		.$context<RequestContext>()
		.use(async ({ context, procedure, next }, input) => {
			const meta = procedure['~orpc'].meta as OperationMeta;
			const claims = await authenticate(context);
			const channel = channelOf(claims);
			return withDb(context.env.HYPERDRIVE.connectionString, { kind: 'user', claims }, async (tx) => {
				const locale = await loadSession(tx);
				context.state.locale = locale;
				if (meta.webOnly && channel === 'mcp') {
					throw appError('web_only', { url: webOnlyUrl(context.origin, meta.webOnly.path, input) });
				}
				await checkRole(tx, meta.role, input);
				const operation: OperationContext = {
					...context,
					userId: claims.sub,
					channel,
					clientId: claims.client_id ?? null,
					locale,
					tx,
				};
				if (meta.reads) {
					operation.version = await readVersion(tx, meta.reads, input, locale, context.deployId);
					if ((input as { knownVersion?: string }).knownVersion === operation.version) {
						return { output: { unchanged: true, version: operation.version }, context: {} };
					}
				}
				return next({ context: operation });
			});
		});
}
```

`server/src/router.ts`:

```ts
import { contract } from '@app/contract';
import { createImplementer } from './pipeline.ts';

const os = createImplementer(contract);

export const router = os.router({
	session: {
		whoami: os.session.whoami.handler(({ context }) => ({
			userId: context.userId,
			channel: context.channel,
			clientId: context.clientId,
			locale: context.locale,
		})),
	},
});
```

**Possibili aggiustamenti di tipo** (verificare con `npm run typecheck -w server`):

- se oRPC non accetta il ritorno `{ output, context }` per il caso `unchanged` con il
  tipo generico del middleware, usa `return { output: … as never, context: {} }`: il tipo
  dell'output è verificato dalla validazione dell'output rispetto a `versionedOutput`;
- se nell'handler `context` non risulta `OperationContext`, aggiungi il tipo esplicito
  `next<OperationContext>`, oppure dichiara il middleware con
  `os.middleware<OperationContext, …>` secondo i tipi di oRPC 1.15.5
  (`node_modules/@orpc/server/dist/shared/*.d.mts`, `MiddlewareOptions`).
- il tipo delle righe in `checkRole` può richiedere `tx<{ ok: boolean }[]>`.
  Non cambiare il comportamento per far tornare i tipi.

- [ ] **Passo 5: verifica che passino**

Run: `npm test -w server -- pipeline` (senza database: passano la parte senza database e
la prova delle convenzioni) e poi
`TEST_DATABASE_URL=<url> TEST_DB_FIXTURE=1 npm test -w server -- pipeline`
Expected: PASS in entrambi i casi.

- [ ] **Passo 6: typecheck e commit**

Run: `npm run typecheck -w server`

```bash
git add server
git commit -m "Server: percorso della richiesta con token, sessione, web_only, ruoli e versioni"
```

---

### Task 7: Worker: rotte, OpenAPI, RPC, REST, MCP e asset

**File:**
- Crea: `server/src/mcp.ts`, `server/src/well-known.ts`, `server/src/app.ts`,
  `server/test/support/requests.ts`, `server/test/app.test.ts`
- Modifica: `server/src/index.ts`; elimina `server/src/index.test.ts`; `server/package.json`
  (dipendenza `@modelcontextprotocol/server`)

**Interfacce:**
- Consuma: `router`, `RequestContext` (task 6); `loadSession` (task 6); `withDb`
  (task 5); `remoteKeySource`, `verifyAccessToken`, `bearerToken`, `KeySource`, `Claims`
  (task 3); `mapErrors`, `toolErrorBody` (task 4).
- Produce:
  - `collectTools(contract: AnyContractRouter): ToolSpec[]` (con lo schema JSON
    dell'input), `buildMcpServer(router, tools, context): McpServer`
  - `createApp(options: { contract: AnyContractRouter; router: AnyRouter; keys?: (env: Env) => KeySource; resourceName: string }): { fetch(request: Request, env: Env): Promise<Response> }`
  - test: `testEnv(connectionString?)`, `rpcClient<T>(app, env, token?)`,
    `rest(app, env, method, path, token?, body?)`, `mcp(app, env, token, method, params?)`

- [ ] **Passo 1: dipendenza**

Run: `npm install -w server @modelcontextprotocol/server@2.3.1`

- [ ] **Passo 2: aiuti per le richieste di prova**

`server/test/support/requests.ts`:

```ts
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { Env } from '../../src/env.ts';
import { UNREACHABLE_DB } from './context.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

export interface TestApp {
	fetch(request: Request, env: Env): Promise<Response>;
}

export function testEnv(connectionString = UNREACHABLE_DB): Env {
	return {
		HYPERDRIVE: { connectionString } as Hyperdrive,
		SUPABASE_URL: TEST_SUPABASE_URL,
		CF_VERSION_METADATA: { id: 'deploy-1', tag: '', timestamp: '' },
		ASSETS: { fetch: async () => new Response('<!doctype html><title>SPA</title>', { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher,
	};
}

/** RPC client like the web app's, wired straight to the Worker's fetch. */
export function rpcClient<T>(app: TestApp, env: Env, token?: string): T {
	const link = new RPCLink({
		url: 'https://app.test/api/rpc',
		headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
		fetch: (request, init) => app.fetch(new Request(request, init), env),
	});
	return createORPCClient(link) as T;
}

export async function rest(app: TestApp, env: Env, method: string, path: string, token?: string, body?: unknown): Promise<Response> {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	return app.fetch(new Request(`https://app.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}

/** One JSON-RPC call to the stateless MCP endpoint; reads JSON or a single SSE event. */
export async function mcp(app: TestApp, env: Env, token: string | undefined, method: string, params: unknown = {}): Promise<{ status: number; headers: Headers; body: any }> {
	const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
	if (token) headers.authorization = `Bearer ${token}`;
	const response = await app.fetch(
		new Request('https://app.test/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }),
		env,
	);
	const text = await response.text();
	const data = response.headers.get('content-type')?.includes('text/event-stream')
		? text.split('\n').find((line) => line.startsWith('data:'))?.slice('data:'.length)
		: text;
	return { status: response.status, headers: response.headers, body: data ? JSON.parse(data) : undefined };
}

/** Body of an MCP tool result (the JSON in its first text block). */
export function toolBody(result: { body: any }): any {
	return JSON.parse(result.body.result.content[0].text);
}
```

Se `RPCLink` di oRPC 1.15.5 passa a `fetch` argomenti diversi da `(request, init)`,
adegua la funzione leggendo il tipo in `node_modules/@orpc/client/dist/adapters/fetch/*.d.mts`.
Con l'SDK 2.3.1 `tools/list` funziona senza `initialize` (provato l'11 ottobre 2026).

- [ ] **Passo 3: test senza database (falliscono)**

`server/test/app.test.ts`:

```ts
import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv } from './support/requests.ts';

const userId = '11111111-1111-4111-8111-111111111111';
let keys: TestKeys;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	keys = await createTestKeys();
	app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'Cosa si mangia (test)' });
});

describe('routes', () => {
	it('serves the OpenAPI document from the contract', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/openapi.json');
		expect(response.status).toBe(200);
		const spec = await response.json();
		expect(spec.openapi).toMatch(/^3\.1/);
		expect(Object.keys(spec.paths)).toContain('/session/whoami');
		expect(spec.servers).toEqual([{ url: 'https://app.test/api' }]);
	});

	it('answers 404 not_found for unknown API paths, never the SPA', async () => {
		for (const path of ['/api/nothing', '/api/rpc/nothing/here']) {
			const response = await rest(app, testEnv(), 'POST', path, undefined, {});
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ code: 'not_found' });
		}
	});

	it('hands every other path to the static assets', async () => {
		const response = await rest(app, testEnv(), 'GET', '/menu/today');
		expect(await response.text()).toContain('SPA');
	});
});

describe('authentication on every channel, without reaching the database', () => {
	it('RPC: unauthorized without token, with a malformed header or with invalid claims', async () => {
		const anonymous = rpcClient<ContractRouterClient<Contract>>(app, testEnv());
		await expect(anonymous.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
		const malformed = await app.fetch(
			new Request('https://app.test/api/rpc/session/whoami', { method: 'POST', headers: { authorization: 'bearer x' } }),
			testEnv(),
		);
		expect(malformed.status).toBe(401);
		const badClient = rpcClient<ContractRouterClient<Contract>>(app, testEnv(), await keys.sign({ sub: userId, client_id: '' }));
		await expect(badClient.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized' });
	});

	it('REST: unauthorized with the error code', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/session/whoami', 'not-a-jwt');
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'unauthorized' });
	});

	it('MCP: 401 with the protected resource metadata link, for any method', async () => {
		for (const [token, method] of [
			[undefined, 'tools/list'],
			['not-a-jwt', 'initialize'],
			[await keys.sign({ sub: userId, client_id: 'codex' }, { noExpiry: true }), 'tools/list'],
		] as const) {
			const result = await mcp(app, testEnv(), token, method);
			expect(result.status).toBe(401);
			expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
		}
	});
});

describe('OAuth metadata', () => {
	it('serves the protected resource metadata for /mcp', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			Response.json({
				issuer: 'https://test.supabase.local/auth/v1',
				authorization_endpoint: 'https://test.supabase.local/auth/v1/oauth/authorize',
				token_endpoint: 'https://test.supabase.local/auth/v1/oauth/token',
				response_types_supported: ['code'],
			})) as typeof fetch;
		try {
			const response = await rest(app, testEnv(), 'GET', '/.well-known/oauth-protected-resource/mcp');
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ resource: 'https://app.test/mcp' });
		} finally {
			globalThis.fetch = original;
		}
	});
});
```

Gli strumenti MCP, la validazione via `/mcp`, la revoca all'ingresso e `web_only` via
MCP richiedono una sessione vera: sono nel task 8, con il database.

- [ ] **Passo 4: verifica che falliscano**

Run: `npm test -w server -- app`
Expected: FAIL, `../src/app.ts` inesistente.

- [ ] **Passo 5: implementazione**

`server/src/mcp.ts`:

```ts
import type { OperationMeta } from '@app/contract';
import { fromJsonSchema, McpServer, type JsonSchemaType, type jsonSchemaValidator } from '@modelcontextprotocol/server';
import { createRouterClient, traverseContractProcedures, type AnyContractRouter, type AnyRouter } from '@orpc/server';
import { z } from 'zod';
import { mapErrors, toolErrorBody } from './errors.ts';
import type { RequestContext } from './pipeline.ts';

export interface ToolSpec {
	name: string;
	path: readonly string[];
	description: string;
	/** JSON Schema of the contract input, shown to agents. */
	inputSchema: JsonSchemaType;
	readOnly: boolean;
}

/**
 * The SDK would validate arguments itself and answer with its own English text. It
 * accepts them as they are here; oRPC validates with the contract's zod schema, so
 * agents get the same `invalid` error as the web, with field paths and a localised text.
 */
const acceptAsIs: jsonSchemaValidator = {
	getValidator<T>() {
		return (input: unknown) => ({ valid: true as const, data: input as T, errorMessage: undefined });
	},
};

/** One tool per operation exposed to MCP; computed once per isolate. */
export function collectTools(contract: AnyContractRouter): ToolSpec[] {
	const tools: ToolSpec[] = [];
	traverseContractProcedures({ router: contract, path: [] }, ({ contract: procedure, path }) => {
		const def = procedure['~orpc'];
		const meta = def.meta as OperationMeta;
		if (!meta.mcp) return;
		tools.push({
			name: path.join('_'),
			path,
			description: def.route.summary ?? path.join('.'),
			inputSchema: z.toJSONSchema(def.inputSchema as z.ZodType, { io: 'input' }) as JsonSchemaType,
			readOnly: meta.mcp.readOnly,
		});
	});
	return tools;
}

/** A fresh MCP server per request; calls go through the router with the web's context. */
export function buildMcpServer(router: AnyRouter, tools: ToolSpec[], context: RequestContext): McpServer {
	const server = new McpServer({ name: 'cosa-si-mangia', version: '0.1.0' });
	const client = createRouterClient(router, { context, interceptors: [mapErrors] });
	for (const tool of tools) {
		const call = tool.path.reduce<any>((node, key) => node[key], client) as (input: unknown) => Promise<unknown>;
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: fromJsonSchema(tool.inputSchema, acceptAsIs),
				annotations: { readOnlyHint: tool.readOnly },
			},
			async (input: unknown) => {
				try {
					const result = await call(input);
					return { content: [{ type: 'text', text: JSON.stringify(result) }] };
				} catch (error) {
					// Same codes as the web app, plus the text in the user's language.
					const body = toolErrorBody(error, context.state.locale ?? 'it-IT', { requestId: context.requestId, path: tool.path });
					return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
				}
			},
		);
	}
	return server;
}
```

`server/src/well-known.ts`:

```ts
// Authorization server metadata of Supabase Auth, mirrored for MCP discovery. Only the
// resolved document is cached: requests must not share in-flight fetches.
let cached: { url: string; metadata: unknown } | undefined;

export async function supabaseAuthMetadata(supabaseUrl: string): Promise<any> {
	if (cached?.url === supabaseUrl) return cached.metadata;
	const response = await fetch(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`);
	if (!response.ok) throw new Error(`OAuth server metadata unavailable: ${response.status}`);
	const metadata = await response.json();
	cached = { url: supabaseUrl, metadata };
	return metadata;
}
```

`server/src/app.ts`:

```ts
import {
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	OAuthError,
	OAuthErrorCode,
	oauthMetadataResponse,
	requireBearerAuth,
	type AuthInfo,
} from '@modelcontextprotocol/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ORPCError, type AnyContractRouter, type AnyRouter } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { bearerToken, remoteKeySource, verifyAccessToken, type Claims, type KeySource } from './auth.ts';
import { withDb } from './db.ts';
import type { Env } from './env.ts';
import { mapErrors } from './errors.ts';
import { buildMcpServer, collectTools } from './mcp.ts';
import type { RequestContext } from './pipeline.ts';
import { loadSession } from './session.ts';
import { supabaseAuthMetadata } from './well-known.ts';

export interface AppOptions {
	contract: AnyContractRouter;
	router: AnyRouter;
	/** Signing keys of Supabase; the default fetches the project JWKS once per isolate. */
	keys?: (env: Env) => KeySource;
	resourceName: string;
}

const notFound = () => Response.json({ code: 'not_found', status: 404, message: 'Not found' }, { status: 404 });

export function createApp(options: AppOptions) {
	const rpcHandler = new RPCHandler(options.router, { clientInterceptors: [mapErrors] });
	const openApiHandler = new OpenAPIHandler(options.router, { clientInterceptors: [mapErrors] });
	const openApiGenerator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
	const tools = collectTools(options.contract);
	const keySources = new Map<string, KeySource>();
	const keysFor = (env: Env): KeySource => {
		if (options.keys) return options.keys(env);
		let source = keySources.get(env.SUPABASE_URL);
		if (!source) keySources.set(env.SUPABASE_URL, (source = remoteKeySource(env.SUPABASE_URL)));
		return source;
	};
	const mcpHandler = createMcpHandler(({ authInfo }) => {
		const { context } = authInfo!.extra as { context: RequestContext };
		return buildMcpServer(options.router, tools, context);
	});

	function contextFor(request: Request, env: Env, token: string | undefined): RequestContext {
		const issuer = `${env.SUPABASE_URL}/auth/v1`;
		return {
			env,
			requestId: crypto.randomUUID(),
			origin: new URL(request.url).origin,
			token,
			verify: (t) => verifyAccessToken(t, { issuer, keys: keysFor(env) }),
			deployId: env.CF_VERSION_METADATA?.id ?? 'dev',
			state: {},
		};
	}

	/**
	 * Every MCP request (initialize and tools/list included) needs a valid token and a
	 * session that still exists: a disconnected agent gets 401 and must authorise again.
	 */
	async function serveMcp(request: Request, env: Env, mcpUrl: URL): Promise<Response> {
		const gate = requireBearerAuth({
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
			verifier: {
				async verifyAccessToken(token): Promise<AuthInfo> {
					const context = contextFor(request, env, token);
					let claims: Claims;
					try {
						claims = await context.verify(token);
					} catch {
						throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid');
					}
					try {
						context.state.locale = await withDb(env.HYPERDRIVE.connectionString, { kind: 'user', claims }, loadSession);
					} catch (error) {
						if (error instanceof ORPCError && error.code === 'unauthorized') {
							throw new OAuthError(OAuthErrorCode.InvalidToken, 'The session has ended');
						}
						throw error;
					}
					return { token, clientId: claims.client_id ?? '', scopes: [], expiresAt: claims.exp, extra: { context } };
				},
			},
		});
		const auth = await gate(request);
		if (auth instanceof Response) return auth;
		return mcpHandler.fetch(request, { authInfo: auth });
	}

	return {
		async fetch(request: Request, env: Env): Promise<Response> {
			const url = new URL(request.url);
			const mcpUrl = new URL('/mcp', url.origin);

			if (url.pathname.startsWith('/.well-known/')) {
				const metadata = oauthMetadataResponse(request, {
					oauthMetadata: await supabaseAuthMetadata(env.SUPABASE_URL),
					resourceServerUrl: mcpUrl,
					resourceName: options.resourceName,
				});
				return metadata ?? new Response('Not found', { status: 404 });
			}
			if (url.pathname === '/mcp') return serveMcp(request, env, mcpUrl);
			if (url.pathname === '/api/openapi.json') {
				const spec = await openApiGenerator.generate(options.contract, {
					info: { title: options.resourceName, version: env.CF_VERSION_METADATA?.id ?? 'dev' },
					servers: [{ url: `${url.origin}/api` }],
					security: [{ bearerAuth: [] }],
					components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
				});
				return Response.json(spec);
			}
			if (url.pathname.startsWith('/api/')) {
				const context = contextFor(request, env, bearerToken(request.headers.get('authorization')));
				const [prefix, handler] = url.pathname.startsWith('/api/rpc/')
					? (['/api/rpc', rpcHandler] as const)
					: (['/api', openApiHandler] as const);
				const { matched, response } = await handler.handle(request, { prefix, context });
				return matched ? response : notFound();
			}
			return env.ASSETS.fetch(request);
		},
	};
}
```

`server/src/index.ts`:

```ts
import { contract } from '@app/contract';
import { createApp } from './app.ts';
import type { Env } from './env.ts';
import { router } from './router.ts';

const app = createApp({ contract, router, resourceName: 'Cosa si mangia' });

export default {
	fetch: (request, env) => app.fetch(request, env),
} satisfies ExportedHandler<Env>;
```

Elimina `server/src/index.test.ts` (sostituito da `app.test.ts`).

Note di verifica durante l'implementazione:

- `ContractRouterClient` va importato da `@orpc/contract`; se il percorso è diverso in
  1.15.5, usa `import type { RouterClient } from '@orpc/server'` con
  `RouterClient<typeof router>`.
- Il test REST di `unauthorized` si aspetta il corpo JSON di oRPC per OpenAPI
  (`{ defined, code, status, message, data }`): `toMatchObject({ code })` regge entrambe
  le forme.
- Se un errore del database nel verificatore MCP diventa una risposta diversa da 500,
  annotalo: il comportamento atteso è un errore del server, non un 401.

- [ ] **Passo 6: verifica che passino**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS (suite con il database `skipped` senza `TEST_DATABASE_URL`).

- [ ] **Passo 7: commit**

```bash
git add server package-lock.json
git commit -m "Server: Worker con RPC, REST, OpenAPI, MCP generato dal contratto e asset della SPA"
```

---

### Task 8: I tre canali con il database: `whoami`, revoca, validazione e `web_only` su MCP

**File:**
- Crea: `server/test/channels.test.ts`

**Interfacce:**
- Consuma: `createApp`, `collectTools` (task 7), `setupDatabase` (task 5),
  `createTestKeys` (task 3), aiuti di `requests.ts` (task 7), `testContract` e
  `testRouter` (task 6), `messages` (task 4).

- [ ] **Passo 1: test**

`server/test/channels.test.ts`:

```ts
import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { ORPCError } from '@orpc/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { collectTools } from '../src/mcp.ts';
import { messages } from '../src/messages.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv, toolBody } from './support/requests.ts';
import { testContract, testRouter } from './support/test-contract.ts';

describe.skipIf(!hasDatabase)('channels with a real session', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;
	let testApp: ReturnType<typeof createApp>;
	const env = () => testEnv(db.appServerUrl);
	const tokenFor = (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		testApp = createApp({ contract: testContract, router: testRouter, keys: () => keys.keys, resourceName: 'test' });
	});
	afterAll(() => db?.close());

	describe('session.whoami', () => {
		it('answers on RPC as the web app', async () => {
			const user = await db.createUser();
			const client = rpcClient<ContractRouterClient<Contract>>(app, env(), await tokenFor(user));
			await expect(client.session.whoami({})).resolves.toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'it-IT' });
		});

		it('answers on REST', async () => {
			const user = await db.createUser({ locale: 'en-GB' });
			const response = await rest(app, env(), 'GET', '/api/session/whoami', await tokenFor(user));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
		});

		it('answers on MCP as an agent', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			const result = await mcp(app, env(), token, 'tools/call', { name: 'session_whoami', arguments: {} });
			expect(toolBody(result)).toEqual({ userId: user.userId, channel: 'mcp', clientId: 'codex', locale: 'it-IT' });
		});
	});

	describe('revocation at the MCP entrance', () => {
		it('refuses initialize, tools/list and tools/call once the session has ended', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			expect((await mcp(app, env(), token, 'tools/list')).status).toBe(200);
			await db.endSession(user.sessionId);
			for (const [method, params] of [
				['initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }],
				['tools/list', {}],
				['tools/call', { name: 'session_whoami', arguments: {} }],
			] as const) {
				const result = await mcp(app, env(), token, method, params);
				expect(result.status, method).toBe(401);
				expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
			}
		});

		it('refuses a deleted account the same way', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			await db.deleteUser(user.userId);
			expect((await mcp(app, env(), token, 'tools/list')).status).toBe(401);
		});
	});

	describe('MCP tools', () => {
		it('has exactly one tool per exposed operation, with the contract input schema', async () => {
			const user = await db.createUser();
			const result = await mcp(testApp, env(), await tokenFor(user, { client_id: 'codex' }), 'tools/list');
			const listed = result.body.result.tools as { name: string; inputSchema: { required?: string[] } }[];
			expect(listed.map((tool) => tool.name).sort()).toEqual(collectTools(testContract).map((tool) => tool.name).sort());
			expect(listed.find((tool) => tool.name === 'test_member')?.inputSchema.required).toEqual(['familyId']);
		});

		it('answers invalid input with the contract error, field path and language of the profile', async () => {
			for (const locale of ['it-IT', 'en-GB'] as const) {
				const user = await db.createUser({ locale });
				const token = await tokenFor(user, { client_id: 'codex' });
				const result = await mcp(testApp, env(), token, 'tools/call', { name: 'test_member', arguments: { familyId: 'bad' } });
				expect(result.body.result.isError).toBe(true);
				const body = toolBody(result);
				expect(body.code).toBe('invalid');
				expect(body.data.issues[0].path).toEqual(['familyId']);
				expect(body.message).toBe(messages.invalid[locale]);
			}
		});
	});

	describe('web_only', () => {
		it('sends a valid agent to the page, in the language of the profile, on MCP and RPC', async () => {
			const admin = await db.createUser({ locale: 'en-GB' });
			const familyId = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
			const token = await tokenFor(admin, { client_id: 'codex' });
			const url = `https://app.test/family/${familyId}/delete`;

			const viaMcp = await mcp(testApp, env(), token, 'tools/call', { name: 'test_removeFamily', arguments: { familyId } });
			expect(toolBody(viaMcp)).toEqual({ code: 'web_only', data: { url }, message: messages.web_only['en-GB'] });

			const client = rpcClient<ContractRouterClient<typeof testContract>>(testApp, env(), token);
			const error = await client.test.removeFamily({ familyId }).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ORPCError);
			expect(error).toMatchObject({ code: 'web_only', data: { url } });
		});

		it('refuses a revoked agent instead of sending it to the page', async () => {
			const admin = await db.createUser();
			const familyId = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
			const token = await tokenFor(admin, { client_id: 'codex' });
			await db.endSession(admin.sessionId);
			const client = rpcClient<ContractRouterClient<typeof testContract>>(testApp, env(), token);
			await expect(client.test.removeFamily({ familyId })).rejects.toMatchObject({ code: 'unauthorized' });
			expect((await mcp(testApp, env(), token, 'tools/call', { name: 'test_removeFamily', arguments: { familyId } })).status).toBe(401);
		});
	});
});
```

- [ ] **Passo 2: esegui**

Run: `TEST_DATABASE_URL=<url> TEST_DB_FIXTURE=1 npm test -w server -- channels`
Expected: PASS. Se fallisce, correggi il codice dei task 5-7, non il test, salvo errori
evidenti di forma della risposta MCP (per esempio una risposta JSON invece di SSE, già
gestita da `mcp()`).

- [ ] **Passo 3: commit**

```bash
git add server/test/channels.test.ts
git commit -m "Server: whoami, revoca, validazione e web_only provati su RPC, REST e MCP"
```

---

### Task 9: Configurazione di Wrangler e sviluppo locale

**File:**
- Crea: `server/wrangler.jsonc`, `server/.env.example`, `server/README.md`

**Interfacce:**
- Produce: `npm run dev -w server` su `http://localhost:8787`; `npm run deploy` nella radice.

- [ ] **Passo 1: `server/wrangler.jsonc`**

L'id di Hyperdrive resta un segnaposto esplicito finché la risorsa non esiste (task 10):

```jsonc
{
	"$schema": "../node_modules/wrangler/config-schema.json",
	"name": "cosasimangia",
	"main": "src/index.ts",
	"compatibility_date": "2026-10-01",
	"compatibility_flags": ["nodejs_compat"],
	"observability": { "enabled": true },
	"workers_dev": true,
	"vars": {
		// Supabase project URL; token issuer and JWKS are derived from it.
		"SUPABASE_URL": "https://lronuqvtjdhfyychnscr.supabase.co"
	},
	"version_metadata": { "binding": "CF_VERSION_METADATA" },
	"assets": {
		"directory": "../web/dist",
		"binding": "ASSETS",
		"not_found_handling": "single-page-application",
		// Only these paths run the Worker; everything else is served as a static file.
		"run_worker_first": ["/api/*", "/mcp", "/.well-known/*"]
	},
	"hyperdrive": [
		{
			"binding": "HYPERDRIVE",
			// Production config `cosasimangia` (cache disabled, explicit origin connection limit).
			// Replace with the id returned when the coordinator approves creating it.
			"id": "00000000000000000000000000000000"
		}
	]
}
```

L'URL di Supabase è quello del progetto della prova: verificalo con il coordinatore nel
task 10 (stesso progetto per la produzione).

- [ ] **Passo 2: `server/.env.example`**

```
# Copy to server/.env (not versioned). Wrangler reads it for local development.
# Postgres used in place of Hyperdrive, connected as the technical user app_server
# (local Supabase database: `supabase db start`, see supabase/README.md).
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=
# Local Supabase Auth URL, overriding the production value in wrangler.jsonc.
SUPABASE_URL=
```

Verifica con Context7 (Wrangler) che le variabili di `.env` sostituiscano `vars` in
`wrangler dev`; se serve `.dev.vars`, usa quello e aggiorna l'esempio (entrambi sono già
in `.gitignore`).

- [ ] **Passo 3: `server/README.md`**

```markdown
# Server

Worker di Cloudflare che serve la SPA (`web/dist`) e le rotte del contratto:
`/api/rpc`, `/api`, `/api/openapi.json`, `/mcp`. Spec:
`progetto/superpowers/specs/2026-10-11-piattaforma.md`.

## Sviluppo locale

1. Avvia il database locale con le migrazioni: `supabase db start` (vedi
   `supabase/README.md`; serve Podman avviato).
2. Copia `.env.example` in `.env` e compila la connessione come `app_server` e l'URL
   dell'Auth locale.
3. Una volta sola: `npm install-scripts approve workerd` (npm 11 blocca lo script
   d'installazione del runtime usato da `wrangler dev`).
4. `npm run build -w web`, poi `npm run dev -w server` (porta 8787).
5. Prova: `curl -H "Authorization: Bearer <token>" http://localhost:8787/api/session/whoami`.

In locale Hyperdrive non fa da pool: le prove di concorrenza si fanno sul Worker pubblicato.

## Test

`npm test -w server`. I test con il database richiedono `TEST_DATABASE_URL`
(superutente del database locale, `supabase status`); senza, in locale sono saltati, in
CI falliscono.

## Pubblicazione

Per ora a mano, dopo il merge su `main` e dopo che l'integrazione di Supabase ha
applicato le migrazioni: dalla radice, `npm run deploy` (build di `web`, poi
`wrangler deploy`). Le migrazioni sono additive, quindi il Worker precedente regge
fino alla pubblicazione.

## Risorse di produzione

(compilata nel task 10: Worker, Hyperdrive con limite di connessioni, chiavi di firma,
esito della verifica dell'integrazione GitHub di Supabase fatta dal coordinatore)
```

- [ ] **Passo 4: prova locale**

Run: `npm run build -w web && npx wrangler deploy --dry-run --outdir /tmp/cosasimangia-dry -c server/wrangler.jsonc`
Expected: bundle generato senza errori; annota la dimensione (riferimento della prova:
1,5 MiB, 275 KiB compressi).

Con il database locale disponibile: `npm run dev -w server`, poi `curl` di
`/api/session/whoami` con un token dell'Auth locale (`200`), di `/menu` (HTML della
SPA), di `/api/nothing` (`404`). Annota l'esito per la descrizione della PR.

- [ ] **Passo 5: commit**

```bash
git add server/wrangler.jsonc server/.env.example server/README.md
git commit -m "Server: configurazione di Wrangler, sviluppo locale e procedura di pubblicazione"
```

---

### Task 10: Risorse di produzione e prima pubblicazione

Ogni passo che crea o cambia una risorsa esterna inizia con `STATO: DOMANDA` e aspetta
la risposta del coordinatore. **Fuori da questo task:** la verifica dell'integrazione
GitHub di Supabase (la fa il coordinatore con l'utente prima del merge di W2; qui se ne
riporta solo l'esito) e qualunque nuovo collegamento di un agente con consenso (la
pagina `/authorize` arriva nell'ondata 2; la prova della revoca spetta a «Collegamento
degli agenti», spec, sezione 10).

**File:**
- Modifica: `server/wrangler.jsonc` (id di Hyperdrive), `server/README.md` (sezione
  «Risorse di produzione»)

- [ ] **Passo 1: verifiche in sola lettura**

Run:

```bash
curl -s https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json
```

Expected: il JWKS contiene almeno una chiave `EC` o `RSA` (chiavi asimmetriche attive).
Se è vuoto, `STATO: DOMANDA`: senza chiavi asimmetriche il server non può verificare i
token.

- [ ] **Passo 2: pool e password di `app_server` (domanda)**

Scrivi `STATO: DOMANDA` chiedendo al coordinatore:

- la dimensione del pool del Session pooler (Supabase > Database > Connection pooling),
  per fissare `origin_connection_limit`;
- chi imposta la password di `app_server` sul progetto (W2 la prevede con
  `alter role app_server with password …` dall'editor SQL) e come arriva nella
  configurazione di Hyperdrive senza passare dalla conversazione: per esempio l'utente
  lancia lui il comando del passo 3. Nel Session pooler l'utente si scrive
  `app_server.<project_ref>`.

- [ ] **Passo 3: Hyperdrive di produzione (domanda)**

Verifica prima con Context7 (Wrangler, Hyperdrive) il nome esatto delle opzioni e il
valore minimo ammesso, poi proponi il comando, da far lanciare all'utente:

```bash
npx wrangler hyperdrive create cosasimangia \
  --connection-string="postgres://app_server.lronuqvtjdhfyychnscr:<password>@<host del Session pooler>:5432/postgres" \
  --caching-disabled \
  --origin-connection-limit=<pool del passo 2 meno almeno 5>
```

Con l'id restituito aggiorna `server/wrangler.jsonc`.

- [ ] **Passo 4: prima pubblicazione (domanda)**

Chiedi il via per `npm run deploy` sull'account POWA (o che la lanci il coordinatore),
dopo il merge di W2 e l'applicazione delle sue migrazioni al progetto. Dopo la
pubblicazione verifica:

```bash
BASE=https://cosasimangia.<sottodominio>.workers.dev
curl -s $BASE/api/openapi.json | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/session/whoami
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' $BASE/mcp
curl -s $BASE/.well-known/oauth-protected-resource/mcp
curl -s -o /dev/null -w '%{http_code}\n' $BASE/menu
```

Expected: OpenAPI servito; `401` senza token su `whoami` e su `/mcp`; metadati con
`resource` che termina in `/mcp`; `200` con l'HTML segnaposto per `/menu`. Con un
utente creato dallo script di W2 e un token ottenuto con email e password (come
`spike/server/token.sh`, che l'utente lancia da sé), `session.whoami` risponde `200`
con `channel: "web"`.

- [ ] **Passo 5: registra l'esito e fai commit**

Compila «Risorse di produzione» in `server/README.md`: nomi delle risorse, limite di
connessioni scelto e perché, esito della verifica dell'integrazione GitHub ricevuto dal
coordinatore, procedura di pubblicazione.

```bash
git add server/wrangler.jsonc server/README.md
git commit -m "Piattaforma: risorse di produzione e prima pubblicazione su workers.dev"
```

---

### Task 11: Schema reale, CI con il database e PR

Si esegue **dopo il merge di W2** su `main`.

**File:**
- Modifica: `.github/workflows/ci.yml`, `server/test/support/db.ts`
- Elimina: `server/test/support/schema.sql`

- [ ] **Passo 1: unisci `main` e togli la fixture**

```bash
git fetch origin && git merge origin/main
git rm server/test/support/schema.sql
```

In `server/test/support/db.ts`, `ensureSchema` diventa:

```ts
async function ensureSchema(admin: postgres.Sql): Promise<void> {
	const [{ present }] = await admin<{ present: boolean }[]>`select to_regclass('app.profiles') is not null as present`;
	if (!present) {
		throw new Error('Schema app is missing: start the local database with the migrations of supabase/ (supabase db start).');
	}
}
```

e sparisce l'import di `readFile`. Avvia il database con le migrazioni reali
(`supabase db start` dalla radice; se lo schema `app` non compare, `supabase db reset`)
e adegua solo `server/test/support/db.ts` se gli inserimenti di prova non rispettano
vincoli o permessi dello schema vero.

- [ ] **Passo 2: verifica locale completa** (skill `superpowers:verification-before-completion`)

Run:

```bash
npm ci
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server
npm run build -w web && npx wrangler deploy --dry-run --outdir /tmp/cosasimangia-dry -c server/wrangler.jsonc
```

Expected: tutto PASS; nell'output di Vitest nessuna suite `skipped`.

- [ ] **Passo 3: CI con il database**

Verifica con Context7 (CLI di Supabase) che `supabase db start` applichi le migrazioni
di `supabase/migrations` su un database nuovo e la versione della CLI da fissare
(la stessa di `~/.local/bin/supabase --version`). Poi `.github/workflows/ci.yml` diventa
un job unico, perché `npm test` comprende i test del server, che in CI richiedono il
database:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - uses: supabase/setup-cli@v1
        with:
          version: <versione della CLI usata in locale>
      - run: supabase db start
      - run: supabase test db
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

`supabase test db` esegue i test pgTAP di W2, come proposto nella sua spec. Se W2 ha già
aggiunto un job per i suoi test, unisci i due senza duplicare l'avvio del database.

- [ ] **Passo 4: commit**

```bash
git add -A server/test/support .github/workflows/ci.yml
git commit -m "Piattaforma: test contro lo schema reale di W2 e CI con il database"
```

- [ ] **Passo 5: push e PR**

```bash
git push -u origin fondamenta/piattaforma
gh pr create --base main --title "Piattaforma: Worker, contratto e percorso della richiesta" --body "<in italiano: cosa fa; come è stato verificato (comandi ed esiti, test contro le migrazioni di W2, prove locali e su workers.dev); sezioni della specifica realizzate (1, 9, 13, 15); interfacce con W2 e W5; riga di attribuzione finale>"
```

Attendi che la CI passi sulla PR (`gh pr checks`), poi scrivi `STATO: PR_APERTA <url>` e
fermati.
