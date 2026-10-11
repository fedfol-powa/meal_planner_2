# Ricetta e import: piano di implementazione

> **Per gli agenti:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, un compito alla volta. I passi
> usano le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** schema del documento ricetta con controlli e proiezioni in
`domain/src/recipe/`, e import rilanciabile del ricettario d'origine in `scripts/import/`
con pacchetto validato, report delle ambiguità e pagina di revisione.

**Architettura:** uno schema zod strutturale per bozza e pubblicazione, costruito sopra
i tipi di W4, più funzioni pure che restituiscono esiti a codici con il percorso del
campo; proiezioni pure verso le colonne del catalogo e verso il pianificatore. L'import
è una catena di funzioni pure (lettura dei YAML, quantità, ricette, dati della famiglia,
pacchetto, report, pagina) con un comando sottile che legge e scrive file. Ogni
impedimento dell'import vive nel documento della bozza, così sopravvive al salvataggio.

**Tecnologie:** TypeScript (Node 26 esegue i `.ts` direttamente), zod 4, `yaml`, vitest,
`node:crypto` solo negli script.

**Spec:** `progetto/superpowers/specs/2026-10-11-ricetta-import.md` (da leggere prima di
ogni compito), subordinata a `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`.
Revisione di spec e piano: `progetto/coordinamento/revisioni/w3-spec-piano.md` nella radice
del repository, decisioni in `progetto/coordinamento/messaggi/w3-01-review.md` e
`w3-02-tried.md`.

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti, report e pagina di
  revisione in italiano (`AGENTS.md`).
- `domain/` resta TypeScript puro: niente Node, niente DOM, niente I/O; typecheck con
  `domain/tsconfig.json` (`lib: ["ES2024"]`, `types: []`): niente tipo globale `URL`.
- Ingredienti solo dalle righe della fonte, mai dedotti dal nome del piatto; nessuna
  corrispondenza approssimata dei nomi di riga.
- `../meal_planner` in sola lettura.
- Tipi di W4, importati e mai ridefiniti: `LOCALES`, `Locale`, `Translated`,
  `translatedTextSchema`, `UNIT_CODES`, `UnitCode`, `unitCodeSchema`, `Quantity`,
  `quantitySchema`, `publishableQuantitySchema`, `UnitEquivalence`,
  `unitEquivalenceSchema`, `preparationKey`, `findEquivalence`,
  `assertUnambiguousEquivalences`, `applyRecipeEquivalence` (`domain/src/units/`);
  `varietyKey`, `DEPARTMENTS` (`domain/src/shopping/`). W3 possiede solo le varianti di
  bozza.
- Unica dipendenza: `zod` nel `package.json` di `domain/` (autorizzata; W4 potrebbe
  averla già aggiunta). Non toccare il `package.json` della radice (W1).
- Il pianificatore (`domain/src/planner/`) e `npm run planner-report` non cambiano
  comportamento.
- Limiti: nome 120, descrizione 600, varietà e testo della quantità 40, preparazione 60,
  testo della fonte 200, pagine 20 caratteri; durata intera 1-1440; porzioni intere
  1-100.
- Commit piccoli, messaggi in italiano, con la riga
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- I file di test non si importano fra loro (vitest ne ripeterebbe i test): i dati
  d'esempio condivisi stanno in `test-fixtures.ts`.

## Focus della review

1. **Quantità d'origine scritte come numero YAML** (`quantita: 2`): lette come
   `2 piece` (test nel compito 7).
2. **Bozza da un agente con chiavi assenti invece di `null`**: trattate come vuote al
   salvataggio e convertibili da `toPublished` se complete (compiti 4 e 5).
3. **Testi fatti di soli spazi** contano come mancanti per pubblicare (compito 5).
4. **Rilancio con `--existing` che contiene ingredienti usati da ricette nuove**: le
   righe si risolvono, l'ingrediente non riappare (compito 11).
5. **Nome di riga con grafia diversa dalla chiave della mappatura**: riga irrisolta nel
   documento, nessuna mappatura approssimata (compito 9).

---

### Compito 0: preparazione del ramo

**File:**
- Modifica, se serve: `domain/package.json` (creato da W1)

- [ ] **Passo 1: verificare che scheletro di W1 e moduli di W4 siano su `main`**

Run: `git fetch origin && git ls-tree -r --name-only origin/main | grep -E '^domain/(package.json|src/units/(index|locale|quantity|equivalence).ts|src/shopping/(index|variety|departments).ts)$'`
Expected: le otto righe. Se ne manca una, scrivere `STATO: BLOCCATO` con il file
mancante e fermarsi.

- [ ] **Passo 2: salvare l'uscita del report del pianificatore prima delle modifiche**

Run: `npm run planner-report > "$SCRATCHPAD/planner-before.txt"` (`$SCRATCHPAD` è la
directory temporanea della sessione)
Expected: il report, usato nel compito 15.

- [ ] **Passo 3: portare il ramo su `main`**

Run: `git rebase origin/main`
Expected: nessun conflitto (i file di W3 sono solo in `domain/src/recipe/`,
`scripts/import/`, `scripts/planner-data/origin.ts` e `progetto/`).

- [ ] **Passo 4: verificare i nomi esportati da W4**

Run: `grep -n "^export" domain/src/units/*.ts domain/src/shopping/variety.ts domain/src/shopping/departments.ts domain/src/units/index.ts domain/src/shopping/index.ts`
Expected: esistono tutti i nomi dei vincoli globali, riesportati da
`domain/src/units/index.ts` e `domain/src/shopping/index.ts`. `UnitEquivalence` ha
`ingredientId`, `fromUnit`, `toUnit`, `factor`, `scope`, `preparation`, `source`. Se un
nome o un campo è diverso, usare quello di W4 in tutti i compiti (sostituzione
meccanica) e annotarlo nel messaggio di commit.

- [ ] **Passo 5: zod in `domain/`**

Run: `grep -q '"zod"' domain/package.json || npm install zod@^4 -w domain; npm test && npm run typecheck`
Expected: test e typecheck verdi come su `main`.

- [ ] **Passo 6: commit (solo se il passo 5 ha cambiato file)**

```bash
git add domain/package.json package-lock.json
git commit -m "Dominio: zod per lo schema della ricetta"
```

---

### Compito 1: testi di bozza e schema del documento

**File:**
- Crea: `domain/src/recipe/localized.ts`, `domain/src/recipe/document.ts`,
  `domain/src/recipe/test-fixtures.ts`
- Test: `domain/src/recipe/document.test.ts`

**Interfacce:**
- Consuma: `PROTEIN_GROUPS`, `CARBOHYDRATE_GROUPS`, `CATEGORIES`, `SEASONS` da
  `../planner/index.ts`; `Locale`, `translatedTextSchema`, `unitCodeSchema`,
  `publishableQuantitySchema` da `../units/index.ts`.
- Produce: `DraftTranslated`, `draftTranslatedSchema`, `filled(text)`; `SOURCE_TYPES`,
  `SourceType`, `RECIPE_MEAL_TYPES`, `LIMITS`, `PLANNER_ATTRIBUTES`,
  `recipeDraftSchema`, `publishedRecipeSchema`, `RecipeDraftDocument`, `RecipeDocument`,
  `DraftIngredientLine`, `IngredientLine`, `DraftQuantity`, `emptyDraft()`; fixture
  `publishedExample`.

- [ ] **Passo 1: scrivere la fixture e i test che falliscono**

```ts
// domain/src/recipe/test-fixtures.ts
export const publishedExample = {
	schemaVersion: 1,
	name: { 'it-IT': 'Pasta al tonno', 'en-GB': 'Tuna pasta' },
	description: { 'it-IT': 'Condisci la pasta col tonno.', 'en-GB': 'Dress the pasta with tuna.' },
	sourceType: 'home',
	sourceUrl: null,
	bookId: null,
	bookPages: null,
	durationMinutes: 20,
	baseServings: 4,
	mealType: 'lunch',
	proteinGroup: 'fish',
	isFreshFish: false,
	carbohydrateGroup: 'pasta',
	category: 'other',
	hasVegetables: false,
	isHeavy: false,
	seasons: [],
	ingredients: [
		{
			ingredientId: 'pasta-corta',
			variety: null,
			preparation: null,
			quantity: { kind: 'amount', value: 320, unit: 'g' },
			sourceText: 'Pasta corta: 320 g',
			isOptional: false,
			isPrimary: false
		},
		{
			ingredientId: 'tonno',
			variety: null,
			preparation: { 'it-IT': 'sgocciolato', 'en-GB': 'drained' },
			quantity: { kind: 'to_taste' },
			sourceText: "Tonno sott'olio: q.b.",
			isOptional: false,
			isPrimary: true
		}
	]
} as const;
```

```ts
// domain/src/recipe/document.test.ts
import { describe, expect, it } from 'vitest';
import { emptyDraft, publishedRecipeSchema, recipeDraftSchema } from './document.ts';
import { filled } from './localized.ts';
import { publishedExample } from './test-fixtures.ts';

const firstLine = publishedExample.ingredients[0];

describe('recipe document schema', () => {
	it('accepts a complete document at both levels', () => {
		expect(publishedRecipeSchema.safeParse(publishedExample).success).toBe(true);
		expect(recipeDraftSchema.safeParse(publishedExample).success).toBe(true);
	});
	it('accepts an empty draft and a draft with missing keys', () => {
		expect(recipeDraftSchema.safeParse(emptyDraft()).success).toBe(true);
		expect(recipeDraftSchema.safeParse({ schemaVersion: 1, name: { 'it-IT': 'Zuppa' } }).success).toBe(true);
	});
	it('accepts only in a draft an amount without value, US cups and an unresolved line', () => {
		for (const line of [
			{ ...firstLine, quantity: { kind: 'amount', value: null, unit: 'g' } },
			{ ...firstLine, quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' } },
			{ ...firstLine, ingredientId: null }
		]) {
			const doc = { ...publishedExample, ingredients: [line] };
			expect(recipeDraftSchema.safeParse(doc).success).toBe(true);
			expect(publishedRecipeSchema.safeParse(doc).success).toBe(false);
		}
	});
	it('refuses values outside the vocabularies and unknown keys', () => {
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), proteinGroup: 'meat' }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), sourceType: 'casa' }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), tags: ['x'] }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), schemaVersion: 2 }).success).toBe(false);
	});
	it('treats blank text as missing', () => {
		expect(filled('  ')).toBe(false);
		expect(filled(null)).toBe(false);
		expect(filled(' a ')).toBe(true);
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/document.test.ts`
Expected: FAIL, moduli `./document.ts` e `./localized.ts` inesistenti.

- [ ] **Passo 3: implementare**

```ts
// domain/src/recipe/localized.ts
import * as z from 'zod';
import type { Locale } from '../units/index.ts';

// Complete texts are W4's Translated; a draft may miss either language (decision B, 11 October 2026).

export type DraftTranslated = Partial<Record<Locale, string | null>>;

export const draftTranslatedSchema = z.strictObject({
	'it-IT': z.string().nullable().optional(),
	'en-GB': z.string().nullable().optional()
});

export const filled = (text: string | null | undefined): text is string => !!text && text.trim().length > 0;
```

```ts
// domain/src/recipe/document.ts
import * as z from 'zod';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, SEASONS } from '../planner/index.ts';
import { publishableQuantitySchema, translatedTextSchema, unitCodeSchema } from '../units/index.ts';
import { draftTranslatedSchema } from './localized.ts';

export const SOURCE_TYPES = ['web', 'youtube', 'book', 'home'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const RECIPE_MEAL_TYPES = ['lunch', 'dinner', 'both'] as const;

export const LIMITS = {
	name: 120,
	description: 600,
	variety: 40,
	quantityText: 40,
	preparation: 60,
	sourceText: 200,
	bookPages: 20,
	durationMinutes: 1440,
	baseServings: 100
} as const;

/** Planner attributes required to publish (user, 11 October 2026); seasons may stay empty. */
export const PLANNER_ATTRIBUTES = ['mealType', 'proteinGroup', 'isFreshFish', 'carbohydrateGroup', 'category', 'hasVegetables', 'isHeavy'] as const;

const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

/** W4's quantity, with the value still to be written and US cups allowed. */
const draftQuantitySchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('amount'), value: z.number().nullable(), unit: unitCodeSchema }),
	z.strictObject({ kind: z.literal('to_taste') }),
	z.strictObject({ kind: z.literal('text'), text: draftTranslatedSchema })
]);
export type DraftQuantity = z.infer<typeof draftQuantitySchema>;

const draftLineSchema = z.strictObject({
	/** null: unresolved line, kept with its source text until a curator picks the ingredient. */
	ingredientId: z.string().min(1).nullable(),
	variety: optional(draftTranslatedSchema),
	preparation: optional(draftTranslatedSchema),
	quantity: draftQuantitySchema,
	sourceText: z.string(),
	isOptional: z.boolean(),
	isPrimary: z.boolean()
});

export const recipeDraftSchema = z.strictObject({
	schemaVersion: z.literal(1),
	name: draftTranslatedSchema,
	description: optional(draftTranslatedSchema),
	sourceType: optional(z.enum(SOURCE_TYPES)),
	sourceUrl: optional(z.string()),
	bookId: optional(z.string()),
	bookPages: optional(z.string()),
	durationMinutes: optional(z.number()),
	baseServings: optional(z.number()),
	mealType: optional(z.enum(RECIPE_MEAL_TYPES)),
	proteinGroup: optional(z.enum(PROTEIN_GROUPS)),
	isFreshFish: optional(z.boolean()),
	carbohydrateGroup: optional(z.enum(CARBOHYDRATE_GROUPS)),
	category: optional(z.enum(CATEGORIES)),
	hasVegetables: optional(z.boolean()),
	isHeavy: optional(z.boolean()),
	seasons: z.array(z.enum(SEASONS)).optional(),
	ingredients: z.array(draftLineSchema).optional()
});

const lineSchema = z.strictObject({
	ingredientId: z.string().min(1),
	variety: translatedTextSchema.nullable(),
	preparation: translatedTextSchema.nullable(),
	quantity: publishableQuantitySchema,
	sourceText: z.string().trim().min(1),
	isOptional: z.boolean(),
	isPrimary: z.boolean()
});

export const publishedRecipeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	name: translatedTextSchema,
	description: translatedTextSchema,
	sourceType: z.enum(SOURCE_TYPES),
	sourceUrl: z.string().nullable(),
	bookId: z.string().nullable(),
	bookPages: z.string().nullable(),
	durationMinutes: z.number().int().positive(),
	baseServings: z.number().int().positive(),
	mealType: z.enum(RECIPE_MEAL_TYPES),
	proteinGroup: z.enum(PROTEIN_GROUPS),
	isFreshFish: z.boolean(),
	carbohydrateGroup: z.enum(CARBOHYDRATE_GROUPS),
	category: z.enum(CATEGORIES),
	hasVegetables: z.boolean(),
	isHeavy: z.boolean(),
	seasons: z.array(z.enum(SEASONS)),
	ingredients: z.array(lineSchema).min(1)
});

export type RecipeDraftDocument = z.infer<typeof recipeDraftSchema>;
export type RecipeDocument = z.infer<typeof publishedRecipeSchema>;
export type DraftIngredientLine = z.infer<typeof draftLineSchema>;
export type IngredientLine = z.infer<typeof lineSchema>;

export function emptyDraft(): RecipeDraftDocument {
	return { schemaVersion: 1, name: {}, ingredients: [], seasons: [] };
}
```

Nota: se `translatedTextSchema` di W4 non è uno `strictObject`, il livello pubblicato
accetta chiavi in più nei testi; non cambia i controlli (le lingue sono due e fisse).

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe/document.test.ts && npx tsc -p domain/tsconfig.json`
Expected: PASS, nessun errore di tipi.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe/localized.ts domain/src/recipe/document.ts domain/src/recipe/document.test.ts domain/src/recipe/test-fixtures.ts
git commit -m "Ricetta: schema del documento con livello bozza e pubblicabile"
```

---

### Compito 2: esiti a codici e riepilogo per le schede

**File:**
- Crea: `domain/src/recipe/issues.ts`
- Test: `domain/src/recipe/issues.test.ts`

**Interfacce:**
- Consuma: `PLANNER_ATTRIBUTES`, `recipeDraftSchema`, `emptyDraft` (compito 1).
- Produce: `ISSUE_CODES`, `IssueCode`, `IssuePath`, `ValidationIssue`,
  `DRAFT_BLOCKING_CODES`, `blocksDraft(issue)`, `issuesFromZod(error)`, `MISSING_DATA`,
  `MissingData`, `missingData(issues)`.

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// domain/src/recipe/issues.test.ts
import { describe, expect, it } from 'vitest';
import { emptyDraft, recipeDraftSchema } from './document.ts';
import { blocksDraft, issuesFromZod, missingData } from './issues.ts';

describe('validation issues', () => {
	it('turns zod errors into invalid_value with the same path', () => {
		const result = recipeDraftSchema.safeParse({ ...emptyDraft(), ingredients: [{ ingredientId: 'x', quantity: { kind: 'amount', value: 1, unit: 'cup' }, sourceText: '', isOptional: false, isPrimary: false }] });
		expect(result.success).toBe(false);
		const issues = issuesFromZod(result.error!);
		expect(issues.every((i) => i.code === 'invalid_value')).toBe(true);
		expect(issues.some((i) => i.path.join('.').startsWith('ingredients.0.quantity'))).toBe(true);
	});
	it('separates refusals from publication problems; duplicates never block a draft', () => {
		expect(blocksDraft({ path: ['sourceUrl'], code: 'invalid_url' })).toBe(true);
		expect(blocksDraft({ path: ['name', 'en-GB'], code: 'translation_missing' })).toBe(false);
		expect(blocksDraft({ path: ['sourceUrl'], code: 'not_applicable' })).toBe(false);
		expect(blocksDraft({ path: ['ingredients', 1, 'ingredientId'], code: 'duplicate_ingredient' })).toBe(false);
	});
	it('summarises issues for the draft cards in a stable order', () => {
		expect(
			missingData([
				{ path: ['ingredients'], code: 'required' },
				{ path: ['name', 'en-GB'], code: 'translation_missing' },
				{ path: ['category'], code: 'required' },
				{ path: ['bookPages'], code: 'required' },
				{ path: ['sourceUrl'], code: 'not_applicable' },
				{ path: ['durationMinutes'], code: 'required' },
				{ path: ['ingredients', 0, 'quantity', 'unit'], code: 'unit_not_publishable' },
				{ path: ['ingredients', 1, 'ingredientId'], code: 'duplicate_ingredient' },
				{ path: ['sourceUrl'], code: 'invalid_url' },
				{ path: ['description'], code: 'required' }
			])
		).toEqual(['names', 'source', 'details', 'attributes', 'ingredients', 'translation', 'invalid']);
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/issues.test.ts`
Expected: FAIL, modulo `./issues.ts` inesistente.

- [ ] **Passo 3: implementare**

```ts
// domain/src/recipe/issues.ts
import type * as z from 'zod';
import { PLANNER_ATTRIBUTES } from './document.ts';

export const ISSUE_CODES = [
	'invalid_value', 'too_long', 'invalid_url', 'not_positive_integer', 'invalid_amount', 'unknown_ingredient', 'unknown_book',
	'duplicate_ingredient', 'multiple_primary', 'required', 'translation_missing', 'not_applicable', 'unit_not_publishable'
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];
export type IssuePath = (string | number)[];

/** One problem of a recipe document, with the path of the field (contract error `invalid`). */
export interface ValidationIssue {
	path: IssuePath;
	code: IssueCode;
}

/** Wrong data, refused even when saving a draft; every other code only blocks publication. */
export const DRAFT_BLOCKING_CODES: readonly IssueCode[] = [
	'invalid_value', 'too_long', 'invalid_url', 'not_positive_integer', 'invalid_amount', 'unknown_ingredient', 'unknown_book', 'multiple_primary'
];

export const blocksDraft = (issue: ValidationIssue) => DRAFT_BLOCKING_CODES.includes(issue.code);

export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
	return error.issues.map((issue) => ({
		path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
		code: 'invalid_value'
	}));
}

/** What a draft still lacks, in short (draft cards, spec section 8). */
export const MISSING_DATA = ['names', 'source', 'details', 'attributes', 'baseServings', 'ingredients', 'translation', 'invalid'] as const;
export type MissingData = (typeof MISSING_DATA)[number];

const SOURCE_FIELDS = new Set(['sourceType', 'sourceUrl', 'bookId', 'bookPages']);
const ATTRIBUTE_FIELDS = new Set<string>([...PLANNER_ATTRIBUTES, 'seasons']);

function summaryOf(issue: ValidationIssue): MissingData {
	const field = String(issue.path[0] ?? '');
	if (issue.code === 'translation_missing') return 'translation';
	if (blocksDraft(issue)) return 'invalid';
	if (field === 'name' || field === 'description') return 'names';
	if (SOURCE_FIELDS.has(field)) return 'source';
	if (field === 'durationMinutes') return 'details';
	if (ATTRIBUTE_FIELDS.has(field)) return 'attributes';
	if (field === 'baseServings') return 'baseServings';
	return 'ingredients';
}

export function missingData(issues: ValidationIssue[]): MissingData[] {
	const found = new Set(issues.map(summaryOf));
	return MISSING_DATA.filter((m) => found.has(m));
}
```

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe/issues.test.ts && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe/issues.ts domain/src/recipe/issues.test.ts
git commit -m "Ricetta: esiti di validazione a codici e riepilogo delle bozze"
```

---

### Compito 3: varietà e pulizia dei testi

**File:**
- Crea: `domain/src/recipe/variety.ts`, `domain/src/recipe/clean.ts`
- Test: `domain/src/recipe/variety.test.ts`, `domain/src/recipe/clean.test.ts`

**Interfacce:**
- Consuma: `varietyKey(text: string | null | undefined): string` da
  `../shopping/index.ts`; `Locale`, `Translated` da `../units/index.ts`; tipi dei compiti
  1 e 2.
- Produce: `cleanVariety(text)`, `lineKey({ ingredientId, variety })`,
  `comparableVariety(variety)`, `VarietyHint`, `varietyHints({ ingredientName, known,
  text, locale })`, `cleanDraft(document)`.

- [ ] **Passo 1: scrivere i test che falliscono** (casi del prototipo,
  `prototype/src/lib/domain/ingredient-variety.ts`, senza database dimostrativo)

```ts
// domain/src/recipe/variety.test.ts
import { describe, expect, it } from 'vitest';
import { cleanVariety, comparableVariety, lineKey, varietyHints } from './variety.ts';

describe('ingredient variety', () => {
	it('keeps the text as written, with single spaces', () => {
		expect(cleanVariety('  cuore  di bue ')).toBe('cuore di bue');
	});
	it('keys a line by ingredient and normalised Italian variety', () => {
		expect(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma' } })).toBe(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'roma' } }));
		expect(lineKey({ ingredientId: 'pomodori', variety: null })).not.toBe(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'Roma' } }));
	});
	it('compares a variety only when its identity is known: none at all, or the Italian text', () => {
		expect(comparableVariety(null)).toBe(true);
		expect(comparableVariety({ 'it-IT': ' ', 'en-GB': '' })).toBe(true);
		expect(comparableVariety({ 'it-IT': 'Roma' })).toBe(true);
		expect(comparableVariety({ 'en-GB': 'red' })).toBe(false);
		expect(comparableVariety({ 'it-IT': null, 'en-GB': 'Roma' })).toBe(false);
	});
	it('suggests the known spelling, the name without the ingredient, and flags preparations', () => {
		const known = [{ 'it-IT': 'cuore di bue', 'en-GB': 'oxheart' }];
		expect(varietyHints({ ingredientName: 'Pomodori', known, text: 'Cuore di Bue', locale: 'it-IT' })).toEqual([{ kind: 'existing_spelling', suggestion: known[0] }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: 'Pomodoro tipo Roma', locale: 'it-IT' })).toEqual([{ kind: 'repeats_ingredient', suggestion: 'Roma' }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: 'a dadini', locale: 'it-IT' })).toEqual([{ kind: 'preparation' }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: '  ', locale: 'it-IT' })).toEqual([]);
	});
});
```

```ts
// domain/src/recipe/clean.test.ts
import { describe, expect, it } from 'vitest';
import { cleanDraft } from './clean.ts';

describe('cleanDraft', () => {
	it('trims texts and varieties without touching numbers or unresolved lines', () => {
		const cleaned = cleanDraft({
			schemaVersion: 1,
			name: { 'it-IT': ' Zuppa ', 'en-GB': null },
			sourceUrl: ' https://example.org/z ',
			ingredients: [
				{ ingredientId: 'ceci', variety: { 'it-IT': ' neri  di Murgia ', 'en-GB': 'black' }, preparation: { 'it-IT': ' lessati' }, quantity: { kind: 'text', text: { 'it-IT': ' 1 barattolo ' } }, sourceText: ' Ceci: 1 barattolo ', isOptional: false, isPrimary: false },
				{ ingredientId: null, variety: null, preparation: null, quantity: { kind: 'amount', value: 2, unit: 'piece' }, sourceText: 'Zenzero: 2', isOptional: false, isPrimary: false }
			]
		});
		expect(cleaned.name).toEqual({ 'it-IT': 'Zuppa', 'en-GB': null });
		expect(cleaned.sourceUrl).toBe('https://example.org/z');
		expect(cleaned.ingredients?.[0]).toMatchObject({ variety: { 'it-IT': 'neri di Murgia', 'en-GB': 'black' }, preparation: { 'it-IT': 'lessati' }, quantity: { kind: 'text', text: { 'it-IT': '1 barattolo' } }, sourceText: 'Ceci: 1 barattolo' });
		expect(cleaned.ingredients?.[1]).toMatchObject({ ingredientId: null, quantity: { kind: 'amount', value: 2, unit: 'piece' } });
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/variety.test.ts domain/src/recipe/clean.test.ts`
Expected: FAIL, moduli inesistenti.

- [ ] **Passo 3: implementare**

```ts
// domain/src/recipe/variety.ts
import { varietyKey } from '../shopping/index.ts';
import type { Locale, Translated } from '../units/index.ts';
import { filled, type DraftTranslated } from './localized.ts';

// Variety of an ingredient on a recipe line (spec section 8): free text, compared through W4's varietyKey.

const FILLER = new Set(['tipo', 'varieta', 'var', 'qualita', 'type', 'variety']);
const PREPARATION = [
	'tritat', 'a dadini', 'a cubetti', 'a fette', 'affettat', 'grattugiat', 'succo', 'scorza', 'schiacciat', 'tagliat', 'a pezzi',
	'sminuzzat', 'frullat', 'spezzettat', 'a julienne', 'a rondelle', 'chopped', 'diced', 'sliced', 'grated', 'juice', 'zest',
	'minced', 'crushed', 'shredded', 'cubed'
];

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Stored as written, only trimmed and with single spaces (proper names keep their capitals). */
export const cleanVariety = (text: string) => text.trim().replace(/\s+/g, ' ');

/** The same ingredient may appear twice in a recipe only with different varieties. */
export const lineKey = (line: { ingredientId: string; variety?: DraftTranslated | null }) =>
	`${line.ingredientId}~${varietyKey(line.variety?.['it-IT'] ?? '')}`;

/**
 * A variety can be compared with others when its identity is known: no variety in any language, or the
 * Italian text. One written only in English is not compared yet (review of 11 October 2026).
 */
export const comparableVariety = (variety: DraftTranslated | null | undefined) =>
	filled(variety?.['it-IT']) || !filled(variety?.['en-GB']);

export type VarietyHint =
	| { kind: 'existing_spelling'; suggestion: Translated }
	| { kind: 'repeats_ingredient'; suggestion: string }
	| { kind: 'preparation' };

/** Advice while writing a variety, never a refusal; known varieties come from the caller. */
export function varietyHints(input: { ingredientName: string; known: Translated[]; text: string; locale: Locale }): VarietyHint[] {
	const hints: VarietyHint[] = [];
	const cleaned = cleanVariety(input.text);
	if (!cleaned) return hints;
	// "Pomodoro tipo Roma" on Pomodori: drop the ingredient name (singular or plural stem) and filler words.
	const stem = plain(input.ingredientName).split(' ')[0]?.replace(/[aeio]$/, '') ?? '';
	const words = cleaned.split(' ');
	let start = stem.length >= 3 && words.length > 1 && plain(words[0]).startsWith(stem) ? 1 : 0;
	const repeats = start === 1;
	while (start < words.length - 1 && FILLER.has(plain(words[start]))) start++;
	const core = words.slice(start).join(' ');
	const known = input.known.find((k) => varietyKey(k[input.locale]) === varietyKey(core));
	if (repeats) hints.push({ kind: 'repeats_ingredient', suggestion: known ? known[input.locale] : core });
	else if (known && known[input.locale] !== cleaned) hints.push({ kind: 'existing_spelling', suggestion: known });
	if (PREPARATION.some((p) => ` ${plain(cleaned)} `.includes(p))) hints.push({ kind: 'preparation' });
	return hints;
}
```

```ts
// domain/src/recipe/clean.ts
import type { RecipeDraftDocument } from './document.ts';
import type { DraftTranslated } from './localized.ts';
import { cleanVariety } from './variety.ts';

const trim = (text: string | null | undefined) => (typeof text === 'string' ? text.trim() : text);

function cleanTranslated(value: DraftTranslated | null | undefined, clean: (t: string) => string = (t) => t.trim()) {
	if (!value) return value;
	return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? clean(text) : text])) as DraftTranslated;
}

/** Texts trimmed on save (spec section 1); varieties also lose double spaces. */
export function cleanDraft(document: RecipeDraftDocument): RecipeDraftDocument {
	return {
		...document,
		name: cleanTranslated(document.name) ?? {},
		description: cleanTranslated(document.description),
		sourceUrl: trim(document.sourceUrl),
		bookPages: trim(document.bookPages),
		ingredients: document.ingredients?.map((line) => ({
			...line,
			variety: cleanTranslated(line.variety, cleanVariety),
			preparation: cleanTranslated(line.preparation),
			quantity: line.quantity.kind === 'text' ? { kind: 'text', text: cleanTranslated(line.quantity.text) ?? {} } : line.quantity,
			sourceText: line.sourceText.trim()
		}))
	};
}
```

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe/variety.ts domain/src/recipe/variety.test.ts domain/src/recipe/clean.ts domain/src/recipe/clean.test.ts
git commit -m "Ricetta: varietà con la chiave di W4 e pulizia dei testi"
```

---

### Compito 4: controllo della bozza

**File:**
- Crea: `domain/src/recipe/check.ts`
- Modifica: `domain/src/recipe/test-fixtures.ts`
- Test: `domain/src/recipe/check-draft.test.ts`

**Interfacce:**
- Consuma: compiti 1-3.
- Produce: `CatalogueLookup` (`hasIngredient(id)`, `ingredientHasEnglishName(id)`,
  `hasBook(id)`), `Add`, `checkDraft(input: unknown, lookup): ValidationIssue[]`,
  `draftIssues(document, lookup)` (riusata dal compito 5), `httpUrlHost(value)`;
  fixture `lookup`.

- [ ] **Passo 1: aggiungere `lookup` alle fixture e scrivere i test che falliscono**

```ts
// domain/src/recipe/test-fixtures.ts (import in testa, costante in fondo)
import type { CatalogueLookup } from './check.ts';

/** Catalogue seen by the checks in the tests. */
export const lookup: CatalogueLookup = {
	hasIngredient: (id) => ['pasta-corta', 'tonno', 'pomodori'].includes(id),
	ingredientHasEnglishName: (id) => id !== 'pomodori',
	hasBook: (id) => id === 'basta-un-wok'
};
```

```ts
// domain/src/recipe/check-draft.test.ts
import { describe, expect, it } from 'vitest';
import { checkDraft, httpUrlHost } from './check.ts';
import { lookup, publishedExample } from './test-fixtures.ts';

const codes = (input: unknown) => checkDraft(input, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const line = (over: object) => ({ ...publishedExample.ingredients[0], ...over });
const doc = (ingredients: object[]) => ({ schemaVersion: 1, name: { 'it-IT': 'Z' }, ingredients });

describe('checkDraft', () => {
	it('accepts a complete document and an incomplete draft', () => {
		expect(codes(publishedExample)).toEqual([]);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Zuppa' } })).toEqual([]);
	});
	it('treats absent keys like null', () => {
		expect(codes({ schemaVersion: 1, name: { 'en-GB': 'Soup' }, ingredients: [line({ variety: undefined, preparation: undefined })] })).toEqual([]);
	});
	it('needs a name in at least one language', () => {
		expect(codes({ schemaVersion: 1, name: { 'it-IT': ' ' } })).toEqual(['required:name']);
	});
	it('reads http(s) addresses without the URL global', () => {
		expect(httpUrlHost('https://www.YouTube.com/watch?v=x')).toBe('www.youtube.com');
		expect(httpUrlHost('http://example.it:8080/a')).toBe('example.it');
		expect(httpUrlHost('ftp://a')).toBeNull();
		expect(httpUrlHost('https://exa mple.it')).toBeNull();
		expect(httpUrlHost('nope')).toBeNull();
	});
	it('refuses wrong data', () => {
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'x'.repeat(121) } })).toEqual(['too_long:name.it-IT']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceUrl: 'ftp://a' })).toEqual(['invalid_url:sourceUrl']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceType: 'youtube', sourceUrl: 'https://vimeo.com/1' })).toEqual(['invalid_url:sourceUrl']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceType: 'youtube', sourceUrl: 'https://youtu.be/abc' })).toEqual([]);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, durationMinutes: 0, baseServings: 2.5 })).toEqual(['not_positive_integer:durationMinutes', 'not_positive_integer:baseServings']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, durationMinutes: 1441, baseServings: 101 })).toEqual(['not_positive_integer:durationMinutes', 'not_positive_integer:baseServings']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, bookId: 'altro' })).toEqual(['unknown_book:bookId']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, bookPages: '1'.repeat(21) })).toEqual(['too_long:bookPages']);
	});
	it('refuses wrong ingredient lines', () => {
		expect(codes(doc([line({ ingredientId: 'sconosciuto' })]))).toEqual(['unknown_ingredient:ingredients.0.ingredientId']);
		expect(codes(doc([line({ quantity: { kind: 'amount', value: -1, unit: 'g' } })]))).toEqual(['invalid_amount:ingredients.0.quantity.value']);
		expect(codes(doc([line({ isPrimary: true }), line({ ingredientId: 'tonno', isPrimary: true })]))).toEqual(['multiple_primary:ingredients.1.isPrimary']);
		expect(codes(doc([line({ variety: { 'en-GB': 'x'.repeat(41) } })]))).toEqual(['too_long:ingredients.0.variety.en-GB']);
		expect(codes(doc([line({ preparation: { 'it-IT': 'x'.repeat(61) } })]))).toEqual(['too_long:ingredients.0.preparation.it-IT']);
		expect(codes(doc([line({ quantity: { kind: 'text', text: { 'it-IT': 'x'.repeat(41) } } })]))).toEqual(['too_long:ingredients.0.quantity.text.it-IT']);
		expect(codes(doc([line({ sourceText: 'x'.repeat(201) })]))).toEqual(['too_long:ingredients.0.sourceText']);
	});
	it('accepts what only blocks publication: empty amounts, cups, unresolved and duplicate lines', () => {
		expect(codes(doc([line({ quantity: { kind: 'amount', value: null, unit: 'g' } })]))).toEqual([]);
		expect(codes(doc([line({ quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' } })]))).toEqual([]);
		expect(codes(doc([line({ ingredientId: null, sourceText: 'Zenzero fresco: 1 pezzo' })]))).toEqual([]);
		expect(codes(doc([line({ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma' } }), line({ ingredientId: 'pomodori', variety: { 'it-IT': 'roma' } })]))).toEqual([]);
	});
	it('returns schema errors as invalid_value', () => {
		expect(codes({ schemaVersion: 1, name: {}, mealType: 'brunch' })).toEqual(['invalid_value:mealType']);
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/check-draft.test.ts`
Expected: FAIL, modulo `./check.ts` inesistente.

- [ ] **Passo 3: implementare**

```ts
// domain/src/recipe/check.ts
import { LOCALES } from '../units/index.ts';
import { LIMITS, recipeDraftSchema, type RecipeDraftDocument } from './document.ts';
import { issuesFromZod, type IssueCode, type IssuePath, type ValidationIssue } from './issues.ts';
import { filled, type DraftTranslated } from './localized.ts';

// Shared recipe checks (spec section 8): the same rules for MCP, the curators' form and the import.

/** Catalogue facts the checks need, given by the caller so that domain/ stays pure. */
export interface CatalogueLookup {
	hasIngredient(id: string): boolean;
	ingredientHasEnglishName(id: string): boolean;
	hasBook(id: string): boolean;
}

export type Add = (code: IssueCode, ...path: IssuePath) => void;

/** Host of an http(s) address, lower case; null otherwise. No URL global: domain/ has no DOM or Node types. */
export function httpUrlHost(value: string): string | null {
	const match = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#][^\s]*)?$/i.exec(value.trim());
	return match ? match[1].toLowerCase() : null;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function checkLength(add: Add, value: DraftTranslated | null | undefined, max: number, ...path: IssuePath) {
	for (const locale of LOCALES) if ((value?.[locale]?.length ?? 0) > max) add('too_long', ...path, locale);
}

function checkWholeNumber(add: Add, value: number | null | undefined, max: number, field: string) {
	if (value != null && !(Number.isInteger(value) && value > 0 && value <= max)) add('not_positive_integer', field);
}

/** Wrong data in what is present; also the base of the publication check. */
export function draftIssues(document: RecipeDraftDocument, lookup: CatalogueLookup): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const add: Add = (code, ...path) => issues.push({ code, path });
	if (!LOCALES.some((l) => filled(document.name[l]))) add('required', 'name');
	checkLength(add, document.name, LIMITS.name, 'name');
	checkLength(add, document.description, LIMITS.description, 'description');
	if (document.sourceUrl) {
		const host = httpUrlHost(document.sourceUrl);
		if (!host || (document.sourceType === 'youtube' && !YOUTUBE_HOSTS.has(host))) add('invalid_url', 'sourceUrl');
	}
	if (document.bookId && !lookup.hasBook(document.bookId)) add('unknown_book', 'bookId');
	if ((document.bookPages?.length ?? 0) > LIMITS.bookPages) add('too_long', 'bookPages');
	checkWholeNumber(add, document.durationMinutes, LIMITS.durationMinutes, 'durationMinutes');
	checkWholeNumber(add, document.baseServings, LIMITS.baseServings, 'baseServings');

	let primaries = 0;
	(document.ingredients ?? []).forEach((line, index) => {
		if (line.ingredientId !== null && !lookup.hasIngredient(line.ingredientId)) add('unknown_ingredient', 'ingredients', index, 'ingredientId');
		if (line.isPrimary && ++primaries > 1) add('multiple_primary', 'ingredients', index, 'isPrimary');
		const q = line.quantity;
		if (q.kind === 'amount' && q.value !== null && !(Number.isFinite(q.value) && q.value > 0)) add('invalid_amount', 'ingredients', index, 'quantity', 'value');
		if (q.kind === 'text') checkLength(add, q.text, LIMITS.quantityText, 'ingredients', index, 'quantity', 'text');
		checkLength(add, line.variety, LIMITS.variety, 'ingredients', index, 'variety');
		checkLength(add, line.preparation, LIMITS.preparation, 'ingredients', index, 'preparation');
		if (line.sourceText.length > LIMITS.sourceText) add('too_long', 'ingredients', index, 'sourceText');
	});
	return issues;
}

/** Saving a draft (spec section 8): refuses wrong data, accepts what is still missing. */
export function checkDraft(input: unknown, lookup: CatalogueLookup): ValidationIssue[] {
	const parsed = recipeDraftSchema.safeParse(input);
	return parsed.success ? draftIssues(parsed.data, lookup) : issuesFromZod(parsed.error);
}
```

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe/check.ts domain/src/recipe/check-draft.test.ts domain/src/recipe/test-fixtures.ts
git commit -m "Ricetta: controllo del salvataggio della bozza"
```

---

### Compito 5: controllo di pubblicazione e conversione

**File:**
- Modifica: `domain/src/recipe/check.ts`
- Test: `domain/src/recipe/check-publish.test.ts`

**Interfacce:**
- Consuma: `draftIssues`, `Add`, `CatalogueLookup` (compito 4); `comparableVariety`,
  `lineKey` (compito 3); `PLANNER_ATTRIBUTES`, `publishedRecipeSchema`.
- Produce: `checkPublishable(input: unknown, lookup): ValidationIssue[]`,
  `toPublished(input: unknown): RecipeDocument` (lancia un errore se il documento non è
  completo).

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// domain/src/recipe/check-publish.test.ts
import { describe, expect, it } from 'vitest';
import { checkPublishable, toPublished } from './check.ts';
import { lookup, publishedExample } from './test-fixtures.ts';

const codes = (over: object) => checkPublishable({ ...publishedExample, ...over }, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const line = (over: object) => ({ ...publishedExample.ingredients[0], ...over });
const withLine = (over: object) => codes({ ingredients: [line(over)] });
const withLines = (...lines: object[]) => codes({ ingredients: lines.map(line) });
const without = (key: string) => Object.fromEntries(Object.entries(publishedExample).filter(([k]) => k !== key));

describe('checkPublishable', () => {
	it('passes a complete document and narrows its type', () => {
		expect(codes({})).toEqual([]);
		expect(toPublished(publishedExample).name['en-GB']).toBe('Tuna pasta');
	});
	it('needs both languages; blank text counts as missing', () => {
		expect(codes({ name: { 'it-IT': 'Pasta', 'en-GB': '  ' } })).toEqual(['translation_missing:name.en-GB']);
		expect(codes({ description: null })).toEqual(['required:description']);
		expect(codes({ description: { 'en-GB': 'x' } })).toEqual(['translation_missing:description.it-IT']);
	});
	it('applies the rules of each source type', () => {
		expect(codes({ sourceType: 'web' })).toEqual(['required:sourceUrl']);
		expect(codes({ sourceType: 'youtube', sourceUrl: 'https://youtu.be/a', bookPages: '3' })).toEqual(['not_applicable:bookPages']);
		expect(codes({ sourceType: 'book' })).toEqual(['required:bookId', 'required:bookPages']);
		expect(codes({ sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' })).toEqual([]);
		expect(codes({ sourceType: 'home', sourceUrl: 'https://a.it' })).toEqual(['not_applicable:sourceUrl']);
		expect(codes({ sourceType: null })).toEqual(['required:sourceType']);
	});
	it('needs duration, servings and planner attributes, not seasons', () => {
		expect(codes({ durationMinutes: null, baseServings: undefined })).toEqual(['required:durationMinutes', 'required:baseServings']);
		expect(codes({ category: null, isHeavy: undefined, seasons: undefined })).toEqual(['required:category', 'required:isHeavy']);
		expect(codes({ proteinGroup: 'eggs', isFreshFish: true })).toEqual(['invalid_value:isFreshFish']);
	});
	it('checks every ingredient line', () => {
		expect(codes({ ingredients: [] })).toEqual(['required:ingredients']);
		expect(withLine({ ingredientId: null })).toEqual(['required:ingredients.0.ingredientId']);
		expect(withLine({ sourceText: ' ' })).toEqual(['required:ingredients.0.sourceText']);
		expect(withLine({ quantity: { kind: 'amount', value: null, unit: 'g' } })).toEqual(['required:ingredients.0.quantity.value']);
		expect(withLine({ quantity: { kind: 'amount', value: 1, unit: 'us_cup' } })).toEqual(['unit_not_publishable:ingredients.0.quantity.unit']);
		expect(withLine({ quantity: { kind: 'text', text: { 'it-IT': '1 mazzetto' } } })).toEqual(['translation_missing:ingredients.0.quantity.text.en-GB']);
		expect(withLine({ quantity: { kind: 'text', text: {} } })).toEqual(['required:ingredients.0.quantity.text']);
		expect(withLine({ variety: { 'it-IT': 'Roma' } })).toEqual(['translation_missing:ingredients.0.variety.en-GB']);
		expect(withLine({ variety: { 'it-IT': ' ', 'en-GB': '' } })).toEqual([]);
		expect(withLine({ preparation: { 'en-GB': 'diced' } })).toEqual(['translation_missing:ingredients.0.preparation.it-IT']);
		expect(withLine({ ingredientId: 'pomodori' })).toEqual(['translation_missing:ingredients.0.ingredientId']);
	});
	it('finds duplicates only among lines whose variety identity is known', () => {
		const tuna = (variety: object | null) => ({ ingredientId: 'tonno', variety });
		expect(withLines(tuna(null), tuna(null))).toEqual(['duplicate_ingredient:ingredients.1.ingredientId']);
		expect(withLines(tuna({ 'it-IT': 'tipo Roma', 'en-GB': 'Roma' }), tuna({ 'it-IT': 'roma', 'en-GB': 'roma' }))).toEqual(['duplicate_ingredient:ingredients.1.ingredientId']);
		expect(withLines(tuna({ 'en-GB': 'red' }), tuna({ 'en-GB': 'green' }))).toEqual([
			'translation_missing:ingredients.0.variety.it-IT',
			'translation_missing:ingredients.1.variety.it-IT'
		]);
		expect(withLines(tuna({ 'it-IT': 'Roma', 'en-GB': 'Roma' }), tuna({ 'en-GB': 'Roma' }))).toEqual(['translation_missing:ingredients.1.variety.it-IT']);
		expect(withLines(tuna(null), tuna({ 'en-GB': 'red' }))).toEqual(['translation_missing:ingredients.1.variety.it-IT']);
		expect(withLines({ ingredientId: null }, { ingredientId: null })).toEqual(['required:ingredients.0.ingredientId', 'required:ingredients.1.ingredientId']);
	});
	it('keeps the draft refusals', () => {
		expect(codes({ sourceType: 'web', sourceUrl: 'nope' })).toEqual(['invalid_url:sourceUrl']);
	});
	it('converts every document without publication problems (invariant)', () => {
		const lineWithout = (key: string) => ({ ...publishedExample, ingredients: [Object.fromEntries(Object.entries(publishedExample.ingredients[0]).filter(([k]) => k !== key))] });
		const variants = [
			publishedExample,
			without('sourceUrl'), without('bookId'), without('bookPages'), without('seasons'),
			lineWithout('variety'), lineWithout('preparation'),
			{ ...publishedExample, ingredients: [line({ variety: { 'it-IT': ' ' }, preparation: {} })] },
			{ ...publishedExample, sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' },
			{ ...publishedExample, sourceType: 'web', sourceUrl: 'https://example.it/r' }
		];
		for (const variant of variants) {
			expect(checkPublishable(variant, lookup)).toEqual([]);
			expect(() => toPublished(variant)).not.toThrow();
		}
		expect(toPublished(without('seasons')).seasons).toEqual([]);
		expect(toPublished(without('sourceUrl')).sourceUrl).toBeNull();
		expect(toPublished(lineWithout('variety')).ingredients[0].variety).toBeNull();
	});
	it('refuses to narrow an incomplete document', () => {
		expect(() => toPublished({ ...publishedExample, durationMinutes: null })).toThrow();
	});
});
```

Nota: la riga di base della fixture è `pasta-corta` con `isPrimary: false`; nei casi a
due righe nessuna è principale, quindi non compare `multiple_primary`.

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/check-publish.test.ts`
Expected: FAIL, `checkPublishable` non esportata.

- [ ] **Passo 3: implementare** (aggiunte a `check.ts`; aggiornare gli import in testa
  con `PLANNER_ATTRIBUTES`, `publishedRecipeSchema`, `RecipeDocument` da
  `./document.ts` e `comparableVariety`, `lineKey` da `./variety.ts`)

```ts
// domain/src/recipe/check.ts (aggiunte)

/** Both languages present, or nothing: `required` without any text, `translation_missing` for the missing one. */
function checkTranslated(add: Add, value: DraftTranslated | null | undefined, optional: boolean, ...path: IssuePath) {
	const present = LOCALES.filter((l) => filled(value?.[l]));
	if (present.length === LOCALES.length) return;
	if (present.length === 0) {
		if (!optional) add('required', ...path);
		return;
	}
	for (const locale of LOCALES) if (!present.includes(locale)) add('translation_missing', ...path, locale);
}

function checkSource(add: Add, d: RecipeDraftDocument) {
	const notApplicable = (field: 'sourceUrl' | 'bookId' | 'bookPages') => {
		if (filled(d[field])) add('not_applicable', field);
	};
	if (!d.sourceType) {
		add('required', 'sourceType');
		return;
	}
	if (d.sourceType === 'web' || d.sourceType === 'youtube') {
		if (!filled(d.sourceUrl)) add('required', 'sourceUrl');
		notApplicable('bookId');
		notApplicable('bookPages');
	} else if (d.sourceType === 'book') {
		if (!filled(d.bookId)) add('required', 'bookId');
		if (!filled(d.bookPages)) add('required', 'bookPages');
		notApplicable('sourceUrl');
	} else {
		notApplicable('sourceUrl');
		notApplicable('bookId');
		notApplicable('bookPages');
	}
}

/** Publication (spec section 8): every rule, checked again by the server in every channel. */
export function checkPublishable(input: unknown, lookup: CatalogueLookup): ValidationIssue[] {
	const parsed = recipeDraftSchema.safeParse(input);
	if (!parsed.success) return issuesFromZod(parsed.error);
	const d = parsed.data;
	const issues = draftIssues(d, lookup).filter((i) => !(i.code === 'required' && i.path.length === 1 && i.path[0] === 'name'));
	const add: Add = (code, ...path) => issues.push({ code, path });
	checkTranslated(add, d.name, false, 'name');
	checkTranslated(add, d.description, false, 'description');
	checkSource(add, d);
	if (d.durationMinutes == null) add('required', 'durationMinutes');
	if (d.baseServings == null) add('required', 'baseServings');
	for (const field of PLANNER_ATTRIBUTES) if (d[field] == null) add('required', field);
	if (d.isFreshFish === true && d.proteinGroup != null && d.proteinGroup !== 'fish') add('invalid_value', 'isFreshFish');
	const lines = d.ingredients ?? [];
	if (lines.length === 0) add('required', 'ingredients');
	const seen = new Set<string>();
	lines.forEach((line, index) => {
		if (line.ingredientId === null) add('required', 'ingredients', index, 'ingredientId');
		else {
			if (lookup.hasIngredient(line.ingredientId) && !lookup.ingredientHasEnglishName(line.ingredientId))
				add('translation_missing', 'ingredients', index, 'ingredientId');
			// Duplicates only among lines whose variety identity is known (review of 11 October 2026).
			if (comparableVariety(line.variety)) {
				const key = lineKey({ ingredientId: line.ingredientId, variety: line.variety });
				if (seen.has(key)) add('duplicate_ingredient', 'ingredients', index, 'ingredientId');
				seen.add(key);
			}
		}
		if (!filled(line.sourceText)) add('required', 'ingredients', index, 'sourceText');
		const q = line.quantity;
		if (q.kind === 'amount' && q.value === null) add('required', 'ingredients', index, 'quantity', 'value');
		if (q.kind === 'amount' && q.unit === 'us_cup') add('unit_not_publishable', 'ingredients', index, 'quantity', 'unit');
		if (q.kind === 'text') checkTranslated(add, q.text, false, 'ingredients', index, 'quantity', 'text');
		checkTranslated(add, line.variety, true, 'ingredients', index, 'variety');
		checkTranslated(add, line.preparation, true, 'ingredients', index, 'preparation');
	});
	return issues;
}

const emptyToNull = (v: DraftTranslated | null | undefined) => (v && LOCALES.some((l) => filled(v[l])) ? v : null);

/**
 * Narrows a document that passed checkPublishable. Absent fields become their published form first
 * (source fields null, seasons empty, empty varieties and preparations null), so the invariant holds:
 * no publication problem ⇒ conversion succeeds.
 */
export function toPublished(input: unknown): RecipeDocument {
	const d = recipeDraftSchema.parse(input);
	return publishedRecipeSchema.parse({
		...d,
		sourceUrl: d.sourceUrl ?? null,
		bookId: d.bookId ?? null,
		bookPages: d.bookPages ?? null,
		seasons: d.seasons ?? [],
		ingredients: (d.ingredients ?? []).map((l) => ({ ...l, variety: emptyToNull(l.variety), preparation: emptyToNull(l.preparation) }))
	});
}
```

Nota: l'ordine degli esiti nei test segue l'ordine dei controlli (rifiuti della bozza,
testi, fonte, durata e porzioni, attributi, righe e, per ogni riga, ingrediente,
duplicato, testo della fonte, quantità, varietà, preparazione). Se un esito arriva in un
altro ordine, correggere l'ordine dei controlli, non il test.

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe/check.ts domain/src/recipe/check-publish.test.ts
git commit -m "Ricetta: controllo di pubblicazione e conversione al documento pubblicato"
```

---

### Compito 6: proiezioni, ingrediente del catalogo e indice

**File:**
- Crea: `domain/src/recipe/projection.ts`, `domain/src/recipe/ingredient.ts`,
  `domain/src/recipe/index.ts`
- Test: `domain/src/recipe/projection.test.ts`, `domain/src/recipe/ingredient.test.ts`

**Interfacce:**
- Consuma: `RecipeDocument`, `RecipeDraftDocument`, `DraftTranslated`; `PlannerRecipe`;
  `varietyKey`, `DEPARTMENTS`; `Translated`, `translatedTextSchema`, `UnitCode`.
- Produce: `RecipeProjection`, `RecipeIngredientProjection`, `projectRecipe(document)`,
  `projectDraftNames(draft)`, `toPlannerRecipe(id, document)`, `ReferenceLookup`,
  `resolveReferences(document, lookup)`; `catalogueIngredientSchema`,
  `CatalogueIngredient`; `index.ts` che esporta il modulo (non le fixture).

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// domain/src/recipe/projection.test.ts
import { describe, expect, it } from 'vitest';
import { varietyKey } from '../shopping/index.ts';
import { publishedRecipeSchema } from './document.ts';
import { projectDraftNames, projectRecipe, resolveReferences, toPlannerRecipe } from './projection.ts';
import { publishedExample } from './test-fixtures.ts';

const doc = publishedRecipeSchema.parse({
	...publishedExample,
	ingredients: [
		...publishedExample.ingredients,
		{ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma', 'en-GB': 'Roma' }, preparation: null, quantity: { kind: 'text', text: { 'it-IT': '1 vaschetta', 'en-GB': '1 punnet' } }, sourceText: 'Pomodori Roma: 1 vaschetta', isOptional: true, isPrimary: false }
	]
});

describe('projections', () => {
	it('projects the recipe columns', () => {
		const { recipe } = projectRecipe(doc);
		expect(recipe).toMatchObject({ name: doc.name, sourceType: 'home', durationMinutes: 20, baseServings: 4, proteinGroup: 'fish', seasons: [] });
		expect(recipe).not.toHaveProperty('ingredients');
	});
	it('projects one row per line with position, variety key and quantity columns', () => {
		const { ingredients } = projectRecipe(doc);
		expect(ingredients.map((r) => r.position)).toEqual([0, 1, 2]);
		expect(ingredients[0]).toMatchObject({ quantityKind: 'amount', quantity: 320, unit: 'g', quantityText: null, varietyKey: '' });
		expect(ingredients[1]).toMatchObject({ quantityKind: 'to_taste', quantity: null, unit: null, isPrimary: true });
		expect(ingredients[2]).toMatchObject({ quantityKind: 'text', quantity: null, unit: null, quantityText: { 'it-IT': '1 vaschetta', 'en-GB': '1 punnet' }, varietyKey: varietyKey('tipo Roma'), isOptional: true });
	});
	it('fills name and description of a new draft, empty where a language is missing', () => {
		expect(projectDraftNames({ schemaVersion: 1, name: { 'it-IT': ' Zuppa ' } })).toEqual({ name: { 'it-IT': 'Zuppa', 'en-GB': '' }, description: { 'it-IT': '', 'en-GB': '' } });
	});
	it('gives the planner what it reads', () => {
		expect(toPlannerRecipe('r1', doc)).toEqual({
			id: 'r1', durationMinutes: 20, mealType: 'lunch', proteinGroup: 'fish', isFreshFish: false, carbohydrateGroup: 'pasta', category: 'other',
			hasVegetables: false, isHeavy: false, seasons: [], primaryIngredientId: 'tonno', bookId: null,
			ingredients: [{ ingredientId: 'pasta-corta', isOptional: false }, { ingredientId: 'tonno', isOptional: false }, { ingredientId: 'pomodori', isOptional: true }]
		});
	});
	it('replaces slugs with catalogue ids, keeps unresolved lines and refuses unknown slugs', () => {
		const ids: Record<string, string> = { 'pasta-corta': 'i1', tonno: 'i2', pomodori: 'i3' };
		const ref = { ingredientId: (s: string) => ids[s], bookId: () => undefined };
		expect(resolveReferences(doc, ref).ingredients?.map((l) => l.ingredientId)).toEqual(['i1', 'i2', 'i3']);
		const draft = { schemaVersion: 1 as const, name: { 'it-IT': 'Z' }, ingredients: [{ ...publishedExample.ingredients[0], ingredientId: null }] };
		expect(resolveReferences(draft, ref).ingredients?.[0].ingredientId).toBeNull();
		expect(() => resolveReferences(doc, { ingredientId: () => undefined, bookId: () => undefined })).toThrow(/pasta-corta/);
	});
});
```

```ts
// domain/src/recipe/ingredient.test.ts
import { describe, expect, it } from 'vitest';
import { catalogueIngredientSchema } from './ingredient.ts';

const tomatoes = { slug: 'pomodori', name: { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, synonyms: { 'it-IT': ['pomodoro'], 'en-GB': ['tomato'] }, department: 'produce', isPantry: false };

describe('catalogue ingredient', () => {
	it('accepts a generic product with both names', () => {
		expect(catalogueIngredientSchema.safeParse(tomatoes).success).toBe(true);
	});
	it('refuses a bad slug, a blank name or an unknown department', () => {
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, slug: 'Pomodori Roma' }).success).toBe(false);
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, name: { 'it-IT': 'Pomodori', 'en-GB': ' ' } }).success).toBe(false);
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, department: 'greengrocer' }).success).toBe(false);
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run domain/src/recipe/projection.test.ts domain/src/recipe/ingredient.test.ts`
Expected: FAIL, moduli inesistenti.

- [ ] **Passo 3: implementare**

```ts
// domain/src/recipe/projection.ts
import type { PlannerRecipe } from '../planner/index.ts';
import { varietyKey } from '../shopping/index.ts';
import type { Translated, UnitCode } from '../units/index.ts';
import type { RecipeDocument, RecipeDraftDocument } from './document.ts';
import type { DraftTranslated } from './localized.ts';

// Projections of the current published version (spec section 2): columns of recipes and rows of
// recipe_ingredients, recomputed in the transaction that publishes or restores. camelCase here, snake_case
// in the database (interface for W2 in the detail spec).

export type RecipeProjection = Omit<RecipeDocument, 'schemaVersion' | 'ingredients'>;

export interface RecipeIngredientProjection {
	position: number;
	ingredientId: string;
	variety: Translated | null;
	varietyKey: string;
	quantityKind: 'amount' | 'to_taste' | 'text';
	quantity: number | null;
	unit: UnitCode | null;
	quantityText: Translated | null;
	sourceText: string;
	preparation: Translated | null;
	isOptional: boolean;
	isPrimary: boolean;
}

export function projectRecipe(d: RecipeDocument): { recipe: RecipeProjection; ingredients: RecipeIngredientProjection[] } {
	const { schemaVersion: _version, ingredients, ...recipe } = d;
	return {
		recipe,
		ingredients: ingredients.map((line, position) => ({
			position,
			ingredientId: line.ingredientId,
			variety: line.variety,
			varietyKey: varietyKey(line.variety?.['it-IT'] ?? ''),
			quantityKind: line.quantity.kind,
			quantity: line.quantity.kind === 'amount' ? line.quantity.value : null,
			unit: line.quantity.kind === 'amount' ? line.quantity.unit : null,
			quantityText: line.quantity.kind === 'text' ? line.quantity.text : null,
			sourceText: line.sourceText,
			preparation: line.preparation,
			isOptional: line.isOptional,
			isPrimary: line.isPrimary
		}))
	};
}

/**
 * Name and description of a recipe never published, written to recipes by the import and at every save of
 * its draft, so that members see the name of the meals citing it (coordinator, 11 October 2026).
 */
export function projectDraftNames(d: RecipeDraftDocument): { name: Translated; description: Translated } {
	const full = (v: DraftTranslated | null | undefined): Translated => ({ 'it-IT': v?.['it-IT']?.trim() ?? '', 'en-GB': v?.['en-GB']?.trim() ?? '' });
	return { name: full(d.name), description: full(d.description) };
}

/** What the planner reads (domain/src/planner/types.ts), from a published document. */
export function toPlannerRecipe(id: string, d: RecipeDocument): PlannerRecipe {
	return {
		id,
		durationMinutes: d.durationMinutes,
		mealType: d.mealType,
		proteinGroup: d.proteinGroup,
		isFreshFish: d.isFreshFish,
		carbohydrateGroup: d.carbohydrateGroup,
		category: d.category,
		hasVegetables: d.hasVegetables,
		isHeavy: d.isHeavy,
		seasons: d.seasons,
		primaryIngredientId: d.ingredients.find((l) => l.isPrimary)?.ingredientId ?? null,
		ingredients: d.ingredients.map((l) => ({ ingredientId: l.ingredientId, isOptional: l.isOptional })),
		bookId: d.bookId
	};
}

export interface ReferenceLookup {
	ingredientId(slug: string): string | undefined;
	bookId(slug: string): string | undefined;
}

/** The import refers to ingredients and books by slug; writing to the database needs their ids. */
export function resolveReferences<T extends RecipeDraftDocument>(d: T, lookup: ReferenceLookup): T {
	const resolve = (kind: 'ingredient' | 'book', slug: string) => {
		const id = kind === 'ingredient' ? lookup.ingredientId(slug) : lookup.bookId(slug);
		if (!id) throw new Error(`Unknown ${kind} slug: ${slug}`);
		return id;
	};
	return {
		...d,
		bookId: d.bookId ? resolve('book', d.bookId) : d.bookId,
		ingredients: d.ingredients?.map((l) => ({ ...l, ingredientId: l.ingredientId === null ? null : resolve('ingredient', l.ingredientId) }))
	};
}
```

```ts
// domain/src/recipe/ingredient.ts
import * as z from 'zod';
import { DEPARTMENTS } from '../shopping/index.ts';
import { translatedTextSchema } from '../units/index.ts';

const synonym = z.string().trim().min(1);

/** A catalogue ingredient: the generic product, without variety, size or preparation (spec section 8). */
export const catalogueIngredientSchema = z.strictObject({
	slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	name: translatedTextSchema,
	synonyms: z.strictObject({ 'it-IT': z.array(synonym), 'en-GB': z.array(synonym) }),
	department: z.enum(DEPARTMENTS),
	isPantry: z.boolean()
});
export type CatalogueIngredient = z.infer<typeof catalogueIngredientSchema>;
```

```ts
// domain/src/recipe/index.ts
export * from './localized.ts';
export * from './document.ts';
export * from './issues.ts';
export * from './variety.ts';
export * from './clean.ts';
export * from './check.ts';
export * from './projection.ts';
export * from './ingredient.ts';
```

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run domain/src/recipe && npx tsc -p domain/tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add domain/src/recipe
git commit -m "Ricetta: proiezioni, ingrediente del catalogo e indice del modulo"
```

---

### Compito 7: quantità dell'origine

**File:**
- Crea: `scripts/import/quantity.ts`
- Test: `scripts/import/quantity.test.ts`

**Interfacce:**
- Consuma: `UnitCode` di W4.
- Produce: `OriginQuantity` (`{ kind: 'amount', value, unit } | { kind: 'to_taste' } |
  { kind: 'text' }`), `QuantityNote` (`'approximate' | 'bracket_note' | null`),
  `parseOriginQuantity(raw: string | number): { quantity: OriginQuantity; note: QuantityNote }`.

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// scripts/import/quantity.test.ts
import { describe, expect, it } from 'vitest';
import { parseOriginQuantity } from './quantity.ts';

const q = (raw: string | number) => parseOriginQuantity(raw);

describe('origin quantities', () => {
	it('reads amounts, fractions, decimals and bare numbers, also as YAML numbers', () => {
		expect(q('300 g')).toEqual({ quantity: { kind: 'amount', value: 300, unit: 'g' }, note: null });
		expect(q('1/2')).toEqual({ quantity: { kind: 'amount', value: 0.5, unit: 'piece' }, note: null });
		expect(q('1,5 kg').quantity).toEqual({ kind: 'amount', value: 1.5, unit: 'kg' });
		expect(q(2).quantity).toEqual({ kind: 'amount', value: 2, unit: 'piece' });
	});
	it('maps Italian unit words', () => {
		expect(q('3 cucchiai').quantity).toEqual({ kind: 'amount', value: 3, unit: 'tbsp' });
		expect(q('1 cucchiaino').quantity).toEqual({ kind: 'amount', value: 1, unit: 'tsp' });
		expect(q('2 spicchi').quantity).toEqual({ kind: 'amount', value: 2, unit: 'clove' });
		expect(q('1 pizzico').quantity).toEqual({ kind: 'amount', value: 1, unit: 'pinch' });
		expect(q('3 rametti').quantity).toEqual({ kind: 'amount', value: 3, unit: 'sprig' });
		expect(q('1 mazzetto').quantity).toEqual({ kind: 'amount', value: 1, unit: 'bunch' });
		expect(q('1 foglia').quantity).toEqual({ kind: 'amount', value: 1, unit: 'leaf' });
		expect(q('8 fette').quantity).toEqual({ kind: 'amount', value: 8, unit: 'slice' });
		expect(q('1/2 cup').quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
	});
	it('keeps notes and approximations as findings, also when falling back to text', () => {
		expect(q('3 cucchiai circa')).toEqual({ quantity: { kind: 'amount', value: 3, unit: 'tbsp' }, note: 'approximate' });
		expect(q('1/2 cup (circa 1/2 cipolla media)')).toEqual({ quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' }, note: 'bracket_note' });
		// Real case of the origin: raw and cooked weights differ, so it stays text and is reported.
		expect(q('145 g crudo (330 g cotto)')).toEqual({ quantity: { kind: 'text' }, note: 'bracket_note' });
	});
	it('reads to taste and leaves everything else as text', () => {
		expect(q('q.b.').quantity).toEqual({ kind: 'to_taste' });
		expect(q('a piacere').quantity).toEqual({ kind: 'to_taste' });
		for (const raw of ['1-2 foglie', '1 vaschetta da 250 g', 'un piccolo pezzo', '1 bicchiere', '1 cucchiaino abbondante', 'per servire, facoltativo'])
			expect(q(raw)).toEqual({ quantity: { kind: 'text' }, note: null });
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/quantity.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Passo 3: implementare**

```ts
// scripts/import/quantity.ts
import type { UnitCode } from '../../domain/src/units/index.ts';

// Quantities of the origin recipe book, written in Italian. Anything not clearly an amount stays text
// (ranges and packages are text), so nothing is guessed; notes are reported either way.

export type OriginQuantity = { kind: 'amount'; value: number; unit: UnitCode } | { kind: 'to_taste' } | { kind: 'text' };
export type QuantityNote = 'approximate' | 'bracket_note' | null;

const UNIT_WORDS: Record<string, UnitCode> = {
	g: 'g', kg: 'kg', ml: 'ml', l: 'l', oz: 'oz', cup: 'us_cup', cups: 'us_cup',
	cucchiaio: 'tbsp', cucchiai: 'tbsp', cucchiaino: 'tsp', cucchiaini: 'tsp',
	spicchio: 'clove', spicchi: 'clove', fetta: 'slice', fette: 'slice', pizzico: 'pinch', pizzichi: 'pinch',
	rametto: 'sprig', rametti: 'sprig', mazzetto: 'bunch', mazzetti: 'bunch', foglia: 'leaf', foglie: 'leaf'
};
const TO_TASTE = new Set(['q.b.', 'qb', 'a piacere']);

function parseNumber(token: string): number | null {
	if (/^\d+\/\d+$/.test(token)) {
		const [numerator, denominator] = token.split('/').map(Number);
		return denominator > 0 ? numerator / denominator : null;
	}
	return /^\d+(?:[.,]\d+)?$/.test(token) ? Number(token.replace(',', '.')) : null;
}

export function parseOriginQuantity(raw: string | number): { quantity: OriginQuantity; note: QuantityNote } {
	const lower = String(raw).trim().toLowerCase();
	const withoutBracket = lower.replace(/\s*\([^)]*\)$/, '');
	const bracket: QuantityNote = withoutBracket !== lower ? 'bracket_note' : null;
	const text = { quantity: { kind: 'text' } as OriginQuantity, note: bracket };
	if (TO_TASTE.has(withoutBracket)) return { quantity: { kind: 'to_taste' }, note: bracket };
	const parts = withoutBracket.split(/\s+/);
	const value = parseNumber(parts[0]);
	if (value === null || value <= 0) return text;
	let unit: UnitCode = 'piece';
	let rest = parts.slice(1);
	if (rest.length && UNIT_WORDS[rest[0]]) {
		unit = UNIT_WORDS[rest[0]];
		rest = rest.slice(1);
	}
	let note = bracket;
	if (rest.length === 1 && rest[0] === 'circa') note ??= 'approximate';
	else if (rest.length) return text;
	return { quantity: { kind: 'amount', value, unit }, note };
}
```

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run scripts/import/quantity.test.ts && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add scripts/import/quantity.ts scripts/import/quantity.test.ts
git commit -m "Import: lettura delle quantità del ricettario d'origine"
```

---

### Compito 8: file d'ingresso e approvazione con impronta

**File:**
- Crea: `scripts/import/inputs.ts`
- Modifica: `scripts/planner-data/origin.ts` (campi facoltativi in `OriginRecipe`)
- Test: `scripts/import/inputs.test.ts`

**Interfacce:**
- Consuma: `catalogueIngredientSchema`, `CatalogueIngredient` (compito 6);
  `translatedTextSchema`, `Translated`, `unitCodeSchema`, `UnitEquivalence`,
  `unitEquivalenceSchema`, `preparationKey`, `assertUnambiguousEquivalences` di W4.
- Produce: `INPUT_FILES`, `contentHash(text)`, `approvalOf(text): { date: string | null;
  valid: boolean }`, `approveText(text, date): string`, `IngredientLineMapping`,
  `RecipeTranslation`, `ImportInputs`, `parseIngredients(text)`, `parseLines(text,
  slugs)`, `parseTranslations(text)`, `parseEquivalences(text, slugs)`,
  `readInputs(dir): ImportInputs`; `OriginRecipe` esteso. Il comando `approve.ts` arriva
  nel compito 10, quando c'è la validazione delle date.

- [ ] **Passo 1: estendere `OriginRecipe` senza cambiare comportamento**

```ts
// scripts/planner-data/origin.ts: interfaccia OriginRecipe
export interface OriginRecipe {
	id: string;
	nome: string;
	descrizione?: string;
	tipo: 'web' | 'youtube' | 'libro' | 'casa';
	url?: string | null;
	tempo?: string | null;
	libro?: { titolo: string; pagine?: string } | null;
	porzioni_base: number | null;
	ingredienti: { nome: string; quantita: string | number }[] | null;
	collaudata?: boolean;
	feedback: number | null;
	tag: string[];
	storico?: { settimana: string; pasto: string; cucinata: boolean | null }[] | null;
	dipendenze_libro?: unknown;
	note?: string | null;
}
```

Run: `npx vitest run scripts/planner-data && npx tsc -p tsconfig.json`
Expected: PASS (solo campi facoltativi aggiunti).

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// scripts/import/inputs.test.ts
import { describe, expect, it } from 'vitest';
import { approvalOf, approveText, contentHash, parseEquivalences, parseIngredients, parseLines, parseTranslations } from './inputs.ts';

const ingredientsYaml = `ingredients:
  pomodori:
    name: { it-IT: Pomodori, en-GB: Tomatoes }
    synonyms: { it-IT: [pomodoro], en-GB: [tomato] }
    department: produce
    pantry: false
`;

describe('approval bound to the content', () => {
	it('records date and hash, and stays valid while the content is unchanged', () => {
		const approved = approveText(ingredientsYaml, '2026-10-12');
		expect(approved.split('\n')[0]).toBe(`# Revisione: 2026-10-12, rivisto dall'utente, sha256:${contentHash(ingredientsYaml)}`);
		expect(approvalOf(approved)).toEqual({ date: '2026-10-12', valid: true });
		expect(approvalOf(approveText(approved, '2026-10-13'))).toEqual({ date: '2026-10-13', valid: true });
	});
	it('becomes invalid after any change and is missing without the line', () => {
		const changed = `${approveText(ingredientsYaml, '2026-10-12')}  peperoni:\n    name: { it-IT: Peperoni, en-GB: Peppers }\n`;
		expect(approvalOf(changed)).toEqual({ date: '2026-10-12', valid: false });
		expect(approvalOf(ingredientsYaml)).toEqual({ date: null, valid: false });
	});
});

describe('import inputs', () => {
	it('reads the ingredient catalogue', () => {
		const { ingredients, errors } = parseIngredients(ingredientsYaml);
		expect(errors).toEqual([]);
		expect(ingredients).toEqual([{ slug: 'pomodori', name: { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, synonyms: { 'it-IT': ['pomodoro'], 'en-GB': ['tomato'] }, department: 'produce', isPantry: false }]);
		expect(parseIngredients('ingredients:\n  x:\n    name: { it-IT: X }\n').errors[0]).toMatch(/^x:/);
	});
	it('reads line mappings and refuses unknown ingredients', () => {
		const text = `lines:
  "Pomodoro a dadini (varietà Roma)":
    ingredient: pomodori
    variety: { it-IT: Roma, en-GB: Roma }
    preparation: { it-IT: a dadini, en-GB: diced }
    optional: false
  "Cetriolo":
    ingredient: cetrioli
    variety: null
    preparation: null
    optional: false
`;
		const { lines, errors } = parseLines(text, new Set(['pomodori']));
		expect(lines.get('Pomodoro a dadini (varietà Roma)')).toEqual({ ingredient: 'pomodori', variety: { 'it-IT': 'Roma', 'en-GB': 'Roma' }, preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' }, optional: false, note: null });
		expect(errors).toEqual(['Cetriolo: unknown ingredient "cetrioli"']);
	});
	it('reads translations', () => {
		const t = parseTranslations('recipes:\n  pasta-tonno: { name: Tuna pasta, description: Dress the pasta. }\nquantities:\n  "1 mazzetto": "1 bunch"\n');
		expect(t.errors).toEqual([]);
		expect(t.recipes.get('pasta-tonno')).toEqual({ name: 'Tuna pasta', description: 'Dress the pasta.' });
		expect(t.quantities.get('1 mazzetto')).toBe('1 bunch');
	});
	it('reads recipe equivalences with an optional preparation, normalised', () => {
		const e = parseEquivalences('equivalences:\n  - { ingredient: cipolle, from: us_cup, to: piece, factor: 1, preparation: A dadini, source: "Fonte: 1/2 cup = 1/2 cipolla" }\n  - { ingredient: cipolle, from: us_cup, to: g, factor: 160, source: "Tabella" }\n', new Set(['cipolle']));
		expect(e.errors).toEqual([]);
		expect(e.equivalences).toEqual([
			{ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: 'a dadini', source: 'Fonte: 1/2 cup = 1/2 cipolla' },
			{ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'g', factor: 160, scope: 'recipe', preparation: null, source: 'Tabella' }
		]);
		expect(parseEquivalences('equivalences:\n  - { ingredient: x, from: us_cup, to: piece, factor: 0, source: "" }\n', new Set()).errors.length).toBeGreaterThan(0);
		const twice = '  - { ingredient: cipolle, from: us_cup, to: g, factor: 1, source: a }\n';
		expect(parseEquivalences(`equivalences:\n${twice}${twice}`, new Set(['cipolle'])).errors.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Passo 3: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/inputs.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Passo 4: implementare**

```ts
// scripts/import/inputs.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import * as z from 'zod';
import { catalogueIngredientSchema, type CatalogueIngredient } from '../../domain/src/recipe/index.ts';
import {
	assertUnambiguousEquivalences, preparationKey, translatedTextSchema, unitCodeSchema, unitEquivalenceSchema, type Translated, type UnitEquivalence
} from '../../domain/src/units/index.ts';

// Reviewed inputs of the import (detail spec, section 4): YAML written by the agent, approved by the user
// with a header line bound to the content (review of 11 October 2026).

export const INPUT_FILES = ['ingredients.yaml', 'ingredient-lines.yaml', 'translations.en-GB.yaml', 'unit-equivalences.yaml'] as const;
const APPROVAL = /^# Revisione: (\d{4}-\d{2}-\d{2}), rivisto dall'utente, sha256:([0-9a-f]{64})\n/;

const withoutApproval = (text: string) => text.replace(APPROVAL, '');

/** SHA-256 of the file without its approval line. */
export const contentHash = (text: string) => createHash('sha256').update(withoutApproval(text)).digest('hex');

export function approvalOf(text: string): { date: string | null; valid: boolean } {
	const match = APPROVAL.exec(text);
	return match ? { date: match[1], valid: match[2] === contentHash(text) } : { date: null, valid: false };
}

/** The file with a fresh approval line: written only when the user says the review is done. */
export const approveText = (text: string, date: string) =>
	`# Revisione: ${date}, rivisto dall'utente, sha256:${contentHash(text)}\n${withoutApproval(text)}`;

export interface IngredientLineMapping {
	ingredient: string;
	variety: Translated | null;
	preparation: Translated | null;
	optional: boolean;
	note: string | null;
}
export interface RecipeTranslation {
	name: string;
	description: string;
}
export interface ImportInputs {
	ingredients: CatalogueIngredient[];
	lines: Map<string, IngredientLineMapping>;
	recipeTranslations: Map<string, RecipeTranslation>;
	quantityTranslations: Map<string, string>;
	equivalences: UnitEquivalence[];
	pendingReview: string[];
}

const explain = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ');
const section = (text: string, key: string): Record<string, unknown> => ((parse(text) as Record<string, unknown> | null)?.[key] ?? {}) as Record<string, unknown>;

const ingredientEntry = z.strictObject({
	name: translatedTextSchema,
	synonyms: catalogueIngredientSchema.shape.synonyms.optional(),
	department: catalogueIngredientSchema.shape.department,
	pantry: z.boolean()
});

export function parseIngredients(text: string): { ingredients: CatalogueIngredient[]; errors: string[] } {
	const ingredients: CatalogueIngredient[] = [];
	const errors: string[] = [];
	for (const [slug, raw] of Object.entries(section(text, 'ingredients'))) {
		const entry = ingredientEntry.safeParse(raw);
		if (!entry.success) {
			errors.push(`${slug}: ${explain(entry.error)}`);
			continue;
		}
		const ingredient = catalogueIngredientSchema.safeParse({ slug, name: entry.data.name, synonyms: entry.data.synonyms ?? { 'it-IT': [], 'en-GB': [] }, department: entry.data.department, isPantry: entry.data.pantry });
		if (ingredient.success) ingredients.push(ingredient.data);
		else errors.push(`${slug}: ${explain(ingredient.error)}`);
	}
	return { ingredients, errors };
}

const lineEntry = z.strictObject({ ingredient: z.string(), variety: translatedTextSchema.nullable(), preparation: translatedTextSchema.nullable(), optional: z.boolean(), note: z.string().nullable().optional() });

/** Entries no recipe of the bundle uses are allowed (cards already imported, rerun). */
export function parseLines(text: string, slugs: ReadonlySet<string>): { lines: Map<string, IngredientLineMapping>; errors: string[] } {
	const lines = new Map<string, IngredientLineMapping>();
	const errors: string[] = [];
	for (const [name, raw] of Object.entries(section(text, 'lines'))) {
		const entry = lineEntry.safeParse(raw);
		if (!entry.success) errors.push(`${name}: ${explain(entry.error)}`);
		else if (!slugs.has(entry.data.ingredient)) errors.push(`${name}: unknown ingredient "${entry.data.ingredient}"`);
		else lines.set(name, { ...entry.data, note: entry.data.note ?? null });
	}
	return { lines, errors };
}

const translationEntry = z.strictObject({ name: z.string().trim().min(1), description: z.string().trim().min(1) });

export function parseTranslations(text: string) {
	const recipes = new Map<string, RecipeTranslation>();
	const quantities = new Map<string, string>();
	const errors: string[] = [];
	for (const [slug, raw] of Object.entries(section(text, 'recipes'))) {
		const entry = translationEntry.safeParse(raw);
		if (entry.success) recipes.set(slug, entry.data);
		else errors.push(`recipes.${slug}: ${explain(entry.error)}`);
	}
	for (const [source, english] of Object.entries(section(text, 'quantities'))) {
		if (typeof english === 'string' && english.trim()) quantities.set(source, english.trim());
		else errors.push(`quantities.${source}: English text missing`);
	}
	return { recipes, quantities, errors };
}

const equivalenceEntry = z.strictObject({
	ingredient: z.string(),
	from: unitCodeSchema,
	to: unitCodeSchema,
	factor: z.number(),
	preparation: z.string().nullable().optional(),
	source: z.string()
});

/** Recipe-scope equivalences (US cups), with the preparation they are valid for (coordinator, 11 October 2026). */
export function parseEquivalences(text: string, slugs: ReadonlySet<string>): { equivalences: UnitEquivalence[]; errors: string[] } {
	const raw = ((parse(text) as { equivalences?: unknown[] } | null)?.equivalences ?? []) as unknown[];
	const equivalences: UnitEquivalence[] = [];
	const errors: string[] = [];
	raw.forEach((item, index) => {
		const entry = equivalenceEntry.safeParse(item);
		if (!entry.success) return errors.push(`equivalences.${index}: ${explain(entry.error)}`);
		if (!slugs.has(entry.data.ingredient)) return errors.push(`equivalences.${index}: unknown ingredient "${entry.data.ingredient}"`);
		const equivalence = unitEquivalenceSchema.safeParse({
			ingredientId: entry.data.ingredient, fromUnit: entry.data.from, toUnit: entry.data.to, factor: entry.data.factor,
			scope: 'recipe', preparation: preparationKey(entry.data.preparation), source: entry.data.source
		});
		if (equivalence.success) equivalences.push(equivalence.data);
		else errors.push(`equivalences.${index}: ${explain(equivalence.error)}`);
	});
	try {
		assertUnambiguousEquivalences(equivalences);
	} catch (error) {
		errors.push((error as Error).message);
	}
	return { equivalences, errors };
}

/** Reads the four files of scripts/import; every problem is reported at once. */
export function readInputs(dir: string): ImportInputs {
	const texts = Object.fromEntries(INPUT_FILES.map((f) => [f, readFileSync(resolve(dir, f), 'utf8')])) as Record<(typeof INPUT_FILES)[number], string>;
	const ingredients = parseIngredients(texts['ingredients.yaml']);
	const slugs = new Set(ingredients.ingredients.map((i) => i.slug));
	const lines = parseLines(texts['ingredient-lines.yaml'], slugs);
	const translations = parseTranslations(texts['translations.en-GB.yaml']);
	const equivalences = parseEquivalences(texts['unit-equivalences.yaml'], slugs);
	const errors = [...ingredients.errors, ...lines.errors, ...translations.errors, ...equivalences.errors];
	if (errors.length) throw new Error(`Import inputs are not valid:\n${errors.join('\n')}`);
	return {
		ingredients: ingredients.ingredients,
		lines: lines.lines,
		recipeTranslations: translations.recipes,
		quantityTranslations: translations.quantities,
		equivalences: equivalences.equivalences,
		pendingReview: INPUT_FILES.filter((f) => !approvalOf(texts[f]).valid)
	};
}
```

- [ ] **Passo 5: eseguire i test e verificare che passano**

Run: `npx vitest run scripts/import scripts/planner-data && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add scripts/import/inputs.ts scripts/import/inputs.test.ts scripts/planner-data/origin.ts
git commit -m "Import: file di mappatura e traduzione con approvazione legata al contenuto"
```

---

### Compito 9: dalla scheda d'origine al documento

**File:**
- Crea: `scripts/import/recipes.ts`, `scripts/import/test-fixtures.ts`
- Test: `scripts/import/recipes.test.ts`

**Interfacce:**
- Consuma: `OriginRecipe`, `slug`, `durationOf`; `RecipeAttributes`;
  `parseOriginQuantity`; `ImportInputs`; `findEquivalence`, `applyRecipeEquivalence` di
  W4; `lineKey`, `RecipeDraftDocument`, `DraftIngredientLine`, `DraftQuantity`,
  `SourceType`, `CatalogueLookup`.
- Produce: `OriginType`, `FindingKind`, `RecipeFinding`, `BuiltRecipe`,
  `buildRecipe(origin, attributes, inputs): BuiltRecipe`; fixture `originRecipe(over)`,
  `attributesFor(over)`, `inputsWith(over)`, `bundleLookup(bundle)`.

- [ ] **Passo 1: scrivere le fixture**

```ts
// scripts/import/test-fixtures.ts
import type { CatalogueLookup } from '../../domain/src/recipe/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import type { OriginRecipe } from '../planner-data/origin.ts';
import type { ImportInputs } from './inputs.ts';

export const originRecipe = (over: Partial<OriginRecipe> = {}): OriginRecipe => ({
	id: 'pasta-tonno', nome: 'Pasta al tonno', descrizione: 'Condisci la pasta col tonno.', tipo: 'casa', url: null, tempo: '20 min',
	libro: null, porzioni_base: 4,
	ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }],
	collaudata: true, feedback: 3, tag: ['pesce', 'pasta'], storico: [], note: null, ...over
});

export const attributesFor = (over: Partial<RecipeAttributes> = {}): RecipeAttributes => ({
	mealType: 'lunch', proteinGroup: 'fish', freshFish: false, carbohydrateGroup: 'pasta', category: 'other', hasVegetables: false,
	isHeavy: false, seasons: [], primaryIngredient: 'tonno-sott-olio', durationMinutes: null, uncertain: [], note: null, ...over
});

const named = (slug: string, it: string, en: string) => ({ slug, name: { 'it-IT': it, 'en-GB': en }, synonyms: { 'it-IT': [], 'en-GB': [] }, department: 'pasta_grains' as const, isPantry: false });
const plainLine = (ingredient: string) => ({ ingredient, variety: null, preparation: null, optional: false, note: null });

export const inputsWith = (over: Partial<ImportInputs> = {}): ImportInputs => ({
	ingredients: [named('pasta-corta', 'Pasta corta', 'Short pasta'), named('tonno', 'Tonno', 'Tuna'), named('cipolle', 'Cipolle', 'Onions')],
	lines: new Map([
		['Pasta corta', plainLine('pasta-corta')],
		["Tonno sott'olio", { ...plainLine('tonno'), preparation: { 'it-IT': "sott'olio", 'en-GB': 'in oil' } }],
		['Cipolla a dadini', { ...plainLine('cipolle'), preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' } }],
		['Cipolla', plainLine('cipolle')],
		['Cipolla (o 1 cipollotto)', plainLine('cipolle')]
	]),
	recipeTranslations: new Map([['pasta-tonno', { name: 'Tuna pasta', description: 'Dress the pasta with tuna.' }]]),
	quantityTranslations: new Map([['1 vaschetta da 250 g', '1 punnet (250 g)']]),
	equivalences: [],
	pendingReview: [],
	...over
});

/** The catalogue of a bundle as the checks see it. */
export const bundleLookup = (bundle: { ingredients: { slug: string }[]; books: { slug: string }[] }): CatalogueLookup => ({
	hasIngredient: (id) => bundle.ingredients.some((i) => i.slug === id),
	ingredientHasEnglishName: () => true,
	hasBook: (id) => bundle.books.some((b) => b.slug === id)
});
```

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// scripts/import/recipes.test.ts
import { describe, expect, it } from 'vitest';
import { checkDraft, checkPublishable } from '../../domain/src/recipe/index.ts';
import type { UnitEquivalence } from '../../domain/src/units/index.ts';
import { buildRecipe } from './recipes.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

const inputs = inputsWith();
const lookup = {
	hasIngredient: (id: string) => inputs.ingredients.some((x) => x.slug === id),
	ingredientHasEnglishName: () => true,
	hasBook: (id: string) => id === 'basta-un-wok'
};
const kinds = (r: ReturnType<typeof buildRecipe>) => r.findings.map((f) => f.kind);
const publication = (r: ReturnType<typeof buildRecipe>) => checkPublishable(r.document, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const noPrimary = attributesFor({ primaryIngredient: null });
const cup = (over: Partial<UnitEquivalence>): UnitEquivalence => ({ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: null, source: 'Fonte', ...over });

describe('buildRecipe', () => {
	it('builds a publishable document for a home recipe with verified lines', () => {
		const built = buildRecipe(originRecipe(), attributesFor(), inputs);
		expect(built.origin).toEqual({ slug: 'pasta-tonno', type: 'casa' });
		expect(built.document).toMatchObject({ sourceType: 'home', sourceUrl: null, durationMinutes: 20, baseServings: 4, name: { 'it-IT': 'Pasta al tonno', 'en-GB': 'Tuna pasta' } });
		expect(built.document.ingredients?.[1]).toMatchObject({ ingredientId: 'tonno', quantity: { kind: 'to_taste' }, sourceText: "Tonno sott'olio: q.b.", isPrimary: true });
		expect(publication(built)).toEqual([]);
		expect(built.findings).toEqual([]);
	});
	it('imports a home recipe with a URL as web and reports it (R4b)', () => {
		const built = buildRecipe(originRecipe({ url: 'https://www.fattoincasadabenedetta.it/x', note: "URL fornito dall'utente. Con il frullatore a immersione della famiglia." }), attributesFor(), inputs);
		expect(built.document).toMatchObject({ sourceType: 'web', sourceUrl: 'https://www.fattoincasadabenedetta.it/x' });
		expect(built.origin.type).toBe('casa');
		expect(kinds(built)).toContain('home_with_url');
	});
	it('maps books by title slug and pages', () => {
		const built = buildRecipe(originRecipe({ tipo: 'libro', libro: { titolo: 'Basta un Wok', pagine: '76-77' }, dipendenze_libro: ['p. 24'] }), attributesFor(), inputs);
		expect(built.document).toMatchObject({ sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' });
		expect(kinds(built)).toContain('book_dependency');
	});
	it('keeps unmapped lines as unresolved lines, without approximate matching', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: 'pasta  Corta', quantita: '10 g' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[1]).toEqual({ ingredientId: null, variety: null, preparation: null, quantity: { kind: 'amount', value: 10, unit: 'g' }, sourceText: 'pasta  Corta: 10 g', isOptional: false, isPrimary: false });
		expect(built.findings).toContainEqual({ kind: 'unmapped_line', detail: 'pasta  Corta' });
		expect(checkDraft(built.document, lookup)).toEqual([]);
		expect(publication(built)).toEqual(['required:ingredients.1.ingredientId']);
	});
	it('keeps both lines when two map to the same ingredient and variety', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '1 vaschetta da 250 g' }, { nome: 'Pasta corta', quantita: 'un piccolo pezzo' }] }), noPrimary, inputs);
		expect(built.document.ingredients).toHaveLength(2);
		expect(built.document.ingredients?.[0].quantity).toEqual({ kind: 'text', text: { 'it-IT': '1 vaschetta da 250 g', 'en-GB': '1 punnet (250 g)' } });
		expect(kinds(built)).toContain('duplicate_after_mapping');
		expect(publication(built)).toEqual(['duplicate_ingredient:ingredients.1.ingredientId', 'translation_missing:ingredients.1.quantity.text.en-GB']);
	});
	it('keeps a recipe without lines, servings or attributes as a draft with what it has', () => {
		const built = buildRecipe(originRecipe({ ingredienti: null, porzioni_base: null }), undefined, inputs);
		expect(built.document.ingredients).toEqual([]);
		expect(kinds(built)).toContain('missing_attributes');
		expect(publication(built)).toEqual([
			'required:baseServings', 'required:mealType', 'required:proteinGroup', 'required:isFreshFish', 'required:carbohydrateGroup',
			'required:category', 'required:hasVegetables', 'required:isHeavy', 'required:ingredients'
		]);
	});
	it('converts US cups only with an equivalence of the same preparation or of none', () => {
		const lines = [{ nome: 'Cipolla a dadini', quantita: '1/2 cup (circa 1/2 cipolla media)' }];
		const build = (equivalences: UnitEquivalence[]) => buildRecipe(originRecipe({ ingredienti: lines }), noPrimary, inputsWith({ equivalences }));
		const without = build([]);
		expect(without.document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
		expect(kinds(without)).toEqual(expect.arrayContaining(['quantity_note', 'cup_without_equivalence']));
		expect(build([cup({ preparation: 'a dadini' })]).document.ingredients?.[0]).toMatchObject({ quantity: { kind: 'amount', value: 0.5, unit: 'piece' }, sourceText: 'Cipolla a dadini: 1/2 cup (circa 1/2 cipolla media)' });
		expect(build([cup({ preparation: null, toUnit: 'g', factor: 160 })]).document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 80, unit: 'g' });
		expect(build([cup({ preparation: 'tritata' })]).document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
	});
	it('reports quantities with notes, also when they stay text', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '145 g crudo (330 g cotto)' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[0].quantity).toEqual({ kind: 'text', text: { 'it-IT': '145 g crudo (330 g cotto)', 'en-GB': '' } });
		expect(built.findings).toContainEqual({ kind: 'quantity_note', detail: 'Pasta corta: 145 g crudo (330 g cotto)' });
	});
	it('reports alternatives in names, mapping notes and pantry items excluded in the origin', () => {
		const pantry = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }], note: 'Olio, sale e pepe esclusi.' }), noPrimary, inputs);
		expect(kinds(pantry)).toContain('pantry_excluded');
		const noted = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }] }), noPrimary, inputsWith({ lines: new Map([['Pasta corta', { ingredient: 'pasta-corta', variety: null, preparation: null, optional: false, note: 'o Pasta lunga' }]]) }));
		expect(kinds(noted)).toContain('mapping_note');
		expect(kinds(buildRecipe(originRecipe({ ingredienti: [{ nome: 'Cipolla', quantita: '1' }] }), noPrimary, inputs))).not.toContain('alternative_in_name');
		expect(kinds(buildRecipe(originRecipe({ ingredienti: [{ nome: 'Cipolla (o 1 cipollotto)', quantita: '1' }] }), noPrimary, inputs))).toContain('alternative_in_name');
	});
	it('marks optional lines from the mapping or the quantity text', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: 'per servire, facoltativo' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[0].isOptional).toBe(true);
	});
	it('leaves English recipe texts empty without a translation', () => {
		const built = buildRecipe(originRecipe({ id: 'altra' }), attributesFor(), inputs);
		expect(built.document.name).toEqual({ 'it-IT': 'Pasta al tonno', 'en-GB': '' });
	});
});
```

- [ ] **Passo 3: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/recipes.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Passo 4: implementare**

```ts
// scripts/import/recipes.ts
import { lineKey, type DraftIngredientLine, type DraftQuantity, type RecipeDraftDocument, type SourceType } from '../../domain/src/recipe/index.ts';
import { applyRecipeEquivalence, findEquivalence } from '../../domain/src/units/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import { durationOf, slug, type OriginRecipe } from '../planner-data/origin.ts';
import type { ImportInputs } from './inputs.ts';
import { parseOriginQuantity } from './quantity.ts';

// One origin card → one recipe document (detail spec, section 4). Ingredients only from the card's own
// lines; every obstacle stays in the document (unresolved or duplicate lines, missing data), so it survives
// bundle.json and the draft save. Findings only explain them in the report.

export type OriginType = OriginRecipe['tipo'];

export type FindingKind =
	| 'home_with_url' | 'book_dependency' | 'unmapped_line' | 'duplicate_after_mapping' | 'quantity_note' | 'cup_without_equivalence'
	| 'mapping_note' | 'alternative_in_name' | 'pantry_excluded' | 'missing_attributes';
export interface RecipeFinding {
	kind: FindingKind;
	detail: string;
}

export interface BuiltRecipe {
	origin: { slug: string; type: OriginType };
	document: RecipeDraftDocument;
	findings: RecipeFinding[];
}

const SOURCE_TYPE: Record<OriginType, SourceType> = { web: 'web', youtube: 'youtube', libro: 'book', casa: 'home' };
const OPTIONAL = /facoltativ|opzional/i;
const ALTERNATIVE = /\((?:o|oppure) |\boppure\b| o [a-zà-ù0-9]/i;
const BOOK_PAGE = /pagina \d+ del libro/i;

function lineQuantity(raw: string | number, ingredient: string | null, preparation: string | null, inputs: ImportInputs, findings: RecipeFinding[], sourceText: string): DraftQuantity {
	const { quantity, note } = parseOriginQuantity(raw);
	if (note) findings.push({ kind: 'quantity_note', detail: sourceText });
	if (quantity.kind === 'text') {
		const italian = String(raw).trim();
		return { kind: 'text', text: { 'it-IT': italian, 'en-GB': inputs.quantityTranslations.get(italian) ?? '' } };
	}
	if (quantity.kind === 'amount' && quantity.unit === 'us_cup') {
		// W4 picks the equivalence of the line's preparation, otherwise one without preparation, never another one.
		const own = ingredient ? inputs.equivalences.filter((e) => e.ingredientId === ingredient) : [];
		const equivalence = findEquivalence(own, 'recipe', 'us_cup', preparation);
		if (equivalence) return applyRecipeEquivalence(quantity, equivalence);
		findings.push({ kind: 'cup_without_equivalence', detail: sourceText });
	}
	return quantity;
}

export function buildRecipe(origin: OriginRecipe, attributes: RecipeAttributes | undefined, inputs: ImportInputs): BuiltRecipe {
	const findings: RecipeFinding[] = [];
	const sourceType = origin.tipo === 'casa' && origin.url ? 'web' : SOURCE_TYPE[origin.tipo];
	if (origin.tipo === 'casa' && origin.url) findings.push({ kind: 'home_with_url', detail: origin.note ?? origin.url });
	if (origin.dipendenze_libro) findings.push({ kind: 'book_dependency', detail: JSON.stringify(origin.dipendenze_libro) });
	if (origin.note && /esclus/i.test(origin.note) && /olio|sale|pepe/i.test(origin.note)) findings.push({ kind: 'pantry_excluded', detail: origin.note });
	if (!attributes) findings.push({ kind: 'missing_attributes', detail: origin.id });

	const seen = new Set<string>();
	const lines: DraftIngredientLine[] = (origin.ingredienti ?? []).map((line) => {
		const sourceText = `${line.nome}: ${line.quantita}`;
		const mapping = inputs.lines.get(line.nome);
		const optional = OPTIONAL.test(String(line.quantita));
		if (!mapping) {
			findings.push({ kind: 'unmapped_line', detail: line.nome });
			return { ingredientId: null, variety: null, preparation: null, quantity: lineQuantity(line.quantita, null, null, inputs, findings, sourceText), sourceText, isOptional: optional, isPrimary: false };
		}
		if (ALTERNATIVE.test(line.nome)) findings.push({ kind: 'alternative_in_name', detail: line.nome });
		if (BOOK_PAGE.test(line.nome)) findings.push({ kind: 'book_dependency', detail: line.nome });
		if (mapping.note) findings.push({ kind: 'mapping_note', detail: `${line.nome}: ${mapping.note}` });
		const key = lineKey({ ingredientId: mapping.ingredient, variety: mapping.variety });
		if (seen.has(key)) findings.push({ kind: 'duplicate_after_mapping', detail: sourceText });
		seen.add(key);
		return {
			ingredientId: mapping.ingredient,
			variety: mapping.variety,
			preparation: mapping.preparation,
			quantity: lineQuantity(line.quantita, mapping.ingredient, mapping.preparation?.['it-IT'] ?? null, inputs, findings, sourceText),
			sourceText,
			isOptional: mapping.optional || optional,
			isPrimary: attributes?.primaryIngredient === slug(line.nome)
		};
	});

	const english = inputs.recipeTranslations.get(origin.id);
	const document: RecipeDraftDocument = {
		schemaVersion: 1,
		name: { 'it-IT': origin.nome, 'en-GB': english?.name ?? '' },
		description: { 'it-IT': origin.descrizione ?? '', 'en-GB': english?.description ?? '' },
		sourceType,
		sourceUrl: origin.url ?? null,
		bookId: origin.libro ? slug(origin.libro.titolo) : null,
		bookPages: origin.libro?.pagine ?? null,
		durationMinutes: attributes?.durationMinutes ?? durationOf(origin.tempo),
		baseServings: origin.porzioni_base,
		mealType: attributes?.mealType ?? null,
		proteinGroup: attributes?.proteinGroup ?? null,
		isFreshFish: attributes?.freshFish ?? null,
		carbohydrateGroup: attributes?.carbohydrateGroup ?? null,
		category: attributes?.category ?? null,
		hasVegetables: attributes?.hasVegetables ?? null,
		isHeavy: attributes?.isHeavy ?? null,
		seasons: attributes?.seasons ?? [],
		ingredients: lines
	};
	return { origin: { slug: origin.id, type: origin.tipo }, document, findings };
}
```

- [ ] **Passo 5: eseguire i test e verificare che passano**

Run: `npx vitest run scripts/import && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Passo 6: commit**

```bash
git add scripts/import/recipes.ts scripts/import/recipes.test.ts scripts/import/test-fixtures.ts
git commit -m "Import: dalla scheda d'origine al documento, con righe irrisolte e duplicate conservate"
```

---

### Compito 10: dati della famiglia e comando di approvazione

**File:**
- Crea: `scripts/import/family.ts`, `scripts/import/approve.ts`
- Test: `scripts/import/family.test.ts`

**Interfacce:**
- Consuma: `OriginRecipe`, `familyScoresOf`; `addDays`, `IsoDate`, `MealType` del
  pianificatore; `approveText` (compito 8).
- Produce: `isValidIsoDate(text)`, `isMonday(date)`, `FamilyData`,
  `HistoryFindingKind`, `HistoryFinding`, `buildFamilyData(recipes, importDate)`;
  comando `approve.ts`.

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// scripts/import/family.test.ts
import { describe, expect, it } from 'vitest';
import { buildFamilyData, isMonday, isValidIsoDate } from './family.ts';
import { originRecipe } from './test-fixtures.ts';

const week = '2026-09-28'; // Monday; Sunday is 2026-10-04

describe('dates', () => {
	it('accepts only existing YYYY-MM-DD dates', () => {
		expect(isValidIsoDate('2026-10-12')).toBe(true);
		expect(isValidIsoDate('2026-02-30')).toBe(false);
		expect(isValidIsoDate('2026-10-1')).toBe(false);
		expect(isValidIsoDate('domani')).toBe(false);
	});
	it('knows Mondays', () => {
		expect(isMonday('2026-09-28')).toBe(true);
		expect(isMonday('2026-09-29')).toBe(false);
	});
});

describe('family data', () => {
	it("converts B feedback to the curator's stars", () => {
		const { family } = buildFamilyData([originRecipe({ id: 'a', feedback: 4 }), originRecipe({ id: 'b', feedback: null })], '2026-10-12');
		expect(family.ratings).toEqual([{ originSlug: 'a', stars: 5 }]);
	});
	it('imports cooked meals and leaves out the ones not cooked (R4c)', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [{ settimana: week, pasto: 'lun-cena', cucinata: true }, { settimana: week, pasto: 'mar-pranzo', cucinata: false }] })], '2026-10-12');
		expect(family.meals).toEqual([{ date: '2026-09-28', mealType: 'dinner', originSlug: 'a' }]);
		expect(findings).toEqual([{ kind: 'not_cooked', originSlug: 'a', week, slot: 'mar-pranzo' }]);
	});
	it('counts a missing outcome as eaten only in a concluded week', () => {
		const entries = [{ settimana: week, pasto: 'gio-cena', cucinata: null }];
		const concluded = buildFamilyData([originRecipe({ id: 'a', storico: entries })], '2026-10-05');
		expect(concluded.family.meals).toEqual([{ date: '2026-10-01', mealType: 'dinner', originSlug: 'a' }]);
		expect(concluded.findings.map((f) => f.kind)).toEqual(['outcome_not_recorded']);
		const open = buildFamilyData([originRecipe({ id: 'a', storico: entries })], '2026-10-04');
		expect(open.family.meals).toEqual([]);
		expect(open.findings.map((f) => f.kind)).toEqual(['week_not_concluded']);
	});
	it('discards unrecognised days and meals', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [{ settimana: week, pasto: 'lunedi-cena', cucinata: true }, { settimana: week, pasto: 'mar-merenda', cucinata: true }] })], '2026-10-12');
		expect(family.meals).toEqual([]);
		expect(findings.map((f) => f.kind)).toEqual(['unrecognised_slot', 'unrecognised_slot']);
	});
	it('discards weeks that do not exist or do not start on Monday, without dating them', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [
			{ settimana: '2026-02-30', pasto: 'lun-cena', cucinata: true },
			{ settimana: '2026-09-29', pasto: 'lun-cena', cucinata: true },
			{ settimana: 'settembre', pasto: 'lun-cena', cucinata: true }
		] })], '2026-10-12');
		expect(family.meals).toEqual([]);
		expect(findings.map((f) => f.kind)).toEqual(['invalid_week', 'invalid_week', 'invalid_week']);
	});
	it('refuses an invalid import date', () => {
		expect(() => buildFamilyData([], '2026-13-01')).toThrow(/import date/);
	});
	it('records tried recipes without imported meals, without inventing meals (R4a)', () => {
		const { family } = buildFamilyData([originRecipe({ id: 'a', collaudata: true, storico: [] }), originRecipe({ id: 'b', collaudata: true, storico: [{ settimana: week, pasto: 'lun-cena', cucinata: true }] }), originRecipe({ id: 'c', collaudata: false })], '2026-10-12');
		expect(family.triedUndated).toEqual(['a']);
		expect(family.meals.map((m) => m.originSlug)).toEqual(['b']);
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/family.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Passo 3: implementare**

```ts
// scripts/import/family.ts
import { addDays, type IsoDate, type MealType } from '../../domain/src/planner/index.ts';
import { familyScoresOf, type OriginRecipe } from '../planner-data/origin.ts';

// Data of the curator's family from the origin (spec section 8), with the R4 rules of 11 October 2026.
// triedUndated goes to W2's family_tried_recipes (source 'import'); the planner does not use it yet.

export interface FamilyData {
	ratings: { originSlug: string; stars: number }[];
	meals: { date: IsoDate; mealType: MealType; originSlug: string }[];
	/** Tried in the origin ("collaudata") with no meal imported: no meal is invented (R4a). */
	triedUndated: string[];
}
export type HistoryFindingKind = 'not_cooked' | 'outcome_not_recorded' | 'week_not_concluded' | 'unrecognised_slot' | 'invalid_week';
export interface HistoryFinding {
	kind: HistoryFindingKind;
	originSlug: string;
	week: string;
	slot: string;
}

const DAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const MEALS: Record<string, MealType> = { pranzo: 'lunch', cena: 'dinner' };

/** An existing calendar date written YYYY-MM-DD: 2026-02-30 is not normalised to March. */
export function isValidIsoDate(text: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
	const [year, month, day] = text.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isMonday = (date: IsoDate) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

export function buildFamilyData(recipes: OriginRecipe[], importDate: IsoDate): { family: FamilyData; findings: HistoryFinding[] } {
	if (!isValidIsoDate(importDate)) throw new Error(`Invalid import date: ${importDate}`);
	const meals: FamilyData['meals'] = [];
	const findings: HistoryFinding[] = [];
	for (const recipe of recipes) {
		for (const entry of recipe.storico ?? []) {
			const week = String(entry.settimana);
			const report = (kind: HistoryFindingKind) => findings.push({ kind, originSlug: recipe.id, week, slot: entry.pasto });
			if (!isValidIsoDate(week) || !isMonday(week)) {
				report('invalid_week');
				continue;
			}
			const [day, meal, ...extra] = entry.pasto.split('-');
			const dayIndex = DAYS.indexOf(day);
			if (dayIndex < 0 || !MEALS[meal] || extra.length) {
				report('unrecognised_slot');
				continue;
			}
			if (entry.cucinata === false) {
				report('not_cooked');
				continue;
			}
			if (entry.cucinata === null) {
				if (addDays(week, 6) >= importDate) {
					report('week_not_concluded');
					continue;
				}
				report('outcome_not_recorded');
			}
			meals.push({ date: addDays(week, dayIndex), mealType: MEALS[meal], originSlug: recipe.id });
		}
	}
	meals.sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType) || a.originSlug.localeCompare(b.originSlug));
	const withMeals = new Set(meals.map((m) => m.originSlug));
	const ratings = Object.entries(familyScoresOf(recipes)).map(([originSlug, stars]) => ({ originSlug, stars }));
	const triedUndated = recipes.filter((r) => r.collaudata && !withMeals.has(r.id)).map((r) => r.id);
	return { family: { ratings, meals, triedUndated }, findings };
}
```

```ts
// scripts/import/approve.ts
// Writes the approval line of a reviewed input file (detail spec, section 4). Run it only when the user
// says the review of that file is done: node scripts/import/approve.ts <file> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from 'node:fs';
import { isValidIsoDate } from './family.ts';
import { approveText } from './inputs.ts';

const [file, date] = process.argv.slice(2);
if (!file || !date || !isValidIsoDate(date)) {
	console.error('Usage: node scripts/import/approve.ts <file> <YYYY-MM-DD>');
	process.exit(1);
}
writeFileSync(file, approveText(readFileSync(file, 'utf8'), date));
console.log(`Approved ${file} on ${date}.`);
```

- [ ] **Passo 4: eseguire i test e il typecheck**

Run: `npx vitest run scripts/import && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: provare `approve.ts` su una copia**

Run: `cp scripts/import/recipe-attributes.yaml "$SCRATCHPAD/a.yaml" && node scripts/import/approve.ts "$SCRATCHPAD/a.yaml" 2026-10-12 && head -1 "$SCRATCHPAD/a.yaml"; node scripts/import/approve.ts "$SCRATCHPAD/a.yaml" 2026-02-30; echo "exit $?"`
Expected: prima riga `# Revisione: 2026-10-12, rivisto dall'utente, sha256:…`; la
seconda esecuzione stampa l'uso e termina con `exit 1`.

- [ ] **Passo 6: commit**

```bash
git add scripts/import/family.ts scripts/import/family.test.ts scripts/import/approve.ts
git commit -m "Import: dati della famiglia con date validate e comando di approvazione"
```

---

### Compito 11: pacchetto e rilancio

**File:**
- Crea: `scripts/import/bundle.ts`
- Test: `scripts/import/bundle.test.ts`

**Interfacce:**
- Consuma: `buildRecipe`, `buildFamilyData`, `checkDraft`, `checkPublishable`,
  `blocksDraft`; fixture del compito 9.
- Produce: `ExistingCatalogue`, `ImportBundle`, `BundleRecipe`, `BundleResult`
  (`{ bundle, recipeFindings: Map<string, RecipeFinding[]>, historyFindings, skipped }`),
  `selectFresh(origin, existing)`, `buildBundle(args): BundleResult`.

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// scripts/import/bundle.test.ts
import { describe, expect, it } from 'vitest';
import { checkDraft, checkPublishable } from '../../domain/src/recipe/index.ts';
import { buildBundle } from './bundle.ts';
import { attributesFor, bundleLookup, inputsWith, originRecipe } from './test-fixtures.ts';

const wok = originRecipe({ id: 'wok', nome: 'Wok', tipo: 'libro', libro: { titolo: 'Basta un Wok', pagine: '76-77' }, ingredienti: [{ nome: 'Cipolla a dadini', quantita: '1' }] });
const args = (over: Partial<Parameters<typeof buildBundle>[0]> = {}) => ({
	origin: [originRecipe(), wok],
	attributes: new Map([['pasta-tonno', attributesFor()], ['wok', attributesFor({ primaryIngredient: null })]]),
	inputs: inputsWith(),
	existing: { recipes: [], ingredients: [], books: [] },
	importDate: '2026-10-12',
	generatedAt: '2026-10-12T10:00:00Z',
	...over
});

describe('buildBundle', () => {
	it('marks recipes publishable or draft and keeps every draft valid as a draft', () => {
		const { bundle } = buildBundle(args());
		expect(bundle.recipes.map((r) => [r.origin.slug, r.status])).toEqual([['pasta-tonno', 'publishable'], ['wok', 'draft']]);
		expect(bundle.recipes[1].issues.map((i) => i.path.join('.'))).toContain('name.en-GB');
		for (const r of bundle.recipes) expect(checkDraft(r.document, bundleLookup(bundle))).toEqual([]);
		expect(bundle.books).toEqual([{ slug: 'basta-un-wok', title: 'Basta un Wok' }]);
	});
	it('keeps an unresolved line through JSON and the draft save, and blocks publication', () => {
		const origin = [originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }, { nome: 'Sconosciuto', quantita: '1' }] })];
		const { bundle } = buildBundle(args({ origin }));
		const saved = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
		const draft = saved.recipes[0];
		expect(draft.status).toBe('draft');
		expect(checkDraft(draft.document, bundleLookup(saved))).toEqual([]);
		expect(checkPublishable(draft.document, bundleLookup(saved))).toEqual([{ code: 'required', path: ['ingredients', 2, 'ingredientId'] }]);
		expect(draft.document.ingredients?.[2].sourceText).toBe('Sconosciuto: 1');
	});
	it('keeps duplicate lines and blocks publication', () => {
		const origin = [originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: 'Pasta corta', quantita: '30 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }] })];
		const { bundle } = buildBundle(args({ origin }));
		expect(bundle.recipes[0].status).toBe('draft');
		expect(bundle.recipes[0].issues).toEqual([{ code: 'duplicate_ingredient', path: ['ingredients', 1, 'ingredientId'] }]);
	});
	it('skips what the database already has and still resolves its ingredients', () => {
		const { bundle, skipped } = buildBundle(args({ existing: { recipes: ['pasta-tonno'], ingredients: ['cipolle', 'tonno'], books: ['basta-un-wok'] } }));
		expect(skipped).toEqual(['pasta-tonno']);
		expect(bundle.recipes.map((r) => r.origin.slug)).toEqual(['wok']);
		expect(bundle.ingredients.map((i) => i.slug)).toEqual(['pasta-corta']);
		expect(bundle.books).toEqual([]);
		expect(bundle.recipes[0].issues.map((i) => i.code)).not.toContain('unknown_ingredient');
		expect(bundle.family.ratings.map((r) => r.originSlug)).toEqual(['wok']);
	});
	it('lists the files still to review', () => {
		expect(buildBundle(args({ inputs: inputsWith({ pendingReview: ['ingredients.yaml'] }) })).bundle.pendingReview).toEqual(['ingredients.yaml']);
	});
	it('is stable across runs', () => {
		expect(JSON.stringify(buildBundle(args()).bundle)).toBe(JSON.stringify(buildBundle(args()).bundle));
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/bundle.test.ts`
Expected: FAIL, modulo inesistente.

- [ ] **Passo 3: implementare**

```ts
// scripts/import/bundle.ts
import { blocksDraft, checkDraft, checkPublishable, type CatalogueIngredient, type CatalogueLookup, type RecipeDraftDocument, type ValidationIssue } from '../../domain/src/recipe/index.ts';
import type { IsoDate } from '../../domain/src/planner/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import { slug, type OriginRecipe } from '../planner-data/origin.ts';
import { buildFamilyData, type FamilyData, type HistoryFinding } from './family.ts';
import type { ImportInputs } from './inputs.ts';
import { buildRecipe, type OriginType, type RecipeFinding } from './recipes.ts';

// The import's output (detail spec, section 4): only what the database does not have yet. The status of a
// recipe depends only on its document, so a draft keeps its obstacles after bundle.json and the save.

export interface ExistingCatalogue {
	recipes: string[];
	ingredients: string[];
	books: string[];
}

export interface BundleRecipe {
	origin: { slug: string; type: OriginType };
	status: 'publishable' | 'draft';
	document: RecipeDraftDocument;
	issues: ValidationIssue[];
}

export interface ImportBundle {
	generatedAt: string;
	importDate: IsoDate;
	pendingReview: string[];
	books: { slug: string; title: string }[];
	ingredients: CatalogueIngredient[];
	recipes: BundleRecipe[];
	family: FamilyData;
}

export interface BundleResult {
	bundle: ImportBundle;
	recipeFindings: Map<string, RecipeFinding[]>;
	historyFindings: HistoryFinding[];
	skipped: string[];
}

/** Cards already in the database are set aside before anything reads their content (rerun, section 11). */
export function selectFresh(origin: OriginRecipe[], existing: ExistingCatalogue) {
	const known = new Set(existing.recipes);
	return { fresh: origin.filter((r) => !known.has(r.id)), skipped: origin.filter((r) => known.has(r.id)).map((r) => r.id) };
}

export function buildBundle(args: {
	origin: OriginRecipe[];
	attributes: Map<string, RecipeAttributes>;
	inputs: ImportInputs;
	existing: ExistingCatalogue;
	importDate: IsoDate;
	generatedAt: string;
}): BundleResult {
	const { inputs, existing } = args;
	const { fresh, skipped } = selectFresh(args.origin, existing);

	const books = new Map<string, string>();
	for (const r of fresh) if (r.libro && !existing.books.includes(slug(r.libro.titolo))) books.set(slug(r.libro.titolo), r.libro.titolo);
	const english = new Map(inputs.ingredients.map((i) => [i.slug, !!i.name['en-GB'].trim()]));
	const lookup: CatalogueLookup = {
		hasIngredient: (id) => english.has(id) || existing.ingredients.includes(id),
		ingredientHasEnglishName: (id) => english.get(id) ?? existing.ingredients.includes(id),
		hasBook: (id) => books.has(id) || existing.books.includes(id)
	};

	const recipeFindings = new Map<string, RecipeFinding[]>();
	const recipes: BundleRecipe[] = fresh.map((origin) => {
		const built = buildRecipe(origin, args.attributes.get(origin.id), inputs);
		recipeFindings.set(origin.id, built.findings);
		const draftProblems = checkDraft(built.document, lookup).filter(blocksDraft);
		if (draftProblems.length) throw new Error(`${origin.id}: the import produced invalid data: ${JSON.stringify(draftProblems)}`);
		const issues = checkPublishable(built.document, lookup);
		return { origin: built.origin, status: issues.length ? 'draft' : 'publishable', document: built.document, issues };
	});

	const { family, findings: historyFindings } = buildFamilyData(fresh, args.importDate);
	return {
		bundle: {
			generatedAt: args.generatedAt,
			importDate: args.importDate,
			pendingReview: inputs.pendingReview,
			books: [...books].map(([s, title]) => ({ slug: s, title })).sort((a, b) => a.slug.localeCompare(b.slug)),
			ingredients: inputs.ingredients.filter((i) => !existing.ingredients.includes(i.slug)).sort((a, b) => a.slug.localeCompare(b.slug)),
			recipes,
			family
		},
		recipeFindings,
		historyFindings,
		skipped
	};
}
```

Nota: un dato che non supera nemmeno il controllo di bozza è un errore dell'import (della
mappatura), non un'ambiguità: il comando si ferma con il messaggio.

- [ ] **Passo 4: eseguire i test e verificare che passano**

Run: `npx vitest run scripts/import && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add scripts/import/bundle.ts scripts/import/bundle.test.ts
git commit -m "Import: pacchetto validato e rilancio con il catalogo esistente"
```

---

### Compito 12: report delle ambiguità e pagina di revisione

**File:**
- Crea: `scripts/import/report.ts`, `scripts/import/review-page.ts`
- Test: `scripts/import/report.test.ts`, `scripts/import/review-page.test.ts`

**Interfacce:**
- Consuma: `BundleResult`, `ImportBundle` (compito 11); `missingData`, `DraftTranslated`.
- Produce: `renderReport(result, extras: { archivedCount: number }): string` (markdown
  italiano), `renderReviewPage(bundle, catalogue): string` (HTML autonomo; `catalogue` è il
  catalogo completo per i nomi, dopo la review della PR #9).

- [ ] **Passo 1: scrivere i test che falliscono**

```ts
// scripts/import/report.test.ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle.ts';
import { renderReport } from './report.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

const result = buildBundle({
	origin: [
		originRecipe({ url: 'https://example.it/p', note: "URL fornito dall'utente. Olio, sale e pepe esclusi.", storico: [{ settimana: '2026-09-28', pasto: 'mar-pranzo', cucinata: false }] }),
		originRecipe({ id: 'senza', ingredienti: null, porzioni_base: null, collaudata: true }),
		originRecipe({ id: 'farro', ingredienti: [{ nome: 'Pasta corta', quantita: '145 g crudo (330 g cotto)' }, { nome: 'Sconosciuto', quantita: '1' }] })
	],
	attributes: new Map([['pasta-tonno', attributesFor()], ['senza', attributesFor({ primaryIngredient: null })], ['farro', attributesFor({ primaryIngredient: null })]]),
	inputs: inputsWith({ pendingReview: ['ingredients.yaml'] }),
	existing: { recipes: [], ingredients: [], books: [] },
	importDate: '2026-10-12',
	generatedAt: '2026-10-12T10:00:00Z'
});

describe('ambiguity report', () => {
	const text = renderReport(result, { archivedCount: 3 });
	it('has one section per cause, in Italian', () => {
		for (const heading of ['## File da rivedere', '## Ricette in bozza', '## Righe da mappare', '## Ricette di casa con URL (R4)', '## Ricette provate senza data (R4)', '## Storico non importato o senza esito', "## Ingredienti di dispensa esclusi nell'origine", '## Quantità con note', '## Archivio'])
			expect(text).toContain(heading);
	});
	it('names the recipes and the reasons', () => {
		expect(text).toContain('`senza`');
		expect(text).toContain('Porzioni');
		expect(text).toContain('`farro`: Sconosciuto');
		expect(text).toContain('Pasta corta: 145 g crudo (330 g cotto)');
		expect(text).toContain('family_tried_recipes');
		expect(text).toContain('mar-pranzo');
		expect(text).toContain('3 schede');
		expect(text).toContain('ingredients.yaml');
	});
});
```

```ts
// scripts/import/review-page.test.ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle.ts';
import { renderReviewPage } from './review-page.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

describe('review page', () => {
	const { bundle } = buildBundle({
		origin: [originRecipe({ nome: 'Pasta <al> tonno', ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }, { nome: 'Zenzero', quantita: '1' }] })],
		attributes: new Map([['pasta-tonno', attributesFor()]]),
		inputs: inputsWith(),
		existing: { recipes: [], ingredients: [], books: [] },
		importDate: '2026-10-12',
		generatedAt: '2026-10-12T10:00:00Z'
	});
	const html = renderReviewPage(bundle);
	it('is a standalone Italian page', () => {
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<html lang="it">');
		expect(html).not.toMatch(/<script|<link/);
	});
	it('shows both languages, the source line and the mapping, escaped', () => {
		expect(html).toContain('Pasta &lt;al&gt; tonno');
		expect(html).toContain('Tuna pasta');
		expect(html).toContain('Tonno sott&#39;olio: q.b.');
		expect(html).toContain('Short pasta');
		expect(html).toContain('in oil');
	});
	it('marks unresolved lines', () => {
		expect(html).toContain('Zenzero: 1');
		expect(html).toContain('da mappare');
	});
});
```

- [ ] **Passo 2: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/report.test.ts scripts/import/review-page.test.ts`
Expected: FAIL, moduli inesistenti.

- [ ] **Passo 3: implementare il report**

```ts
// scripts/import/report.ts
import { missingData, type MissingData } from '../../domain/src/recipe/index.ts';
import type { BundleResult } from './bundle.ts';
import type { HistoryFindingKind } from './family.ts';
import type { FindingKind } from './recipes.ts';

// Report of the ambiguities (spec section 8), in Italian: what the import did not decide on its own.

const MISSING_LABEL: Record<MissingData, string> = {
	names: 'Nome e descrizione', source: 'Fonte', details: 'Durata', attributes: 'Attributi del pianificatore',
	baseServings: 'Porzioni', ingredients: 'Ingredienti', translation: 'Traduzione', invalid: 'Dati non validi'
};
const HISTORY_LABEL: Record<HistoryFindingKind, string> = {
	not_cooked: 'non cucinato, non importato',
	outcome_not_recorded: 'esito non registrato, importato come mangiato',
	week_not_concluded: 'settimana non conclusa, non importato',
	unrecognised_slot: 'giorno o pasto non riconosciuto, scartato',
	invalid_week: 'settimana non valida (data inesistente o non di lunedì), scartato'
};

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '_Nessuna voce._');

export function renderReport(result: BundleResult, extras: { archivedCount: number }): string {
	const { bundle, recipeFindings, historyFindings, skipped } = result;
	const findings = (kind: FindingKind) => [...recipeFindings].flatMap(([slug, fs]) => fs.filter((f) => f.kind === kind).map((f) => `\`${slug}\`: ${f.detail}`));
	const drafts = bundle.recipes.filter((r) => r.status === 'draft').map((r) => `\`${r.origin.slug}\`: ${missingData(r.issues).map((m) => MISSING_LABEL[m]).join(', ')}`);
	const published = bundle.recipes.length - drafts.length;
	return [
		`# Report dell'import del ricettario`,
		`Data dell'import: ${bundle.importDate}. Ricette nel pacchetto: ${bundle.recipes.length} (${published} pubblicabili, ${drafts.length} in bozza). Ingredienti nuovi: ${bundle.ingredients.length}. Libri nuovi: ${bundle.books.length}.`,
		`## File da rivedere`, list(bundle.pendingReview.map((f) => `\`${f}\` senza approvazione valida (assente o contenuto cambiato dopo la revisione): nessuna ricetta si pubblica finché non è rivisto`)),
		`## Ricette in bozza`, list(drafts),
		`## Righe da mappare`, "Righe rimaste nel documento senza ingrediente del catalogo: la ricetta non si pubblica finché un curatore non sceglie l'ingrediente.", list(findings('unmapped_line')),
		`## Righe ripetute dopo la mappatura`, 'Restano entrambe: unire le quantità è una scelta del curatore.', list(findings('duplicate_after_mapping')),
		`## Tazze senza equivalenza`, list(findings('cup_without_equivalence')),
		`## Attributi mancanti`, list(findings('missing_attributes')),
		`## Ricette di casa con URL (R4)`, "Importate come `web` con l'URL; il tipo d'origine resta `casa`. Le note riportano anche gli adattamenti della famiglia, che non entrano nella ricetta.", list(findings('home_with_url')),
		`## Ricette provate senza data (R4)`, "Registrate come `triedUndated` nel pacchetto (nel database in `family_tried_recipes` con `source: 'import'`), senza pasti inventati; per ora il pianificatore non le usa.", list(bundle.family.triedUndated.map((s) => `\`${s}\``)),
		`## Storico non importato o senza esito`, list(historyFindings.map((h) => `\`${h.originSlug}\`, settimana ${h.week}, ${h.slot}: ${HISTORY_LABEL[h.kind]}`)),
		`## Ingredienti di dispensa esclusi nell'origine`, "L'import non aggiunge righe senza la fonte: un curatore può aggiungerle verificandole.", list(findings('pantry_excluded')),
		`## Alternative nei nomi e note della mappatura`, list([...findings('alternative_in_name'), ...findings('mapping_note')]),
		`## Preparazioni in altre pagine del libro`, list(findings('book_dependency')),
		`## Quantità con note`, 'Approssimazioni e note tra parentesi, anche quando la quantità è rimasta testo.', list(findings('quantity_note')),
		`## Tag d'origine`, 'Non importati: li sostituiscono gli attributi del pianificatore.',
		`## Schede già presenti`, list(skipped.map((s) => `\`${s}\` saltata: già nel database`)),
		`## Archivio`, `${extras.archivedCount} schede di \`archivio.yaml\` non importate.`
	].join('\n\n') + '\n';
}
```

- [ ] **Passo 4: implementare la pagina di revisione**

```ts
// scripts/import/review-page.ts
import type { DraftTranslated } from '../../domain/src/recipe/index.ts';
import type { ImportBundle } from './bundle.ts';

// Standalone review page for the user (detail spec, section 5): Italian and English side by side.

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const both = (v: DraftTranslated | null | undefined) =>
	v ? `${escape(v['it-IT'] ?? '')}<br><span class="en">${escape(v['en-GB'] ?? '') || '<em>manca</em>'}</span>` : '';

const STYLE = `:root{--bg:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e2dc;--warn:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#f2f0ea;--muted:#a3a19a;--line:#33322e;--warn:#f2b8b5}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
.en{color:var(--muted)}.issue{color:var(--warn)}section{overflow-x:auto}`;

export function renderReviewPage(bundle: ImportBundle): string {
	const ingredientName = new Map(bundle.ingredients.map((i) => [i.slug, i.name]));
	const recipes = bundle.recipes.map((r) => {
		const d = r.document;
		const rows = (d.ingredients ?? []).map((l) => {
			const q = l.quantity;
			const quantity = q.kind === 'amount' ? `${q.value ?? '?'} ${q.unit}` : q.kind === 'to_taste' ? 'q.b.' : both(q.text);
			const ingredient = l.ingredientId === null ? '<span class="issue">da mappare</span>' : both(ingredientName.get(l.ingredientId)) || escape(l.ingredientId);
			return `<tr><td>${escape(l.sourceText)}</td><td>${ingredient}</td><td>${both(l.variety)}</td><td>${both(l.preparation)}</td><td>${quantity}</td><td>${l.isOptional ? 'sì' : ''}</td><td>${l.isPrimary ? 'sì' : ''}</td></tr>`;
		});
		const issues = r.issues.map((i) => `${i.code} (${i.path.join('.')})`).join(', ');
		return `<section><h2>${escape(d.name['it-IT'] ?? r.origin.slug)}</h2><p><code>${escape(r.origin.slug)}</code> · ${r.status === 'publishable' ? 'pubblicabile' : 'bozza'}${issues ? ` · <span class="issue">${escape(issues)}</span>` : ''}</p>
<table><tr><th>Nome</th><td>${both(d.name)}</td></tr><tr><th>Descrizione</th><td>${both(d.description)}</td></tr></table>
<table><tr><th>Riga della fonte</th><th>Ingrediente</th><th>Varietà</th><th>Preparazione</th><th>Quantità</th><th>Facoltativo</th><th>Principale</th></tr>${rows.join('')}</table></section>`;
	});
	const catalogue = bundle.ingredients.map((i) => `<tr><td><code>${escape(i.slug)}</code></td><td>${both(i.name)}</td><td>${escape(i.department)}</td><td>${i.isPantry ? 'sì' : ''}</td></tr>`);
	return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisione import</title><style>${STYLE}</style></head>
<body><h1>Revisione dell'import del ricettario</h1><p>Generata il ${escape(bundle.generatedAt)}. Per ogni ricetta: italiano sopra, inglese sotto in grigio.</p>
${recipes.join('\n')}
<section><h2>Catalogo degli ingredienti</h2><table><tr><th>Slug</th><th>Nome</th><th>Reparto</th><th>Dispensa</th></tr>${catalogue.join('')}</table></section>
</body></html>
`;
}
```

- [ ] **Passo 5: eseguire i test e verificare che passano**

Run: `npx vitest run scripts/import && npx tsc -p tsconfig.json`
Expected: PASS. Se un testo cercato dal test differisce, allineare il report alla spec
(sezione 4, «Uscite»), non togliere il controllo.

- [ ] **Passo 6: commit**

```bash
git add scripts/import/report.ts scripts/import/report.test.ts scripts/import/review-page.ts scripts/import/review-page.test.ts
git commit -m "Import: report delle ambiguità e pagina di revisione"
```

---

### Compito 13: comando, rilancio e prova sui dati reali

**File:**
- Crea: `scripts/import/import-recipes.ts`, `scripts/import/.gitignore`,
  `scripts/import/ingredients.yaml`, `scripts/import/ingredient-lines.yaml`,
  `scripts/import/translations.en-GB.yaml`, `scripts/import/unit-equivalences.yaml`
  (vuoti, senza riga d'approvazione)
- Test: `scripts/import/import-recipes.test.ts`, `scripts/import/real-data.test.ts`

**Interfacce:**
- Consuma: `originDir`, `readOriginRecipes`, `parseAttributes`, `readInputs`,
  `selectFresh`, `buildBundle`, `renderReport`, `renderReviewPage`, `isValidIsoDate`.
- Produce: `runImport(options: { root: string; originDirectory?: string; existingFile?:
  string; today?: string; now?: Date }): { result: BundleResult; files: Record<string,
  string> }` e il comando.

- [ ] **Passo 1: creare i file d'ingresso vuoti e il `.gitignore`**

```yaml
# scripts/import/ingredients.yaml
# Catalogo degli ingredienti dell'import: un prodotto generico per voce (spec di dettaglio, sezione 5).
# Preparato dall'agente dalle righe d'origine; l'approvazione si scrive con approve.ts su indicazione dell'utente.
ingredients: {}
```

```yaml
# scripts/import/ingredient-lines.yaml
# Nome della riga d'origine (esatto) → ingrediente, varietà, preparazione, facoltativo.
lines: {}
```

```yaml
# scripts/import/translations.en-GB.yaml
# Inglese britannico di nomi e descrizioni delle ricette e delle quantità a parole.
recipes: {}
quantities: {}
```

```yaml
# scripts/import/unit-equivalences.yaml
# Equivalenze di ambito recipe per ingrediente (tazze USA), con fonte verificata e preparazione facoltativa.
equivalences: []
```

```
# scripts/import/.gitignore
out/
```

- [ ] **Passo 2: scrivere i test che falliscono**

```ts
// scripts/import/import-recipes.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { runImport } from './import-recipes.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function setup() {
	const root = mkdtempSync(join(tmpdir(), 'import-root-'));
	const origin = mkdtempSync(join(tmpdir(), 'import-origin-'));
	dirs.push(root, origin);
	mkdirSync(join(root, 'scripts/import'), { recursive: true });
	mkdirSync(join(origin, 'ricettario'), { recursive: true });
	const card = (id: string) => ({ id, nome: id, descrizione: 'Descrizione.', tipo: 'casa', url: null, tempo: '20 min', porzioni_base: 2, ingredienti: [{ nome: 'Ceci', quantita: '200 g' }], collaudata: false, feedback: null, tag: [], storico: [], note: null });
	// "vecchia" is already in the database and was edited in the origin: its primary ingredient no longer
	// matches its lines. It must not stop the import of "nuova".
	writeFileSync(join(origin, 'ricettario/ricette.yaml'), stringify({ ricette: [card('vecchia'), card('nuova')] }));
	const attributes = (primary: string) => ({ meal_type: 'both', protein_group: 'legumes', fresh_fish: false, carbohydrate_group: 'none', category: 'soup', has_vegetables: false, is_heavy: false, seasons: [], primary_ingredient: primary, uncertain: [], note: null });
	writeFileSync(join(root, 'scripts/import/recipe-attributes.yaml'), stringify({ recipes: { vecchia: attributes('lenticchie'), nuova: attributes('ceci') } }));
	writeFileSync(join(root, 'scripts/import/ingredients.yaml'), stringify({ ingredients: { ceci: { name: { 'it-IT': 'Ceci', 'en-GB': 'Chickpeas' }, department: 'tinned', pantry: false } } }));
	writeFileSync(join(root, 'scripts/import/ingredient-lines.yaml'), stringify({ lines: { Ceci: { ingredient: 'ceci', variety: null, preparation: null, optional: false } } }));
	writeFileSync(join(root, 'scripts/import/translations.en-GB.yaml'), stringify({ recipes: { nuova: { name: 'New', description: 'Description.' } }, quantities: {} }));
	writeFileSync(join(root, 'scripts/import/unit-equivalences.yaml'), stringify({ equivalences: [] }));
	const existingFile = join(root, 'existing.json');
	writeFileSync(existingFile, JSON.stringify({ recipes: ['vecchia'], ingredients: [], books: [] }));
	return { root, origin, existingFile };
}

describe('import command', () => {
	it('imports a new card even when an already imported card changed in the origin', () => {
		const { root, origin, existingFile } = setup();
		const { result, files } = runImport({ root, originDirectory: origin, existingFile, today: '2026-10-12', now: new Date('2026-10-12T10:00:00Z') });
		expect(result.skipped).toEqual(['vecchia']);
		expect(result.bundle.recipes.map((r) => [r.origin.slug, r.status])).toEqual([['nuova', 'publishable']]);
		expect(Object.keys(files).sort()).toEqual(['bundle.json', 'report.md', 'review.html']);
	});
	it('stops on a primary ingredient error of a card that is not in the database', () => {
		const { root, origin } = setup();
		expect(() => runImport({ root, originDirectory: origin, today: '2026-10-12' })).toThrow(/vecchia: primary_ingredient/);
	});
	it('refuses an invalid --today before reading anything', () => {
		expect(() => runImport({ root: '/nonexistent', today: '2026-02-30' })).toThrow(/Invalid import date/);
	});
});
```

```ts
// scripts/import/real-data.test.ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkDraft } from '../../domain/src/recipe/index.ts';
import type { BundleResult } from './bundle.ts';
import { runImport } from './import-recipes.ts';
import { bundleLookup } from './test-fixtures.ts';

const root = resolve(import.meta.dirname, '../..');
const hasOrigin = !!process.env.MEAL_PLANNER_ORIGIN || [resolve(root, '../meal_planner'), resolve(root, '../../../meal_planner')].some((d) => existsSync(d));

// The import runs in beforeAll: without the origin (CI) the suite is skipped without errors.
describe.skipIf(!hasOrigin)('import of the real origin recipe book', () => {
	let result: BundleResult;
	let report: string;
	beforeAll(() => {
		const run = runImport({ root, today: '2026-10-12', now: new Date('2026-10-12T10:00:00Z') });
		result = run.result;
		report = run.files['report.md'];
	});
	it('imports every origin card as a valid draft at least', () => {
		expect(result.bundle.recipes).toHaveLength(56);
		for (const r of result.bundle.recipes) expect(checkDraft(r.document, bundleLookup(result.bundle))).toEqual([]);
	});
	it('gives every draft a reason in the document and in the report', () => {
		for (const r of result.bundle.recipes.filter((x) => x.status === 'draft')) {
			expect(r.issues.length).toBeGreaterThan(0);
			expect(report).toContain(`\`${r.origin.slug}\``);
		}
	});
	it('applies the R4 decisions to the known cases', () => {
		const bySlug = new Map(result.bundle.recipes.map((r) => [r.origin.slug, r]));
		for (const s of ['penne-baffo', 'pasta-zucca-salsiccia-robiola', 'pasta-crema-peperoni', 'lenticchie-comidista']) expect(bySlug.get(s)?.document.sourceType).toBe('web');
		for (const s of ['pasta-tonno', 'lenticchie-comidista']) expect(result.bundle.family.triedUndated).toContain(s);
	});
});
```

Nota: `vecchia` in `setup()` ha un `primary_ingredient` che non è fra le sue righe. Nel
primo test è in `--existing` e non si valida; nel secondo non lo è e l'errore ferma
l'import.

- [ ] **Passo 3: eseguire i test e verificare che falliscono**

Run: `npx vitest run scripts/import/import-recipes.test.ts scripts/import/real-data.test.ts`
Expected: FAIL, modulo `./import-recipes.ts` inesistente.

- [ ] **Passo 4: implementare il comando**

```ts
// scripts/import/import-recipes.ts
// Import of the origin recipe book (detail spec, section 4): writes out/bundle.json, out/report.md and
// out/review.html. Reads ../meal_planner only; never writes to the database.
// Usage: node scripts/import/import-recipes.ts --today <YYYY-MM-DD> [--existing <file.json>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseAttributes } from '../planner-data/attributes.ts';
import { originDir, readOriginRecipes } from '../planner-data/origin.ts';
import { buildBundle, selectFresh, type BundleResult, type ExistingCatalogue } from './bundle.ts';
import { isValidIsoDate } from './family.ts';
import { readInputs } from './inputs.ts';
import { renderReport } from './report.ts';
import { renderReviewPage } from './review-page.ts';

export function runImport(options: { root: string; originDirectory?: string; existingFile?: string; today?: string; now?: Date }): { result: BundleResult; files: Record<string, string> } {
	const now = options.now ?? new Date();
	const importDate = options.today ?? now.toISOString().slice(0, 10);
	if (!isValidIsoDate(importDate)) throw new Error(`Invalid import date: ${importDate}`);

	const origin = options.originDirectory ?? originDir(options.root);
	const recipes = readOriginRecipes(origin);
	const existing: ExistingCatalogue = options.existingFile ? JSON.parse(readFileSync(options.existingFile, 'utf8')) : { recipes: [], ingredients: [], books: [] };
	// Cards already imported are set aside before validating attributes against their content (review, point 7).
	const { fresh } = selectFresh(recipes, existing);
	const importDir = resolve(options.root, 'scripts/import');
	const { attributes, errors } = parseAttributes(readFileSync(resolve(importDir, 'recipe-attributes.yaml'), 'utf8'), fresh);
	// The file classifies the cards with ingredients and servings; a card without an entry becomes a draft with
	// required attributes, and entries of cards set aside are not errors.
	const originIds = new Set(recipes.map((r) => r.id));
	const realErrors = errors.filter((e) => !e.endsWith(': missing') && !(e.endsWith(': not a recipe of the catalogue') && originIds.has(e.slice(0, e.indexOf(':')))));
	if (realErrors.length) throw new Error(`recipe-attributes.yaml is not valid:\n${realErrors.join('\n')}`);

	const result = buildBundle({ origin: recipes, attributes, inputs: readInputs(importDir), existing, importDate, generatedAt: now.toISOString() });
	const archivePath = resolve(origin, 'ricettario/archivio.yaml');
	const archivedCount = existsSync(archivePath) ? ((parse(readFileSync(archivePath, 'utf8')) as { ricette?: unknown[] }).ricette ?? []).length : 0;
	return {
		result,
		files: {
			'bundle.json': `${JSON.stringify(result.bundle, null, '\t')}\n`,
			'report.md': renderReport(result, { archivedCount }),
			'review.html': renderReviewPage(result.bundle)
		}
	};
}

const argument = (name: string) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const { result, files } = runImport({ root, existingFile: argument('--existing'), today: argument('--today') });
	const out = resolve(root, 'scripts/import/out');
	mkdirSync(out, { recursive: true });
	for (const [name, content] of Object.entries(files)) writeFileSync(resolve(out, name), content);
	const publishable = result.bundle.recipes.filter((r) => r.status === 'publishable').length;
	console.log(`${result.bundle.recipes.length} recipes (${publishable} publishable), ${result.bundle.ingredients.length} ingredients, ${result.skipped.length} skipped. Files in scripts/import/out/.`);
}
```

Nota: il filtro degli errori dipende dai messaggi di `parseAttributes`
(`<id>: missing`, `<id>: not a recipe of the catalogue`); il test del comando lo fissa.

- [ ] **Passo 5: eseguire i test**

Run: `npx vitest run scripts/import`
Expected: PASS. Con i YAML ancora vuoti, nella prova sui dati reali le ricette con righe
sono bozze (righe da mappare, traduzioni mancanti) e il report le nomina tutte. Se un
dato reale non supera il controllo di bozza, correggere l'import, non il test.

- [ ] **Passo 6: provare la suite senza origine**

Una copia temporanea del test forza `hasOrigin = false`, senza toccare l'origine:

Run: `sed 's/^const hasOrigin = .*/const hasOrigin = false;/' scripts/import/real-data.test.ts > scripts/import/real-data-skip.test.ts && npx vitest run scripts/import/real-data-skip.test.ts; rm scripts/import/real-data-skip.test.ts`
Expected: la suite risulta saltata, nessun errore (`beforeAll` di una suite saltata non
viene eseguito).

- [ ] **Passo 7: eseguire il comando**

Run: `node scripts/import/import-recipes.ts --today 2026-10-12 && head -20 scripts/import/out/report.md; node scripts/import/import-recipes.ts --today 2026-02-30; echo "exit $?"; git status --short`
Expected: riepilogo stampato; la seconda esecuzione termina con errore («Invalid import
date»); `out/` non compare in `git status`.

- [ ] **Passo 8: commit**

```bash
git add scripts/import/import-recipes.ts scripts/import/import-recipes.test.ts scripts/import/real-data.test.ts scripts/import/.gitignore scripts/import/ingredients.yaml scripts/import/ingredient-lines.yaml scripts/import/translations.en-GB.yaml scripts/import/unit-equivalences.yaml
git commit -m "Import: comando con rilancio e prova sul ricettario d'origine"
```

---

### Compito 14: mappatura e traduzioni (dati)

**File:**
- Modifica: `scripts/import/ingredients.yaml`, `scripts/import/ingredient-lines.yaml`,
  `scripts/import/translations.en-GB.yaml`, `scripts/import/unit-equivalences.yaml`
- Modifica: `scripts/import/real-data.test.ts` (un controllo in più)

Lavoro di dati, non di codice: l'agente prepara i file, l'utente li rivede. Regole
(spec, sezione 8 «Ingredienti e varietà» e spec di dettaglio, sezioni 4 e 5): ingrediente
= prodotto generico; varietà solo se cambia cosa si compra; taglia, maturazione e
preparazione non sono varietà; alternative solo nel testo della fonte; mai ingredienti
dal nome del piatto; inglese britannico. L'agente non scrive mai la riga d'approvazione.

- [ ] **Passo 1: aggiungere il controllo di completezza della mappatura**

```ts
// scripts/import/real-data.test.ts, dentro il describe
	it('maps every origin line and translates every recipe', () => {
		const unresolved = result.bundle.recipes.filter((r) => r.issues.some((i) => i.path[2] === 'ingredientId' && i.code === 'required')).map((r) => r.origin.slug);
		expect(unresolved).toEqual([]);
		for (const r of result.bundle.recipes) expect(r.issues.filter((i) => i.code === 'translation_missing')).toEqual([]);
	});
```

Run: `npx vitest run scripts/import/real-data.test.ts`
Expected: FAIL, con le ricette che hanno righe da mappare.

- [ ] **Passo 2: catalogo degli ingredienti**

Partire da `prototype/scripts/demo-ingredients.json` (reparti e dispensa) e dalle 243
righe d'origine (sezione «Righe da mappare» del report). Scrivere in `ingredients.yaml`
un ingrediente per prodotto generico, con nome italiano e inglese britannico
(courgettes, aubergines, coriander, spring onions), sinonimi utili alla ricerca, reparto
fra i codici di W4 e `pantry: true` per olio, sale, pepe e spezie comuni. Un ingrediente
che nessuna riga usa non va aggiunto.

- [ ] **Passo 3: mappatura delle righe, a blocchi di circa 50 nomi**

Per ogni nome di riga, una voce in `ingredient-lines.yaml` con ingrediente, varietà e
preparazione nelle due lingue o `null`, `optional` (vero per «facoltativo»,
«opzionale»), `note` per alternative e casi dubbi. Dopo ogni blocco:

Run: `node scripts/import/import-recipes.ts --today 2026-10-12 && npx vitest run scripts/import`
Expected: nessun errore dei file d'ingresso; le righe da mappare diminuiscono.

Commit dopo ogni blocco:

```bash
git add scripts/import/ingredients.yaml scripts/import/ingredient-lines.yaml
git commit -m "Import: mappatura degli ingredienti, blocco N"
```

- [ ] **Passo 4: traduzioni**

In `translations.en-GB.yaml`: nome e descrizione inglesi delle 56 ricette, partendo da
`prototype/scripts/demo-translations.en-GB.json` e ricontrollandoli contro le righe
(nessun ingrediente in più o in meno rispetto all'italiano); le quantità a parole che il
report elenca come traduzione mancante.

- [ ] **Passo 5: equivalenze**

In `unit-equivalences.yaml` le equivalenze di ambito `recipe` di
`prototype/scripts/demo-unit-equivalences.json` (senza `scope: shopping`), con lo slug
del nuovo ingrediente, la fonte e, quando l'equivalenza vale per una forma precisa
(«cipolla a dadini», «formaggio grattugiato»), la `preparation` uguale a quella italiana
della riga; solo se la fonte è verificabile, altrimenti la riga resta in tazze e la
ricetta in bozza.

- [ ] **Passo 6: verifica**

Run: `npx vitest run scripts/import && node scripts/import/import-recipes.ts --today 2026-10-12`
Expected: PASS; il report elenca come bozze solo le ricette senza ingredienti, porzioni o
attributi nell'origine, quelle con tazze senza equivalenza e quelle con righe da unire.

- [ ] **Passo 7: commit**

```bash
git add scripts/import
git commit -m "Import: traduzioni en-GB ed equivalenze delle tazze"
```

- [ ] **Passo 8: consegna per la revisione**

Scrivere al coordinatore `STATO: DOMANDA` con il percorso di
`scripts/import/out/review.html` e `scripts/import/out/report.md` e la richiesta di
revisione all'utente. Le correzioni dell'utente si applicano ai YAML con un commit;
quando l'utente dichiara rivisto un file, si esegue
`node scripts/import/approve.ts scripts/import/<file> <data>` e si fa commit. Qualunque
modifica successiva invalida l'approvazione di quel file.

---

### Compito 15: verifica finale

- [ ] **Passo 1: test, tipi e report del pianificatore invariato**

Run: `npm test && npm run typecheck && npm run planner-report > "$SCRATCHPAD/planner-after.txt" && diff "$SCRATCHPAD/planner-before.txt" "$SCRATCHPAD/planner-after.txt" && echo SAME`
Expected: test e typecheck verdi, `SAME` (il file «before» è del compito 0, passo 2).

- [ ] **Passo 2: skill di verifica**

Usare `superpowers:verification-before-completion` e riportare l'esito di ogni comando.

- [ ] **Passo 3: push e PR** (fase 6 del protocollo), poi `STATO: PR_APERTA <url>`.

---

### Correzioni della review della PR #9

Rilievi in `progetto/coordinamento/revisioni/w3-pr9.md`, decisioni in
`progetto/coordinamento/messaggi/w3-03-review-pr9.md`. Il codice sopra resta la traccia
dell'esecuzione; il comportamento attuale è questo:

- **Campi della fonte vuoti:** `textOrNull` in `localized.ts`; `toPublished` e `cleanDraft`
  portano a `null` `sourceUrl`, `bookId`, `bookPages` vuoti o di soli spazi;
  `resolveReferences` non risolve un libro vuoto. Test in `source-fields.test.ts` con `''`,
  spazi, `null` e chiave omessa, su proiezione, risoluzione e pianificatore, più un caso con
  libro risolto fino a `toPlannerRecipe(id, document)` (firma a due argomenti).
- **Numeri ambigui:** in `quantity.ts` un numero col punto seguito da tre cifre o con
  entrambi i separatori diventa `text` con nota `ambiguous_number`, nel report.
- **Pagina di revisione:** `renderReviewPage(bundle, catalogue)`; il comando passa il
  catalogo completo dei YAML; la tabella finale elenca solo gli ingredienti da inserire.
- **`--today` obbligatorio:** `runImport` si ferma senza data.
- **Parole ignorate nelle varietà:** `VARIETY_FILLER_WORDS` esportato da
  `domain/src/shopping/variety.ts` e importato da `domain/src/recipe/variety.ts`.
