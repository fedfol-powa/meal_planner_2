# Messa in produzione: piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** strumenti e procedura per portare il traguardo A in produzione: script di
caricamento del ricettario e dei dati della famiglia, rilascio in due tempi, SQL sulla
produzione con anteprima legata al file, impronta dei dati con rimozione della famiglia e
azzeramento prima dell'uso, documenti; poi il runbook delle fasi 1–3 e della chiusura.

**Architecture:** parte A (implementazione, TDD, una PR): modulo del bersaglio con TLS
verificato (riusa `destinationOf` di W5); moduli puri in `scripts/import/load/` per
decidere cosa scrivere; un modulo che scrive in una sola transazione sotto il lock
della generazione, riusando `server/src/catalogue/write.ts` e le scritture delle
impostazioni; un comando con anteprima a rollback legata all'impronta degli input;
`scripts/release.ts` (controlli e build prima di ogni scrittura, migrazioni con
`--db-url` verificata) e `scripts/prod-sql.sh` con i file SQL di servizio. Le prove
distruttive girano in CI su uno stack isolato, dopo la prova di ripristino di W5. Parte
B (runbook): passi in produzione eseguiti solo dopo l'approvazione dell'utente, passo
per passo, con anteprima e «vai».

**Tech Stack:** Node 26 con TypeScript eseguito direttamente (solo sintassi
cancellabile, `erasableSyntaxOnly`), Postgres.js (già nel server), `yaml` (già nella
radice), Vitest; CLI di Supabase, Wrangler, `gh`, Podman (Docker in CI). Nessuna
dipendenza nuova.

**Spec:** `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md` (leggila prima
di ogni task), subordinata alla specifica principale.

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano.
- Nessuna dipendenza nuova.
- Nessun comando della parte A tocca il progetto `lronuqvtjdhfyychnscr` o l'account
  Cloudflare: i test usano lo stack locale (`TEST_DATABASE_URL`) e processi finti.
- Non modificare file di altre aree: `server/src/**`, `server/test/**`,
  `supabase/migrations/**`, `supabase/scripts/bootstrap.sql`, `scripts/import/*.ts` e
  `scripts/backup/*.ts` esistenti si importano soltanto. File condivisi toccati con
  modifiche minime: `tsconfig.json`, `vitest.config.ts`, `package.json` (script
  `release`), `.gitignore`, `.github/workflows/ci.yml` (un passo finale).
- Solo sintassi TypeScript cancellabile: niente parameter properties, `enum`,
  `namespace`. Ogni comando nuovo ha un test che lo lancia con `node` vero.
- Gli script non stampano mai stringhe di connessione né password, nemmeno negli errori:
  solo ruolo, host, porta e database. Gli errori di Postgres si stampano come nome e
  codice (come `describeError` di `scripts/backup/restore.ts`), mai messaggio o
  dettaglio; l'output dei comandi figli passa da `redact`.
- Progetto di destinazione solo da `scripts/production-target.json`.
- Canale delle scritture del catalogo: `import`. Slug del bundle e `origin_slug`
  conservati; nessun valore del catalogo già presente sovrascritto.
- Dati della famiglia scritti solo in aggiunta (`on conflict do nothing`, settimana
  esistente saltata, chiave delle impostazioni già salvata non toccata).

## Review Focus

- **Destinazione delle migrazioni:** ogni chiamata a `supabase` ha `--db-url` con la
  URL verificata, nessuna `--linked`; con progetto collegato diverso nessun comando
  `supabase` parte (Task 7).
- **TLS:** le opzioni passate a Postgres.js per una URL remota hanno
  `ssl.rejectUnauthorized: true` e la CA letta; una URL con `sslmode=require` o `ssl=`
  è rifiutata (Task 1).
- **Concorrenza:** caricamento contro generazione e contro scrittura delle impostazioni,
  con due connessioni (Task 4).
- **Impronta:** rimozione e azzeramento rifiutati dopo ognuna delle scritture del
  rilievo 3 e dopo una scrittura concorrente (Task 8).
- **Anteprima legata:** input o file SQL cambiati fra anteprima e applicazione →
  rifiuto senza collegarsi (Task 5, Task 8).
- **Build prima delle scritture:** un errore di build o di chiave nell'`--apply` non
  produce nessun `db push` né `deploy` (Task 7).

## Rilievi della review e dove sono risolti

| # | Rilievo | Spec | Piano |
|---|---|---|---|
| 1 | Destinazione delle migrazioni | 2, 7 (punti 2 e 5) | Task 7 (`--db-url`, progetto collegato, test senza comandi `supabase`) |
| 2 | TLS del caricamento | 2 | Task 1 (`destinationOf`, opzioni del client), Task 5 |
| 3 | Azzeramento dopo l'uso | 8 (impronta, lock) | Task 8 (otto scritture, scrittura concorrente) |
| 4 | Bucket prima del primo rilascio | 3, 4 | Task 7 (prerequisiti), R7, R9, R10 |
| 5 | Parameter property | 6 | Task 3 (`DryRun`), test con `node` vero nei Task 5 e 7 |
| 6 | Equivalenze sovrascritte | 6 | Task 3 (chiave logica, test di rilancio) |
| 7 | Concorrenza con la generazione | 5, 6 | Task 3 (lock), Task 4 (due connessioni), R20 |
| 8 | Test contraddittori, CI | — | Task 3–4 (fixture per caso), Task 8 (CI) |
| 9 | Configurazione effettiva della build | 7 (punto 4) | Task 7 |
| 10 | Token del controllo del database | 7 | Task 7 (`CHECK_TOKEN`) |
| 11 | Prova del `.gitignore` | 2 | Task 6 (`--no-index`) |
| 12 | Ritorno indietro incompleto | 8 | R9, R13, «Cambio di progetto» |
| 13 | Collaudo del cron e checklist | 5 | Task 8 (`check-first-generation.sql`), R22 |
| 14 | Anteprima non legata | 1, 6 | Task 2, Task 5, Task 8 (`--confirm`) |
| 15 | Report incompleto | 6 | Task 5 |
| 16 | Istruzioni non copiabili | 5, 8 | R4–R26, `prod-sql.sh` |
| Decisioni 1–3 | Preferenze, doppi, finestra | 5, 6 | Task 2, Task 4, R19–R20 |

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `scripts/production-target.json` | `supabaseRef` del progetto di produzione (un solo punto) |
| `scripts/import/load/target.ts` | Ref atteso, controllo del bersaglio, destinazione con TLS, opzioni del client |
| `scripts/import/load/settings-plan.ts` | Chiavi delle impostazioni da scrivere: curatore vs default vs salvate |
| `scripts/import/load/menus.ts` | Lettura dei `menu/<lunedì>/menu.yaml` dell'origine |
| `scripts/import/load/weeks-plan.ts` | Settimane da scrivere: storico (R4), menu in corso, porzioni, doppi |
| `scripts/import/load/preferences.ts` | Preferenze condizionali trovate nelle note dell'origine |
| `scripts/import/load/inputs-fingerprint.ts` | Impronta degli input del caricamento |
| `scripts/import/load/catalogue.ts` | Scritture del catalogo (libri, ingredienti, equivalenze, ricette) |
| `scripts/import/load/family.ts` | Scritture della famiglia (impostazioni, limiti, libri, voti, provate, settimane) |
| `scripts/import/load/run.ts` | Transazione unica: ruoli, lock, rifiuti, anteprima a rollback, impronta dei dati |
| `scripts/import/load/report.ts` | Report Markdown (con il report dell'import) e riepilogo |
| `scripts/import/load/test-origin.ts` | Fixture d'origine per i test, con prefisso unico per caso |
| `scripts/import/load.ts` | Comando: argomenti, credenziali, connessione, `--check-connection`, errori senza dati |
| `scripts/release.ts` | `npm run release -- --preview` / `--apply <sha>` |
| `scripts/release.config.json` | `productionUrl`, `requiredSecrets` |
| `scripts/prod-sql.sh`, `scripts/prod-sql-target.ts` | SQL sulla produzione con anteprima legata al file |
| `supabase/scripts/app-fingerprint.sql` | `pg_temp.app_fingerprint()` |
| `supabase/scripts/show-fingerprint.sql` | Stampa l'impronta |
| `supabase/scripts/remove-family.sql` | Rimozione della famiglia inutilizzata |
| `supabase/scripts/reset-app-data.sql` | Azzeramento prima dell'uso |
| `supabase/scripts/check-first-generation.sql` | Controllo della prima generazione del cron |
| `scripts/destructive/*.test.ts`, `vitest.destructive.config.ts` | Prove distruttive, ultime in CI |

Test unitari accanto ai moduli; `scripts/import/load/load.db.test.ts` (integrazione,
saltato senza `TEST_DATABASE_URL`, obbligatorio in CI come i test del server).

---

# Parte A: implementazione

### Task 1: Base dei test, progetto di destinazione e bersaglio con TLS

**Files:**
- Modify: `tsconfig.json` (tipi dei Workers: i moduli del server importati dichiarano
  `Env` con `Hyperdrive`), `vitest.config.ts`
- Create: `scripts/production-target.json`, `scripts/import/load/target.ts`,
  `scripts/import/load/target.test.ts`

**Interfaces:**
- Consumes: `destinationOf`, `Destination` da `scripts/backup/cli.ts`.
- Produces:
  ```ts
  export type Role = 'postgres' | 'app_server';
  export type Target = 'production' | 'local';
  export interface Endpoint { user: string; host: string; port: string; database: string }
  export class TargetError extends Error {}
  export function productionRef(root: string): string;
  /** Throws TargetError naming only the variable and the endpoint: never the password. */
  export function checkTarget(variable: string, url: string | undefined, options: { role: Role; target: Target; ref: string; readCa?: (path: string) => string }): { endpoint: Endpoint; destination: Destination };
  export const describeEndpoint: (e: Endpoint) => string; // "app_server.<ref>@<host>:5432/postgres"
  export function clientOptions(destination: Destination): postgres.Options<{}>;
  export function connect(destination: Destination, factory?: typeof postgres): postgres.Sql;
  ```

- [ ] **Step 1: tipi e configurazione dei test**

`tsconfig.json`: `"types": ["node", "@cloudflare/workers-types"]` (senza, `server/src/env.ts`
non compila dalla radice). `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Workspaces run their own tests; scripts/destructive runs last with vitest.destructive.config.ts.
export default defineConfig({
	test: {
		include: ['scripts/**/*.test.ts'],
		exclude: ['scripts/destructive/**', 'node_modules/**'],
		passWithNoTests: true,
		// Same database preparation as the server: app_server password, schema present.
		globalSetup: ['server/test/global-setup.ts'],
		// The load tests share the catalogue with the server suites: one file at a time.
		fileParallelism: false,
	},
});
```

`scripts/production-target.json`: `{ "supabaseRef": "lronuqvtjdhfyychnscr" }`.

Run: `npm run typecheck && npx vitest run` → PASS (test esistenti verdi).

- [ ] **Step 2: test che falliscono** (`target.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { checkTarget, clientOptions, connect, describeEndpoint, productionRef } from './target.ts';

const ref = 'lronuqvtjdhfyychnscr';
const tls = 'sslmode=verify-full&sslrootcert=/ca.crt';
const prod = (user = `app_server.${ref}`, query = tls, rest = 'aws-0-eu-central-1.pooler.supabase.com:5432/postgres') =>
	`postgresql://${user}:s3cr%40t!@${rest}?${query}`;
const opts = { role: 'app_server' as const, target: 'production' as const, ref, readCa: () => 'CA' };
const fails = (url: string | undefined, o = opts) => {
	try { checkTarget('V', url, o); } catch (e) { expect(String(e)).not.toContain('s3cr'); return String(e); }
	throw new Error('accepted');
};

describe('checkTarget', () => {
	it('reads the ref from the versioned file', () => {
		expect(productionRef(process.cwd())).toBe(ref);
	});
	it('accepts the session pooler with the expected role, ref, port, database and verified TLS', () => {
		const { endpoint, destination } = checkTarget('V', prod(), opts);
		expect(describeEndpoint(endpoint)).toBe(`app_server.${ref}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`);
		expect(destination.ssl).toEqual({ rejectUnauthorized: true, ca: 'CA' });
		expect(destination.url).not.toContain('sslmode');
	});
	it('refuses a missing or unparsable variable without echoing it', () => {
		expect(fails(undefined)).toContain('V is not set');
		expect(fails('not a url s3cr')).toContain('V is not a valid connection string');
	});
	it('refuses another project, another role, another host, port or database', () => {
		expect(fails(prod(`app_server.abcdefghijklmnopqrst`))).toMatch(/not app_server\.lronuqvtjdhfyychnscr/);
		expect(fails(prod(`postgres.${ref}`))).toMatch(/not app_server/);
		expect(fails(prod(undefined, tls, 'db.lronuqvtjdhfyychnscr.supabase.co:5432/postgres'))).toMatch(/pooler/);
		expect(fails(prod(undefined, tls, 'aws-0-eu-central-1.pooler.supabase.com:6543/postgres'))).toMatch(/port/);
		expect(fails(prod(undefined, tls, 'aws-0-eu-central-1.pooler.supabase.com:5432/other'))).toMatch(/database/);
	});
	it('refuses a remote url without verified TLS or with parameters that contradict the check', () => {
		expect(fails(prod(undefined, ''))).toMatch(/tls_required/);
		expect(fails(prod(undefined, 'sslmode=require'))).toMatch(/tls_required/);
		expect(fails(prod(undefined, `${tls}&ssl=false`))).toMatch(/parameter/);
		expect(fails(prod(undefined, `${tls}&options=-c%20role%3Dpostgres`))).toMatch(/parameter/);
		expect(fails(prod(undefined, `${tls}&sslmode=disable`))).toMatch(/parameter/);
	});
	it('accepts only local hosts without TLS parameters with --local', () => {
		const local = { ...opts, target: 'local' as const };
		expect(checkTarget('V', 'postgresql://app_server:x@localhost:54322/postgres', local).destination.ssl).toBe(false);
		expect(fails(prod(), local)).toMatch(/not local/);
		expect(fails('postgresql://app_server:x@127.0.0.1:54322/postgres?sslmode=disable', local)).toMatch(/parameter/);
	});
});

describe('client options', () => {
	it('passes the verified TLS options to Postgres.js, and none for the local stack', () => {
		const remote = checkTarget('V', prod(), opts).destination;
		expect(clientOptions(remote)).toMatchObject({ max: 1, ssl: { rejectUnauthorized: true, ca: 'CA' } });
		let seen: unknown[] = [];
		connect(remote, ((...args: unknown[]) => { seen = args; return {} as never; }) as never);
		expect(seen[0]).toBe(remote.url);
		expect(seen[1]).toMatchObject({ ssl: { rejectUnauthorized: true, ca: 'CA' } });
	});
});
```

- [ ] **Step 3: verifica che falliscano** — Run: `npx vitest run scripts/import/load/target.test.ts` → FAIL (modulo assente).

- [ ] **Step 4: implementazione**

```ts
// Which database a connection string points to, checked before connecting (detail spec, section 2).
// Errors name the variable and the endpoint only: a password never reaches the console.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { destinationOf, DestinationError, type Destination } from '../../backup/cli.ts';

export type Role = 'postgres' | 'app_server';
export type Target = 'production' | 'local';
export interface Endpoint { user: string; host: string; port: string; database: string }
export class TargetError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'TargetError';
	}
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const TLS_PARAMETERS = new Set(['sslmode', 'sslrootcert']);

export const productionRef = (root: string): string =>
	(JSON.parse(readFileSync(resolve(root, 'scripts/production-target.json'), 'utf8')) as { supabaseRef: string }).supabaseRef;

export const describeEndpoint = (e: Endpoint) => `${e.user}@${e.host}:${e.port}/${e.database}`;

export function checkTarget(
	variable: string,
	url: string | undefined,
	options: { role: Role; target: Target; ref: string; readCa?: (path: string) => string },
): { endpoint: Endpoint; destination: Destination } {
	if (!url) throw new TargetError(`${variable} is not set`);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new TargetError(`${variable} is not a valid connection string`);
	}
	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new TargetError(`${variable} is not a postgres connection string`);
	const endpoint: Endpoint = { user: decodeURIComponent(parsed.username), host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.slice(1) };
	const where = `${variable} (${describeEndpoint(endpoint)})`;
	const keys = [...parsed.searchParams.keys()];
	if (options.target === 'local') {
		if (!LOCAL_HOSTS.has(endpoint.host)) throw new TargetError(`${where} is not local`);
		if (keys.length > 0) throw new TargetError(`${where}: no parameter is allowed with --local`);
		if (endpoint.user !== options.role) throw new TargetError(`${where}: the user is not ${options.role}`);
	} else {
		const expected = `${options.role}.${options.ref}`;
		if (endpoint.user !== expected) throw new TargetError(`${where}: the user is not ${expected}`);
		if (!endpoint.host.endsWith('.pooler.supabase.com') || endpoint.host.includes(',')) throw new TargetError(`${where}: not the Supabase session pooler`);
		if (endpoint.port !== '5432') throw new TargetError(`${where}: the session pooler port is 5432`);
		if (endpoint.database !== 'postgres') throw new TargetError(`${where}: the database is postgres`);
		if (keys.some((k) => !TLS_PARAMETERS.has(k)) || keys.length !== new Set(keys).size) throw new TargetError(`${where}: unexpected parameter`);
	}
	try {
		return { endpoint, destination: destinationOf(url, options.readCa) };
	} catch (error) {
		// destinationOf's message is a reason code (tls_required, sslrootcert…), never the URL.
		if (error instanceof DestinationError) throw new TargetError(`${where}: ${error.message}`);
		throw new TargetError(`${where}: invalid destination`);
	}
}

export const clientOptions = (destination: Destination) =>
	({ max: 1, ssl: destination.ssl, fetch_types: false, connect_timeout: 10, onnotice: () => {} }) as const;

export const connect = (destination: Destination, factory: typeof postgres = postgres) => factory(destination.url, clientOptions(destination));
```

Nota: `destinationOf` accetta in locale anche `[::1]`; qui l'elenco locale è più
stretto ed è controllato prima. `readCa` assente usa la lettura del file di W5.

- [ ] **Step 5: verifica** — Run: `npx vitest run scripts/import/load/target.test.ts && npm run typecheck` → PASS.

- [ ] **Step 6: commit**

```bash
git add tsconfig.json vitest.config.ts scripts/production-target.json scripts/import/load/target.ts scripts/import/load/target.test.ts
git commit -m "Messa in produzione: progetto di destinazione, bersaglio delle connessioni con TLS verificato"
```

### Task 2: Piani puri: impostazioni, settimane, preferenze, impronta degli input

**Files:**
- Create: `scripts/import/load/settings-plan.ts`, `menus.ts`, `weeks-plan.ts`,
  `preferences.ts`, `inputs-fingerprint.ts`, ciascuno con `*.test.ts`

**Interfaces:**
- Consumes: `PlannerSettings`, `addDays`, `IsoDate`, `MealType` da
  `domain/src/planner/index.ts`; `resolveFamilySettings`, `normalizeRules` da
  `domain/src/family/settings.ts`; `FamilyData` da `scripts/import/family.ts`;
  `OriginRecipe` da `scripts/planner-data/origin.ts`.
- Produces:
  ```ts
  // settings-plan.ts
  export interface SettingsWrite { path: string[]; value: unknown }
  export function settingsWrites(wanted: PlannerSettings, stored: unknown): SettingsWrite[];
  // menus.ts
  export interface OriginMenuSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number | null; note: string | null }
  export interface OriginMenu { weekStart: IsoDate; slots: OriginMenuSlot[] }
  export function parseOriginMenu(text: string): OriginMenu;
  export function readOriginMenus(originDirectory: string): OriginMenu[];
  // weeks-plan.ts
  export interface PlannedSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number }
  export interface PlannedWeek { weekStart: IsoDate; source: 'history' | 'current'; slots: PlannedSlot[] }
  export interface WeeksPlan {
  	weeks: PlannedWeek[];
  	duplicates: { date: IsoDate; mealType: MealType; originSlug: string }[]; // become tried recipes
  	notes: { date: IsoDate; mealType: MealType; note: string }[];
  }
  export function plannedWeeks(args: { meals: FamilyData['meals']; menus: OriginMenu[]; settings: PlannerSettings; today: IsoDate }): WeeksPlan;
  // preferences.ts
  export interface ConditionalPreference { originSlug: string; name: string; note: string }
  export function conditionalPreferences(origin: OriginRecipe[]): ConditionalPreference[];
  // inputs-fingerprint.ts
  export function inputsFingerprint(args: { originDirectory: string; importDirectory: string; head: string; today: string; familyId: string; curatorId: string; endpoint: string }): string;
  ```

- [ ] **Step 1: test delle impostazioni**

```ts
import { describe, expect, it } from 'vitest';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { settingsWrites } from './settings-plan.ts';

describe('settingsWrites', () => {
	it('writes only what differs from the defaults, never weights', () => {
		const paths = settingsWrites(curatorFamilySettings(), {}).map((w) => w.path.join('.'));
		expect(paths).toContain('slots.lunch.6'); // Sunday pizza
		expect(paths).toContain('slots.dinner.5'); // Saturday free dinner
		expect(paths).toContain('rules');
		expect(paths).not.toContain('knownNew'); // same as the default
		expect(paths.some((p) => p.startsWith('groupRanges'))).toBe(false);
		expect(paths.some((p) => p.startsWith('weights'))).toBe(false);
	});
	it('leaves alone every key already saved', () => {
		const stored = { slots: { lunch: { '6': { servings: 5, fixedText: null, maxMinutes: null } } }, rules: [] };
		const paths = settingsWrites(curatorFamilySettings(), stored).map((w) => w.path.join('.'));
		expect(paths).not.toContain('slots.lunch.6');
		expect(paths).not.toContain('rules');
		expect(paths).toContain('slots.dinner.5');
	});
});
```

- [ ] **Step 2: test dei menu, delle settimane, delle preferenze e dell'impronta**

```ts
// menus.test.ts e weeks-plan.test.ts
import { describe, expect, it } from 'vitest';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { parseOriginMenu } from './menus.ts';
import { plannedWeeks } from './weeks-plan.ts';

const MENU = `
settimana: {inizio: 2026-10-12, fine: 2026-10-18}
giorni:
  - giorno: lun
    data: 2026-10-12
    pranzo: {ricetta: fusilli-ricotta, porzioni: 2, note: "x2"}
    cena: {ricetta: piadine, porzioni: 2}
  - giorno: dom
    data: 2026-10-18
    pranzo: {libero: Pizza da asporto}
`;

describe('parseOriginMenu', () => {
	it('reads recipes, servings, free text and notes', () => {
		const menu = parseOriginMenu(MENU);
		expect(menu.weekStart).toBe('2026-10-12');
		expect(menu.slots).toEqual([
			{ date: '2026-10-12', mealType: 'lunch', originSlug: 'fusilli-ricotta', freeText: null, servings: 2, note: 'x2' },
			{ date: '2026-10-12', mealType: 'dinner', originSlug: 'piadine', freeText: null, servings: 2, note: null },
			{ date: '2026-10-18', mealType: 'lunch', originSlug: null, freeText: 'Pizza da asporto', servings: null, note: null },
		]);
	});
	it('refuses a week that does not start on Monday', () => {
		expect(() => parseOriginMenu(MENU.replace('inizio: 2026-10-12', 'inizio: 2026-10-13'))).toThrow(/Monday/);
	});
});

describe('plannedWeeks', () => {
	const settings = curatorFamilySettings();
	const menus = [parseOriginMenu(MENU)];

	it('turns a not concluded menu into a current week, free text with the settings servings', () => {
		const plan = plannedWeeks({ meals: [], menus, settings, today: '2026-10-13' });
		expect(plan.weeks).toHaveLength(1);
		expect(plan.weeks[0]).toMatchObject({ weekStart: '2026-10-12', source: 'current' });
		expect(plan.weeks[0]!.slots.find((s) => s.freeText)).toEqual({ date: '2026-10-18', mealType: 'lunch', originSlug: null, freeText: 'Pizza da asporto', servings: 4 });
		expect(plan.notes).toEqual([{ date: '2026-10-12', mealType: 'lunch', note: 'x2' }]);
	});
	it('ignores a menu of a concluded week: history comes from the recipe book', () => {
		expect(plannedWeeks({ meals: [], menus, settings, today: '2026-10-19' }).weeks).toEqual([]);
	});
	it('takes servings of history from the menu of that week, else from the settings', () => {
		const meals = [
			{ date: '2026-10-12', mealType: 'lunch' as const, originSlug: 'fusilli-ricotta' },
			{ date: '2026-10-13', mealType: 'dinner' as const, originSlug: 'other' },
		];
		expect(plannedWeeks({ meals, menus, settings, today: '2026-10-19' }).weeks[0]!.slots).toEqual([
			{ date: '2026-10-12', mealType: 'lunch', originSlug: 'fusilli-ricotta', freeText: null, servings: 2 },
			{ date: '2026-10-13', mealType: 'dinner', originSlug: 'other', freeText: null, servings: 4 }, // Tuesday dinner: 4
		]);
	});
	it('lets the current menu win over history in the same week', () => {
		const meals = [{ date: '2026-10-12', mealType: 'lunch' as const, originSlug: 'fusilli-ricotta' }];
		const plan = plannedWeeks({ meals, menus, settings, today: '2026-10-13' });
		expect(plan.weeks).toHaveLength(1);
		expect(plan.weeks[0]!.source).toBe('current');
	});
	it('keeps the first recipe by slug when two share a meal, and hands the other over as tried', () => {
		const meals = [
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'b' },
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'a' },
		];
		const plan = plannedWeeks({ meals, menus: [], settings, today: '2026-10-13' });
		expect(plan.weeks[0]!.slots.map((s) => s.originSlug)).toEqual(['a']);
		expect(plan.duplicates).toEqual([{ date: '2026-09-01', mealType: 'lunch', originSlug: 'b' }]);
	});
});
```

```ts
// preferences.test.ts
import { describe, expect, it } from 'vitest';
import { readOriginRecipes, originDir } from '../../planner-data/origin.ts';
import { conditionalPreferences } from './preferences.ts';

const card = (id: string, note: string | null) => ({ id, nome: id, note }) as never;

describe('conditionalPreferences', () => {
	it('finds preference phrases in the notes, with recipe and text', () => {
		const found = conditionalPreferences([card('a', 'Ai bambini non piacciono, non proporla nelle cene per 4 (solo per i 2 adulti).'), card('b', 'Fonte per 4.'), card('c', null)]);
		expect(found).toEqual([{ originSlug: 'a', name: 'a', note: 'Ai bambini non piacciono, non proporla nelle cene per 4 (solo per i 2 adulti).' }]);
	});
	it.skipIf(!process.env.MEAL_PLANNER_ORIGIN && !originDirExists())('lists the known case of the real recipe book', () => {
		const slugs = conditionalPreferences(readOriginRecipes(originDir(process.cwd()))).map((p) => p.originSlug);
		expect(slugs).toContain('gamberi-zucchine-skottle'); // ricette.yaml, note of 27 September 2026
	});
});
```

(`originDirExists` è un aiuto locale con `existsSync(originDir(process.cwd()))`.
L'esecutore controlla l'id esatto della scheda di `ricette.yaml:248` prima di scrivere
il test.)

```ts
// inputs-fingerprint.test.ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputsFingerprint } from './inputs-fingerprint.ts';

describe('inputsFingerprint', () => {
	const dir = mkdtempSync(join(tmpdir(), 'fp-'));
	for (const d of ['origin/ricettario', 'origin/menu/2026-10-12', 'import']) mkdirSync(join(dir, d), { recursive: true });
	writeFileSync(join(dir, 'origin/ricettario/ricette.yaml'), 'a');
	writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.yaml'), 'b');
	writeFileSync(join(dir, 'import/ingredients.yaml'), 'c');
	const args = { originDirectory: join(dir, 'origin'), importDirectory: join(dir, 'import'), head: 'abc', today: '2026-10-13', familyId: 'f', curatorId: 'c', endpoint: 'app_server.x@h:5432/postgres' };

	it('is stable for the same inputs and changes with any file or argument', () => {
		const first = inputsFingerprint(args);
		expect(inputsFingerprint(args)).toBe(first);
		expect(inputsFingerprint({ ...args, today: '2026-10-14' })).not.toBe(first);
		expect(inputsFingerprint({ ...args, endpoint: 'app_server.y@h:5432/postgres' })).not.toBe(first);
		writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.yaml'), 'b2');
		expect(inputsFingerprint(args)).not.toBe(first);
	});
});
```

- [ ] **Step 3: verifica che falliscano** — Run: `npx vitest run scripts/import/load` → FAIL (moduli assenti).

- [ ] **Step 4: implementazione**

`settings-plan.ts`:

```ts
import { resolveFamilySettings, normalizeRules } from '../../../domain/src/family/settings.ts';
import type { PlannerSettings } from '../../../domain/src/planner/index.ts';

// Keys of families.settings the load writes (detail spec, section 6): the stored jsonb keeps only
// changed values, so a key equal to the default is not written, and a key already saved is the
// family's own choice and is left alone. Weights are never written (scope of milestone A).
export interface SettingsWrite { path: string[]; value: unknown }

const at = (value: unknown, path: string[]): unknown =>
	path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function settingsWrites(wanted: PlannerSettings, stored: unknown): SettingsWrite[] {
	const defaults = resolveFamilySettings({});
	const candidates: SettingsWrite[] = [];
	for (const mealType of ['lunch', 'dinner'] as const)
		wanted.slots[mealType].forEach((slot, day) => {
			if (!same(slot, defaults.slots[mealType][day])) candidates.push({ path: ['slots', mealType, String(day)], value: slot });
		});
	const rules = normalizeRules(wanted.rules);
	if (!same(rules, defaults.rules)) candidates.push({ path: ['rules'], value: rules });
	if (!same(wanted.knownNew, defaults.knownNew)) candidates.push({ path: ['knownNew'], value: wanted.knownNew });
	for (const [group, range] of Object.entries(wanted.groupRanges))
		if (!same(range, defaults.groupRanges[group as keyof typeof defaults.groupRanges])) candidates.push({ path: ['groupRanges', group], value: range });
	return candidates.filter((w) => at(stored, w.path) === undefined);
}
```

`menus.ts`:

```ts
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { isMonday, isValidIsoDate } from '../family.ts';
import type { IsoDate, MealType } from '../../../domain/src/planner/index.ts';

// Weekly menus of the origin project (menu/<monday>/menu.yaml): the source of the "menu in corso"
// (detail spec, section 6). Only what the app keeps: recipe or free text, servings, note.
export interface OriginMenuSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number | null; note: string | null }
export interface OriginMenu { weekStart: IsoDate; slots: OriginMenuSlot[] }

type RawMeal = { ricetta?: string; libero?: string; porzioni?: number; note?: string } | null | undefined;
const MEALS: [string, MealType][] = [['pranzo', 'lunch'], ['cena', 'dinner']];

export function parseOriginMenu(text: string): OriginMenu {
	const raw = parse(text) as { settimana?: { inizio?: unknown }; giorni?: ({ data?: unknown } & Record<string, RawMeal>)[] };
	const weekStart = String(raw.settimana?.inizio ?? '');
	if (!isValidIsoDate(weekStart) || !isMonday(weekStart)) throw new Error(`Menu week does not start on a Monday: ${weekStart}`);
	const slots: OriginMenuSlot[] = [];
	for (const day of raw.giorni ?? []) {
		const date = String(day.data ?? '');
		if (!isValidIsoDate(date)) throw new Error(`Menu ${weekStart}: invalid day ${date}`);
		for (const [key, mealType] of MEALS) {
			const meal = day[key];
			if (!meal || (!meal.ricetta && !meal.libero)) continue;
			slots.push({
				date, mealType,
				originSlug: meal.ricetta ?? null,
				freeText: meal.ricetta ? null : (meal.libero ?? null),
				servings: meal.porzioni ?? null,
				note: meal.note ?? null,
			});
		}
	}
	return { weekStart, slots };
}

export function readOriginMenus(originDirectory: string): OriginMenu[] {
	const dir = resolve(originDirectory, 'menu');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => existsSync(resolve(dir, name, 'menu.yaml')))
		.sort()
		.map((name) => parseOriginMenu(readFileSync(resolve(dir, name, 'menu.yaml'), 'utf8')));
}
```

`weeks-plan.ts`:

```ts
import { addDays, type IsoDate, type MealType, type PlannerSettings } from '../../../domain/src/planner/index.ts';
import type { FamilyData } from '../family.ts';
import type { OriginMenu } from './menus.ts';

// Weeks the load writes (detail spec, section 6): history from buildFamilyData (R4 unchanged) and the
// "menu in corso" from the origin menus of weeks not concluded at the import date. The current menu
// wins over history in its week; servings come from the week's menu, else from the settings. Two
// recipes in one past meal: the first by slug takes the meal, the other becomes a tried recipe.
export interface PlannedSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number }
export interface PlannedWeek { weekStart: IsoDate; source: 'history' | 'current'; slots: PlannedSlot[] }
export interface WeeksPlan {
	weeks: PlannedWeek[];
	duplicates: { date: IsoDate; mealType: MealType; originSlug: string }[];
	notes: { date: IsoDate; mealType: MealType; note: string }[];
}

const weekdayIndex = (date: IsoDate) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const mondayOf = (date: IsoDate) => addDays(date, -weekdayIndex(date));
const settingsServings = (s: PlannerSettings, date: IsoDate, mealType: MealType) => s.slots[mealType][weekdayIndex(date)]!.servings;

export function plannedWeeks(args: { meals: FamilyData['meals']; menus: OriginMenu[]; settings: PlannerSettings; today: IsoDate }): WeeksPlan {
	const { settings, today } = args;
	const current = args.menus.filter((m) => addDays(m.weekStart, 6) >= today);
	const currentStarts = new Set(current.map((m) => m.weekStart));
	const menuByWeek = new Map(args.menus.map((m) => [m.weekStart, m]));
	const weeks = new Map<IsoDate, PlannedWeek>();
	const duplicates: WeeksPlan['duplicates'] = [];
	const notes: WeeksPlan['notes'] = [];

	for (const menu of current) {
		weeks.set(menu.weekStart, {
			weekStart: menu.weekStart, source: 'current',
			slots: menu.slots.map((s) => {
				if (s.note) notes.push({ date: s.date, mealType: s.mealType, note: s.note });
				return { date: s.date, mealType: s.mealType, originSlug: s.originSlug, freeText: s.freeText, servings: s.servings ?? settingsServings(settings, s.date, s.mealType) };
			}),
		});
	}
	const sorted = [...args.meals].sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType) || a.originSlug.localeCompare(b.originSlug));
	for (const meal of sorted) {
		const weekStart = mondayOf(meal.date);
		if (currentStarts.has(weekStart)) continue;
		const week = weeks.get(weekStart) ?? { weekStart, source: 'history' as const, slots: [] };
		weeks.set(weekStart, week);
		if (week.slots.some((s) => s.date === meal.date && s.mealType === meal.mealType)) {
			duplicates.push(meal);
			continue;
		}
		const fromMenu = menuByWeek.get(weekStart)?.slots.find((s) => s.date === meal.date && s.mealType === meal.mealType && s.originSlug === meal.originSlug);
		week.slots.push({ ...meal, freeText: null, servings: fromMenu?.servings ?? settingsServings(settings, meal.date, meal.mealType) });
	}
	return { weeks: [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)), duplicates, notes };
}
```

`preferences.ts`:

```ts
import type { OriginRecipe } from '../../planner-data/origin.ts';

// Preferences in the origin notes that are not a global exclusion (detail spec, section 6, decision
// of the coordinator): never turned into exclusions, listed for the family to settle by hand.
export interface ConditionalPreference { originSlug: string; name: string; note: string }

const PHRASES = [/non propor(la|lo|re)/i, /non (gli |le )?piac(e|ciono)/i, /solo per/i, /bambin/i, /evitar/i];

export function conditionalPreferences(origin: OriginRecipe[]): ConditionalPreference[] {
	return origin
		.filter((r) => typeof r.note === 'string' && PHRASES.some((p) => p.test(r.note!)))
		.map((r) => ({ originSlug: r.id, name: r.nome, note: r.note! }));
}
```

(Verifica in `scripts/planner-data/origin.ts` i nomi esatti dei campi `id`, `nome`,
`note` di `OriginRecipe` prima di scriverlo.)

`inputs-fingerprint.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// What the preview showed (detail spec, section 6): every file the load reads, the commit of the
// scripts, the arguments and the destination. --confirm recomputes it before connecting.
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function files(dir: string, keep: (path: string) => boolean): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path, keep) : keep(path) ? [path] : [];
	});
}

export function inputsFingerprint(args: { originDirectory: string; importDirectory: string; head: string; today: string; familyId: string; curatorId: string; endpoint: string }): string {
	const read = [
		...files(join(args.originDirectory, 'ricettario'), () => true),
		...files(join(args.originDirectory, 'menu'), (p) => p.endsWith('/menu.yaml')),
	].map((p) => [`origin/${relative(args.originDirectory, p)}`, sha(readFileSync(p))]);
	const yaml = files(args.importDirectory, (p) => p.endsWith('.yaml') && !p.includes('/out/')).map((p) => [`import/${relative(args.importDirectory, p)}`, sha(readFileSync(p))]);
	const all = [...read, ...yaml].sort(([a], [b]) => a!.localeCompare(b!));
	const { originDirectory, importDirectory, ...rest } = args;
	return sha(JSON.stringify({ files: all, ...rest })).slice(0, 16);
}
```

- [ ] **Step 5: verifica** — Run: `npx vitest run scripts/import/load && npm run typecheck` → PASS.

- [ ] **Step 6: commit**

```bash
git add scripts/import/load/settings-plan.ts scripts/import/load/settings-plan.test.ts scripts/import/load/menus.ts scripts/import/load/menus.test.ts scripts/import/load/weeks-plan.ts scripts/import/load/weeks-plan.test.ts scripts/import/load/preferences.ts scripts/import/load/preferences.test.ts scripts/import/load/inputs-fingerprint.ts scripts/import/load/inputs-fingerprint.test.ts
git commit -m "Messa in produzione: impostazioni, settimane, preferenze condizionali e impronta degli input"
```

### Task 3: Catalogo e transazione unica

**Files:**
- Create: `scripts/import/load/catalogue.ts`, `scripts/import/load/run.ts`,
  `scripts/import/load/family.ts` (segnaposto tipato, completato nel Task 4),
  `scripts/import/load/test-origin.ts`, `scripts/import/load/load.db.test.ts`

**Interfaces:**
- Consumes: `createBook`, `createIngredient`, `createDraft`, `publishDraft`, `Actor`
  da `server/src/catalogue/write.ts`; `setEquivalence` da
  `server/src/catalogue/ingredients.ts`; `preparationKey` da
  `domain/src/units/equivalence.ts`; `resolveReferences` da `domain/src/recipe/index.ts`;
  `lockFamilyWeeks` da `server/src/menu/generation.ts`; `runImport`, `readInputs`.
- Produces:
  ```ts
  // catalogue.ts
  export interface Counted { created: number; present: number }
  export interface CatalogueResult {
  	books: Counted; ingredients: Counted; equivalences: Counted & { diverging: string[] };
  	recipes: { published: number; drafts: number; present: number };
  	publicationBlocked: string[];
  }
  export async function existingCatalogue(tx: Tx): Promise<{ recipes: string[]; ingredients: string[]; books: string[] }>;
  export async function loadCatalogue(tx: Tx, actor: Actor, bundle: ImportBundle, equivalences: UnitEquivalence[]): Promise<CatalogueResult>;
  // run.ts
  export interface LoadOptions { today: string; familyId: string; curatorId: string; root: string; originDirectory?: string; dryRun: boolean }
  export interface LoadResult { mode: 'dry-run' | 'written'; catalogue: CatalogueResult; family: FamilyResult; importReport: string }
  export class LoadRefused extends Error {}
  export async function actAsCurator(tx: Tx, curatorId: string): Promise<void>;
  export async function actAsJob(tx: Tx): Promise<void>;
  export async function loadAll(sql: postgres.Sql, options: LoadOptions): Promise<LoadResult>;
  export async function dataFingerprint(sql: postgres.Sql, root: string): Promise<string>;
  // test-origin.ts
  export interface LoadCase { prefix: string; dir: string }
  export function writeOriginFixture(variant?: { pendingReview?: boolean; missingInMenu?: boolean }): LoadCase;
  export async function cleanupLoadCase(admin: postgres.Sql, c: LoadCase, familyIds: string[]): Promise<void>;
  ```

- [ ] **Step 1: fixture indipendenti**

`test-origin.ts` crea a ogni chiamata una cartella temporanea con un **prefisso unico**
(`test-load-<8 caratteri casuali>-`) per slug di schede, ingredienti e libro (titolo
`Libro <prefisso>`): `ricettario/ricette.yaml` con tre schede (una pubblicabile
collaudata con storico e `feedback`; una senza attributi in `recipe-attributes.yaml`
che diventa bozza, con `feedback`; una dal libro, con una nota «non proporla nelle cene
per 4 (solo per i 2 adulti)»; due ricette nello stesso pasto storico); `menu/` con la
settimana del 12 ottobre 2026 (un pasto con ricetta e nota, un `libero`); e
`scripts/import/*.yaml` con le sole voci usate e un'equivalenza, approvazione
ricalcolata con `approve.ts`. `pendingReview` lascia un file senza approvazione valida;
`missingInMenu` fa citare al menu `<prefisso>assente`. `cleanupLoadCase` toglie con
`db.admin` solo righe con quel prefisso (ricette, versioni, bozze, ingredienti,
equivalenze, libro) e le famiglie indicate: ogni test pulisce ciò che crea, in
`afterEach`.

- [ ] **Step 2: test d'integrazione che falliscono** (`load.db.test.ts`, prima parte)

```ts
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../../../server/test/support/db.ts';
import { cleanupLoadCase, writeOriginFixture, type LoadCase } from './test-origin.ts';
import { LoadRefused, loadAll } from './run.ts';

describe.skipIf(!hasDatabase)('load into the database', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	const cases: { c: LoadCase; families: string[] }[] = [];
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 1, fetch_types: false, onnotice: () => {} });
	});
	afterEach(async () => {
		for (const { c, families } of cases.splice(0)) await cleanupLoadCase(db.admin, c, families);
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	/** A curator, its family and an origin of its own: no test sees another's rows. */
	async function freshCase(variant = {}) {
		const { userId: curator } = await db.createUser();
		await db.grantGlobalRole(curator, 'recipe_curator');
		const familyId = await db.createFamily([{ userId: curator, role: 'family_admin' }]);
		const c = writeOriginFixture(variant);
		cases.push({ c, families: [familyId] });
		const options = (over = {}) => ({ today: '2026-10-13', familyId, curatorId: curator, root: c.dir, originDirectory: c.dir, dryRun: false, ...over });
		return { c, curator, familyId, options };
	}
	const count = async (table: string, prefix: string) =>
		(await db.admin.unsafe(`select count(*)::int as n from app.${table} where ${table === 'recipes' ? 'origin_slug' : 'slug'} like $1`, [`${prefix}%`]))[0]!.n as number;

	it('dry-run counts everything and leaves nothing', async () => {
		const { c, options } = await freshCase();
		const result = await loadAll(sql, options({ dryRun: true }));
		expect(result.mode).toBe('dry-run');
		expect(result.catalogue.recipes).toMatchObject({ published: 2, drafts: 1 });
		expect(await count('recipes', c.prefix)).toBe(0);
	});

	it('writes with channel import and origin slugs, and a rerun in the same test creates nothing', async () => {
		const { c, options } = await freshCase();
		await loadAll(sql, options());
		const rows = await db.admin`select v.channel from app.recipes r join app.recipe_versions v on v.recipe_id = r.id where r.origin_slug like ${`${c.prefix}%`}`;
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.channel === 'import')).toBe(true);
		const again = await loadAll(sql, options({ dryRun: true }));
		expect(again.catalogue.recipes).toEqual({ published: 0, drafts: 0, present: 3 });
		expect(again.catalogue.ingredients.created).toBe(0);
		expect(again.catalogue.equivalences.created).toBe(0);
	});

	it('keeps an equivalence a curator changed, and reports it', async () => {
		const { c, options } = await freshCase();
		await loadAll(sql, options());
		const [eq] = await db.admin`update app.ingredient_unit_equivalences e set factor = factor * 2 from app.ingredients i
			where i.id = e.ingredient_id and i.slug like ${`${c.prefix}%`} returning e.id, e.factor, i.version`;
		const again = await loadAll(sql, options());
		expect(again.catalogue.equivalences.diverging).toHaveLength(1);
		const [after] = await db.admin`select e.factor, i.version from app.ingredient_unit_equivalences e join app.ingredients i on i.id = e.ingredient_id where e.id = ${eq!.id}`;
		expect(after).toEqual({ factor: eq!.factor, version: eq!.version });
	});

	it('publishes nothing while a review file is pending, also when writing', async () => {
		const { c, options } = await freshCase({ pendingReview: true });
		const result = await loadAll(sql, options());
		expect(result.catalogue.recipes.published).toBe(0);
		expect(result.catalogue.publicationBlocked).not.toEqual([]);
		const statuses = await db.admin`select distinct status from app.recipes where origin_slug like ${`${c.prefix}%`}`;
		expect(statuses.map((s) => s.status)).toEqual(['draft']);
	});

	it('refuses a user who is not a curator, or not an admin of the family', async () => {
		const { options } = await freshCase();
		const { userId: plain } = await db.createUser();
		await expect(loadAll(sql, options({ curatorId: plain, dryRun: true }))).rejects.toThrow(LoadRefused);
		const { userId: otherCurator } = await db.createUser();
		await db.grantGlobalRole(otherCurator, 'recipe_curator');
		await expect(loadAll(sql, options({ curatorId: otherCurator, dryRun: true }))).rejects.toThrow(/not an admin/);
	});
});
```

- [ ] **Step 3: verifica che falliscano** — Run (stack locale avviato con `supabase db start`):
  `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run scripts/import/load/load.db.test.ts` → FAIL.

- [ ] **Step 4: `catalogue.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { resolveReferences } from '../../../domain/src/recipe/index.ts';
import { preparationKey, type UnitEquivalence } from '../../../domain/src/units/equivalence.ts';
import type { Tx } from '../../../server/src/db.ts';
import { createBook, createDraft, createIngredient, publishDraft, type Actor } from '../../../server/src/catalogue/write.ts';
import { setEquivalence } from '../../../server/src/catalogue/ingredients.ts';
import type { ImportBundle } from '../bundle.ts';

// Catalogue writes of the production load (detail spec, section 6), through the curators' module with
// channel 'import'; slugs and origin slugs of the bundle are kept, so a rerun finds them again. What is
// already in the database is never overwritten: the database is the source of truth after the import.
export interface Counted { created: number; present: number }
export interface CatalogueResult {
	books: Counted; ingredients: Counted; equivalences: Counted & { diverging: string[] };
	recipes: { published: number; drafts: number; present: number };
	publicationBlocked: string[];
}

export async function existingCatalogue(tx: Tx) {
	const recipes = await tx<{ s: string }[]>`select origin_slug as s from app.recipes where origin_slug is not null`;
	const ingredients = await tx<{ s: string }[]>`select slug as s from app.ingredients`;
	const books = await tx<{ s: string }[]>`select slug as s from app.books`;
	return { recipes: recipes.map((r) => r.s), ingredients: ingredients.map((r) => r.s), books: books.map((r) => r.s) };
}

export async function loadCatalogue(tx: Tx, actor: Actor, bundle: ImportBundle, equivalences: UnitEquivalence[]): Promise<CatalogueResult> {
	const result: CatalogueResult = {
		books: { created: 0, present: 0 }, ingredients: { created: 0, present: 0 }, equivalences: { created: 0, present: 0, diverging: [] },
		recipes: { published: 0, drafts: 0, present: 0 }, publicationBlocked: bundle.pendingReview,
	};
	for (const b of bundle.books) {
		const r = await createBook(tx, actor, { bookId: randomUUID(), slug: b.slug, title: b.title });
		result.books[r.created ? 'created' : 'present']++;
	}
	for (const i of bundle.ingredients) {
		const r = await createIngredient(tx, actor, {
			ingredientId: randomUUID(), slug: i.slug,
			name: { 'it-IT': i.name['it-IT'], 'en-GB': i.name['en-GB']?.trim() ? i.name['en-GB'] : null },
			department: i.department, isPantry: i.isPantry, synonyms: i.synonyms,
		});
		result.ingredients[r.created ? 'created' : 'present']++;
	}
	const ingredientIds = new Map((await tx<{ slug: string; id: string }[]>`select slug, id from app.ingredients`).map((r) => [r.slug, r.id]));
	const bookIds = new Map((await tx<{ slug: string; id: string }[]>`select slug, id from app.books`).map((r) => [r.slug, r.id]));
	for (const e of equivalences) {
		const ingredientId = ingredientIds.get(e.ingredientId);
		if (!ingredientId) throw new Error(`Equivalence for unknown ingredient: ${e.ingredientId}`);
		// The logical key of setEquivalence: an existing row is kept whatever its values.
		const [existing] = await tx<{ to_unit: string; factor: string; from_unit: string; source: string }[]>`
			select from_unit, to_unit, factor::text, source from app.ingredient_unit_equivalences
			where ingredient_id = ${ingredientId} and scope = 'recipe' and from_dimension = app.unit_dimension(${e.fromUnit})
				and preparation is not distinct from ${preparationKey(e.preparation)}`;
		if (existing) {
			result.equivalences.present++;
			if (existing.from_unit !== e.fromUnit || existing.to_unit !== e.toUnit || Number(existing.factor) !== e.factor || existing.source !== e.source.trim())
				result.equivalences.diverging.push(`${e.ingredientId}: ${e.fromUnit}→${e.toUnit} ${e.factor} (in the database ${existing.from_unit}→${existing.to_unit} ${existing.factor})`);
			continue;
		}
		await setEquivalence(tx, actor, { ingredientId, fromUnit: e.fromUnit, toUnit: e.toUnit, factor: e.factor, preparation: e.preparation, source: e.source });
		result.equivalences.created++;
	}
	const lookup = { ingredientId: (s: string) => ingredientIds.get(s), bookId: (s: string) => bookIds.get(s) };
	const publish = bundle.pendingReview.length === 0;
	for (const r of bundle.recipes) {
		const draft = await createDraft(tx, actor, { draftId: randomUUID(), content: resolveReferences(r.document, lookup), originSlug: r.origin.slug, originType: r.origin.type });
		if (!draft.created) { result.recipes.present++; continue; }
		if (publish && r.status === 'publishable') {
			await publishDraft(tx, actor, { draftId: draft.draftId });
			result.recipes.published++;
		} else result.recipes.drafts++;
	}
	return result;
}
```

Nota per l'esecutore: `bundle.recipes` contiene solo le schede non ancora nel database
(`runImport` riceve `existingCatalogue`), quindi in `run.ts` `recipes.present` si somma
con `imported.skipped.length`; lo stesso per libri e ingredienti con gli slug già
presenti citati dall'origine. Verifica che `app.unit_dimension` sia eseguibile da
`authenticated` (la usa già `setEquivalence` nello stesso ruolo).

- [ ] **Step 5: `run.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type postgres from 'postgres';
import type { Tx } from '../../../server/src/db.ts';
import type { Actor } from '../../../server/src/catalogue/write.ts';
import { lockFamilyWeeks } from '../../../server/src/menu/generation.ts';
import { originDir, readOriginRecipes } from '../../planner-data/origin.ts';
import { runImport } from '../import-recipes.ts';
import { readInputs } from '../inputs.ts';
import { existingCatalogue, loadCatalogue, type CatalogueResult } from './catalogue.ts';
import { loadFamily, type FamilyResult } from './family.ts';
import { readOriginMenus } from './menus.ts';

// The production load as one transaction (detail spec, section 6): all or nothing, and the dry run is
// the same code ending in a rollback, so the preview counts are the real ones.
export interface LoadOptions { today: string; familyId: string; curatorId: string; root: string; originDirectory?: string; dryRun: boolean }
export interface LoadResult { mode: 'dry-run' | 'written'; catalogue: CatalogueResult; family: FamilyResult; importReport: string }

export class LoadRefused extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'LoadRefused';
	}
}

/** Carries the result out of the transaction it rolls back (no parameter property: erasable syntax only). */
class DryRun extends Error {
	result: LoadResult;
	constructor(result: LoadResult) {
		super('dry run');
		this.result = result;
	}
}

export async function actAsCurator(tx: Tx, curatorId: string) {
	const claims = { sub: curatorId, role: 'authenticated', session_id: randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600 };
	await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
	await tx`set local role authenticated`;
}
export async function actAsJob(tx: Tx) {
	await tx`reset role`;
	await tx`set local role app_job`;
}

async function checkCurator(tx: Tx, familyId: string, curatorId: string) {
	const [row] = await tx<{ curator: boolean; admin: boolean }[]>`
		select app.has_role('recipe_curator') as curator, app.is_family_admin(${familyId}) as admin`;
	if (!row?.curator) throw new LoadRefused(`User ${curatorId} is not a recipe curator`);
	if (!row.admin) throw new LoadRefused(`User ${curatorId} is not an admin of family ${familyId}`);
}

export async function loadAll(sql: postgres.Sql, options: LoadOptions): Promise<LoadResult> {
	const actor: Actor = { userId: options.curatorId, channel: 'import' };
	const origin = options.originDirectory ?? originDir(options.root);
	try {
		return (await sql.begin(async (tx) => {
			await actAsCurator(tx, options.curatorId);
			await checkCurator(tx, options.familyId, options.curatorId);
			// Same lock as the generation, then the family row: a generation or a settings write waits
			// for the commit, and nothing the checks below read can change before the writes.
			await lockFamilyWeeks(tx, options.familyId);
			const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${options.familyId} for update`;
			if (!family) throw new LoadRefused(`Family ${options.familyId} is not readable`);
			const existingFile = join(mkdtempSync(join(tmpdir(), 'load-existing-')), 'existing.json');
			writeFileSync(existingFile, JSON.stringify(await existingCatalogue(tx)));
			const { result: imported, files } = runImport({ root: options.root, originDirectory: origin, existingFile, today: options.today });
			const inputs = readInputs(join(options.root, 'scripts/import'));
			const catalogue = await loadCatalogue(tx, actor, imported.bundle, inputs.equivalences);
			catalogue.recipes.present += imported.skipped.length;
			const familyResult = await loadFamily(tx, {
				familyId: options.familyId, curatorId: options.curatorId, storedSettings: family.settings,
				origin: readOriginRecipes(origin), today: options.today, menus: readOriginMenus(origin),
			});
			const result: LoadResult = { mode: options.dryRun ? 'dry-run' : 'written', catalogue, family: familyResult, importReport: files['report.md']! };
			if (options.dryRun) throw new DryRun(result);
			return result;
		})) as LoadResult;
	} catch (error) {
		if (error instanceof DryRun) return error.result;
		throw error;
	}
}

/** Fingerprint of schema app after a write (detail spec, section 8), read as app_backup, which sees every row. */
export async function dataFingerprint(sql: postgres.Sql, root: string): Promise<string> {
	const definition = readFileSync(resolve(root, 'supabase/scripts/app-fingerprint.sql'), 'utf8');
	return sql.begin(async (tx) => {
		await tx`set local role app_backup`;
		await tx.unsafe(definition);
		const [row] = await tx<{ f: string }[]>`select pg_temp.app_fingerprint() as f`;
		return row!.f;
	}) as Promise<string>;
}

export const repositoryHead = (root: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
```

`family.ts` in questo task: `FamilyResult`, `emptyFamilyResult()` e un `loadFamily` che
restituisce `emptyFamilyResult()` (completato nel Task 4). `app-fingerprint.sql` arriva
nel Task 8: fino ad allora `dataFingerprint` non ha test.

Verifica prima di scriverlo: nomi delle funzioni di autorizzazione (`app.has_role`,
`app.is_family_admin`, tabella «Funzioni eseguibili per ruolo» di `supabase/README.md`);
che `authenticated` abbia `update` su `app.families` per un amministratore (serve a
`for update`; lo usa già `writeSettingsKey`); che `app_server` possa `set role
app_backup` (migrazione `20261012110000_backup.sql`).

- [ ] **Step 6: verifica** — Run: lo stesso comando dello Step 3 → PASS; `npm run typecheck` → PASS.

- [ ] **Step 7: commit**

```bash
git add scripts/import/load/catalogue.ts scripts/import/load/run.ts scripts/import/load/family.ts scripts/import/load/test-origin.ts scripts/import/load/load.db.test.ts
git commit -m "Messa in produzione: caricamento del catalogo in una transazione, senza sovrascrivere, con il lock della generazione"
```

### Task 4: Scritture della famiglia e concorrenza

**Files:**
- Modify: `scripts/import/load/family.ts`, `scripts/import/load/load.db.test.ts`

**Interfaces:**
- Consumes: `settingsWrites`, `plannedWeeks`, `conditionalPreferences` (Task 2),
  `actAsJob`, `LoadRefused` (Task 3), `buildFamilyData`, `HistoryFinding` da
  `scripts/import/family.ts`, `slug`, `OriginRecipe` da
  `scripts/planner-data/origin.ts`, `curatorFamilySettings`, `writeSettingsKey`.
- Produces:
  ```ts
  export interface FamilyResult {
  	settings: number;               // keys written
  	restrictions: Counted; books: Counted; tried: Counted;
  	ratings: Counted & { pending: string[] };   // origin slugs of drafts
  	weeks: { created: number; present: number; slots: number };
  	missingRecipes: string[];       // history slugs without a recipe in the app
  	duplicates: WeeksPlan['duplicates']; notes: WeeksPlan['notes'];
  	ownedBooks: string[];           // titles
  	findings: HistoryFinding[];     // R4 cases of buildFamilyData
  	preferences: ConditionalPreference[];
  }
  export function emptyFamilyResult(): FamilyResult;
  export async function loadFamily(tx: Tx, args: { familyId: string; curatorId: string; storedSettings: unknown; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] }): Promise<FamilyResult>;
  ```

- [ ] **Step 1: test che falliscono** (in `load.db.test.ts`, stesso `describe`, con
  `freshCase`)

```ts
it('writes settings, restrictions, owned books, ratings, tried recipes, weeks and preferences', async () => {
	const { c, options } = await freshCase();
	const result = await loadAll(sql, options({ dryRun: true }));
	expect(result.family.settings).toBeGreaterThan(0);
	expect(result.family.ownedBooks).toEqual([`Libro ${c.prefix}`]);
	expect(result.family.ratings.pending).toEqual([`${c.prefix}bozza`]); // rating of a draft
	expect(result.family.weeks.created).toBe(2); // one of history, one current
	expect(result.family.duplicates).toHaveLength(1);
	expect(result.family.tried.created).toBeGreaterThanOrEqual(1); // the duplicate became a tried recipe
	expect(result.family.preferences.map((p) => p.originSlug)).toEqual([`${c.prefix}libro`]);
});

it('never overwrites what the family changed, and skips existing weeks (rerun in the same test)', async () => {
	const { familyId, curator, options } = await freshCase();
	await loadAll(sql, options());
	await db.admin`update app.ratings set stars = 1 where user_id = ${curator}`;
	await db.admin`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${familyId}`;
	const again = await loadAll(sql, options());
	expect(again.family).toMatchObject({ settings: 0, weeks: { created: 0 }, ratings: { created: 0 } });
	const stars = await db.admin`select distinct stars from app.ratings where user_id = ${curator}`;
	expect(stars.map((s) => s.stars)).toEqual([1]);
	const [{ rules }] = await db.admin`select settings->'rules' as rules from app.families where id = ${familyId}`;
	expect(rules).toEqual([]);
});

it('writes history and current meals as the app, with free text and no generation mark', async () => {
	const { familyId, options } = await freshCase();
	await loadAll(sql, options());
	const slots = await db.admin`select w.generated_at, s.free_text, s.servings, s.updated_by from app.meal_slots s
		join app.weeks w on w.id = s.week_id where w.family_id = ${familyId}`;
	expect(slots.length).toBeGreaterThan(0);
	expect(slots.every((s) => s.generated_at === null && s.updated_by === null)).toBe(true);
	expect(slots.some((s) => s.free_text === 'Pizza da asporto' && s.servings === 4)).toBe(true);
});

it('refuses a first load when the app already generated a week', async () => {
	const { familyId, options } = await freshCase();
	await db.admin`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, '2026-10-19', now())`;
	await expect(loadAll(sql, options({ dryRun: true }))).rejects.toThrow(/already generated/);
});

it('stops when the current menu cites a missing recipe, rolling back the catalogue already written', async () => {
	const { c, familyId, options } = await freshCase({ missingInMenu: true });
	await expect(loadAll(sql, options())).rejects.toThrow(new RegExp(`${c.prefix}assente`));
	expect(await count('recipes', c.prefix)).toBe(0); // written before the error, then rolled back
	expect(await count('ingredients', c.prefix)).toBe(0);
	const [{ n }] = await db.admin`select count(*)::int as n from app.weeks where family_id = ${familyId}`;
	expect(n).toBe(0);
});

it('waits for a generation holding the lock, then refuses because the week it made came first', async () => {
	const { familyId, options } = await freshCase();
	const other = postgres(db.appServerUrl.replace('app_server:app_server_test', 'postgres:postgres'), { max: 1, onnotice: () => {} });
	try {
		let release!: () => void;
		const held = new Promise<void>((r) => { release = r; });
		const generation = other.begin(async (tx) => {
			await lockFamilyWeeks(tx as never, familyId);
			await held;
			await tx`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, '2026-10-19', now())`;
		});
		await new Promise((r) => setTimeout(r, 200));
		const load = loadAll(sql, options());
		await new Promise((r) => setTimeout(r, 300));
		const [{ waiting }] = await db.admin`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'`;
		expect(waiting).toBe(1);
		release();
		await generation;
		await expect(load).rejects.toThrow(/already generated/);
	} finally {
		await other.end();
	}
});

it('waits for a concurrent settings write, then keeps it', async () => {
	const { familyId, options } = await freshCase();
	const other = postgres(db.appServerUrl.replace('app_server:app_server_test', 'postgres:postgres'), { max: 1, onnotice: () => {} });
	try {
		let release!: () => void;
		const held = new Promise<void>((r) => { release = r; });
		const write = other.begin(async (tx) => {
			await tx`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${familyId}`;
			await held;
		});
		await new Promise((r) => setTimeout(r, 200));
		const load = loadAll(sql, options());
		await new Promise((r) => setTimeout(r, 300));
		release();
		await write;
		await load;
		const [{ rules }] = await db.admin`select settings->'rules' as rules from app.families where id = ${familyId}`;
		expect(rules).toEqual([]);
	} finally {
		await other.end();
	}
});
```

(`lockFamilyWeeks` importato da `server/src/menu/generation.ts`; l'URL di `postgres` si
costruisce da `TEST_DATABASE_URL`, non con `replace`, se l'esecutore preferisce: è la
stessa stringa dei test del server.)

- [ ] **Step 2: verifica che falliscano** — stesso comando del Task 3 → FAIL.

- [ ] **Step 3: implementazione di `loadFamily`** in `family.ts`, nell'ordine della spec
  (sezione 6, «Ordine delle scritture», punti 4–9):

```ts
export async function loadFamily(tx: Tx, args: { familyId: string; curatorId: string; storedSettings: unknown; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] }): Promise<FamilyResult> {
	const r = emptyFamilyResult();
	const { familyId, curatorId } = args;
	// Under the lock taken by loadAll: no generation can slip in between this check and the writes.
	const firstLoad = !args.storedSettings || Object.keys(args.storedSettings as object).length === 0;
	const [{ generated }] = await tx<{ generated: number }[]>`select count(*)::int as generated from app.weeks where family_id = ${familyId} and generated_at is not null`;
	if (firstLoad && generated > 0) throw new LoadRefused(`Family ${familyId} already generated a week with the default settings`);

	// 4. settings, only keys still missing (the row is locked by loadAll)
	const settings = curatorFamilySettings();
	for (const w of settingsWrites(settings, args.storedSettings)) { await writeSettingsKey(tx, familyId, w.path, w.value); r.settings++; }
	// 5. cucumbers, limited to one a week
	const cucumbers = await tx<{ id: string }[]>`select id from app.ingredients where slug like 'cetriol%'`;
	for (const { id } of cucumbers) count(r.restrictions, await tx`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max)
		values (${familyId}, ${id}, 'limit', 1) on conflict do nothing returning 1`);
	// 6. owned books: every book of the origin recipe book
	const bookSlugs = [...new Set(args.origin.flatMap((o) => (o.libro ? [slug(o.libro.titolo)] : [])))];
	const books = bookSlugs.length ? await tx<{ id: string; title: string }[]>`select id, title from app.books where slug in ${tx(bookSlugs)}` : [];
	for (const b of books) count(r.books, await tx`insert into app.family_books (family_id, book_id) values (${familyId}, ${b.id}) on conflict do nothing returning 1`);
	r.ownedBooks = books.map((b) => b.title).sort();
	// 7–8. ratings and tried recipes, computed on the whole origin recipe book
	const { family: data, findings } = buildFamilyData(args.origin, args.today);
	r.findings = findings;
	r.preferences = conditionalPreferences(args.origin);
	const recipes = new Map((await tx<{ originSlug: string; id: string; status: string }[]>`
		select origin_slug as "originSlug", id, status from app.recipes where origin_slug is not null`).map((x) => [x.originSlug, x]));
	for (const rating of data.ratings) {
		const recipe = recipes.get(rating.originSlug);
		if (!recipe) continue;
		if (recipe.status === 'draft') { r.ratings.pending.push(rating.originSlug); continue; }
		count(r.ratings, await tx`insert into app.ratings (user_id, recipe_id, stars) values (${curatorId}, ${recipe.id}, ${rating.stars}) on conflict do nothing returning 1`);
	}
	const plan = plannedWeeks({ meals: data.meals, menus: args.menus, settings, today: args.today });
	r.duplicates = plan.duplicates;
	r.notes = plan.notes;
	// Two recipes in one past meal (decision of the coordinator): the other one was eaten too.
	const tried = new Set([...data.triedUndated, ...plan.duplicates.map((d) => d.originSlug)]);
	for (const originSlug of tried) {
		const recipe = recipes.get(originSlug);
		if (recipe) count(r.tried, await tx`insert into app.family_tried_recipes (family_id, recipe_id, source) values (${familyId}, ${recipe.id}, 'import') on conflict do nothing returning 1`);
	}
	// 9. history and current menu, as the app (drafts may be cited)
	await actAsJob(tx);
	for (const week of plan.weeks) {
		const [created] = await tx<{ id: string }[]>`insert into app.weeks (family_id, starts_on) values (${familyId}, ${week.weekStart})
			on conflict (family_id, starts_on) do nothing returning id`;
		if (!created) { r.weeks.present++; continue; }
		r.weeks.created++;
		for (const s of week.slots) {
			const recipeId = s.originSlug ? recipes.get(s.originSlug)?.id : null;
			if (s.originSlug && !recipeId) {
				if (week.source === 'current') throw new LoadRefused(`The current menu cites ${s.originSlug}, which is not in the app's recipe book`);
				r.missingRecipes.push(s.originSlug);
				continue;
			}
			await tx`insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings)
				values (${created.id}, ${s.date}, ${s.mealType}, ${recipeId ?? null}, ${s.freeText}, ${s.servings})`;
			r.weeks.slots++;
		}
	}
	return r;
}
```

con `const count = (c: Counted, rows: unknown[]) => { c[rows.length ? 'created' : 'present']++; };`.
Prima di scriverla verifica nelle migrazioni che `app.recipes.status` abbia i valori
`draft`/`published`/`archived` e che le policy permettano al curatore-amministratore
`select` su `weeks` e `insert` su `family_ingredients`, `family_books`, `ratings`,
`family_tried_recipes` (se una manca, `STATO: DOMANDA`, niente migrazioni in questa
attività). Le provate sono scritte prima di `actAsJob`, come curatore.

- [ ] **Step 4: verifica** — stesso comando → PASS; `npm run typecheck` → PASS.

- [ ] **Step 5: commit**

```bash
git add scripts/import/load/family.ts scripts/import/load/load.db.test.ts scripts/import/load/test-origin.ts
git commit -m "Messa in produzione: dati della famiglia nel caricamento, pasti doppi fra le provate, prove di concorrenza"
```

### Task 5: Comando, report, anteprima legata e prove con `node` vero

**Files:**
- Create: `scripts/import/load.ts`, `scripts/import/load/report.ts`,
  `scripts/import/load/report.test.ts`, `scripts/import/load/command.test.ts`

**Interfaces:**
- Consumes: `checkTarget`, `connect`, `describeEndpoint`, `productionRef`, `TargetError`
  (Task 1), `inputsFingerprint` (Task 2), `loadAll`, `LoadRefused`, `dataFingerprint`,
  `repositoryHead`, `actAsJob` (Task 3).
- Produces:
  ```ts
  // load.ts
  export interface LoadArgs { mode: 'load' | 'check'; envFile: string; today?: string; familyId?: string; curatorId?: string; dryRun: boolean; confirm?: string; local: boolean }
  export function parseLoadArgs(argv: string[]): LoadArgs; // strict; throws UsageError
  export function describeError(error: unknown): string;   // no message of Postgres, ever
  // report.ts
  export function renderLoadReport(result: LoadResult, header: { endpoint: string; inputs: string }): string;
  export function loadSummary(result: LoadResult): string;
  ```

- [ ] **Step 1: test che falliscono**

```ts
// command.test.ts: argument parsing, and the real command run with node (strip-only TypeScript).
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseLoadArgs } from '../load.ts';

const run = promisify(execFile);
const uuid = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
const base = ['--env-file', '/x.env', '--today', '2026-10-13', '--family', uuid, '--curator', uuid];

async function command(args: string[], env: string) {
	const file = join(mkdtempSync(join(tmpdir(), 'load-cmd-')), 'test.env');
	writeFileSync(file, env);
	try {
		const { stdout, stderr } = await run(process.execPath, ['scripts/import/load.ts', ...args.map((a) => (a === '<env>' ? file : a))]);
		return { code: 0, out: stdout + stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, out: e.stdout + e.stderr };
	}
}

describe('parseLoadArgs', () => {
	it('reads a dry run and a confirmed load, never a load without one of the two', () => {
		expect(parseLoadArgs([...base, '--dry-run'])).toMatchObject({ mode: 'load', dryRun: true, local: false });
		expect(parseLoadArgs([...base, '--confirm', 'abcd1234abcd1234'])).toMatchObject({ dryRun: false, confirm: 'abcd1234abcd1234' });
		expect(() => parseLoadArgs(base)).toThrow(/--dry-run or --confirm/);
		expect(() => parseLoadArgs([...base, '--dry-run', '--confirm', 'x'])).toThrow(/--dry-run or --confirm/);
	});
	it('requires the arguments and refuses unknown options', () => {
		expect(() => parseLoadArgs(['--env-file', '/x', '--family', uuid, '--curator', uuid, '--dry-run'])).toThrow(/--today/);
		expect(() => parseLoadArgs([...base, '--curator', 'fede@example.com', '--dry-run'])).toThrow(/uuid/);
		expect(() => parseLoadArgs([...base, '--dryrun'])).toThrow();
	});
	it('reads --check-connection alone', () => {
		expect(parseLoadArgs(['--env-file', '/x', '--check-connection', '--local'])).toMatchObject({ mode: 'check', local: true });
	});
});

describe('the real command', () => {
	it('starts with node and refuses another project without echoing the password', async () => {
		const r = await command(['--env-file', '<env>', '--check-connection'],
			'APP_SERVER_DATABASE_URL=postgresql://app_server.abcdefghijklmnopqrst:s3cr%40t@x.pooler.supabase.com:5432/postgres?sslmode=verify-full\n');
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not app_server\.lronuqvtjdhfyychnscr/);
		expect(r.out).not.toContain('s3cr');
	});
	it('refuses a confirmation that does not match the inputs, before connecting', async () => {
		// Port 1 is closed: reaching it would give a connection error, not this refusal.
		const r = await command(['--env-file', '<env>', ...base.slice(2), '--confirm', '0000000000000000', '--local'],
			'APP_SERVER_DATABASE_URL=postgresql://app_server:s3cr3t@127.0.0.1:1/postgres\n');
		expect(r.code).toBe(1);
		expect(r.out).toContain('inputs changed since the preview');
		expect(r.out).not.toContain('s3cr3t');
	});
});
```

In `load.db.test.ts` (database necessario), due prove del comando vero:

```ts
it('runs --check-connection with node against the local database', async () => {
	// Same helper as command.test.ts, with APP_SERVER_DATABASE_URL = db.appServerUrl.
	const r = await command(['--env-file', '<env>', '--check-connection', '--local'], `APP_SERVER_DATABASE_URL=${db.appServerUrl}\n`);
	expect(r.code).toBe(0);
	expect(r.out).toMatch(/families, \d+ recipes visible to app_job/);
});
it('reports a wrong password as a code, without the password', async () => {
	const r = await command(['--env-file', '<env>', '--check-connection', '--local'], `APP_SERVER_DATABASE_URL=${db.appServerUrl.replace('app_server_test', 's3cr3t-wrong')}\n`);
	expect(r.code).toBe(1);
	expect(r.out).toMatch(/failed: \w+ 28P01/);
	expect(r.out).not.toContain('s3cr3t');
});
```

(`command` si sposta in `scripts/import/load/test-command.ts`, condiviso dai due file.)

```ts
// report.test.ts
import { describe, expect, it } from 'vitest';
import { emptyFamilyResult } from './family.ts';
import { loadSummary, renderLoadReport } from './report.ts';

const result = {
	mode: 'dry-run' as const,
	catalogue: { books: { created: 1, present: 0 }, ingredients: { created: 148, present: 0 }, equivalences: { created: 2, present: 1, diverging: ['farina: tazza→g 120 (in the database tazza→g 125)'] },
		recipes: { published: 0, drafts: 56, present: 0 }, publicationBlocked: ['ingredients.yaml'] },
	family: { ...emptyFamilyResult(), ownedBooks: ['Basta un Wok'], ratings: { created: 0, present: 0, pending: ['riso-cantonese-casa'] },
		duplicates: [{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'b' }],
		preferences: [{ originSlug: 'gamberi-zucchine-skottle', name: 'Gamberi', note: 'non proporla nelle cene per 4' }] },
	importReport: "# Report dell'import del ricettario\n\n## Ricette di casa con URL (R4)\n\n- `x`: url\n\n## Ricette provate senza data (R4)\n\n- `y`\n",
};
describe('renderLoadReport', () => {
	it('opens with mode, inputs and blocked publication, and lists what needs a look', () => {
		const text = renderLoadReport(result, { endpoint: 'app_server.lronuqvtjdhfyychnscr@pooler:5432/postgres', inputs: 'abcd1234abcd1234' });
		expect(text.split('\n').slice(0, 8).join('\n')).toMatch(/dry-run[\s\S]*abcd1234abcd1234[\s\S]*ingredients\.yaml/);
		for (const s of ['riso-cantonese-casa', 'Basta un Wok', 'farina', 'Preferenze da sistemare a mano', 'gamberi-zucchine-skottle', '`b`'])
			expect(text).toContain(s);
		expect(text).toContain('Ricette di casa con URL (R4)'); // the import report is embedded
		expect(text).toContain('Ricette provate senza data (R4)');
		expect(text).not.toMatch(/postgres(ql)?:\/\//);
	});
	it('summarises in one line', () => {
		expect(loadSummary(result)).toMatch(/^dry-run: 148 ingredients, 0 published, 56 drafts/);
	});
});
```

- [ ] **Step 2: verifica che falliscano** — Run: `npx vitest run scripts/import/load` → FAIL.

- [ ] **Step 3: implementazione**

`report.ts`: Markdown in italiano, titolo `# Caricamento (<mode>)`, poi endpoint e
impronta degli input, poi avviso in grassetto se `publicationBlocked` non è vuoto
(«Nessuna pubblicazione: file da approvare …»), tabella dei conteggi (catalogo e
famiglia), poi sezioni «Preferenze da sistemare a mano» (ricetta e nota), «Equivalenze
divergenti, conservate», «Voti in sospeso», «Libri posseduti», «Ricette dello storico
assenti», «Pasti doppi: passati fra le provate», «Note del menu in corso non
importate», «Casi dello storico (R4)» da `family.findings`; infine il report
dell'import (`importReport`) con i titoli abbassati di un livello. `loadSummary`:
`${mode}: ${ingredients.created} ingredients, ${published} published, ${drafts} drafts,
${weeks.created} weeks, ${ratings.created} ratings (${pending.length} pending),
${preferences.length} preferences to settle`.

`load.ts`:

```ts
// Production load of the recipe book and the family's data (detail spec, section 6).
// Usage: node scripts/import/load.ts --env-file <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> (--dry-run | --confirm <inputs>) [--local]
//        node scripts/import/load.ts --env-file <file> --check-connection [--local]
// Reads APP_SERVER_DATABASE_URL from the file; never prints it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { originDir } from '../planner-data/origin.ts';
import { isValidIsoDate } from './family.ts';
import { inputsFingerprint } from './load/inputs-fingerprint.ts';
import { loadSummary, renderLoadReport } from './load/report.ts';
import { actAsJob, dataFingerprint, LoadRefused, loadAll, repositoryHead } from './load/run.ts';
import { checkTarget, connect, describeEndpoint, productionRef, TargetError } from './load/target.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class UsageError extends Error {}
export interface LoadArgs { mode: 'load' | 'check'; envFile: string; today?: string; familyId?: string; curatorId?: string; dryRun: boolean; confirm?: string; local: boolean }

export function parseLoadArgs(argv: string[]): LoadArgs {
	let values;
	try {
		({ values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
			'env-file': { type: 'string' }, today: { type: 'string' }, family: { type: 'string' }, curator: { type: 'string' },
			'dry-run': { type: 'boolean' }, confirm: { type: 'string' }, local: { type: 'boolean' }, 'check-connection': { type: 'boolean' },
		} }));
	} catch {
		throw new UsageError('unknown or malformed option');
	}
	if (!values['env-file']) throw new UsageError('--env-file <file> is required');
	const local = values.local === true;
	if (values['check-connection']) return { mode: 'check', envFile: values['env-file'], dryRun: true, local };
	if (!values.today || !isValidIsoDate(values.today)) throw new UsageError('--today <YYYY-MM-DD> is required');
	if (!values.family || !UUID.test(values.family)) throw new UsageError('--family <uuid> is required');
	if (!values.curator || !UUID.test(values.curator)) throw new UsageError('--curator must be the uuid of the curator (the UID column of Supabase Auth)');
	if ((values['dry-run'] === true) === (values.confirm !== undefined)) throw new UsageError('give either --dry-run or --confirm <inputs>');
	return { mode: 'load', envFile: values['env-file'], today: values.today, familyId: values.family, curatorId: values.curator, dryRun: values['dry-run'] === true, confirm: values.confirm, local };
}

/** Our own refusals carry their reason; anything else only its name and code (a Postgres message may quote values). */
export function describeError(error: unknown): string {
	if (error instanceof UsageError || error instanceof TargetError || error instanceof LoadRefused) return `refused: ${error.message}`;
	const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^([0-9A-Z]{5}|E[A-Z]+)$/.test(error.code) ? ` ${error.code}` : '';
	return `failed: ${error instanceof Error ? error.name : 'unknown'}${code}`;
}

async function main() {
	const args = parseLoadArgs(process.argv.slice(2));
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const env = parseEnv(readFileSync(args.envFile, 'utf8'));
	const { endpoint, destination } = checkTarget('APP_SERVER_DATABASE_URL', env.APP_SERVER_DATABASE_URL, { role: 'app_server', target: args.local ? 'local' : 'production', ref: productionRef(root) });
	const where = describeEndpoint(endpoint);
	let inputs = '';
	if (args.mode === 'load') {
		inputs = inputsFingerprint({ originDirectory: originDir(root), importDirectory: join(root, 'scripts/import'), head: repositoryHead(root), today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, endpoint: where });
		if (!args.dryRun && args.confirm !== inputs) throw new LoadRefused('inputs changed since the preview: run --dry-run again');
	}
	const sql = connect(destination);
	try {
		if (args.mode === 'check') {
			const [row] = await sql.begin(async (tx) => {
				await actAsJob(tx);
				return tx<{ families: number; recipes: number }[]>`select (select count(*)::int from app.families) as families, (select count(*)::int from app.recipes) as recipes`;
			});
			console.log(`${where}: ${row!.families} families, ${row!.recipes} recipes visible to app_job`);
			return;
		}
		const result = await loadAll(sql, { today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, root, dryRun: args.dryRun });
		const out = resolve(root, 'scripts/import/out');
		mkdirSync(out, { recursive: true });
		writeFileSync(resolve(out, 'load-report.md'), renderLoadReport(result, { endpoint: where, inputs }));
		console.log(loadSummary(result));
		if (args.dryRun) console.log(`Inputs ${inputs}. Load with: --confirm ${inputs}`);
		else console.log(`Data fingerprint after the load: ${await dataFingerprint(sql, root)} (write it in the coordination log)`);
	} finally {
		await sql.end().catch(() => {});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		console.error(describeError(error));
		process.exitCode = 1;
	});
}
```

Nota: il controllo dell'impronta degli input avviene prima di `connect`; un errore
dell'origine (file mancante) è un'eccezione propria e si stampa per nome.
`parseEnv` è di `node:util` (Node ≥ 21.7): lo script non tocca `process.env`.

- [ ] **Step 4: verifica** — Run: `npx vitest run scripts/import && npm run typecheck` → PASS (anche con `TEST_DATABASE_URL`).

- [ ] **Step 5: prova completa con i dati veri sullo stack locale**

Stack con Auth (`supabase start -x …` come in `supabase/README.md`), `supabase db
reset`, utente curatore e famiglia di prova con `bootstrap_test.sh` o a mano, poi dalla
radice del worktree:

```bash
printf 'APP_SERVER_DATABASE_URL=postgresql://app_server:app_server_test@127.0.0.1:54322/postgres\n' > "$TMPDIR/load-local.env"  # solo locale, password dei test
node scripts/import/load.ts --env-file "$TMPDIR/load-local.env" --today 2026-10-13 --family <uuid> --curator <uuid> --local --dry-run
node scripts/import/load.ts --env-file "$TMPDIR/load-local.env" --today 2026-10-13 --family <uuid> --curator <uuid> --local --confirm <impronta stampata>
node scripts/import/load.ts --env-file "$TMPDIR/load-local.env" --today 2026-10-13 --family <uuid> --curator <uuid> --local --dry-run
```

Expected: primo e secondo uguali nei conteggi (148 ingredienti, 2 libri, ricette
pubblicate e bozze come nella prova di W6: 50 e 6), settimana 12–18 ottobre come «menu
in corso», `gamberi-zucchine-skottle` fra le preferenze da sistemare; il secondo stampa
l'impronta dei dati; terzo con «0» creati ovunque. Poi Worker locale (`wrangler dev`)
con la build vera e controllo a vista: menu della settimana uguale a
`../meal_planner/menu/2026-10-12/menu.yaml`, impostazioni come la tabella di
`supabase/README.md`. Annota i numeri nella descrizione della PR.

- [ ] **Step 6: commit**

```bash
git add scripts/import/load.ts scripts/import/load/report.ts scripts/import/load/report.test.ts scripts/import/load/command.test.ts scripts/import/load/test-command.ts scripts/import/load/load.db.test.ts
git commit -m "Messa in produzione: comando di caricamento con anteprima legata agli input, report con l'import, errori senza dati"
```

### Task 6: Configurazione del rilascio e `.gitignore`

**Files:**
- Create: `scripts/release.config.json`, `scripts/gitignore.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: test che fallisce** — nessun file creato o cancellato:

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// --no-index: the rules alone decide, and the paths need not exist. Nothing is created or removed.
const ignored = (path: string) => {
	try {
		execFileSync('git', ['check-ignore', '--no-index', '-q', path]);
		return true;
	} catch {
		return false;
	}
};

describe('.gitignore', () => {
	it('keeps credentials out and lets the public build values in', () => {
		expect(ignored('.env.production.local')).toBe(true);
		expect(ignored('web/.env.production.local')).toBe(true);
		expect(ignored('web/.env.local')).toBe(true);
		expect(ignored('web/.env.production')).toBe(false);
	});
});
```

Run: `npx vitest run scripts/gitignore.test.ts` → FAIL sull'ultima riga.

- [ ] **Step 2: implementazione** — `.gitignore`: dopo `!.env.example` aggiungi
  `!web/.env.production`. `scripts/release.config.json`:
  `{ "productionUrl": null, "requiredSecrets": ["BACKUP_ENCRYPTION_KEY"] }`.

- [ ] **Step 3: verifica** — stesso comando → PASS.

- [ ] **Step 4: commit**

```bash
git add .gitignore scripts/release.config.json scripts/gitignore.test.ts
git commit -m "Messa in produzione: valori pubblici della build versionati, configurazione del rilascio"
```

### Task 7: Rilascio in due tempi

**Files:**
- Create: `scripts/release.ts`, `scripts/release.test.ts`
- Modify: `package.json` (script `"release": "node scripts/release.ts"`)

**Interfaces:**
- Consumes: `checkTarget`, `productionRef` (Task 1).
- Produces:
  ```ts
  export type Run = (cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => { status: number; stdout: string };
  export interface Deps { run: Run; fetch: typeof fetch; readFile: (path: string) => string | null; distFiles: () => string[]; tmpDir: () => string }
  export interface Problem { check: string; message: string }
  export interface Preview { sha: string | null; problems: Problem[]; firstRelease: boolean; migrationsPending: boolean; buildEnv: Record<string, string> }
  export const CHECK_TOKEN: string; // 48 zeros: the format the Bring! page sends to the database
  export function redact(text: string, secrets: string[]): string;
  export function parseJsonc(text: string): unknown;   // full-line // comments only
  export async function preview(deps: Deps, env: NodeJS.ProcessEnv): Promise<Preview>;
  export async function apply(deps: Deps, env: NodeJS.ProcessEnv, sha: string): Promise<{ problems: Problem[]; url: string | null }>;
  export async function smokeChecks(baseUrl: string, fetchFn: typeof fetch): Promise<Problem[]>;
  ```

- [ ] **Step 1: test che falliscono** (`release.test.ts`, con dipendenze finte che
  registrano ogni comando)

```ts
import { describe, expect, it } from 'vitest';
import { apply, CHECK_TOKEN, parseJsonc, preview, redact, smokeChecks, type Deps, type Run } from './release.ts';

const ref = 'lronuqvtjdhfyychnscr';
const ok = (stdout = '') => ({ status: 0, stdout });
const fail = (stdout = '') => ({ status: 1, stdout });
const WRANGLER = `{
	// comment with https://example.com
	"name": "cosasimangia",
	"account_id": "acc",
	"vars": { "SUPABASE_URL": "https://${ref}.supabase.co" },
	"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "abc123" }],
	"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
}`;
const WEB_ENV = `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n`;
const env = { POSTGRES_DATABASE_URL: `postgresql://postgres.${ref}:pw-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt` };

function fakeDeps(over: { run?: Record<string, ReturnType<Run>>; files?: Record<string, string | null>; dist?: string; fetchStatus?: number } = {}) {
	const calls: string[] = [];
	const files: Record<string, string | null> = { 'server/wrangler.jsonc': WRANGLER, 'web/.env.production': WEB_ENV, 'scripts/production-target.json': `{"supabaseRef":"${ref}"}`,
		'scripts/release.config.json': '{"productionUrl":null,"requiredSecrets":["BACKUP_ENCRYPTION_KEY"]}', 'supabase/.temp/project-ref': null,
		'web/.env.local': null, 'web/.env.production.local': null, '/ca.crt': 'CA', ...over.files };
	const run: Run = (cmd, args) => {
		const key = `${cmd} ${args.join(' ')}`;
		calls.push(key);
		for (const [k, v] of Object.entries(over.run ?? {})) if (key.startsWith(k)) return v;
		if (key.startsWith('git rev-parse --abbrev-ref')) return ok('main\n');
		if (key.startsWith('git status --porcelain')) return ok('');
		if (key.startsWith('git rev-parse')) return ok('abc123\n');
		if (key.startsWith('gh run list')) return ok('[{"conclusion":"success"}]');
		if (key.startsWith('npx wrangler deployments list')) return ok('[{"id":"v1"}]');
		if (key.startsWith('npx wrangler secret list')) return ok('[{"name":"BACKUP_ENCRYPTION_KEY"}]');
		if (key.startsWith('supabase db push --dry-run')) return ok('Would push these migrations:\n • 20261012110000_backup.sql\n');
		if (key.startsWith('npx wrangler deploy') && !key.includes('--dry-run')) return ok('https://cosasimangia.powa.workers.dev\n');
		return ok('');
	};
	const deps: Deps = {
		run,
		fetch: (async () => new Response('{}', { status: over.fetchStatus ?? 200 })) as typeof fetch,
		readFile: (p) => (p in files ? files[p]! : null),
		distFiles: () => [over.dist ?? `x="https://${ref}.supabase.co";k="sb_publishable_abc"`],
		tmpDir: () => '/tmp/release-test',
	};
	return { deps, calls };
}
const checks = async (o: Parameters<typeof fakeDeps>[0], e: NodeJS.ProcessEnv = env) => (await preview(fakeDeps(o).deps, e)).problems.map((p) => p.check);
const supabaseCalls = (calls: string[]) => calls.filter((c) => c.startsWith('supabase'));

describe('preview', () => {
	it('passes on a clean, green main, sending migrations only to the verified url', async () => {
		const { deps, calls } = fakeDeps();
		const p = await preview(deps, env);
		expect(p).toMatchObject({ sha: 'abc123', problems: [], firstRelease: false, migrationsPending: true });
		expect(supabaseCalls(calls)).toHaveLength(1);
		expect(supabaseCalls(calls)[0]).toContain('--db-url');
		expect(calls.some((c) => c.includes('--linked'))).toBe(false);
		expect(calls.some((c) => c.includes('pw-secret'))).toBe(false); // the password goes in PGPASSWORD
	});
	it('refuses another branch, a dirty tree, a commit behind origin and a red CI', async () => {
		expect(await checks({ run: { 'git rev-parse --abbrev-ref': ok('feature\n') } })).toContain('branch');
		expect(await checks({ run: { 'git status --porcelain': ok(' M x\n') } })).toContain('clean');
		expect(await checks({ run: { 'git rev-parse origin/main': ok('def456\n') } })).toContain('pushed');
		expect(await checks({ run: { 'gh run list': ok('[{"conclusion":"failure"}]') } })).toContain('ci');
	});
	it('runs no supabase command when the url points elsewhere or a different project is linked', async () => {
		for (const [o, e] of [
			[{}, { POSTGRES_DATABASE_URL: env.POSTGRES_DATABASE_URL.replace(`postgres.${ref}`, 'postgres.abcdefghijklmnopqrst') }],
			[{ files: { 'supabase/.temp/project-ref': 'abcdefghijklmnopqrst' } }, env],
		] as const) {
			const { deps, calls } = fakeDeps(o);
			const p = await preview(deps, e);
			expect(p.problems.map((x) => x.check)).toEqual(expect.arrayContaining([expect.stringMatching(/target|linked-project/)]));
			expect(supabaseCalls(calls)).toEqual([]);
		}
	});
	it('refuses a SPA url or a Worker url of another project', async () => {
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace(ref, 'abcdefghijklmnopqrst') } })).toContain('project-mismatch');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace(`https://${ref}`, 'https://abcdefghijklmnopqrst') } })).toContain('project-mismatch');
	});
	it('refuses build overrides, a placeholder or empty key, a key the project rejects, and a build without the exact values', async () => {
		expect(await checks({ files: { 'web/.env.production.local': 'VITE_SUPABASE_URL=http://127.0.0.1:54321\n' } })).toContain('vite-override');
		expect(await checks({}, { ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'x' })).toContain('vite-override');
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace('sb_publishable_abc', '') } })).toContain('vite-env');
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace('sb_publishable_abc', 'sb_publishable_REPLACE_ME') } })).toContain('vite-env');
		expect(await checks({ fetchStatus: 401 })).toContain('publishable-key');
		expect(await checks({ dist: `x="https://${ref}.supabase.co";k="sb_publishable_other"` })).toContain('build');
		expect(await checks({ run: { 'npm run build': fail() } })).toContain('build');
	});
	it('refuses the Worker prerequisites that are missing', async () => {
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('abc123', '00000000000000000000000000000000') } })).toContain('hyperdrive');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"account_id": "acc",', '') } })).toContain('account');
		expect(await checks({ run: { 'npx wrangler r2 bucket info': fail() } })).toContain('r2');
		expect(await checks({ run: { 'npx wrangler secret list': ok('[]') } })).toContain('secrets');
	});
	it('knows the first release: no secrets to check yet', async () => {
		const { deps } = fakeDeps({ run: { 'npx wrangler deployments list': fail('[code: 10007] This Worker does not exist') } });
		expect(await preview(deps, env)).toMatchObject({ problems: [], firstRelease: true });
	});
});

describe('apply', () => {
	it('builds and checks before any production write, then pushes, deploys with the tag and checks', async () => {
		const { deps, calls } = fakeDeps();
		const r = await apply(deps, env, 'abc123');
		expect(r.problems).toEqual([]);
		const order = (prefix: string) => calls.findIndex((c) => c.startsWith(prefix));
		expect(order('npm run build')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('npx wrangler deploy --dry-run')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('supabase db push --db-url')).toBeLessThan(order('npx wrangler deploy --tag abc123'));
	});
	it('writes nothing when the commit differs or the build fails', async () => {
		for (const [o, sha] of [[{}, 'other'], [{ run: { 'npm run build': fail() } }, 'abc123']] as const) {
			const { deps, calls } = fakeDeps(o);
			expect((await apply(deps, env, sha)).problems).not.toEqual([]);
			expect(calls.some((c) => c.startsWith('supabase db push --db-url'))).toBe(false);
			expect(calls.some((c) => c.startsWith('npx wrangler deploy --tag'))).toBe(false);
		}
	});
});

describe('smokeChecks', () => {
	it('sends a well-formed absent token, so the database is really reached', async () => {
		expect(CHECK_TOKEN).toMatch(/^[0-9a-f]{48}$/);
		const answers: Record<string, [number, string]> = {
			'/api/openapi.json': [200, '{}'], '/api/session/whoami': [401, ''], '/mcp': [401, ''],
			'/.well-known/oauth-protected-resource/mcp': [200, '{"resource":"https://x/mcp"}'], '/menu': [200, '<html>'],
		};
		// Like bring-page.ts: only a 48-hex token reaches the database; here the database answers "absent".
		const fetchFn = (async (url: string) => {
			const path = new URL(url).pathname;
			if (path.startsWith('/shopping-lists/')) return new Response('', { status: /^\/shopping-lists\/[0-9a-f]{48}$/.test(path) ? 404 : 500 });
			const [status, body] = answers[path]!;
			return new Response(body, { status });
		}) as typeof fetch;
		expect(await smokeChecks('https://x', fetchFn)).toEqual([]);
	});
	it('reports a 500 on the page that touches the database', async () => {
		const fetchFn = (async (url: string) => new Response('', { status: new URL(url).pathname.startsWith('/shopping-lists/') ? 500 : 200 })) as typeof fetch;
		expect((await smokeChecks('https://x', fetchFn)).map((p) => p.check)).toContain('database');
	});
});

describe('helpers', () => {
	it('redacts every secret from child output', () => {
		expect(redact('connecting to postgresql://u:pw-secret@h', ['pw-secret'])).toBe('connecting to postgresql://u:***@h');
	});
	it('parses the Worker configuration with comment lines and urls in strings', () => {
		expect(parseJsonc(WRANGLER)).toMatchObject({ vars: { SUPABASE_URL: `https://${ref}.supabase.co` } });
	});
});
```

E un test del comando vero: `node scripts/release.ts --preview --env-file <file
inesistente>` esce con 1 e «credentials file not found» (prova la sintassi
cancellabile dell'intero modulo).

- [ ] **Step 2: verifica che falliscano** — Run: `npx vitest run scripts/release.test.ts` → FAIL.

- [ ] **Step 3: implementazione** — `scripts/release.ts`:

- `preview(deps, env)`, nell'ordine della spec (sezione 7), raccoglie i problemi e
  **non lancia comandi che toccano la produzione se un controllo precedente è
  fallito**: (1) git e CI; (2) `checkTarget('POSTGRES_DATABASE_URL', …, { role:
  'postgres', target: 'production', ref })`, `supabase/.temp/project-ref` assente o
  uguale a `ref` (`linked-project`), host di `VITE_SUPABASE_URL` e `vars.SUPABASE_URL`
  uguali a `https://<ref>.supabase.co` (`project-mismatch`); (3) `parseJsonc` di
  `server/wrangler.jsonc`: `account_id` (`account`), id di Hyperdrive non di soli zeri
  (`hyperdrive`), `npx wrangler r2 bucket info <bucket> --jurisdiction <j>` per ogni
  voce (`r2`), `npx wrangler deployments list --json` (stato ≠ 0 con «10007» →
  `firstRelease`; altro errore → problema `deployments`), se non è il primo rilascio
  `npx wrangler secret list --format json` con tutti i `requiredSecrets` (`secrets`);
  (4) `web/.env.local` e `web/.env.production.local` assenti e nessuna `VITE_*` in `env`
  (`vite-override`), due valori validi (`vite-env`), `GET https://<ref>.supabase.co/auth/v1/settings`
  con `apikey` → 200 (`publishable-key`), `npm run build -w web` con `env` senza
  `VITE_*` più i due valori (`build` se fallisce), `deps.distFiles()` contiene URL e
  chiave esatti (`build`), `npx wrangler deploy --dry-run --outdir <tmp>` in `server/`
  (`worker-build`); (5) solo se tutto è passato, `supabase db push --dry-run --db-url
  <url senza password>` con `PGPASSWORD` nell'ambiente del figlio; `migrationsPending`
  se l'output non contiene «Remote database is up to date».
- `apply(deps, env, sha)`: `preview`; se ha problemi o `sha` diverso, si ferma senza
  altro. Poi `supabase db push --db-url …` (se `migrationsPending`), `npx wrangler
  deploy --tag <sha> --message "release <sha>"` in `server/` (la build è già in
  `web/dist`, fatta dall'anteprima di questo stesso `apply`), `smokeChecks` su
  `productionUrl` o, se manca, sull'indirizzo `workers.dev` letto dall'output del
  deploy, stampato da scrivere con una PR. Se `firstRelease`, termina con il passo
  obbligatorio «`! npx wrangler secret put BACKUP_ENCRYPTION_KEY` (da `server/`) prima
  delle 02:30».
- `Run` reale: `spawnSync` senza shell, output catturato e stampato dopo `redact` con
  la password estratta da `POSTGRES_DATABASE_URL`; mai l'ambiente.
- `main`: `--preview` | `--apply <sha>` (strict), `--env-file <path>` (default
  `/Users/fedfol/Projects/meal_planner_2/.env.production.local`), letto con `parseEnv`
  in un oggetto passato ai figli che ne hanno bisogno; mai `process.env` stampato.
  Stampa i problemi e esce con 1, oppure `Release preview OK for <sha>. Apply with: npm
  run release -- --apply <sha>`.
- Prima di scrivere i comandi, verifica con Context7 (Wrangler della versione di
  `server/package.json`, CLI di Supabase 2.120): `r2 bucket info --jurisdiction`,
  `deployments list --json`, `secret list --format json`, `deploy --tag --message
  --dry-run --outdir`, `db push --db-url --dry-run` e il messaggio «up to date»; e sullo
  stack locale che `supabase db push --dry-run --db-url
  postgresql://postgres@127.0.0.1:54322/postgres` con `PGPASSWORD=postgres` funzioni.
  Se la CLI non legge `PGPASSWORD`, la password resta nell'argomento (processo locale)
  e il test «nessuna password nei comandi» diventa «nessuna password nell'output»: lo
  si scrive nella PR.

- [ ] **Step 4: verifica** — Run: `npx vitest run scripts/release.test.ts && npm run typecheck` → PASS.

- [ ] **Step 5: commit**

```bash
git add scripts/release.ts scripts/release.test.ts package.json
git commit -m "Messa in produzione: rilascio in due tempi, build e prerequisiti verificati prima di scrivere, migrazioni sulla URL controllata"
```

### Task 8: SQL sulla produzione, impronta, rimozione della famiglia e azzeramento

**Files:**
- Create: `scripts/prod-sql.sh`, `scripts/prod-sql-target.ts`,
  `supabase/scripts/app-fingerprint.sql`, `show-fingerprint.sql`, `remove-family.sql`,
  `reset-app-data.sql`, `check-first-generation.sql`,
  `vitest.destructive.config.ts`, `scripts/destructive/service-sql.test.ts`,
  `scripts/destructive/first-check-reads.test.ts`
- Modify: `.github/workflows/ci.yml` (un passo dopo `test:drill`)

- [ ] **Step 1: test che falliscono**

`vitest.destructive.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Service SQL that empties the database (detail spec, section 8): last in CI, after the restore drill.
export default defineConfig({
	test: {
		include: ['scripts/destructive/**/*.test.ts'],
		globalSetup: ['server/test/global-setup.ts'],
		fileParallelism: false,
		testTimeout: 120_000,
	},
});
```

`scripts/destructive/service-sql.test.ts` (attivo solo con `CI` o
`DESTRUCTIVE_TESTS=1`, come la prova di ripristino; usa `scripts/prod-sql.sh` vero con
`PROD_SQL_TARGET=local`, un file di credenziali temporaneo con
`POSTGRES_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` e
`CONTAINER_CLI` dall'ambiente):

```ts
// sqlFile(file, mode, sets, confirm?) runs the real script and returns { code, out }; fingerprint() runs
// show-fingerprint.sql and parses the value; fixture() makes a family with a loaded catalogue via loadAll.
describe.skipIf(!enabled)('service SQL on the local stack', () => {
	it('refuses a file without a single begin/commit, and --apply without the preview sha, before connecting', async () => { … });
	it('refuses the production target with a local url', async () => { … });
	it('prints the same fingerprint as the load', async () => {
		// loadAll writes, dataFingerprint (as app_backup) and show-fingerprint.sql (as postgres) agree.
	});
	it('removes an unused family only with the recorded fingerprint, keeping the catalogue', async () => { … });

	const writes: [string, (admin: postgres.Sql, f: Fixture) => Promise<unknown>][] = [
		['rating changed', (a, f) => a`update app.ratings set stars = 5 where user_id = ${f.curator}`],
		['free shopping item', (a, f) => a`insert into app.shopping_list_items (shopping_list_id, text) values (${f.shoppingListId}, 'pane')`],
		['settings changed', (a, f) => a`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${f.familyId}`],
		['owned book removed', (a, f) => a`delete from app.family_books where family_id = ${f.familyId}`],
		['exclusion added', (a, f) => a`insert into app.recipe_exclusions (family_id, recipe_id) values (${f.familyId}, ${f.recipeId})`],
		['ingredient renamed', (a, f) => a`update app.ingredients set synonyms = '{"it-IT":["x"]}' where id = ${f.ingredientId}`],
		['equivalence changed', (a, f) => a`update app.ingredient_unit_equivalences set factor = factor + 1 where ingredient_id = ${f.ingredientId}`],
		['recipe archived', (a, f) => a`update app.recipes set status = 'archived' where id = ${f.recipeId}`],
	];
	for (const [what, write] of writes)
		it(`refuses reset and removal after: ${what}`, async () => {
			const f = await fixture();
			const before = await fingerprint();
			await write(admin, f);
			const afterWrite = await rowCounts(); // rows of every app table, taken once
			for (const file of ['supabase/scripts/reset-app-data.sql', 'supabase/scripts/remove-family.sql']) {
				const r = await sqlFile(file, '--apply', { expected_fingerprint: before, family_id: f.familyId }, sha(file));
				expect(r.code).not.toBe(0);
				expect(r.out).toContain('app data changed since the load');
			}
			expect(await rowCounts()).toEqual(afterWrite); // nothing removed
		});

	it('waits for a concurrent write, then refuses', async () => {
		// Connection B inserts a rating and holds the transaction open; the reset starts and blocks on its
		// locks (pg_stat_activity shows it waiting); B commits; the reset compares and refuses. Nothing removed.
	});
	it('resets with the recorded fingerprint: catalogue and families empty, profiles and roles kept', async () => { … });
	it('reports the first generation of the cron', async () => {
		// weeks row with generated_at and weekly_jobs row done for the same week → cron_generated true;
		// a week with no weekly_jobs row (lazy generation) → cron_generated false.
	});
	it('stops bootstrap.sql on the example uuid (ON_ERROR_STOP reaches psql)', async () => { … });
});
```

(I corpi abbreviati con `…` seguono lo schema dei casi scritti per intero: comando
vero, codice d'uscita, testo atteso, conteggi delle righe prima e dopo. Le espressioni
`update app.recipes set status = 'archived'` e simili si sostituiscono con le funzioni
del server se un trigger impedisce la scrittura diretta: lo scopo è una riga cambiata.)

`scripts/destructive/first-check-reads.test.ts`: con il fixture caricato e gli aiuti
dei test del server (`server/test/support/requests.ts`, `keys.ts`), esegue come
Federico le letture del primo collaudo (sessione, famiglia, menu della settimana
corrente, ricettario con bozze, impostazioni) e controlla che l'impronta non cambi. Se
una lettura scrive, il test fallisce indicandola: si toglie dal primo collaudo nella
spec e nel runbook, non si cambia il server.

Run: `DESTRUCTIVE_TESTS=1 TEST_DATABASE_URL=… npx vitest run -c vitest.destructive.config.ts` → FAIL (file assenti).

- [ ] **Step 2: SQL di servizio**

`supabase/scripts/app-fingerprint.sql` (senza `begin`/`commit`: `prod-sql.sh` lo invia
prima di ogni file, `dataFingerprint` lo esegue nella sua transazione):

```sql
-- Fingerprint of every row of schema app (detail spec of the production launch, section 8): the
-- condition for removing a family or resetting the data. Any write after the load changes it.
-- Excluded: profile_preferences (display preferences, no content of the family).
create or replace function pg_temp.app_fingerprint() returns text language plpgsql as $$
declare
	v_table text;
	v_hash text;
	v_all text := '';
begin
	for v_table in
		select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' and c.relname not in ('profile_preferences')
		order by c.relname
	loop
		execute format('select md5(coalesce(string_agg(t::text, %L order by t::text), %L)) from app.%I t', E'\n', '', v_table) into v_hash;
		v_all := v_all || v_table || ':' || v_hash || E'\n';
	end loop;
	return md5(v_all);
end;
$$;
```

`supabase/scripts/show-fingerprint.sql`:

```sql
-- Prints the fingerprint of schema app (read only). Run with scripts/prod-sql.sh --preview.
begin;
select pg_temp.app_fingerprint() as fingerprint;
commit;
```

`supabase/scripts/remove-family.sql`:

```sql
-- Removes a family nobody has used yet (detail spec of the production launch, sections 5 and 8):
-- only when schema app is exactly as the load left it. The catalogue and the ratings stay.
-- Run: scripts/prod-sql.sh --preview supabase/scripts/remove-family.sql --set family_id=<uuid> --set expected_fingerprint=<fp>
begin;

select set_config('w6.expected_fingerprint', :'expected_fingerprint', true), set_config('w6.family_id', :'family_id', true);

do $$
declare
	v_table text;
	v_now text;
begin
	-- Every table first: a concurrent write waits, and the fingerprint below cannot change before the delete.
	for v_table in select format('app.%I', c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' order by c.relname
	loop
		execute format('lock table %s in exclusive mode', v_table);
	end loop;
	v_now := pg_temp.app_fingerprint();
	if v_now is distinct from current_setting('w6.expected_fingerprint') then
		raise exception 'app data changed since the load (fingerprint %, expected %): nothing removed', v_now, current_setting('w6.expected_fingerprint');
	end if;
	if not exists (select 1 from app.families where id = current_setting('w6.family_id')::uuid) then
		raise exception 'family % not found: nothing removed', current_setting('w6.family_id');
	end if;
end;
$$;

select 'weeks' as rows_removed, count(*) from app.weeks where family_id = :'family_id'::uuid
union all select 'meal_slots', count(*) from app.meal_slots s join app.weeks w on w.id = s.week_id where w.family_id = :'family_id'::uuid
union all select 'family_members', count(*) from app.family_members where family_id = :'family_id'::uuid;

delete from app.families where id = :'family_id'::uuid;

commit;
```

`supabase/scripts/reset-app-data.sql`:

```sql
-- Empties the catalogue and every family's data, keeping schema, users, profiles and global roles
-- (detail spec of the production launch, section 8). Only when schema app is exactly as the load left it.
-- Run: scripts/prod-sql.sh --preview supabase/scripts/reset-app-data.sql --set expected_fingerprint=<fp>
begin;

select set_config('w6.expected_fingerprint', :'expected_fingerprint', true);

do $$
declare
	v_table text;
	v_now text;
begin
	for v_table in select format('app.%I', c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' order by c.relname
	loop
		execute format('lock table %s in access exclusive mode', v_table);
	end loop;
	v_now := pg_temp.app_fingerprint();
	if v_now is distinct from current_setting('w6.expected_fingerprint') then
		raise exception 'app data changed since the load (fingerprint %, expected %): nothing reset', v_now, current_setting('w6.expected_fingerprint');
	end if;
end;
$$;

select 'families' as rows_removed, count(*) from app.families
union all select 'weeks', count(*) from app.weeks
union all select 'meal_slots', count(*) from app.meal_slots
union all select 'ratings', count(*) from app.ratings
union all select 'recipes', count(*) from app.recipes
union all select 'ingredients', count(*) from app.ingredients
union all select 'books', count(*) from app.books;

truncate app.families, app.recipes, app.ingredients, app.books cascade;

commit;
```

Prima di scriverlo verifica nelle migrazioni che `truncate … cascade` da queste quattro
tabelle raggiunga tutte le tabelle che le citano e nessuna di quelle da tenere
(`profiles`, `user_roles`): `select conrelid::regclass, confrelid::regclass from
pg_constraint where contype = 'f' and connamespace = 'app'::regnamespace`. Il test
«resets with the recorded fingerprint» lo controlla.

`supabase/scripts/check-first-generation.sql`:

```sql
-- Was the first app week made by the Wednesday cron? (detail spec, section 5). Read only.
-- The job inserts its weekly_jobs row only when the week is missing at dispatch: a lazy generation
-- leaves none. Run: scripts/prod-sql.sh --preview supabase/scripts/check-first-generation.sql --set family_id=<uuid> --set week_start=<monday>
begin;
select w.starts_on, w.generated_at at time zone f.time_zone as generated_local,
	j.status, j.attempts, j.updated_at at time zone f.time_zone as job_local,
	coalesce(j.status = 'done' and w.generated_at <= j.updated_at and w.generated_at >= date_trunc('hour', j.updated_at), false) as cron_generated
from app.families f
join app.weeks w on w.family_id = f.id and w.starts_on = :'week_start'::date
left join app.weekly_jobs j on j.family_id = f.id and j.target_week = w.starts_on
where f.id = :'family_id'::uuid;
commit;
```

- [ ] **Step 3: `scripts/prod-sql-target.ts` e `scripts/prod-sql.sh`**

```ts
// Checks POSTGRES_DATABASE_URL of a credentials file (detail spec, section 2) for scripts/prod-sql.sh:
// the endpoint goes to stderr, the checked url to stdout (captured by the script, never shown).
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { checkTarget, describeEndpoint, productionRef } from './import/load/target.ts';

const [file, target] = process.argv.slice(2);
try {
	const env = parseEnv(readFileSync(file!, 'utf8'));
	const { endpoint } = checkTarget('POSTGRES_DATABASE_URL', env.POSTGRES_DATABASE_URL, { role: 'postgres', target: target === 'local' ? 'local' : 'production', ref: productionRef(process.cwd()) });
	console.error(`Target: ${describeEndpoint(endpoint)}`);
	process.stdout.write(env.POSTGRES_DATABASE_URL!);
} catch (error) {
	console.error(error instanceof Error && error.name === 'TargetError' ? `refused: ${error.message}` : 'refused: credentials file not readable');
	process.exitCode = 1;
}
```

```bash
#!/usr/bin/env bash
# SQL on the production database with a preview bound to the file (detail spec, section 8).
# Usage: scripts/prod-sql.sh --preview <file.sql> [--set name=value ...]
#        scripts/prod-sql.sh --apply <file.sql> --confirm <sha256> [--set name=value ...]
# Environment: PROD_CREDENTIALS (credentials file), PROD_SQL_TARGET=local (tests only),
# CONTAINER_CLI (podman by default, docker in CI). The connection string is never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/podman/bin:$PATH
usage() { echo "usage: scripts/prod-sql.sh --preview|--apply <file.sql> [--confirm <sha256>] [--set name=value ...]" >&2; exit 2; }
MODE=${1:-}; FILE=${2:-}
[ "$MODE" = --preview ] || [ "$MODE" = --apply ] || usage
[ -f "$FILE" ] || usage
shift 2
CONFIRM=""; VARS=(); SETS=""
while [ $# -gt 0 ]; do
	case "$1" in
		--confirm) CONFIRM=${2:-}; shift 2 ;;
		--set) [[ "${2:-}" =~ ^[a-z_]+=[0-9A-Za-z_-]+$ ]] || { echo "--set name=value: letters, digits, - and _ only" >&2; exit 2; }; VARS+=(-v "$2"); SETS="$SETS --set $2"; shift 2 ;;
		*) usage ;;
	esac
done
[ "$(grep -c '^begin;$' "$FILE")" = 1 ] && [ "$(grep -c '^commit;$' "$FILE")" = 1 ] || { echo "The file needs exactly one 'begin;' and one 'commit;' line" >&2; exit 2; }
SHA=$(shasum -a 256 "$FILE" | cut -d' ' -f1)
if [ "$MODE" = --apply ] && [ "$CONFIRM" != "$SHA" ]; then echo "The file changed since the preview, or --confirm is missing: run --preview again" >&2; exit 1; fi
CREDENTIALS=${PROD_CREDENTIALS:-/Users/fedfol/Projects/meal_planner_2/.env.production.local}
[ -f "$CREDENTIALS" ] || { echo "Credentials file not found: $CREDENTIALS" >&2; exit 1; }
POSTGRES_DATABASE_URL=$(node scripts/prod-sql-target.ts "$CREDENTIALS" "${PROD_SQL_TARGET:-production}")
export POSTGRES_DATABASE_URL
CLI=${CONTAINER_CLI:-podman}
IMAGE=${PSQL_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.004}
MOUNT=()
[ -d "$HOME/.config/cosasimangia" ] && MOUNT=(-v "$HOME/.config/cosasimangia:$HOME/.config/cosasimangia:ro")
if [ "$MODE" = --preview ]; then BODY=$(sed 's/^commit;$/rollback;/' "$FILE"); echo "Preview of $FILE (sha256 $SHA): ends with rollback" >&2
else BODY=$(cat "$FILE"); fi
{ cat supabase/scripts/app-fingerprint.sql; printf '%s\n' "$BODY"; } | "$CLI" run --rm -i -e POSTGRES_DATABASE_URL ${MOUNT[@]+"${MOUNT[@]}"} --network host "$IMAGE" \
	sh -c 'exec psql "$POSTGRES_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"' sh ${VARS[@]+"${VARS[@]}"}
[ "$MODE" = --preview ] && echo "Apply with: scripts/prod-sql.sh --apply $FILE --confirm $SHA$SETS" >&2
exit 0
```

(Con `--network host` su Podman
per Mac, `127.0.0.1` è la macchina virtuale, dove lo stack locale pubblica le porte; se
non la raggiunge, la prova usa `host.containers.internal` in `PROD_SQL_TARGET=local` e
lo si scrive qui.)

- [ ] **Step 4: CI** — in `.github/workflows/ci.yml`, dopo `npm run test:drill -w server`:

```yaml
      # After the drill: service SQL that empties the database (remove, reset), through the real prod-sql.sh.
      - run: npx vitest run -c vitest.destructive.config.ts
        env:
          CONTAINER_CLI: docker
```

- [ ] **Step 5: verifica**

Run: `DESTRUCTIVE_TESTS=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run -c vitest.destructive.config.ts` → PASS; poi `supabase db reset` (lo stack locale torna con il seed).

- [ ] **Step 6: commit**

```bash
chmod +x scripts/prod-sql.sh
git add scripts/prod-sql.sh scripts/prod-sql-target.ts supabase/scripts/app-fingerprint.sql supabase/scripts/show-fingerprint.sql supabase/scripts/remove-family.sql supabase/scripts/reset-app-data.sql supabase/scripts/check-first-generation.sql vitest.destructive.config.ts scripts/destructive .github/workflows/ci.yml
git commit -m "Messa in produzione: SQL sulla produzione con anteprima legata al file, impronta, rimozione della famiglia e azzeramento provati in CI"
```

### Task 9: Documenti e PR

**Files:**
- Modify: `server/README.md` («Pubblicazione», «Risorse di produzione»),
  `supabase/README.md` («Passi remoti», «Primi utenti del progetto vero», nuova sezione
  «Impronta, rimozione della famiglia e azzeramento»)

- [ ] **Step 1: `server/README.md`** — «Pubblicazione»: `npm run release -- --preview`,
  poi `--apply <sha>` dopo il «vai» dell'utente; migrazioni comprese, dalla CLI con
  `--db-url`; mai più «dopo che l'integrazione di Supabase ha applicato le migrazioni»
  né `npm run deploy` a mano. Ritorno indietro: primo rilascio con `wrangler delete`,
  poi `wrangler rollback <version-id>` con il controllo delle migrazioni. «Risorse di
  produzione»: tabella da compilare nel runbook (Hyperdrive id e limite, account,
  bucket, indirizzo `workers.dev`, data del primo rilascio, del collaudo e della
  rotazione), rimando alla spec di questa attività.
- [ ] **Step 2: `supabase/README.md`** — «Passi remoti»: migrazioni con `npm run
  release`; `bootstrap.sql` compilato fuori dal repository (email, nome, lingua, ruolo;
  il rilancio riallinea le persone) e lanciato dal coordinatore con
  `scripts/prod-sql.sh`; impostazioni della famiglia scritte da
  `scripts/import/load.ts` prima della prima apertura (la tabella resta come
  riferimento del collaudo); sezione nuova sull'impronta con i tre file e le
  condizioni.
- [ ] **Step 3: verifica completa** (skill `superpowers:verification-before-completion`)

Run, con lo stack locale avviato e `TEST_DATABASE_URL` impostato:
`npm run typecheck && npm test`, `supabase test db`, poi
`DESTRUCTIVE_TESTS=1 npx vitest run -c vitest.destructive.config.ts` e `supabase db reset`.
Expected: tutto verde; CI verde sulla PR, passo distruttivo compreso.

- [ ] **Step 4: commit, push e PR** (protocollo dei worker, fase 6)

```bash
git add server/README.md supabase/README.md
git commit -m "Messa in produzione: documenti di pubblicazione, passi remoti e impronta"
git push -u origin traguardo/messa-in-produzione
gh pr create --base main --title "Messa in produzione: caricamento, rilascio e runbook" --body-file <descrizione in italiano: cosa fa, come è stato verificato con i numeri dello Step 5 del Task 5, sezioni della specifica realizzate (11, 1, 10)>
```

Poi `STATO: PR_APERTA <url>`.

---

# Parte B: runbook

Si esegue **solo dopo** il merge della PR della parte A e l'approvazione dell'utente,
passo per passo. Ogni passo: **chi**, **dove si lancia**, **comando o percorso**,
**esito atteso**, **ritorno indietro**. Ogni scrittura in produzione: anteprima
all'utente, «vai», poi applicazione con l'impronta o lo SHA dell'anteprima.

Convenzioni:

- `<MAIN>` = `/Users/fedfol/Projects/meal_planner_2`, checkout principale aggiornato a
  `origin/main` (`git -C <MAIN> pull --ff-only`). Tutti i comandi partono da `<MAIN>`
  salvo dove è scritto `server/`.
- `<CRED>` = `<MAIN>/.env.production.local`. Gli script lo leggono da soli; solo per
  `wrangler hyperdrive` si carica nella stessa riga del comando.
- I file SQL letti con `prod-sql.sh` si scrivono come blocchi su più righe, con le righe
  esatte `begin;` e `commit;`.

### Fase 1: infrastruttura senza famiglia

Dipende da: PR della parte A unita.

- [ ] **R1. Accessi alle CLI** — Coordinatore, da `<MAIN>/server`: `npx wrangler whoami`
  → account POWA (annota l'`account_id`); da `<MAIN>`: `supabase projects list` →
  riga `lronuqvtjdhfyychnscr`. Se no, l'utente lancia `! npx wrangler login` o
  `! supabase login`. Ritorno: nessuno (sola lettura).
- [ ] **R2. Chiavi JWT** — Coordinatore:
  `curl -s https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json` →
  almeno una chiave con `"alg":"ES256"` o `"RS256"`. Se manca: `STATO: DOMANDA` (passo
  1 dei prerequisiti di W2).
- [ ] **R3. Data API** — Utente: Dashboard › Project Settings › Data API. Esito:
  *Exposed schemas* = `public`, `graphql_public`. Ritorno: togliere `app` se c'è.
- [ ] **R4. Certificato e credenziali del database** — Utente:
  1. `mkdir -p ~/.config/cosasimangia`; Dashboard › Database › Settings › *SSL
     Configuration* › *Download certificate* → salvato come
     `~/.config/cosasimangia/supabase-ca.crt`;
  2. crea `<CRED>` con la riga
     `POSTGRES_DATABASE_URL=postgresql://postgres.lronuqvtjdhfyychnscr:<password del database>@<host del Session pooler>:5432/postgres?sslmode=verify-full&sslrootcert=/Users/fedfol/.config/cosasimangia/supabase-ca.crt`
     (host da Dashboard › Connect › *Session pooler*; password da Database › Settings,
     *Reset database password* se non la conosce; caratteri speciali codificati con
     `%XX`).

  Coordinatore: `git -C <MAIN> check-ignore -q .env.production.local && echo ignored`
  → `ignored`. Poi il file `$TMPDIR/count-families.sql`:

  ```sql
  begin;
  select count(*) as families from app.families;
  commit;
  ```

  e `scripts/prod-sql.sh --preview "$TMPDIR/count-families.sql"` → `Target:
  postgres.lronuqvtjdhfyychnscr@…:5432/postgres` e `families 0` (se le migrazioni non
  ci sono ancora: errore «relation app.families does not exist», atteso prima di R9).
  Ritorno: nessuno.
- [ ] **R5. Pool e password di `app_server`** — Utente: legge la dimensione del pool
  (Dashboard › Database › Settings › Connection pooling); `openssl rand -hex 24`;
  nell'editor SQL `alter role app_server with password '<password>';`; aggiunge a
  `<CRED>`:

  ```text
  APP_SERVER_DATABASE_URL=postgresql://app_server.lronuqvtjdhfyychnscr:<password>@<host del Session pooler>:5432/postgres?sslmode=verify-full&sslrootcert=/Users/fedfol/.config/cosasimangia/supabase-ca.crt
  APP_SERVER_PASSWORD=<password>
  ```

  Comunica al coordinatore solo la dimensione del pool. Verifica, dopo R9 (prima il
  ruolo `app_job` non esiste): `node scripts/import/load.ts --env-file <CRED>
  --check-connection` → `app_server.lronuqvtjdhfyychnscr@<host>:5432/postgres: 0
  families, 0 recipes visible to app_job`. Ritorno: nuova password con lo stesso
  comando.
- [ ] **R6. Hyperdrive** — Coordinatore, verificate con Context7 le opzioni di
  `wrangler hyperdrive create` nella versione di `server/package.json`. Anteprima
  all'utente: il comando senza valori segreti e `N` = pool − 5 (almeno 5). «vai» → da
  `<MAIN>/server`:

  ```bash
  set -a; . <CRED>; set +a; npx wrangler hyperdrive create cosasimangia --origin-host=<host del Session pooler> --origin-port=5432 --database=postgres --origin-user=app_server.lronuqvtjdhfyychnscr --origin-password="$APP_SERVER_PASSWORD" --caching-disabled --origin-connection-limit=<N>
  ```

  Esito: id stampato; `npx wrangler hyperdrive get <id>` con cache disattivata e limite
  N. Ritorno: `npx wrangler hyperdrive delete <id>`.
- [ ] **R7. Bucket e chiave delle esportazioni** — Spec di W5, sezione 5, passi 1–2.
  Anteprima: il comando. «vai» → coordinatore, da `<MAIN>/server`:
  `npx wrangler r2 bucket create cosasimangia-backups --jurisdiction eu` → bucket
  creato; `npx wrangler r2 bucket info cosasimangia-backups --jurisdiction eu` lo
  mostra. Utente: `openssl rand -base64 32`, copiata nel gestore di password come
  «Cosa si mangia — chiave delle esportazioni k1» (il segreto si imposta in R10).
  Ritorno: `npx wrangler r2 bucket delete cosasimangia-backups --jurisdiction eu`
  (vuoto).
- [ ] **R8. PR di configurazione** — Worker (o coordinatore): `account_id` (da R1) e id
  di Hyperdrive (da R6) in `server/wrangler.jsonc`; `web/.env.production`:

  ```text
  VITE_SUPABASE_URL=https://lronuqvtjdhfyychnscr.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<chiave pubblica>
  ```

  (l'utente copia la *Publishable key* da Dashboard › Project Settings › API Keys: è
  pubblica). CI verde, merge del coordinatore. Esito: `git -C <MAIN> pull --ff-only` e
  `git -C <MAIN> ls-files web/.env.production` stampa il percorso. Ritorno: revert
  della PR.
- [ ] **R9. Primo rilascio** — Coordinatore, da `<MAIN>`:
  `npm run release -- --preview` → anteprima all'utente: commit, migrazioni da
  applicare (tutte quelle di `supabase/migrations`), «first release: secrets checked
  after the deploy», nessun problema. «vai» → `npm run release -- --apply <sha
  dell'anteprima>`. Esito: migrazioni applicate, deploy con tag, indirizzo
  `workers.dev` stampato e controlli verdi, compreso 404 su
  `/shopping-lists/000000000000000000000000000000000000000000000000`; ultima riga con il
  passo obbligatorio del segreto. Poi R5 (verifica) e PR con l'indirizzo in
  `scripts/release.config.json` e `server/README.md`. Ritorno: `npx wrangler delete` da
  `<MAIN>/server` dopo anteprima (`npx wrangler deployments list` con una sola
  versione) e «vai» (spec, sezione 8).
- [ ] **R10. Segreto della chiave** — Utente, subito dopo R9 e prima delle 02:30, da
  `<MAIN>/server`: `! npx wrangler secret put BACKUP_ENCRYPTION_KEY`, incollando la
  chiave di R7. Esito: `npx wrangler secret list` (coordinatore) contiene
  `BACKUP_ENCRYPTION_KEY`. Ritorno: `wrangler secret delete` e nuova chiave.
- [ ] **R11. Accesso di prova** — Utente: crea il proprio account (Authentication ›
  Users › Add user, email, password, «Auto Confirm User») e dà al coordinatore il suo
  UID; entra dall'iPhone sull'indirizzo `workers.dev`. Esito: accesso riuscito, app vera
  (non i dati finti), nessuna famiglia; coordinatore con `npx wrangler tail` a un'ora
  piena: esecuzione del cron senza errori. **Poi l'utente fa «Esci».** Ritorno: nessuno.
- [ ] **R12. Prima esportazione** — Mattina dopo: nei log del Worker
  `backup_export_done`; in R2 un oggetto in `exports/`. Ritorno: spec di W5.
- [ ] **R13. Rilasci successivi della fase** (PR con l'indirizzo, altre unite):
  `npm run release -- --preview`, «vai», `--apply <sha>`. Ritorno: `npx wrangler
  rollback <version-id> --message "<motivo>"` (spec, sezione 8, con il controllo delle
  migrazioni).

### Fase 2: import e avvio della famiglia

Dipende da: fase 1; spec di W5 riletta sulla versione unita.

- [ ] **R14. Prova delle esportazioni** — Spec di W5, sezione 6, «Prova di produzione»:
  utente, download e `inspect`/ripristino in locale con la chiave del gestore di
  password. Esito: ripristino riuscito. Ritorno: spec di W5.
- [ ] **R15. Finestra** — Coordinatore e utente scelgono un giorno da lunedì a
  mercoledì; R16–R19 di seguito, entro le 19; nessun altro apre l'app fino alla fine di
  R19.
- [ ] **R16. Account dei familiari** — Utente: Add user per ognuno (email, password,
  «Auto Confirm User»); dà al coordinatore per ognuno email, nome, lingua (`it-IT` o
  `en-GB`), ruolo nella famiglia, e l'UID di Federico. Mai le password.
- [ ] **R17. Famiglia** — Coordinatore:
  1. `cp supabase/scripts/bootstrap.sql ~/.config/cosasimangia/bootstrap.production.sql`;
  2. UUID della famiglia: `node -e "console.log(crypto.randomUUID())"`, annotato nel
     registro del coordinamento;
  3. nel file: `insert into input_family values ('<uuid>', '<nome della famiglia>',
     'metric', 'Europe/Rome');` e una riga di `input_people` per persona, Federico
     `('<email>', 'Federico', 'it-IT', 'family_admin', array['app_admin',
     'recipe_curator'])`, gli altri `array[]::text[]` come ruoli globali;
  4. anteprima: `scripts/prod-sql.sh --preview
     ~/.config/cosasimangia/bootstrap.production.sql` → righe di persone, famiglia e
     ruoli; `sha256` stampato. «vai» → `scripts/prod-sql.sh --apply
     ~/.config/cosasimangia/bootstrap.production.sql --confirm <sha256>`.

  Esito: stesso elenco; un secondo `--preview` mostra «family already exists» e le
  stesse righe. Ritorno: R20 (rimozione della famiglia).
- [ ] **R18. Caricamento** — Coordinatore:

  ```bash
  node scripts/import/load.ts --env-file <CRED> --today <oggi> --family <uuid> --curator <uid di Federico> --dry-run
  ```

  All'utente: riepilogo, `scripts/import/out/load-report.md` (pubblicazione bloccata?
  preferenze da sistemare a mano, equivalenze divergenti, voti in sospeso, libri
  posseduti, menu in corso, pasti doppi), impronta degli input. «vai» → stesso comando
  con `--confirm <impronta>` al posto di `--dry-run`. Esito: riepilogo uguale e riga
  «Data fingerprint after the load: <fp>», annotata nel registro. Verifica: nuovo
  `--dry-run` con zero creati. Ritorno: errore → nulla scritto; impronta degli input
  cambiata → nuovo `--dry-run`; sbagliato nella famiglia → R20; sbagliato nel catalogo →
  R21.
- [ ] **R19. Primo collaudo, in sola lettura** — Federico sull'iPhone con il
  coordinatore, entro le 19: accesso, menu della settimana corrente uguale al PDF,
  ricettario (numero di ricette, libri, bozze), impostazioni come la tabella di
  `supabase/README.md`. Nessuna modifica. Poi coordinatore: `scripts/prod-sql.sh
  --preview supabase/scripts/show-fingerprint.sql` → stessa impronta di R18. Esito
  positivo → R22. Esito negativo o 19:00 passate → R20.
- [ ] **R20. Rimozione della famiglia** (solo se serve) — Coordinatore:
  `scripts/prod-sql.sh --preview supabase/scripts/remove-family.sql --set
  family_id=<uuid> --set expected_fingerprint=<fp di R18>` → righe che toglierebbe;
  «vai» → stesso comando con `--apply` e `--confirm <sha256>`. Esito: famiglia assente;
  catalogo intatto. Poi correzione e R15–R19 in una nuova finestra (R17 con un UUID
  nuovo). Se l'impronta è cambiata, si ferma: correzioni puntuali (spec, sezione 8).
- [ ] **R21. Azzeramento** (solo se il catalogo è sbagliato, prima di R22) —
  Coordinatore: `scripts/prod-sql.sh --preview supabase/scripts/reset-app-data.sql --set
  expected_fingerprint=<fp di R18>`, «vai», `--apply … --confirm <sha256>`. Esito:
  catalogo e famiglie vuoti, utenti e profili presenti. Poi correzione, R17–R19 in una
  nuova finestra.
- [ ] **R22. Collaudo completo** — Familiari con il coordinatore: tabella della spec,
  sezione 5, riga per riga; giovedì, prima di aprire il menu,
  `scripts/prod-sql.sh --preview supabase/scripts/check-first-generation.sql --set
  family_id=<uuid> --set week_start=<lunedì successivo>` → `cron_generated = t`; la
  notte dopo l'esportazione più grande. Esito in `server/README.md` e nel registro. Da
  qui il vecchio flusso non pianifica più settimane. Ritorno: spec, sezione 8 («dopo
  l'avvio»).

### Fase 3: agenti

Dipende da: collegamento degli agenti (W2) unito; spec di W2 riletta sulla versione
unita.

- [ ] **R23. Chiave pubblica nel Worker** — PR con `SUPABASE_PUBLISHABLE_KEY` nei `vars`
  di `server/wrangler.jsonc` (valore di `web/.env.production`), se W2 non l'ha già
  messa. Merge del coordinatore.
- [ ] **R24. OAuth server e URL** — Utente, spec di W2, «Passi esterni per la
  produzione», passi 6–7: OAuth Server attivo con `/authorize` e registrazione dinamica;
  *Site URL* = indirizzo `workers.dev`, *Redirect URLs* `<origine>/**`.
- [ ] **R25. Rilascio e prove** — Coordinatore: `npm run release -- --preview`, «vai»,
  `--apply <sha>`; poi passi 3 e 10 di W2 (collegamento di Claude Code,
  `session_whoami`, «Scollega», revoca verificata) e ricettario tramite agente (spec,
  sezione 9). Ritorno: disattivare l'OAuth server; `wrangler rollback <version-id>`.

### Chiusura

- [ ] **R26. Rotazione delle password** — In un'ora senza uso. Utente: *Reset database
  password* e aggiornamento di `POSTGRES_DATABASE_URL`; nuova password di `app_server`
  nell'editor SQL e aggiornamento di `APP_SERVER_DATABASE_URL` e `APP_SERVER_PASSWORD`.
  Coordinatore subito dopo, verificate con Context7 le opzioni di `wrangler hyperdrive
  update`, da `<MAIN>/server`:

  ```bash
  set -a; . <CRED>; set +a; npx wrangler hyperdrive update <id> --origin-password="$APP_SERVER_PASSWORD"
  ```

  Verifica: `curl -s -o /dev/null -w '%{http_code}' <indirizzo>/shopping-lists/000000000000000000000000000000000000000000000000`
  → `404`; accesso e Menu sull'iPhone; cron dell'ora dopo senza errori in `wrangler
  tail`; `load.ts --check-connection`; `prod-sql.sh --preview
  supabase/scripts/show-fingerprint.sql`. Ritorno: se Hyperdrive non si collega,
  ripetere `update` con i valori del file; le password vecchie non si ripristinano.
- [ ] **R27. Esito** — Worker o coordinatore: `server/README.md`, «Risorse di
  produzione», compilata (risorse, limite e perché, indirizzo, date); registro del
  coordinamento aggiornato; le «Decisioni da riportare» della spec passano al
  coordinatore per la specifica principale.

### Cambio di progetto dopo un ripristino (solo per un danno grave)

Spec, sezione 8, «Danno grave dopo l'avvio», e spec di W5, sezione 4: PR revisionata
con `scripts/production-target.json`, `SUPABASE_URL` e `web/.env.production` del
progetto nuovo; utente aggiorna le due URL e il certificato in `<CRED>`; migrazioni e
ripristino con la CLI di W5; `wrangler hyperdrive update <id> --origin-host …
--origin-user app_server.<ref nuovo> --origin-password …`; `npm run release`
(anteprima, «vai», applicazione); collaudo completo (R22). Ogni strumento rifiuta finché
file, credenziali e configurazione non indicano lo stesso progetto.
