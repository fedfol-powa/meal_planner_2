# Ricettario e voti: piano di implementazione

> **Per gli agenti esecutori:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, un task alla volta. I passi usano le
> caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** ricettario, scheda ricetta e voti collegati ai dati veri, con le viste
condivise usate anche dal Menu (W1) e gli strumenti MCP derivati.

**Architettura:** tre operazioni nel contratto (`recipes.search`, `recipes.get`,
`ratings.set`) implementate nel Worker con query SQL scritte a mano nel ruolo
dell'utente. La ricerca e l'ordinamento sono una funzione pura sulle proiezioni caricate
in blocco. Le viste condivise caricano in blocco versioni correnti, versioni storiche
(documento di W3) e ricette mai pubblicate, e scrivono le righe con
`domain/src/units` (W4). Il giudizio «passato» sui dati che dipendono dall'ora si fa sul
dispositivo, con tutti i pasti futuri trasmessi e un timer al prossimo istante.

**Stack:** TypeScript, oRPC 1.15, zod 4, Postgres.js, Vitest; React con TanStack Query
e testing-library per il web (base di W5).

**Spec:** `progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md` (da leggere
insieme a questo piano, in particolare la sezione 1 «Interfaccia per W1»).

## Vincoli globali

- Codice, commenti e test in inglese; documenti e messaggi di commit in italiano; testi
  per l'utente in `it-IT` e `en-GB`.
- Nessuna dipendenza esterna nuova; `@app/domain` (workspace) si aggiunge a `contract/`
  e `server/`.
- Nessuna migrazione nuova.
- File condivisi (`contract/src/contract.ts`, `contract/src/index.ts`,
  `server/src/router.ts`, rotte e dizionari web) toccati solo per registrare le aree
  `recipes` e `ratings`; in `server/src/pipeline.ts` solo l'export del tipo
  `Implementer`; `domain/package.json` non si tocca (l'export `./recipe` lo porta W3).
- Documento ricetta di W3 (`@app/domain/recipe`: `publishedRecipeSchema`) importato,
  mai ridefinito; vocabolari da `@app/domain/planner`, unità da `@app/domain/units`.
- Nessun aggiornamento ottimistico nelle mutazioni web; `ratings.set` è `offline: false`.
- Comandi: tutto `npm test`; server `npm test -w server` (i test con database richiedono
  `TEST_DATABASE_URL`, stack locale `supabase start`); typecheck `npm run typecheck`.
- Nei test con database ogni test crea famiglie proprie e filtra le ricette con un
  marcatore casuale nel nome: i file girano in parallelo sullo stesso database.

## Focus della review

1. **Voto di un ex membro rimosso:** esce dalla media e il suo stesso JWT riceve
   `forbidden` (task 4).
2. **Ricetta di un libro non posseduto aperta da un pasto:** si apre e si vota anche se
   non compare nel ricettario (task 4 e 8).
3. **Ricerca con accenti, maiuscole e parole in ordine diverso** (task 6).
4. **Versione storica di una ricetta che ha cambiato libro o fonte:** la scheda del pasto
   passato mostra il libro e le pagine della versione mangiata (task 3 e 8).
5. **Quarto pasto futuro che passa senza scritture:** la derivazione sul dispositivo lo
   vede anche con una risposta «invariato» (task 7 e 9).

---

## Parte A: viste condivise e voto (PR anticipata)

Si parte **dopo il merge della PR #9 di W3** (dominio ricetta), da un branch
`traguardo/ricettario-viste` creato da `origin/main` aggiornato. Se la PR #9 tarda,
`STATO: DOMANDA` al coordinatore (partire su `fondamenta/ricetta-import` o attendere).
Alla fine `traguardo/ricettario` si ribasa su `main` dopo il merge.

### Task 1: schemi delle viste nel contratto

**File:**
- Crea: `contract/src/recipes/views.ts`, `contract/src/recipes/views.test.ts`,
  `contract/src/recipes/index.ts`
- Modifica: `contract/package.json` (dipendenza `@app/domain`), `contract/src/index.ts`

**Interfacce:**
- Produce (da `@app/contract`): `isoDateSchema`, `proteinGroupSchema`, `mealTypeSchema`,
  `recipeMealTypeSchema`, `sourceTypeSchema`, `recipeSummaryView`, `ratingSummaryView`,
  `ingredientLineView`, `mealOccurrenceView` e i tipi `RecipeSummaryView`,
  `RatingSummaryView`, `IngredientLineView`, `MealOccurrenceView`.

- [ ] **Passo 1: test che fallisce**

```ts
// contract/src/recipes/views.test.ts
import { describe, expect, it } from 'vitest';
import { ingredientLineView, mealOccurrenceView, proteinGroupSchema, ratingSummaryView, recipeSummaryView } from './views.ts';

describe('shared recipe views', () => {
	it('uses the planner vocabulary for protein groups', () => {
		expect(proteinGroupSchema.options).toEqual(['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian']);
	});

	it('accepts the summary of a never-published recipe: name only, description null', () => {
		const summary = { id: crypto.randomUUID(), name: 'Pasta', description: null, durationMinutes: null, sourceType: null,
			sourceUrl: null, bookTitle: null, bookPages: null, mealType: null, proteinGroup: null };
		expect(recipeSummaryView.parse(summary)).toEqual(summary);
	});

	it('bounds stars and averages', () => {
		expect(() => ratingSummaryView.parse({ familyAverage: 5.5, familyCount: 1, myStars: null })).toThrow();
		expect(() => ratingSummaryView.parse({ familyAverage: null, familyCount: 0, myStars: 0 })).toThrow();
		expect(ratingSummaryView.parse({ familyAverage: 3.5, familyCount: 2, myStars: 4 })).toBeTruthy();
	});

	it('describes lines and meal occurrences', () => {
		expect(ingredientLineView.parse({ ingredientId: crypto.randomUUID(), name: 'Pomodori Roma', amount: '200 g', preparation: 'a dadini', optional: false })).toBeTruthy();
		expect(mealOccurrenceView.parse({ date: '2026-10-12', mealType: 'dinner', passesAt: '2026-10-12T21:00:00.000Z' })).toBeTruthy();
		expect(() => mealOccurrenceView.parse({ date: '12/10/2026', mealType: 'dinner', passesAt: '2026-10-12T21:00:00Z' })).toThrow();
	});
});
```

- [ ] **Passo 2:** `npm test -w contract` → FAIL (modulo `./views.ts` mancante).

- [ ] **Passo 3: implementazione**

In `contract/package.json` aggiungi `"@app/domain": "*"` alle `dependencies`, poi
`npm install` dalla radice (aggiorna solo i link del workspace in `package-lock.json`).

```ts
// contract/src/recipes/views.ts
import { MEAL_TYPES, PROTEIN_GROUPS } from '@app/domain/planner';
import { z } from 'zod';

/** Views shared by the recipe book and the menu; owned by the recipes area (W6). */
export const isoDateSchema = z.iso.date();
export const proteinGroupSchema = z.enum(PROTEIN_GROUPS);
export const mealTypeSchema = z.enum(MEAL_TYPES);
export const recipeMealTypeSchema = z.enum([...MEAL_TYPES, 'both']);
export const sourceTypeSchema = z.enum(['web', 'youtube', 'book', 'home']);

/**
 * Texts in the caller's language. A never-published recipe has only id, name (the other
 * language when the caller's is missing) and maybe a description: everything else is null.
 */
export const recipeSummaryView = z.object({
	id: z.uuid(),
	name: z.string(),
	description: z.string().nullable(),
	durationMinutes: z.number().int().positive().nullable(),
	sourceType: sourceTypeSchema.nullable(),
	sourceUrl: z.string().nullable(),
	bookTitle: z.string().nullable(),
	bookPages: z.string().nullable(),
	mealType: recipeMealTypeSchema.nullable(),
	proteinGroup: proteinGroupSchema.nullable(),
});

/** Average of the family's current members and the caller's own stars. */
export const ratingSummaryView = z.object({
	familyAverage: z.number().min(1).max(5).nullable(),
	familyCount: z.number().int().min(0),
	myStars: z.number().int().min(1).max(5).nullable(),
});

/** A recipe line ready to show: scaled, in the family's measurement system and the caller's language. */
export const ingredientLineView = z.object({
	ingredientId: z.uuid(),
	name: z.string(),
	amount: z.string(),
	preparation: z.string().nullable(),
	optional: z.boolean(),
});

/** A meal of the family; the client decides whether it is past from `passesAt`. */
export const mealOccurrenceView = z.object({
	date: isoDateSchema,
	mealType: mealTypeSchema,
	passesAt: z.iso.datetime({ offset: true }),
});

export type RecipeSummaryView = z.infer<typeof recipeSummaryView>;
export type RatingSummaryView = z.infer<typeof ratingSummaryView>;
export type IngredientLineView = z.infer<typeof ingredientLineView>;
export type MealOccurrenceView = z.infer<typeof mealOccurrenceView>;
```

```ts
// contract/src/recipes/index.ts
export * from './views.ts';
```

In `contract/src/index.ts` aggiungi `export * from './recipes/index.ts';`.

- [ ] **Passo 4:** `npm test -w contract && npm run typecheck` → PASS.
- [ ] **Passo 5: commit** `Ricettario: schemi delle viste condivise nel contratto`.

### Task 2: righe di ingrediente pronte (funzione pura)

**File:**
- Crea: `server/src/recipes/lines.ts`, `server/test/recipes/lines.test.ts`
- Modifica: `server/package.json` (dipendenza `@app/domain`)

**Interfacce:**
- Consuma: `scaleQuantity`, `formatQuantity`, `Quantity`, `Localized`, `Locale`,
  `MeasurementSystem` da `@app/domain/units`; `IngredientLineView` da `@app/contract`.
- Produce:

```ts
export interface LineInput { ingredientId: string; variety: Localized | null; preparation: Localized | null; quantity: Quantity; isOptional: boolean }
export type IngredientNames = ReadonlyMap<string, Localized>;
export interface LinesOptions { servings: number; baseServings: number; system: MeasurementSystem; locale: Locale }
export function ingredientLinesView(lines: LineInput[], names: IngredientNames, options: LinesOptions): IngredientLineView[];
```

- [ ] **Passo 1: test che fallisce**

```ts
// server/test/recipes/lines.test.ts
import { describe, expect, it } from 'vitest';
import { ingredientLinesView, type LineInput } from '../../src/recipes/lines.ts';

const tomato = '00000000-0000-4000-8000-000000000001';
const oil = '00000000-0000-4000-8000-000000000002';
const names = new Map([
	[tomato, { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }],
	[oil, { 'it-IT': 'Olio extravergine', 'en-GB': 'Extra virgin olive oil' }],
]);
const lines: LineInput[] = [
	{ ingredientId: tomato, variety: { 'it-IT': 'Roma', 'en-GB': 'Roma' }, preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' },
		quantity: { kind: 'amount', value: 200, unit: 'g' }, isOptional: false },
	{ ingredientId: oil, variety: null, preparation: null, quantity: { kind: 'to_taste' }, isOptional: true },
];

describe('ingredientLinesView', () => {
	it('scales, keeps the source order and writes in the language', () => {
		expect(ingredientLinesView(lines, names, { servings: 4, baseServings: 2, system: 'metric', locale: 'it-IT' })).toEqual([
			{ ingredientId: tomato, name: 'Pomodori Roma', amount: '400 g', preparation: 'a dadini', optional: false },
			{ ingredientId: oil, name: 'Olio extravergine', amount: 'q.b.', preparation: null, optional: true },
		]);
	});

	it('converts to the family system', () => {
		const [line] = ingredientLinesView(lines, names, { servings: 2, baseServings: 2, system: 'uk_imperial', locale: 'en-GB' });
		expect(line).toMatchObject({ name: 'Tomatoes Roma', preparation: 'diced' });
		expect(line.amount).toMatch(/oz$/);
	});

	it('shows text quantities in the language', () => {
		const text: LineInput = { ingredientId: tomato, variety: null, preparation: null, isOptional: false,
			quantity: { kind: 'text', text: { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' } } };
		expect(ingredientLinesView([text], names, { servings: 3, baseServings: 2, system: 'metric', locale: 'en-GB' })[0].amount).toBe('1 bunch');
	});

	it('fails loudly on an ingredient missing from the names', () => {
		expect(() => ingredientLinesView(lines, new Map(), { servings: 2, baseServings: 2, system: 'metric', locale: 'it-IT' })).toThrow(/ingredient/);
	});
});
```

- [ ] **Passo 2:** `npm test -w server -- recipes/lines` → FAIL.

- [ ] **Passo 3: implementazione**

In `server/package.json` aggiungi `"@app/domain": "*"`, poi `npm install`.

```ts
// server/src/recipes/lines.ts
import type { IngredientLineView } from '@app/contract';
import { formatQuantity, scaleQuantity, type Locale, type Localized, type MeasurementSystem, type Quantity } from '@app/domain/units';

/** A recipe line from the projections or from a published document: same shape. */
export interface LineInput {
	ingredientId: string;
	variety: Localized | null;
	preparation: Localized | null;
	quantity: Quantity;
	isOptional: boolean;
}
export type IngredientNames = ReadonlyMap<string, Localized>;
export interface LinesOptions { servings: number; baseServings: number; system: MeasurementSystem; locale: Locale }

/** Lines ready to show (spec section 6): scaled, in the family's system, in the caller's language. */
export function ingredientLinesView(lines: LineInput[], names: IngredientNames, options: LinesOptions): IngredientLineView[] {
	const { servings, baseServings, system, locale } = options;
	return lines.map((line) => {
		const name = names.get(line.ingredientId);
		if (!name) throw new Error(`ingredient ${line.ingredientId} missing from the names`);
		return {
			ingredientId: line.ingredientId,
			name: line.variety ? `${name[locale]} ${line.variety[locale]}` : name[locale],
			amount: formatQuantity(scaleQuantity(line.quantity, servings, baseServings), system, locale),
			preparation: line.preparation?.[locale] ?? null,
			optional: line.isOptional,
		};
	});
}
```

- [ ] **Passo 4:** `npm test -w server -- recipes/lines && npm run typecheck` → PASS.
- [ ] **Passo 5: commit** `Ricettario: righe di ingrediente scalate e scritte nella lingua`.

### Task 3: viste condivise complete (corrente, storica, mai pubblicata)

**File:**
- Crea: `server/src/recipes/views.ts`, `server/test/recipes/fixtures.ts`,
  `server/test/recipes/views.test.ts`, `server/test/recipes/menu-usage.test.ts`

**Interfacce:**
- Consuma: task 2; `Tx` da `server/src/db.ts`; `publishedRecipeSchema` da
  `@app/domain/recipe` (W3); `TestDatabase` da `server/test/support/db.ts`.
- Produce (firme definitive della spec, sezione 1):

```ts
export { ingredientLinesView, type IngredientNames, type LineInput } from './lines.ts';
export interface RecipeRef { recipeId: string; version: number | null; servings: number }
export function recipeViewKey(ref: RecipeRef): string; // `${recipeId}@${version ?? 'now'}@${servings}`
export interface Viewer { familyId: string; userId: string; locale: Locale }
export function recipeSummaries(tx: Tx, refs: RecipeRef[], locale: Locale): Promise<Map<string, RecipeSummaryView>>;
export function ingredientLines(tx: Tx, refs: RecipeRef[], options: { familyId: string; locale: Locale }): Promise<Map<string, IngredientLineView[] | null>>;
export function ratingSummaries(tx: Tx, familyId: string, userId: string, recipeIds: string[]): Promise<Map<string, RatingSummaryView>>;
export interface RecipeView { summary: RecipeSummaryView; status: 'draft' | 'published' | 'archived'; version: number;
	baseServings: number | null; ingredients: IngredientLineView[] | null; rating: RatingSummaryView | null }
export function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>>;
// Usate anche dai gestori dei task 7 e 8:
export function loadFamily(tx: Tx, familyId: string): Promise<{ system: MeasurementSystem; timeZone: string }>;
/** One SQL statement: recipe row joined to the document of the version asked (or current). */
export function loadContents(tx: Tx, refs: RecipeRef[]): Promise<Map<string, Content>>;
export function contentKey(ref: RecipeRef): string; // `${recipeId}@${version ?? 'now'}`
export function loadIngredientNamesById(tx: Tx, ids: string[]): Promise<Map<string, Localized>>;
export function loadBookTitlesById(tx: Tx, ids: (string | null)[]): Promise<Map<string, string>>;
export function summaryOf(content: Content, titles: Map<string, string>, locale: Locale): RecipeSummaryView;
```

- Produce per i test (`server/test/recipes/fixtures.ts`):

```ts
export interface RecipeFixture {
	name: Localized; description?: Localized; durationMinutes?: number; baseServings?: number;
	mealType?: 'lunch' | 'dinner' | 'both'; proteinGroup?: ProteinGroup; bookId?: string | null; bookPages?: string | null;
	sourceUrl?: string | null; createdAt?: Date;
	lines?: { ingredientId: string; quantity: Quantity; variety?: Localized; preparation?: Localized; isOptional?: boolean }[];
}
export interface CatalogueFixture {
	ingredient(slug: string, name: Localized, synonyms?: { 'it-IT': string[]; 'en-GB': string[] }): Promise<string>;
	book(slug: string, title: string): Promise<string>;
	recipe(options: RecipeFixture): Promise<string>;                 // pubblicata, versione 1
	publishVersion(recipeId: string, changes: Partial<RecipeFixture>, publishedAt?: Date): Promise<number>;
	draft(name: Partial<Record<Locale, string | null>>, description?: Partial<Record<Locale, string | null>> | null): Promise<string>;
	archive(recipeId: string): Promise<void>;
	meal(familyId: string, recipeId: string, date: string, mealType: 'lunch' | 'dinner', servings?: number): Promise<string>; // slot id
	rate(userId: string, recipeId: string, stars: number): Promise<void>;
}
export function catalogueFixture(db: TestDatabase): CatalogueFixture;
export function marker(): string; // `m` + 6 caratteri casuali
```

- [ ] **Passo 1: fixture del catalogo** (`server/test/recipes/fixtures.ts`), scritte con
  l'utenza admin come `support/db.ts`. Gli slug hanno un suffisso casuale. Il contenuto
  delle versioni è un documento pubblicabile completo nella forma di W3 (lo legge
  `publishedRecipeSchema`).

```ts
import type { ProteinGroup } from '@app/domain/planner';
import { publishedRecipeSchema } from '@app/domain/recipe';
import type { Locale, Localized, Quantity } from '@app/domain/units';
import type { TestDatabase } from '../support/db.ts';

export const marker = () => `m${crypto.randomUUID().slice(0, 6)}`;
const unique = (slug: string) => `${slug}-${crypto.randomUUID().slice(0, 8)}`;

/** `defaultLine`: the line used when the fixture gives none (W3 publishes at least one). */
function documentOf(r: RecipeFixture, defaultLine: string) {
	const sourceType = r.bookId ? 'book' : r.sourceUrl ? 'web' : 'home';
	return {
		schemaVersion: 1,
		name: r.name,
		description: r.description ?? { 'it-IT': `${r.name['it-IT']}, descrizione`, 'en-GB': `${r.name['en-GB']}, description` },
		sourceType, sourceUrl: r.sourceUrl ?? null, bookId: r.bookId ?? null,
		bookPages: r.bookId ? (r.bookPages ?? '12') : null,
		durationMinutes: r.durationMinutes ?? 30, baseServings: r.baseServings ?? 2, mealType: r.mealType ?? 'both',
		proteinGroup: r.proteinGroup ?? 'vegetarian', isFreshFish: false, carbohydrateGroup: 'pasta', category: 'pan',
		hasVegetables: true, isHeavy: false, seasons: [],
		ingredients: (r.lines?.length ? r.lines : [{ ingredientId: defaultLine, quantity: { kind: 'to_taste' } as Quantity }]).map((l) => ({ ingredientId: l.ingredientId, variety: l.variety ?? null,
			preparation: l.preparation ?? null, quantity: l.quantity, sourceText: 'source line', isOptional: l.isOptional ?? false, isPrimary: false })),
	};
}

export function catalogueFixture(db: TestDatabase): CatalogueFixture {
	const { admin } = db;
	const current = new Map<string, RecipeFixture>();
	let salt: string | undefined;

	async function writeVersion(recipeId: string, r: RecipeFixture, version: number) {
		salt ??= (await admin<{ id: string }[]>`insert into app.ingredients (slug, name, department, is_pantry)
			values (${unique('salt')}, ${admin.json({ 'it-IT': 'Sale', 'en-GB': 'Salt' })}, 'condiments', true) returning id`)[0].id;
		// A fixture that W3 would refuse fails here, not in the code under test.
		const d = publishedRecipeSchema.parse(documentOf(r, salt));
		await admin`update app.recipes set status = 'published', version = ${version},
			name = ${admin.json(d.name)}, description = ${admin.json(d.description)}, source_type = ${d.sourceType},
			source_url = ${d.sourceUrl}, book_id = ${d.bookId}, book_pages = ${d.bookPages},
			duration_minutes = ${d.durationMinutes}, base_servings = ${d.baseServings}, protein_group = ${d.proteinGroup},
			is_fresh_fish = false, carbohydrate_group = 'pasta', has_vegetables = true, category = 'pan',
			meal_type = ${d.mealType}, is_heavy = false
			where id = ${recipeId}`;
		await admin`delete from app.recipe_ingredients where recipe_id = ${recipeId}`;
		for (const [position, line] of d.ingredients.entries()) {
			const q = line.quantity;
			await admin`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key,
					quantity_kind, quantity, unit, quantity_text, source_text, preparation, is_optional)
				values (${recipeId}, ${position}, ${line.ingredientId}, ${line.variety ? admin.json(line.variety) : null},
					${line.variety?.['it-IT'].toLowerCase() ?? ''}, ${q.kind}, ${q.kind === 'amount' ? q.value : null},
					${q.kind === 'amount' ? q.unit : null}, ${q.kind === 'text' ? admin.json(q.text) : null},
					${line.sourceText}, ${line.preparation ? admin.json(line.preparation) : null}, ${line.isOptional})`;
		}
		await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
			values (${recipeId}, ${version}, ${admin.json(d)}, ${r.createdAt ?? new Date()}, 'import')`;
	}

	return {
		async ingredient(slug, name, synonyms = { 'it-IT': [], 'en-GB': [] }) {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.ingredients (slug, name, synonyms, department)
				values (${unique(slug)}, ${admin.json(name)}, ${admin.json(synonyms)}, 'produce') returning id`;
			return id;
		},
		async book(slug, title) {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.books (slug, title) values (${unique(slug)}, ${title}) returning id`;
			return id;
		},
		async recipe(r) {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.recipes (slug, created_at)
				values (${unique('r')}, ${r.createdAt ?? new Date()}) returning id`;
			await writeVersion(id, r, 1);
			current.set(id, r);
			return id;
		},
		async publishVersion(recipeId, changes, publishedAt = new Date()) {
			const [{ version }] = await admin<{ version: number }[]>`select version + 1 as version from app.recipes where id = ${recipeId}`;
			const next = { ...current.get(recipeId)!, ...changes, createdAt: publishedAt };
			await writeVersion(recipeId, next, version);
			current.set(recipeId, next);
			return version;
		},
		async draft(name, description = null) {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.recipes (slug, name, description)
				values (${unique('d')}, ${admin.json(name)}, ${description ? admin.json(description) : null}) returning id`;
			return id;
		},
		async archive(recipeId) {
			await admin`update app.recipes set status = 'archived', archived_at = now() where id = ${recipeId}`;
		},
		async meal(familyId, recipeId, date, mealType, servings = 2) {
			const monday = new Date(`${date}T12:00:00Z`);
			monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
			const startsOn = monday.toISOString().slice(0, 10);
			const [week] = await admin<{ id: string }[]>`insert into app.weeks (family_id, starts_on) values (${familyId}, ${startsOn})
				on conflict (family_id, starts_on) do update set starts_on = excluded.starts_on returning id`;
			const [{ id }] = await admin<{ id: string }[]>`insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
				values (${week.id}, ${date}, ${mealType}, ${recipeId}, ${servings}) returning id`;
			return id;
		},
		async rate(userId, recipeId, stars) {
			await admin`insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${recipeId}, ${stars})
				on conflict (user_id, recipe_id) do update set stars = excluded.stars`;
		},
	};
}
```

Se un vincolo di `recipes` (per esempio `recipes_published_complete`) rifiuta l'ordine
delle scritture di `recipe`, inserisci la riga già con tutti i campi di proiezione,
`status = 'published'` e `version = 1` in un'unica insert.

- [ ] **Passo 2: test delle viste che falliscono** (`server/test/recipes/views.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb, type Tx } from '../../src/db.ts';
import { ingredientLines, ratingSummaries, recipeSummaries, recipeViewKey, recipeViews } from '../../src/recipes/views.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('recipe views', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	beforeAll(async () => { db = await setupDatabase(); cat = catalogueFixture(db); });
	afterAll(() => db?.close());

	const asUser = <T>(user: { userId: string; sessionId: string }, fn: (tx: Tx) => Promise<T>) =>
		withDb(db.appServerUrl, { kind: 'user', claims: { sub: user.userId, role: 'authenticated', session_id: user.sessionId,
			exp: Math.floor(Date.now() / 1000) + 3600 } }, fn);
	async function family(locale: 'it-IT' | 'en-GB' = 'it-IT') {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		return { user, familyId };
	}

	it('averages the current members only and gives my stars', async () => {
		const me = await db.createUser();
		const other = await db.createUser();
		const stranger = await db.createUser();
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }, { userId: other.userId, role: 'member' }]);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Pasta', 'en-GB': 'Pasta' } });
		await cat.rate(me.userId, recipeId, 4);
		await cat.rate(other.userId, recipeId, 2);
		await cat.rate(stranger.userId, recipeId, 5);
		const map = await asUser(me, (tx) => ratingSummaries(tx, familyId, me.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: 3, familyCount: 2, myStars: 4 });
	});

	it('gives an empty summary without votes', async () => {
		const { user, familyId } = await family();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Riso', 'en-GB': 'Rice' } });
		const map = await asUser(user, (tx) => ratingSummaries(tx, familyId, user.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('builds the current view in the language and system of the family', async () => {
		const { user, familyId } = await family('en-GB');
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' }, baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' }, preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' } }] });
		const ref = { recipeId, version: null, servings: 4 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'en-GB' }, [ref]));
		const view = views.get(recipeViewKey(ref))!;
		expect(view.summary).toMatchObject({ id: recipeId, name: 'Sauce', description: 'Sauce, description', sourceType: 'home', proteinGroup: 'vegetarian' });
		expect(view).toMatchObject({ status: 'published', version: 1, baseServings: 2, rating: { familyCount: 0 } });
		expect(view.ingredients).toEqual([{ ingredientId: tomato, name: 'Tomatoes', amount: '400 g', preparation: 'diced', optional: false }]);
	});

	it('shows an older version with its own texts, servings, lines and book (R1)', async () => {
		const { user, familyId } = await family();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const bookA = await cat.book('a', 'Libro A');
		const bookB = await cat.book('b', 'Libro B');
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' }, baseServings: 2, bookId: bookA, bookPages: '12',
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
		await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' }, baseServings: 4, bookId: bookB, bookPages: '40',
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 500, unit: 'g' } }] });
		const old = { recipeId, version: 1, servings: 2 };
		const now = { recipeId, version: null, servings: 4 };
		const same = { recipeId, version: 2, servings: 4 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, [old, now, same]));
		expect(views.get(recipeViewKey(old))).toMatchObject({ version: 1, baseServings: 2,
			summary: { name: 'Sugo v1', bookTitle: 'Libro A', bookPages: '12' }, ingredients: [{ name: 'Pomodori', amount: '200 g' }] });
		expect(views.get(recipeViewKey(now))).toMatchObject({ version: 2, summary: { name: 'Sugo v2', bookTitle: 'Libro B', bookPages: '40' } });
		expect(views.get(recipeViewKey(same))).toEqual(views.get(recipeViewKey(now)));
	});

	it('keeps the book of an older version after the source became a web page', async () => {
		const { user } = await family();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const book = await cat.book('a', 'Libro A');
		const recipeId = await cat.recipe({ name: { 'it-IT': 'X', 'en-GB': 'X' }, bookId: book, lines: [{ ingredientId: tomato, quantity: { kind: 'to_taste' } }] });
		await cat.publishVersion(recipeId, { bookId: null, sourceUrl: 'https://example.com/x' });
		const refs = [{ recipeId, version: 1, servings: 2 }, { recipeId, version: null, servings: 2 }];
		const summaries = await asUser(user, (tx) => recipeSummaries(tx, refs, 'it-IT'));
		expect(summaries.get(recipeViewKey(refs[0]))).toMatchObject({ sourceType: 'book', bookTitle: 'Libro A', sourceUrl: null });
		expect(summaries.get(recipeViewKey(refs[1]))).toMatchObject({ sourceType: 'web', bookTitle: null, sourceUrl: 'https://example.com/x' });
	});

	it('summarises a never-published recipe cited by a meal with the other language and a null description', async () => {
		const { user, familyId } = await family('en-GB');
		const draftId = await cat.draft({ 'it-IT': 'Vecchia ricetta' }, null);
		await cat.meal(familyId, draftId, '2026-09-21', 'dinner');
		const ref = { recipeId: draftId, version: null, servings: 2 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'en-GB' }, [ref]));
		expect(views.get(recipeViewKey(ref))).toEqual({ status: 'draft', version: 0, baseServings: null, ingredients: null, rating: null,
			summary: { id: draftId, name: 'Vecchia ricetta', description: null, durationMinutes: null, sourceType: null, sourceUrl: null,
				bookTitle: null, bookPages: null, mealType: null, proteinGroup: null } });
		const lines = await asUser(user, (tx) => ingredientLines(tx, [ref], { familyId, locale: 'en-GB' }));
		expect(lines.get(recipeViewKey(ref))).toBeNull();
	});

	it('prefers the caller language when the draft has it, and treats null texts as missing', async () => {
		const { user, familyId } = await family('en-GB');
		const draftId = await cat.draft({ 'it-IT': 'Zuppa', 'en-GB': 'Soup' }, { 'it-IT': 'Calda', 'en-GB': null });
		await cat.meal(familyId, draftId, '2026-09-21', 'lunch');
		const ref = { recipeId: draftId, version: null, servings: 2 };
		const summaries = await asUser(user, (tx) => recipeSummaries(tx, [ref], 'en-GB'));
		expect(summaries.get(recipeViewKey(ref))).toMatchObject({ name: 'Soup', description: 'Calda' });
	});

	it('never mixes two versions when a publication lands between the statements of a read', async () => {
		const { user, familyId } = await family();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' }, baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
		// After the first statement the transaction runs, V2 is published and committed elsewhere.
		const interleaved = (tx: Tx, after: () => Promise<unknown>): Tx => {
			let done = false;
			return ((strings: TemplateStringsArray, ...values: unknown[]) =>
				(tx as any)(strings, ...values).then(async (rows: unknown) => {
					if (!done) { done = true; await after(); }
					return rows;
				})) as unknown as Tx;
		};
		const old = { recipeId, version: 1, servings: 0 };
		const now = { recipeId, version: null, servings: 0 };
		const views = await asUser(user, (tx) => recipeViews(interleaved(tx, () =>
			cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' }, baseServings: 4,
				lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 500, unit: 'g' } }] })),
			{ familyId, userId: user.userId, locale: 'it-IT' }, [old, now]));
		expect(views.get(recipeViewKey(old))).toMatchObject({ version: 1, baseServings: 2, summary: { name: 'Sugo v1' }, ingredients: [{ amount: '200 g' }] });
		const current = views.get(recipeViewKey(now))!;
		const coherent = [
			{ version: 1, baseServings: 2, name: 'Sugo v1', amount: '200 g' },
			{ version: 2, baseServings: 4, name: 'Sugo v2', amount: '500 g' },
		];
		expect(coherent).toContainEqual({ version: current.version, baseServings: current.baseServings,
			name: current.summary.name, amount: current.ingredients![0].amount });
	});

	it('leaves out recipes the user cannot read', async () => {
		const { user, familyId } = await family();
		const draftId = await cat.draft({ 'it-IT': 'Segreta', 'en-GB': 'Secret' });
		const views = await asUser(user, (tx) =>
			recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, [{ recipeId: draftId, version: null, servings: 2 }]));
		expect(views.size).toBe(0);
	});
});
```

- [ ] **Passo 3: test d'uso come il Menu** (`server/test/recipes/menu-usage.test.ts`):
  importa il modulo reale come farà `server/src/menu/week-view.ts` di W1 e compone una
  settimana.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb } from '../../src/db.ts';
import { ingredientLines, ratingSummaries, recipeSummaries, recipeViewKey, type RecipeRef } from '../../src/recipes/views.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('recipe views as the menu uses them', () => {
	let db: TestDatabase;
	beforeAll(async () => { db = await setupDatabase(); });
	afterAll(() => db?.close());

	it('composes a week: older version, never-published recipe, different servings, zero servings', async () => {
		const cat = catalogueFixture(db);
		const user = await db.createUser({ locale: 'en-GB' });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' }, baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
		await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo nuovo', 'en-GB': 'New sauce' } });
		const draftId = await cat.draft({ 'it-IT': 'Solo italiano' }, null);
		await cat.meal(familyId, draftId, '2026-09-22', 'lunch');
		// What mealRecipeVersions (W1) gives for three meals of a week.
		const refs: RecipeRef[] = [
			{ recipeId, version: 1, servings: 2 },          // past meal, eaten with version 1
			{ recipeId, version: 2, servings: 4 },          // future meal, current version, more servings
			{ recipeId: draftId, version: null, servings: 2 },
			{ recipeId, version: 2, servings: 0 },          // a slot with zero servings: lines at the base
		];
		const claims = { sub: user.userId, role: 'authenticated' as const, session_id: user.sessionId, exp: Math.floor(Date.now() / 1000) + 3600 };
		const { summaries, lines, ratings } = await withDb(db.appServerUrl, { kind: 'user', claims }, async (tx) => ({
			summaries: await recipeSummaries(tx, refs, 'en-GB'),
			lines: await ingredientLines(tx, refs, { familyId, locale: 'en-GB' }),
			ratings: await ratingSummaries(tx, familyId, user.userId, [recipeId]),
		}));
		expect(summaries.get(recipeViewKey(refs[0]))?.name).toBe('Sauce');
		expect(summaries.get(recipeViewKey(refs[1]))?.name).toBe('New sauce');
		expect(summaries.get(recipeViewKey(refs[2]))).toMatchObject({ name: 'Solo italiano', description: null });
		expect(lines.get(recipeViewKey(refs[0]))?.[0].amount).toBe('200 g');
		expect(lines.get(recipeViewKey(refs[1]))?.[0].amount).toBe('400 g');
		expect(lines.get(recipeViewKey(refs[2]))).toBeNull();
		expect(lines.get(recipeViewKey(refs[3]))?.[0].amount).toBe('200 g');
		expect(ratings.get(recipeId)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});
});
```

- [ ] **Passo 4:** `npm test -w server -- recipes` (con `TEST_DATABASE_URL`) → FAIL.

- [ ] **Passo 5: implementazione** (`server/src/recipes/views.ts`)

```ts
import type { IngredientLineView, Locale, RatingSummaryView, RecipeSummaryView } from '@app/contract';
import { publishedRecipeSchema } from '@app/domain/recipe';
import type { Localized, MeasurementSystem } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { ingredientLinesView, type LineInput } from './lines.ts';

export { ingredientLinesView, type IngredientNames, type LineInput } from './lines.ts';

export interface RecipeRef {
	recipeId: string;
	/** A published version (also the current one), or null: the recipe as it is now. */
	version: number | null;
	servings: number;
}
export interface Viewer { familyId: string; userId: string; locale: Locale }
export interface RecipeView {
	summary: RecipeSummaryView;
	status: 'draft' | 'published' | 'archived';
	/** Version shown; 0 for a never-published recipe. */
	version: number;
	baseServings: number | null;
	ingredients: IngredientLineView[] | null;
	rating: RatingSummaryView | null;
}

export const recipeViewKey = (ref: RecipeRef) => `${ref.recipeId}@${ref.version ?? 'now'}@${ref.servings}`;
export const contentKey = (ref: RecipeRef) => `${ref.recipeId}@${ref.version ?? 'now'}`;

/** Projections of a draft may miss a language, or hold null. */
type PartialText = Partial<Record<Locale, string | null>> | null;
const OTHER: Record<Locale, Locale> = { 'it-IT': 'en-GB', 'en-GB': 'it-IT' };
/** The caller's language, else the other one (spec of W6, section 1). */
const pick = (text: PartialText, locale: Locale): string | null => text?.[locale] || text?.[OTHER[locale]] || null;

/** What a reference shows: the document of a published version, or a never-published recipe. */
export interface Content {
	recipeId: string;
	status: RecipeView['status'];
	/** Version shown; 0 for a never-published recipe. */
	version: number;
	name: PartialText;
	description: PartialText;
	durationMinutes: number | null;
	sourceType: RecipeSummaryView['sourceType'];
	sourceUrl: string | null;
	bookId: string | null;
	bookPages: string | null;
	mealType: RecipeSummaryView['mealType'];
	proteinGroup: RecipeSummaryView['proteinGroup'];
	baseServings: number | null;
	/** null for a never-published recipe. */
	lines: LineInput[] | null;
}

export async function loadFamily(tx: Tx, familyId: string): Promise<{ system: MeasurementSystem; timeZone: string }> {
	const [row] = await tx<{ system: MeasurementSystem; timeZone: string }[]>`
		select measurement_system as system, time_zone as "timeZone" from app.families where id = ${familyId}`;
	if (!row) throw appError('forbidden');
	return row;
}

export async function ratingSummaries(tx: Tx, familyId: string, userId: string, recipeIds: string[]): Promise<Map<string, RatingSummaryView>> {
	const rows = await tx<{ recipeId: string; average: string | null; votes: number; mine: number | null }[]>`
		select id as "recipeId", s.average::text as average, coalesce(s.votes, 0)::int as votes, r.stars::int as mine
		from unnest(${recipeIds}::uuid[]) as id
		left join app.family_scores s on s.family_id = ${familyId} and s.recipe_id = id
		left join app.ratings r on r.user_id = ${userId} and r.recipe_id = id`;
	return new Map(rows.map((row) => [row.recipeId, {
		familyAverage: row.average === null ? null : Number(row.average),
		familyCount: row.votes,
		myStars: row.mine,
	}]));
}

const NEVER_PUBLISHED = { version: 0, durationMinutes: null, sourceType: null, sourceUrl: null, bookId: null, bookPages: null,
	mealType: null, proteinGroup: null, baseServings: null, lines: null } as const;

/**
 * Contents of the references, keyed by contentKey, from ONE statement: the recipe row and the
 * immutable document of the version asked (the current one for null). Read committed gives a
 * statement a single snapshot, so a concurrent publication cannot mix two versions (R1).
 * References RLS hides, and versions that do not exist, are left out.
 */
export async function loadContents(tx: Tx, refs: RecipeRef[]): Promise<Map<string, Content>> {
	const wanted = [...new Map(refs.map((ref) => [contentKey(ref), ref])).values()];
	if (!wanted.length) return new Map();
	const rows = await tx<{ recipeId: string; requested: number; status: RecipeView['status']; name: PartialText;
		description: PartialText; version: number | null; content: unknown }[]>`
		select r.id as "recipeId", w.version as requested, r.status, r.name, r.description, v.version, v.content
		from unnest(${wanted.map((ref) => ref.recipeId)}::uuid[], ${wanted.map((ref) => ref.version ?? 0)}::int[]) as w(recipe_id, version)
		join app.recipes r on r.id = w.recipe_id
		left join app.recipe_versions v
			on v.recipe_id = r.id and v.version = coalesce(nullif(w.version, 0), nullif(r.version, 0))`;
	const contents = new Map<string, Content>();
	for (const row of rows) {
		const key = contentKey({ recipeId: row.recipeId, version: row.requested || null, servings: 0 });
		if (row.status === 'draft') {
			// Never published: name and description only (a draft has no version to ask for).
			if (!row.requested) contents.set(key, { recipeId: row.recipeId, status: 'draft', name: row.name, description: row.description, ...NEVER_PUBLISHED });
			continue;
		}
		if (row.content === null || row.version === null) continue;
		const d = publishedRecipeSchema.parse(row.content);
		contents.set(key, {
			recipeId: row.recipeId, status: row.status, version: row.version,
			name: d.name, description: d.description, durationMinutes: d.durationMinutes, sourceType: d.sourceType,
			sourceUrl: d.sourceUrl, bookId: d.bookId, bookPages: d.bookPages, mealType: d.mealType, proteinGroup: d.proteinGroup,
			baseServings: d.baseServings,
			lines: d.ingredients.map((l) => ({ ingredientId: l.ingredientId, variety: l.variety, preparation: l.preparation,
				quantity: l.quantity, isOptional: l.isOptional })),
		});
	}
	return contents;
}

export async function loadBookTitlesById(tx: Tx, ids: (string | null)[]): Promise<Map<string, string>> {
	const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
	if (!wanted.length) return new Map();
	const rows = await tx<{ id: string; title: string }[]>`select id, title from app.books where id = any(${wanted}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.title]));
}

export async function loadIngredientNamesById(tx: Tx, ids: string[]): Promise<Map<string, Localized>> {
	if (!ids.length) return new Map();
	const rows = await tx<{ id: string; name: Localized }[]>`select id, name from app.ingredients where id = any(${ids}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.name]));
}

const lineIngredientIds = (contents: Iterable<Content>) => {
	const ids = new Set<string>();
	for (const content of contents) for (const line of content.lines ?? []) ids.add(line.ingredientId);
	return [...ids];
};

export const summaryOf = (c: Content, titles: Map<string, string>, locale: Locale): RecipeSummaryView => ({
	id: c.recipeId, name: pick(c.name, locale) ?? '', description: pick(c.description, locale),
	durationMinutes: c.durationMinutes, sourceType: c.sourceType, sourceUrl: c.sourceUrl,
	bookTitle: c.bookId ? titles.get(c.bookId) ?? null : null, bookPages: c.bookPages,
	mealType: c.mealType, proteinGroup: c.proteinGroup,
});

/** Zero servings (allowed on a meal slot) show the lines at the recipe's base: scaleQuantity never sees 0. */
const linesOf = (c: Content, ref: RecipeRef, names: Map<string, Localized>, system: MeasurementSystem, locale: Locale) =>
	c.lines && c.baseServings
		? ingredientLinesView(c.lines, names, { servings: ref.servings > 0 ? ref.servings : c.baseServings, baseServings: c.baseServings, system, locale })
		: null;

export async function recipeSummaries(tx: Tx, refs: RecipeRef[], locale: Locale): Promise<Map<string, RecipeSummaryView>> {
	const contents = await loadContents(tx, refs);
	const titles = await loadBookTitlesById(tx, [...contents.values()].map((c) => c.bookId));
	const result = new Map<string, RecipeSummaryView>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (content) result.set(recipeViewKey(ref), summaryOf(content, titles, locale));
	}
	return result;
}

export async function ingredientLines(tx: Tx, refs: RecipeRef[], options: { familyId: string; locale: Locale }): Promise<Map<string, IngredientLineView[] | null>> {
	const [{ system }, contents] = await Promise.all([loadFamily(tx, options.familyId), loadContents(tx, refs)]);
	const names = await loadIngredientNamesById(tx, lineIngredientIds(contents.values()));
	const result = new Map<string, IngredientLineView[] | null>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (content) result.set(recipeViewKey(ref), linesOf(content, ref, names, system, options.locale));
	}
	return result;
}

export async function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>> {
	const [{ system }, contents, ratings] = await Promise.all([
		loadFamily(tx, viewer.familyId), loadContents(tx, refs),
		ratingSummaries(tx, viewer.familyId, viewer.userId, [...new Set(refs.map((ref) => ref.recipeId))]),
	]);
	const [titles, names] = await Promise.all([
		loadBookTitlesById(tx, [...contents.values()].map((c) => c.bookId)),
		loadIngredientNamesById(tx, lineIngredientIds(contents.values())),
	]);
	const result = new Map<string, RecipeView>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (!content) continue;
		result.set(recipeViewKey(ref), {
			summary: summaryOf(content, titles, viewer.locale),
			status: content.status,
			version: content.version,
			baseServings: content.baseServings,
			ingredients: linesOf(content, ref, names, system, viewer.locale),
			rating: content.status === 'draft' ? null : ratings.get(ref.recipeId)!,
		});
	}
	return result;
}
```

Nota: Postgres.js accoda le query della stessa transazione, quindi `Promise.all` è
corretto (nessuna richiesta concorrente sulla connessione). L'array delle versioni usa 0
per «corrente» invece di `null`, così Postgres.js lo serializza come semplice `int[]`.

- [ ] **Passo 6:** `npm test -w server -- recipes && npm run typecheck` → PASS.
- [ ] **Passo 7: commit** `Ricettario: viste condivise per il Menu, con versioni storiche e bozze citate`.

### Task 4: operazione `ratings.set`

**File:**
- Crea: `contract/src/recipes/ratings.ts`, `server/src/recipes/access.ts`,
  `server/src/recipes/router.ts`, `server/test/recipes/ratings.test.ts`,
  `server/test/recipes/app.ts` (app di test condivisa dai test delle operazioni)
- Modifica: `contract/src/recipes/index.ts`, `contract/src/contract.ts` (chiave
  `ratings`), `server/src/pipeline.ts` (export del tipo `Implementer`),
  `server/src/router.ts` (chiave `ratings`)

**Interfacce:**
- Consuma: `ratingSummaries` (task 3); `op`, `errorDefinitions` da `@app/contract`.
- Produce: `ratingsContract = { set }`; `type Implementer` in `pipeline.ts`;
  `canSeeRecipe(tx, familyId, recipeId): Promise<'published' | 'archived' | null>` in
  `access.ts` (riusata dal task 8); `ratingsRouter(os: Implementer)` in
  `server/src/recipes/router.ts`; per i test `testApp(db)` in `server/test/recipes/app.ts`.

- [ ] **Passo 1: supporto dei test** (`server/test/recipes/app.ts`)

```ts
import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import type { TestDatabase } from '../support/db.ts';
import { createTestKeys } from '../support/keys.ts';
import { rpcClient, testEnv } from '../support/requests.ts';

export interface TestMember { userId: string; sessionId: string; familyId: string; token: string; client: ContractRouterClient<Contract> }

export async function testApp(db: TestDatabase) {
	const keys = await createTestKeys();
	const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	const env = testEnv(db.appServerUrl);
	async function clientFor(user: { userId: string; sessionId: string }) {
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId });
		return { token, client: rpcClient<ContractRouterClient<Contract>>(app, env, token) };
	}
	async function member(locale: 'it-IT' | 'en-GB' = 'it-IT'): Promise<TestMember> {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		return { ...user, familyId, ...(await clientFor(user)) };
	}
	return { app, env, keys, clientFor, member };
}
```

- [ ] **Passo 2: test che falliscono** (`server/test/recipes/ratings.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { testApp } from './app.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('ratings.set', () => {
	let db: TestDatabase; let cat: CatalogueFixture; let t: Awaited<ReturnType<typeof testApp>>;
	beforeAll(async () => { db = await setupDatabase(); cat = catalogueFixture(db); t = await testApp(db); });
	afterAll(() => db?.close());

	it('sets, changes and removes my stars, answering the family summary; repeating is harmless', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'A', 'en-GB': 'A' } });
		const set = (stars: number | null) => m.client.ratings.set({ familyId: m.familyId, recipeId, stars });
		expect(await set(4)).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
		expect(await set(2)).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await set(2)).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await set(null)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(await set(null)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('drops a removed member from the average and refuses the same token afterwards', async () => {
		const admin = await t.member();
		const other = await db.createUser();
		await db.addMember(admin.familyId, other.userId, 'member');
		const { client: otherClient } = await t.clientFor(other);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'B', 'en-GB': 'B' } });
		await otherClient.ratings.set({ familyId: admin.familyId, recipeId, stars: 5 });
		expect(await admin.client.ratings.set({ familyId: admin.familyId, recipeId, stars: 3 })).toEqual({ familyAverage: 4, familyCount: 2, myStars: 3 });
		await db.admin`delete from app.family_members where family_id = ${admin.familyId} and user_id = ${other.userId}`;
		expect(await admin.client.ratings.set({ familyId: admin.familyId, recipeId, stars: 3 })).toEqual({ familyAverage: 3, familyCount: 1, myStars: 3 });
		await expect(otherClient.ratings.set({ familyId: admin.familyId, recipeId, stars: 1 })).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('rates an archived recipe', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'C', 'en-GB': 'C' } });
		await cat.archive(recipeId);
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 })).myStars).toBe(5);
	});

	it('refuses drafts, unknown recipes and books the family does not own unless a meal cites them', async () => {
		const m = await t.member();
		const draftId = await cat.draft({ 'it-IT': 'D', 'en-GB': 'D' });
		await cat.meal(m.familyId, draftId, '2026-09-21', 'lunch');
		const bookId = await cat.book('book', 'Il libro');
		const fromBook = await cat.recipe({ name: { 'it-IT': 'E', 'en-GB': 'E' }, bookId });
		for (const recipeId of [draftId, crypto.randomUUID(), fromBook]) {
			await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'not_found' });
		}
		await cat.meal(m.familyId, fromBook, '2026-09-21', 'dinner');
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId: fromBook, stars: 3 })).myStars).toBe(3);
	});

	it('is forbidden outside my families and rejects stars out of range', async () => {
		const m = await t.member();
		const other = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'F', 'en-GB': 'F' } });
		await expect(m.client.ratings.set({ familyId: other.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'forbidden' });
		await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 6 })).rejects.toMatchObject({ code: 'invalid' });
	});

	it('is an MCP tool that writes', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'G', 'en-GB': 'G' } });
		const list = await mcp(t.app, t.env, m.token, 'tools/list');
		expect(list.body.result.tools.find((tool: any) => tool.name === 'ratings_set').annotations.readOnlyHint).toBe(false);
		const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'ratings_set', arguments: { familyId: m.familyId, recipeId, stars: 4 } });
		expect(toolBody(call)).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
	});
});
```

- [ ] **Passo 3:** `npm test -w server -- recipes/ratings` → FAIL.

- [ ] **Passo 4: contratto**

```ts
// contract/src/recipes/ratings.ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { ratingSummaryView } from './views.ts';

export const ratingsContract = {
	set: op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' })
		.route({ method: 'PUT', path: '/families/{familyId}/ratings/{recipeId}',
			summary: "Set the caller's stars (1-5) for a recipe, or remove them with stars: null; answers the family's rating summary" })
		.errors({ not_found: errorDefinitions.not_found })
		.input(z.object({ familyId: z.uuid(), recipeId: z.uuid(), stars: z.number().int().min(1).max(5).nullable() }))
		.output(ratingSummaryView),
};
```

In `contract/src/recipes/index.ts` aggiungi `export { ratingsContract } from './ratings.ts';`;
in `contract/src/contract.ts` aggiungi `ratings: ratingsContract,`.

- [ ] **Passo 5: tipo dell'implementatore, visibilità e gestore**

In `server/src/pipeline.ts`, in fondo, se W1 o W2 non l'hanno già aggiunto:

```ts
/** The implementer built once in router.ts and handed to the area factories. */
export type Implementer = ReturnType<typeof createImplementer<import('@app/contract').Contract>>;
```

```ts
// server/src/recipes/access.ts
import type { Tx } from '../db.ts';

/**
 * What a family may open and rate (spec of W6): published or archived recipes; those from a
 * book only when the family owns it or one of its meals cites the recipe. Drafts: never here.
 */
export async function canSeeRecipe(tx: Tx, familyId: string, recipeId: string): Promise<'published' | 'archived' | null> {
	const [row] = await tx<{ status: 'published' | 'archived' }[]>`
		select r.status from app.recipes r
		where r.id = ${recipeId} and r.status <> 'draft'
			and (r.book_id is null
				or exists (select 1 from app.family_books fb where fb.family_id = ${familyId} and fb.book_id = r.book_id)
				or exists (select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id
					where w.family_id = ${familyId} and s.recipe_id = r.id))`;
	return row?.status ?? null;
}
```

```ts
// server/src/recipes/router.ts
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { canSeeRecipe } from './access.ts';
import { ratingSummaries } from './views.ts';

export function ratingsRouter(os: Implementer) {
	return {
		set: os.ratings.set.handler(async ({ context, input }) => {
			const { tx, userId } = context;
			if (!(await canSeeRecipe(tx, input.familyId, input.recipeId))) throw appError('not_found');
			if (input.stars === null) {
				await tx`delete from app.ratings where user_id = ${userId} and recipe_id = ${input.recipeId}`;
			} else {
				await tx`insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${input.recipeId}, ${input.stars})
					on conflict (user_id, recipe_id) do update set stars = excluded.stars, updated_at = now()`;
			}
			return (await ratingSummaries(tx, input.familyId, userId, [input.recipeId])).get(input.recipeId)!;
		}),
	};
}
```

In `server/src/router.ts`: `ratings: ratingsRouter(os),` accanto a `session`.

- [ ] **Passo 6:** `npm test -w server && npm test -w contract && npm run typecheck` →
  PASS (compresi `checkContract` e `app.test.ts`: se un test elenca gli strumenti MCP
  attesi, aggiungi `ratings_set`).
- [ ] **Passo 7: commit** `Ricettario: voto per membro con media della famiglia (ratings.set)`.

### Task 5: PR anticipata delle viste condivise

- [ ] **Passo 1:** verifica completa con `superpowers:verification-before-completion`:
  `npm run typecheck && npm test` con `TEST_DATABASE_URL` impostata; tutto verde.
- [ ] **Passo 2:** push di `traguardo/ricettario-viste` e `gh pr create --base main`,
  titolo «Ricettario: viste condivise e voto (W6, parte A)»; descrizione in italiano:
  cosa fa (schemi delle viste, `recipeSummaries`, `ingredientLines`, `ratingSummaries`,
  `recipeViews`, `ingredientLinesView`, `ratings.set`), firme per W1 con rimando alla
  sezione 1 della spec, verifica eseguita, sezioni della specifica realizzate (parte 1
  «Le stelline», sezioni 1, 6, 8 per R1, 13), riga di attribuzione.
- [ ] **Passo 3:** `STATO: PR_APERTA <url>` e fermati fino ai rilievi.

---

## Parte B: ricettario e scheda (server)

Branch `traguardo/ricettario`, ribasato su `main` dopo il merge della parte A.

### Task 6: ricerca e ordinamento (funzione pura)

**File:**
- Crea: `server/src/recipes/search.ts`, `server/test/recipes/search.test.ts`

**Interfacce:**
- Consuma: `plainWords` da `@app/domain/units`.
- Produce:

```ts
export interface SearchCandidate {
	id: string; name: Localized; description: Localized; mealType: 'lunch' | 'dinner' | 'both';
	durationMinutes: number; proteinGroup: ProteinGroup; familyAverage: number | null;
	addedOn: string; lastEatenOn: string | null;
	/** Ingredient names, varieties and synonyms, already in the caller's language. */
	ingredientTexts: string[];
}
export interface RecipeQuery { text?: string; mealType?: 'lunch' | 'dinner'; maxMinutes?: number; proteinGroup?: ProteinGroup;
	minStars?: number; sort?: 'name' | 'rating' | 'added' | 'lastEaten'; reversed?: boolean }
export function searchRecipes(candidates: SearchCandidate[], query: RecipeQuery, locale: Locale): SearchCandidate[];
```

- [ ] **Passo 1: test che falliscono**

```ts
// server/test/recipes/search.test.ts
import { describe, expect, it } from 'vitest';
import { searchRecipes, type SearchCandidate } from '../../src/recipes/search.ts';

const t = (it: string, en = it) => ({ 'it-IT': it, 'en-GB': en });
const candidate = (id: string, over: Partial<SearchCandidate> = {}): SearchCandidate => ({
	id, name: t(id), description: t(''), mealType: 'both', durationMinutes: 30, proteinGroup: 'vegetarian',
	familyAverage: null, addedOn: '2026-01-01', lastEatenOn: null, ingredientTexts: [], ...over,
});
const ids = (list: SearchCandidate[]) => list.map((c) => c.id);

describe('searchRecipes', () => {
	const pasta = candidate('Zucchine e pasta', { ingredientTexts: ['Zucchine', 'Pasta', 'zucchina'] });
	const risotto = candidate('Risotto', { description: t('Con lo zafferano'), ingredientTexts: ['Riso'] });

	it('matches every word, ignoring case, accents and order', () => {
		expect(ids(searchRecipes([pasta, risotto], { text: 'Pàsta  ZUCCHINE' }, 'it-IT'))).toEqual(['Zucchine e pasta']);
		expect(ids(searchRecipes([pasta, risotto], { text: 'zafferano' }, 'it-IT'))).toEqual(['Risotto']);
		expect(ids(searchRecipes([pasta, risotto], { text: 'pasta riso' }, 'it-IT'))).toEqual([]);
		expect(ids(searchRecipes([pasta, risotto], { text: ' ?! ' }, 'it-IT'))).toEqual(['Risotto', 'Zucchine e pasta']);
	});

	it('finds through synonyms, given in the caller language by the loader', () => {
		expect(ids(searchRecipes([pasta, risotto], { text: 'zucchina' }, 'it-IT'))).toEqual(['Zucchine e pasta']);
	});

	it('searches the texts of the caller language only', () => {
		const soup = candidate('s', { name: t('Zuppa', 'Soup') });
		expect(ids(searchRecipes([soup], { text: 'soup' }, 'it-IT'))).toEqual([]);
		expect(ids(searchRecipes([soup], { text: 'soup' }, 'en-GB'))).toEqual(['s']);
	});

	it('filters by meal, time, group and minimum stars', () => {
		const lunch = candidate('a', { mealType: 'lunch', durationMinutes: 15, proteinGroup: 'fish', familyAverage: 4 });
		const both = candidate('b', { mealType: 'both', durationMinutes: 45, familyAverage: 3.5 });
		const dinner = candidate('c', { mealType: 'dinner' });
		expect(ids(searchRecipes([lunch, both, dinner], { mealType: 'lunch' }, 'it-IT'))).toEqual(['a', 'b']);
		expect(ids(searchRecipes([lunch, both, dinner], { maxMinutes: 30 }, 'it-IT'))).toEqual(['a', 'c']);
		expect(ids(searchRecipes([lunch, both, dinner], { proteinGroup: 'fish' }, 'it-IT'))).toEqual(['a']);
		expect(ids(searchRecipes([lunch, both, dinner], { minStars: 4 }, 'it-IT'))).toEqual(['a']);
	});

	it('sorts by name in the language by default', () => {
		const list = [candidate('b', { name: t('Èrba') }), candidate('a', { name: t('Zuppa') }), candidate('c', { name: t('arrosto') })];
		expect(ids(searchRecipes(list, {}, 'it-IT'))).toEqual(['c', 'b', 'a']);
	});

	it('keeps missing values last in both directions, ties by name', () => {
		const list = [
			candidate('none', { familyAverage: null, lastEatenOn: null }),
			candidate('low', { familyAverage: 2, lastEatenOn: '2026-09-01' }),
			candidate('high', { familyAverage: 5, lastEatenOn: '2026-10-01' }),
			candidate('high2', { familyAverage: 5, lastEatenOn: '2026-10-01' }),
		];
		expect(ids(searchRecipes(list, { sort: 'rating' }, 'it-IT'))).toEqual(['high', 'high2', 'low', 'none']);
		expect(ids(searchRecipes(list, { sort: 'rating', reversed: true }, 'it-IT'))).toEqual(['low', 'high', 'high2', 'none']);
		expect(ids(searchRecipes(list, { sort: 'lastEaten', reversed: true }, 'it-IT'))).toEqual(['low', 'high', 'high2', 'none']);
		expect(ids(searchRecipes(list, { sort: 'added' }, 'it-IT'))).toEqual(['high', 'high2', 'low', 'none']);
		expect(ids(searchRecipes(list, { reversed: true }, 'it-IT'))).toEqual(['none', 'low', 'high2', 'high']);
	});
});
```

(«added»: tutte con la stessa data, l'ordine segue il nome.)

- [ ] **Passo 2:** `npm test -w server -- recipes/search` → FAIL.

- [ ] **Passo 3: implementazione**

```ts
// server/src/recipes/search.ts
import type { ProteinGroup } from '@app/domain/planner';
import { plainWords, type Locale, type Localized } from '@app/domain/units';

export interface SearchCandidate {
	id: string; name: Localized; description: Localized; mealType: 'lunch' | 'dinner' | 'both';
	durationMinutes: number; proteinGroup: ProteinGroup; familyAverage: number | null;
	addedOn: string; lastEatenOn: string | null;
	/** Ingredient names, varieties and synonyms, already in the caller's language. */
	ingredientTexts: string[];
}
export interface RecipeQuery { text?: string; mealType?: 'lunch' | 'dinner'; maxMinutes?: number; proteinGroup?: ProteinGroup;
	minStars?: number; sort?: 'name' | 'rating' | 'added' | 'lastEaten'; reversed?: boolean }

const plain = (text: string) => plainWords(text).join(' ');

function matches(candidate: SearchCandidate, words: string[], locale: Locale): boolean {
	if (!words.length) return true;
	const texts = [candidate.name[locale], candidate.description[locale], ...candidate.ingredientTexts].map(plain);
	return words.every((word) => texts.some((text) => text.includes(word)));
}

type Key = string | number | null;
const keyOf = (candidate: SearchCandidate, sort: RecipeQuery['sort']): Key =>
	sort === 'rating' ? candidate.familyAverage : sort === 'added' ? candidate.addedOn : sort === 'lastEaten' ? candidate.lastEatenOn : null;

/** Filters and orders the recipe book (spec of W6): missing values stay last even when reversed. */
export function searchRecipes(candidates: SearchCandidate[], query: RecipeQuery, locale: Locale): SearchCandidate[] {
	const words = plainWords(query.text ?? '');
	const byName = (a: SearchCandidate, b: SearchCandidate) => a.name[locale].localeCompare(b.name[locale], locale);
	const sort = query.sort ?? 'name';
	const direction = query.reversed ? -1 : 1;
	return candidates
		.filter((c) => !query.mealType || c.mealType === query.mealType || c.mealType === 'both')
		.filter((c) => !query.maxMinutes || c.durationMinutes <= query.maxMinutes)
		.filter((c) => !query.proteinGroup || c.proteinGroup === query.proteinGroup)
		.filter((c) => !query.minStars || (c.familyAverage !== null && c.familyAverage >= query.minStars))
		.filter((c) => matches(c, words, locale))
		.sort((a, b) => {
			if (sort === 'name') return direction * byName(a, b);
			const ka = keyOf(a, sort);
			const kb = keyOf(b, sort);
			if (ka === null || kb === null) return ka === kb ? byName(a, b) : ka === null ? 1 : -1;
			if (ka === kb) return byName(a, b);
			return direction * (ka < kb ? 1 : -1); // descending by default
		});
}
```

- [ ] **Passo 4:** `npm test -w server -- recipes/search` → PASS.
- [ ] **Passo 5: commit** `Ricettario: ricerca con sinonimi, filtri e ordinamenti`.

### Task 7: operazione `recipes.search`

**File:**
- Crea: `contract/src/recipes/recipes.ts`, `server/src/recipes/load.ts`,
  `server/test/recipes/recipes-search.test.ts`
- Modifica: `contract/src/recipes/index.ts`, `contract/src/contract.ts` (chiave
  `recipes`), `server/src/recipes/router.ts`, `server/src/router.ts`

**Interfacce:**
- Consuma: task 3 (`loadFamily`, `loadContents`, `contentKey`,
  `loadIngredientNamesById`, `loadBookTitlesById`, `ratingSummaries`, `summaryOf`,
  `ingredientLinesView`) e task 6; `testApp`, `catalogueFixture`, `marker` dei test.
- Produce: `recipesContract.search`, `recipeQuerySchema`, `recipeListItemView`;
  `recipesRouter(os: Implementer)`; in `load.ts`:

```ts
export interface MealOccurrence { recipeId: string; date: string; mealType: 'lunch' | 'dinner'; passesAt: string; past: boolean }
/** Meals of the family citing these recipes, most recent first by passesAt. */
export function loadMealOccurrences(tx: Tx, familyId: string, recipeIds: string[]): Promise<MealOccurrence[]>;
export function loadCandidateIds(tx: Tx, familyId: string): Promise<string[]>;
export function loadAddedOn(tx: Tx, familyId: string, recipeIds: string[]): Promise<Map<string, string>>;
export function loadSynonyms(tx: Tx, ingredientIds: string[]): Promise<Map<string, { 'it-IT': string[]; 'en-GB': string[] }>>;
/** Upcoming meals of one recipe, soonest first, all of them. */
export function upcomingOf(meals: MealOccurrence[], recipeId: string): MealOccurrenceView[];
```

- [ ] **Passo 1: test che falliscono** (`recipes-search.test.ts`)

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { testApp, type TestMember } from './app.ts';
import { catalogueFixture, marker, type CatalogueFixture } from './fixtures.ts';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

describe.skipIf(!hasDatabase)('recipes.search', () => {
	let db: TestDatabase; let cat: CatalogueFixture; let t: Awaited<ReturnType<typeof testApp>>;
	beforeAll(async () => { db = await setupDatabase(); cat = catalogueFixture(db); t = await testApp(db); });
	afterAll(() => db?.close());

	async function search(m: TestMember, query: object) {
		const result = await m.client.recipes.search({ familyId: m.familyId, query });
		if (result.unchanged) throw new Error('fresh read expected');
		return result.data.items;
	}

	it('lists published recipes visible to the family, with lines for the base servings', async () => {
		const m = await t.member();
		const k = marker();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const visible = await cat.recipe({ name: { 'it-IT': `Sugo ${k}`, 'en-GB': `Sauce ${k}` }, baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
		const archived = await cat.recipe({ name: { 'it-IT': `Vecchio ${k}`, 'en-GB': `Old ${k}` } });
		await cat.archive(archived);
		await cat.draft({ 'it-IT': `Bozza ${k}`, 'en-GB': `Draft ${k}` });
		const bookId = await cat.book('b', 'Libro');
		const fromBook = await cat.recipe({ name: { 'it-IT': `Dal libro ${k}`, 'en-GB': `From book ${k}` }, bookId });
		const items = await search(m, { text: k });
		expect(items.map((i) => i.recipe.id)).toEqual([visible]);
		expect(items[0]).toMatchObject({ baseServings: 2, ingredients: [{ name: 'Pomodori', amount: '200 g' }],
			rating: { familyCount: 0 }, lastEatenOn: null, upcoming: [] });
		await db.admin`insert into app.family_books (family_id, book_id) values (${m.familyId}, ${bookId})`;
		expect((await search(m, { text: k })).map((i) => i.recipe.id).sort()).toEqual([visible, fromBook].sort());
	});

	it('searches the synonyms of the caller language only', async () => {
		const m = await t.member('it-IT');
		const k = marker();
		const leek = await cat.ingredient('leek', { 'it-IT': 'Porri', 'en-GB': 'Leeks' }, { 'it-IT': [`porro${k}`], 'en-GB': [`leek${k}`] });
		const soup = await cat.recipe({ name: { 'it-IT': 'Zuppa', 'en-GB': 'Soup' }, lines: [{ ingredientId: leek, quantity: { kind: 'amount', value: 2, unit: 'piece' } }] });
		expect((await search(m, { text: `porro${k}` })).map((i) => i.recipe.id)).toEqual([soup]);
		expect(await search(m, { text: `leek${k}` })).toEqual([]);
	});

	it('gives lastEatenOn and every upcoming meal, in time order (lunch before dinner)', async () => {
		const m = await t.member();
		const k = marker();
		const recipeId = await cat.recipe({ name: { 'it-IT': `Pasto ${k}`, 'en-GB': `Meal ${k}` } });
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
		const future = [[day(2), 'lunch'], [day(2), 'dinner'], [day(3), 'lunch'], [day(4), 'dinner']] as const;
		for (const [date, mealType] of future) await cat.meal(m.familyId, recipeId, date, mealType);
		const [item] = await search(m, { text: k });
		expect(item.lastEatenOn).toBe('2026-09-21');
		expect(item.upcoming.map((u) => [u.date, u.mealType])).toEqual(future.map(([d, mt]) => [d, mt]));
		const [{ at }] = await db.admin<{ at: Date }[]>`
			select app.meal_passed_at(${day(2)}::date, 'lunch', time_zone) as at from app.families where id = ${m.familyId}`;
		expect(item.upcoming[0].passesAt).toBe(at.toISOString());
	});

	it('answers unchanged with the same version, fresh after a rating', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Invariato', 'en-GB': 'Unchanged' } });
		const first = await m.client.recipes.search({ familyId: m.familyId, query: {} });
		expect(await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version }))
			.toEqual({ unchanged: true, version: first.version });
		await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 });
		expect((await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version })).unchanged).toBe(false);
	});

	it('is forbidden to non members and works as a read-only MCP tool', async () => {
		const m = await t.member();
		const other = await t.member();
		const k = marker();
		const recipeId = await cat.recipe({ name: { 'it-IT': `Mcp ${k}`, 'en-GB': `Mcp ${k}` } });
		await expect(m.client.recipes.search({ familyId: other.familyId, query: {} })).rejects.toMatchObject({ code: 'forbidden' });
		const list = await mcp(t.app, t.env, m.token, 'tools/list');
		expect(list.body.result.tools.find((tool: any) => tool.name === 'recipes_search').annotations.readOnlyHint).toBe(true);
		const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'recipes_search', arguments: { familyId: m.familyId, query: { text: k } } });
		expect(toolBody(call)).toMatchObject({ unchanged: false, data: { items: [{ recipe: { id: recipeId, name: `Mcp ${k}` } }] } });
	});
});
```

Se il trigger della data delle settimane rifiuta un pasto, scegli date nella settimana
corrente o nella successiva.

- [ ] **Passo 2:** `npm test -w server -- recipes-search` → FAIL.

- [ ] **Passo 3: contratto** (`contract/src/recipes/recipes.ts`)

```ts
import { z } from 'zod';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { ingredientLineView, isoDateSchema, mealOccurrenceView, mealTypeSchema, proteinGroupSchema, ratingSummaryView, recipeSummaryView } from './views.ts';

export const recipeQuerySchema = z.object({
	text: z.string().max(100).optional(),
	mealType: mealTypeSchema.optional(),
	maxMinutes: z.number().int().positive().max(1440).optional(),
	proteinGroup: proteinGroupSchema.optional(),
	minStars: z.number().int().min(1).max(5).optional(),
	sort: z.enum(['name', 'rating', 'added', 'lastEaten']).optional(),
	reversed: z.boolean().optional(),
});

export const recipeListItemView = z.object({
	recipe: recipeSummaryView,
	rating: ratingSummaryView,
	baseServings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView),
	addedOn: isoDateSchema,
	lastEatenOn: isoDateSchema.nullable(),
	/** Every planned meal not yet past, soonest first: the device derives what has passed since. */
	upcoming: z.array(mealOccurrenceView),
});

export const recipesContract = {
	search: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
		.route({ method: 'POST', path: '/families/{familyId}/recipes/search',
			summary: "Search the family's recipe book in the caller's language (names, descriptions, ingredients and their synonyms), with filters and sorting" })
		.input(versionedInput(z.object({ familyId: z.uuid(), query: recipeQuerySchema })))
		.output(versionedOutput(z.object({ items: z.array(recipeListItemView) }))),
};
```

Registra `recipes: recipesContract` nel contratto ed esporta da `index.ts`
`recipesContract`, `recipeQuerySchema`, `recipeListItemView`.

- [ ] **Passo 4: query** (`server/src/recipes/load.ts`)

```ts
import type { MealOccurrenceView } from '@app/contract';
import type { Tx } from '../db.ts';

export interface MealOccurrence { recipeId: string; date: string; mealType: 'lunch' | 'dinner'; passesAt: string; past: boolean }

export async function loadCandidateIds(tx: Tx, familyId: string): Promise<string[]> {
	const rows = await tx<{ id: string }[]>`
		select r.id from app.recipes r
		where r.status = 'published'
			and (r.book_id is null or exists (select 1 from app.family_books fb where fb.family_id = ${familyId} and fb.book_id = r.book_id))`;
	return rows.map((row) => row.id);
}

export async function loadAddedOn(tx: Tx, familyId: string, recipeIds: string[]): Promise<Map<string, string>> {
	const rows = await tx<{ id: string; addedOn: string }[]>`
		select r.id, to_char(r.created_at at time zone f.time_zone, 'YYYY-MM-DD') as "addedOn"
		from app.recipes r cross join app.families f
		where f.id = ${familyId} and r.id = any(${recipeIds}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.addedOn]));
}

/** Most recent first by the instant the meal passes (dinner after lunch on the same day). */
export async function loadMealOccurrences(tx: Tx, familyId: string, recipeIds: string[]): Promise<MealOccurrence[]> {
	return tx<MealOccurrence[]>`
		select s.recipe_id as "recipeId", to_char(s.date, 'YYYY-MM-DD') as date, s.meal_type as "mealType",
			to_char(p.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "passesAt", p.at <= now() as past
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
		where w.family_id = ${familyId} and s.recipe_id = any(${recipeIds}::uuid[])
		order by p.at desc`;
}

export async function loadSynonyms(tx: Tx, ingredientIds: string[]) {
	const rows = await tx<{ id: string; synonyms: { 'it-IT': string[]; 'en-GB': string[] } }[]>`
		select id, synonyms from app.ingredients where id = any(${ingredientIds}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.synonyms]));
}

export const upcomingOf = (meals: MealOccurrence[], recipeId: string): MealOccurrenceView[] =>
	meals.filter((meal) => meal.recipeId === recipeId && !meal.past).reverse()
		.map(({ date, mealType, passesAt }) => ({ date, mealType, passesAt }));
```

- [ ] **Passo 5: gestore** in `server/src/recipes/router.ts`, `recipesRouter(os: Implementer)`:

```ts
search: os.recipes.search.handler(async ({ context, input }) => {
	const { tx, userId, locale } = context;
	const { familyId } = input;
	const ids = await loadCandidateIds(tx, familyId);
	const refs = ids.map((recipeId) => ({ recipeId, version: null, servings: 0 }));
	const [{ system }, contents, ratings, addedOn, meals] = await Promise.all([
		loadFamily(tx, familyId), loadContents(tx, refs),
		ratingSummaries(tx, familyId, userId, ids), loadAddedOn(tx, familyId, ids), loadMealOccurrences(tx, familyId, ids),
	]);
	// A recipe archived between the two statements has no content here: it simply drops out.
	const shown = refs.flatMap((ref) => {
		const content = contents.get(contentKey(ref));
		return content && content.status === 'published' ? [content] : [];
	});
	const ingredientIds = [...new Set(shown.flatMap((c) => c.lines!.map((line) => line.ingredientId)))];
	const [names, synonyms, titles] = await Promise.all([
		loadIngredientNamesById(tx, ingredientIds), loadSynonyms(tx, ingredientIds),
		loadBookTitlesById(tx, shown.map((c) => c.bookId)),
	]);
	const byId = new Map(shown.map((c) => [c.recipeId, c]));
	const candidates: SearchCandidate[] = shown.map((c) => ({
		id: c.recipeId, name: c.name as Localized, description: c.description as Localized, mealType: c.mealType!,
		durationMinutes: c.durationMinutes!, proteinGroup: c.proteinGroup!, familyAverage: ratings.get(c.recipeId)!.familyAverage,
		addedOn: addedOn.get(c.recipeId)!, lastEatenOn: meals.find((meal) => meal.recipeId === c.recipeId && meal.past)?.date ?? null,
		ingredientTexts: c.lines!.flatMap((line) => [names.get(line.ingredientId)![locale], line.variety?.[locale] ?? '',
			...(synonyms.get(line.ingredientId)?.[locale] ?? [])]),
	}));
	const items = searchRecipes(candidates, input.query, locale).map((candidate) => {
		const c = byId.get(candidate.id)!;
		return {
			recipe: summaryOf(c, titles, locale),
			rating: ratings.get(c.recipeId)!,
			baseServings: c.baseServings!,
			ingredients: ingredientLinesView(c.lines!, names, { servings: c.baseServings!, baseServings: c.baseServings!, system, locale }),
			addedOn: candidate.addedOn,
			lastEatenOn: candidate.lastEatenOn,
			upcoming: upcomingOf(meals, c.recipeId),
		};
	});
	return fresh(context, { items });
}),
```

Registra in `server/src/router.ts` `recipes: recipesRouter(os),`; `fresh` viene da
`../pipeline.ts`.

- [ ] **Passo 6:** `npm test -w server && npm run typecheck` → PASS.
- [ ] **Passo 7: commit** `Ricettario: lettura del ricettario (recipes.search)`.

### Task 8: operazione `recipes.get`

**File:**
- Modifica: `contract/src/recipes/recipes.ts`, `contract/src/recipes/index.ts`,
  `server/src/recipes/router.ts`
- Crea: `server/test/recipes/recipes-get.test.ts`

**Interfacce:**
- Consuma: `canSeeRecipe` (task 4), `recipeViews`, `recipeViewKey` (task 3),
  `loadMealOccurrences`, `upcomingOf` (task 7).
- Produce: `recipesContract.get`, `recipeDetailView`.

- [ ] **Passo 1: test che falliscono** (`recipes-get.test.ts`, impostazione del task 7)

```ts
async function get(m: TestMember, input: { recipeId: string; servings?: number; slotId?: string }) {
	const result = await m.client.recipes.get({ familyId: m.familyId, ...input });
	if (result.unchanged) throw new Error('fresh read expected');
	return result.data;
}
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

it('scales to the servings asked, the base by default', async () => {
	const m = await t.member();
	const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
	const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' }, baseServings: 2,
		lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
	expect(await get(m, { recipeId })).toMatchObject({ status: 'published', baseServings: 2, servings: 2, ingredients: [{ amount: '200 g' }] });
	expect(await get(m, { recipeId, servings: 4 })).toMatchObject({ servings: 4, ingredients: [{ amount: '400 g' }] });
	await expect(m.client.recipes.get({ familyId: m.familyId, recipeId, servings: 0 })).rejects.toMatchObject({ code: 'invalid' });
});

it('opens archived recipes, never drafts, even for curators or when a meal cites them', async () => {
	const m = await t.member();
	await db.grantGlobalRole(m.userId, 'recipe_curator');
	const archived = await cat.recipe({ name: { 'it-IT': 'A', 'en-GB': 'A' } });
	await cat.archive(archived);
	expect((await get(m, { recipeId: archived })).status).toBe('archived');
	const draftId = await cat.draft({ 'it-IT': 'B', 'en-GB': 'B' });
	await cat.meal(m.familyId, draftId, '2026-09-21', 'lunch');
	await expect(m.client.recipes.get({ familyId: m.familyId, recipeId: draftId })).rejects.toMatchObject({ code: 'not_found' });
	await expect(m.client.recipes.get({ familyId: m.familyId, recipeId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'not_found' });
});

it('opens a recipe from a book the family does not own only when a meal cites it', async () => {
	const m = await t.member();
	const bookId = await cat.book('b', 'Libro');
	const recipeId = await cat.recipe({ name: { 'it-IT': 'C', 'en-GB': 'C' }, bookId });
	await expect(m.client.recipes.get({ familyId: m.familyId, recipeId })).rejects.toMatchObject({ code: 'not_found' });
	await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
	expect((await get(m, { recipeId })).recipe).toMatchObject({ bookTitle: 'Libro', bookPages: '12' });
});

it('lists the last five past meals newest first (dinner before lunch) and every upcoming one', async () => {
	const m = await t.member();
	const recipeId = await cat.recipe({ name: { 'it-IT': 'D', 'en-GB': 'D' } });
	for (const date of ['2026-09-14', '2026-09-15', '2026-09-16']) await cat.meal(m.familyId, recipeId, date, 'lunch');
	await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
	await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
	await cat.meal(m.familyId, recipeId, '2026-09-22', 'lunch');
	await cat.meal(m.familyId, recipeId, day(2), 'dinner');
	const detail = await get(m, { recipeId });
	expect(detail.history).toEqual([
		{ date: '2026-09-22', mealType: 'lunch' }, { date: '2026-09-21', mealType: 'dinner' }, { date: '2026-09-21', mealType: 'lunch' },
		{ date: '2026-09-16', mealType: 'lunch' }, { date: '2026-09-15', mealType: 'lunch' },
	]);
	expect(detail.upcoming.map((u) => u.date)).toEqual([day(2)]);
});

it('shows the version eaten in a past meal, the current one otherwise (R1), with its book', async () => {
	const m = await t.member();
	const bookA = await cat.book('a', 'Libro A');
	const bookB = await cat.book('b', 'Libro B');
	await db.admin`insert into app.family_books (family_id, book_id) values (${m.familyId}, ${bookA}), (${m.familyId}, ${bookB})`;
	const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' }, bookId: bookA, bookPages: '12', createdAt: new Date('2026-09-01T10:00:00Z') });
	const pastSlot = await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
	const futureSlot = await cat.meal(m.familyId, recipeId, day(2), 'lunch');
	const before = await m.client.recipes.get({ familyId: m.familyId, recipeId, slotId: pastSlot });
	await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' }, bookId: bookB, bookPages: '40' });
	expect((await get(m, { recipeId, slotId: pastSlot })).recipe).toMatchObject({ name: 'Sugo v1', bookTitle: 'Libro A', bookPages: '12' });
	expect((await get(m, { recipeId, slotId: futureSlot })).recipe.name).toBe('Sugo v2');
	expect((await get(m, { recipeId })).recipe).toMatchObject({ name: 'Sugo v2', bookTitle: 'Libro B' });
	const again = await m.client.recipes.get({ familyId: m.familyId, recipeId, slotId: pastSlot, knownVersion: before.version });
	expect(again.unchanged).toBe(false);
});

it('refuses a slot of another family or of another recipe', async () => {
	const m = await t.member();
	const other = await t.member();
	const recipeId = await cat.recipe({ name: { 'it-IT': 'E', 'en-GB': 'E' } });
	const otherRecipe = await cat.recipe({ name: { 'it-IT': 'F', 'en-GB': 'F' } });
	const foreignSlot = await cat.meal(other.familyId, recipeId, '2026-09-21', 'lunch');
	const mySlot = await cat.meal(m.familyId, otherRecipe, '2026-09-21', 'lunch');
	for (const slotId of [foreignSlot, mySlot]) {
		await expect(m.client.recipes.get({ familyId: m.familyId, recipeId, slotId })).rejects.toMatchObject({ code: 'not_found' });
	}
});

it('works as a read-only MCP tool', async () => {
	const m = await t.member('en-GB');
	const recipeId = await cat.recipe({ name: { 'it-IT': 'G', 'en-GB': 'G en' } });
	const list = await mcp(t.app, t.env, m.token, 'tools/list');
	expect(list.body.result.tools.find((tool: any) => tool.name === 'recipes_get').annotations.readOnlyHint).toBe(true);
	const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'recipes_get', arguments: { familyId: m.familyId, recipeId, servings: 3 } });
	expect(toolBody(call)).toMatchObject({ unchanged: false, data: { recipe: { name: 'G en' }, servings: 3 } });
});
```

- [ ] **Passo 2:** `npm test -w server -- recipes-get` → FAIL.

- [ ] **Passo 3: contratto**

```ts
import { errorDefinitions } from '../errors.ts';

export const recipeDetailView = z.object({
	recipe: recipeSummaryView,
	status: z.enum(['published', 'archived']),
	baseServings: z.number().int().positive(),
	servings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView),
	rating: ratingSummaryView,
	/** Last five past meals, most recent first. */
	history: z.array(z.object({ date: isoDateSchema, mealType: mealTypeSchema })),
	/** Every planned meal not yet past, soonest first. */
	upcoming: z.array(mealOccurrenceView),
});

// in recipesContract:
get: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
	.route({ method: 'POST', path: '/families/{familyId}/recipes/{recipeId}/view',
		summary: 'Read a recipe with ingredients scaled to the servings asked, the family rating and its meals; slotId shows the version eaten in that past meal' })
	.errors({ not_found: errorDefinitions.not_found })
	.input(versionedInput(z.object({
		familyId: z.uuid(), recipeId: z.uuid(),
		servings: z.number().int().min(1).max(100).optional(),
		slotId: z.uuid().optional(),
	})))
	.output(versionedOutput(recipeDetailView)),
```

Esporta `recipeDetailView` da `index.ts`.

- [ ] **Passo 4: gestore**

```ts
get: os.recipes.get.handler(async ({ context, input }) => {
	const { tx, userId, locale } = context;
	const { familyId, recipeId } = input;
	const status = await canSeeRecipe(tx, familyId, recipeId);
	if (!status) throw appError('not_found');
	let version: number | null = null;
	if (input.slotId) {
		const [slot] = await tx<{ version: number | null }[]>`
			select case when p.at <= now() then app.recipe_version_at(s.recipe_id, p.at) end as version
			from app.meal_slots s join app.weeks w on w.id = s.week_id join app.families f on f.id = w.family_id
			cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
			where s.id = ${input.slotId} and w.family_id = ${familyId} and s.recipe_id = ${recipeId}`;
		if (!slot) throw appError('not_found');
		version = slot.version;
	}
	// Without servings, 0: the lines come at the base of the version shown (section 1).
	const ref = { recipeId, version, servings: input.servings ?? 0 };
	const view = (await recipeViews(tx, { familyId, userId, locale }, [ref])).get(recipeViewKey(ref));
	if (!view) throw appError('not_found');
	const servings = input.servings ?? view.baseServings!;
	const meals = await loadMealOccurrences(tx, familyId, [recipeId]);
	return fresh(context, {
		recipe: view.summary,
		status,
		baseServings: view.baseServings!,
		servings,
		ingredients: view.ingredients!,
		rating: view.rating!,
		history: meals.filter((meal) => meal.past).slice(0, 5).map(({ date, mealType }) => ({ date, mealType })),
		upcoming: upcomingOf(meals, recipeId),
	});
}),
```

- [ ] **Passo 5:** `npm test -w server && npm run typecheck` → PASS.
- [ ] **Passo 6: commit** `Ricettario: scheda ricetta con porzioni, storico e versione mangiata (recipes.get)`.

---

## Parte C: web

Si esegue quando la seconda PR di W5 (client oRPC reale) è su `main`. Prima di
scrivere, leggi la struttura di `web/src/` su `main` e adegua i percorsi dei file qui
sotto a quella (per le funzioni nuove `web/src/features/recipes/` se la base non impone
altro): i nomi delle funzioni restano questi. Ogni task scrive i test e li vede fallire
prima di modificare il codice.

### Task 9: ora del pasto sul dispositivo

**File:**
- Crea: `web/src/features/recipes/mealTime.ts`, `web/src/features/recipes/mealTime.test.ts`,
  `web/src/features/recipes/useMealClock.ts`, `web/src/features/recipes/useMealClock.test.tsx`

**Interfacce:**
- Produce:

```ts
type Occurrence = { date: string; mealType: 'lunch' | 'dinner'; passesAt: string };
export function lastEatenOn(view: { lastEatenOn: string | null; upcoming: Occurrence[] }, now: Date): string | null;
export function pastMeals(view: { history: { date: string; mealType: 'lunch' | 'dinner' }[]; upcoming: Occurrence[] }, now: Date): { date: string; mealType: 'lunch' | 'dinner' }[];
export function resortByLastEaten<T extends { recipe: { name: string }; lastEatenOn: string | null; upcoming: Occurrence[] }>(items: T[], now: Date, reversed: boolean, locale: string): T[];
export function nextBoundary(upcomingLists: Occurrence[][], now: Date): Date | null;
/** Current time as state, updated at the next passesAt of the views shown. */
export function useMealClock(upcomingLists: Occurrence[][]): Date;
```

- [ ] **Passo 1: test che falliscono** (`mealTime.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { lastEatenOn, nextBoundary, pastMeals, resortByLastEaten } from './mealTime';

const up = (date: string, mealType: 'lunch' | 'dinner', passesAt: string) => ({ date, mealType, passesAt });
// Four planned meals, read once: the answer stays «unchanged» while time goes by.
const upcoming = [
	up('2026-10-12', 'lunch', '2026-10-12T13:30:00.000Z'), up('2026-10-12', 'dinner', '2026-10-12T21:00:00.000Z'),
	up('2026-10-13', 'lunch', '2026-10-13T13:30:00.000Z'), up('2026-10-14', 'dinner', '2026-10-14T21:00:00.000Z'),
];

describe('meal time on the device', () => {
	it('follows the clock through all four upcoming meals without a new read', () => {
		const view = { lastEatenOn: '2026-09-21', upcoming };
		expect(lastEatenOn(view, new Date('2026-10-12T13:29:00Z'))).toBe('2026-09-21');
		expect(lastEatenOn(view, new Date('2026-10-12T13:30:00Z'))).toBe('2026-10-12');
		expect(lastEatenOn(view, new Date('2026-10-14T21:00:00Z'))).toBe('2026-10-14');
	});

	it('merges history and passed upcoming meals, newest first, five at most', () => {
		const history = ['2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01'].map((date) => ({ date, mealType: 'lunch' as const }));
		expect(pastMeals({ history, upcoming }, new Date('2026-10-13T00:00:00Z'))).toEqual([
			{ date: '2026-10-12', mealType: 'dinner' }, { date: '2026-10-12', mealType: 'lunch' },
			{ date: '2026-09-05', mealType: 'lunch' }, { date: '2026-09-04', mealType: 'lunch' }, { date: '2026-09-03', mealType: 'lunch' },
		]);
	});

	it('re-sorts by the derived date only when something passed, missing values last', () => {
		const a = { recipe: { name: 'A' }, lastEatenOn: '2026-09-01', upcoming: [upcoming[0]] };
		const b = { recipe: { name: 'B' }, lastEatenOn: '2026-10-01', upcoming: [] };
		const c = { recipe: { name: 'C' }, lastEatenOn: null, upcoming: [] };
		const before = new Date('2026-10-12T00:00:00Z');
		const after = new Date('2026-10-13T00:00:00Z');
		expect(resortByLastEaten([b, a, c], before, false, 'it-IT')).toEqual([b, a, c]);
		expect(resortByLastEaten([b, a, c], after, false, 'it-IT')).toEqual([a, b, c]);
		expect(resortByLastEaten([b, a, c], after, true, 'it-IT')).toEqual([b, a, c]);
	});

	it('finds the next boundary across views', () => {
		expect(nextBoundary([[upcoming[2]], upcoming], new Date('2026-10-12T14:00:00Z'))?.toISOString()).toBe('2026-10-12T21:00:00.000Z');
		expect(nextBoundary([upcoming], new Date('2026-10-15T00:00:00Z'))).toBeNull();
	});
});
```

E `useMealClock.test.tsx`, con i timer finti di Vitest e `renderHook` di testing-library:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMealClock } from './useMealClock';

const lists = [[
	{ date: '2026-10-12', mealType: 'lunch' as const, passesAt: '2026-10-12T13:30:00.000Z' },
	{ date: '2026-10-12', mealType: 'dinner' as const, passesAt: '2026-10-12T21:00:00.000Z' },
]];

describe('useMealClock', () => {
	beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T13:00:00Z')); });
	afterEach(() => vi.useRealTimers());

	it('ticks at the next passesAt and then at the following one, and clears its timer', () => {
		const { result, unmount } = renderHook(() => useMealClock(lists));
		expect(result.current.toISOString()).toBe('2026-10-12T13:00:00.000Z');
		act(() => { vi.advanceTimersByTime(30 * 60_000); });
		expect(result.current.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-12T13:30:00Z'));
		act(() => { vi.advanceTimersByTime(7.5 * 3_600_000); });
		expect(result.current.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-12T21:00:00Z'));
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	});
});
```

- [ ] **Passo 2:** `npm test -w web -- features/recipes` → FAIL.

- [ ] **Passo 3: implementazione**

```ts
// mealTime.ts
type MealType = 'lunch' | 'dinner';
type Occurrence = { date: string; mealType: MealType; passesAt: string };
const passed = (meal: Occurrence, now: Date) => Date.parse(meal.passesAt) <= now.getTime();

export function lastEatenOn(view: { lastEatenOn: string | null; upcoming: Occurrence[] }, now: Date): string | null {
	const latest = view.upcoming.filter((meal) => passed(meal, now)).map((meal) => meal.date).sort().at(-1);
	return latest ?? view.lastEatenOn;
}

export function pastMeals(view: { history: { date: string; mealType: MealType }[]; upcoming: Occurrence[] }, now: Date) {
	const fresh = view.upcoming.filter((meal) => passed(meal, now)).map(({ date, mealType }) => ({ date, mealType }));
	return [...fresh.reverse(), ...view.history].slice(0, 5);
}

export function resortByLastEaten<T extends { recipe: { name: string }; lastEatenOn: string | null; upcoming: Occurrence[] }>(
	items: T[], now: Date, reversed: boolean, locale: string,
): T[] {
	if (!items.some((item) => item.upcoming.some((meal) => passed(meal, now)))) return items;
	const byName = (a: T, b: T) => a.recipe.name.localeCompare(b.recipe.name, locale);
	return items.map((item) => ({ item, key: lastEatenOn(item, now) })).sort((a, b) => {
		if (a.key === null || b.key === null) return a.key === b.key ? byName(a.item, b.item) : a.key === null ? 1 : -1;
		if (a.key === b.key) return byName(a.item, b.item);
		return (reversed ? -1 : 1) * (a.key < b.key ? 1 : -1);
	}).map(({ item }) => item);
}

export function nextBoundary(upcomingLists: Occurrence[][], now: Date): Date | null {
	const times = upcomingLists.flat().map((meal) => Date.parse(meal.passesAt)).filter((time) => time > now.getTime());
	return times.length ? new Date(Math.min(...times)) : null;
}
```

```ts
// useMealClock.ts
import { useEffect, useState } from 'react';
import { nextBoundary } from './mealTime';

/** Current time as state: one timer at the next passesAt, set again after each tick, cleared on unmount. */
export function useMealClock(upcomingLists: { date: string; mealType: 'lunch' | 'dinner'; passesAt: string }[][]): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const next = nextBoundary(upcomingLists, now);
		if (!next) return;
		// setTimeout holds about 24.8 days at most; a later boundary waits for an intermediate tick.
		const timer = setTimeout(() => setNow(new Date()), Math.min(next.getTime() - Date.now(), 2 ** 31 - 1));
		return () => clearTimeout(timer);
	}, [upcomingLists, now]);
	return now;
}
```

Le pagine passano a `useMealClock` un array stabile (`useMemo` sulle viste).

- [ ] **Passo 4:** `npm test -w web -- features/recipes` → PASS.
- [ ] **Passo 5: commit** `Ricettario web: ultima volta e storico calcolati sul dispositivo`.

### Task 10: API web, dati finti e `IngredientList` nella forma di W6

**File:**
- Modifica: `web/src/api/types.ts`, `web/src/api/queries.ts`, `web/src/api/fake/fakeApi.ts`,
  `web/src/api/fake/demo-data.json` (o il seed), `web/src/components/IngredientList.tsx`
  (e il suo modulo CSS), `web/src/components/RecipeCard.tsx`, `web/src/components/source.ts`,
  `web/src/i18n/messages/recipes.ts`, `web/src/components/RecipeFilters.tsx`
  (`RecipeCard`, `RecipePage`, `IngredientList` e `source.ts` sono componenti della
  ricetta assegnati a W6 dal coordinatore; W1 li riusa)
- Crea o modifica i test accanto: `web/src/api/fake/fakeApi.test.ts`,
  `web/src/components/IngredientList.test.tsx`, `web/src/components/RecipeCard.test.tsx`

**Interfacce:**
- Consuma: gli schemi del contratto (`recipeListItemView`, `recipeDetailView`,
  `ratingSummaryView`, `ingredientLineView`) tramite `@app/contract`, se `web/` lo ha
  fra le dipendenze con il client reale di W5; altrimenti i tipi in `types.ts` si
  riscrivono identici e i test usano oggetti nella stessa forma.
- Produce, per le aree `recipes` e `ratings` della base di W5:
  - `recipes.search` → `{ items: RecipeListItem[] }` (prima un array);
  - `RecipeListItem`: `baseServings` al posto di `servings`, più `addedOn`,
    `lastEatenOn`, `upcoming`;
  - `RecipeSummary`: `description`, `durationMinutes`, `sourceType`, `mealType` e
    `proteinGroup` nullabili (ricette mai pubblicate), niente `photo`;
  - `IngredientLine`: con `preparation`;
  - `RecipeDetailView`: con `status` e `upcoming`;
  - `ProteinGroup` e `PROTEIN_GROUPS` con gli 8 codici reali.

- [ ] **Passo 1: test che falliscono**
  - `fakeApi.test.ts`: `recipes.search` dell'API finta restituisce `{ items }` con
    `baseServings`, `upcoming` e gruppi tra gli 8 codici e, se lo schema è importabile,
    passa `recipeListItemView.parse` (stesso per `recipes.get` con `recipeDetailView`);
    un filtro `proteinGroup: 'red_meat'` restituisce solo quelle ricette.
  - `RecipeCard.test.tsx`: una scheda del Menu alimentata dal payload reale di una
    ricetta mai pubblicata (riepilogo con solo `id`, `name`, `description: null`, gli
    altri campi `null`; `ingredients: null`; `rating: null`) mostra il nome, nessuna
    immagine, nessuna riga di fonte, durata o gruppo, nessun voto né ingredienti, e non
    lancia errori; una scheda di ricetta pubblicata non mostra immagini (non esiste più
    `photo`) e mostra fonte, durata e voto.
  - `IngredientList.test.tsx`: con `preparation: 'a dadini'` mostra «Pomodori Roma» e
    «a dadini»; in inglese con `preparation: 'diced'` mostra «diced»; senza preparazione
    nessun testo in più; `optional: true` mostra l'etichetta esistente degli opzionali.
- [ ] **Passo 2:** `npm test -w web` → FAIL sui nuovi test.
- [ ] **Passo 3: implementazione**
  - `types.ts` e `queries.ts`: tipi come sopra; `searchQuery` resta con `select` su
    `value.data`, le pagine leggono `.items`.
  - API finta e dati demo: forme nuove; ogni ricetta demo ha `addedOn`, `lastEatenOn`,
    `upcoming` (vuoto, o dai menu demo futuri) e gruppi convertiti (`meat` → `red_meat`,
    oppure `cured_meat` se i tag d'origine indicano salumi).
  - `RecipeCard`: tolto il ramo della foto (resta sempre `meal-heading` con il chip);
    riga di metadati solo con i campi non nulli; `sourceLine` restituisce `null` se
    `sourceType` è nullo.
  - `IngredientList`: dopo il nome, se c'è, `<span className={styles.preparation}>, {line.preparation}</span>`
    in tono secondario (colore del testo secondario dei token di `design/`).
  - `RecipeFilters` e dizionario `recipes`: gruppi dalla costante, etichette
    `group.<codice>`: it-IT `Pesce, Carne bianca, Carne rossa, Salumi, Legumi, Uova,
    Formaggi, Vegetariano`; en-GB `Fish, White meat, Red meat, Cured meat, Pulses, Eggs,
    Cheese, Vegetarian`.
- [ ] **Passo 4:** `npm test -w web && npm run typecheck -w web` → PASS.
- [ ] **Passo 5: commit** `Ricettario web: API, dati finti e ingredienti con la preparazione`.

### Task 11: pagine Ricettario e scheda sui dati veri

**File:**
- Modifica: `web/src/routes/RecipesPage.tsx`, `web/src/routes/RecipePage.tsx` (o i
  percorsi equivalenti della base)
- Crea: `web/src/routes/RecipesPage.test.tsx`, `web/src/routes/RecipePage.test.tsx`

- [ ] **Passo 1: test che falliscono** (testing-library, API finta con risposte nella
  forma reale di W6, provider di W5):
  - ricettario: conteggio e schede da `data.items`; il filtro «Carne rossa» chiede
    `proteinGroup: 'red_meat'`; «Azzera i filtri» toglie i filtri; con
    `sort: 'lastEaten'` e un `upcoming` che passa mentre la pagina è aperta (timer finti,
    nessuna nuova lettura) l'ordine segue la data derivata;
  - cambio di famiglia: dopo il cambio la pagina legge con il nuovo `familyId` e non
    mostra i dati della famiglia precedente;
  - scheda: il selettore delle porzioni rilegge con `servings`; lo storico mostra al più
    5 voci e include un `upcoming` passato mentre la pagina è aperta (timer finti);
    aperta da `?slot=<id>` passa `slotId`; una lettura `not_found` mostra «Ricetta non
    disponibile»; descrizione nulla: nessun paragrafo vuoto;
  - voto offline: con la connettività simulata assente un tocco sulle stelle mostra
    l'errore e `ratings.set` non viene chiamata; online chiama `ratings.set` con
    `{ familyId, recipeId, stars }` e applica la risposta.
- [ ] **Passo 2:** `npm test -w web -- routes/Recipe` → FAIL.
- [ ] **Passo 3: implementazione**
  - `RecipesPage`: `searchQuery`, `data.items`;
    `const now = useMealClock(useMemo(() => items.map((i) => i.upcoming), [items]))`;
    elenco `query.sort === 'lastEaten' ? resortByLastEaten(items, now, !!query.reversed, locale) : items`;
    schede col componente del Menu e `IngredientList` alle porzioni di riferimento
    (`baseServings`).
  - `RecipePage`: `recipeQuery(familyId, recipeId, servings, slotId)`; storico
    `pastMeals(view, now)` con `useMealClock(useMemo(() => [view.upcoming], [view]))`;
    fonte del libro con `bookTitle` e `bookPages`; descrizione solo se non nulla;
    tolta l'immagine (`recipe.photo` non esiste più); nessun blocco «bozza».
  - `RatingStars`: `useRateRecipe` di W5 (già consapevole dell'offline); la chiamata è
    `api.ratings.set({ familyId, recipeId, stars })`.
- [ ] **Passo 4:** `npm test -w web && npm run typecheck -w web` → PASS.
- [ ] **Passo 5: prova visiva** con la skill `agent-browser` sull'app locale
  (`supabase start`, `wrangler dev`, build web): ricettario con filtri e ordinamenti,
  scheda con porzioni e preparazione, voto e togli voto, scheda aperta da un pasto
  passato; poi sulla porta 8767 per l'iPhone se il coordinatore lo chiede.
- [ ] **Passo 6: commit** `Ricettario web: schermate del ricettario e della scheda sui dati veri`.

### Task 12: verifica e PR

- [ ] **Passo 1:** skill `superpowers:verification-before-completion`:
  `npm run typecheck && npm test` con `TEST_DATABASE_URL`, build del web
  (`npm run build -w web`).
- [ ] **Passo 2:** push di `traguardo/ricettario` e `gh pr create --base main`,
  «Ricettario e voti (W6)», descrizione in italiano con cosa fa, come è stato verificato
  (comandi ed esito, prova visiva), sezioni della specifica realizzate, decisioni da
  riportare (rimando alla sezione finale della spec), riga di attribuzione.
- [ ] **Passo 3:** `STATO: PR_APERTA <url>` e fermati.
