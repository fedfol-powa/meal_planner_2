# Piattaforma: piano di implementazione

> **Per gli agenti:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, task per task. I passi usano le
> caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** il monorepo con workspace e un Worker che serve SPA, RPC, REST, OpenAPI e
MCP da un contratto unico, con token, contesto, ruolo Postgres, permessi, errori a codici
e letture versionate, provato end-to-end con `session.whoami`.

**Architettura:** npm workspaces (`domain`, `contract`, `server`, `web`) che esportano i
sorgenti TypeScript. `contract` definisce le operazioni con metadati obbligatori ed
errori; `server` le implementa con oRPC tramite un implementatore comune che valida
l'input, verifica il token, applica `webOnly`, apre la transazione nel ruolo scelto,
legge profilo e sessione, controlla il ruolo e gestisce le versioni. Una `fetch` smista
le rotte e genera gli strumenti MCP dal contratto.

**Stack:** TypeScript 6, npm workspaces, oRPC 1.15.5, zod 4, Postgres.js 3, jose 6,
`@modelcontextprotocol/server` 2.3.1, Wrangler 4, Vitest 4 (in Node).

**Spec:** `progetto/superpowers/specs/2026-10-11-piattaforma.md` (da leggere per prima),
che estende la specifica principale
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 1, 9, 13, 15).
Codice di partenza provato: `spike/server/src/` (sul branch, solo da leggere).

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
- Nessuna risorsa esterna (Cloudflare, Supabase, segreti GitHub) creata o cambiata senza
  `STATO: DOMANDA` al coordinatore. Nessun merge: lo fa il coordinatore.
- Non toccare `supabase/` (W2), `web/src` (W5), `domain/src` (W3, W4), la specifica
  principale, `AGENTS.md`, `progetto/coordinamento/`.
- Nomi delle tabelle e funzioni di W2 usati dal server, concentrati in
  `server/src/permissions.ts`, `server/src/session.ts` e `server/src/versions.ts`:
  `profiles(id, locale)`, `app.session_is_active()`, `families(id, data_version)`,
  `family_members(family_id, user_id, role in ('admin','member'))`,
  `user_global_roles(user_id, role in ('curator','app_admin'))`,
  `catalogue_state(version)`, ruoli `app_server`, `authenticated`, `anon`, `app_job`.
  Se la spec di W2 usa nomi diversi, si allineano questi tre file e la fixture.

## Focus della review

1. **Versione di un'altra famiglia o lingua**: una `knownVersion` posseduta per la
   famiglia A non vale come «invariato» per la famiglia B con gli stessi contatori (test
   nel task 6).
2. **Header `Authorization` malformato** (`bearer x`, `Bearer ` vuoto, token non JWT):
   sempre `unauthorized`, mai `internal` (test nel task 3 e nel task 7).
3. **Database irraggiungibile**: `internal` con stato 500 in tempi brevi, senza la
   stringa di connessione nel corpo della risposta (test nel task 6).
4. **Chiamate concorrenti a cache vuota delle chiavi**: nessuna promessa condivisa, ogni
   richiesta fa il proprio fetch (test nel task 3).
5. **Procedura inesistente sotto `/api/rpc` o `/api`**: 404 `not_found`, non 500 e non la
   pagina della SPA (test nel task 7).

---

## Mappa dei file

```
package.json                        workspaces e script della radice (modifica)
tsconfig.base.json                  opzioni comuni (nuovo)
tsconfig.json                       domain/ con i test, scripts/, vitest.config (modifica)
vitest.config.ts                    solo scripts/ (modifica)
.gitignore                          dist/, .wrangler/, .dev.vars (modifica)
.github/workflows/ci.yml            typecheck e test (nuovo)
domain/package.json                 @app/domain (nuovo)
domain/tsconfig.json                estende la base (modifica)
contract/package.json, tsconfig.json
contract/src/index.ts               esporta contratto e convenzioni
contract/src/locale.ts              lingue supportate
contract/src/errors.ts              codici, stati HTTP, schemi dei dati
contract/src/op.ts                  costruttore `op` e OperationMeta
contract/src/versioned.ts           input e output delle letture versionate
contract/src/check.ts               controllo delle convenzioni (riusato dal server)
contract/src/contract.ts            il contratto: session.whoami
contract/src/check.test.ts, contract.test.ts
server/package.json, tsconfig.json, wrangler.jsonc, .env.example, README.md
server/src/env.ts                   tipo Env dei binding
server/src/auth.ts                  verifica del token, sorgente delle chiavi, canale
server/src/messages.ts              messaggi degli errori in it-IT e en-GB
server/src/errors.ts                normalizzazione degli errori
server/src/db.ts                    transazione con scelta del ruolo
server/src/session.ts               profilo e sessione dell'utente
server/src/permissions.ts           controllo dei ruoli
server/src/versions.ts              composizione della versione
server/src/pipeline.ts              implementatore comune con il middleware
server/src/router.ts                implementazione del contratto
server/src/mcp.ts                   strumenti MCP dal contratto
server/src/well-known.ts            metadati OAuth
server/src/app.ts                   createApp: smistamento delle rotte
server/src/index.ts                 Worker di produzione
server/test/support/keys.ts         chiavi e token di prova
server/test/support/db.ts           database di prova
server/test/support/schema.sql      fixture provvisoria degli oggetti di W2
server/test/support/test-contract.ts contratto e router di prova
server/test/support/requests.ts     chiamate RPC, REST e MCP verso l'app
server/test/*.test.ts
web/package.json                    segnaposto con build minima (W5 lo sostituisce)
```

---

### Task 1: Scheletro del monorepo e CI (prima PR)

**File:**
- Modifica: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `domain/tsconfig.json`
- Crea: `tsconfig.base.json`, `domain/package.json`, `contract/package.json`,
  `contract/tsconfig.json`, `contract/src/index.ts`, `contract/src/index.test.ts`,
  `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`,
  `server/src/index.test.ts`, `web/package.json`, `.github/workflows/ci.yml`

**Interfacce:**
- Produce: workspace `@app/domain` (export `./planner`), `@app/contract` (export `.`),
  `@app/server`, `@app/web`; script della radice `test`, `typecheck`, `deploy`.

- [ ] **Passo 1: annota lo stato di partenza**

Run: `npm ci && npm test && npm run typecheck`
Expected: PASS (test del pianificatore). Annota il numero di test per confrontarlo dopo.

- [ ] **Passo 2: `tsconfig.base.json`**

```json
{
	"compilerOptions": {
		"target": "ES2024",
		"lib": ["ES2024"],
		"module": "ESNext",
		"moduleResolution": "Bundler",
		"strict": true,
		"noEmit": true,
		"allowImportingTsExtensions": true,
		"erasableSyntaxOnly": true,
		"verbatimModuleSyntax": true,
		"skipLibCheck": true,
		"types": []
	}
}
```

- [ ] **Passo 3: `domain/` come workspace**

`domain/tsconfig.json`:

```json
{
	"extends": "../tsconfig.base.json",
	"include": ["src/**/*.ts"],
	"exclude": ["src/**/*.test.ts"]
}
```

`domain/package.json`:

```json
{
	"name": "@app/domain",
	"private": true,
	"type": "module",
	"exports": {
		"./planner": "./src/planner/index.ts"
	},
	"scripts": {
		"test": "vitest run",
		"typecheck": "tsc -p tsconfig.json"
	}
}
```

- [ ] **Passo 4: `contract/`**

`contract/package.json`:

```json
{
	"name": "@app/contract",
	"private": true,
	"type": "module",
	"exports": { ".": "./src/index.ts" },
	"scripts": {
		"test": "vitest run",
		"typecheck": "tsc -p tsconfig.json"
	},
	"dependencies": {
		"@orpc/contract": "1.15.5",
		"zod": "4.6.5"
	}
}
```

`contract/tsconfig.json`:

```json
{
	"extends": "../tsconfig.base.json",
	"include": ["src/**/*.ts"]
}
```

`contract/src/index.ts`:

```ts
export const contract = {};
```

`contract/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contract } from './index.ts';

describe('contract package', () => {
	it('exports the contract', () => {
		expect(contract).toBeTypeOf('object');
	});
});
```

- [ ] **Passo 5: `server/`**

`server/package.json`:

```json
{
	"name": "@app/server",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "wrangler dev",
		"deploy": "wrangler deploy",
		"test": "vitest run",
		"typecheck": "tsc -p tsconfig.json"
	},
	"dependencies": {
		"@app/contract": "*"
	},
	"devDependencies": {
		"@cloudflare/workers-types": "5.20261011.1",
		"wrangler": "4.149.0"
	}
}
```

`server/tsconfig.json`:

```json
{
	"extends": "../tsconfig.base.json",
	"compilerOptions": {
		"types": ["@cloudflare/workers-types"]
	},
	"include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`server/src/index.ts`:

```ts
export default {
	async fetch(): Promise<Response> {
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler;
```

`server/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import worker from './index.ts';

describe('worker skeleton', () => {
	it('answers 404', async () => {
		const response = await worker.fetch();
		expect(response.status).toBe(404);
	});
});
```

- [ ] **Passo 6: `web/` segnaposto**

`web/package.json` (W5 lo sostituisce; la build crea `dist/index.html` perché Wrangler
richiede la cartella degli asset):

```json
{
	"name": "@app/web",
	"private": true,
	"type": "module",
	"scripts": {
		"build": "node -e \"const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','<!doctype html><title>Cosa si mangia</title>')\""
	}
}
```

- [ ] **Passo 7: radice**

`package.json` (mantiene gli script esistenti):

```json
{
	"name": "app-famiglia",
	"private": true,
	"type": "module",
	"workspaces": ["domain", "contract", "server", "web"],
	"scripts": {
		"test": "vitest run && npm run test --workspaces --if-present",
		"typecheck": "tsc -p tsconfig.json && npm run typecheck --workspaces --if-present",
		"deploy": "npm run build -w web && npm run deploy -w server",
		"planner-report": "node scripts/planner-report.ts",
		"recipe-attributes-table": "node scripts/recipe-attributes-table.ts"
	},
	"devDependencies": {
		"@types/node": "^26.6.4",
		"typescript": "^6.0.3",
		"vitest": "^4.1.11",
		"yaml": "^2.9.1"
	}
}
```

`tsconfig.json` (come oggi controlla `domain/` compresi i test e `scripts/` con i tipi
di Node; `domain/tsconfig.json` resta il controllo senza Node del solo codice):

```json
{
	"extends": "./tsconfig.base.json",
	"compilerOptions": {
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"lib": ["ES2024"],
		"types": ["node"]
	},
	"include": ["domain/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Workspaces run their own tests; the prototype keeps its own Vitest setup in prototype/.
export default defineConfig({
	test: { include: ['scripts/**/*.test.ts'], passWithNoTests: true }
});
```

`.gitignore`: aggiungi in fondo

```
# Build e strumenti dei workspace
dist/
.wrangler/
.dev.vars
```

- [ ] **Passo 8: CI**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Passo 9: installa e verifica**

Run: `npm install && npm test && npm run typecheck`
Expected: PASS; i test del pianificatore sono gli stessi del passo 1 (ora sotto
`@app/domain`), più i due test segnaposto. `node scripts/planner-report.ts --help`
non è richiesto; basta che `npm run typecheck` controlli `scripts/`.

- [ ] **Passo 10: commit**

```bash
git add package.json package-lock.json tsconfig.base.json tsconfig.json vitest.config.ts .gitignore domain/package.json domain/tsconfig.json contract server web .github
git commit -m "Scheletro del monorepo: workspace domain, contract, server, web e CI"
```

- [ ] **Passo 11: PR dello scheletro**

Branch separato dal commit dello scheletro, così il resto del lavoro continua su
`fondamenta/piattaforma`:

```bash
git branch fondamenta/scheletro
git push -u origin fondamenta/scheletro
gh pr create --base main --head fondamenta/scheletro --title "Scheletro del monorepo" --body "<descrizione in italiano: cosa fa, come è stato verificato, sezione 1 della specifica (struttura); chiude con la riga di attribuzione>"
```

Il branch contiene anche i commit di spec e piano, già approvati. Scrivi
`STATO: PR_APERTA <url> (scheletro)` e prosegui con il task 2 senza aspettare: gli
altri worker aspettano solo questa PR. Dopo il merge dello scheletro, `git merge
origin/main` su `fondamenta/piattaforma`.

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
			'view: versioned read needs an optional knownVersion input',
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
	internal: { status: 500 },
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

function acceptsOnlyUuid(schema: unknown): boolean {
	if (!(schema instanceof z.ZodType)) return false;
	return schema.safeParse(crypto.randomUUID()).success && !schema.safeParse('not-a-uuid').success;
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
		if ((meta.role === 'familyMember' || meta.role === 'familyAdmin') && !acceptsOnlyUuid(shape.familyId)) {
			problems.push(`${name}: family role needs a uuid familyId input`);
		}
		if ((meta.offline || meta.creates) && !acceptsOnlyUuid(shape.id)) {
			problems.push(`${name}: offline or creating operation needs a uuid id input`);
		}
		if (meta.reads) {
			const known = shape.knownVersion;
			if (!(known instanceof z.ZodType) || !known.safeParse(undefined).success) {
				problems.push(`${name}: versioned read needs an optional knownVersion input`);
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

### Task 3: Verifica del token e canale

**File:**
- Crea: `server/src/env.ts`, `server/src/auth.ts`, `server/test/support/keys.ts`,
  `server/test/auth.test.ts`
- Modifica: `server/package.json` (dipendenze)

**Interfacce:**
- Produce:
  - `interface Env { HYPERDRIVE: Hyperdrive; SUPABASE_URL: string; CF_VERSION_METADATA: WorkerVersionMetadata; ASSETS: Fetcher }`
  - `interface Claims extends JWTPayload { sub: string; role: string; session_id?: string; client_id?: string }`
  - `type Channel = 'web' | 'mcp'`, `channelOf(claims): Channel`
  - `type KeySource = (forceRefresh: boolean) => Promise<JSONWebKeySet>`
  - `remoteKeySource(supabaseUrl: string): KeySource` (cache di modulo con dati risolti)
  - `verifyAccessToken(token: string, options: { issuer: string; keys: KeySource }): Promise<Claims>`
  - `bearerToken(header: string | null): string | undefined`
  - test: `createTestKeys(): Promise<TestKeys>` con `keys: KeySource`, `issuer`,
    `sign(claims: Partial<Claims> & { sub: string }, options?: { expiresIn?: string; kid?: string }): Promise<string>`

- [ ] **Passo 1: dipendenze**

Run: `npm install -w server jose@6.2.12`
Expected: `jose` in `server/package.json`.

- [ ] **Passo 2: chiavi di prova**

`server/test/support/keys.ts`:

```ts
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import type { Claims, KeySource } from '../../src/auth.ts';

export const TEST_SUPABASE_URL = 'https://test.supabase.local';
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;

export interface TestKeys {
	keys: KeySource;
	issuer: string;
	sign(claims: Partial<Claims> & { sub: string }, options?: { expiresIn?: string; kid?: string }): Promise<string>;
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
			return new SignJWT({ role: 'authenticated', aud: 'authenticated', ...claims })
				.setProtectedHeader({ alg: 'ES256', kid: options.kid ?? 'test-key' })
				.setIssuer(TEST_ISSUER)
				.setIssuedAt()
				.setExpirationTime(options.expiresIn ?? '1h')
				.sign(privateKey);
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
		const claims = await verifyAccessToken(await t.sign({ sub: userId, session_id: 's1' }), { issuer: TEST_ISSUER, keys: t.keys });
		expect(claims.sub).toBe(userId);
		expect(claims.session_id).toBe('s1');
	});

	it('rejects an expired token', async () => {
		const t = await createTestKeys();
		const token = await t.sign({ sub: userId }, { expiresIn: '-1m' });
		await expect(verifyAccessToken(token, { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
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

describe('channel and bearer', () => {
	it('derives the channel from client_id', () => {
		expect(channelOf({ sub: userId, role: 'authenticated' })).toBe('web');
		expect(channelOf({ sub: userId, role: 'authenticated', client_id: 'agent' })).toBe('mcp');
	});

	it('reads only well-formed bearer headers', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('bearer abc')).toBeUndefined();
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

`server/src/auth.ts` (dalla prova, con la sorgente delle chiavi iniettabile):

```ts
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';

/** Claims of a verified Supabase access token, forwarded to Postgres as `request.jwt.claims`. */
export interface Claims extends JWTPayload {
	sub: string;
	role: string;
	session_id?: string;
	/** Present only on tokens issued by the OAuth server to an agent (MCP channel). */
	client_id?: string;
}

export type Channel = 'web' | 'mcp';

export function channelOf(claims: Claims): Channel {
	return claims.client_id ? 'mcp' : 'web';
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
	});
	if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') {
		throw new Error('Token is not an authenticated user token');
	}
	return payload as Claims;
}

export function bearerToken(header: string | null): string | undefined {
	if (!header?.startsWith('Bearer ')) return undefined;
	const token = header.slice('Bearer '.length).trim();
	return token || undefined;
}
```

Il `remoteKeySource` va creato **una volta per isolate** (sezione del task 7), non per
richiesta, altrimenti la cache non serve.

- [ ] **Passo 6: verifica che passino**

Run: `npm test -w server -- auth && npm run typecheck -w server`
Expected: PASS.

- [ ] **Passo 7: commit**

```bash
git add server package-lock.json
git commit -m "Server: verifica dei token di Supabase con chiavi iniettabili e canale da client_id"
```

---

### Task 4: Errori normalizzati e messaggi localizzati

**File:**
- Crea: `server/src/messages.ts`, `server/src/errors.ts`, `server/test/errors.test.ts`
- Modifica: `server/package.json` (dipendenze oRPC e zod)

**Interfacce:**
- Consuma: `ErrorCode`, `errorCodes`, `isErrorCode`, `errorDefinitions`, `Locale`, `locales` da `@app/contract`.
- Produce:
  - `messages: Record<ErrorCode, Record<Locale, string>>`, `messageFor(code, locale): string`
  - `appError(code: ErrorCode, data?: unknown): ORPCError<ErrorCode, unknown>`
  - `normalizeError(error: unknown): ORPCError<ErrorCode, unknown>`
  - `mapErrors` interceptor: `async ({ next }) => …` per `clientInterceptors` e `interceptors` del client del router
  - `toolErrorBody(error: unknown, locale: Locale): { code: ErrorCode; data?: unknown; message: string }`

- [ ] **Passo 1: dipendenze**

Run: `npm install -w server @orpc/server@1.15.5 @orpc/openapi@1.15.5 @orpc/zod@1.15.5 @orpc/contract@1.15.5 zod@4.6.5 && npm install -w server -D @orpc/client@1.15.5`

- [ ] **Passo 2: test (falliscono)**

`server/test/errors.test.ts`:

```ts
import { errorCodes, locales } from '@app/contract';
import { ORPCError, ValidationError } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { appError, normalizeError, toolErrorBody } from '../src/errors.ts';
import { messages } from '../src/messages.ts';

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
		const error = normalizeError(validation);
		expect(error.code).toBe('invalid');
		expect(error.status).toBe(400);
		expect(error.data).toEqual({ issues: [{ path: ['familyId'], code: 'invalid_format' }] });
	});

	it('keeps known codes', () => {
		const error = normalizeError(appError('forbidden'));
		expect(error.code).toBe('forbidden');
		expect(error.status).toBe(403);
	});

	it('hides unexpected errors as internal', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = normalizeError(new Error('postgres://user:secret@host/db refused'));
		expect(error.code).toBe('internal');
		expect(error.status).toBe(500);
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});

describe('toolErrorBody', () => {
	it('adds the message in the user language', () => {
		expect(toolErrorBody(appError('web_only', { url: 'https://x/family' }), 'en-GB')).toEqual({
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

export function appError(code: ErrorCode, data?: unknown): ORPCError<ErrorCode, unknown> {
	return new ORPCError(code, { status: errorDefinitions[code].status, data });
}

/** Every error leaving an operation becomes one of the contract codes. */
export function normalizeError(error: unknown): ORPCError<ErrorCode, unknown> {
	if (error instanceof ORPCError) {
		if (error.code === 'BAD_REQUEST' && error.cause instanceof ValidationError) {
			const issues = error.cause.issues.map((issue) => ({
				path: (issue.path ?? []).map((part) => {
					const key = typeof part === 'object' ? part.key : part;
					return typeof key === 'number' ? key : String(key);
				}),
				code: (issue as { code?: string }).code ?? 'invalid',
			}));
			return new ORPCError('invalid', { status: 400, data: { issues }, cause: error });
		}
		if (isErrorCode(error.code)) return error as ORPCError<ErrorCode, unknown>;
	}
	console.error('Unexpected error', error);
	return new ORPCError('internal', { status: 500 });
}

/** Interceptor for handlers and router clients: run, then normalise what is thrown. */
export async function mapErrors<T>({ next }: { next: () => Promise<T> }): Promise<T> {
	try {
		return await next();
	} catch (error) {
		throw normalizeError(error);
	}
}

export function toolErrorBody(error: unknown, locale: Locale): { code: ErrorCode; data?: unknown; message: string } {
	const normalized = normalizeError(error);
	return { code: normalized.code, data: normalized.data, message: messageFor(normalized.code, locale) };
}
```

Nota: `new ORPCError('internal', …)` senza `cause` evita che dettagli interni finiscano
nel JSON; il log resta nel Worker.

- [ ] **Passo 5: verifica che passino**

Run: `npm test -w server -- errors && npm run typecheck -w server`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add server package-lock.json
git commit -m "Server: errori normalizzati sui codici del contratto e messaggi in italiano e inglese"
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
    `endSession(sessionId: string): Promise<void>`, `deleteProfile(userId: string): Promise<void>`,
    `createFamily(members: { userId: string; role: 'admin' | 'member' }[]): Promise<string>`,
    `grantGlobalRole(userId: string, role: 'curator' | 'app_admin'): Promise<void>`,
    `bumpFamily(familyId: string): Promise<void>`, `close(): Promise<void>`

**Database dei test.** I test con il database leggono `TEST_DATABASE_URL`: una
connessione con privilegi da superutente a un Postgres compatibile con Supabase (schema
`auth` con `users`, `sessions`, `uid()`, `jwt()`; ruoli `authenticated` e `anon`),
nell'ambiente locale che W2 stabilisce (Supabase locale con Podman o alternativa). Se
quando arrivi a questo task l'ambiente di W2 non è ancora disponibile, scrivi
`STATO: DOMANDA` chiedendo al coordinatore come avviarlo; i test senza database non ne
dipendono. Senza `TEST_DATABASE_URL` le suite con il database sono saltate e Vitest le
mostra come `skipped`.

- [ ] **Passo 1: dipendenza**

Run: `npm install -w server postgres@3.4.9`

- [ ] **Passo 2: fixture provvisoria degli oggetti di W2**

`server/test/support/schema.sql` (si applica solo se `public.profiles` non esiste;
da togliere quando lo schema di W2 è su `main`):

```sql
-- Stand-in for the W2 objects the server relies on, same names as agreed.
-- Applied by the tests only when the real schema is missing.
do $$ begin
	if not exists (select 1 from pg_roles where rolname = 'app_job') then create role app_job nologin; end if;
	if not exists (select 1 from pg_roles where rolname = 'app_server') then create role app_server login noinherit; end if;
end $$;
grant authenticated, anon, app_job to app_server;

create schema if not exists app;
grant usage on schema app to authenticated;

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	locale text not null default 'it-IT' check (locale in ('it-IT', 'en-GB'))
);
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles for select to authenticated using (id = auth.uid());
grant select on public.profiles to authenticated;

create or replace function app.session_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
	select exists (
		select 1 from auth.sessions s
		where s.id = (auth.jwt() ->> 'session_id')::uuid
			and s.user_id = auth.uid()
			and (s.not_after is null or s.not_after > now())
	);
$$;
revoke all on function app.session_is_active() from public;
grant execute on function app.session_is_active() to authenticated;

create table public.families (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	data_version bigint not null default 0
);
create table public.family_members (
	family_id uuid not null references public.families (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('admin', 'member')),
	primary key (family_id, user_id)
);
create table public.user_global_roles (
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('curator', 'app_admin')),
	primary key (user_id, role)
);
create table public.catalogue_state (
	id boolean primary key default true check (id),
	version bigint not null default 0
);
insert into public.catalogue_state default values;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.user_global_roles enable row level security;
alter table public.catalogue_state enable row level security;
create policy family_members_own on public.family_members for select to authenticated using (user_id = auth.uid());
create policy families_member on public.families for select to authenticated
	using (exists (select 1 from public.family_members m where m.family_id = id and m.user_id = auth.uid()));
create policy user_global_roles_own on public.user_global_roles for select to authenticated using (user_id = auth.uid());
create policy catalogue_state_all on public.catalogue_state for select to authenticated using (true);
grant select on public.families, public.family_members, public.user_global_roles, public.catalogue_state to authenticated;
```

- [ ] **Passo 3: supporto dei test con il database**

`server/test/support/db.ts`:

```ts
import type { Locale } from '@app/contract';
import postgres from 'postgres';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const databaseUrl = env.TEST_DATABASE_URL;
export const hasDatabase = Boolean(databaseUrl);

const APP_SERVER_PASSWORD = 'app_server_test';

export interface TestDatabase {
	admin: postgres.Sql;
	/** Connection as the server's technical user, like Hyperdrive in production. */
	appServerUrl: string;
	createUser(options?: { locale?: Locale }): Promise<{ userId: string; sessionId: string }>;
	endSession(sessionId: string): Promise<void>;
	deleteProfile(userId: string): Promise<void>;
	createFamily(members: { userId: string; role: 'admin' | 'member' }[]): Promise<string>;
	grantGlobalRole(userId: string, role: 'curator' | 'app_admin'): Promise<void>;
	bumpFamily(familyId: string): Promise<void>;
	close(): Promise<void>;
}

export async function setupDatabase(): Promise<TestDatabase> {
	if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set');
	const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	const [{ present }] = await admin<{ present: boolean }[]>`select to_regclass('public.profiles') is not null as present`;
	if (!present) {
		const schema = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
		await admin.unsafe(schema);
	}
	await admin.unsafe(`alter role app_server password '${APP_SERVER_PASSWORD}'`);
	const url = new URL(databaseUrl);
	url.username = 'app_server';
	url.password = APP_SERVER_PASSWORD;

	return {
		admin,
		appServerUrl: url.toString(),
		async createUser(options = {}) {
			const userId = crypto.randomUUID();
			const sessionId = crypto.randomUUID();
			await admin`insert into auth.users (id, email, aud, role) values (${userId}, ${`${userId}@test.local`}, 'authenticated', 'authenticated')`;
			await admin`insert into auth.sessions (id, user_id) values (${sessionId}, ${userId})`;
			await admin`insert into public.profiles (id, locale) values (${userId}, ${options.locale ?? 'it-IT'})`;
			return { userId, sessionId };
		},
		async endSession(sessionId) {
			await admin`delete from auth.sessions where id = ${sessionId}`;
		},
		async deleteProfile(userId) {
			await admin`delete from public.profiles where id = ${userId}`;
		},
		async createFamily(members) {
			const [{ id }] = await admin<{ id: string }[]>`insert into public.families (name) values ('Test') returning id`;
			for (const member of members) {
				await admin`insert into public.family_members (family_id, user_id, role) values (${id}, ${member.userId}, ${member.role})`;
			}
			return id;
		},
		async grantGlobalRole(userId, role) {
			await admin`insert into public.user_global_roles (user_id, role) values (${userId}, ${role})`;
		},
		async bumpFamily(familyId) {
			await admin`update public.families set data_version = data_version + 1 where id = ${familyId}`;
		},
		async close() {
			await admin.end();
		},
	};
}
```

Se lo schema vero di W2 è già presente e i suoi inserimenti richiedono colonne in più
(per esempio `families` con altri campi obbligatori o profili creati da un trigger su
`auth.users`), adegua qui `createUser` e `createFamily`, non il codice del server.

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

	it('acts as the user with the claims', async () => {
		const { userId, sessionId } = await db.createUser();
		const claims = { sub: userId, role: 'authenticated', session_id: sessionId };
		const [row] = await withDb(db.appServerUrl, { kind: 'user', claims }, (tx) =>
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

	it('leaves nothing behind on a reused connection', async () => {
		const { userId } = await db.createUser();
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await withDbOn(sql, { kind: 'user', claims: { sub: userId, role: 'authenticated' } }, async () => {});
			const [after] = await sql<{ role: string; claims: string | null }[]>`
				select current_user as role, nullif(current_setting('request.jwt.claims', true), '') as claims`;
			expect(after).toEqual({ role: 'app_server', claims: null });
		} finally {
			await sql.end();
		}
	});

	it('sees no table as app_server without a chosen role', async () => {
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		try {
			await expect(sql`select * from public.profiles`).rejects.toThrow(/permission denied/);
		} finally {
			await sql.end();
		}
	});
});
```

- [ ] **Passo 5: verifica che falliscano**

Run: `TEST_DATABASE_URL=<url del database locale> npm test -w server -- db`
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
 * next request that reuses the same pooled connection.
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

Run: `TEST_DATABASE_URL=<url> npm test -w server -- db && npm test -w server && npm run typecheck -w server`
Expected: PASS con database; senza `TEST_DATABASE_URL` la suite risulta `skipped` e
il resto passa.

- [ ] **Passo 8: commit**

```bash
git add server package-lock.json
git commit -m "Server: transazione nel ruolo scelto (utente, anon, job) e database di prova"
```

---

### Task 6: Percorso della richiesta (implementatore comune)

**File:**
- Crea: `server/src/session.ts`, `server/src/permissions.ts`, `server/src/versions.ts`,
  `server/src/pipeline.ts`, `server/src/router.ts`, `server/test/support/test-contract.ts`,
  `server/test/support/requests.ts`, `server/test/pipeline.test.ts`
- Nota: `requests.ts` usa `createApp` del task 7; in questo task i test chiamano il
  router direttamente con `call` di oRPC tramite `callAs` definito qui sotto.

**Interfacce:**
- Consuma: `Claims`, `channelOf`, `verifyAccessToken`, `KeySource` (task 3); `appError`,
  `mapErrors` (task 4); `withDb`, `Tx` (task 5); `OperationMeta`, `Locale`, `checkContract` (task 2).
- Produce:
  - `interface RequestState { locale?: Locale }`
  - `interface RequestContext { env: Env; origin: string; token: string | undefined; verify(token: string): Promise<Claims>; deployId: string; state: RequestState }`
  - `interface OperationContext extends RequestContext { userId: string; channel: Channel; clientId: string | null; locale: Locale; tx: Tx; version?: string }`
  - `createImplementer<C extends AnyContractRouter>(contract: C)`: implementatore oRPC con
    contesto `RequestContext`, validazione dell'input prima del middleware e middleware
    del percorso
  - `fresh<T>(context: OperationContext, data: T): { unchanged: false; version: string; data: T }`
  - `webOnlyUrl(origin: string, path: string, input: unknown): string`
  - `loadSession(tx): Promise<Locale>` (in `session.ts`), `checkRole(tx, role, input): Promise<void>`
    (in `permissions.ts`), `readVersion(tx, scopes, input, locale, deployId): Promise<string>` (in `versions.ts`)
  - `router` (implementazione di `contract`) in `router.ts`
  - test: `testContract`, `testRouter`, `testHandlerCalls` (contatore delle esecuzioni)

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

- [ ] **Passo 2: test (falliscono)**

`server/test/pipeline.test.ts`:

```ts
import { checkContract, contract } from '@app/contract';
import { call, ORPCError } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../src/auth.ts';
import type { Env } from '../src/env.ts';
import { mapErrors } from '../src/errors.ts';
import type { RequestContext } from '../src/pipeline.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, TEST_ISSUER, TEST_SUPABASE_URL, type TestKeys } from './support/keys.ts';
import { testContract, testHandlerCalls, testRouter } from './support/test-contract.ts';

let keys: TestKeys;
beforeAll(async () => {
	keys = await createTestKeys();
});

function contextFor(token: string | undefined, connectionString = 'postgres://nobody:secret@127.0.0.1:1/none'): RequestContext {
	const env = {
		HYPERDRIVE: { connectionString } as Hyperdrive,
		SUPABASE_URL: TEST_SUPABASE_URL,
		CF_VERSION_METADATA: { id: 'deploy-1', tag: '', timestamp: '' },
		ASSETS: {} as Fetcher,
	} satisfies Env;
	return {
		env,
		origin: 'https://app.test',
		token,
		verify: (t) => verifyAccessToken(t, { issuer: TEST_ISSUER, keys: keys.keys }),
		deployId: 'deploy-1',
		state: {},
	};
}

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
	const options = (context: RequestContext) => ({ context, interceptors: [mapErrors] });

	it('rejects a missing or invalid token with unauthorized', async () => {
		for (const token of [undefined, 'not-a-jwt']) {
			const error = await errorOf(call(router.session.whoami, {}, options(contextFor(token))));
			expect(error.code).toBe('unauthorized');
			expect(error.status).toBe(401);
		}
	});

	it('answers web_only to agents before touching the database', async () => {
		const token = await keys.sign({ sub: userId, client_id: 'agent' });
		const error = await errorOf(call(testRouter.test.removeFamily, { familyId }, options(contextFor(token))));
		expect(error.code).toBe('web_only');
		expect(error.data).toEqual({ url: `https://app.test/family/${familyId}/delete` });
	});

	it('validates the input before anything else', async () => {
		const token = await keys.sign({ sub: userId });
		const error = await errorOf(call(testRouter.test.member, { familyId: 'nope' }, options(contextFor(token))));
		expect(error.code).toBe('invalid');
		expect(error.data).toMatchObject({ issues: [{ path: ['familyId'] }] });
	});

	it('turns an unreachable database into internal without leaking the connection string', async () => {
		const token = await keys.sign({ sub: userId });
		const error = await errorOf(call(router.session.whoami, {}, options(contextFor(token))));
		expect(error.code).toBe('internal');
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
	});
});

describe.skipIf(!hasDatabase)('request path with database', () => {
	let db: TestDatabase;
	const options = (context: RequestContext) => ({ context, interceptors: [mapErrors] });
	const asUser = async (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		contextFor(await keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra }), db.appServerUrl);

	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('answers whoami with the profile language', async () => {
		const user = await db.createUser({ locale: 'en-GB' });
		const result = await call(router.session.whoami, {}, options(await asUser(user)));
		expect(result).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
	});

	it('rejects an ended session or a deleted profile', async () => {
		const ended = await db.createUser();
		await db.endSession(ended.sessionId);
		expect((await errorOf(call(router.session.whoami, {}, options(await asUser(ended))))).code).toBe('unauthorized');
		const deleted = await db.createUser();
		await db.deleteProfile(deleted.userId);
		expect((await errorOf(call(router.session.whoami, {}, options(await asUser(deleted))))).code).toBe('unauthorized');
	});

	it('checks family membership and family administration', async () => {
		const admin = await db.createUser();
		const member = await db.createUser();
		const stranger = await db.createUser();
		const id = await db.createFamily([{ userId: admin.userId, role: 'admin' }, { userId: member.userId, role: 'member' }]);
		await expect(call(testRouter.test.member, { familyId: id }, options(await asUser(member)))).resolves.toEqual({ ok: true });
		await expect(call(testRouter.test.admin, { familyId: id }, options(await asUser(admin)))).resolves.toEqual({ ok: true });
		expect((await errorOf(call(testRouter.test.admin, { familyId: id }, options(await asUser(member))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId: id }, options(await asUser(stranger))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId }, options(await asUser(member))))).code).toBe('forbidden');
	});

	it('checks global roles', async () => {
		const curator = await db.createUser();
		const appAdmin = await db.createUser();
		await db.grantGlobalRole(curator.userId, 'curator');
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
		await db.admin`insert into public.family_members (family_id, user_id, role) values (${a}, ${english.userId}, 'member')`;
		const viewEnglish = await call(testRouter.test.familyView, { familyId: a, knownVersion: viewA.version }, options(await asUser(english)));
		expect(viewEnglish.unchanged).toBe(false);
	});
});
```

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
 * Profile language and session check in one query. No profile (account deleted) or an
 * ended session (logout, expiry, agent disconnected) refuse the still-valid token.
 */
export async function loadSession(tx: Tx): Promise<Locale> {
	const rows = await tx<{ locale: string; active: boolean }[]>`
		select p.locale, app.session_is_active() as active
		from public.profiles p where p.id = auth.uid()`;
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

/**
 * Gives clear errors before the handler; row level security stays the real guarantee.
 * A family that does not exist and one the user is not in look the same: forbidden.
 */
export async function checkRole(tx: Tx, role: Role, input: unknown): Promise<void> {
	switch (role) {
		case 'user':
			return;
		case 'familyMember':
		case 'familyAdmin': {
			const familyId = (input as { familyId: string }).familyId;
			const rows = await tx<{ role: string }[]>`
				select role from public.family_members where family_id = ${familyId} and user_id = auth.uid()`;
			const membership = rows[0]?.role;
			if (!membership || (role === 'familyAdmin' && membership !== 'admin')) throw appError('forbidden');
			return;
		}
		case 'curator':
		case 'appAdmin': {
			const globalRole = role === 'curator' ? 'curator' : 'app_admin';
			const rows = await tx`select 1 from public.user_global_roles where user_id = auth.uid() and role = ${globalRole}`;
			if (rows.length === 0) throw appError('forbidden');
			return;
		}
	}
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
		const rows = await tx<{ version: string }[]>`select data_version::text as version from public.families where id = ${familyId}`;
		if (!rows[0]) throw appError('forbidden');
		parts.push(`f${familyId}:${rows[0].version}`);
	}
	if (scopes.includes('catalogue')) {
		const rows = await tx<{ version: string }[]>`select version::text as version from public.catalogue_state`;
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
 * before all middleware), then: token, web-only check, transaction as the user,
 * profile and session, role, version; the handler runs inside the transaction.
 */
export function createImplementer<C extends AnyContractRouter>(contract: C) {
	return implement(contract)
		.$config({ initialInputValidationIndex: Number.NEGATIVE_INFINITY })
		.$context<RequestContext>()
		.use(async ({ context, procedure, next }, input) => {
			const meta = procedure['~orpc'].meta as OperationMeta;
			const claims = await authenticate(context);
			const channel = channelOf(claims);
			if (meta.webOnly && channel === 'mcp') {
				throw appError('web_only', { url: webOnlyUrl(context.origin, meta.webOnly.path, input) });
			}
			return withDb(context.env.HYPERDRIVE.connectionString, { kind: 'user', claims }, async (tx) => {
				const locale = await loadSession(tx);
				context.state.locale = locale;
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
  (`server/node_modules/@orpc/server/dist/shared/*.d.mts`, `MiddlewareOptions`).
  Non cambiare il comportamento per far tornare i tipi.

- [ ] **Passo 5: verifica che passino**

Run: `npm test -w server -- pipeline` (senza database: passano la parte senza database e
la prova delle convenzioni) e poi `TEST_DATABASE_URL=<url> npm test -w server -- pipeline`
Expected: PASS in entrambi i casi.

- [ ] **Passo 6: typecheck e commit**

Run: `npm run typecheck -w server`

```bash
git add server
git commit -m "Server: percorso della richiesta con token, web_only, sessione, ruoli e versioni"
```

---

### Task 7: Worker: rotte, OpenAPI, RPC, REST, MCP e asset

**File:**
- Crea: `server/src/mcp.ts`, `server/src/well-known.ts`, `server/src/app.ts`,
  `server/test/support/requests.ts`, `server/test/app.test.ts`
- Modifica: `server/src/index.ts`; elimina `server/src/index.test.ts`; `server/package.json`
  (dipendenza `@modelcontextprotocol/server`)

**Interfacce:**
- Consuma: `router`, `createImplementer`, `RequestContext` (task 6); `remoteKeySource`,
  `verifyAccessToken`, `bearerToken`, `KeySource`, `Claims` (task 3); `mapErrors`,
  `toolErrorBody` (task 4).
- Produce:
  - `collectTools(contract: AnyContractRouter): ToolSpec[]`, `buildMcpServer(router, tools, context): McpServer`
  - `createApp(options: { contract: AnyContractRouter; router: AnyRouter; keys?: (env: Env) => KeySource; resourceName: string }): { fetch(request: Request, env: Env): Promise<Response> }`
  - test: `testEnv(connectionString?)`, `rpcClient<T>(app, env, token?)`, `rest(app, env, method, path, token?, body?)`,
    `mcp(app, env, token, method, params?)`

- [ ] **Passo 1: dipendenza**

Run: `npm install -w server @modelcontextprotocol/server@2.3.1`

- [ ] **Passo 2: aiuti per le richieste di prova**

`server/test/support/requests.ts`:

```ts
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { Env } from '../../src/env.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

export interface TestApp {
	fetch(request: Request, env: Env): Promise<Response>;
}

export function testEnv(connectionString = 'postgres://nobody:secret@127.0.0.1:1/none'): Env {
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
```

Se `RPCLink` di oRPC 1.15.5 passa a `fetch` argomenti diversi da `(request, init)`,
adegua la funzione leggendo il tipo in `node_modules/@orpc/client/dist/adapters/fetch/*.d.mts`.

- [ ] **Passo 3: test (falliscono)**

`server/test/app.test.ts`:

```ts
import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { ORPCError } from '@orpc/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { collectTools } from '../src/mcp.ts';
import { router } from '../src/router.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv } from './support/requests.ts';
import { testContract, testRouter } from './support/test-contract.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const familyId = '22222222-2222-4222-8222-222222222222';
let keys: TestKeys;
let app: ReturnType<typeof createApp>;
let testApp: ReturnType<typeof createApp>;

beforeAll(async () => {
	keys = await createTestKeys();
	app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'Cosa si mangia (test)' });
	testApp = createApp({ contract: testContract, router: testRouter, keys: () => keys.keys, resourceName: 'test' });
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

describe('authentication on every channel', () => {
	it('RPC: unauthorized without token or with a malformed header', async () => {
		const client = rpcClient<ContractRouterClient<Contract>>(app, testEnv());
		await expect(client.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
		const response = await app.fetch(
			new Request('https://app.test/api/rpc/session/whoami', { method: 'POST', headers: { authorization: 'bearer x' } }),
			testEnv(),
		);
		expect(response.status).toBe(401);
	});

	it('REST: unauthorized with the error code', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/session/whoami', 'not-a-jwt');
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'unauthorized' });
	});

	it('MCP: 401 with the protected resource metadata link', async () => {
		const result = await mcp(app, testEnv(), undefined, 'tools/list');
		expect(result.status).toBe(401);
		expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
	});
});

describe('MCP tools', () => {
	it('has exactly one tool per exposed operation', async () => {
		const token = await keys.sign({ sub: userId, client_id: 'agent' });
		const result = await mcp(testApp, testEnv(), token, 'tools/list');
		const names = result.body.result.tools.map((tool: { name: string }) => tool.name).sort();
		expect(names).toEqual(collectTools(testContract).map((tool) => tool.name).sort());
		expect(names).toContain('test_removeFamily');
	});

	it('answers web_only with the URL and a localised message, without the database', async () => {
		const token = await keys.sign({ sub: userId, client_id: 'agent' });
		const result = await mcp(testApp, testEnv(), token, 'tools/call', { name: 'test_removeFamily', arguments: { familyId } });
		expect(result.body.result.isError).toBe(true);
		const body = JSON.parse(result.body.result.content[0].text);
		expect(body).toMatchObject({ code: 'web_only', data: { url: `https://app.test/family/${familyId}/delete` } });
		expect(body.message.length).toBeGreaterThan(0);
	});

	it('answers web_only on RPC too when the token belongs to an agent', async () => {
		const token = await keys.sign({ sub: userId, client_id: 'agent' });
		const client = rpcClient<ContractRouterClient<typeof testContract>>(testApp, testEnv(), token);
		const error = await client.test.removeFamily({ familyId }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ORPCError);
		expect(error).toMatchObject({ code: 'web_only', data: { url: `https://app.test/family/${familyId}/delete` } });
	});
});

describe('OAuth metadata', () => {
	it('serves the protected resource metadata for /mcp', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => Response.json({ issuer: 'https://test.supabase.local/auth/v1', authorization_endpoint: 'https://test.supabase.local/auth/v1/oauth/authorize', token_endpoint: 'https://test.supabase.local/auth/v1/oauth/token', response_types_supported: ['code'] })) as typeof fetch;
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

- [ ] **Passo 4: verifica che falliscano**

Run: `npm test -w server -- app`
Expected: FAIL, `../src/app.ts` inesistente.

- [ ] **Passo 5: implementazione**

`server/src/mcp.ts` (dalla prova, generico sul contratto):

```ts
import type { OperationMeta } from '@app/contract';
import { McpServer } from '@modelcontextprotocol/server';
import { createRouterClient, traverseContractProcedures, type AnyContractRouter, type AnyRouter } from '@orpc/server';
import type { z } from 'zod';
import { mapErrors, toolErrorBody } from './errors.ts';
import type { RequestContext } from './pipeline.ts';

export interface ToolSpec {
	name: string;
	path: readonly string[];
	description: string;
	inputSchema: z.ZodObject;
	readOnly: boolean;
}

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
			inputSchema: def.inputSchema as z.ZodObject,
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
			{ description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: tool.readOnly } },
			async (input: unknown) => {
				try {
					const result = await call(input);
					return { content: [{ type: 'text', text: JSON.stringify(result) }] };
				} catch (error) {
					// Same codes as the web app, plus the text in the user's language.
					const body = toolErrorBody(error, context.state.locale ?? 'it-IT');
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
import type { AnyContractRouter, AnyRouter } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { bearerToken, remoteKeySource, verifyAccessToken, type KeySource } from './auth.ts';
import type { Env } from './env.ts';
import { mapErrors } from './errors.ts';
import { buildMcpServer, collectTools } from './mcp.ts';
import type { RequestContext } from './pipeline.ts';
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
			origin: new URL(request.url).origin,
			token,
			verify: (t) => verifyAccessToken(t, { issuer, keys: keysFor(env) }),
			deployId: env.CF_VERSION_METADATA?.id ?? 'dev',
			state: {},
		};
	}

	async function serveMcp(request: Request, env: Env, mcpUrl: URL): Promise<Response> {
		const gate = requireBearerAuth({
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
			verifier: {
				async verifyAccessToken(token): Promise<AuthInfo> {
					const context = contextFor(request, env, token);
					let claims;
					try {
						claims = await context.verify(token);
					} catch (error) {
						throw new OAuthError(OAuthErrorCode.InvalidToken, String(error));
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
- Se il trasporto senza stato dell'SDK MCP rifiuta `tools/list` senza `initialize`,
  aggiungi a `mcp()` una prima chiamata `initialize` con
  `{ protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }`
  e conserva l'eventuale `mcp-session-id`: non cambiare il server.

- [ ] **Passo 6: verifica che passino**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS (suite con il database `skipped` senza `TEST_DATABASE_URL`).

- [ ] **Passo 7: commit**

```bash
git add server package-lock.json
git commit -m "Server: Worker con RPC, REST, OpenAPI, MCP generato dal contratto e asset della SPA"
```

---

### Task 8: `session.whoami` end-to-end sui tre canali

**File:**
- Crea: `server/test/whoami.test.ts`

**Interfacce:**
- Consuma: `createApp` (task 7), `setupDatabase` (task 5), `createTestKeys` (task 3),
  aiuti di `requests.ts` (task 7).

- [ ] **Passo 1: test**

`server/test/whoami.test.ts`:

```ts
import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { messages } from '../src/messages.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv } from './support/requests.ts';

describe.skipIf(!hasDatabase)('session.whoami end to end', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	});
	afterAll(() => db?.close());

	it('answers on RPC as the web app', async () => {
		const user = await db.createUser();
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId });
		const client = rpcClient<ContractRouterClient<Contract>>(app, testEnv(db.appServerUrl), token);
		await expect(client.session.whoami({})).resolves.toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'it-IT' });
	});

	it('answers on REST', async () => {
		const user = await db.createUser({ locale: 'en-GB' });
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId });
		const response = await rest(app, testEnv(db.appServerUrl), 'GET', '/api/session/whoami', token);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
	});

	it('answers on MCP as an agent', async () => {
		const user = await db.createUser();
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
		const result = await mcp(app, testEnv(db.appServerUrl), token, 'tools/call', { name: 'session_whoami', arguments: {} });
		expect(JSON.parse(result.body.result.content[0].text)).toEqual({ userId: user.userId, channel: 'mcp', clientId: 'codex', locale: 'it-IT' });
	});

	it('refuses a disconnected agent on MCP with the message in the user language', async () => {
		const user = await db.createUser({ locale: 'en-GB' });
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
		await db.endSession(user.sessionId);
		const result = await mcp(app, testEnv(db.appServerUrl), token, 'tools/call', { name: 'session_whoami', arguments: {} });
		expect(result.body.result.isError).toBe(true);
		// The session check fails before the language is known: the Italian default is used.
		expect(JSON.parse(result.body.result.content[0].text)).toEqual({ code: 'unauthorized', message: messages.unauthorized['it-IT'] });
	});
});
```

Nota sull'ultimo test: la query unica di `loadSession` legge lingua e sessione insieme;
con la sessione chiusa la lingua non viene impostata e il messaggio è in italiano. È il
comportamento voluto: un token non più valido non deve leggere il profilo.

- [ ] **Passo 2: esegui**

Run: `TEST_DATABASE_URL=<url> npm test -w server -- whoami`
Expected: PASS. Se fallisce, correggi il codice dei task 5-7, non il test, salvo errori
evidenti di forma della risposta MCP (vedi note del task 7).

- [ ] **Passo 3: commit**

```bash
git add server/test/whoami.test.ts
git commit -m "Server: session.whoami provato su RPC, REST e MCP"
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
# (local database set up by the schema task, see supabase/).
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

1. Avvia il database locale (vedi `supabase/`).
2. Copia `.env.example` in `.env` e compila la connessione come `app_server` e l'URL
   dell'Auth locale.
3. `npm run build -w web`, poi `npm run dev -w server` (porta 8787).
4. Prova: `curl -H "Authorization: Bearer <token>" http://localhost:8787/api/session/whoami`.

In locale Hyperdrive non fa da pool: le prove di concorrenza si fanno sul Worker pubblicato.

## Test

`npm test -w server`. I test con il database richiedono `TEST_DATABASE_URL`
(superutente del database locale); senza, sono saltati.

## Pubblicazione

Per ora a mano, dopo il merge su `main` e dopo che l'integrazione di Supabase ha
applicato le migrazioni: dalla radice, `npm run deploy` (build di `web`, poi
`wrangler deploy`). Le migrazioni sono additive, quindi il Worker precedente regge
fino alla pubblicazione.

## Risorse di produzione

(compilata nel task 10: Worker, Hyperdrive con limite di connessioni, chiavi di firma,
integrazione GitHub di Supabase)
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

### Task 10: Integrazione di Supabase e risorse di produzione

Ogni passo che crea o cambia una risorsa esterna inizia con `STATO: DOMANDA` e aspetta
la risposta del coordinatore.

**File:**
- Modifica: `server/wrangler.jsonc` (id di Hyperdrive), `server/README.md` (sezione
  «Risorse di produzione»), `progetto/superpowers/specs/2026-10-11-piattaforma.md`
  (esito nelle decisioni da riportare)

- [ ] **Passo 1: verifiche in sola lettura**

Run:

```bash
curl -s https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json
~/.local/bin/supabase projects list
~/.local/bin/supabase --version
```

Expected: il JWKS contiene almeno una chiave `EC` o `RSA` (chiavi asimmetriche attive);
il progetto compare nell'elenco (se la CLI non è autenticata, annotalo e non fare login
da solo). Consulta con Context7 la documentazione dell'integrazione GitHub di Supabase
(cartella, branch di produzione, «Deploy to production», cosa succede alle migrazioni
già applicate).

- [ ] **Passo 2: verifica della dashboard (domanda)**

Scrivi `STATO: DOMANDA` chiedendo al coordinatore di far controllare all'utente in
Supabase > Project Settings > Integrations > GitHub: cartella `supabase`, branch di
produzione `main`, «Deploy to production» attivo, branch di anteprima disattivati; e in
Database > Connection pooling la dimensione del pool del Session pooler. Registra le
risposte.

- [ ] **Passo 3: utente `app_server` nel pooler (domanda)**

Il ruolo `app_server` lo crea la migrazione di W2; la password non sta nel repository.
Chiedi al coordinatore chi la imposta (l'utente dalla dashboard o dal SQL editor) e come
arriva nella configurazione di Hyperdrive senza passare dalla conversazione (per esempio
l'utente lancia lui il comando del passo 4). Nel Session pooler l'utente si scrive
`app_server.<project_ref>`.

- [ ] **Passo 4: Hyperdrive di produzione (domanda)**

Proponi il comando, da far lanciare all'utente o al coordinatore:

```bash
npx wrangler hyperdrive create cosasimangia \
  --connection-string="postgres://app_server.lronuqvtjdhfyychnscr:<password>@<host del Session pooler>:5432/postgres" \
  --caching-disabled \
  --origin-connection-limit=<pool del passo 2 meno almeno 5>
```

Verifica prima con Context7 (Wrangler, Hyperdrive) il nome esatto delle opzioni
`--caching-disabled` e `--origin-connection-limit` e il valore minimo ammesso. Con l'id
restituito aggiorna `server/wrangler.jsonc`.

- [ ] **Passo 5: prima pubblicazione (domanda)**

Chiedi il via per `npm run deploy` sull'account POWA (o che la lanci il coordinatore).
Dopo la pubblicazione, verifica:

```bash
curl -s https://cosasimangia.<sottodominio>.workers.dev/api/openapi.json | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' https://cosasimangia.<sottodominio>.workers.dev/api/session/whoami
curl -s https://cosasimangia.<sottodominio>.workers.dev/.well-known/oauth-protected-resource/mcp
```

Expected: OpenAPI servito, `401` senza token, metadati con `resource` che termina in
`/mcp`. Con un utente creato a mano da W2 e un token ottenuto dall'Auth (come
`spike/server/token.sh`), `session.whoami` risponde `200`; da Claude Code
(`claude mcp add --transport http cosasimangia https://…/mcp`, poi `/mcp` >
Authenticate) lo strumento `session_whoami` risponde con `channel: "mcp"`. Il Site URL
del server OAuth di Supabase punta ancora al Worker della prova: se serve cambiarlo per
il collegamento MCP è una domanda al coordinatore, non una modifica autonoma.

- [ ] **Passo 6: registra l'esito e fai commit**

Compila «Risorse di produzione» in `server/README.md` (nomi delle risorse, limite di
connessioni scelto e perché, stato dell'integrazione GitHub, procedura di
pubblicazione) e aggiungi l'esito della verifica alla riga «Flusso Git» delle decisioni
da riportare della spec di dettaglio.

```bash
git add server/wrangler.jsonc server/README.md progetto/superpowers/specs/2026-10-11-piattaforma.md
git commit -m "Piattaforma: risorse di produzione e integrazione GitHub di Supabase verificate"
```

---

### Task 11: Verifica finale e PR

- [ ] **Passo 1: verifica completa** (skill `superpowers:verification-before-completion`)

Run:

```bash
npm ci
npm run typecheck
npm test
TEST_DATABASE_URL=<url> npm test -w server
npm run build -w web && npx wrangler deploy --dry-run --outdir /tmp/cosasimangia-dry -c server/wrangler.jsonc
```

Expected: tutto PASS; nessun test con il database saltato nell'esecuzione con
`TEST_DATABASE_URL`. Se lo schema di W2 è già su `main`, unisci `origin/main`, togli
`server/test/support/schema.sql` e il ramo che lo applica in `setupDatabase`, e
riesegui.

- [ ] **Passo 2: CI con il database**

Se W2 ha stabilito come avviare il database locale su GitHub Actions, aggiungi a
`.github/workflows/ci.yml` il job che lo avvia e imposta `TEST_DATABASE_URL`; altrimenti
annota nella PR che i test con il database sono saltati in CI e la riga resta da fare
insieme a W2.

- [ ] **Passo 3: push e PR**

```bash
git push -u origin fondamenta/piattaforma
gh pr create --base main --title "Piattaforma: Worker, contratto e percorso della richiesta" --body "<in italiano: cosa fa; come è stato verificato (comandi ed esiti, prove locali e su workers.dev); sezioni della specifica realizzate (1, 9, 13, 15); interfacce con W2 e W5; riga di attribuzione finale>"
```

Scrivi `STATO: PR_APERTA <url>` e fermati.
