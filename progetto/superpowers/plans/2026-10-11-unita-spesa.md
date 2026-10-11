# Unità e spesa: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dominio TypeScript puro per unità di misura (codici, scalatura, equivalenze, somma,
presentazione metrica e imperiale britannica in italiano e inglese britannico) e per la lista
della spesa della settimana (consolidamento, spunte, esportazioni).

**Architecture:** Due moduli senza I/O, `domain/src/units/` e `domain/src/shopping/`. Le
quantità si sommano in una forma canonica (`CombinedQuantity`: grammi, millilitri, unità
contate per codice) senza arrotondare; conversione di sistema e arrotondamenti avvengono
solo nella presentazione. La spesa riceve pasti, catalogo ed equivalenze già caricati e
restituisce dati e testi pronti.

**Tech Stack:** TypeScript (ES2024, `domain/tsconfig.json`), zod 4, vitest, `Intl.NumberFormat`.

**Spec:** `progetto/superpowers/specs/2026-10-11-unita-spesa.md` (subordinata a
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 2, 6, 12, 15).

## Global Constraints

- Codice, nomi, commenti e test in inglese; documenti e messaggi di commit in italiano.
- Nessuna dipendenza oltre `zod` (in `domain/package.json`, mai nel `package.json` della radice).
- Nessun I/O, nessuna API di Node in `domain/` (`domain/tsconfig.json` ha `"types": []`).
- Import relativi con estensione `.ts`, tab, apici singoli, come in `domain/src/planner/`.
- Lingue: `it-IT` e `en-GB`; sistemi: `metric` e `uk_imperial`.
- Fattori: 1 oz = 28,349523125 g; 1 lb = 16 oz; 1 fl oz britannica = 28,4130625 ml;
  1 pinta = 20 fl oz; tazza USA = 236,5882365 ml; cucchiaio di misura 15 ml, cucchiaino 5 ml.
- Arrotondamenti solo nella presentazione, mai sui valori sommati.
- Commit piccoli in italiano con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Quantità minime nel sistema imperiale (0,3 g di zafferano): «1 g», mai «0 oz» né «½ oz» → Task 4.
- Valori che arrotondando passano all'unità superiore (15,8 oz, 19,8 fl oz, 996 g): «1 lb»,
  «1 pint», «1 kg», mai «16 oz», «20 fl oz», «1000 g» → Task 4.
- La famiglia cambia sistema di misura dopo aver spuntato una voce: la voce resta spuntata → Task 8.
- Scorza in cucchiaini o in grammi e succo in grammi dello stesso limone: una sola voce
  «Limone» con pezzi, cucchiaini e grammi; l'equivalenza del succo non tocca la scorza → Task 7.
- Equivalenza specifica per la preparazione contro quella generica: vince la specifica,
  quella di un'altra preparazione non si applica mai → Task 2 e 7.
- Settimana con soli pasti liberi o ricette saltate: lista vuota, `mealCount` 0, nessun errore → Task 7.

---

### Task 0: Allineamento con main e dipendenza zod

**Files:**
- Modify: `domain/package.json` (creato dallo scheletro di W1)

- [ ] **Step 1: Rebase su main**

```bash
git fetch origin
git rebase origin/main
```

Expected: rebase pulito (questo branch contiene solo la spec e il piano in `progetto/`).
Verifica che esista `domain/package.json` con `"name": "@app/domain"`. Se manca, scrivi
`STATO: BLOCCATO lo scheletro di W1 non è su main` e fermati.

- [ ] **Step 2: Leggi gli script dello scheletro**

```bash
cat package.json domain/package.json
```

I comandi di questo piano usano `npx vitest run <percorso>` e
`npx tsc -p domain/tsconfig.json` dalla radice. Se lo scheletro definisce script diversi per
test e typecheck del workspace `domain`, usa quelli negli step «Run».

- [ ] **Step 3: Aggiungi zod al workspace del dominio**

```bash
npm install zod@^4 --workspace @app/domain
```

Expected: `domain/package.json` contiene `"zod": "^4.x"` in `dependencies`; il
`package.json` della radice non cambia (solo `package-lock.json`).

- [ ] **Step 4: Verifica che i test esistenti passino**

Run: `npx vitest run domain && npx tsc -p domain/tsconfig.json`
Expected: PASS (test del pianificatore), nessun errore di tipo.

- [ ] **Step 5: Commit**

```bash
git add domain/package.json package-lock.json
git commit -m "Dominio: zod per gli schemi di unità e spesa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Codici delle unità, lingue e quantità

**Files:**
- Create: `domain/src/units/codes.ts`
- Create: `domain/src/units/locale.ts`
- Create: `domain/src/units/quantity.ts`
- Test: `domain/src/units/codes.test.ts`, `domain/src/units/quantity.test.ts`

**Interfaces:**
- Produces: `UNIT_CODES`, `UnitCode`, `MASS_UNITS`, `VOLUME_UNITS`, `MassUnit`, `VolumeUnit`,
  `MeasuredUnit`, `CountedUnit`, `COUNTED_UNITS`, `Dimension`, `UNIT_DIMENSION`, `BASE_FACTOR`,
  `isMassUnit(u)`, `isVolumeUnit(u)`, `DRAFT_ONLY_UNITS`, costanti dei fattori
  (`G_PER_OZ`, `OZ_PER_LB`, `ML_PER_UK_FL_OZ`, `UK_FL_OZ_PER_PINT`, `ML_PER_US_CUP`,
  `ML_PER_UK_TSP`, `ML_PER_UK_TBSP`); `LOCALES`, `Locale`, `Localized`, `localizedSchema`,
  `plainWords(text)`; `unitCodeSchema`, `quantitySchema`, `publishableQuantitySchema`,
  `Quantity`, `Amount`.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/units/codes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BASE_FACTOR, COUNTED_UNITS, UNIT_CODES, UNIT_DIMENSION, isMassUnit, isVolumeUnit } from './codes.ts';

describe('unit codes', () => {
	it('gives every code a dimension', () => {
		for (const unit of UNIT_CODES) expect(UNIT_DIMENSION[unit]).toBeDefined();
		expect(UNIT_DIMENSION.tbsp).toBe('spoon');
		expect(UNIT_DIMENSION.bunch).toBe('count');
		expect(UNIT_DIMENSION.us_cup).toBe('us_cup');
	});
	it('uses the legal UK factors for base units', () => {
		expect(BASE_FACTOR.lb).toBeCloseTo(453.59237, 9);
		expect(BASE_FACTOR.uk_pint).toBeCloseTo(568.26125, 9);
		expect(BASE_FACTOR.kg).toBe(1000);
	});
	it('splits measured and counted units', () => {
		expect(isMassUnit('oz')).toBe(true);
		expect(isVolumeUnit('uk_fl_oz')).toBe(true);
		expect(isVolumeUnit('tbsp')).toBe(false);
		expect(COUNTED_UNITS).toEqual(['tbsp', 'tsp', 'piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf', 'us_cup']);
	});
});
```

`domain/src/units/quantity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { plainWords } from './locale.ts';
import { publishableQuantitySchema, quantitySchema } from './quantity.ts';

describe('plainWords', () => {
	it('drops case, accents, punctuation and extra spaces', () => {
		expect(plainWords('  Scòrza   GRATTUGIATA, fine! ')).toEqual(['scorza', 'grattugiata', 'fine']);
		expect(plainWords(' ... ')).toEqual([]);
	});
});

describe('quantity schema', () => {
	it('accepts the three kinds', () => {
		expect(quantitySchema.parse({ kind: 'amount', value: 300, unit: 'g' })).toEqual({ kind: 'amount', value: 300, unit: 'g' });
		expect(quantitySchema.parse({ kind: 'to_taste' })).toEqual({ kind: 'to_taste' });
		const text = { kind: 'text', text: { 'it-IT': '1 vaschetta da 250 g', 'en-GB': '1 punnet (250 g)' } };
		expect(quantitySchema.parse(text)).toEqual(text);
	});
	it('rejects non-positive amounts, unknown units and missing translations', () => {
		expect(quantitySchema.safeParse({ kind: 'amount', value: 0, unit: 'g' }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'amount', value: 1, unit: 'cup' }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'text', text: { 'it-IT': '1 bicchiere' } }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'text', text: { 'it-IT': '1 bicchiere', 'en-GB': ' ' } }).success).toBe(false);
	});
	it('keeps US cups out of published recipes', () => {
		const cup = publishableQuantitySchema.safeParse({ kind: 'amount', value: 0.5, unit: 'us_cup' });
		expect(cup.success).toBe(false);
		expect(cup.error?.issues[0].message).toBe('draft_only_unit');
		expect(publishableQuantitySchema.safeParse({ kind: 'amount', value: 2, unit: 'tbsp' }).success).toBe(true);
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/units`
Expected: FAIL, moduli `./codes.ts` e `./quantity.ts` non trovati.

- [ ] **Step 3: Implementa**

`domain/src/units/codes.ts`:

```ts
// Unit codes shared by recipe documents, shopping lists, the contract and MCP (spec section 6).

export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const VOLUME_UNITS = ['ml', 'l', 'uk_fl_oz', 'uk_pint'] as const;
/** Household spoons: never converted to millilitres, summed only with the same code. */
export const SPOON_UNITS = ['tbsp', 'tsp'] as const;
export const COUNT_UNITS = ['piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf'] as const;
/** The US cup of American sources: allowed only in drafts, converted per ingredient before publishing. */
export const UNIT_CODES = [...MASS_UNITS, ...VOLUME_UNITS, ...SPOON_UNITS, ...COUNT_UNITS, 'us_cup'] as const;

export type UnitCode = (typeof UNIT_CODES)[number];
export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type MeasuredUnit = MassUnit | VolumeUnit;
/** Units summed per code: spoons, counts and US cups. */
export type CountedUnit = Exclude<UnitCode, MeasuredUnit>;
export const COUNTED_UNITS = [...SPOON_UNITS, ...COUNT_UNITS, 'us_cup'] as const satisfies readonly CountedUnit[];

export type Dimension = 'mass' | 'volume' | 'spoon' | 'count' | 'us_cup';
export const UNIT_DIMENSION: Record<UnitCode, Dimension> = {
	g: 'mass', kg: 'mass', oz: 'mass', lb: 'mass',
	ml: 'volume', l: 'volume', uk_fl_oz: 'volume', uk_pint: 'volume',
	tbsp: 'spoon', tsp: 'spoon',
	piece: 'count', clove: 'count', slice: 'count', pinch: 'count', sprig: 'count', bunch: 'count', leaf: 'count',
	us_cup: 'us_cup'
};

export const DRAFT_ONLY_UNITS: ReadonlySet<UnitCode> = new Set<UnitCode>(['us_cup']);

// Weights and Measures Act 1985 (UK) and NIST (US cup).
export const G_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;
export const ML_PER_UK_FL_OZ = 28.4130625;
export const UK_FL_OZ_PER_PINT = 20;
export const ML_PER_US_CUP = 236.5882365;
/** UK measuring spoons, used only to present small volumes in UK imperial. */
export const ML_PER_UK_TSP = 5;
export const ML_PER_UK_TBSP = 15;

/** Grams per mass unit, millilitres per volume unit. */
export const BASE_FACTOR: Record<MeasuredUnit, number> = {
	g: 1,
	kg: 1000,
	oz: G_PER_OZ,
	lb: G_PER_OZ * OZ_PER_LB,
	ml: 1,
	l: 1000,
	uk_fl_oz: ML_PER_UK_FL_OZ,
	uk_pint: ML_PER_UK_FL_OZ * UK_FL_OZ_PER_PINT
};

export const isMassUnit = (unit: UnitCode): unit is MassUnit => UNIT_DIMENSION[unit] === 'mass';
export const isVolumeUnit = (unit: UnitCode): unit is VolumeUnit => UNIT_DIMENSION[unit] === 'volume';
```

`domain/src/units/locale.ts`:

```ts
import { z } from 'zod';

export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];
/** A text required in both languages (owned here; the recipe document builds its drafts on it). */
export type Localized = Record<Locale, string>;

export const localizedSchema = z.object({
	'it-IT': z.string().trim().min(1),
	'en-GB': z.string().trim().min(1)
});

/** Words of a text as compared in keys: lower case, no accents, punctuation or extra spaces. */
export const plainWords = (text: string): string[] =>
	text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
```

`domain/src/units/quantity.ts`:

```ts
import { z } from 'zod';
import { DRAFT_ONLY_UNITS, UNIT_CODES } from './codes.ts';
import { localizedSchema } from './locale.ts';

export const unitCodeSchema = z.enum(UNIT_CODES);

/**
 * Quantity of a recipe line (interface with the recipe document, agreed on 11 October 2026).
 * Ranges, packs, glasses and other household measures are `text`; `sourceText` stays on the line.
 */
export const quantitySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('amount'), value: z.number().positive(), unit: unitCodeSchema }),
	z.object({ kind: z.literal('to_taste') }),
	z.object({ kind: z.literal('text'), text: localizedSchema })
]);

export type Quantity = z.infer<typeof quantitySchema>;
export type Amount = Extract<Quantity, { kind: 'amount' }>;

/** Published level: US cups must be converted with a per-ingredient equivalence first. */
export const publishableQuantitySchema = quantitySchema.refine(
	(q) => q.kind !== 'amount' || !DRAFT_ONLY_UNITS.has(q.unit),
	{ message: 'draft_only_unit' }
);
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/units && npx tsc -p domain/tsconfig.json`
Expected: PASS, nessun errore di tipo.

- [ ] **Step 5: Commit**

```bash
git add domain/src/units
git commit -m "Unità: codici, dimensioni, fattori e schema della quantità

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scalatura ed equivalenze

**Files:**
- Create: `domain/src/units/scale.ts`, `domain/src/units/equivalence.ts`
- Test: `domain/src/units/scale.test.ts`, `domain/src/units/equivalence.test.ts`

**Interfaces:**
- Consumes: `Quantity`, `Amount`, `UnitCode`, `unitCodeSchema`, `BASE_FACTOR`, `UNIT_DIMENSION`,
  `plainWords` (Task 1).
- Produces: `scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity`;
  `EquivalenceScope`, `UnitEquivalence` (con `preparation: string | null`, chiave
  normalizzata), `unitEquivalenceSchema`,
  `preparationKey(text: string | null | undefined): string | null`,
  `findEquivalence(equivalences, scope: EquivalenceScope, unit: UnitCode, preparation: string | null | undefined): UnitEquivalence | null`
  (`preparation` è il testo italiano della riga),
  `applyRecipeEquivalence(q: Quantity, eq: UnitEquivalence): Amount`,
  `assertUnambiguousEquivalences(equivalences: readonly UnitEquivalence[]): void`,
  `toPurchaseUnit(q: Quantity, equivalences: readonly UnitEquivalence[], preparation: string | null | undefined): Quantity`
  (il chiamante passa solo le equivalenze dell'ingrediente). Per W3: si sceglie con
  `findEquivalence(eqs, 'recipe', q.unit, line.preparation?.['it-IT'])`, poi si applica con
  `applyRecipeEquivalence`; senza equivalenza la tazza resta e la ricetta resta in bozza.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/units/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Quantity } from './quantity.ts';
import { scaleQuantity } from './scale.ts';

describe('scaleQuantity', () => {
	it('scales amounts without rounding', () => {
		expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 3, 6)).toEqual({ kind: 'amount', value: 150, unit: 'g' });
		expect(scaleQuantity({ kind: 'amount', value: 1, unit: 'piece' }, 1, 3)).toEqual({ kind: 'amount', value: 1 / 3, unit: 'piece' });
	});
	it('leaves to taste and text quantities unchanged', () => {
		const text: Quantity = { kind: 'text', text: { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' } };
		expect(scaleQuantity({ kind: 'to_taste' }, 3, 6)).toEqual({ kind: 'to_taste' });
		expect(scaleQuantity(text, 4, 2)).toBe(text);
	});
	it('rejects non-positive servings', () => {
		expect(() => scaleQuantity({ kind: 'amount', value: 1, unit: 'g' }, 0, 2)).toThrow(RangeError);
		expect(() => scaleQuantity({ kind: 'amount', value: 1, unit: 'g' }, 2, 0)).toThrow(RangeError);
	});
});
```

`domain/src/units/equivalence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	applyRecipeEquivalence, assertUnambiguousEquivalences, findEquivalence, preparationKey, toPurchaseUnit,
	unitEquivalenceSchema, type UnitEquivalence
} from './equivalence.ts';

const cheddar: UnitEquivalence = {
	ingredientId: 'cheddar', fromUnit: 'us_cup', toUnit: 'g', factor: 113, scope: 'recipe', preparation: null,
	source: 'King Arthur Baking, Ingredient Weight Chart: grated cheddar, 1 cup = 113 g'
};
const lemonJuice: UnitEquivalence = {
	ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo',
	source: 'USDA FoodData Central: juice of 1 lemon = 47 g'
};
// Synthetic factor: a generic per-weight rule next to the juice-specific one.
const wholeLemon: UnitEquivalence = { ...lemonJuice, factor: 1 / 120, preparation: null, source: 'synthetic' };

describe('preparationKey', () => {
	it('normalises the Italian preparation like a variety, without filler words', () => {
		expect(preparationKey(' Succo ')).toBe('succo');
		expect(preparationKey('Scòrza grattugiata!')).toBe('scorza grattugiata');
		expect(preparationKey('tipo fine')).toBe('tipo fine');
	});
	it('is null without a preparation', () => {
		expect(preparationKey(null)).toBeNull();
		expect(preparationKey(undefined)).toBeNull();
		expect(preparationKey(' , ')).toBeNull();
	});
});

describe('findEquivalence', () => {
	it('prefers the equivalence of the same preparation, then a generic one', () => {
		expect(findEquivalence([wholeLemon, lemonJuice], 'shopping', 'g', 'Succo')).toBe(lemonJuice);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'kg', 'succo')).toBe(lemonJuice);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'g', 'scorza')).toBe(wholeLemon);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'g', null)).toBe(wholeLemon);
	});
	it('never applies an equivalence of another preparation, scope or dimension', () => {
		expect(findEquivalence([lemonJuice], 'shopping', 'g', 'scorza')).toBeNull();
		expect(findEquivalence([lemonJuice], 'shopping', 'g', null)).toBeNull();
		expect(findEquivalence([lemonJuice], 'recipe', 'g', 'succo')).toBeNull();
		expect(findEquivalence([lemonJuice], 'shopping', 'ml', 'succo')).toBeNull();
	});
});

describe('applyRecipeEquivalence', () => {
	it('converts a draft cup with a verified per-ingredient factor', () => {
		expect(applyRecipeEquivalence({ kind: 'amount', value: 0.5, unit: 'us_cup' }, cheddar)).toEqual({ kind: 'amount', value: 56.5, unit: 'g' });
	});
	it('refuses another unit or a shopping equivalence', () => {
		expect(() => applyRecipeEquivalence({ kind: 'amount', value: 1, unit: 'tbsp' }, cheddar)).toThrow();
		expect(() => applyRecipeEquivalence({ kind: 'to_taste' }, cheddar)).toThrow();
		expect(() => applyRecipeEquivalence({ kind: 'amount', value: 50, unit: 'g' }, lemonJuice)).toThrow();
	});
	it('takes the cup of the line preparation when the import chooses with findEquivalence', () => {
		// Synthetic factors: chopped onion measured by the cup, any other onion as a generic rule.
		const onion: UnitEquivalence = { ingredientId: 'onion', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: null, source: 'synthetic' };
		const chopped: UnitEquivalence = { ...onion, factor: 0.5, preparation: 'tritata' };
		const cup = { kind: 'amount', value: 1, unit: 'us_cup' } as const;
		const eq = findEquivalence([onion, chopped], 'recipe', cup.unit, 'Tritata');
		expect(eq && applyRecipeEquivalence(cup, eq)).toEqual({ kind: 'amount', value: 0.5, unit: 'piece' });
	});
});

describe('toPurchaseUnit', () => {
	it('turns grams of juice into lemons, also from another mass unit', () => {
		const fromGrams = toPurchaseUnit({ kind: 'amount', value: 50, unit: 'g' }, [lemonJuice], 'succo');
		expect(fromGrams).toMatchObject({ kind: 'amount', unit: 'piece' });
		expect(fromGrams.kind === 'amount' && fromGrams.value).toBeCloseTo(50 / 47, 12);
		const fromKilos = toPurchaseUnit({ kind: 'amount', value: 0.1, unit: 'kg' }, [lemonJuice], 'succo');
		expect(fromKilos.kind === 'amount' && fromKilos.value).toBeCloseTo(100 / 47, 12);
	});
	it('keeps grams of zest in grams: the juice equivalence is not theirs', () => {
		expect(toPurchaseUnit({ kind: 'amount', value: 5, unit: 'g' }, [lemonJuice], 'scorza')).toEqual({ kind: 'amount', value: 5, unit: 'g' });
		expect(toPurchaseUnit({ kind: 'amount', value: 5, unit: 'g' }, [lemonJuice], null)).toEqual({ kind: 'amount', value: 5, unit: 'g' });
	});
	it('uses the specific equivalence over the generic one', () => {
		const juice = toPurchaseUnit({ kind: 'amount', value: 94, unit: 'g' }, [wholeLemon, lemonJuice], 'succo');
		expect(juice.kind === 'amount' && juice.value).toBeCloseTo(2, 12);
		const zest = toPurchaseUnit({ kind: 'amount', value: 60, unit: 'g' }, [wholeLemon, lemonJuice], 'scorza');
		expect(zest.kind === 'amount' && zest.value).toBeCloseTo(0.5, 12);
	});
	it('leaves other dimensions, other kinds and recipe equivalences alone', () => {
		expect(toPurchaseUnit({ kind: 'amount', value: 1, unit: 'piece' }, [lemonJuice], 'succo')).toEqual({ kind: 'amount', value: 1, unit: 'piece' });
		expect(toPurchaseUnit({ kind: 'amount', value: 20, unit: 'ml' }, [lemonJuice], 'succo')).toEqual({ kind: 'amount', value: 20, unit: 'ml' });
		expect(toPurchaseUnit({ kind: 'to_taste' }, [lemonJuice], 'succo')).toEqual({ kind: 'to_taste' });
		expect(toPurchaseUnit({ kind: 'amount', value: 1, unit: 'us_cup' }, [cheddar], null)).toEqual({ kind: 'amount', value: 1, unit: 'us_cup' });
	});
});

describe('ambiguous equivalences', () => {
	// Synthetic factors: two conversions from the same dimension that disagree.
	const perGram: UnitEquivalence = { ingredientId: 'x', fromUnit: 'g', toUnit: 'piece', factor: 0.01, scope: 'shopping', preparation: null, source: 'synthetic' };
	const perKilo: UnitEquivalence = { ...perGram, fromUnit: 'kg', factor: 20 };
	it('are refused whatever their order', () => {
		expect(() => toPurchaseUnit({ kind: 'amount', value: 100, unit: 'g' }, [perGram, perKilo], null)).toThrow(/Ambiguous/);
		expect(() => toPurchaseUnit({ kind: 'amount', value: 100, unit: 'g' }, [perKilo, perGram], null)).toThrow(/Ambiguous/);
		expect(() => assertUnambiguousEquivalences([perKilo, perGram])).toThrow(/Ambiguous/);
	});
	it('are refused for the same preparation too', () => {
		expect(() => assertUnambiguousEquivalences([{ ...perGram, preparation: 'succo' }, { ...perKilo, preparation: 'succo' }])).toThrow(/Ambiguous/);
	});
	it('are fine across dimensions, scopes, counted codes, preparations and ingredients', () => {
		expect(() =>
			assertUnambiguousEquivalences([
				perGram,
				{ ...perGram, fromUnit: 'ml' },
				{ ...perGram, fromUnit: 'kg', scope: 'recipe' },
				{ ...perGram, fromUnit: 'bunch' },
				{ ...perGram, fromUnit: 'slice' },
				{ ...perKilo, preparation: 'succo' },
				{ ...perKilo, preparation: 'scorza' },
				{ ...perGram, ingredientId: 'y', fromUnit: 'kg' }
			])
		).not.toThrow();
	});
});

describe('unitEquivalenceSchema', () => {
	it('requires a positive factor, a source and a normalised preparation', () => {
		expect(unitEquivalenceSchema.parse(cheddar)).toEqual(cheddar);
		expect(unitEquivalenceSchema.parse(lemonJuice)).toEqual(lemonJuice);
		expect(unitEquivalenceSchema.safeParse({ ...cheddar, factor: 0 }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...cheddar, source: '' }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...lemonJuice, preparation: 'Succo' }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...lemonJuice, preparation: '' }).success).toBe(false);
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/units`
Expected: FAIL, `./scale.ts` e `./equivalence.ts` non trovati.

- [ ] **Step 3: Implementa**

`domain/src/units/scale.ts`:

```ts
import type { Quantity } from './quantity.ts';

/** Quantity × servings ÷ base servings (spec section 6), never rounded here. */
export function scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity {
	if (!(servings > 0) || !(baseServings > 0)) throw new RangeError('Servings must be positive');
	return q.kind === 'amount' ? { ...q, value: (q.value * servings) / baseServings } : q;
}
```

`domain/src/units/equivalence.ts`:

```ts
import { z } from 'zod';
import { BASE_FACTOR, UNIT_DIMENSION, isMassUnit, isVolumeUnit, type MeasuredUnit, type UnitCode } from './codes.ts';
import { plainWords } from './locale.ts';
import { unitCodeSchema, type Amount, type Quantity } from './quantity.ts';

/** `recipe`: applied when curating or importing (US cups); `shopping`: how the ingredient is bought. */
export type EquivalenceScope = 'recipe' | 'shopping';

/**
 * Comparison key of a line preparation, from its Italian text: normalised like a variety but
 * keeping every word ("succo", "scorza grattugiata"). null without a preparation.
 */
export function preparationKey(text: string | null | undefined): string | null {
	return plainWords(text ?? '').join(' ') || null;
}

export const unitEquivalenceSchema = z.object({
	ingredientId: z.string().min(1),
	fromUnit: unitCodeSchema,
	toUnit: unitCodeSchema,
	/** Amount of `toUnit` for one `fromUnit`. */
	factor: z.number().positive(),
	scope: z.enum(['recipe', 'shopping']),
	/** Only for lines with this preparation (a `preparationKey`); null for any line. */
	preparation: z.string().refine((p) => preparationKey(p) === p, { message: 'not_normalised' }).nullable(),
	/** The verified source of the factor. */
	source: z.string().trim().min(1)
});
export type UnitEquivalence = z.infer<typeof unitEquivalenceSchema>;

/** How many `from` units one `unit` is, when both measure the same thing; null otherwise. */
function ratio(unit: UnitCode, from: UnitCode): number | null {
	if (unit === from) return 1;
	if (UNIT_DIMENSION[unit] !== UNIT_DIMENSION[from] || !(unit in BASE_FACTOR) || !(from in BASE_FACTOR)) return null;
	return BASE_FACTOR[unit as MeasuredUnit] / BASE_FACTOR[from as MeasuredUnit];
}

/** For curation and import: the published line keeps the converted amount, the source text keeps the cup. */
export function applyRecipeEquivalence(q: Quantity, eq: UnitEquivalence): Amount {
	if (eq.scope !== 'recipe') throw new Error('Not a recipe equivalence');
	const r = q.kind === 'amount' ? ratio(q.unit, eq.fromUnit) : null;
	if (q.kind !== 'amount' || r === null) throw new Error(`The equivalence applies to ${eq.fromUnit} only`);
	return { kind: 'amount', value: q.value * r * eq.factor, unit: eq.toUnit };
}

/** Masses and volumes convert within their dimension; spoons, counts and cups only per code. */
const sourceKey = (unit: UnitCode): string => (isMassUnit(unit) || isVolumeUnit(unit) ? UNIT_DIMENSION[unit] : unit);

/**
 * At most one equivalence per ingredient, scope, source dimension and preparation (or none),
 * agreed with the schema, which enforces it too: otherwise the result would depend on the order.
 */
export function assertUnambiguousEquivalences(equivalences: readonly UnitEquivalence[]): void {
	const seen = new Set<string>();
	for (const eq of equivalences) {
		const key = `${eq.ingredientId}|${eq.scope}|${sourceKey(eq.fromUnit)}|${eq.preparation ?? ''}`;
		if (seen.has(key)) throw new Error(`Ambiguous ${eq.scope} equivalences for ${eq.ingredientId} from ${sourceKey(eq.fromUnit)}`);
		seen.add(key);
	}
}

/**
 * The equivalence for a line of the ingredient: the one of the line's preparation (Italian text)
 * if any, otherwise the one without a preparation; an equivalence of another preparation never
 * applies (lemon juice in lemons is not lemon zest). `equivalences` are those of the ingredient.
 */
export function findEquivalence(
	equivalences: readonly UnitEquivalence[], scope: EquivalenceScope, unit: UnitCode, preparation: string | null | undefined
): UnitEquivalence | null {
	const key = preparationKey(preparation);
	const candidates = equivalences.filter((eq) => eq.scope === scope && ratio(unit, eq.fromUnit) !== null);
	return candidates.find((eq) => key !== null && eq.preparation === key) ?? candidates.find((eq) => eq.preparation === null) ?? null;
}

/**
 * Shopping lists buy as shops sell: 50 g of lemon juice become 50/47 lemons (spec section 6).
 * `equivalences` are those of the line's ingredient, `preparation` its Italian text.
 */
export function toPurchaseUnit(q: Quantity, equivalences: readonly UnitEquivalence[], preparation: string | null | undefined): Quantity {
	assertUnambiguousEquivalences(equivalences);
	if (q.kind !== 'amount') return q;
	const eq = findEquivalence(equivalences, 'shopping', q.unit, preparation);
	return eq ? { kind: 'amount', value: q.value * (ratio(q.unit, eq.fromUnit) ?? 1) * eq.factor, unit: eq.toUnit } : q;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/units && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/units
git commit -m "Unità: scalatura delle porzioni ed equivalenze per ingrediente e preparazione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Somma canonica (`CombinedQuantity`)

**Files:**
- Create: `domain/src/units/combined.ts`
- Test: `domain/src/units/combined.test.ts`

**Interfaces:**
- Consumes: `Quantity`, `localizedSchema`, `COUNTED_UNITS`, `CountedUnit`, `BASE_FACTOR`, `isMassUnit`, `isVolumeUnit`.
- Produces: `CombinedQuantity` (`mass_g: number | null`, `volume_ml: number | null`,
  `counts: Partial<Record<CountedUnit, number>>`, `texts: { key: string; text: Localized }[]`,
  `to_taste: boolean`), `combinedQuantitySchema`, `textKey(text: string): string`,
  `emptyCombined()`, `addQuantity(c, q): CombinedQuantity`, `exceeds(now, before): boolean`.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/units/combined.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addQuantity, combinedQuantitySchema, emptyCombined, exceeds, textKey, type CombinedQuantity } from './combined.ts';
import type { Quantity } from './quantity.ts';
import type { UnitCode } from './codes.ts';

const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const bunchText = { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' };
const bunch: Quantity = { kind: 'text', text: bunchText };
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());

describe('addQuantity', () => {
	it('sums masses in grams and volumes in millilitres', () => {
		const c = combine(amount(320, 'g'), amount(0.4, 'kg'), amount(2, 'oz'), amount(1, 'l'), amount(250, 'ml'));
		expect(c.mass_g).toBeCloseTo(720 + 2 * 28.349523125, 9);
		expect(c.volume_ml).toBe(1250);
	});
	it('keeps spoons, counts and cups per code', () => {
		const c = combine(amount(1.5, 'clove'), amount(3, 'clove'), amount(2, 'tbsp'), amount(30, 'ml'), amount(1, 'piece'));
		expect(c.counts).toEqual({ clove: 4.5, tbsp: 2, piece: 1 });
		expect(c.volume_ml).toBe(30);
	});
	it('keeps texts once by their normalised Italian key, with both languages, and notes to taste', () => {
		const c = combine(bunch, { kind: 'to_taste' }, bunch, { kind: 'text', text: { 'it-IT': '1  Mazzetto', 'en-GB': '1 Bunch' } });
		expect(c.texts).toEqual([{ key: '1 mazzetto', text: bunchText }]);
		expect(textKey(' 1 Mazzétto ')).toBe('1 mazzetto');
		expect(c.to_taste).toBe(true);
		expect(c.mass_g).toBeNull();
	});
});

describe('exceeds', () => {
	const before = combine(amount(200, 'g'), amount(1, 'piece'));
	it('is true when any part grows or appears', () => {
		expect(exceeds(combine(amount(300, 'g'), amount(1, 'piece')), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), amount(100, 'ml')), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), { kind: 'to_taste' }), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), bunch), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), amount(1, 'clove')), before)).toBe(true);
	});
	it('is false when nothing grows, despite floating point noise', () => {
		expect(exceeds(before, before)).toBe(false);
		expect(exceeds(combine(amount(0.1, 'kg'), amount(1, 'piece')), before)).toBe(false);
		expect(exceeds(combine(amount(200 / 3, 'g'), amount(200 / 3, 'g'), amount(200 / 3, 'g'), amount(1, 'piece')), before)).toBe(false);
	});
});

describe('combinedQuantitySchema', () => {
	it('round-trips the stored shape and rejects unknown codes', () => {
		const stored = { mass_g: 340, volume_ml: null, counts: { piece: 2, tbsp: 1.5 }, texts: [{ key: '1 mazzetto', text: bunchText }], to_taste: true };
		expect(combinedQuantitySchema.parse(stored)).toEqual(stored);
		expect(combinedQuantitySchema.safeParse({ ...stored, texts: ['1 mazzetto'] }).success).toBe(false);
		expect(combinedQuantitySchema.safeParse({ ...stored, counts: { cup: 1 } }).success).toBe(false);
		expect(combinedQuantitySchema.safeParse({ ...stored, mass_g: -1 }).success).toBe(false);
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/units/combined.test.ts`
Expected: FAIL, `./combined.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/units/combined.ts`:

```ts
import { z } from 'zod';
import { BASE_FACTOR, COUNTED_UNITS, isMassUnit, isVolumeUnit } from './codes.ts';
import { localizedSchema } from './locale.ts';
import type { Quantity } from './quantity.ts';

/**
 * Sum of an ingredient's quantities, never rounded (spec section 6). Also the stored shape of
 * `shopping_list_checks.quantity_at_check`.
 */
export const combinedQuantitySchema = z.object({
	mass_g: z.number().nonnegative().nullable(),
	volume_ml: z.number().nonnegative().nullable(),
	counts: z.partialRecord(z.enum(COUNTED_UNITS), z.number().nonnegative()),
	/**
	 * Non-numeric quantities in both languages as they were: a tick shows its old quantity in the
	 * viewer's language even after the lines changed. `key` (normalised Italian) is what `exceeds` compares.
	 */
	texts: z.array(z.object({ key: z.string().min(1), text: localizedSchema })),
	to_taste: z.boolean()
});
export type CombinedQuantity = z.infer<typeof combinedQuantitySchema>;

export const emptyCombined = (): CombinedQuantity => ({ mass_g: null, volume_ml: null, counts: {}, texts: [], to_taste: false });

/** Comparison key of a non-numeric quantity: case, accents and spacing ignored. */
export const textKey = (text: string): string =>
	text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function addQuantity(c: CombinedQuantity, q: Quantity): CombinedQuantity {
	if (q.kind === 'to_taste') return { ...c, to_taste: true };
	if (q.kind === 'text') {
		const key = textKey(q.text['it-IT']);
		return c.texts.some((t) => t.key === key) ? c : { ...c, texts: [...c.texts, { key, text: q.text }] };
	}
	const { value, unit } = q;
	if (isMassUnit(unit)) return { ...c, mass_g: (c.mass_g ?? 0) + value * BASE_FACTOR[unit] };
	if (isVolumeUnit(unit)) return { ...c, volume_ml: (c.volume_ml ?? 0) + value * BASE_FACTOR[unit] };
	return { ...c, counts: { ...c.counts, [unit]: (c.counts[unit] ?? 0) + value } };
}

const EPSILON = 1e-9;
const grew = (now: number | null | undefined, before: number | null | undefined) => (now ?? 0) > (before ?? 0) * (1 + EPSILON) + EPSILON;

/** True when `now` asks for more than `before`: a ticked item needs ticking again (spec section 6). */
export function exceeds(now: CombinedQuantity, before: CombinedQuantity): boolean {
	return (
		grew(now.mass_g, before.mass_g) ||
		grew(now.volume_ml, before.volume_ml) ||
		COUNTED_UNITS.some((unit) => grew(now.counts[unit], before.counts[unit])) ||
		now.texts.some((t) => !before.texts.some((b) => b.key === t.key)) ||
		(now.to_taste && !before.to_taste)
	);
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/units && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/units
git commit -m "Unità: somma canonica delle quantità e confronto per le spunte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Presentazione nel sistema della famiglia

**Files:**
- Create: `domain/src/units/present.ts`
- Test: `domain/src/units/present.test.ts`

**Interfaces:**
- Consumes: codici e fattori (Task 1).
- Produces: `MEASUREMENT_SYSTEMS`, `MeasurementSystem`, `CountRounding` (`'recipe' | 'shopping'`),
  `PresentedAmount` (`{ value: number; unit: UnitCode }`),
  `presentMass(grams, system)`, `presentVolume(millilitres, system)`,
  `presentCount(value, unit: CountedUnit, rounding)`,
  `presentAmount(value, unit, system, rounding = 'recipe')`.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/units/present.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { presentAmount, presentCount, presentMass, presentVolume } from './present.ts';

describe('metric presentation', () => {
	it('rounds grams and millilitres (spec section 6)', () => {
		expect(presentMass(243, 'metric')).toEqual({ value: 240, unit: 'g' });
		expect(presentMass(37, 'metric')).toEqual({ value: 35, unit: 'g' });
		expect(presentMass(2, 'metric')).toEqual({ value: 2, unit: 'g' });
		expect(presentMass(0.2, 'metric')).toEqual({ value: 1, unit: 'g' });
		expect(presentVolume(250, 'metric')).toEqual({ value: 250, unit: 'ml' });
	});
	it('switches to kilos and litres from 1000 after rounding', () => {
		expect(presentMass(1600, 'metric')).toEqual({ value: 1.6, unit: 'kg' });
		expect(presentMass(996, 'metric')).toEqual({ value: 1, unit: 'kg' });
		expect(presentVolume(1250, 'metric')).toEqual({ value: 1.3, unit: 'l' });
	});
});

describe('UK imperial presentation', () => {
	it('keeps grams below half an ounce', () => {
		expect(presentMass(3, 'uk_imperial')).toEqual({ value: 3, unit: 'g' });
		expect(presentMass(0.3, 'uk_imperial')).toEqual({ value: 1, unit: 'g' });
	});
	it('uses half ounces, whole ounces and quarter pounds', () => {
		expect(presentMass(100, 'uk_imperial')).toEqual({ value: 3.5, unit: 'oz' });
		expect(presentMass(300, 'uk_imperial')).toEqual({ value: 11, unit: 'oz' });
		expect(presentMass(800, 'uk_imperial')).toEqual({ value: 1.75, unit: 'lb' });
		expect(presentMass(15.8 * 28.349523125, 'uk_imperial')).toEqual({ value: 1, unit: 'lb' });
	});
	it('shows small volumes in measuring spoons', () => {
		expect(presentVolume(3, 'uk_imperial')).toEqual({ value: 0.5, unit: 'tsp' });
		expect(presentVolume(10, 'uk_imperial')).toEqual({ value: 2, unit: 'tsp' });
		expect(presentVolume(30, 'uk_imperial')).toEqual({ value: 2, unit: 'tbsp' });
		expect(presentVolume(45, 'uk_imperial')).toEqual({ value: 3, unit: 'tbsp' });
	});
	it('uses fluid ounces and quarter pints', () => {
		expect(presentVolume(100, 'uk_imperial')).toEqual({ value: 3.5, unit: 'uk_fl_oz' });
		expect(presentVolume(250, 'uk_imperial')).toEqual({ value: 9, unit: 'uk_fl_oz' });
		expect(presentVolume(500, 'uk_imperial')).toEqual({ value: 18, unit: 'uk_fl_oz' });
		expect(presentVolume(1000, 'uk_imperial')).toEqual({ value: 1.75, unit: 'uk_pint' });
		expect(presentVolume(19.8 * 28.4130625, 'uk_imperial')).toEqual({ value: 1, unit: 'uk_pint' });
	});
});

describe('counted units', () => {
	it('rounds for recipes', () => {
		expect(presentCount(1.2, 'clove', 'recipe')).toEqual({ value: 1.5, unit: 'clove' });
		expect(presentCount(1 / 3, 'clove', 'recipe')).toEqual({ value: 0.5, unit: 'clove' });
		expect(presentCount(0.75, 'piece', 'recipe')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(0.1, 'tbsp', 'recipe')).toEqual({ value: 0.5, unit: 'tbsp' });
		expect(presentCount(2.2, 'slice', 'recipe')).toEqual({ value: 3, unit: 'slice' });
		expect(presentCount(0.3, 'bunch', 'recipe')).toEqual({ value: 0.5, unit: 'bunch' });
		expect(presentCount(0.6, 'us_cup', 'recipe')).toEqual({ value: 0.5, unit: 'us_cup' });
	});
	it('buys whole pieces, bunches and slices, ignoring 0.1 left by conversions', () => {
		expect(presentCount(0.5, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(2.06, 'piece', 'shopping')).toEqual({ value: 2, unit: 'piece' });
		expect(presentCount(2.2, 'piece', 'shopping')).toEqual({ value: 3, unit: 'piece' });
		expect(presentCount(0.05, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(0.3, 'bunch', 'shopping')).toEqual({ value: 1, unit: 'bunch' });
		expect(presentCount(1.25, 'clove', 'shopping')).toEqual({ value: 1.5, unit: 'clove' });
		expect(presentCount(1.09, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(1.1, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(1.11, 'piece', 'shopping')).toEqual({ value: 2, unit: 'piece' });
	});
});

describe('thresholds: below, at and above each one (the unit is chosen after rounding)', () => {
	const OZ = 28.349523125;
	const FL_OZ = 28.4130625;
	it.each([
		[4.4, 'metric', 4, 'g'], [5, 'metric', 5, 'g'],
		[49, 'metric', 50, 'g'], [50, 'metric', 50, 'g'], [54, 'metric', 50, 'g'], [55, 'metric', 60, 'g'],
		[994, 'metric', 990, 'g'], [995, 'metric', 1, 'kg'], [1005, 'metric', 1, 'kg'],
		[14, 'uk_imperial', 15, 'g'], [OZ / 2, 'uk_imperial', 0.5, 'oz'], [20, 'uk_imperial', 0.5, 'oz'],
		[3.7 * OZ, 'uk_imperial', 3.5, 'oz'], [4 * OZ, 'uk_imperial', 4, 'oz'], [4.3 * OZ, 'uk_imperial', 4, 'oz'],
		[15.4 * OZ, 'uk_imperial', 15, 'oz'], [15.6 * OZ, 'uk_imperial', 1, 'lb'], [16 * OZ, 'uk_imperial', 1, 'lb'], [17 * OZ, 'uk_imperial', 1, 'lb']
	] as const)('mass %d g in %s → %d %s', (grams, system, value, unit) => {
		expect(presentMass(grams, system)).toEqual({ value, unit });
	});
	it.each([
		[994, 'metric', 990, 'ml'], [995, 'metric', 1, 'l'], [1005, 'metric', 1, 'l'],
		[14, 'uk_imperial', 3, 'tsp'], [15, 'uk_imperial', 1, 'tbsp'], [16, 'uk_imperial', 1, 'tbsp'],
		[44, 'uk_imperial', 3, 'tbsp'], [45, 'uk_imperial', 3, 'tbsp'], [46, 'uk_imperial', 1.5, 'uk_fl_oz'],
		[3.9 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'], [4 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'], [4.3 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'],
		[19.4 * FL_OZ, 'uk_imperial', 19, 'uk_fl_oz'], [19.6 * FL_OZ, 'uk_imperial', 1, 'uk_pint'], [20 * FL_OZ, 'uk_imperial', 1, 'uk_pint'], [21 * FL_OZ, 'uk_imperial', 1, 'uk_pint']
	] as const)('volume %d ml in %s → %d %s', (millilitres, system, value, unit) => {
		expect(presentVolume(millilitres, system)).toEqual({ value, unit });
	});
});

describe('presentAmount', () => {
	it('converts any mass or volume unit and keeps counted units', () => {
		expect(presentAmount(2, 'oz', 'metric')).toEqual({ value: 60, unit: 'g' });
		expect(presentAmount(0.25, 'kg', 'metric')).toEqual({ value: 250, unit: 'g' });
		expect(presentAmount(1, 'uk_pint', 'metric')).toEqual({ value: 570, unit: 'ml' });
		expect(presentAmount(2, 'clove', 'uk_imperial')).toEqual({ value: 2, unit: 'clove' });
		expect(presentAmount(0.5, 'piece', 'metric', 'shopping')).toEqual({ value: 1, unit: 'piece' });
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/units/present.test.ts`
Expected: FAIL, `./present.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/units/present.ts`:

```ts
import {
	BASE_FACTOR, G_PER_OZ, ML_PER_UK_FL_OZ, ML_PER_UK_TBSP, ML_PER_UK_TSP, OZ_PER_LB, UK_FL_OZ_PER_PINT,
	isMassUnit, isVolumeUnit, type CountedUnit, type UnitCode
} from './codes.ts';

export const MEASUREMENT_SYSTEMS = ['metric', 'uk_imperial'] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];
/** Recipes, meal cards and item sources keep halves; shopping lists buy whole pieces. */
export type CountRounding = 'recipe' | 'shopping';

export interface PresentedAmount {
	value: number;
	unit: UnitCode;
}

/** Fraction of a piece left by conversions and ignored when buying (2.06 lemons → 2). */
const PIECE_TOLERANCE = 0.1;
const HALF_OZ_IN_G = G_PER_OZ / 2;
const MAX_SPOON_ML = 3 * ML_PER_UK_TBSP;
const BOUGHT_WHOLE: ReadonlySet<CountedUnit> = new Set<CountedUnit>(['piece', 'bunch', 'slice']);

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step;

/** Grams or millilitres: whole below 5 (at least 1), to 5 below 50, then to 10. */
function roundMetric(value: number): number {
	if (value < 5) return Math.max(1, Math.round(value));
	return roundTo(value, value < 50 ? 5 : 10);
}

function metric(base: number, small: 'g' | 'ml', large: 'kg' | 'l'): PresentedAmount {
	const rounded = roundMetric(base);
	return rounded < 1000 ? { value: rounded, unit: small } : { value: Math.round(base / 100) / 10, unit: large };
}

/** Display only (spec section 6); the threshold is chosen on the rounded value. */
export function presentMass(grams: number, system: MeasurementSystem): PresentedAmount {
	// Below half an ounce an ounce figure would be several times off: UK recipes give grams.
	if (system === 'metric' || grams < HALF_OZ_IN_G) return metric(grams, 'g', 'kg');
	const ounces = grams / G_PER_OZ;
	if (ounces < 4) return { value: roundTo(ounces, 0.5), unit: 'oz' };
	const whole = Math.round(ounces);
	return whole < OZ_PER_LB ? { value: whole, unit: 'oz' } : { value: roundTo(ounces / OZ_PER_LB, 0.25), unit: 'lb' };
}

export function presentVolume(millilitres: number, system: MeasurementSystem): PresentedAmount {
	if (system === 'metric') return metric(millilitres, 'ml', 'l');
	// Up to 3 tablespoons, UK measuring spoons (5 and 15 ml): a conversion between volumes.
	if (millilitres <= MAX_SPOON_ML) {
		return millilitres < ML_PER_UK_TBSP
			? { value: Math.max(0.5, roundTo(millilitres / ML_PER_UK_TSP, 0.5)), unit: 'tsp' }
			: { value: roundTo(millilitres / ML_PER_UK_TBSP, 0.5), unit: 'tbsp' };
	}
	const fluidOunces = millilitres / ML_PER_UK_FL_OZ;
	if (fluidOunces <= 4) return { value: roundTo(fluidOunces, 0.5), unit: 'uk_fl_oz' };
	const whole = Math.round(fluidOunces);
	return whole < UK_FL_OZ_PER_PINT
		? { value: whole, unit: 'uk_fl_oz' }
		: { value: roundTo(fluidOunces / UK_FL_OZ_PER_PINT, 0.25), unit: 'uk_pint' };
}

export function presentCount(value: number, unit: CountedUnit, rounding: CountRounding): PresentedAmount {
	// Up to 0.1 left over is ignored, 0.1 included (1.1 → 1): the epsilon absorbs 1.1 - 0.1 = 1.0000000000000002.
	if (rounding === 'shopping' && BOUGHT_WHOLE.has(unit)) return { value: Math.max(1, Math.ceil(value - PIECE_TOLERANCE - 1e-9)), unit };
	switch (unit) {
		case 'tbsp':
		case 'tsp':
			return { value: Math.max(0.5, roundTo(value, 0.5)), unit };
		case 'slice':
			return { value: Math.max(1, Math.ceil(value - 1e-9)), unit };
		case 'us_cup':
			return { value: Math.max(0.25, roundTo(value, 0.25)), unit };
		default:
			return { value: ceilTo(value, 0.5), unit };
	}
}

export function presentAmount(value: number, unit: UnitCode, system: MeasurementSystem, rounding: CountRounding = 'recipe'): PresentedAmount {
	if (isMassUnit(unit)) return presentMass(value * BASE_FACTOR[unit], system);
	if (isVolumeUnit(unit)) return presentVolume(value * BASE_FACTOR[unit], system);
	return presentCount(value, unit, rounding);
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/units && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/units
git commit -m "Unità: presentazione metrica e imperiale britannica con gli arrotondamenti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Etichette e testo localizzato

**Files:**
- Create: `domain/src/units/labels.ts`, `domain/src/units/format.ts`, `domain/src/units/index.ts`
- Test: `domain/src/units/format.test.ts`

**Interfaces:**
- Consumes: `Locale`, `Localized`, `Quantity`, `CombinedQuantity`, `present*`, `COUNTED_UNITS`.
- Produces: `UNIT_LABELS: Record<Locale, Record<UnitCode, [string, string]>>`,
  `TO_TASTE: Localized`, `formatAmount(amount: PresentedAmount, locale): string`,
  `formatQuantity(q: Quantity, system, locale): string`,
  `FormatOptions` (`system`, `locale`, `rounding?`),
  `formatCombined(c: CombinedQuantity, options: FormatOptions): string`; `units/index.ts` riesporta tutto.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/units/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined, type CombinedQuantity } from './combined.ts';
import type { UnitCode } from './codes.ts';
import { formatCombined, formatQuantity } from './format.ts';
import type { Quantity } from './quantity.ts';

const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const skeinsText = { 'it-IT': '3 matasse', 'en-GB': '3 nests' };
const skeins: Quantity = { kind: 'text', text: skeinsText };
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());

describe('formatQuantity', () => {
	it('formats metric amounts with the number style of the language', () => {
		expect(formatQuantity(amount(243, 'g'), 'metric', 'it-IT')).toBe('240 g');
		expect(formatQuantity(amount(0.25, 'kg'), 'metric', 'it-IT')).toBe('250 g');
		expect(formatQuantity(amount(1.5, 'kg'), 'metric', 'it-IT')).toBe('1,5 kg');
		expect(formatQuantity(amount(1.5, 'kg'), 'metric', 'en-GB')).toBe('1.5 kg');
	});
	it('writes halves and quarters of counted units, with singular and plural labels', () => {
		expect(formatQuantity(amount(1 / 3, 'clove'), 'metric', 'it-IT')).toBe('½ spicchio');
		expect(formatQuantity(amount(1.2, 'clove'), 'metric', 'it-IT')).toBe('1½ spicchi');
		expect(formatQuantity(amount(1, 'clove'), 'metric', 'en-GB')).toBe('1 clove');
		expect(formatQuantity(amount(0.5, 'piece'), 'metric', 'en-GB')).toBe('½');
		expect(formatQuantity(amount(2.5, 'tbsp'), 'metric', 'it-IT')).toBe('2½ cucchiai');
		expect(formatQuantity(amount(2, 'leaf'), 'metric', 'en-GB')).toBe('2 leaves');
	});
	it('localises to taste and text quantities', () => {
		expect(formatQuantity({ kind: 'to_taste' }, 'metric', 'it-IT')).toBe('q.b.');
		expect(formatQuantity({ kind: 'to_taste' }, 'metric', 'en-GB')).toBe('to taste');
		expect(formatQuantity(skeins, 'metric', 'en-GB')).toBe('3 nests');
	});
	it('formats UK imperial, small amounts included', () => {
		expect(formatQuantity(amount(300, 'g'), 'uk_imperial', 'en-GB')).toBe('11 oz');
		expect(formatQuantity(amount(100, 'g'), 'uk_imperial', 'en-GB')).toBe('3½ oz');
		expect(formatQuantity(amount(3, 'g'), 'uk_imperial', 'en-GB')).toBe('3 g');
		expect(formatQuantity(amount(500, 'ml'), 'uk_imperial', 'en-GB')).toBe('18 fl oz');
		expect(formatQuantity(amount(10, 'ml'), 'uk_imperial', 'it-IT')).toBe('2 cucchiaini');
		expect(formatQuantity(amount(1, 'l'), 'uk_imperial', 'en-GB')).toBe('1¾ pints');
		expect(formatQuantity(amount(19.8, 'uk_fl_oz'), 'uk_imperial', 'en-GB')).toBe('1 pint');
	});
});

describe('formatCombined', () => {
	it('rounds only after the sum', () => {
		expect(formatCombined(combine(amount(320, 'g'), amount(0.4, 'kg'), amount(2, 'oz')), { system: 'metric', locale: 'it-IT' })).toBe('780 g');
		expect(formatCombined(combine(amount(13, 'g'), amount(13, 'g'), amount(13, 'g')), { system: 'metric', locale: 'it-IT' })).toBe('40 g');
		expect(formatCombined(combine(amount(800, 'g'), amount(800, 'g')), { system: 'metric', locale: 'it-IT' })).toBe('1,6 kg');
		expect(formatCombined(combine(amount(1, 'l'), amount(250, 'ml')), { system: 'metric', locale: 'en-GB' })).toBe('1.3 l');
	});
	it('lists incompatible parts in a fixed order: mass, volume, counted units, texts, to taste', () => {
		const c = combine(amount(2, 'piece'), amount(100, 'ml'), { kind: 'to_taste' }, skeins, amount(50, 'g'));
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT' })).toBe('50 g + 100 ml + 2 + 3 matasse + q.b.');
		expect(formatCombined(c, { system: 'metric', locale: 'en-GB' })).toBe('50 g + 100 ml + 2 + 3 nests + to taste');
	});
	it('presents the sum in UK imperial', () => {
		expect(formatCombined(combine(amount(400, 'g'), amount(400, 'g')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('1¾ lb');
		expect(formatCombined(combine(amount(250, 'ml')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('9 fl oz');
	});
	it('rounds pieces up to whole ones only for shopping', () => {
		const c = combine(amount(0.5, 'piece'), amount(1.25, 'clove'));
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT' })).toBe('½ + 1½ spicchi');
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT', rounding: 'shopping' })).toBe('1 + 1½ spicchi');
		expect(formatCombined(combine(amount(2.06, 'piece')), { system: 'metric', locale: 'it-IT', rounding: 'shopping' })).toBe('2');
	});
	it('shows measuring spoons and household spoons of the same kind as one sum, in UK imperial only', () => {
		expect(formatCombined(combine(amount(30, 'ml'), amount(1, 'tbsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('3 tbsp');
		expect(formatCombined(combine(amount(5, 'ml'), amount(0.5, 'tsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('1½ tsp');
		expect(formatCombined(combine(amount(10, 'ml'), amount(1, 'tbsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('2 tsp + 1 tbsp');
		expect(formatCombined(combine(amount(30, 'ml'), amount(1, 'tbsp')), { system: 'metric', locale: 'it-IT' })).toBe('30 ml + 1 cucchiaio');
		const c = combine(amount(30, 'ml'), amount(1, 'tbsp'));
		expect(c.volume_ml).toBe(30);
		expect(c.counts.tbsp).toBe(1);
	});
	it('labels a US cup left in a draft and returns an empty text for an empty sum', () => {
		expect(formatCombined(combine(amount(0.5, 'us_cup')), { system: 'metric', locale: 'it-IT' })).toBe('½ tazza USA');
		expect(formatCombined(emptyCombined(), { system: 'metric', locale: 'it-IT' })).toBe('');
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/units/format.test.ts`
Expected: FAIL, `./format.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/units/labels.ts`:

```ts
import type { UnitCode } from './codes.ts';
import type { Locale, Localized } from './locale.ts';

/** [singular, plural]; an empty label means the number alone (pieces). Shared by web, server and MCP. */
export const UNIT_LABELS: Record<Locale, Record<UnitCode, [string, string]>> = {
	'it-IT': {
		g: ['g', 'g'], kg: ['kg', 'kg'], oz: ['oz', 'oz'], lb: ['lb', 'lb'],
		ml: ['ml', 'ml'], l: ['l', 'l'], uk_fl_oz: ['fl oz', 'fl oz'], uk_pint: ['pinta', 'pinte'],
		tbsp: ['cucchiaio', 'cucchiai'], tsp: ['cucchiaino', 'cucchiaini'],
		piece: ['', ''], clove: ['spicchio', 'spicchi'], slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi'],
		sprig: ['rametto', 'rametti'], bunch: ['mazzetto', 'mazzetti'], leaf: ['foglia', 'foglie'],
		us_cup: ['tazza USA', 'tazze USA']
	},
	'en-GB': {
		g: ['g', 'g'], kg: ['kg', 'kg'], oz: ['oz', 'oz'], lb: ['lb', 'lb'],
		ml: ['ml', 'ml'], l: ['l', 'l'], uk_fl_oz: ['fl oz', 'fl oz'], uk_pint: ['pint', 'pints'],
		tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
		piece: ['', ''], clove: ['clove', 'cloves'], slice: ['slice', 'slices'], pinch: ['pinch', 'pinches'],
		sprig: ['sprig', 'sprigs'], bunch: ['bunch', 'bunches'], leaf: ['leaf', 'leaves'],
		us_cup: ['US cup', 'US cups']
	}
};

export const TO_TASTE: Localized = { 'it-IT': 'q.b.', 'en-GB': 'to taste' };
```

`domain/src/units/format.ts`:

```ts
import { COUNTED_UNITS, ML_PER_UK_TBSP, ML_PER_UK_TSP, type CountedUnit, type UnitCode } from './codes.ts';
import type { CombinedQuantity } from './combined.ts';
import { TO_TASTE, UNIT_LABELS } from './labels.ts';
import type { Locale } from './locale.ts';
import { presentAmount, presentCount, presentMass, presentVolume, type CountRounding, type MeasurementSystem, type PresentedAmount } from './present.ts';
import type { Quantity } from './quantity.ts';

const DECIMAL_UNITS: ReadonlySet<UnitCode> = new Set<UnitCode>(['g', 'kg', 'ml', 'l']);
const FRACTIONS: Record<number, string> = { 25: '¼', 50: '½', 75: '¾' };

function formatNumber(value: number, unit: UnitCode, locale: Locale): string {
	// Counted and imperial units read better as "1½ spicchi" than as decimals.
	if (!DECIMAL_UNITS.has(unit)) {
		const whole = Math.floor(value + 1e-9);
		const rest = Math.round((value - whole) * 100);
		if (rest === 0) return String(whole);
		const fraction = FRACTIONS[rest];
		if (fraction) return `${whole || ''}${fraction}`;
	}
	return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function formatAmount({ value, unit }: PresentedAmount, locale: Locale): string {
	const [singular, plural] = UNIT_LABELS[locale][unit];
	const label = value <= 1 ? singular : plural;
	const number = formatNumber(value, unit, locale);
	return label ? `${number} ${label}` : number;
}

/** One recipe line, as in recipes, meal cards and item sources (halves kept). */
export function formatQuantity(q: Quantity, system: MeasurementSystem, locale: Locale): string {
	if (q.kind === 'to_taste') return TO_TASTE[locale];
	if (q.kind === 'text') return q.text[locale];
	return formatAmount(presentAmount(q.value, q.unit, system), locale);
}

export interface FormatOptions {
	system: MeasurementSystem;
	locale: Locale;
	rounding?: CountRounding;
}

/** A sum, converted and rounded only now: "50 g + 100 ml + 2 + q.b." (spec section 6). */
export function formatCombined(c: CombinedQuantity, { system, locale, rounding = 'recipe' }: FormatOptions): string {
	const parts: string[] = [];
	let merged: CountedUnit | null = null;
	if (c.mass_g !== null) parts.push(formatAmount(presentMass(c.mass_g, system), locale));
	if (c.volume_ml !== null) {
		const volume = presentVolume(c.volume_ml, system);
		const spoons = volume.unit === 'tbsp' || volume.unit === 'tsp' ? c.counts[volume.unit] : undefined;
		if (spoons !== undefined && (volume.unit === 'tbsp' || volume.unit === 'tsp')) {
			// "3 tbsp", not "2 tbsp + 1 tbsp": shown as one sum, still kept apart in the calculation.
			const perSpoon = volume.unit === 'tbsp' ? ML_PER_UK_TBSP : ML_PER_UK_TSP;
			parts.push(formatAmount(presentCount(c.volume_ml / perSpoon + spoons, volume.unit, rounding), locale));
			merged = volume.unit;
		} else parts.push(formatAmount(volume, locale));
	}
	for (const unit of COUNTED_UNITS) {
		const value = c.counts[unit];
		if (value !== undefined && unit !== merged) parts.push(formatAmount(presentCount(value, unit, rounding), locale));
	}
	parts.push(...c.texts.map((t) => t.text[locale]));
	if (c.to_taste) parts.push(TO_TASTE[locale]);
	return parts.join(' + ');
}
```

`domain/src/units/index.ts`:

```ts
export * from './codes.ts';
export * from './locale.ts';
export * from './quantity.ts';
export * from './scale.ts';
export * from './equivalence.ts';
export * from './combined.ts';
export * from './present.ts';
export * from './labels.ts';
export * from './format.ts';
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/units && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/units
git commit -m "Unità: etichette in italiano e inglese britannico e testo delle quantità

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reparti e chiave della varietà

**Files:**
- Create: `domain/src/shopping/departments.ts`, `domain/src/shopping/variety.ts`
- Test: `domain/src/shopping/departments.test.ts`, `domain/src/shopping/variety.test.ts`

**Interfaces:**
- Consumes: `LOCALES`, `Locale`, `plainWords` (`../units/locale.ts`).
- Produces: `DEPARTMENTS`, `Department`, `departmentSchema`,
  `DEPARTMENT_LABELS: Record<Locale, Record<Department, string>>`;
  `varietyKey(text: string | null | undefined): string`,
  `itemKey(ingredientId: string, varietyKey: string): string` (`"<id>~<varietyKey>"`).

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/shopping/departments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../units/locale.ts';
import { DEPARTMENTS, DEPARTMENT_LABELS, departmentSchema } from './departments.ts';

describe('departments', () => {
	it('keeps the standard shopping order (spec section 6)', () => {
		expect(DEPARTMENTS).toEqual(['produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other']);
	});
	it('labels every department in both languages', () => {
		for (const locale of LOCALES) for (const d of DEPARTMENTS) expect(DEPARTMENT_LABELS[locale][d]).not.toBe('');
		expect(DEPARTMENT_LABELS['it-IT'].produce).toBe('Frutta e verdura');
		expect(DEPARTMENT_LABELS['en-GB'].tinned).toBe('Tins and jars');
	});
	it('validates codes', () => {
		expect(departmentSchema.safeParse('fish').success).toBe(true);
		expect(departmentSchema.safeParse('pescheria').success).toBe(false);
	});
});
```

`domain/src/shopping/variety.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { itemKey, varietyKey } from './variety.ts';

describe('varietyKey', () => {
	it('ignores case, accents, punctuation, spaces and filler words', () => {
		expect(varietyKey('tipo Roma')).toBe('roma');
		expect(varietyKey('ROMA')).toBe('roma');
		expect(varietyKey('Gialla, senza semi!')).toBe('gialla senza semi');
		expect(varietyKey('Perìni')).toBe('perini');
		expect(varietyKey('  Varietà   San Marzano ')).toBe('san marzano');
	});
	it('is empty without a variety', () => {
		expect(varietyKey(null)).toBe('');
		expect(varietyKey(undefined)).toBe('');
		expect(varietyKey('')).toBe('');
		expect(varietyKey('tipo')).toBe('');
	});
});

describe('itemKey', () => {
	it('joins ingredient and variety', () => {
		expect(itemKey('tomato', 'roma')).toBe('tomato~roma');
		expect(itemKey('tomato', '')).toBe('tomato~');
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/shopping`
Expected: FAIL, moduli non trovati.

- [ ] **Step 3: Implementa**

`domain/src/shopping/departments.ts`:

```ts
import { z } from 'zod';
import type { Locale } from '../units/locale.ts';

/** Shop departments in the standard order of spec section 6; `ingredients.department` uses these codes. */
export const DEPARTMENTS = ['produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other'] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const departmentSchema = z.enum(DEPARTMENTS);

export const DEPARTMENT_LABELS: Record<Locale, Record<Department, string>> = {
	'it-IT': {
		produce: 'Frutta e verdura', butcher: 'Macelleria', fish: 'Pescheria', chilled: 'Banco frigo e latticini',
		bakery: 'Pane e prodotti da forno', pasta_grains: 'Pasta, riso e cereali', tinned: 'Scatolame e conserve',
		frozen: 'Surgelati', condiments: 'Condimenti e dispensa', other: 'Altro'
	},
	'en-GB': {
		produce: 'Fruit and veg', butcher: 'Butcher', fish: 'Fishmonger', chilled: 'Chilled and dairy',
		bakery: 'Bread and bakery', pasta_grains: 'Pasta, rice and grains', tinned: 'Tins and jars',
		frozen: 'Frozen', condiments: 'Condiments and store cupboard', other: 'Other'
	}
};
```

`domain/src/shopping/variety.ts`:

```ts
import { plainWords } from '../units/locale.ts';

/** Words that do not change the product: "tipo Roma" is "Roma". */
const FILLER = new Set(['tipo', 'varieta', 'var', 'qualita', 'type', 'variety']);

/**
 * Comparison key of a variety, from its Italian text (spec sections 2 and 6): the `variety_key` of
 * checks and of ingredients put back on the list. Empty without a variety.
 */
export function varietyKey(text: string | null | undefined): string {
	return plainWords(text ?? '').filter((word) => !FILLER.has(word)).join(' ');
}

/** Identity of a shopping list item: ingredient and variety. */
export const itemKey = (ingredientId: string, variety: string): string => `${ingredientId}~${variety}`;
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/shopping && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/shopping
git commit -m "Spesa: reparti e chiave normalizzata della varietà

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Consolidamento della lista

**Files:**
- Create: `domain/src/shopping/consolidate.ts`
- Test: `domain/src/shopping/consolidate.test.ts`

**Interfaces:**
- Consumes: `Quantity`, `Localized`, `UnitEquivalence`, `scaleQuantity`, `toPurchaseUnit` (con la preparazione della riga),
  `addQuantity`, `emptyCombined`, `CombinedQuantity` (units); `Department`, `varietyKey`, `itemKey`.
- Produces:
  - `ShoppingRecipeLine { ingredientId: string; variety: Localized | null; preparation: Localized | null; quantity: Quantity; isOptional: boolean }`
  - `ShoppingRecipe { id: string; name: Localized; baseServings: number | null; lines: readonly ShoppingRecipeLine[] }`
  - `MealType = 'lunch' | 'dinner'`
  - `ShoppingMeal { slotId: string; date: string; mealType: MealType; servings: number; recipe: ShoppingRecipe | null }`
  - `ShoppingIngredient { name: Localized; department: Department; isPantry: boolean }`
  - `ShoppingListInput { meals: readonly ShoppingMeal[]; ingredients: ReadonlyMap<string, ShoppingIngredient>; equivalences: readonly UnitEquivalence[]; avoided: ReadonlySet<string> }`
  - `ShoppingSource { slotId; date; mealType; recipeId: string; recipeName: Localized; quantity: Quantity }`
  - `Exclusion = 'avoid' | 'pantry'`
  - `ConsolidatedItem { key: string; ingredientId: string; varietyKey: string; name: Localized; variety: Localized | null; department: Department; combined: CombinedQuantity; isOptional: boolean; sources: ShoppingSource[]; excluded: Exclusion | null }`
  - `SkippedMeal { slotId: string; recipeId: string; recipeName: Localized }`
  - `ConsolidatedList { mealCount: number; items: ConsolidatedItem[]; skipped: SkippedMeal[] }`
  - `consolidateShoppingList(input: ShoppingListInput): ConsolidatedList` (lancia un errore per
    equivalenze ambigue o ingredienti assenti dal catalogo)

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/shopping/consolidate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UnitCode } from '../units/codes.ts';
import type { UnitEquivalence } from '../units/equivalence.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import {
	consolidateShoppingList, type ConsolidatedList, type MealType, type ShoppingIngredient, type ShoppingListInput,
	type ShoppingMeal, type ShoppingRecipe, type ShoppingRecipeLine
} from './consolidate.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['lemon', { name: t('Limone', 'Lemon'), department: 'produce', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }],
	['oil', { name: t('Olio', 'Oil'), department: 'condiments', isPantry: true }],
	['anchovy', { name: t('Acciughe', 'Anchovies'), department: 'tinned', isPantry: true }]
]);
const lemonJuice: UnitEquivalence = {
	ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo',
	source: 'USDA FoodData Central: juice of 1 lemon = 47 g'
};
const juice = t('succo', 'juice');
const line = (ingredientId: string, quantity: Quantity, extra: Partial<ShoppingRecipeLine> = {}): ShoppingRecipeLine => ({
	ingredientId, variety: null, preparation: null, quantity, isOptional: false, ...extra
});
const recipe = (id: string, lines: ShoppingRecipeLine[], baseServings: number | null = 2): ShoppingRecipe => ({
	id, name: t(`Ricetta ${id}`, `Recipe ${id}`), baseServings, lines
});
const meal = (slotId: string, date: string, mealType: MealType, servings: number, r: ShoppingRecipe | null): ShoppingMeal => ({
	slotId, date, mealType, servings, recipe: r
});
const input = (meals: ShoppingMeal[], extra: Partial<ShoppingListInput> = {}): ShoppingListInput => ({
	meals, ingredients, equivalences: [lemonJuice], avoided: new Set(), ...extra
});
const item = (list: ConsolidatedList, key: string) => {
	const found = list.items.find((i) => i.key === key);
	if (!found) throw new Error(`No item ${key}`);
	return found;
};

describe('consolidateShoppingList', () => {
	it('scales each line and sums the same ingredient across meals', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 4, recipe('a', [line('tomato', amount(200, 'g'))])),
			meal('s2', '2026-10-12', 'dinner', 2, recipe('b', [line('tomato', amount(0.1, 'kg'))]))
		]));
		expect(list.mealCount).toBe(2);
		expect(item(list, 'tomato~').combined.mass_g).toBe(500);
		expect(item(list, 'tomato~').sources.map((s) => s.quantity)).toEqual([amount(400, 'g'), amount(0.1, 'kg')]);
	});

	it('keeps varieties apart, sums spellings of the same one and shows the most used spelling', () => {
		const roma = t('Roma', 'Roma');
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('tomato', amount(100, 'g'), { variety: roma }), line('tomato', amount(200, 'g'))])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('tomato', amount(50, 'g'), { variety: t('tipo Roma', 'Roma type') })])),
			meal('s3', '2026-10-14', 'lunch', 2, recipe('c', [line('tomato', amount(100, 'g'), { variety: roma })]))
		]));
		expect(item(list, 'tomato~roma').combined.mass_g).toBe(250);
		expect(item(list, 'tomato~roma').variety).toEqual(roma);
		expect(item(list, 'tomato~roma').varietyKey).toBe('roma');
		expect(item(list, 'tomato~').combined.mass_g).toBe(200);
		expect(item(list, 'tomato~').variety).toBeNull();
	});

	it('excludes avoided ingredients in every variety, then pantry ones', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [
				line('tomato', amount(100, 'g'), { variety: t('Roma', 'Roma') }),
				line('tomato', amount(100, 'g')),
				line('anchovy', amount(20, 'g')),
				line('oil', { kind: 'to_taste' }),
				line('parsley', amount(1, 'bunch'))
			]))
		], { avoided: new Set(['tomato', 'anchovy']) }));
		expect(item(list, 'tomato~roma').excluded).toBe('avoid');
		expect(item(list, 'tomato~').excluded).toBe('avoid');
		expect(item(list, 'anchovy~').excluded).toBe('avoid');
		expect(item(list, 'oil~').excluded).toBe('pantry');
		expect(item(list, 'parsley~').excluded).toBeNull();
	});

	it('marks an item optional only when every line is optional', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('parsley', amount(1, 'bunch'), { isOptional: true }), line('lemon', amount(1, 'piece'), { isOptional: true })])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('parsley', amount(1, 'bunch'))]))
		]));
		expect(item(list, 'parsley~').isOptional).toBe(false);
		expect(item(list, 'lemon~').isOptional).toBe(true);
	});

	it('buys lemon juice as lemons and keeps zest in its units on the same item', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [
				line('lemon', amount(50, 'g'), { preparation: juice }),
				line('lemon', amount(1, 'tsp'), { preparation: t('scorza grattugiata', 'grated zest') }),
				line('lemon', amount(5, 'g'), { preparation: t('scorza', 'zest') })
			])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('lemon', amount(1, 'piece'))]))
		]));
		const lemon = item(list, 'lemon~');
		expect(lemon.combined.mass_g).toBe(5);
		expect(lemon.combined.counts.piece).toBeCloseTo(1 + 50 / 47, 12);
		expect(lemon.combined.counts.tsp).toBe(1);
		expect(lemon.sources[0].quantity).toEqual(amount(50, 'g'));
	});

	it('prefers the equivalence of the line preparation over the generic one', () => {
		// Synthetic factor: a generic per-weight rule for the whole lemon.
		const wholeLemon: UnitEquivalence = { ...lemonJuice, factor: 1 / 120, preparation: null, source: 'synthetic' };
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('lemon', amount(94, 'g'), { preparation: t('Succo', 'Juice') }), line('lemon', amount(60, 'g'))]))
		], { equivalences: [wholeLemon, lemonJuice] }));
		expect(item(list, 'lemon~').combined.counts.piece).toBeCloseTo(2 + 0.5, 12);
		expect(item(list, 'lemon~').combined.mass_g).toBeNull();
	});

	it('collects translations of text quantities and notes to taste', () => {
		const bunch: Quantity = { kind: 'text', text: t('1 mazzetto abbondante', '1 large bunch') };
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('parsley', bunch), line('oil', { kind: 'to_taste' })]))
		]));
		expect(item(list, 'parsley~').combined.texts).toEqual([{ key: '1 mazzetto abbondante', text: t('1 mazzetto abbondante', '1 large bunch') }]);
		expect(item(list, 'oil~').combined.to_taste).toBe(true);
	});

	it('ignores meals without a recipe and reports recipes without data', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, null),
			meal('s2', '2026-10-12', 'dinner', 2, recipe('a', [line('tomato', amount(100, 'g'))], null)),
			meal('s3', '2026-10-13', 'lunch', 2, recipe('b', [])),
			meal('s4', '2026-10-13', 'dinner', 2, recipe('c', [line('tomato', amount(100, 'g'))]))
		]));
		expect(list.mealCount).toBe(1);
		expect(list.skipped).toEqual([
			{ slotId: 's2', recipeId: 'a', recipeName: t('Ricetta a', 'Recipe a') },
			{ slotId: 's3', recipeId: 'b', recipeName: t('Ricetta b', 'Recipe b') }
		]);
	});

	it('returns an empty list for a week of free meals', () => {
		const list = consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, null), meal('s2', '2026-10-12', 'dinner', 2, null)]));
		expect(list).toEqual({ mealCount: 0, items: [], skipped: [] });
	});

	it('orders sources by date and meal', () => {
		const list = consolidateShoppingList(input([
			meal('dinner', '2026-10-12', 'dinner', 2, recipe('a', [line('tomato', amount(100, 'g'))])),
			meal('next', '2026-10-13', 'lunch', 2, recipe('b', [line('tomato', amount(100, 'g'))])),
			meal('lunch', '2026-10-12', 'lunch', 2, recipe('c', [line('tomato', amount(100, 'g'))]))
		]));
		expect(item(list, 'tomato~').sources.map((s) => s.slotId)).toEqual(['lunch', 'dinner', 'next']);
	});

	it('refuses ambiguous shopping equivalences before computing', () => {
		const perKilo: UnitEquivalence = { ...lemonJuice, fromUnit: 'kg', factor: 1000 / 47 };
		expect(() => consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, null)], { equivalences: [lemonJuice, perKilo] }))).toThrow(/Ambiguous/);
	});

	it('fails on an ingredient missing from the catalogue', () => {
		expect(() => consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('ghost', amount(1, 'piece'))]))]))).toThrow(/ghost/);
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/shopping/consolidate.test.ts`
Expected: FAIL, `./consolidate.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/shopping/consolidate.ts`:

```ts
import { addQuantity, emptyCombined, type CombinedQuantity } from '../units/combined.ts';
import { assertUnambiguousEquivalences, toPurchaseUnit, type UnitEquivalence } from '../units/equivalence.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import { scaleQuantity } from '../units/scale.ts';
import type { Department } from './departments.ts';
import { itemKey, varietyKey } from './variety.ts';

/** What the list needs from a recipe line (structurally compatible with the recipe document). */
export interface ShoppingRecipeLine {
	ingredientId: string;
	variety: Localized | null;
	/** Does not change the item; chooses the shopping equivalence (lemon juice, not zest). */
	preparation: Localized | null;
	quantity: Quantity;
	isOptional: boolean;
}

/** The recipe version in force for the meal (review R1), chosen by the caller. */
export interface ShoppingRecipe {
	id: string;
	name: Localized;
	baseServings: number | null;
	lines: readonly ShoppingRecipeLine[];
}

export type MealType = 'lunch' | 'dinner';

export interface ShoppingMeal {
	slotId: string;
	date: string;
	mealType: MealType;
	servings: number;
	/** null for free and empty meals. */
	recipe: ShoppingRecipe | null;
}

export interface ShoppingIngredient {
	name: Localized;
	department: Department;
	isPantry: boolean;
}

export interface ShoppingListInput {
	meals: readonly ShoppingMeal[];
	ingredients: ReadonlyMap<string, ShoppingIngredient>;
	/** Shopping-scope equivalences (how ingredients are bought). */
	equivalences: readonly UnitEquivalence[];
	/** Ingredients the family avoids: every variety leaves the list. */
	avoided: ReadonlySet<string>;
}

export interface ShoppingSource {
	slotId: string;
	date: string;
	mealType: MealType;
	recipeId: string;
	recipeName: Localized;
	/** Scaled line, in the recipe's unit (not converted to the purchase unit). */
	quantity: Quantity;
}

export type Exclusion = 'avoid' | 'pantry';

export interface ConsolidatedItem {
	key: string;
	ingredientId: string;
	varietyKey: string;
	name: Localized;
	variety: Localized | null;
	department: Department;
	combined: CombinedQuantity;
	isOptional: boolean;
	sources: ShoppingSource[];
	excluded: Exclusion | null;
}

export interface SkippedMeal {
	slotId: string;
	recipeId: string;
	recipeName: Localized;
}

export interface ConsolidatedList {
	mealCount: number;
	items: ConsolidatedItem[];
	skipped: SkippedMeal[];
}

interface Entry {
	ingredientId: string;
	varietyKey: string;
	combined: CombinedQuantity;
	isOptional: boolean;
	spellings: Map<string, { variety: Localized; uses: number }>;
	sources: ShoppingSource[];
}

const MEAL_ORDER: Record<MealType, number> = { lunch: 0, dinner: 1 };

/** The most used spelling among the list's lines; the first one met wins a tie. */
function mostUsed(spellings: Entry['spellings']): Localized | null {
	let best: { variety: Localized; uses: number } | null = null;
	for (const spelling of spellings.values()) if (!best || spelling.uses > best.uses) best = spelling;
	return best?.variety ?? null;
}

/** Steps 1-6 of the shopping list generation (spec section 6); presentation is in arrange.ts. */
export function consolidateShoppingList(input: ShoppingListInput): ConsolidatedList {
	assertUnambiguousEquivalences(input.equivalences);
	const meals = [...input.meals].sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType]);
	const entries = new Map<string, Entry>();
	const skipped: SkippedMeal[] = [];
	let mealCount = 0;

	for (const meal of meals) {
		const recipe = meal.recipe;
		if (!recipe) continue;
		if (!recipe.baseServings || recipe.lines.length === 0) {
			skipped.push({ slotId: meal.slotId, recipeId: recipe.id, recipeName: recipe.name });
			continue;
		}
		mealCount++;
		for (const line of recipe.lines) {
			if (!input.ingredients.has(line.ingredientId)) throw new Error(`Unknown ingredient ${line.ingredientId}`);
			const variety = varietyKey(line.variety?.['it-IT']);
			const key = itemKey(line.ingredientId, variety);
			const entry: Entry = entries.get(key) ?? {
				ingredientId: line.ingredientId, varietyKey: variety, combined: emptyCombined(),
				isOptional: true, spellings: new Map(), sources: []
			};
			const scaled = scaleQuantity(line.quantity, meal.servings, recipe.baseServings);
			const equivalences = input.equivalences.filter((e) => e.ingredientId === line.ingredientId);
			entry.combined = addQuantity(entry.combined, toPurchaseUnit(scaled, equivalences, line.preparation?.['it-IT']));
			entry.isOptional &&= line.isOptional;
			if (variety && line.variety) {
				const spelling = JSON.stringify([line.variety['it-IT'], line.variety['en-GB']]);
				const found = entry.spellings.get(spelling) ?? { variety: line.variety, uses: 0 };
				found.uses++;
				entry.spellings.set(spelling, found);
			}
			entry.sources.push({ slotId: meal.slotId, date: meal.date, mealType: meal.mealType, recipeId: recipe.id, recipeName: recipe.name, quantity: scaled });
			entries.set(key, entry);
		}
	}

	const items = [...entries.entries()].map(([key, entry]): ConsolidatedItem => {
		const ingredient = input.ingredients.get(entry.ingredientId)!;
		return {
			key,
			ingredientId: entry.ingredientId,
			varietyKey: entry.varietyKey,
			name: ingredient.name,
			variety: mostUsed(entry.spellings),
			department: ingredient.department,
			combined: entry.combined,
			isOptional: entry.isOptional,
			sources: entry.sources,
			excluded: input.avoided.has(entry.ingredientId) ? 'avoid' : ingredient.isPantry ? 'pantry' : null
		};
	});
	return { mealCount, items, skipped };
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/shopping && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/shopping
git commit -m "Spesa: consolidamento della lista per ingrediente e varietà

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Stato e presentazione della lista

**Files:**
- Create: `domain/src/shopping/arrange.ts`
- Test: `domain/src/shopping/arrange.test.ts`

**Interfaces:**
- Consumes: `ConsolidatedList`, `ConsolidatedItem`, `Exclusion`, `MealType`, `consolidateShoppingList`
  (Task 7); `DEPARTMENTS`, `Department`, `itemKey`; `CombinedQuantity`, `exceeds`,
  `formatCombined`, `formatQuantity`, `MeasurementSystem`, `Locale`, `Localized`.
- Produces:
  - `ShoppingCheck { ingredientId: string; varietyKey: string; quantityAtCheck: CombinedQuantity }`
  - `ShoppingItemRef { ingredientId: string; varietyKey: string }`
  - `ArrangeOptions { checks: readonly ShoppingCheck[]; addedBack: readonly ShoppingItemRef[]; system: MeasurementSystem; locale: Locale }`
  - `ShoppingSourceView { slotId; date; mealType; recipeName: string; quantity: string }`
  - `ShoppingItemView { key; ingredientId; varietyKey; department: Department; name: string; quantity: string; combined: CombinedQuantity; isOptional: boolean; excluded: Exclusion | null; checked: boolean; previousQuantity: string | null; sources: ShoppingSourceView[] }`
    (`combined` è la quantità canonica che il client invia con la spunta come `quantity_at_check`)
  - `ArrangedShoppingList { locale: Locale; mealCount: number; departments: { department: Department; items: ShoppingItemView[] }[]; excluded: ShoppingItemView[]; skipped: { slotId: string; recipeId: string; recipeName: string }[] }`
  - `displayName(name: Localized, variety: Localized | null, locale: Locale): string`
  - `arrangeShoppingList(list: ConsolidatedList, options: ArrangeOptions): ArrangedShoppingList`

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/shopping/arrange.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UnitCode } from '../units/codes.ts';
import { addQuantity, emptyCombined, type CombinedQuantity } from '../units/combined.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import { arrangeShoppingList, displayName, type ArrangeOptions, type ArrangedShoppingList } from './arrange.ts';
import { consolidateShoppingList, type ShoppingIngredient, type ShoppingRecipeLine } from './consolidate.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['pepper', { name: t('Peperone', 'Pepper'), department: 'produce', isPantry: false }],
	['lemon', { name: t('Limone', 'Lemon'), department: 'produce', isPantry: false }],
	['oil', { name: t('Olio', 'Oil'), department: 'condiments', isPantry: true }],
	['anchovy', { name: t('Acciughe', 'Anchovies'), department: 'tinned', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }]
]);
const line = (ingredientId: string, quantity: Quantity, variety: Localized | null = null, preparation: Localized | null = null): ShoppingRecipeLine => ({
	ingredientId, variety, preparation, quantity, isOptional: false
});
const list = consolidateShoppingList({
	meals: [
		{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
			line('tomato', amount(200, 'g'), t('Roma', 'Roma')), line('pepper', amount(0.5, 'piece')), line('oil', { kind: 'to_taste' }), line('anchovy', amount(20, 'g'))
		] } },
		{ slotId: 's2', date: '2026-10-12', mealType: 'dinner', servings: 2, recipe: { id: 'b', name: t('Ricetta b', 'Recipe b'), baseServings: 2, lines: [
			line('lemon', amount(50, 'g'), null, t('succo', 'juice')), line('tomato', amount(100, 'g'))
		] } },
		{ slotId: 's3', date: '2026-10-13', mealType: 'lunch', servings: 2, recipe: { id: 'c', name: t('Ricetta c', 'Recipe c'), baseServings: null, lines: [] } }
	],
	ingredients,
	equivalences: [{ ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo', source: 'USDA FoodData Central' }],
	avoided: new Set(['anchovy'])
});
const arrange = (options: Partial<ArrangeOptions> = {}) =>
	arrangeShoppingList(list, { checks: [], addedBack: [], system: 'metric', locale: 'it-IT', ...options });
const view = (arranged: ArrangedShoppingList, key: string) => {
	const found = [...arranged.departments.flatMap((d) => d.items), ...arranged.excluded].find((i) => i.key === key);
	if (!found) throw new Error(`No item ${key}`);
	return found;
};

describe('arrangeShoppingList', () => {
	it('groups by department in the standard order and sorts by name', () => {
		const arranged = arrange();
		expect(arranged.departments.map((d) => d.department)).toEqual(['produce']);
		expect(arranged.departments[0].items.map((i) => i.name)).toEqual(['Limone', 'Peperone', 'Pomodori', 'Pomodori Roma']);
		expect(arranged.excluded.map((i) => [i.name, i.excluded])).toEqual([['Acciughe', 'avoid'], ['Olio', 'pantry']]);
		expect(arranged.mealCount).toBe(2);
	});

	it('shows quantities to buy and sources in recipe units', () => {
		const arranged = arrange();
		expect(view(arranged, 'pepper~').quantity).toBe('1');
		expect(view(arranged, 'pepper~').sources).toEqual([{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', recipeName: 'Ricetta a', quantity: '½' }]);
		expect(view(arranged, 'lemon~').quantity).toBe('1');
		expect(view(arranged, 'lemon~').sources[0].quantity).toBe('50 g');
		expect(view(arranged, 'tomato~roma').quantity).toBe('200 g');
	});

	it('exposes the canonical quantity the client sends when ticking', () => {
		expect(view(arrange(), 'tomato~roma').combined).toEqual(combine(amount(200, 'g')));
		expect(view(arrange(), 'pepper~').combined).toEqual(combine(amount(0.5, 'piece')));
	});

	it('keeps an item ticked unless its quantity grew, and ignores ticks of items gone', () => {
		const arranged = arrange({ checks: [
			{ ingredientId: 'tomato', varietyKey: 'roma', quantityAtCheck: combine(amount(200, 'g')) },
			{ ingredientId: 'tomato', varietyKey: '', quantityAtCheck: combine(amount(50, 'g')) },
			{ ingredientId: 'pepper', varietyKey: '', quantityAtCheck: combine(amount(2, 'piece')) },
			{ ingredientId: 'ghost', varietyKey: '', quantityAtCheck: combine(amount(1, 'piece')) }
		] });
		expect(view(arranged, 'tomato~roma')).toMatchObject({ checked: true, previousQuantity: null });
		expect(view(arranged, 'tomato~')).toMatchObject({ checked: false, previousQuantity: '50 g' });
		expect(view(arranged, 'pepper~')).toMatchObject({ checked: true, previousQuantity: null });
		expect(view(arranged, 'lemon~').checked).toBe(false);
	});

	it('keeps a ticked item ticked when the family changes measurement system', () => {
		const checks = [{ ingredientId: 'tomato', varietyKey: 'roma', quantityAtCheck: combine(amount(200, 'g')) }];
		const arranged = arrange({ checks, system: 'uk_imperial', locale: 'en-GB' });
		expect(view(arranged, 'tomato~roma')).toMatchObject({ checked: true, quantity: '7 oz', name: 'Tomatoes Roma' });
	});

	it('shows the ticked quantity in the viewer language even after its text was replaced', () => {
		const changed = consolidateShoppingList({
			meals: [{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
				line('parsley', { kind: 'text', text: t('2 mazzetti abbondanti', '2 large bunches') })
			] } }],
			ingredients,
			equivalences: [],
			avoided: new Set()
		});
		const checks = [{ ingredientId: 'parsley', varietyKey: '', quantityAtCheck: combine({ kind: 'text', text: t('1 mazzetto abbondante', '1 large bunch') }) }];
		const english = arrangeShoppingList(changed, { checks, addedBack: [], system: 'metric', locale: 'en-GB' });
		expect(view(english, 'parsley~')).toMatchObject({ checked: false, quantity: '2 large bunches', previousQuantity: '1 large bunch' });
		const italian = arrangeShoppingList(changed, { checks, addedBack: [], system: 'metric', locale: 'it-IT' });
		expect(view(italian, 'parsley~')).toMatchObject({ quantity: '2 mazzetti abbondanti', previousQuantity: '1 mazzetto abbondante' });
	});

	it('puts excluded items back in their department when added back', () => {
		const arranged = arrange({ addedBack: [{ ingredientId: 'oil', varietyKey: '' }] });
		expect(arranged.departments.map((d) => d.department)).toEqual(['produce', 'condiments']);
		expect(view(arranged, 'oil~')).toMatchObject({ quantity: 'q.b.', excluded: 'pantry' });
		expect(arranged.excluded.map((i) => i.name)).toEqual(['Acciughe']);
	});

	it('names skipped recipes in the viewer language', () => {
		expect(arrange({ locale: 'en-GB' }).skipped).toEqual([{ slotId: 's3', recipeId: 'c', recipeName: 'Recipe c' }]);
	});
});

describe('displayName', () => {
	it('appends the variety in the viewer language', () => {
		expect(displayName(t('Uva', 'Grapes'), t('gialla senza semi', 'seedless white'), 'en-GB')).toBe('Grapes seedless white');
		expect(displayName(t('Uva', 'Grapes'), null, 'it-IT')).toBe('Uva');
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/shopping/arrange.test.ts`
Expected: FAIL, `./arrange.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/shopping/arrange.ts`:

```ts
import { exceeds, type CombinedQuantity } from '../units/combined.ts';
import { formatCombined, formatQuantity } from '../units/format.ts';
import type { Locale, Localized } from '../units/locale.ts';
import type { MeasurementSystem } from '../units/present.ts';
import type { ConsolidatedItem, ConsolidatedList, Exclusion, MealType } from './consolidate.ts';
import { DEPARTMENTS, type Department } from './departments.ts';
import { itemKey } from './variety.ts';

/** A row of `shopping_list_checks`. */
export interface ShoppingCheck {
	ingredientId: string;
	varietyKey: string;
	quantityAtCheck: CombinedQuantity;
}

/** A row of `shopping_list_added_back`. */
export interface ShoppingItemRef {
	ingredientId: string;
	varietyKey: string;
}

export interface ArrangeOptions {
	checks: readonly ShoppingCheck[];
	addedBack: readonly ShoppingItemRef[];
	system: MeasurementSystem;
	locale: Locale;
}

export interface ShoppingSourceView {
	slotId: string;
	date: string;
	mealType: MealType;
	recipeName: string;
	quantity: string;
}

export interface ShoppingItemView {
	key: string;
	ingredientId: string;
	varietyKey: string;
	department: Department;
	name: string;
	quantity: string;
	/** Canonical sum shown now: the client keeps it and sends it as `quantity_at_check` when ticking. */
	combined: CombinedQuantity;
	isOptional: boolean;
	excluded: Exclusion | null;
	checked: boolean;
	/** The ticked quantity, when the item grew since and needs ticking again ("prima: 200 g"). */
	previousQuantity: string | null;
	sources: ShoppingSourceView[];
}

export interface ArrangedShoppingList {
	locale: Locale;
	mealCount: number;
	departments: { department: Department; items: ShoppingItemView[] }[];
	/** "Non in lista": pantry and avoided items not put back. */
	excluded: ShoppingItemView[];
	skipped: { slotId: string; recipeId: string; recipeName: string }[];
}

/** "Pomodori Roma", "Uva gialla senza semi". */
export const displayName = (name: Localized, variety: Localized | null, locale: Locale): string =>
	variety ? `${name[locale]} ${variety[locale]}` : name[locale];

function toView(item: ConsolidatedItem, checked: CombinedQuantity | undefined, system: MeasurementSystem, locale: Locale): ShoppingItemView {
	const options = { system, locale, rounding: 'shopping' as const };
	const grew = checked !== undefined && exceeds(item.combined, checked);
	return {
		key: item.key,
		ingredientId: item.ingredientId,
		varietyKey: item.varietyKey,
		department: item.department,
		name: displayName(item.name, item.variety, locale),
		quantity: formatCombined(item.combined, options),
		combined: item.combined,
		isOptional: item.isOptional,
		excluded: item.excluded,
		checked: checked !== undefined && !grew,
		previousQuantity: grew ? formatCombined(checked, options) : null,
		sources: item.sources.map((s) => ({
			slotId: s.slotId,
			date: s.date,
			mealType: s.mealType,
			recipeName: s.recipeName[locale],
			quantity: formatQuantity(s.quantity, system, locale)
		}))
	};
}

/** Steps 7-8 of spec section 6: ticks, items put back, departments, family units and viewer language. */
export function arrangeShoppingList(list: ConsolidatedList, { checks, addedBack, system, locale }: ArrangeOptions): ArrangedShoppingList {
	const ticked = new Map(checks.map((c) => [itemKey(c.ingredientId, c.varietyKey), c.quantityAtCheck]));
	const putBack = new Set(addedBack.map((a) => itemKey(a.ingredientId, a.varietyKey)));
	const byName = (a: ShoppingItemView, b: ShoppingItemView) => a.name.localeCompare(b.name, locale);
	const views = list.items.map((item) => toView(item, ticked.get(item.key), system, locale));
	const kept = views.filter((v) => v.excluded === null || putBack.has(v.key));
	return {
		locale,
		mealCount: list.mealCount,
		departments: DEPARTMENTS.map((department) => ({ department, items: kept.filter((v) => v.department === department).sort(byName) })).filter(
			(d) => d.items.length > 0
		),
		excluded: views.filter((v) => v.excluded !== null && !putBack.has(v.key)).sort(byName),
		skipped: list.skipped.map((s) => ({ slotId: s.slotId, recipeId: s.recipeId, recipeName: s.recipeName[locale] }))
	};
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/shopping && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/shopping
git commit -m "Spesa: spunte, voci rimesse in lista e presentazione per reparto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Esportazioni, indice del modulo e verifica finale

**Files:**
- Create: `domain/src/shopping/export.ts`, `domain/src/shopping/index.ts`
- Test: `domain/src/shopping/export.test.ts`

**Interfaces:**
- Consumes: `ArrangedShoppingList`, `ShoppingItemView`, `arrangeShoppingList`, `consolidateShoppingList`,
  `DEPARTMENT_LABELS`, `Department`, `Locale`.
- Produces: `ExportManualItem { text: string; checked: boolean }`,
  `ShoppingExport { text: string; lines: string[] }`,
  `shoppingExport(list: ArrangedShoppingList, manualItems?: readonly ExportManualItem[]): ShoppingExport`;
  `shopping/index.ts` riesporta tutto.

- [ ] **Step 1: Scrivi i test che falliscono**

`domain/src/shopping/export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined } from '../units/combined.ts';
import type { Localized } from '../units/locale.ts';
import { arrangeShoppingList } from './arrange.ts';
import { consolidateShoppingList, type ShoppingIngredient } from './consolidate.ts';
import { shoppingExport } from './export.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }],
	['pepper', { name: t('Peperone', 'Pepper'), department: 'produce', isPantry: false }]
]);
const consolidated = consolidateShoppingList({
	meals: [{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
		{ ingredientId: 'tomato', variety: null, preparation: null, quantity: { kind: 'amount', value: 200, unit: 'g' }, isOptional: false },
		{ ingredientId: 'parsley', variety: null, preparation: null, quantity: { kind: 'amount', value: 1, unit: 'bunch' }, isOptional: true },
		{ ingredientId: 'pepper', variety: null, preparation: null, quantity: { kind: 'amount', value: 1, unit: 'piece' }, isOptional: false }
	] } }],
	ingredients,
	equivalences: [],
	avoided: new Set()
});
const pepperTicked = addQuantity(emptyCombined(), { kind: 'amount', value: 1, unit: 'piece' });

describe('shoppingExport', () => {
	it('leaves ticked items out and puts unticked free items under "Altro"', () => {
		const arranged = arrangeShoppingList(consolidated, {
			checks: [{ ingredientId: 'pepper', varietyKey: '', quantityAtCheck: pepperTicked }], addedBack: [], system: 'metric', locale: 'it-IT'
		});
		const result = shoppingExport(arranged, [{ text: 'Detersivo per i piatti', checked: false }, { text: 'Sale grosso', checked: true }]);
		expect(result.text).toBe(
			'Lista della spesa · 1 pasto\n\nFrutta e verdura\n• 200 g Pomodori\n• 1 mazzetto Prezzemolo (facoltativo)\n\nAltro\n• Detersivo per i piatti'
		);
		expect(result.lines).toEqual(['200 g Pomodori', '1 mazzetto Prezzemolo (facoltativo)', 'Detersivo per i piatti']);
	});

	it('writes in the language of whoever exports', () => {
		const arranged = arrangeShoppingList({ ...consolidated, mealCount: 2 }, { checks: [], addedBack: [], system: 'metric', locale: 'en-GB' });
		const result = shoppingExport(arranged);
		expect(result.text.split('\n')[0]).toBe('Shopping list · 2 meals');
		expect(result.lines).toEqual(['1 bunch Parsley (optional)', '1 Pepper', '200 g Tomatoes']);
	});
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run domain/src/shopping/export.test.ts`
Expected: FAIL, `./export.ts` non trovato.

- [ ] **Step 3: Implementa**

`domain/src/shopping/export.ts`:

```ts
import type { Locale } from '../units/locale.ts';
import type { ArrangedShoppingList, ShoppingItemView } from './arrange.ts';
import { DEPARTMENT_LABELS, type Department } from './departments.ts';

export interface ExportManualItem {
	text: string;
	checked: boolean;
}

export interface ShoppingExport {
	/** Plain text for sharing (Web Share, MCP). */
	text: string;
	/** "quantity name" lines for Bring! and the PDF. */
	lines: string[];
}

const OPTIONAL: Record<Locale, string> = { 'it-IT': 'facoltativo', 'en-GB': 'optional' };
const TITLE: Record<Locale, (count: number) => string> = {
	'it-IT': (count) => `Lista della spesa · ${count} ${count === 1 ? 'pasto' : 'pasti'}`,
	'en-GB': (count) => `Shopping list · ${count} ${count === 1 ? 'meal' : 'meals'}`
};

/** What exports contain (spec section 6): ticked items left out, free items included under "Altro". */
export function shoppingExport(list: ArrangedShoppingList, manualItems: readonly ExportManualItem[] = []): ShoppingExport {
	const { locale } = list;
	const line = (item: ShoppingItemView) => `${item.quantity} ${item.name}${item.isOptional ? ` (${OPTIONAL[locale]})` : ''}`;
	const groups: { department: Department; lines: string[] }[] = list.departments.map((d) => ({
		department: d.department,
		lines: d.items.filter((item) => !item.checked).map(line)
	}));
	const manual = manualItems.filter((m) => !m.checked).map((m) => m.text);
	if (manual.length > 0) {
		const other = groups.find((g) => g.department === 'other');
		if (other) other.lines.push(...manual);
		else groups.push({ department: 'other', lines: manual });
	}
	const filled = groups.filter((g) => g.lines.length > 0);
	const sections = filled.map((g) => [DEPARTMENT_LABELS[locale][g.department], ...g.lines.map((l) => `• ${l}`)].join('\n'));
	return { text: [TITLE[locale](list.mealCount), ...sections].join('\n\n'), lines: filled.flatMap((g) => g.lines) };
}
```

`domain/src/shopping/index.ts`:

```ts
export * from './departments.ts';
export * from './variety.ts';
export * from './consolidate.ts';
export * from './arrange.ts';
export * from './export.ts';
```

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run domain/src/shopping && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Verifica completa** (skill `superpowers:verification-before-completion`)

Run: `npm test && npm run typecheck` (o gli script equivalenti dello scheletro di W1).
Expected: tutti i test passano (pianificatore, unità, spesa), nessun errore di tipo.
Controlla anche che `domain/src/units` e `domain/src/shopping` non importino nulla fuori da
`domain/` e da `zod`:

```bash
grep -rhn "^import" domain/src/units domain/src/shopping | grep -v "from '\./\|from '\.\./units/\|from 'zod'\|from 'vitest'"
```

Expected: nessuna riga.

- [ ] **Step 6: Commit**

```bash
git add domain/src/shopping
git commit -m "Spesa: testo delle esportazioni e indice del modulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
