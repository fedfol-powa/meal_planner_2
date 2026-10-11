# Menu, pianificatore, job del mercoledì e generazione pigra: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il Menu dell'app legge dal database settimane generate dal pianificatore (dal job orario del mercoledì o alla prima lettura), coerenti con le settimane vicine, con la versione della ricetta giusta per ogni pasto (R1).

**Architecture:** il pianificatore puro di `domain/src/planner/` riceve tre aggiunte: primo pasto da pianificare, settimane successive già pianificate, calendario nel fuso della famiglia. Il server, in `server/src/menu/`, carica l'ingresso dal database, scrive la settimana sotto un blocco consultivo per famiglia e la espone con tre letture versionate del contratto (`contract/src/menu/`). La generazione parte da un Cron Trigger di Cloudflare (ruolo `app_job`) oppure da un hook `prepare` del percorso della richiesta (ruolo dell'utente), eseguito prima del calcolo della versione. Le viste delle ricette vengono da W6.

**Tech Stack:** TypeScript, oRPC 1.15, zod 4, Postgres.js, Cloudflare Workers (Cron Trigger), Vitest, pgTAP, Postgres locale di Supabase, React (base di W5).

**Spec:** `progetto/superpowers/specs/2026-10-11-menu-pianificatore.md`

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e messaggi di commit in italiano, come nella storia del repository.
- Nessuna libreria nuova (spec, sezione 10). `domain/` resta TypeScript puro: solo ECMAScript, `Intl` compreso, nessuna API di Node o Workers.
- Una sola migrazione, nuova: stato `abandoned` di `app.weekly_jobs` con test pgTAP (spec, sezione 4.3). Nessun'altra modifica allo schema.
- File condivisi (`contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`, `server/src/index.ts`, `server/src/pipeline.ts`, `server/wrangler.jsonc`, `web/src/api/types.ts`, `web/src/api/queries.ts`, dizionari e rotte web): solo modifiche minime per registrare l'area o per il menu.
- **Mai scrivere** `contract/src/recipes/views.ts` né `server/src/recipes/views.ts` (W6), `domain/src/recipe/` (W3), `domain/src/family/` (W2): si importano.
- Implementatore unico costruito solo in `server/src/router.ts` con `createImplementer(contract, { prepare })`; ogni area è un factory che riceve `os` (tipo `Implementer` da `server/src/pipeline.ts`): l'area menu esporta `menuRouter(os: Implementer)` e `menuPrepare`, come `recipesRouter(os)` di W6.
- Viste delle ricette solo con le firme definitive di W6 (spec di W6, sezione 1): `RecipeRef` costruiti da `mealRecipeVersions` e dalle porzioni dello slot, mappe lette con `recipeViewKey`.
- Letture del menu: `mcp: { readOnly: true }`, `offline: false`, `role: 'familyMember'`, `reads: ['family', 'catalogue']`, `versionedInput` e `versionedOutput`.
- Generazione pigra nel ruolo `authenticated` con le policy esistenti di W2; job nel ruolo `app_job`. Nessuna grant o policy nuova.
- Ogni generazione prende prima `lockFamilyWeeks` (blocco consultivo per famiglia).
- Log: righe JSON con campi scelti (`event`, `familyId`, `weekStart`, `attempts`, `code`), mai messaggi d'errore, dati o segreti.
- Testi per l'utente localizzabili in `it-IT` e `en-GB` (dizionari di W5).
- Documentazione di librerie e servizi con Context7.
- Nessun aggiornamento ottimistico nel web.

## Review Focus

1. **Fuso e ora legale:** una famiglia in `Europe/London` o `America/New_York` ottiene la settimana successiva solo dopo mercoledì alle 20:00 della sua ora locale, anche la settimana di un cambio d'ora. Test in Task 4 (tre fusi, cambi dell'ora del 25 ottobre e del 1° novembre) e in Task 10 (job con famiglie in fusi diversi).
2. **Due generazioni insieme (due membri, oppure cron e apertura):** deve nascere ogni settimana una sola volta, senza deadlock né errori. Test in Task 8 (stessa settimana) e Task 10 (cron ↔ `ensureWeeks` con entrambe le settimane assenti).
3. **Client o agente con la versione del giorno prima:** la lettura deve dare l'apertura del giorno nuovo, non «invariato». Test in Task 9 (RPC e `tools/call` MCP, senza scritture intermedie).
4. **Settimana senza ricette adatte:** deve aprirsi con le schede «Nessuna ricetta adatta», non con «Ancora nessun menu». Test in Task 9 (server) e Task 12 (schermata, due lingue).
5. **Generazione che fallisce:** il Menu si apre comunque sulle settimane esistenti; il job ritenta e alla fine chiude il job abbandonato con un log. Test in Task 9 (savepoint) e Task 10 (ritentativi, domenica → lunedì, abbandono).

---

## Cancelli (dipendenze da altri worker)

| Task | Serve | Da | Se non è su `main` |
|---|---|---|---|
| 8, 9, 10 | `toPlannerRecipe(id, document)` e `RecipeDocument` da `@app/domain/recipe` | W3 (PR #9) | `STATO: DOMANDA` |
| 8, 9, 10 | `resolveFamilySettings(stored)` da `@app/domain/family` | W2 profilo | `STATO: DOMANDA` |
| 6, 11 | interfaccia **definitiva** di W6 (sua spec `2026-10-11-ricettario-e-voti.md`, sezione 1, commit `f5b1dd2`; piano generale, «Interfaccia per W1 definitiva»): schemi `recipeSummaryView`, `ratingSummaryView`, `ingredientLineView`, `isoDateSchema`, `mealTypeSchema` (`contract/src/recipes/views.ts`); `RecipeRef {recipeId, version: number \| null, servings}`, `recipeViewKey`, `Viewer`, `recipeViews(tx, viewer, refs)`, `RecipeView`, e in alternativa `recipeSummaries(tx, refs, locale)`, `ingredientLines(tx, refs, { familyId, locale })`, `ratingSummaries(tx, familyId, userId, recipeIds)` (`server/src/recipes/views.ts`) | W6, prima PR con le viste R1 complete | `STATO: DOMANDA`; mai scrivere quei file |
| 11, 12 | **cancello unico** dei task che usano le viste: PR delle viste di W6 unita, con `ratings.set`, `RecipeCard`, `IngredientList` (con la preparazione) e tipi web della ricetta adeguati da W6; per il 12 anche il client oRPC reale nel web (seconda PR di W5) | W5, W6 | `STATO: DOMANDA` |

All'inizio di ogni task con un cancello: `git fetch origin && git rebase origin/main`,
poi si verificano nomi ed export reali. Se differiscono da quanto scritto qui, vale
l'altro worker: si adatta il codice del task senza cambiarne il comportamento e si
allinea la spec. I task 1-5 e 7 non hanno cancelli; il Task 6 dipende solo dagli
schemi di W6. Il Task 1 si consegna per primo in una PR piccola a parte (produttore di
`mealRecipeVersions` per W4).

## File

| File | Responsabilità |
|---|---|
| `domain/src/planner/types.ts` | `PlannerSlotRef`, `PlannerInput.from`, `PlannerInput.upcoming` |
| `domain/src/planner/constraints.ts`, `generate.ts` | slot pianificati dopo `from` (`isPlannedSlot`); vincolo dei 14 giorni dopo la settimana |
| `domain/src/planner/prepared.ts`, `score.ts` | pasti successivi come vicini (14 giorni e somiglianza) |
| `domain/src/planner/local-time.ts` (+ test) | data e ora locali, primo pasto aperto, bersagli della generazione, scadenze del job |
| `server/src/pipeline.ts` (+ `test/pipeline.test.ts`, `test/support/test-contract.ts`, `test/support/context.ts`) | hook `prepare` con `versionPart`, `OperationContext.now`, tipo `Implementer` |
| `contract/src/menu/views.ts`, `operations.ts` (+ test) | schemi delle viste e operazioni del menu |
| `supabase/migrations/20261011140000_weekly_jobs_abandoned.sql`, `supabase/tests/weekly_jobs_abandoned_test.sql` | stato `abandoned` |
| `server/src/log.ts` | `logEvent(event, fields, level)` |
| `server/src/menu/versions.ts` (+ test) | `mealRecipeVersions` (R1), usata anche da W4; Task 1, PR piccola a parte |
| `server/src/menu/plan.ts` | punto controllato: `planWeek(input)` |
| `server/src/menu/generation.ts` (+ test) | `lockFamilyWeeks`, `loadPlannerInput`, `generateWeek`, `ensureWeeks`, `errorCode` |
| `server/src/menu/time.ts` | `localIn`, `familyNow` con ripiego su `Europe/Rome` |
| `server/src/menu/opening.ts` | `effectiveDate`, `openingOf`, `datesOf` |
| `server/src/menu/router.ts` | `menuRouter(os)`, `menuPrepare` |
| `server/src/menu/job.ts` (+ test) | `runWeeklyJob`, `runWeeklyJobOn` |
| `server/src/menu/week-view.ts` | composizione di `WeekView` con `recipeViews` di W6 |
| `server/src/router.ts`, `server/src/index.ts`, `server/wrangler.jsonc`, `contract/src/contract.ts` | registrazione, handler `scheduled`, cron |
| `server/test/support/menu.ts` | dati di prova: ricette pubblicate con documento, libri, settimane, slot, utenti membri |
| `web/src/...` (struttura di W5) | `Api.menu` dal contratto, `today` in `getOpening`, voto dal Menu |

---

### Task 1: `mealRecipeVersions` (R1) in una PR piccola per W4

Sei il **produttore** di `mealRecipeVersions` per la spesa (W4): il task si consegna da
solo, per primo, in una PR piccola da unire subito. Dipende solo da quanto è già su
`main` (schema di W2, `server/src/db.ts`, supporto dei test della piattaforma); nessun
cancello.

**Branch:** `traguardo/menu-versioni`, creato da `origin/main` in un worktree a parte
(`git worktree add .worktrees/menu-versioni -b traguardo/menu-versioni origin/main`, dal
repository principale), così la PR contiene solo questi tre file e non spec e piano del
menu. Dopo il merge: `git fetch origin && git rebase origin/main` su `traguardo/menu` e
rimozione del worktree.

**Files:**
- Create: `server/test/support/menu.ts`
- Create: `server/src/menu/versions.ts`
- Test: `server/test/menu-versions.test.ts`

**Interfaces:**
- Produces (server, importata da W4):

```ts
export interface MealRecipeVersion { slotId: string; recipeId: string; version: number | null; isPast: boolean }
export function mealRecipeVersions(tx: Tx, familyId: string, weekId: string): Promise<MealRecipeVersion[]>
```

- Produces (test): `menuFixtures(db: TestDatabase)` con questi metodi:
  - `ingredient()`;
  - `book(title?)`;
  - `publishRecipe(over?)`;
  - `publishVersion(recipeId, publishedAt)`;
  - `draftRecipe(name)`;
  - `insertWeek(familyId, startsOn)`;
  - `insertSlot(weekId, slot)`;
  - `setTimeZone(familyId, timeZone)`;
  - `member(options?)`, che restituisce `{ userId, sessionId, familyId, claims }` di un nuovo utente, membro di una nuova famiglia; `claims` è utilizzabile con `withDbOn(sql, { kind: 'user', claims }, …)`.

- [ ] **Step 1: Write the fixtures** `server/test/support/menu.ts`

```ts
import type { Claims } from '../../src/auth.ts';
import type { TestDatabase } from './db.ts';
import { TEST_ISSUER } from './keys.ts';

export interface RecipeFixture {
	name: string;
	mealType: 'lunch' | 'dinner' | 'both';
	proteinGroup: string;
	durationMinutes: number;
	publishedAt: string;
	ingredientIds: string[];
	bookId: string | null;
}

/** A complete RecipeDocument (W3, schemaVersion 1) with the planner attributes of the fixture. */
export function recipeDocument(f: RecipeFixture) {
	return {
		schemaVersion: 1,
		name: { 'it-IT': f.name, 'en-GB': `${f.name} (en)` },
		description: { 'it-IT': `Descrizione di ${f.name}`, 'en-GB': `Description of ${f.name}` },
		sourceType: f.bookId ? 'book' : 'home',
		sourceUrl: null,
		bookId: f.bookId,
		bookPages: f.bookId ? '12' : null,
		durationMinutes: f.durationMinutes,
		baseServings: 2,
		mealType: f.mealType,
		proteinGroup: f.proteinGroup,
		isFreshFish: false,
		carbohydrateGroup: 'none',
		category: 'other',
		hasVegetables: true,
		isHeavy: false,
		seasons: [],
		ingredients: f.ingredientIds.map((ingredientId, i) => ({
			ingredientId,
			variety: null,
			preparation: null,
			quantity: { kind: 'amount', value: 100, unit: 'g' },
			sourceText: `riga ${i}`,
			isOptional: false,
			isPrimary: i === 0,
		})),
	};
}

let counter = 0;
const slug = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function menuFixtures(db: TestDatabase) {
	const { admin } = db;
	async function ingredient(): Promise<string> {
		const [{ id }] = await admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department)
			values (${slug('ing')}, ${admin.json({ 'it-IT': 'Ingrediente', 'en-GB': 'Ingredient' })}, 'produce') returning id`;
		return id;
	}
	return {
		ingredient,
		async book(title = 'Libro di prova'): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.books (slug, title) values (${slug('b')}, ${title}) returning id`;
			return id;
		},
		async publishRecipe(over: Partial<RecipeFixture> = {}): Promise<string> {
			const f: RecipeFixture = {
				name: `Ricetta ${counter}`,
				mealType: 'both',
				proteinGroup: 'vegetarian',
				durationMinutes: 20,
				publishedAt: '2026-01-01T00:00:00Z',
				bookId: null,
				...over,
				ingredientIds: over.ingredientIds ?? [await ingredient()],
			};
			const doc = recipeDocument(f);
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.recipes (slug, status, version, name, description, source_type, book_id, book_pages, duration_minutes, base_servings,
					protein_group, is_fresh_fish, carbohydrate_group, has_vegetables, category, meal_type, is_heavy)
				values (${slug('r')}, 'published', 1, ${admin.json(doc.name)}, ${admin.json(doc.description)}, ${doc.sourceType}, ${f.bookId}, ${doc.bookPages},
					${f.durationMinutes}, 2, ${f.proteinGroup}, false, 'none', true, 'other', ${f.mealType}, false)
				returning id`;
			await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
				values (${id}, 1, ${admin.json(doc)}, ${f.publishedAt}, 'import')`;
			return id;
		},
		/** A new version with a different Italian name (" vN"), made current. */
		async publishVersion(recipeId: string, publishedAt: string): Promise<number> {
			const [{ version, content }] = await admin<{ version: number; content: any }[]>`
				select r.version + 1 as version, v.content from app.recipes r
				join app.recipe_versions v on v.recipe_id = r.id and v.version = r.version where r.id = ${recipeId}`;
			content.name['it-IT'] = `${content.name['it-IT']} v${version}`;
			await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel) values (${recipeId}, ${version}, ${admin.json(content)}, ${publishedAt}, 'import')`;
			await admin`update app.recipes set version = ${version}, name = ${admin.json(content.name)} where id = ${recipeId}`;
			return version;
		},
		async draftRecipe(name: string): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.recipes (slug, name, description) values (${slug('d')}, ${admin.json({ 'it-IT': name, 'en-GB': '' })}, ${admin.json({ 'it-IT': '', 'en-GB': '' })}) returning id`;
			return id;
		},
		async insertWeek(familyId: string, startsOn: string): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, ${startsOn}, now()) returning id`;
			return id;
		},
		async insertSlot(weekId: string, s: { date: string; mealType: 'lunch' | 'dinner'; recipeId?: string; freeText?: string; servings?: number; updatedBy?: string }): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings, updated_by)
				values (${weekId}, ${s.date}, ${s.mealType}, ${s.recipeId ?? null}, ${s.freeText ?? null}, ${s.servings ?? 2}, ${s.updatedBy ?? null}) returning id`;
			return id;
		},
		async setTimeZone(familyId: string, timeZone: string) {
			await admin`update app.families set time_zone = ${timeZone} where id = ${familyId}`;
		},
		/** A new user, member of a new family, with the claims of a verified web token. */
		async member(options: { locale?: 'it-IT' | 'en-GB' } = {}) {
			const { userId, sessionId } = await db.createUser(options);
			const familyId = await db.createFamily([{ userId, role: 'member' }]);
			const claims = { sub: userId, session_id: sessionId, role: 'authenticated', aud: 'authenticated', iss: TEST_ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 } as unknown as Claims;
			return { userId, sessionId, familyId, claims };
		},
	};
}
```

Se un vincolo di W2 rifiuta una di queste righe (per esempio i campi di `ingredients` o `books`, o `is_localized_text` con stringhe vuote nelle bozze), si adegua la fixture al vincolo letto nella migrazione, senza toccare le migrazioni. Se `Claims` richiede campi diversi, si costruiscono come nei test della piattaforma (`server/test/db.test.ts`).

- [ ] **Step 2: Write the failing tests** `server/test/menu-versions.test.ts`

Tutti nel **ruolo del membro**: è il comportamento destinato all'utente (rilievo 7).

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { mealRecipeVersions } from '../src/menu/versions.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { menuFixtures } from './support/menu.ts';

describe.skipIf(!hasDatabase)('mealRecipeVersions', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
	});
	afterAll(async () => {
		await sql.end();
		await db.close();
	});

	it('uses the version in force when the meal passed, the current one for future meals, the first for older meals, null for drafts', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		const recipe = await fx.publishRecipe({ publishedAt: '2026-01-10T00:00:00Z' });
		await fx.publishVersion(recipe, '2026-01-20T12:00:00Z');
		const draft = await fx.draftRecipe('Bozza');
		const old = await fx.insertWeek(familyId, '2026-01-05');
		const past = await fx.insertWeek(familyId, '2026-01-12');
		const future = await fx.insertWeek(familyId, '2099-01-05');
		const before = await fx.insertSlot(old, { date: '2026-01-05', mealType: 'dinner', recipeId: recipe });
		const atV1 = await fx.insertSlot(past, { date: '2026-01-12', mealType: 'dinner', recipeId: recipe });
		const draftSlot = await fx.insertSlot(past, { date: '2026-01-13', mealType: 'lunch', recipeId: draft });
		await fx.insertSlot(past, { date: '2026-01-14', mealType: 'lunch', freeText: 'Pizza' });
		const coming = await fx.insertSlot(future, { date: '2099-01-05', mealType: 'lunch', recipeId: recipe });

		const run = (weekId: string, family = familyId) => withDbOn(sql, { kind: 'user', claims }, (tx) => mealRecipeVersions(tx, family, weekId));
		expect(await run(old)).toEqual([{ slotId: before, recipeId: recipe, version: 1, isPast: true }]);
		expect(await run(past)).toEqual([
			{ slotId: atV1, recipeId: recipe, version: 1, isPast: true },
			{ slotId: draftSlot, recipeId: draft, version: null, isPast: true },
		]);
		expect(await run(future)).toEqual([{ slotId: coming, recipeId: recipe, version: 2, isPast: false }]);
		const stranger = await db.createFamily([]);
		expect(await run(past, stranger)).toEqual([]);
	});

	it('switches version exactly at 15:30 and 23:00, in the family time zone, like the SQL functions', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		// Rome, Wednesday 14 October 2026: lunch passes at 13:30Z, dinner at 21:00Z.
		const lunchRecipe = await fx.publishRecipe({ publishedAt: '2026-01-01T00:00:00Z' });
		await fx.publishVersion(lunchRecipe, '2026-10-14T13:31:00Z'); // one minute after lunch passed
		const dinnerRecipe = await fx.publishRecipe({ publishedAt: '2026-01-01T00:00:00Z' });
		await fx.publishVersion(dinnerRecipe, '2026-10-14T20:59:00Z'); // one minute before dinner passed
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-14', mealType: 'lunch', recipeId: lunchRecipe });
		await fx.insertSlot(week, { date: '2026-10-14', mealType: 'dinner', recipeId: dinnerRecipe });
		const versions = async () => (await withDbOn(sql, { kind: 'user', claims }, (tx) => mealRecipeVersions(tx, familyId, week))).map((v) => v.version);
		expect(await versions()).toEqual([1, 2]);
		const [{ lunch, dinner }] = await db.admin<{ lunch: number; dinner: number }[]>`
			select app.recipe_version_at(${lunchRecipe}, app.meal_passed_at('2026-10-14', 'lunch', 'Europe/Rome')) as lunch,
				app.recipe_version_at(${dinnerRecipe}, app.meal_passed_at('2026-10-14', 'dinner', 'Europe/Rome')) as dinner`;
		expect([lunch, dinner]).toEqual([1, 2]);
		// New York: lunch passes at 19:30Z, after the second version of 13:31Z.
		await fx.setTimeZone(familyId, 'America/New_York');
		expect(await versions()).toEqual([2, 2]);
	});
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -w server -- menu-versions`
Expected: FAIL (modulo inesistente). Il database locale deve essere avviato (`supabase db start`, vedi `server/README.md`).

- [ ] **Step 4: Implement `server/src/menu/versions.ts`**

```ts
import type { Tx } from '../db.ts';

export interface MealRecipeVersion {
	slotId: string;
	recipeId: string;
	/** Version shown by the meal; null when the recipe was never published. */
	version: number | null;
	/** True when the meal is past at the time of the call. */
	isPast: boolean;
}

/**
 * Slots with a recipe of one week and the version each meal uses (spec section 5, R1): a past
 * meal the version in force when it passed (the first one if older than the first
 * publication), today and future meals the current one, never-published recipes null.
 * Runs in the caller's role: members see the drafts their family's meals cite, app_job does
 * not. Also used by the shopping list (W4).
 */
export async function mealRecipeVersions(tx: Tx, familyId: string, weekId: string): Promise<MealRecipeVersion[]> {
	return tx<MealRecipeVersion[]>`
		select s.id as "slotId", s.recipe_id as "recipeId",
			case when p.passed_at <= now() then app.recipe_version_at(s.recipe_id, p.passed_at)
				when r.version > 0 then r.version end as version,
			p.passed_at <= now() as "isPast"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		join app.recipes r on r.id = s.recipe_id
		cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as passed_at) p
		where s.week_id = ${weekId} and w.family_id = ${familyId}
		order by s.date, s.meal_type desc`;
}
```

`order by s.meal_type desc` mette `lunch` prima di `dinner`.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w server -- menu-versions && npm run typecheck -w server`
Expected: PASS.

```bash
git add server/src/menu/versions.ts server/test/support/menu.ts server/test/menu-versions.test.ts
git commit -m "Menu: versione della ricetta per pasto (R1), riusabile dalla spesa"
```

- [ ] **Step 6: Verifica, push e PR piccola**

Run: `npm test && npm run typecheck && npm run build` (skill `superpowers:verification-before-completion`).
Expected: PASS.

```bash
git push -u origin traguardo/menu-versioni
gh pr create --base main --head traguardo/menu-versioni --title "Menu: versione della ricetta per pasto (R1) per la spesa" --body "..."
```

Descrizione in italiano: cosa fa (`mealRecipeVersions` e dati di prova `menuFixtures`, riusabili da W4), come è stato verificato (test nel ruolo del membro, confini 15:30/23:00, cambio di fuso), sezione 5 della specifica (R1) e sezione 3 della spec del menu. Scrivere `STATO: PR_APERTA <url>` e aspettare: dopo la review e il merge del coordinatore si riprende dal Task 2 su `traguardo/menu`, ribasato su `origin/main`.

---

### Task 2: Primo pasto da pianificare nel dominio

**Files:**
- Modify: `domain/src/planner/types.ts`, `domain/src/planner/constraints.ts`, `domain/src/planner/generate.ts:10-22`
- Test: `domain/src/planner/generate.test.ts`

**Interfaces:**
- Produces: `interface PlannerSlotRef { date: IsoDate; mealType: MealType }`; `PlannerInput.from?: PlannerSlotRef`; `isPlannedSlot(input: PlannerInput, date: IsoDate, mealType: MealType): boolean` (da `constraints.ts`).

- [ ] **Step 1: Write the failing tests** (in `generate.test.ts`, dentro `describe('generateWeek')`)

```ts
	it('plans only from the given meal on, and the whole week without it', () => {
		const input = baseInput({ from: { date: '2026-10-14', mealType: 'dinner' } });
		const week = generateWeek(input);
		expect(week.slots[0]).toMatchObject({ date: '2026-10-14', mealType: 'dinner' });
		expect(week.slots.every((s) => s.date > '2026-10-14' || (s.date === '2026-10-14' && s.mealType === 'dinner'))).toBe(true);
		expect(week.slots).toHaveLength(9);
		expect(hardViolations(week, input)).toEqual([]);
		expect(generateWeek(baseInput()).slots).toHaveLength(14);
	});

	it('rejects a first meal outside the week', () => {
		expect(() => generateWeek(baseInput({ from: { date: '2026-10-19', mealType: 'lunch' } }))).toThrow(RangeError);
		expect(() => generateWeek(baseInput({ from: { date: '2026-10-11', mealType: 'dinner' } }))).toThrow(RangeError);
	});
```

Conteggio: con `familySettings()`, dalla cena di mercoledì in poi restano 9 slot (mercoledì cena; giovedì e venerdì pranzo e cena; sabato pranzo e cena libera; domenica pizza e cena).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w domain -- generate`
Expected: FAIL (14 slot invece di 9; nessun `RangeError`).

- [ ] **Step 3: Implement**

In `types.ts`, prima di `PlannerInput`:

```ts
/** A meal of the calendar: a day and lunch or dinner. */
export interface PlannerSlotRef {
	date: IsoDate;
	mealType: MealType;
}
```

e dentro `PlannerInput`, dopo `history`:

```ts
	/** First meal to plan: earlier meals of the week get no slot (current week generated halfway). */
	from?: PlannerSlotRef;
```

In `constraints.ts` (aggiungere `mealIndex` all'import da `./calendar.ts`):

```ts
/** A meal of the week gets a slot: planned in the diners matrix and not before `input.from`. */
export function isPlannedSlot(input: PlannerInput, date: IsoDate, mealType: MealType): boolean {
	if (slotSettingOf(input.settings, date, mealType).servings === 0) return false;
	return !input.from || mealIndex(date, mealType) >= mealIndex(input.from.date, input.from.mealType);
}
```

In `hardViolations` sostituire `if (setting.servings === 0) continue;` con `if (!isPlannedSlot(input, date, mealType)) continue;`.

In `generate.ts` (import di `isPlannedSlot`):

```ts
export function plannedSlots(input: PlannerInput): PlannedSlot[] {
	if (input.from && (input.from.date < input.weekStart || input.from.date > addDays(input.weekStart, 6))) {
		throw new RangeError(`first meal ${input.from.date} outside the week of ${input.weekStart}`);
	}
	const slots: PlannedSlot[] = [];
	for (let day = 0; day < 7; day++) {
		for (const mealType of MEAL_TYPES) {
			const date = addDays(input.weekStart, day);
			if (!isPlannedSlot(input, date, mealType)) continue;
			const setting = slotSettingOf(input.settings, date, mealType);
			const content: PlannedSlot['content'] = setting.fixedText !== null ? { kind: 'free', text: setting.fixedText } : { kind: 'no_match' };
			slots.push({ date, mealType, servings: setting.servings, content });
		}
	}
	return slots;
}
```

- [ ] **Step 4: Run the domain tests and the report**

Run: `npm test -w domain && npm run typecheck -w domain && npm run planner-report && git diff progetto/reports/planner-report.md`
Expected: tutti PASS. Nel report possono cambiare solo le righe delle misure di tempo, che variano a ogni esecuzione; se cambia altro, il comportamento è cambiato e va corretto.

- [ ] **Step 5: Commit**

```bash
git checkout progetto/reports/planner-report.md
git add domain/src/planner
git commit -m "Pianificatore: primo pasto da pianificare per generare una settimana a metà"
```

---

### Task 3: Settimane successive già pianificate

**Files:**
- Modify: `domain/src/planner/types.ts`, `domain/src/planner/prepared.ts`, `domain/src/planner/score.ts`, `domain/src/planner/constraints.ts`
- Test: `domain/src/planner/generate.test.ts`, `domain/src/planner/constraints.test.ts`

**Interfaces:**
- Consumes: `PlannerInput.from` (Task 2).
- Produces: `PlannerInput.upcoming?: PastMeal[]`; `Prepared.upcoming` (pasti successivi entro 7 giorni dalla fine della settimana, ricette del catalogo); `recentIds` di `Prepared` comprende le ricette dei 14 giorni dopo la fine della settimana; `usedSoonAfter(recipeId: string, weekStart: IsoDate, upcoming: PastMeal[]): boolean` (da `constraints.ts`).

- [ ] **Step 1: Write the failing tests**

In `generate.test.ts`:

```ts
	it('does not repeat recipes already planned in the 14 days after the week (next week generated first)', () => {
		const recipes = syntheticCatalogue(20);
		const next = generateWeek(baseInput({ weekStart: '2026-10-19', recipes }));
		const upcoming: PastMeal[] = next.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []));
		const input = baseInput({ recipes, from: { date: '2026-10-14', mealType: 'dinner' }, upcoming });
		const current = generateWeek(input);
		const nextIds = new Set(upcoming.map((m) => m.recipeId));
		expect(current.slots.filter((s) => s.content.kind === 'recipe' && nextIds.has(s.content.recipeId))).toEqual([]);
		expect(hardViolations(current, input)).toEqual([]);
	});

	it("keeps today's weeks when nothing is planned after", () => {
		expect(generateWeek(baseInput({ upcoming: [] }))).toEqual(generateWeek(baseInput()));
	});
```

In `constraints.test.ts`:

```ts
	it('reports a recipe planned again within 14 days after the week', () => {
		const input = baseInput({ upcoming: [{ date: '2026-11-01', mealType: 'lunch', recipeId: 'r00' }] });
		const week = { weekStart: input.weekStart, slots: [{ date: '2026-10-12', mealType: 'lunch' as const, servings: 2, content: { kind: 'recipe' as const, recipeId: 'r00' } }] };
		expect(hardViolations(week, input).some((p) => p.includes('planned again within two weeks'))).toBe(true);
		expect(usedSoonAfter('r00', '2026-10-12', [{ date: '2026-11-02', mealType: 'lunch', recipeId: 'r00' }])).toBe(false);
	});
```

(il 1° novembre è il 14° giorno dopo domenica 18 ottobre, il 2 novembre il 15°).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w domain -- generate constraints`
Expected: FAIL (ricette ripetute; `usedSoonAfter` inesistente).

- [ ] **Step 3: Implement**

`types.ts`, dentro `PlannerInput` dopo `history`:

```ts
	/** Meals already planned after the week (weeks generated earlier), oldest first: neighbours, never changed. */
	upcoming?: PastMeal[];
```

`prepared.ts`: aggiungere a `Prepared`

```ts
	/** Planned meals after the week within the similarity reach (7 days), catalogue recipes only. */
	upcoming: readonly { date: IsoDate; mealType: MealType; recipe: PlannerRecipe }[];
```

e nel calcolo:

```ts
	const weekEnd = addDays(input.weekStart, 6);
	const after = (input.upcoming ?? []).filter((m) => m.date > weekEnd);
	const soonUntil = addDays(weekEnd, RECENT_DAYS);
	const nearUntil = addDays(weekEnd, 7);
	// in result:
		recentIds: new Set([
			...before.filter((m) => m.date >= recentFrom).map((m) => m.recipeId),
			...after.filter((m) => m.date <= soonUntil).map((m) => m.recipeId),
		]),
		upcoming: after.flatMap((m) => {
			const recipe = byId.get(m.recipeId);
			return recipe && m.date <= nearUntil ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
		}),
```

`score.ts`: `ScoreContext` riceve `upcoming: readonly Placed[]` da `prepared(input).upcoming` in `buildContext`; nella somiglianza:

```ts
	for (const near of [...ctx.past, ...ctx.upcoming, ...ctx.week]) {
```

(`recency` e `knownNew` restano su `past` e `knownIds`).

`constraints.ts`:

```ts
/** A recipe already planned in the 14 days after the week (a later week generated first). */
export function usedSoonAfter(recipeId: string, weekStart: IsoDate, upcoming: PastMeal[]): boolean {
	const end = addDays(weekStart, 6);
	const until = addDays(end, RECENT_DAYS);
	return upcoming.some((meal) => meal.recipeId === recipeId && meal.date > end && meal.date <= until);
}
```

e in `hardViolations`, dopo il controllo di `recentlyUsed`:

```ts
		if (usedSoonAfter(recipe.id, input.weekStart, input.upcoming ?? [])) problems.push(`${key}: planned again within two weeks`);
```

`candidatesFor` usa già `prepared(input).recentIds`, quindi esclude anche le ricette successive. Controllare in `repair.ts` che le alternative passino da `candidatesFor` o da `recentIds` (`grep -n recent domain/src/planner/repair.ts`); se una strada usa `recentlyUsed` direttamente, aggiungere lì `usedSoonAfter`.

- [ ] **Step 4: Run tests and the report**

Run: `npm test -w domain && npm run typecheck -w domain && npm run planner-report && git diff progetto/reports/planner-report.md`
Expected: PASS; report invariato nelle settimane (il report non passa `upcoming`).

- [ ] **Step 5: Commit**

```bash
git checkout progetto/reports/planner-report.md
git add domain/src/planner
git commit -m "Pianificatore: settimane successive già pianificate come vicine (14 giorni e somiglianza)"
```

---

### Task 4: Calendario nel fuso della famiglia

**Files:**
- Create: `domain/src/planner/local-time.ts`
- Modify: `domain/src/planner/index.ts` (una riga di export)
- Test: `domain/src/planner/local-time.test.ts`

**Interfaces:**
- Consumes: `addDays`, `weekdayOf` da `calendar.ts`; `PlannerSlotRef` (Task 2).
- Produces:
  - `interface LocalDateTime { date: IsoDate; time: string }`, con `time` nel formato `HH:mm`;
  - `localDateTime(instant: Date, timeZone: string): LocalDateTime` (lancia `RangeError` se il fuso è sconosciuto);
  - `MEAL_PASSES_AT`;
  - `isMealPast(date, mealType, now): boolean`;
  - `firstOpenMeal(now): PlannerSlotRef`;
  - `mondayOf(date): IsoDate`;
  - `nextWeekStart(now): IsoDate`;
  - `interface GenerationTarget { weekStart: IsoDate; from?: PlannerSlotRef }`;
  - `catchUpTarget(now, weekStart): GenerationTarget | null`;
  - `generationTargets(now, existingWeekStarts): GenerationTarget[]`;
  - `isNextWeekDue(now): boolean`;
  - `isJobOverdue(now, targetWeek): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { catchUpTarget, firstOpenMeal, generationTargets, isJobOverdue, isMealPast, isNextWeekDue, localDateTime, mondayOf, nextWeekStart } from './local-time.ts';

const at = (date: string, time: string) => ({ date, time });

describe('localDateTime', () => {
	it('reads date and time in the family time zone', () => {
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/Rome')).toEqual(at('2026-10-14', '20:00'));
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/London')).toEqual(at('2026-10-14', '19:00'));
		expect(localDateTime(new Date('2026-10-15T01:30:00Z'), 'America/New_York')).toEqual(at('2026-10-14', '21:30'));
	});
	it('follows the European change of 25 October 2026 in Rome and London', () => {
		expect(localDateTime(new Date('2026-10-24T22:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-25', '00:30'));
		expect(localDateTime(new Date('2026-10-25T23:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-26', '00:30'));
		expect(localDateTime(new Date('2026-10-24T23:30:00Z'), 'Europe/London')).toEqual(at('2026-10-25', '00:30'));
		expect(localDateTime(new Date('2026-10-25T23:30:00Z'), 'Europe/London')).toEqual(at('2026-10-25', '23:30'));
	});
	it('follows the American change of 1 November 2026 in New York', () => {
		expect(localDateTime(new Date('2026-11-01T03:30:00Z'), 'America/New_York')).toEqual(at('2026-10-31', '23:30'));
		expect(localDateTime(new Date('2026-11-02T04:30:00Z'), 'America/New_York')).toEqual(at('2026-11-01', '23:30'));
	});
	it('writes midnight as 00:00', () => {
		expect(localDateTime(new Date('2026-10-13T22:00:00Z'), 'Europe/Rome')).toEqual(at('2026-10-14', '00:00'));
	});
	it('rejects an unknown time zone', () => {
		expect(() => localDateTime(new Date(), 'Mars/Olympus')).toThrow(RangeError);
	});
});

describe('meals and weeks', () => {
	it('passes lunch at 15:30 and dinner at 23:00', () => {
		expect(isMealPast('2026-10-14', 'lunch', at('2026-10-14', '15:29'))).toBe(false);
		expect(isMealPast('2026-10-14', 'lunch', at('2026-10-14', '15:30'))).toBe(true);
		expect(isMealPast('2026-10-14', 'dinner', at('2026-10-14', '22:59'))).toBe(false);
		expect(isMealPast('2026-10-13', 'dinner', at('2026-10-14', '00:00'))).toBe(true);
	});
	it('finds the first open meal', () => {
		expect(firstOpenMeal(at('2026-10-14', '09:00'))).toEqual({ date: '2026-10-14', mealType: 'lunch' });
		expect(firstOpenMeal(at('2026-10-14', '15:30'))).toEqual({ date: '2026-10-14', mealType: 'dinner' });
		expect(firstOpenMeal(at('2026-10-14', '20:00'))).toEqual({ date: '2026-10-14', mealType: 'dinner' });
		expect(firstOpenMeal(at('2026-10-14', '23:00'))).toEqual({ date: '2026-10-15', mealType: 'lunch' });
	});
	it('finds the Monday of a date and the next one', () => {
		expect(mondayOf('2026-10-12')).toBe('2026-10-12');
		expect(mondayOf('2026-10-18')).toBe('2026-10-12');
		expect(nextWeekStart(at('2026-10-18', '12:00'))).toBe('2026-10-19');
	});
	it('makes next week due from Wednesday 20:00', () => {
		expect(isNextWeekDue(at('2026-10-14', '19:59'))).toBe(false);
		expect(isNextWeekDue(at('2026-10-14', '20:00'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-18', '23:59'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-12', '08:00'))).toBe(false);
	});
	it('makes a job overdue from the Thursday 08:00 before its week, whatever the current week', () => {
		expect(isJobOverdue(at('2026-10-15', '07:59'), '2026-10-19')).toBe(false);
		expect(isJobOverdue(at('2026-10-15', '08:00'), '2026-10-19')).toBe(true);
		expect(isJobOverdue(at('2026-10-19', '10:00'), '2026-10-19')).toBe(true);
		expect(isJobOverdue(at('2026-10-15', '08:00'), '2026-10-26')).toBe(false);
	});
});

describe('catchUpTarget', () => {
	it('generates a week not started yet whole, a started one from its open meals, a finished one never', () => {
		expect(catchUpTarget(at('2026-10-16', '10:00'), '2026-10-19')).toEqual({ weekStart: '2026-10-19' });
		expect(catchUpTarget(at('2026-10-19', '10:00'), '2026-10-19')).toEqual({ weekStart: '2026-10-19', from: { date: '2026-10-19', mealType: 'lunch' } });
		expect(catchUpTarget(at('2026-10-25', '23:30'), '2026-10-19')).toBeNull();
		expect(catchUpTarget(at('2026-10-28', '21:00'), '2026-10-19')).toBeNull();
	});
});

describe('generationTargets', () => {
	it('generates the rest of the current week for a family without weeks', () => {
		expect(generationTargets(at('2026-10-13', '16:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-13', mealType: 'dinner' } },
		]);
	});
	it('adds next week after Wednesday 20:00, the current week from Wednesday dinner', () => {
		expect(generationTargets(at('2026-10-14', '20:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-14', mealType: 'dinner' } },
			{ weekStart: '2026-10-19' },
		]);
		expect(generationTargets(at('2026-10-14', '19:59'), ['2026-10-12'])).toEqual([]);
		expect(generationTargets(at('2026-10-14', '20:00'), ['2026-10-12'])).toEqual([{ weekStart: '2026-10-19' }]);
	});
	it('creates the current week when only the next exists (cron first)', () => {
		expect(generationTargets(at('2026-10-15', '09:00'), ['2026-10-19'])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-15', mealType: 'lunch' } },
		]);
	});
	it('does nothing when both weeks exist', () => {
		expect(generationTargets(at('2026-10-16', '10:00'), ['2026-10-12', '2026-10-19'])).toEqual([]);
	});
	it('skips the current week when no meal is left on Sunday night', () => {
		expect(generationTargets(at('2026-10-18', '23:30'), [])).toEqual([{ weekStart: '2026-10-19' }]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w domain -- local-time`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implement `local-time.ts`**

```ts
import { addDays, weekdayOf } from './calendar.ts';
import type { IsoDate, MealType, PlannerSlotRef } from './types.ts';

/** Wall-clock date and time of a family, HH:mm in 24 hours. */
export interface LocalDateTime {
	date: IsoDate;
	time: string;
}

/** When a meal becomes past, in the family's local time (spec section 5). */
export const MEAL_PASSES_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };
/** The weekly job generates next week from this local time on Wednesday (spec section 4). */
export const GENERATION_TIME = '20:00';
/** Twelve hours after Wednesday 20:00: Thursday 08:00. */
export const OVERDUE_TIME = '08:00';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		// Throws RangeError for an unknown time zone.
		formatter = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			calendar: 'gregory',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

export function localDateTime(instant: Date, timeZone: string): LocalDateTime {
	const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const isAtOrAfter = (now: LocalDateTime, date: IsoDate, time: string) => now.date > date || (now.date === date && now.time >= time);

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
	return isAtOrAfter(now, date, MEAL_PASSES_AT[mealType]);
}

export function firstOpenMeal(now: LocalDateTime): PlannerSlotRef {
	if (!isMealPast(now.date, 'lunch', now)) return { date: now.date, mealType: 'lunch' };
	if (!isMealPast(now.date, 'dinner', now)) return { date: now.date, mealType: 'dinner' };
	return { date: addDays(now.date, 1), mealType: 'lunch' };
}

export function mondayOf(date: IsoDate): IsoDate {
	return addDays(date, -weekdayOf(date));
}

export function nextWeekStart(now: LocalDateTime): IsoDate {
	return addDays(mondayOf(now.date), 7);
}

export function isNextWeekDue(now: LocalDateTime): boolean {
	return isAtOrAfter(now, addDays(mondayOf(now.date), 2), GENERATION_TIME);
}

/** Overdue from the Thursday 08:00 before the job's week: 12 hours after its Wednesday 20:00. */
export function isJobOverdue(now: LocalDateTime, targetWeek: IsoDate): boolean {
	return isAtOrAfter(now, addDays(targetWeek, -4), OVERDUE_TIME);
}

export interface GenerationTarget {
	weekStart: IsoDate;
	from?: PlannerSlotRef;
}

/** A week not started is generated whole, a started one from its open meals; a finished one gives null. */
export function catchUpTarget(now: LocalDateTime, weekStart: IsoDate): GenerationTarget | null {
	if (now.date < weekStart) return { weekStart };
	const from = firstOpenMeal(now);
	return from.date <= addDays(weekStart, 6) ? { weekStart, from } : null;
}

/**
 * The one generation rule (spec section 4): the current week from its first open meal if it
 * is missing, and next week whole if it is missing and Wednesday 20:00 has passed.
 */
export function generationTargets(now: LocalDateTime, existingWeekStarts: readonly IsoDate[]): GenerationTarget[] {
	const targets: GenerationTarget[] = [];
	const current = mondayOf(now.date);
	if (!existingWeekStarts.includes(current)) {
		const target = catchUpTarget(now, current);
		if (target) targets.push(target);
	}
	const next = nextWeekStart(now);
	if (isNextWeekDue(now) && !existingWeekStarts.includes(next)) targets.push({ weekStart: next });
	return targets;
}
```

In `index.ts`: `export * from './local-time.ts';`.

- [ ] **Step 4: Run tests**

Run: `npm test -w domain && npm run typecheck -w domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/planner
git commit -m "Pianificatore: ora locale della famiglia, bersagli della generazione e scadenze del job"
```

---

### Task 5: Hook `prepare`, istante della richiesta e tipo `Implementer`

**Files:**
- Modify: `server/src/pipeline.ts`
- Modify: `server/test/support/test-contract.ts`, `server/test/support/context.ts`
- Test: `server/test/pipeline.test.ts`

**Interfaces:**
- Produces:
  - `RequestContext.now?: () => Date`;
  - `OperationContext.now: Date`, l'istante fissato una volta per richiesta;
  - `interface PrepareResult { versionPart?: string }`;
  - `type Prepare = (context: OperationContext, input: unknown) => Promise<PrepareResult | void>`;
  - `createImplementer(contract, options?: { prepare?: Record<string, Prepare> })`, con chiave uguale al percorso dell'operazione unito da punti;
  - `type Implementer = ReturnType<typeof createImplementer<Contract>>` (se W6 l'ha già esportato, si usa il suo);
  - `contextFor(keys, token, connectionString?, now?: () => Date)` nei test.

Ordine nel middleware: token → transazione → sessione → `web_only` → ruolo → **prepare** → `readVersion` + `versionPart` → confronto con `knownVersion` → gestore.

- [ ] **Step 1: Write the failing tests**

In `test/support/test-contract.ts` aggiungere a `testContract.test` l'operazione `preparedView` (come `familyView`, rotta `/test/prepared-view`, input `versionedInput(family.extend({ fail: z.boolean().optional() }))`). Poi l'implementatore con hook:

```ts
export const preparedCalls: string[] = [];
let testMondays = 0;
/** A different Monday at each call, far from the menu tests' weeks. */
const nextTestMonday = () => new Date(Date.UTC(2030, 0, 7 + 7 * testMondays++)).toISOString().slice(0, 10);

const prepared = createImplementer(testContract, {
	prepare: {
		'test.preparedView': async (context, input) => {
			const { familyId, fail } = input as { familyId: string; fail?: boolean };
			if (fail) throw appError('invalid', { issues: [{ path: ['fail'], code: 'refused' }] });
			preparedCalls.push(context.userId);
			// A write in the user's transaction, before the version: it bumps the family counter.
			await context.tx`insert into app.weeks (family_id, starts_on) values (${familyId}, ${nextTestMonday()})`;
			return { versionPart: `t${context.now.toISOString().slice(0, 10)}` };
		},
	},
});
```

`testRouter.test.preparedView = prepared.test.preparedView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView }))`. In `context.ts`, `contextFor(keys, token, connectionString = UNREACHABLE_DB, now?: () => Date)` mette `now` nel `RequestContext` restituito.

In `pipeline.test.ts`, nel blocco con il database:

```ts
	it('runs prepare in the user transaction before the version, with its version part', async () => {
		const { userId: member, sessionId } = await db.createUser();
		const familyId = await db.createFamily([{ userId: member, role: 'member' }]);
		const token = await keys.sign({ sub: member, session_id: sessionId });
		const now = () => new Date('2026-10-14T10:00:00Z');
		const first = await call(testRouter.test.preparedView, { familyId }, { context: contextFor(keys, token, db.appServerUrl, now), path: ['test', 'preparedView'] });
		const [{ v }] = await db.admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${familyId}`;
		expect(first.version).toContain(`f${familyId}:${v}`); // read after prepare's write
		expect(first.version.endsWith('.t2026-10-14')).toBe(true);
		expect(preparedCalls).toContain(member);
	});

	it('answers an error of prepare even with a known version, and skips prepare when the role fails', async () => {
		const { userId: member, sessionId } = await db.createUser();
		const familyId = await db.createFamily([{ userId: member, role: 'member' }]);
		const token = await keys.sign({ sub: member, session_id: sessionId });
		const ctx = () => ({ context: contextFor(keys, token, db.appServerUrl), path: ['test', 'preparedView'], interceptors: [mapErrors] });
		const { version } = await call(testRouter.test.preparedView, { familyId }, ctx());
		const refused = await errorOf(call(testRouter.test.preparedView, { familyId, fail: true, knownVersion: version }, ctx()));
		expect(refused.code).toBe('invalid');

		const { userId: stranger, sessionId: s2 } = await db.createUser();
		const strangerToken = await keys.sign({ sub: stranger, session_id: s2 });
		const error = await errorOf(call(testRouter.test.preparedView, { familyId }, { context: contextFor(keys, strangerToken, db.appServerUrl), path: ['test', 'preparedView'], interceptors: [mapErrors] }));
		expect(error.code).toBe('forbidden');
		expect(preparedCalls).not.toContain(stranger);
	});
```

Prima di scrivere i test, controllare che `call` di `@orpc/server` accetti l'opzione `path` (`grep -n "path" node_modules/@orpc/server/dist/index.d.mts`, tipo delle opzioni di `call`). Se non la accetta, i due test passano dal `fetch` dell'app di test (`createApp({ contract: testContract, router: testRouter, … })` con `rpcClient`), come in `channels.test.ts`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- pipeline`
Expected: FAIL (`createImplementer` non accetta opzioni).

- [ ] **Step 3: Implement in `pipeline.ts`**

```ts
export interface RequestContext {
	// …existing fields…
	/** Current time; tests replace it. The pipeline reads it once per request. */
	now?: () => Date;
}

/** The request's context inside the transaction; `now` becomes the fixed instant of the request. */
export interface OperationContext extends Omit<RequestContext, 'now'> {
	// …existing fields…
	now: Date;
}

export interface PrepareResult {
	/** Appended to the version of the read (for example the effective date). */
	versionPart?: string;
}
/** Runs inside the user's transaction before the version is read: validation against the server's state, lazy work. */
export type Prepare = (context: OperationContext, input: unknown) => Promise<PrepareResult | void>;

export interface ImplementerOptions {
	/** By operation path joined with dots, for example `menu.getOpening`. */
	prepare?: Record<string, Prepare>;
}

export function createImplementer<C extends AnyContractRouter>(contract: C, options: ImplementerOptions = {}) {
	// …
	return base.use<OperationContext>(async ({ context, procedure, path, next }, input) => {
		// …existing code up to checkRole…
			const { now: clock, ...rest } = context;
			const operation: OperationContext = { ...rest, now: clock?.() ?? new Date(), userId: claims.sub, channel, clientId: claims.client_id ?? null, locale, tx };
			const extra = await options.prepare?.[path.join('.')]?.(operation, input);
			if (meta.reads) {
				operation.version = await readVersion(tx, meta.reads, input, locale, context.deployId);
				if (extra?.versionPart) operation.version += `.${extra.versionPart}`;
				if ((input as { knownVersion?: string }).knownVersion === operation.version) {
					return { output: { unchanged: true, version: operation.version }, context: operation };
				}
			}
			return next({ context: operation });
	});
}

/** The one implementer type: built in router.ts, passed to each area's factory. */
export type Implementer = ReturnType<typeof createImplementer<Contract>>;
```

(`import type { Contract } from '@app/contract'`). Aggiornare il commento di `createImplementer`: «… role, prepare, version …».

- [ ] **Step 4: Run the server tests**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS, compresi i test esistenti della piattaforma.

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline.ts server/test
git commit -m "Piattaforma: hook prepare prima della versione, istante della richiesta e tipo Implementer"
```

---

### Task 6: Contratto del menu

**Cancello:** schemi di W6 in `contract/src/recipes/views.ts` su `main` (spec di W6, sezione 1).

**Files:**
- Create: `contract/src/menu/views.ts`, `contract/src/menu/operations.ts`
- Modify: `contract/src/index.ts` (export di `menuContract` e dei tipi)
- Test: `contract/src/menu/operations.test.ts`

L'area si registra in `contract/src/contract.ts` solo nel Task 9, insieme ai gestori: un'operazione del contratto senza gestore nel router non compila.

**Interfaces:**
- Consumes: `recipeSummaryView`, `ratingSummaryView`, `ingredientLineView`, `isoDateSchema`, `mealTypeSchema` da `contract/src/recipes/views.ts` (W6).
- Produces: `menuContract` (`getOpening`, `getWeek`, `getDates`); schemi `openingView`, `weekView`, `dayView`, `mealView`, `monday`, `localDateTimeSchema`; tipi `OpeningView`, `WeekView`, `MealView`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { checkContract } from '../index.ts';
import { menuContract } from './operations.ts';
import { weekView } from './views.ts';

describe('menu contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ menu: menuContract })).toEqual([]);
	});
	it('declares versioned, read-only family reads', () => {
		for (const operation of Object.values(menuContract)) {
			expect(operation['~orpc'].meta).toMatchObject({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] });
		}
	});
	it('accepts an empty week of seven days and rejects a non-Monday', async () => {
		const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${12 + i}`, meals: [] }));
		expect(weekView.safeParse({ startsOn: '2026-10-12', days }).success).toBe(true);
		const result = await menuContract.getWeek['~orpc'].inputSchema!['~standard'].validate({ familyId: crypto.randomUUID(), weekStartsOn: '2026-10-13' });
		expect(result.issues?.length).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w contract -- menu`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implement**

`contract/src/menu/views.ts`:

```ts
import { z } from 'zod';
import { ingredientLineView, isoDateSchema, mealTypeSchema, ratingSummaryView, recipeSummaryView } from '../recipes/views.ts';

/** Family local time, YYYY-MM-DDTHH:mm. */
export const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const monday = isoDateSchema.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, { message: 'not_monday' });

export const mealView = z.object({
	slotId: z.uuid(),
	date: isoDateSchema,
	mealType: mealTypeSchema,
	kind: z.enum(['recipe', 'free', 'empty']),
	recipe: recipeSummaryView.nullable(),
	freeText: z.string().nullable(),
	servings: z.number().int().min(0),
	/** null for a recipe never published (R1): name and description only. */
	ingredients: z.array(ingredientLineView).nullable(),
	note: z.string().nullable(),
	rating: ratingSummaryView.nullable(),
	canOpenRecipe: z.boolean(),
	/** userName null: the author is no longer a member. */
	lastChange: z.object({ userName: z.string().nullable(), at: localDateTimeSchema }).nullable(),
});

export const dayView = z.object({ date: isoDateSchema, meals: z.array(mealView) });
export const weekView = z.object({ startsOn: monday, days: z.array(dayView).length(7) });
export const openingView = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('no_weeks') }),
	z.object({ kind: z.literal('day'), date: isoDateSchema, weekStartsOn: monday }),
]);

export type MealView = z.infer<typeof mealView>;
export type WeekView = z.infer<typeof weekView>;
export type OpeningView = z.infer<typeof openingView>;
```

`contract/src/menu/operations.ts`:

```ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { isoDateSchema } from '../recipes/views.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { monday, openingView, weekView } from './views.ts';

const read = { mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] } as const;

export const menuContract = {
	getOpening: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/opening', summary: 'Day the menu opens on: today, else the next day with meals' })
		.input(versionedInput(z.object({ familyId: z.uuid(), today: isoDateSchema.optional() })))
		.output(versionedOutput(openingView)),
	getWeek: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/weeks/{weekStartsOn}', summary: 'Meals of a week, ready to show' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(versionedInput(z.object({ familyId: z.uuid(), weekStartsOn: monday })))
		.output(versionedOutput(weekView)),
	getDates: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/dates/{month}', summary: 'Days with a menu in a month' })
		.input(versionedInput(z.object({ familyId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })))
		.output(versionedOutput(z.array(isoDateSchema))),
};
```

In `index.ts`: `export { menuContract } from './menu/operations.ts';` e `export { type MealView, type OpeningView, type WeekView } from './menu/views.ts';`.

- [ ] **Step 4: Run**

Run: `npm test -w contract && npm run typecheck -w contract`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src
git commit -m "Contratto: letture del menu (apertura, settimana, giorni con menu)"
```

---

### Task 7: Stato `abandoned` dei job (migrazione)

**Files:**
- Create: `supabase/migrations/20261011140000_weekly_jobs_abandoned.sql`
- Create: `supabase/tests/weekly_jobs_abandoned_test.sql`

**Interfaces:**
- Produces: `app.weekly_jobs.status` accetta `abandoned`.

- [ ] **Step 1: Verify the constraint name and write the failing test**

Run: `psql "$TEST_DATABASE_URL" -c "select conname from pg_constraint where conrelid = 'app.weekly_jobs'::regclass and contype = 'c'"`
Expected: `weekly_jobs_status_check` (se il nome è diverso, usarlo nella migrazione).

`supabase/tests/weekly_jobs_abandoned_test.sql`, stile di `jobs_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select plan(3);

reset role;
select tests.become('app_job');
insert into app.weekly_jobs (family_id, target_week, status) values (tests.family('Rossi'), '2026-11-02', 'failed');
select is(
	tests.affected($$update app.weekly_jobs set status = 'abandoned', updated_at = now() where family_id = tests.family('Rossi') and target_week = '2026-11-02'$$),
	1::bigint, 'the job closes a job whose week is over'
);
select is((select status from app.weekly_jobs where family_id = tests.family('Rossi') and target_week = '2026-11-02'), 'abandoned', 'abandoned is a status');
select throws_ok($$update app.weekly_jobs set status = 'lost' where family_id = tests.family('Rossi')$$, '23514', null, 'other values are still refused');

select * from finish();
rollback;
```

Se le fixture hanno già una riga per quella famiglia e quella settimana, usare un'altra settimana.

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db` (oppure il comando della CI per pgTAP, vedi `.github/workflows/ci.yml` e `supabase/README.md`)
Expected: FAIL sul primo `is` (violazione del check `23514`).

- [ ] **Step 3: Write the migration**

```sql
-- Weekly job: a job whose week is over is closed as abandoned (menu activity, spec
-- section 4.3 of 2026-10-11-menu-pianificatore). Only the status vocabulary changes.
alter table app.weekly_jobs drop constraint weekly_jobs_status_check;
alter table app.weekly_jobs add constraint weekly_jobs_status_check
	check (status in ('pending', 'running', 'done', 'failed', 'abandoned'));
```

- [ ] **Step 4: Apply and run all database tests**

Run: `supabase db reset && supabase test db`
Expected: PASS, compreso `jobs_test.sql` (il test sul vocabolario con `'lost'` resta valido).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011140000_weekly_jobs_abandoned.sql supabase/tests/weekly_jobs_abandoned_test.sql
git commit -m "Schema: stato abandoned per i job settimanali la cui settimana è finita"
```

---

### Task 8: Generazione di una settimana dal database

**Cancello:** `toPlannerRecipe` (W3, `@app/domain/recipe`) e `resolveFamilySettings` (W2 profilo, `@app/domain/family`) su `main`.

**Files:**
- Modify: `server/package.json` (dipendenza di workspace `"@app/domain": "*"`, se W6 non l'ha già aggiunta; poi `npm install`)
- Create: `server/src/log.ts`, `server/src/menu/plan.ts`, `server/src/menu/generation.ts`
- Test: `server/test/menu-generation.test.ts`

**Interfaces:**
- Consumes:
  - `toPlannerRecipe(id: string, document: RecipeDocument): PlannerRecipe`;
  - `resolveFamilySettings(stored: unknown): PlannerSettings`;
  - `generateWeek`, `PlannerInput`, `PastMeal`, `IngredientRestriction`, `GenerationTarget`, `addDays` da `@app/domain/planner`.
- Produces:
  - `logEvent(event: string, fields: Record<string, string | number | null>, level?: 'info' | 'error'): void`;
  - `planWeek(input: PlannerInput): PlannedWeek`, il punto controllato;
  - `lockFamilyWeeks(tx, familyId): Promise<void>`;
  - `loadPlannerInput(tx, familyId, target): Promise<PlannerInput>`;
  - `generateWeek(tx, familyId, target): Promise<boolean>`;
  - `errorCode(error: unknown): string`.

- [ ] **Step 1: Write the failing tests** `server/test/menu-generation.test.ts`

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { generateWeek, loadPlannerInput } from '../src/menu/generation.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { menuFixtures } from './support/menu.ts';

describe.skipIf(!hasDatabase)('week generation', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	afterAll(async () => {
		await sql.end();
		await db.close();
	});

	const asJob = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);
	const slotsOf = (familyId: string, startsOn: string) => db.admin<{ date: string; meal_type: string; recipe_id: string | null; free_text: string | null; servings: number; updated_by: string | null }[]>`
		select s.date::text, s.meal_type, s.recipe_id, s.free_text, s.servings, s.updated_by from app.meal_slots s
		join app.weeks w on w.id = s.week_id where w.family_id = ${familyId} and w.starts_on = ${startsOn} order by s.date, s.meal_type desc`;
	const recipeIds = async (familyId: string, startsOn: string) => (await slotsOf(familyId, startsOn)).flatMap((s) => (s.recipe_id ? [s.recipe_id] : []));

	it('loads the published catalogue, the history before and the meals planned after the week', async () => {
		const fx = menuFixtures(db);
		const familyId = await db.createFamily([]);
		const archived = await fx.publishRecipe();
		await db.admin`update app.recipes set status = 'archived', archived_at = now() where id = ${archived}`;
		const draft = await fx.draftRecipe('Bozza');
		const eaten = await fx.publishRecipe();
		const planned = await fx.publishRecipe();
		await fx.insertSlot(await fx.insertWeek(familyId, '2026-10-05'), { date: '2026-10-06', mealType: 'dinner', recipeId: eaten });
		await fx.insertSlot(await fx.insertWeek(familyId, '2026-10-19'), { date: '2026-10-20', mealType: 'lunch', recipeId: planned });
		const input = await asJob((tx) => loadPlannerInput(tx, familyId, { weekStart: '2026-10-12' }));
		const ids = input.recipes.map((r) => r.id);
		expect(ids).toContain(eaten);
		expect(ids).not.toContain(archived);
		expect(ids).not.toContain(draft);
		expect(input.history).toEqual([{ date: '2026-10-06', mealType: 'dinner', recipeId: eaten }]);
		expect(input.upcoming).toEqual([{ date: '2026-10-20', mealType: 'lunch', recipeId: planned }]);
		expect(input.settings.slots.lunch).toHaveLength(7);
	});

	it('creates the week once, with app-authored slots, and the same week for the same input', async () => {
		const familyId = await db.createFamily([]);
		expect(await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-12' }))).toBe(true);
		const slots = await slotsOf(familyId, '2026-10-12');
		expect(slots).toHaveLength(14);
		expect(slots.every((s) => s.updated_by === null && s.servings === 2)).toBe(true);
		expect(await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-12' }))).toBe(false);
		expect(await slotsOf(familyId, '2026-10-12')).toEqual(slots);
	});

	it('creates one week when two requests generate it at the same time', async () => {
		const familyId = await db.createFamily([]);
		const results = await Promise.all([1, 2].map(() => asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-19' }))));
		expect(results.sort()).toEqual([false, true]);
		expect(await slotsOf(familyId, '2026-10-19')).toHaveLength(14);
	});

	it('generates from the first open meal', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-26', from: { date: '2026-10-30', mealType: 'dinner' } }));
		const slots = await slotsOf(familyId, '2026-10-26');
		expect(slots[0]).toMatchObject({ date: '2026-10-30', meal_type: 'dinner' });
		expect(slots).toHaveLength(5);
	});

	it('creates the current week after the next one without repeating its recipes, and never changes the next one', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-09' }));
		const next = await slotsOf(familyId, '2026-11-09');
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-02', from: { date: '2026-11-04', mealType: 'dinner' } }));
		const nextIds = new Set(await recipeIds(familyId, '2026-11-09'));
		expect((await recipeIds(familyId, '2026-11-02')).filter((id) => nextIds.has(id))).toEqual([]);
		expect(await slotsOf(familyId, '2026-11-09')).toEqual(next);
	});

	it('fills a missing week between two planned ones, consistent with both', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-16' }));
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-30' }));
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-23' }));
		const middle = await recipeIds(familyId, '2026-11-23');
		const around = new Set([...(await recipeIds(familyId, '2026-11-16')), ...(await recipeIds(familyId, '2026-11-30'))]);
		expect(middle.filter((id) => around.has(id))).toEqual([]);
	});

	it('uses the book from the document: never a recipe of a book the family does not own', async () => {
		const fx = menuFixtures(db);
		const bookId = await fx.book();
		const bookRecipe = await fx.publishRecipe({ bookId });
		const without = await db.createFamily([]);
		const owner = await db.createFamily([]);
		await db.admin`insert into app.family_books (family_id, book_id) values (${owner}, ${bookId})`;
		const input = await asJob((tx) => loadPlannerInput(tx, without, { weekStart: '2026-12-07' }));
		expect(input.recipes.find((r) => r.id === bookRecipe)?.bookId).toBe(bookId);
		await asJob((tx) => generateWeek(tx, without, { weekStart: '2026-12-07' }));
		expect(await recipeIds(without, '2026-12-07')).not.toContain(bookRecipe);
		expect((await asJob((tx) => loadPlannerInput(tx, owner, { weekStart: '2026-12-07' }))).ownedBookIds).toContain(bookId);
	});

	it('generates in the member role for their own family only, with no new privileges', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		const other = await db.createFamily([]);
		expect(await withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, familyId, { weekStart: '2026-12-14' }))).toBe(true);
		await expect(withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, other, { weekStart: '2026-12-14' }))).rejects.toThrow();
		expect(await slotsOf(other, '2026-12-14')).toHaveLength(0);
	});
});
```

Nel test sul libro, la sola esclusione verificabile in modo deterministico è quella della famiglia senza libro. Per la famiglia che possiede il libro basta verificare che l'ingresso lo riporti (`ownedBookIds`): che venga scelta dipende dal punteggio.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-generation`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implement**

`server/src/log.ts`:

```ts
/** One JSON line with chosen fields: never error messages, data or secrets. */
export function logEvent(event: string, fields: Record<string, string | number | null>, level: 'info' | 'error' = 'info'): void {
	const line = JSON.stringify({ event, ...fields });
	if (level === 'error') console.error(line);
	else console.log(line);
}
```

`server/src/menu/plan.ts`:

```ts
import { generateWeek, type PlannedWeek, type PlannerInput } from '@app/domain/planner';

/** The planner call, in its own module: the controlled point tests replace to simulate a failure. */
export function planWeek(input: PlannerInput): PlannedWeek {
	return generateWeek(input);
}
```

`server/src/menu/generation.ts`:

```ts
import { resolveFamilySettings } from '@app/domain/family';
import { addDays, type GenerationTarget, type IngredientRestriction, type PastMeal, type PlannerInput } from '@app/domain/planner';
import { toPlannerRecipe, type RecipeDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { planWeek } from './plan.ts';

/** Serialises the generations of one family until the end of the transaction (spec section 2, concurrency). */
export async function lockFamilyWeeks(tx: Tx, familyId: string): Promise<void> {
	await tx`select pg_advisory_xact_lock(hashtextextended(${`app.weeks:${familyId}`}, 0))`;
}

/** Everything the planner reads, in the transaction's role (spec section 2). */
export async function loadPlannerInput(tx: Tx, familyId: string, target: GenerationTarget): Promise<PlannerInput> {
	const weekEnd = addDays(target.weekStart, 6);
	const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId}`;
	if (!family) throw new Error('family not readable');
	const recipes = await tx<{ id: string; content: RecipeDocument }[]>`
		select r.id, v.content
		from app.recipes r join app.recipe_versions v on v.recipe_id = r.id and v.version = r.version
		where r.status = 'published'`;
	const books = await tx<{ bookId: string }[]>`select book_id as "bookId" from app.family_books where family_id = ${familyId}`;
	const exclusions = await tx<{ recipeId: string }[]>`select recipe_id as "recipeId" from app.recipe_exclusions where family_id = ${familyId}`;
	const restrictions = await tx<IngredientRestriction[]>`
		select ingredient_id as "ingredientId", restriction, weekly_max as "weeklyMax" from app.family_ingredients where family_id = ${familyId}`;
	const familyScores = await tx<{ recipeId: string; average: string }[]>`
		select recipe_id as "recipeId", average::text from app.family_scores where family_id = ${familyId}`;
	const globalScores = await tx<{ recipeId: string; average: string }[]>`select recipe_id as "recipeId", average::text from app.global_scores`;
	const meals = await tx<(PastMeal & { after: boolean })[]>`
		select s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId", s.date > ${weekEnd} as after
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.recipe_id is not null and (s.date < ${target.weekStart} or s.date > ${weekEnd})
		order by s.date, s.meal_type desc`;
	const scores = (rows: { recipeId: string; average: string }[]) => Object.fromEntries(rows.map((r) => [r.recipeId, Number(r.average)]));
	const meal = ({ date, mealType, recipeId }: PastMeal): PastMeal => ({ date, mealType, recipeId });
	return {
		familyId,
		weekStart: target.weekStart,
		settings: resolveFamilySettings(family.settings),
		recipes: recipes.map((r) => toPlannerRecipe(r.id, r.content)),
		ownedBookIds: books.map((b) => b.bookId),
		exclusions: exclusions.map((e) => e.recipeId),
		restrictions: [...restrictions],
		familyScores: scores(familyScores),
		globalScores: scores(globalScores),
		history: meals.filter((m) => !m.after).map(meal),
		upcoming: meals.filter((m) => m.after).map(meal),
		...(target.from ? { from: target.from } : {}),
	};
}

/** Creates the week if it does not exist yet (spec section 2); false when it already existed. */
export async function generateWeek(tx: Tx, familyId: string, target: GenerationTarget): Promise<boolean> {
	await lockFamilyWeeks(tx, familyId);
	const [week] = await tx<{ id: string }[]>`
		insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, ${target.weekStart}, now())
		on conflict (family_id, starts_on) do nothing returning id`;
	if (!week) return false;
	const planned = planWeek(await loadPlannerInput(tx, familyId, target));
	const rows = planned.slots.map((s) => ({
		week_id: week.id,
		date: s.date,
		meal_type: s.mealType,
		recipe_id: s.content.kind === 'recipe' ? s.content.recipeId : null,
		free_text: s.content.kind === 'free' ? s.content.text : null,
		servings: s.servings,
	}));
	if (rows.length > 0) await tx`insert into app.meal_slots ${tx(rows, 'week_id', 'date', 'meal_type', 'recipe_id', 'free_text', 'servings')}`;
	return true;
}

/** Postgres code or error class, never the message. */
export function errorCode(error: unknown): string {
	if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
	return error instanceof Error ? error.name : 'unknown';
}
```

Prima di scrivere, verificare con Context7 (`/porsager/postgres`) l'helper per la `insert` di più righe (`sql(rows, ...columns)`). Verificare anche che il ruolo `authenticated` possa eseguire `pg_advisory_xact_lock` e `hashtextextended`: sono funzioni di sistema con `execute` a `public`, e W2 ha revocato `public` solo sulle sue funzioni. Il test nel ruolo del membro lo prova.

- [ ] **Step 4: Run**

Run: `npm install && npm test -w server -- menu-generation && npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/package.json package-lock.json server/src/log.ts server/src/menu/plan.ts server/src/menu/generation.ts server/test/menu-generation.test.ts
git commit -m "Menu: generazione della settimana dal database, coerente con le settimane vicine e serializzata per famiglia"
```

---

### Task 9: Generazione pigra, apertura e giorni con menu

**Cancello:** come il Task 8 (generazione); più il Task 6 (contratto).

**Files:**
- Create: `server/src/menu/time.ts`, `server/src/menu/opening.ts`, `server/src/menu/router.ts`
- Modify: `server/src/menu/generation.ts` (aggiunge `ensureWeeks`)
- Modify: `contract/src/contract.ts` (una riga: `menu: menuContract`)
- Modify: `server/src/router.ts` (implementatore unico con `{ prepare: menuPrepare }`, `menu: menuRouter(os)`)
- Modify: `server/test/app.test.ts` (tre nomi nella lista scritta a mano degli strumenti MCP: `menu_getOpening`, `menu_getWeek`, `menu_getDates`)
- Test: `server/test/menu-reads.test.ts`, `server/test/menu-mcp.test.ts`

**Interfaces:**
- Consumes:
  - `generateWeek`, `lockFamilyWeeks`, `errorCode`, `logEvent` (Task 8);
  - `Prepare`, `Implementer`, `OperationContext.now` e `fresh` (Task 5);
  - `menuContract` (Task 6);
  - `localDateTime`, `generationTargets`, `mondayOf`, `addDays`, `daysBetween` (dominio).
- Produces:
  - `localIn(familyId, timeZone, now): LocalDateTime`;
  - `familyNow(tx, familyId, now): Promise<{ timeZone: string; local: LocalDateTime }>`;
  - `ensureWeeks(tx, familyId, now): Promise<void>`;
  - `effectiveDate(context, familyId, today?): Promise<{ date: string; local: string }>`;
  - `openingOf(context, familyId, day): Promise<OpeningView>`;
  - `datesOf(context, familyId, month): Promise<string[]>`;
  - `menuPrepare: Record<string, Prepare>`;
  - `menuRouter(os: Implementer)`. Il gestore di `getWeek` qui risponde sempre `not_found` e lo sostituisce il Task 11; se il Task 11 resta bloccato dal cancello, va dichiarato nella PR.

- [ ] **Step 1: Write the failing tests** `server/test/menu-reads.test.ts`

Helper del file (in `beforeAll`: chiavi di test, database, un utente lettore con token, 20 ricette pubblicate con `menuFixtures(db).publishRecipe()`):

```ts
const memberFamily = () => db.createFamily([{ userId: reader.userId, role: 'member' }]);
const read = (op: 'getOpening' | 'getWeek' | 'getDates', input: Record<string, unknown>, now: Date) =>
	call(router.menu[op] as any, input, { context: contextFor(keys, readerToken, db.appServerUrl, () => now), path: ['menu', op], interceptors: [mapErrors] }) as Promise<any>;
const weekStarts = async (familyId: string) => (await db.admin<{ s: string }[]>`select starts_on::text as s from app.weeks where family_id = ${familyId} order by 1`).map((r) => r.s);
```

Per simulare un errore di generazione si usa il punto controllato:

```ts
const failing = vi.hoisted(() => new Set<string>());
vi.mock('../src/menu/plan.ts', async (original) => {
	const actual = await original<typeof import('../src/menu/plan.ts')>();
	return { planWeek: (input: any) => { if (failing.has(input.familyId)) throw new Error('planner failure'); return actual.planWeek(input); } };
});
```

Casi:

```ts
	it('generates the rest of the current week on the first opening and opens on today', async () => {
		const familyId = await memberFamily();
		const now = new Date('2026-10-13T14:00:00Z'); // Tuesday 16:00 in Rome: from Tuesday dinner
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, now);
		expect(result).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' } });
		expect(await weekStarts(familyId)).toEqual(['2026-10-12']);
	});

	it('answers with next week after Wednesday 20:00 even to a client holding the old version, then unchanged', async () => {
		const familyId = await memberFamily();
		const before = await read('getOpening', { familyId, today: '2026-10-14' }, new Date('2026-10-14T17:59:00Z'));
		const after = await read('getOpening', { familyId, today: '2026-10-14', knownVersion: before.version }, new Date('2026-10-14T18:00:00Z'));
		expect(after.unchanged).toBe(false);
		expect(await weekStarts(familyId)).toEqual(['2026-10-12', '2026-10-19']);
		expect(await read('getOpening', { familyId, today: '2026-10-14', knownVersion: after.version }, new Date('2026-10-14T18:05:00Z'))).toEqual({ unchanged: true, version: after.version });
	});

	it('changes the answer when the day changes, with no write in between', async () => {
		const familyId = await memberFamily();
		const monday = await read('getOpening', { familyId }, new Date('2026-10-12T08:00:00Z'));
		const tuesday = await read('getOpening', { familyId, knownVersion: monday.version }, new Date('2026-10-13T08:00:00Z'));
		expect(tuesday).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13' } });
	});

	it('rejects a today far from the family date before answering unchanged', async () => {
		const familyId = await memberFamily();
		const now = new Date('2026-10-15T10:00:00Z');
		const { version } = await read('getOpening', { familyId, today: '2026-10-15' }, now);
		const error = await errorOf(read('getOpening', { familyId, today: '2026-10-20', knownVersion: version }, now));
		expect(error.code).toBe('invalid');
	});

	it('opens in the five cases of the spec', async () => {
		const fx = menuFixtures(db);
		const now = new Date('2026-10-13T08:00:00Z');
		const opening = async (familyId: string) => (await read('getOpening', { familyId, today: '2026-10-13' }, now)).data;
		// 1. no weeks (generation fails): no_weeks
		const none = await memberFamily();
		failing.add(none);
		expect(await opening(none)).toEqual({ kind: 'no_weeks' });
		// 2. first day from today with content
		const content = await memberFamily();
		const w2 = await fx.insertWeek(content, '2026-10-12');
		await fx.insertSlot(w2, { date: '2026-10-13', mealType: 'lunch' });
		await fx.insertSlot(w2, { date: '2026-10-15', mealType: 'dinner', freeText: 'Pizza' });
		expect(await opening(content)).toEqual({ kind: 'day', date: '2026-10-15', weekStartsOn: '2026-10-12' });
		// 3. only empty slots from today: the first of them
		const empty = await memberFamily();
		const w3 = await fx.insertWeek(empty, '2026-10-12');
		await fx.insertSlot(w3, { date: '2026-10-14', mealType: 'lunch' });
		await fx.insertSlot(w3, { date: '2026-10-16', mealType: 'lunch' });
		expect(await opening(empty)).toEqual({ kind: 'day', date: '2026-10-14', weekStartsOn: '2026-10-12' });
		// 4. only earlier slots: the last of them
		const earlier = await memberFamily();
		failing.add(earlier);
		const w4 = await fx.insertWeek(earlier, '2026-10-05');
		await fx.insertSlot(w4, { date: '2026-10-10', mealType: 'lunch', freeText: 'Fuori' });
		expect(await opening(earlier)).toEqual({ kind: 'day', date: '2026-10-10', weekStartsOn: '2026-10-05' });
		// 5. weeks without slots: Monday of the latest week
		const bare = await memberFamily();
		failing.add(bare);
		await fx.insertWeek(bare, '2026-09-28');
		await fx.insertWeek(bare, '2026-10-05');
		expect(await opening(bare)).toEqual({ kind: 'day', date: '2026-10-05', weekStartsOn: '2026-10-05' });
	});

	it('opens on a freshly generated week with no suitable recipe', async () => {
		const familyId = await memberFamily();
		await db.admin`insert into app.recipe_exclusions (family_id, recipe_id) select ${familyId}, id from app.recipes where status = 'published'`;
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toEqual({ kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' });
	});

	it('still reads when the generation fails, and logs it', async () => {
		const familyId = await memberFamily();
		failing.add(familyId);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toEqual({ kind: 'no_weeks' });
		const events = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(events).toContainEqual(expect.objectContaining({ event: 'lazy_generation_failed', familyId, weekStart: '2026-10-12' }));
		logs.mockRestore();
	});

	it('lists the days with a menu in a month', async () => {
		const familyId = await memberFamily();
		const result = await read('getDates', { familyId, month: '2026-10' }, new Date('2026-10-13T08:00:00Z'));
		expect(result.data).toContain('2026-10-13');
		expect(result.data).not.toContain('2026-10-12');
	});
```

Se `recipe_exclusions` ha colonne obbligatorie oltre a famiglia e ricetta, si adegua l'`insert` alla migrazione.

`server/test/menu-mcp.test.ts`, stile di `channels.test.ts`: app con `createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' })`, `env = testEnv(db.appServerUrl)`, token con `client_id: 'codex'` firmato da `signToken()`, `mcp()` e `toolBody()` di `test/support/requests.ts`, stesso `vi.mock` del punto controllato. L'ora si fissa con `vi.useFakeTimers({ toFake: ['Date'] })` e `vi.setSystemTime(...)`; il token va firmato **dopo** aver fissato l'ora.

```ts
	it('lists the three reads as read-only tools', async () => {
		const list = await mcp(app, env, await signToken(), 'tools/list');
		const menu = list.body.result.tools.filter((t: any) => t.name.startsWith('menu_'));
		expect(menu.map((t: any) => t.name).sort()).toEqual(['menu_getDates', 'menu_getOpening', 'menu_getWeek']);
		expect(menu.every((t: any) => t.annotations?.readOnlyHint === true)).toBe(true);
	});

	it('generates the first week on tools/call and changes the answer with the day', async () => {
		const familyId = await memberFamily();
		vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
		const first = toolBody(await mcp(app, env, await signToken(), 'tools/call', { name: 'menu_getOpening', arguments: { familyId } }));
		expect(first).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-12' } });
		vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
		const second = toolBody(await mcp(app, env, await signToken(), 'tools/call', { name: 'menu_getOpening', arguments: { familyId, knownVersion: first.version } }));
		expect(second).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13' } });
	});

	it('answers errors as tool errors: invalid today even with a version, missing week, other family', async () => {
		const familyId = await memberFamily();
		vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
		const t = await signToken();
		const { version } = toolBody(await mcp(app, env, t, 'tools/call', { name: 'menu_getOpening', arguments: { familyId } }));
		const invalid = await mcp(app, env, t, 'tools/call', { name: 'menu_getOpening', arguments: { familyId, today: '2026-10-20', knownVersion: version } });
		expect(invalid.body.result.isError).toBe(true);
		expect(toolBody(invalid).code).toBe('invalid');
		const missing = await mcp(app, env, t, 'tools/call', { name: 'menu_getWeek', arguments: { familyId, weekStartsOn: '2030-01-07' } });
		expect(toolBody(missing).code).toBe('not_found');
		const other = await mcp(app, env, t, 'tools/call', { name: 'menu_getOpening', arguments: { familyId: await db.createFamily([]) } });
		expect(toolBody(other).code).toBe('forbidden');
	});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- menu-reads menu-mcp`
Expected: FAIL.

- [ ] **Step 3: Implement**

`server/src/menu/time.ts`:

```ts
import { localDateTime, type LocalDateTime } from '@app/domain/planner';
import type { Tx } from '../db.ts';
import { logEvent } from '../log.ts';

export const FALLBACK_TIME_ZONE = 'Europe/Rome';

/** Local date and time in a family's zone; an unreadable zone falls back to Rome with a log line. */
export function localIn(familyId: string, timeZone: string, now: Date): LocalDateTime {
	try {
		return localDateTime(now, timeZone);
	} catch {
		logEvent('invalid_time_zone', { familyId }, 'error');
		return localDateTime(now, FALLBACK_TIME_ZONE);
	}
}

export async function familyNow(tx: Tx, familyId: string, now: Date): Promise<{ timeZone: string; local: LocalDateTime }> {
	const [family] = await tx<{ timeZone: string }[]>`select time_zone as "timeZone" from app.families where id = ${familyId}`;
	const timeZone = family?.timeZone ?? FALLBACK_TIME_ZONE;
	return { timeZone, local: localIn(familyId, timeZone, now) };
}
```

In `generation.ts` (import di `familyNow`, `generationTargets`, `mondayOf`, `logEvent`):

```ts
/** Lazy generation (spec section 4.4): lock first, then each target in a savepoint; failures logged, never thrown. */
export async function ensureWeeks(tx: Tx, familyId: string, now: Date): Promise<void> {
	await lockFamilyWeeks(tx, familyId);
	const { local } = await familyNow(tx, familyId, now);
	const current = mondayOf(local.date);
	const existing = await tx<{ startsOn: string }[]>`
		select starts_on::text as "startsOn" from app.weeks
		where family_id = ${familyId} and starts_on in (${current}, ${addDays(current, 7)})`;
	for (const target of generationTargets(local, existing.map((w) => w.startsOn))) {
		try {
			await tx.savepoint((sp) => generateWeek(sp, familyId, target));
		} catch (error) {
			logEvent('lazy_generation_failed', { familyId, weekStart: target.weekStart, code: errorCode(error) });
		}
	}
}
```

Verificare con Context7 (`/porsager/postgres`, «savepoint») che `tx.savepoint(fn)` esista sulla `TransactionSql` e che un errore dentro annulli solo il savepoint.

`server/src/menu/opening.ts`:

```ts
import type { OpeningView } from '@app/contract';
import { mondayOf } from '@app/domain/planner';
import type { OperationContext } from '../pipeline.ts';
import { familyNow } from './time.ts';

/** Effective date of the opening: the client's today, else the family's local date at the request's instant. */
export async function effectiveDate(context: OperationContext, familyId: string, today: string | undefined): Promise<{ date: string; local: string }> {
	const { local } = await familyNow(context.tx, familyId, context.now);
	return { date: today ?? local.date, local: local.date };
}

/** Spec section 5.2: no weeks; first day from d with content; first day from d with a slot; last day with a slot before d; latest Monday. */
export async function openingOf(context: OperationContext, familyId: string, day: string): Promise<OpeningView> {
	const { tx } = context;
	const [latest] = await tx<{ startsOn: string }[]>`select starts_on::text as "startsOn" from app.weeks where family_id = ${familyId} order by starts_on desc limit 1`;
	if (!latest) return { kind: 'no_weeks' };
	const [withContent] = await tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${day} and (s.recipe_id is not null or s.free_text is not null)
		order by s.date limit 1`;
	const [anySlot] = withContent ? [] : await tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${day} order by s.date limit 1`;
	const [earlier] = withContent || anySlot ? [] : await tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date < ${day} order by s.date desc limit 1`;
	const date = withContent?.date ?? anySlot?.date ?? earlier?.date ?? latest.startsOn;
	return { kind: 'day', date, weekStartsOn: mondayOf(date) };
}

export async function datesOf(context: OperationContext, familyId: string, month: string): Promise<string[]> {
	const first = `${month}-01`;
	const rows = await context.tx<{ date: string }[]>`
		select distinct s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${first} and s.date < (${first}::date + interval '1 month')
		order by date`;
	return rows.map((r) => r.date);
}
```

`server/src/menu/router.ts`:

```ts
import { daysBetween } from '@app/domain/planner';
import { appError } from '../errors.ts';
import { fresh, type Implementer, type Prepare } from '../pipeline.ts';
import { ensureWeeks } from './generation.ts';
import { datesOf, effectiveDate, openingOf } from './opening.ts';

const familyOf = (input: unknown) => (input as { familyId: string }).familyId;
const lazy: Prepare = async (context, input) => {
	await ensureWeeks(context.tx, familyOf(input), context.now);
};

export const menuPrepare: Record<string, Prepare> = {
	/** Validates today and puts the effective date in the version, before the unchanged answer (spec 5.1). */
	'menu.getOpening': async (context, input) => {
		const { familyId, today } = input as { familyId: string; today?: string };
		const { date, local } = await effectiveDate(context, familyId, today);
		if (today && Math.abs(daysBetween(local, today)) > 1) {
			throw appError('invalid', { issues: [{ path: ['today'], code: 'out_of_range' }] });
		}
		await ensureWeeks(context.tx, familyId, context.now);
		return { versionPart: `d${date}` };
	},
	'menu.getWeek': lazy,
	'menu.getDates': lazy,
};

export function menuRouter(os: Implementer) {
	return {
		getOpening: os.menu.getOpening.handler(async ({ context, input }) => {
			const { date } = await effectiveDate(context, input.familyId, input.today);
			return fresh(context, await openingOf(context, input.familyId, date));
		}),
		getDates: os.menu.getDates.handler(async ({ context, input }) => fresh(context, await datesOf(context, input.familyId, input.month))),
		// Replaced in Task 11 by the week view.
		getWeek: os.menu.getWeek.handler(() => {
			throw appError('not_found');
		}),
	};
}
```

`contract/src/contract.ts`: `import { menuContract } from './menu/operations.ts';` e `menu: menuContract,`.

`server/src/router.ts`:

```ts
const os = createImplementer(contract, { prepare: { ...menuPrepare } });

export const router = os.router({
	session: { /* unchanged */ },
	menu: menuRouter(os),
});
```

Se W6 ha già portato in `router.ts` il suo implementatore e i suoi factory, si aggiunge solo `menuPrepare` alla mappa e `menu: menuRouter(os)`.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src/contract.ts server/src server/test
git commit -m "Menu: generazione pigra nel percorso della richiesta, apertura con la data nella versione e giorni con menu"
```

---

### Task 10: Job orario con il Cron Trigger

**Cancello:** come il Task 8.

**Files:**
- Create: `server/src/menu/job.ts`
- Modify: `server/src/index.ts` (handler `scheduled`), `server/wrangler.jsonc` (cron), `server/README.md` (prova in locale)
- Test: `server/test/menu-job.test.ts`

**Interfaces:**
- Consumes: `generateWeek`, `ensureWeeks`, `lockFamilyWeeks`, `errorCode` (Tasks 8-9); `localIn` (Task 9); `isNextWeekDue`, `nextWeekStart`, `catchUpTarget`, `isJobOverdue` (Task 4); `withDbOn` di `server/src/db.ts`; `logEvent` (Task 8).
- Produces:
  - `runWeeklyJobOn(sql: postgres.Sql, now: Date): Promise<{ generated: number; failed: number; abandoned: number }>`;
  - `runWeeklyJob(connectionString: string, now: Date)`, la stessa funzione con una connessione propria.

- [ ] **Step 1: Write the failing tests** `server/test/menu-job.test.ts`

`beforeAll`: database, `sql = postgres(db.appServerUrl, { max: 4, fetch_types: false })`, 20 ricette pubblicate. Stesso punto controllato del Task 9 (`vi.hoisted` e `vi.mock('../src/menu/plan.ts', …)` con l'insieme `failing`). Ogni test usa settimane diverse dagli altri: un'esecuzione serve tutte le famiglie del database di test, e le asserzioni guardano solo le famiglie create nel test.

```ts
	const jobRow = async (familyId: string, week: string) =>
		(await db.admin<{ status: string; attempts: number; error: string | null }[]>`select status, attempts, error from app.weekly_jobs where family_id = ${familyId} and target_week = ${week}`)[0];
	const hasWeek = async (familyId: string, startsOn: string) =>
		(await db.admin`select 1 from app.weeks where family_id = ${familyId} and starts_on = ${startsOn}`).length === 1;
	const events = (spy: MockInstance) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));

	it('does nothing before Wednesday 20:00 and generates next week after it, in each family time zone', async () => {
		const rome = await db.createFamily([]);
		const newYork = await db.createFamily([]);
		await menuFixtures(db).setTimeZone(newYork, 'America/New_York');
		await runWeeklyJobOn(sql, new Date('2026-10-13T12:00:00Z'));
		expect(await jobRow(rome, '2026-10-19')).toBeUndefined();
		await runWeeklyJobOn(sql, new Date('2026-10-14T18:30:00Z')); // 20:30 in Rome, 14:30 in New York
		expect(await hasWeek(rome, '2026-10-19')).toBe(true);
		expect(await jobRow(rome, '2026-10-19')).toMatchObject({ status: 'done', attempts: 1 });
		expect(await hasWeek(newYork, '2026-10-19')).toBe(false);
		await runWeeklyJobOn(sql, new Date('2026-10-15T00:30:00Z')); // 20:30 in New York
		expect(await hasWeek(newYork, '2026-10-19')).toBe(true);
	});

	it('isolates a failing family and retries it on the next run', async () => {
		const broken = await db.createFamily([]);
		const healthy = await db.createFamily([]);
		failing.add(broken);
		await runWeeklyJobOn(sql, new Date('2026-10-21T18:30:00Z'));
		expect(await jobRow(broken, '2026-10-26')).toMatchObject({ status: 'failed', attempts: 1, error: 'Error' });
		expect(await hasWeek(healthy, '2026-10-26')).toBe(true);
		failing.delete(broken);
		await runWeeklyJobOn(sql, new Date('2026-10-21T19:30:00Z'));
		expect(await jobRow(broken, '2026-10-26')).toMatchObject({ status: 'done', attempts: 2, error: null });
	});

	it('marks done a week the lazy generation already created', async () => {
		const familyId = await db.createFamily([]);
		await menuFixtures(db).insertWeek(familyId, '2026-11-02');
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2026-11-02')`;
		await runWeeklyJobOn(sql, new Date('2026-10-28T19:30:00Z'));
		expect(await jobRow(familyId, '2026-11-02')).toMatchObject({ status: 'done' });
	});

	it('retries a job failed until Sunday on Monday, from the meals still open', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-04T19:30:00Z')); // Wednesday 20:30: job for 9 November fails
		await runWeeklyJobOn(sql, new Date('2026-11-08T21:00:00Z')); // Sunday 22:00: fails again
		failing.delete(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-09T14:00:00Z')); // Monday 15:00 in Rome
		expect(await jobRow(familyId, '2026-11-09')).toMatchObject({ status: 'done', attempts: 3 });
		const [first] = await db.admin<{ date: string; meal_type: string }[]>`
			select s.date::text, s.meal_type from app.meal_slots s join app.weeks w on w.id = s.week_id
			where w.family_id = ${familyId} and w.starts_on = '2026-11-09' order by s.date, s.meal_type desc limit 1`;
		expect(first).toEqual({ date: '2026-11-09', meal_type: 'lunch' }); // 15:00 < 15:30: Monday lunch still open
	});

	it('abandons a job whose week is over, with an error log, and handles the new one', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		await runWeeklyJobOn(sql, new Date('2026-11-11T19:30:00Z')); // job for 16 November fails
		failing.delete(familyId);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2026-11-25T19:30:00Z')); // two weeks later, Wednesday 20:30
		expect(await jobRow(familyId, '2026-11-16')).toMatchObject({ status: 'abandoned' });
		expect(await hasWeek(familyId, '2026-11-16')).toBe(false);
		expect(events(errors)).toContainEqual(expect.objectContaining({ event: 'weekly_job_abandoned', familyId, weekStart: '2026-11-16' }));
		expect(await jobRow(familyId, '2026-11-30')).toMatchObject({ status: 'done' });
		errors.mockRestore();
	});

	it('logs an overdue job from the Thursday 08:00 before its week, also on Monday', async () => {
		const familyId = await db.createFamily([]);
		failing.add(familyId);
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2026-12-02T19:30:00Z')); // Wednesday: failed, not overdue
		expect(events(logs)).not.toContainEqual(expect.objectContaining({ event: 'weekly_job_overdue', familyId }));
		await runWeeklyJobOn(sql, new Date('2026-12-07T09:00:00Z')); // Monday of the job's week
		expect(events(logs)).toContainEqual(expect.objectContaining({ event: 'weekly_job_overdue', familyId, weekStart: '2026-12-07' }));
		logs.mockRestore();
		failing.delete(familyId);
	});

	it('serialises the job and the lazy generation of one family: both weeks once, no failure', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		const now = new Date('2026-12-16T20:00:00Z'); // Wednesday 21:00 in Rome: current and next week both missing
		const holder = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let locked!: () => void;
		const isLocked = new Promise<void>((resolve) => (locked = resolve));
		const lock = withDbOn(holder, { kind: 'job' }, async (tx) => {
			await lockFamilyWeeks(tx, familyId);
			locked();
			await held;
		});
		await isLocked;
		const job = runWeeklyJobOn(sql, now);
		const lazy = withDbOn(sql, { kind: 'user', claims }, async (tx) => {
			await ensureWeeks(tx, familyId, now);
			return (await tx<{ s: string }[]>`select starts_on::text as s from app.weeks where family_id = ${familyId} order by 1`).map((r) => r.s);
		});
		await new Promise((r) => setTimeout(r, 100)); // both are waiting on the lock
		release();
		const [, , seen] = await Promise.all([lock, job, lazy]);
		expect(seen).toEqual(['2026-12-14', '2026-12-21']);
		expect((await db.admin`select 1 from app.weeks where family_id = ${familyId}`).length).toBe(2);
		await holder.end();
	});
```

Il job serve anche le altre famiglie del database, quindi le asserzioni guardano solo questa famiglia. Se il job arriva per primo al blocco, crea la successiva e la richiesta pigra crea poi la corrente vedendo la successiva; nell'altro ordine la richiesta pigra crea entrambe e il job trova la successiva già fatta. In tutti e due i casi le settimane sono due e nessuno fallisce.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w server -- menu-job`
Expected: FAIL.

- [ ] **Step 3: Implement `server/src/menu/job.ts`**

```ts
import { catchUpTarget, isJobOverdue, isNextWeekDue, nextWeekStart } from '@app/domain/planner';
import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import { logEvent } from '../log.ts';
import { errorCode, generateWeek } from './generation.ts';
import { localIn } from './time.ts';

interface OpenJob {
	familyId: string;
	targetWeek: string;
	timeZone: string;
}

/** The hourly job (spec section 4.2): dispatch new targets, then every open job, one at a time. */
export async function runWeeklyJobOn(sql: postgres.Sql, now: Date): Promise<{ generated: number; failed: number; abandoned: number }> {
	const job = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);

	// 1. New targets: families past their Wednesday 20:00 without next week.
	await job(async (tx) => {
		const families = await tx<{ id: string; timeZone: string }[]>`select id, time_zone as "timeZone" from app.families`;
		for (const family of families) {
			const local = localIn(family.id, family.timeZone, now);
			if (!isNextWeekDue(local)) continue;
			const weekStart = nextWeekStart(local);
			const [week] = await tx`select 1 from app.weeks where family_id = ${family.id} and starts_on = ${weekStart}`;
			if (!week) await tx`insert into app.weekly_jobs (family_id, target_week) values (${family.id}, ${weekStart}) on conflict do nothing`;
		}
	});

	// 2. Open jobs, whatever their week.
	const open = await job((tx) => tx<OpenJob[]>`
		select j.family_id as "familyId", j.target_week::text as "targetWeek", f.time_zone as "timeZone"
		from app.weekly_jobs j join app.families f on f.id = j.family_id
		where j.status in ('pending', 'failed') order by j.target_week, j.family_id`);

	// 3. One job at a time, each in its own transactions.
	const result = { generated: 0, failed: 0, abandoned: 0 };
	for (const { familyId, targetWeek, timeZone } of open) {
		const local = localIn(familyId, timeZone, now);
		const target = catchUpTarget(local, targetWeek);
		if (!target) {
			const [row] = await job((tx) => tx<{ attempts: number }[]>`
				update app.weekly_jobs set status = 'abandoned', updated_at = now()
				where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
			logEvent('weekly_job_abandoned', { familyId, weekStart: targetWeek, attempts: row?.attempts ?? null }, 'error');
			result.abandoned++;
			continue;
		}
		try {
			await job(async (tx) => {
				if (await generateWeek(tx, familyId, target)) result.generated++;
				await tx`update app.weekly_jobs set status = 'done', attempts = attempts + 1, error = null, updated_at = now()
					where family_id = ${familyId} and target_week = ${targetWeek}`;
			});
		} catch (error) {
			result.failed++;
			const code = errorCode(error).slice(0, 500);
			const [row] = await job((tx) => tx<{ attempts: number }[]>`
				update app.weekly_jobs set status = 'failed', attempts = attempts + 1, error = ${code}, updated_at = now()
				where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
			const attempts = row?.attempts ?? null;
			logEvent('weekly_job_failed', { familyId, weekStart: targetWeek, attempts, code });
			if (isJobOverdue(local, targetWeek)) logEvent('weekly_job_overdue', { familyId, weekStart: targetWeek, attempts });
		}
	}
	return result;
}

export async function runWeeklyJob(connectionString: string, now: Date) {
	const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await runWeeklyJobOn(sql, now);
	} finally {
		await sql.end().catch(() => {});
	}
}
```

Il codice dell'errore simulato con `new Error('planner failure')` è `Error`: il nome della classe, mai il messaggio. Il test lo verifica.

In `server/src/index.ts`:

```ts
import { runWeeklyJob } from './menu/job.ts';
…
export default {
	fetch: (request, env) => app.fetch(request, env),
	scheduled: async (controller, env) => {
		await runWeeklyJob(env.HYPERDRIVE.connectionString, new Date(controller.scheduledTime));
	},
} satisfies ExportedHandler<Env>;
```

In `server/wrangler.jsonc`, dopo `"observability"`:

```jsonc
	// Hourly weekly job (spec section 4): next week for families past Wednesday 20:00, retries of open jobs.
	"triggers": { "crons": ["0 * * * *"] },
```

In `server/README.md`, sezione di sviluppo locale: `npx wrangler dev --test-scheduled` e `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck -w server && npx -w server wrangler deploy --dry-run --outdir /private/tmp/claude-501/-Users-fedfol-Projects-meal-planner-2--worktrees-menu/wrangler-dry`
Expected: PASS, e il dry run riporta il cron fra i trigger senza pubblicare.

- [ ] **Step 5: Commit**

```bash
git add server/src/menu/job.ts server/src/index.ts server/wrangler.jsonc server/README.md server/test/menu-job.test.ts
git commit -m "Menu: job orario con Cron Trigger, ritentativi fino alla fine della settimana e job abbandonati"
```

---

### Task 11: Vista della settimana (`menu.getWeek`)

**Cancello:** cancello unico delle viste (sezione «Cancelli»): PR delle viste di W6 unita, con `ratings.set`, `RecipeCard`, `IngredientList` e tipi web della ricetta adeguati. Interfaccia **definitiva**: spec di W6, sezione 1 «Interfaccia per W1» (commit `f5b1dd2`), registrata nel piano generale. Il codice qui sotto usa quelle firme esatte: `RecipeRef { recipeId, version: number | null, servings }`, `recipeViewKey(ref)` (`${recipeId}@${version ?? 'now'}@${servings}`), `Viewer { familyId, userId, locale }`, `recipeViews(tx, viewer, refs)` con `RecipeView { summary, status, version, baseServings, ingredients, rating }`. Si usa `recipeViews` (una chiamata per settimana) perché dà già `status` e `rating: null` per le mai pubblicate; l'alternativa equivalente di W6 è `recipeSummaries(tx, refs, locale)` + `ingredientLines(tx, refs, { familyId, locale })` + `ratingSummaries(tx, familyId, userId, recipeIds)`, con lo stesso `recipeViewKey` (e chiave `recipeId` per i voti). Se su `main` qualcosa differisce, `STATO: DOMANDA`: l'interfaccia cambia solo tramite il coordinatore.

**Files:**
- Create: `server/src/menu/week-view.ts`
- Modify: `server/src/menu/router.ts` (gestore reale di `getWeek`)
- Test: `server/test/menu-week.test.ts`

**Interfaces:**
- Consumes: `mealRecipeVersions` (Task 1); `RecipeRef`, `recipeViewKey`, `Viewer`, `recipeViews`, `RecipeView` da `server/src/recipes/views.ts` (W6, firme definitive).
- Produces: `weekViewOf(context: OperationContext, familyId: string, weekStartsOn: string): Promise<WeekView>`, che lancia `appError('not_found')` se la settimana manca.

- [ ] **Step 1: Write the failing tests** `server/test/menu-week.test.ts`

Fixture: settimana passata del 12 gennaio 2026 per una famiglia del lettore, con questi slot:
- lunedì cena: ricetta «Zuppa», v1 pubblicata il 10 gennaio e v2 il 20 gennaio;
- martedì pranzo: una bozza «Bozza»;
- mercoledì pranzo: libero, «Pizza»;
- mercoledì cena: vuoto;
- giovedì pranzo: cambiato (`updatedBy`) da un membro poi uscito dalla famiglia;
- venerdì pranzo: cambiato dal lettore.

- sabato pranzo: ricetta «Zuppa» con 4 porzioni; sabato cena: la stessa ricetta con 2 porzioni;
- domenica pranzo: ricetta «Zuppa» con 0 porzioni.

Settimana futura del 5 gennaio 2099 con la stessa ricetta il lunedì a pranzo.

```ts
	it('composes seven days with recipe, free and empty meals, R1 versions and the last change', async () => {
		const week = await read('getWeek', { familyId, weekStartsOn: '2026-01-12' });
		const meals = week.data.days.flatMap((d: any) => d.meals);
		const on = (date: string, mealType = 'lunch') => meals.find((m: any) => m.date === date && m.mealType === mealType);
		expect(week.data.days).toHaveLength(7);
		expect(on('2026-01-12', 'dinner').recipe.name).toBe('Zuppa'); // v1, not "Zuppa v2"
		expect(on('2026-01-12', 'dinner')).toMatchObject({ kind: 'recipe', canOpenRecipe: true, rating: { familyCount: 0, myStars: null } });
		expect(on('2026-01-12', 'dinner').ingredients).toHaveLength(1);
		expect(on('2026-01-13')).toMatchObject({ kind: 'recipe', ingredients: null, rating: null, canOpenRecipe: false, recipe: { name: 'Bozza' } });
		expect(on('2026-01-14')).toMatchObject({ kind: 'free', freeText: 'Pizza', recipe: null });
		expect(on('2026-01-14', 'dinner')).toMatchObject({ kind: 'empty', recipe: null, ingredients: null });
		expect(on('2026-01-15').lastChange).toEqual({ userName: null, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) });
		expect(on('2026-01-16').lastChange.userName).toMatch(/^Test /);
		expect(on('2026-01-12', 'dinner').lastChange).toBeNull();
	});

	it('builds one RecipeRef per meal with its servings: different servings, different lines; zero servings at the reference servings', async () => {
		const week = await read('getWeek', { familyId, weekStartsOn: '2026-01-12' });
		const meals = week.data.days.flatMap((d: any) => d.meals);
		const on = (date: string, mealType: string) => meals.find((m: any) => m.date === date && m.mealType === mealType);
		// The fixture document has baseServings 2 and 100 g per line.
		expect(on('2026-01-17', 'lunch').ingredients[0].amount).toBe('200 g');
		expect(on('2026-01-17', 'dinner').ingredients[0].amount).toBe('100 g');
		expect(on('2026-01-18', 'lunch')).toMatchObject({ servings: 0, ingredients: [{ amount: '100 g' }] });
	});

	it("shows the current version for future meals, in the reader's language", async () => {
		const week = await readAs(englishReader, 'getWeek', { familyId, weekStartsOn: '2099-01-05' });
		expect(week.data.days[0].meals[0].recipe.name).toBe('Zuppa (en)');
	});

	it('answers not_found for a missing week and forbidden for another family', async () => {
		expect((await errorOf(read('getWeek', { familyId, weekStartsOn: '2030-01-07' }))).code).toBe('not_found');
		expect((await errorOf(read('getWeek', { familyId: otherFamily, weekStartsOn: '2026-01-12' }))).code).toBe('forbidden');
	});
```

Gli importi esatti («200 g») seguono la presentazione delle quantità di W4 usata dalle viste di W6: se il formato reale differisce (spazio, separatore), si adegua l'atteso, non il comportamento. `englishReader` è un secondo utente creato con `db.createUser({ locale: 'en-GB' })` e aggiunto alla stessa famiglia (`db.addMember`); `readAs` è `read` con il suo token. Il nome inglese resta `Zuppa (en)` perché la fixture cambia solo quello italiano. Il membro uscito si ottiene con `delete from app.family_members` da `db.admin`. `read` è come nel Task 9, con un `now` fisso al 10 ottobre 2026: la generazione pigra crea solo la settimana corrente, che il test ignora.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-week`
Expected: FAIL (`not_found` per ogni settimana).

- [ ] **Step 3: Implement `server/src/menu/week-view.ts`**

```ts
import type { MealView, WeekView } from '@app/contract';
import { addDays } from '@app/domain/planner';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import { recipeViewKey, recipeViews, type RecipeRef } from '../recipes/views.ts';
import { mealRecipeVersions } from './versions.ts';

interface SlotRow {
	id: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	/** Family local time, YYYY-MM-DDTHH:mm; null when the app wrote the slot. */
	changedAt: string | null;
	/** null when the author is not (or no longer) a member. */
	authorName: string | null;
}

export async function weekViewOf(context: OperationContext, familyId: string, weekStartsOn: string): Promise<WeekView> {
	const { tx } = context;
	const [week] = await tx<{ id: string }[]>`select id from app.weeks where family_id = ${familyId} and starts_on = ${weekStartsOn}`;
	if (!week) throw appError('not_found');
	const slots = await tx<SlotRow[]>`
		select s.id, s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId", s.free_text as "freeText",
			s.servings, s.note,
			case when s.updated_by is not null then to_char(s.updated_at at time zone f.time_zone, 'YYYY-MM-DD"T"HH24:MI') end as "changedAt",
			case when m.user_id is not null then p.display_name end as "authorName"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		left join app.family_members m on m.family_id = w.family_id and m.user_id = s.updated_by
		left join app.profiles p on p.user_id = s.updated_by
		where s.week_id = ${week.id}
		order by s.date, s.meal_type desc`;
	const versions = new Map((await mealRecipeVersions(tx, familyId, week.id)).map((v) => [v.slotId, v]));
	const refs = new Map<string, RecipeRef>();
	for (const slot of slots) {
		const v = versions.get(slot.id);
		if (v) refs.set(slot.id, { recipeId: v.recipeId, version: v.version, servings: slot.servings });
	}
	const views = await recipeViews(tx, { familyId, userId: context.userId, locale: context.locale }, [...refs.values()]);

	const meals: MealView[] = slots.map((slot) => {
		const ref = refs.get(slot.id);
		const view = ref ? views.get(recipeViewKey(ref)) : undefined;
		return {
			slotId: slot.id,
			date: slot.date,
			mealType: slot.mealType,
			kind: slot.recipeId ? 'recipe' : slot.freeText !== null ? 'free' : 'empty',
			recipe: view?.summary ?? null,
			freeText: slot.freeText,
			servings: slot.servings,
			ingredients: view?.ingredients ?? null,
			note: slot.note,
			rating: view?.rating ?? null,
			canOpenRecipe: view !== undefined && view.status !== 'draft',
			lastChange: slot.changedAt ? { userName: slot.authorName, at: slot.changedAt } : null,
		};
	});
	return {
		startsOn: weekStartsOn,
		days: Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekStartsOn, i);
			return { date, meals: meals.filter((m) => m.date === date) };
		}),
	};
}
```

Un `RecipeRef` per pasto: due pasti con la stessa ricetta e versione ma porzioni diverse hanno chiavi diverse, due con le stesse porzioni condividono la vista (W6 deduplica). `version` viene da `mealRecipeVersions` così com'è (numero, `null` solo per una ricetta mai pubblicata): il Menu non passa mai `null` per una ricetta pubblicata, così un pasto passato resta sulla sua versione storica. Una ricetta che l'RLS nasconde manca dalla mappa di W6, e allora il pasto ha `recipe: null` con `kind: 'recipe'`. Succede solo con una bozza non citata dalla famiglia, cioè mai per uno slot della famiglia stessa. In `router.ts`: `getWeek: os.menu.getWeek.handler(async ({ context, input }) => fresh(context, await weekViewOf(context, input.familyId, input.weekStartsOn)))`.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck`
Expected: PASS, compreso il caso `not_found` di `menu-mcp.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add server/src/menu server/test/menu-week.test.ts
git commit -m "Menu: vista della settimana con le versioni dei pasti e le viste delle ricette di W6"
```

---

### Task 12: Menu dell'app web sui dati veri

**Cancello:** cancello unico delle viste (PR delle viste di W6 unita, con `ratings.set`, `RecipeCard`, `IngredientList` con la preparazione e tipi web della ricetta adeguati da W6) più la seconda PR di W5 (client oRPC reale), su `main`. Prima di scrivere codice, leggere su `main` `web/src/api/`, `web/src/routes/MenuPage.tsx`, `web/src/api/queries.ts` e i test esistenti del Menu, e adeguare i percorsi qui sotto a quelli reali.

**Files:**
- Modify: `web/src/api/types.ts` (solo le voci del menu: tipi da `@app/contract`)
- Modify: `web/src/api/queries.ts` (solo il menu: `today` nell'input e nella chiave di `getOpening`)
- Modify: `web/src/api/fake/fakeApi.ts` (forma del contratto per il menu, `today` accettato)
- Modify: `web/src/routes/MenuPage.tsx` (calcolo di `today` con il fuso della famiglia)
- Test: test del Menu di W5 (`web/src/routes/MenuPage.test.tsx` o il nome reale)

**Interfaces:**
- Consumes: `contract.menu` (Task 6); il calcolo della data locale già usato da W5 per i pasti passati (`web/src/lib/calendar.ts`), oppure `localDateTime` di `@app/domain/planner` se il web dichiara già il workspace `@app/domain`.
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Write the failing tests**

```tsx
it('asks the opening for the family local date', async () => {
	const api = fakeApiSpy(); // spy on menu.getOpening
	vi.setSystemTime(new Date('2026-10-13T22:30:00Z')); // 00:30 on the 14th in Rome
	renderMenu({ api, family: { timeZone: 'Europe/Rome' } });
	await screen.findByRole('heading', { name: /ottobre/i });
	expect(api.menu.getOpening).toHaveBeenCalledWith(expect.objectContaining({ today: '2026-10-14' }));
});

it.each([['it-IT', 'Nessuna ricetta adatta'], ['en-GB', 'No suitable recipe']])('shows a week of empty slots (%s)', async (locale, text) => {
	const api = fakeApiWith({ opening: { kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' }, week: weekOfEmptySlots('2026-10-12') });
	renderMenu({ api, locale });
	expect(await screen.findAllByText(text)).not.toHaveLength(0);
	expect(screen.queryByText(/Ancora nessun menu|No menu yet/)).toBeNull();
});

it('applies a rating from the Menu only after the server confirms it', async () => {
	const { api, resolveRating } = fakeApiWithPendingRating();
	renderMenu({ api });
	await userEvent.click(await screen.findByRole('button', { name: /voto/i })); // opens the rating under the footer
	await userEvent.click(screen.getByRole('radio', { name: /4/ }));
	expect(screen.getByText(/Invio del voto/)).toBeInTheDocument(); // sending state, stars not editable
	expect(screen.queryByText(/4,0 · 1 voto/)).toBeNull();
	resolveRating({ familyAverage: 4, familyCount: 1, myStars: 4 });
	expect(await screen.findByText(/4,0 · 1 voto/)).toBeInTheDocument();
});
```

Gli helper `fakeApiSpy`, `fakeApiWith`, `fakeApiWithPendingRating`, `weekOfEmptySlots` e `renderMenu` si scrivono sopra gli helper di test esistenti di W5, nello stesso stile. Testi esatti, ruoli ed etichette (titolo «Nessuna ricetta adatta» e la sua traduzione, nome accessibile del voto, formato della media) si prendono dai dizionari `menu` e `recipes` e dai componenti su `main`. I valori qui sopra sono quelli delle spec di W5 e W6.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w web -- MenuPage`
Expected: FAIL (`today` assente; gli altri due falliscono se il client finto o la resa non sono allineati, altrimenti passano già e fanno da regressione).

- [ ] **Step 3: Implement**

- In `MenuPage` (o nel hook dell'apertura): `const today = familyToday(family.timeZone)`, con la funzione locale di W5 o `localDateTime(new Date(), timeZone).date`.
- `queries.ts`: la query dell'apertura mette `today` nella chiave (`['menu', 'getOpening', { familyId, today, locale }]`) e nell'input.
- Tipi del menu dal contratto. Il riepilogo della ricetta di W6 non ha `photo` e ha campi nullabili: se `RecipeCard` li usa, vale l'adeguamento dei tipi web fatto da W6. Il client finto si allinea al contratto (`today` facoltativo, usa la data ricevuta).
- Il voto passa dalla mutazione esistente di W5/W6 (`ratings.set`), senza modifiche nel Menu oltre ai tipi.

- [ ] **Step 4: Run web tests, typecheck and build; check visually**

Run: `npm test -w web && npm run typecheck && npm run build -w web`
Expected: PASS.

Prova visiva con la skill agent-browser, con server in locale (`wrangler dev` con lo stack Supabase locale, `server/README.md`) e un utente di prova, in italiano e in inglese:
1. famiglia senza settimane → il Menu apre su oggi con i pasti generati;
2. famiglia con tutte le ricette escluse → schede «Nessuna ricetta adatta»;
3. calendario con i giorni con menu attivi;
4. pasto libero e ingredienti dal footer;
5. voto con la risposta del server;
6. screenshot nella cartella scratchpad della sessione.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "Web: Menu sulle letture vere con la data locale della famiglia"
```

---

### Task 13: Verifica finale e PR

- [ ] **Step 1: Verifica completa** (skill `superpowers:verification-before-completion`)

Run: `npm run typecheck && npm test && npm run build -w web && supabase test db && npm run planner-report && git diff --stat progetto/reports/`
Expected: tutto PASS; report del pianificatore invariato nelle settimane.

- [ ] **Step 2: Rilettura della spec**

Scorrere le sezioni 1-9 della spec e, per ognuna, indicare il commit che la realizza. Ogni differenza nata in implementazione (firme reali di W2, W3, W6) va corretta nella spec con un commit «Spec del menu: allineamento all'implementazione».

- [ ] **Step 3: Push e PR** (protocollo, fase 6)

```bash
git push -u origin traguardo/menu
gh pr create --base main --title "Menu, pianificatore, job del mercoledì e generazione pigra (W1, ondata 2)" --body-file <scratchpad>/pr-body.md
```

Corpo della PR in italiano:
- cosa fa;
- come è stato verificato: comandi, risultati e prova visiva;
- sezioni della specifica realizzate: parte 1 «Quando apri l'app», «Una settimana tipo» e «Come sceglie i piatti»; sezioni 3, 4, 5 (in lettura), 12 e 13;
- la migrazione `abandoned`;
- i cancelli rimasti aperti, se ce ne sono;
- le decisioni da riportare.

Il corpo finisce con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Poi scrivere `STATO: PR_APERTA <url>` e fermarsi.
