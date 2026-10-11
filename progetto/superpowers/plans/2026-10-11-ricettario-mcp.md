# Gestione del ricettario tramite MCP: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** area `catalogue` (bozze, controlli, conflitti, pubblicazione, archiviazione,
versioni, ripristino, ingredienti, equivalenze, libri, guida) con contratto, server, MCP,
migrazione e, dopo il cancello, le sezioni web delle bozze.

**Architecture:** operazioni del contratto in `contract/src/catalogue/`, gestori sottili in
`server/src/catalogue/router.ts` sopra le scritture riusabili di `write.ts`, tutto nella
transazione della pipeline nel ruolo dell'utente sotto le RLS dei curatori; controlli e
proiezioni dal dominio di W3 (`@app/domain/recipe`), conversioni dalle equivalenze di W4;
nel database solo `app.recipe_is_cited` e l'estensione di `app.catalogue_author_names()`.

**Tech Stack:** TypeScript, zod 4, oRPC (contratto, implementatore), Postgres.js, Vitest,
pgTAP con la CLI di Supabase; web React con TanStack Query (dopo il cancello).

**Spec:** `progetto/superpowers/specs/2026-10-11-ricettario-mcp.md` (con la specifica
principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 2, 8,
12, 13).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e messaggi di commit in
  italiano; testi per l'utente in italiano e inglese britannico.
- Nessuna dipendenza nuova.
- Ogni operazione: `role: 'curator'`, `offline: false`, `mcp` presente; nessuna ha
  `familyId`; le creazioni hanno `creates: true` e un `id` uuid del client.
- Letture versionate (`reads: ['catalogue']`): `searchRecipes`, `listVersions`,
  `getVersion`, `searchIngredients`, `getIngredient`, `listVarieties`, `listBooks`. Non versionate: `getGuide`,
  `overview`, `getDraft`, `checkDraft`, `checkVariety`.
- Nessuna cancellazione fisica di ricette, bozze, versioni, ingredienti, libri.
- Migrazioni solo nuove, con test pgTAP: `supabase/migrations/20261011180000_catalogue_citations.sql`.
- File condivisi toccati in modo minimo. PR del server: `contract/src/errors.ts`,
  `contract/src/contract.ts`, `server/src/router.ts`, `server/src/messages.ts`,
  `supabase/tests/coverage_test.sql`, `web/src/api/errors.ts` e
  `web/src/i18n/messages/errors.ts` (compatibilità con `not_allowed`). PR del web:
  `SERVER_AREAS` in `web/src/api/types.ts`, client finto, rotte, corpo di `RecipesPage`.
- Non modificare `server/src/recipes/views.ts` (W6) né `server/src/family/views.ts` (W2):
  si importano `ingredientLinesView`, `loadIngredientNamesById`, `loadBookTitlesById`,
  `foldText`.
- Web solo dopo il cancello: merge della #17 (W5, già unita), della #18 (W2, `profile.get`)
  e della #19 (W6, `RecipesPage` sui dati veri).
- Istante delle scritture: `clock_timestamp()` letto nel database dopo i lucchetti
  (`writeInstant(tx)`), mai `context.now`; `Actor` non porta un orologio. Per la
  pubblicazione e il ripristino l'istante si legge dopo tutte le attese, cioè dopo
  l'aggiornamento di `recipes` e `recipe_ingredients` (che fa crescere `catalogue_state`),
  subito prima di inserire la versione (`writeVersion`).
- Creazioni (`createDraft`, `startRevision`, `createIngredient`, `createBook`) serializzate
  con `pg_advisory_xact_lock(hashtext('app.catalogue_create'))` (`lockCreations(tx)`).
- Comandi: `npm run typecheck`, `npm test`, `npm test -w server`, `npm test -w contract`;
  database locale `PATH=/opt/podman/bin:$HOME/.local/bin:$PATH supabase db start`, poi
  `supabase test db`; i test del server con database girano con
  `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Review Focus

1. **Ripetizione di una richiesta dopo una risposta persa** (rete mobile, agente che
   ritenta): `createDraft`, `saveDraft`, `publish`, `restoreVersion`, `setArchived`,
   `createIngredient`, `createBook` ripetuti devono dare lo stesso esito senza scritture
   doppie né conflitti con sé stessi. Test nelle attività 6, 7, 8, 9.
2. **Due curatori sulla stessa bozza nello stesso istante**: le richieste si serializzano
   (`for update`) e la seconda riceve `conflict`, mai un salvataggio perso. Test
   concorrente nell'attività 6.
3. **Ingrediente citato dalla bozza archiviato o cancellato dal catalogo dopo il
   salvataggio**: il controllo e la pubblicazione lo segnalano (`unknown_ingredient`),
   senza `internal`. Test nell'attività 7.
4. **Documento salvato da una versione più vecchia del server o dall'import con campi
   mancanti** (bozze importate con `ingredientId: null`): `getDraft` e `overview` non
   falliscono e mostrano i problemi. Test nell'attività 5.
5. **Curatore che perde il ruolo a metà lavoro** (stesso token): ogni operazione risponde
   `forbidden` subito, anche le letture. Test nell'attività 5.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `contract/src/errors.ts` (modifica) | `conflictData` con discriminante, `not_allowed` |
| `contract/src/catalogue/views.ts` | schemi delle viste dell'area |
| `contract/src/catalogue/operations.ts` | `catalogueContract` |
| `contract/src/catalogue/index.ts` | riesportazioni |
| `contract/src/contract.ts` (modifica) | `catalogue: catalogueContract` |
| `contract/src/catalogue/catalogue-contract.test.ts` | metadati e forme |
| `supabase/migrations/20261011180000_catalogue_citations.sql` | `recipe_is_cited`, autori degli ingredienti |
| `supabase/tests/catalogue_citations_test.sql` | pgTAP |
| `supabase/migrations/20261011190000_draft_requests.sql` | richieste di `startRevision` risposte con una revisione aperta (Task 10bis) |
| `supabase/tests/draft_requests_test.sql` | pgTAP (Task 10bis) |
| `server/src/catalogue/convert.ts` (+ test) | conversioni delle tazze, puro |
| `server/src/catalogue/fields.ts` (+ test) | campi cambiati e confronto canonico, puro |
| `server/src/catalogue/slug.ts` (+ test) | slug unici |
| `server/src/catalogue/load.ts` | caricamenti dal database e `CatalogueLookup` |
| `server/src/catalogue/views.ts` | viste di bozze, panoramica, versioni, ingredienti, libri |
| `server/src/catalogue/write.ts` | scritture riusabili (bozze, pubblicazione, ingredienti, libri) |
| `server/src/catalogue/recipe-writes.ts` | proiezioni e versioni (pubblicazione e ripristino) |
| `server/src/catalogue/ingredients.ts` | ingredienti, equivalenze, storico |
| `server/src/catalogue/guide.ts` | testo della guida |
| `server/src/catalogue/router.ts` | `catalogueRouter(os)` |
| `server/src/router.ts` (modifica) | registrazione |
| `server/src/messages.ts` (modifica) | testo di `not_allowed` |
| `server/test/catalogue/support.ts` | attori curatori e documenti di prova |
| `server/test/catalogue/*.test.ts` | test per gruppo di operazioni |
| `web/src/features/catalogue/*` | sezioni, pagina, query, dizionario (dopo il cancello) |

---

### Task 1: errori `conflict` con discriminante e `not_allowed`

**Files:**
- Modify: `contract/src/errors.ts`
- Modify: `server/src/messages.ts`
- Modify: `web/src/api/errors.ts` (`CONTRACT_ERROR_CODES`), `web/src/i18n/messages/errors.ts`
- Test: `contract/src/errors.test.ts` (nuovo); i test esistenti `web/src/api/errors.test.ts` e `web/src/i18n/i18n.test.ts`

**Interfaces:**
- Produces: `conflictData` (unione `kind: 'draft' | 'version' | 'ingredient'`),
  `ConflictData`, `notAllowedData`, `NotAllowedReason`, codice `'not_allowed'` in
  `errorCodes` ed `errorDefinitions.not_allowed = { status: 409, data: notAllowedData }`.

- [ ] **Step 1: test che fallisce**

```ts
// contract/src/errors.test.ts
import { describe, expect, it } from 'vitest';
import { conflictData, errorCodes, errorDefinitions, notAllowedData } from './errors.ts';

describe('catalogue errors', () => {
	it('declares not_allowed as a 409 with a reason', () => {
		expect(errorCodes).toContain('not_allowed');
		expect(errorDefinitions.not_allowed.status).toBe(409);
		expect(notAllowedData.parse({ reason: 'cited_by_meals' })).toEqual({ reason: 'cited_by_meals' });
		expect(() => notAllowedData.parse({ reason: 'other' })).toThrow();
	});

	it('tells the three conflicts apart', () => {
		const at = '2026-10-11T10:00:00.000Z';
		const by = crypto.randomUUID();
		expect(conflictData.parse({ kind: 'draft', revision: 3, by, byName: 'Lucia', at, theirFields: ['name'], myFields: ['ingredients'], theirs: { schemaVersion: 1 } }).kind).toBe('draft');
		expect(conflictData.parse({ kind: 'version', version: 2, by: null, byName: null, at }).kind).toBe('version');
		expect(conflictData.parse({ kind: 'ingredient', version: 4, by, byName: null, at, fields: ['department'] }).kind).toBe('ingredient');
		expect(() => conflictData.parse({ by, at, fields: [] })).toThrow();
	});
});
```

- [ ] **Step 2: eseguirlo** — `npm test -w contract -- errors` → FAIL (`notAllowedData` non esiste).

- [ ] **Step 3: implementazione**

In `contract/src/errors.ts`: aggiungere `'not_allowed'` a `errorCodes` dopo `'conflict'`;
sostituire `conflictData`; aggiungere `notAllowedData` e la definizione.

```ts
const conflictAuthor = { by: z.uuid().nullable(), byName: z.string().nullable(), at: z.iso.datetime() };
/** Catalogue conflicts (spec section 8): a draft saved by someone else, a newer version, a changed ingredient. */
export const conflictData = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('draft'),
		revision: z.number().int().min(1),
		...conflictAuthor,
		theirFields: z.array(z.string()),
		myFields: z.array(z.string()),
		/** The draft document as the other curator saved it. */
		theirs: z.record(z.string(), z.unknown()),
	}),
	z.object({ kind: z.literal('version'), version: z.number().int().min(1), ...conflictAuthor }),
	z.object({ kind: z.literal('ingredient'), version: z.number().int().min(1), ...conflictAuthor, fields: z.array(z.string()) }),
]);
export type ConflictData = z.infer<typeof conflictData>;
/** A rule of state, not wrong data: a cited draft, a never-published recipe, the current version. */
export const notAllowedData = z.object({ reason: z.enum(['cited_by_meals', 'not_published', 'already_current']) });
export type NotAllowedReason = z.infer<typeof notAllowedData>['reason'];
```

In `errorDefinitions`: `not_allowed: { status: 409, data: notAllowedData },`.

In `server/src/messages.ts`:

```ts
	not_allowed: {
		'it-IT': 'Operazione non consentita nello stato attuale della ricetta.',
		'en-GB': 'This operation is not allowed in the recipe’s current state.',
	},
```

e il testo di `conflict` diventa: «Qualcun altro ha modificato questi dati nel frattempo:
guarda chi e cosa ha cambiato prima di riprovare.» / «Someone else changed this data in the
meantime: check who changed what before trying again.»

Nel web (compatibilità, senza schermate nuove): in `web/src/api/errors.ts` aggiungere
`'not_allowed'` a `CONTRACT_ERROR_CODES` dopo `'conflict'` (il controllo `complete` non
compila senza); in `web/src/i18n/messages/errors.ts`:

```ts
  'errors.not_allowed': 'Non si può fare nello stato attuale della ricetta.',
```

in `it` e

```ts
  'errors.not_allowed': 'This cannot be done in the recipe’s current state.',
```

in `en` (il `satisfies Record<keyof typeof it, string>` impone entrambe).

- [ ] **Step 4: eseguire** `npm test -w contract && npm test -w web && npm run typecheck` → PASS
  (il `Record<ErrorCode, …>` di `messages.ts` e il controllo `complete` del web obbligano a
  definire il codice ovunque; il test delle traduzioni del web verifica `errors.not_allowed`).
- [ ] **Step 5: commit** — `git commit -m "Contratto: conflitti con discriminante e codice not_allowed"`

---

### Task 2: migrazione `recipe_is_cited` e autori degli ingredienti

**Files:**
- Create: `supabase/migrations/20261011180000_catalogue_citations.sql`
- Create: `supabase/tests/catalogue_citations_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenco delle funzioni di `authenticated`)

**Interfaces:**
- Produces: `app.recipe_is_cited(p_recipe_id uuid) returns boolean` (curatori;
  altrimenti `42501`); `app.catalogue_author_names()` con anche
  `ingredient_versions.changed_by`.

- [ ] **Step 1: test pgTAP che fallisce**

Fixture condivise di `supabase/tests/helpers/fixtures.psql`: `dario` e `gina` curatori,
membri di nessuna famiglia; `bruno` membro di `test-Rossi`, non curatore;
`test-new-draft` citata dalla cena di lunedì 12 ottobre di `test-Rossi`;
`test-old-minestrone` archiviata e citata da nessun pasto; `test-salt` ingrediente. Gli
helper `tests.recipe` e `tests.ingredient` aggiungono da soli il prefisso `test-`.

```sql
-- Citations of a recipe across families and the authors of ingredient changes (W3, wave 2).
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

reset role;
select tests.login('dario');
select ok(app.recipe_is_cited(tests.recipe('new-draft')), 'a meal of a family dario is not in cites the draft');
select ok(not app.recipe_is_cited(tests.recipe('old-minestrone')), 'no meal cites the archived recipe');

reset role;
select tests.login('bruno');
select throws_ok(format('select app.recipe_is_cited(%L)', tests.recipe('new-draft')), '42501', null, 'members who are not curators are refused');

reset role;
select ok(not has_function_privilege('anon', 'app.recipe_is_cited(uuid)', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('public', 'app.recipe_is_cited(uuid)', 'execute'), 'public cannot execute');
select ok(has_function_privilege('authenticated', 'app.recipe_is_cited(uuid)', 'execute'), 'authenticated can execute');

-- Revocation is immediate with the same claims.
delete from app.user_roles where user_id = tests.uid('dario') and role = 'recipe_curator';
select tests.login('dario');
select throws_ok(format('select app.recipe_is_cited(%L)', tests.recipe('new-draft')), '42501', null, 'a revoked curator is refused');
reset role;
insert into app.user_roles (user_id, role) values (tests.uid('dario'), 'recipe_curator');

-- Author names include who changed an ingredient (gina has written nothing else in the fixtures).
insert into app.ingredient_versions (ingredient_id, version, content, changed_by, channel)
	values (tests.ingredient('salt'), 2, '{}', tests.uid('gina'), 'mcp');
select tests.login('dario');
select ok(exists (select 1 from app.catalogue_author_names() where user_id = tests.uid('gina')), 'ingredient authors are named to curators');
reset role;
select tests.login('bruno');
select is((select count(*) from app.catalogue_author_names()), 0::bigint, 'nothing for non-curators');

select * from finish();
rollback;
```

Se `tests.login` richiede `reset role` prima di cambiare utente (come in
`catalogue_test.sql`), il test lo fa già a ogni cambio.

In `supabase/tests/coverage_test.sql` l'elenco delle funzioni di `authenticated` diventa:

```sql
	array['can_access_list', 'can_access_slot', 'can_access_week', 'catalogue_author_names', 'has_role', 'is_family_admin',
		'is_localized_list', 'is_localized_text', 'is_member', 'meal_passed_at', 'recipe_is_cited', 'recipe_version_at',
		'session_is_active', 'shares_family', 'unit_dimension'],
```

- [ ] **Step 2: eseguire** `supabase test db` → FAIL (funzione assente).

- [ ] **Step 3: migrazione**

```sql
-- Catalogue management (W3, wave 2): citations of a recipe across families and the
-- authors of ingredient changes, for curators only.

create function app.recipe_is_cited(p_recipe_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('recipe_curator') then
		raise exception 'curators only' using errcode = '42501';
	end if;
	return exists (select 1 from app.meal_slots where recipe_id = p_recipe_id);
end;
$$;

revoke execute on function app.recipe_is_cited(uuid) from public;
grant execute on function app.recipe_is_cited(uuid) to authenticated;

create or replace function app.catalogue_author_names()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
	select p.user_id, p.display_name
	from app.profiles p
	where app.has_role('recipe_curator')
		and p.user_id in (
			select d.created_by from app.recipe_drafts d
			union select d.updated_by from app.recipe_drafts d
			union select d.closed_by from app.recipe_drafts d
			union select s.saved_by from app.recipe_draft_saves s
			union select v.published_by from app.recipe_versions v
			union select c.changed_by from app.recipe_status_changes c
			union select i.changed_by from app.ingredient_versions i
		);
$$;
```

(`create or replace` conserva i permessi: `revoke` a `public` e `grant` ad
`authenticated` della migrazione di W2 restano validi; il test lo verifica.)

- [ ] **Step 4: eseguire** `supabase db reset && supabase test db` → PASS, compresi
  `coverage_test.sql` (elenco aggiornato; `recipe_is_cited` fissa `search_path` vuoto come
  vuole il controllo sulle funzioni `security definer`) e `catalogue_test.sql`.
- [ ] **Step 5: commit** — `git add supabase/ && git commit -m "Schema: citazioni di una ricetta e autori degli ingredienti per i curatori"`

---

### Task 3: funzioni pure del server (conversioni, campi cambiati, slug)

**Files:**
- Create: `server/src/catalogue/convert.ts`, `server/src/catalogue/convert.test.ts`
- Create: `server/src/catalogue/fields.ts`, `server/src/catalogue/fields.test.ts`
- Create: `server/src/catalogue/slug.ts`, `server/src/catalogue/slug.test.ts`

**Interfaces:**
- Produces:
  - `applyRecipeConversions(document: RecipeDraftDocument, equivalences: ReadonlyMap<string, readonly UnitEquivalenceRow[]>): { document: RecipeDraftDocument; conversions: Conversion[] }`
  - `interface UnitEquivalenceRow extends UnitEquivalence { id: string }`
  - `interface Conversion { line: number; from: Quantity; to: Amount; equivalence: { id: string; factor: number; source: string; preparation: string | null } }`
  - `changedFields(a: object, b: object): string[]`; `sameDocument(a: unknown, b: unknown): boolean`
  - `slugify(text: string, fallback: string): string`; `uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string>`

- [ ] **Step 1: test che falliscono**

```ts
// server/src/catalogue/convert.test.ts
import { emptyDraft, type RecipeDraftDocument } from '@app/domain/recipe';
import { describe, expect, it } from 'vitest';
import { applyRecipeConversions, type UnitEquivalenceRow } from './convert.ts';

const flour = '11111111-1111-4111-8111-111111111111';
const lemon = '22222222-2222-4222-8222-222222222222';
const cupLine = (ingredientId: string | null, value: number | null, preparation: RecipeDraftDocument['ingredients'] extends (infer L)[] | undefined ? any : never = null) => ({
	ingredientId, variety: null, preparation, quantity: { kind: 'amount' as const, value, unit: 'us_cup' as const },
	sourceText: '1 cup', isOptional: false, isPrimary: false,
});
const eq = (over: Partial<UnitEquivalenceRow>): UnitEquivalenceRow => ({
	id: crypto.randomUUID(), ingredientId: flour, fromUnit: 'us_cup', toUnit: 'g', factor: 120, scope: 'recipe', preparation: null, source: 'King Arthur', ...over,
});

describe('applyRecipeConversions', () => {
	it('converts a cup with the recipe equivalence and keeps the source text', () => {
		const e = eq({});
		const doc = { ...emptyDraft(), ingredients: [cupLine(flour, 2)] } as RecipeDraftDocument;
		const { document, conversions } = applyRecipeConversions(doc, new Map([[flour, [e]]]));
		expect(document.ingredients?.[0]?.quantity).toEqual({ kind: 'amount', value: 240, unit: 'g' });
		expect(document.ingredients?.[0]?.sourceText).toBe('1 cup');
		expect(conversions).toEqual([{ line: 0, from: { kind: 'amount', value: 2, unit: 'us_cup' }, to: { kind: 'amount', value: 240, unit: 'g' },
			equivalence: { id: e.id, factor: 120, source: 'King Arthur', preparation: null } }]);
		expect(doc.ingredients?.[0]?.quantity.unit).toBe('us_cup'); // input untouched
	});

	it('leaves cups without an equivalence, without a value or without an ingredient', () => {
		const doc = { ...emptyDraft(), ingredients: [cupLine(lemon, 1), cupLine(flour, null), cupLine(null, 1)] } as RecipeDraftDocument;
		const { document, conversions } = applyRecipeConversions(doc, new Map([[flour, [eq({})]]]));
		expect(conversions).toEqual([]);
		expect(document.ingredients?.map((l) => l.quantity.unit)).toEqual(['us_cup', 'us_cup', 'us_cup']);
	});

	it('prefers the equivalence of the line preparation and ignores shopping ones', () => {
		const juice = eq({ ingredientId: lemon, toUnit: 'ml', factor: 237, preparation: 'succo' });
		const shopping = eq({ ingredientId: lemon, scope: 'shopping', toUnit: 'piece', factor: 5 });
		const doc = { ...emptyDraft(), ingredients: [cupLine(lemon, 1, { 'it-IT': 'Succo', 'en-GB': 'juice' })] } as RecipeDraftDocument;
		const { conversions } = applyRecipeConversions(doc, new Map([[lemon, [juice, shopping]]]));
		expect(conversions[0]?.to).toEqual({ kind: 'amount', value: 237, unit: 'ml' });
	});
});
```

`findEquivalence` di W4 confronta `preparationKey(preparation)` con `eq.preparation`:
leggere `preparationKey` in `domain/src/units/equivalence.ts` e, se la normalizzazione non
porta «Succo» a «succo», scrivere nel test la forma che restituisce.

```ts
// server/src/catalogue/fields.test.ts
import { describe, expect, it } from 'vitest';
import { changedFields, sameDocument } from './fields.ts';

describe('changedFields', () => {
	it('lists the top-level keys that differ, in a stable order', () => {
		expect(changedFields({ name: { 'it-IT': 'A' }, durationMinutes: 10, ingredients: [] }, { name: { 'it-IT': 'B' }, durationMinutes: 10, ingredients: [1] }))
			.toEqual(['ingredients', 'name']);
	});
	it('treats a missing key and null as different only when one has a value', () => {
		expect(changedFields({ sourceUrl: null }, {})).toEqual([]);
		expect(changedFields({ sourceUrl: 'https://a.it' }, {})).toEqual(['sourceUrl']);
	});
});

describe('sameDocument', () => {
	it('ignores key order', () => {
		expect(sameDocument({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
		expect(sameDocument({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
	});
});
```

```ts
// server/src/catalogue/slug.test.ts
import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug.ts';

describe('slugs', () => {
	it('keeps letters and digits, without accents', () => {
		expect(slugify('Pasta e fagioli à la Nonna!', 'recipe')).toBe('pasta-e-fagioli-a-la-nonna');
		expect(slugify('  ', 'recipe')).toBe('recipe');
		expect(slugify('x'.repeat(100), 'recipe')).toHaveLength(60);
	});
	it('adds a numeric suffix when taken', async () => {
		const taken = new Set(['pesto', 'pesto-2']);
		expect(await uniqueSlug('pesto', async (s) => taken.has(s))).toBe('pesto-3');
	});
});
```

- [ ] **Step 2: eseguire** `npm test -w server -- catalogue/` → FAIL.

- [ ] **Step 3: implementazione**

```ts
// server/src/catalogue/convert.ts
import type { RecipeDraftDocument } from '@app/domain/recipe';
import { applyRecipeEquivalence, findEquivalence, type Amount, type Quantity, type UnitEquivalence } from '@app/domain/units';

export interface UnitEquivalenceRow extends UnitEquivalence { id: string }
export interface Conversion {
	line: number;
	from: Quantity;
	to: Amount;
	equivalence: { id: string; factor: number; source: string; preparation: string | null };
}

/**
 * US cups become publishable amounts through the ingredient's recipe equivalence (spec, decision 4):
 * the draft keeps what the source says, the check and the published document get the conversion.
 */
export function applyRecipeConversions(
	document: RecipeDraftDocument,
	equivalences: ReadonlyMap<string, readonly UnitEquivalenceRow[]>,
): { document: RecipeDraftDocument; conversions: Conversion[] } {
	const conversions: Conversion[] = [];
	const ingredients = document.ingredients?.map((line, index) => {
		const q = line.quantity;
		if (q.kind !== 'amount' || q.unit !== 'us_cup' || q.value === null || !line.ingredientId) return line;
		const found = findEquivalence(equivalences.get(line.ingredientId) ?? [], 'recipe', 'us_cup', line.preparation?.['it-IT']);
		if (!found) return line;
		const row = found as UnitEquivalenceRow;
		const from: Quantity = { kind: 'amount', value: q.value, unit: 'us_cup' };
		const to = applyRecipeEquivalence(from, row);
		conversions.push({ line: index, from, to, equivalence: { id: row.id, factor: row.factor, source: row.source, preparation: row.preparation } });
		return { ...line, quantity: to };
	});
	return { document: ingredients ? { ...document, ingredients } : document, conversions };
}
```

Se il tipo `Quantity` di W4 non ammette `us_cup` (solo le bozze lo ammettono), usare il
tipo della quantità della riga di bozza e un cast documentato a `Quantity` per
`applyRecipeEquivalence`, che controlla l'unità a runtime.

```ts
// server/src/catalogue/fields.ts
const present = (value: unknown) => value !== undefined && value !== null;

/** Sorted keys of a JSON value, so equal documents compare equal whatever the key order. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical((value as Record<string, unknown>)[k])]));
	}
	return value;
}

export const sameDocument = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Top-level document fields that differ (the prototype's changedFields); absent and null are the same. */
export function changedFields(a: object, b: object): string[] {
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
	return keys.filter((k) => (present(left[k]) || present(right[k])) && !sameDocument(left[k] ?? null, right[k] ?? null));
}
```

```ts
// server/src/catalogue/slug.ts
/** Slugs of the catalogue (recipes, ingredients, books): kebab case, as the schema checks. */
export function slugify(text: string, fallback: string): string {
	const slug = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
	return slug || fallback;
}

export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
	let slug = base;
	for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
	return slug;
}
```

Nota sul test di `slugify` con 100 «x»: la lunghezza attesa è 60.

- [ ] **Step 4: eseguire** `npm test -w server -- catalogue/ && npm run typecheck -w server` → PASS.
- [ ] **Step 5: commit** — `git commit -m "Gestione del ricettario: conversioni delle tazze, campi cambiati e slug"`

---

### Task 4: contratto dell'area `catalogue`

**Files:**
- Create: `contract/src/catalogue/views.ts`, `contract/src/catalogue/operations.ts`, `contract/src/catalogue/index.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts` (se riesporta le aree)
- Test: `contract/src/catalogue/catalogue-contract.test.ts`

**Interfaces:**
- Consumes: `conflictData`, `notAllowedData`, `errorDefinitions` (Task 1).
- Produces: `catalogueContract` con le 24 operazioni della spec, sezione 2; tipi
  `DraftView`, `DraftSummaryView`, `ArchivedSummaryView`, `ConversionView`,
  `IngredientView`, `VersionListView`, `VersionDetailView`, `BookView`.

- [ ] **Step 1: test che fallisce**

```ts
// contract/src/catalogue/catalogue-contract.test.ts
import { describe, expect, it } from 'vitest';
import { checkContract } from '../check.ts';
import { contract } from '../contract.ts';
import { catalogueContract } from './operations.ts';

const ops = Object.entries(catalogueContract) as [string, { '~orpc': { meta: any; route: any } }][];

describe('catalogue contract', () => {
	it('passes the platform checks', () => {
		// checkContract returns the problems found, it does not throw.
		expect(checkContract(contract)).toEqual([]);
	});
	it('is for curators only, exposed to MCP, never offline, without familyId', () => {
		expect(ops.map(([name]) => name).sort()).toEqual([
			'checkDraft', 'checkVariety', 'createBook', 'createDraft', 'createIngredient', 'discardDraft', 'getDraft', 'getGuide',
			'getIngredient', 'getVersion', 'listBooks', 'listVarieties', 'listVersions', 'overview', 'publish', 'removeEquivalence',
			'restoreVersion', 'saveDraft', 'searchIngredients', 'searchRecipes', 'setArchived', 'setEquivalence', 'startRevision', 'updateIngredient',
		]);
		for (const [name, o] of ops) {
			expect(o['~orpc'].meta, name).toMatchObject({ role: 'curator', offline: false });
			expect(o['~orpc'].meta.mcp, name).not.toBe(false);
			expect(o['~orpc'].route.path.startsWith('/catalogue/'), name).toBe(true);
			const input = (o['~orpc'] as unknown as { inputSchema: { shape?: Record<string, unknown> } }).inputSchema;
			expect(Object.keys(input.shape ?? {}), name).not.toContain('familyId');
		}
	});
	it('versions only the reads that depend on the catalogue counter', () => {
		const versioned = ops.filter(([, o]) => o['~orpc'].meta.reads).map(([n]) => n).sort();
		expect(versioned).toEqual(['getIngredient', 'getVersion', 'listBooks', 'listVarieties', 'listVersions', 'searchIngredients', 'searchRecipes']);
	});
});
```

L'elenco atteso ha 24 nomi; `startRevision` è una creazione (`creates: true`) con `id`.
Prima di scrivere il test leggere in `contract/src/check.ts` dove oRPC tiene lo schema di
input (`'~orpc'.inputSchema`) e usare lo stesso accesso.

- [ ] **Step 2: eseguire** `npm test -w contract -- catalogue` → FAIL.

- [ ] **Step 3: viste**

```ts
// contract/src/catalogue/views.ts
import { MISSING_DATA, publishedRecipeSchema, recipeDraftSchema } from '@app/domain/recipe';
import { DEPARTMENTS } from '@app/domain/shopping';
import { quantitySchema, UNIT_CODES } from '@app/domain/units';
import { z } from 'zod';
import { ingredientLineView, recipeSummaryView } from '../recipes/views.ts';

export const issueView = z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() });
/** null: the person left the app. */
export const authorView = z.object({ userId: z.uuid().nullable(), name: z.string().nullable() });
const instant = z.iso.datetime();
const missing = z.array(z.enum(MISSING_DATA));
const draftKind = z.enum(['new', 'revision']);

export const conversionView = z.object({
	line: z.number().int().min(0),
	from: z.object({ kind: z.literal('amount'), value: z.number(), unit: z.literal('us_cup') }),
	to: quantitySchema,
	equivalence: z.object({ id: z.uuid(), factor: z.number().positive(), source: z.string(), preparation: z.string().nullable() }),
});

export const draftSummaryView = z.object({
	draftId: z.uuid(), recipeId: z.uuid(), kind: draftKind, name: z.string(),
	createdBy: authorView, updatedBy: authorView, updatedAt: instant, missing,
});
export const archivedSummaryView = z.object({ recipeId: z.uuid(), name: z.string(), archivedBy: authorView, archivedAt: instant });
export const overviewView = z.object({ drafts: z.array(draftSummaryView), archived: z.array(archivedSummaryView) });

export const draftView = z.object({
	draftId: z.uuid(), recipeId: z.uuid(), kind: draftKind, revision: z.number().int().min(1),
	content: recipeDraftSchema,
	createdBy: authorView, createdAt: instant, updatedBy: authorView, updatedAt: instant,
	baseVersion: z.number().int().min(1).nullable(),
	currentVersion: z.number().int().min(0),
	recipeStatus: z.enum(['draft', 'published', 'archived']),
	issues: z.array(issueView), missing, conversions: z.array(conversionView),
	outcome: z.enum(['published', 'discarded']).nullable(),
	canDiscard: z.boolean(),
	ingredientNames: z.record(z.string(), z.string()),
	bookTitle: z.string().nullable(),
});
export const checkView = z.object({ revision: z.number().int().min(1), issues: z.array(issueView), missing, conversions: z.array(conversionView) });
export const publishedView = z.object({ recipeId: z.uuid(), version: z.number().int().min(1), conversions: z.array(conversionView) });

export const recipeMatchView = z.object({
	recipeId: z.uuid(), name: z.string(), status: z.enum(['published', 'archived']), version: z.number().int().min(1), updatedAt: instant,
});
export const statusView = z.object({ recipeId: z.uuid(), status: z.enum(['published', 'archived']), changedBy: authorView, changedAt: instant });
export const versionListView = z.object({
	recipeId: z.uuid(), name: z.string(), status: z.enum(['published', 'archived']), current: z.number().int().min(1),
	versions: z.array(z.object({ version: z.number().int().min(1), publishedBy: authorView, publishedAt: instant,
		channel: z.enum(['web', 'mcp', 'import']), restoredFrom: z.number().int().nullable() })),
});
export const versionDetailView = z.object({
	recipeId: z.uuid(), version: z.number().int().min(1), current: z.number().int().min(1),
	publishedBy: authorView, publishedAt: instant, restoredFrom: z.number().int().nullable(),
	content: publishedRecipeSchema, summary: recipeSummaryView, ingredients: z.array(ingredientLineView), issues: z.array(issueView),
});
export const restoredView = z.object({ recipeId: z.uuid(), version: z.number().int().min(1), restoredFrom: z.number().int().min(1) });

const plainLocalized = z.object({ 'it-IT': z.string(), 'en-GB': z.string() });
export const synonymsSchema = z.object({ 'it-IT': z.array(z.string().trim().min(1).max(80)).max(20), 'en-GB': z.array(z.string().trim().min(1).max(80)).max(20) });
export const departmentSchema = z.enum(DEPARTMENTS);
export const unitCodeSchema = z.enum(UNIT_CODES);
export const equivalenceView = z.object({ id: z.uuid(), fromUnit: unitCodeSchema, toUnit: unitCodeSchema, factor: z.number().positive(), preparation: z.string().nullable(), source: z.string() });
export const ingredientView = z.object({
	ingredientId: z.uuid(), slug: z.string(), name: plainLocalized, synonyms: synonymsSchema, department: departmentSchema,
	isPantry: z.boolean(), version: z.number().int().min(1), equivalences: z.array(equivalenceView),
});
export const ingredientMatchView = z.object({
	ingredientId: z.uuid(), name: z.string(), department: departmentSchema, isPantry: z.boolean(),
	variety: plainLocalized.nullable(), matched: z.enum(['name', 'synonym', 'variety']),
});
export const varietyHintView = z.object({ kind: z.string() }).passthrough();
export const bookView = z.object({ bookId: z.uuid(), slug: z.string(), title: z.string(), archived: z.boolean() });

export type DraftView = z.infer<typeof draftView>;
export type DraftSummaryView = z.infer<typeof draftSummaryView>;
export type ArchivedSummaryView = z.infer<typeof archivedSummaryView>;
export type OverviewView = z.infer<typeof overviewView>;
export type ConversionView = z.infer<typeof conversionView>;
export type CheckView = z.infer<typeof checkView>;
export type IngredientView = z.infer<typeof ingredientView>;
export type VersionListView = z.infer<typeof versionListView>;
export type VersionDetailView = z.infer<typeof versionDetailView>;
export type BookView = z.infer<typeof bookView>;
```

Prima di scrivere `varietyHintView`, leggere `VarietyHint` in
`domain/src/recipe/variety.ts` e sostituire `passthrough` con la sua unione esatta
(`existing_spelling` con la grafia suggerita, `repeats_ingredient` con il suggerimento,
`preparation`). Se `MISSING_DATA` o `DEPARTMENTS` non sono riesportati dall'indice del
pacchetto, importarli dal modulo che li definisce.

- [ ] **Step 4: operazioni**

```ts
// contract/src/catalogue/operations.ts
import { recipeDraftSchema } from '@app/domain/recipe';
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import {
	bookView, checkView, departmentSchema, draftView, ingredientMatchView, ingredientView, overviewView, publishedView, recipeMatchView,
	restoredView, statusView, synonymsSchema, unitCodeSchema, varietyHintView, versionDetailView, versionListView,
} from './views.ts';

const read = () => op({ mcp: { readOnly: true }, offline: false, role: 'curator' });
const versionedRead = () => op({ mcp: { readOnly: true }, offline: false, role: 'curator', reads: ['catalogue'] });
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'curator' });
const create = () => op({ mcp: { readOnly: false }, offline: false, role: 'curator', creates: true });
const notFound = { not_found: errorDefinitions.not_found };
const conflict = { conflict: errorDefinitions.conflict };
const notAllowed = { not_allowed: errorDefinitions.not_allowed };
const draftId = z.object({ draftId: z.uuid() });
const recipeId = z.object({ recipeId: z.uuid() });
const ingredientId = z.object({ ingredientId: z.uuid() });
const revision = z.number().int().min(1);
const nameInput = z.object({ 'it-IT': z.string().trim().min(1).max(80), 'en-GB': z.string().trim().max(80).nullable() });

export const catalogueContract = {
	getGuide: read()
		.route({ method: 'GET', path: '/catalogue/guide', summary: 'Read this first: how to add or change recipes as a curator, what publishing requires and how to write ingredient lines' })
		.input(z.object({}))
		.output(z.object({ guide: z.string() })),
	overview: read()
		.route({ method: 'GET', path: '/catalogue/overview', summary: 'Open recipe drafts (new recipes and revisions, with what they still miss to publish) and archived recipes' })
		.input(z.object({}))
		.output(overviewView),
	getDraft: read()
		.route({ method: 'GET', path: '/catalogue/drafts/{draftId}', summary: 'A draft as saved, with its revision (pass it back when saving), publication problems as codes and paths, and US-cup conversions' })
		.errors(notFound)
		.input(draftId)
		.output(draftView),
	createDraft: create()
		.route({ method: 'POST', path: '/catalogue/drafts', summary: 'Start a new recipe as a draft (at least a name in one language); incomplete data is fine, wrong data is refused with codes and paths. Repeating the same id returns the same draft' })
		.input(z.object({ id: z.uuid(), content: recipeDraftSchema }))
		.output(draftView),
	startRevision: create()
		.route({ method: 'POST', path: '/catalogue/recipes/{recipeId}/revision', summary: 'Edit a published or archived recipe: opens its revision draft, or returns the one already open (one per recipe, shared by curators)' })
		.errors({ ...notFound, ...notAllowed })
		.input(recipeId.extend({ id: z.uuid() }))
		.output(draftView),
	saveDraft: write()
		.route({ method: 'PUT', path: '/catalogue/drafts/{draftId}', summary: 'Save a draft from the revision you read (baseRevision). If another curator saved meanwhile you get a conflict with their version: take it, or overwrite it by passing overwriteRevision' })
		.errors({ ...notFound, ...conflict })
		.input(draftId.extend({ baseRevision: revision, content: recipeDraftSchema, overwriteRevision: revision.optional() }))
		.output(draftView),
	checkDraft: read()
		.route({ method: 'GET', path: '/catalogue/drafts/{draftId}/check', summary: 'Run the full publication check on the saved draft without publishing: problems as codes and paths, and the US-cup conversions publishing would apply' })
		.errors(notFound)
		.input(draftId)
		.output(checkView),
	publish: write()
		.route({ method: 'POST', path: '/catalogue/drafts/{draftId}/publish', summary: 'Publish the latest revision of a draft after the curator confirmed the complete card. A revision started from an older version needs confirmVersion set to the current version' })
		.errors({ ...notFound, ...conflict })
		.input(draftId.extend({ confirmVersion: revision.optional() }))
		.output(publishedView),
	discardDraft: write()
		.route({ method: 'POST', path: '/catalogue/drafts/{draftId}/discard', summary: 'Discard a revision, or a new recipe never published and not cited by any meal' })
		.errors({ ...notFound, ...notAllowed })
		.input(draftId)
		.output(z.object({ draftId: z.uuid(), recipeId: z.uuid(), kind: z.enum(['new', 'revision']) })),
	setArchived: write()
		.route({ method: 'PUT', path: '/catalogue/recipes/{recipeId}/archived', summary: 'Archive a published recipe (out of the recipe book, search and plans; meals keep it) or bring it back with archived: false' })
		.errors({ ...notFound, ...notAllowed })
		.input(recipeId.extend({ archived: z.boolean() }))
		.output(statusView),
	searchRecipes: versionedRead()
		.route({ method: 'GET', path: '/catalogue/recipes', summary: 'Find published and archived recipes of the whole catalogue by name or description in your language (empty text: all, by name). Start here to revise, archive or restore a recipe' })
		.input(versionedInput(z.object({ text: z.string().trim().max(60).default(''), status: z.enum(['published', 'archived', 'any']).default('any') })))
		.output(versionedOutput(z.object({ items: z.array(recipeMatchView) }))),
	listVersions: versionedRead()
		.route({ method: 'GET', path: '/catalogue/recipes/{recipeId}/versions', summary: 'Published versions of a recipe, newest first, with who published them and when' })
		.errors(notFound)
		.input(versionedInput(recipeId))
		.output(versionedOutput(versionListView)),
	getVersion: versionedRead()
		.route({ method: 'GET', path: '/catalogue/recipes/{recipeId}/versions/{version}', summary: 'One version of a recipe as it was, with the problems it would have if restored today' })
		.errors(notFound)
		.input(versionedInput(recipeId.extend({ version: z.coerce.number().int().min(1) })))
		.output(versionedOutput(versionDetailView)),
	restoreVersion: write()
		.route({ method: 'POST', path: '/catalogue/recipes/{recipeId}/versions/{version}/restore', summary: 'Publish an older version again as a new version, after showing it to the curator; confirmVersion is the current version you saw' })
		.errors({ ...notFound, ...conflict, ...notAllowed })
		.input(recipeId.extend({ version: z.coerce.number().int().min(1), confirmVersion: revision }))
		.output(restoredView),
	searchIngredients: versionedRead()
		.route({ method: 'GET', path: '/catalogue/ingredients', summary: 'Find catalogue ingredients by name, synonym or a variety already used, in your language (at least 2 letters). Search before creating one' })
		.input(versionedInput(z.object({ text: z.string().trim().min(2).max(60) })))
		.output(versionedOutput(z.object({ items: z.array(ingredientMatchView) }))),
	getIngredient: versionedRead()
		.route({ method: 'GET', path: '/catalogue/ingredients/{ingredientId}', summary: 'An ingredient with its version, names, synonyms, department, pantry flag and recipe equivalences (with their ids): read it before changing it' })
		.errors(notFound)
		.input(versionedInput(ingredientId))
		.output(versionedOutput(ingredientView)),
	listVarieties: versionedRead()
		.route({ method: 'GET', path: '/catalogue/ingredients/{ingredientId}/varieties', summary: 'Varieties already written for an ingredient in published recipes, most used first: reuse their spelling' })
		.errors(notFound)
		.input(versionedInput(ingredientId))
		.output(versionedOutput(z.object({ varieties: z.array(z.object({ variety: z.object({ 'it-IT': z.string(), 'en-GB': z.string() }), uses: z.number().int().min(1) })) }))),
	checkVariety: read()
		.route({ method: 'GET', path: '/catalogue/ingredients/{ingredientId}/variety-check', summary: 'Advice on a variety you are about to write (existing spelling, ingredient name repeated, preparation words); resolve every hint' })
		.errors(notFound)
		.input(ingredientId.extend({ text: z.string().trim().min(1).max(40), locale: z.enum(['it-IT', 'en-GB']) }))
		.output(z.object({ hints: z.array(varietyHintView) })),
	createIngredient: create()
		.route({ method: 'POST', path: '/catalogue/ingredients', summary: 'Add a generic product to the catalogue (no variety, size or preparation in the name), with its shop department' })
		.input(z.object({ id: z.uuid(), name: nameInput, department: departmentSchema, isPantry: z.boolean().default(false), synonyms: synonymsSchema.optional() }))
		.output(ingredientView),
	updateIngredient: write()
		.route({ method: 'PUT', path: '/catalogue/ingredients/{ingredientId}', summary: 'Change names, synonyms, department or pantry flag of an ingredient for every recipe, from the version you read' })
		.errors({ ...notFound, ...conflict })
		.input(ingredientId.extend({ baseVersion: revision, name: nameInput, synonyms: synonymsSchema, department: departmentSchema, isPantry: z.boolean() }))
		.output(ingredientView),
	setEquivalence: write()
		.route({ method: 'PUT', path: '/catalogue/ingredients/{ingredientId}/equivalences', summary: 'Set how a US cup (or another unit) of this ingredient converts for recipes, with the source of the figure; updates the one with the same unit kind and preparation, and repeating it changes nothing' })
		.errors(notFound)
		.input(ingredientId.extend({ fromUnit: unitCodeSchema, toUnit: unitCodeSchema, factor: z.number().positive(), preparation: z.string().trim().max(60).nullable().default(null), source: z.string().trim().min(1).max(200) }))
		.output(ingredientView),
	removeEquivalence: write()
		.route({ method: 'DELETE', path: '/catalogue/ingredients/{ingredientId}/equivalences/{equivalenceId}', summary: 'Remove a recipe equivalence of an ingredient; removing one already gone is fine' })
		.errors(notFound)
		.input(ingredientId.extend({ equivalenceId: z.uuid() }))
		.output(ingredientView),
	listBooks: versionedRead()
		.route({ method: 'GET', path: '/catalogue/books', summary: 'Books of the catalogue, for recipes taken from a book' })
		.input(versionedInput(z.object({})))
		.output(versionedOutput(z.object({ books: z.array(bookView) }))),
	createBook: create()
		.route({ method: 'POST', path: '/catalogue/books', summary: 'Add a book to the catalogue by its original title. Repeating the same id returns the same book' })
		.input(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200) }))
		.output(bookView.omit({ archived: true })),
};
```

In `contract/src/catalogue/index.ts`: `export * from './operations.ts'; export * from './views.ts';`.
In `contract/src/contract.ts`: `import { catalogueContract } from './catalogue/index.ts';` e
`catalogue: catalogueContract,` dopo `menu`. Se `contract/src/index.ts` riesporta le aree,
aggiungere `export * from './catalogue/index.ts';`.

- [ ] **Step 5: eseguire** `npm test -w contract && npm run typecheck -w contract` → PASS.
  Il typecheck del server torna verde alla fine del Task 5, quando il router implementa
  l'area: il branch non si unisce prima della fine del Task 10.
- [ ] **Step 6: commit** — `git commit -m "Contratto: area catalogue per la gestione del ricettario"`

---

### Task 5: letture delle bozze, panoramica, guida e registrazione nel router

**Files:**
- Create: `server/src/catalogue/load.ts`, `server/src/catalogue/views.ts`, `server/src/catalogue/guide.ts`, `server/src/catalogue/router.ts`
- Modify: `server/src/router.ts`
- Create: `server/test/catalogue/support.ts`
- Test: `server/test/catalogue/read.test.ts`

**Interfaces:**
- Consumes: Task 3 (`applyRecipeConversions`), Task 4 (contratto).
- Produces:
  - `load.ts`: `loadDraftRow(tx, draftId, { lock?: boolean; open?: boolean }): Promise<DraftRow | null>`; `loadLookup(tx, document): Promise<CatalogueLookup>`; `loadRecipeEquivalences(tx, ingredientIds): Promise<Map<string, UnitEquivalenceRow[]>>`; `loadAuthors(tx): Promise<Map<string, string>>`; `isCited(tx, recipeId): Promise<boolean>`
  - `interface DraftRow { id; recipeId; kind: 'new' | 'revision'; baseVersion: number | null; content: RecipeDraftDocument; revision; createdBy; createdAt: Date; updatedBy; updatedAt: Date; closedAt: Date | null; closedBy: string | null; outcome: 'published' | 'discarded' | null; recipeStatus; recipeVersion: number }`
  - `views.ts`: `draftViewOf(tx, row, locale): Promise<DraftView>`; `overview(tx, locale): Promise<OverviewView>`; `publicationCheck(tx, content): Promise<{ document; issues; conversions }>`; `authorOf(authors, userId): AuthorView`; `localText(text, locale): string`
  - `guide.ts`: `CURATOR_GUIDE: string`
  - `router.ts`: `catalogueRouter(os: Implementer)`
  - Test support: `catalogueActors()` → `{ actors, curator(locale?), agentCurator(), member(), revoke(userId) }`; `draftContent(name, over?)`, `completeContent(ingredientId, over?)`

- [ ] **Step 1: supporto dei test**

```ts
// server/test/catalogue/support.ts
import type { RecipeDraftDocument } from '@app/domain/recipe';
import { setupActors, type Actor, type Actors } from '../support/actors.ts';
import { seedIngredient } from '../support/shopping-fixtures.ts';

export interface CatalogueActors {
	actors: Actors;
	curator(options?: { locale?: 'it-IT' | 'en-GB'; agent?: boolean }): Promise<Actor>;
	member(): Promise<Actor>;
	revoke(userId: string): Promise<void>;
	ingredient(name: string, en?: string | null): Promise<string>;
}

export async function catalogueActors(): Promise<CatalogueActors> {
	const actors = await setupActors();
	return {
		actors,
		async curator(options = {}) {
			const actor = await actors.user(options);
			await actors.db.grantGlobalRole(actor.userId, 'recipe_curator');
			return actor;
		},
		member: () => actors.user(),
		revoke: async (userId) => {
			await actors.db.admin`delete from app.user_roles where user_id = ${userId} and role = 'recipe_curator'`;
		},
		ingredient: (name, en = `${name} (en)`) => seedIngredient(actors.db, { name: { 'it-IT': name, 'en-GB': en ?? '' } }),
	};
}

export const draftContent = (name: string, over: Partial<RecipeDraftDocument> = {}): RecipeDraftDocument =>
	({ schemaVersion: 1, name: { 'it-IT': name }, ...over }) as RecipeDraftDocument;

/** A draft that passes the publication check with one line of the given ingredient. */
export const completeContent = (name: string, ingredientId: string, over: Partial<RecipeDraftDocument> = {}): RecipeDraftDocument => ({
	schemaVersion: 1,
	name: { 'it-IT': name, 'en-GB': `${name} (en)` },
	description: { 'it-IT': 'Descrizione', 'en-GB': 'Description' },
	sourceType: 'home', sourceUrl: null, bookId: null, bookPages: null,
	durationMinutes: 20, baseServings: 2, mealType: 'both', proteinGroup: 'vegetarian', isFreshFish: false,
	carbohydrateGroup: 'none', category: 'pan', hasVegetables: true, isHeavy: false, seasons: [],
	ingredients: [{ ingredientId, variety: null, preparation: null, quantity: { kind: 'amount', value: 200, unit: 'g' }, sourceText: '200 g', isOptional: false, isPrimary: false }],
	...over,
}) as RecipeDraftDocument;
```

- [ ] **Step 2: test che falliscono**

```ts
// server/test/catalogue/read.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue reads', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());

	it('refuses people who are not curators, also after a revocation with the same token', async () => {
		const member = await c.member();
		expect((await errorOf(member.client.catalogue.overview({}))).code).toBe('forbidden');
		const curator = await c.curator();
		await curator.client.catalogue.overview({});
		await c.revoke(curator.userId);
		expect((await errorOf(curator.client.catalogue.overview({}))).code).toBe('forbidden');
		expect((await errorOf(curator.client.catalogue.getGuide({}))).code).toBe('forbidden');
	});

	it('serves the guide', async () => {
		const curator = await c.curator();
		const { guide } = await curator.client.catalogue.getGuide({});
		expect(guide).toContain('catalogue_searchIngredients');
		expect(guide).toContain('explicit yes');
	});

	it('shows an imported draft with unresolved lines and what it misses', async () => {
		const curator = await c.curator();
		const [{ id: recipeId }] = await c.actors.db.admin<{ id: string }[]>`
			insert into app.recipes (slug, name, description) values (${'imp-' + crypto.randomUUID().slice(0, 8)},
				${c.actors.db.admin.json({ 'it-IT': 'Importata', 'en-GB': '' })}, ${c.actors.db.admin.json({ 'it-IT': '', 'en-GB': '' })}) returning id`;
		const content = draftContent('Importata', { ingredients: [{ ingredientId: null, variety: null, preparation: null,
			quantity: { kind: 'amount', value: null, unit: 'g' }, sourceText: 'farina q.b.', isOptional: false, isPrimary: false }] } as never);
		const [{ id: draftId }] = await c.actors.db.admin<{ id: string }[]>`
			insert into app.recipe_drafts (recipe_id, kind, content, revision) values (${recipeId}, 'new', ${c.actors.db.admin.json(content as never)}, 1) returning id`;
		const view = await curator.client.catalogue.getDraft({ draftId });
		expect(view.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'required' });
		expect(view.missing).toContain('ingredients');
		expect(view.canDiscard).toBe(true);
		const { drafts } = await curator.client.catalogue.overview({});
		expect(drafts.find((d) => d.draftId === draftId)).toMatchObject({ kind: 'new', name: 'Importata' });
	});

	it('answers not_found for an unknown draft', async () => {
		const curator = await c.curator();
		expect((await errorOf(curator.client.catalogue.getDraft({ draftId: crypto.randomUUID() }))).code).toBe('not_found');
	});
});
```

- [ ] **Step 3: eseguire** `TEST_DATABASE_URL=… npm test -w server -- catalogue/read` → FAIL.

- [ ] **Step 4: caricamenti**

```ts
// server/src/catalogue/load.ts
import { recipeDraftSchema, type CatalogueLookup, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import type { UnitEquivalenceRow } from './convert.ts';

export interface DraftRow {
	id: string; recipeId: string; kind: 'new' | 'revision'; baseVersion: number | null;
	content: RecipeDraftDocument; revision: number;
	createdBy: string | null; createdAt: Date; updatedBy: string | null; updatedAt: Date;
	closedAt: Date | null; closedBy: string | null; outcome: 'published' | 'discarded' | null;
	recipeStatus: 'draft' | 'published' | 'archived'; recipeVersion: number;
}

/** A stored draft may come from the import or an older server: parsed loosely, problems come from the checks. */
const parseContent = (content: unknown): RecipeDraftDocument => {
	const parsed = recipeDraftSchema.safeParse(content);
	return parsed.success ? parsed.data : (content as RecipeDraftDocument);
};

export async function loadDraftRow(tx: Tx, draftId: string, options: { lock?: boolean } = {}): Promise<DraftRow | null> {
	const rows = options.lock
		? await tx`select d.*, r.status, r.version as recipe_version from app.recipe_drafts d join app.recipes r on r.id = d.recipe_id
			where d.id = ${draftId} for update of d, r`
		: await tx`select d.*, r.status, r.version as recipe_version from app.recipe_drafts d join app.recipes r on r.id = d.recipe_id
			where d.id = ${draftId}`;
	const row = rows[0];
	if (!row) return null;
	return {
		id: row.id, recipeId: row.recipe_id, kind: row.kind, baseVersion: row.base_version, content: parseContent(row.content),
		revision: row.revision, createdBy: row.created_by, createdAt: row.created_at, updatedBy: row.updated_by, updatedAt: row.updated_at,
		closedAt: row.closed_at, closedBy: row.closed_by, outcome: row.outcome, recipeStatus: row.status, recipeVersion: row.recipe_version,
	};
}

const ids = (values: (string | null | undefined)[]) => JSON.stringify([...new Set(values.filter((v): v is string => !!v))]);

/** Facts the domain checks need about the ingredients and the book the document cites. */
export async function loadLookup(tx: Tx, document: RecipeDraftDocument): Promise<CatalogueLookup> {
	const ingredientIds = ids((document.ingredients ?? []).map((l) => l.ingredientId));
	const ingredients = await tx<{ id: string; english: string }[]>`
		select i.id, coalesce(i.name ->> 'en-GB', '') as english from app.ingredients i
		where i.archived_at is null and i.id::text in (select jsonb_array_elements_text(${ingredientIds}::text::jsonb))`;
	const books = await tx<{ id: string }[]>`
		select b.id from app.books b where b.archived_at is null
			and b.id::text in (select jsonb_array_elements_text(${ids([document.bookId])}::text::jsonb))`;
	const known = new Map(ingredients.map((i) => [i.id, i.english.trim() !== '']));
	const bookIds = new Set(books.map((b) => b.id));
	return {
		hasIngredient: (id) => known.has(id),
		ingredientHasEnglishName: (id) => known.get(id) === true,
		hasBook: (id) => bookIds.has(id),
	};
}

export async function loadRecipeEquivalences(tx: Tx, ingredientIds: (string | null)[]): Promise<Map<string, UnitEquivalenceRow[]>> {
	const rows = await tx<{ id: string; ingredient_id: string; from_unit: string; to_unit: string; factor: string; preparation: string | null; source: string }[]>`
		select id, ingredient_id, from_unit, to_unit, factor, preparation, source from app.ingredient_unit_equivalences
		where scope = 'recipe' and ingredient_id::text in (select jsonb_array_elements_text(${ids(ingredientIds)}::text::jsonb))`;
	const map = new Map<string, UnitEquivalenceRow[]>();
	for (const r of rows) {
		const list = map.get(r.ingredient_id) ?? [];
		list.push({ id: r.id, ingredientId: r.ingredient_id, fromUnit: r.from_unit as never, toUnit: r.to_unit as never, factor: Number(r.factor), scope: 'recipe', preparation: r.preparation, source: r.source });
		map.set(r.ingredient_id, list);
	}
	return map;
}

export async function loadAuthors(tx: Tx): Promise<Map<string, string>> {
	const rows = await tx<{ user_id: string; display_name: string }[]>`select user_id, display_name from app.catalogue_author_names()`;
	return new Map(rows.map((r) => [r.user_id, r.display_name]));
}

export async function isCited(tx: Tx, recipeId: string): Promise<boolean> {
	const [row] = await tx<{ cited: boolean }[]>`select app.recipe_is_cited(${recipeId}) as cited`;
	return row?.cited ?? false;
}
```

Gli identificatori passano come testo JSON per `fetch_types: false`, come in
`server/src/recipes/views.ts`. Se le colonne `numeric` arrivano già come numero, togliere
`Number(...)`. I tipi delle righe di Postgres.js seguono il resto del server: dichiarare i
generici delle query senza `any` nel codice definitivo.

- [ ] **Step 5: viste, guida e router**

```ts
// server/src/catalogue/views.ts
import type { ArchivedSummaryView, AuthorView, DraftView, OverviewView } from '@app/contract';
import { checkPublishable, missingData, type RecipeDraftDocument, type ValidationIssue } from '@app/domain/recipe';
import type { Locale } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { loadBookTitlesById, loadIngredientNamesById } from '../recipes/views.ts';
import { applyRecipeConversions, type Conversion } from './convert.ts';
import { isCited, loadAuthors, loadLookup, loadRecipeEquivalences, type DraftRow } from './load.ts';

export const authorOf = (authors: Map<string, string>, userId: string | null): AuthorView => ({ userId, name: userId ? (authors.get(userId) ?? null) : null });

/** The caller's language, otherwise the other one (W6's rule for names of drafts). */
export function localText(text: Partial<Record<Locale, string | null>> | null | undefined, locale: Locale): string {
	const other: Locale = locale === 'it-IT' ? 'en-GB' : 'it-IT';
	return (text?.[locale]?.trim() || text?.[other]?.trim()) ?? '';
}

/** The publication check after the US-cup conversions, as checkDraft and publish run it. */
export async function publicationCheck(tx: Tx, content: RecipeDraftDocument): Promise<{ document: RecipeDraftDocument; issues: ValidationIssue[]; conversions: Conversion[] }> {
	const equivalences = await loadRecipeEquivalences(tx, (content.ingredients ?? []).map((l) => l.ingredientId));
	const { document, conversions } = applyRecipeConversions(content, equivalences);
	return { document, issues: checkPublishable(document, await loadLookup(tx, document)), conversions };
}

export async function draftViewOf(tx: Tx, row: DraftRow, locale: Locale): Promise<DraftView> {
	const [{ issues, conversions }, authors] = await Promise.all([publicationCheck(tx, row.content), loadAuthors(tx)]);
	const ingredientIds = [...new Set((row.content.ingredients ?? []).map((l) => l.ingredientId).filter((id): id is string => !!id))];
	const names = await loadIngredientNamesById(tx, ingredientIds);
	const titles = await loadBookTitlesById(tx, [row.content.bookId ?? null]);
	return {
		draftId: row.id, recipeId: row.recipeId, kind: row.kind, revision: row.revision, content: row.content,
		createdBy: authorOf(authors, row.createdBy), createdAt: row.createdAt.toISOString(),
		updatedBy: authorOf(authors, row.updatedBy), updatedAt: row.updatedAt.toISOString(),
		baseVersion: row.baseVersion, currentVersion: row.recipeVersion, recipeStatus: row.recipeStatus,
		issues, missing: missingData(issues), conversions, outcome: row.outcome,
		canDiscard: row.closedAt === null && (row.kind === 'revision' || !(await isCited(tx, row.recipeId))),
		ingredientNames: Object.fromEntries(ingredientIds.map((id) => [id, localText(names.get(id), locale)])),
		bookTitle: row.content.bookId ? (titles.get(row.content.bookId) ?? null) : null,
	};
}

export async function overview(tx: Tx, locale: Locale): Promise<OverviewView> {
	const drafts = await tx<{ id: string; recipe_id: string; kind: 'new' | 'revision'; content: RecipeDraftDocument; created_by: string | null; updated_by: string | null; updated_at: Date }[]>`
		select id, recipe_id, kind, content, created_by, updated_by, updated_at from app.recipe_drafts where closed_at is null`;
	const archived = await tx<{ id: string; name: Record<Locale, string>; archived_by: string | null; archived_at: Date }[]>`
		select id, name, archived_by, archived_at from app.recipes where status = 'archived'`;
	const authors = await loadAuthors(tx);
	const draftViews = await Promise.all(drafts.map(async (d) => {
		const { issues } = await publicationCheck(tx, d.content);
		return { draftId: d.id, recipeId: d.recipe_id, kind: d.kind, name: localText(d.content.name, locale),
			createdBy: authorOf(authors, d.created_by), updatedBy: authorOf(authors, d.updated_by), updatedAt: d.updated_at.toISOString(), missing: missingData(issues) };
	}));
	draftViews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, locale));
	const archivedViews: ArchivedSummaryView[] = archived
		.map((r) => ({ recipeId: r.id, name: localText(r.name, locale), archivedBy: authorOf(authors, r.archived_by), archivedAt: r.archived_at.toISOString() }))
		.sort((a, b) => a.name.localeCompare(b.name, locale));
	return { drafts: draftViews, archived: archivedViews };
}
```

`overview` chiama `publicationCheck` per bozza: le bozze aperte sono poche (decine al
massimo); se il test di carico del piano generale lo segnala, caricare lookup ed
equivalenze in blocco per tutte le bozze. Le query in `Promise.all` sulla stessa
transazione vanno in sequenza in Postgres.js: va bene.

`guide.ts`: `export const CURATOR_GUIDE = \`...\`` con le tre parti della spec, sezione 3
«Guida». Il testo parte dal prototipo (`prototype/src/lib/operations/curation-guide.ts`) con
queste sostituzioni: `searchCatalogueIngredients` → `catalogue_searchIngredients`,
`createIngredient` → `catalogue_createIngredient`, `getIngredientVarieties` →
`catalogue_listVarieties`, `checkVariety` → `catalogue_checkVariety`, `verifyDraft,
publishDraft` → `catalogue_checkDraft, catalogue_publish`; la sezione «## 6. Before
saving» diventa «## 6. Before saving and publishing» e si aggiungono le due sezioni
iniziali:

```md
# Managing the recipe book as a curator

## Flow
1. Search ingredients (catalogue_searchIngredients) and books (catalogue_listBooks) before creating any.
2. Save a draft early and often (catalogue_createDraft with a new id, then catalogue_saveDraft with the
   revision you last read as baseRevision). Incomplete data is fine; wrong data is refused with codes and paths.
3. Before proposing to publish, run catalogue_checkDraft and ask targeted questions for every problem.
4. Show the curator the complete card, translations included, and publish (catalogue_publish) only after an
   explicit yes.
5. conflict of kind "draft": another curator saved meanwhile. Show their version (theirs) and the fields each
   of you changed; either take theirs (read the draft again) or overwrite it by saving again with
   overwriteRevision set to their revision.
6. conflict of kind "version": the recipe got a newer version after the revision started. Tell the curator and
   publish again with confirmVersion only if they confirm.
7. To restore an older version (catalogue_restoreVersion) show it first (catalogue_getVersion) and pass the
   current version you saw as confirmVersion.

## What publishing requires
- Name and description in Italian and British English; duration; base servings.
- Source: web or youtube need the address; book needs the book and pages; home needs nothing else; fields not
  relevant to the type stay empty.
- Planner attributes: mealType, proteinGroup, carbohydrateGroup, category, isFreshFish, hasVegetables, isHeavy
  (seasons and the primary ingredient are optional).
- At least one ingredient line; each with an amount and a publishable unit, "to taste" when the source says so,
  or a quantity in words in both languages; variety and preparation in both languages when present.
- US cups are converted by the ingredient's recipe equivalence (catalogue_setEquivalence, with the source of
  the figure); a cup without an equivalence cannot be published.
```

`router.ts`:

```ts
// server/src/catalogue/router.ts
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { CURATOR_GUIDE } from './guide.ts';
import { loadDraftRow } from './load.ts';
import { draftViewOf, overview } from './views.ts';

export function catalogueRouter(os: Implementer) {
	return {
		getGuide: os.catalogue.getGuide.handler(() => ({ guide: CURATOR_GUIDE })),
		overview: os.catalogue.overview.handler(({ context }) => overview(context.tx, context.locale)),
		getDraft: os.catalogue.getDraft.handler(async ({ context, input }) => {
			const row = await loadDraftRow(context.tx, input.draftId);
			if (!row) throw appError('not_found');
			return draftViewOf(context.tx, row, context.locale);
		}),
		...draftHandlers(os),       // Task 6
		...publicationHandlers(os), // Task 7
		...recipeHandlers(os),      // Task 8
		...ingredientHandlers(os),  // Task 9
	};
}
```

Finché i gruppi delle attività 6-9 non esistono, i loro gestori stanno nello stesso file
come gestori che lanciano `appError('not_found')` con il commento `// Task N`, così il
typecheck passa; ciascuna attività li sostituisce con quelli veri. Il branch non si unisce
prima della fine del Task 10.

In `server/src/router.ts`: `import { catalogueRouter } from './catalogue/router.ts';` e
`catalogue: catalogueRouter(os),` dopo `menu`.

- [ ] **Step 6: eseguire** `TEST_DATABASE_URL=… npm test -w server -- catalogue/ && npm run typecheck` → PASS.
- [ ] **Step 7: commit** — `git commit -m "Gestione del ricettario: guida, panoramica e lettura delle bozze"`

---

### Task 6: bozze (creazione, revisione, salvataggio con conflitti, scarto)

**Files:**
- Create: `server/src/catalogue/write.ts`
- Modify: `server/src/catalogue/router.ts`
- Test: `server/test/catalogue/drafts.test.ts`

**Interfaces:**
- Consumes: Task 3 (`sameDocument`, `changedFields`, `slugify`, `uniqueSlug`), Task 5 (`loadDraftRow`, `loadLookup`, `draftViewOf`, `isCited`, `loadAuthors`).
- Produces (`write.ts`, firme definitive della spec, sezione 1):
  - `type Channel = 'web' | 'mcp' | 'import'`; `interface Actor { userId: string; channel: Channel }`; `actorOf(context: OperationContext): Actor`
  - `CreateDraftInput`, `CreatedDraft { draftId; recipeId; created }`, `SaveDraftInput`, `SavedDraft { draftId; revision }`
  - `createDraft(tx, actor, input: CreateDraftInput): Promise<CreatedDraft>`
  - `startRevision(tx, actor, { recipeId, draftId }): Promise<{ draftId: string }>`
  - `saveDraft(tx, actor, input: SaveDraftInput): Promise<SavedDraft>`
  - `discardDraft(tx, actor, { draftId }): Promise<{ draftId: string; recipeId: string; kind: 'new' | 'revision' }>`
  - `lockCreations(tx): Promise<void>`; `writeInstant(tx): Promise<Date>`

- [ ] **Step 1: test che falliscono**

```ts
// server/test/catalogue/drafts.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { seedPublishedRecipe, seedWeek, grams } from '../support/shopping-fixtures.ts';
import { catalogueActors, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue drafts', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	it('creates a new draft once per id, with the recipe name projected', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const first = await curator.client.catalogue.createDraft({ id, content: draftContent('Zuppa di farro') });
		const again = await curator.client.catalogue.createDraft({ id, content: draftContent('Altro nome') });
		expect(again.draftId).toBe(first.draftId);
		expect(again.revision).toBe(1);
		const [recipe] = await db()`select status, version, name, slug from app.recipes where id = ${first.recipeId}`;
		expect(recipe).toMatchObject({ status: 'draft', version: 0, name: { 'it-IT': 'Zuppa di farro', 'en-GB': '' } });
		expect(recipe.slug).toMatch(/^zuppa-di-farro/);
		const saves = await db()`select revision, channel from app.recipe_draft_saves where draft_id = ${id}`;
		expect(saves).toEqual([{ revision: 1, channel: 'web' }]);
	});

	it('refuses only blocking problems', async () => {
		const curator = await c.curator();
		const bad = await errorOf(curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('X', { durationMinutes: 0 }) }));
		expect(bad.code).toBe('invalid');
		expect(bad.data.issues).toContainEqual({ path: ['content', 'durationMinutes'], code: 'not_positive_integer' });
		const ingredientId = await c.ingredient('Ceci');
		const line = { ingredientId, variety: null, preparation: null, quantity: { kind: 'amount', value: null, unit: 'g' }, sourceText: 'ceci', isOptional: false, isPrimary: false };
		const ok = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Doppi', { ingredients: [line, line] } as never) });
		expect(ok.issues.map((i) => i.code)).toContain('duplicate_ingredient');
	});

	it('detects a conflict, overwrites knowingly and keeps the overwritten save', async () => {
		const lucia = await c.curator();
		const marco = await c.curator();
		const draft = await lucia.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Pesto') });
		await marco.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto', { durationMinutes: 10 }) });
		const conflict = await errorOf(lucia.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto genovese') }));
		expect(conflict.code).toBe('conflict');
		expect(conflict.data).toMatchObject({ kind: 'draft', revision: 2, by: marco.userId, theirFields: ['durationMinutes'], myFields: ['name'] });
		expect(conflict.data.theirs.durationMinutes).toBe(10);
		const saved = await lucia.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto genovese'), overwriteRevision: 2 });
		expect(saved.revision).toBe(3);
		const saves = await db()`select revision, overwritten from app.recipe_draft_saves where draft_id = ${draft.draftId} order by revision`;
		expect(saves).toEqual([{ revision: 1, overwritten: false }, { revision: 2, overwritten: true }, { revision: 3, overwritten: false }]);
	});

	it('does not overwrite a save that arrived after the conflict', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const d = await a.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Ragù') });
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Ragù', { durationMinutes: 90 }) });
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 2, content: draftContent('Ragù', { durationMinutes: 120 }) });
		const again = await errorOf(a.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Ragù bolognese'), overwriteRevision: 2 }));
		expect(again.data).toMatchObject({ kind: 'draft', revision: 3 });
	});

	it('treats a repeated save as done, even from the old base revision', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Minestrone') });
		const input = { draftId: d.draftId, baseRevision: 1, content: draftContent('Minestrone', { baseServings: 4 }) };
		const first = await curator.client.catalogue.saveDraft(input);
		const repeat = await curator.client.catalogue.saveDraft(input);
		expect(repeat.revision).toBe(first.revision);
	});

	it('serialises two concurrent saves: one wins, the other gets a conflict', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const d = await a.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Polenta') });
		const results = await Promise.allSettled([
			a.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Polenta A') }),
			b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Polenta B') }),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(rejected.reason.code).toBe('conflict');
	});

	it('opens one revision per published recipe and reuses it', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Riso');
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Risotto', baseServings: 2, lines: [{ ingredientId, quantity: grams(160) }] });
		const first = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		const second = await (await c.curator()).client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		expect(second.draftId).toBe(first.draftId);
		expect(first).toMatchObject({ kind: 'revision', baseVersion: 1, currentVersion: 1 });
		expect(first.content.name).toEqual({ 'it-IT': 'Risotto', 'en-GB': 'Risotto (en)' });
		const draftRecipe = (await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Mai') })).recipeId;
		expect((await errorOf(curator.client.catalogue.startRevision({ recipeId: draftRecipe, id: crypto.randomUUID() }))).data).toEqual({ reason: 'not_published' });
	});

	it('creates once when the same id arrives twice at the same time', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const [a, b] = await Promise.all([
			curator.client.catalogue.createDraft({ id, content: draftContent('Parallela') }),
			curator.client.catalogue.createDraft({ id, content: draftContent('Parallela') }),
		]);
		expect(a.recipeId).toBe(b.recipeId);
		expect(await db()`select count(*)::int as n from app.recipe_drafts where id = ${id}`).toEqual([{ n: 1 }]);
	});

	it('gives different slugs to two new recipes with the same name created at the same time', async () => {
		const curator = await c.curator();
		const name = `Gemelle ${crypto.randomUUID().slice(0, 4)}`;
		const [a, b] = await Promise.all([1, 2].map(() => curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent(name) })));
		const slugs = await db()`select slug from app.recipes where id in (${a!.recipeId}, ${b!.recipeId}) order by slug`;
		expect(new Set(slugs.map((r) => r.slug)).size).toBe(2);
	});

	it('answers a repeated startRevision after its draft was published or discarded', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Farro');
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Farrotto', baseServings: 2, lines: [{ ingredientId, quantity: grams(160) }] });
		const id = crypto.randomUUID();
		const first = await curator.client.catalogue.startRevision({ recipeId, id });
		await curator.client.catalogue.discardDraft({ draftId: first.draftId });
		const repeat = await curator.client.catalogue.startRevision({ recipeId, id });
		expect(repeat).toMatchObject({ draftId: id, outcome: 'discarded' });
		const next = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		expect(next.draftId).not.toBe(id);
		expect((await curator.client.catalogue.startRevision({ recipeId, id })).draftId).toBe(id); // still the old creation
	});

	it('discards a revision, and a new draft only when no meal cites it', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Da scartare') });
		expect(await curator.client.catalogue.discardDraft({ draftId: d.draftId })).toEqual({ draftId: d.draftId, recipeId: d.recipeId, kind: 'new' });
		expect(await curator.client.catalogue.discardDraft({ draftId: d.draftId })).toMatchObject({ kind: 'new' }); // repeat
		const [closed] = await db()`select outcome from app.recipe_drafts where id = ${d.draftId}`;
		expect(closed.outcome).toBe('discarded');
		expect((await curator.client.catalogue.overview({})).drafts.some((x) => x.draftId === d.draftId)).toBe(false);

		const cited = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Citata') });
		const other = await c.actors.user();
		const familyId = await c.actors.db.createFamily([{ userId: other.userId, role: 'family_admin' }]);
		await seedWeek(c.actors.db, familyId, '2026-09-28', [{ date: '2026-09-28', mealType: 'dinner', recipeId: cited.recipeId, servings: 2 }]);
		expect((await curator.client.catalogue.getDraft({ draftId: cited.draftId })).canDiscard).toBe(false);
		expect((await errorOf(curator.client.catalogue.discardDraft({ draftId: cited.draftId }))).data).toEqual({ reason: 'cited_by_meals' });
	});

	it('bumps the counter of a family whose meal cites the new draft when its name changes', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Vecchio nome') });
		const other = await c.actors.user();
		const familyId = await c.actors.db.createFamily([{ userId: other.userId, role: 'family_admin' }]);
		await seedWeek(c.actors.db, familyId, '2026-09-28', [{ date: '2026-09-29', mealType: 'lunch', recipeId: d.recipeId, servings: 2 }]);
		const [before] = await db()`select data_version from app.families where id = ${familyId}`;
		await curator.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Nuovo nome') });
		const [after] = await db()`select data_version from app.families where id = ${familyId}`;
		expect(Number(after.data_version)).toBeGreaterThan(Number(before.data_version));
	});
});
```

`seedWeek` inserisce con l'utente amministratore del database: il trigger che vieta di
collegare bozze ai pasti vale solo per `authenticated`, quindi qui il pasto si crea come
farebbe l'import.

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: implementazione delle scritture**

```ts
// server/src/catalogue/write.ts
import { blocksDraft, checkDraft, cleanDraft, projectDraftNames, recipeDraftSchema, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import { changedFields, sameDocument } from './fields.ts';
import { isCited, loadAuthors, loadDraftRow, loadLookup } from './load.ts';
import { slugify, uniqueSlug } from './slug.ts';

export type Channel = 'web' | 'mcp' | 'import';
/** Who writes and through which channel; the instant comes from the database (writeInstant). */
export interface Actor { userId: string; channel: Channel }
export const actorOf = (context: OperationContext): Actor => ({ userId: context.userId, channel: context.channel });

export interface CreateDraftInput { draftId: string; content: RecipeDraftDocument; originSlug?: string | null; originType?: string | null }
export interface CreatedDraft { draftId: string; recipeId: string; created: boolean }
export interface SaveDraftInput { draftId: string; baseRevision: number; content: RecipeDraftDocument; overwriteRevision?: number }
export interface SavedDraft { draftId: string; revision: number }

/**
 * Creations of the catalogue wait for one another (few curators): the same id twice, or two
 * names giving the same slug, never race into a unique violation.
 */
export async function lockCreations(tx: Tx): Promise<void> {
	await tx`select pg_advisory_xact_lock(hashtext('app.catalogue_create'))`;
}

/** The instant of the writes, read after the locks: a wait never backdates a version (R1). */
export async function writeInstant(tx: Tx): Promise<Date> {
	const [row] = await tx<{ at: Date }[]>`select clock_timestamp() as at`;
	return row!.at;
}

/** Trimmed, then checked as a draft: only wrong data is refused (spec section 8). */
async function cleanAndCheck(tx: Tx, content: RecipeDraftDocument, path: string[] = ['content']): Promise<RecipeDraftDocument> {
	const parsed = recipeDraftSchema.safeParse(content);
	const cleaned = parsed.success ? cleanDraft(parsed.data) : content;
	const blocking = checkDraft(cleaned, await loadLookup(tx, cleaned)).filter(blocksDraft);
	if (blocking.length) throw appError('invalid', { issues: blocking.map((i) => ({ path: [...path, ...i.path], code: i.code })) });
	return cleaned;
}

const recipeSlug = (tx: Tx, content: RecipeDraftDocument) =>
	uniqueSlug(slugify(content.name?.['it-IT'] || content.name?.['en-GB'] || '', 'recipe'), async (s) => (await tx`select 1 from app.recipes where slug = ${s}`).length > 0);

async function addSave(tx: Tx, actor: Actor, at: Date, draftId: string, revision: number, content: RecipeDraftDocument) {
	await tx`insert into app.recipe_draft_saves (draft_id, revision, content, saved_by, saved_at, channel)
		values (${draftId}, ${revision}, ${tx.json(content as never)}, ${actor.userId}, ${at}, ${actor.channel})`;
}

export async function createDraft(tx: Tx, actor: Actor, input: CreateDraftInput): Promise<CreatedDraft> {
	await lockCreations(tx);
	const [same] = await tx<{ recipe_id: string }[]>`select recipe_id from app.recipe_drafts where id = ${input.draftId}`;
	if (same) return { draftId: input.draftId, recipeId: same.recipe_id, created: false };
	if (input.originSlug) {
		const [known] = await tx<{ recipe_id: string; draft_id: string | null }[]>`
			select r.id as recipe_id, (select d.id from app.recipe_drafts d where d.recipe_id = r.id order by d.created_at desc limit 1) as draft_id
			from app.recipes r where r.origin_slug = ${input.originSlug}`;
		if (known?.draft_id) return { draftId: known.draft_id, recipeId: known.recipe_id, created: false };
		if (known) throw appError('invalid', { issues: [{ path: ['originSlug'], code: 'invalid_value' }] });
	}
	const content = await cleanAndCheck(tx, input.content);
	const names = projectDraftNames(content);
	const at = await writeInstant(tx);
	const [{ id: recipeId }] = await tx<{ id: string }[]>`
		insert into app.recipes (slug, origin_slug, origin_type, name, description, created_by, created_at, updated_by, updated_at)
		values (${await recipeSlug(tx, content)}, ${input.originSlug ?? null}, ${input.originType ?? null}, ${tx.json(names.name)}, ${tx.json(names.description)},
			${actor.userId}, ${at}, ${actor.userId}, ${at})
		returning id`;
	await tx`insert into app.recipe_drafts (id, recipe_id, kind, content, revision, created_by, created_at, updated_by, updated_at)
		values (${input.draftId}, ${recipeId}, 'new', ${tx.json(content as never)}, 1, ${actor.userId}, ${at}, ${actor.userId}, ${at})`;
	await addSave(tx, actor, at, input.draftId, 1, content);
	return { draftId: input.draftId, recipeId, created: true };
}

/** Order of the spec (section 3): the creation already made, then the recipe, then the open revision. */
export async function startRevision(tx: Tx, actor: Actor, input: { recipeId: string; draftId: string }) {
	await lockCreations(tx);
	const [same] = await tx<{ recipe_id: string }[]>`select recipe_id from app.recipe_drafts where id = ${input.draftId}`;
	if (same) {
		if (same.recipe_id !== input.recipeId) throw appError('invalid', { issues: [{ path: ['id'], code: 'invalid_value' }] });
		return { draftId: input.draftId };
	}
	const [recipe] = await tx<{ status: string; version: number }[]>`select status, version from app.recipes where id = ${input.recipeId} for update`;
	if (!recipe) throw appError('not_found');
	if (recipe.status === 'draft') throw appError('not_allowed', { reason: 'not_published' });
	const [open] = await tx<{ id: string }[]>`select id from app.recipe_drafts where recipe_id = ${input.recipeId} and closed_at is null`;
	if (open) return { draftId: open.id };
	const [current] = await tx<{ content: RecipeDraftDocument }[]>`
		select content from app.recipe_versions where recipe_id = ${input.recipeId} and version = ${recipe.version}`;
	if (!current) throw appError('not_found');
	const at = await writeInstant(tx);
	await tx`insert into app.recipe_drafts (id, recipe_id, kind, base_version, content, revision, created_by, created_at, updated_by, updated_at)
		values (${input.draftId}, ${input.recipeId}, 'revision', ${recipe.version}, ${tx.json(current.content as never)}, 1,
			${actor.userId}, ${at}, ${actor.userId}, ${at})`;
	await addSave(tx, actor, at, input.draftId, 1, current.content);
	return { draftId: input.draftId };
}

export async function saveDraft(tx: Tx, actor: Actor, input: SaveDraftInput): Promise<SavedDraft> {
	const row = await loadDraftRow(tx, input.draftId, { lock: true });
	if (!row) throw appError('not_found');
	const content = await cleanAndCheck(tx, input.content);
	// A repeated request (lost answer): the last save already holds this content.
	if (sameDocument(row.content, content)) return { draftId: row.id, revision: row.revision };
	if (row.closedAt) throw appError('not_found');
	if (input.baseRevision > row.revision) throw appError('invalid', { issues: [{ path: ['baseRevision'], code: 'invalid_value' }] });
	if (input.baseRevision < row.revision && input.overwriteRevision !== row.revision) {
		const [base] = await tx<{ content: RecipeDraftDocument }[]>`
			select content from app.recipe_draft_saves where draft_id = ${row.id} and revision = ${input.baseRevision}`;
		const from = base?.content ?? row.content;
		const authors = await loadAuthors(tx);
		throw appError('conflict', {
			kind: 'draft', revision: row.revision, by: row.updatedBy, byName: row.updatedBy ? (authors.get(row.updatedBy) ?? null) : null,
			at: row.updatedAt.toISOString(), theirFields: changedFields(from, row.content), myFields: changedFields(from, content), theirs: row.content,
		});
	}
	const revision = row.revision + 1;
	const at = await writeInstant(tx);
	if (input.baseRevision < row.revision) {
		await tx`update app.recipe_draft_saves set overwritten = true
			where draft_id = ${row.id} and revision > ${input.baseRevision} and revision <= ${row.revision}`;
	}
	await tx`update app.recipe_drafts set content = ${tx.json(content as never)}, revision = ${revision}, updated_by = ${actor.userId}, updated_at = ${at}
		where id = ${row.id}`;
	await addSave(tx, actor, at, row.id, revision, content);
	if (row.kind === 'new') {
		const names = projectDraftNames(content);
		await tx`update app.recipes set name = ${tx.json(names.name)}, description = ${tx.json(names.description)}, updated_by = ${actor.userId}, updated_at = ${at}
			where id = ${row.recipeId}`;
	}
	return { draftId: row.id, revision };
}

export async function discardDraft(tx: Tx, actor: Actor, input: { draftId: string }) {
	const row = await loadDraftRow(tx, input.draftId, { lock: true });
	if (!row) throw appError('not_found');
	const answer = { draftId: row.id, recipeId: row.recipeId, kind: row.kind };
	if (row.outcome === 'discarded') return answer;
	if (row.closedAt) throw appError('not_found');
	if (row.kind === 'new' && (await isCited(tx, row.recipeId))) throw appError('not_allowed', { reason: 'cited_by_meals' });
	const at = await writeInstant(tx);
	await tx`update app.recipe_drafts set closed_at = ${at}, closed_by = ${actor.userId}, outcome = 'discarded' where id = ${row.id}`;
	return answer;
}
```

Note per l'implementatore:
- I percorsi degli `issues` di `invalid` partono da `['content', ...]`, come quelli che
  oRPC produce per la validazione dello schema del contratto. Se `recipeDraftSchema`
  rifiuta già `durationMinutes: 0` prima del gestore, il codice sarà quello normalizzato
  da `normalizeError` invece di `not_positive_integer`: in quel caso il test controlla il
  percorso e il codice osservato, con un commento che spiega da dove viene.
- `sameDocument(row.content, content)` deve venire prima del conflitto (ripetizione dopo
  il successo con la base vecchia, Review Focus 1) ma dopo la pulizia, così due invii che
  differiscono solo per spazi sono la stessa cosa.
- Il conflitto con due salvataggi concorrenti: il secondo attende il `for update` del
  primo, poi vede `revision = 2` con la base 1 → `conflict`. Ogni richiesta RPC del test
  apre la propria connessione e transazione (`withDb`), quindi la concorrenza è reale; se
  le due finissero in sequenza per caso, il test resta valido (una vince, l'altra ha il
  conflitto).
- Le due creazioni con lo stesso uuid in parallelo: la seconda attende il lucchetto
  consultivo della prima e, dopo il suo commit, la ritrova con una lettura nuova (`read
  committed`: ogni istruzione vede i commit precedenti). Lo stesso vale per lo slug.
- `startRevision` con un uuid di una bozza chiusa risponde con quella bozza: la vista ha
  `outcome` valorizzato, così il client capisce che va aperta una revisione nuova.
- Superato dal Task 10bis: quando `startRevision` riprende una revisione aperta registra
  anche l'associazione richiesta → bozza in `app.recipe_draft_requests`, e il primo passo
  la cerca insieme alla bozza con lo stesso `id`.

Gestori nel router:

```ts
function draftHandlers(os: Implementer) {
	const view = async (context: OperationContext, draftId: string) => {
		const row = await loadDraftRow(context.tx, draftId);
		if (!row) throw appError('not_found');
		return draftViewOf(context.tx, row, context.locale);
	};
	return {
		createDraft: os.catalogue.createDraft.handler(async ({ context, input }) => {
			const { draftId } = await createDraft(context.tx, actorOf(context), { draftId: input.id, content: input.content });
			return view(context, draftId);
		}),
		startRevision: os.catalogue.startRevision.handler(async ({ context, input }) =>
			view(context, (await startRevision(context.tx, actorOf(context), { recipeId: input.recipeId, draftId: input.id })).draftId)),
		saveDraft: os.catalogue.saveDraft.handler(async ({ context, input }) =>
			view(context, (await saveDraft(context.tx, actorOf(context), input)).draftId)),
		discardDraft: os.catalogue.discardDraft.handler(({ context, input }) => discardDraft(context.tx, actorOf(context), input)),
	};
}
```

- [ ] **Step 4: eseguire** `TEST_DATABASE_URL=… npm test -w server -- catalogue/ && npm run typecheck` → PASS.
- [ ] **Step 5: commit** — `git commit -m "Gestione del ricettario: bozze, revisioni, conflitti e scarto"`

---

### Task 7: controllo e pubblicazione

**Files:**
- Create: `server/src/catalogue/recipe-writes.ts`
- Modify: `server/src/catalogue/write.ts` (`publishDraft`), `server/src/catalogue/router.ts`
- Test: `server/test/catalogue/publish.test.ts`

**Interfaces:**
- Consumes: Task 5 (`publicationCheck`), Task 6 (`Actor`, `loadDraftRow`).
- Produces:
  - `recipe-writes.ts`: `writeVersion(tx, actor, { recipeId, document: RecipeDocument, restoredFrom: number | null }): Promise<{ version: number; at: Date }>` (proiezioni, righe, poi l'istante dopo tutte le attese, poi versione e riga di stato alla prima pubblicazione; restituisce la nuova versione e l'istante, che il chiamante usa per chiudere la bozza); `versionConflict(tx, recipeId, version): Promise<never>`
  - `write.ts`: `PublishInput`, `Published { recipeId; version; publishedAt: Date; conversions }`, `publishDraft(tx, actor, input: PublishInput): Promise<Published>`

- [ ] **Step 1: test che falliscono**

```ts
// server/test/catalogue/publish.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue publication', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	it('publishes a new recipe atomically and answers a repeat with the same version', async () => {
		const curator = await c.curator({ agent: true });
		const ingredientId = await c.ingredient('Lenticchie');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Lenticchie in umido', ingredientId) });
		const published = await curator.client.catalogue.publish({ draftId: d.draftId });
		expect(published).toMatchObject({ recipeId: d.recipeId, version: 1, conversions: [] });
		expect(await curator.client.catalogue.publish({ draftId: d.draftId })).toMatchObject({ version: 1 });
		const [recipe] = await db()`select status, version, duration_minutes, base_servings from app.recipes where id = ${d.recipeId}`;
		expect(recipe).toEqual({ status: 'published', version: 1, duration_minutes: 20, base_servings: 2 });
		expect(await db()`select ingredient_id, quantity::float as quantity, unit from app.recipe_ingredients where recipe_id = ${d.recipeId}`)
			.toEqual([{ ingredient_id: ingredientId, quantity: 200, unit: 'g' }]);
		expect(await db()`select version, channel from app.recipe_versions where recipe_id = ${d.recipeId}`).toEqual([{ version: 1, channel: 'mcp' }]);
		expect(await db()`select status from app.recipe_status_changes where recipe_id = ${d.recipeId}`).toEqual([{ status: 'published' }]);
		expect((await db()`select outcome from app.recipe_drafts where id = ${d.draftId}`)[0].outcome).toBe('published');
	});

	it('refuses an incomplete draft with every problem and writes nothing', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Incompleta') });
		const error = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(error.code).toBe('invalid');
		expect(error.data.issues).toContainEqual({ path: ['name', 'en-GB'], code: 'translation_missing' });
		expect((await db()`select status from app.recipes where id = ${d.recipeId}`)[0].status).toBe('draft');
	});

	it('converts US cups with the recipe equivalence and refuses them without one', async () => {
		const curator = await c.curator();
		const flour = await c.ingredient('Farina');
		const cup = { ingredientId: flour, variety: null, preparation: null, quantity: { kind: 'amount', value: 2, unit: 'us_cup' }, sourceText: '2 cups flour', isOptional: false, isPrimary: false };
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Pane', flour, { ingredients: [cup] } as never) });
		const refused = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(refused.data.issues).toContainEqual({ path: ['ingredients', 0, 'quantity', 'unit'], code: 'unit_not_publishable' });
		await db()`insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (${flour}, 'us_cup', 'g', 120, 'recipe', 'King Arthur')`;
		const check = await curator.client.catalogue.checkDraft({ draftId: d.draftId });
		expect(check.issues).toEqual([]);
		expect(check.conversions[0]?.to).toEqual({ kind: 'amount', value: 240, unit: 'g' });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		const [v] = await db()`select content from app.recipe_versions where recipe_id = ${d.recipeId}`;
		expect(v.content.ingredients[0]).toMatchObject({ quantity: { kind: 'amount', value: 240, unit: 'g' }, sourceText: '2 cups flour' });
		const [draft] = await db()`select content from app.recipe_drafts where id = ${d.draftId}`;
		expect(draft.content.ingredients[0].quantity.unit).toBe('us_cup');
	});

	it('asks to confirm a revision started from a superseded version', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const ingredientId = await c.ingredient('Zucca');
		const d = await a.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Vellutata', ingredientId) });
		await a.client.catalogue.publish({ draftId: d.draftId });
		const revision = await a.client.catalogue.startRevision({ recipeId: d.recipeId, id: crypto.randomUUID() });
		// A version 2 published by b meanwhile, written directly as the fixtures do.
		await db()`update app.recipes set version = 2 where id = ${d.recipeId}`;
		await db()`insert into app.recipe_versions (recipe_id, version, content, published_by, channel)
			select recipe_id, 2, content, ${b.userId}, 'web' from app.recipe_versions where recipe_id = ${d.recipeId} and version = 1`;
		const stale = await errorOf(a.client.catalogue.publish({ draftId: revision.draftId }));
		expect(stale.data).toMatchObject({ kind: 'version', version: 2, by: b.userId });
		expect(await a.client.catalogue.publish({ draftId: revision.draftId, confirmVersion: 2 })).toMatchObject({ version: 3 });
	});

	it('keeps an archived recipe archived when its revision is published', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Bietole');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Erbazzone', ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		await db()`update app.recipes set status = 'archived', archived_at = now() where id = ${d.recipeId}`;
		const revision = await curator.client.catalogue.startRevision({ recipeId: d.recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.publish({ draftId: revision.draftId });
		expect((await db()`select status, version from app.recipes where id = ${d.recipeId}`)[0]).toEqual({ status: 'archived', version: 2 });
	});

	it('reports an ingredient archived after the draft was saved', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Topinambur');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Crema', ingredientId) });
		await db()`update app.ingredients set archived_at = now() where id = ${ingredientId}`;
		const error = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(error.data.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
		expect((await curator.client.catalogue.getDraft({ draftId: d.draftId })).issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
	});

	it('dates the version after the wait for the lock, as R1 reads it', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Ceci neri');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Hummus', ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		const revision = await curator.client.catalogue.startRevision({ recipeId: d.recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: revision.draftId, baseRevision: 1, content: { ...revision.content, durationMinutes: 25 } });
		// Another transaction holds the recipe, as a slow publication would.
		let released!: Date;
		const holder = db().begin(async (sql) => {
			await sql`select 1 from app.recipes where id = ${d.recipeId} for update`;
			await new Promise((resolve) => setTimeout(resolve, 400));
			released = (await sql<{ at: Date }[]>`select clock_timestamp() as at`)[0]!.at;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		const requested = new Date();
		const publication = curator.client.catalogue.publish({ draftId: revision.draftId });
		await holder;
		expect((await publication).version).toBe(2);
		const [v2] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${d.recipeId} and version = 2`;
		expect(v2!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		// The real R1 resolver: a meal that became past while the publication waited keeps version 1.
		const during = new Date((requested.getTime() + released.getTime()) / 2);
		expect(await db()`select app.recipe_version_at(${d.recipeId}, ${during}) as v`).toEqual([{ v: 1 }]);
		expect(await db()`select app.recipe_version_at(${d.recipeId}, ${v2!.published_at}) as v`).toEqual([{ v: 2 }]);
	});

	it('dates the version after a wait for the catalogue counter held by another writer', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Fave');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Macco di fave', ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		const revision = await curator.client.catalogue.startRevision({ recipeId: d.recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: revision.draftId, baseRevision: 1, content: { ...revision.content, durationMinutes: 40 } });
		// Another curator changing another ingredient holds the global counter row until commit.
		let released!: Date;
		const holder = db().begin(async (sql) => {
			await sql`select version from app.catalogue_state for update`;
			await new Promise((resolve) => setTimeout(resolve, 400));
			released = (await sql<{ at: Date }[]>`select clock_timestamp() as at`)[0]!.at;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		const requested = new Date();
		const publication = curator.client.catalogue.publish({ draftId: revision.draftId });
		await holder;
		expect((await publication).version).toBe(2);
		const [v2] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${d.recipeId} and version = 2`;
		expect(v2!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		const during = new Date((requested.getTime() + released.getTime()) / 2);
		expect(await db()`select app.recipe_version_at(${d.recipeId}, ${during}) as v`).toEqual([{ v: 1 }]);
		const [closed] = await db()<{ closed_at: Date }[]>`select closed_at from app.recipe_drafts where id = ${revision.draftId}`;
		expect(closed!.closed_at.getTime()).toBe(v2!.published_at.getTime()); // the repeat recognises the version by this instant
	});

	it('leaves nothing behind when a write fails halfway', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Orzo');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Orzotto', ingredientId) });
		// A failure after the recipe row is updated: a trigger on the lines, created for this test only.
		await db().unsafe(`create function app.test_fail() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
		await db().unsafe(`create trigger test_fail before insert on app.recipe_ingredients for each row
			when (new.recipe_id = '${d.recipeId}'::uuid) execute function app.test_fail()`);
		try {
			expect((await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }))).code).toBe('internal');
		} finally {
			await db()`drop trigger test_fail on app.recipe_ingredients`;
			await db()`drop function app.test_fail()`;
		}
		expect((await db()`select status, version from app.recipes where id = ${d.recipeId}`)[0]).toEqual({ status: 'draft', version: 0 });
		expect(await db()`select 1 from app.recipe_versions where recipe_id = ${d.recipeId}`).toEqual([]);
		expect((await db()`select closed_at from app.recipe_drafts where id = ${d.draftId}`)[0].closed_at).toBeNull();
	});
});
```

Il trigger del test usa `unsafe` perché Postgres non accetta parametri nei DDL; l'id è un
uuid generato dal server. Il trigger è nello schema `app` solo per la durata del test, che
gira con `fileParallelism: false`.

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: implementazione**

```ts
// server/src/catalogue/recipe-writes.ts
import { projectRecipe, type RecipeDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { loadAuthors } from './load.ts';
import type { Actor } from './write.ts';

/** Projections, lines, the immutable version and the first status change, in the caller's transaction. */
export async function writeVersion(tx: Tx, actor: Actor, input: { recipeId: string; document: RecipeDocument; restoredFrom: number | null }): Promise<{ version: number; at: Date }> {
	const [recipe] = await tx<{ status: string; version: number }[]>`select status, version from app.recipes where id = ${input.recipeId} for update`;
	if (!recipe) throw appError('not_found');
	const version = recipe.version + 1;
	const { recipe: p, ingredients } = projectRecipe(input.document);
	const status = recipe.status === 'draft' ? 'published' : recipe.status;
	// The projections bump catalogue_state through its trigger: this may wait for another writer.
	await tx`update app.recipes set
		status = ${status}, version = ${version}, name = ${tx.json(p.name)}, description = ${tx.json(p.description)},
		source_type = ${p.sourceType}, source_url = ${p.sourceUrl}, book_id = ${p.bookId}, book_pages = ${p.bookPages},
		duration_minutes = ${p.durationMinutes}, base_servings = ${p.baseServings}, meal_type = ${p.mealType},
		protein_group = ${p.proteinGroup}, is_fresh_fish = ${p.isFreshFish}, carbohydrate_group = ${p.carbohydrateGroup},
		category = ${p.category}, has_vegetables = ${p.hasVegetables}, is_heavy = ${p.isHeavy}, seasons = ${p.seasons},
		updated_by = ${actor.userId}, updated_at = clock_timestamp()
		where id = ${input.recipeId}`;
	await tx`delete from app.recipe_ingredients where recipe_id = ${input.recipeId}`;
	for (const l of ingredients) {
		await tx`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit,
			quantity_text, source_text, preparation, is_optional, is_primary)
			values (${input.recipeId}, ${l.position}, ${l.ingredientId}, ${l.variety ? tx.json(l.variety) : null}, ${l.varietyKey}, ${l.quantityKind},
				${l.quantity}, ${l.unit}, ${l.quantityText ? tx.json(l.quantityText) : null}, ${l.sourceText}, ${l.preparation ? tx.json(l.preparation) : null},
				${l.isOptional}, ${l.isPrimary})`;
	}
	// After every wait (locks, catalogue counter): the instant R1 compares with meals (spec section 3).
	const at = await writeInstant(tx);
	await tx`insert into app.recipe_versions (recipe_id, version, content, published_by, published_at, channel, restored_from)
		values (${input.recipeId}, ${version}, ${tx.json(input.document as never)}, ${actor.userId}, ${at}, ${actor.channel}, ${input.restoredFrom})`;
	if (recipe.status === 'draft') {
		await tx`insert into app.recipe_status_changes (recipe_id, status, changed_by, changed_at, channel)
			values (${input.recipeId}, 'published', ${actor.userId}, ${at}, ${actor.channel})`;
	}
	return { version, at };
}

/** The current version was published after the one the curator saw. */
export async function versionConflict(tx: Tx, recipeId: string, version: number): Promise<never> {
	const [v] = await tx<{ published_by: string | null; published_at: Date }[]>`
		select published_by, published_at from app.recipe_versions where recipe_id = ${recipeId} and version = ${version}`;
	const authors = await loadAuthors(tx);
	throw appError('conflict', {
		kind: 'version', version, by: v?.published_by ?? null, byName: v?.published_by ? (authors.get(v.published_by) ?? null) : null,
		at: (v?.published_at ?? new Date(0)).toISOString(),
	});
}
```

Se i nomi dei campi di `RecipeProjection` (`projectRecipe` di W3) differiscono da quelli
scritti sopra, usare quelli di `domain/src/recipe/projection.ts`. Le colonne jsonb nulle si
scrivono come `null`, non `tx.json(null)`.

In `write.ts`:

```ts
export interface PublishInput { draftId: string; confirmVersion?: number }
export interface Published { recipeId: string; version: number; publishedAt: Date; conversions: Conversion[] }

export async function publishDraft(tx: Tx, actor: Actor, input: PublishInput): Promise<Published> {
	const row = await loadDraftRow(tx, input.draftId, { lock: true }); // locks the draft and its recipe
	if (!row) throw appError('not_found');
	if (row.outcome === 'published') {
		// Repeat after a lost answer: the version written when the draft was closed (same instant).
		const [v] = await tx<{ version: number; published_at: Date }[]>`select version, published_at from app.recipe_versions
			where recipe_id = ${row.recipeId} and published_at = ${row.closedAt} and published_by is not distinct from ${row.closedBy}
			order by version desc limit 1`;
		if (v) return { recipeId: row.recipeId, version: v.version, publishedAt: v.published_at, conversions: [] };
	}
	if (row.closedAt) throw appError('not_found');
	const { document, issues, conversions } = await publicationCheck(tx, row.content);
	if (issues.length) throw appError('invalid', { issues });
	if (row.kind === 'revision' && row.recipeVersion !== row.baseVersion && input.confirmVersion !== row.recipeVersion) {
		await versionConflict(tx, row.recipeId, row.recipeVersion);
	}
	const { version, at } = await writeVersion(tx, actor, { recipeId: row.recipeId, document: toPublished(document), restoredFrom: null });
	await tx`update app.recipe_drafts set closed_at = ${at}, closed_by = ${actor.userId}, outcome = 'published' where id = ${row.id}`;
	return { recipeId: row.recipeId, version, publishedAt: at, conversions };
}
```

(`toPublished` da `@app/domain/recipe`, `publicationCheck` da `./views.ts`; per evitare un
import circolare fra `views.ts` e `write.ts`, spostare `publicationCheck` in
`server/src/catalogue/check.ts` e importarla da entrambi.)

La ripetizione restituisce `conversions: []` perché la risposta originale è persa e le
conversioni sono già nel documento pubblicato: documentarlo nel `summary` non serve,
basta il commento nel codice.

Gestori:

```ts
function publicationHandlers(os: Implementer) {
	return {
		checkDraft: os.catalogue.checkDraft.handler(async ({ context, input }) => {
			const row = await loadDraftRow(context.tx, input.draftId);
			if (!row) throw appError('not_found');
			const { issues, conversions } = await publicationCheck(context.tx, row.content);
			return { revision: row.revision, issues, missing: missingData(issues), conversions };
		}),
		publish: os.catalogue.publish.handler(async ({ context, input }) => {
			const { recipeId, version, conversions } = await publishDraft(context.tx, actorOf(context), input);
			return { recipeId, version, conversions };
		}),
	};
}
```

- [ ] **Step 4: eseguire** → PASS; anche i test del ricettario di W6 e della spesa
  (`npm test -w server`) restano verdi.
- [ ] **Step 5: commit** — `git commit -m "Gestione del ricettario: controllo e pubblicazione con le conversioni delle tazze"`

---

### Task 8: ricerca globale, archiviazione, versioni e ripristino

**Files:**
- Modify: `server/src/catalogue/router.ts`, `server/src/catalogue/views.ts`, `server/src/catalogue/write.ts`
- Test: `server/test/catalogue/recipes.test.ts`

**Interfaces:**
- Consumes: Task 7 (`writeVersion`, `versionConflict`).
- Produces: `setArchived(tx, actor, { recipeId, archived })`, `restoreVersion(tx, actor, { recipeId, version, confirmVersion })` in `write.ts`; `searchCatalogueRecipes(tx, { text, status }, locale)`, `versionList(tx, recipeId, locale)`, `versionDetail(tx, recipeId, version, locale)` in `views.ts`.

- [ ] **Step 1: test che falliscono**

```ts
// server/test/catalogue/recipes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('archive, versions and restore', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	async function published(name: string) {
		const curator = await c.curator();
		const ingredientId = await c.ingredient(`${name} ingrediente`);
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent(name, ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		return { curator, recipeId: d.recipeId, ingredientId };
	}

	it('lets a curator without a family find a recipe by name and go on to revise it', async () => {
		const { recipeId } = await published('Pappa al pomodoro');
		await published('Ribollita');
		const archived = await published('Panzanella');
		await db()`update app.recipes set status = 'archived', archived_at = now() where id = ${archived.recipeId}`;
		const fresh = await c.curator(); // new session, no family, no ids kept
		await fresh.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Pappa in bozza') });
		const found = await fresh.client.catalogue.searchRecipes({ text: 'pappa' });
		if (found.unchanged) throw new Error('expected data');
		expect(found.data.items).toEqual([expect.objectContaining({ recipeId, name: 'Pappa al pomodoro', status: 'published', version: 1 })]);
		const onlyArchived = await fresh.client.catalogue.searchRecipes({ text: 'panz', status: 'archived' });
		if (onlyArchived.unchanged) throw new Error('expected data');
		expect(onlyArchived.data.items.map((i) => i.recipeId)).toEqual([archived.recipeId]);
		const versions = await fresh.client.catalogue.listVersions({ recipeId });
		expect(versions.unchanged).toBe(false);
		expect((await fresh.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() })).kind).toBe('revision');
	});

	it('archives and brings back with absolute state', async () => {
		const { curator, recipeId } = await published('Gnocchi');
		expect(await curator.client.catalogue.setArchived({ recipeId, archived: true })).toMatchObject({ status: 'archived', changedBy: { userId: curator.userId } });
		await curator.client.catalogue.setArchived({ recipeId, archived: true });
		expect((await curator.client.catalogue.overview({})).archived.some((a) => a.recipeId === recipeId)).toBe(true);
		await curator.client.catalogue.setArchived({ recipeId, archived: false });
		expect(await db()`select status from app.recipe_status_changes where recipe_id = ${recipeId} order by changed_at, id`)
			.toEqual([{ status: 'published' }, { status: 'archived' }, { status: 'published' }]);
		const draft = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Mai pubblicata') });
		expect((await errorOf(curator.client.catalogue.setArchived({ recipeId: draft.recipeId, archived: true }))).data).toEqual({ reason: 'not_published' });
	});

	it('lists versions and opens one as it was', async () => {
		const { curator, recipeId } = await published('Frittata');
		const rev = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: rev.draftId, baseRevision: 1, content: { ...rev.content, durationMinutes: 15 } });
		await curator.client.catalogue.publish({ draftId: rev.draftId });
		const list = await curator.client.catalogue.listVersions({ recipeId });
		if (list.unchanged) throw new Error('expected data');
		expect(list.data.versions.map((v) => v.version)).toEqual([2, 1]);
		const again = await curator.client.catalogue.listVersions({ recipeId, knownVersion: list.version });
		expect(again.unchanged).toBe(true);
		const v1 = await curator.client.catalogue.getVersion({ recipeId, version: 1 });
		if (v1.unchanged) throw new Error('expected data');
		expect(v1.data.content.durationMinutes).toBe(20);
		expect(v1.data.issues).toEqual([]);
		expect(v1.data.ingredients[0]?.amount).toBeTruthy();
	});

	it('restores a version as a new one, once, after confirmation', async () => {
		const { curator, recipeId } = await published('Torta salata');
		const rev = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: rev.draftId, baseRevision: 1, content: { ...rev.content, baseServings: 6 } });
		await curator.client.catalogue.publish({ draftId: rev.draftId });
		expect((await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 1 }))).data).toMatchObject({ kind: 'version', version: 2 });
		const restored = await curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 });
		expect(restored).toEqual({ recipeId, version: 3, restoredFrom: 1 });
		expect(await curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 })).toEqual(restored); // repeat
		expect((await db()`select base_servings from app.recipes where id = ${recipeId}`)[0].base_servings).toBe(2);
		expect((await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 3, confirmVersion: 3 }))).data).toEqual({ reason: 'already_current' });
	});

	it('dates a restore after a wait for the catalogue counter', async () => {
		const { curator, recipeId } = await published('Canederli');
		const rev = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: rev.draftId, baseRevision: 1, content: { ...rev.content, baseServings: 4 } });
		await curator.client.catalogue.publish({ draftId: rev.draftId });
		let released!: Date;
		const holder = db().begin(async (sql) => {
			await sql`select version from app.catalogue_state for update`;
			await new Promise((resolve) => setTimeout(resolve, 400));
			released = (await sql<{ at: Date }[]>`select clock_timestamp() as at`)[0]!.at;
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		const restore = curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 });
		await holder;
		expect((await restore).version).toBe(3);
		const [v3] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${recipeId} and version = 3`;
		expect(v3!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		expect(await db()`select app.recipe_version_at(${recipeId}, ${new Date(released.getTime() - 100)}) as v`).toEqual([{ v: 2 }]);
	});

	it('refuses a version that no longer passes today’s checks', async () => {
		const { curator, recipeId, ingredientId } = await published('Sformato');
		const rev = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		const other = await c.ingredient('Altro');
		await curator.client.catalogue.saveDraft({ draftId: rev.draftId, baseRevision: 1, content: completeContent('Sformato', other) });
		await curator.client.catalogue.publish({ draftId: rev.draftId });
		await db()`update app.ingredients set archived_at = now() where id = ${ingredientId}`;
		const error = await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 }));
		expect(error.data.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
	});
});
```

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: implementazione**

```ts
// write.ts
export async function setArchived(tx: Tx, actor: Actor, input: { recipeId: string; archived: boolean }) {
	const [recipe] = await tx<{ status: string }[]>`select status from app.recipes where id = ${input.recipeId} for update`;
	if (!recipe) throw appError('not_found');
	if (recipe.status === 'draft') throw appError('not_allowed', { reason: 'not_published' });
	const wanted = input.archived ? 'archived' : 'published';
	if (recipe.status !== wanted) {
		const at = await writeInstant(tx);
		await tx`update app.recipes set status = ${wanted}, archived_at = ${input.archived ? at : null}, archived_by = ${input.archived ? actor.userId : null},
			updated_by = ${actor.userId}, updated_at = ${at} where id = ${input.recipeId}`;
		await tx`insert into app.recipe_status_changes (recipe_id, status, changed_by, changed_at, channel)
			values (${input.recipeId}, ${wanted}, ${actor.userId}, ${at}, ${actor.channel})`;
	}
	const [last] = await tx<{ changed_by: string | null; changed_at: Date }[]>`
		select changed_by, changed_at from app.recipe_status_changes where recipe_id = ${input.recipeId} order by changed_at desc, id desc limit 1`;
	const authors = await loadAuthors(tx);
	return { recipeId: input.recipeId, status: wanted as 'published' | 'archived', changedBy: authorOf(authors, last?.changed_by ?? null), changedAt: (last?.changed_at ?? (await writeInstant(tx))).toISOString() };
}

export async function restoreVersion(tx: Tx, actor: Actor, input: { recipeId: string; version: number; confirmVersion: number }) {
	const [recipe] = await tx<{ status: string; version: number }[]>`select status, version from app.recipes where id = ${input.recipeId} for update`;
	if (!recipe || recipe.status === 'draft') throw appError('not_found');
	const [current] = await tx<{ restored_from: number | null }[]>`
		select restored_from from app.recipe_versions where recipe_id = ${input.recipeId} and version = ${recipe.version}`;
	if (current?.restored_from === input.version && recipe.version === input.confirmVersion + 1) {
		return { recipeId: input.recipeId, version: recipe.version, restoredFrom: input.version }; // repeat
	}
	if (input.version === recipe.version) throw appError('not_allowed', { reason: 'already_current' });
	const [chosen] = await tx<{ content: unknown }[]>`select content from app.recipe_versions where recipe_id = ${input.recipeId} and version = ${input.version}`;
	if (!chosen) throw appError('not_found');
	if (input.confirmVersion !== recipe.version) await versionConflict(tx, input.recipeId, recipe.version);
	const document = chosen.content as RecipeDraftDocument;
	const issues = checkPublishable(document, await loadLookup(tx, document));
	if (issues.length) throw appError('invalid', { issues });
	const { version } = await writeVersion(tx, actor, { recipeId: input.recipeId, document: toPublished(document), restoredFrom: input.version });
	return { recipeId: input.recipeId, version, restoredFrom: input.version };
}
```

(`authorOf` da `./views.ts`; se crea un ciclo con `write.ts`, spostarla in `load.ts`.)

```ts
// views.ts
/** The curator's search of the whole catalogue (no family, no owned books): published and archived, never drafts. */
export async function searchCatalogueRecipes(tx: Tx, query: { text: string; status: 'published' | 'archived' | 'any' }, locale: Locale) {
	const rows = await tx<{ id: string; name: Record<Locale, string>; description: Record<Locale, string>; status: 'published' | 'archived'; version: number; updated_at: Date }[]>`
		select id, name, description, status, version, updated_at from app.recipes
		where status <> 'draft' and (${query.status} = 'any' or status = ${query.status})`;
	const needle = foldText(query.text);
	const items = rows
		.map((r) => ({ recipeId: r.id, name: localText(r.name, locale), description: localText(r.description, locale), status: r.status, version: r.version, updatedAt: r.updated_at.toISOString() }))
		.filter((r) => !needle || foldText(r.name).includes(needle) || foldText(r.description).includes(needle))
		.sort((a, b) => a.name.localeCompare(b.name, locale))
		.slice(0, 50)
		.map(({ description: _description, ...item }) => item);
	return { items };
}

export async function versionList(tx: Tx, recipeId: string, locale: Locale): Promise<VersionListView> {
	const [recipe] = await tx<{ status: 'draft' | 'published' | 'archived'; version: number; name: Record<Locale, string> }[]>`
		select status, version, name from app.recipes where id = ${recipeId}`;
	if (!recipe || recipe.status === 'draft') throw appError('not_found');
	const rows = await tx<{ version: number; published_by: string | null; published_at: Date; channel: 'web' | 'mcp' | 'import'; restored_from: number | null }[]>`
		select version, published_by, published_at, channel, restored_from from app.recipe_versions where recipe_id = ${recipeId} order by version desc`;
	const authors = await loadAuthors(tx);
	return { recipeId, name: localText(recipe.name, locale), status: recipe.status, current: recipe.version,
		versions: rows.map((r) => ({ version: r.version, publishedBy: authorOf(authors, r.published_by), publishedAt: r.published_at.toISOString(), channel: r.channel, restoredFrom: r.restored_from })) };
}

export async function versionDetail(tx: Tx, recipeId: string, version: number, locale: Locale): Promise<VersionDetailView> {
	const list = await versionList(tx, recipeId, locale);
	const item = list.versions.find((v) => v.version === version);
	const [row] = await tx<{ content: unknown }[]>`select content from app.recipe_versions where recipe_id = ${recipeId} and version = ${version}`;
	if (!item || !row) throw appError('not_found');
	const content = publishedRecipeSchema.parse(row.content);
	const issues = checkPublishable(content, await loadLookup(tx, content as RecipeDraftDocument));
	const names = await loadIngredientNamesById(tx, content.ingredients.map((l) => l.ingredientId));
	const titles = await loadBookTitlesById(tx, [content.bookId]);
	const lines = ingredientLinesView(content.ingredients, names, { servings: content.baseServings, baseServings: content.baseServings, system: 'metric', locale });
	return { recipeId, version, current: list.current, publishedBy: item.publishedBy, publishedAt: item.publishedAt, restoredFrom: item.restoredFrom,
		content, summary: summaryOfDocument(recipeId, content, titles, locale), ingredients: lines, issues };
}
```

Prima di scrivere `versionDetail`, leggere le firme reali di `ingredientLinesView` (in
`server/src/recipes/lines.ts`, riesportata da `views.ts`) e di `summaryOf` (che prende un
`Content`): costruire il `Content` dal documento come fa `loadContents` (stessa forma)
e chiamare `summaryOf(content, titles, locale)` invece di una funzione nuova; se
`ingredientLinesView` vuole righe in un'altra forma, adattare il documento con una
funzione locale di poche righe, senza modificare i file di W6.

Gestori: `setArchived`, `restoreVersion` diretti; `searchRecipes`, `listVersions` e
`getVersion` con `fresh(context, await ...)`. `foldText` si importa da
`server/src/family/views.ts` (W2, senza modificarlo). Le ricette nel ricettario sono
poche decine: caricarle tutte e filtrare nel Worker segue l'approccio della ricerca di W6.

- [ ] **Step 4: eseguire** → PASS; i test del ricettario di W6 che escludono le archiviate
  restano verdi.
- [ ] **Step 5: commit** — `git commit -m "Gestione del ricettario: archiviazione, versioni e ripristino"`

---

### Task 9: ingredienti, equivalenze, varietà e libri

**Files:**
- Create: `server/src/catalogue/ingredients.ts`
- Modify: `server/src/catalogue/write.ts` (`createIngredient`, `createBook`), `server/src/catalogue/router.ts`
- Test: `server/test/catalogue/ingredients.test.ts`, `server/test/catalogue/import-writes.test.ts`

**Interfaces:**
- Consumes: Task 3 (`slugify`, `uniqueSlug`, `changedFields`), Task 5 (`loadAuthors`, `localText`), Task 6 (`Actor`, `lockCreations`, `writeInstant`).
- Produces:
  - `ingredients.ts`: `ingredientViewOf(tx, ingredientId): Promise<IngredientView>`; `recordIngredientVersion(tx, actor, ingredientId, { bump: boolean; at: Date }): Promise<number>`; `updateIngredient`, `setEquivalence`, `removeEquivalence`, `searchCatalogueIngredients(tx, text, locale)`, `knownVarieties(tx, ingredientId)`, `varietyCheck(tx, ingredientId, text, locale)`, `listBooks(tx)`, `capitalise`, `cleanSynonyms`
  - `ingredientVersionContent` (zod)
  - `write.ts` (firme definitive): `CreateIngredientInput`, `CreatedIngredient { ingredientId; slug; created }`, `createIngredient(tx, actor, input)`; `CreateBookInput`, `CreatedBook { bookId; slug; title; created }`, `createBook(tx, actor, input)`

- [ ] **Step 1: test che falliscono**

```ts
// server/test/catalogue/ingredients.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { grams, seedPublishedRecipe } from '../support/shopping-fixtures.ts';
import { catalogueActors, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue ingredients and books', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;
	const data = <T,>(read: { unchanged: true } | { unchanged: false; data: T }): T => {
		if (read.unchanged) throw new Error('expected data');
		return read.data;
	};

	it('creates an ingredient once, capitalised, with its first history row', async () => {
		const curator = await c.curator({ agent: true });
		const id = crypto.randomUUID();
		const input = { id, name: { 'it-IT': 'lenticchie rosse', 'en-GB': null }, department: 'pasta_grains' as const, isPantry: true };
		const view = await curator.client.catalogue.createIngredient(input);
		expect(await curator.client.catalogue.createIngredient(input)).toEqual(view);
		expect(view).toMatchObject({ ingredientId: id, name: { 'it-IT': 'Lenticchie rosse', 'en-GB': '' }, version: 1, equivalences: [] });
		expect(await db()`select version, channel, content->>'department' as department from app.ingredient_versions where ingredient_id = ${id}`)
			.toEqual([{ version: 1, channel: 'mcp', department: 'pasta_grains' }]);
	});

	it('creates once when the same id arrives twice at the same time', async () => {
		const curator = await c.curator();
		const input = { id: crypto.randomUUID(), name: { 'it-IT': 'Cavolo nero', 'en-GB': 'Cavolo nero' }, department: 'produce' as const, isPantry: false };
		const [a, b] = await Promise.all([curator.client.catalogue.createIngredient(input), curator.client.catalogue.createIngredient(input)]);
		expect(a).toEqual(b);
		expect(await db()`select count(*)::int as n from app.ingredient_versions where ingredient_id = ${input.id}`).toEqual([{ n: 1 }]);
	});

	it('lets a new conversation search, read and change an ingredient without losing data', async () => {
		const first = await c.curator();
		const created = await first.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Scalogni', 'en-GB': null }, department: 'produce', isPantry: false, synonyms: { 'it-IT': ['scalogno'], 'en-GB': [] } });
		await first.client.catalogue.setEquivalence({ ingredientId: created.ingredientId, fromUnit: 'us_cup', toUnit: 'g', factor: 160, preparation: null, source: 'USDA' });
		const later = await c.curator({ agent: true }); // another session: knows only the name
		const found = data(await later.client.catalogue.searchIngredients({ text: 'scalog' })).items[0]!;
		const read = data(await later.client.catalogue.getIngredient({ ingredientId: found.ingredientId }));
		expect(read).toMatchObject({ version: 2, synonyms: { 'it-IT': ['scalogno'], 'en-GB': [] }, equivalences: [expect.objectContaining({ factor: 160 })] });
		const changed = await later.client.catalogue.updateIngredient({ ingredientId: read.ingredientId, baseVersion: read.version, name: { 'it-IT': read.name['it-IT'], 'en-GB': 'Shallots' }, synonyms: read.synonyms, department: read.department, isPantry: read.isPantry });
		expect(changed).toMatchObject({ version: 3, name: { 'en-GB': 'Shallots' }, synonyms: read.synonyms, equivalences: read.equivalences });
		expect((await errorOf(later.client.catalogue.getIngredient({ ingredientId: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('updates from the version read and reports a conflict with who and what', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const view = await a.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Porri', 'en-GB': null }, department: 'produce', isPantry: false });
		const next = await b.client.catalogue.updateIngredient({ ingredientId: view.ingredientId, baseVersion: 1, name: { 'it-IT': 'Porri', 'en-GB': 'Leeks' }, synonyms: view.synonyms, department: 'produce', isPantry: false });
		expect(next.version).toBe(2);
		const conflict = await errorOf(a.client.catalogue.updateIngredient({ ingredientId: view.ingredientId, baseVersion: 1, name: { 'it-IT': 'Porri', 'en-GB': null }, synonyms: view.synonyms, department: 'frozen', isPantry: false }));
		expect(conflict.data).toMatchObject({ kind: 'ingredient', version: 2, by: b.userId, fields: ['name'] });
		expect(conflict.data.byName).not.toBeNull(); // catalogue_author_names now covers ingredient_versions
	});

	it('keeps equivalences idempotent: same id on repeat and on change, removal repeatable', async () => {
		const curator = await c.curator();
		const view = await curator.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Zucchero', 'en-GB': 'Sugar' }, department: 'other', isPantry: true });
		const input = { ingredientId: view.ingredientId, fromUnit: 'us_cup' as const, toUnit: 'g' as const, factor: 200, preparation: null, source: 'USDA' };
		const set = await curator.client.catalogue.setEquivalence(input);
		expect(set.version).toBe(2);
		const repeat = await curator.client.catalogue.setEquivalence(input);
		expect(repeat).toEqual(set);
		expect(await db()`select count(*)::int as n from app.ingredient_versions where ingredient_id = ${view.ingredientId}`).toEqual([{ n: 2 }]);
		const changed = await curator.client.catalogue.setEquivalence({ ...input, factor: 198, source: 'King Arthur' });
		expect(changed.version).toBe(3);
		expect(changed.equivalences).toEqual([expect.objectContaining({ id: set.equivalences[0]!.id, factor: 198, source: 'King Arthur' })]);
		const removed = await curator.client.catalogue.removeEquivalence({ ingredientId: view.ingredientId, equivalenceId: set.equivalences[0]!.id });
		expect(removed).toMatchObject({ version: 4, equivalences: [] });
		expect(await curator.client.catalogue.removeEquivalence({ ingredientId: view.ingredientId, equivalenceId: set.equivalences[0]!.id })).toEqual(removed);
		const blank = await errorOf(curator.client.catalogue.setEquivalence({ ...input, source: '   ' }));
		expect(blank.code).toBe('invalid');
	});

	it('finds ingredients by name, synonym and variety, and lists varieties', async () => {
		const curator = await c.curator();
		const tomato = await curator.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, department: 'produce', isPantry: false, synonyms: { 'it-IT': ['pelati'], 'en-GB': [] } });
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Insalata', baseServings: 2, lines: [{ ingredientId: tomato.ingredientId, quantity: grams(300), variety: { 'it-IT': 'cuore di bue', 'en-GB': 'oxheart' } }] });
		// seedPublishedRecipe writes the version, not the projected lines: add the line as a publication would.
		await db()`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit, source_text, is_optional, is_primary)
			values (${recipeId}, 0, ${tomato.ingredientId}, ${db().json({ 'it-IT': 'cuore di bue', 'en-GB': 'oxheart' })}, 'cuore di bue', 'amount', 300, 'g', 'x', false, false)`;
		expect(data(await curator.client.catalogue.searchIngredients({ text: 'cuore' })).items)
			.toContainEqual(expect.objectContaining({ ingredientId: tomato.ingredientId, matched: 'variety' }));
		expect(data(await curator.client.catalogue.searchIngredients({ text: 'pelati' })).items[0]).toMatchObject({ ingredientId: tomato.ingredientId, matched: 'synonym' });
		expect(data(await curator.client.catalogue.listVarieties({ ingredientId: tomato.ingredientId })).varieties)
			.toEqual([{ variety: { 'it-IT': 'cuore di bue', 'en-GB': 'oxheart' }, uses: 1 }]);
		const hints = await curator.client.catalogue.checkVariety({ ingredientId: tomato.ingredientId, text: 'Pomodoro Cuore di bue', locale: 'it-IT' });
		expect(hints.hints.length).toBeGreaterThan(0);
	});

	it('creates books once and lists them', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const book = await curator.client.catalogue.createBook({ id, title: 'Basta un wok' });
		expect(await curator.client.catalogue.createBook({ id, title: 'Altro' })).toEqual(book);
		expect(book.slug).toMatch(/^basta-un-wok/);
		expect(data(await curator.client.catalogue.listBooks({})).books).toContainEqual({ ...book, archived: false });
	});
});
```

```ts
// server/test/catalogue/import-writes.test.ts: write.ts as the production import will use it
import { resolveReferences } from '@app/domain/recipe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb } from '../../src/db.ts';
import { createBook, createDraft, createIngredient, type Actor } from '../../src/catalogue/write.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue writes for the import', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());

	it('keeps the import slugs and finds them again on a second run', async () => {
		const curator = await c.curator();
		const actor: Actor = { userId: curator.userId, channel: 'import' };
		const slug = `olio-extravergine-di-oliva-${crypto.randomUUID().slice(0, 6)}`;
		const run = (ids: { ingredient: string; book: string; draft: string }) =>
			withDb(c.actors.db.appServerUrl, { kind: 'user', claims: { sub: curator.userId, session_id: curator.sessionId } as never }, async (tx) => {
				const oil = await createIngredient(tx, actor, { ingredientId: ids.ingredient, slug, name: { 'it-IT': 'Olio extravergine d’oliva', 'en-GB': 'Extra virgin olive oil' }, department: 'condiments', isPantry: true });
				const book = await createBook(tx, actor, { bookId: ids.book, slug: `${slug}-libro`, title: 'Il libro' });
				const lookup = { ingredientId: (s: string) => (s === slug ? oil.ingredientId : undefined), bookId: (s: string) => (s === `${slug}-libro` ? book.bookId : undefined) };
				const content = resolveReferences(completeContent('Bruschetta', slug), lookup);
				const draft = await createDraft(tx, actor, { draftId: ids.draft, content, originSlug: slug, originType: 'casa' });
				return { oil, book, draft };
			});
		const first = await run({ ingredient: crypto.randomUUID(), book: crypto.randomUUID(), draft: crypto.randomUUID() });
		expect(first.oil).toMatchObject({ slug, created: true });
		const second = await run({ ingredient: crypto.randomUUID(), book: crypto.randomUUID(), draft: crypto.randomUUID() });
		expect(second.oil).toEqual({ ...first.oil, created: false });
		expect(second.book).toEqual({ ...first.book, created: false });
		expect(second.draft).toEqual({ ...first.draft, created: false });
		const [row] = await c.actors.db.admin`select channel from app.recipe_draft_saves where draft_id = ${first.draft.draftId}`;
		expect(row.channel).toBe('import');
	});
});
```

Prima di scrivere `import-writes.test.ts` leggere `server/src/db.ts` (`withDb`, forma dei
`Claims`) e `server/test/support/context.ts`: se esiste un aiuto per aprire una
transazione nel ruolo di un utente di prova, usare quello invece di `withDb` con i claim
scritti a mano. `completeContent('Bruschetta', slug)` mette lo slug al posto dell'id:
`resolveReferences` lo sostituisce con l'id restituito, come farà l'import.

- [ ] **Step 2: eseguire** → FAIL.

- [ ] **Step 3: implementazione** (`ingredients.ts`)

```ts
import type { IngredientView } from '@app/contract';
import { varietyHints } from '@app/domain/recipe';
import { preparationKey, unitEquivalenceSchema, type Locale } from '@app/domain/units';
import { z } from 'zod';
import type { Tx } from '../db.ts';
import { withInvalidOn } from '../db-errors.ts';
import { appError } from '../errors.ts';
import { foldText } from '../family/views.ts';
import { changedFields } from './fields.ts';
import { loadAuthors } from './load.ts';
import { localText } from './views.ts';
import { writeInstant, type Actor } from './write.ts';

export const ingredientVersionContent = z.object({
	slug: z.string(), name: z.object({ 'it-IT': z.string(), 'en-GB': z.string() }),
	synonyms: z.object({ 'it-IT': z.array(z.string()), 'en-GB': z.array(z.string()) }),
	department: z.string(), isPantry: z.boolean(),
	equivalences: z.array(z.object({ fromUnit: z.string(), toUnit: z.string(), factor: z.number(), scope: z.enum(['recipe', 'shopping']), preparation: z.string().nullable(), source: z.string() })),
});

interface IngredientRow { id: string; slug: string; name: Record<Locale, string>; synonyms: Record<Locale, string[]>; department: string; is_pantry: boolean; version: number }
interface EquivalenceRow { id: string; from_unit: string; to_unit: string; factor: string; scope: 'recipe' | 'shopping'; preparation: string | null; source: string }

async function ingredientRow(tx: Tx, id: string, lock = false): Promise<IngredientRow> {
	const rows = lock
		? await tx<IngredientRow[]>`select id, slug, name, synonyms, department, is_pantry, version from app.ingredients where id = ${id} and archived_at is null for update`
		: await tx<IngredientRow[]>`select id, slug, name, synonyms, department, is_pantry, version from app.ingredients where id = ${id} and archived_at is null`;
	if (!rows[0]) throw appError('not_found');
	return rows[0];
}

const equivalencesOf = (tx: Tx, id: string) => tx<EquivalenceRow[]>`
	select id, from_unit, to_unit, factor, scope, preparation, source from app.ingredient_unit_equivalences
	where ingredient_id = ${id} order by from_unit, preparation nulls first`;

export async function ingredientViewOf(tx: Tx, id: string): Promise<IngredientView> {
	const row = await ingredientRow(tx, id);
	const eqs = (await equivalencesOf(tx, id)).filter((e) => e.scope === 'recipe');
	return {
		ingredientId: row.id, slug: row.slug, name: { 'it-IT': row.name['it-IT'] ?? '', 'en-GB': row.name['en-GB'] ?? '' },
		synonyms: { 'it-IT': row.synonyms['it-IT'] ?? [], 'en-GB': row.synonyms['en-GB'] ?? [] }, department: row.department as never,
		isPantry: row.is_pantry, version: row.version,
		equivalences: eqs.map((e) => ({ id: e.id, fromUnit: e.from_unit as never, toUnit: e.to_unit as never, factor: Number(e.factor), preparation: e.preparation, source: e.source })),
	};
}

/** The history row of the ingredient as it is now; `bump` raises its version first (every change but the creation). */
export async function recordIngredientVersion(tx: Tx, actor: Actor, id: string, options: { bump: boolean; at: Date }): Promise<number> {
	if (options.bump) await tx`update app.ingredients set version = version + 1, updated_by = ${actor.userId}, updated_at = ${options.at} where id = ${id}`;
	const row = await ingredientRow(tx, id);
	const content = ingredientVersionContent.parse({
		slug: row.slug, name: { 'it-IT': row.name['it-IT'] ?? '', 'en-GB': row.name['en-GB'] ?? '' },
		synonyms: { 'it-IT': row.synonyms['it-IT'] ?? [], 'en-GB': row.synonyms['en-GB'] ?? [] }, department: row.department, isPantry: row.is_pantry,
		equivalences: (await equivalencesOf(tx, id)).map((e) => ({ fromUnit: e.from_unit, toUnit: e.to_unit, factor: Number(e.factor), scope: e.scope, preparation: e.preparation, source: e.source })),
	});
	await tx`insert into app.ingredient_versions (ingredient_id, version, content, changed_by, changed_at, channel)
		values (${id}, ${row.version}, ${tx.json(content)}, ${actor.userId}, ${options.at}, ${actor.channel})`;
	return row.version;
}

export const capitalise = (text: string) => { const t = text.trim(); return t.charAt(0).toLocaleUpperCase('it-IT') + t.slice(1); };
export const cleanSynonyms = (s: Partial<Record<Locale, string[]>> | undefined) => ({
	'it-IT': [...new Set((s?.['it-IT'] ?? []).map((x) => x.trim()).filter(Boolean))],
	'en-GB': [...new Set((s?.['en-GB'] ?? []).map((x) => x.trim()).filter(Boolean))],
});

export async function updateIngredient(tx: Tx, actor: Actor, input: { ingredientId: string; baseVersion: number; name: { 'it-IT': string; 'en-GB': string | null }; synonyms: Record<Locale, string[]>; department: string; isPantry: boolean }) {
	const row = await ingredientRow(tx, input.ingredientId, true);
	const next = { name: { 'it-IT': capitalise(input.name['it-IT']), 'en-GB': input.name['en-GB']?.trim() ? capitalise(input.name['en-GB']) : '' }, synonyms: cleanSynonyms(input.synonyms), department: input.department, isPantry: input.isPantry };
	const current = { name: row.name, synonyms: row.synonyms, department: row.department, isPantry: row.is_pantry };
	if (changedFields(current, next).length === 0) return ingredientViewOf(tx, row.id); // nothing to change, also on a repeat
	if (input.baseVersion !== row.version) {
		const [last] = await tx<{ changed_by: string | null; changed_at: Date }[]>`
			select changed_by, changed_at from app.ingredient_versions where ingredient_id = ${row.id} order by version desc limit 1`;
		const [base] = await tx<{ content: z.infer<typeof ingredientVersionContent> }[]>`
			select content from app.ingredient_versions where ingredient_id = ${row.id} and version = ${input.baseVersion}`;
		const authors = await loadAuthors(tx);
		const from = base ? { name: base.content.name, synonyms: base.content.synonyms, department: base.content.department, isPantry: base.content.isPantry } : current;
		throw appError('conflict', {
			kind: 'ingredient', version: row.version, by: last?.changed_by ?? null,
			byName: last?.changed_by ? (authors.get(last.changed_by) ?? null) : null, at: (last?.changed_at ?? new Date(0)).toISOString(), fields: changedFields(from, current),
		});
	}
	const at = await writeInstant(tx);
	await withInvalidOn(['name'], () => tx`update app.ingredients set name = ${tx.json(next.name)}, synonyms = ${tx.json(next.synonyms)}, department = ${next.department}, is_pantry = ${next.isPantry} where id = ${row.id}`);
	await recordIngredientVersion(tx, actor, row.id, { bump: true, at });
	return ingredientViewOf(tx, row.id);
}

/**
 * Idempotent (spec section 3): identical values write nothing; other values update the row in
 * place (to_unit, factor and source are the columns curators may update), keeping its id.
 */
export async function setEquivalence(tx: Tx, actor: Actor, input: { ingredientId: string; fromUnit: string; toUnit: string; factor: number; preparation: string | null; source: string }) {
	await ingredientRow(tx, input.ingredientId, true);
	const parsed = unitEquivalenceSchema.safeParse({ ingredientId: input.ingredientId, fromUnit: input.fromUnit, toUnit: input.toUnit, factor: input.factor, scope: 'recipe', preparation: preparationKey(input.preparation), source: input.source });
	if (!parsed.success) throw appError('invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], code: 'invalid_value' })) });
	const eq = parsed.data;
	const [existing] = await tx<EquivalenceRow[]>`
		select id, from_unit, to_unit, factor, scope, preparation, source from app.ingredient_unit_equivalences
		where ingredient_id = ${eq.ingredientId} and scope = 'recipe' and from_dimension = app.unit_dimension(${eq.fromUnit})
			and preparation is not distinct from ${eq.preparation}`;
	if (existing && existing.from_unit === eq.fromUnit && existing.to_unit === eq.toUnit && Number(existing.factor) === eq.factor && existing.source === eq.source) {
		return ingredientViewOf(tx, input.ingredientId); // a repeat: same id, same version
	}
	const at = await writeInstant(tx);
	await withInvalidOn(['fromUnit'], async () => {
		if (existing && existing.from_unit === eq.fromUnit) {
			await tx`update app.ingredient_unit_equivalences set to_unit = ${eq.toUnit}, factor = ${eq.factor}, source = ${eq.source} where id = ${existing.id}`;
		} else {
			// Another unit of the same dimension (g → kg): from_unit cannot be updated, the row is replaced.
			if (existing) await tx`delete from app.ingredient_unit_equivalences where id = ${existing.id}`;
			await tx`insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source)
				values (${eq.ingredientId}, ${eq.fromUnit}, ${eq.toUnit}, ${eq.factor}, 'recipe', ${eq.preparation}, ${eq.source})`;
		}
	});
	await recordIngredientVersion(tx, actor, input.ingredientId, { bump: true, at });
	return ingredientViewOf(tx, input.ingredientId);
}

/** Removing an equivalence already gone answers the current view: a repeat after a lost answer. */
export async function removeEquivalence(tx: Tx, actor: Actor, input: { ingredientId: string; equivalenceId: string }) {
	await ingredientRow(tx, input.ingredientId, true);
	const removed = await tx`delete from app.ingredient_unit_equivalences
		where id = ${input.equivalenceId} and ingredient_id = ${input.ingredientId} and scope = 'recipe' returning id`;
	if (removed.length > 0) await recordIngredientVersion(tx, actor, input.ingredientId, { bump: true, at: await writeInstant(tx) });
	return ingredientViewOf(tx, input.ingredientId);
}
```

Ricerca, varietà e libri (stesso file):

```ts
export async function searchCatalogueIngredients(tx: Tx, text: string, locale: Locale) {
	const needle = foldText(text);
	const rows = await tx<{ id: string; name: Record<Locale, string>; synonyms: Record<Locale, string[]>; department: string; is_pantry: boolean }[]>`
		select id, name, synonyms, department, is_pantry from app.ingredients where archived_at is null`;
	const varieties = await tx<{ ingredient_id: string; variety: Record<Locale, string> }[]>`
		select distinct on (ingredient_id, variety_key) ingredient_id, variety from app.recipe_ingredients ri
		join app.recipes r on r.id = ri.recipe_id where r.status <> 'draft' and ri.variety is not null`;
	const base = (r: (typeof rows)[number]) => ({ ingredientId: r.id, name: localText(r.name, locale), department: r.department as never, isPantry: r.is_pantry });
	const byName = rows.filter((r) => foldText(localText(r.name, locale)).includes(needle)).map((r) => ({ ...base(r), variety: null, matched: 'name' as const }));
	const bySynonym = rows.filter((r) => !byName.some((n) => n.ingredientId === r.id) && (r.synonyms[locale] ?? []).some((s) => foldText(s).includes(needle)))
		.map((r) => ({ ...base(r), variety: null, matched: 'synonym' as const }));
	const byId = new Map(rows.map((r) => [r.id, r]));
	const byVariety = varieties.filter((v) => byId.has(v.ingredient_id) && foldText(v.variety[locale] ?? '').includes(needle))
		.map((v) => ({ ...base(byId.get(v.ingredient_id)!), variety: { 'it-IT': v.variety['it-IT'] ?? '', 'en-GB': v.variety['en-GB'] ?? '' }, matched: 'variety' as const }));
	return { items: [...byName.sort((a, b) => a.name.localeCompare(b.name, locale)), ...bySynonym, ...byVariety].slice(0, 20) };
}

export async function knownVarieties(tx: Tx, ingredientId: string) {
	await ingredientRow(tx, ingredientId);
	const rows = await tx<{ variety: Record<Locale, string>; variety_key: string }[]>`
		select ri.variety, ri.variety_key from app.recipe_ingredients ri join app.recipes r on r.id = ri.recipe_id
		where ri.ingredient_id = ${ingredientId} and r.status <> 'draft' and ri.variety is not null`;
	const groups = new Map<string, { spellings: Map<string, { variety: Record<Locale, string>; n: number }>; uses: number }>();
	for (const r of rows) {
		const g = groups.get(r.variety_key) ?? { spellings: new Map(), uses: 0 };
		const key = JSON.stringify(r.variety);
		const spelling = g.spellings.get(key) ?? { variety: r.variety, n: 0 };
		spelling.n++;
		g.uses++;
		g.spellings.set(key, spelling);
		groups.set(r.variety_key, g);
	}
	const varieties = [...groups.values()].map((g) => {
		const top = [...g.spellings.values()].sort((a, b) => b.n - a.n)[0]!.variety;
		return { variety: { 'it-IT': top['it-IT'] ?? '', 'en-GB': top['en-GB'] ?? '' }, uses: g.uses };
	}).sort((a, b) => b.uses - a.uses || a.variety['it-IT'].localeCompare(b.variety['it-IT'], 'it-IT'));
	return { varieties };
}

export async function varietyCheck(tx: Tx, ingredientId: string, text: string, locale: Locale) {
	const row = await ingredientRow(tx, ingredientId);
	const { varieties } = await knownVarieties(tx, ingredientId);
	return { hints: varietyHints({ ingredientName: localText(row.name, locale), known: varieties.map((v) => v.variety), text, locale }) };
}

export async function listBooks(tx: Tx) {
	const rows = await tx<{ id: string; slug: string; title: string; archived_at: Date | null }[]>`select id, slug, title, archived_at from app.books order by title`;
	return { books: rows.map((b) => ({ bookId: b.id, slug: b.slug, title: b.title, archived: b.archived_at !== null })) };
}
```

In `write.ts` (firme definitive della spec, sezione 1):

```ts
export interface CreateIngredientInput {
	ingredientId: string;
	slug?: string;
	name: { 'it-IT': string; 'en-GB': string | null };
	department: Department;
	isPantry: boolean;
	synonyms?: { 'it-IT': string[]; 'en-GB': string[] };
}
export interface CreatedIngredient { ingredientId: string; slug: string; created: boolean }
export interface CreateBookInput { bookId: string; slug?: string; title: string }
export interface CreatedBook { bookId: string; slug: string; title: string; created: boolean }

/** Same uuid, or the same import slug: the ingredient already there (created: false), nothing written. */
export async function createIngredient(tx: Tx, actor: Actor, input: CreateIngredientInput): Promise<CreatedIngredient> {
	await lockCreations(tx);
	const [existing] = await tx<{ id: string; slug: string }[]>`
		select id, slug from app.ingredients where id = ${input.ingredientId} or slug = ${input.slug ?? null} order by (id = ${input.ingredientId}) desc limit 1`;
	if (existing) return { ingredientId: existing.id, slug: existing.slug, created: false };
	const name = { 'it-IT': capitalise(input.name['it-IT']), 'en-GB': input.name['en-GB']?.trim() ? capitalise(input.name['en-GB']) : '' };
	const slug = input.slug ?? (await uniqueSlug(slugify(name['it-IT'], 'ingredient'), async (s) => (await tx`select 1 from app.ingredients where slug = ${s}`).length > 0));
	const at = await writeInstant(tx);
	await withInvalidOn(['name'], () => tx`insert into app.ingredients (id, slug, name, synonyms, department, is_pantry, version, created_by, created_at, updated_by, updated_at)
		values (${input.ingredientId}, ${slug}, ${tx.json(name)}, ${tx.json(cleanSynonyms(input.synonyms))}, ${input.department}, ${input.isPantry}, 1,
			${actor.userId}, ${at}, ${actor.userId}, ${at})`);
	await recordIngredientVersion(tx, actor, input.ingredientId, { bump: false, at });
	return { ingredientId: input.ingredientId, slug, created: true };
}

export async function createBook(tx: Tx, actor: Actor, input: CreateBookInput): Promise<CreatedBook> {
	await lockCreations(tx);
	const [existing] = await tx<{ id: string; slug: string; title: string }[]>`
		select id, slug, title from app.books where id = ${input.bookId} or slug = ${input.slug ?? null} order by (id = ${input.bookId}) desc limit 1`;
	if (existing) return { bookId: existing.id, slug: existing.slug, title: existing.title, created: false };
	const title = input.title.trim();
	const slug = input.slug ?? (await uniqueSlug(slugify(title, 'book'), async (s) => (await tx`select 1 from app.books where slug = ${s}`).length > 0));
	await tx`insert into app.books (id, slug, title, created_by, created_at) values (${input.bookId}, ${slug}, ${title}, ${actor.userId}, ${await writeInstant(tx)})`;
	return { bookId: input.bookId, slug, title, created: true };
}
```

(`Department` da `@app/domain/shopping`; `capitalise`, `cleanSynonyms`,
`recordIngredientVersion` da `./ingredients.ts`: se l'import reciproco fra `write.ts` e
`ingredients.ts` crea un ciclo di moduli, spostare `Actor`, `lockCreations` e
`writeInstant` in `server/src/catalogue/actor.ts` e importarli da entrambi.) Lo slug
passato dall'import si conserva com'è: deve già rispettare il vincolo kebab dello schema
(`catalogueIngredientSchema` lo garantisce nel pacchetto); uno slug non valido arriva
come `invalid` da `withInvalidOn`.

Gestori: `createIngredient` chiama `createIngredient(tx, actorOf(context), { ingredientId:
input.id, name, department, isPantry, synonyms })` e restituisce
`ingredientViewOf(tx, ingredientId)`; `createBook` restituisce `{ bookId, slug, title }`;
`getIngredient`, `searchIngredients`, `listVarieties`, `listBooks` con
`fresh(context, ...)`.

- [ ] **Step 4: eseguire** → PASS.
- [ ] **Step 5: commit** — `git commit -m "Gestione del ricettario: ingredienti, equivalenze di ricetta, varietà e libri"`

---

### Task 10: MCP e verifica del lato server

**Files:**
- Test: `server/test/catalogue/mcp.test.ts`

**Interfaces:**
- Consumes: tutto il lato server.

- [ ] **Step 1: test**

```ts
// server/test/catalogue/mcp.test.ts
import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectTools } from '../../src/mcp.ts';
import { messages } from '../../src/messages.ts';
import { hasDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

describe('catalogue tools', () => {
	it('exposes every operation, read-only only for reads', () => {
		const tools = new Map(collectTools(contract).map((t) => [t.name, t.readOnly]));
		for (const name of ['getGuide', 'overview', 'getDraft', 'checkDraft', 'listVersions', 'getVersion', 'searchIngredients', 'getIngredient', 'searchRecipes', 'listVarieties', 'checkVariety', 'listBooks']) {
			expect(tools.get(`catalogue_${name}`)).toBe(true);
		}
		for (const name of ['createDraft', 'startRevision', 'saveDraft', 'publish', 'discardDraft', 'setArchived', 'restoreVersion', 'createIngredient', 'updateIngredient', 'setEquivalence', 'removeEquivalence', 'createBook']) {
			expect(tools.get(`catalogue_${name}`)).toBe(false);
		}
	});
});

describe.skipIf(!hasDatabase)('catalogue over MCP', () => {
	let c: CatalogueActors;
	beforeAll(async () => { c = await catalogueActors(); });
	afterAll(() => c?.actors.close());
	const call = (token: string, name: string, args: unknown) => mcp(c.actors.app, c.actors.env, token, 'tools/call', { name, arguments: args });

	it('lets a curator agent write a recipe from guide to publication, recorded as mcp', async () => {
		const agent = await c.curator({ agent: true, locale: 'en-GB' });
		expect(toolBody(await call(agent.token, 'catalogue_getGuide', {})).guide).toContain('explicit yes');
		const ingredientId = await c.ingredient('Fagioli');
		const created = toolBody(await call(agent.token, 'catalogue_createDraft', { id: crypto.randomUUID(), content: completeContent('Pasta e fagioli', ingredientId) }));
		const published = toolBody(await call(agent.token, 'catalogue_publish', { draftId: created.draftId }));
		expect(published.version).toBe(1);
		const [row] = await c.actors.db.admin`select channel from app.recipe_versions where recipe_id = ${created.recipeId}`;
		expect(row.channel).toBe('mcp');
	});

	it('renders conflicts and invalid drafts in the profile language', async () => {
		const a = await c.curator({ agent: true, locale: 'it-IT' });
		const b = await c.curator();
		const d = toolBody(await call(a.token, 'catalogue_createDraft', { id: crypto.randomUUID(), content: draftContent('Cassoeula') }));
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Cassoeula', { durationMinutes: 180 }) });
		const conflict = await call(a.token, 'catalogue_saveDraft', { draftId: d.draftId, baseRevision: 1, content: draftContent('Cassœula') });
		expect(conflict.body.result.isError).toBe(true);
		expect(toolBody(conflict)).toMatchObject({ code: 'conflict', message: messages.conflict['it-IT'], data: { kind: 'draft', revision: 2 } });
		const invalid = await call(a.token, 'catalogue_publish', { draftId: d.draftId });
		expect(toolBody(invalid)).toMatchObject({ code: 'invalid', message: messages.invalid['it-IT'] });
	});

	it('refuses a member agent', async () => {
		const agent = await c.actors.user({ agent: true });
		expect(toolBody(await call(agent.token, 'catalogue_overview', {}))).toMatchObject({ code: 'forbidden' });
	});
});
```

Leggere `server/test/support/requests.ts` per la forma esatta di `toolBody` sugli errori
(in `profile-family-mcp.test.ts` restituisce `{ code, message, data }`).

- [ ] **Step 2: eseguire** → PASS (nessun codice nuovo; se fallisce, correggere i gestori).
- [ ] **Step 3: verifica completa** con `superpowers:verification-before-completion`:
  `supabase test db`, `npm run typecheck`, `TEST_DATABASE_URL=… npm test`, `npm run build`
  se definito nella radice. Tutti verdi, nessun gestore provvisorio rimasto
  (`grep -n "Task [0-9]" server/src/catalogue/router.ts` vuoto).
- [ ] **Step 4: commit** — `git commit -m "Gestione del ricettario: strumenti MCP e verifica"`
- [ ] **Step 5: PR del server** (comprende la compatibilità del web con `not_allowed` del Task 1) — push e `gh pr create` (descrizione in italiano: cosa fa,
  come è stato verificato, sezioni 8 e 13 realizzate, file condivisi toccati, interfaccia
  `write.ts` per la messa in produzione), poi `STATO: PR_APERTA <url>`.

---

### Task 10bis: correzioni della review della PR #23

Rilievi in `progetto/coordinamento/revisioni/w3-pr23.md`, decisioni del coordinatore in
`progetto/coordinamento/messaggi/w3-05-review-pr23.md`. Spec di dettaglio: sezioni 2
(operazioni), 3 (`startRevision`, salvataggi, guida), 4 (seconda migrazione) e 6.

**Files:**
- Create: `supabase/migrations/20261011190000_draft_requests.sql`, `supabase/tests/draft_requests_test.sql`
- Modify: `supabase/tests/helpers/cleanup.psql`, `server/src/catalogue/write.ts`,
  `contract/src/catalogue/{views,operations}.ts` (+ test del contratto),
  `server/src/catalogue/{views,load,router,guide}.ts`, `server/src/catalogue/convert.test.ts`,
  `server/test/catalogue/{drafts,mcp,publish}.test.ts`

- [ ] **Step 1: idempotenza di `startRevision`.** Migrazione con `app.recipe_draft_requests`
  (`id` della richiesta come chiave primaria, `draft_id`, `requested_by`, `requested_at`;
  RLS, `select`/`insert` ad `authenticated`, politica dei curatori) e test pgTAP. In
  `startRevision`, dopo il lucchetto delle creazioni, una sola lettura cerca la bozza con
  lo stesso `id` e quella associata all'`id` in `recipe_draft_requests`; quando riprende la
  revisione aperta inserisce l'associazione con `writeInstant`. Test del server: la
  richiesta di Marco riceve la revisione A di Lucia; ripetuta dopo lo scarto di A, dopo
  l'apertura di B, dopo la pubblicazione di B e l'apertura di C risponde sempre con la
  bozza ricevuta la prima volta, senza bozze nuove; per un'altra ricetta → `invalid`.
- [ ] **Step 2: salvataggi recuperabili.** Nel contratto `draftSaveSummaryView`,
  `draftSavesView`, `draftSaveView` e le letture `listDraftSaves` (GET
  `/catalogue/drafts/{draftId}/saves`) e `getDraftSave` (GET
  `/catalogue/drafts/{draftId}/saves/{revision}`), non versionate, ruolo `curator`,
  `not_found`. Nel server `draftSaves(tx, row)` e `draftSave(tx, draftId, revision)` in
  `views.ts` (contenuto con `parseContent` di `load.ts`, autori con `loadAuthors`). Test
  MCP da un agente nuovo: sovrascrittura → elenco con `overwritten` → lettura → `saveDraft`
  dall'ultima revisione col contenuto recuperato; elenco di una bozza chiusa; `not_found`;
  `forbidden` per un membro. Elenco degli strumenti di sola lettura aggiornato.
- [ ] **Step 3: guida e preparazione.** Nella guida: `sourceText` sempre col testo
  originale, preparazione verificata anche nel campo bilingue `preparation` (con le parole
  dell'equivalenza), anche nel suggerimento `preparation` di `checkVariety`; esempio
  guidato generica 100 / «grattugiato» 120; recupero dei salvataggi nel flusso. Test puro
  in `convert.test.ts` (120 col campo, 100 col solo `sourceText`) e test con database in
  `publish.test.ts` (`setEquivalence` → `checkDraft` → `publish` a 120 g).
- [ ] **Step 4: spazi** delle righe 120–136 della spec (`git diff --check` vuoto).
- [ ] **Step 5: verifica** — `npm test` e `npm run typecheck` da radice e workspace; dopo
  il push, controllare nella CI che `supabase db start`, `supabase test db` e le suite con
  database siano eseguiti e verdi, non saltati.
- [ ] **Step 6: commit piccoli e push** (senza push forzato), poi `STATO: PR_CORRETTA <url>`.

---

### Task 11: web delle bozze (dopo il cancello)

**Cancello:** merge della #17 (W5, già unita), della #18 (W2, `profile.get` con
`globalRoles` al posto di `me.get`), della #19 (W6, ricettario sui dati veri, che cambia
`RecipesPage`) e della #21 (pagine di Profilo e famiglia), poi il via del coordinatore. Prima di iniziare: `git fetch && git rebase origin/main`, poi leggere:
- `web/src/api/types.ts` (`SERVER_AREAS`, `Api`, `ProvisionalApi`) e `clients.ts`
  (`realClients`), con `clients.test.ts` come modello del test;
- `web/src/api/fake/fakeApi.ts` (come le aree servite hanno il loro finto);
- come la #18 espone il profilo (hook e chiave della query di `profile.get`, campo
  `globalRoles`) e come la #19 ha lasciato `RecipesPage` e `RecipesView`;
- `web/src/test/renderWithProviders.tsx` e `renderApp.tsx` (aiuti dei test).

I nomi sotto che dipendono da quelle PR (`useProfile`, `profileKey`, `renderWithProviders`
con un'API finta) si allineano a quelli reali in questo primo passo, senza cambiare il
comportamento descritto.

**Files:**
- Modify: `web/src/api/types.ts` (`SERVER_AREAS` con `'catalogue'`), `web/src/api/fake/fakeApi.ts` (area `catalogue` finta e `withTransport`), `web/src/api/clients.test.ts`
- Create: `web/src/features/catalogue/queries.ts`, `useIsCurator.ts`, `CatalogueDraftsSection.tsx`, `ArchivedRecipesSection.tsx`, `DraftPage.tsx`, `catalogue.module.css`, test accanto
- Create: `web/src/i18n/messages/catalogue.ts`; Modify: `web/src/i18n/messages/index.ts`
- Modify: `web/src/router.tsx` (rotta `/recipes/drafts/$draftId`), `web/src/routes/RecipesPage.tsx` (solo import e corpo di `RecipesPage`)

**Interfaces:**
- Consumes: `catalogue.overview`, `catalogue.getDraft`, `catalogue.setArchived` dal contratto (Task 4); `profile.get().globalRoles` (#18); `isBlocking`, `toApiError` (`web/src/api/errors.ts`).
- Produces: `<CatalogueDraftsSection />`, `<ArchivedRecipesSection />`, rotta della bozza; `catalogue` in `SERVER_AREAS`.

- [ ] **Step 1: test che falliscono**

```ts
// in web/src/api/clients.test.ts, nel describe 'clients by area'
it('sends the catalogue reads and the archive switch to the Worker', async () => {
	const { server, api } = setup();
	const calls = () => server.fetch.mock.calls.map(([request]) => new URL((request as Request).url).pathname);
	await api.catalogue.overview({}).catch(() => undefined);
	await api.catalogue.getDraft({ draftId: crypto.randomUUID() }).catch(() => undefined);
	await api.catalogue.setArchived({ recipeId: crypto.randomUUID(), archived: false }).catch(() => undefined);
	expect(calls()).toEqual(['/api/rpc/catalogue/overview', '/api/rpc/catalogue/getDraft', '/api/rpc/catalogue/setArchived']);
});
```

Leggere in `web/src/test/rpcServer.ts` come il server di prova risponde a una procedura
sconosciuta e come registra le richieste: adeguare l'estrazione del percorso (la forma di
`server.fetch.mock.calls` e il prefisso RPC) a quello reale.

```ts
// in web/src/api/clients.test.ts: the fake mode has the area too, through its transport wrapper
it('in fake mode answers the catalogue area, also offline', async () => {
	const api = fakeClients({ latencyMs: 0 })(user)('it-IT');
	const overview = await api.catalogue.overview({});
	expect(overview.drafts.length).toBeGreaterThan(0);
	setOnline(false);
	try {
		await expect(api.catalogue.overview({})).rejects.toMatchObject({ code: 'network' });
	} finally {
		setOnline(true);
	}
});
```

Il comportamento offline del finto è quello di `withTransport` per le altre aree (leggerlo
in `fakeApi.ts`): se le letture offline rispondono `network`, il test lo verifica come
sopra; se rispondono dai dati, verificare quello. `setOnline` da
`web/src/test/connectivity.ts`.

```tsx
// web/src/features/catalogue/CatalogueDraftsSection.test.tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { catalogueApi, renderCatalogue } from './test-support';
import { CatalogueDraftsSection } from './CatalogueDraftsSection';

const overview = {
	drafts: [{ draftId: 'd1', recipeId: 'r1', kind: 'new' as const, name: 'Zuppa di farro', createdBy: { userId: 'u1', name: 'Lucia' },
		updatedBy: { userId: 'u1', name: 'Lucia' }, updatedAt: '2026-10-06T18:00:00.000Z', missing: ['baseServings', 'translation'] as const }],
	archived: [],
};

describe('CatalogueDraftsSection', () => {
	it('shows draft cards to curators with what they miss', async () => {
		renderCatalogue(<CatalogueDraftsSection />, { roles: ['recipe_curator'], api: catalogueApi({ overview: async () => overview }) });
		expect(await screen.findByText('Zuppa di farro')).toBeInTheDocument();
		expect(screen.getByText('Nuova')).toBeInTheDocument();
		expect(screen.getByText(/Lucia · 6 ott/)).toBeInTheDocument();
		expect(screen.getByText('Porzioni')).toBeInTheDocument();
		expect(screen.getByText('Traduzione')).toBeInTheDocument();
	});

	it('renders nothing for members', () => {
		const { container } = renderCatalogue(<CatalogueDraftsSection />, { roles: [], api: catalogueApi({ overview: async () => overview }) });
		expect(container).toBeEmptyDOMElement();
	});

	it('removes drafts already shown when the server refuses a later read', async () => {
		let refuse = false;
		const { refetchAll } = renderCatalogue(<CatalogueDraftsSection />, {
			roles: ['recipe_curator'],
			api: catalogueApi({ overview: async () => { if (refuse) throw new ApiError('forbidden'); return overview; } }),
		});
		expect(await screen.findByText('Zuppa di farro')).toBeInTheDocument();
		refuse = true;
		await refetchAll();
		await waitFor(() => expect(screen.queryByText('Zuppa di farro')).not.toBeInTheDocument());
	});

	it('keeps drafts already shown when only the network fails', async () => {
		let offline = false;
		const { refetchAll } = renderCatalogue(<CatalogueDraftsSection />, {
			roles: ['recipe_curator'],
			api: catalogueApi({ overview: async () => { if (offline) throw new ApiError('network'); return overview; } }),
		});
		expect(await screen.findByText('Zuppa di farro')).toBeInTheDocument();
		offline = true;
		await refetchAll();
		expect(screen.getByText('Zuppa di farro')).toBeInTheDocument();
	});
});
```

```tsx
// web/src/features/catalogue/ArchivedRecipesSection.test.tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { catalogueApi, renderCatalogue } from './test-support';
import { ArchivedRecipesSection } from './ArchivedRecipesSection';

describe('ArchivedRecipesSection', () => {
	it('brings a recipe back and shows the server answer, without optimistic changes', async () => {
		let archived = [{ recipeId: 'r9', name: 'Erbazzone', archivedBy: { userId: 'u1', name: 'Lucia' }, archivedAt: '2026-10-05T10:00:00.000Z' }];
		let release!: () => void;
		const setArchived = vi.fn(() => new Promise((resolve) => {
			release = () => { archived = []; resolve({ recipeId: 'r9', status: 'published', changedBy: { userId: 'u1', name: 'Lucia' }, changedAt: '2026-10-11T10:00:00.000Z' }); };
		}));
		renderCatalogue(<ArchivedRecipesSection />, { roles: ['recipe_curator'], api: catalogueApi({ overview: async () => ({ drafts: [], archived }), setArchived }) });
		fireEvent.click(await screen.findByText('Archiviate'));
		fireEvent.click(screen.getByRole('button', { name: 'Riporta nel ricettario' }));
		expect(screen.getByText('Erbazzone')).toBeInTheDocument(); // still there while waiting
		release();
		await waitFor(() => expect(screen.queryByText('Erbazzone')).not.toBeInTheDocument());
		expect(setArchived).toHaveBeenCalledWith({ recipeId: 'r9', archived: false });
	});

	it('drops the catalogue views when the bring-back is refused (role revoked)', async () => {
		const archived = [{ recipeId: 'r9', name: 'Erbazzone', archivedBy: { userId: 'u1', name: 'Lucia' }, archivedAt: '2026-10-05T10:00:00.000Z' }];
		const { queryClient } = renderCatalogue(<ArchivedRecipesSection />, {
			roles: ['recipe_curator'],
			api: catalogueApi({ overview: async () => ({ drafts: [], archived }), setArchived: async () => { throw new ApiError('forbidden'); } }),
		});
		fireEvent.click(await screen.findByText('Archiviate'));
		fireEvent.click(screen.getByRole('button', { name: 'Riporta nel ricettario' }));
		await waitFor(() => expect(screen.queryByText('Erbazzone')).not.toBeInTheDocument());
		expect(queryClient.getQueriesData({ queryKey: ['catalogue'] })).toEqual([]);
	});
});
```

```tsx
// web/src/routes/RecipesPage.catalogue.test.tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('recipe book for a curator without a family', () => {
	it('shows drafts and archived recipes next to the no-family notice', async () => {
		renderApp('/recipes', { /* fake user with globalRoles ['recipe_curator'] and no family, as the #18 fake profile allows */ });
		expect(await screen.findByText('Bozze')).toBeInTheDocument();
		expect(screen.getByText('Archiviate')).toBeInTheDocument();
	});
});
```

`renderApp` con un utente finto curatore e senza famiglie: dopo la #18 il client finto del
profilo deve permetterlo; se non ha un'opzione per i ruoli e le famiglie, aggiungerla al
finto del profilo con la modifica minima (è il finto dell'area di W2: segnalarlo nella PR).
Il commento nel test va sostituito dalle opzioni reali.

In `withTransport` di `web/src/api/fake/fakeApi.ts` l'elenco esplicito delle aree riceve
`catalogue: wrap(api.catalogue)`, altrimenti il valore restituito non soddisfa `Api` e la
modalità finta perde l'area.

`test-support.tsx` (accanto ai componenti) esporta `catalogueApi(overrides)`, un'`Api` finta
con l'area `catalogue` sovrascritta e il profilo con i ruoli richiesti, e
`renderCatalogue(ui, { roles, api })`, che usa `renderWithProviders` della base e
restituisce anche `queryClient` e `refetchAll()` (`queryClient.refetchQueries()` seguito
dall'attesa delle query attive). Nel test del rifiuto la query di `overview` resta rimossa
perché il profilo riletto dal finto non ha più il ruolo: `catalogueApi` lo permette
(ruoli che cambiano dopo il primo `profile.get`), altrimenti la sezione rileggerebbe.

- [ ] **Step 2: eseguire** `npm test -w web -- catalogue clients` → FAIL.

- [ ] **Step 3: registrazione dell'area nel client**

In `web/src/api/types.ts`: `export const SERVER_AREAS = [..., 'catalogue'] as const` (accanto
alle aree già servite). Nel client finto (`fakeApi.ts`) l'area `catalogue` con `overview`,
`getDraft` e `setArchived` sui dati dimostrativi (due bozze come nel prototipo, una ricetta
archiviata), con la forma esatta delle viste del contratto (`DraftSummaryView`,
`ArchivedSummaryView`, `DraftView`, tipi da `@app/contract` come le altre aree servite);
le altre operazioni dell'area nel finto rispondono `ApiError('not_found')`, perché il web
non le usa.

- [ ] **Step 4: dizionario**

```ts
// web/src/i18n/messages/catalogue.ts
export const it = {
	'catalogue.drafts': 'Bozze',
	'catalogue.archived': 'Archiviate',
	'catalogue.kind.new': 'Nuova',
	'catalogue.kind.revision': 'Modifica',
	'catalogue.restore': 'Riporta nel ricettario',
	'catalogue.missing.names': 'Nomi',
	'catalogue.missing.source': 'Fonte',
	'catalogue.missing.details': 'Dettagli',
	'catalogue.missing.attributes': 'Attributi',
	'catalogue.missing.baseServings': 'Porzioni',
	'catalogue.missing.ingredients': 'Ingredienti',
	'catalogue.missing.translation': 'Traduzione',
	'catalogue.missing.invalid': 'Dati da correggere',
	'catalogue.draft.unresolved': 'da collegare',
	'catalogue.draft.problems': 'Cosa manca per pubblicare',
	'catalogue.draft.updated': 'Ultima modifica: {name}, {date}',
	'catalogue.draft.formLater': 'Si modifica tramite l’agente: il modulo arriverà più avanti.',
	'catalogue.issue.required': 'Dato obbligatorio',
	'catalogue.issue.translation_missing': 'Manca la traduzione',
	'catalogue.issue.duplicate_ingredient': 'Ingrediente ripetuto',
	'catalogue.issue.unit_not_publishable': 'Tazze senza conversione',
	'catalogue.issue.unknown_ingredient': 'Ingrediente non nel catalogo',
	'catalogue.issue.unknown_book': 'Libro non nel catalogo',
	'catalogue.issue.not_applicable': 'Non pertinente al tipo di fonte',
	'catalogue.issue.invalid_value': 'Valore non valido',
	'catalogue.issue.too_long': 'Testo troppo lungo',
	'catalogue.issue.invalid_url': 'Indirizzo non valido',
	'catalogue.issue.not_positive_integer': 'Numero non valido',
	'catalogue.issue.invalid_amount': 'Quantità non valida',
	'catalogue.issue.multiple_primary': 'Più di un ingrediente principale',
};

export const en = {
	'catalogue.drafts': 'Drafts',
	'catalogue.archived': 'Archived',
	'catalogue.kind.new': 'New',
	'catalogue.kind.revision': 'Edit',
	'catalogue.restore': 'Bring back to the recipe book',
	'catalogue.missing.names': 'Names',
	'catalogue.missing.source': 'Source',
	'catalogue.missing.details': 'Details',
	'catalogue.missing.attributes': 'Attributes',
	'catalogue.missing.baseServings': 'Servings',
	'catalogue.missing.ingredients': 'Ingredients',
	'catalogue.missing.translation': 'Translation',
	'catalogue.missing.invalid': 'Data to fix',
	'catalogue.draft.unresolved': 'to be linked',
	'catalogue.draft.problems': 'What is missing to publish',
	'catalogue.draft.updated': 'Last change: {name}, {date}',
	'catalogue.draft.formLater': 'Edit it through your agent: the form will come later.',
	'catalogue.issue.required': 'Required',
	'catalogue.issue.translation_missing': 'Translation missing',
	'catalogue.issue.duplicate_ingredient': 'Ingredient repeated',
	'catalogue.issue.unit_not_publishable': 'Cups without a conversion',
	'catalogue.issue.unknown_ingredient': 'Ingredient not in the catalogue',
	'catalogue.issue.unknown_book': 'Book not in the catalogue',
	'catalogue.issue.not_applicable': 'Not relevant to the source type',
	'catalogue.issue.invalid_value': 'Invalid value',
	'catalogue.issue.too_long': 'Text too long',
	'catalogue.issue.invalid_url': 'Invalid address',
	'catalogue.issue.not_positive_integer': 'Invalid number',
	'catalogue.issue.invalid_amount': 'Invalid amount',
	'catalogue.issue.multiple_primary': 'More than one main ingredient',
} satisfies Record<keyof typeof it, string>;
```

Registrarlo in `web/src/i18n/messages/index.ts` come `errors.ts` e le altre aree
(stessa forma `it`/`en`, interpolazione come in `recipes.ts`).

- [ ] **Step 5: query con la gestione dei rifiuti**

```ts
// web/src/features/catalogue/queries.ts
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useApi } from '../../api/ApiProvider';
import { isBlocking, toApiError } from '../../api/errors';
import { useLocale } from '../../i18n/LocaleProvider';

export const catalogueKeys = {
	overview: (locale: string) => ['catalogue', 'overview', { locale }] as const,
	draft: (draftId: string, locale: string) => ['catalogue', 'getDraft', { draftId, locale }] as const,
};

/**
 * Role revoked while the profile is still cached (a read or a mutation answered forbidden):
 * every catalogue view leaves the cache and the profile is read again, so the sections go.
 */
export function useCatalogueRevocation() {
	const queryClient = useQueryClient();
	return useCallback((error: unknown) => {
		if (toApiError(error).code !== 'forbidden') return;
		queryClient.removeQueries({ queryKey: ['catalogue'] });
		void queryClient.invalidateQueries({ queryKey: PROFILE_KEY_PREFIX });
	}, [queryClient]);
}

/** A catalogue read as the other screens do it: a stored copy stays only for a network error. */
function useCatalogueQuery<T>(options: ReturnType<typeof queryOptions<T>>, enabled: boolean) {
	const revoke = useCatalogueRevocation();
	const query = useQuery({ ...options, enabled });
	useEffect(() => {
		if (query.error) revoke(query.error);
	}, [query.error, revoke]);
	const blocked = query.isError && isBlocking(query.error, query.data !== undefined);
	return { query, data: blocked ? undefined : query.data, blocked };
}

export function useOverview(enabled: boolean) {
	const api = useApi();
	const { locale } = useLocale();
	return useCatalogueQuery(queryOptions({ queryKey: catalogueKeys.overview(locale), queryFn: () => api.catalogue.overview({}) }), enabled);
}

export function useDraft(draftId: string, enabled: boolean) {
	const api = useApi();
	const { locale } = useLocale();
	return useCatalogueQuery(queryOptions({ queryKey: catalogueKeys.draft(draftId, locale), queryFn: () => api.catalogue.getDraft({ draftId }) }), enabled);
}

/** No optimistic update (W5 review): after the server answer the overview is read again and recipe lists go stale. */
export function useBringBack() {
	const api = useApi();
	const queryClient = useQueryClient();
	const revoke = useCatalogueRevocation();
	return useMutation({
		mutationFn: (recipeId: string) => api.catalogue.setArchived({ recipeId, archived: false }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['catalogue', 'overview'] });
			await queryClient.invalidateQueries({ queryKey: ['recipes'] });
		},
		onError: revoke,
	});
}
```

`PROFILE_KEY_PREFIX` è il prefisso della chiave della query di `profile.get` introdotta
dalla #18 (per esempio `['profile', 'get']`): importarlo da dove la #18 lo definisce.
`useIsCurator()` legge lo stesso profilo e restituisce
`profile.globalRoles.includes('recipe_curator')`, `false` finché il profilo non è letto.

- [ ] **Step 6: componenti**

```tsx
// web/src/features/catalogue/CatalogueDraftsSection.tsx
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useT } from '../../i18n/LocaleProvider';
import { shortDate } from '../../i18n/dates';
import styles from './catalogue.module.css';
import { useOverview } from './queries';
import { useIsCurator } from './useIsCurator';

export function CatalogueDraftsSection() {
	const isCurator = useIsCurator();
	const t = useT();
	const [open, setOpen] = useState(true);
	const { data } = useOverview(isCurator);
	if (!isCurator || !data || data.drafts.length === 0) return null;
	return (
		<section className={`page-column wide ${styles.section}`}>
			<button type="button" className={styles.heading} aria-expanded={open} onClick={() => setOpen(!open)}>
				{t('catalogue.drafts')} <span className={styles.count}>{data.drafts.length}</span>
			</button>
			{open && (
				<ul className={styles.cards}>
					{data.drafts.map((d) => (
						<li key={d.draftId}>
							<Link to="/recipes/drafts/$draftId" params={{ draftId: d.draftId }} className={styles.card}>
								<span className={styles.kind}>{t(`catalogue.kind.${d.kind}`)}</span>
								<span className={styles.title}>{d.name}</span>
								<span className={styles.meta}>{d.updatedBy.name ?? '—'} · {shortDate(d.updatedAt)}</span>
								<span className={styles.tags}>{d.missing.map((m) => <span key={m} className={styles.tag}>{t(`catalogue.missing.${m}`)}</span>)}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
```

`shortDate` è la funzione della base per «6 ott» in `web/src/i18n/dates.ts` (usare quella
che esiste, con la lingua dell'utente). Classi e token CSS da `design/design.md` e dal
`DraftList` del prototipo (`prototype/src/lib/components/DraftList.svelte`): carta,
etichetta, titolo nel font delle schede, etichette brevi.

`ArchivedRecipesSection` ha la stessa forma: `useOverview(isCurator)`, niente se non
curatore, se i dati sono bloccati o se non ci sono archiviate; sezione chiusa per default
con `aria-expanded`, righe con nome, «Lucia · 5 ott» e il pulsante «Riporta nel
ricettario» (`useBringBack`, disabilitato mentre la mutazione è in corso).

`DraftPage` legge `useDraft(draftId, isCurator)`: per un non curatore `NotFound`; con
`blocked` mostra `QueryError` (che rende `errors.forbidden` dopo una revoca); con i dati:
titolo (`localText` di nome), descrizione, fonte (libro con `bookTitle` e pagine,
indirizzo, «di casa»), durata, porzioni, attributi, righe (nome da `ingredientNames` o
`catalogue.draft.unresolved`, varietà, testo della fonte), elenco dei problemi con
`catalogue.issue.<code>` e il percorso reso leggibile (per esempio «Ingredienti, riga 1»),
autore e ultima modifica, nota `catalogue.draft.formLater`.

- [ ] **Step 7: montaggio e rotta**

```tsx
// web/src/routes/RecipesPage.tsx: solo il corpo di RecipesPage cambia (RecipesView resta di W6)
export function RecipesPage() {
	return (
		<>
			<CatalogueDraftsSection />
			<FamilyGate>{(family) => <RecipesView family={family} />}</FamilyGate>
			<ArchivedRecipesSection />
		</>
	);
}
```

Le sezioni stanno fuori da `FamilyGate` perché il ruolo di curatore non dipende dalla
famiglia (spec, sezione 1). Se dopo la #19 `RecipesPage` ha un'altra forma, la regola resta:
le due sezioni fuori dal cancello della famiglia, `RecipesView` invariato. Nel router la
rotta `/recipes/drafts/$draftId` → `DraftPage`, accanto a `/recipes/$recipeId` (la statica
`drafts` prima del parametro, come vuole TanStack Router).

- [ ] **Step 8: eseguire** `npm test -w web && npm run typecheck && npm run build -w web` → PASS;
  prova visiva con agent-browser sulla porta 8767 (curatore con famiglia, curatore senza
  famiglia, membro): ricettario con bozze e archiviate e pagina della bozza.
- [ ] **Step 9: commit e PR web** — `git commit -m "Web: bozze e ricette archiviate nel ricettario per i curatori"`; PR verso `main` dopo il merge della PR del server.

---

## Self-review

- **Copertura della spec:** sezione 1 (interfacce e firme di `write.ts`) → attività 6, 7 e 9;
  sezione 2 (contratto, errori) → 1 e 4; sezione 3 (server, creazioni atomiche, istante
  delle scritture, equivalenze idempotenti) → 5-9; guida → 5; sezione 4 (migrazione e
  `coverage_test.sql`) → 2; sezione 5 (web: `SERVER_AREAS`, montaggio fuori da
  `FamilyGate`, rifiuti) → 11; compatibilità del web con `not_allowed` → 1; sezione 6
  (test) → in ogni attività; sezione 7 (consegna) → 10 e 11.
- **Tipi coerenti:** `Actor` senza orologio, `actorOf`, `lockCreations`, `writeInstant`,
  `CreatedDraft`, `SavedDraft`, `Published`, `CreatedIngredient`, `CreatedBook`,
  `DraftRow`, `UnitEquivalenceRow`, `Conversion`, `writeVersion` (con `at`),
  `versionConflict`, `publicationCheck` (in `check.ts` dal Task 7) usati con gli stessi
  nomi.
- **Review Focus:** ripetizioni (6, 7, 8, 9, con le creazioni concorrenti), concorrenza
  (6, 9), ingrediente archiviato (7, 8), bozze importate parziali (5), revoca del ruolo
  (5 sul server, 11 nel web): ciascuno ha il suo test.
