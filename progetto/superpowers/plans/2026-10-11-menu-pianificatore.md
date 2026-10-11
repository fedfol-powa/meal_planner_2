# Menu, pianificatore, job del mercoledì e generazione pigra: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** il Menu dell'app legge dal database settimane generate dal pianificatore, dal job orario del mercoledì o alla prima lettura, con la versione della ricetta giusta per ogni pasto (R1).

**Architecture:** il pianificatore puro di `domain/src/planner/` riceve due piccole aggiunte (primo pasto da pianificare, calendario nel fuso della famiglia). Il server, in `server/src/menu/`, carica l'ingresso dal database, scrive la settimana in modo idempotente e la espone con tre letture versionate del contratto (`contract/src/menu/`). La generazione parte da un Cron Trigger di Cloudflare (ruolo `app_job`) oppure da un hook `prepare` del percorso della richiesta (ruolo dell'utente), eseguito prima del calcolo della versione.

**Tech Stack:** TypeScript, oRPC 1.15, zod 4, Postgres.js, Cloudflare Workers (Cron Trigger), Vitest, Postgres locale di Supabase, React (base di W5).

**Spec:** `progetto/superpowers/specs/2026-10-11-menu-pianificatore.md`

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e messaggi di commit in italiano, come nella storia del repository.
- Nessuna libreria nuova (spec, sezione 10). `domain/` resta TypeScript puro: solo ECMAScript, `Intl` compreso, nessuna API di Node o Workers.
- Nessuna migrazione prevista (spec, sezione 9). Se ne serve una: nuova, con timestamp, con test pgTAP, segnalata al coordinatore.
- File condivisi (`contract/src/contract.ts`, `server/src/router.ts`, `server/src/index.ts`, `server/src/pipeline.ts`, `server/wrangler.jsonc`, dizionari e rotte web) solo con modifiche minime per registrare l'area.
- Le letture del menu: `mcp: { readOnly: true }`, `offline: false`, `role: 'familyMember'`, `reads: ['family', 'catalogue']`, `versionedInput` e `versionedOutput`.
- La generazione pigra gira nel ruolo `authenticated` con le policy esistenti di W2; il job nel ruolo `app_job`. Nessuna grant o policy nuova.
- Log: righe JSON con campi scelti (`event`, `familyId`, `weekStart`, `attempts`, `code`), mai messaggi d'errore, dati o segreti.
- Testi per l'utente localizzabili in `it-IT` e `en-GB` (dizionari di W5).
- Documentazione di librerie e servizi con Context7.
- Nessun aggiornamento ottimistico nel web (interfacce decise).

## Review Focus

1. **Fuso e ora legale:** una famiglia in `Europe/London` o `America/New_York` ottiene la settimana successiva solo dopo mercoledì alle 20:00 della sua ora locale, anche la settimana di un cambio d'ora. Test in Task 2 (`generationTargets` nei tre fusi) e Task 8 (job con due famiglie in fusi diversi).
2. **Due aperture simultanee dopo mercoledì sera:** due membri aprono l'app insieme e deve nascere una sola settimana, senza errori per nessuno dei due. Test in Task 6 (`generateWeek` concorrente).
3. **Client con la versione in cache dopo mercoledì sera:** la prima lettura deve restituire la settimana nuova, non «invariato». Test in Task 7 (`getOpening` con `knownVersion` vecchia).
4. **Domenica tardi:** domenica alle 23:30 la settimana corrente non ha pasti aperti e non deve nascere una settimana vuota. Test in Task 2 (`generationTargets`, domenica 23:30).
5. **Generazione che fallisce (impostazioni illeggibili, bug):** il Menu deve comunque aprirsi sulle settimane esistenti. Test in Task 7 (savepoint e lettura riuscita).

---

## Dipendenze da altri worker (cancelli)

| Task | Serve | Da | Se non è su `main` |
|---|---|---|---|
| 6 | `toPlannerRecipe`, `RecipeDocument` (`@app/domain/recipe`) | W3 | `STATO: DOMANDA` |
| 6 | `resolveFamilySettings` (`@app/domain/family`) | W2 profilo | `STATO: DOMANDA` |
| 9 | `ingredientLinesView`, `ratingSummaries`, `recipeSummaryViews`, schemi `contract/src/recipes/views.ts` | W6 | scrivo il modulo con le firme della spec, sezione 6, e lo segnalo al coordinatore |
| 10 | client oRPC reale nel web | W5 (seconda PR) | `STATO: DOMANDA` |

I task 1-5 e 8 non dipendono da nessuno. All'inizio di ogni task con un cancello:
`git fetch origin && git rebase origin/main`, poi si verificano nomi ed export reali.
Se differiscono dalle firme qui sotto, si adatta il codice del task al nome reale senza
cambiarne il comportamento.

## File

| File | Responsabilità |
|---|---|
| `domain/src/planner/types.ts` | `PlannerSlotRef`, `PlannerInput.from` |
| `domain/src/planner/generate.ts`, `constraints.ts` | slot pianificati dopo `from` (helper `isPlannedSlot`) |
| `domain/src/planner/local-time.ts` (+ test) | data e ora locali, primo pasto aperto, bersagli della generazione, scadenze del job |
| `server/src/pipeline.ts` (+ `test/pipeline.test.ts`, `test/support/test-contract.ts`) | hook `prepare` per operazione |
| `contract/src/menu/views.ts`, `contract/src/menu/operations.ts` | schemi delle viste e operazioni del menu |
| `contract/src/contract.ts` | registrazione dell'area `menu` (Task 7) |
| `server/src/menu/versions.ts` (+ test) | `mealRecipeVersions` (R1), usata anche da W4 |
| `server/src/menu/generation.ts` (+ test) | `loadPlannerInput`, `generateWeek`, `ensureWeeks` |
| `server/src/menu/time.ts` | ora locale della famiglia con ripiego su `Europe/Rome` e log |
| `server/src/menu/job.ts` (+ test) | `runWeeklyJob` |
| `server/src/menu/week-view.ts` | composizione di `WeekView` |
| `server/src/menu/router.ts` | gestori di `getOpening`, `getWeek`, `getDates` e mappa `prepare` |
| `server/src/router.ts`, `server/src/index.ts`, `server/wrangler.jsonc` | registrazione, handler `scheduled`, cron |
| `server/src/log.ts` | `logEvent(event, fields)` |
| `server/test/support/menu.ts` | dati di prova: ricette pubblicate con documento, settimane, slot |
| `web/src/...` (struttura di W5) | `Api.menu` dal contratto, `today` in `getOpening` |

---

### Task 1: Primo pasto da pianificare nel dominio

**Files:**
- Modify: `domain/src/planner/types.ts`
- Modify: `domain/src/planner/constraints.ts`
- Modify: `domain/src/planner/generate.ts:10-22`
- Test: `domain/src/planner/generate.test.ts`, `domain/src/planner/constraints.test.ts`

**Interfaces:**
- Produces: `interface PlannerSlotRef { date: IsoDate; mealType: MealType }`; `PlannerInput.from?: PlannerSlotRef`; `isPlannedSlot(input: PlannerInput, date: IsoDate, mealType: MealType): boolean` (esportata da `constraints.ts`).

- [ ] **Step 1: Write the failing tests** (in fondo a `generate.test.ts`, dentro `describe('generateWeek')`)

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

Conteggio atteso: con `familySettings()` dal mercoledì cena restano mercoledì cena, giovedì e venerdì (2+2), sabato (pranzo e cena libera), domenica (pizza e cena) = 1 + 4 + 2 + 2 = 9.

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

In `constraints.ts` (import di `mealIndex` da `./calendar.ts`):

```ts
/** A meal of the week gets a slot: planned in the diners matrix and not before `input.from`. */
export function isPlannedSlot(input: PlannerInput, date: IsoDate, mealType: MealType): boolean {
	if (slotSettingOf(input.settings, date, mealType).servings === 0) return false;
	return !input.from || mealIndex(date, mealType) >= mealIndex(input.from.date, input.from.mealType);
}
```

In `hardViolations` sostituire `if (setting.servings === 0) continue;` con `if (!isPlannedSlot(input, date, mealType)) continue;`.

In `generate.ts`, `plannedSlots`:

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

Run: `npm test -w domain && npm run typecheck -w domain && npm run planner-report && git diff --stat progetto/reports/`
Expected: tutti PASS; `planner-report.md` senza differenze nelle settimane (cambiano al più le righe delle misure di tempo, che variano a ogni esecuzione; se cambia altro, il comportamento è cambiato: correggere).

- [ ] **Step 5: Commit**

```bash
git checkout progetto/reports/planner-report.md   # solo se differisce nelle sole misure di tempo
git add domain/src/planner
git commit -m "Pianificatore: primo pasto da pianificare per generare una settimana a metà"
```

---

### Task 2: Calendario nel fuso della famiglia

**Files:**
- Create: `domain/src/planner/local-time.ts`
- Modify: `domain/src/planner/index.ts` (una riga di export)
- Test: `domain/src/planner/local-time.test.ts`

**Interfaces:**
- Consumes: `addDays`, `weekdayOf` da `calendar.ts`; `PlannerSlotRef` (Task 1).
- Produces:
  - `interface LocalDateTime { date: IsoDate; time: string }`, con `time` nel formato `HH:mm`;
  - `localDateTime(instant: Date, timeZone: string): LocalDateTime` (lancia `RangeError` se il fuso non è valido);
  - `MEAL_PASSES_AT: Record<MealType, string>`, con `{ lunch: '15:30', dinner: '23:00' }`;
  - `isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean`;
  - `firstOpenMeal(now: LocalDateTime): PlannerSlotRef`;
  - `mondayOf(date: IsoDate): IsoDate`;
  - `interface GenerationTarget { weekStart: IsoDate; from?: PlannerSlotRef }`;
  - `generationTargets(now: LocalDateTime, existingWeekStarts: readonly IsoDate[]): GenerationTarget[]`;
  - `nextWeekStart(now: LocalDateTime): IsoDate`;
  - `isNextWeekDue(now: LocalDateTime): boolean`;
  - `isNextWeekOverdue(now: LocalDateTime): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { firstOpenMeal, generationTargets, isMealPast, isNextWeekDue, isNextWeekOverdue, localDateTime, mondayOf, nextWeekStart } from './local-time.ts';

const at = (date: string, time: string) => ({ date, time });

describe('localDateTime', () => {
	it('reads date and time in the family time zone', () => {
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/Rome')).toEqual(at('2026-10-14', '20:00'));
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/London')).toEqual(at('2026-10-14', '19:00'));
		expect(localDateTime(new Date('2026-10-15T01:30:00Z'), 'America/New_York')).toEqual(at('2026-10-14', '21:30'));
	});
	it('follows daylight saving changes', () => {
		// Europe/Rome leaves summer time on 25 October 2026 at 03:00 local.
		expect(localDateTime(new Date('2026-10-24T22:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-25', '00:30'));
		expect(localDateTime(new Date('2026-10-25T23:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-26', '00:30'));
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
		expect(firstOpenMeal(at('2026-10-14', '23:00'))).toEqual({ date: '2026-10-15', mealType: 'lunch' });
	});
	it('finds the Monday of a date', () => {
		expect(mondayOf('2026-10-12')).toBe('2026-10-12');
		expect(mondayOf('2026-10-18')).toBe('2026-10-12');
		expect(nextWeekStart(at('2026-10-18', '12:00'))).toBe('2026-10-19');
	});
	it('makes next week due from Wednesday 20:00 and overdue from Thursday 08:00', () => {
		expect(isNextWeekDue(at('2026-10-14', '19:59'))).toBe(false);
		expect(isNextWeekDue(at('2026-10-14', '20:00'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-18', '23:59'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-12', '08:00'))).toBe(false);
		expect(isNextWeekOverdue(at('2026-10-15', '07:59'))).toBe(false);
		expect(isNextWeekOverdue(at('2026-10-15', '08:00'))).toBe(true);
	});
});

describe('generationTargets', () => {
	it('generates the rest of the current week for a family without weeks', () => {
		expect(generationTargets(at('2026-10-13', '16:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-13', mealType: 'dinner' } },
		]);
	});
	it('adds next week after Wednesday 20:00', () => {
		expect(generationTargets(at('2026-10-14', '20:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-15', mealType: 'lunch' } },
			{ weekStart: '2026-10-19' },
		]);
		expect(generationTargets(at('2026-10-14', '19:59'), ['2026-10-12'])).toEqual([]);
		expect(generationTargets(at('2026-10-14', '20:00'), ['2026-10-12'])).toEqual([{ weekStart: '2026-10-19' }]);
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

export function isNextWeekOverdue(now: LocalDateTime): boolean {
	return isAtOrAfter(now, addDays(mondayOf(now.date), 3), OVERDUE_TIME);
}

export interface GenerationTarget {
	weekStart: IsoDate;
	from?: PlannerSlotRef;
}

/**
 * The one generation rule (spec section 4): the current week from its first open meal if it
 * is missing, and next week whole if it is missing and Wednesday 20:00 has passed.
 */
export function generationTargets(now: LocalDateTime, existingWeekStarts: readonly IsoDate[]): GenerationTarget[] {
	const targets: GenerationTarget[] = [];
	const current = mondayOf(now.date);
	if (!existingWeekStarts.includes(current)) {
		const from = firstOpenMeal(now);
		if (from.date <= addDays(current, 6)) targets.push({ weekStart: current, from });
	}
	const next = nextWeekStart(now);
	if (isNextWeekDue(now) && !existingWeekStarts.includes(next)) targets.push({ weekStart: next });
	return targets;
}
```

In `index.ts` aggiungere `export * from './local-time.ts';`.

- [ ] **Step 4: Run tests**

Run: `npm test -w domain && npm run typecheck -w domain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add domain/src/planner
git commit -m "Pianificatore: ora locale della famiglia e bersagli della generazione"
```

---

### Task 3: Hook `prepare` nel percorso della richiesta

**Files:**
- Modify: `server/src/pipeline.ts` (firma di `createImplementer` e un blocco prima di `readVersion`)
- Modify: `server/test/support/test-contract.ts`
- Test: `server/test/pipeline.test.ts`

**Interfaces:**
- Produces: `type Prepare = (context: OperationContext, input: unknown) => Promise<void>`; `createImplementer(contract, options?: { prepare?: Record<string, Prepare> })`, con chiave uguale al percorso dell'operazione unito da punti (`'menu.getOpening'`). L'hook gira nella transazione dell'utente dopo sessione, `web_only` e ruolo, prima di `readVersion` e della risposta «invariato».

- [ ] **Step 1: Write the failing test**

In `test/support/test-contract.ts`: nuova operazione `preparedView` uguale a `familyView` (`reads: ['family', 'catalogue']`, rotta `/test/prepared-view`), e un'implementazione con hook:

```ts
export const preparedCalls: string[] = [];

const prepared = createImplementer(testContract, {
	prepare: {
		'test.preparedView': async (context, input) => {
			preparedCalls.push(context.userId);
			// A write inside the user's transaction, before the version is read.
			await context.tx`update app.families set data_version = data_version + 1 where id = ${(input as { familyId: string }).familyId}`;
		},
	},
});
```

Il ruolo `authenticated` non può aggiornare `data_version`. L'hook di prova scrive quindi una settimana della famiglia, che fa crescere il contatore tramite il trigger di W2. Il corpo dell'hook è questo, al posto dell'`update` qui sopra:

```ts
let testMondays = 0;
/** A different Monday at each call, far from the menu tests' weeks. */
const nextTestMonday = () => new Date(Date.UTC(2030, 0, 7 + 7 * testMondays++)).toISOString().slice(0, 10);

			await context.tx`insert into app.weeks (family_id, starts_on) values (${(input as { familyId: string }).familyId}, ${nextTestMonday()})`;
```

Il router di test usa `prepared.test.preparedView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView }))` per quella operazione e lo aggiunge a `testRouter.test`.

Nello stesso task si aggiunge a `RequestContext` il campo facoltativo `now?: () => Date` (ora corrente, sostituibile nei test; i task del menu lo leggono con `context.now?.() ?? new Date()`), e a `contextFor` in `test/support/context.ts` il parametro facoltativo `now`.

In `pipeline.test.ts`, nel `describe` con il database:

```ts
	it('runs prepare in the user transaction before the version, and not when the role check fails', async () => {
		const { userId: member, sessionId } = await db.createUser();
		const familyId = await db.createFamily([{ userId: member, role: 'member' }]);
		const token = await keys.sign({ sub: member, session_id: sessionId });
		const ctx = contextFor(keys, token, db.appServerUrl);
		const first = await call(testRouter.test.preparedView, { familyId }, { context: ctx, path: ['test', 'preparedView'] });
		// prepare wrote a week: a version taken before prepare would already be stale.
		const second = await call(testRouter.test.preparedView, { familyId, knownVersion: first.version }, { context: contextFor(keys, token, db.appServerUrl), path: ['test', 'preparedView'] });
		expect(second.unchanged).toBe(false);
		expect(preparedCalls.filter((id) => id === member)).toHaveLength(2);

		const { userId: stranger, sessionId: s2 } = await db.createUser();
		const strangerToken = await keys.sign({ sub: stranger, session_id: s2 });
		const error = await errorOf(call(testRouter.test.preparedView, { familyId }, { context: contextFor(keys, strangerToken, db.appServerUrl), path: ['test', 'preparedView'], interceptors: [mapErrors] }));
		expect(error.code).toBe('forbidden');
		expect(preparedCalls).not.toContain(stranger);
	});
```

Il secondo controllo prova che la versione restituita dopo `prepare` comprende la sua scrittura. Ogni chiamata scrive una settimana nuova, quindi la seconda chiamata non risulta mai invariata. Il primo valore di `version` deve essere letto dopo la scrittura: se `readVersion` girasse prima, la prima risposta porterebbe il contatore vecchio. Lo si verifica confrontando con il contatore letto dall'amministratore:

```ts
		const [{ v }] = await db.admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${familyId}`;
		expect(second.version).toContain(`f${familyId}:${v}`);
```

Prima di scrivere il test, controllare in `call` di `@orpc/server` che l'opzione `path` esista (`node_modules/@orpc/server/dist/index.d.mts`, `CallableOptions`). Se manca, il test passa dal `fetch` dell'app con `rpcClient` (`test/support/requests.ts`), come gli altri test RPC.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w server -- pipeline`
Expected: FAIL (`createImplementer` non accetta opzioni, `preparedCalls` vuoto).

- [ ] **Step 3: Implement in `pipeline.ts`**

```ts
/** Runs inside the user's transaction before the version is read (lazy work such as generation). */
export type Prepare = (context: OperationContext, input: unknown) => Promise<void>;

export interface ImplementerOptions {
	/** By operation path joined with dots, for example `menu.getOpening`. */
	prepare?: Record<string, Prepare>;
}

export function createImplementer<C extends AnyContractRouter>(contract: C, options: ImplementerOptions = {}) {
```

Nel middleware, ricevere `path` (`async ({ context, procedure, path, next }, input)`) e, subito dopo la costruzione di `operation` e prima di `if (meta.reads)`:

```ts
			await options.prepare?.[path.join('.')]?.(operation, input);
```

Aggiornare il commento di `createImplementer`: «… role, prepare, version …».

- [ ] **Step 4: Run the server tests**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS, compresi i test esistenti della piattaforma.

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline.ts server/test
git commit -m "Piattaforma: hook prepare per operazione prima del calcolo della versione"
```

---

### Task 4: Contratto del menu

**Files:**
- Create: `contract/src/menu/views.ts`
- Create: `contract/src/menu/operations.ts`
- Modify: `contract/src/index.ts` (export di `menuContract` e dei tipi delle viste)

L'area si registra in `contract/src/contract.ts` solo nel Task 7, insieme ai gestori: un'operazione del contratto senza gestore nel router non compila.
- Test: `contract/src/menu/operations.test.ts`

**Interfaces:**
- Consumes: gli schemi di W6 in `contract/src/recipes/views.ts`: `recipeSummaryView`, `ingredientLineView`, `ratingSummary`. Se W6 non li ha ancora uniti, si creano lì con la forma di `web/src/api/types.ts` di W5 (`RecipeSummary`, `IngredientLine`, `RatingSummary`) e i vocabolari del dominio, e si avvisa il coordinatore (cancello del Task 9).
- Produces:
  - `menuContract` con `getOpening`, `getWeek` e `getDates`;
  - gli schemi `isoDate`, `openingView`, `weekView`, `dayView` e `mealView`;
  - i tipi `OpeningView`, `WeekView` e `MealView`.

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
	it('accepts an empty week of seven days and rejects a non-Monday', () => {
		const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${12 + i}`, meals: [] }));
		expect(weekView.safeParse({ startsOn: '2026-10-12', days }).success).toBe(true);
		expect(menuContract.getWeek['~orpc'].inputSchema!['~standard'].validate({ familyId: crypto.randomUUID(), weekStartsOn: '2026-10-13' })).toMatchObject({ issues: expect.any(Array) });
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
import { ingredientLineView, ratingSummary, recipeSummaryView } from '../recipes/views.ts';

export const isoDate = z.iso.date();
/** Family local time, YYYY-MM-DDTHH:mm. */
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const monday = isoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, { message: 'not_monday' });

export const mealView = z.object({
	slotId: z.uuid(),
	date: isoDate,
	mealType: z.enum(['lunch', 'dinner']),
	kind: z.enum(['recipe', 'free', 'empty']),
	recipe: recipeSummaryView.nullable(),
	freeText: z.string().nullable(),
	servings: z.number().int().min(0),
	/** null when the meal's recipe was never published (R1): name and description only. */
	ingredients: z.array(ingredientLineView).nullable(),
	note: z.string().nullable(),
	rating: ratingSummary.nullable(),
	canOpenRecipe: z.boolean(),
	/** userName null: the author is no longer a member. */
	lastChange: z.object({ userName: z.string().nullable(), at: localDateTime }).nullable(),
});

export const dayView = z.object({ date: isoDate, meals: z.array(mealView) });
export const weekView = z.object({ startsOn: monday, days: z.array(dayView).length(7) });
export const openingView = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('no_weeks') }),
	z.object({ kind: z.literal('day'), date: isoDate, weekStartsOn: monday }),
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
import { versionedInput, versionedOutput } from '../versioned.ts';
import { isoDate, monday, openingView, weekView } from './views.ts';

const read = { mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] } as const;

export const menuContract = {
	getOpening: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/opening', summary: 'Day the menu opens on: today, else the next day with meals' })
		.input(versionedInput(z.object({ familyId: z.uuid(), today: isoDate.optional() })))
		.output(versionedOutput(openingView)),
	getWeek: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/weeks/{weekStartsOn}', summary: 'Meals of a week, ready to show' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(versionedInput(z.object({ familyId: z.uuid(), weekStartsOn: monday })))
		.output(versionedOutput(weekView)),
	getDates: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/dates/{month}', summary: 'Days with a menu in a month' })
		.input(versionedInput(z.object({ familyId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })))
		.output(versionedOutput(z.array(isoDate))),
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

### Task 5: Dati di prova del menu e `mealRecipeVersions` (R1)

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
  - `publishRecipe(over?: Partial<RecipeFixture>): Promise<string>`, che inserisce ricetta e versione 1;
  - `publishVersion(recipeId, publishedAt: string): Promise<number>`;
  - `draftRecipe(name: string): Promise<string>`;
  - `insertWeek(familyId, startsOn): Promise<string>`;
  - `insertSlot(weekId, slot: { date; mealType; recipeId?; freeText?; servings?; updatedBy? }): Promise<string>`;
  - `setTimeZone(familyId, timeZone)`.

- [ ] **Step 1: Write the fixtures**

`server/test/support/menu.ts`:

```ts
import type { TestDatabase } from './db.ts';

export interface RecipeFixture {
	name: string;
	mealType: 'lunch' | 'dinner' | 'both';
	proteinGroup: string;
	durationMinutes: number;
	publishedAt: string;
	ingredientIds: string[];
}

/** A complete RecipeDocument (W3, schemaVersion 1) with the planner attributes of the fixture. */
export function recipeDocument(f: RecipeFixture) {
	return {
		schemaVersion: 1,
		name: { 'it-IT': f.name, 'en-GB': `${f.name} (en)` },
		description: { 'it-IT': `Descrizione di ${f.name}`, 'en-GB': `Description of ${f.name}` },
		sourceType: 'home',
		sourceUrl: null,
		bookId: null,
		bookPages: null,
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
		async publishRecipe(over: Partial<RecipeFixture> = {}): Promise<string> {
			const f: RecipeFixture = {
				name: `Ricetta ${counter}`,
				mealType: 'both',
				proteinGroup: 'vegetarian',
				durationMinutes: 20,
				publishedAt: '2026-01-01T00:00:00Z',
				ingredientIds: over.ingredientIds ?? [await ingredient()],
				...over,
			};
			const doc = recipeDocument(f);
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.recipes (slug, status, version, name, description, source_type, duration_minutes, base_servings,
					protein_group, is_fresh_fish, carbohydrate_group, has_vegetables, category, meal_type, is_heavy)
				values (${slug('r')}, 'published', 1, ${admin.json(doc.name)}, ${admin.json(doc.description)}, 'home', ${f.durationMinutes}, 2,
					${f.proteinGroup}, false, 'none', true, 'other', ${f.mealType}, false)
				returning id`;
			await admin`insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
				values (${id}, 1, ${admin.json(doc)}, ${f.publishedAt}, 'import')`;
			return id;
		},
		/** A new version with a different Italian name, made current. */
		async publishVersion(recipeId: string, publishedAt: string): Promise<number> {
			const [{ version, content }] = await admin<{ version: number; content: any }[]>`
				select version + 1 as version, (select content from app.recipe_versions v where v.recipe_id = r.id and v.version = r.version) as content
				from app.recipes r where id = ${recipeId}`;
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
	};
}
```

Se un vincolo di W2 rifiuta una di queste righe (per esempio `is_localized_text` con stringhe vuote nelle bozze, oppure campi obbligatori di `ingredients`), si adegua la fixture al vincolo letto nella migrazione, senza toccare le migrazioni.

- [ ] **Step 2: Write the failing test** `server/test/menu-versions.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { mealRecipeVersions } from '../src/menu/versions.ts';
import postgres from 'postgres';
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
		const familyId = await db.createFamily([]);
		await fx.setTimeZone(familyId, 'Europe/Rome');
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

		const run = (weekId: string) => withDbOn(sql, { kind: 'job' }, (tx) => mealRecipeVersions(tx, familyId, weekId));
		expect(await run(old)).toEqual([{ slotId: before, recipeId: recipe, version: 1, isPast: true }]);
		expect(await run(past)).toEqual([
			{ slotId: atV1, recipeId: recipe, version: 1, isPast: true },
			{ slotId: draftSlot, recipeId: draft, version: null, isPast: true },
		]);
		expect(await run(future)).toEqual([{ slotId: coming, recipeId: recipe, version: 2, isPast: false }]);
		expect(await withDbOn(sql, { kind: 'job' }, (tx) => mealRecipeVersions(tx, crypto.randomUUID(), past))).toEqual([]);
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
 * Runs in the caller's role; also used by the shopping list (W4).
 */
export async function mealRecipeVersions(tx: Tx, familyId: string, weekId: string): Promise<MealRecipeVersion[]> {
	const rows = await tx<{ slotId: string; recipeId: string; version: number | null; isPast: boolean }[]>`
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
	return rows;
}
```

`order by s.meal_type desc` mette `lunch` prima di `dinner`. Se il ruolo dell'utente non vede la riga in `recipes` di una bozza non citata, la `join` la esclude. Una bozza citata da un pasto della famiglia invece è visibile, per la policy `recipes_read_cited_draft` di W2.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -w server -- menu-versions && npm run typecheck -w server`
Expected: PASS.

```bash
git add server/src/menu/versions.ts server/test/support/menu.ts server/test/menu-versions.test.ts
git commit -m "Menu: versione della ricetta per pasto (R1), riusabile dalla spesa"
```

---

### Task 6: Generazione di una settimana dal database

**Cancello:** `toPlannerRecipe` (W3) e `resolveFamilySettings` (W2 profilo) su `main`.

**Files:**
- Modify: `server/package.json` (dipendenza di workspace `"@app/domain": "*"`, poi `npm install`)
- Create: `server/src/menu/generation.ts`
- Create: `server/src/log.ts`
- Test: `server/test/menu-generation.test.ts`

**Interfaces:**
- Consumes:
  - `toPlannerRecipe(id: string, document: RecipeDocument, bookId: string | null): PlannerRecipe` da `@app/domain/recipe`;
  - `resolveFamilySettings(saved: unknown): PlannerSettings` da `@app/domain/family`;
  - `generateWeek as planWeek`, `PlannerInput`, `PlannerSlotRef`, `GenerationTarget` da `@app/domain/planner`.
- Produces:
  - `loadPlannerInput(tx: Tx, familyId: string, target: GenerationTarget): Promise<PlannerInput>`;
  - `generateWeek(tx: Tx, familyId: string, target: GenerationTarget): Promise<boolean>`;
  - `logEvent(event: string, fields: Record<string, string | number | null>): void`.

- [ ] **Step 1: Write the failing tests** `server/test/menu-generation.test.ts`

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { generateWeek, loadPlannerInput } from '../src/menu/generation.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { menuFixtures } from './support/menu.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';

describe.skipIf(!hasDatabase)('week generation', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let keys: TestKeys;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
		keys = await createTestKeys();
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

	it('loads the published catalogue with the current version and the history before the week', async () => {
		const fx = menuFixtures(db);
		const familyId = await db.createFamily([]);
		const archived = await fx.publishRecipe();
		await db.admin`update app.recipes set status = 'archived', archived_at = now() where id = ${archived}`;
		const draft = await fx.draftRecipe('Bozza');
		const week = await fx.insertWeek(familyId, '2026-10-05');
		const eaten = await fx.publishRecipe();
		await fx.insertSlot(week, { date: '2026-10-06', mealType: 'dinner', recipeId: eaten });
		const input = await asJob((tx) => loadPlannerInput(tx, familyId, { weekStart: '2026-10-12' }));
		const ids = input.recipes.map((r) => r.id);
		expect(ids).toContain(eaten);
		expect(ids).not.toContain(archived);
		expect(ids).not.toContain(draft);
		expect(input.history).toEqual([{ date: '2026-10-06', mealType: 'dinner', recipeId: eaten }]);
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

	it('generates in the member role for their own family only, with no new privileges', async () => {
		const { userId, sessionId } = await db.createUser();
		const familyId = await db.createFamily([{ userId, role: 'member' }]);
		const other = await db.createFamily([]);
		const claims = { sub: userId, session_id: sessionId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iss: keys.issuer } as any;
		expect(await withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, familyId, { weekStart: '2026-11-02' }))).toBe(true);
		await expect(withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, other, { weekStart: '2026-11-02' }))).rejects.toThrow();
		expect(await slotsOf(other, '2026-11-02')).toHaveLength(0);
	});
});
```

Il tipo esatto dei claim viene da `Claims` in `server/src/auth.ts`: si costruiscono come nei test della piattaforma (`server/test/db.test.ts`).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-generation`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implement**

`server/src/log.ts`:

```ts
/** One JSON line with chosen fields: never error messages, data or secrets. */
export function logEvent(event: string, fields: Record<string, string | number | null>): void {
	console.log(JSON.stringify({ event, ...fields }));
}
```

`server/src/menu/generation.ts`:

```ts
import { resolveFamilySettings } from '@app/domain/family';
import { generateWeek as planWeek, type GenerationTarget, type IngredientRestriction, type PastMeal, type PlannerInput } from '@app/domain/planner';
import { toPlannerRecipe, type RecipeDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';

/** Everything the planner reads, in the transaction's role (spec section 2). */
export async function loadPlannerInput(tx: Tx, familyId: string, target: GenerationTarget): Promise<PlannerInput> {
	const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId}`;
	if (!family) throw new Error('family not readable');
	const recipes = await tx<{ id: string; bookId: string | null; content: RecipeDocument }[]>`
		select r.id, r.book_id as "bookId", v.content
		from app.recipes r join app.recipe_versions v on v.recipe_id = r.id and v.version = r.version
		where r.status = 'published'`;
	const books = await tx<{ bookId: string }[]>`select book_id as "bookId" from app.family_books where family_id = ${familyId}`;
	const exclusions = await tx<{ recipeId: string }[]>`select recipe_id as "recipeId" from app.recipe_exclusions where family_id = ${familyId}`;
	const restrictions = await tx<IngredientRestriction[]>`
		select ingredient_id as "ingredientId", restriction, weekly_max as "weeklyMax" from app.family_ingredients where family_id = ${familyId}`;
	const familyScores = await tx<{ recipeId: string; average: string }[]>`
		select recipe_id as "recipeId", average::text from app.family_scores where family_id = ${familyId}`;
	const globalScores = await tx<{ recipeId: string; average: string }[]>`select recipe_id as "recipeId", average::text from app.global_scores`;
	const history = await tx<PastMeal[]>`
		select s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId"
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.recipe_id is not null and s.date < ${target.weekStart}
		order by s.date, s.meal_type desc`;
	const scores = (rows: { recipeId: string; average: string }[]) => Object.fromEntries(rows.map((r) => [r.recipeId, Number(r.average)]));
	return {
		familyId,
		weekStart: target.weekStart,
		settings: resolveFamilySettings(family.settings),
		recipes: recipes.map((r) => toPlannerRecipe(r.id, r.content, r.bookId)),
		ownedBookIds: books.map((b) => b.bookId),
		exclusions: exclusions.map((e) => e.recipeId),
		restrictions: [...restrictions],
		familyScores: scores(familyScores),
		globalScores: scores(globalScores),
		history: [...history],
		...(target.from ? { from: target.from } : {}),
	};
}

/** Creates the week if it does not exist yet (spec section 2); false when it already existed. */
export async function generateWeek(tx: Tx, familyId: string, target: GenerationTarget): Promise<boolean> {
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
```

La semantica della `insert` multipla con l'helper di Postgres.js (`tx(rows, ...columns)`) va verificata con Context7 (`/porsager/postgres`, «insert multiple rows helper»). `ownedBookIds`: il pianificatore scarta da solo le ricette di libri non posseduti (`isAvailable`).

- [ ] **Step 4: Run**

Run: `npm install && npm test -w server -- menu-generation && npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/package.json package-lock.json server/src/log.ts server/src/menu/generation.ts server/test/menu-generation.test.ts
git commit -m "Menu: generazione idempotente della settimana dal database"
```

---

### Task 7: Generazione pigra e letture del menu (apertura e giorni)

**Files:**
- Create: `server/src/menu/time.ts`
- Modify: `server/src/menu/generation.ts` (aggiunge `ensureWeeks`)
- Create: `server/src/menu/router.ts`
- Modify: `server/src/router.ts` (registrazione dell'area e della mappa `prepare`)
- Test: `server/test/menu-reads.test.ts`

**Interfaces:**
- Consumes: `generateWeek` (Task 6); `createImplementer(contract, { prepare })` (Task 3); `menuContract` (Task 4); `localDateTime`, `generationTargets`, `mondayOf` (Task 2); `logEvent` (Task 6).
- Produces:
  - `familyNow(tx: Tx, familyId: string, now: Date): Promise<{ timeZone: string; local: LocalDateTime }>`;
  - `ensureWeeks(tx: Tx, familyId: string, now: Date): Promise<void>`;
  - `menuPrepare: Record<string, Prepare>`;
  - i gestori `getOpening` e `getDates` (`getWeek` nel Task 9).

L'ora corrente arriva da `context.now?.()` (campo aggiunto nel Task 3), altrimenti da `new Date()`.

In questo task si registra anche l'area: `menu: menuContract` in `contract/src/contract.ts` e i tre nomi degli strumenti MCP nella lista scritta a mano di `server/test/app.test.ts` (la regola di nomina è in `server/src/mcp.ts`).

- [ ] **Step 1: Write the failing tests** `server/test/menu-reads.test.ts`

Struttura come `pipeline.test.ts` (chiavi di test, `call` con `path`, `contextFor(keys, token, db.appServerUrl)` più `now`). Casi:

```ts
	it('generates the rest of the current week on the first opening and opens on today', async () => {
		// Tuesday 13 October 2026, 16:00 in Rome: from Tuesday dinner.
		const now = new Date('2026-10-13T14:00:00Z');
		const result = await read('getOpening', { familyId, today: '2026-10-13' }, now);
		expect(result).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13', weekStartsOn: '2026-10-12' } });
		expect(await weekStarts(familyId)).toEqual(['2026-10-12']);
	});

	it('answers with next week after Wednesday 20:00 even to a client holding the old version', async () => {
		const before = await read('getOpening', { familyId, today: '2026-10-14' }, new Date('2026-10-14T17:59:00Z'));
		const after = await read('getOpening', { familyId, today: '2026-10-14', knownVersion: before.version }, new Date('2026-10-14T18:00:00Z'));
		expect(after.unchanged).toBe(false);
		expect(await weekStarts(familyId)).toEqual(['2026-10-12', '2026-10-19']);
	});

	it('answers unchanged when nothing changed', async () => {
		const now = new Date('2026-10-15T10:00:00Z');
		const first = await read('getOpening', { familyId, today: '2026-10-15' }, now);
		expect(await read('getOpening', { familyId, today: '2026-10-15', knownVersion: first.version }, now)).toEqual({ unchanged: true, version: first.version });
	});

	it('opens on the next day with meals, then the last one before today, else no_weeks', async () => {
		const fx = menuFixtures(db);
		const broken = { slots: 'broken' }; // the lazy generation fails: only the fixture weeks exist
		const later = await memberFamily(); // family of the reader, see helpers below
		await db.admin`update app.families set settings = ${db.admin.json(broken)} where id = ${later}`;
		const week = await fx.insertWeek(later, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-13', mealType: 'lunch' }); // empty slot: no content
		await fx.insertSlot(week, { date: '2026-10-15', mealType: 'dinner', freeText: 'Pizza' });
		const now = new Date('2026-10-13T08:00:00Z');
		expect((await read('getOpening', { familyId: later, today: '2026-10-13' }, now)).data).toEqual({ kind: 'day', date: '2026-10-15', weekStartsOn: '2026-10-12' });

		const earlier = await memberFamily();
		await db.admin`update app.families set settings = ${db.admin.json(broken)} where id = ${earlier}`;
		const old = await fx.insertWeek(earlier, '2026-10-05');
		await fx.insertSlot(old, { date: '2026-10-10', mealType: 'lunch', freeText: 'Fuori' });
		expect((await read('getOpening', { familyId: earlier, today: '2026-10-13' }, now)).data).toEqual({ kind: 'day', date: '2026-10-10', weekStartsOn: '2026-10-05' });

		const none = await memberFamily();
		await db.admin`update app.families set settings = ${db.admin.json(broken)} where id = ${none}`;
		expect((await read('getOpening', { familyId: none, today: '2026-10-13' }, now)).data).toEqual({ kind: 'no_weeks' });
	});

	it('still reads when the generation fails', async () => {
		await db.admin`update app.families set settings = ${db.admin.json({ slots: 'broken' })} where id = ${brokenFamily}`;
		const result = await read('getOpening', { familyId: brokenFamily, today: '2026-10-13' }, new Date('2026-10-13T08:00:00Z'));
		expect(result).toMatchObject({ unchanged: false, data: { kind: 'no_weeks' } });
		expect(logs).toContainEqual(expect.objectContaining({ event: 'lazy_generation_failed', familyId: brokenFamily }));
	});

	it('lists the days with a menu in a month', async () => {
		const result = await read('getDates', { familyId, month: '2026-10' }, new Date('2026-10-15T10:00:00Z'));
		expect(result.data).toContain('2026-10-13');
		expect(result.data).not.toContain('2026-10-12'); // Monday before the first generation
	});

	it('rejects a today far from the family date', async () => {
		const error = await errorOf(read('getOpening', { familyId, today: '2026-10-20' }, new Date('2026-10-15T10:00:00Z')));
		expect(error.code).toBe('invalid');
	});

	it('exposes the three reads as read-only MCP tools', async () => {
		const list = await mcp(app, env, token, 'tools/list');
		const names = list.body.result.tools.filter((t: any) => t.name.startsWith('menu')).map((t: any) => [t.name, t.annotations?.readOnlyHint]);
		expect(names).toHaveLength(3);
		expect(names.every(([, readOnly]: [string, boolean]) => readOnly === true)).toBe(true);
	});
```

Helper del file:
- `memberFamily()` crea una famiglia con l'utente lettore come membro (`db.createFamily([{ userId: reader, role: 'member' }])`).
- `read(op, input, now)` chiama `router.menu[op]` con `path: ['menu', op]` e `contextFor(keys, readerToken, db.appServerUrl, () => now)`.
- `weekStarts(familyId)` legge `app.weeks` con `db.admin`.
- `logs` raccoglie `console.log` con `vi.spyOn(console, 'log')` e fa il parse JSON delle righe.

Le impostazioni `{ slots: 'broken' }` presuppongono che `resolveFamilySettings` di W2 rifiuti valori malformati. Se invece li sostituisce con i default, il fallimento si provoca diversamente, per esempio con una famiglia senza ricette pubblicate e un `generateWeek` simulato che lancia un errore tramite `vi.spyOn` sul modulo.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-reads`
Expected: FAIL.

- [ ] **Step 3: Implement**

`server/src/menu/time.ts`:

```ts
import { localDateTime, type LocalDateTime } from '@app/domain/planner';
import type { Tx } from '../db.ts';
import { logEvent } from '../log.ts';

const FALLBACK_TIME_ZONE = 'Europe/Rome';

/** Local date and time of the family; an unreadable zone falls back to Rome with a log line. */
export async function familyNow(tx: Tx, familyId: string, now: Date): Promise<{ timeZone: string; local: LocalDateTime }> {
	const [family] = await tx<{ timeZone: string }[]>`select time_zone as "timeZone" from app.families where id = ${familyId}`;
	const timeZone = family?.timeZone ?? FALLBACK_TIME_ZONE;
	try {
		return { timeZone, local: localDateTime(now, timeZone) };
	} catch {
		logEvent('invalid_time_zone', { familyId });
		return { timeZone: FALLBACK_TIME_ZONE, local: localDateTime(now, FALLBACK_TIME_ZONE) };
	}
}
```

In `generation.ts`:

```ts
/** Lazy generation (spec section 4.3): each target in a savepoint, failures logged, never thrown. */
export async function ensureWeeks(tx: Tx, familyId: string, now: Date): Promise<void> {
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

/** Error class or Postgres code, never the message. */
export function errorCode(error: unknown): string {
	if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
	return error instanceof Error ? error.name : 'unknown';
}
```

Verificare con Context7 (`/porsager/postgres`, «savepoint inside begin») che `tx.savepoint` sia disponibile sulla `TransactionSql` e che un errore dentro annulli solo il savepoint.

`server/src/menu/router.ts`:

```ts
import { addDays, mondayOf } from '@app/domain/planner';
import type { Prepare, OperationContext } from '../pipeline.ts';
import { fresh } from '../pipeline.ts';
import { appError } from '../errors.ts';
import { ensureWeeks } from './generation.ts';
import { familyNow } from './time.ts';

const nowOf = (context: OperationContext) => context.now?.() ?? new Date();
const lazy: Prepare = (context, input) => ensureWeeks(context.tx, (input as { familyId: string }).familyId, nowOf(context));

export const menuPrepare: Record<string, Prepare> = {
	'menu.getOpening': lazy,
	'menu.getWeek': lazy,
	'menu.getDates': lazy,
};

/** Today if it has meals with content, else the next day that has, else the last day with slots before today. */
export async function openingOf(context: OperationContext, familyId: string, today: string | undefined) {
	const { local } = await familyNow(context.tx, familyId, nowOf(context));
	if (today && Math.abs(Date.parse(today) - Date.parse(local.date)) > 86_400_000) {
		throw appError('invalid', { issues: [{ path: ['today'], code: 'out_of_range' }] });
	}
	const day = today ?? local.date;
	const [next] = await context.tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${day} and (s.recipe_id is not null or s.free_text is not null)
		order by s.date limit 1`;
	const [last] = next ? [] : await context.tx<{ date: string }[]>`
		select s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date < ${day} order by s.date desc limit 1`;
	const date = next?.date ?? last?.date;
	return date ? { kind: 'day' as const, date, weekStartsOn: mondayOf(date) } : { kind: 'no_weeks' as const };
}

export async function datesOf(context: OperationContext, familyId: string, month: string) {
	const first = `${month}-01`;
	const rows = await context.tx<{ date: string }[]>`
		select distinct s.date::text as date from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.date >= ${first} and s.date < (${first}::date + interval '1 month')
		order by date`;
	return rows.map((r) => r.date);
}
```

Nota di design: lo spec chiede anche oggi «se ha almeno un pasto con contenuto»; la prima query con `>= day` copre oggi e i giorni successivi insieme.

In `server/src/router.ts`:

```ts
const os = createImplementer(contract, { prepare: menuPrepare });
…
	menu: {
		getOpening: os.menu.getOpening.handler(async ({ context, input }) => fresh(context, await openingOf(context, input.familyId, input.today))),
		getDates: os.menu.getDates.handler(async ({ context, input }) => fresh(context, await datesOf(context, input.familyId, input.month))),
		getWeek: os.menu.getWeek.handler(() => { throw appError('not_found'); }), // replaced in Task 9
	},
```

Il gestore provvisorio di `getWeek` serve solo a far compilare il router: lo sostituisce il Task 9, e va dichiarato nella PR se il Task 9 resta bloccato dal cancello.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src/contract.ts server/src server/test
git commit -m "Menu: generazione pigra nel percorso della richiesta, apertura e giorni con menu"
```

---

### Task 8: Job orario con il Cron Trigger

**Files:**
- Create: `server/src/menu/job.ts`
- Modify: `server/src/index.ts` (handler `scheduled`)
- Modify: `server/wrangler.jsonc` (`"triggers": { "crons": ["0 * * * *"] }`)
- Modify: `server/README.md` (prova in locale con `wrangler dev --test-scheduled`)
- Test: `server/test/menu-job.test.ts`

Il job dipende da `generateWeek`, quindi dal cancello del Task 6. Scritto dopo il Task 6, non ha altri cancelli.

**Interfaces:**
- Consumes: `generateWeek`, `errorCode` (Tasks 6-7); `localDateTime`, `isNextWeekDue`, `isNextWeekOverdue`, `nextWeekStart` (Task 2); `withDbOn` e `withDb` di `server/src/db.ts`.
- Produces:
  - `runWeeklyJob(connectionString: string, now: Date): Promise<{ generated: number; failed: number }>`;
  - `runWeeklyJobOn(sql: postgres.Sql, now: Date)`, per i test.

- [ ] **Step 1: Write the failing tests**

```ts
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runWeeklyJobOn } from '../src/menu/job.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { menuFixtures } from './support/menu.ts';

describe.skipIf(!hasDatabase)('weekly job', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 2, fetch_types: false });
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	afterAll(async () => {
		await sql.end();
		await db.close();
	});
	const jobRow = async (familyId: string) =>
		(await db.admin<{ status: string; attempts: number; error: string | null }[]>`select status, attempts, error from app.weekly_jobs where family_id = ${familyId}`)[0];
	const hasWeek = async (familyId: string, startsOn: string) =>
		(await db.admin`select 1 from app.weeks where family_id = ${familyId} and starts_on = ${startsOn}`).length === 1;

	it('does nothing before Wednesday 20:00 and generates next week after it, in each family time zone', async () => {
		const rome = await db.createFamily([]);
		const newYork = await db.createFamily([]);
		await menuFixtures(db).setTimeZone(newYork, 'America/New_York');
		// Wednesday 14 October 2026 18:30 UTC: 20:30 in Rome, 14:30 in New York.
		await runWeeklyJobOn(sql, new Date('2026-10-13T12:00:00Z'));
		expect(await jobRow(rome)).toBeUndefined();
		await runWeeklyJobOn(sql, new Date('2026-10-14T18:30:00Z'));
		expect(await hasWeek(rome, '2026-10-19')).toBe(true);
		expect(await jobRow(rome)).toMatchObject({ status: 'done', attempts: 1 });
		expect(await hasWeek(newYork, '2026-10-19')).toBe(false);
		await runWeeklyJobOn(sql, new Date('2026-10-15T00:30:00Z'));
		expect(await hasWeek(newYork, '2026-10-19')).toBe(true);
	});

	it('isolates a failing family and retries it on the next run', async () => {
		const broken = await db.createFamily([]);
		const healthy = await db.createFamily([]);
		await db.admin`update app.families set settings = ${db.admin.json({ slots: 'broken' })} where id = ${broken}`;
		await runWeeklyJobOn(sql, new Date('2026-10-21T18:30:00Z'));
		expect(await jobRow(broken)).toMatchObject({ status: 'failed', attempts: 1 });
		expect((await jobRow(broken)).error).not.toMatch(/broken/);
		expect(await hasWeek(healthy, '2026-10-26')).toBe(true);
		await db.admin`update app.families set settings = '{}' where id = ${broken}`;
		await runWeeklyJobOn(sql, new Date('2026-10-21T19:30:00Z'));
		expect(await jobRow(broken)).toMatchObject({ status: 'done', attempts: 2, error: null });
	});

	it('marks done a week the lazy generation already created', async () => {
		const familyId = await db.createFamily([]);
		await menuFixtures(db).insertWeek(familyId, '2026-11-02');
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${familyId}, '2026-11-02')`;
		await runWeeklyJobOn(sql, new Date('2026-10-28T19:30:00Z'));
		expect(await jobRow(familyId)).toMatchObject({ status: 'done' });
	});

	it('logs an overdue family from Thursday 08:00', async () => {
		const familyId = await db.createFamily([]);
		await db.admin`update app.families set settings = ${db.admin.json({ slots: 'broken' })} where id = ${familyId}`;
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await runWeeklyJobOn(sql, new Date('2026-11-05T07:30:00Z'));
		const events = log.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(events).toContainEqual(expect.objectContaining({ event: 'weekly_job_overdue', familyId, weekStart: '2026-11-09' }));
		log.mockRestore();
	});
});
```

Ogni test usa una settimana diversa perché le famiglie dei test precedenti restano nel database. Un'esecuzione, però, serve tutte le famiglie presenti nel database, anche quelle create da altri file di test. Le asserzioni guardano solo le famiglie create nel test.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-job`
Expected: FAIL.

- [ ] **Step 3: Implement `server/src/menu/job.ts`**

```ts
import { isNextWeekDue, isNextWeekOverdue, localDateTime, nextWeekStart, type LocalDateTime } from '@app/domain/planner';
import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import { logEvent } from '../log.ts';
import { errorCode, generateWeek } from './generation.ts';

const FALLBACK_TIME_ZONE = 'Europe/Rome';

function localOf(familyId: string, timeZone: string, now: Date): LocalDateTime {
	try {
		return localDateTime(now, timeZone);
	} catch {
		logEvent('invalid_time_zone', { familyId });
		return localDateTime(now, FALLBACK_TIME_ZONE);
	}
}

/** The hourly job (spec section 4.2): dispatch, then one family at a time, each in its own transactions. */
export async function runWeeklyJobOn(sql: postgres.Sql, now: Date): Promise<{ generated: number; failed: number }> {
	const due = await withDbOn(sql, { kind: 'job' }, async (tx) => {
		const families = await tx<{ id: string; timeZone: string }[]>`select id, time_zone as "timeZone" from app.families`;
		const rows: { familyId: string; weekStart: string; local: LocalDateTime }[] = [];
		for (const family of families) {
			const local = localOf(family.id, family.timeZone, now);
			if (!isNextWeekDue(local)) continue;
			const weekStart = nextWeekStart(local);
			const [week] = await tx`select 1 from app.weeks where family_id = ${family.id} and starts_on = ${weekStart}`;
			if (!week) await tx`insert into app.weekly_jobs (family_id, target_week) values (${family.id}, ${weekStart}) on conflict do nothing`;
			const [job] = await tx<{ status: string }[]>`select status from app.weekly_jobs where family_id = ${family.id} and target_week = ${weekStart}`;
			if (job && job.status !== 'done') rows.push({ familyId: family.id, weekStart, local });
		}
		return rows;
	});
	let generated = 0;
	let failed = 0;
	for (const { familyId, weekStart, local } of due) {
		try {
			await withDbOn(sql, { kind: 'job' }, async (tx) => {
				if (await generateWeek(tx, familyId, { weekStart })) generated++;
				await tx`update app.weekly_jobs set status = 'done', attempts = attempts + 1, error = null, updated_at = now()
					where family_id = ${familyId} and target_week = ${weekStart}`;
			});
		} catch (error) {
			failed++;
			const code = errorCode(error).slice(0, 500);
			const [row] = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ attempts: number }[]>`
				update app.weekly_jobs set status = 'failed', attempts = attempts + 1, error = ${code}, updated_at = now()
				where family_id = ${familyId} and target_week = ${weekStart} returning attempts`);
			logEvent('weekly_job_failed', { familyId, weekStart, attempts: row?.attempts ?? null, code });
			if (isNextWeekOverdue(local)) logEvent('weekly_job_overdue', { familyId, weekStart, attempts: row?.attempts ?? null });
		}
	}
	return { generated, failed };
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

Una famiglia non è più in ritardo appena la sua generazione riesce, e una famiglia ancora senza settimana fallisce a ogni giro. Per questo la riga `weekly_job_overdue` nasce nel ramo d'errore, una per famiglia e per esecuzione, come chiede la sezione 4.2 della spec.

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
	// Hourly weekly job (spec section 4): families past Wednesday 20:00 in their time zone.
	"triggers": { "crons": ["0 * * * *"] },
```

In `server/README.md`, sezione di sviluppo locale: `npx wrangler dev --test-scheduled` e `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck -w server && npx -w server wrangler deploy --dry-run --outdir /tmp/claude-501/dry`
Expected: PASS e il dry run mostra il cron fra i trigger (nessuna pubblicazione).

- [ ] **Step 5: Commit**

```bash
git add server/src/menu/job.ts server/src/index.ts server/wrangler.jsonc server/README.md server/test/menu-job.test.ts
git commit -m "Menu: job orario con Cron Trigger per la settimana successiva"
```

---

### Task 9: Vista della settimana (`menu.getWeek`)

**Cancello:** le funzioni di W6 della sezione 6 della spec. Se non sono su `main`, scriverle in `server/src/recipes/views.ts` con quelle firme (vedi sotto), avvisare il coordinatore e tenerle minime.

**Files:**
- Create: `server/src/menu/week-view.ts`
- Modify: `server/src/router.ts` (gestore reale di `getWeek`)
- Test: `server/test/menu-week.test.ts`

**Interfaces:**
- Consumes: `mealRecipeVersions` (Task 5); da W6, `ingredientLinesView(tx, items, { locale, measurementSystem })`, `ratingSummaries(tx, familyId, recipeIds)` e `recipeSummaryViews(tx, recipes, locale)`, con le firme della spec, sezione 6.
- Produces: `weekViewOf(context: OperationContext, familyId: string, weekStartsOn: string): Promise<WeekView>`, che lancia `appError('not_found')` se la settimana non esiste.

- [ ] **Step 1: Write the failing tests** `server/test/menu-week.test.ts`

```ts
	it('composes seven days with recipe, free and empty meals, R1 versions and the last change', async () => {
		// Fixtures: week 2026-01-12 (past) with dinner on Monday of a recipe published v1 on 2026-01-10 and v2 on 2026-01-20,
		// Tuesday lunch of a draft, Wednesday lunch free "Pizza", Wednesday dinner empty, Thursday lunch changed by a member
		// who then left the family, Friday lunch changed by the reader.
		const week = await read('getWeek', { familyId, weekStartsOn: '2026-01-12' });
		const meals = week.data.days.flatMap((d: any) => d.meals);
		expect(week.data.days).toHaveLength(7);
		expect(meals.find((m: any) => m.date === '2026-01-12').recipe.name).toBe('Zuppa'); // v1, not "Zuppa v2"
		expect(meals.find((m: any) => m.date === '2026-01-13')).toMatchObject({ kind: 'recipe', ingredients: null, rating: null, canOpenRecipe: false, recipe: { name: 'Bozza' } });
		expect(meals.find((m: any) => m.date === '2026-01-14' && m.mealType === 'lunch')).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		expect(meals.find((m: any) => m.date === '2026-01-14' && m.mealType === 'dinner')).toMatchObject({ kind: 'empty', recipe: null });
		expect(meals.find((m: any) => m.date === '2026-01-15').lastChange).toEqual({ userName: null, at: expect.stringMatching(/^2026-01-1\dT\d\d:\d\d$/) });
		expect(meals.find((m: any) => m.date === '2026-01-16').lastChange.userName).toMatch(/^Test /);
		expect(meals.find((m: any) => m.date === '2026-01-12').lastChange).toBeNull();
	});

	it('shows the current version for future meals and English names in English', async () => {
		const week = await read('getWeek', { familyId, weekStartsOn: '2099-01-05' }, { locale: 'en-GB' });
		expect(week.data.days[0].meals[0].recipe.name).toBe('Zuppa (en)');
	});

	it('answers not_found for a missing week and forbidden for another family', async () => {
		expect((await errorOf(read('getWeek', { familyId, weekStartsOn: '2030-01-07' }))).code).toBe('not_found');
		expect((await errorOf(read('getWeek', { familyId: otherFamily, weekStartsOn: '2026-01-12' }))).code).toBe('forbidden');
	});
```

Nome di W6 nella versione 2 secondo `publishVersion` della fixture: `Zuppa v2`, in `it-IT`. Il nome inglese resta `Zuppa (en)`, perché la fixture cambia solo quello italiano. Un utente `en-GB` si crea con `db.createUser({ locale: 'en-GB' })`. Il membro uscito dalla famiglia si ottiene con `delete from app.family_members` da `db.admin`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w server -- menu-week`
Expected: FAIL.

- [ ] **Step 3: Implement `server/src/menu/week-view.ts`**

```ts
import type { Locale, WeekView } from '@app/contract';
import { addDays } from '@app/domain/planner';
import type { RecipeDocument } from '@app/domain/recipe';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import { ingredientLinesView, ratingSummaries, recipeSummaryViews, type RecipeAtVersion } from '../recipes/views.ts';
import { mealRecipeVersions } from './versions.ts';

interface SlotRow {
	id: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	updatedBy: string | null;
	updatedAt: string | null; // family local time, YYYY-MM-DDTHH:mm
	authorName: string | null; // null when not (or no longer) a member
}

const text = (value: { 'it-IT': string; 'en-GB': string } | null, locale: Locale) => value?.[locale] ?? '';

export async function weekViewOf(context: OperationContext, familyId: string, weekStartsOn: string): Promise<WeekView> {
	const { tx, locale } = context;
	const [week] = await tx<{ id: string; system: 'metric' | 'uk_imperial' }[]>`
		select w.id, f.measurement_system as system from app.weeks w join app.families f on f.id = w.family_id
		where w.family_id = ${familyId} and w.starts_on = ${weekStartsOn}`;
	if (!week) throw appError('not_found');
	const slots = await tx<SlotRow[]>`
		select s.id, s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId", s.free_text as "freeText",
			s.servings, s.note, s.updated_by as "updatedBy",
			case when s.updated_by is not null then to_char(s.updated_at at time zone f.time_zone, 'YYYY-MM-DD"T"HH24:MI') end as "updatedAt",
			case when m.user_id is not null then p.display_name end as "authorName"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		left join app.family_members m on m.family_id = w.family_id and m.user_id = s.updated_by
		left join app.profiles p on p.user_id = s.updated_by
		where s.week_id = ${week.id}
		order by s.date, s.meal_type desc`;
	const versions = new Map((await mealRecipeVersions(tx, familyId, week.id)).map((v) => [v.slotId, v]));
	const pairs = [...new Set([...versions.values()].filter((v) => v.version !== null).map((v) => `${v.recipeId}:${v.version}`))];
	const documents = pairs.length === 0 ? [] : await tx<{ recipeId: string; version: number; document: RecipeDocument }[]>`
		select recipe_id as "recipeId", version, content as document from app.recipe_versions
		where (recipe_id::text || ':' || version) in ${tx(pairs)}`;
	const byPair = new Map<string, RecipeAtVersion>(documents.map((d) => [`${d.recipeId}:${d.version}`, d]));
	const unpublishedIds = [...versions.values()].filter((v) => v.version === null).map((v) => v.recipeId);
	const unpublished = unpublishedIds.length === 0 ? [] : await tx<{ id: string; name: any; description: any }[]>`
		select id, name, description from app.recipes where id in ${tx(unpublishedIds)}`;
	const summaries = await recipeSummaryViews(tx, [...byPair.values()], locale);
	const lines = await ingredientLinesView(
		tx,
		slots.flatMap((s) => {
			const v = versions.get(s.id);
			const recipe = v?.version != null ? byPair.get(`${v.recipeId}:${v.version}`) : undefined;
			return recipe ? [{ key: s.id, recipe, servings: s.servings }] : [];
		}),
		{ locale, measurementSystem: week.system },
	);
	const ratings = await ratingSummaries(tx, familyId, [...new Set(documents.map((d) => d.recipeId))]);

	const meals = slots.map((s) => {
		const v = versions.get(s.id);
		const pair = v?.version != null ? `${v.recipeId}:${v.version}` : null;
		const draft = v && v.version === null ? unpublished.find((r) => r.id === v.recipeId) : undefined;
		const recipe = pair ? summaries.get(pair) ?? null : draft ? minimalSummary(draft, locale) : null;
		return {
			slotId: s.id,
			date: s.date,
			mealType: s.mealType,
			kind: s.recipeId ? ('recipe' as const) : s.freeText !== null ? ('free' as const) : ('empty' as const),
			recipe,
			freeText: s.freeText,
			servings: s.servings,
			ingredients: pair ? lines.get(s.id) ?? [] : null,
			note: s.note,
			rating: pair ? ratings.get(v!.recipeId) ?? null : null,
			canOpenRecipe: pair !== null,
			lastChange: s.updatedBy && s.updatedAt ? { userName: s.authorName, at: s.updatedAt } : null,
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

`minimalSummary`, nello stesso file, con la forma di `RecipeSummary` dell'`Api` di W5 (base dello schema di W6):

```ts
/** A never-published recipe (R1): name and description only, nothing to open or rate. */
function minimalSummary(draft: { id: string; name: any; description: any }, locale: Locale) {
	return {
		id: draft.id,
		name: text(draft.name, locale),
		description: text(draft.description, locale),
		photo: null,
		durationMinutes: null,
		sourceType: null,
		sourceUrl: null,
		bookTitle: null,
		bookPages: null,
		mealType: null,
		proteinGroup: null,
	};
}
```

Se lo schema di W6 non ammette `null` per `sourceType` o `mealType`, si chiede al coordinatore di renderli nullabili: si evita così di inventare valori. Prima di quella risposta il task resta in `STATO: DOMANDA`.

Il filtro con le coppie concatenate è un ripiego leggibile. Se Postgres.js offre un modo più pulito per passare coppie (per esempio `unnest` di due array), usarlo, verificandolo con Context7.

In `server/src/router.ts`: `getWeek: os.menu.getWeek.handler(async ({ context, input }) => fresh(context, await weekViewOf(context, input.familyId, input.weekStartsOn)))`.

- [ ] **Step 4: Run**

Run: `npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src server/test
git commit -m "Menu: vista della settimana con versioni dei pasti, ingredienti, voti e ultima modifica"
```

---

### Task 10: Menu dell'app web sui dati veri

**Cancello:** seconda PR di W5 (client oRPC reale) su `main`. Prima di scrivere codice, leggere la struttura di W5 su `main` (`web/src/api/`, `web/src/routes/MenuPage.tsx`, `web/src/api/queries.ts`) e adeguare i percorsi qui sotto a quelli reali.

**Files:**
- Modify: `web/src/api/types.ts` (tipi del menu dal contratto: `import type { OpeningView, WeekView, MealView } from '@app/contract'`)
- Modify: `web/src/api/queries.ts` (`today` nell'input e nella chiave di `getOpening`)
- Modify: `web/src/api/fake/fakeApi.ts` (stessa forma del contratto, `today` accettato)
- Modify: `web/src/routes/MenuPage.tsx` (calcolo di `today` con il fuso della famiglia)
- Test: `web/src/routes/MenuPage.test.tsx` (o il file di test esistente del Menu)

**Interfaces:**
- Consumes: `contract.menu` (Task 4); `localDateTime` di `@app/domain/planner` (Task 2), solo se il web può importare `@app/domain` (dipendenza di workspace già presente nei pacchetti di W5?); altrimenti il calcolo locale già usato da W5 per i pasti passati (`web/src/lib/calendar.ts`).
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Write the failing test**

```tsx
it('asks the opening for the family local date', async () => {
	const api = fakeApiSpy(); // spy on menu.getOpening
	vi.setSystemTime(new Date('2026-10-13T22:30:00Z')); // 00:30 on the 14th in Rome
	renderMenu({ api, family: { timeZone: 'Europe/Rome' } });
	await screen.findByRole('heading', { name: /ottobre/i });
	expect(api.menu.getOpening).toHaveBeenCalledWith(expect.objectContaining({ today: '2026-10-14' }));
});
```

`fakeApiSpy` e `renderMenu` si scrivono sopra gli helper di test di W5 (stesso stile dei test esistenti di `MenuPage`).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w web -- MenuPage`
Expected: FAIL (`today` assente).

- [ ] **Step 3: Implement**

- In `MenuPage` (o nel hook delle query dell'apertura), `const today = familyToday(family.timeZone)`, calcolato con la funzione locale di W5 o con `localDateTime(new Date(), timeZone).date`.
- `queries.ts`: `menuOpening({ familyId, today })` mette `today` nella chiave `['menu', 'getOpening', { familyId, today, locale }]` e nell'input.
- Tipi del menu dal contratto. Il client finto si adegua (`today` facoltativo; usa la data che riceve). I vocabolari di `proteinGroup` diventano quelli del dominio, dove W5 li usa nel Menu.
- La resa non cambia.

- [ ] **Step 4: Run web tests, typecheck and build; check visually**

Run: `npm test -w web && npm run typecheck && npm run build -w web`
Expected: PASS.

Prova visiva con la skill agent-browser, con il server in locale (`wrangler dev` con lo stack Supabase locale, `server/README.md`) e un utente di prova:
1. famiglia senza settimane → il Menu apre su oggi con i pasti generati;
2. calendario: giorni con menu attivi;
3. pasto libero, slot vuoto, ingredienti e voto aperti dal footer;
4. screenshot in `/private/tmp/claude-501/.../scratchpad/`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "Web: Menu sulle letture vere con la data locale della famiglia"
```

---

### Task 11: Verifica finale e PR

- [ ] **Step 1: Verifica completa** (skill `superpowers:verification-before-completion`)

Run: `npm run typecheck && npm test && npm run build -w web && npm run planner-report`
Expected: tutto PASS, report del pianificatore invariato nelle settimane.

- [ ] **Step 2: Rilettura della spec**

Scorrere le sezioni 1-9 della spec e, per ognuna, indicare il commit che la realizza. Ogni differenza nata in implementazione va corretta nella spec con un commit «Spec del menu: allineamento all'implementazione».

- [ ] **Step 3: Push e PR** (protocollo, fase 6)

```bash
git push -u origin traguardo/menu
gh pr create --base main --title "Menu, pianificatore, job del mercoledì e generazione pigra (W1, ondata 2)" --body-file /private/tmp/claude-501/<scratchpad>/pr-body.md
```

Corpo della PR in italiano: cosa fa, come è stato verificato (comandi e risultati, prova visiva), sezioni della specifica realizzate (parte 1 «Quando apri l'app», «Una settimana tipo», «Come sceglie i piatti»; sezioni 3, 4, 5 in lettura, 12, 13), cancelli e moduli scritti al posto di altri worker, decisioni da riportare. Finale: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Poi scrivere `STATO: PR_APERTA <url>` e fermarsi.
