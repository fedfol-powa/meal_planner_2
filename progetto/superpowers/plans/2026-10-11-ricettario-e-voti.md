# Ricettario e voti: piano di implementazione

> **Per gli agenti esecutori:** sotto-skill richiesta: `superpowers:subagent-driven-development`
> (consigliata) oppure `superpowers:executing-plans`, un task alla volta. I passi usano le
> caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** ricettario, scheda ricetta e voti collegati ai dati veri, con le viste
condivise usate anche dal Menu (W1) e gli strumenti MCP derivati.

**Architettura:** tre operazioni nel contratto (`recipes.search`, `recipes.get`,
`ratings.set`) implementate nel Worker con query SQL scritte a mano nel ruolo
dell'utente; ricerca e ordinamento in una funzione pura sulle proiezioni caricate in
blocco; righe di ingrediente scalate e formattate con `domain/src/units` (W4); il
giudizio «passato» sui dati che dipendono dall'ora si fa sul dispositivo.

**Stack:** TypeScript, oRPC 1.15, zod 4, Postgres.js, Vitest; React con TanStack Query
per il web (base di W5).

**Spec:** `progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md` (da leggere
insieme a questo piano).

## Vincoli globali

- Codice, commenti e test in inglese; documenti e messaggi di commit in italiano; testi
  per l'utente in `it-IT` e `en-GB`.
- Nessuna dipendenza esterna nuova; `@app/domain` (workspace) si aggiunge a `contract/`
  e `server/`.
- Nessuna migrazione nuova.
- File condivisi (`contract/src/contract.ts`, `server/src/router.ts`, rotte e
  dizionari web) toccati solo per registrare le chiavi `recipes` e `ratings`.
- Documento ricetta di W3 (`domain/src/recipe/`) importato, mai ridefinito; vocabolari
  da `@app/domain/planner`, unità da `@app/domain/units`.
- Nessun aggiornamento ottimistico nelle mutazioni web; `ratings.set` è `offline: false`.
- Comandi: test di tutto `npm test`; server `npm test -w server` (i test con database
  richiedono `TEST_DATABASE_URL`, stack locale `supabase start`); typecheck
  `npm run typecheck`.

## Focus della review

1. **Voto di un ex membro:** chi ha lasciato la famiglia non deve contare nella media
   (vista `family_scores` sui membri attuali): test nel task 3.
2. **Ricetta di un libro non posseduto aperta da un pasto:** deve aprirsi e votarsi
   anche se non compare nel ricettario: test nei task 4 e 8.
3. **Ricerca con accenti e maiuscole e parole in ordine diverso** («Pàsta zucchine» trova
   «Zucchine e pasta»): test nel task 6.
4. **Ordinamento invertito con ricette senza voti o mai mangiate:** restano in fondo
   anche invertendo: test nel task 6.
5. **`slotId` di un'altra famiglia o di un pasto che cita un'altra ricetta:** `not_found`,
   mai la ricetta: test nel task 8.

---

## Parte A: viste condivise e voto (PR anticipata)

Branch `traguardo/ricettario-viste` da `origin/main` aggiornato. Alla fine `traguardo/ricettario`
si ribasa su `main` dopo il merge.

### Task 1: schemi delle viste nel contratto

**File:**
- Crea: `contract/src/recipes/views.ts`, `contract/src/recipes/views.test.ts`
- Modifica: `contract/package.json` (dipendenza `@app/domain`), `contract/src/index.ts`

**Interfacce:**
- Produce: `isoDateSchema`, `proteinGroupSchema`, `recipeMealTypeSchema`,
  `mealTypeSchema`, `recipeSummaryView`, `ratingSummaryView`, `ingredientLineView`,
  `mealOccurrenceView` e i tipi `RecipeSummaryView`, `RatingSummaryView`,
  `IngredientLineView`, `MealOccurrenceView`, esportati da `@app/contract`.

- [ ] **Passo 1: test che fallisce**

```ts
// contract/src/recipes/views.test.ts
import { describe, expect, it } from 'vitest';
import { ingredientLineView, mealOccurrenceView, proteinGroupSchema, ratingSummaryView, recipeSummaryView } from './views.ts';

describe('shared recipe views', () => {
	it('uses the planner vocabulary for protein groups', () => {
		expect(proteinGroupSchema.options).toEqual(['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian']);
	});

	it('accepts a summary of a never-published recipe with only name and description', () => {
		const summary = { id: crypto.randomUUID(), name: 'Pasta', description: '', durationMinutes: null, sourceType: null,
			sourceUrl: null, bookTitle: null, bookPages: null, mealType: null, proteinGroup: null };
		expect(recipeSummaryView.parse(summary)).toEqual(summary);
	});

	it('bounds stars and averages', () => {
		expect(() => ratingSummaryView.parse({ familyAverage: 5.5, familyCount: 1, myStars: null })).toThrow();
		expect(() => ratingSummaryView.parse({ familyAverage: null, familyCount: 0, myStars: 0 })).toThrow();
		expect(ratingSummaryView.parse({ familyAverage: 3.5, familyCount: 2, myStars: 4 })).toBeTruthy();
	});

	it('describes lines and meal occurrences', () => {
		expect(ingredientLineView.parse({ ingredientId: crypto.randomUUID(), name: 'Pomodori Roma', amount: '200 g', preparation: null, optional: false })).toBeTruthy();
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

/** Views shared by the recipe book and the menu (owned by the recipes area, spec of W6). */
export const isoDateSchema = z.iso.date();
export const proteinGroupSchema = z.enum(PROTEIN_GROUPS);
export const mealTypeSchema = z.enum(MEAL_TYPES);
export const recipeMealTypeSchema = z.enum([...MEAL_TYPES, 'both']);

/** Texts in the caller's language; nullable fields are null only for never-published recipes. */
export const recipeSummaryView = z.object({
	id: z.uuid(),
	name: z.string(),
	description: z.string(),
	durationMinutes: z.number().int().positive().nullable(),
	sourceType: z.enum(['web', 'youtube', 'book', 'home']).nullable(),
	sourceUrl: z.url().nullable(),
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

In `contract/src/index.ts` aggiungi `export * from './recipes/views.ts';`.

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

`server/src/recipes/views.ts` (task 3) la riesporta: è la firma promessa a W1.

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

### Task 3: caricatori delle viste (`ratingSummaries`, `recipeViews`) sulla versione corrente

**File:**
- Crea: `server/src/recipes/views.ts`, `server/test/recipes/fixtures.ts`,
  `server/test/recipes/views.test.ts`

**Interfacce:**
- Consuma: task 2; `Tx` da `server/src/db.ts`; `TestDatabase` da `server/test/support/db.ts`.
- Produce (firme promesse a W1, spec sezione 1):

```ts
export { ingredientLinesView, type IngredientNames, type LineInput } from './lines.ts';
export interface Viewer { familyId: string; userId: string; locale: Locale }
export interface RecipeRef { recipeId: string; version: number | null; servings: number }
export interface RecipeView {
	summary: RecipeSummaryView; status: 'draft' | 'published' | 'archived'; version: number;
	baseServings: number | null; ingredients: IngredientLineView[] | null; rating: RatingSummaryView | null;
}
export const recipeViewKey: (ref: RecipeRef) => string; // `${recipeId}@${version ?? 'current'}@${servings}`
export function ratingSummaries(tx: Tx, familyId: string, userId: string, recipeIds: string[]): Promise<Map<string, RatingSummaryView>>;
export function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>>;
/** Shared by the loaders: family's measurement system and time zone. */
export function loadFamily(tx: Tx, familyId: string): Promise<{ system: MeasurementSystem; timeZone: string }>;
```

- Produce per i test: `server/test/recipes/fixtures.ts` con

```ts
export interface CatalogueFixture {
	ingredient(slug: string, name: Localized, synonyms?: { 'it-IT': string[]; 'en-GB': string[] }): Promise<string>;
	book(slug: string, title: string): Promise<string>;
	recipe(options: RecipeFixture): Promise<string>;          // pubblicata, versione 1, proiezioni scritte
	publishVersion(recipeId: string, changes: Partial<RecipeFixture>, publishedAt: Date): Promise<number>;
	draft(name: Localized): Promise<string>;                  // mai pubblicata
	archive(recipeId: string): Promise<void>;
	meal(familyId: string, recipeId: string, date: string, mealType: 'lunch' | 'dinner', servings?: number): Promise<string>; // slot id
	rate(userId: string, recipeId: string, stars: number): Promise<void>;
}
export interface RecipeFixture {
	name: Localized; description?: Localized; durationMinutes?: number; baseServings?: number;
	mealType?: 'lunch' | 'dinner' | 'both'; proteinGroup?: ProteinGroup; bookId?: string | null; sourceUrl?: string | null;
	lines?: { ingredientId: string; quantity: Quantity; variety?: Localized; isOptional?: boolean }[];
	createdAt?: Date;
}
export function catalogueFixture(db: TestDatabase): CatalogueFixture;
```

- [ ] **Passo 1: fixture del catalogo** (`server/test/recipes/fixtures.ts`), scritte con
  l'utenza admin come fa `support/db.ts`. Ogni slug è reso unico con un suffisso casuale,
  perché i file di test girano in parallelo sullo stesso database.

```ts
import type { Localized, Quantity } from '@app/domain/units';
import type { ProteinGroup } from '@app/domain/planner';
import type { TestDatabase } from '../support/db.ts';

const unique = (slug: string) => `${slug}-${crypto.randomUUID().slice(0, 8)}`;

export function catalogueFixture(db: TestDatabase): CatalogueFixture {
	const { admin } = db;
	const writeProjection = async (recipeId: string, r: RecipeFixture, version: number) => {
		const name = r.name;
		const description = r.description ?? { 'it-IT': `${name['it-IT']} descr`, 'en-GB': `${name['en-GB']} descr` };
		await admin`update app.recipes set status = 'published', version = ${version},
			name = ${admin.json(name)}, description = ${admin.json(description)}, source_type = ${r.bookId ? 'book' : r.sourceUrl ? 'web' : 'home'},
			source_url = ${r.sourceUrl ?? null}, book_id = ${r.bookId ?? null}, book_pages = ${r.bookId ? '12' : null},
			duration_minutes = ${r.durationMinutes ?? 30}, base_servings = ${r.baseServings ?? 2},
			protein_group = ${r.proteinGroup ?? 'vegetarian'}, is_fresh_fish = false, carbohydrate_group = 'pasta',
			has_vegetables = true, category = 'pan', meal_type = ${r.mealType ?? 'both'}, is_heavy = false
			where id = ${recipeId}`;
		await admin`delete from app.recipe_ingredients where recipe_id = ${recipeId}`;
		for (const [position, line] of (r.lines ?? []).entries()) {
			const q = line.quantity;
			await admin`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit, quantity_text, source_text, is_optional)
				values (${recipeId}, ${position}, ${line.ingredientId}, ${line.variety ? admin.json(line.variety) : null}, ${line.variety?.['it-IT'].toLowerCase() ?? ''},
					${q.kind}, ${q.kind === 'amount' ? q.value : null}, ${q.kind === 'amount' ? q.unit : null}, ${q.kind === 'text' ? admin.json(q.text) : null},
					${'source line'}, ${line.isOptional ?? false})`;
		}
		// Content of the version: the same fields as the projection, in the W3 document shape.
		const content = { schemaVersion: 1, name, description, sourceType: r.bookId ? 'book' : r.sourceUrl ? 'web' : 'home',
			sourceUrl: r.sourceUrl ?? null, bookId: r.bookId ?? null, bookPages: r.bookId ? '12' : null,
			durationMinutes: r.durationMinutes ?? 30, baseServings: r.baseServings ?? 2, mealType: r.mealType ?? 'both',
			proteinGroup: r.proteinGroup ?? 'vegetarian', isFreshFish: false, carbohydrateGroup: 'pasta', category: 'pan',
			hasVegetables: true, isHeavy: false, seasons: [],
			ingredients: (r.lines ?? []).map((l) => ({ ingredientId: l.ingredientId, variety: l.variety ?? null, preparation: null,
				quantity: l.quantity, sourceText: 'source line', isOptional: l.isOptional ?? false, isPrimary: false })) };
		return content;
	};
	const fixtures = new Map<string, RecipeFixture>();
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
			const [{ id }] = await admin<{ id: string }[]>`insert into app.recipes (slug, name, description, created_at)
				values (${unique('r')}, ${admin.json(r.name)}, ${admin.json(r.name)}, ${r.createdAt ?? new Date()}) returning id`;
			const content = await writeProjection(id, r, 1);
			await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
				values (${id}, 1, ${admin.json(content)}, ${r.createdAt ?? new Date()}, 'import')`;
			fixtures.set(id, r);
			return id;
		},
		async publishVersion(recipeId, changes, publishedAt) {
			const [{ version }] = await admin<{ version: number }[]>`select version + 1 as version from app.recipes where id = ${recipeId}`;
			const next = { ...fixtures.get(recipeId)!, ...changes };
			const content = await writeProjection(recipeId, next, version);
			await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
				values (${recipeId}, ${version}, ${admin.json(content)}, ${publishedAt}, 'import')`;
			fixtures.set(recipeId, next);
			return version;
		},
		async draft(name) {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.recipes (slug, name, description)
				values (${unique('d')}, ${admin.json(name)}, ${admin.json(name)}) returning id`;
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

Prima di scrivere le fixture, verifica in `supabase/migrations/20261011100400_meals.sql`
i nomi esatti delle colonne e i vincoli di `weeks` e `meal_slots` (unicità di
(`week_id`, `date`, `meal_type`), controllo della data nella settimana) e adegua le
insert; se il trigger della data rifiuta, usa date dentro la settimana di `starts_on`.

- [ ] **Passo 2: test che falliscono** (`server/test/recipes/views.test.ts`)

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { withDb } from '../../src/db.ts';
import { ratingSummaries, recipeViews, recipeViewKey } from '../../src/recipes/views.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('recipe views', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	beforeAll(async () => { db = await setupDatabase(); cat = catalogueFixture(db); });
	afterAll(() => db?.close());

	const asUser = <T>(userId: string, sessionId: string, fn: Parameters<typeof withDb<T>>[2]) =>
		withDb(db.appServerUrl, { kind: 'user', claims: { sub: userId, role: 'authenticated', session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 } }, fn);

	it('averages the current members only and gives my stars', async () => {
		const me = await db.createUser();
		const other = await db.createUser();
		const gone = await db.createUser();
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }, { userId: other.userId, role: 'member' }]);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Pasta', 'en-GB': 'Pasta' } });
		await cat.rate(me.userId, recipeId, 4);
		await cat.rate(other.userId, recipeId, 2);
		await cat.rate(gone.userId, recipeId, 5); // never a member of this family
		const map = await asUser(me.userId, me.sessionId, (tx) => ratingSummaries(tx, familyId, me.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: 3, familyCount: 2, myStars: 4 });
	});

	it('gives an empty summary without votes', async () => {
		const me = await db.createUser();
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }]);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Riso', 'en-GB': 'Rice' } });
		const map = await asUser(me.userId, me.sessionId, (tx) => ratingSummaries(tx, familyId, me.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('builds the current view in the language and system of the family', async () => {
		const me = await db.createUser({ locale: 'en-GB' });
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }]);
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' }, baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
		const ref = { recipeId, version: null, servings: 4 };
		const views = await asUser(me.userId, me.sessionId, (tx) => recipeViews(tx, { familyId, userId: me.userId, locale: 'en-GB' }, [ref]));
		const view = views.get(recipeViewKey(ref))!;
		expect(view.summary).toMatchObject({ id: recipeId, name: 'Sauce', sourceType: 'home', proteinGroup: 'vegetarian' });
		expect(view).toMatchObject({ status: 'published', version: 1, baseServings: 2, rating: { familyCount: 0 } });
		expect(view.ingredients).toEqual([{ ingredientId: tomato, name: 'Tomatoes', amount: '400 g', preparation: null, optional: false }]);
	});

	it('gives name and description only for a never-published recipe cited by a meal', async () => {
		const me = await db.createUser();
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }]);
		const draftId = await cat.draft({ 'it-IT': 'Vecchia ricetta', 'en-GB': 'Old recipe' });
		await cat.meal(familyId, draftId, '2026-09-21', 'dinner');
		const ref = { recipeId: draftId, version: null, servings: 2 };
		const views = await asUser(me.userId, me.sessionId, (tx) => recipeViews(tx, { familyId, userId: me.userId, locale: 'it-IT' }, [ref]));
		expect(views.get(recipeViewKey(ref))).toMatchObject({ status: 'draft', ingredients: null, rating: null, baseServings: null,
			summary: { name: 'Vecchia ricetta', durationMinutes: null } });
	});

	it('leaves out recipes the user cannot read', async () => {
		const me = await db.createUser();
		const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }]);
		const draftId = await cat.draft({ 'it-IT': 'Segreta', 'en-GB': 'Secret' });
		const views = await asUser(me.userId, me.sessionId, (tx) =>
			recipeViews(tx, { familyId, userId: me.userId, locale: 'it-IT' }, [{ recipeId: draftId, version: null, servings: 2 }]));
		expect(views.size).toBe(0);
	});
});
```

- [ ] **Passo 3:** `npm test -w server -- recipes/views` (con `TEST_DATABASE_URL`) → FAIL.

- [ ] **Passo 4: implementazione** (`server/src/recipes/views.ts`)

```ts
import type { IngredientLineView, Locale, RatingSummaryView, RecipeSummaryView } from '@app/contract';
import type { Localized, MeasurementSystem, Quantity } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { ingredientLinesView, type LineInput } from './lines.ts';

export { ingredientLinesView, type IngredientNames, type LineInput } from './lines.ts';

export interface Viewer { familyId: string; userId: string; locale: Locale }
export interface RecipeRef { recipeId: string; version: number | null; servings: number }
export interface RecipeView {
	summary: RecipeSummaryView;
	status: 'draft' | 'published' | 'archived';
	/** Version shown (0 for a never-published recipe). */
	version: number;
	baseServings: number | null;
	ingredients: IngredientLineView[] | null;
	rating: RatingSummaryView | null;
}

export const recipeViewKey = (ref: RecipeRef) => `${ref.recipeId}@${ref.version ?? 'current'}@${ref.servings}`;

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

interface RecipeRow {
	id: string; status: 'draft' | 'published' | 'archived'; version: number;
	name: Localized; description: Localized; durationMinutes: number | null; sourceType: RecipeSummaryView['sourceType'];
	sourceUrl: string | null; bookTitle: string | null; bookPages: string | null; mealType: RecipeSummaryView['mealType'];
	proteinGroup: RecipeSummaryView['proteinGroup']; baseServings: number | null;
}

export async function loadRecipeRows(tx: Tx, recipeIds: string[]): Promise<Map<string, RecipeRow>> {
	const rows = await tx<RecipeRow[]>`
		select r.id, r.status, r.version, r.name, r.description, r.duration_minutes as "durationMinutes",
			r.source_type as "sourceType", r.source_url as "sourceUrl", b.title as "bookTitle", r.book_pages as "bookPages",
			r.meal_type as "mealType", r.protein_group as "proteinGroup", r.base_servings as "baseServings"
		from app.recipes r left join app.books b on b.id = r.book_id
		where r.id = any(${recipeIds}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row]));
}

export async function loadProjectedLines(tx: Tx, recipeIds: string[]): Promise<Map<string, LineInput[]>> {
	const rows = await tx<{ recipeId: string; ingredientId: string; variety: Localized | null; preparation: Localized | null;
		kind: Quantity['kind']; quantity: string | null; unit: string | null; text: Localized | null; isOptional: boolean }[]>`
		select recipe_id as "recipeId", ingredient_id as "ingredientId", variety, preparation, quantity_kind as kind,
			quantity::text as quantity, unit, quantity_text as text, is_optional as "isOptional"
		from app.recipe_ingredients where recipe_id = any(${recipeIds}::uuid[]) order by recipe_id, position`;
	const lines = new Map<string, LineInput[]>();
	for (const row of rows) {
		const quantity = (row.kind === 'amount' ? { kind: 'amount', value: Number(row.quantity), unit: row.unit }
			: row.kind === 'text' ? { kind: 'text', text: row.text } : { kind: 'to_taste' }) as Quantity;
		const list = lines.get(row.recipeId) ?? [];
		list.push({ ingredientId: row.ingredientId, variety: row.variety, preparation: row.preparation, quantity, isOptional: row.isOptional });
		lines.set(row.recipeId, list);
	}
	return lines;
}

export async function loadIngredientNames(tx: Tx, ingredientIds: string[]): Promise<Map<string, Localized>> {
	const rows = await tx<{ id: string; name: Localized }[]>`select id, name from app.ingredients where id = any(${ingredientIds}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.name]));
}

const summaryOf = (row: Pick<RecipeRow, 'id' | 'name' | 'description' | 'durationMinutes' | 'sourceType' | 'sourceUrl' | 'bookTitle' | 'bookPages' | 'mealType' | 'proteinGroup'>, locale: Locale): RecipeSummaryView => ({
	id: row.id, name: row.name[locale], description: row.description[locale], durationMinutes: row.durationMinutes,
	sourceType: row.sourceType, sourceUrl: row.sourceUrl, bookTitle: row.bookTitle, bookPages: row.bookPages,
	mealType: row.mealType, proteinGroup: row.proteinGroup,
});

/**
 * Views of the cited recipes, a few queries for the whole set. Only what RLS lets the user read:
 * unreadable recipes are left out of the map. Callers check the family first (pipeline role).
 */
export async function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>> {
	const ids = [...new Set(refs.map((ref) => ref.recipeId))];
	const [{ system }, recipes, lines, ratings] = await Promise.all([
		loadFamily(tx, viewer.familyId), loadRecipeRows(tx, ids), loadProjectedLines(tx, ids),
		ratingSummaries(tx, viewer.familyId, viewer.userId, ids),
	]);
	const versioned = refs.filter((ref) => ref.version !== null && ref.version !== recipes.get(ref.recipeId)?.version);
	const documents = await loadVersionDocuments(tx, versioned);
	const ingredientIds = new Set<string>();
	for (const list of lines.values()) for (const line of list) ingredientIds.add(line.ingredientId);
	for (const document of documents.values()) for (const line of document.ingredients) ingredientIds.add(line.ingredientId);
	const names = await loadIngredientNames(tx, [...ingredientIds]);
	const views = new Map<string, RecipeView>();
	for (const ref of refs) {
		const row = recipes.get(ref.recipeId);
		if (!row) continue;
		if (row.status === 'draft') {
			views.set(recipeViewKey(ref), { summary: summaryOf(row, viewer.locale), status: 'draft', version: 0, baseServings: null, ingredients: null, rating: null });
			continue;
		}
		const document = documents.get(versionKey(ref));
		const base = document ? document.baseServings : row.baseServings!;
		const source = document ? document.ingredients : lines.get(ref.recipeId) ?? [];
		views.set(recipeViewKey(ref), {
			summary: document ? summaryOf({ ...row, ...document.summary }, viewer.locale) : summaryOf(row, viewer.locale),
			status: row.status,
			version: document ? ref.version! : row.version,
			baseServings: base,
			ingredients: ingredientLinesView(source, names, { servings: ref.servings, baseServings: base, system, locale: viewer.locale }),
			rating: ratings.get(ref.recipeId)!,
		});
	}
	return views;
}

/** Older published versions (R1). Task 9 reads them with the W3 document; until then they fail loudly. */
interface VersionDocument {
	summary: Partial<Pick<RecipeRow, 'name' | 'description' | 'durationMinutes' | 'sourceType' | 'sourceUrl' | 'bookPages' | 'mealType' | 'proteinGroup'>>;
	baseServings: number;
	ingredients: LineInput[];
}
const versionKey = (ref: RecipeRef) => `${ref.recipeId}@${ref.version}`;

async function loadVersionDocuments(_tx: Tx, refs: RecipeRef[]): Promise<Map<string, VersionDocument>> {
	if (refs.length) throw new Error('version views need the recipe document (W3)');
	return new Map();
}
```

- [ ] **Passo 5:** `npm test -w server -- recipes && npm run typecheck` → PASS.
- [ ] **Passo 6: commit** `Ricettario: viste condivise delle ricette e dei voti per il Menu`.

### Task 4: operazione `ratings.set`

**File:**
- Crea: `contract/src/recipes/ratings.ts`, `contract/src/recipes/index.ts`,
  `server/src/recipes/access.ts`, `server/src/recipes/router.ts`,
  `server/test/recipes/ratings.test.ts`
- Modifica: `contract/src/contract.ts` (chiave `ratings`), `contract/src/index.ts`,
  `server/src/router.ts` (chiave `ratings`)

**Interfacce:**
- Consuma: `ratingSummaries` (task 3); `op`, `errorDefinitions` da `@app/contract`.
- Produce: `ratingsContract = { set }`; `canSeeRecipe(tx, familyId, recipeId): Promise<RecipeStatus | null>`
  in `access.ts` (riusata dai task 7 e 8); `ratingsRouter(os)` e più avanti
  `recipesRouter(os)` in `server/src/recipes/router.ts`.

- [ ] **Passo 1: test che falliscono** (`server/test/recipes/ratings.test.ts`), con
  `createApp` e il client RPC come `server/test/app.test.ts`:

```ts
import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { createTestKeys, type TestKeys } from '../support/keys.ts';
import { mcp, rpcClient, testEnv, toolBody } from '../support/requests.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('ratings.set', () => {
	let db: TestDatabase; let cat: CatalogueFixture; let keys: TestKeys; let app: ReturnType<typeof createApp>;
	beforeAll(async () => {
		db = await setupDatabase(); cat = catalogueFixture(db); keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	});
	afterAll(() => db?.close());

	async function member() {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId });
		const client = rpcClient<ContractRouterClient<Contract>>(app, testEnv(db.appServerUrl), token);
		return { ...user, familyId, token, client };
	}

	it('sets, changes and removes my stars, answering the family summary', async () => {
		const m = await member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'A', 'en-GB': 'A' } });
		expect(await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 4 })).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
		expect(await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 2 })).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 2 })).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: null })).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: null })).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('rates an archived recipe', async () => {
		const m = await member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'B', 'en-GB': 'B' } });
		await cat.archive(recipeId);
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 })).myStars).toBe(5);
	});

	it('refuses drafts, unknown recipes and books the family does not own unless a meal cites them', async () => {
		const m = await member();
		const draftId = await cat.draft({ 'it-IT': 'C', 'en-GB': 'C' });
		const bookId = await cat.book('book', 'Il libro');
		const fromBook = await cat.recipe({ name: { 'it-IT': 'D', 'en-GB': 'D' }, bookId });
		for (const recipeId of [draftId, crypto.randomUUID(), fromBook]) {
			await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'not_found' });
		}
		await cat.meal(m.familyId, fromBook, '2026-09-21', 'dinner');
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId: fromBook, stars: 3 })).myStars).toBe(3);
	});

	it('is forbidden outside my families and rejects stars out of range', async () => {
		const m = await member();
		const other = await member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'E', 'en-GB': 'E' } });
		await expect(m.client.ratings.set({ familyId: other.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'forbidden' });
		await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 6 })).rejects.toMatchObject({ code: 'invalid' });
	});

	it('is an MCP tool that writes', async () => {
		const m = await member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'F', 'en-GB': 'F' } });
		const env = testEnv(db.appServerUrl);
		const list = await mcp(app, env, m.token, 'tools/list');
		expect(list.body.result.tools.find((t: any) => t.name === 'ratings_set').annotations.readOnlyHint).toBe(false);
		const call = await mcp(app, env, m.token, 'tools/call', { name: 'ratings_set', arguments: { familyId: m.familyId, recipeId, stars: 4 } });
		expect(toolBody(call)).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
	});
});
```

- [ ] **Passo 2:** `npm test -w server -- recipes/ratings` → FAIL.

- [ ] **Passo 3: contratto**

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

```ts
// contract/src/recipes/index.ts
export * from './views.ts';
export { ratingsContract } from './ratings.ts';
```

In `contract/src/contract.ts` aggiungi `ratings: ratingsContract,` (import da
`./recipes/index.ts`); in `contract/src/index.ts` sostituisci l'export di
`./recipes/views.ts` con `export * from './recipes/index.ts';`.

- [ ] **Passo 4: visibilità e gestore**

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
import type { createImplementer } from '../pipeline.ts';
import { canSeeRecipe } from './access.ts';
import { ratingSummaries } from './views.ts';

type Implementer = ReturnType<typeof createImplementer<typeof import('@app/contract').contract>>;

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

Se il tipo `Implementer` scritto così non si risolve (implementatore generico, vedi il
commento in `pipeline.ts`), esporta da `server/src/router.ts` il tipo
`type Implementer = typeof os` e importalo da lì con `import type`.

In `server/src/router.ts`: `ratings: ratingsRouter(os),` accanto a `session`.

- [ ] **Passo 5:** `npm test -w server && npm test -w contract && npm run typecheck` → PASS
  (anche `checkContract` e i test di `app.test.ts` che contano gli strumenti MCP: se un
  test elenca gli strumenti attesi, aggiungi `ratings_set`).
- [ ] **Passo 6: commit** `Ricettario: voto per membro con media della famiglia (ratings.set)`.

### Task 5: PR anticipata delle viste condivise

- [ ] **Passo 1:** verifica completa: `npm run typecheck && npm test` con
  `TEST_DATABASE_URL` impostata (stack locale avviato); tutto verde.
- [ ] **Passo 2:** push del branch `traguardo/ricettario-viste` e
  `gh pr create --base main` con titolo «Ricettario: viste condivise e voto (W6, parte A)»;
  descrizione in italiano: cosa fa (viste del contratto, `ingredientLinesView`,
  `ratingSummaries`, `recipeViews` sulla versione corrente, `ratings.set`), firme per W1,
  limite noto (versioni numerate diverse dalla corrente arrivano con la parte B, oggi
  errore esplicito), verifica eseguita, sezioni della specifica realizzate (parte 1
  «Le stelline», sezioni 1, 6, 13), più la riga di attribuzione richiesta.
- [ ] **Passo 3:** scrivi `STATO: PR_APERTA <url>` e fermati fino ai rilievi.

---

## Parte B: ricettario, scheda e web

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

(«added»: tutti con la stessa data, l'ordine segue il nome.)

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
- Consuma: task 3 (`loadFamily`, `loadRecipeRows`, `loadProjectedLines`,
  `loadIngredientNames`, `ratingSummaries`, `ingredientLinesView`), task 6.
- Produce: `recipesContract.search`; in `load.ts`:

```ts
export interface MealOccurrence { recipeId: string; date: string; mealType: 'lunch' | 'dinner'; passesAt: string; past: boolean }
/** Meals of the family citing these recipes, newest first, with the instant they pass (app.meal_passed_at). */
export function loadMealOccurrences(tx: Tx, familyId: string, recipeIds: string[] | null): Promise<MealOccurrence[]>;
export function loadCandidateIds(tx: Tx, familyId: string): Promise<string[]>;
export function loadSynonyms(tx: Tx, ingredientIds: string[]): Promise<Map<string, { 'it-IT': string[]; 'en-GB': string[] }>>;
```

- [ ] **Passo 1: test che falliscono** (`recipes-search.test.ts`, stessa impostazione del
  task 4 con un `member()` e il client RPC). Casi:

```ts
it('lists published recipes visible to the family, with lines for the base servings', async () => {
	const m = await member();
	const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, { 'it-IT': ['pomodoro'], 'en-GB': ['tomato'] });
	const marker = `m${crypto.randomUUID().slice(0, 6)}`; // isolates this test's recipes in the shared database
	const visible = await cat.recipe({ name: { 'it-IT': `Sugo ${marker}`, 'en-GB': `Sauce ${marker}` }, baseServings: 2,
		lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
	const archived = await cat.recipe({ name: { 'it-IT': `Vecchio ${marker}`, 'en-GB': `Old ${marker}` } });
	await cat.archive(archived);
	await cat.draft({ 'it-IT': `Bozza ${marker}`, 'en-GB': `Draft ${marker}` });
	const bookId = await cat.book('b', 'Libro');
	const fromBook = await cat.recipe({ name: { 'it-IT': `Dal libro ${marker}`, 'en-GB': `From book ${marker}` }, bookId });
	const result = await m.client.recipes.search({ familyId: m.familyId, query: { text: marker } });
	if (result.unchanged) throw new Error('fresh read expected');
	expect(result.data.items.map((i) => i.recipe.id)).toEqual([visible]);
	expect(result.data.items[0]).toMatchObject({ baseServings: 2, ingredients: [{ name: 'Pomodori', amount: '200 g' }],
		rating: { familyCount: 0 }, lastEatenOn: null, upcoming: [] });
	await db.admin`insert into app.family_books (family_id, book_id) values (${m.familyId}, ${bookId})`;
	const again = await m.client.recipes.search({ familyId: m.familyId, query: { text: marker } });
	if (again.unchanged) throw new Error('family books changed: fresh read expected');
	expect(again.data.items.map((i) => i.recipe.id).sort()).toEqual([visible, fromBook].sort());
});

it('searches synonyms of the caller language', async () => {
	const m = await member();
	const marker = `m${crypto.randomUUID().slice(0, 6)}`;
	const leek = await cat.ingredient('leek', { 'it-IT': 'Porri', 'en-GB': 'Leeks' }, { 'it-IT': [`porro${marker}`], 'en-GB': [`leek${marker}`] });
	const soup = await cat.recipe({ name: { 'it-IT': 'Zuppa', 'en-GB': 'Soup' }, lines: [{ ingredientId: leek, quantity: { kind: 'amount', value: 2, unit: 'piece' } }] });
	const it = await m.client.recipes.search({ familyId: m.familyId, query: { text: `porro${marker}` } });
	const en = await m.client.recipes.search({ familyId: m.familyId, query: { text: `leek${marker}` } });
	if (it.unchanged || en.unchanged) throw new Error('fresh read expected');
	expect(it.data.items.map((i) => i.recipe.id)).toEqual([soup]);
	expect(en.data.items).toEqual([]); // the caller reads Italian
});

it('gives lastEatenOn from past meals and upcoming meals with their instant', async () => {
	const m = await member();
	const marker = `m${crypto.randomUUID().slice(0, 6)}`;
	const recipeId = await cat.recipe({ name: { 'it-IT': `Pasto ${marker}`, 'en-GB': `Meal ${marker}` } });
	await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
	const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
	await cat.meal(m.familyId, recipeId, future, 'lunch');
	// Expected instant computed by the same SQL function, so summer time does not matter here.
	const [{ at }] = await db.admin<{ at: Date }[]>`select app.meal_passed_at(${future}::date, 'lunch', time_zone) as at from app.families where id = ${m.familyId}`;
	const result = await m.client.recipes.search({ familyId: m.familyId, query: { text: marker } });
	if (result.unchanged) throw new Error('fresh read expected');
	expect(result.data.items[0]).toMatchObject({ lastEatenOn: '2026-09-21',
		upcoming: [{ date: future, mealType: 'lunch', passesAt: at.toISOString() }] });
});

it('answers unchanged with the same version, fresh after a rating', async () => {
	const m = await member();
	const recipeId = await cat.recipe({ name: { 'it-IT': 'Invariato', 'en-GB': 'Unchanged' } });
	const first = await m.client.recipes.search({ familyId: m.familyId, query: {} });
	const same = await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version });
	expect(same).toEqual({ unchanged: true, version: first.version });
	await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 });
	expect((await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version })).unchanged).toBe(false);
});

it('is forbidden to non members and a read-only MCP tool', async () => {
	const m = await member();
	const other = await member();
	await expect(m.client.recipes.search({ familyId: other.familyId, query: {} })).rejects.toMatchObject({ code: 'forbidden' });
	const list = await mcp(app, testEnv(db.appServerUrl), m.token, 'tools/list');
	expect(list.body.result.tools.find((t: any) => t.name === 'recipes_search').annotations.readOnlyHint).toBe(true);
});
```

Le altre ricette pubblicate dagli altri file di test convivono nello stesso database:
per questo i casi filtrano con un marcatore casuale nel nome. Se il trigger della data
delle settimane rifiuta un pasto futuro fuori dalle settimane ammesse, scegli la data
dentro la settimana corrente o la successiva.

- [ ] **Passo 2:** `npm test -w server -- recipes-search` → FAIL.

- [ ] **Passo 3: contratto** (`contract/src/recipes/recipes.ts`)

```ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
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

/** Newest first. `recipeIds` null: every recipe of the family's meals. */
export async function loadMealOccurrences(tx: Tx, familyId: string, recipeIds: string[] | null): Promise<MealOccurrence[]> {
	return tx<MealOccurrence[]>`
		select s.recipe_id as "recipeId", to_char(s.date, 'YYYY-MM-DD') as date, s.meal_type as "mealType",
			to_char(p.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "passesAt", p.at <= now() as past
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
		where w.family_id = ${familyId} and s.recipe_id is not null
			and (${recipeIds}::uuid[] is null or s.recipe_id = any(${recipeIds}::uuid[]))
		order by s.date desc, s.meal_type desc`;
}

export async function loadSynonyms(tx: Tx, ingredientIds: string[]) {
	const rows = await tx<{ id: string; synonyms: { 'it-IT': string[]; 'en-GB': string[] } }[]>`
		select id, synonyms from app.ingredients where id = any(${ingredientIds}::uuid[])`;
	return new Map(rows.map((row) => [row.id, row.synonyms]));
}
```

(`meal_type desc` mette la cena prima del pranzo dello stesso giorno: ordine dal più
recente.)

- [ ] **Passo 5: gestore** in `server/src/recipes/router.ts`, `recipesRouter(os)`:

```ts
search: os.recipes.search.handler(async ({ context, input }) => {
	const { tx, userId, locale } = context;
	const { familyId } = input;
	const ids = await loadCandidateIds(tx, familyId);
	const [{ system }, rows, lines, ratings, addedOn, meals] = await Promise.all([
		loadFamily(tx, familyId), loadRecipeRows(tx, ids), loadProjectedLines(tx, ids),
		ratingSummaries(tx, familyId, userId, ids), loadAddedOn(tx, familyId, ids), loadMealOccurrences(tx, familyId, ids),
	]);
	const ingredientIds = [...new Set([...lines.values()].flat().map((line) => line.ingredientId))];
	const [names, synonyms] = await Promise.all([loadIngredientNames(tx, ingredientIds), loadSynonyms(tx, ingredientIds)]);
	const candidates: SearchCandidate[] = ids.map((id) => {
		const row = rows.get(id)!;
		const recipeLines = lines.get(id) ?? [];
		return {
			id, name: row.name, description: row.description, mealType: row.mealType!, durationMinutes: row.durationMinutes!,
			proteinGroup: row.proteinGroup!, familyAverage: ratings.get(id)!.familyAverage, addedOn: addedOn.get(id)!,
			lastEatenOn: meals.find((meal) => meal.recipeId === id && meal.past)?.date ?? null,
			ingredientTexts: recipeLines.flatMap((line) => [names.get(line.ingredientId)![locale], line.variety?.[locale] ?? '',
				...(synonyms.get(line.ingredientId)?.[locale] ?? [])]),
		};
	});
	const items = searchRecipes(candidates, input.query, locale).map((candidate) => {
		const row = rows.get(candidate.id)!;
		return {
			recipe: summaryOf(row, locale),
			rating: ratings.get(candidate.id)!,
			baseServings: row.baseServings!,
			ingredients: ingredientLinesView(lines.get(candidate.id) ?? [], names, { servings: row.baseServings!, baseServings: row.baseServings!, system, locale }),
			addedOn: candidate.addedOn,
			lastEatenOn: candidate.lastEatenOn,
			upcoming: meals.filter((meal) => meal.recipeId === candidate.id && !meal.past).reverse().slice(0, 3)
				.map(({ date, mealType, passesAt }) => ({ date, mealType, passesAt })),
		};
	});
	return fresh(context, { items });
}),
```

Esporta `summaryOf` da `views.ts` (oggi interna). Registra in `server/src/router.ts`
`recipes: recipesRouter(os),`. `fresh` viene da `../pipeline.ts`.

- [ ] **Passo 6:** `npm test -w server && npm run typecheck` → PASS.
- [ ] **Passo 7: commit** `Ricettario: lettura del ricettario (recipes.search)`.

### Task 8: operazione `recipes.get` sulla versione corrente

**File:**
- Modifica: `contract/src/recipes/recipes.ts`, `server/src/recipes/router.ts`
- Crea: `server/test/recipes/recipes-get.test.ts`

**Interfacce:**
- Consuma: `canSeeRecipe` (task 4), `recipeViews` (task 3), `loadMealOccurrences` (task 7).
- Produce: `recipesContract.get`, `recipeDetailView`.

- [ ] **Passo 1: test che falliscono.** Casi, ciascuno scritto per intero sul modello
  dei task 4 e 7:
  1. scheda di una pubblicata con `servings: 4` (base 2): righe raddoppiate, `servings: 4`,
     `status: 'published'`; senza `servings` usa la base;
  2. archiviata leggibile (`status: 'archived'`);
  3. bozza → `not_found`, anche per un utente con `recipe_curator`
     (`db.grantGlobalRole`) e anche se citata da un pasto della famiglia;
  4. ricetta di un libro non posseduto: `not_found`; citata da un pasto della famiglia:
     leggibile;
  5. `history`: con 6 pasti passati restituisce i 5 più recenti (data e pasto);
     `upcoming` con un pasto futuro;
  6. `slotId` di un'altra famiglia → `not_found`; `slotId` della famiglia che cita
     un'altra ricetta → `not_found`; `slotId` di un pasto futuro → versione corrente;
  7. `servings: 0` → `invalid`;
  8. strumento MCP `recipes_get` con `readOnlyHint: true`.

- [ ] **Passo 2:** `npm test -w server -- recipes-get` → FAIL.

- [ ] **Passo 3: contratto**

```ts
export const recipeDetailView = z.object({
	recipe: recipeSummaryView,
	status: z.enum(['published', 'archived']),
	baseServings: z.number().int().positive(),
	servings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView),
	rating: ratingSummaryView,
	history: z.array(z.object({ date: isoDateSchema, mealType: mealTypeSchema })),
	upcoming: z.array(mealOccurrenceView),
});

// in recipesContract:
get: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
	.route({ method: 'POST', path: '/families/{familyId}/recipes/{recipeId}/view',
		summary: 'Read a recipe with ingredients scaled to the servings asked, the family rating and its recent meals; slotId shows the version eaten in that past meal' })
	.errors({ not_found: errorDefinitions.not_found })
	.input(versionedInput(z.object({
		familyId: z.uuid(), recipeId: z.uuid(),
		servings: z.number().int().min(1).max(100).optional(),
		slotId: z.uuid().optional(),
	})))
	.output(versionedOutput(recipeDetailView)),
```

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
	const [{ baseServings: currentBase }] = await tx<{ baseServings: number }[]>`select base_servings as "baseServings" from app.recipes where id = ${recipeId}`;
	// The servings default to the base of the version shown: read it first when it is an older one.
	const probe = { recipeId, version, servings: input.servings ?? currentBase };
	const views = await recipeViews(tx, { familyId, userId, locale }, [probe]);
	let view = views.get(recipeViewKey(probe))!;
	if (!input.servings && view.baseServings !== probe.servings) {
		const ref = { ...probe, servings: view.baseServings! };
		view = (await recipeViews(tx, { familyId, userId, locale }, [ref])).get(recipeViewKey(ref))!;
	}
	const meals = await loadMealOccurrences(tx, familyId, [recipeId]);
	return fresh(context, {
		recipe: view.summary,
		status,
		baseServings: view.baseServings!,
		servings: input.servings ?? view.baseServings!,
		ingredients: view.ingredients!,
		rating: view.rating!,
		history: meals.filter((meal) => meal.past).slice(0, 5).map(({ date, mealType }) => ({ date, mealType })),
		upcoming: meals.filter((meal) => !meal.past).reverse().slice(0, 3).map(({ date, mealType, passesAt }) => ({ date, mealType, passesAt })),
	});
}),
```

- [ ] **Passo 5:** `npm test -w server && npm run typecheck` → PASS.
- [ ] **Passo 6: commit** `Ricettario: scheda ricetta con porzioni e storico (recipes.get)`.

### Task 9: versioni pubblicate precedenti (R1) con il documento di W3

Si esegue quando `domain/src/recipe/` di W3 è su `main` (ribasa prima). Se non c'è
ancora, passa al task 10 e torna qui.

**File:**
- Modifica: `server/src/recipes/views.ts` (`loadVersionDocuments`), `domain/package.json`
  solo se W3 non ha già esportato `./recipe` (in quel caso `STATO: DOMANDA`: il file è di W3)
- Test: `server/test/recipes/views.test.ts`, `server/test/recipes/recipes-get.test.ts`

**Interfacce:**
- Consuma da `@app/domain/recipe` (nomi della spec di W3, da verificare sul codice
  unito): `publishedRecipeSchema` e il tipo `RecipeDocument`.

- [ ] **Passo 1: test che falliscono**

```ts
// in views.test.ts
it('builds an older version from its document (R1)', async () => {
	const me = await db.createUser();
	const familyId = await db.createFamily([{ userId: me.userId, role: 'family_admin' }]);
	const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
	const recipeId = await cat.recipe({ name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' }, baseServings: 2,
		lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }] });
	await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' }, baseServings: 4,
		lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 500, unit: 'g' } }] }, new Date());
	const ref = { recipeId, version: 1, servings: 2 };
	const views = await asUser(me.userId, me.sessionId, (tx) => recipeViews(tx, { familyId, userId: me.userId, locale: 'it-IT' }, [ref]));
	expect(views.get(recipeViewKey(ref))).toMatchObject({ version: 1, baseServings: 2, summary: { name: 'Sugo v1' },
		ingredients: [{ name: 'Pomodori', amount: '200 g' }] });
});
```

e in `recipes-get.test.ts`: un pasto passato (2026-09-21) di una ricetta pubblicata con
`createdAt` precedente, poi `publishVersion` con `publishedAt` = adesso; `recipes.get`
con lo `slotId` mostra la versione 1, senza `slotId` la 2; dopo la pubblicazione una
lettura con la vecchia `knownVersion` non è «invariata».

- [ ] **Passo 2:** `npm test -w server -- recipes` → FAIL («version views need the recipe document»).

- [ ] **Passo 3: implementazione**

```ts
import { publishedRecipeSchema } from '@app/domain/recipe';

async function loadVersionDocuments(tx: Tx, refs: RecipeRef[]): Promise<Map<string, VersionDocument>> {
	if (!refs.length) return new Map();
	const rows = await tx<{ recipeId: string; version: number; content: unknown }[]>`
		select recipe_id as "recipeId", version, content from app.recipe_versions
		where (recipe_id, version) in (select * from unnest(${refs.map((r) => r.recipeId)}::uuid[], ${refs.map((r) => r.version)}::int[]))`;
	return new Map(rows.map((row) => {
		const document = publishedRecipeSchema.parse(row.content);
		return [`${row.recipeId}@${row.version}`, {
			summary: { name: document.name, description: document.description, durationMinutes: document.durationMinutes,
				sourceType: document.sourceType, sourceUrl: document.sourceUrl, bookPages: document.bookPages,
				mealType: document.mealType, proteinGroup: document.proteinGroup },
			baseServings: document.baseServings,
			ingredients: document.ingredients.map((line) => ({ ingredientId: line.ingredientId, variety: line.variety,
				preparation: line.preparation, quantity: line.quantity, isOptional: line.isOptional })),
		}];
	}));
}
```

Il titolo del libro resta quello attuale del catalogo (entità condivisa). Se lo schema
pubblicato di W3 richiede campi che le fixture non scrivono, aggiorna `writeProjection`
in `fixtures.ts` perché il contenuto della versione sia un documento pubblicabile
completo.

- [ ] **Passo 4:** `npm test -w server && npm run typecheck` → PASS.
- [ ] **Passo 5: commit** `Ricettario: versioni precedenti per i pasti passati (R1)`.

### Task 10: web, ricettario e scheda sui dati veri

Si esegue quando la seconda PR di W5 (client oRPC reale) è su `main`. Prima di
scrivere, leggi la struttura di `web/src/` su `main` e adegua i percorsi dei file qui
sotto a quella (feature o rotte): i nomi delle funzioni restano questi.

**File (percorsi della base di W5 al momento della PR #6):**
- Crea: `web/src/features/recipes/mealTime.ts` e il suo test (funzioni pure dell'ora)
- Modifica: `web/src/api/types.ts` (forme del contratto: meglio i tipi inferiti da
  `@app/contract` se il client reale li espone), `web/src/api/fake/fakeApi.ts` e i dati
  finti (forme nuove), `web/src/routes/RecipesPage.tsx`, `web/src/routes/RecipePage.tsx`,
  `web/src/components/RecipeFilters.tsx` (8 gruppi), `web/src/i18n/messages/recipes.ts`
  (etichette dei gruppi e testi nuovi nelle due lingue)

**Interfacce:**
- Consuma: `recipes.search`, `recipes.get`, `ratings.set`; `useRateRecipe` di W5.
- Produce:

```ts
/** Date of the last meal eaten, as of `now`: an upcoming meal that has passed wins. */
export function lastEatenOn(view: { lastEatenOn: string | null; upcoming: MealOccurrenceView[] }, now: Date): string | null;
/** Last 5 past meals, newest first: history plus the upcoming meals that have passed. */
export function pastMeals(view: { history: { date: string; mealType: MealType }[]; upcoming: MealOccurrenceView[] }, now: Date): { date: string; mealType: MealType }[];
/** Re-sorts by lastEaten only when an upcoming meal has passed since the read. */
export function resortByLastEaten<T extends { recipe: { name: string }; lastEatenOn: string | null; upcoming: MealOccurrenceView[] }>(items: T[], now: Date, reversed: boolean, locale: string): T[];
```

- [ ] **Passo 1: test che falliscono** (`mealTime.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { lastEatenOn, pastMeals, resortByLastEaten } from './mealTime';

const up = (date: string, passesAt: string) => ({ date, mealType: 'dinner' as const, passesAt });

describe('meal time on the device', () => {
	it('takes an upcoming meal once it has passed', () => {
		const view = { lastEatenOn: '2026-09-21', upcoming: [up('2026-10-12', '2026-10-12T21:00:00.000Z')] };
		expect(lastEatenOn(view, new Date('2026-10-12T20:59:00Z'))).toBe('2026-09-21');
		expect(lastEatenOn(view, new Date('2026-10-12T21:00:00Z'))).toBe('2026-10-12');
	});

	it('merges history and passed upcoming meals, newest first, five at most', () => {
		const history = ['2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01'].map((date) => ({ date, mealType: 'lunch' as const }));
		const view = { history, upcoming: [up('2026-10-12', '2026-10-12T21:00:00.000Z')] };
		expect(pastMeals(view, new Date('2026-10-13T00:00:00Z')).map((m) => m.date)).toEqual(['2026-10-12', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02']);
	});

	it('re-sorts by the derived date, missing values last', () => {
		const a = { recipe: { name: 'A' }, lastEatenOn: '2026-09-01', upcoming: [up('2026-10-12', '2026-10-12T21:00:00.000Z')] };
		const b = { recipe: { name: 'B' }, lastEatenOn: '2026-10-01', upcoming: [] };
		const c = { recipe: { name: 'C' }, lastEatenOn: null, upcoming: [] };
		expect(resortByLastEaten([b, a, c], new Date('2026-10-13T00:00:00Z'), false, 'it-IT').map((i) => i.recipe.name)).toEqual(['A', 'B', 'C']);
		expect(resortByLastEaten([b, a, c], new Date('2026-10-13T00:00:00Z'), true, 'it-IT').map((i) => i.recipe.name)).toEqual(['B', 'A', 'C']);
	});
});
```

- [ ] **Passo 2:** `npm test -w web -- mealTime` → FAIL.

- [ ] **Passo 3: implementazione**

```ts
// mealTime.ts
import type { MealOccurrenceView } from '@app/contract';

type MealType = 'lunch' | 'dinner';
const passed = (meal: MealOccurrenceView, now: Date) => Date.parse(meal.passesAt) <= now.getTime();

export function lastEatenOn(view: { lastEatenOn: string | null; upcoming: MealOccurrenceView[] }, now: Date): string | null {
	const latest = view.upcoming.filter((meal) => passed(meal, now)).map((meal) => meal.date).sort().at(-1);
	return latest ?? view.lastEatenOn;
}

export function pastMeals(view: { history: { date: string; mealType: MealType }[]; upcoming: MealOccurrenceView[] }, now: Date) {
	const fresh = view.upcoming.filter((meal) => passed(meal, now)).map(({ date, mealType }) => ({ date, mealType }));
	return [...fresh.reverse(), ...view.history].slice(0, 5);
}

export function resortByLastEaten<T extends { recipe: { name: string }; lastEatenOn: string | null; upcoming: MealOccurrenceView[] }>(
	items: T[], now: Date, reversed: boolean, locale: string,
): T[] {
	if (!items.some((item) => item.upcoming.some((meal) => passed(meal, now)))) return items;
	const keyed = items.map((item) => ({ item, key: lastEatenOn(item, now) }));
	return keyed.sort((a, b) => {
		if (a.key === null || b.key === null) return a.key === b.key ? a.item.recipe.name.localeCompare(b.item.recipe.name, locale) : a.key === null ? 1 : -1;
		if (a.key === b.key) return a.item.recipe.name.localeCompare(b.item.recipe.name, locale);
		return (reversed ? -1 : 1) * (a.key < b.key ? 1 : -1);
	}).map(({ item }) => item);
}
```

Se `@app/contract` non è dipendenza di `web/`, definisci localmente il tipo
`MealOccurrenceView` come in `views.ts` (solo il tipo) oppure usa quello esposto dal
client reale di W5.

- [ ] **Passo 4: pagine.** Collega le pagine alle operazioni reali, nella forma di W5:
  - `RecipesPage`: `searchQuery` con la chiave `['recipes', 'search', { familyId, query, locale }]`;
    sui dati applica `resortByLastEaten` quando `query.sort === 'lastEaten'`; la scheda
    mostra `ingredients` e la data da `lastEatenOn(item, new Date())` dove il design lo
    prevede; stato vuoto con «Azzera i filtri» com'è oggi.
  - `RecipeFilters`: gruppi da `proteinGroupSchema.options` (o la costante equivalente),
    etichette `group.<codice>` nelle due lingue per gli 8 codici:
    it-IT `Pesce, Carne bianca, Carne rossa, Salumi, Legumi, Uova, Formaggi, Vegetariano`;
    en-GB `Fish, White meat, Red meat, Cured meat, Pulses, Eggs, Cheese, Vegetarian`.
  - `RecipePage`: `recipeQuery(familyId, recipeId, servings, slotId)`; storico da
    `pastMeals(view, new Date())`; fonte del libro con `bookTitle` e `bookPages`; niente
    blocco «bozza» (le bozze danno `not_found` → «Ricetta non disponibile»).
  - `RatingStars`: già collegato a `useRateRecipe`; verifica che chiami
    `api.ratings.set({ familyId, recipeId, stars })` e che offline mostri l'errore senza
    inviare.
  - API finta: aggiorna `fakeApi.ts` e `demo-data.json` alle forme nuove (gruppi reali,
    `upcoming`, `addedOn`, `lastEatenOn`, `status`, `preparation`), così la modalità
    senza variabili continua a funzionare.

- [ ] **Passo 5: test dei componenti** con testing-library sull'API finta:
  - ricettario: filtro per gruppo «Carne rossa» mostra solo quelle ricette; «Azzera i
    filtri» ripristina l'elenco;
  - scheda: il selettore delle porzioni cambia le quantità (nuova lettura con
    `servings`); lo storico mostra al più 5 voci;
  - stelline: un voto chiama `ratings.set` con i valori giusti e applica la risposta.
  Poi `npm test -w web && npm run typecheck -w web`.

- [ ] **Passo 6: prova visiva** con la skill `agent-browser` sull'app locale
  (`wrangler dev` + `supabase start` + build web): ricettario con filtri e ordinamenti,
  scheda con porzioni, voto e togli voto, scheda aperta da un pasto passato; poi sulla
  porta 8767 per l'iPhone se il coordinatore lo chiede.

- [ ] **Passo 7: commit** `Ricettario: schermate del ricettario e della scheda sui dati veri`.

### Task 11: verifica e PR

- [ ] **Passo 1:** skill `superpowers:verification-before-completion`:
  `npm run typecheck && npm test` con `TEST_DATABASE_URL`, build del web
  (`npm run build -w web`).
- [ ] **Passo 2:** push di `traguardo/ricettario` e `gh pr create --base main`,
  «Ricettario e voti (W6)», descrizione in italiano con cosa fa, come è stato verificato
  (comandi ed esito, prova visiva), sezioni della specifica realizzate, decisioni da
  riportare (rimando alla sezione finale della spec), più la riga di attribuzione.
- [ ] **Passo 3:** `STATO: PR_APERTA <url>` e fermati.
