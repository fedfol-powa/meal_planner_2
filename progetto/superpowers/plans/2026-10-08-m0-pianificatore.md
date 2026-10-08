# M0 Esperimento del pianificatore: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** costruire in `domain/` la generazione automatica della settimana descritta nella
specifica (sezione 3), provarla sulle ricette reali della famiglia del curatore con un report
di 20 settimane e decidere con l'utente se regole e attributi delle ricette bastano.

**Architecture:** modulo TypeScript puro, senza dipendenze di runtime, in
`domain/src/planner/`: è il primo pezzo dell'app vera (deciso l'8 ottobre 2026), non codice
usa e getta. Gli script in `scripts/` leggono in sola lettura il ricettario del progetto di
origine e un file di attributi delle ricette proposto dall'agente e rivisto dall'utente, poi
generano il report in `progetto/reports/`. Solo generazione della settimana: suggerimenti,
"proponimene altri" e giudice AI sono fuori dall'esperimento.

**Tech Stack:** Node 26 (esegue TypeScript direttamente), TypeScript ^6.0.3, Vitest ^4.1.8,
`yaml` ^2.9.1 solo negli script.

**Spec:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 3
(pianificatore), 2 (impostazioni della famiglia, attributi delle ricette), 8 e 11 (dati
d'origine), 9 (report di qualità). Regole reali della famiglia:
`../meal_planner/progetto/REGOLE.md`.

## Decisioni di preparazione (8 ottobre 2026)

- Il codice di M0 è la base dell'app vera: cartelle definitive e test.
- Attributi mancanti delle ricette: proposta dell'agente dai dati già verificati (nome, tag,
  ingredienti, tempo), revisione dell'utente. Il file rivisto diventa anche input dell'import.
- Criterio di riuscita: report automatico su 20 settimane più lettura dell'utente di alcune
  settimane generate (senza confronto alla cieca con quelle vere).
- Perimetro: solo generazione della settimana.

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documentazione e report in italiano
  (`AGENTS.md`).
- `domain/` non importa pacchetti esterni a runtime (sezione 1: modulo di dominio puro).
- `../meal_planner` si legge soltanto, non si modifica (`AGENTS.md`).
- Ingredienti mai dedotti dal nome del piatto: l'ingrediente principale di una ricetta deve
  essere una riga già presente nella sua lista verificata (`AGENTS.md`, sezione 8).
- Il prototipo in `prototype/` non si tocca.
- A parità di ingresso la settimana è la stessa: seme derivato da famiglia e settimana
  (sezione 3).
- Nessun push su GitHub senza richiesta esplicita dell'utente; commit locali.
- Import con estensione `.ts` esplicita e sintassi TypeScript cancellabile (niente `enum`),
  perché Node esegue i file `.ts` senza compilazione.

## Review Focus

- **Catalogo troppo piccolo per i vincoli:** gli slot senza candidati diventano «nessuna
  ricetta adatta», la generazione non va in errore e la riparazione termina (Task 6, Task 5).
- **Ricetta senza durata in uno slot con tempo massimo:** è esclusa, non trattata come 0
  minuti (Task 3).
- **Tutti i candidati con voto ≤ 2 stelle:** si usano lo stesso invece di lasciare lo slot
  vuoto (Task 3, Task 6).
- **Stesso ingresso, stessa settimana; settimana diversa, risultato diverso** (Task 6).
- **Confine fra settimane:** la cena di domenica pesa sulla somiglianza del pranzo di lunedì
  e una ricetta della settimana prima conta come usata di recente (Task 3, Task 4).

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Progetto radice dell'app (nuovo); il prototipo resta un progetto a sé |
| `domain/src/planner/types.ts` | Tipi e vocabolari del pianificatore |
| `domain/src/planner/calendar.ts` | Date, giorni della settimana, stagioni, distanza fra pasti |
| `domain/src/planner/random.ts` | Seme e generatore pseudocasuale deterministico, scelta pesata |
| `domain/src/planner/settings.ts` | Intervalli CREA, pesi e costanti di default |
| `domain/src/planner/groups.ts` | Gruppi alimentari, tipi di piatto, caratteristiche condivise |
| `domain/src/planner/constraints.ts` | Vincoli rigidi, candidati di uno slot, verifica delle violazioni |
| `domain/src/planner/score.ts` | Punteggio di un candidato nel contesto della settimana |
| `domain/src/planner/repair.ts` | Regole di settimana e riparazione con sostituzioni e scambi |
| `domain/src/planner/generate.ts` | Generazione della settimana |
| `domain/src/planner/metrics.ts` | Metriche di una settimana per il report |
| `domain/src/planner/index.ts` | Esportazioni pubbliche |
| `domain/src/planner/test-fixtures.ts` | Catalogo sintetico e impostazioni per i test |
| `scripts/planner-data/origin.ts` | Lettura del ricettario d'origine: durata, storico, voti |
| `scripts/planner-data/attributes.ts` | Lettura e validazione del file di attributi; ricette per il pianificatore |
| `scripts/planner-data/family.ts` | Impostazioni reali della famiglia del curatore |
| `scripts/import/recipe-attributes.yaml` | Attributi delle ricette, proposti e rivisti |
| `scripts/recipe-attributes-table.ts` | Tabella in italiano degli attributi per la revisione |
| `scripts/planner-report.ts` | Report di 20 settimane |
| `progetto/reports/*.md` | Tabella degli attributi e report generati |

---

### Task 1: Progetto radice, calendario e casualità

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `domain/src/planner/types.ts` (solo i tipi di base di questo task)
- Create: `domain/src/planner/calendar.ts`, `domain/src/planner/random.ts`
- Test: `domain/src/planner/calendar.test.ts`, `domain/src/planner/random.test.ts`

**Interfaces:**
- Produces: `IsoDate`, `MealType`, `MEAL_TYPES`, `Season` in `types.ts`;
  `addDays(date, days)`, `daysBetween(from, to)`, `weekdayOf(date)` (lunedì = 0),
  `seasonOf(date)`, `mealIndex(date, mealType)`; `seedFrom(text): number`,
  `type Random = () => number`, `createRandom(seed): Random`,
  `weightedPick<T>(choices: { item: T; weight: number }[], random): T`.

- [ ] **Step 1: Creare il progetto radice**

`package.json`:

```json
{
	"name": "app-famiglia",
	"private": true,
	"type": "module",
	"scripts": {
		"test": "vitest run",
		"typecheck": "tsc -p tsconfig.json",
		"planner-report": "node scripts/planner-report.ts",
		"recipe-attributes-table": "node scripts/recipe-attributes-table.ts"
	}
}
```

Poi installare le dipendenze di sviluppo (le versioni seguono il prototipo):

Run: `npm install -D typescript@^6.0.3 vitest@^4.1.8 yaml@^2.9.1 @types/node`

`tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ES2024",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"allowImportingTsExtensions": true,
		"erasableSyntaxOnly": true,
		"verbatimModuleSyntax": true,
		"skipLibCheck": true,
		"types": ["node"]
	},
	"include": ["domain/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// The prototype keeps its own Vitest setup in prototype/.
export default defineConfig({
	test: { include: ['domain/**/*.test.ts', 'scripts/**/*.test.ts'] }
});
```

`domain/src/planner/types.ts` (primo contenuto, ampliato nel Task 2):

```ts
/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
export const MEAL_TYPES = ['lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
```

- [ ] **Step 2: Scrivere i test del calendario e della casualità**

`domain/src/planner/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, mealIndex, seasonOf, weekdayOf } from './calendar.ts';

describe('calendar', () => {
	it('adds days across months and years', () => {
		expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
	});
	it('counts days between dates', () => {
		expect(daysBetween('2026-10-12', '2026-10-26')).toBe(14);
		expect(daysBetween('2026-10-26', '2026-10-12')).toBe(-14);
	});
	it('numbers weekdays from Monday', () => {
		expect(weekdayOf('2026-10-12')).toBe(0);
		expect(weekdayOf('2026-10-18')).toBe(6);
	});
	it('maps months to seasons', () => {
		expect(seasonOf('2026-03-01')).toBe('spring');
		expect(seasonOf('2026-08-31')).toBe('summer');
		expect(seasonOf('2026-10-12')).toBe('autumn');
		expect(seasonOf('2026-12-01')).toBe('winter');
		expect(seasonOf('2027-02-28')).toBe('winter');
	});
	it('puts Sunday dinner right before Monday lunch', () => {
		expect(mealIndex('2026-10-19', 'lunch') - mealIndex('2026-10-18', 'dinner')).toBe(1);
		expect(mealIndex('2026-10-12', 'dinner') - mealIndex('2026-10-12', 'lunch')).toBe(1);
	});
});
```

`domain/src/planner/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRandom, seedFrom, weightedPick } from './random.ts';

describe('random', () => {
	it('derives the same seed from the same text', () => {
		expect(seedFrom('family-a:2026-10-12')).toBe(seedFrom('family-a:2026-10-12'));
		expect(seedFrom('family-a:2026-10-12')).not.toBe(seedFrom('family-a:2026-10-19'));
	});
	it('repeats the same sequence for the same seed, within [0, 1)', () => {
		const a = createRandom(42);
		const b = createRandom(42);
		for (let i = 0; i < 100; i++) {
			const x = a();
			expect(x).toBe(b());
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThan(1);
		}
	});
	it('never picks a choice with weight zero', () => {
		const random = createRandom(7);
		for (let i = 0; i < 1000; i++) {
			expect(weightedPick([{ item: 'never', weight: 0 }, { item: 'always', weight: 1 }], random)).toBe('always');
		}
	});
	it('refuses an empty list', () => {
		expect(() => weightedPick([], createRandom(1))).toThrow();
	});
});
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `npx vitest run domain/src/planner`
Expected: FAIL, moduli `./calendar.ts` e `./random.ts` non trovati.

- [ ] **Step 4: Implementare**

`domain/src/planner/calendar.ts`:

```ts
import type { IsoDate, MealType, Season } from './types.ts';

const DAY_MS = 86_400_000;
const timeOf = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);

export function addDays(date: IsoDate, days: number): IsoDate {
	return new Date(timeOf(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
	return Math.round((timeOf(to) - timeOf(from)) / DAY_MS);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayOf(date: IsoDate): number {
	return (new Date(timeOf(date)).getUTCDay() + 6) % 7;
}

export function seasonOf(date: IsoDate): Season {
	const month = Number(date.slice(5, 7));
	if (month >= 3 && month <= 5) return 'spring';
	if (month >= 6 && month <= 8) return 'summer';
	if (month >= 9 && month <= 11) return 'autumn';
	return 'winter';
}

/** Position of a meal on one timeline with two meals a day: the difference is the distance in meals. */
export function mealIndex(date: IsoDate, mealType: MealType): number {
	return daysBetween('2000-01-03', date) * 2 + (mealType === 'dinner' ? 1 : 0);
}
```

`domain/src/planner/random.ts`:

```ts
/** FNV-1a: a stable 32-bit seed from a text such as "family:week". */
export function seedFrom(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export type Random = () => number;

/** Mulberry32: small, fast and deterministic, enough to choose among good candidates. */
export function createRandom(seed: number): Random {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function weightedPick<T>(choices: { item: T; weight: number }[], random: Random): T {
	if (choices.length === 0) throw new Error('weightedPick: no choices');
	const total = choices.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
	if (total <= 0) return choices[0].item;
	let rest = random() * total;
	for (const choice of choices) {
		rest -= Math.max(choice.weight, 0);
		if (rest < 0) return choice.item;
	}
	return choices[choices.length - 1].item;
}
```

- [ ] **Step 5: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS, nessun errore di tipo.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts domain
git commit -m "Dominio: progetto radice, calendario e casualità deterministica del pianificatore"
```

---

### Task 2: Tipi, impostazioni di default e caratteristiche delle ricette

**Files:**
- Modify: `domain/src/planner/types.ts`
- Create: `domain/src/planner/settings.ts`, `domain/src/planner/groups.ts`,
  `domain/src/planner/test-fixtures.ts`
- Test: `domain/src/planner/groups.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `MealType`, `Season` (Task 1).
- Produces: in `types.ts` `RecipeMealType`, `PROTEIN_GROUPS`/`ProteinGroup`,
  `CARBOHYDRATE_GROUPS`/`CarbohydrateGroup`, `CATEGORIES`/`Category`, `SEASONS`,
  `FOOD_GROUPS`/`FoodGroup`, `DishKind`, `PlannerRecipe`, `SlotSetting`, `MealRule`,
  `GroupRange`, `ScoreWeights`, `PlannerSettings`, `IngredientRestriction`, `PastMeal`,
  `PlannerInput`, `SlotContent`, `PlannedSlot`, `PlannedWeek`; in `settings.ts`
  `CREA_RANGES`, `DEFAULT_WEIGHTS`, `DEFAULT_KNOWN_NEW`, `SIMILARITY_WINDOW`, `RECENT_DAYS`,
  `LOW_SCORE`, `TOP_K`, `KNOWN_NEW_MIN_COOKED`, `MAX_REPAIR_ROUNDS`,
  `defaultPlannerSettings(servings)`; in `groups.ts` `foodGroupsOf(recipe)`,
  `dishKindsOf(recipe)`, `sharedFeatures(a, b)`, `uses(recipe, ingredientId)`; in
  `test-fixtures.ts` `recipe(id, over)`, `familySettings()`, `syntheticCatalogue(size)`,
  `baseInput(over)`.

I vocabolari sono la proposta dell'agente per gli attributi della sezione 2
(`protein_group`, `carbohydrate_group`, `category`, `meal_type`, `seasons`, `is_heavy`,
`has_vegetables`, ingrediente principale); l'utente li conferma rivedendo la classificazione
nel Task 9.

- [ ] **Step 1: Completare i tipi**

Aggiungere a `domain/src/planner/types.ts`:

```ts
export type RecipeMealType = MealType | 'both';
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Main protein of a recipe; vegetarian = none of the others (spec section 3 groups). */
export const PROTEIN_GROUPS = ['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'] as const;
export type ProteinGroup = (typeof PROTEIN_GROUPS)[number];

export const CARBOHYDRATE_GROUPS = ['pasta', 'rice', 'potatoes', 'bread', 'cereals', 'none'] as const;
export type CarbohydrateGroup = (typeof CARBOHYDRATE_GROUPS)[number];

/** Kind of dish, for the similarity penalty ("two woks, two savoury pies"). */
export const CATEGORIES = ['wok', 'skottle', 'oven_bake', 'grill', 'pan', 'soup', 'salad', 'savoury_pie', 'wrap_sandwich', 'burger', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Weekly food groups with ranges (spec section 3); vegetables are a bonus, not a range. */
export const FOOD_GROUPS = ['fish', 'legumes', 'white_meat', 'red_meat', 'cured_meat', 'eggs', 'cheese', 'potatoes', 'heavy'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

/** Dish kinds a meal rule can name (rule templates of round 4). */
export type DishKind = 'pasta' | 'rice' | 'bread_wrap' | 'skottle';

export interface PlannerRecipe {
	id: string;
	durationMinutes: number | null;
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup;
	carbohydrateGroup: CarbohydrateGroup;
	category: Category;
	hasVegetables: boolean;
	isHeavy: boolean;
	/** Empty means all year. */
	seasons: Season[];
	/** One of the recipe's own ingredient lines, never inferred from the dish name. */
	primaryIngredientId: string | null;
	ingredients: { ingredientId: string; isOptional: boolean }[];
	bookId: string | null;
}

/** One meal of the weekly pattern: servings (0 = not planned), a fixed free meal, a time limit. */
export interface SlotSetting {
	servings: number;
	fixedText: string | null;
	maxMinutes: number | null;
}

/** Rule templates (spec section 2): weekday 0 = Monday. */
export type MealRule =
	| { kind: 'only_lunch'; dish: DishKind }
	| { kind: 'at_least_one'; group: ProteinGroup; weekday: number }
	| { kind: 'never_on'; group: ProteinGroup; weekday: number };

export interface GroupRange {
	min: number;
	max: number;
}

/** Score weights: in families.settings, not shown in the interface. */
export interface ScoreWeights {
	liking: number;
	recency: number;
	season: number;
	balance: number;
	similarity: number;
	vegetables: number;
	knownNew: number;
	limit: number;
}

export interface PlannerSettings {
	/** Seven entries per meal, Monday first. */
	slots: Record<MealType, SlotSetting[]>;
	rules: MealRule[];
	knownNew: { known: number; new: number; tolerance: number };
	groupRanges: Record<FoodGroup, GroupRange>;
	weights: ScoreWeights;
}

export interface IngredientRestriction {
	ingredientId: string;
	restriction: 'avoid' | 'limit';
	weeklyMax: number | null;
}

/** A past meal with a recipe: always counts as eaten (spec section 2). */
export interface PastMeal {
	date: IsoDate;
	mealType: MealType;
	recipeId: string;
}

/**
 * Everything the planner reads. `recipes` is the catalogue visible to the family without books:
 * published and not archived; the planner itself drops excluded recipes and books not owned.
 */
export interface PlannerInput {
	familyId: string;
	/** Monday of the week to generate. */
	weekStart: IsoDate;
	settings: PlannerSettings;
	recipes: PlannerRecipe[];
	ownedBookIds: string[];
	exclusions: string[];
	restrictions: IngredientRestriction[];
	/** Family average stars per recipe. */
	familyScores: Record<string, number>;
	/** Anonymous average over all families, for the cold start. */
	globalScores: Record<string, number>;
	/** Past meals of previous weeks, oldest first. */
	history: PastMeal[];
}

export type SlotContent = { kind: 'recipe'; recipeId: string } | { kind: 'free'; text: string } | { kind: 'no_match' };

export interface PlannedSlot {
	date: IsoDate;
	mealType: MealType;
	servings: number;
	content: SlotContent;
}

export interface PlannedWeek {
	weekStart: IsoDate;
	slots: PlannedSlot[];
}
```

- [ ] **Step 2: Scrivere le impostazioni di default**

`domain/src/planner/settings.ts`:

```ts
import type { FoodGroup, GroupRange, PlannerSettings, ScoreWeights, SlotSetting } from './types.ts';

/** Default weekly ranges of spec section 3 (CREA 2018 frequencies adapted to about 12 planned meals). */
export const CREA_RANGES: Record<FoodGroup, GroupRange> = {
	fish: { min: 2, max: 3 },
	legumes: { min: 2, max: 4 },
	white_meat: { min: 1, max: 3 },
	red_meat: { min: 0, max: 1 },
	cured_meat: { min: 0, max: 1 },
	eggs: { min: 1, max: 2 },
	cheese: { min: 0, max: 2 },
	potatoes: { min: 0, max: 2 },
	heavy: { min: 0, max: 1 }
};

/** Starting weights for the experiment; the report is where they get tuned. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
	liking: 3,
	recency: 1,
	season: 1,
	balance: 2,
	similarity: 2,
	vegetables: 0.5,
	knownNew: 1.5,
	limit: 1
};

export const DEFAULT_KNOWN_NEW = { known: 7, new: 5, tolerance: 1 };
/** Meals around a slot that weigh on similarity, across weeks. */
export const SIMILARITY_WINDOW = 6;
/** A recipe used in the previous 14 days is not proposed again. */
export const RECENT_DAYS = 14;
/** Family score at or below this is excluded, unless there is nothing else. */
export const LOW_SCORE = 2;
/** The choice is weighted among the best few candidates. */
export const TOP_K = 4;
/** The known/new quota applies once the family has cooked this many recipes. */
export const KNOWN_NEW_MIN_COOKED = 10;
export const MAX_REPAIR_ROUNDS = 20;

const plain = (servings: number): SlotSetting => ({ servings, fixedText: null, maxMinutes: null });

/** New family (spec section 2): every lunch and dinner for `servings`, no fixed meals, limits or rules. */
export function defaultPlannerSettings(servings = 2): PlannerSettings {
	return {
		slots: {
			lunch: Array.from({ length: 7 }, () => plain(servings)),
			dinner: Array.from({ length: 7 }, () => plain(servings))
		},
		rules: [],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: structuredClone(CREA_RANGES),
		weights: { ...DEFAULT_WEIGHTS }
	};
}
```

- [ ] **Step 3: Scrivere le fixture di test**

`domain/src/planner/test-fixtures.ts`:

```ts
import { CREA_RANGES, DEFAULT_KNOWN_NEW, DEFAULT_WEIGHTS } from './settings.ts';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, type PlannerInput, type PlannerRecipe, type PlannerSettings, type SlotSetting } from './types.ts';

export function recipe(id: string, over: Partial<PlannerRecipe> = {}): PlannerRecipe {
	return {
		id,
		durationMinutes: 20,
		mealType: 'both',
		proteinGroup: 'vegetarian',
		carbohydrateGroup: 'none',
		category: 'other',
		hasVegetables: true,
		isHeavy: false,
		seasons: [],
		primaryIngredientId: null,
		ingredients: [],
		bookId: null,
		...over
	};
}

const slot = (servings: number, fixedText: string | null = null, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText, maxMinutes });

/** Shaped like the curator's family (origin REGOLE.md): 12 planned meals, Friday fish, no fish on Monday. */
export function familySettings(): PlannerSettings {
	return {
		slots: {
			lunch: [slot(2), slot(3), slot(3), slot(3), slot(3), slot(4), slot(4, 'Pizza')],
			dinner: [slot(2, null, 20), slot(4), slot(2, null, 20), slot(4), slot(4), slot(4, 'Cena libera'), slot(4)]
		},
		rules: [
			{ kind: 'only_lunch', dish: 'pasta' },
			{ kind: 'at_least_one', group: 'fish', weekday: 4 },
			{ kind: 'never_on', group: 'fish', weekday: 0 }
		],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: structuredClone(CREA_RANGES),
		weights: { ...DEFAULT_WEIGHTS }
	};
}

/** A varied catalogue: protein, carbohydrate, category and time cycle with the index. */
export function syntheticCatalogue(size = 60): PlannerRecipe[] {
	return Array.from({ length: size }, (_, i) => {
		const carbohydrateGroup = CARBOHYDRATE_GROUPS[i % CARBOHYDRATE_GROUPS.length];
		return recipe(`r${String(i).padStart(2, '0')}`, {
			proteinGroup: PROTEIN_GROUPS[i % PROTEIN_GROUPS.length],
			carbohydrateGroup,
			category: CATEGORIES[(i * 3) % CATEGORIES.length],
			durationMinutes: [10, 15, 20, 25, 30, 40][i % 6],
			mealType: carbohydrateGroup === 'pasta' ? 'lunch' : (['both', 'both', 'dinner', 'lunch'] as const)[i % 4],
			isHeavy: i % 9 === 0,
			hasVegetables: i % 4 !== 0,
			primaryIngredientId: `ingredient-${i % 15}`,
			ingredients: [{ ingredientId: `ingredient-${i % 15}`, isOptional: false }]
		});
	});
}

export function baseInput(over: Partial<PlannerInput> = {}): PlannerInput {
	return {
		familyId: 'family-test',
		weekStart: '2026-10-12',
		settings: familySettings(),
		recipes: syntheticCatalogue(),
		ownedBookIds: [],
		exclusions: [],
		restrictions: [],
		familyScores: {},
		globalScores: {},
		history: [],
		...over
	};
}
```

- [ ] **Step 4: Scrivere il test delle caratteristiche**

`domain/src/planner/groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dishKindsOf, foodGroupsOf, sharedFeatures, uses } from './groups.ts';
import { recipe } from './test-fixtures.ts';

describe('food groups', () => {
	it('counts the main protein, potatoes and heavy dishes', () => {
		expect(foodGroupsOf(recipe('a', { proteinGroup: 'fish', carbohydrateGroup: 'potatoes', isHeavy: true }))).toEqual(['fish', 'potatoes', 'heavy']);
		expect(foodGroupsOf(recipe('b', { proteinGroup: 'vegetarian' }))).toEqual([]);
	});
});

describe('dish kinds', () => {
	it('derives rule dish kinds from carbohydrate and category', () => {
		expect(dishKindsOf(recipe('a', { carbohydrateGroup: 'pasta' }))).toEqual(['pasta']);
		expect(dishKindsOf(recipe('b', { carbohydrateGroup: 'bread', category: 'skottle' }))).toEqual(['bread_wrap', 'skottle']);
	});
});

describe('similarity features', () => {
	it('shares protein, carbohydrate, primary ingredient and category, ignoring the generic values', () => {
		const a = recipe('a', { proteinGroup: 'fish', carbohydrateGroup: 'rice', primaryIngredientId: 'salmone', category: 'wok' });
		const b = recipe('b', { proteinGroup: 'fish', carbohydrateGroup: 'rice', primaryIngredientId: 'salmone', category: 'wok' });
		expect(sharedFeatures(a, b)).toEqual(['protein', 'carbohydrate', 'primary_ingredient', 'category']);
		expect(sharedFeatures(recipe('c'), recipe('d'))).toEqual([]);
	});
});

describe('ingredient use', () => {
	it('ignores optional lines', () => {
		const r = recipe('a', { ingredients: [{ ingredientId: 'cetrioli', isOptional: true }, { ingredientId: 'pomodori', isOptional: false }] });
		expect(uses(r, 'cetrioli')).toBe(false);
		expect(uses(r, 'pomodori')).toBe(true);
	});
});
```

- [ ] **Step 5: Eseguire il test e verificare che fallisca**

Run: `npx vitest run domain/src/planner/groups.test.ts`
Expected: FAIL, modulo `./groups.ts` non trovato.

- [ ] **Step 6: Implementare**

`domain/src/planner/groups.ts`:

```ts
import { FOOD_GROUPS, type DishKind, type FoodGroup, type PlannerRecipe } from './types.ts';

export function foodGroupsOf(recipe: PlannerRecipe): FoodGroup[] {
	const groups: FoodGroup[] = [];
	if ((FOOD_GROUPS as readonly string[]).includes(recipe.proteinGroup)) groups.push(recipe.proteinGroup as FoodGroup);
	if (recipe.carbohydrateGroup === 'potatoes') groups.push('potatoes');
	if (recipe.isHeavy) groups.push('heavy');
	return groups;
}

export function dishKindsOf(recipe: PlannerRecipe): DishKind[] {
	const kinds: DishKind[] = [];
	if (recipe.carbohydrateGroup === 'pasta') kinds.push('pasta');
	if (recipe.carbohydrateGroup === 'rice') kinds.push('rice');
	if (recipe.carbohydrateGroup === 'bread') kinds.push('bread_wrap');
	if (recipe.category === 'skottle') kinds.push('skottle');
	return kinds;
}

/** What two recipes have in common for the similarity penalty (spec section 3). */
export function sharedFeatures(a: PlannerRecipe, b: PlannerRecipe): string[] {
	const shared: string[] = [];
	if (a.proteinGroup === b.proteinGroup && a.proteinGroup !== 'vegetarian') shared.push('protein');
	if (a.carbohydrateGroup === b.carbohydrateGroup && a.carbohydrateGroup !== 'none') shared.push('carbohydrate');
	if (a.primaryIngredientId !== null && a.primaryIngredientId === b.primaryIngredientId) shared.push('primary_ingredient');
	if (a.category === b.category && a.category !== 'other') shared.push('category');
	return shared;
}

/** True when the recipe needs the ingredient (optional lines do not count). */
export function uses(recipe: PlannerRecipe, ingredientId: string): boolean {
	return recipe.ingredients.some((line) => !line.isOptional && line.ingredientId === ingredientId);
}
```

- [ ] **Step 7: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add domain
git commit -m "Dominio: tipi, impostazioni di default e caratteristiche delle ricette per il pianificatore"
```

---

### Task 3: Vincoli rigidi e candidati di uno slot

**Files:**
- Create: `domain/src/planner/constraints.ts`
- Test: `domain/src/planner/constraints.test.ts`

**Interfaces:**
- Consumes: Task 1 e 2.
- Produces: `interface SlotRef { date: IsoDate; mealType: MealType; maxMinutes: number | null }`;
  `slotSettingOf(settings, date, mealType): SlotSetting`;
  `slotRefOf(slot: Pick<PlannedSlot, 'date' | 'mealType'>, settings): SlotRef`;
  `fitsSlot(recipe, slot: SlotRef, rules): boolean`; `isAvailable(recipe, input): boolean`;
  `recentlyUsed(recipeId, weekStart, history): boolean`;
  `withinLimits(candidate, weekRecipes, restrictions): boolean`;
  `candidatesFor(slot: SlotRef, input, weekRecipes: PlannerRecipe[]): PlannerRecipe[]`;
  `hardViolations(week: PlannedWeek, input): string[]`.

Vincoli rigidi della sezione 3: tempo e pasto adatto, regole di pasto (pasta solo a pranzo,
mai un gruppo in un giorno), esclusioni, libri non posseduti, ingredienti evitati non
opzionali, ricetta usata nei 14 giorni precedenti o già nella settimana, massimo settimanale
degli ingredienti limitati, voto ≤ 2 salvo mancanza di alternative.

- [ ] **Step 1: Scrivere i test**

`domain/src/planner/constraints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { candidatesFor, fitsSlot, hardViolations, isAvailable, recentlyUsed, withinLimits } from './constraints.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { MealRule, PlannedWeek } from './types.ts';

const rules: MealRule[] = [
	{ kind: 'only_lunch', dish: 'pasta' },
	{ kind: 'never_on', group: 'fish', weekday: 0 }
];

describe('fitsSlot', () => {
	it('respects the time limit and excludes recipes without a duration', () => {
		const slot = { date: '2026-10-12', mealType: 'dinner' as const, maxMinutes: 20 };
		expect(fitsSlot(recipe('a', { durationMinutes: 20 }), slot, [])).toBe(true);
		expect(fitsSlot(recipe('b', { durationMinutes: 25 }), slot, [])).toBe(false);
		expect(fitsSlot(recipe('c', { durationMinutes: null }), slot, [])).toBe(false);
		expect(fitsSlot(recipe('d', { durationMinutes: null }), { ...slot, maxMinutes: null }, [])).toBe(true);
	});
	it('respects the meal type', () => {
		expect(fitsSlot(recipe('a', { mealType: 'lunch' }), { date: '2026-10-13', mealType: 'dinner', maxMinutes: null }, [])).toBe(false);
	});
	it('applies pasta only at lunch and never fish on Monday', () => {
		const pasta = recipe('p', { carbohydrateGroup: 'pasta' });
		const fish = recipe('f', { proteinGroup: 'fish' });
		expect(fitsSlot(pasta, { date: '2026-10-13', mealType: 'dinner', maxMinutes: null }, rules)).toBe(false);
		expect(fitsSlot(pasta, { date: '2026-10-13', mealType: 'lunch', maxMinutes: null }, rules)).toBe(true);
		expect(fitsSlot(fish, { date: '2026-10-12', mealType: 'lunch', maxMinutes: null }, rules)).toBe(false);
		expect(fitsSlot(fish, { date: '2026-10-13', mealType: 'lunch', maxMinutes: null }, rules)).toBe(true);
	});
});

describe('isAvailable', () => {
	it('drops exclusions, books not owned and avoided ingredients that are not optional', () => {
		const input = baseInput({ exclusions: ['x'], ownedBookIds: ['owned'], restrictions: [{ ingredientId: 'peperoncino', restriction: 'avoid', weeklyMax: null }] });
		expect(isAvailable(recipe('x'), input)).toBe(false);
		expect(isAvailable(recipe('b', { bookId: 'other' }), input)).toBe(false);
		expect(isAvailable(recipe('c', { bookId: 'owned' }), input)).toBe(true);
		expect(isAvailable(recipe('d', { ingredients: [{ ingredientId: 'peperoncino', isOptional: false }] }), input)).toBe(false);
		expect(isAvailable(recipe('e', { ingredients: [{ ingredientId: 'peperoncino', isOptional: true }] }), input)).toBe(true);
	});
});

describe('recentlyUsed', () => {
	it('looks at the 14 days before the week, across the week boundary', () => {
		const history = [{ date: '2026-09-28', mealType: 'lunch' as const, recipeId: 'old' }, { date: '2026-10-11', mealType: 'dinner' as const, recipeId: 'sunday' }];
		expect(recentlyUsed('sunday', '2026-10-12', history)).toBe(true);
		expect(recentlyUsed('old', '2026-10-12', history)).toBe(true);
		expect(recentlyUsed('old', '2026-10-19', history)).toBe(false);
	});
});

describe('withinLimits', () => {
	it('stops a limited ingredient at its weekly maximum', () => {
		const limited = [{ ingredientId: 'cetrioli', restriction: 'limit' as const, weeklyMax: 1 }];
		const withCucumber = recipe('a', { ingredients: [{ ingredientId: 'cetrioli', isOptional: false }] });
		expect(withinLimits(withCucumber, [], limited)).toBe(true);
		expect(withinLimits(withCucumber, [recipe('b', { ingredients: [{ ingredientId: 'cetrioli', isOptional: false }] })], limited)).toBe(false);
		expect(withinLimits(recipe('c'), [withCucumber], limited)).toBe(true);
	});
});

describe('candidatesFor', () => {
	const slot = { date: '2026-10-13', mealType: 'lunch' as const, maxMinutes: null };
	it('excludes recipes already in the week', () => {
		const input = baseInput({ recipes: [recipe('a'), recipe('b')] });
		expect(candidatesFor(slot, input, [recipe('a')]).map((r) => r.id)).toEqual(['b']);
	});
	it('drops low-rated recipes when others exist, and keeps them when nothing else fits', () => {
		const scored = baseInput({ recipes: [recipe('low'), recipe('good')], familyScores: { low: 2, good: 4 } });
		expect(candidatesFor(slot, scored, []).map((r) => r.id)).toEqual(['good']);
		const onlyLow = baseInput({ recipes: [recipe('low'), recipe('lower')], familyScores: { low: 2, lower: 1 } });
		expect(candidatesFor(slot, onlyLow, []).map((r) => r.id)).toEqual(['low', 'lower']);
	});
});

describe('hardViolations', () => {
	it('reports missing slots, changed fixed meals and invalid recipes', () => {
		const input = baseInput({ recipes: [recipe('long', { durationMinutes: 40 })] });
		const week: PlannedWeek = {
			weekStart: '2026-10-12',
			slots: [
				{ date: '2026-10-12', mealType: 'dinner', servings: 2, content: { kind: 'recipe', recipeId: 'long' } },
				{ date: '2026-10-18', mealType: 'lunch', servings: 4, content: { kind: 'no_match' } }
			]
		};
		const problems = hardViolations(week, input);
		expect(problems).toContain('2026-10-12 dinner: does not fit the slot');
		expect(problems).toContain('2026-10-18 lunch: fixed meal changed');
		expect(problems).toContain('2026-10-12 lunch: missing');
	});
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run domain/src/planner/constraints.test.ts`
Expected: FAIL, modulo `./constraints.ts` non trovato.

- [ ] **Step 3: Implementare**

`domain/src/planner/constraints.ts`:

```ts
import { addDays, weekdayOf } from './calendar.ts';
import { dishKindsOf, uses } from './groups.ts';
import { LOW_SCORE, RECENT_DAYS } from './settings.ts';
import { MEAL_TYPES, type IngredientRestriction, type IsoDate, type MealRule, type MealType, type PastMeal, type PlannedSlot, type PlannedWeek, type PlannerInput, type PlannerRecipe, type PlannerSettings, type SlotSetting } from './types.ts';

export interface SlotRef {
	date: IsoDate;
	mealType: MealType;
	maxMinutes: number | null;
}

export function slotSettingOf(settings: PlannerSettings, date: IsoDate, mealType: MealType): SlotSetting {
	return settings.slots[mealType][weekdayOf(date)];
}

export function slotRefOf(slot: Pick<PlannedSlot, 'date' | 'mealType'>, settings: PlannerSettings): SlotRef {
	return { date: slot.date, mealType: slot.mealType, maxMinutes: slotSettingOf(settings, slot.date, slot.mealType).maxMinutes };
}

/** Time limit, meal type and meal rules of the slot. A recipe without a duration never fits a time limit. */
export function fitsSlot(recipe: PlannerRecipe, slot: SlotRef, rules: MealRule[]): boolean {
	if (slot.maxMinutes !== null && (recipe.durationMinutes === null || recipe.durationMinutes > slot.maxMinutes)) return false;
	if (recipe.mealType !== 'both' && recipe.mealType !== slot.mealType) return false;
	const weekday = weekdayOf(slot.date);
	const kinds = dishKindsOf(recipe);
	for (const rule of rules) {
		if (rule.kind === 'only_lunch' && slot.mealType === 'dinner' && kinds.includes(rule.dish)) return false;
		if (rule.kind === 'never_on' && rule.weekday === weekday && recipe.proteinGroup === rule.group) return false;
	}
	return true;
}

/** Exclusions, books the family does not own and avoided ingredients (optional lines allowed). */
export function isAvailable(recipe: PlannerRecipe, input: PlannerInput): boolean {
	if (input.exclusions.includes(recipe.id)) return false;
	if (recipe.bookId !== null && !input.ownedBookIds.includes(recipe.bookId)) return false;
	return !input.restrictions.some((r) => r.restriction === 'avoid' && uses(recipe, r.ingredientId));
}

export function recentlyUsed(recipeId: string, weekStart: IsoDate, history: PastMeal[]): boolean {
	const from = addDays(weekStart, -RECENT_DAYS);
	return history.some((meal) => meal.recipeId === recipeId && meal.date >= from && meal.date < weekStart);
}

export function withinLimits(candidate: PlannerRecipe, weekRecipes: PlannerRecipe[], restrictions: IngredientRestriction[]): boolean {
	return restrictions.every(
		(r) =>
			r.restriction !== 'limit' ||
			r.weeklyMax === null ||
			!uses(candidate, r.ingredientId) ||
			weekRecipes.filter((w) => uses(w, r.ingredientId)).length < r.weeklyMax
	);
}

/** Recipes that can go in the slot given the rest of the week; low-rated ones only if nothing else fits. */
export function candidatesFor(slot: SlotRef, input: PlannerInput, weekRecipes: PlannerRecipe[]): PlannerRecipe[] {
	const used = new Set(weekRecipes.map((r) => r.id));
	const valid = input.recipes.filter(
		(r) =>
			!used.has(r.id) &&
			isAvailable(r, input) &&
			fitsSlot(r, slot, input.settings.rules) &&
			!recentlyUsed(r.id, input.weekStart, input.history) &&
			withinLimits(r, weekRecipes, input.restrictions)
	);
	const liked = valid.filter((r) => (input.familyScores[r.id] ?? Infinity) > LOW_SCORE);
	return liked.length > 0 ? liked : valid;
}

/** Every broken hard constraint of a generated week, as readable lines; empty when the week is valid. */
export function hardViolations(week: PlannedWeek, input: PlannerInput): string[] {
	const problems: string[] = [];
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	let expected = 0;
	for (let day = 0; day < 7; day++) {
		for (const mealType of MEAL_TYPES) {
			const date = addDays(input.weekStart, day);
			const setting = slotSettingOf(input.settings, date, mealType);
			if (setting.servings === 0) continue;
			expected++;
			const key = `${date} ${mealType}`;
			const slot = week.slots.find((s) => s.date === date && s.mealType === mealType);
			if (!slot) {
				problems.push(`${key}: missing`);
				continue;
			}
			if (slot.servings !== setting.servings) problems.push(`${key}: servings`);
			if (setting.fixedText !== null && (slot.content.kind !== 'free' || slot.content.text !== setting.fixedText)) problems.push(`${key}: fixed meal changed`);
			if (setting.fixedText === null && slot.content.kind === 'free') problems.push(`${key}: unexpected free meal`);
		}
	}
	if (week.slots.length !== expected) problems.push('slot count');
	const placed: PlannerRecipe[] = [];
	for (const slot of week.slots) {
		if (slot.content.kind !== 'recipe') continue;
		const key = `${slot.date} ${slot.mealType}`;
		const recipe = byId.get(slot.content.recipeId);
		if (!recipe) {
			problems.push(`${key}: unknown recipe`);
			continue;
		}
		if (placed.some((r) => r.id === recipe.id)) problems.push(`${key}: repeated in the week`);
		if (!isAvailable(recipe, input)) problems.push(`${key}: not available`);
		if (!fitsSlot(recipe, slotRefOf(slot, input.settings), input.settings.rules)) problems.push(`${key}: does not fit the slot`);
		if (recentlyUsed(recipe.id, input.weekStart, input.history)) problems.push(`${key}: used in the last two weeks`);
		placed.push(recipe);
	}
	for (const r of input.restrictions) {
		if (r.restriction !== 'limit' || r.weeklyMax === null) continue;
		if (placed.filter((p) => uses(p, r.ingredientId)).length > r.weeklyMax) problems.push(`${r.ingredientId}: over the weekly maximum`);
	}
	return problems;
}
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "Dominio: vincoli rigidi e candidati di uno slot del pianificatore"
```

---

### Task 4: Punteggio di un candidato

**Files:**
- Create: `domain/src/planner/score.ts`
- Test: `domain/src/planner/score.test.ts`

**Interfaces:**
- Consumes: Task 1, 2 e 3.
- Produces: `interface Placed { date: IsoDate; mealType: MealType; recipe: PlannerRecipe }`;
  `interface ScoreContext { input: PlannerInput; week: Placed[]; past: Placed[]; cookedIds: Set<string> }`;
  `buildContext(input, week: Placed[]): ScoreContext`;
  `scoreCandidate(recipe, slot: { date: IsoDate; mealType: MealType }, ctx): number`.

Componenti della sezione 3, sommati con i pesi di `settings.weights`: gradimento (famiglia,
poi globale, poi neutro 3 stelle), tempo dall'ultima volta (pieno dopo 8 settimane),
stagione, equilibrio rispetto agli intervalli, somiglianza con i pasti vicini (finestra di 6
pasti, anche a cavallo delle settimane, peso decrescente con la distanza), verdure, quota
note/nuove (solo con almeno 10 ricette cucinate), ingredienti limitati.

- [ ] **Step 1: Scrivere i test**

`domain/src/planner/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import { baseInput, recipe } from './test-fixtures.ts';

const monday = { date: '2026-10-12', mealType: 'lunch' as const };

describe('scoreCandidate', () => {
	it('prefers recipes the family likes', () => {
		const liked = recipe('liked');
		const plain = recipe('plain');
		const ctx = buildContext(baseInput({ recipes: [liked, plain], familyScores: { liked: 5, plain: 3 } }), []);
		expect(scoreCandidate(liked, monday, ctx)).toBeGreaterThan(scoreCandidate(plain, monday, ctx));
	});

	it('penalises a recipe similar to Sunday dinner of the week before', () => {
		const sunday = recipe('sunday', { proteinGroup: 'fish', category: 'wok', primaryIngredientId: 'salmone' });
		const similar = recipe('similar', { proteinGroup: 'fish', category: 'wok', primaryIngredientId: 'salmone' });
		const different = recipe('different', { proteinGroup: 'legumes', category: 'soup', primaryIngredientId: 'ceci' });
		const input = baseInput({ recipes: [sunday, similar, different], history: [{ date: '2026-10-11', mealType: 'dinner', recipeId: 'sunday' }] });
		const ctx = buildContext(input, []);
		expect(scoreCandidate(similar, monday, ctx)).toBeLessThan(scoreCandidate(different, monday, ctx));
	});

	it('penalises a group already at its weekly maximum', () => {
		const steak = recipe('steak', { proteinGroup: 'red_meat' });
		const burger = recipe('burger', { proteinGroup: 'red_meat' });
		const beans = recipe('beans', { proteinGroup: 'vegetarian' });
		const week: Placed[] = [{ date: '2026-10-13', mealType: 'dinner', recipe: steak }];
		const ctx = buildContext(baseInput({ recipes: [steak, burger, beans] }), week);
		expect(scoreCandidate(burger, monday, ctx)).toBeLessThan(scoreCandidate(beans, monday, ctx));
	});

	it('prefers recipes in season', () => {
		const summer = recipe('summer', { seasons: ['summer'] });
		const always = recipe('always');
		const ctx = buildContext(baseInput({ recipes: [summer, always] }), []);
		expect(scoreCandidate(summer, monday, ctx)).toBeLessThan(scoreCandidate(always, monday, ctx));
	});

	it('prefers recipes not cooked recently', () => {
		const recent = recipe('recent');
		const old = recipe('old');
		const input = baseInput({
			recipes: [recent, old],
			history: [
				{ date: '2026-09-01', mealType: 'lunch', recipeId: 'old' },
				{ date: '2026-09-25', mealType: 'lunch', recipeId: 'recent' }
			]
		});
		const ctx = buildContext(input, []);
		expect(scoreCandidate(recent, monday, ctx)).toBeLessThan(scoreCandidate(old, monday, ctx));
	});
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run domain/src/planner/score.test.ts`
Expected: FAIL, modulo `./score.ts` non trovato.

- [ ] **Step 3: Implementare**

`domain/src/planner/score.ts`:

```ts
import { daysBetween, mealIndex, seasonOf } from './calendar.ts';
import { foodGroupsOf, sharedFeatures, uses } from './groups.ts';
import { KNOWN_NEW_MIN_COOKED, SIMILARITY_WINDOW } from './settings.ts';
import type { IsoDate, MealType, PlannerInput, PlannerRecipe } from './types.ts';

export interface Placed {
	date: IsoDate;
	mealType: MealType;
	recipe: PlannerRecipe;
}

export interface ScoreContext {
	input: PlannerInput;
	/** Recipes already placed in the week being generated. */
	week: Placed[];
	/** Past meals whose recipe is in the catalogue. */
	past: Placed[];
	/** Recipes the family has cooked at least once ("known"). */
	cookedIds: Set<string>;
}

export function buildContext(input: PlannerInput, week: Placed[]): ScoreContext {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const past = input.history.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
	});
	return { input, week, past, cookedIds: new Set(input.history.map((m) => m.recipeId)) };
}

const NEUTRAL_STARS = 3;
const FULL_RECENCY_DAYS = 56;

export function scoreCandidate(recipe: PlannerRecipe, slot: { date: IsoDate; mealType: MealType }, ctx: ScoreContext): number {
	const { settings, familyScores, globalScores, restrictions } = ctx.input;
	const w = settings.weights;

	const stars = familyScores[recipe.id] ?? globalScores[recipe.id] ?? NEUTRAL_STARS;
	const liking = (stars - 1) / 4;

	const lastDates = ctx.past.filter((p) => p.recipe.id === recipe.id).map((p) => p.date).sort();
	const last = lastDates.at(-1);
	const recency = last === undefined ? 1 : Math.min(daysBetween(last, slot.date) / FULL_RECENCY_DAYS, 1);

	const season = recipe.seasons.length === 0 || recipe.seasons.includes(seasonOf(slot.date)) ? 1 : 0;

	let balance = 0;
	for (const group of foodGroupsOf(recipe)) {
		const count = ctx.week.filter((p) => foodGroupsOf(p.recipe).includes(group)).length;
		const range = settings.groupRanges[group];
		if (count + 1 > range.max) balance -= 1;
		else if (count < range.min) balance += 1;
	}

	const here = mealIndex(slot.date, slot.mealType);
	let similarity = 0;
	for (const near of [...ctx.past, ...ctx.week]) {
		const distance = Math.abs(mealIndex(near.date, near.mealType) - here);
		if (distance > 0 && distance <= SIMILARITY_WINDOW) similarity += sharedFeatures(recipe, near.recipe).length / distance;
	}

	const vegetables = recipe.hasVegetables ? 1 : 0;

	let knownNew = 0;
	if (ctx.cookedIds.size >= KNOWN_NEW_MIN_COOKED) {
		const target = settings.knownNew;
		const known = ctx.week.filter((p) => ctx.cookedIds.has(p.recipe.id)).length;
		const fresh = ctx.week.length - known;
		if (ctx.cookedIds.has(recipe.id)) knownNew = known < target.known ? 1 : known >= target.known + target.tolerance ? -1 : 0;
		else knownNew = fresh < target.new ? 1 : fresh >= target.new + target.tolerance ? -1 : 0;
	}

	const limit = -restrictions.filter((r) => r.restriction === 'limit' && uses(recipe, r.ingredientId)).length;

	return (
		w.liking * liking +
		w.recency * recency +
		w.season * season +
		w.balance * balance -
		w.similarity * similarity +
		w.vegetables * vegetables +
		w.knownNew * knownNew +
		w.limit * limit
	);
}
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "Dominio: punteggio dei candidati del pianificatore"
```

---

### Task 5: Regole di settimana e riparazione

**Files:**
- Create: `domain/src/planner/repair.ts`
- Test: `domain/src/planner/repair.test.ts`

**Interfaces:**
- Consumes: Task 1-3 (`candidatesFor`, `fitsSlot`, `slotRefOf`, `foodGroupsOf`).
- Produces: `interface RuleProblem { kind: 'rule' | 'group_above' | 'group_below' | 'known_new'; detail: string; amount: number }`;
  `weekRuleProblems(week, input): RuleProblem[]`; `problemScore(problems): number`;
  `repairWeek(week, input): PlannedWeek`.

Passo 4 dell'algoritmo: si controllano le regole di settimana (almeno un gruppo in un giorno,
intervalli dei gruppi, quota note/nuove) e si riparano con modifiche locali: sostituzione
della ricetta di uno slot con un candidato valido, o scambio fra due slot. Ogni giro tiene la
modifica che riduce di più il totale dei problemi; ci si ferma quando non ci sono problemi,
quando nessuna modifica migliora o dopo `MAX_REPAIR_ROUNDS`. La riparazione non rompe mai
un vincolo rigido.

- [ ] **Step 1: Scrivere i test**

`domain/src/planner/repair.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hardViolations } from './constraints.ts';
import { repairWeek, weekRuleProblems } from './repair.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { PlannedWeek, PlannerInput } from './types.ts';

/** Fills the planned slots in order with the given recipe ids (fixed meals stay free). */
function weekWith(input: PlannerInput, ids: string[]): PlannedWeek {
	const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
	const slots: PlannedWeek['slots'] = [];
	let next = 0;
	days.forEach((date, day) => {
		for (const mealType of ['lunch', 'dinner'] as const) {
			const setting = input.settings.slots[mealType][day];
			if (setting.servings === 0) continue;
			const content = setting.fixedText !== null ? { kind: 'free' as const, text: setting.fixedText } : { kind: 'recipe' as const, recipeId: ids[next++] };
			slots.push({ date, mealType, servings: setting.servings, content });
		}
	});
	return { weekStart: '2026-10-12', slots };
}

const veg = (n: number) => Array.from({ length: n }, (_, i) => recipe(`v${i}`, { proteinGroup: 'vegetarian' }));

describe('weekRuleProblems', () => {
	it('reports Friday without fish and groups below their minimum', () => {
		const input = baseInput({ recipes: veg(12) });
		const problems = weekRuleProblems(weekWith(input, veg(12).map((r) => r.id)), input);
		expect(problems.some((p) => p.kind === 'rule')).toBe(true);
		expect(problems.find((p) => p.kind === 'group_below' && p.detail === 'fish')?.amount).toBe(2);
	});
});

describe('repairWeek', () => {
	it('brings fish to Friday without breaking hard constraints', () => {
		const recipes = [...veg(12), recipe('fish1', { proteinGroup: 'fish' }), recipe('fish2', { proteinGroup: 'fish' })];
		const input = baseInput({ recipes });
		const repaired = repairWeek(weekWith(input, veg(12).map((r) => r.id)), input);
		expect(weekRuleProblems(repaired, input).some((p) => p.kind === 'rule')).toBe(false);
		expect(hardViolations(repaired, input)).toEqual([]);
	});

	it('stops when nothing can fix the week', () => {
		const input = baseInput({ recipes: veg(12) });
		const week = weekWith(input, veg(12).map((r) => r.id));
		const repaired = repairWeek(week, input);
		expect(hardViolations(repaired, input)).toEqual([]);
		expect(weekRuleProblems(repaired, input).length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run domain/src/planner/repair.test.ts`
Expected: FAIL, modulo `./repair.ts` non trovato.

- [ ] **Step 3: Implementare**

`domain/src/planner/repair.ts`:

```ts
import { weekdayOf } from './calendar.ts';
import { candidatesFor, fitsSlot, slotRefOf } from './constraints.ts';
import { foodGroupsOf } from './groups.ts';
import { KNOWN_NEW_MIN_COOKED, MAX_REPAIR_ROUNDS } from './settings.ts';
import { FOOD_GROUPS, type PlannedSlot, type PlannedWeek, type PlannerInput, type PlannerRecipe } from './types.ts';

export interface RuleProblem {
	kind: 'rule' | 'group_above' | 'group_below' | 'known_new';
	detail: string;
	amount: number;
}

function recipesOf(week: PlannedWeek, input: PlannerInput): { slot: PlannedSlot; recipe: PlannerRecipe }[] {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	return week.slots.flatMap((slot) => {
		if (slot.content.kind !== 'recipe') return [];
		const recipe = byId.get(slot.content.recipeId);
		return recipe ? [{ slot, recipe }] : [];
	});
}

/** Week-level rules of spec section 3: "at least one" rules, group ranges, known/new quota. */
export function weekRuleProblems(week: PlannedWeek, input: PlannerInput): RuleProblem[] {
	const { settings } = input;
	const placed = recipesOf(week, input);
	const problems: RuleProblem[] = [];
	for (const rule of settings.rules) {
		if (rule.kind !== 'at_least_one') continue;
		const planned = week.slots.some((s) => weekdayOf(s.date) === rule.weekday && s.content.kind !== 'free');
		const met = placed.some((p) => weekdayOf(p.slot.date) === rule.weekday && p.recipe.proteinGroup === rule.group);
		if (planned && !met) problems.push({ kind: 'rule', detail: `${rule.group} on weekday ${rule.weekday}`, amount: 1 });
	}
	for (const group of FOOD_GROUPS) {
		const count = placed.filter((p) => foodGroupsOf(p.recipe).includes(group)).length;
		const range = settings.groupRanges[group];
		if (count > range.max) problems.push({ kind: 'group_above', detail: group, amount: count - range.max });
		if (count < range.min) problems.push({ kind: 'group_below', detail: group, amount: range.min - count });
	}
	const cooked = new Set(input.history.map((m) => m.recipeId));
	if (cooked.size >= KNOWN_NEW_MIN_COOKED) {
		const known = placed.filter((p) => cooked.has(p.recipe.id)).length;
		const off = Math.abs(known - settings.knownNew.known) - settings.knownNew.tolerance;
		if (off > 0) problems.push({ kind: 'known_new', detail: `${known} known`, amount: off });
	}
	return problems;
}

export function problemScore(problems: RuleProblem[]): number {
	return problems.reduce((sum, p) => sum + p.amount, 0);
}

const withContent = (week: PlannedWeek, index: number, recipeId: string): PlannedWeek => ({
	...week,
	slots: week.slots.map((s, i) => (i === index ? { ...s, content: { kind: 'recipe', recipeId } } : s))
});

/** Single-slot replacements and two-slot swaps that keep every hard constraint. */
function alternatives(week: PlannedWeek, input: PlannerInput): PlannedWeek[] {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const idOf = (slot: PlannedSlot) => (slot.content.kind === 'recipe' ? slot.content.recipeId : null);
	const result: PlannedWeek[] = [];
	week.slots.forEach((slot, i) => {
		if (slot.content.kind === 'free') return;
		const others = week.slots.flatMap((s, j) => {
			const id = j === i ? null : idOf(s);
			const recipe = id === null ? undefined : byId.get(id);
			return recipe ? [recipe] : [];
		});
		for (const candidate of candidatesFor(slotRefOf(slot, input.settings), input, others)) {
			if (candidate.id !== idOf(slot)) result.push(withContent(week, i, candidate.id));
		}
	});
	week.slots.forEach((a, i) => {
		week.slots.forEach((b, j) => {
			if (j <= i) return;
			const first = idOf(a) === null ? undefined : byId.get(idOf(a) as string);
			const second = idOf(b) === null ? undefined : byId.get(idOf(b) as string);
			if (!first || !second) return;
			if (!fitsSlot(first, slotRefOf(b, input.settings), input.settings.rules)) return;
			if (!fitsSlot(second, slotRefOf(a, input.settings), input.settings.rules)) return;
			result.push(withContent(withContent(week, i, second.id), j, first.id));
		});
	});
	return result;
}

export function repairWeek(week: PlannedWeek, input: PlannerInput): PlannedWeek {
	let current = week;
	for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
		let bestScore = problemScore(weekRuleProblems(current, input));
		if (bestScore === 0) break;
		let best: PlannedWeek | null = null;
		for (const alternative of alternatives(current, input)) {
			const score = problemScore(weekRuleProblems(alternative, input));
			if (score < bestScore) {
				best = alternative;
				bestScore = score;
			}
		}
		if (!best) break;
		current = best;
	}
	return current;
}
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "Dominio: regole di settimana e riparazione del pianificatore"
```

---

### Task 6: Generazione della settimana e test di proprietà

**Files:**
- Create: `domain/src/planner/generate.ts`
- Test: `domain/src/planner/generate.test.ts`

**Interfaces:**
- Consumes: Task 1-5.
- Produces: `plannedSlots(input): PlannedSlot[]`; `generateWeek(input): PlannedWeek`.

Algoritmo della sezione 3: (1) slot dalla matrice con porzioni e pasti fissi; (2) si
riempie per primo lo slot con meno candidati, ricalcolato a ogni passo, a parità in ordine
cronologico; (3) per lo slot si calcola il punteggio dei candidati e se ne sceglie uno a
caso fra i migliori `TOP_K`, pesando sul punteggio; (4) riparazione; (5) slot senza
candidati: «nessuna ricetta adatta» (`no_match`). Seme da famiglia e settimana.

- [ ] **Step 1: Scrivere i test**

`domain/src/planner/generate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays } from './calendar.ts';
import { hardViolations } from './constraints.ts';
import { generateWeek } from './generate.ts';
import { baseInput, recipe, syntheticCatalogue } from './test-fixtures.ts';
import type { PastMeal } from './types.ts';

const recipeIds = (week: ReturnType<typeof generateWeek>) => week.slots.map((s) => (s.content.kind === 'recipe' ? s.content.recipeId : s.content.kind));

describe('generateWeek', () => {
	it('fills the 12 planned meals, keeps the fixed ones and breaks no hard constraint', () => {
		const input = baseInput();
		const week = generateWeek(input);
		expect(week.slots).toHaveLength(14);
		expect(week.slots.filter((s) => s.content.kind === 'recipe')).toHaveLength(12);
		expect(week.slots.find((s) => s.date === '2026-10-18' && s.mealType === 'lunch')?.content).toEqual({ kind: 'free', text: 'Pizza' });
		expect(hardViolations(week, input)).toEqual([]);
	});

	it('gives the same week for the same input and a different one for another week', () => {
		const input = baseInput();
		expect(generateWeek(input)).toEqual(generateWeek(baseInput()));
		expect(recipeIds(generateWeek(baseInput({ weekStart: '2026-10-19' })))).not.toEqual(recipeIds(generateWeek(input)));
	});

	it('marks slots without candidates instead of failing', () => {
		const input = baseInput({ recipes: [recipe('a'), recipe('b'), recipe('c')] });
		const week = generateWeek(input);
		expect(week.slots.filter((s) => s.content.kind === 'recipe')).toHaveLength(3);
		expect(week.slots.filter((s) => s.content.kind === 'no_match')).toHaveLength(9);
		expect(hardViolations(week, input)).toEqual([]);
	});

	it('uses low-rated recipes when nothing else fits', () => {
		const catalogue = syntheticCatalogue();
		const input = baseInput({ familyScores: Object.fromEntries(catalogue.map((r) => [r.id, 1])) });
		expect(generateWeek(input).slots.filter((s) => s.content.kind === 'no_match')).toHaveLength(0);
	});
});

describe('properties over many seeds', () => {
	it('never breaks a hard constraint, across 300 family and week combinations', () => {
		for (let i = 0; i < 300; i++) {
			const input = baseInput({ familyId: `family-${i}`, weekStart: addDays('2026-01-05', 7 * (i % 40)) });
			const week = generateWeek(input);
			expect(hardViolations(week, input)).toEqual([]);
			for (const slot of week.slots) expect(['recipe', 'free', 'no_match']).toContain(slot.content.kind);
		}
	});

	it('respects the last two weeks when weeks follow one another', () => {
		let history: PastMeal[] = [];
		for (let i = 0; i < 10; i++) {
			const input = baseInput({ weekStart: addDays('2026-10-12', 7 * i), history });
			const week = generateWeek(input);
			expect(hardViolations(week, input)).toEqual([]);
			history = [...history, ...week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []))];
		}
	});
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run domain/src/planner/generate.test.ts`
Expected: FAIL, modulo `./generate.ts` non trovato.

- [ ] **Step 3: Implementare**

`domain/src/planner/generate.ts`:

```ts
import { addDays } from './calendar.ts';
import { candidatesFor, slotRefOf, slotSettingOf } from './constraints.ts';
import { createRandom, seedFrom, weightedPick } from './random.ts';
import { repairWeek } from './repair.ts';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import { TOP_K } from './settings.ts';
import { MEAL_TYPES, type PlannedSlot, type PlannedWeek, type PlannerInput } from './types.ts';

/** Step 1: the week's slots from the diners matrix, with servings and fixed free meals. */
export function plannedSlots(input: PlannerInput): PlannedSlot[] {
	const slots: PlannedSlot[] = [];
	for (let day = 0; day < 7; day++) {
		for (const mealType of MEAL_TYPES) {
			const date = addDays(input.weekStart, day);
			const setting = slotSettingOf(input.settings, date, mealType);
			if (setting.servings === 0) continue;
			const content: PlannedSlot['content'] = setting.fixedText !== null ? { kind: 'free', text: setting.fixedText } : { kind: 'no_match' };
			slots.push({ date, mealType, servings: setting.servings, content });
		}
	}
	return slots;
}

/** Generates the week (spec section 3). Same input, same week: the seed comes from family and week. */
export function generateWeek(input: PlannerInput): PlannedWeek {
	const random = createRandom(seedFrom(`${input.familyId}:${input.weekStart}`));
	const slots = plannedSlots(input);
	const open = slots.filter((s) => s.content.kind !== 'free');
	const placed: Placed[] = [];
	while (open.length > 0) {
		const options = open.map((slot, order) => ({ slot, order, candidates: candidatesFor(slotRefOf(slot, input.settings), input, placed.map((p) => p.recipe)) }));
		options.sort((a, b) => a.candidates.length - b.candidates.length || a.order - b.order);
		const { slot, candidates } = options[0];
		open.splice(open.indexOf(slot), 1);
		if (candidates.length === 0) continue;
		const ctx = buildContext(input, placed);
		const ranked = candidates
			.map((recipe) => ({ recipe, score: scoreCandidate(recipe, slot, ctx) }))
			.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
			.slice(0, TOP_K);
		const floor = ranked[ranked.length - 1].score;
		const choice = weightedPick(ranked.map((r) => ({ item: r.recipe, weight: r.score - floor + 1 })), random);
		slot.content = { kind: 'recipe', recipeId: choice.id };
		placed.push({ date: slot.date, mealType: slot.mealType, recipe: choice });
	}
	return repairWeek({ weekStart: input.weekStart, slots }, input);
}
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS. Se il test di proprietà fallisce, il messaggio indica slot e vincolo: correggere
la causa in `constraints.ts` o `repair.ts`, non indebolire il test.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "Dominio: generazione della settimana con test di proprietà"
```

---

### Task 7: Metriche della settimana ed esportazioni

**Files:**
- Create: `domain/src/planner/metrics.ts`, `domain/src/planner/index.ts`
- Test: `domain/src/planner/metrics.test.ts`

**Interfaces:**
- Consumes: Task 1-6.
- Produces: `interface ClosePair { first: PastMeal; second: PastMeal; distance: number; shared: string[] }`;
  `interface WeekMetrics { groupCounts: Record<FoodGroup, number>; problems: RuleProblem[]; known: number; fresh: number; knownNewApplies: boolean; noMatch: number; closePairs: ClosePair[] }`;
  `weekMetrics(week, input): WeekMetrics`; `index.ts` riesporta tutti i moduli tranne
  `test-fixtures.ts`.

Le coppie vicine sono pasti a distanza 1 o 2 che condividono almeno una caratteristica, con
almeno uno dei due nella settimana (comprende il passaggio dalla domenica precedente).

- [ ] **Step 1: Scrivere il test**

`domain/src/planner/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { weekMetrics } from './metrics.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { PlannedWeek } from './types.ts';

describe('weekMetrics', () => {
	it('counts groups, known recipes, empty slots and close similar pairs across weeks', () => {
		const salmon = recipe('salmon', { proteinGroup: 'fish', primaryIngredientId: 'salmone' });
		const trout = recipe('trout', { proteinGroup: 'fish' });
		const input = baseInput({ recipes: [salmon, trout], history: [{ date: '2026-10-11', mealType: 'dinner', recipeId: 'trout' }] });
		const week: PlannedWeek = {
			weekStart: '2026-10-12',
			slots: [
				{ date: '2026-10-12', mealType: 'lunch', servings: 2, content: { kind: 'recipe', recipeId: 'salmon' } },
				{ date: '2026-10-12', mealType: 'dinner', servings: 2, content: { kind: 'no_match' } }
			]
		};
		const metrics = weekMetrics(week, input);
		expect(metrics.groupCounts.fish).toBe(1);
		expect(metrics.noMatch).toBe(1);
		expect(metrics.known).toBe(0);
		expect(metrics.fresh).toBe(1);
		expect(metrics.knownNewApplies).toBe(false);
		expect(metrics.closePairs).toEqual([
			{
				first: { date: '2026-10-11', mealType: 'dinner', recipeId: 'trout' },
				second: { date: '2026-10-12', mealType: 'lunch', recipeId: 'salmon' },
				distance: 1,
				shared: ['protein']
			}
		]);
	});
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `npx vitest run domain/src/planner/metrics.test.ts`
Expected: FAIL, modulo `./metrics.ts` non trovato.

- [ ] **Step 3: Implementare**

`domain/src/planner/metrics.ts`:

```ts
import { mealIndex } from './calendar.ts';
import { foodGroupsOf, sharedFeatures } from './groups.ts';
import { weekRuleProblems, type RuleProblem } from './repair.ts';
import { KNOWN_NEW_MIN_COOKED } from './settings.ts';
import { FOOD_GROUPS, type FoodGroup, type PastMeal, type PlannedWeek, type PlannerInput } from './types.ts';

export interface ClosePair {
	first: PastMeal;
	second: PastMeal;
	distance: number;
	shared: string[];
}

export interface WeekMetrics {
	groupCounts: Record<FoodGroup, number>;
	problems: RuleProblem[];
	known: number;
	fresh: number;
	knownNewApplies: boolean;
	noMatch: number;
	closePairs: ClosePair[];
}

const CLOSE_DISTANCE = 2;

export function weekMetrics(week: PlannedWeek, input: PlannerInput): WeekMetrics {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const meals: PastMeal[] = week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []));
	const recipes = meals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [recipe] : [];
	});
	const groupCounts = Object.fromEntries(FOOD_GROUPS.map((g) => [g, recipes.filter((r) => foodGroupsOf(r).includes(g)).length])) as Record<FoodGroup, number>;
	const cooked = new Set(input.history.map((m) => m.recipeId));
	const known = recipes.filter((r) => cooked.has(r.id)).length;

	const timeline = [...input.history.filter((m) => m.date < week.weekStart), ...meals].sort((a, b) => mealIndex(a.date, a.mealType) - mealIndex(b.date, b.mealType));
	const closePairs: ClosePair[] = [];
	timeline.forEach((first, i) => {
		for (const second of timeline.slice(i + 1)) {
			const distance = mealIndex(second.date, second.mealType) - mealIndex(first.date, first.mealType);
			if (distance > CLOSE_DISTANCE) break;
			if (second.date < week.weekStart) continue;
			const a = byId.get(first.recipeId);
			const b = byId.get(second.recipeId);
			if (!a || !b) continue;
			const shared = sharedFeatures(a, b);
			if (shared.length > 0) closePairs.push({ first, second, distance, shared });
		}
	});

	return {
		groupCounts,
		problems: weekRuleProblems(week, input),
		known,
		fresh: recipes.length - known,
		knownNewApplies: cooked.size >= KNOWN_NEW_MIN_COOKED,
		noMatch: week.slots.filter((s) => s.content.kind === 'no_match').length,
		closePairs
	};
}
```

`domain/src/planner/index.ts`:

```ts
export * from './types.ts';
export * from './calendar.ts';
export * from './random.ts';
export * from './settings.ts';
export * from './groups.ts';
export * from './constraints.ts';
export * from './score.ts';
export * from './repair.ts';
export * from './generate.ts';
export * from './metrics.ts';
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run domain/src/planner && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain
git commit -m "Dominio: metriche della settimana generata"
```

---

### Task 8: Lettura dei dati d'origine e degli attributi

**Files:**
- Create: `scripts/planner-data/origin.ts`, `scripts/planner-data/attributes.ts`,
  `scripts/planner-data/family.ts`
- Test: `scripts/planner-data/origin.test.ts`, `scripts/planner-data/attributes.test.ts`

**Interfaces:**
- Consumes: `domain/src/planner/index.ts`.
- Produces: in `origin.ts` `interface OriginRecipe`, `readOriginRecipes(originDir)`,
  `slug(text)`, `durationOf(text)`, `publishable(recipe)`, `historyOf(recipes, before)`,
  `familyScoresOf(recipes)`; in `attributes.ts` `interface RecipeAttributes`,
  `parseAttributes(text, recipes): { attributes: Map<string, RecipeAttributes>; errors: string[] }`,
  `toPlannerRecipes(recipes, attributes): PlannerRecipe[]`; in `family.ts`
  `curatorFamilySettings(): PlannerSettings`, `curatorRestrictions(recipes): IngredientRestriction[]`.

Regole d'origine applicate (sezioni 8 e 11): voti B=1, BB=3, BBB=4, BBBB=5 stelle come voto
di Federico; i pasti con `cucinata: false` non entrano nello storico (la loro
rappresentazione definitiva resta in R4); nel catalogo dell'esperimento entrano solo le
ricette pubblicabili, cioè con ingredienti verificati e porzioni di riferimento (52 su 56
all'8 ottobre 2026).

- [ ] **Step 1: Scrivere i test**

`scripts/planner-data/origin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { durationOf, familyScoresOf, historyOf, publishable, slug, type OriginRecipe } from './origin.ts';

const origin = (over: Partial<OriginRecipe>): OriginRecipe => ({
	id: 'x', nome: 'X', tipo: 'web', tempo: '20 min', libro: null, porzioni_base: 2,
	ingredienti: [{ nome: 'Ceci', quantita: '200 g' }], feedback: null, tag: [], storico: [], ...over
});

describe('origin data', () => {
	it('slugs Italian names like the prototype', () => {
		expect(slug('Cipolla rossa di Tropea (o 1 cipollotto)')).toBe('cipolla-rossa-di-tropea-o-1-cipollotto');
		expect(slug('Petto di pollo')).toBe('petto-di-pollo');
	});
	it('reads durations: ranges take the maximum, "+" adds up, text without numbers is unknown', () => {
		expect(durationOf('25-30 min')).toBe(30);
		expect(durationOf('20 min + 40 min forno')).toBe(60);
		expect(durationOf('10-15 min (stimati)')).toBe(15);
		expect(durationOf('Secondo confezione')).toBeNull();
		expect(durationOf(null)).toBeNull();
	});
	it('keeps only recipes with verified ingredients and reference servings', () => {
		expect(publishable(origin({}))).toBe(true);
		expect(publishable(origin({ ingredienti: null }))).toBe(false);
		expect(publishable(origin({ porzioni_base: null }))).toBe(false);
	});
	it('turns the history into dated meals, skipping meals not cooked and later ones', () => {
		const r = origin({ storico: [
			{ settimana: '2026-09-07', pasto: 'ven-cena', cucinata: true },
			{ settimana: '2026-09-14', pasto: 'lun-pranzo', cucinata: false },
			{ settimana: '2026-10-12', pasto: 'mar-pranzo', cucinata: null }
		] });
		expect(historyOf([r], '2026-10-12')).toEqual([{ date: '2026-09-11', mealType: 'dinner', recipeId: 'x' }]);
	});
	it('converts B feedback to stars', () => {
		expect(familyScoresOf([origin({ id: 'a', feedback: 1 }), origin({ id: 'b', feedback: 4 }), origin({ id: 'c', feedback: null })])).toEqual({ a: 1, b: 5 });
	});
});
```

`scripts/planner-data/attributes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAttributes, toPlannerRecipes } from './attributes.ts';
import type { OriginRecipe } from './origin.ts';

const wok: OriginRecipe = {
	id: 'wok', nome: 'Wok di pollo', tipo: 'web', tempo: '25 min', libro: null, porzioni_base: 6,
	ingredienti: [{ nome: 'Petto di pollo', quantita: '300 g' }, { nome: 'Peperoncino (facoltativo)', quantita: 'q.b.' }],
	feedback: 2, tag: ['pollo', 'wok'], storico: []
};

const valid = `
recipes:
  wok:
    meal_type: both
    protein_group: white_meat
    carbohydrate_group: rice
    category: wok
    has_vegetables: true
    is_heavy: false
    seasons: []
    primary_ingredient: petto-di-pollo
`;

describe('parseAttributes', () => {
	it('accepts a complete entry and builds the planner recipe', () => {
		const { attributes, errors } = parseAttributes(valid, [wok]);
		expect(errors).toEqual([]);
		const [recipe] = toPlannerRecipes([wok], attributes);
		expect(recipe).toMatchObject({ id: 'wok', durationMinutes: 25, proteinGroup: 'white_meat', primaryIngredientId: 'petto-di-pollo' });
		expect(recipe.ingredients).toEqual([
			{ ingredientId: 'petto-di-pollo', isOptional: false },
			{ ingredientId: 'peperoncino-facoltativo', isOptional: true }
		]);
	});
	it('reports missing recipes, unknown values and primary ingredients not in the recipe', () => {
		const bad = valid.replace('protein_group: white_meat', 'protein_group: chicken').replace('petto-di-pollo', 'salmone');
		const { errors } = parseAttributes(bad, [wok, { ...wok, id: 'other' }]);
		expect(errors).toContain('wok: protein_group "chicken" is not allowed');
		expect(errors).toContain('wok: primary_ingredient "salmone" is not one of its ingredients');
		expect(errors).toContain('other: missing');
	});
	it('lets a duration override the origin text', () => {
		const { attributes } = parseAttributes(valid.replace('seasons: []', 'seasons: []\n    duration_minutes: 40'), [wok]);
		expect(toPlannerRecipes([wok], attributes)[0].durationMinutes).toBe(40);
	});
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npx vitest run scripts`
Expected: FAIL, moduli non trovati.

- [ ] **Step 3: Implementare**

`scripts/planner-data/origin.ts`:

```ts
// Reads the origin project's recipe book, read only (AGENTS.md).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { addDays, mealIndex, type IsoDate, type PastMeal } from '../../domain/src/planner/index.ts';

export interface OriginRecipe {
	id: string;
	nome: string;
	tipo: 'web' | 'youtube' | 'libro' | 'casa';
	tempo?: string | null;
	libro?: { titolo: string } | null;
	porzioni_base: number | null;
	ingredienti: { nome: string; quantita: string | number }[] | null;
	feedback: number | null;
	tag: string[];
	storico?: { settimana: string; pasto: string; cucinata: boolean | null }[] | null;
}

export function readOriginRecipes(originDir: string): OriginRecipe[] {
	const text = readFileSync(resolve(originDir, 'ricettario/ricette.yaml'), 'utf8');
	return (parse(text) as { ricette: OriginRecipe[] }).ricette;
}

/** Same slugs as the prototype demo data. */
export function slug(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "25-30 min" → 30, "20 min + 40 min forno" → 60; null without numbers. */
export function durationOf(text: string | null | undefined): number | null {
	if (!text || !/\d/.test(text)) return null;
	return text.split('+').reduce((sum, part) => {
		const numbers = part.match(/\d+/g)?.map(Number) ?? [];
		return sum + (numbers.length ? Math.max(...numbers) : 0);
	}, 0);
}

export function publishable(recipe: OriginRecipe): boolean {
	return (recipe.ingredienti?.length ?? 0) > 0 && !!recipe.porzioni_base;
}

const DAY_KEYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Meals before `before`; meals explicitly not cooked are left out (review R4 still open). */
export function historyOf(recipes: OriginRecipe[], before: IsoDate): PastMeal[] {
	const meals: PastMeal[] = [];
	for (const recipe of recipes) {
		for (const entry of recipe.storico ?? []) {
			if (entry.cucinata === false) continue;
			const [day, meal] = entry.pasto.split('-');
			const date = addDays(String(entry.settimana), DAY_KEYS.indexOf(day));
			if (date >= before) continue;
			meals.push({ date, mealType: meal === 'pranzo' ? 'lunch' : 'dinner', recipeId: recipe.id });
		}
	}
	return meals.sort((a, b) => mealIndex(a.date, a.mealType) - mealIndex(b.date, b.mealType));
}

/** B feedback as the curator's stars (spec section 8): B=1, BB=3, BBB=4, BBBB=5. */
const FEEDBACK_TO_STARS: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

export function familyScoresOf(recipes: OriginRecipe[]): Record<string, number> {
	return Object.fromEntries(recipes.filter((r) => r.feedback !== null && FEEDBACK_TO_STARS[r.feedback]).map((r) => [r.id, FEEDBACK_TO_STARS[r.feedback as number]]));
}
```

`scripts/planner-data/attributes.ts`:

```ts
// Recipe attributes for the planner: proposed by the agent from verified data, reviewed by the user.
import { parse } from 'yaml';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, SEASONS, type CarbohydrateGroup, type Category, type PlannerRecipe, type ProteinGroup, type RecipeMealType, type Season } from '../../domain/src/planner/index.ts';
import { durationOf, slug, type OriginRecipe } from './origin.ts';

export interface RecipeAttributes {
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup;
	carbohydrateGroup: CarbohydrateGroup;
	category: Category;
	hasVegetables: boolean;
	isHeavy: boolean;
	seasons: Season[];
	primaryIngredient: string | null;
	durationMinutes: number | null;
	uncertain: string[];
	note: string | null;
}

const MEAL_TYPES = ['lunch', 'dinner', 'both'] as const;

export function parseAttributes(text: string, recipes: OriginRecipe[]): { attributes: Map<string, RecipeAttributes>; errors: string[] } {
	const raw = ((parse(text) as { recipes?: Record<string, Record<string, unknown>> } | null)?.recipes ?? {}) as Record<string, Record<string, unknown>>;
	const errors: string[] = [];
	const attributes = new Map<string, RecipeAttributes>();
	const known = new Set(recipes.map((r) => r.id));
	for (const id of Object.keys(raw)) if (!known.has(id)) errors.push(`${id}: not a recipe of the catalogue`);

	for (const recipe of recipes) {
		const entry = raw[recipe.id];
		if (!entry) {
			errors.push(`${recipe.id}: missing`);
			continue;
		}
		const oneOf = <T extends string>(field: string, allowed: readonly T[]): T => {
			const value = entry[field];
			if (typeof value !== 'string' || !allowed.includes(value as T)) errors.push(`${recipe.id}: ${field} "${String(value)}" is not allowed`);
			return value as T;
		};
		const flag = (field: string): boolean => {
			if (typeof entry[field] !== 'boolean') errors.push(`${recipe.id}: ${field} must be true or false`);
			return entry[field] === true;
		};
		const seasons = Array.isArray(entry.seasons) ? (entry.seasons as string[]) : [];
		if (!Array.isArray(entry.seasons) || seasons.some((s) => !(SEASONS as readonly string[]).includes(s))) errors.push(`${recipe.id}: seasons must be a list of ${SEASONS.join(', ')}`);
		const primary = entry.primary_ingredient ?? null;
		const lines = (recipe.ingredienti ?? []).map((l) => slug(l.nome));
		if (primary !== null && (typeof primary !== 'string' || !lines.includes(primary))) errors.push(`${recipe.id}: primary_ingredient "${String(primary)}" is not one of its ingredients`);
		const duration = entry.duration_minutes ?? null;
		if (duration !== null && (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0)) errors.push(`${recipe.id}: duration_minutes must be a positive whole number`);
		attributes.set(recipe.id, {
			mealType: oneOf('meal_type', MEAL_TYPES),
			proteinGroup: oneOf('protein_group', PROTEIN_GROUPS),
			carbohydrateGroup: oneOf('carbohydrate_group', CARBOHYDRATE_GROUPS),
			category: oneOf('category', CATEGORIES),
			hasVegetables: flag('has_vegetables'),
			isHeavy: flag('is_heavy'),
			seasons: seasons as Season[],
			primaryIngredient: primary as string | null,
			durationMinutes: duration as number | null,
			uncertain: Array.isArray(entry.uncertain) ? (entry.uncertain as string[]) : [],
			note: typeof entry.note === 'string' ? entry.note : null
		});
	}
	return { attributes, errors };
}

export function toPlannerRecipes(recipes: OriginRecipe[], attributes: Map<string, RecipeAttributes>): PlannerRecipe[] {
	return recipes.map((recipe) => {
		const a = attributes.get(recipe.id);
		if (!a) throw new Error(`No attributes for ${recipe.id}`);
		return {
			id: recipe.id,
			durationMinutes: a.durationMinutes ?? durationOf(recipe.tempo),
			mealType: a.mealType,
			proteinGroup: a.proteinGroup,
			carbohydrateGroup: a.carbohydrateGroup,
			category: a.category,
			hasVegetables: a.hasVegetables,
			isHeavy: a.isHeavy,
			seasons: a.seasons,
			primaryIngredientId: a.primaryIngredient,
			ingredients: (recipe.ingredienti ?? []).map((line) => ({ ingredientId: slug(line.nome), isOptional: /facoltativ|opzional/i.test(line.nome) })),
			bookId: recipe.libro ? slug(recipe.libro.titolo) : null
		};
	});
}
```

`scripts/planner-data/family.ts`:

```ts
// The curator's family settings, from the origin project's rules (../meal_planner/progetto/REGOLE.md):
// diners matrix, Saturday dinner free, Sunday lunch pizza, quick Monday and Wednesday dinners (20 min),
// pasta only at lunch, fish on Friday, no fresh fish on Monday, 7 known and 5 new ± 1, cucumbers as rare
// as possible. Not expressible with the rule templates: no skottle on Monday evening.
import { CREA_RANGES, DEFAULT_KNOWN_NEW, DEFAULT_WEIGHTS, type IngredientRestriction, type PlannerRecipe, type PlannerSettings, type SlotSetting } from '../../domain/src/planner/index.ts';

const slot = (servings: number, fixedText: string | null = null, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText, maxMinutes });

export function curatorFamilySettings(): PlannerSettings {
	return {
		slots: {
			lunch: [slot(2), slot(3), slot(3), slot(3), slot(3), slot(4), slot(4, 'Pizza')],
			dinner: [slot(2, null, 20), slot(4), slot(2, null, 20), slot(4), slot(4), slot(4, 'Cena libera'), slot(4)]
		},
		rules: [
			{ kind: 'only_lunch', dish: 'pasta' },
			{ kind: 'at_least_one', group: 'fish', weekday: 4 },
			{ kind: 'never_on', group: 'fish', weekday: 0 }
		],
		knownNew: { ...DEFAULT_KNOWN_NEW },
		groupRanges: structuredClone(CREA_RANGES),
		weights: { ...DEFAULT_WEIGHTS }
	};
}

/** Cucumbers are liked little: limited to one recipe a week. */
export function curatorRestrictions(recipes: PlannerRecipe[]): IngredientRestriction[] {
	const cucumbers = new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.ingredientId)).filter((id) => id.startsWith('cetriol')));
	return [...cucumbers].map((ingredientId) => ({ ingredientId, restriction: 'limit', weeklyMax: 1 }));
}
```

- [ ] **Step 4: Eseguire test e controllo dei tipi**

Run: `npx vitest run scripts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/planner-data
git commit -m "Script: lettura del ricettario d'origine e degli attributi delle ricette per il pianificatore"
```

---

### Task 9: Proposta degli attributi e revisione dell'utente

**Files:**
- Create: `scripts/import/recipe-attributes.yaml`, `scripts/recipe-attributes-table.ts`
- Create (generato): `progetto/reports/recipe-attributes.md`

**Interfaces:**
- Consumes: Task 8 (`readOriginRecipes`, `publishable`, `parseAttributes`, `durationOf`).
- Produces: file degli attributi validato, letto dal Task 10.

- [ ] **Step 1: Scrivere lo script della tabella di revisione**

`scripts/recipe-attributes-table.ts`:

```ts
// Italian table of the recipe attributes, for the user's review (planner experiment M0).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAttributes } from './planner-data/attributes.ts';
import { durationOf, publishable, readOriginRecipes } from './planner-data/origin.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recipes = readOriginRecipes(resolve(root, '../meal_planner')).filter(publishable);
const { attributes, errors } = parseAttributes(readFileSync(resolve(root, 'scripts/import/recipe-attributes.yaml'), 'utf8'), recipes);
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}

const label: Record<string, string> = {
	lunch: 'pranzo', dinner: 'cena', both: 'entrambi',
	fish: 'pesce', white_meat: 'carne bianca', red_meat: 'carne rossa', cured_meat: 'salumi', legumes: 'legumi', eggs: 'uova', cheese: 'formaggi', vegetarian: 'vegetariano',
	pasta: 'pasta', rice: 'riso', potatoes: 'patate', bread: 'pane o wrap', cereals: 'cereali', none: 'nessuno',
	wok: 'wok', skottle: 'skottle', oven_bake: 'al forno', grill: 'griglia', pan: 'in padella', soup: 'zuppa', salad: 'insalata', savoury_pie: 'torta salata', wrap_sandwich: 'wrap o panino', burger: 'burger', other: 'altro',
	spring: 'primavera', summer: 'estate', autumn: 'autunno', winter: 'inverno'
};
const yes = (v: boolean) => (v ? 'sì' : 'no');
const rows = recipes.map((r) => {
	const a = attributes.get(r.id)!;
	const doubt = a.uncertain.length ? ` ⚠ ${a.uncertain.join(', ')}` : '';
	return `| ${r.nome}${doubt} | ${a.durationMinutes ?? durationOf(r.tempo) ?? '?'} | ${label[a.mealType]} | ${label[a.proteinGroup]} | ${label[a.carbohydrateGroup]} | ${label[a.category]} | ${yes(a.hasVegetables)} | ${yes(a.isHeavy)} | ${a.seasons.map((s) => label[s]).join(', ') || 'tutto l’anno'} | ${a.primaryIngredient ?? '—'} | ${a.note ?? ''} |`;
});
const table = [
	'# Attributi delle ricette per il pianificatore',
	'',
	`Generato da \`npm run recipe-attributes-table\` da \`scripts/import/recipe-attributes.yaml\`: ${recipes.length} ricette pubblicabili. ⚠ indica i campi incerti da controllare.`,
	'',
	'| Ricetta | Minuti | Pasto | Proteina | Carboidrato | Tipo di piatto | Verdure | Pesante | Stagioni | Ingrediente principale | Nota |',
	'|---|---|---|---|---|---|---|---|---|---|---|',
	...rows,
	''
].join('\n');
const output = resolve(root, 'progetto/reports/recipe-attributes.md');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, table);
console.log(`Scritto ${output}`);
```

- [ ] **Step 2: Scrivere la proposta degli attributi**

Per ognuna delle ricette pubblicabili (`publishable`) di `../meal_planner/ricettario/ricette.yaml`
scrivere una voce in `scripts/import/recipe-attributes.yaml`, leggendo nome, descrizione, tag,
tempo, ingredienti verificati, note e storico. Regole:

- `meal_type`: `lunch` per pasta e pranzi al sacco, `both` salvo indicazioni contrarie
  nelle note o nelle regole d'origine, `dinner` solo se la ricetta è chiaramente da cena.
- `protein_group`: la proteina principale fra `fish`, `white_meat`, `red_meat`,
  `cured_meat`, `legumes`, `eggs`, `cheese`; `vegetarian` se nessuna è principale.
- `carbohydrate_group`: `pasta`, `rice`, `potatoes`, `bread` (anche wrap e tortillas),
  `cereals` (cous cous, farro, quinoa…), `none`.
- `category`: il tipo di piatto, uno dei valori di `CATEGORIES`; `other` se nessuno calza.
- `has_vegetables`: true se fra gli ingredienti verificati c'è una verdura in quantità da
  porzione, non solo aromi.
- `is_heavy`: true per fritti e piatti chiaramente pesanti (panature fritte, molta panna o
  formaggio fuso).
- `seasons`: lista vuota se la ricetta va bene tutto l'anno; altrimenti le stagioni degli
  ingredienti stagionali principali (zucca → autunno e inverno).
- `primary_ingredient`: lo slug di una riga **già presente** fra gli ingredienti della
  ricetta (la proteina o la verdura che la caratterizza), oppure `null`.
- `duration_minutes`: solo quando `tempo` non contiene numeri o è fuorviante; motivare in
  `note`.
- `uncertain`: elenco dei campi su cui la proposta non è sicura; `note`: breve motivazione
  in italiano quando serve.

Formato di ogni voce:

```yaml
recipes:
  wok-pollo-peperoni-riso-basmati:
    meal_type: both
    protein_group: white_meat
    carbohydrate_group: rice
    category: wok
    has_vegetables: true
    is_heavy: false
    seasons: []
    primary_ingredient: petto-di-pollo
    uncertain: []
    note: null
```

- [ ] **Step 3: Validare e generare la tabella**

Run: `npm run recipe-attributes-table`
Expected: `Scritto …/progetto/reports/recipe-attributes.md`, nessun errore di validazione. In
caso di errori, correggere il file YAML e rieseguire.

- [ ] **Step 4: Commit della proposta**

```bash
git add scripts/import/recipe-attributes.yaml scripts/recipe-attributes-table.ts progetto/reports/recipe-attributes.md
git commit -m "Pianificatore: proposta degli attributi delle ricette da rivedere"
```

- [ ] **Step 5: Revisione dell'utente (punto di arresto)**

Presentare all'utente `progetto/reports/recipe-attributes.md`, segnalando prima i campi
incerti (⚠) e i vocabolari proposti (gruppi, carboidrati, tipi di piatto). Applicare le
correzioni nel file YAML, rigenerare la tabella e fare commit con il messaggio
`Pianificatore: attributi delle ricette rivisti dall'utente`. Non proseguire con il Task 10
prima dell'approvazione.

---

### Task 10: Report di 20 settimane

**Files:**
- Create: `scripts/planner-report.ts`
- Create (generato): `progetto/reports/planner-report.md`

**Interfaces:**
- Consumes: `domain/src/planner/index.ts`; Task 8 (`readOriginRecipes`, `publishable`,
  `historyOf`, `familyScoresOf`, `parseAttributes`, `toPlannerRecipes`,
  `curatorFamilySettings`, `curatorRestrictions`).
- Produces: il report che l'utente legge (sezione 9: «report di qualità»).

Le 20 settimane partono dal lunedì 12 ottobre 2026; ogni settimana generata entra nello
storico come mangiata, così la successiva tiene conto delle precedenti. Il report si scrive
anche quando ci sono violazioni, ma il comando esce con codice 1 se ce n'è almeno una.

- [ ] **Step 1: Scrivere lo script**

`scripts/planner-report.ts`:

```ts
// Planner quality report (spec section 9, M0 experiment): 20 weeks for the curator's family from real data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, FOOD_GROUPS, generateWeek, hardViolations, weekMetrics, type PastMeal, type PlannedWeek, type PlannerInput, type WeekMetrics } from '../domain/src/planner/index.ts';
import { parseAttributes, toPlannerRecipes } from './planner-data/attributes.ts';
import { curatorFamilySettings, curatorRestrictions } from './planner-data/family.ts';
import { familyScoresOf, historyOf, publishable, readOriginRecipes } from './planner-data/origin.ts';

const FIRST_WEEK = '2026-10-12';
const WEEKS = 20;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = readOriginRecipes(resolve(root, '../meal_planner'));
const catalogue = all.filter(publishable);
const { attributes, errors } = parseAttributes(readFileSync(resolve(root, 'scripts/import/recipe-attributes.yaml'), 'utf8'), catalogue);
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
const recipes = toPlannerRecipes(catalogue, attributes);
const names = new Map(all.map((r) => [r.id, r.nome]));
const byId = new Map(recipes.map((r) => [r.id, r]));
const settings = curatorFamilySettings();
const restrictions = curatorRestrictions(recipes);
const familyScores = familyScoresOf(all);
const ownedBookIds = [...new Set(recipes.flatMap((r) => (r.bookId ? [r.bookId] : [])))];
const startHistory = historyOf(all, FIRST_WEEK);

const GROUP_LABEL: Record<string, string> = { fish: 'pesce', legumes: 'legumi', white_meat: 'carne bianca', red_meat: 'carne rossa', cured_meat: 'salumi', eggs: 'uova', cheese: 'formaggi', potatoes: 'patate', heavy: 'pesanti' };
const DAY_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MEAL_LABEL = { lunch: 'pranzo', dinner: 'cena' };

let history: PastMeal[] = startHistory;
const results: { input: PlannerInput; week: PlannedWeek; metrics: WeekMetrics; violations: string[] }[] = [];
for (let i = 0; i < WEEKS; i++) {
	const input: PlannerInput = { familyId: 'family-curator', weekStart: addDays(FIRST_WEEK, 7 * i), settings, recipes, ownedBookIds, exclusions: [], restrictions, familyScores, globalScores: {}, history };
	const week = generateWeek(input);
	results.push({ input, week, metrics: weekMetrics(week, input), violations: hardViolations(week, input) });
	history = [...history, ...week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []))];
}

const mealName = (m: PastMeal) => `${names.get(m.recipeId) ?? m.recipeId} (${DAY_LABEL[(new Date(`${m.date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${m.date.slice(5)} ${MEAL_LABEL[m.mealType]})`;
const usage = new Map<string, number>();
for (const { week } of results) for (const s of week.slots) if (s.content.kind === 'recipe') usage.set(s.content.recipeId, (usage.get(s.content.recipeId) ?? 0) + 1);
const violations = results.flatMap((r) => r.violations.map((v) => `${r.week.weekStart}: ${v}`));

const lines: string[] = [
	'# Report del pianificatore (esperimento M0)',
	'',
	`Generato da \`npm run planner-report\`: ${WEEKS} settimane dal ${FIRST_WEEK}. Catalogo: ${recipes.length} ricette pubblicabili su ${all.length}. Storico iniziale: ${startHistory.length} pasti mangiati. Voti: ${Object.keys(familyScores).length} ricette votate. Impostazioni dalle regole d'origine (\`scripts/planner-data/family.ts\`).`,
	'',
	'## Sintesi',
	'',
	`- Violazioni dei vincoli rigidi: **${violations.length}**${violations.length ? `\n${violations.map((v) => `  - ${v}`).join('\n')}` : ''}`,
	`- Pasti «nessuna ricetta adatta»: **${results.reduce((n, r) => n + r.metrics.noMatch, 0)}** su ${results.reduce((n, r) => n + r.week.slots.filter((s) => s.content.kind !== 'free').length, 0)}`,
	`- Settimane con regole non rispettate (venerdì pesce, intervalli, note/nuove): **${results.filter((r) => r.metrics.problems.length > 0).length}** su ${WEEKS}`,
	`- Ricette usate almeno una volta: **${usage.size}** su ${recipes.length}`,
	'',
	'### Gruppi alimentari per settimana',
	'',
	'| Gruppo | Intervallo | Minimo | Medio | Massimo | Settimane fuori |',
	'|---|---|---|---|---|---|',
	...FOOD_GROUPS.map((g) => {
		const counts = results.map((r) => r.metrics.groupCounts[g]);
		const range = settings.groupRanges[g];
		const out = counts.filter((c) => c < range.min || c > range.max).length;
		return `| ${GROUP_LABEL[g]} | ${range.min}-${range.max} | ${Math.min(...counts)} | ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)} | ${Math.max(...counts)} | ${out} |`;
	}),
	'',
	'### Ricette più usate e mai usate',
	'',
	...[...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => `- ${names.get(id)}: ${n} volte`),
	'',
	`Mai usate: ${recipes.filter((r) => !usage.has(r.id)).map((r) => names.get(r.id)).join('; ') || 'nessuna'}.`,
	'',
	'### Coppie simili ravvicinate',
	'',
	...results.flatMap((r) => r.metrics.closePairs.filter((p) => p.distance === 1).map((p) => `- ${mealName(p.first)} → ${mealName(p.second)}: ${p.shared.join(', ')}`)),
	'',
	'## Settimane',
	''
];

for (const { week, metrics } of results) {
	lines.push(`### Settimana del ${week.weekStart}`, '', '| Giorno | Pranzo | Cena |', '|---|---|---|');
	for (let day = 0; day < 7; day++) {
		const date = addDays(week.weekStart, day);
		const cell = (mealType: 'lunch' | 'dinner') => {
			const slot = week.slots.find((s) => s.date === date && s.mealType === mealType);
			if (!slot) return '—';
			if (slot.content.kind === 'free') return `_${slot.content.text}_`;
			if (slot.content.kind === 'no_match') return '**nessuna ricetta adatta**';
			const recipe = byId.get(slot.content.recipeId)!;
			return `${names.get(recipe.id)} · ${recipe.durationMinutes ?? '?'} min · ${slot.servings} porz.`;
		};
		lines.push(`| ${DAY_LABEL[day]} ${date.slice(8)} | ${cell('lunch')} | ${cell('dinner')} |`);
	}
	const groups = FOOD_GROUPS.filter((g) => metrics.groupCounts[g] > 0).map((g) => `${GROUP_LABEL[g]} ${metrics.groupCounts[g]}`).join(', ');
	const problems = metrics.problems.map((p) => `${p.kind} ${p.detail}`).join('; ') || 'nessuno';
	lines.push('', `Gruppi: ${groups}. Note/nuove: ${metrics.known}/${metrics.fresh}${metrics.knownNewApplies ? '' : ' (quota non ancora attiva)'}. Problemi di regole: ${problems}.`, '');
}

const output = resolve(root, 'progetto/reports/planner-report.md');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join('\n'));
console.log(`Scritto ${output}`);
if (violations.length) process.exit(1);
```

- [ ] **Step 2: Eseguire il report**

Run: `npm run planner-report`
Expected: `Scritto …/progetto/reports/planner-report.md` e uscita 0 (nessuna violazione dei
vincoli rigidi). Con violazioni: il report le elenca; trovare la causa nel dominio, aggiungere
un test che la riproduca nel modulo responsabile, correggerla e rieseguire.

- [ ] **Step 3: Controlli complessivi**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/planner-report.ts progetto/reports/planner-report.md
git commit -m "Pianificatore: report di 20 settimane sui dati reali"
```

- [ ] **Step 5: Lettura dell'utente (punto di arresto)**

Presentare all'utente la sintesi del report e 3-4 settimane da leggere (la prima, una
centrale, una con problemi di regole, l'ultima), chiedendo: le settimane sono credibili per la
famiglia? cosa stona? il catalogo basta? Eventuali ritocchi di pesi o costanti si fanno in
`domain/src/planner/settings.ts`, con report rigenerato e commit
`Pianificatore: pesi rivisti dopo la lettura del report`.

---

### Task 11: Consolidamento nella specifica

**Files:**
- Modify: `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 2, 3, 9, 15
  e 16)

- [ ] **Step 1: Registrare l'esito concordato con l'utente**

Solo dopo la lettura del Task 10 e con le decisioni prese dall'utente:

- sezione 2, tabella `recipes`: vocabolari confermati di `protein_group`,
  `carbohydrate_group`, `category`, `meal_type`, `seasons`, ingrediente principale come
  `recipe_ingredients.is_primary`;
- sezione 3: costanti decise (finestra di somiglianza, 14 giorni, scelta fra i migliori
  quattro, riparazione con sostituzioni e scambi), vincoli resi rigidi nell'esperimento
  (massimo settimanale degli ingredienti limitati) ed eventuali regole d'origine non
  esprimibili con i modelli (niente skottle il lunedì sera);
- sezione 9: il report esiste (`npm run planner-report`) e il suo esito;
- sezione 15: chiusa o aggiornata la voce «Pianificatore e giudice» (classificazione dei
  vincoli) e la parte di «Implementazione» relativa all'esperimento;
- sezione 16: una riga con la data e le decisioni.

- [ ] **Step 2: Commit**

```bash
git add progetto/superpowers/specs/2026-09-29-app-famiglia-design.md
git commit -m "Specifica: esito dell'esperimento del pianificatore"
```
