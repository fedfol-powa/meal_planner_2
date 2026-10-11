# Revisione dei pasti: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** area `meals` del contratto (suggerimenti, porzioni, ricetta, pasto libero, nota,
scambio, annullamento) con server, strumenti MCP e schermate del Menu, in due PR che
passano ciascuna da sola i controlli di `main`.

**Architecture:** la classifica dei suggerimenti è una funzione pura del pianificatore
(`rankSuggestions`) sulle stesse funzioni della generazione. Il server scrive gli slot e
il registro `meal_changes` nella transazione dell'utente, con id delle modifiche dal client
per l'idempotenza, e risponde con la vista della settimana di `menu.getWeek`. Il web
applica la risposta alla vista della settimana (bersaglio `week` delle mutazioni) senza
aggiornamenti ottimistici e fa scadere le viste che ne dipendono.

**Tech Stack:** TypeScript, zod, oRPC, Postgres.js (Worker Cloudflare), Vitest, React con
TanStack Query e Router, Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-11-revisione-pasti.md` (subordinata a
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 3 e 5).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano; testi
  per l'utente in italiano e inglese britannico (`AGENTS.md`).
- Nessuna dipendenza nuova; nessuna migrazione.
- Porzioni da 1 a 20; testo del pasto libero da 1 a 60 caratteri dopo il trim; nota fino a
  200 caratteri, vuota → `null`; suggerimenti 5 per pagina; proposte rapide al massimo 4.
- Ogni scrittura: `role: 'familyMember'`, `mcp: { readOnly: false }`, `offline: false`,
  `creates: true`, `id` uuid dal client.
- Vince l'ultimo salvataggio, niente avvisi di conflitto né di settimana; annullamento solo
  delle proprie modifiche e solo se lo slot non è cambiato dopo; nessun limite di tempo né
  sui pasti passati lato server.
- Nel web: nessun aggiornamento ottimistico (sezione 1); modifiche impossibili offline;
  «Annulla» per 6 secondi; porzioni salvate 800 ms dopo l'ultimo tocco.
- Etichette «Cambia ricetta» / «Change recipe» e «Non proporre più» / «Don’t suggest
  again» identiche a quelle citate da `exclusions.emptyBody`.
- File condivisi toccati solo per registrare l'area: `contract/src/contract.ts`,
  `contract/src/index.ts`, `contract/src/errors.ts`, `server/src/router.ts`,
  `server/src/messages.ts`, `web/src/api/types.ts`, `web/src/api/mutations.ts`,
  `web/src/api/fake/fakeApi.ts`, `web/src/i18n/messages/index.ts`,
  `web/src/i18n/messages/errors.ts`, `web/src/components/RecipeCard.tsx`,
  `web/src/components/Icon.tsx`, `web/src/routes/MenuPage.tsx`, `web/src/test/rpcServer.ts`.
- Ogni PR passa `supabase test db`, `npm run typecheck`, `npm test` da sola.

## Review Focus

1. **Due richieste uguali concorrenti** (doppio tocco, ritentativo di un agente): la
   seconda deve ricevere la stessa risposta, non `invalid` né una seconda riga del
   registro. Test nel Task 3 (`Promise.all` di due `setNote` con lo stesso `id`).
2. **Scambio con un pasto che contiene una bozza importata o una ricetta archiviata**: lo
   scambio deve riuscire e spostarla. Test nel Task 4.
3. **Annullamento di uno scambio dopo che un altro membro ha cambiato uno solo dei due
   pasti**: niente annullamento parziale, `changed_since` e nessuno dei due slot toccato.
   Test nel Task 5.
4. **«Proponimene altri» oltre la fine della classifica o con un `offset` vecchio dopo che
   la classifica si è accorciata**: si riparte dall'inizio, mai una pagina vuota con
   candidati disponibili. Test nel Task 6.
5. **Annulla dopo il cambio di lingua o di settimana mostrata**: l'avviso resta valido sul
   pasto giusto e la risposta si applica alla settimana del pasto, non a quella mostrata.
   Test nel Task 13.

## Struttura dei file

**Prima PR (server), branch `traguardo/revisione-pasti`:**

| File | Responsabilità |
|---|---|
| `domain/src/planner/suggest.ts` (+ test) | `rankSuggestions` |
| `contract/src/meals/operations.ts`, `views.ts`, `index.ts` (+ test) | area `meals` |
| `contract/src/errors.ts` | motivi `not_own_change`, `changed_since` |
| `server/src/meals/slots.ts` | lettura e blocco degli slot, contenuto |
| `server/src/meals/changes.ts` | scrittura, registro, idempotenza, annullamento |
| `server/src/meals/suggestions.ts` | pagina dei suggerimenti e testi liberi |
| `server/src/meals/router.ts` | factory `mealsRouter(os)` |
| `server/test/meals/*.test.ts`, `server/test/support/meals.ts` | test |

**Seconda PR (web), branch `traguardo/revisione-pasti-web` da `main` dopo il merge della
prima (il coordinatore conferma il nome):**

| File | Responsabilità |
|---|---|
| `web/src/api/fake/fakeMeals.ts` (+ test) | client finto dell'area |
| `web/src/features/meals/queries.ts` | `suggestionsQuery` |
| `web/src/features/meals/useMealMutation.ts` (+ test) | invio, id, applicazione |
| `web/src/features/meals/MealActions.tsx` | matita e pannello |
| `web/src/features/meals/MealEditor.tsx` | foglio e fasi |
| `web/src/features/meals/RecipePicker.tsx` | azioni in cima, suggerimenti, ricerca |
| `web/src/features/meals/SwapPicker.tsx`, `FreeMealForm.tsx`, `NoteForm.tsx` | fasi del foglio |
| `web/src/features/meals/UndoToast.tsx`, `UndoProvider.tsx` | «Annulla» |
| `web/src/features/meals/meals.module.css` | stili dal prototipo e da `design/design.md` |
| `web/src/i18n/messages/meals.ts` | testi |
| `web/src/features/meals/*.test.tsx` | test dei flussi |

---

## Prima PR: server, contratto, MCP

### Task 1: classifica dei suggerimenti nel dominio

**Files:**
- Create: `domain/src/planner/suggest.ts`
- Create: `domain/src/planner/suggest.test.ts`
- Modify: `domain/src/planner/index.ts` (una riga)

**Interfaces:**
- Consumes: `candidatesFor`, `slotRefOf` (`constraints.ts`), `buildContext`,
  `scoreCandidate`, `type Placed` (`score.ts`), `compareIds` (`random.ts`),
  `withSortedCatalogue` (`repair.ts`), `PlannerInput`, `PlannerSlotRef`, `PastMeal`.
- Produces: `rankSuggestions(input: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// domain/src/planner/suggest.test.ts
import { describe, expect, it } from 'vitest';
import { candidatesFor, slotRefOf } from './constraints.ts';
import { rankSuggestions } from './suggest.ts';
import { baseInput, recipe } from './test-fixtures.ts';

const monday = '2026-10-12';
const slot = { date: '2026-10-14', mealType: 'lunch' as const };

describe('rankSuggestions', () => {
	it('ranks the generation candidates, without the current recipe and the other meals of the week', () => {
		const input = baseInput({ weekStart: monday });
		const others = [{ date: '2026-10-13', mealType: 'dinner' as const, recipeId: 'r01' }];
		const ranked = rankSuggestions(input, slot, others, 'r02');
		expect(ranked).not.toContain('r02');
		expect(ranked).not.toContain('r01');
		const expected = new Set(candidatesFor(slotRefOf(slot, input.settings), input, [input.recipes.find((r) => r.id === 'r01')!]).map((r) => r.id));
		expected.delete('r02');
		expect(new Set(ranked)).toEqual(expected);
	});

	it('drops excluded recipes and respects the time limit of the slot', () => {
		const input = baseInput({ weekStart: monday, exclusions: ['r03'] });
		// Monday dinner has a 20-minute limit in familySettings().
		const ranked = rankSuggestions(input, { date: monday, mealType: 'dinner' }, [], null);
		expect(ranked).not.toContain('r03');
		for (const id of ranked) expect(input.recipes.find((r) => r.id === id)!.durationMinutes).toBeLessThanOrEqual(20);
	});

	it('counts the other meals against the weekly maximum of a limited ingredient', () => {
		const recipes = [
			recipe('a', { ingredients: [{ ingredientId: 'salmon', isOptional: false }] }),
			recipe('b', { ingredients: [{ ingredientId: 'salmon', isOptional: false }] }),
			recipe('c'),
		];
		const input = baseInput({ weekStart: monday, recipes, restrictions: [{ ingredientId: 'salmon', restriction: 'limit', weeklyMax: 1 }] });
		const ranked = rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'lunch', recipeId: 'a' }], null);
		expect(ranked).toEqual(['c']);
	});

	it('orders by score, then id, the same every time', () => {
		const make = () => baseInput({ weekStart: monday, familyScores: { r05: 5 } });
		const first = rankSuggestions(make(), slot, [], null);
		expect(rankSuggestions(make(), slot, [], null)).toEqual(first);
		// r05 fits a lunch (index 5: 'both') and is the only five-star recipe.
		expect(first[0]).toBe('r05');
	});

	it('ignores other meals whose recipe is not in the catalogue (archived, imported drafts)', () => {
		const input = baseInput({ weekStart: monday });
		expect(() => rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'lunch', recipeId: 'archived' }], null)).not.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run domain/src/planner/suggest.test.ts`
Expected: FAIL, `Failed to resolve import "./suggest.ts"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// domain/src/planner/suggest.ts
import { candidatesFor, slotRefOf } from './constraints.ts';
import { compareIds } from './random.ts';
import { withSortedCatalogue } from './repair.ts';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import type { PastMeal, PlannerInput, PlannerSlotRef } from './types.ts';

/**
 * Recipe ids for one slot, best first (spec section 3, «Riuso durante la revisione»): the
 * generation's candidates and score with the other meals of the week fixed, without the
 * slot's current recipe. Deterministic: score, then id.
 */
export function rankSuggestions(rawInput: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[] {
	const input = withSortedCatalogue(rawInput);
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const placed: Placed[] = otherMeals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
	});
	const ctx = buildContext(input, placed);
	return candidatesFor(slotRefOf(slot, input.settings), input, placed.map((p) => p.recipe))
		.filter((r) => r.id !== currentRecipeId)
		.map((recipe) => ({ id: recipe.id, score: scoreCandidate(recipe, slot, ctx) }))
		.sort((a, b) => b.score - a.score || compareIds(a.id, b.id))
		.map((r) => r.id);
}
```

Add to `domain/src/planner/index.ts`: `export * from './suggest.ts';`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run domain/src/planner/suggest.test.ts && npm run typecheck`
Expected: PASS. If `withSortedCatalogue` is not exported, it is (`repair.ts:101`); if the
first test fails because `candidatesFor` without `withSortedCatalogue` orders differently,
compare sets only (as written).

- [ ] **Step 5: Commit**

```bash
git add domain/src/planner/suggest.ts domain/src/planner/suggest.test.ts domain/src/planner/index.ts
git commit -m "Pianificatore: classifica dei suggerimenti per uno slot con gli altri pasti fissati"
```

### Task 2: motivi nuovi di `not_allowed` e testo generico

**Files:**
- Modify: `contract/src/errors.ts` (enum di `notAllowedData`)
- Modify: `contract/src/errors.test.ts`
- Modify: `server/src/messages.ts` (`not_allowed`)
- Modify: `web/src/i18n/messages/errors.ts` (`errors.not_allowed`, due lingue)

**Interfaces:**
- Produces: `NotAllowedReason` comprende `'not_own_change' | 'changed_since'`.

- [ ] **Step 1: Write the failing test** (in `contract/src/errors.test.ts`)

```ts
import { notAllowedData } from './errors.ts';

it('not_allowed carries the reasons of the meal undo', () => {
	for (const reason of ['not_own_change', 'changed_since']) expect(notAllowedData.parse({ reason })).toEqual({ reason });
});
```

- [ ] **Step 2: Run** `npx vitest run contract/src/errors.test.ts` — Expected: FAIL (invalid enum value).

- [ ] **Step 3: Implement**

```ts
// contract/src/errors.ts
/** A rule of state, not wrong data: a cited draft, a never-published recipe, the current version, a meal change that cannot be undone. */
export const notAllowedData = z.object({
	reason: z.enum(['cited_by_meals', 'not_published', 'already_current', 'not_own_change', 'changed_since']),
});
```

```ts
// server/src/messages.ts
	not_allowed: {
		'it-IT': 'Operazione non consentita nello stato attuale.',
		'en-GB': 'This operation is not allowed in the current state.',
	},
```

```ts
// web/src/i18n/messages/errors.ts
  'errors.not_allowed': 'Non si può fare nello stato attuale.',
  // en-GB
  'errors.not_allowed': 'This cannot be done in the current state.',
```

- [ ] **Step 4: Run** `npm run typecheck && npx vitest run contract server/test/errors.test.ts && npm test -w web -- errors` — Expected: PASS; se un test cita il vecchio testo, aggiornarlo.

- [ ] **Step 5: Commit**

```bash
git add contract/src/errors.ts contract/src/errors.test.ts server/src/messages.ts web/src/i18n/messages/errors.ts
git commit -m "Contratto: motivi not_own_change e changed_since, testo generico di not_allowed"
```

### Task 3: area `meals` con le scritture su un pasto

**Files:**
- Create: `contract/src/meals/views.ts`, `contract/src/meals/operations.ts`, `contract/src/meals/index.ts`, `contract/src/meals/meals-contract.test.ts`
- Modify: `contract/src/contract.ts` (registra `meals: mealsContract`), `contract/src/index.ts` (`export * from './meals/index.ts';`)
- Create: `server/src/meals/slots.ts`, `server/src/meals/changes.ts`, `server/src/meals/router.ts`
- Modify: `server/src/router.ts` (`meals: mealsRouter(os)`)
- Create: `server/test/support/meals.ts`, `server/test/meals/writes.test.ts`

**Interfaces:**
- Consumes: `weekView` (`contract/src/menu/views.ts`), `weekViewOf(context, familyId, weekStartsOn)`, `appError`, `Implementer`, `OperationContext`, `menuFixtures`, `setupActors`, `errorOf`.
- Produces:
  - contratto: `mealsContract.{setServings,setRecipe,setFree,setNote}`, `mealChangeResult`, `type MealChangeResult`;
  - `server/src/meals/slots.ts`: `interface SlotRow { id; weekId; startsOn; date; mealType; recipeId; freeText; servings; note }`, `type SlotContent = { recipeId: string | null; freeText: string | null; servings: number; note: string | null }`, `contentOf(row): SlotContent`, `sameContent(a, b): boolean`, `lockSlots(tx, familyId, slotIds): Promise<SlotRow[]>` (ordinati per id, `not_found` se ne manca uno), `readSlot(tx, familyId, slotId): Promise<SlotRow>`;
  - `server/src/meals/changes.ts`: `interface Edit { slot: SlotRow; id: string; after: SlotContent; idPath: string }`, `applyEdits(context, familyId, edits: Edit[]): Promise<MealChangeResult>`, `replayed(context, familyId, edits): Promise<MealChangeResult | null>`.

- [ ] **Step 1: Contract test (failing)**

```ts
// contract/src/meals/meals-contract.test.ts
import { describe, expect, it } from 'vitest';
import { checkContract } from '../check.ts';
import { contract } from '../contract.ts';

describe('meals contract', () => {
	it('declares member writes that create a change with a client id', () => {
		for (const name of ['setServings', 'setRecipe', 'setFree', 'setNote'] as const) {
			expect(contract.meals[name]['~orpc'].meta).toEqual({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
		}
		expect(checkContract(contract)).toEqual([]);
	});
	it('validates the inputs', () => {
		const base = { familyId: crypto.randomUUID(), slotId: crypto.randomUUID(), id: crypto.randomUUID() };
		const servings = contract.meals.setServings['~orpc'].inputSchema!;
		expect(servings['~standard'].validate({ ...base, servings: 0 })).toHaveProperty('issues');
		expect(servings['~standard'].validate({ ...base, servings: 21 })).toHaveProperty('issues');
		const free = contract.meals.setFree['~orpc'].inputSchema!;
		expect(free['~standard'].validate({ ...base, text: '   ' })).toHaveProperty('issues');
		expect(free['~standard'].validate({ ...base, text: 'x'.repeat(61) })).toHaveProperty('issues');
		const note = contract.meals.setNote['~orpc'].inputSchema!;
		expect(note['~standard'].validate({ ...base, note: 'x'.repeat(201) })).toHaveProperty('issues');
		expect(note['~standard'].validate({ ...base, note: null })).not.toHaveProperty('issues');
	});
});
```

(Se `checkContract` ha un'altra firma, adattare la chiamata a quella usata in `contract/src/contract.test.ts`.)

- [ ] **Step 2: Run** `npx vitest run contract/src/meals` — Expected: FAIL (`contract.meals` undefined).

- [ ] **Step 3: Contract**

```ts
// contract/src/meals/views.ts
import { z } from 'zod';
import { weekView } from '../menu/views.ts';

export const mealChangeResult = z.object({
	week: weekView,
	/** Rows written to meal_changes, for meals.undo; empty when nothing changed. */
	changeIds: z.array(z.uuid()).max(2),
});
export type MealChangeResult = z.infer<typeof mealChangeResult>;
```

```ts
// contract/src/meals/operations.ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { mealChangeResult } from './views.ts';

const slot = z.object({ familyId: z.uuid(), slotId: z.uuid() });
/** Every write creates a meal_changes row whose id comes from the client. */
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
const notFound = { not_found: errorDefinitions.not_found };
const idHint = '`id` is a new UUID you generate for this change; repeating the same request changes nothing';

export const mealsContract = {
	setServings: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/servings', summary: `Set the servings of a meal (1-20). ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), servings: z.number().int().min(1).max(20) }))
		.output(mealChangeResult),
	setRecipe: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/recipe', summary: `Put a published recipe in a meal, from the suggestions or a recipe search. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), recipeId: z.uuid() }))
		.output(mealChangeResult),
	setFree: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/free-text', summary: `Mark a meal as free (eating out, pizza...) with a short text; the note stays. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), text: z.string().trim().min(1).max(60) }))
		.output(mealChangeResult),
	setNote: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/note', summary: `Write the note of a meal (up to 200 characters, seen by the whole family) or remove it with null. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), note: z.string().trim().max(200).nullable() }))
		.output(mealChangeResult),
};
```

```ts
// contract/src/meals/index.ts
export { mealsContract } from './operations.ts';
export * from './views.ts';
```

In `contract/src/contract.ts`: `import { mealsContract } from './meals/index.ts';` e
`meals: mealsContract,` dopo `menu`.

- [ ] **Step 4: Run** `npx vitest run contract && npm run typecheck` — Expected: the contract test passes, typecheck FAILS in `server/src/router.ts` (missing `meals`). This is the signal for the next steps.

- [ ] **Step 5: Server test fixtures**

```ts
// server/test/support/meals.ts
import { menuFixtures } from './menu.ts';
import type { Actors } from './actors.ts';

/** A family of two members with one week of three slots: a recipe, a free meal, an empty one. */
export async function mealsSetup(actors: Actors) {
	const fx = menuFixtures(actors.db);
	const anna = await actors.user();
	const bruno = await actors.user();
	const agent = { ...anna, client: (await actors.user({ agent: true })).client };
	const familyId = await actors.db.createFamily([
		{ userId: anna.userId, role: 'family_admin' },
		{ userId: bruno.userId, role: 'member' },
	]);
	await actors.db.admin`update app.profiles set display_name = 'Anna' where user_id = ${anna.userId}`;
	const recipes = await Promise.all(Array.from({ length: 12 }, () => fx.publishRecipe()));
	const weekStartsOn = '2026-10-12';
	const weekId = await fx.insertWeek(familyId, weekStartsOn);
	const slots = {
		monLunch: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId: recipes[0] }),
		monDinner: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'dinner', freeText: 'Pizza' }),
		tueLunch: await fx.insertSlot(weekId, { date: '2026-10-13', mealType: 'lunch' }),
	};
	const changes = (slotId: string) => actors.db.admin<{ id: string; actor_id: string; channel: string; before: unknown; after: unknown; undoes: string | null }[]>`
		select id, actor_id, channel, before, after, undoes from app.meal_changes where meal_slot_id = ${slotId} order by created_at, id`;
	return { fx, anna, bruno, agent, familyId, recipes, weekStartsOn, weekId, slots, changes };
}

export const mealOf = (week: { days: { meals: { slotId: string }[] }[] }, slotId: string) =>
	week.days.flatMap((d) => d.meals).find((m) => m.slotId === slotId)!;
```

(`agent` usa un token di un altro utente con `client_id`: per il canale `mcp` dello
stesso utente creare l'attore così: `const anna = await actors.user(); const annaAgent = { client: rpcClient(app, env, await keys.sign({ sub: anna.userId, session_id: anna.sessionId, client_id: 'test-agent' })) }` usando `rpcClient` e `testEnv` da `support/requests.ts`; sostituire la riga di `agent` con questa forma.)

- [ ] **Step 6: Write the failing server tests**

```ts
// server/test/meals/writes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal writes', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('sets servings, logs the change with channel web and answers the week', async () => {
		const changeId = id();
		const result = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: changeId, servings: 5 });
		expect(result.changeIds).toEqual([changeId]);
		const meal = mealOf(result.week, s.slots.monLunch);
		expect(meal.servings).toBe(5);
		expect(meal.lastChange?.userName).toBe('Anna');
		const [row] = await s.changes(s.slots.monLunch);
		expect(row).toMatchObject({ id: changeId, actor_id: s.anna.userId, channel: 'web', undoes: null });
		expect(row!.before).toMatchObject({ servings: 2 });
		expect(row!.after).toMatchObject({ servings: 5 });
	});

	it('records channel mcp for an agent token', async () => {
		await s.agent.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'from the agent' });
		const rows = await s.changes(s.slots.tueLunch);
		expect(rows.at(-1)!.channel).toBe('mcp');
	});

	it('sets a recipe on an empty slot and a free text on a recipe, keeping the note', async () => {
		const withRecipe = await s.bruno.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), recipeId: s.recipes[3]! });
		expect(mealOf(withRecipe.week, s.slots.tueLunch)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[3] } });
		const free = await s.bruno.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), text: '  Cena fuori  ' });
		expect(mealOf(free.week, s.slots.tueLunch)).toMatchObject({ kind: 'free', freeText: 'Cena fuori', recipe: null, note: 'from the agent' });
	});

	it('turns an empty note into null', async () => {
		const result = await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: '   ' });
		expect(mealOf(result.week, s.slots.tueLunch).note).toBeNull();
	});

	it('does not log a write without effect', async () => {
		const before = (await s.changes(s.slots.monLunch)).length;
		const result = await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 5 });
		expect(result.changeIds).toEqual([]);
		expect((await s.changes(s.slots.monLunch)).length).toBe(before);
		expect(mealOf(result.week, s.slots.monLunch).lastChange?.userName).toBe('Anna');
	});

	it('repeats a request without writing twice, also when the two copies run together', async () => {
		const changeId = id();
		const input = { familyId: s.familyId, slotId: s.slots.monDinner, id: changeId, note: 'twice' };
		const [a, b] = await Promise.all([s.anna.client.meals.setNote(input), s.anna.client.meals.setNote(input)]);
		expect(a.changeIds).toEqual([changeId]);
		expect(b.changeIds).toEqual([changeId]);
		expect((await s.changes(s.slots.monDinner)).filter((r) => r.id === changeId)).toHaveLength(1);
	});

	it('refuses an id already used by someone else or on another slot', async () => {
		const changeId = id();
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: changeId, note: 'a' });
		const other = await errorOf(s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: changeId, note: 'b' }));
		expect(other.code).toBe('invalid');
		expect(other.data.issues[0].path).toEqual(['id']);
		const slot = await errorOf(s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: changeId, note: 'c' }));
		expect(slot.code).toBe('invalid');
	});

	it('refuses an id used in another family as invalid', async () => {
		const stranger = await actors.user();
		const fx = s.fx;
		const strangerFamily = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		const week = await fx.insertWeek(strangerFamily, '2026-10-12');
		const slot = await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', freeText: 'x' });
		const shared = id();
		await stranger.client.meals.setNote({ familyId: strangerFamily, slotId: slot, id: shared, note: 'mine' });
		expect((await errorOf(s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: shared, note: 'x' }))).code).toBe('invalid');
	});

	it('answers not_found for a slot of another family and forbidden for a stranger', async () => {
		const stranger = await actors.user();
		const strangerFamily = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.setServings({ familyId: strangerFamily, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('not_found');
		expect((await errorOf(stranger.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('forbidden');
	});

	it('refuses drafts, archived and unknown recipes with not_found', async () => {
		const cat = catalogueFixture(actors.db);
		const archived = await s.fx.publishRecipe();
		await cat.archive(archived);
		const draft = await s.fx.draftRecipe('Bozza');
		for (const recipeId of [archived, draft, crypto.randomUUID()]) {
			expect((await errorOf(s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId }))).code).toBe('not_found');
		}
	});

	it('changes a past meal; it shows the version in force when it passed (R1)', async () => {
		// Week of 12 October is past at the test's real now (after 18 October 2026) or not: the
		// check is on consistency with menu.getWeek, whatever the instant.
		const result = await s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId: s.recipes[4]! });
		const read = await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		if (read.unchanged) throw new Error('expected data');
		expect(mealOf(result.week, s.slots.monLunch)).toEqual(mealOf(read.data, s.slots.monLunch));
	});

	it('makes the week and the shopping list read as changed', async () => {
		const week = await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		const list = await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 7 });
		const again = await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: week.version });
		const listAgain = await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: list.version });
		expect(again.unchanged).toBe(false);
		expect(listAgain.unchanged).toBe(false);
	});
});
```

(Il percorso dell'area spesa nel client è quello registrato nel contratto: verificare se è
`shopping.getWeekList` o un'altra forma, dato che `contract.ts` usa `...shoppingContract`.)

- [ ] **Step 7: Run** `npx vitest run server/test/meals/writes.test.ts` — Expected: FAIL (typecheck/compile: `meals` not in router).

- [ ] **Step 8: Implement `slots.ts`**

```ts
// server/src/meals/slots.ts
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

export interface SlotRow {
	id: string;
	weekId: string;
	startsOn: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
}

/** What a meal_changes row keeps of a slot (spec of the revision, section 3). */
export interface SlotContent {
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
}

export const contentOf = (s: SlotContent): SlotContent => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });

export const sameContent = (a: SlotContent, b: SlotContent) =>
	a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

const columns = (tx: Tx) => tx`
	s.id, s.week_id as "weekId", w.starts_on::text as "startsOn", s.date::text as date, s.meal_type as "mealType",
	s.recipe_id as "recipeId", s.free_text as "freeText", s.servings, s.note`;

/**
 * The slots of the family, locked for the transaction in id order (two crossed swaps never
 * deadlock). Under RLS: a slot of another family or missing is not_found.
 */
export async function lockSlots(tx: Tx, familyId: string, slotIds: string[]): Promise<SlotRow[]> {
	const unique = [...new Set(slotIds)].sort();
	const rows = await tx<SlotRow[]>`
		select ${columns(tx)}
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = any(${unique}::uuid[]) and w.family_id = ${familyId}
		order by s.id
		for update of s`;
	if (rows.length !== unique.length) throw appError('not_found');
	return rows;
}

export async function readSlot(tx: Tx, familyId: string, slotId: string): Promise<SlotRow> {
	const [row] = await tx<SlotRow[]>`
		select ${columns(tx)}
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = ${slotId} and w.family_id = ${familyId}`;
	if (!row) throw appError('not_found');
	return row;
}
```

(Se il frammento `columns(tx)` non si compone con Postgres.js, ripetere la lista delle
colonne nelle due query.)

- [ ] **Step 9: Implement `changes.ts`**

```ts
// server/src/meals/changes.ts
import type { MealChangeResult } from '@app/contract';
import { appError } from '../errors.ts';
import { weekViewOf } from '../menu/week-view.ts';
import type { OperationContext } from '../pipeline.ts';
import { contentOf, sameContent, type SlotContent, type SlotRow } from './slots.ts';

export interface Edit {
	slot: SlotRow;
	/** Client id of the meal_changes row. */
	id: string;
	after: SlotContent;
	/** Input field of the id, for `invalid`. */
	idPath: string;
	/** The change this edit undoes (meals.undo). */
	undoes?: string;
}

const invalidId = (path: string) => appError('invalid', { issues: [{ path: [path], code: 'already_used' }] });

/**
 * Idempotency (spec of the revision, section 3), after the slots are locked: a request already
 * applied answers the current week; an id of someone else, of another slot or of another undo is
 * invalid. Null when no id of the request exists yet.
 */
async function replayed(context: OperationContext, familyId: string, edits: Edit[]): Promise<MealChangeResult | null> {
	const ids = edits.map((e) => e.id);
	const rows = await context.tx<{ id: string; slotId: string; actorId: string | null; undoes: string | null }[]>`
		select id, meal_slot_id as "slotId", actor_id as "actorId", undoes from app.meal_changes where id = any(${ids}::uuid[])`;
	if (rows.length === 0) return null;
	for (const edit of edits) {
		const row = rows.find((r) => r.id === edit.id);
		if (!row) continue;
		if (row.actorId !== context.userId || row.slotId !== edit.slot.id || (row.undoes ?? undefined) !== edit.undoes) throw invalidId(edit.idPath);
	}
	const startsOn = edits[0]!.slot.startsOn;
	return { week: await weekViewOf(context, familyId, startsOn), changeIds: rows.map((r) => r.id).sort((a, b) => ids.indexOf(a) - ids.indexOf(b)) };
}

/**
 * Writes the edits on locked slots: content columns, author and time, one meal_changes row per
 * changed slot; slots whose content does not change are not logged. Answers the week of the
 * slots with the ids written.
 */
export async function applyEdits(context: OperationContext, familyId: string, edits: Edit[]): Promise<MealChangeResult> {
	const replay = await replayed(context, familyId, edits);
	if (replay) return replay;
	const { tx } = context;
	const written: string[] = [];
	for (const edit of edits) {
		const before = contentOf(edit.slot);
		if (sameContent(before, edit.after)) continue;
		await tx`
			update app.meal_slots
			set recipe_id = ${edit.after.recipeId}, free_text = ${edit.after.freeText}, servings = ${edit.after.servings},
				note = ${edit.after.note}, updated_by = auth.uid(), updated_at = now()
			where id = ${edit.slot.id}`;
		try {
			await tx`
				insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after, undoes)
				values (${edit.id}, ${edit.slot.id}, auth.uid(), ${context.channel}, ${tx.json(before)}, ${tx.json(edit.after)}, ${edit.undoes ?? null})`;
		} catch (error) {
			// An id already used in another family is invisible here: the primary key tells.
			if ((error as { code?: string }).code === '23505') throw invalidId(edit.idPath);
			throw error;
		}
		written.push(edit.id);
	}
	return { week: await weekViewOf(context, familyId, edits[0]!.slot.startsOn), changeIds: written };
}
```

(`tx.json` richiede che `before`/`after` siano JSON semplici: `SlotContent` lo è.)

- [ ] **Step 10: Implement the router and register it**

```ts
// server/src/meals/router.ts
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { applyEdits } from './changes.ts';
import { contentOf, lockSlots } from './slots.ts';

export function mealsRouter(os: Implementer) {
	return {
		setServings: os.meals.setServings.handler(async ({ context, input }) => {
			const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
			return applyEdits(context, input.familyId, [{ slot: slot!, id: input.id, idPath: 'id', after: { ...contentOf(slot!), servings: input.servings } }]);
		}),
		/** Only published recipes: drafts and archived ones are not offered (spec section 5). */
		setRecipe: os.meals.setRecipe.handler(async ({ context, input }) => {
			const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
			const [recipe] = await context.tx`select 1 from app.recipes where id = ${input.recipeId} and status = 'published'`;
			if (!recipe) throw appError('not_found');
			return applyEdits(context, input.familyId, [{ slot: slot!, id: input.id, idPath: 'id', after: { ...contentOf(slot!), recipeId: input.recipeId, freeText: null } }]);
		}),
		setFree: os.meals.setFree.handler(async ({ context, input }) => {
			const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
			return applyEdits(context, input.familyId, [{ slot: slot!, id: input.id, idPath: 'id', after: { ...contentOf(slot!), recipeId: null, freeText: input.text } }]);
		}),
		setNote: os.meals.setNote.handler(async ({ context, input }) => {
			const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
			return applyEdits(context, input.familyId, [{ slot: slot!, id: input.id, idPath: 'id', after: { ...contentOf(slot!), note: input.note || null } }]);
		}),
	};
}
```

In `server/src/router.ts`: `import { mealsRouter } from './meals/router.ts';` e
`meals: mealsRouter(os),` dopo `menu`.

- [ ] **Step 11: Run** `npm run typecheck && npx vitest run server/test/meals contract` — Expected: PASS. Then `npm test` (all workspaces): PASS (MCP tests that list every tool may need the new names: update them in this task).

- [ ] **Step 12: Commit**

```bash
git add contract/src/meals contract/src/contract.ts contract/src/index.ts server/src/meals server/src/router.ts server/test/support/meals.ts server/test/meals
git commit -m "Revisione dei pasti: porzioni, ricetta, pasto libero e nota con registro e idempotenza"
```

### Task 4: scambio

**Files:**
- Modify: `contract/src/meals/operations.ts`, `contract/src/meals/meals-contract.test.ts`
- Modify: `server/src/meals/router.ts`
- Create: `server/test/meals/swap.test.ts`

**Interfaces:**
- Consumes: `lockSlots`, `applyEdits`, `contentOf` (Task 3).
- Produces: `mealsContract.swap` con input `{familyId, slotId, id, otherSlotId, otherId}`.

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/swap.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal swap', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('moves dish and note, servings stay, one change per slot', async () => {
		await actors.db.admin`update app.meal_slots set note = 'n1', servings = 3 where id = ${s.slots.monLunch}`;
		const [a, b] = [id(), id()];
		const result = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: a, otherSlotId: s.slots.monDinner, otherId: b });
		expect(result.changeIds).toEqual([a, b]);
		expect(mealOf(result.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza', note: null, servings: 3 });
		expect(mealOf(result.week, s.slots.monDinner)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[0] }, note: 'n1', servings: 2 });
		expect((await s.changes(s.slots.monLunch)).at(-1)!.id).toBe(a);
		expect((await s.changes(s.slots.monDinner)).at(-1)!.id).toBe(b);
	});

	it('moves an archived recipe or an imported draft', async () => {
		const cat = catalogueFixture(actors.db);
		const archived = await s.fx.publishRecipe();
		await cat.archive(archived);
		const draft = await s.fx.draftRecipe('Bozza importata');
		await actors.db.admin`update app.meal_slots set recipe_id = ${archived}, free_text = null where id = ${s.slots.monLunch}`;
		await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.tueLunch}`;
		const result = await s.bruno.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), otherSlotId: s.slots.tueLunch, otherId: id() });
		expect(mealOf(result.week, s.slots.tueLunch).recipe?.id).toBe(archived);
		expect(mealOf(result.week, s.slots.monLunch).recipe?.id).toBe(draft);
	});

	it('refuses the same slot, the same id, a slot of another week; not_found for another family', async () => {
		const same = await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), otherSlotId: s.slots.monLunch, otherId: id() }));
		expect(same.code).toBe('invalid');
		const one = id();
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: one, otherSlotId: s.slots.monDinner, otherId: one }))).code).toBe('invalid');
		const nextWeek = await s.fx.insertWeek(s.familyId, '2026-10-19');
		const far = await s.fx.insertSlot(nextWeek, { date: '2026-10-19', mealType: 'lunch', freeText: 'x' });
		const week = await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), otherSlotId: far, otherId: id() }));
		expect(week.code).toBe('invalid');
		expect(week.data.issues[0].path).toEqual(['otherSlotId']);
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), otherSlotId: crypto.randomUUID(), otherId: id() }))).code).toBe('not_found');
	});

	it('two crossed swaps at once both finish', async () => {
		await Promise.all([
			s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), otherSlotId: s.slots.tueLunch, otherId: id() }),
			s.bruno.client.meals.swap({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), otherSlotId: s.slots.monLunch, otherId: id() }),
		]);
	});
});
```

Add to the contract test: `swap` meta equal to the other writes, and input with `otherSlotId`, `otherId`.

- [ ] **Step 2: Run** `npx vitest run server/test/meals/swap.test.ts` — Expected: FAIL (`meals.swap` missing).

- [ ] **Step 3: Implement**

```ts
// contract/src/meals/operations.ts, in mealsContract
	swap: write()
		.route({
			method: 'POST',
			path: '/families/{familyId}/meals/{slotId}/swap',
			summary: 'Swap two meals of the same week: dish or free text and note move, servings stay. `id` and `otherId` are two new UUIDs, one per meal',
		})
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), otherSlotId: z.uuid(), otherId: z.uuid() }))
		.output(mealChangeResult),
```

```ts
// server/src/meals/router.ts, in mealsRouter
		/** Dish or free text and note move, servings stay with the slot (spec section 5). */
		swap: os.meals.swap.handler(async ({ context, input }) => {
			const issue = (path: string, code: string) => appError('invalid', { issues: [{ path: [path], code }] });
			if (input.otherSlotId === input.slotId) throw issue('otherSlotId', 'same_slot');
			if (input.otherId === input.id) throw issue('otherId', 'same_id');
			const rows = await lockSlots(context.tx, input.familyId, [input.slotId, input.otherSlotId]);
			const slot = rows.find((r) => r.id === input.slotId)!;
			const other = rows.find((r) => r.id === input.otherSlotId)!;
			if (slot.weekId !== other.weekId) throw issue('otherSlotId', 'other_week');
			const moved = (from: typeof slot) => ({ recipeId: from.recipeId, freeText: from.freeText, note: from.note });
			return applyEdits(context, input.familyId, [
				{ slot, id: input.id, idPath: 'id', after: { ...contentOf(slot), ...moved(other) } },
				{ slot: other, id: input.otherId, idPath: 'otherId', after: { ...contentOf(other), ...moved(slot) } },
			]);
		}),
```

- [ ] **Step 4: Run** `npm run typecheck && npx vitest run server/test/meals contract/src/meals` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src/meals server/src/meals server/test/meals/swap.test.ts
git commit -m "Revisione dei pasti: scambio nella stessa settimana"
```

### Task 5: annullamento

**Files:**
- Modify: `contract/src/meals/operations.ts`, `contract/src/meals/meals-contract.test.ts`
- Modify: `server/src/meals/changes.ts` (aggiunge `undoEdits`), `server/src/meals/router.ts`
- Create: `server/test/meals/undo.test.ts`

**Interfaces:**
- Consumes: `lockSlots`, `applyEdits`, `Edit` (Task 3).
- Produces: `mealsContract.undo` con input `{familyId, changeIds: uuid[1..2], id, otherId?}`; `undoEdits(context, familyId, input): Promise<MealChangeResult>`.

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/undo.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal undo', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();
	const familyId = () => s.familyId;

	it('restores the content with a new change that undoes the first', async () => {
		const changed = await s.anna.client.meals.setServings({ familyId: familyId(), slotId: s.slots.monLunch, id: id(), servings: 6 });
		const undoId = id();
		const result = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: undoId });
		expect(result.changeIds).toEqual([undoId]);
		expect(mealOf(result.week, s.slots.monLunch).servings).toBe(2);
		expect((await s.changes(s.slots.monLunch)).at(-1)).toMatchObject({ id: undoId, undoes: changed.changeIds[0] });
		// Repeated: same answer, nothing new.
		const again = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: undoId });
		expect(again.changeIds).toEqual([undoId]);
		expect((await s.changes(s.slots.monLunch)).filter((r) => r.id === undoId)).toHaveLength(1);
	});

	it('refuses another member’s change with not_own_change', async () => {
		const changed = await s.bruno.client.meals.setNote({ familyId: familyId(), slotId: s.slots.tueLunch, id: id(), note: 'Bruno' });
		const error = await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: id() }));
		expect(error.code).toBe('not_allowed');
		expect(error.data).toEqual({ reason: 'not_own_change' });
	});

	it('refuses with changed_since after a later change, and a change already undone', async () => {
		const mine = await s.anna.client.meals.setNote({ familyId: familyId(), slotId: s.slots.tueLunch, id: id(), note: 'Anna' });
		await s.bruno.client.meals.setNote({ familyId: familyId(), slotId: s.slots.tueLunch, id: id(), note: 'Bruno again' });
		expect((await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: mine.changeIds, id: id() }))).data).toEqual({ reason: 'changed_since' });
		const other = await s.anna.client.meals.setNote({ familyId: familyId(), slotId: s.slots.tueLunch, id: id(), note: 'once' });
		await s.anna.client.meals.undo({ familyId: familyId(), changeIds: other.changeIds, id: id() });
		expect((await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: other.changeIds, id: id() }))).data).toEqual({ reason: 'changed_since' });
	});

	it('undoes an undo', async () => {
		const changed = await s.anna.client.meals.setServings({ familyId: familyId(), slotId: s.slots.monLunch, id: id(), servings: 8 });
		const undone = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: id() });
		const redone = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: undone.changeIds, id: id() });
		expect(mealOf(redone.week, s.slots.monLunch).servings).toBe(8);
	});

	it('undoes a swap entirely, or not at all', async () => {
		const swapped = await s.anna.client.meals.swap({ familyId: familyId(), slotId: s.slots.monLunch, id: id(), otherSlotId: s.slots.monDinner, otherId: id() });
		const [a, b] = [id(), id()];
		const undone = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: swapped.changeIds, id: a, otherId: b });
		expect(undone.changeIds).toEqual([a, b]);
		expect(mealOf(undone.week, s.slots.monDinner)).toMatchObject({ kind: 'free', freeText: 'Pizza' });

		const again = await s.anna.client.meals.swap({ familyId: familyId(), slotId: s.slots.monLunch, id: id(), otherSlotId: s.slots.monDinner, otherId: id() });
		await s.bruno.client.meals.setNote({ familyId: familyId(), slotId: s.slots.monDinner, id: id(), note: 'Bruno' });
		const before = await actors.db.admin`select id, recipe_id, free_text, note from app.meal_slots where id in (${s.slots.monLunch}, ${s.slots.monDinner}) order by id`;
		expect((await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: again.changeIds, id: id(), otherId: id() }))).data).toEqual({ reason: 'changed_since' });
		expect(await actors.db.admin`select id, recipe_id, free_text, note from app.meal_slots where id in (${s.slots.monLunch}, ${s.slots.monDinner}) order by id`).toEqual(before);
	});

	it('works on a past meal and needs otherId exactly with two changes', async () => {
		const pastWeek = await s.fx.insertWeek(familyId(), '2026-01-05');
		const past = await s.fx.insertSlot(pastWeek, { date: '2026-01-05', mealType: 'lunch', recipeId: s.recipes[1] });
		const changed = await s.anna.client.meals.setServings({ familyId: familyId(), slotId: past, id: id(), servings: 4 });
		expect((await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: id(), otherId: id() }))).code).toBe('invalid');
		const undone = await s.anna.client.meals.undo({ familyId: familyId(), changeIds: changed.changeIds, id: id() });
		expect(mealOf(undone.week, past).servings).toBe(2);
	});

	it('answers not_found for an unknown change', async () => {
		expect((await errorOf(s.anna.client.meals.undo({ familyId: familyId(), changeIds: [crypto.randomUUID()], id: id() }))).code).toBe('not_found');
	});
});
```

- [ ] **Step 2: Run** `npx vitest run server/test/meals/undo.test.ts` — Expected: FAIL.

- [ ] **Step 3: Contract**

```ts
// contract/src/meals/operations.ts, in mealsContract
	undo: write()
		.route({
			method: 'POST',
			path: '/families/{familyId}/meals/undo',
			summary:
				'Undo your own change of a meal, given the changeIds a write answered with (the two of a swap together), if nobody changed the meal since. `id` (and `otherId` for two changes) are new UUIDs',
		})
		.errors({ ...notFound, not_allowed: errorDefinitions.not_allowed })
		.input(
			z.object({
				familyId: z.uuid(),
				changeIds: z.array(z.uuid()).min(1).max(2),
				id: z.uuid(),
				otherId: z.uuid().optional(),
			}),
		)
		.output(mealChangeResult),
```

- [ ] **Step 4: Server**

```ts
// server/src/meals/changes.ts (added)
import { lockSlots, type SlotContent } from './slots.ts';

const notAllowed = (reason: 'not_own_change' | 'changed_since') => appError('not_allowed', { reason });

/**
 * meals.undo (spec section 5): own changes only, only while each slot is as the change left it
 * (its last logged change and the same content); all or nothing; no time limit.
 */
export async function undoEdits(
	context: OperationContext,
	familyId: string,
	input: { changeIds: string[]; id: string; otherId?: string },
): Promise<MealChangeResult> {
	const { tx } = context;
	const issue = (path: string, code: string) => appError('invalid', { issues: [{ path: [path], code }] });
	if ((input.changeIds.length === 2) !== (input.otherId !== undefined)) throw issue('otherId', 'two_changes_two_ids');
	if (input.otherId === input.id || new Set(input.changeIds).size !== input.changeIds.length) throw issue('changeIds', 'repeated');
	const changes = await tx<{ id: string; slotId: string; actorId: string | null; before: SlotContent; after: SlotContent }[]>`
		select c.id, c.meal_slot_id as "slotId", c.actor_id as "actorId", c.before, c.after
		from app.meal_changes c join app.meal_slots s on s.id = c.meal_slot_id join app.weeks w on w.id = s.week_id
		where c.id = any(${input.changeIds}::uuid[]) and w.family_id = ${familyId}`;
	if (changes.length !== input.changeIds.length) throw appError('not_found');
	const slots = await lockSlots(tx, familyId, changes.map((c) => c.slotId));
	if (slots.length !== changes.length) throw issue('changeIds', 'same_slot');
	if (new Set(slots.map((s) => s.weekId)).size !== 1) throw issue('changeIds', 'other_week');
	const undoIds = [input.id, input.otherId];
	const edits = input.changeIds.map((changeId, i) => {
		const change = changes.find((c) => c.id === changeId)!;
		return { change, edit: { slot: slots.find((s) => s.id === change.slotId)!, id: undoIds[i]!, idPath: i === 0 ? 'id' : 'otherId', after: change.before, undoes: changeId } };
	});
	const replay = await replayed(context, familyId, edits.map((e) => e.edit));
	if (replay) return replay;
	for (const { change, edit } of edits) {
		if (change.actorId !== context.userId) throw notAllowed('not_own_change');
		const [last] = await tx<{ id: string }[]>`
			select id from app.meal_changes where meal_slot_id = ${change.slotId} order by created_at desc, id desc limit 1`;
		if (last?.id !== change.id || !sameContent(contentOf(edit.slot), change.after)) throw notAllowed('changed_since');
	}
	return applyEdits(context, familyId, edits.map((e) => e.edit));
}
```

Export `replayed` (already in the module) and make `applyEdits` skip its own replay check when
called after `undoEdits` has checked (the second call finds no rows, so it is harmless).

Ordering note: two rows created in the same transaction (a swap) have the same
`created_at` on different slots; the "last change" is per slot, so the order by `id` is only a
tie-break between rows of the same slot, which never share a transaction.

```ts
// server/src/meals/router.ts, in mealsRouter
		undo: os.meals.undo.handler(({ context, input }) => undoEdits(context, input.familyId, input)),
```

- [ ] **Step 5: Run** `npm run typecheck && npx vitest run server/test/meals` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/meals server/src/meals server/test/meals/undo.test.ts
git commit -m "Revisione dei pasti: annullamento delle proprie modifiche, anche degli scambi"
```

### Task 6: suggerimenti

**Files:**
- Create: `contract/src/meals/views.ts` (aggiunge `suggestionsView`), modify `operations.ts`
- Create: `server/src/meals/suggestions.ts`; modify `server/src/meals/router.ts`
- Create: `server/test/meals/suggestions.test.ts`

**Interfaces:**
- Consumes: `rankSuggestions` (Task 1), `readSlot` (Task 3), `loadPlannerInput(tx, familyId, { weekStart })`, `recipeSummaries(tx, refs, locale)`, `ratingSummaries(tx, familyId, userId, ids)`, `fresh(context, view)`.
- Produces: `mealsContract.getSuggestions` (input `{familyId, slotId, offset?, knownVersion?}`, output versioned `SuggestionsView`), `type SuggestionsView`, `SUGGESTION_PAGE = 5`, `suggestionsOf(context, familyId, slotId, offset): Promise<SuggestionsView>`.

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/suggestions.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal suggestions', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const read = async (offset?: number, slotId = s.slots.tueLunch) => {
		const result = await s.anna.client.meals.getSuggestions({ familyId: s.familyId, slotId, ...(offset === undefined ? {} : { offset }) });
		if (result.unchanged) throw new Error('expected data');
		return result.data;
	};

	it('gives five recipes with their read-only rating, without the meals of the week', async () => {
		const page = await read();
		expect(page.recipes).toHaveLength(5);
		const ids = page.recipes.map((r) => r.recipe.id);
		expect(ids).not.toContain(s.recipes[0]);
		expect(page.recipes[0]!.rating).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(page.nextOffset).toBe(5);
	});

	it('pages through the ranking and starts again at the end, also from a stale offset', async () => {
		const first = await read(0);
		const second = await read(first.nextOffset);
		expect(second.recipes.map((r) => r.recipe.id)).not.toEqual(first.recipes.map((r) => r.recipe.id));
		let page = second;
		while (page.nextOffset !== 0) page = await read(page.nextOffset);
		expect(page.nextOffset).toBe(0);
		expect((await read(999)).recipes.map((r) => r.recipe.id)).toEqual(first.recipes.map((r) => r.recipe.id));
	});

	it('drops a recipe as soon as the family excludes it', async () => {
		const first = (await read()).recipes[0]!.recipe.id;
		await s.anna.client.family.addExclusion({ familyId: s.familyId, recipeId: first });
		expect((await read()).recipes.map((r) => r.recipe.id)).not.toContain(first);
		await s.anna.client.family.removeExclusion({ familyId: s.familyId, recipeId: first });
	});

	it('leaves out the current recipe of the slot', async () => {
		expect((await read(0, s.slots.monLunch)).recipes.map((r) => r.recipe.id)).not.toContain(s.recipes[0]);
	});

	it('lists the four free texts the family uses most, ties in alphabetical order', async () => {
		// Monday dinner already holds 'Pizza'; five more dinners of the same week.
		const texts = { '2026-10-13': 'Fuori', '2026-10-14': 'Fuori', '2026-10-15': 'Fuori', '2026-10-16': 'Avanzi', '2026-10-17': 'Sushi' };
		for (const [date, freeText] of Object.entries(texts)) await s.fx.insertSlot(s.weekId, { date, mealType: 'dinner', freeText });
		const otherWeek = await s.fx.insertWeek(s.familyId, '2026-10-19');
		await s.fx.insertSlot(otherWeek, { date: '2026-10-19', mealType: 'dinner', freeText: 'Zuppa' });
		expect((await read()).freeTexts).toEqual(['Fuori', 'Avanzi', 'Pizza', 'Sushi']);
	});

	it('is a versioned read and answers not_found for a slot of another family', async () => {
		const first = await s.anna.client.meals.getSuggestions({ familyId: s.familyId, slotId: s.slots.tueLunch });
		const again = await s.anna.client.meals.getSuggestions({ familyId: s.familyId, slotId: s.slots.tueLunch, knownVersion: first.version });
		expect(again.unchanged).toBe(true);
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.getSuggestions({ familyId: family, slotId: s.slots.tueLunch }))).code).toBe('not_found');
	});
});
```

Run the free-text test last in the file (it adds slots that change the suggestions'
ranking), or move it to its own `describe` with a fresh `mealsSetup`.

- [ ] **Step 2: Run** `npx vitest run server/test/meals/suggestions.test.ts` — Expected: FAIL.

- [ ] **Step 3: Contract**

```ts
// contract/src/meals/views.ts (added)
import { ratingSummaryView, recipeSummaryView } from '../recipes/views.ts';

export const suggestionsView = z.object({
	recipes: z.array(z.object({ recipe: recipeSummaryView, rating: ratingSummaryView })).max(5),
	/** Offset of the next five; 0 when the ranking starts again. */
	nextOffset: z.number().int().min(0),
	/** Free-meal texts the family already used, most frequent first. */
	freeTexts: z.array(z.string()).max(4),
});
export type SuggestionsView = z.infer<typeof suggestionsView>;
```

```ts
// contract/src/meals/operations.ts, in mealsContract
	getSuggestions: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
		.route({
			method: 'GET',
			path: '/families/{familyId}/meals/{slotId}/suggestions',
			summary:
				'Five recipes that fit a meal, best first, by the same rules as the weekly menu (ratings are shown, not set here); call again with nextOffset for five more. Also the free-meal texts the family uses most',
		})
		.errors(notFound)
		.input(versionedInput(slot.extend({ offset: z.coerce.number().int().min(0).max(1000).default(0) })))
		.output(versionedOutput(suggestionsView)),
```

(`z.coerce` because REST passes `offset` in the query string; a test in Step 5 calls the
REST route.)

- [ ] **Step 4: Server**

```ts
// server/src/meals/suggestions.ts
import type { SuggestionsView } from '@app/contract';
import { rankSuggestions } from '@app/domain/planner';
import { loadPlannerInput } from '../menu/generation.ts';
import type { OperationContext } from '../pipeline.ts';
import { ratingSummaries, recipeSummaries } from '../recipes/views.ts';
import { readSlot } from './slots.ts';

export const SUGGESTION_PAGE = 5;
const FREE_TEXTS = 4;

/** Spec section 3, «Riuso durante la revisione»: one page of the ranking, from the planner's input. */
export async function suggestionsOf(context: OperationContext, familyId: string, slotId: string, offset: number): Promise<SuggestionsView> {
	const { tx } = context;
	const slot = await readSlot(tx, familyId, slotId);
	const input = await loadPlannerInput(tx, familyId, { weekStart: slot.startsOn });
	const others = await tx<{ date: string; mealType: 'lunch' | 'dinner'; recipeId: string }[]>`
		select date::text as date, meal_type as "mealType", recipe_id as "recipeId"
		from app.meal_slots where week_id = ${slot.weekId} and id <> ${slot.id} and recipe_id is not null`;
	const ranked = rankSuggestions(input, { date: slot.date, mealType: slot.mealType }, [...others], slot.recipeId);
	const start = offset < ranked.length ? offset : 0;
	const ids = ranked.slice(start, start + SUGGESTION_PAGE);
	const refs = ids.map((recipeId) => ({ recipeId, version: null, servings: slot.servings }));
	const summaries = await recipeSummaries(tx, refs, context.locale);
	const ratings = await ratingSummaries(tx, familyId, context.userId, ids);
	const texts = await tx<{ text: string }[]>`
		select s.free_text as text from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.free_text is not null
		group by s.free_text order by count(*) desc, s.free_text limit ${FREE_TEXTS}`;
	return {
		recipes: refs.map((ref) => ({ recipe: summaries.get(recipeViewKeyOf(ref))!, rating: ratings.get(ref.recipeId)! })),
		nextOffset: start + SUGGESTION_PAGE < ranked.length ? start + SUGGESTION_PAGE : 0,
		freeTexts: texts.map((t) => t.text),
	};
}
```

Use the key function the module exports for `recipeSummaries` (`recipeViewKey` or
`contentKey`, `server/src/recipes/views.ts:34-35`): read its body in Step 4 and pick the one
whose map keys match; `recipeViewKeyOf` above stands for that import.

```ts
// server/src/meals/router.ts, in mealsRouter
		getSuggestions: os.meals.getSuggestions.handler(async ({ context, input }) =>
			fresh(context, await suggestionsOf(context, input.familyId, input.slotId, input.offset)),
		),
```

- [ ] **Step 5: REST and MCP check** (in `suggestions.test.ts`)

```ts
import { mcp, testEnv } from '../support/requests.ts';
// GET /api/families/{familyId}/meals/{slotId}/suggestions?offset=5 answers 200 with nextOffset 10 or 0.
```

Copy the request helper used by `server/test/app.test.ts` for REST calls (`/api/...` with
`Authorization: Bearer`), assert `status === 200` and that `offset=5` returns the second page.

- [ ] **Step 6: Run** `npm run typecheck && npx vitest run server/test/meals domain contract` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add contract/src/meals server/src/meals server/test/meals/suggestions.test.ts
git commit -m "Revisione dei pasti: suggerimenti dal pianificatore a pagine e testi liberi frequenti"
```

### Task 7: MCP, verifica completa e PR del server

**Files:**
- Create: `server/test/meals/mcp.test.ts`

**Interfaces:**
- Consumes: `mcp`, `testEnv`, `toolBody` da `server/test/support/requests.ts` (come `server/test/menu/mcp.test.ts`).

- [ ] **Step 1: Test**

```ts
// server/test/meals/mcp.test.ts
import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { createTestKeys, type TestKeys } from '../support/keys.ts';
import { menuFixtures } from '../support/menu.ts';
import { mcp, testEnv, toolBody } from '../support/requests.ts';

describe.skipIf(!hasDatabase)('meals on MCP', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;
	let user: { userId: string; sessionId: string };
	let familyId: string;
	let slotId: string;
	const env = () => testEnv(db.appServerUrl);
	const token = () => keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
	const call = async (name: string, args: Record<string, unknown>) => mcp(app, env(), await token(), 'tools/call', { name, arguments: args });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		user = await db.createUser();
		familyId = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const fx = menuFixtures(db);
		const recipe = await fx.publishRecipe();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		slotId = await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', recipeId: recipe });
		for (let i = 0; i < 6; i++) await fx.publishRecipe();
	});
	afterAll(() => db?.close());

	it('lists the meal tools, only the suggestions read-only', async () => {
		const list = await mcp(app, env(), await token(), 'tools/list');
		const tools = list.body.result.tools.filter((t: any) => t.name.startsWith('meals_'));
		expect(tools.map((t: any) => t.name).sort()).toEqual(['meals_getSuggestions', 'meals_setFree', 'meals_setNote', 'meals_setRecipe', 'meals_setServings', 'meals_swap', 'meals_undo']);
		expect(tools.filter((t: any) => t.annotations?.readOnlyHint === true).map((t: any) => t.name)).toEqual(['meals_getSuggestions']);
	});

	it('changes a meal and refuses an undo of the wrong change as an agent sees it', async () => {
		const changed = toolBody(await call('meals_setServings', { familyId, slotId, id: crypto.randomUUID(), servings: 3 }));
		expect(changed.changeIds).toHaveLength(1);
		const refused = await call('meals_undo', { familyId, changeIds: [crypto.randomUUID()], id: crypto.randomUUID() });
		expect(refused.body.result.isError).toBe(true);
		expect(JSON.stringify(refused.body.result.content)).toContain('not_found');
	});
});
```

(Adattare `toolBody` e la forma dell'errore a quelle di `server/test/menu/mcp.test.ts` e di
`server/test/shopping-mcp.test.ts`.)

- [ ] **Step 2: Run** `npx vitest run server/test/meals/mcp.test.ts` — Expected: PASS (the tools come from the contract); if a global test lists all MCP tools (`grep -rn "tools/list" server/test`), add the `meals_*` names there.

- [ ] **Step 3: Full verification** (skill `superpowers:verification-before-completion`)

Run: `supabase test db && npm run typecheck && npm test`
Expected: all green, with `TEST_DATABASE_URL` set as in CI.

- [ ] **Step 4: Commit, push and PR** (after the coordinator's go for implementation, as in the protocol)

```bash
git add server/test/meals/mcp.test.ts
git commit -m "Revisione dei pasti: strumenti MCP dell'area meals"
git push -u origin traguardo/revisione-pasti
gh pr create --base main --title "Revisione dei pasti: server, contratto e MCP" --body "<cosa fa, verifiche, sezioni 3 e 5 della specifica; 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

Then `STATO: PR_APERTA <url>` and stop.

---

## Seconda PR: web

Parte dopo il merge della prima: `git fetch && git switch -c traguardo/revisione-pasti-web origin/main`
(nome confermato dal coordinatore). Prima di ogni task leggere `design/design.md`, i
componenti del prototipo citati e `web/src/routes/MenuPage.tsx`.

### Task 8: area `meals` nel client (finto e vero)

**Files:**
- Modify: `web/src/api/types.ts` (`SERVER_AREAS` con `'meals'`; tipi `SuggestionsView`, `MealChangeResult` riesportati)
- Create: `web/src/api/fake/fakeMeals.ts`, `web/src/api/fake/fakeMeals.test.ts`
- Modify: `web/src/api/fake/fakeApi.ts` (`meals: createFakeMeals(...)`, `withTransport` con `meals: wrap(api.meals)`)
- Modify: `web/src/test/rpcServer.ts` (risposte `meals` configurabili)
- Create: `web/src/features/meals/queries.ts`

**Interfaces:**
- Consumes: `Contract['meals']`, dati finti delle settimane (`state.weeks`), `ratingSummary`, `respond`, `delayed` del client finto.
- Produces:
  - `createFakeMeals(options: { familyId; userId; getLocale; latencyMs?; data; week(weekStartsOn); weekView(weekStartsOn): WeekView; bump(): void }): Api['meals']`;
  - `suggestionsQuery(deps: QueryDeps, familyId: string, slotId: string, offset: number)` con chiave `mealKeys.suggestions(familyId, slotId, offset, locale) = ['meals', 'getSuggestions', { familyId, slotId, offset, locale }]`;
  - `createRpcTestServer().answerMeals(handlers: Partial<MealsAnswers>)` e `mealCalls: { op: string; input: Record<string, unknown> }[]`.

- [ ] **Step 1: Failing test of the fake client**

```ts
// web/src/api/fake/fakeMeals.test.ts
import { describe, expect, it } from 'vitest';
import { createFakeApi, createFakeData } from './fakeApi';
import { DEMO_FAMILY } from './seed';

describe('fake meals', () => {
  it('changes servings, logs the change and undoes it', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const opening = await api.menu.getOpening({ familyId: DEMO_FAMILY.id });
    if (opening.unchanged || opening.data.kind !== 'day') throw new Error('demo menu');
    const week = await api.menu.getWeek({ familyId: DEMO_FAMILY.id, weekStartsOn: opening.data.weekStartsOn });
    if (week.unchanged) throw new Error('expected data');
    const meal = week.data.days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    const changed = await api.meals.setServings({ familyId: DEMO_FAMILY.id, slotId: meal.slotId, id: crypto.randomUUID(), servings: meal.servings + 1 });
    expect(changed.changeIds).toHaveLength(1);
    const undone = await api.meals.undo({ familyId: DEMO_FAMILY.id, changeIds: changed.changeIds, id: crypto.randomUUID() });
    expect(undone.week.days.flatMap((d) => d.meals).find((m) => m.slotId === meal.slotId)!.servings).toBe(meal.servings);
  });
  it('pages five suggestions and wraps', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const opening = await api.menu.getOpening({ familyId: DEMO_FAMILY.id });
    if (opening.unchanged || opening.data.kind !== 'day') throw new Error('demo menu');
    const week = await api.menu.getWeek({ familyId: DEMO_FAMILY.id, weekStartsOn: opening.data.weekStartsOn });
    if (week.unchanged) throw new Error('expected data');
    const slotId = week.data.days[0]!.meals[0]!.slotId;
    const first = await api.meals.getSuggestions({ familyId: DEMO_FAMILY.id, slotId, offset: 0 });
    if (first.unchanged) throw new Error('expected data');
    expect(first.data.recipes.length).toBeLessThanOrEqual(5);
  });
});
```

(Usare l'export reale del seed per l'id della famiglia demo: `grep -n "DEMO_FAMILY" web/src/api/fake/*.ts`.)

- [ ] **Step 2: Run** `npm test -w web -- fakeMeals` — Expected: FAIL (`api.meals` undefined).

- [ ] **Step 3: Implement `fakeMeals.ts`**

Ported from `prototype/src/lib/operations/revision.ts` and `suggestions.ts` onto the fake
data structures (`state.weeks` slots, `recipes`, `ratings`, `family.exclusions`):

```ts
// web/src/api/fake/fakeMeals.ts
import type { MealChangeResult, SuggestionsView, WeekView } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';

interface FakeSlot { id: string; date: string; mealType: 'lunch' | 'dinner'; recipeId: string | null; freeText: string | null; servings: number; note: string | null; updatedBy?: string | null; updatedAt?: string | null }
interface Content { recipeId: string | null; freeText: string | null; servings: number; note: string | null }
interface Change { id: string; slotId: string; actorId: string; before: Content; after: Content; undoes: string | null }

export interface FakeMealsOptions {
  userId: string;
  latencyMs?: number;
  checkFamily(familyId: string): void;
  /** Every slot of the visible weeks, with its week's Monday. */
  slots(): { weekStartsOn: string; slot: FakeSlot }[];
  weekView(weekStartsOn: string): WeekView;
  /** Simulated ranking of round 2 (design/percorsi.md): recipe ids, best first. */
  rank(slotId: string): string[];
  suggestionView(recipeId: string): SuggestionsView['recipes'][number];
  now(): string;
  bump(): void;
}

const contentOf = (s: FakeSlot): Content => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });
const same = (a: Content, b: Content) => a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

export function createFakeMeals(o: FakeMealsOptions): Api['meals'] {
  const log: Change[] = [];
  const wait = () => (o.latencyMs ? new Promise((r) => setTimeout(r, o.latencyMs)) : Promise.resolve());
  const find = (slotId: string) => {
    const found = o.slots().find((s) => s.slot.id === slotId);
    if (!found) throw new ApiError('not_found');
    return found;
  };
  function write(edits: { slotId: string; id: string; after: (s: FakeSlot) => Content; undoes?: string }[]): MealChangeResult {
    const replay = log.filter((c) => edits.some((e) => e.id === c.id));
    const weekStartsOn = find(edits[0]!.slotId).weekStartsOn;
    if (replay.length) {
      if (replay.some((c) => c.actorId !== o.userId || !edits.some((e) => e.id === c.id && e.slotId === c.slotId))) throw new ApiError('invalid');
      return { week: o.weekView(weekStartsOn), changeIds: replay.map((c) => c.id) };
    }
    const written: string[] = [];
    for (const edit of edits) {
      const { slot } = find(edit.slotId);
      const before = contentOf(slot);
      const after = edit.after(slot);
      if (same(before, after)) continue;
      Object.assign(slot, after, { updatedBy: o.userId, updatedAt: o.now() });
      log.push({ id: edit.id, slotId: slot.id, actorId: o.userId, before, after, undoes: edit.undoes ?? null });
      written.push(edit.id);
    }
    if (written.length) o.bump();
    return { week: o.weekView(weekStartsOn), changeIds: written };
  }
  return {
    async getSuggestions({ familyId, slotId, offset = 0 }) {
      o.checkFamily(familyId);
      await wait();
      find(slotId);
      const ranked = o.rank(slotId);
      const start = offset < ranked.length ? offset : 0;
      const ids = ranked.slice(start, start + 5);
      const counts = new Map<string, number>();
      for (const { slot } of o.slots()) if (slot.freeText) counts.set(slot.freeText, (counts.get(slot.freeText) ?? 0) + 1);
      const freeTexts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([t]) => t);
      return { unchanged: false, version: `meals:${Date.now()}`, data: { recipes: ids.map(o.suggestionView), nextOffset: start + 5 < ranked.length ? start + 5 : 0, freeTexts } };
    },
    async setServings({ familyId, slotId, id, servings }) { o.checkFamily(familyId); await wait(); return write([{ slotId, id, after: (s) => ({ ...contentOf(s), servings }) }]); },
    async setRecipe({ familyId, slotId, id, recipeId }) { o.checkFamily(familyId); await wait(); return write([{ slotId, id, after: (s) => ({ ...contentOf(s), recipeId, freeText: null }) }]); },
    async setFree({ familyId, slotId, id, text }) { o.checkFamily(familyId); await wait(); return write([{ slotId, id, after: (s) => ({ ...contentOf(s), recipeId: null, freeText: text.trim() }) }]); },
    async setNote({ familyId, slotId, id, note }) { o.checkFamily(familyId); await wait(); return write([{ slotId, id, after: (s) => ({ ...contentOf(s), note: note?.trim() || null }) }]); },
    async swap({ familyId, slotId, id, otherSlotId, otherId }) {
      o.checkFamily(familyId);
      await wait();
      const a = find(slotId), b = find(otherSlotId);
      if (slotId === otherSlotId || a.weekStartsOn !== b.weekStartsOn) throw new ApiError('invalid');
      const moved = (s: FakeSlot) => ({ recipeId: s.recipeId, freeText: s.freeText, note: s.note });
      const [ma, mb] = [moved(a.slot), moved(b.slot)];
      return write([{ slotId, id, after: (s) => ({ ...contentOf(s), ...mb }) }, { slotId: otherSlotId, id: otherId, after: (s) => ({ ...contentOf(s), ...ma }) }]);
    },
    async undo({ familyId, changeIds, id, otherId }) {
      o.checkFamily(familyId);
      await wait();
      const ids = [id, otherId];
      const changes = changeIds.map((c) => log.find((l) => l.id === c));
      if (changes.some((c) => !c)) throw new ApiError('not_found');
      const edits = changes.map((change, i) => {
        const c = change!;
        if (!log.some((l) => l.id === ids[i]) && c.actorId !== o.userId) throw new ApiError('not_allowed');
        const last = log.filter((l) => l.slotId === c.slotId).at(-1);
        if (!log.some((l) => l.id === ids[i]) && (last?.id !== c.id || !same(contentOf(find(c.slotId).slot), c.after))) throw new ApiError('not_allowed');
        return { slotId: c.slotId, id: ids[i]!, after: () => c.before, undoes: c.id };
      });
      return write(edits);
    }
  };
}
```

(Verificare che `ApiError` accetti `'not_allowed'` come codice: `web/src/api/errors.ts:11`.)

In `createFakeApi` add `meals: createFakeMeals({...})` built from the existing helpers:
`slots()` from `visibleWeeks()`, `weekView` from the same function `menu.getWeek` uses,
`rank` with the round-2 rule (family average or 3, +0.1 per week since last eaten up to 1, −1
for the same protein group as the meal before or after, excluding the week and the two weeks
before and the excluded recipes), `suggestionView` with `recipeSummary` and `ratingSummary`,
`bump: () => void (state.revision += 1)`. In `withTransport` add `meals: wrap(api.meals)`.

- [ ] **Step 4: `SERVER_AREAS`, types and query**

```ts
// web/src/api/types.ts
export const SERVER_AREAS = ['session', 'profile', 'recipes', 'ratings', 'menu', 'family', 'shopping', 'meals'] as const satisfies readonly (keyof Contract)[];
export type { MealChangeResult, SuggestionsView } from '@app/contract';
```

```ts
// web/src/features/meals/queries.ts
import { queryOptions } from '@tanstack/react-query';
import { readThrough, type QueryDeps, type Versioned } from '../../api/queries';
import type { Locale } from '../../i18n/translate';
import type { SuggestionsView } from '../../api/types';

export const mealKeys = {
  suggestions: (familyId: string, slotId: string, offset: number, locale: Locale) => ['meals', 'getSuggestions', { familyId, slotId, offset, locale }] as const
};

export function suggestionsQuery({ api, queryClient, locale }: QueryDeps, familyId: string, slotId: string, offset: number) {
  const queryKey = mealKeys.suggestions(familyId, slotId, offset, locale);
  return queryOptions({
    queryKey,
    queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.meals.getSuggestions({ familyId, slotId, offset, knownVersion })),
    select: (value: Versioned<SuggestionsView>) => value.data
  });
}
```

- [ ] **Step 5: Test server** — in `web/src/test/rpcServer.ts` implement the `meals` area
with `implement({... meals: contract.meals })`, default answers built from `menuAnswer.week`
(apply servings/recipe/free/note/swap to a copy and return `{ week, changeIds: [input.id] }`;
`getSuggestions` returns `SERVER_RECIPE.recipe` with its rating), record every call in
`mealCalls`, and let tests override each handler with `answerMeals({ undo: () => { throw new ORPCError('not_allowed', { data: { reason: 'changed_since' } }) } })`.

- [ ] **Step 6: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/api web/src/features/meals/queries.ts web/src/test/rpcServer.ts
git commit -m "Web: area meals nel client vero e in quello finto"
```

### Task 9: mutazioni dei pasti e invalidazioni

**Files:**
- Modify: `web/src/api/mutations.ts`
- Modify: `web/src/api/mutations.test.ts`
- Create: `web/src/features/meals/useMealMutation.ts`, `web/src/features/meals/useMealMutation.test.tsx`

**Interfaces:**
- Consumes: `applyMutation`, `INVALIDATIONS`, `useSession`, `useCurrentLocale`, `isOnline`, `ApiError`.
- Produces:
  - `MutationTarget` comprende `'week'`; `ApplyOptions.weekStartsOn?: string`;
  - `MealMutationName = 'meals.setServings' | 'meals.setRecipe' | 'meals.setFree' | 'meals.setNote' | 'meals.swap' | 'meals.undo'`;
  - `runMealMutation(deps, name, familyId, weekStartsOn, call): Promise<MutationOutcome<MealChangeResult>>`;
  - `useMealMutation<I>(name, familyId, weekStartsOn, call: (input: I & { id: string; otherId: string }) => Promise<MealChangeResult>)` → `useMutation` il cui `mutationFn(input: I)` aggiunge `id`/`otherId` nuovi e restituisce `{ result, applied }`.

- [ ] **Step 1: Failing tests** (in `web/src/api/mutations.test.ts`)

```ts
const weekKey = (weekStartsOn: string, locale = 'it-IT') => ['menu', 'getWeek', { familyId: FAMILY, weekStartsOn, locale }];
const weekView = (servings: number) => ({ startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ slotId: 's', servings }] }] });

describe('meal mutations', () => {
  it('write the week of the meal, keep its version, make dependent reads stale', async () => {
    const client = new QueryClient();
    client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    client.setQueryData(weekKey('2026-10-12'), { version: 'w2', data: weekView(9) });
    client.setQueryData(weekKey('2026-10-05', 'en-GB'), { version: 'w1en', data: weekView(2) });
    const stale = [
      ['menu', 'getOpening', { familyId: FAMILY, today: '2026-10-08', locale: 'it-IT' }],
      ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT' }],
      ['recipes', 'get', { familyId: FAMILY, recipeId: 'r', locale: 'it-IT' }],
      ['recipes', 'search', { familyId: FAMILY, query: {}, locale: 'it-IT' }],
      ['meals', 'getSuggestions', { familyId: FAMILY, slotId: 's', offset: 0, locale: 'it-IT' }]
    ];
    for (const key of stale) client.setQueryData(key, { version: 'x', data: {} });
    client.setQueryData(['recipes', 'search', { familyId: OTHER, query: {}, locale: 'it-IT' }], { version: 'x', data: {} });
    await applyMutation(client, { name: 'meals.setServings', familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT', view: weekView(4), sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryData(weekKey('2026-10-05'))).toEqual({ version: 'w1', data: weekView(4) });
    expect(client.getQueryState(weekKey('2026-10-12'))?.isInvalidated).toBe(false);
    expect(client.getQueryState(weekKey('2026-10-05', 'en-GB'))?.isInvalidated).toBe(true);
    for (const key of stale) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['recipes', 'search', { familyId: OTHER, query: {}, locale: 'it-IT' }])?.isInvalidated).toBe(false);
  });

  it('an exclusion makes the suggestions stale', async () => {
    const client = new QueryClient();
    const key = ['meals', 'getSuggestions', { familyId: FAMILY, slotId: 's', offset: 0, locale: 'it-IT' }];
    client.setQueryData(key, { version: 'x', data: {} });
    await applyMutation(client, { name: 'family.addExclusion', familyId: FAMILY, locale: 'it-IT', view: [], sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('a superseded answer of the same week is not written', async () => {
    const h = harness();
    h.client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    const slow = deferred<{ week: unknown; changeIds: string[] }>();
    const first = runMealMutation({ queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' }, 'meals.setServings', FAMILY, '2026-10-05', () => slow.promise);
    await runMealMutation({ queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' }, 'meals.setNote', FAMILY, '2026-10-05', async () => ({ week: weekView(5), changeIds: ['b'] }));
    slow.resolve({ week: weekView(3), changeIds: ['a'] });
    expect((await first).applied).toBe(false);
    expect((h.client.getQueryData(weekKey('2026-10-05')) as { data: unknown }).data).toEqual(weekView(5));
  });
});
```

- [ ] **Step 2: Run** `npm test -w web -- mutations` — Expected: FAIL.

- [ ] **Step 3: Implement in `mutations.ts`**

```ts
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week';

const MEAL_STALE = familyReads(
  { area: 'menu', operation: 'getOpening' },
  { area: 'shopping', operation: 'getWeekList' },
  { area: 'recipes', operation: 'get' },
  { area: 'recipes', operation: 'search' },
  { area: 'meals', operation: 'getSuggestions' }
);
// in INVALIDATIONS:
  'family.addExclusion': { target: 'exclusions', stale: familyReads({ area: 'meals', operation: 'getSuggestions' }) },
  'family.removeExclusion': { target: 'exclusions', stale: familyReads({ area: 'meals', operation: 'getSuggestions' }) },
  'meals.setServings': { target: 'week', stale: MEAL_STALE },
  'meals.setRecipe': { target: 'week', stale: MEAL_STALE },
  'meals.setFree': { target: 'week', stale: MEAL_STALE },
  'meals.setNote': { target: 'week', stale: MEAL_STALE },
  'meals.swap': { target: 'week', stale: MEAL_STALE },
  'meals.undo': { target: 'week', stale: MEAL_STALE },

const TARGET_KEY: Record<Exclude<MutationTarget, 'profile'>, [string, string]> = {
  family: ['family', 'get'],
  settings: ['family', 'getSettings'],
  exclusions: ['family', 'listExclusions'],
  week: ['menu', 'getWeek']
};

const targetKey = (target: MutationTarget, familyId: string | undefined, locale: string, weekStartsOn?: string) =>
  target === 'profile'
    ? ['profile', 'get', { locale }]
    : target === 'week'
      ? [...TARGET_KEY.week, { familyId, weekStartsOn, locale }]
      : [...TARGET_KEY[target], { familyId, locale }];

/** The same view in another language: same area, operation, family and, for a week, Monday. */
function sameView(target: MutationTarget, familyId: string | undefined, weekStartsOn?: string) {
  const [area, operation] = target === 'profile' ? ['profile', 'get'] : TARGET_KEY[target];
  return (query: Query) =>
    query.queryKey[0] === area && query.queryKey[1] === operation &&
    (target === 'profile' || familyOfKey(query.queryKey) === familyId) &&
    (target !== 'week' || (query.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn);
}
```

`ApplyOptions` gets `weekStartsOn?: string`; `applyMutation` passes it to `targetKey` and
`sameView`. For the target `week` the written view is `options.view` (the caller passes
`result.week`). Add:

```ts
export type MealMutationName = Extract<MutationName, `meals.${string}`>;

/** As runAreaMutation for the meals: the target is the week of the meal (spec of the revision, 4). */
export async function runMealMutation<T extends { week: unknown }>(deps: MutationDeps, name: MealMutationName, familyId: string, weekStartsOn: string, call: () => Promise<T>): Promise<MutationOutcome<T>> {
  const trackKey = `week:${familyId}:${weekStartsOn}`;
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const result = await call();
  const applied = await applyMutation(deps.queryClient, {
    name, familyId, weekStartsOn, locale, view: result.week,
    sessionOpen: () => !deps.session.isClosed(),
    isLatest: () => deps.currentLocale() === locale && deps.session.isLatest(trackKey, token)
  });
  return { view: result, applied };
}
```

- [ ] **Step 4: `useMealMutation`**

```ts
// web/src/features/meals/useMealMutation.ts
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../api/errors';
import { runMealMutation, type MealMutationName } from '../../api/mutations';
import type { MealChangeResult } from '../../api/types';
import { isOnline } from '../../lib/connectivity';
import { useCurrentLocale, useSession } from '../../session/SessionScope';

/** Sends one meal write with fresh change ids; refused at once offline (offline: false in the contract). */
export function useMealMutation<I>(name: MealMutationName, familyId: string, weekStartsOn: string, call: (input: I & { id: string; otherId: string }) => Promise<MealChangeResult>) {
  const session = useSession();
  const currentLocale = useCurrentLocale();
  return useMutation({
    meta: { familyId },
    mutationFn: async (input: I) => {
      if (!isOnline()) throw new ApiError('network');
      const ids = { id: crypto.randomUUID(), otherId: crypto.randomUUID() };
      return runMealMutation({ queryClient: session.queryClient, session, currentLocale }, name, familyId, weekStartsOn, () => call({ ...input, ...ids }));
    }
  });
}
```

Callers pass only the fields of their operation (e.g. `({ slotId, servings, id }) => api.meals.setServings({ familyId, slotId, servings, id })`); `otherId` is used by `swap` and by `undo` with two changes.

Test in `useMealMutation.test.tsx`: offline → `network` without calling `api`; online → the call receives two distinct uuids.

- [ ] **Step 5: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/mutations.ts web/src/api/mutations.test.ts web/src/features/meals/useMealMutation*
git commit -m "Web: mutazioni dei pasti sulla vista della settimana e viste che ne dipendono"
```

### Task 10: matita, pannello e porzioni

**Files:**
- Create: `web/src/i18n/messages/meals.ts`; modify `web/src/i18n/messages/index.ts`
- Modify: `web/src/components/Icon.tsx` (icona `pencil` dalla guida, se manca: `grep -n "pencil\|edit" design/design.md design/index.html`)
- Modify: `web/src/components/RecipeCard.tsx` (prop `actions?: ReactNode`, resa nel footer)
- Create: `web/src/features/meals/MealActions.tsx`, `web/src/features/meals/meals.module.css`, `web/src/features/meals/MealActions.test.tsx`
- Create: `web/src/features/meals/UndoProvider.tsx` (stato dell'ultimo avviso; il componente visivo arriva nel Task 13)
- Modify: `web/src/routes/MenuPage.tsx` (passa `actions={<MealActions .../>}` e monta `UndoProvider`)

**Interfaces:**
- Consumes: `useMealMutation` (Task 9), `ServingsStepper`, `useT`.
- Produces:
  - `MealActions({ familyId, weekStartsOn, meal: MealView, week: WeekView, disabled: boolean })`;
  - `useUndo(): { offer(changeIds: string[], weekStartsOn: string): void; current: { changeIds: string[]; weekStartsOn: string } | null; clear(): void }`;
  - dizionario `meals.*` (chiavi sotto).

- [ ] **Step 1: Messages**

```ts
// web/src/i18n/messages/meals.ts
export const mealsIt = {
  'meals.edit': 'Modifica {meal}',
  'meals.changeRecipe': 'Cambia ricetta',
  'meals.chooseRecipe': 'Scegli una ricetta',
  'meals.note': 'Nota',
  'meals.servings': 'Porzioni',
  'meals.markFree': 'Segna come pasto libero',
  'meals.exclude': 'Non proporre più',
  'meals.swap': 'Scambia con un altro pasto',
  'meals.suggestions': 'Suggerimenti',
  'meals.more': 'Proponimene altri',
  'meals.search': 'Cerca nel ricettario',
  'meals.excluded': '{name} non verrà più proposta.',
  'meals.undoExclusion': 'Annulla esclusione',
  'meals.freeTitle': 'Pasto libero',
  'meals.freePlaceholder': 'Pizza, cena fuori…',
  'meals.save': 'Salva',
  'meals.removeNote': 'Togli nota',
  'meals.noteCount': '{count}/200',
  'meals.swapTitle': 'Scambia con…',
  'meals.changed': 'Pasto modificato',
  'meals.undo': 'Annulla',
  'meals.undoRefused': 'Non si può più annullare: il pasto è stato cambiato.',
  'meals.gone': 'Questo pasto o questa ricetta non è più disponibile.',
  'meals.offline': 'Senza connessione il menu si può solo consultare.',
  'meals.noSuggestions': 'Nessuna ricetta adatta: prova con la ricerca.'
} as const;

export const mealsEn: Record<keyof typeof mealsIt, string> = {
  'meals.edit': 'Edit {meal}',
  'meals.changeRecipe': 'Change recipe',
  'meals.chooseRecipe': 'Choose a recipe',
  'meals.note': 'Note',
  'meals.servings': 'Servings',
  'meals.markFree': 'Mark as a free meal',
  'meals.exclude': 'Don’t suggest again',
  'meals.swap': 'Swap with another meal',
  'meals.suggestions': 'Suggestions',
  'meals.more': 'Suggest others',
  'meals.search': 'Search the recipe book',
  'meals.excluded': '{name} won’t be suggested again.',
  'meals.undoExclusion': 'Undo exclusion',
  'meals.freeTitle': 'Free meal',
  'meals.freePlaceholder': 'Pizza, eating out…',
  'meals.save': 'Save',
  'meals.removeNote': 'Remove note',
  'meals.noteCount': '{count}/200',
  'meals.swapTitle': 'Swap with…',
  'meals.changed': 'Meal changed',
  'meals.undo': 'Undo',
  'meals.undoRefused': 'It can no longer be undone: the meal has been changed.',
  'meals.gone': 'This meal or recipe is no longer available.',
  'meals.offline': 'Offline the menu can only be viewed.',
  'meals.noSuggestions': 'No suitable recipe: try the search.'
};
```

Register them in `web/src/i18n/messages/index.ts` the way `family.ts` is registered (same
shape of the existing dictionaries: follow it if it differs from the one above).

- [ ] **Step 2: Failing test**

```tsx
// web/src/features/meals/MealActions.test.tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../test/renderApp';
import { setOnline } from '../../test/connectivity';
import { familyIt, familyEn } from '../../i18n/messages/family';
import { mealsIt, mealsEn } from '../../i18n/messages/meals';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('meal actions', () => {
  it('the pencil opens servings, change recipe and note; servings are saved once after the taps', async () => {
    renderApp('/menu');
    const card = (await screen.findAllByRole('article'))[0]!;
    fireEvent.click(within(card).getByRole('button', { name: /Modifica/ }));
    expect(within(card).getByRole('button', { name: 'Cambia ricetta' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Nota' })).toBeTruthy();
    const more = within(card).getByRole('button', { name: /più porzioni/i });
    fireEvent.click(more);
    fireEvent.click(more);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(within(card).getByText(/porzioni/)).toBeTruthy());
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('Pasto modificato'))).toBe(true);
  });

  it('offline the pencil is disabled', async () => {
    renderApp('/menu');
    const card = (await screen.findAllByRole('article'))[0]!;
    setOnline(false);
    await waitFor(() => expect((within(card).getByRole('button', { name: /Modifica/ }) as HTMLButtonElement).disabled).toBe(true));
    setOnline(true);
  });

  it('the labels match the empty state of the exclusions', () => {
    expect(familyIt['exclusions.emptyBody']).toContain(`«${mealsIt['meals.changeRecipe']}»`);
    expect(familyIt['exclusions.emptyBody']).toContain(`«${mealsIt['meals.exclude']}»`);
    expect(familyEn['exclusions.emptyBody']).toContain(`“${mealsEn['meals.changeRecipe']}”`);
    expect(familyEn['exclusions.emptyBody']).toContain(`“${mealsEn['meals.exclude']}”`);
  });
});
```

(Use the real export names of `web/src/i18n/messages/family.ts` and of the stepper's
accessible labels, `recipe.moreServings`.)

- [ ] **Step 3: Run** `npm test -w web -- MealActions` — Expected: FAIL.

- [ ] **Step 4: Implement**

```tsx
// web/src/features/meals/MealActions.tsx
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import type { MealView, WeekView } from '../../api/types';
import { Icon } from '../../components/Icon';
import { ServingsStepper } from '../../components/ServingsStepper';
import { useT } from '../../i18n/LocaleProvider';
import { MealEditor, type EditorStage } from './MealEditor';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

const SAVE_DELAY_MS = 800;
const MAX_SERVINGS = 20;

/** Pencil and panel under the card (round 2): servings, change recipe, note. */
export function MealActions({ familyId, weekStartsOn, meal, week, disabled }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; disabled: boolean }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<EditorStage | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const servings = useMealMutation<{ servings: number }>('meals.setServings', familyId, weekStartsOn, ({ servings, id }) =>
    api.meals.setServings({ familyId, slotId: meal.slotId, servings, id })
  );
  const flush = () => {
    clearTimeout(timer.current);
    setPending((value) => {
      if (value !== null && value !== meal.servings) {
        servings.mutate({ servings: value }, { onSuccess: ({ view }) => undo.offer(view.changeIds, weekStartsOn) });
      }
      return null;
    });
  };
  // Closing the panel or leaving the card saves what is still pending.
  useEffect(() => () => clearTimeout(timer.current), []);
  const step = (value: number) => {
    setPending(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };
  const toggle = () => {
    if (open) flush();
    setOpen(!open);
  };
  const label = meal.recipe?.name ?? meal.freeText ?? t(`meal.${meal.mealType}`);
  return (
    <>
      <button type="button" className={styles.pencil} aria-expanded={open} aria-label={t('meals.edit', { meal: label })} disabled={disabled} onClick={toggle}>
        <Icon name="pencil" />
      </button>
      {meal.kind === 'empty' && (
        <button type="button" className="button-secondary" disabled={disabled} onClick={() => setStage('picker')}>{t('meals.chooseRecipe')}</button>
      )}
      {open && (
        <ul className={styles.panel}>
          {meal.kind === 'recipe' && (
            <li><ServingsStepper value={pending ?? meal.servings} min={1} max={MAX_SERVINGS} onChange={step} /></li>
          )}
          <li><button type="button" disabled={disabled} onClick={() => setStage('picker')}>{t('meals.changeRecipe')}</button></li>
          <li><button type="button" disabled={disabled} onClick={() => setStage('note')}>{t('meals.note')}</button></li>
        </ul>
      )}
      {stage && <MealEditor familyId={familyId} weekStartsOn={weekStartsOn} meal={meal} week={week} stage={stage} onStage={setStage} onClose={() => setStage(null)} />}
    </>
  );
}
```

Until Task 11 `MealEditor` is a stub that renders the `BottomSheet` with the stage title, so
this task compiles and its tests pass: create `web/src/features/meals/MealEditor.tsx` with
`export type EditorStage = 'picker' | 'swap' | 'free' | 'note';` and a component that renders
`<BottomSheet open title={...} onClose={onClose}>{null}</BottomSheet>`.

```tsx
// web/src/features/meals/UndoProvider.tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface UndoOffer { changeIds: string[]; weekStartsOn: string; key: number }
interface UndoState { current: UndoOffer | null; offer(changeIds: string[], weekStartsOn: string): void; clear(): void }
const UndoContext = createContext<UndoState | null>(null);

/** The last change the user can undo (one at a time: a new one replaces it). */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<UndoOffer | null>(null);
  const offer = useCallback((changeIds: string[], weekStartsOn: string) => {
    if (changeIds.length) setCurrent({ changeIds, weekStartsOn, key: Date.now() });
  }, []);
  const clear = useCallback(() => setCurrent(null), []);
  return <UndoContext.Provider value={{ current, offer, clear }}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoState {
  const value = useContext(UndoContext);
  if (!value) throw new Error('useUndo outside UndoProvider');
  return value;
}
```

`RecipeCard`: add `actions?: ReactNode` to `RecipeCardProps` and render it in the footer
before the rating toggle (`{actions}`), without changing anything else. `MenuPage`: wrap the
section in `<UndoProvider>` and pass, for each meal,
`actions={<MealActions familyId={familyId} weekStartsOn={week.data.startsOn} meal={meal} week={week.data} disabled={!online} />}`
with `online` from the existing connectivity hook (`grep -n "useOnline\|isOnline" web/src/lib/connectivity.ts`).
Styles in `meals.module.css` from the prototype's `MealActionList.svelte` and `RecipeCard.svelte`
(pencil 44 px, panel rows with separators, tokens of `web/src/design/tokens.css`).

Until Task 13 a minimal `role="status"` text «Pasto modificato» rendered by `UndoProvider`
when `current` is set satisfies the first test; Task 13 replaces it with `UndoToast`.

- [ ] **Step 5: Run** `npm run typecheck && npm test -w web` — Expected: PASS (existing `MenuPage` and `RecipeCard` tests still green).

- [ ] **Step 6: Commit**

```bash
git add web/src/i18n/messages web/src/components/Icon.tsx web/src/components/RecipeCard.tsx web/src/features/meals web/src/routes/MenuPage.tsx
git commit -m "Web: matita e pannello del pasto con le porzioni salvate a fine regolazione"
```

### Task 11: foglio «Cambia ricetta» con suggerimenti, ricerca ed esclusione

**Files:**
- Modify: `web/src/features/meals/MealEditor.tsx`
- Create: `web/src/features/meals/RecipePicker.tsx`, `web/src/features/meals/RecipePicker.test.tsx`

**Interfaces:**
- Consumes: `suggestionsQuery` (Task 8), `searchQuery` (`web/src/api/queries.ts`), `RecipeFilters`, `RatingStars`, `useAreaMutation('family.addExclusion' | 'family.removeExclusion', ...)`, `useMealMutation('meals.setRecipe', ...)`, `useUndo`.
- Produces: `RecipePicker({ familyId, weekStartsOn, meal, onStage, onDone })`; `MealEditor({ familyId, weekStartsOn, meal, week, stage, onStage, onClose })`.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/RecipePicker.test.tsx
describe('change recipe', () => {
  it('shows five suggestions with read-only stars, «Proponimene altri» pages without changing the meal', async () => {
    renderApp('/menu');
    const card = (await screen.findAllByRole('article'))[0]!;
    fireEvent.click(within(card).getByRole('button', { name: /Modifica/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Cambia ricetta' }));
    const sheet = await screen.findByRole('dialog');
    const first = await within(sheet).findAllByRole('article');
    expect(first.length).toBeLessThanOrEqual(5);
    expect(within(sheet).queryAllByRole('radio')).toHaveLength(0);
    const names = first.map((a) => a.textContent);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Proponimene altri' }));
    await waitFor(() => expect(within(sheet).getAllByRole('article').map((a) => a.textContent)).not.toEqual(names));
    expect(within(card).getByRole('heading').textContent).toBe(card.querySelector('h3')!.textContent);
  });

  it('choosing a suggestion changes the meal and closes the sheet', async () => {
    renderApp('/menu');
    const card = (await screen.findAllByRole('article'))[0]!;
    fireEvent.click(within(card).getByRole('button', { name: /Modifica/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Cambia ricetta' }));
    const sheet = await screen.findByRole('dialog');
    const choice = (await within(sheet).findAllByRole('button', { name: /Scegli/ }))[0]!;
    const name = choice.getAttribute('data-name');
    fireEvent.click(choice);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(name);
  });

  it('«Non proporre più» excludes, shows the undo inside the sheet and keeps the meal until a choice', async () => {
    renderApp('/menu');
    const card = (await screen.findAllByRole('article'))[0]!;
    const dish = within(card).getByRole('heading', { level: 3 }).textContent;
    fireEvent.click(within(card).getByRole('button', { name: /Modifica/ }));
    fireEvent.click(within(card).getByRole('button', { name: 'Cambia ricetta' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Non proporre più' }));
    expect(await within(sheet).findByRole('button', { name: 'Annulla esclusione' })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: /Chiudi/ }));
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(dish);
    renderApp('/profile/exclusions');
    expect(await screen.findByText(dish!)).toBeTruthy();
  });

  it('searches the recipe book with the filters', async () => {
    // Uses the real client against createRpcTestServer: picks SERVER_RECIPE from recipes.search
    // and checks mealCalls contains meals.setRecipe with its id.
  });
});
```

Write the fourth test with `createRpcTestServer`, `realClients` and `createStubBackend` as in
`web/src/routes/MenuPage.test.tsx` (real-client tests there): type in the search field,
choose «Ricetta dal server», then expect
`server.mealCalls.find((c) => c.op === 'meals.setRecipe')?.input.recipeId === SERVER_RECIPE.recipe.id`.

- [ ] **Step 2: Run** `npm test -w web -- RecipePicker` — Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/features/meals/RecipePicker.tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { searchQuery, useQueryDeps } from '../../api/queries';
import { useAreaMutation } from '../../api/mutations';
import type { MealView, RecipeQuery } from '../../api/types';
import { RatingStars } from '../../components/RatingStars';
import { RecipeFilters } from '../../components/RecipeFilters';
import { useT } from '../../i18n/LocaleProvider';
import type { EditorStage } from './MealEditor';
import { suggestionsQuery } from './queries';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

/** «Cambia ricetta» (round 2 review): free, exclude and swap first, then suggestions, then search. */
export function RecipePicker({ familyId, weekStartsOn, meal, onStage, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onStage: (stage: EditorStage) => void; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const deps = useQueryDeps();
  const undo = useUndo();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState<RecipeQuery>({});
  const [excluded, setExcluded] = useState<{ id: string; name: string } | null>(null);
  const suggestions = useQuery(suggestionsQuery(deps, familyId, meal.slotId, offset));
  const search = useQuery({ ...searchQuery(deps, familyId, query), enabled: !!query.text });
  const setRecipe = useMealMutation<{ recipeId: string }>('meals.setRecipe', familyId, weekStartsOn, ({ recipeId, id }) => api.meals.setRecipe({ familyId, slotId: meal.slotId, recipeId, id }));
  const exclude = useAreaMutation('family.addExclusion', familyId, (recipeId: string) => api.family.addExclusion({ familyId, recipeId }));
  const include = useAreaMutation('family.removeExclusion', familyId, (recipeId: string) => api.family.removeExclusion({ familyId, recipeId }));
  const choose = (recipeId: string) =>
    setRecipe.mutate({ recipeId }, { onSuccess: ({ view }) => { undo.offer(view.changeIds, weekStartsOn); onDone(); } });
  return (
    <div className={styles.picker}>
      {excluded && (
        <p className={styles.notice} role="status">
          {t('meals.excluded', { name: excluded.name })}{' '}
          <button type="button" onClick={() => include.mutate(excluded.id, { onSuccess: () => setExcluded(null) })}>{t('meals.undoExclusion')}</button>
        </p>
      )}
      <ul className={styles.topActions}>
        <li><button type="button" onClick={() => onStage('free')}>{t('meals.markFree')}</button></li>
        {meal.recipe && !excluded && (
          <li><button type="button" disabled={exclude.isPending} onClick={() => exclude.mutate(meal.recipe!.id, { onSuccess: () => setExcluded({ id: meal.recipe!.id, name: meal.recipe!.name }) })}>{t('meals.exclude')}</button></li>
        )}
        <li><button type="button" onClick={() => onStage('swap')}>{t('meals.swap')}</button></li>
      </ul>
      <h3>{t('meals.suggestions')}</h3>
      <div className={styles.cards}>
        {suggestions.data?.recipes.map(({ recipe, rating }) => (
          <article key={recipe.id} className={styles.suggestion} aria-labelledby={`s-${recipe.id}`}>
            <h4 id={`s-${recipe.id}`}>{recipe.name}</h4>
            {recipe.description && <p>{recipe.description}</p>}
            <RatingStars rating={rating} readOnly />
            <button type="button" data-name={recipe.name} aria-label={`${t('meals.choose')} ${recipe.name}`} disabled={setRecipe.isPending} onClick={() => choose(recipe.id)}>{t('meals.choose')}</button>
          </article>
        ))}
        {suggestions.data?.recipes.length === 0 && <p>{t('meals.noSuggestions')}</p>}
      </div>
      <button type="button" onClick={() => setOffset(suggestions.data?.nextOffset ?? 0)}>{t('meals.more')}</button>
      <h3>{t('meals.search')}</h3>
      <RecipeFilters value={query} onChange={setQuery} />
      <ul>
        {search.data?.items.map((item) => (
          <li key={item.recipe.id}><button type="button" onClick={() => choose(item.recipe.id)}>{item.recipe.name}</button></li>
        ))}
      </ul>
    </div>
  );
}
```

Add `'meals.choose': 'Scegli'` / `'Choose'` to the dictionary. Adapt to the real props of
`RatingStars` (read-only mode: check `web/src/components/RatingStars.tsx`; if it has none,
add a `readOnly` prop that renders the same summary without the radio group — a minimal
change to the shared component) and of `RecipeFilters` (check its props; pass the text field
as the first filter). Suggestion cards scroll horizontally (`styles.cards`, prototype
`RecipePicker.svelte`).

```tsx
// web/src/features/meals/MealEditor.tsx
import type { MealView, WeekView } from '../../api/types';
import { BottomSheet } from '../../components/BottomSheet';
import { useT } from '../../i18n/LocaleProvider';
import { FreeMealForm } from './FreeMealForm';
import { NoteForm } from './NoteForm';
import { RecipePicker } from './RecipePicker';
import { SwapPicker } from './SwapPicker';

export type EditorStage = 'picker' | 'swap' | 'free' | 'note';

/** The sheet of round 2: change recipe, swap, free meal and note. */
export function MealEditor(props: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; stage: EditorStage; onStage: (s: EditorStage) => void; onClose: () => void }) {
  const t = useT();
  const titles: Record<EditorStage, string> = { picker: t('meals.changeRecipe'), swap: t('meals.swapTitle'), free: t('meals.freeTitle'), note: t('meals.note') };
  const common = { familyId: props.familyId, weekStartsOn: props.weekStartsOn, meal: props.meal, onDone: props.onClose };
  return (
    <BottomSheet open title={titles[props.stage]} onClose={props.onClose}>
      {props.stage === 'picker' && <RecipePicker {...common} onStage={props.onStage} />}
      {props.stage === 'swap' && <SwapPicker {...common} week={props.week} />}
      {props.stage === 'free' && <FreeMealForm {...common} />}
      {props.stage === 'note' && <NoteForm {...common} />}
    </BottomSheet>
  );
}
```

`SwapPicker`, `FreeMealForm`, `NoteForm` are created in Task 12; in this task create them as
components returning `null` with the props above so the editor compiles.

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals web/src/components/RatingStars.tsx web/src/i18n/messages/meals.ts
git commit -m "Web: Cambia ricetta con suggerimenti, Proponimene altri, ricerca e Non proporre più"
```

### Task 12: scambio, pasto libero e nota

**Files:**
- Modify: `web/src/features/meals/SwapPicker.tsx`, `FreeMealForm.tsx`, `NoteForm.tsx`
- Create: `web/src/features/meals/forms.test.tsx`

**Interfaces:**
- Consumes: `useMealMutation('meals.swap' | 'meals.setFree' | 'meals.setNote', ...)`, `suggestionsQuery` (per `freeTexts`), `useUndo`, `formatDayLong`.
- Produces: `SwapPicker({ familyId, weekStartsOn, meal, week, onDone })`, `FreeMealForm({ familyId, weekStartsOn, meal, onDone })`, `NoteForm({ familyId, weekStartsOn, meal, onDone })`.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/forms.test.tsx
describe('swap, free meal and note', () => {
  it('swaps with another meal of the week: dish and note move, servings stay', async () => { /* open picker, «Scambia con un altro pasto», choose the second meal, check both cards */ });
  it('marks a meal free from a quick pick or a typed text up to 60 characters', async () => { /* «Segna come pasto libero», click the first quick pick, card shows the free text */ });
  it('writes a note with a counter and removes it', async () => { /* «Nota», type, Salva, card shows the note; «Togli nota» removes it */ });
});
```

Write each body like the tests of Task 11 (`renderApp('/menu')`, open the pencil, act,
`waitFor` on the card). For the swap, read the two cards' headings and servings before and
after; for the note, assert `maxLength` 200 on the textarea and the counter text
`'{n}/200'`; for the free meal, assert the input has `maxLength` 60 and that an empty text
disables «Salva».

- [ ] **Step 2: Run** `npm test -w web -- forms` — Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/features/meals/SwapPicker.tsx
import { useApi } from '../../api/ApiProvider';
import type { MealView, WeekView } from '../../api/types';
import { formatDayLong } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

/** Every other meal of the week (spec section 5): dish or free text and note move, servings stay. */
export function SwapPicker({ familyId, weekStartsOn, meal, week, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const api = useApi();
  const undo = useUndo();
  const swap = useMealMutation<{ otherSlotId: string }>('meals.swap', familyId, weekStartsOn, ({ otherSlotId, id, otherId }) =>
    api.meals.swap({ familyId, slotId: meal.slotId, id, otherSlotId, otherId })
  );
  const others = week.days.flatMap((d) => d.meals).filter((m) => m.slotId !== meal.slotId);
  return (
    <ul>
      {others.map((other) => (
        <li key={other.slotId}>
          <button type="button" disabled={swap.isPending} onClick={() => swap.mutate({ otherSlotId: other.slotId }, { onSuccess: ({ view }) => { undo.offer(view.changeIds, weekStartsOn); onDone(); } })}>
            <span>{formatDayLong(locale, other.date)} · {t(`meal.${other.mealType}`)}</span>
            <strong>{other.recipe?.name ?? other.freeText ?? t('meal.empty.title')}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

```tsx
// web/src/features/meals/FreeMealForm.tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useQueryDeps } from '../../api/queries';
import type { MealView } from '../../api/types';
import { useT } from '../../i18n/LocaleProvider';
import { suggestionsQuery } from './queries';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

const MAX_FREE_TEXT = 60;

export function FreeMealForm({ familyId, weekStartsOn, meal, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const [text, setText] = useState(meal.freeText ?? '');
  const picks = useQuery(suggestionsQuery(useQueryDeps(), familyId, meal.slotId, 0)).data?.freeTexts ?? [];
  const save = useMealMutation<{ text: string }>('meals.setFree', familyId, weekStartsOn, ({ text, id }) => api.meals.setFree({ familyId, slotId: meal.slotId, text, id }));
  const send = (value: string) => save.mutate({ text: value.trim() }, { onSuccess: ({ view }) => { undo.offer(view.changeIds, weekStartsOn); onDone(); } });
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <ul>{picks.map((p) => <li key={p}><button type="button" onClick={() => send(p)}>{p}</button></li>)}</ul>
      <input aria-label={t('meals.freeTitle')} placeholder={t('meals.freePlaceholder')} maxLength={MAX_FREE_TEXT} value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" disabled={!text.trim() || save.isPending}>{t('meals.save')}</button>
    </form>
  );
}
```

```tsx
// web/src/features/meals/NoteForm.tsx
import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import type { MealView } from '../../api/types';
import { useT } from '../../i18n/LocaleProvider';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

const MAX_NOTE = 200;

export function NoteForm({ familyId, weekStartsOn, meal, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const [note, setNote] = useState(meal.note ?? '');
  const save = useMealMutation<{ note: string | null }>('meals.setNote', familyId, weekStartsOn, ({ note, id }) => api.meals.setNote({ familyId, slotId: meal.slotId, note, id }));
  const send = (value: string | null) => save.mutate({ note: value }, { onSuccess: ({ view }) => { undo.offer(view.changeIds, weekStartsOn); onDone(); } });
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(note.trim() || null); }}>
      <textarea aria-label={t('meals.note')} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
      <p aria-live="polite">{t('meals.noteCount', { count: note.length })}</p>
      <button type="submit" disabled={save.isPending}>{t('meals.save')}</button>
      {meal.note && <button type="button" disabled={save.isPending} onClick={() => send(null)}>{t('meals.removeNote')}</button>}
    </form>
  );
}
```

Styles from the prototype's `SwapPicker.svelte` and `MealEditor.svelte` in `meals.module.css`.

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals
git commit -m "Web: scambio, pasto libero con proposte rapide e nota"
```

### Task 13: «Annulla», errori e stati

**Files:**
- Create: `web/src/features/meals/UndoToast.tsx`, `web/src/features/meals/UndoToast.test.tsx`
- Modify: `web/src/features/meals/UndoProvider.tsx` (rende `UndoToast` al posto del testo provvisorio)
- Modify: `web/src/features/meals/RecipePicker.tsx`, `SwapPicker.tsx`, `FreeMealForm.tsx`, `NoteForm.tsx`, `MealActions.tsx` (errori)

**Interfaces:**
- Consumes: `useUndo`, `useMealMutation('meals.undo', ...)`, `toApiError`, `weekQuery` key (`queryKeys.week`).
- Produces: `UndoToast({ offer, familyId, onDone })`; `useMealErrors(familyId, weekStartsOn)` → `(error) => string | null` che per `not_found` rilegge la settimana.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/UndoToast.test.tsx
describe('undo', () => {
  it('offers «Annulla» for 6 seconds and restores the meal', async () => {
    // change servings (Task 10 flow), then click «Annulla» within 6 s: servings back; after 6 s the toast is gone.
  });
  it('a refused undo says it can no longer be undone and reads the week again', async () => {
    // real client against createRpcTestServer with answerMeals({ undo: () => { throw new ORPCError('not_allowed', { status: 409, data: { reason: 'changed_since' } }) } }):
    // expect «Non si può più annullare: il pasto è stato cambiato.» and a new menu.getWeek call.
  });
  it('after switching to English or to another week the undo still targets the meal’s week', async () => {
    // change a meal of week A, navigate to week B (?day= of the next week) before clicking «Annulla»;
    // the undo request carries the change ids and the week A cache is the one updated.
  });
  it('no toast when nothing changed (changeIds empty)', async () => {
    // answerMeals({ setNote: (input) => ({ week, changeIds: [] }) }): no «Annulla».
  });
});
```

Write each body with `vi.advanceTimersByTimeAsync(6000)` for the timeout and the real-client
harness of `MenuPage.test.tsx` for the server answers; assert on `server.mealCalls`.

- [ ] **Step 2: Run** `npm test -w web -- UndoToast` — Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/features/meals/UndoToast.tsx
import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { toApiError } from '../../api/errors';
import { useT } from '../../i18n/LocaleProvider';
import type { UndoOffer } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

export const UNDO_MS = 6000;

/** «Annulla» after each change (spec section 5, round 2 default: 6 seconds). */
export function UndoToast({ offer, familyId, onDone }: { offer: UndoOffer; familyId: string; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const [refused, setRefused] = useState(false);
  const undo = useMealMutation<Record<string, never>>('meals.undo', familyId, offer.weekStartsOn, ({ id, otherId }) =>
    api.meals.undo({ familyId, changeIds: offer.changeIds, id, ...(offer.changeIds.length === 2 ? { otherId } : {}) })
  );
  useEffect(() => {
    // The refusal message gets its own 6 seconds (refused is in the dependencies).
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
  }, [offer.key, refused, onDone]);
  if (refused) return <div role="status" className="toast">{t('meals.undoRefused')}</div>;
  return (
    <div role="status" className="toast">
      {t('meals.changed')}
      <button
        type="button"
        disabled={undo.isPending}
        onClick={() => undo.mutate({}, {
          onSuccess: onDone,
          onError: (error) => {
            if (toApiError(error).code === 'not_allowed') setRefused(true);
          }
        })}
      >{t('meals.undo')}</button>
    </div>
  );
}
```

On `not_allowed`, invalidate the week of the offer
(`queryClient.invalidateQueries({ queryKey: ['menu', 'getWeek'], predicate: (q) => familyOfKey(q.queryKey) === familyId && (q.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === offer.weekStartsOn })`).
`UndoProvider` receives `familyId` and renders `{current && <UndoToast key={current.key} offer={current} familyId={familyId} onDone={clear} />}`.

Errors of the other mutations: a small hook

```ts
// web/src/features/meals/useMealErrors.ts
import { useQueryClient } from '@tanstack/react-query';
import { toApiError } from '../../api/errors';
import { familyOfKey } from '../../api/queries';
import { useT } from '../../i18n/LocaleProvider';

/** Message for a failed meal write; not_found reads the week again (the meal or recipe is gone). */
export function useMealErrors(familyId: string, weekStartsOn: string) {
  const t = useT();
  const queryClient = useQueryClient();
  return (error: unknown): string => {
    const apiError = toApiError(error);
    if (apiError.code === 'not_found') {
      void queryClient.invalidateQueries({ queryKey: ['menu', 'getWeek'], predicate: (q) => familyOfKey(q.queryKey) === familyId && (q.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn });
      return t('meals.gone');
    }
    if (apiError.code === 'network') return t('meals.offline');
    return t(`errors.${apiError.code}`);
  };
}
```

Each form shows `error && <p role="alert">{message(error)}</p>` from its mutation's `error`
(check the key format of `errors.*` in `web/src/i18n/messages/errors.ts`).

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals
git commit -m "Web: Annulla per sei secondi, annullamento rifiutato ed errori delle modifiche"
```

### Task 14: prova visiva, stack reale e PR del web

**Files:** nessun file di codice salvo correzioni emerse; screenshot in
`progetto/coordinamento/messaggi/w1-revisione-pasti-prova/` solo se il coordinatore lo chiede.

- [ ] **Step 1: Full verification** — `supabase test db && npm run typecheck && npm test`: all green.

- [ ] **Step 2: Fake mode** (skill `agent-browser`; memory: caffeinate before screenshots)

```bash
caffeinate -d -t 3600 &
npm run dev -w web -- --host 0.0.0.0 --port 8767
```

Check at 390×844 against the prototype (`prototype/`, round 2): pencil and panel, porzioni
with one undo, «Cambia ricetta» with free/exclude/swap first, five cards, «Proponimene altri»,
search, swap list, free meal with quick picks, note with counter, toast for 6 s, offline
disabled. Compare spacing and type with `design/design.md`.

- [ ] **Step 3: Real stack in local** (as in `progetto/coordinamento/messaggi/w6-prova-stack-reale.md`)

1. Separate Supabase project in local (`project_id` and ports changed only in the working
   copy of `supabase/config.toml`, not committed), `supabase start`, migrations and `seed.sql`.
   With Podman a new local stack can fail copying the secret files: use the wrapper in
   `~/.cache/podwrap` as for the other local stacks.
2. Password of `app_server` and `server/.env` towards the local database and Auth (not committed).
3. `npm run build -w web` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then
   `npx wrangler dev --port 8797 --test-scheduled` in `server/`.
4. Catalogue: `node scripts/import/import-recipes.ts --today 2026-10-11`, then load it with
   the curators' operations. The script `carica-catalogo.mjs` of W6's report is not in the
   repository: ask the coordinator for it (`STATO: DOMANDA`) or write an equivalent one in
   the scratchpad that calls `/api/catalogue/*` as `dario@example.test`.
5. Menu from the real job: `curl "http://localhost:8797/cdn-cgi/local/scheduled"` (now) and
   with `?time=` for the previous Wednesday.
6. Paths, with Anna and Bruno of the same family in two browser sessions: Anna changes a
   dish → Bruno, after reloading, sees «Cambiato da Anna»; Bruno changes the same meal →
   Anna's «Annulla» is refused; «Non proporre più» → the recipe appears in Profilo → Non
   proporre più (the empty state is gone) and not in the suggestions; changing a dish updates
   the shopping list of the week; a swap and its undo; a past meal changed. Then Carla
   (en-GB, imperial): the same panel and sheet in English. Remember the PWA issue of the W6
   report (service worker to remove before a direct reopening) if not yet fixed on `main`.
7. `supabase stop` for that project at the end.

- [ ] **Step 4: Push and PR**

```bash
git push -u origin traguardo/revisione-pasti-web
gh pr create --base main --title "Revisione dei pasti: schermate del Menu" --body "<cosa fa, verifiche (test, modalità finta, stack reale), sezioni 3, 5 e 14; 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

Then `STATO: PR_APERTA <url>` and stop.
