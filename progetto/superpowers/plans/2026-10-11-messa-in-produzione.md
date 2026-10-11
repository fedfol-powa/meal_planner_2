# Messa in produzione: piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** strumenti e procedura per portare il traguardo A in produzione: script di
caricamento del ricettario e dei dati della famiglia, rilascio in due tempi, SQL sulla
produzione con anteprima, azzeramento prima dell'uso, documenti; poi il runbook delle
fasi 1–3 e della chiusura.

**Architecture:** parte A (implementazione, TDD, una PR): moduli puri in
`scripts/import/load/` per decidere cosa scrivere, un modulo che scrive in una sola
transazione riusando `server/src/catalogue/write.ts` e le scritture delle impostazioni,
un comando con anteprima a rollback; `scripts/release.ts` e `scripts/prod-sql.sh` per
rilasci e SQL. Parte B (runbook): passi in produzione eseguiti solo dopo l'approvazione
dell'utente, passo per passo, con anteprima e «vai».

**Tech Stack:** Node 26 con TypeScript eseguito direttamente, Postgres.js (già nel
server), `yaml` (già nella radice), Vitest; CLI di Supabase, Wrangler, `gh`, Podman.
Nessuna dipendenza nuova.

**Spec:** `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md` (leggila prima
di ogni task), subordinata alla specifica principale.

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano.
- Nessuna dipendenza nuova.
- Nessun comando di questa parte A tocca il progetto `lronuqvtjdhfyychnscr` o l'account
  Cloudflare: i test usano lo stack locale (`TEST_DATABASE_URL`).
- Non modificare file di altre aree: `server/src/**`, `supabase/migrations/**`,
  `supabase/scripts/bootstrap.sql`, `scripts/import/*.ts` esistenti si importano soltanto.
  File condivisi toccati con modifiche minime: `tsconfig.json`, `vitest.config.ts`,
  `package.json` (script `release`), `.gitignore`.
- Gli script non stampano mai stringhe di connessione né password, nemmeno negli errori:
  solo host e utente.
- Bersaglio: utente che termina con `.lronuqvtjdhfyychnscr` e host del pooler di
  Supabase (`*.pooler.supabase.com`); con `--local` solo `127.0.0.1` o `localhost`.
- Canale delle scritture del catalogo: `import`. Slug del bundle e `origin_slug`
  conservati.
- Dati della famiglia scritti solo in aggiunta (`on conflict do nothing`, settimana
  esistente saltata, chiave delle impostazioni già salvata non toccata).

## Review Focus

- **Menu dell'origine con un pasto `libero` e uno senza `porzioni`:** il testo libero
  entra con le porzioni delle impostazioni, senza errore (test nel Task 2).
- **Storico in una settimana che è anche «menu in corso»** (un pasto già `cucinata:
  true` nella settimana corrente): vince il menu in corso, nessun pasto doppio (Task 2).
- **Rilancio dopo che un familiare ha cambiato un voto o un'impostazione nell'app:**
  nulla viene sovrascritto (Task 4).
- **Stringa di connessione con password piena di caratteri speciali o errata:** il
  messaggio d'errore non la contiene (Task 1, Task 5).
- **`pendingReview` non vuoto in produzione:** nessuna pubblicazione, voti tutti «in
  sospeso», il report lo dice in testa (Task 3, Task 5).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `scripts/import/load/target.ts` | Controllo del bersaglio di una stringa di connessione, descrizione senza segreti |
| `scripts/import/load/settings-plan.ts` | Chiavi delle impostazioni da scrivere: curatore vs default vs salvate |
| `scripts/import/load/menus.ts` | Lettura dei `menu/<lunedì>/menu.yaml` dell'origine |
| `scripts/import/load/weeks-plan.ts` | Settimane da scrivere: storico (R4) e menu in corso, porzioni, doppi |
| `scripts/import/load/catalogue.ts` | Scritture del catalogo nella transazione (libri, ingredienti, equivalenze, ricette) |
| `scripts/import/load/family.ts` | Scritture della famiglia nella transazione (impostazioni, limiti, libri, voti, provate, settimane) |
| `scripts/import/load/run.ts` | La transazione unica: ruoli, rifiuti, anteprima a rollback, conteggi |
| `scripts/import/load/report.ts` | Report Markdown e riga di riepilogo |
| `scripts/import/load.ts` | Comando: argomenti, ambiente, connessione, `--check-connection` |
| `scripts/release.ts` | `npm run release -- --preview` / `--apply <sha>` |
| `scripts/release.config.json` | `productionUrl` (vuoto finché non c'è il primo rilascio) |
| `scripts/prod-sql.sh` | SQL sulla produzione con anteprima a rollback, `psql` dell'immagine Podman |
| `supabase/scripts/reset-app-data.sql` | Azzeramento prima dell'uso, con controllo delle tracce d'uso |
| `supabase/scripts/reset-app-data_test.sh` | Prova locale dell'azzeramento |

Test accanto ai moduli (`*.test.ts`, unitari) e `scripts/import/load/load.db.test.ts`
(integrazione con il database locale, saltato senza `TEST_DATABASE_URL`, obbligatorio in
CI come i test del server).

---

# Parte A: implementazione

### Task 1: Base dei test e controllo del bersaglio

**Files:**
- Modify: `tsconfig.json` (tipi dei Workers, perché i moduli del server importati
  dichiarano `Env` con `Hyperdrive`)
- Modify: `vitest.config.ts` (preparazione del database come nel server)
- Create: `scripts/import/load/target.ts`, `scripts/import/load/target.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PRODUCTION_REF = 'lronuqvtjdhfyychnscr';
  export type Target = 'production' | 'local';
  export interface Endpoint { host: string; user: string }
  /** Throws an Error naming only the variable, host and user: never the password. */
  export function checkTarget(variable: string, url: string | undefined, target: Target): Endpoint;
  export const describeEndpoint: (e: Endpoint) => string; // "app_server.lronuqvtjdhfyychnscr@aws-0-eu-central-1.pooler.supabase.com"
  ```

- [ ] **Step 1: tipi e configurazione dei test**

In `tsconfig.json`: `"types": ["node", "@cloudflare/workers-types"]` (verificato l'11
ottobre: senza, `server/src/env.ts` non compila dalla radice). In `vitest.config.ts`:

```ts
export default defineConfig({
	test: {
		include: ['scripts/**/*.test.ts'],
		passWithNoTests: true,
		// Same database preparation as the server: app_server password, schema present.
		globalSetup: ['server/test/global-setup.ts'],
	},
});
```

Run: `npm run typecheck && npx vitest run`
Expected: PASS (nulla di nuovo da eseguire, i test esistenti restano verdi).

- [ ] **Step 2: test che falliscono**

```ts
import { describe, expect, it } from 'vitest';
import { checkTarget, describeEndpoint } from './target.ts';

const prod = 'postgresql://app_server.lronuqvtjdhfyychnscr:s3cr%40t!@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

describe('checkTarget', () => {
	it('accepts the production pooler with the expected ref', () => {
		expect(describeEndpoint(checkTarget('APP_SERVER_DATABASE_URL', prod, 'production'))).toBe(
			'app_server.lronuqvtjdhfyychnscr@aws-0-eu-central-1.pooler.supabase.com');
	});
	it('refuses a missing variable', () => {
		expect(() => checkTarget('APP_SERVER_DATABASE_URL', undefined, 'production')).toThrow('APP_SERVER_DATABASE_URL is not set');
	});
	it('refuses another project, and never echoes the password', () => {
		const other = prod.replace('lronuqvtjdhfyychnscr', 'abcdefghijklmnopqrst');
		expect(() => checkTarget('X', other, 'production')).toThrow(/not the production project/);
		try { checkTarget('X', other, 'production'); } catch (e) { expect(String(e)).not.toContain('s3cr'); }
	});
	it('refuses a local url in production and a remote url with --local', () => {
		expect(() => checkTarget('X', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'production')).toThrow();
		expect(() => checkTarget('X', prod, 'local')).toThrow(/not local/);
	});
	it('accepts localhost with --local', () => {
		expect(checkTarget('X', 'postgresql://app_server:x@localhost:54322/postgres', 'local').host).toBe('localhost');
	});
	it('refuses an unparsable url without echoing it', () => {
		expect(() => checkTarget('X', 'not a url s3cr', 'production')).toThrow('X is not a valid connection string');
	});
});
```

- [ ] **Step 3: verifica che falliscano** — Run: `npx vitest run scripts/import/load/target.test.ts` → FAIL (modulo assente).

- [ ] **Step 4: implementazione**

```ts
// Which database a connection string points to, checked before connecting (detail spec, section 2).
// Errors name the variable, host and user only: a password never reaches the console.
export const PRODUCTION_REF = 'lronuqvtjdhfyychnscr';
export type Target = 'production' | 'local';
export interface Endpoint { host: string; user: string }

export const describeEndpoint = (e: Endpoint) => `${e.user}@${e.host}`;

export function checkTarget(variable: string, url: string | undefined, target: Target): Endpoint {
	if (!url) throw new Error(`${variable} is not set`);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`${variable} is not a valid connection string`);
	}
	const endpoint = { host: parsed.hostname, user: decodeURIComponent(parsed.username) };
	const local = endpoint.host === '127.0.0.1' || endpoint.host === 'localhost';
	if (target === 'local') {
		if (!local) throw new Error(`${variable} is not local: ${describeEndpoint(endpoint)}`);
		return endpoint;
	}
	if (!endpoint.user.endsWith(`.${PRODUCTION_REF}`) || !endpoint.host.endsWith('.pooler.supabase.com')) {
		throw new Error(`${variable} is not the production project: ${describeEndpoint(endpoint)}`);
	}
	return endpoint;
}
```

- [ ] **Step 5: verifica** — Run: `npx vitest run scripts/import/load/target.test.ts && npm run typecheck` → PASS.

- [ ] **Step 6: commit**

```bash
git add tsconfig.json vitest.config.ts scripts/import/load/target.ts scripts/import/load/target.test.ts
git commit -m "Messa in produzione: controllo del bersaglio delle connessioni, base dei test del caricamento"
```

### Task 2: Piani puri delle impostazioni e delle settimane

**Files:**
- Create: `scripts/import/load/settings-plan.ts`, `scripts/import/load/menus.ts`,
  `scripts/import/load/weeks-plan.ts` con i rispettivi `*.test.ts`

**Interfaces:**
- Consumes: `PlannerSettings`, `addDays`, `IsoDate`, `MealType` da
  `domain/src/planner/index.ts`; `resolveFamilySettings`, `normalizeRules` da
  `domain/src/family/settings.ts`; `FamilyData` da `scripts/import/family.ts`.
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
  	duplicates: { date: IsoDate; mealType: MealType; originSlug: string }[];
  	notes: { date: IsoDate; mealType: MealType; note: string }[];
  }
  export const weekdayIndex: (date: IsoDate) => number; // Monday 0 … Sunday 6
  export function plannedWeeks(args: { meals: FamilyData['meals']; menus: OriginMenu[]; settings: PlannerSettings; today: IsoDate }): WeeksPlan;
  ```

- [ ] **Step 1: test delle impostazioni**

```ts
import { describe, expect, it } from 'vitest';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { settingsWrites } from './settings-plan.ts';

describe('settingsWrites', () => {
	it('writes only what differs from the defaults, never weights', () => {
		const writes = settingsWrites(curatorFamilySettings(), {});
		const paths = writes.map((w) => w.path.join('.'));
		expect(paths).toContain('slots.lunch.6'); // Sunday pizza
		expect(paths).toContain('slots.dinner.5'); // Saturday free dinner
		expect(paths).toContain('rules');
		expect(paths).not.toContain('knownNew'); // same as the default
		expect(paths.some((p) => p.startsWith('groupRanges'))).toBe(false);
		expect(paths.some((p) => p.startsWith('weights'))).toBe(false);
		expect(writes.find((w) => w.path.join('.') === 'slots.lunch.6')!.value).toEqual({ servings: 4, fixedText: 'Pizza', maxMinutes: null });
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

- [ ] **Step 2: test dei menu e delle settimane**

```ts
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
		const plan = plannedWeeks({ meals, menus, settings, today: '2026-10-19' });
		expect(plan.weeks[0]!.slots).toEqual([
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
	it('keeps the first recipe by slug when two share a meal, and reports the other', () => {
		const meals = [
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'a' },
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'b' },
		];
		const plan = plannedWeeks({ meals, menus: [], settings, today: '2026-10-13' });
		expect(plan.weeks[0]!.slots.map((s) => s.originSlug)).toEqual(['a']);
		expect(plan.duplicates).toEqual([{ date: '2026-09-01', mealType: 'lunch', originSlug: 'b' }]);
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
// wins over history in its week; servings come from the week's menu, else from the settings.
export interface PlannedSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number }
export interface PlannedWeek { weekStart: IsoDate; source: 'history' | 'current'; slots: PlannedSlot[] }
export interface WeeksPlan {
	weeks: PlannedWeek[];
	duplicates: { date: IsoDate; mealType: MealType; originSlug: string }[];
	notes: { date: IsoDate; mealType: MealType; note: string }[];
}

export const weekdayIndex = (date: IsoDate) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
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

- [ ] **Step 5: verifica** — Run: `npx vitest run scripts/import/load && npm run typecheck` → PASS.

- [ ] **Step 6: commit**

```bash
git add scripts/import/load/settings-plan.ts scripts/import/load/settings-plan.test.ts scripts/import/load/menus.ts scripts/import/load/menus.test.ts scripts/import/load/weeks-plan.ts scripts/import/load/weeks-plan.test.ts
git commit -m "Messa in produzione: impostazioni da scrivere, menu dell'origine e settimane dello storico e in corso"
```

### Task 3: Scritture del catalogo e transazione unica

**Files:**
- Create: `scripts/import/load/catalogue.ts`, `scripts/import/load/run.ts`,
  `scripts/import/load/load.db.test.ts`

**Interfaces:**
- Consumes: `createBook`, `createIngredient`, `createDraft`, `publishDraft`, `Actor`
  da `server/src/catalogue/write.ts`; `setEquivalence` da
  `server/src/catalogue/ingredients.ts`; `resolveReferences` da
  `domain/src/recipe/index.ts`; `ImportBundle` da `scripts/import/bundle.ts`;
  `UnitEquivalence` da `domain/src/units/equivalence.ts`; `runImport` da
  `scripts/import/import-recipes.ts`; `readInputs` da `scripts/import/inputs.ts`.
- Produces:
  ```ts
  // catalogue.ts
  export interface Counted { created: number; present: number }
  export interface CatalogueResult {
  	books: Counted; ingredients: Counted; equivalences: Counted;
  	recipes: { published: number; drafts: number; present: number };
  	publicationBlocked: string[]; // pendingReview files: nothing published
  }
  export interface CatalogueIds { ingredients: Map<string, string>; books: Map<string, string> } // slug → id
  export async function existingCatalogue(tx: Tx): Promise<{ recipes: string[]; ingredients: string[]; books: string[] }>;
  export async function loadCatalogue(tx: Tx, actor: Actor, bundle: ImportBundle, equivalences: UnitEquivalence[]): Promise<{ result: CatalogueResult; ids: CatalogueIds }>;
  // run.ts
  export interface LoadOptions { today: string; familyId: string; curatorId: string; root: string; originDirectory?: string; dryRun: boolean }
  export interface LoadResult { mode: 'dry-run' | 'written'; catalogue: CatalogueResult; family: FamilyResult }
  export class LoadRefused extends Error {}
  export async function actAsCurator(tx: Tx, curatorId: string): Promise<void>;
  export async function actAsJob(tx: Tx): Promise<void>;
  export async function loadAll(sql: postgres.Sql, options: LoadOptions): Promise<LoadResult>;
  ```
  (`FamilyResult` arriva nel Task 4: in questo task `loadAll` restituisce
  `family: emptyFamilyResult()` esportato da `family.ts` creato qui come segnaposto
  tipato con tutti i contatori a zero, completato nel Task 4.)

- [ ] **Step 1: test d'integrazione che falliscono**

In `load.db.test.ts`, con un ricettario d'origine finto in una cartella temporanea
(`MEAL_PLANNER_ORIGIN` punta lì; `ricettario/ricette.yaml` con tre schede: una
pubblicabile collaudata con storico e `feedback`, una senza attributi in
`recipe-attributes.yaml` che diventa bozza, una dal libro «Basta un Wok»; `menu/` con la
settimana corrente). Le fixture si costruiscono con gli aiuti di
`scripts/import/test-fixtures.ts` e copiando i quattro YAML di `scripts/import/` con le
sole voci usate (approvazione ricalcolata con `approve.ts` sul contenuto della fixture).

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../../../server/test/support/db.ts';
import { writeOriginFixture } from './test-origin.ts';
import { loadAll } from './run.ts';

describe.skipIf(!hasDatabase)('load into the database', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let curator: string;
	let familyId: string;
	let root: string;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 1, fetch_types: false, onnotice: () => {} });
		({ userId: curator } = await db.createUser());
		await db.grantGlobalRole(curator, 'recipe_curator');
		familyId = await db.createFamily([{ userId: curator, role: 'family_admin' }]);
		root = writeOriginFixture(mkdtempSync(join(tmpdir(), 'load-')));
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});
	const options = (over = {}) => ({ today: '2026-10-13', familyId, curatorId: curator, root, originDirectory: root, dryRun: false, ...over }); // the fixture holds both the origin and scripts/import/*.yaml

	it('dry-run counts everything and leaves nothing', async () => {
		const result = await loadAll(sql, options({ dryRun: true }));
		expect(result.mode).toBe('dry-run');
		expect(result.catalogue.recipes).toMatchObject({ published: 2, drafts: 1 });
		const [{ n }] = await db.admin`select count(*)::int as n from app.recipes where origin_slug like 'test-load-%'`;
		expect(n).toBe(0);
	});

	it('writes with channel import and origin slugs, and a rerun creates nothing', async () => {
		await loadAll(sql, options());
		const rows = await db.admin`select r.origin_slug, r.origin_type, v.channel from app.recipes r
			left join app.recipe_versions v on v.recipe_id = r.id where r.origin_slug like 'test-load-%' order by 1`;
		expect(rows.every((r) => r.channel === null || r.channel === 'import')).toBe(true);
		const again = await loadAll(sql, options({ dryRun: true }));
		expect(again.catalogue.recipes).toEqual({ published: 0, drafts: 0, present: 3 });
		expect(again.catalogue.ingredients.created).toBe(0);
	});

	it('publishes nothing while a review file is pending, and says so', async () => {
		const pendingRoot = writeOriginFixture(mkdtempSync(join(tmpdir(), 'load-')), { pendingReview: true });
		const result = await loadAll(sql, options({ originDirectory: pendingRoot, root: pendingRoot, dryRun: true }));
		expect(result.catalogue.recipes.published).toBe(0);
		expect(result.catalogue.publicationBlocked).not.toEqual([]);
	});
});
```

`writeOriginFixture(dir, { pendingReview?, missingInMenu? })` scrive in `dir` sia
l'origine (`ricettario/`, `menu/`) sia una copia di `scripts/import/*.yaml`: con
`pendingReview` lascia un file senza approvazione valida, e in quel test `root` punta a
`dir` (che contiene `scripts/import/`). Gli slug della fixture hanno il prefisso `test-load-` (isolamento dal seed, come
`supabase/README.md`, «Test»); `test-origin.ts` scrive la fixture e la sua pulizia
(`cleanupLoadFixture(db.admin)`) toglie solo righe con quel prefisso e la famiglia del
test.

- [ ] **Step 2: verifica che falliscano** — Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run scripts/import/load/load.db.test.ts` (database locale avviato con `supabase db start`) → FAIL.

- [ ] **Step 3: `catalogue.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { resolveReferences } from '../../../domain/src/recipe/index.ts';
import type { UnitEquivalence } from '../../../domain/src/units/equivalence.ts';
import type { Tx } from '../../../server/src/db.ts';
import { createBook, createDraft, createIngredient, publishDraft, type Actor } from '../../../server/src/catalogue/write.ts';
import { setEquivalence } from '../../../server/src/catalogue/ingredients.ts';
import type { ImportBundle } from '../bundle.ts';

// Catalogue writes of the production load (detail spec, section 6), through the curators' module with
// channel 'import'; slugs and origin slugs of the bundle are kept, so a rerun finds them again.
export interface Counted { created: number; present: number }
export interface CatalogueResult {
	books: Counted; ingredients: Counted; equivalences: Counted;
	recipes: { published: number; drafts: number; present: number };
	publicationBlocked: string[];
}
export interface CatalogueIds { ingredients: Map<string, string>; books: Map<string, string> }

export async function existingCatalogue(tx: Tx) {
	const recipes = await tx<{ s: string }[]>`select origin_slug as s from app.recipes where origin_slug is not null`;
	const ingredients = await tx<{ s: string }[]>`select slug as s from app.ingredients`;
	const books = await tx<{ s: string }[]>`select slug as s from app.books`;
	return { recipes: recipes.map((r) => r.s), ingredients: ingredients.map((r) => r.s), books: books.map((r) => r.s) };
}

async function slugIds(tx: Tx, table: 'ingredients' | 'books'): Promise<Map<string, string>> {
	const rows = table === 'ingredients'
		? await tx<{ slug: string; id: string }[]>`select slug, id from app.ingredients`
		: await tx<{ slug: string; id: string }[]>`select slug, id from app.books`;
	return new Map(rows.map((r) => [r.slug, r.id]));
}

export async function loadCatalogue(tx: Tx, actor: Actor, bundle: ImportBundle, equivalences: UnitEquivalence[]) {
	const result: CatalogueResult = {
		books: { created: 0, present: 0 }, ingredients: { created: 0, present: 0 }, equivalences: { created: 0, present: 0 },
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
	const ids: CatalogueIds = { ingredients: await slugIds(tx, 'ingredients'), books: await slugIds(tx, 'books') };
	for (const e of equivalences) {
		const ingredientId = ids.ingredients.get(e.ingredientId);
		if (!ingredientId) throw new Error(`Equivalence for unknown ingredient: ${e.ingredientId}`);
		const [same] = await tx`select 1 from app.ingredient_unit_equivalences where ingredient_id = ${ingredientId} and scope = 'recipe'
			and from_unit = ${e.fromUnit} and to_unit = ${e.toUnit} and factor = ${e.factor} and preparation is not distinct from ${e.preparation} and source = ${e.source.trim()}`;
		if (same) { result.equivalences.present++; continue; }
		await setEquivalence(tx, actor, { ingredientId, fromUnit: e.fromUnit, toUnit: e.toUnit, factor: e.factor, preparation: e.preparation, source: e.source });
		result.equivalences.created++;
	}
	const lookup = { ingredientId: (s: string) => ids.ingredients.get(s), bookId: (s: string) => ids.books.get(s) };
	const publish = bundle.pendingReview.length === 0;
	for (const r of bundle.recipes) {
		const draft = await createDraft(tx, actor, { draftId: randomUUID(), content: resolveReferences(r.document, lookup), originSlug: r.origin.slug, originType: r.origin.type });
		if (!draft.created) { result.recipes.present++; continue; }
		if (publish && r.status === 'publishable') {
			await publishDraft(tx, actor, { draftId: draft.draftId });
			result.recipes.published++;
		} else result.recipes.drafts++;
	}
	return { result, ids };
}
```

Nota per l'esecutore: `bundle.recipes` contiene solo le schede non ancora nel database
(`runImport` riceve `existingCatalogue`), quindi in `run.ts` `recipes.present` si somma
con le schede saltate da `runImport` (`imported.skipped.length`); il ramo `!draft.created`
resta come difesa. Lo stesso vale per libri e ingredienti: il bundle porta solo quelli
nuovi, e `present` di libri e ingredienti si completa in `run.ts` con il numero di slug
già presenti letti da `existingCatalogue` e citati dall'origine.

- [ ] **Step 4: `run.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type postgres from 'postgres';
import type { Tx } from '../../../server/src/db.ts';
import type { Actor } from '../../../server/src/catalogue/write.ts';
import { runImport } from '../import-recipes.ts';
import { readInputs } from '../inputs.ts';
import { existingCatalogue, loadCatalogue, type CatalogueResult } from './catalogue.ts';
import { emptyFamilyResult, type FamilyResult } from './family.ts';

// The production load as one transaction (detail spec, section 6): all or nothing, and the dry run is
// the same code ending in a rollback, so the preview counts are the real ones.
export interface LoadOptions { today: string; familyId: string; curatorId: string; root: string; originDirectory?: string; dryRun: boolean }
export interface LoadResult { mode: 'dry-run' | 'written'; catalogue: CatalogueResult; family: FamilyResult }
export class LoadRefused extends Error {}
class DryRun extends Error { constructor(readonly result: LoadResult) { super('dry run'); } }

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
	try {
		return await sql.begin(async (tx) => {
			await actAsCurator(tx, options.curatorId);
			await checkCurator(tx, options.familyId, options.curatorId);
			const existingFile = join(mkdtempSync(join(tmpdir(), 'load-existing-')), 'existing.json');
			writeFileSync(existingFile, JSON.stringify(await existingCatalogue(tx)));
			const { result: imported } = runImport({ root: options.root, originDirectory: options.originDirectory, existingFile, today: options.today });
			const inputs = readInputs(join(options.root, 'scripts/import'));
			const { result: catalogue } = await loadCatalogue(tx, actor, imported.bundle, inputs.equivalences);
			catalogue.recipes.present = imported.skipped.length;
			const family = emptyFamilyResult(); // Task 4
			const result: LoadResult = { mode: options.dryRun ? 'dry-run' : 'written', catalogue, family };
			if (options.dryRun) throw new DryRun(result);
			return result;
		}) as LoadResult;
	} catch (error) {
		if (error instanceof DryRun) return error.result;
		throw error;
	}
}
```

Verifica i nomi esatti delle funzioni di autorizzazione nella tabella di
`supabase/README.md` («Funzioni eseguibili per ruolo»: `has_role`, `is_family_admin`)
prima di scriverle.

- [ ] **Step 5: verifica** — Run: lo stesso comando dello Step 2 → PASS; `npm run typecheck` → PASS.

- [ ] **Step 6: commit**

```bash
git add scripts/import/load/catalogue.ts scripts/import/load/run.ts scripts/import/load/family.ts scripts/import/load/test-origin.ts scripts/import/load/load.db.test.ts
git commit -m "Messa in produzione: caricamento del catalogo in una transazione, anteprima a rollback"
```

### Task 4: Scritture della famiglia

**Files:**
- Modify: `scripts/import/load/family.ts`, `scripts/import/load/run.ts`,
  `scripts/import/load/load.db.test.ts`

**Interfaces:**
- Consumes: `settingsWrites` (Task 2), `plannedWeeks`, `readOriginMenus` (Task 2),
  `actAsJob` (Task 3), `buildFamilyData` da `scripts/import/family.ts`,
  `readOriginRecipes`, `originDir`, `slug` da `scripts/planner-data/origin.ts`,
  `curatorFamilySettings` da `scripts/planner-data/family.ts`, `writeSettingsKey` da
  `server/src/family/settings-writes.ts`.
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
  	findings: HistoryFinding[];     // R4 cases of buildFamilyData, for the report
  }
  export function emptyFamilyResult(): FamilyResult;
  export async function loadFamily(tx: Tx, args: { familyId: string; curatorId: string; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] }): Promise<FamilyResult>;
  ```

- [ ] **Step 1: test che falliscono** (aggiunti a `load.db.test.ts`)

```ts
it('writes settings, restrictions, owned books, ratings, tried recipes and weeks', async () => {
	const result = await loadAll(sql, options({ dryRun: true }));
	expect(result.family.settings).toBeGreaterThan(0);
	expect(result.family.ownedBooks).toEqual(['Basta un Wok']);
	expect(result.family.ratings.pending).toEqual(['test-load-bozza']); // rating of a draft
	expect(result.family.weeks.created).toBe(2); // one of history, one current
});

it('never overwrites what the family changed, and skips existing weeks', async () => {
	await loadAll(sql, options());
	await db.admin`update app.ratings set stars = 1 where user_id = ${curator}`;
	await db.admin`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${familyId}`;
	const again = await loadAll(sql, options());
	expect(again.family).toMatchObject({ settings: 0, weeks: { created: 0 }, ratings: { created: 0 } });
	const [{ stars }] = await db.admin`select stars from app.ratings where user_id = ${curator} limit 1`;
	expect(stars).toBe(1);
});

it('writes history and current meals as the app, with free text and no generation mark', async () => {
	const slots = await db.admin`select w.generated_at, s.free_text, s.servings, s.updated_by from app.meal_slots s
		join app.weeks w on w.id = s.week_id where w.family_id = ${familyId}`;
	expect(slots.every((s) => s.generated_at === null && s.updated_by === null)).toBe(true);
	expect(slots.some((s) => s.free_text === 'Pizza da asporto' && s.servings === 4)).toBe(true);
});

it('refuses a first load when the app already generated a week', async () => {
	const other = await db.createFamily([{ userId: curator, role: 'family_admin' }]);
	await db.admin`insert into app.weeks (family_id, starts_on, generated_at) values (${other}, '2026-10-19', now())`;
	await expect(loadAll(sql, options({ familyId: other, dryRun: true }))).rejects.toThrow(/already generated/);
});

it('stops when a current menu cites a recipe the app does not have', async () => {
	// fixture variant: menu with ricetta: test-load-assente
	await expect(loadAll(sql, options({ originDirectory: writeOriginFixture(mkdtempSync(join(tmpdir(), 'load-')), { missingInMenu: true }), dryRun: true })))
		.rejects.toThrow(/test-load-assente/);
});
```

- [ ] **Step 2: verifica che falliscano** — stesso comando del Task 3 → FAIL.

- [ ] **Step 3: implementazione di `loadFamily`** in `family.ts`, nell'ordine della spec
  (sezione 6, «Ordine delle scritture», punti 4–9):

```ts
export async function loadFamily(tx: Tx, args: { familyId: string; curatorId: string; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] }): Promise<FamilyResult> {
	const r = emptyFamilyResult();
	const { familyId, curatorId } = args;
	const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId}`;
	const firstLoad = !family!.settings || Object.keys(family!.settings as object).length === 0;
	const [{ generated }] = await tx<{ generated: number }[]>`select count(*)::int as generated from app.weeks where family_id = ${familyId} and generated_at is not null`;
	if (firstLoad && generated > 0) throw new LoadRefused(`Family ${familyId} already generated a week with the default settings`);

	// 4. settings
	const settings = curatorFamilySettings();
	for (const w of settingsWrites(settings, family!.settings)) { await writeSettingsKey(tx, familyId, w.path, w.value); r.settings++; }
	// 5. cucumbers, limited to one a week
	const cucumbers = await tx<{ id: string }[]>`select id from app.ingredients where slug like 'cetriol%'`;
	for (const { id } of cucumbers) count(r.restrictions, await tx`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max)
		values (${familyId}, ${id}, 'limit', 1) on conflict do nothing returning 1`);
	// 6. owned books: every book of the origin recipe book
	const bookSlugs = [...new Set(args.origin.flatMap((o) => (o.libro ? [slug(o.libro.titolo)] : [])))];
	const books = await tx<{ id: string; title: string }[]>`select id, title from app.books where slug in ${tx(bookSlugs)}`;
	for (const b of books) count(r.books, await tx`insert into app.family_books (family_id, book_id) values (${familyId}, ${b.id}) on conflict do nothing returning 1`);
	r.ownedBooks = books.map((b) => b.title).sort();
	// 7–8. ratings and tried recipes, computed on the whole origin recipe book
	const { family: data, findings } = buildFamilyData(args.origin, args.today);
	r.findings = findings;
	const recipes = new Map((await tx<{ originSlug: string; id: string; status: string }[]>`
		select origin_slug as "originSlug", id, status from app.recipes where origin_slug is not null`).map((x) => [x.originSlug, x]));
	for (const rating of data.ratings) {
		const recipe = recipes.get(rating.originSlug);
		if (!recipe) continue;
		if (recipe.status === 'draft') { r.ratings.pending.push(rating.originSlug); continue; }
		count(r.ratings, await tx`insert into app.ratings (user_id, recipe_id, stars) values (${curatorId}, ${recipe.id}, ${rating.stars}) on conflict do nothing returning 1`);
	}
	for (const originSlug of data.triedUndated) {
		const recipe = recipes.get(originSlug);
		if (recipe) count(r.tried, await tx`insert into app.family_tried_recipes (family_id, recipe_id, source) values (${familyId}, ${recipe.id}, 'import') on conflict do nothing returning 1`);
	}
	// 9. history and current menu, as the app (drafts may be cited)
	const plan = plannedWeeks({ meals: data.meals, menus: args.menus, settings, today: args.today });
	r.duplicates = plan.duplicates;
	r.notes = plan.notes;
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
`select` su `families`, `weeks` e `insert` su `family_ingredients`, `family_books`,
`ratings`, `family_tried_recipes` (il rapporto della ricerca lo conferma; se una manca,
`STATO: DOMANDA`, niente migrazioni in questa attività).

In `run.ts` sostituisci `emptyFamilyResult()` con
`await loadFamily(tx, { familyId, curatorId, origin: readOriginRecipes(origin), today, menus: readOriginMenus(origin) })`,
dove `origin = options.originDirectory ?? originDir(options.root)`, **dopo**
`loadCatalogue` (i voti vedono le ricette appena pubblicate).

- [ ] **Step 4: verifica** — stesso comando → PASS; `npm run typecheck` → PASS.

- [ ] **Step 5: commit**

```bash
git add scripts/import/load/family.ts scripts/import/load/run.ts scripts/import/load/load.db.test.ts scripts/import/load/test-origin.ts
git commit -m "Messa in produzione: impostazioni, libri, voti, provate, storico e menu in corso nel caricamento"
```

### Task 5: Comando, report e prova con i dati veri

**Files:**
- Create: `scripts/import/load.ts`, `scripts/import/load/report.ts`,
  `scripts/import/load/report.test.ts`, `scripts/import/load/args.test.ts`

**Interfaces:**
- Consumes: `checkTarget`, `describeEndpoint` (Task 1), `loadAll`, `LoadRefused`,
  `LoadResult` (Task 3–4).
- Produces:
  ```ts
  // load.ts
  export interface LoadArgs { mode: 'load' | 'check'; today?: string; familyId?: string; curatorId?: string; dryRun: boolean; local: boolean }
  export function parseLoadArgs(argv: string[]): LoadArgs; // throws with usage on bad input
  // report.ts
  export function renderLoadReport(result: LoadResult, endpoint: string): string;
  export function loadSummary(result: LoadResult): string;
  ```

- [ ] **Step 1: test che falliscono**

```ts
// args.test.ts
import { describe, expect, it } from 'vitest';
import { parseLoadArgs } from '../load.ts';

const uuid = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
describe('parseLoadArgs', () => {
	it('reads a dry run', () => {
		expect(parseLoadArgs(['--today', '2026-10-13', '--family', uuid, '--curator', uuid, '--dry-run'])).toEqual(
			{ mode: 'load', today: '2026-10-13', familyId: uuid, curatorId: uuid, dryRun: true, local: false });
	});
	it('requires today, family and curator for a load', () => {
		expect(() => parseLoadArgs(['--family', uuid, '--curator', uuid])).toThrow(/--today/);
		expect(() => parseLoadArgs(['--today', '2026-10-13', '--curator', uuid])).toThrow(/--family/);
	});
	it('refuses a curator that is not a uuid (profiles have no email)', () => {
		expect(() => parseLoadArgs(['--today', '2026-10-13', '--family', uuid, '--curator', 'fede@example.com'])).toThrow(/uuid/);
	});
	it('reads --check-connection alone', () => {
		expect(parseLoadArgs(['--check-connection', '--local'])).toMatchObject({ mode: 'check', local: true });
	});
});
```

```ts
// report.test.ts: the report opens with the mode and the blocked publication, lists pending ratings,
// owned books, R4 findings, notes and duplicates, and never contains "postgres://" or a password.
import { describe, expect, it } from 'vitest';
import { emptyFamilyResult } from './family.ts';
import { loadSummary, renderLoadReport } from './report.ts';

const result = {
	mode: 'dry-run' as const,
	catalogue: { books: { created: 1, present: 0 }, ingredients: { created: 148, present: 0 }, equivalences: { created: 2, present: 0 },
		recipes: { published: 0, drafts: 56, present: 0 }, publicationBlocked: ['ingredients.yaml'] },
	family: { ...emptyFamilyResult(), ownedBooks: ['Basta un Wok'], ratings: { created: 0, present: 0, pending: ['riso-cantonese-casa'] } },
};
describe('renderLoadReport', () => {
	it('puts mode and blocked publication first, lists what needs a look', () => {
		const text = renderLoadReport(result, 'app_server.lronuqvtjdhfyychnscr@pooler');
		expect(text.split('\n').slice(0, 6).join('\n')).toMatch(/dry-run[\s\S]*ingredients\.yaml/);
		expect(text).toContain('riso-cantonese-casa');
		expect(text).toContain('Basta un Wok');
		expect(text).not.toMatch(/postgres(ql)?:\/\//);
	});
	it('summarises in one line', () => {
		expect(loadSummary(result)).toMatch(/^dry-run: 148 ingredients, 0 published, 56 drafts/);
	});
});
```

- [ ] **Step 2: verifica che falliscano** — Run: `npx vitest run scripts/import/load` → FAIL.

- [ ] **Step 3: implementazione**

`report.ts`: Markdown in italiano (è per l'utente), titolo `# Caricamento (<mode>)`,
seconda riga con l'endpoint, poi un avviso in grassetto se `publicationBlocked` non è
vuoto («Nessuna pubblicazione: file da approvare …»), tabella dei conteggi (catalogo e
famiglia), poi sezioni «Voti in sospeso», «Libri posseduti», «Ricette dello storico
assenti», «Pasti doppi scartati», «Note del menu in corso non importate», «Casi dello storico (R4)» da
`family.findings` raggruppati per tipo (`loadFamily` li prende da `buildFamilyData`). `loadSummary`: `${mode}: ${ingredients.created} ingredients,
${published} published, ${drafts} drafts, ${weeks.created} weeks, ${ratings.created}
ratings (${pending.length} pending)`.

`load.ts`:

```ts
// Production load of the recipe book and the family's data (detail spec, section 6).
// Usage: node --env-file=<file> scripts/import/load.ts --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--dry-run] [--local]
//        node --env-file=<file> scripts/import/load.ts --check-connection [--local]
// Reads APP_SERVER_DATABASE_URL; never prints it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { checkTarget, describeEndpoint } from './load/target.ts';
import { loadAll, actAsJob } from './load/run.ts';
import { loadSummary, renderLoadReport } from './load/report.ts';
import { isValidIsoDate } from './family.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface LoadArgs { mode: 'load' | 'check'; today?: string; familyId?: string; curatorId?: string; dryRun: boolean; local: boolean }

export function parseLoadArgs(argv: string[]): LoadArgs {
	const { values } = parseArgs({ args: argv, options: {
		today: { type: 'string' }, family: { type: 'string' }, curator: { type: 'string' },
		'dry-run': { type: 'boolean', default: false }, local: { type: 'boolean', default: false }, 'check-connection': { type: 'boolean', default: false },
	} });
	if (values['check-connection']) return { mode: 'check', dryRun: true, local: values.local! };
	if (!values.today || !isValidIsoDate(values.today)) throw new Error('--today <YYYY-MM-DD> is required');
	if (!values.family || !UUID.test(values.family)) throw new Error('--family <uuid> is required');
	if (!values.curator || !UUID.test(values.curator)) throw new Error('--curator must be the uuid of the curator (the UID column of Supabase Auth)');
	return { mode: 'load', today: values.today, familyId: values.family, curatorId: values.curator, dryRun: values['dry-run']!, local: values.local! };
}

async function main() {
	const args = parseLoadArgs(process.argv.slice(2));
	const url = process.env.APP_SERVER_DATABASE_URL;
	const endpoint = checkTarget('APP_SERVER_DATABASE_URL', url, args.local ? 'local' : 'production');
	const sql = postgres(url!, { max: 1, fetch_types: false, connect_timeout: 10, onnotice: () => {} });
	try {
		if (args.mode === 'check') {
			const [row] = await sql.begin(async (tx) => {
				await actAsJob(tx);
				return tx<{ families: number; recipes: number }[]>`select (select count(*)::int from app.families) as families, (select count(*)::int from app.recipes) as recipes`;
			});
			console.log(`${describeEndpoint(endpoint)}: ${row!.families} families, ${row!.recipes} recipes visible to app_job`);
			return;
		}
		const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
		const result = await loadAll(sql, { today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, root, dryRun: args.dryRun });
		const out = resolve(root, 'scripts/import/out');
		mkdirSync(out, { recursive: true });
		writeFileSync(resolve(out, 'load-report.md'), renderLoadReport(result, describeEndpoint(endpoint)));
		console.log(loadSummary(result));
	} finally {
		await sql.end().catch(() => {});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		// Postgres errors carry code and message, never the connection string; the URL is not echoed here either.
		const e = error as { code?: string; message?: string };
		console.error(`Load failed${e.code ? ` (${e.code})` : ''}: ${e.message ?? String(error)}`);
		process.exitCode = 1;
	});
}
```

Aggiungi un test in `args.test.ts` che lanci il comando come processo figlio con
`APP_SERVER_DATABASE_URL=postgresql://app_server.abcdefghijklmnopqrst:s3cr%40t@x.pooler.supabase.com:5432/postgres`
e verifichi uscita 1, «not the production project» e assenza di `s3cr` in stderr.

- [ ] **Step 4: verifica** — Run: `npx vitest run scripts/import && npm run typecheck` → PASS.

- [ ] **Step 5: prova completa con i dati veri sullo stack locale**

Stack con Auth (`supabase start -x …` come in `supabase/README.md`), `supabase db
reset`, utente curatore e famiglia di prova con `bootstrap_test.sh` o a mano, poi:

```bash
printf 'APP_SERVER_DATABASE_URL=postgresql://app_server:app_server_test@127.0.0.1:54322/postgres\n' > /tmp/load-local.env  # solo locale, password dei test
node --env-file=/tmp/load-local.env scripts/import/load.ts --today 2026-10-13 --family <uuid> --curator <uuid> --local --dry-run
node --env-file=/tmp/load-local.env scripts/import/load.ts --today 2026-10-13 --family <uuid> --curator <uuid> --local
node --env-file=/tmp/load-local.env scripts/import/load.ts --today 2026-10-13 --family <uuid> --curator <uuid> --local --dry-run
```

Expected: primo e secondo uguali nei conteggi (148 ingredienti, 2 libri, ricette
pubblicate e bozze come nella prova di W6: 50 e 6), settimana 12–18 ottobre come «menu
in corso»; terzo con «0» creati ovunque. Poi Worker locale (`wrangler dev`) con la build
vera e controllo a vista: menu della settimana uguale a
`../meal_planner/menu/2026-10-12/menu.yaml`, impostazioni come la tabella di
`supabase/README.md`. Annota i numeri nel report della PR.

- [ ] **Step 6: commit**

```bash
git add scripts/import/load.ts scripts/import/load/report.ts scripts/import/load/report.test.ts scripts/import/load/args.test.ts scripts/import/load/family.ts
git commit -m "Messa in produzione: comando di caricamento con anteprima, report e controllo della connessione"
```

### Task 6: Rilascio in due tempi

**Files:**
- Create: `scripts/release.ts`, `scripts/release.test.ts`, `scripts/release.config.json`
- Modify: `package.json` (script `"release": "node scripts/release.ts"`), `.gitignore`

**Interfaces:**
- Consumes: `checkTarget` (Task 1).
- Produces:
  ```ts
  export type Run = (cmd: string, args: string[], options?: { env?: NodeJS.ProcessEnv; inherit?: boolean }) => { status: number; stdout: string };
  export interface Problem { check: string; message: string }
  export function previewChecks(run: Run, env: NodeJS.ProcessEnv, files: { webEnv: string | null }): { sha: string | null; problems: Problem[] };
  export function viteEnvProblems(text: string | null): Problem[];
  export function distHasSupabaseHost(files: string[], read: (f: string) => string): boolean;
  export async function smokeChecks(baseUrl: string, fetchFn: typeof fetch): Promise<Problem[]>;
  ```

- [ ] **Step 1: test che falliscono** (`release.test.ts`, con un `Run` finto che risponde
  per comando)

```ts
import { describe, expect, it } from 'vitest';
import { previewChecks, viteEnvProblems, distHasSupabaseHost, smokeChecks, type Run } from './release.ts';

const ok = (stdout = '') => ({ status: 0, stdout });
const fakeRun = (over: Record<string, ReturnType<Run>> = {}): Run => (cmd, args) => {
	const key = `${cmd} ${args.join(' ')}`;
	for (const [k, v] of Object.entries(over)) if (key.startsWith(k)) return v;
	if (key.startsWith('git rev-parse --abbrev-ref')) return ok('main\n');
	if (key.startsWith('git status --porcelain')) return ok('');
	if (key.startsWith('git rev-parse HEAD')) return ok('abc123\n');
	if (key.startsWith('git rev-parse origin/main')) return ok('abc123\n');
	if (key.startsWith('gh run list')) return ok('[{"conclusion":"success"}]');
	return ok('');
};
const env = { SUPABASE_DB_PASSWORD: 'x', APP_SERVER_DATABASE_URL: 'postgresql://app_server.lronuqvtjdhfyychnscr:x@a.pooler.supabase.com:5432/postgres' };
const webEnv = 'VITE_SUPABASE_URL=https://lronuqvtjdhfyychnscr.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n';

describe('previewChecks', () => {
	it('passes on a clean, green main', () => {
		expect(previewChecks(fakeRun(), env, { webEnv })).toEqual({ sha: 'abc123', problems: [] });
	});
	it('refuses another branch, a dirty tree, a commit behind origin and a red CI', () => {
		const checks = (over: Record<string, ReturnType<Run>>) => previewChecks(fakeRun(over), env, { webEnv }).problems.map((p) => p.check);
		expect(checks({ 'git rev-parse --abbrev-ref': ok('feature\n') })).toContain('branch');
		expect(checks({ 'git status --porcelain': ok(' M x\n') })).toContain('clean');
		expect(checks({ 'git rev-parse origin/main': ok('def456\n') })).toContain('pushed');
		expect(checks({ 'gh run list': ok('[{"conclusion":"failure"}]') })).toContain('ci');
	});
	it('refuses a missing database password', () => {
		expect(previewChecks(fakeRun(), { ...env, SUPABASE_DB_PASSWORD: undefined }, { webEnv }).problems.map((p) => p.check)).toContain('credentials');
	});
});
describe('viteEnvProblems', () => {
	it('refuses a missing file, a missing variable and a placeholder', () => {
		expect(viteEnvProblems(null)).toHaveLength(1);
		expect(viteEnvProblems('VITE_SUPABASE_URL=https://lronuqvtjdhfyychnscr.supabase.co\n')).toHaveLength(1);
		expect(viteEnvProblems(webEnv.replace('sb_publishable_abc', 'sb_publishable_REPLACE_ME'))).toHaveLength(1);
		expect(viteEnvProblems(webEnv)).toEqual([]);
	});
});
describe('distHasSupabaseHost', () => {
	it('tells a real build from the fake mode', () => {
		expect(distHasSupabaseHost(['a.js'], () => 'x="https://lronuqvtjdhfyychnscr.supabase.co"')).toBe(true);
		expect(distHasSupabaseHost(['a.js'], () => 'fake')).toBe(false);
	});
});
describe('smokeChecks', () => {
	it('expects the statuses of the spec, section 7', async () => {
		const answers: Record<string, [number, string]> = {
			'/api/openapi.json': [200, '{}'], '/api/session/whoami': [401, ''], '/mcp': [401, ''],
			'/.well-known/oauth-protected-resource/mcp': [200, '{"resource":"https://x/mcp"}'], '/menu': [200, '<html>'],
		};
		const fetchFn = (async (url: string) => {
			const path = new URL(url).pathname;
			const [status, body] = path.startsWith('/shopping-lists/') ? [404, ''] : answers[path]!;
			return new Response(body, { status });
		}) as typeof fetch;
		expect(await smokeChecks('https://x', fetchFn)).toEqual([]);
	});
	it('reports a 500 on the page that touches the database', async () => {
		const fetchFn = (async (url: string) => new Response('', { status: new URL(url).pathname.startsWith('/shopping-lists/') ? 500 : 200 })) as typeof fetch;
		expect((await smokeChecks('https://x', fetchFn)).map((p) => p.check)).toContain('database');
	});
});
```

- [ ] **Step 2: verifica che falliscano** — Run: `npx vitest run scripts/release.test.ts` → FAIL.

- [ ] **Step 3: implementazione**

`scripts/release.ts` con le funzioni sopra e un `main`:

- `--preview`: `previewChecks` (git: `rev-parse --abbrev-ref HEAD`, `status
  --porcelain`, `fetch origin main`, `rev-parse HEAD`, `rev-parse origin/main`; `gh run
  list --commit <sha> --workflow ci.yml --json conclusion --limit 1`; credenziali con
  `checkTarget('APP_SERVER_DATABASE_URL', …, 'production')` e presenza di
  `SUPABASE_DB_PASSWORD`; `viteEnvProblems(read('web/.env.production'))`), poi, se non ci
  sono problemi, `supabase db push --dry-run` (output ereditato, la CLI legge
  `SUPABASE_DB_PASSWORD` dall'ambiente) e `npx wrangler deployments list` in `server/`
  (ultima voce). Stampa `Release preview OK for <sha>. Apply with: npm run release --
  --apply <sha>` oppure l'elenco dei problemi e uscita 1.
- `--apply <sha>`: ripete `previewChecks`; ferma se `sha` diverso; `supabase db push`
  (salta se il dry-run dice che il remoto è aggiornato, testo «Remote database is up to
  date»); `npm run build -w web`; `distHasSupabaseHost` sui file di `web/dist/assets`;
  `npm run deploy -w server`; `smokeChecks(productionUrl)` se
  `scripts/release.config.json` ha `productionUrl`, altrimenti avviso «productionUrl
  not set: smoke checks skipped» e stampa l'URL letto dall'output di `wrangler deploy`
  (riga con `workers.dev`) da scrivere nel file con una PR.
- Credenziali: lo script accetta `--env-file <path>` e chiama
  `process.loadEnvFile(path)` (Node ≥ 21.7), senza mai stampare l'ambiente; senza
  l'opzione usa `/Users/fedfol/Projects/meal_planner_2/.env.production.local` se esiste,
  altrimenti problema `credentials`. I comandi figli (`supabase`, `wrangler`) ricevono
  `process.env` così caricato.

`scripts/release.config.json`: `{ "productionUrl": null }`.

`.gitignore`: dopo `!.env.example` aggiungi `!web/.env.production`.

- [ ] **Step 4: verifica** — Run: `npx vitest run scripts/release.test.ts && npm run typecheck` → PASS. Poi:

```bash
touch .env.production.local web/.env.production.local web/.env.production
git check-ignore -q .env.production.local && echo "ok root ignored"
git check-ignore -q web/.env.production.local && echo "ok web local ignored"
git check-ignore -q web/.env.production || echo "ok web/.env.production tracked"
rm .env.production.local web/.env.production.local web/.env.production
```

Expected: le tre righe «ok». (I file creati sono vuoti e si tolgono subito.)

- [ ] **Step 5: commit**

```bash
git add scripts/release.ts scripts/release.test.ts scripts/release.config.json package.json .gitignore
git commit -m "Messa in produzione: rilascio in due tempi con anteprima, build verificata e controlli"
```

### Task 7: SQL sulla produzione e azzeramento prima dell'uso

**Files:**
- Create: `scripts/prod-sql.sh`, `supabase/scripts/reset-app-data.sql`,
  `supabase/scripts/reset-app-data_test.sh`

- [ ] **Step 1: test che fallisce** — `reset-app-data_test.sh`, sul database locale come
  `bootstrap_test.sh` (container `supabase_db_meal_planner_2`, `psql_db` uguale):
  1. crea con `psql_db` una famiglia `test-reset`, un ingrediente `test-reset-olio`, una
     ricetta in bozza con `origin_slug` `test-reset-r` e un salvataggio con canale
     `import`;
  2. esegue lo script con `commit;` sostituito da `rollback;` e controlla che stampi i
     conteggi e che le righe ci siano ancora;
  3. aggiunge una riga in `app.meal_changes` della famiglia e controlla che lo script
     fallisca con «usage found» senza togliere nulla;
  4. toglie la traccia, esegue lo script vero e controlla che `app.families`,
     `app.recipes`, `app.ingredients`, `app.books` siano vuote e `app.profiles` no.

  Avvertenza nel file: **svuota tutto il catalogo e tutte le famiglie del database
  locale** (il seed si ricrea con `supabase db reset`).

  Run: `bash supabase/scripts/reset-app-data_test.sh` → FAIL (script assente).

- [ ] **Step 2: `reset-app-data.sql`**

```sql
-- Empties the catalogue and every family's data, keeping schema, users, profiles and global roles
-- (detail spec of the production launch, section 8). Only before the family starts using the app:
-- it stops, changing nothing, at the first trace of use. Run with scripts/prod-sql.sh (preview first).
begin;

do $$
declare
	v_usage text;
begin
	select string_agg(what, ', ') into v_usage from (
		select 'meal changes' as what where exists (select 1 from app.meal_changes)
		union all select 'shopping checks' where exists (select 1 from app.shopping_list_checks)
		union all select 'generated weeks' where exists (select 1 from app.weeks where generated_at is not null)
		union all select 'draft saves outside the import' where exists (select 1 from app.recipe_draft_saves where channel <> 'import')
		union all select 'versions outside the import' where exists (select 1 from app.recipe_versions where channel <> 'import')
	) u;
	if v_usage is not null then
		raise exception 'usage found (%): nothing reset', v_usage;
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
tabelle raggiunga tutte le tabelle che le citano (settimane, pasti, voti, spesa, bozze,
versioni, equivalenze, `profile_preferences`, `weekly_jobs`, `recipe_draft_requests`) e
nessuna di quelle da tenere (`profiles`, `user_roles`): elenca le chiavi esterne con
`select conrelid::regclass, confrelid::regclass from pg_constraint where contype = 'f'
and connamespace = 'app'::regnamespace`. Se `profile_preferences` viene svuotata è
accettabile (contiene solo la famiglia mostrata). I contatori di versione restano: un
valore più alto invalida solo cache.

- [ ] **Step 3: `scripts/prod-sql.sh`**

```bash
#!/usr/bin/env bash
# SQL on the production database with a preview (detail spec, section 8). The Mac has no psql: the one
# of the local stack's Postgres image runs in Podman, and the connection string reaches it only as an
# environment variable, loaded here from the credentials file and never printed.
# Usage: scripts/prod-sql.sh --preview|--apply <file.sql> [--local <url-variable-file>]
set -euo pipefail
export PATH=/opt/podman/bin:$PATH
MODE=${1:?--preview or --apply}; FILE=${2:?SQL file}
CREDENTIALS=${PROD_CREDENTIALS:-/Users/fedfol/Projects/meal_planner_2/.env.production.local}
IMAGE=public.ecr.aws/supabase/postgres:17.11.0.004
[ "$(grep -c '^begin;$' "$FILE")" = 1 ] && [ "$(grep -c '^commit;$' "$FILE")" = 1 ] || { echo "The file needs exactly one 'begin;' and one 'commit;' line" >&2; exit 1; }
[ -f "$CREDENTIALS" ] || { echo "Credentials file not found: $CREDENTIALS" >&2; exit 1; }
set -a; . "$CREDENTIALS"; set +a
node -e "import('./scripts/import/load/target.ts').then(m => console.log('Target: ' + m.describeEndpoint(m.checkTarget('POSTGRES_DATABASE_URL', process.env.POSTGRES_DATABASE_URL, process.env.PROD_SQL_TARGET ?? 'production'))))"
case "$MODE" in
	--preview) SQL=$(sed 's/^commit;$/rollback;/' "$FILE"); echo "Preview: ends with rollback" ;;
	--apply) SQL=$(cat "$FILE") ;;
	*) echo "--preview or --apply" >&2; exit 1 ;;
esac
printf '%s\n' "$SQL" | podman run --rm -i -e POSTGRES_DATABASE_URL --network host "$IMAGE" \
	sh -c 'psql "$POSTGRES_DATABASE_URL" -v ON_ERROR_STOP=1 -X'
```

(`PROD_SQL_TARGET=local` con un file di credenziali locale serve alla prova dello Step
4; in produzione resta il default.)

- [ ] **Step 4: verifica**

Run: `bash supabase/scripts/reset-app-data_test.sh` → tutte le righe «ok». Poi
`scripts/prod-sql.sh` sullo stack locale:
`PROD_CREDENTIALS=/tmp/prod-sql-local.env PROD_SQL_TARGET=local scripts/prod-sql.sh --preview supabase/scripts/bootstrap.sql`
con `POSTGRES_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` nel
file temporaneo → si ferma sull'UUID d'esempio con l'errore di `bootstrap.sql` (prova che
il file arriva e che `ON_ERROR_STOP` funziona). Con un file senza `commit;` → rifiuto.

- [ ] **Step 5: commit**

```bash
chmod +x scripts/prod-sql.sh supabase/scripts/reset-app-data_test.sh
git add scripts/prod-sql.sh supabase/scripts/reset-app-data.sql supabase/scripts/reset-app-data_test.sh
git commit -m "Messa in produzione: SQL sulla produzione con anteprima, azzeramento prima dell'uso"
```

### Task 8: Documenti e PR

**Files:**
- Modify: `server/README.md` («Pubblicazione», «Risorse di produzione»),
  `supabase/README.md` («Passi remoti», «Primi utenti del progetto vero», nuova sezione
  «Azzeramento prima dell'uso»), `scripts/import/` README se esiste (altrimenti la
  sezione d'uso in testa a `load.ts` basta)

- [ ] **Step 1: `server/README.md`** — «Pubblicazione»: `npm run release -- --preview`,
  poi `--apply <sha>` dopo il «vai» dell'utente; migrazioni comprese, dalla CLI; mai più
  «dopo che l'integrazione di Supabase ha applicato le migrazioni». «Risorse di
  produzione»: tabella da compilare nel runbook (Hyperdrive id e limite, account,
  indirizzo `workers.dev`, data del primo rilascio, del collaudo e della rotazione),
  rimando alla spec di questa attività.
- [ ] **Step 2: `supabase/README.md`** — «Passi remoti»: migrazioni con `npm run
  release` (CLI, `--dry-run` prima); `bootstrap.sql` compilato fuori dal repository e
  lanciato dal coordinatore con `scripts/prod-sql.sh`; impostazioni della famiglia
  scritte da `scripts/import/load.ts` prima della prima apertura (la tabella resta come
  riferimento del collaudo); «Azzeramento prima dell'uso» con le condizioni.
- [ ] **Step 3: verifica completa** (skill `superpowers:verification-before-completion`)

Run: `npm run typecheck && npm test` con il database locale avviato e
`TEST_DATABASE_URL` impostato, poi `bash supabase/scripts/reset-app-data_test.sh` e
`supabase test db`.
Expected: tutto verde.

- [ ] **Step 4: commit, push e PR** (protocollo dei worker, fase 6)

```bash
git add server/README.md supabase/README.md
git commit -m "Messa in produzione: documenti di pubblicazione, passi remoti e azzeramento"
git push -u origin traguardo/messa-in-produzione
gh pr create --base main --title "Messa in produzione: caricamento, rilascio e runbook" --body-file <descrizione in italiano: cosa fa, come è stato verificato con i numeri dello Step 5 del Task 5, sezioni della specifica realizzate (11, 1, 10)>
```

Poi `STATO: PR_APERTA <url>`.

---

# Parte B: runbook

Si esegue **solo dopo** il merge della PR della parte A e l'approvazione dell'utente,
passo per passo. Ogni passo: **chi**, **comando o percorso**, **verifica**, **ritorno
indietro**, **dipende da**. Ogni scrittura in produzione: anteprima all'utente, «vai»,
poi esecuzione. I comandi del coordinatore si lanciano dalla radice del checkout
principale, aggiornato a `origin/main`. `<CRED>` =
`/Users/fedfol/Projects/meal_planner_2/.env.production.local`. Il file si carica solo
dentro i comandi (spec, sezione 2).

### Fase 1: infrastruttura senza famiglia

Dipende da: PR della parte A unita.

- [ ] **R1. Accessi alle CLI** — Coordinatore: `npx wrangler whoami` (da `server/`) mostra
  l'account POWA; `supabase projects list` mostra `lronuqvtjdhfyychnscr`. Se no, l'utente
  lancia `! npx wrangler login` o `! supabase login`. Verifica: le due uscite. Ritorno:
  nessuno (sola lettura).
- [ ] **R2. Chiavi JWT** — Coordinatore: `curl -s https://lronuqvtjdhfyychnscr.supabase.co/auth/v1/.well-known/jwks.json`.
  Verifica: una chiave con `alg` `ES256` o `RS256`. Se manca: `STATO: DOMANDA` (passo 1
  dei prerequisiti di W2).
- [ ] **R3. Data API** — Utente: Dashboard › Project Settings › Data API. Verifica:
  *Exposed schemas* = `public`, `graphql_public`. Ritorno: togliere `app` se c'è.
- [ ] **R4. File delle credenziali** — Utente: crea `<CRED>` con `SUPABASE_DB_PASSWORD`
  (password del database, Dashboard › Database › Settings; se non la conosce, *Reset
  database password*) e `POSTGRES_DATABASE_URL` (Dashboard › Connect › Session pooler,
  utente `postgres.lronuqvtjdhfyychnscr`). Verifica (coordinatore): `git -C
  /Users/fedfol/Projects/meal_planner_2 check-ignore -q .env.production.local && echo
  ignored`.
- [ ] **R5. Collegamento e migrazioni** — Coordinatore:
  `supabase link --project-ref lronuqvtjdhfyychnscr` (legge `SUPABASE_DB_PASSWORD`:
  `set -a; . <CRED>; set +a; supabase link --project-ref lronuqvtjdhfyychnscr`), poi
  anteprima `set -a; . <CRED>; set +a; supabase db push --dry-run`. Verifica
  dell'anteprima: l'elenco coincide con `ls supabase/migrations`. «vai» →
  `set -a; . <CRED>; set +a; supabase db push`. Verifica: `supabase migration list`
  allineato; `scripts/prod-sql.sh --preview` di un file `begin; select count(*) from
  app.families; commit;` → 0. Ritorno: migrazione correttiva; database vuoto.
- [ ] **R6. Pool e password di `app_server`** — Utente: legge la dimensione del pool
  (Dashboard › Database › Settings › Connection pooling), genera `openssl rand -hex 24`,
  esegue nell'editor SQL `alter role app_server with password '<password>';`, aggiunge a
  `<CRED>` `APP_SERVER_DATABASE_URL=postgresql://app_server.lronuqvtjdhfyychnscr:<password>@<host del Session pooler>:5432/postgres`
  e `APP_SERVER_PASSWORD=<password>`; comunica al coordinatore solo la dimensione del pool.
  Verifica (coordinatore): `node --env-file=<CRED> scripts/import/load.ts
  --check-connection` → «0 families, 0 recipes». Ritorno: nuova password con lo stesso
  comando.
- [ ] **R7. Hyperdrive** — Coordinatore, verificando prima con Context7 le opzioni di
  `wrangler hyperdrive create` nella versione di `server/package.json`. Anteprima: il
  comando senza valori segreti e `N` = pool − 5 (almeno 5). «vai» → da `server/`:
  `set -a; . <CRED>; set +a; npx wrangler hyperdrive create cosasimangia --connection-string="$APP_SERVER_DATABASE_URL" --caching-disabled --origin-connection-limit=<N>`.
  Verifica: `npx wrangler hyperdrive get <id>` (cache disattivata, limite N). Ritorno:
  `npx wrangler hyperdrive delete <id>`.
- [ ] **R8. PR di configurazione** — Worker (o coordinatore): id di Hyperdrive e
  `account_id` (da `wrangler whoami`) in `server/wrangler.jsonc`; `web/.env.production`
  con `VITE_SUPABASE_URL=https://lronuqvtjdhfyychnscr.supabase.co` e
  `VITE_SUPABASE_PUBLISHABLE_KEY=<chiave pubblica>` (l'utente la copia da Dashboard ›
  Project Settings › API Keys, *Publishable key*: è pubblica). CI verde, merge del
  coordinatore. Verifica: `git check-ignore -q web/.env.production || echo tracked`.
  Ritorno: revert della PR.
- [ ] **R9. Primo rilascio** — Coordinatore: `npm run release -- --preview` → anteprima
  all'utente (commit, migrazioni «up to date», variabili, nessuna pubblicazione
  precedente). «vai» → `npm run release -- --apply <sha>`. Poi PR con l'indirizzo
  `workers.dev` in `scripts/release.config.json` e in `server/README.md`, e
  `npm run release -- --preview`/`--apply` ripetuti solo per i controlli (o i `curl`
  della spec, sezione 7, a mano). Verifica: tutti i controlli verdi, compreso `404` su
  `/shopping-lists/<token inesistente>`. Ritorno: `npx wrangler rollback` (da `server/`).
- [ ] **R10. Accesso di prova** — Utente: crea il proprio account (Authentication › Users
  › Add user, «Auto Confirm User») e dà al coordinatore il suo UID; entra dall'iPhone
  sull'indirizzo `workers.dev`. Verifica: accesso riuscito, app vera (non i dati finti),
  nessuna famiglia; coordinatore con `npx wrangler tail` a un'ora piena: esecuzione del
  cron senza errori. **Poi l'utente fa «Esci».** Ritorno: nessuno.

### Fase 2: import e avvio della famiglia

Dipende da: revisione dei pasti, esportazione in R2 e bozze nell'app unite su `main`;
spec di W5 riletta sulla versione unita.

- [ ] **R11. Passi esterni dell'esportazione** — Spec di W5, sezione 5: utente con i
  comandi lanciati dal coordinatore su sua richiesta (bucket `eu`, chiave nel gestore di
  password, `wrangler secret put BACKUP_ENCRYPTION_KEY` digitato dall'utente con `!`).
  Verifica e ritorno: come nella spec di W5.
- [ ] **R12. Rilascio delle attività unite** — Coordinatore: `npm run release --
  --preview` (migrazioni nuove elencate), «vai», `--apply`. Verifica: controlli verdi.
  Ritorno: `wrangler rollback`; migrazioni correttive.
- [ ] **R13. Prova delle esportazioni** — Spec di W5, sezione 6, dopo la prima notte.
  Verifica: oggetto in `exports/` decifrato con la chiave del gestore di password.
- [ ] **R14. Finestra** — Coordinatore e utente scelgono un giorno da lunedì a mercoledì;
  R15–R17 entro le 19 di quel giorno; nessuno apre l'app fino alla fine di R17.
- [ ] **R15. Account dei familiari** — Utente: Add user per ognuno, «Auto Confirm User»;
  dà al coordinatore gli UID, nome, lingua e ruolo (non le password).
- [ ] **R16. Famiglia** — Coordinatore: copia `supabase/scripts/bootstrap.sql` in
  `~/.config/cosasimangia/bootstrap.production.sql`, compila famiglia (UUID generato con
  `node -e "console.log(crypto.randomUUID())"` e annotato nel registro del
  coordinamento) e persone (Federico `family_admin` con `recipe_curator`). Anteprima
  `scripts/prod-sql.sh --preview ~/.config/cosasimangia/bootstrap.production.sql`
  all'utente, «vai», `--apply`. Verifica: secondo `--preview` senza nuove righe (avviso
  «family already exists»). Ritorno: `delete from app.families where id = '<uuid>'` con
  `prod-sql.sh` (anteprima e «vai»), finché non c'è il caricamento.
- [ ] **R17. Caricamento** — Coordinatore: `node --env-file=<CRED>
  scripts/import/load.ts --today <oggi> --family <uuid> --curator <uid di Federico>
  --dry-run`; all'utente riepilogo e `scripts/import/out/load-report.md`
  (pubblicazione bloccata? voti in sospeso, libri posseduti, menu in corso). «vai» →
  stesso comando senza `--dry-run`. Verifica: nuovo `--dry-run` con zero creati.
  Ritorno: errore → nulla scritto; caricato ma sbagliato → R18bis.
- [ ] **R18. Collaudo sull'iPhone** — Utente con il coordinatore: tabella della spec,
  sezione 5, punto 4, riga per riga; giovedì la prima settimana generata; la notte dopo
  l'esportazione più grande. Esito in `server/README.md` e nel registro. Da qui il
  vecchio flusso non pianifica più settimane.
- [ ] **R18bis. Ritorno indietro della fase 2** (solo se serve) — prima dell'uso:
  `scripts/prod-sql.sh --preview supabase/scripts/reset-app-data.sql`, «vai», `--apply`,
  correzione, poi R16–R17 in una nuova finestra; dopo l'uso: spec, sezione 8 (correzioni
  puntuali, ripristino di W5, ritorno al PDF).

### Fase 3: agenti

Dipende da: collegamento degli agenti (W2) unito; spec di W2 riletta sulla versione
unita.

- [ ] **R19. Chiave pubblica nel Worker** — PR con `SUPABASE_PUBLISHABLE_KEY` nei `vars`
  di `server/wrangler.jsonc` (valore di `web/.env.production`), se W2 non l'ha già
  messa. Merge del coordinatore.
- [ ] **R20. OAuth server e URL** — Utente, spec di W2, «Passi esterni per la
  produzione», passi 6–7: OAuth Server attivo con `/authorize` e registrazione dinamica;
  *Site URL* = indirizzo `workers.dev`, *Redirect URLs* `<origine>/**`. Verifica: passo
  8 di W2 dopo il rilascio.
- [ ] **R21. Rilascio e prova** — Coordinatore: `npm run release` (anteprima, «vai»,
  applicazione); poi passi 3 e 10 di W2 (collegamento di Claude Code, `session_whoami`,
  «Scollega», revoca verificata). Ritorno: disattivare l'OAuth server; `wrangler
  rollback`.

### Chiusura

- [ ] **R22. Rotazione delle password** — In un'ora senza uso. Utente: *Reset database
  password* e aggiornamento di `SUPABASE_DB_PASSWORD` e `POSTGRES_DATABASE_URL`; nuova
  password di `app_server` nell'editor SQL e aggiornamento di `APP_SERVER_DATABASE_URL` e
  `APP_SERVER_PASSWORD`. Coordinatore subito dopo, verificate con Context7 le opzioni di
  `wrangler hyperdrive update`: da `server/`, `set -a; . <CRED>; set +a; npx wrangler
  hyperdrive update <id> --origin-password="$APP_SERVER_PASSWORD"`. Verifica:
  `/shopping-lists/<token inesistente>` → 404; accesso e Menu sull'iPhone; cron
  dell'ora dopo senza errori in `wrangler tail`; `load.ts --check-connection`;
  `supabase migration list`. Ritorno: se Hyperdrive non si collega, ripetere `update`
  con i valori del file; le password vecchie non si ripristinano.
- [ ] **R23. Esito** — Worker o coordinatore: `server/README.md`, «Risorse di
  produzione», compilata (risorse, limite e perché, indirizzo, date); registro del
  coordinamento aggiornato; le «Decisioni da riportare» della spec passano al
  coordinatore per la specifica principale.
