# Profilo, famiglia e impostazioni: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** profilo (nome, lingua, famiglia mostrata) e famiglia (membri in lettura,
impostazioni complete, «Non proporre più») come operazioni del contratto, servite dal
Worker a web e MCP, con le schermate del Profilo collegate ai dati veri.

**Architecture:** due aree nuove del contratto (`profile`, `family`) con gestori nel
server che girano nella transazione dell'utente (RLS). Le impostazioni restano nel jsonb
`families.settings`, con i soli valori scelti: lo schema e la risoluzione stanno in
`domain/src/family/settings.ts`, e ogni mutazione scrive una sola chiave con `jsonb_set`.
Una migrazione aggiunge la tabella privata `app.profile_preferences` per la famiglia
mostrata. L'implementatore del server si costruisce solo in `server/src/router.ts` e le
aree sono factory che lo ricevono. Il web (seconda PR di W5, client oRPC reale) passa da
`me` a `profile` e applica le mutazioni con il modello di `web/src/api/ratings.ts`.

**Tech Stack:** TypeScript, zod 4, oRPC 1.15, Postgres.js, Supabase Postgres e pgTAP,
React con TanStack Router e Query, Vitest e Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-11-profilo-famiglia.md` (subordinata alla
specifica principale, sezioni 1, 2, 7, 12, 13).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano.
- Testi per l'utente localizzati in `it-IT` e `en-GB`; nessun testo fisso nelle schermate.
- Nessuna dipendenza nuova: solo quelle già nel repository.
- File condivisi (`domain/package.json`, indice del contratto, router, wrapper e rotte del
  web, dizionari comuni): prima `git fetch origin && git rebase origin/main`, poi solo
  modifiche additive, mai blocchi che sostituiscono il file intero.
- **Test del server con il database:** ogni comando li esegue con
  `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  (stesso valore della CI): senza database la suite fallisce invece di essere saltata.
  Controllare nell'output che i file eseguiti non risultino `skipped`. Prima:
  `export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH`, `podman machine start`,
  `supabase db start`.
- Il passo rosso di ogni ciclo deve fallire per il comportamento mancante, non per
  fixture sbagliate, test non raccolti o database assente.
- Ogni operazione: `op({ mcp, offline: false, role, reads? })`, route con metodo,
  percorso e `summary` in inglese; `checkContract(contract)` resta vuoto.
- Operazioni di famiglia con `familyId: z.uuid()`; utente e canale solo dal token.
- Errori solo a codici del contratto (`forbidden`, `not_found`, `invalid` con percorso…).
- Mutazioni a stato assoluto e idempotenti; nessun aggiornamento ottimistico nel web.
- Migrazioni solo nuove, con timestamp, `revoke execute … from public` su ogni funzione
  nuova, e test pgTAP.
- Limiti: nome della persona e della famiglia 1-60 caratteri dopo il trim; porzioni intere
  0-12; `fixedText` 1-60 o `null`; `maxMinutes` in `[15, 20, 30, 45, 60]` o `null`;
  quota intera 0-14; intervalli interi `0 ≤ min ≤ max ≤ 14`; `weeklyMax` 1-7 solo con
  `limit`; ricerca 2-60 caratteri, 8 risultati; motivo dell'esclusione ≤ 200.

## Review Focus

1. **jsonb salvato a mano o da una versione vecchia** (chiave sconosciuta, giorno «9»,
   porzioni «tre»): la lettura delle impostazioni non deve fallire. Test in Task 1
   (`resolveFamilySettings` scarta pezzo per pezzo) e in Task 6 (lettura con jsonb
   sporco scritto dall'amministratore del database).
2. **Due amministratori che cambiano insieme giorni diversi della matrice**: nessuno
   perde la modifica. Test concorrente in Task 6.
3. **La persona esce dalla famiglia mostrata** (oggi solo da database, nell'ondata 3
   dall'app): `profile.get` non deve restituire una famiglia di cui non si è più membri,
   e nessun co-membro deve poter leggere quale famiglia ha scelto un altro. Test in
   Task 2 (pgTAP) e in Task 3 (server).
4. **Agente MCP che passa un `familyId` altrui o inesistente**: `forbidden`, mai dati né
   differenze fra «non esiste» e «non sei membro». Test in Task 4.
5. **Risposte fuori ordine nel web** (lettura vecchia dopo una mutazione, due mutazioni
   con risposte invertite, risposta dopo l'uscita o il cambio di lingua): la vista non
   torna indietro. Test con promesse controllate in Task 12.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `domain/src/family/settings.ts` | Schema dei valori salvati, limiti, `resolveFamilySettings`, `normalizeRules`, schemi zod dei pezzi (slot, regola, quota, intervallo) |
| `domain/src/family/index.ts` | Esportazioni dell'area |
| `domain/package.json` | Aggiunta dell'export `./family` (additiva) |
| `supabase/migrations/20261011120000_profile_preferences.sql` | Tabella privata `app.profile_preferences` |
| `supabase/tests/profile_preferences_test.sql` | pgTAP della migrazione |
| `contract/src/profile/index.ts` | Operazioni dell'area `profile` |
| `contract/src/family/views.ts` | Schemi delle viste della famiglia |
| `contract/src/family/index.ts` | Operazioni dell'area `family` |
| `contract/src/contract.ts` | Registrazione delle due aree (modifica minima) |
| `contract/package.json` | Dipendenza `@app/domain` |
| `server/src/pipeline.ts` | `export type Implementer` (se non l'ha già aggiunto W1 o W6) |
| `server/src/router.ts` | Unico punto di costruzione dell'implementatore; registrazione delle aree (modifica minima) |
| `server/src/db-errors.ts` | Errori Postgres → `invalid` con percorso |
| `server/src/profile/views.ts`, `server/src/profile/handlers.ts` | Viste e gestori di `profile` |
| `server/src/family/views.ts`, `server/src/family/handlers.ts`, `server/src/family/settings-writes.ts` | Viste, gestori e scritture sul jsonb di `family` |
| `server/test/support/actors.ts` | Utenti, famiglie e chiamate firmate per i test di area |
| `server/test/profile.test.ts`, `server/test/family-*.test.ts` | Test di integrazione |
| `supabase/README.md` | Procedura per completare la famiglia di Federico |
| `web/src/session/session.ts`, `web/src/session/SessionScope.tsx`, `web/src/api/types.ts`, `web/src/api/fake/` | Da `me` a `profile`, area `family` nel wrapper e nel client finto |
| `web/src/api/profile.ts`, `web/src/api/family.ts`, `web/src/api/mutations.ts` | Query, mutazioni, applicazione delle risposte e tabella delle invalidazioni |
| `web/src/routes/profile/…`, `web/src/components/…` | Pagine e componenti dell'area |

---

### Task 1: Dominio delle impostazioni salvate

**Files:**
- Create: `domain/src/family/settings.ts`, `domain/src/family/index.ts`, `domain/src/family/settings.test.ts`
- Modify: `domain/package.json`

**Interfaces:**
- Consumes: da `domain/src/planner/index.ts`: `defaultPlannerSettings()`,
  `PlannerSettings`, `SlotSetting`, `MealRule`, `GroupRange`, `MEAL_TYPES`,
  `PROTEIN_GROUPS`, `FOOD_GROUPS`, `DishKind`, `MealType`, `FoodGroup`.
- Produces (da `@app/domain/family`): `MAX_SERVINGS = 12`, `TIME_LIMITS`, `FIXED_TEXT_MAX = 60`,
  `KNOWN_NEW_MAX = 14`, `GROUP_MAX = 14`, `DISH_KINDS`, `slotSettingSchema`, `mealRuleSchema`,
  `knownNewSchema`, `groupRangeSchema`, `storedSettingsSchema`, `type StoredSettings`,
  `resolveFamilySettings(stored: unknown): PlannerSettings`,
  `normalizeRules(rules: MealRule[]): MealRule[]`, `sameRule(a, b): boolean`,
  `type VisibleSettings = Omit<PlannerSettings, 'weights'>`.

- [ ] **Step 1: Export dell'area**

`git fetch origin && git rebase origin/main`, poi in `domain/package.json` aggiungere la
sola riga `"./family": "./src/family/index.ts"` in fondo a `exports`, lasciando com'è
tutto il resto (export di W4 e W3, dipendenza `zod` già presente). Nessun `npm install`:
le dipendenze non cambiano.

- [ ] **Step 2: Test che falliscono**

`domain/src/family/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultPlannerSettings } from '../planner/index.ts';
import { normalizeRules, resolveFamilySettings, storedSettingsSchema } from './settings.ts';

describe('resolveFamilySettings', () => {
	it('gives the defaults for an empty object', () => {
		expect(resolveFamilySettings({})).toEqual(defaultPlannerSettings());
	});

	it('overlays single meals, keeping the other days', () => {
		const settings = resolveFamilySettings({ slots: { lunch: { '6': { servings: 4, fixedText: 'Pizza', maxMinutes: null } } } });
		expect(settings.slots.lunch[6]).toEqual({ servings: 4, fixedText: 'Pizza', maxMinutes: null });
		expect(settings.slots.lunch[0]).toEqual(defaultPlannerSettings().slots.lunch[0]);
		expect(settings.slots.dinner).toEqual(defaultPlannerSettings().slots.dinner);
	});

	it('drops invalid pieces one by one and never throws', () => {
		const settings = resolveFamilySettings({
			slots: { lunch: { '9': { servings: 2, fixedText: null, maxMinutes: null }, '1': { servings: 'three' } } },
			rules: [{ kind: 'only_lunch', dish: 'pasta' }, { kind: 'never_on', group: 'fish', weekday: 12 }],
			knownNew: { known: 99, new: 5, tolerance: 1 },
			groupRanges: { fish: { min: 3, max: 1 }, eggs: { min: 0, max: 2 } },
			surprise: true,
		});
		const defaults = defaultPlannerSettings();
		expect(settings.slots.lunch).toEqual(defaults.slots.lunch);
		expect(settings.rules).toEqual([{ kind: 'only_lunch', dish: 'pasta' }]);
		expect(settings.knownNew).toEqual(defaults.knownNew);
		expect(settings.groupRanges.fish).toEqual(defaults.groupRanges.fish);
		expect(settings.groupRanges.eggs).toEqual({ min: 0, max: 2 });
	});

	it('accepts non-objects as empty', () => {
		for (const value of [null, 'x', 3, []]) expect(resolveFamilySettings(value)).toEqual(defaultPlannerSettings());
	});

	it('overlays partial weights for the planner', () => {
		expect(resolveFamilySettings({ weights: { liking: 5 } }).weights.liking).toBe(5);
	});
});

describe('normalizeRules', () => {
	it('removes duplicates and sorts stably', () => {
		const rules = normalizeRules([
			{ kind: 'never_fresh_fish', weekday: 0 },
			{ kind: 'only_lunch', dish: 'pasta' },
			{ kind: 'never_fresh_fish', weekday: 0 },
		]);
		expect(rules).toEqual([{ kind: 'only_lunch', dish: 'pasta' }, { kind: 'never_fresh_fish', weekday: 0 }]);
	});
});

describe('storedSettingsSchema', () => {
	it('rejects out-of-range values', () => {
		expect(storedSettingsSchema.safeParse({ slots: { lunch: { '0': { servings: 13, fixedText: null, maxMinutes: null } } } }).success).toBe(false);
		expect(storedSettingsSchema.safeParse({ slots: { dinner: { '0': { servings: 2, fixedText: '  ', maxMinutes: null } } } }).success).toBe(false);
		expect(storedSettingsSchema.safeParse({ slots: { dinner: { '0': { servings: 2, fixedText: null, maxMinutes: 25 } } } }).success).toBe(false);
	});
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npm test -w domain -- src/family`
Expected: FAIL, «Cannot find module './settings.ts'».

- [ ] **Step 4: Implementazione**

`domain/src/family/settings.ts`:

```ts
import { z } from 'zod';
import {
	defaultPlannerSettings,
	FOOD_GROUPS,
	MEAL_TYPES,
	PROTEIN_GROUPS,
	type DishKind,
	type MealRule,
	type PlannerSettings,
} from '../planner/index.ts';

/** Limits shared by stored values, contract inputs and the interface (round 4 of the prototype). */
export const MAX_SERVINGS = 12;
export const TIME_LIMITS = [15, 20, 30, 45, 60] as const;
export const FIXED_TEXT_MAX = 60;
export const KNOWN_NEW_MAX = 14;
export const GROUP_MAX = 14;
export const DISH_KINDS = ['pasta', 'rice', 'bread_wrap', 'skottle'] as const satisfies readonly DishKind[];

const weekday = z.number().int().min(0).max(6);

export const slotSettingSchema = z.object({
	servings: z.number().int().min(0).max(MAX_SERVINGS),
	fixedText: z.string().trim().min(1).max(FIXED_TEXT_MAX).nullable(),
	maxMinutes: z.union(TIME_LIMITS.map((n) => z.literal(n))).nullable(),
});

export const mealRuleSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('only_lunch'), dish: z.enum(DISH_KINDS) }),
	z.object({ kind: z.literal('at_least_one'), group: z.enum(PROTEIN_GROUPS), weekday }),
	z.object({ kind: z.literal('never_on'), group: z.enum(PROTEIN_GROUPS), weekday }),
	z.object({ kind: z.literal('never_fresh_fish'), weekday }),
]) satisfies z.ZodType<MealRule>;

const count = z.number().int().min(0).max(KNOWN_NEW_MAX);
export const knownNewSchema = z.object({ known: count, new: count, tolerance: count });

export const groupRangeSchema = z
	.object({ min: z.number().int().min(0).max(GROUP_MAX), max: z.number().int().min(0).max(GROUP_MAX) })
	.refine((range) => range.min <= range.max, { message: 'min_above_max', path: ['min'] });

const dayKey = z.enum(['0', '1', '2', '3', '4', '5', '6']);

/** What `families.settings` holds: only the values the family chose. */
export const storedSettingsSchema = z.object({
	slots: z.partialRecord(z.enum(MEAL_TYPES), z.partialRecord(dayKey, slotSettingSchema)).optional(),
	rules: z.array(mealRuleSchema).optional(),
	knownNew: knownNewSchema.optional(),
	groupRanges: z.partialRecord(z.enum(FOOD_GROUPS), groupRangeSchema).optional(),
	weights: z.record(z.string(), z.number()).optional(),
});
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

/** What web and MCP see: the score weights stay hidden (spec section 2). */
export type VisibleSettings = Omit<PlannerSettings, 'weights'>;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const ruleKey = (rule: MealRule) => JSON.stringify(Object.entries(rule).sort(([a], [b]) => a.localeCompare(b)));

export function sameRule(a: MealRule, b: MealRule): boolean {
	return ruleKey(a) === ruleKey(b);
}

/** Rules are identified by their value: no duplicates, stable order. */
export function normalizeRules(rules: MealRule[]): MealRule[] {
	const byKey = new Map(rules.map((rule) => [ruleKey(rule), rule]));
	return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, rule]) => rule);
}

/**
 * Defaults with the family's valid choices on top. Invalid pieces (old or hand-written data)
 * are dropped one by one: reading the settings never fails.
 */
export function resolveFamilySettings(stored: unknown): PlannerSettings {
	const settings = defaultPlannerSettings();
	if (!isObject(stored)) return settings;
	if (isObject(stored.slots)) {
		for (const meal of MEAL_TYPES) {
			const days = stored.slots[meal];
			if (!isObject(days)) continue;
			for (const [day, value] of Object.entries(days)) {
				if (!dayKey.safeParse(day).success) continue;
				const slot = slotSettingSchema.safeParse(value);
				if (slot.success) settings.slots[meal][Number(day)] = slot.data;
			}
		}
	}
	if (Array.isArray(stored.rules)) {
		settings.rules = normalizeRules(stored.rules.flatMap((rule) => {
			const parsed = mealRuleSchema.safeParse(rule);
			return parsed.success ? [parsed.data] : [];
		}));
	}
	const knownNew = knownNewSchema.safeParse(stored.knownNew);
	if (knownNew.success) settings.knownNew = knownNew.data;
	if (isObject(stored.groupRanges)) {
		for (const group of FOOD_GROUPS) {
			const range = groupRangeSchema.safeParse(stored.groupRanges[group]);
			if (range.success) settings.groupRanges[group] = range.data;
		}
	}
	if (isObject(stored.weights)) {
		for (const key of Object.keys(settings.weights) as (keyof PlannerSettings['weights'])[]) {
			const value = stored.weights[key];
			if (typeof value === 'number' && Number.isFinite(value)) settings.weights[key] = value;
		}
	}
	return settings;
}
```

`domain/src/family/index.ts`:

```ts
export * from './settings.ts';
```

Nota: l'ordine di `normalizeRules` è quello della chiave JSON con i campi ordinati
(`[["dish",…],["kind",…]]` viene prima di `[["kind",…],["weekday",…]]`): conta che sia
stabile e indipendente dall'ordine dei campi in ingresso.

- [ ] **Step 5: Verifica**

Run: `npm test -w domain -- src/family && npm run typecheck -w domain`
Expected: PASS, nessun errore di tipo.

- [ ] **Step 6: Commit**

```bash
git add domain/package.json domain/src/family
git commit -m "Dominio: impostazioni salvate della famiglia e loro risoluzione"
```

---

### Task 2: Migrazione della famiglia mostrata

**Files:**
- Create: `supabase/migrations/20261011120000_profile_preferences.sql`, `supabase/tests/profile_preferences_test.sql`

**Interfaces:**
- Produces: tabella `app.profile_preferences(user_id uuid pk → app.profiles, current_family_id uuid null, updated_at)`,
  con RLS del solo proprietario (`select`, `insert`, `update (current_family_id, updated_at)`
  per `authenticated`); chiave esterna `(current_family_id, user_id) → app.family_members
  (family_id, user_id) on delete set null (current_family_id)`.

Perché una tabella e non una colonna di `profiles`: `profiles` è leggibile dai co-membri
(policy `profiles_read`) e l'RLS filtra righe, non colonne (review, rilievo 1).

Fixture usate (`supabase/tests/helpers/fixtures.psql`; gli helper aggiungono da soli il
prefisso `test-`): Anna è amministratrice di Rossi e membro di Bianchi, Bruno è membro di
Rossi, Verdi ha solo Franco ed è estranea ad Anna.

- [ ] **Step 1: Test pgTAP che fallisce**

`supabase/tests/profile_preferences_test.sql`:

```sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

select has_table('app', 'profile_preferences', 'the shown family has its own table');

-- Anna, in Rossi and Bianchi, shows Bianchi
select tests.login('anna');
insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('anna'), tests.family('Bianchi'));
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('anna')),
	tests.family('Bianchi'), 'Anna reads her choice');
select throws_ok(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Verdi')),
	'23503', null, 'a family Anna is not in is refused');

-- Bruno, only in Rossi, never sees nor changes Anna's choice
reset role;
select tests.login('bruno');
select is((select count(*) from app.profile_preferences), 0::bigint, 'Bruno does not read Anna''s choice');
select is(tests.affected(format($$update app.profile_preferences set current_family_id = %L where user_id = tests.uid('anna')$$, tests.family('Rossi'))),
	0::bigint, 'Bruno cannot change Anna''s choice');
select throws_ok(format($$insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('anna'), %L)$$, tests.family('Rossi')),
	'42501', null, 'Bruno cannot write a row for Anna');
select throws_ok($$delete from app.profile_preferences$$, '42501', null, 'nobody deletes rows directly');
select is(tests.affected(format($$insert into app.profile_preferences (user_id, current_family_id) values (tests.uid('bruno'), %L)$$, tests.family('Rossi'))),
	1::bigint, 'Bruno writes his own choice');

-- Leaving the shown family clears it, the row stays
reset role;
delete from app.family_members where family_id = tests.family('Bianchi') and user_id = tests.uid('anna');
select is((select current_family_id from app.profile_preferences where user_id = tests.uid('anna')), null::uuid,
	'cleared when the membership goes');

-- Deleting the user removes the row with the profile
delete from auth.users where id = tests.uid('bruno');
select is((select count(*) from app.profile_preferences where user_id = tests.uid('bruno')), 0::bigint, 'gone with the user');

select * from finish();
rollback;
```

Il contatore delle famiglie non si prova qui: dentro una sola transazione cresce al più
una volta (le fixture l'hanno già fatto crescere), quindi il test sarebbe vero comunque.
Lo prova il server con transazioni reali (Task 3).

- [ ] **Step 2: Verifica che fallisca**

Run: `supabase test db`
Expected: FAIL su `profile_preferences_test.sql` al primo test («relation
app.profile_preferences does not exist»); gli altri file restano verdi.

- [ ] **Step 3: Migrazione**

`supabase/migrations/20261011120000_profile_preferences.sql`:

```sql
-- Family shown in the app, remembered on the server (spec of profile and family, wave 2).
-- Private: profiles are readable by co-members, and row level security filters rows, not
-- columns. The composite key keeps the choice among the user's own families; leaving,
-- being removed or deleting the family clears it.

create table app.profile_preferences (
	user_id uuid primary key references app.profiles (user_id) on delete cascade,
	current_family_id uuid,
	updated_at timestamptz not null default now(),
	constraint profile_preferences_current_family_member
		foreign key (current_family_id, user_id)
		references app.family_members (family_id, user_id)
		on delete set null (current_family_id)
);

alter table app.profile_preferences enable row level security;

grant select, insert on app.profile_preferences to authenticated;
grant update (current_family_id, updated_at) on app.profile_preferences to authenticated;

create policy profile_preferences_own on app.profile_preferences for all to authenticated
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
```

Nessuna funzione nuova (niente `revoke execute`) e nessun trigger dei contatori.

- [ ] **Step 4: Verifica**

Run: `supabase db reset && supabase test db`
Expected: tutti PASS, compreso `coverage_test.sql` (RLS attiva sulla tabella nuova,
nessun permesso ad `anon`, PUBLIC e `app_server`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011120000_profile_preferences.sql supabase/tests/profile_preferences_test.sql
git commit -m "Schema: famiglia mostrata in una tabella privata del profilo"
```

---

### Task 3: Area `profile` (contratto, server, test)

**Files:**
- Create: `contract/src/profile/index.ts`, `server/src/db-errors.ts`, `server/src/profile/views.ts`, `server/src/profile/handlers.ts`, `server/test/support/actors.ts`, `server/test/profile.test.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/pipeline.ts` (solo il tipo `Implementer`, se manca), `server/src/router.ts`

**Interfaces:**
- Consumes: `op`, `localeSchema` da `@app/contract`; `createImplementer` da `server/src/pipeline.ts`.
- Produces:
  - contratto `profile.get`, `profile.update`, `profile.setCurrentFamily`;
    `profileViewSchema`, `type ProfileView` esportati da `@app/contract`;
  - `server/src/pipeline.ts`: `export type Implementer` (implementatore del contratto
    completo), usato da ogni factory d'area;
  - `server/src/profile/handlers.ts`: `profileRouter(os: Implementer)` → gestori di `profile`;
  - `server/src/db-errors.ts`: `withInvalidOn<T>(path: (string|number)[], run: () => Promise<T>): Promise<T>`;
  - `server/src/profile/views.ts`: `profileView(tx: Tx, locale: Locale): Promise<ProfileView>`;
  - `server/test/support/actors.ts`: `setupActors()` → `{ db, keys, user(options?), close() }`
    dove `user(...)` restituisce un `Actor` con `userId`, `sessionId`, `call(procedure, input)`
    ed `errorOf(procedure, input)`.

- [ ] **Step 1: Contratto**

`contract/src/profile/index.ts`:

```ts
import { z } from 'zod';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';

const familyRole = z.enum(['family_admin', 'member']);
export const displayNameSchema = z.string().trim().min(1).max(60);

export const profileViewSchema = z.object({
	user: z.object({
		id: z.uuid(),
		displayName: z.string(),
		email: z.string(),
		locale: localeSchema,
		globalRoles: z.array(z.enum(['recipe_curator', 'app_admin'])),
	}),
	families: z.array(
		z.object({
			id: z.uuid(),
			name: z.string(),
			role: familyRole,
			timeZone: z.string(),
			measurementSystem: z.enum(['metric', 'uk_imperial']),
		}),
	),
	currentFamilyId: z.uuid().nullable(),
});
export type ProfileView = z.infer<typeof profileViewSchema>;

export const profile = {
	get: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({ method: 'GET', path: '/profile', summary: 'Your name, language, global roles, families and the family shown in the app' })
		.input(z.object({}))
		.output(profileViewSchema),
	update: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({ method: 'POST', path: '/profile', summary: 'Change your display name or language (it-IT or en-GB)' })
		.input(
			z.object({ displayName: displayNameSchema.optional(), locale: localeSchema.optional() })
				.refine((v) => v.displayName !== undefined || v.locale !== undefined, { message: 'empty', path: ['displayName'] }),
		)
		.output(profileViewSchema),
	setCurrentFamily: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({ method: 'POST', path: '/profile/current-family', summary: 'Choose the family shown in the app; agents still pass familyId to every family tool' })
		.input(z.object({ familyId: z.uuid() }))
		.output(profileViewSchema),
};
```

In `contract/src/contract.ts` aggiungere `import { profile } from './profile/index.ts';` e
la chiave `profile,` nell'oggetto `contract` (dopo `session`). In `contract/src/index.ts`:
`export { profileViewSchema, displayNameSchema, type ProfileView } from './profile/index.ts';`.

Nota: se `.refine` impedisce a oRPC o a `checkContract` di riconoscere `z.ZodObject`
(il controllo legge `.shape`), sostituirlo con la verifica nel gestore
(`appError('invalid', { issues: [{ path: ['displayName'], code: 'empty' }] })`) e un input
`z.object` semplice.

- [ ] **Step 2: Implementatore unico ed errori del database**

L'implementatore si costruisce in un solo punto, `server/src/router.ts` (dove W1
aggiunge `{ prepare }`); le aree esportano factory che lo ricevono (review, rilievo 5).
Prima `git fetch origin && git rebase origin/main`: se W1 o W6 hanno già aggiunto
`Implementer` a `server/src/pipeline.ts`, lo si usa così com'è. Altrimenti, in fondo a
`server/src/pipeline.ts`:

```ts
import type { Contract } from '@app/contract';

/** The implementer of the whole contract, built once in router.ts and passed to each area. */
export type Implementer = ReturnType<typeof createImplementer<Contract>>;
```

Se il tipo generico non si risolve (implementatore come tipo condizionale differito),
ripiegare come prevede il piano di W6: in `router.ts` `const os = createImplementer(contract, …)`
e `export type Implementer = typeof os`, importato dalle aree con `import type`.

`server/src/router.ts` resta il solo punto con `createImplementer(contract…)`; si
aggiunge solo la registrazione dell'area:

```ts
import { profileRouter } from './profile/handlers.ts';
// …
export const router = os.router({
	session: { /* invariato */ },
	profile: profileRouter(os),
});
```

`server/src/db-errors.ts`:

```ts
import { appError } from './errors.ts';

/** Check violations and invalid parameters (an unknown time zone) are the caller's input. */
const INPUT_CODES = new Set(['23514', '22023']);

export async function withInvalidOn<T>(path: (string | number)[], run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (typeof code === 'string' && INPUT_CODES.has(code)) {
			throw appError('invalid', { issues: [{ path, code: 'invalid' }] });
		}
		throw error;
	}
}
```

- [ ] **Step 3: Supporto dei test**

`server/test/support/actors.ts`:

```ts
import { call, ORPCError, type AnyProcedure } from '@orpc/server';
import { mapErrors } from '../../src/errors.ts';
import { contextFor } from './context.ts';
import { setupDatabase, type TestDatabase } from './db.ts';
import { createTestKeys, type TestKeys } from './keys.ts';

export interface Actor {
	userId: string;
	sessionId: string;
	call<T>(procedure: AnyProcedure, input: unknown): Promise<T>;
	errorOf(procedure: AnyProcedure, input: unknown): Promise<ORPCError<string, unknown>>;
}

export interface Actors {
	db: TestDatabase;
	keys: TestKeys;
	user(options?: { locale?: 'it-IT' | 'en-GB'; agent?: boolean }): Promise<Actor>;
	close(): Promise<void>;
}

export async function setupActors(): Promise<Actors> {
	const db = await setupDatabase();
	const keys = await createTestKeys();
	return {
		db,
		keys,
		async user(options = {}) {
			const { userId, sessionId } = await db.createUser({ locale: options.locale });
			const claims = { sub: userId, session_id: sessionId, email: `${userId}@test.local`, ...(options.agent ? { client_id: 'test-agent' } : {}) };
			const run = async (procedure: AnyProcedure, input: unknown) => {
				const token = await keys.sign(claims);
				return call(procedure, input, { context: contextFor(keys, token, db.appServerUrl), interceptors: [mapErrors] });
			};
			return {
				userId,
				sessionId,
				call: (procedure, input) => run(procedure, input) as Promise<never>,
				async errorOf(procedure, input) {
					try {
						await run(procedure, input);
					} catch (error) {
						if (error instanceof ORPCError) return error;
						throw error;
					}
					throw new Error('expected an error');
				},
			};
		},
		close: () => db.close(),
	};
}
```

- [ ] **Step 4: Test che falliscono**

`server/test/profile.test.ts`:

```ts
import type { ProfileView } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { router } from '../src/router.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('profile', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	it('shows the user, the families by name and the first one by default', async () => {
		const anna = await actors.user();
		const b = await actors.db.createFamily([{ userId: anna.userId, role: 'member' }]);
		const a = await actors.db.createFamily([{ userId: anna.userId, role: 'family_admin' }]);
		await actors.db.admin`update app.families set name = 'Beta' where id = ${b}`;
		await actors.db.admin`update app.families set name = 'Alfa' where id = ${a}`;
		const view = await anna.call<ProfileView>(router.profile.get, {});
		expect(view.user).toMatchObject({ id: anna.userId, email: `${anna.userId}@test.local`, locale: 'it-IT', globalRoles: [] });
		expect(view.families.map((f) => [f.name, f.role])).toEqual([['Alfa', 'family_admin'], ['Beta', 'member']]);
		expect(view.currentFamilyId).toBe(a);
	});

	it('has no current family without families', async () => {
		const solo = await actors.user();
		expect((await solo.call<ProfileView>(router.profile.get, {})).currentFamilyId).toBeNull();
	});

	it('saves name and language; the next request speaks the new language', async () => {
		const bruno = await actors.user();
		const view = await bruno.call<ProfileView>(router.profile.update, { displayName: '  Bruno  ', locale: 'en-GB' });
		expect(view.user).toMatchObject({ displayName: 'Bruno', locale: 'en-GB' });
		const whoami = await bruno.call<{ locale: string }>(router.session.whoami, {});
		expect(whoami.locale).toBe('en-GB');
	});

	it('refuses an empty name or an empty change', async () => {
		const carla = await actors.user();
		expect((await carla.errorOf(router.profile.update, { displayName: '   ' })).code).toBe('invalid');
		expect((await carla.errorOf(router.profile.update, {})).code).toBe('invalid');
		expect((await carla.errorOf(router.profile.update, { displayName: 'x'.repeat(61) })).code).toBe('invalid');
	});

	it('remembers the shown family, only among own families', async () => {
		const dario = await actors.user();
		const mine = await actors.db.createFamily([{ userId: dario.userId, role: 'member' }]);
		const other = await actors.db.createFamily([]);
		const second = await actors.db.createFamily([{ userId: dario.userId, role: 'member' }]);
		expect((await dario.call<ProfileView>(router.profile.setCurrentFamily, { familyId: second })).currentFamilyId).toBe(second);
		expect((await dario.errorOf(router.profile.setCurrentFamily, { familyId: other })).code).toBe('forbidden');
		expect((await dario.errorOf(router.profile.setCurrentFamily, { familyId: crypto.randomUUID() })).code).toBe('forbidden');
		await actors.db.admin`delete from app.family_members where family_id = ${second} and user_id = ${dario.userId}`;
		const view = await dario.call<ProfileView>(router.profile.get, {});
		expect(view.currentFamilyId).toBe(mine);
		expect(view.families.map((f) => f.id)).toEqual([mine]);
	});

	it('changes no family counter and stays private to the user', async () => {
		const elena = await actors.user();
		const fabio = await actors.user();
		const shared = await actors.db.createFamily([{ userId: elena.userId, role: 'member' }, { userId: fabio.userId, role: 'member' }]);
		const own = await actors.db.createFamily([{ userId: elena.userId, role: 'member' }]);
		const version = async (id: string) => (await actors.db.admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${id}`)[0]!.v;
		const before = [await version(shared), await version(own)];
		await elena.call(router.profile.setCurrentFamily, { familyId: own });
		expect([await version(shared), await version(own)]).toEqual(before);
		// Fabio shares a family with Elena: his profile says nothing about her choice.
		expect((await fabio.call<ProfileView>(router.profile.get, {})).currentFamilyId).toBe(shared);
	});

	it('is the same for an agent', async () => {
		const agent = await actors.user({ agent: true });
		await expect(agent.call(router.profile.update, { locale: 'en-GB' })).resolves.toBeTruthy();
	});
});
```

- [ ] **Step 5: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- profile`
Expected: FAIL («router.profile is undefined»).

- [ ] **Step 6: Viste e gestori**

`server/src/profile/views.ts`:

```ts
import { profileViewSchema, type Locale, type ProfileView } from '@app/contract';
import type { Tx } from '../db.ts';

/** The caller's profile; families by name in the caller's language. */
export async function profileView(tx: Tx, locale: Locale): Promise<ProfileView> {
	const [me] = await tx<{ id: string; displayName: string; email: string | null; locale: Locale; currentFamilyId: string | null; roles: string[] }[]>`
		select p.user_id as id, p.display_name as "displayName", auth.jwt() ->> 'email' as email, p.locale,
			(select pp.current_family_id from app.profile_preferences pp where pp.user_id = p.user_id) as "currentFamilyId",
			coalesce((select array_agg(r.role order by r.role) from app.user_roles r where r.user_id = p.user_id), '{}') as roles
		from app.profiles p where p.user_id = auth.uid()`;
	const families = await tx<ProfileView['families']>`
		select f.id, f.name, m.role, f.time_zone as "timeZone", f.measurement_system as "measurementSystem"
		from app.family_members m join app.families f on f.id = m.family_id
		where m.user_id = auth.uid()`;
	const collator = new Intl.Collator(locale);
	families.sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
	const current = families.some((f) => f.id === me!.currentFamilyId) ? me!.currentFamilyId : (families[0]?.id ?? null);
	return profileViewSchema.parse({
		user: { id: me!.id, displayName: me!.displayName, email: me!.email ?? '', locale: me!.locale, globalRoles: me!.roles },
		families: [...families],
		currentFamilyId: current,
	});
}
```

`server/src/profile/handlers.ts`:

```ts
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { profileView } from './views.ts';

export function profileRouter(os: Implementer) {
	return {
		get: os.profile.get.handler(({ context }) => profileView(context.tx, context.locale)),
		update: os.profile.update.handler(async ({ context, input }) => {
			const rows = await context.tx`
				update app.profiles set
					display_name = coalesce(${input.displayName ?? null}, display_name),
					locale = coalesce(${input.locale ?? null}, locale),
					updated_at = now()
				where user_id = auth.uid() returning locale`;
			if (!rows[0]) throw appError('unauthorized');
			return profileView(context.tx, (rows[0] as { locale: typeof context.locale }).locale);
		}),
		setCurrentFamily: os.profile.setCurrentFamily.handler(async ({ context, input }) => {
			const [member] = await context.tx<{ ok: boolean }[]>`select app.is_member(${input.familyId}::uuid) as ok`;
			if (!member?.ok) throw appError('forbidden');
			await context.tx`
				insert into app.profile_preferences (user_id, current_family_id) values (auth.uid(), ${input.familyId})
				on conflict (user_id) do update set current_family_id = excluded.current_family_id, updated_at = now()`;
			return profileView(context.tx, context.locale);
		}),
	};
}
```

Registrazione in `server/src/router.ts` come nello Step 2 (`profile: profileRouter(os)`).

- [ ] **Step 7: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm test -w contract && npm run typecheck`
Expected: PASS (anche `contract.test.ts`, che applica `checkContract`).

- [ ] **Step 8: Commit**

```bash
git add contract/src server/src server/test
git commit -m "Profilo: nome, lingua e famiglia mostrata nel contratto e nel server"
```

---

### Task 4: Letture della famiglia

**Files:**
- Create: `contract/src/family/views.ts`, `contract/src/family/index.ts`, `server/src/family/views.ts`, `server/src/family/handlers.ts`, `server/test/family-read.test.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts`, `contract/package.json` (dipendenza `"@app/domain": "*"`), `server/src/router.ts`

**Interfaces:**
- Consumes: `resolveFamilySettings`, `VisibleSettings` e gli schemi da `@app/domain/family`.
- Produces:
  - contratto `family.get`, `family.getSettings`, `family.searchIngredients`;
    schemi `familyViewSchema`, `settingsViewSchema`, `visibleSettingsSchema`;
  - server: `familyView(tx, familyId, locale)`, `settingsView(tx, familyId, locale)`
    (in `server/src/family/views.ts`), riusati dalle mutazioni dei Task 5-7.

- [ ] **Step 1: Schemi delle viste**

`contract/src/family/views.ts`:

```ts
import { groupRangeSchema, knownNewSchema, mealRuleSchema, slotSettingSchema } from '@app/domain/family';
import { FOOD_GROUPS } from '@app/domain/planner';
import { z } from 'zod';

export const familyRoleSchema = z.enum(['family_admin', 'member']);
export const measurementSystemSchema = z.enum(['metric', 'uk_imperial']);

export const familyViewSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	measurementSystem: measurementSystemSchema,
	timeZone: z.string(),
	myRole: familyRoleSchema,
	members: z.array(z.object({ userId: z.uuid(), displayName: z.string(), role: familyRoleSchema, isMe: z.boolean(), joinedAt: z.iso.datetime({ offset: true }) })),
});

export const visibleSettingsSchema = z.object({
	slots: z.object({ lunch: z.array(slotSettingSchema).length(7), dinner: z.array(slotSettingSchema).length(7) }),
	rules: z.array(mealRuleSchema),
	knownNew: knownNewSchema,
	groupRanges: z.record(z.enum(FOOD_GROUPS), groupRangeSchema),
});

export const settingsViewSchema = z.object({
	settings: visibleSettingsSchema,
	books: z.array(z.object({ id: z.uuid(), title: z.string(), owned: z.boolean() })),
	restrictions: z.array(z.object({ ingredientId: z.uuid(), name: z.string(), restriction: z.enum(['avoid', 'limit']), weeklyMax: z.number().int().nullable() })),
	canEdit: z.boolean(),
});

export const exclusionsViewSchema = z.array(
	z.object({
		recipe: z.object({ id: z.uuid(), name: z.string() }),
		reason: z.string().nullable(),
		createdByName: z.string().nullable(),
		createdAt: z.iso.datetime({ offset: true }),
	}),
);
```

`joinedAt` e `createdAt` arrivano da Postgres come `Date`: nelle viste del server si
convertono con `.toISOString()` (il formato con `Z` soddisfa `offset: true`).

- [ ] **Step 2: Operazioni di lettura**

`contract/src/family/index.ts` (le mutazioni si aggiungono nei Task 5-7):

```ts
import { z } from 'zod';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { familyViewSchema, settingsViewSchema } from './views.ts';

const family = z.object({ familyId: z.uuid() });
const read = (reads: ('family' | 'catalogue')[]) => op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads });

export const familyReads = {
	get: read(['family'])
		.route({ method: 'POST', path: '/family/get', summary: 'A family you belong to: name, measurement system, time zone, your role and the members' })
		.input(versionedInput(family))
		.output(versionedOutput(familyViewSchema)),
	getSettings: read(['family', 'catalogue'])
		.route({ method: 'POST', path: '/family/settings', summary: 'Planning settings of a family: meals and servings, fixed meals, time limits, rules, ingredients to avoid or limit, owned books, known/new quota and weekly food-group ranges' })
		.input(versionedInput(family))
		.output(versionedOutput(settingsViewSchema)),
	searchIngredients: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
		.route({ method: 'POST', path: '/family/ingredients/search', summary: 'Find catalogue ingredients by name or synonym in your language, to avoid or limit them' })
		.input(family.extend({ text: z.string().trim().max(60) }))
		.output(z.array(z.object({ id: z.uuid(), name: z.string() }))),
};

export const familyArea = { ...familyReads };
```

In `contract/src/contract.ts`: `import { familyArea } from './family/index.ts';` e
`family: familyArea,`. In `contract/src/index.ts` esportare gli schemi di `views.ts`.
In `contract/package.json` aggiungere `"@app/domain": "*"` alle dipendenze e lanciare
`npm install`.

- [ ] **Step 3: Test che falliscono**

`server/test/family-read.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultPlannerSettings } from '@app/domain/planner';
import { router } from '../src/router.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

type Fresh<T> = { unchanged: false; version: string; data: T };

describe.skipIf(!hasDatabase)('family reads', () => {
	let actors: Actors;
	let admin: Actor;
	let member: Actor;
	let stranger: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		member = await actors.user({ locale: 'en-GB' });
		stranger = await actors.user();
		familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }, { userId: member.userId, role: 'member' }]);
	});
	afterAll(() => actors?.close());

	it('lists members, admins first, with my role', async () => {
		const view = await member.call<Fresh<any>>(router.family.get, { familyId });
		expect(view.data.myRole).toBe('member');
		expect(view.data.members.map((m: any) => [m.userId, m.role, m.isMe])).toEqual([
			[admin.userId, 'family_admin', false],
			[member.userId, 'member', true],
		]);
	});

	it('answers unchanged for the same version and fresh after a change', async () => {
		const first = await member.call<Fresh<any>>(router.family.get, { familyId });
		expect(await member.call(router.family.get, { familyId, knownVersion: first.version })).toEqual({ unchanged: true, version: first.version });
		await actors.db.admin`update app.families set name = 'Renamed' where id = ${familyId}`;
		const next = await member.call<Fresh<any>>(router.family.get, { familyId, knownVersion: first.version });
		expect(next.unchanged).toBe(false);
		expect(next.data.name).toBe('Renamed');
	});

	it('refuses strangers and unknown families alike, also as an agent', async () => {
		const agent = await actors.user({ agent: true });
		for (const actor of [stranger, agent]) {
			expect((await actor.errorOf(router.family.get, { familyId })).code).toBe('forbidden');
			expect((await actor.errorOf(router.family.getSettings, { familyId: crypto.randomUUID() })).code).toBe('forbidden');
		}
	});

	it('resolves settings without weights; only admins can edit', async () => {
		const { weights: _weights, ...visible } = defaultPlannerSettings();
		const asMember = await member.call<Fresh<any>>(router.family.getSettings, { familyId });
		expect(asMember.data.settings).toEqual(visible);
		expect(asMember.data.canEdit).toBe(false);
		expect((await admin.call<Fresh<any>>(router.family.getSettings, { familyId })).data.canEdit).toBe(true);
	});

	it('survives a hand-written jsonb', async () => {
		await actors.db.admin`update app.families set settings = ${actors.db.admin.json({ slots: { lunch: { '9': 1, '0': { servings: 'x' } } }, rules: 'none' })} where id = ${familyId}`;
		const view = await member.call<Fresh<any>>(router.family.getSettings, { familyId });
		expect(view.data.settings.slots.lunch[0]).toEqual(defaultPlannerSettings().slots.lunch[0]);
		await actors.db.admin`update app.families set settings = '{}' where id = ${familyId}`;
	});

	it('searches ingredients in the user language, without archived or restricted ones', async () => {
		const [tomato] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, synonyms, department)
			values (${`srv-tomatoes-${familyId.slice(0, 8)}`}, '{"it-IT": "Pomodori", "en-GB": "Tomatoes"}', '{"it-IT": ["pomodoro"], "en-GB": ["tomato"]}', 'produce')
			returning id`;
		expect(await member.call(router.family.searchIngredients, { familyId, text: 'tomat' })).toContainEqual({ id: tomato!.id, name: 'Tomatoes' });
		expect(await admin.call(router.family.searchIngredients, { familyId, text: 'pomodoro' })).toContainEqual({ id: tomato!.id, name: 'Pomodori' });
		expect(await admin.call(router.family.searchIngredients, { familyId, text: 'p' })).toEqual([]);
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction) values (${familyId}, ${tomato!.id}, 'avoid')`;
		expect(await admin.call(router.family.searchIngredients, { familyId, text: 'pomod' })).not.toContainEqual(expect.objectContaining({ id: tomato!.id }));
	});
});
```

Nota per i test: l'ingrediente creato resta nel database locale (lo stesso vale per gli
altri test del server); lo slug con il prefisso dell'id della famiglia evita collisioni
fra esecuzioni.

- [ ] **Step 4: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- family-read`
Expected: FAIL («router.family is undefined»).

- [ ] **Step 5: Viste del server**

`server/src/family/views.ts`:

```ts
import { familyViewSchema, settingsViewSchema, exclusionsViewSchema, type Locale } from '@app/contract';
import { resolveFamilySettings } from '@app/domain/family';
import type { z } from 'zod';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

export type FamilyView = z.infer<typeof familyViewSchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
export type ExclusionsView = z.infer<typeof exclusionsViewSchema>;

export async function familyView(tx: Tx, familyId: string, locale: Locale): Promise<FamilyView> {
	const [family] = await tx<{ id: string; name: string; measurementSystem: 'metric' | 'uk_imperial'; timeZone: string }[]>`
		select id, name, measurement_system as "measurementSystem", time_zone as "timeZone" from app.families where id = ${familyId}`;
	if (!family) throw appError('forbidden');
	const members = await tx<{ userId: string; displayName: string; role: 'family_admin' | 'member'; joinedAt: Date }[]>`
		select m.user_id as "userId", coalesce(p.display_name, '') as "displayName", m.role, m.joined_at as "joinedAt"
		from app.family_members m left join app.profiles p on p.user_id = m.user_id
		where m.family_id = ${familyId}`;
	const collator = new Intl.Collator(locale);
	const [{ uid }] = await tx<{ uid: string }[]>`select auth.uid()::text as uid`;
	const sorted = [...members].sort(
		(a, b) => Number(b.role === 'family_admin') - Number(a.role === 'family_admin') || collator.compare(a.displayName, b.displayName) || a.userId.localeCompare(b.userId),
	);
	return {
		...family,
		myRole: members.find((m) => m.userId === uid)!.role,
		members: sorted.map((m) => ({ ...m, isMe: m.userId === uid, joinedAt: m.joinedAt.toISOString() })),
	};
}

export async function settingsView(tx: Tx, familyId: string, locale: Locale): Promise<SettingsView> {
	const [family] = await tx<{ settings: unknown; canEdit: boolean }[]>`
		select settings, app.is_family_admin(id) as "canEdit" from app.families where id = ${familyId}`;
	if (!family) throw appError('forbidden');
	const { weights: _weights, ...settings } = resolveFamilySettings(family.settings);
	const books = await tx<{ id: string; title: string; owned: boolean }[]>`
		select b.id, b.title, fb.book_id is not null as owned
		from app.books b left join app.family_books fb on fb.book_id = b.id and fb.family_id = ${familyId}
		where b.archived_at is null or fb.book_id is not null`;
	const restrictions = await tx<{ ingredientId: string; name: string; restriction: 'avoid' | 'limit'; weeklyMax: number | null }[]>`
		select fi.ingredient_id as "ingredientId", i.name ->> ${locale} as name, fi.restriction, fi.weekly_max as "weeklyMax"
		from app.family_ingredients fi join app.ingredients i on i.id = fi.ingredient_id
		where fi.family_id = ${familyId}`;
	const collator = new Intl.Collator(locale);
	return {
		settings,
		books: [...books].sort((a, b) => collator.compare(a.title, b.title)),
		restrictions: [...restrictions].sort((a, b) => collator.compare(a.name, b.name)),
		canEdit: family.canEdit,
	};
}
```


- [ ] **Step 6: Gestori di lettura**

`server/src/family/handlers.ts`:

```ts
import { fresh } from '../pipeline.ts';
import type { Implementer } from '../pipeline.ts';
import { familyView, settingsView } from './views.ts';

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function familyReadHandlers(os: Implementer) {
	return {
		get: os.family.get.handler(async ({ context, input }) => fresh(context, await familyView(context.tx, input.familyId, context.locale))),
		getSettings: os.family.getSettings.handler(async ({ context, input }) => fresh(context, await settingsView(context.tx, input.familyId, context.locale))),
		searchIngredients: os.family.searchIngredients.handler(async ({ context, input }) => {
			const needle = fold(input.text);
			if (needle.length < 2) return [];
			const rows = await context.tx<{ id: string; name: string; synonyms: string[] }[]>`
				select i.id, i.name ->> ${context.locale} as name,
					coalesce(array(select jsonb_array_elements_text(i.synonyms -> ${context.locale})), '{}') as synonyms
				from app.ingredients i
				where i.archived_at is null
					and not exists (select 1 from app.family_ingredients fi where fi.family_id = ${input.familyId} and fi.ingredient_id = i.id)`;
			const collator = new Intl.Collator(context.locale);
			return rows
				.map((row) => {
					const names = [row.name, ...row.synonyms].map(fold);
					return { id: row.id, name: row.name, starts: names.some((n) => n.startsWith(needle)), hit: names.some((n) => n.includes(needle)) };
				})
				.filter((row) => row.hit)
				.sort((a, b) => Number(b.starts) - Number(a.starts) || collator.compare(a.name, b.name))
				.slice(0, 8)
				.map(({ id, name }) => ({ id, name }));
		}),
	};
}
```

La ricerca filtra in memoria: il catalogo degli ingredienti è di qualche centinaio di
righe, e il confronto senza accenti in JavaScript evita estensioni come `unaccent`.

In fondo a `server/src/family/handlers.ts` il factory dell'area, che i task successivi
estendono con i propri gestori:

```ts
/** All family handlers, built on the single implementer of router.ts. */
export function familyRouter(os: Implementer) {
	return { ...familyReadHandlers(os) };
}
```

In `server/src/router.ts` solo la registrazione: `import { familyRouter } from
'./family/handlers.ts';` e `family: familyRouter(os),` accanto a `profile`.

- [ ] **Step 7: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm test -w contract && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add contract server package-lock.json
git commit -m "Famiglia: letture di famiglia, impostazioni e ricerca degli ingredienti"
```

---

### Task 5: Nome, unità e fuso della famiglia

**Files:**
- Modify: `contract/src/family/index.ts`, `server/src/family/handlers.ts`
- Create: `server/test/family-identity.test.ts`

**Interfaces:**
- Consumes: `familyView` (Task 4), `withInvalidOn` (Task 3).
- Produces: `family.rename`, `family.setMeasurementSystem`, `family.setTimeZone`, tutte
  con output `familyViewSchema` non versionato; `familyIdentityHandlers`.

- [ ] **Step 1: Contratto**

Aggiungere in `contract/src/family/index.ts`:

```ts
import { familyViewSchema, measurementSystemSchema } from './views.ts';

const adminWrite = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' });

export const familyIdentity = {
	rename: adminWrite()
		.route({ method: 'POST', path: '/family/rename', summary: 'Rename a family (family administrators)' })
		.input(family.extend({ name: z.string().trim().min(1).max(60) }))
		.output(familyViewSchema),
	setMeasurementSystem: adminWrite()
		.route({ method: 'POST', path: '/family/measurement-system', summary: 'Use metric or UK imperial units for meals, shopping and exports (family administrators)' })
		.input(family.extend({ measurementSystem: measurementSystemSchema }))
		.output(familyViewSchema),
	setTimeZone: adminWrite()
		.route({ method: 'POST', path: '/family/time-zone', summary: 'Set the family IANA time zone, e.g. Europe/Rome (family administrators)' })
		.input(family.extend({ timeZone: z.string().min(1).max(64) }))
		.output(familyViewSchema),
};

export const familyArea = { ...familyReads, ...familyIdentity };
```

- [ ] **Step 2: Test che falliscono**

`server/test/family-identity.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { router } from '../src/router.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family identity', () => {
	let actors: Actors;
	let admin: Actor;
	let member: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		member = await actors.user();
		familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }, { userId: member.userId, role: 'member' }]);
	});
	afterAll(() => actors?.close());

	it('renames, trimmed, and repeating changes nothing', async () => {
		expect((await admin.call<any>(router.family.rename, { familyId, name: '  Casa  ' })).name).toBe('Casa');
		expect((await admin.call<any>(router.family.rename, { familyId, name: 'Casa' })).name).toBe('Casa');
	});

	it('changes units and time zone', async () => {
		expect((await admin.call<any>(router.family.setMeasurementSystem, { familyId, measurementSystem: 'uk_imperial' })).measurementSystem).toBe('uk_imperial');
		expect((await admin.call<any>(router.family.setTimeZone, { familyId, timeZone: 'Europe/London' })).timeZone).toBe('Europe/London');
	});

	it('refuses an unknown time zone with invalid on the field', async () => {
		const error = await admin.errorOf(router.family.setTimeZone, { familyId, timeZone: 'Mars/Olympus' });
		expect(error.code).toBe('invalid');
		expect(error.data).toEqual({ issues: [{ path: ['timeZone'], code: 'invalid' }] });
	});

	it('is for administrators only', async () => {
		expect((await member.errorOf(router.family.rename, { familyId, name: 'Mine' })).code).toBe('forbidden');
		expect((await member.errorOf(router.family.setMeasurementSystem, { familyId, measurementSystem: 'metric' })).code).toBe('forbidden');
	});

	it('bumps the family version', async () => {
		const before = await member.call<any>(router.family.get, { familyId });
		await admin.call(router.family.rename, { familyId, name: 'Casa nuova' });
		expect((await member.call<any>(router.family.get, { familyId, knownVersion: before.version })).unchanged).toBe(false);
	});
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- family-identity`
Expected: FAIL.

- [ ] **Step 4: Gestori**

In `server/src/family/handlers.ts`:

```ts
import { withInvalidOn } from '../db-errors.ts';
import { appError } from '../errors.ts';
import type { Tx } from '../db.ts';

/** Zero rows: the family vanished or the user is no longer an administrator. */
async function updated(rows: Promise<unknown[]>): Promise<void> {
	if ((await rows).length === 0) throw appError('forbidden');
}

export function familyIdentityHandlers(os: Implementer) {
	return {
		rename: os.family.rename.handler(async ({ context, input }) => {
			await updated(context.tx`update app.families set name = ${input.name} where id = ${input.familyId} returning id`);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setMeasurementSystem: os.family.setMeasurementSystem.handler(async ({ context, input }) => {
			await updated(context.tx`update app.families set measurement_system = ${input.measurementSystem} where id = ${input.familyId} returning id`);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setTimeZone: os.family.setTimeZone.handler(async ({ context, input }) => {
			await withInvalidOn(['timeZone'], () =>
				updated(context.tx`update app.families set time_zone = ${input.timeZone} where id = ${input.familyId} returning id`),
			);
			return familyView(context.tx, input.familyId, context.locale);
		}),
	};
}
```

Nota: un errore Postgres dentro la transazione la rende inutilizzabile; `withInvalidOn`
rilancia subito `invalid`, quindi la transazione viene annullata e nessuna query segue.
In `familyRouter`: aggiungere `...familyIdentityHandlers(os)`; `router.ts` non cambia.

- [ ] **Step 5: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/family server/src/family server/test/family-identity.test.ts
git commit -m "Famiglia: nome, unità e fuso"
```

---

### Task 6: Impostazioni del pianificatore

**Files:**
- Create: `server/src/family/settings-writes.ts`, `server/test/family-settings.test.ts`
- Modify: `contract/src/family/index.ts`, `server/src/family/handlers.ts`

**Interfaces:**
- Consumes: `slotSettingSchema`, `mealRuleSchema`, `knownNewSchema`, `groupRangeSchema`,
  `normalizeRules`, `sameRule`, `resolveFamilySettings` (Task 1); `settingsView` (Task 4).
- Produces: `family.setMeal`, `family.addRule`, `family.removeRule`, `family.setKnownNew`,
  `family.setGroupRange` con output `settingsViewSchema`;
  `writeSettingsKey(tx, familyId, path: string[], value: unknown): Promise<void>`.

- [ ] **Step 1: Contratto**

```ts
import { groupRangeSchema, knownNewSchema, mealRuleSchema, slotSettingSchema } from '@app/domain/family';
import { FOOD_GROUPS, MEAL_TYPES } from '@app/domain/planner';
import { settingsViewSchema } from './views.ts';

export const familySettings = {
	setMeal: adminWrite()
		.route({ method: 'POST', path: '/family/settings/meal', summary: 'Plan one meal of the weekly pattern (weekday 0 = Monday): servings (0 = not planned), a fixed free meal text, a time limit in minutes' })
		.input(family.extend({ mealType: z.enum(MEAL_TYPES), weekday: z.number().int().min(0).max(6) }).extend(slotSettingSchema.shape))
		.output(settingsViewSchema),
	addRule: adminWrite()
		.route({ method: 'POST', path: '/family/settings/rules/add', summary: 'Add a meal rule from the four templates; adding an existing rule changes nothing' })
		.input(family.extend({ rule: mealRuleSchema }))
		.output(settingsViewSchema),
	removeRule: adminWrite()
		.route({ method: 'POST', path: '/family/settings/rules/remove', summary: 'Remove a meal rule, given by its value' })
		.input(family.extend({ rule: mealRuleSchema }))
		.output(settingsViewSchema),
	setKnownNew: adminWrite()
		.route({ method: 'POST', path: '/family/settings/known-new', summary: 'Weekly quota of known and new recipes, with its tolerance' })
		.input(family.extend(knownNewSchema.shape))
		.output(settingsViewSchema),
	setGroupRange: adminWrite()
		.route({ method: 'POST', path: '/family/settings/group-range', summary: 'Weekly minimum and maximum of a food group' })
		.input(family.extend({ group: z.enum(FOOD_GROUPS), min: z.number().int().min(0).max(14), max: z.number().int().min(0).max(14) }))
		.output(settingsViewSchema),
};

export const familyArea = { ...familyReads, ...familyIdentity, ...familySettings };
```

`min ≤ max` si verifica nel gestore con `groupRangeSchema` (l'input resta uno `z.object`
semplice per `checkContract` e per lo schema JSON degli strumenti MCP).

- [ ] **Step 2: Test che falliscono**

`server/test/family-settings.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { router } from '../src/router.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family settings', () => {
	let actors: Actors;
	let admin: Actor;
	let other: Actor;
	let member: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		other = await actors.user();
		member = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: admin.userId, role: 'family_admin' },
			{ userId: other.userId, role: 'family_admin' },
			{ userId: member.userId, role: 'member' },
		]);
	});
	afterAll(() => actors?.close());

	const stored = async () => (await actors.db.admin<{ settings: any }[]>`select settings from app.families where id = ${familyId}`)[0]!.settings;

	it('writes one meal under its own key', async () => {
		const view = await admin.call<any>(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 6, servings: 4, fixedText: ' Pizza ', maxMinutes: null });
		expect(view.settings.slots.lunch[6]).toEqual({ servings: 4, fixedText: 'Pizza', maxMinutes: null });
		expect((await stored()).slots.lunch).toEqual({ '6': { servings: 4, fixedText: 'Pizza', maxMinutes: null } });
	});

	it('keeps both of two concurrent changes on different days', async () => {
		await Promise.all([
			admin.call(router.family.setMeal, { familyId, mealType: 'dinner', weekday: 0, servings: 2, fixedText: null, maxMinutes: 20 }),
			other.call(router.family.setMeal, { familyId, mealType: 'dinner', weekday: 2, servings: 2, fixedText: null, maxMinutes: 20 }),
		]);
		const dinner = (await stored()).slots.dinner;
		expect(Object.keys(dinner).sort()).toEqual(['0', '2']);
	});

	it('adds and removes rules by value, idempotently', async () => {
		const rule = { kind: 'at_least_one', group: 'fish', weekday: 4 };
		await admin.call(router.family.addRule, { familyId, rule });
		const twice = await admin.call<any>(router.family.addRule, { familyId, rule: { weekday: 4, group: 'fish', kind: 'at_least_one' } });
		expect(twice.settings.rules).toEqual([rule]);
		expect((await admin.call<any>(router.family.removeRule, { familyId, rule })).settings.rules).toEqual([]);
		expect((await admin.call<any>(router.family.removeRule, { familyId, rule })).settings.rules).toEqual([]);
	});

	it('sets quota and ranges, refusing min above max', async () => {
		expect((await admin.call<any>(router.family.setKnownNew, { familyId, known: 6, new: 4, tolerance: 1 })).settings.knownNew).toEqual({ known: 6, new: 4, tolerance: 1 });
		expect((await admin.call<any>(router.family.setGroupRange, { familyId, group: 'fish', min: 1, max: 3 })).settings.groupRanges.fish).toEqual({ min: 1, max: 3 });
		const error = await admin.errorOf(router.family.setGroupRange, { familyId, group: 'fish', min: 4, max: 3 });
		expect(error.code).toBe('invalid');
	});

	it('refuses out-of-range meals and members', async () => {
		expect((await admin.errorOf(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 7, servings: 2, fixedText: null, maxMinutes: null })).code).toBe('invalid');
		expect((await admin.errorOf(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 1, servings: 2, fixedText: null, maxMinutes: 25 })).code).toBe('invalid');
		expect((await member.errorOf(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 1, servings: 2, fixedText: null, maxMinutes: null })).code).toBe('forbidden');
	});

	it('saves over malformed parents, keeping the valid keys', async () => {
		const cases: [unknown, () => Promise<unknown>, (stored: any) => void][] = [
			[{ slots: null }, () => admin.call(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 1, servings: 3, fixedText: null, maxMinutes: null }),
				(st) => expect(st.slots).toEqual({ lunch: { '1': { servings: 3, fixedText: null, maxMinutes: null } } })],
			[{ slots: { lunch: 'broken', dinner: { '0': { servings: 2, fixedText: null, maxMinutes: 20 } } } },
				() => admin.call(router.family.setMeal, { familyId, mealType: 'lunch', weekday: 2, servings: 1, fixedText: null, maxMinutes: null }),
				(st) => expect(st.slots).toEqual({ lunch: { '2': { servings: 1, fixedText: null, maxMinutes: null } }, dinner: { '0': { servings: 2, fixedText: null, maxMinutes: 20 } } })],
			[{ groupRanges: [1, 2], knownNew: { known: 6, new: 4, tolerance: 1 } },
				() => admin.call(router.family.setGroupRange, { familyId, group: 'eggs', min: 1, max: 2 }),
				(st) => { expect(st.groupRanges).toEqual({ eggs: { min: 1, max: 2 } }); expect(st.knownNew).toEqual({ known: 6, new: 4, tolerance: 1 }); }],
		];
		for (const [broken, save, check] of cases) {
			await actors.db.admin`update app.families set settings = ${actors.db.admin.json(broken as object)} where id = ${familyId}`;
			// The page shows defaults for the malformed parts…
			expect((await admin.call<any>(router.family.getSettings, { familyId })).data.settings.slots.lunch).toHaveLength(7);
			// …and the next save really lands.
			await save();
			check(await stored());
		}
		await actors.db.admin`update app.families set settings = '{}' where id = ${familyId}`;
	});

	it('never exposes or changes the weights', async () => {
		await actors.db.admin`update app.families set settings = jsonb_set(settings, '{weights}', '{"liking": 5}') where id = ${familyId}`;
		const view = await admin.call<any>(router.family.setKnownNew, { familyId, known: 7, new: 5, tolerance: 1 });
		expect(view.settings.weights).toBeUndefined();
		expect((await stored()).weights).toEqual({ liking: 5 });
	});
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- family-settings`
Expected: FAIL.

- [ ] **Step 4: Scritture sul jsonb**

`server/src/family/settings-writes.ts`:

```ts
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

/**
 * Writes one key of `families.settings`, creating the parent objects when missing. One
 * UPDATE reads and writes the row under its lock: concurrent writes to other keys survive.
 */
export async function writeSettingsKey(tx: Tx, familyId: string, path: string[], value: unknown): Promise<void> {
	if (path.length < 1 || path.length > 3) throw new Error('settings paths have one to three keys');
	// Each parent (slots, slots.lunch, groupRanges) becomes an object when it is missing or
	// malformed (null, a string, an array); an object parent keeps its other keys. The
	// reader shows defaults for malformed data, so the next save must work (review, 8).
	let expression = tx`settings`;
	for (let depth = 1; depth < path.length; depth++) {
		const parent = path.slice(0, depth);
		expression = tx`jsonb_set(${expression}, ${parent}::text[],
			case when jsonb_typeof(settings #> ${parent}::text[]) = 'object' then settings #> ${parent}::text[] else '{}'::jsonb end,
			true)`;
	}
	const rows = await tx`
		update app.families
		set settings = jsonb_set(${expression}, ${path}::text[], ${JSON.stringify(value)}::jsonb, true)
		where id = ${familyId}
		returning id`;
	if (rows.length === 0) throw appError('forbidden');
}
```

Lettura dei genitori: `settings #> parent` legge la colonna originale. Se un genitore
più esterno non era un oggetto è appena diventato `{}`, e il suo figlio letto dalla
colonna originale risulta `null` o non oggetto, quindi diventa anch'esso `{}`: il
risultato è coerente. Postgres.js compone i frammenti `tx\`…\`` annidati come parti della stessa query con i
parametri al loro posto. Il requisito è un solo `update` per scrittura: il blocco di riga
dell'`update` rende atomico il «leggi e scrivi» del jsonb.

- [ ] **Step 5: Gestori**

In `server/src/family/handlers.ts`:

```ts
import { groupRangeSchema, normalizeRules, sameRule } from '@app/domain/family';
import type { MealRule } from '@app/domain/planner';
import { resolveFamilySettings } from '@app/domain/family';
import { writeSettingsKey } from './settings-writes.ts';

async function currentRules(tx: Tx, familyId: string): Promise<MealRule[]> {
	const [row] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId} for update`;
	if (!row) throw appError('forbidden');
	return resolveFamilySettings(row.settings).rules;
}

const settingsOut = (tx: Tx, familyId: string, locale: Locale) => settingsView(tx, familyId, locale);

export function familySettingsHandlers(os: Implementer) {
	return {
		setMeal: os.family.setMeal.handler(async ({ context, input }) => {
			const { familyId, mealType, weekday, servings, fixedText, maxMinutes } = input;
			await writeSettingsKey(context.tx, familyId, ['slots', mealType, String(weekday)], { servings, fixedText, maxMinutes });
			return settingsOut(context.tx, familyId, context.locale);
		}),
		addRule: os.family.addRule.handler(async ({ context, input }) => {
			const rules = await currentRules(context.tx, input.familyId);
			await writeSettingsKey(context.tx, input.familyId, ['rules'], normalizeRules([...rules, input.rule]));
			return settingsOut(context.tx, input.familyId, context.locale);
		}),
		removeRule: os.family.removeRule.handler(async ({ context, input }) => {
			const rules = await currentRules(context.tx, input.familyId);
			await writeSettingsKey(context.tx, input.familyId, ['rules'], normalizeRules(rules.filter((r) => !sameRule(r, input.rule))));
			return settingsOut(context.tx, input.familyId, context.locale);
		}),
		setKnownNew: os.family.setKnownNew.handler(async ({ context, input }) => {
			const { familyId, ...knownNew } = input;
			await writeSettingsKey(context.tx, familyId, ['knownNew'], knownNew);
			return settingsOut(context.tx, familyId, context.locale);
		}),
		setGroupRange: os.family.setGroupRange.handler(async ({ context, input }) => {
			const range = groupRangeSchema.safeParse({ min: input.min, max: input.max });
			if (!range.success) throw appError('invalid', { issues: [{ path: ['min'], code: 'min_above_max' }] });
			await writeSettingsKey(context.tx, input.familyId, ['groupRanges', input.group], range.data);
			return settingsOut(context.tx, input.familyId, context.locale);
		}),
	};
}
```

`select … for update` in `currentRules` serializza due aggiunte di regole concorrenti
sulla stessa famiglia, così nessuna regola si perde. `for update` richiede il permesso di
`update` sulla riga: lo hanno solo gli amministratori, che sono gli unici a chiamare
queste operazioni. In `familyRouter`: aggiungere `...familySettingsHandlers(os)`.

- [ ] **Step 6: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm run typecheck`
Expected: PASS, compreso il test concorrente.

- [ ] **Step 7: Commit**

```bash
git add contract/src/family server/src/family server/test/family-settings.test.ts
git commit -m "Famiglia: impostazioni del pianificatore con scritture puntuali"
```

---

### Task 7: Libri e ingredienti della famiglia

**Files:**
- Modify: `contract/src/family/index.ts`, `server/src/family/handlers.ts`
- Create: `server/test/family-catalogue.test.ts`

**Interfaces:**
- Consumes: `settingsView` (Task 4).
- Produces: `family.setBookOwned`, `family.setIngredientRestriction` (output `settingsViewSchema`).

- [ ] **Step 1: Contratto**

```ts
import { errorDefinitions } from '../errors.ts';

/** Declared where an operation can answer not_found: clients and OpenAPI see it (review, 7). */
const notFound = { not_found: errorDefinitions.not_found };

export const familyCatalogue = {
	setBookOwned: adminWrite()
		.errors(notFound)
		.route({ method: 'POST', path: '/family/books', summary: 'Mark a cookbook as owned or not: recipes from books the family does not own are never planned' })
		.input(family.extend({ bookId: z.uuid(), owned: z.boolean() }))
		.output(settingsViewSchema),
	setIngredientRestriction: adminWrite()
		.errors(notFound)
		.route({ method: 'POST', path: '/family/ingredients', summary: 'Avoid an ingredient, limit it to a weekly maximum (1-7), or clear the restriction with null' })
		.input(family.extend({ ingredientId: z.uuid(), restriction: z.enum(['avoid', 'limit']).nullable(), weeklyMax: z.number().int().min(1).max(7).nullable() }))
		.output(settingsViewSchema),
};
export const familyArea = { ...familyReads, ...familyIdentity, ...familySettings, ...familyCatalogue };
```

- [ ] **Step 2: Test che falliscono**

`server/test/family-catalogue.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { router } from '../src/router.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family books and ingredients', () => {
	let actors: Actors;
	let admin: Actor;
	let familyId: string;
	let bookId: string;
	let archivedBookId: string;
	let ingredientId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const tag = familyId.slice(0, 8);
		[{ id: bookId }] = await actors.db.admin<{ id: string }[]>`insert into app.books (slug, title) values (${`srv-book-${tag}`}, 'Libro') returning id`;
		[{ id: archivedBookId }] = await actors.db.admin<{ id: string }[]>`insert into app.books (slug, title, archived_at) values (${`srv-old-${tag}`}, 'Vecchio', now()) returning id`;
		[{ id: ingredientId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department) values (${`srv-cucumber-${tag}`}, '{"it-IT": "Cetrioli", "en-GB": "Cucumbers"}', 'produce') returning id`;
	});
	afterAll(() => actors?.close());

	it('owns and disowns a book, idempotently', async () => {
		await admin.call(router.family.setBookOwned, { familyId, bookId, owned: true });
		const view = await admin.call<any>(router.family.setBookOwned, { familyId, bookId, owned: true });
		expect(view.books).toContainEqual({ id: bookId, title: 'Libro', owned: true });
		expect((await admin.call<any>(router.family.setBookOwned, { familyId, bookId, owned: false })).books).toContainEqual({ id: bookId, title: 'Libro', owned: false });
	});

	it('hides archived books and refuses to own them', async () => {
		expect((await admin.call<any>(router.family.getSettings, { familyId })).data.books.map((b: any) => b.id)).not.toContain(archivedBookId);
		expect((await admin.errorOf(router.family.setBookOwned, { familyId, bookId: archivedBookId, owned: true })).code).toBe('not_found');
		expect((await admin.errorOf(router.family.setBookOwned, { familyId, bookId: crypto.randomUUID(), owned: true })).code).toBe('not_found');
		expect((await admin.errorOf(router.family.setBookOwned, { familyId, bookId: crypto.randomUUID(), owned: false })).code).toBe('not_found');
		// Dropping an archived or never-owned book is fine and changes nothing.
		expect((await admin.call<any>(router.family.setBookOwned, { familyId, bookId: archivedBookId, owned: false })).books.map((b: any) => b.id)).not.toContain(archivedBookId);
	});

	it('limits, avoids and clears an ingredient', async () => {
		const limited = await admin.call<any>(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: 'limit', weeklyMax: 1 });
		expect(limited.restrictions).toEqual([{ ingredientId, name: 'Cetrioli', restriction: 'limit', weeklyMax: 1 }]);
		const avoided = await admin.call<any>(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: 'avoid', weeklyMax: null });
		expect(avoided.restrictions[0]).toMatchObject({ restriction: 'avoid', weeklyMax: null });
		expect((await admin.call<any>(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: null, weeklyMax: null })).restrictions).toEqual([]);
		expect((await admin.call<any>(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: null, weeklyMax: null })).restrictions).toEqual([]);
	});

	it('needs weeklyMax exactly with limit', async () => {
		expect((await admin.errorOf(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: 'limit', weeklyMax: null })).code).toBe('invalid');
		expect((await admin.errorOf(router.family.setIngredientRestriction, { familyId, ingredientId, restriction: 'avoid', weeklyMax: 2 })).code).toBe('invalid');
		expect((await admin.errorOf(router.family.setIngredientRestriction, { familyId, ingredientId: crypto.randomUUID(), restriction: 'avoid', weeklyMax: null })).code).toBe('not_found');
	});
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- family-catalogue`
Expected: FAIL.

- [ ] **Step 4: Gestori**

```ts
export function familyCatalogueHandlers(os: Implementer) {
	return {
		setBookOwned: os.family.setBookOwned.handler(async ({ context, input }) => {
			const { tx } = context;
			const [book] = await tx<{ archived: boolean }[]>`select archived_at is not null as archived from app.books where id = ${input.bookId}`;
			// Unknown book: not_found either way; an archived one can still be dropped, not added.
			if (!book || (input.owned && book.archived)) throw appError('not_found');
			if (input.owned) {
				await tx`insert into app.family_books (family_id, book_id) values (${input.familyId}, ${input.bookId}) on conflict do nothing`;
			} else {
				await tx`delete from app.family_books where family_id = ${input.familyId} and book_id = ${input.bookId}`;
			}
			return settingsView(tx, input.familyId, context.locale);
		}),
		setIngredientRestriction: os.family.setIngredientRestriction.handler(async ({ context, input }) => {
			const { tx } = context;
			if ((input.restriction === 'limit') !== (input.weeklyMax !== null)) {
				throw appError('invalid', { issues: [{ path: ['weeklyMax'], code: 'limit_needs_weekly_max' }] });
			}
			const [ingredient] = await tx<{ archived: boolean }[]>`select archived_at is not null as archived from app.ingredients where id = ${input.ingredientId}`;
			if (!ingredient || (input.restriction !== null && ingredient.archived)) throw appError('not_found');
			if (input.restriction === null) {
				await tx`delete from app.family_ingredients where family_id = ${input.familyId} and ingredient_id = ${input.ingredientId}`;
			} else {
				await tx`
					insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max)
					values (${input.familyId}, ${input.ingredientId}, ${input.restriction}, ${input.weeklyMax})
					on conflict (family_id, ingredient_id) do update set restriction = excluded.restriction, weekly_max = excluded.weekly_max`;
			}
			return settingsView(tx, input.familyId, context.locale);
		}),
	};
}
```

La policy `family_*_admin` garantisce che solo un amministratore scriva; un `insert` di un
non amministratore fallisce con `42501`, ma il ruolo è già verificato prima del gestore.
In `familyRouter`: aggiungere `...familyCatalogueHandlers(os)`.

- [ ] **Step 5: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/family server/src/family server/test/family-catalogue.test.ts
git commit -m "Famiglia: libri posseduti e ingredienti evitati o limitati"
```

---

### Task 8: «Non proporre più»

**Files:**
- Modify: `contract/src/family/index.ts`, `server/src/family/views.ts`, `server/src/family/handlers.ts`
- Create: `server/test/family-exclusions.test.ts`

**Interfaces:**
- Consumes: `exclusionsViewSchema` (Task 4).
- Produces: `family.listExclusions` (versionata: family, catalogue), `family.addExclusion`,
  `family.removeExclusion` (output `exclusionsViewSchema`); `exclusionsView(tx, familyId, locale)`.
  Interfaccia per la revisione dei pasti e per W6: chiamare `family.addExclusion` con
  `{ familyId, recipeId, reason? }`.

- [ ] **Step 1: Contratto**

```ts
import { exclusionsViewSchema } from './views.ts';

const memberWrite = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' });

export const familyExclusions = {
	listExclusions: read(['family', 'catalogue'])
		.route({ method: 'POST', path: '/family/exclusions', summary: 'Recipes this family asked never to be proposed again' })
		.input(versionedInput(family))
		.output(versionedOutput(exclusionsViewSchema)),
	addExclusion: memberWrite()
		.errors(notFound)
		.route({ method: 'POST', path: '/family/exclusions/add', summary: 'Stop proposing a recipe to this family; repeating it changes nothing' })
		.input(family.extend({ recipeId: z.uuid(), reason: z.string().trim().min(1).max(200).optional() }))
		.output(exclusionsViewSchema),
	removeExclusion: memberWrite()
		.route({ method: 'POST', path: '/family/exclusions/remove', summary: 'Let a recipe be proposed again to this family' })
		.input(family.extend({ recipeId: z.uuid() }))
		.output(exclusionsViewSchema),
};
export const familyArea = { ...familyReads, ...familyIdentity, ...familySettings, ...familyCatalogue, ...familyExclusions };
```

- [ ] **Step 2: Test che falliscono**

`server/test/family-exclusions.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { router } from '../src/router.ts';
import { setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family exclusions', () => {
	let actors: Actors;
	let member: Actor;
	let stranger: Actor;
	let familyId: string;
	let recipeId: string;
	let draftId: string;
	beforeAll(async () => {
		actors = await setupActors();
		member = await actors.user();
		stranger = await actors.user();
		familyId = await actors.db.createFamily([{ userId: member.userId, role: 'member' }]);
		recipeId = await insertRecipe('published');
		draftId = await insertRecipe('draft');
	});
	afterAll(() => actors?.close());

	/** Minimal published or draft recipe; columns as in supabase/migrations/*_catalogue.sql. */
	async function insertRecipe(status: 'published' | 'draft'): Promise<string> {
		const [row] = await actors.db.admin<{ id: string }[]>`
			insert into app.recipes (slug, status, name, description, source_type)
			values (${`srv-${status}-${crypto.randomUUID().slice(0, 8)}`}, ${status},
				'{"it-IT": "Pasta al pomodoro", "en-GB": "Tomato pasta"}', '{"it-IT": "", "en-GB": ""}', 'home')
			returning id`;
		return row!.id;
	}

	it('adds once, keeping the first author, and lists it', async () => {
		await member.call(router.family.addExclusion, { familyId, recipeId, reason: 'Troppo piccante' });
		const again = await member.call<any[]>(router.family.addExclusion, { familyId, recipeId });
		expect(again).toHaveLength(1);
		expect(again[0]).toMatchObject({ recipe: { id: recipeId, name: 'Pasta al pomodoro' }, reason: 'Troppo piccante' });
		const listed = await member.call<any>(router.family.listExclusions, { familyId });
		expect(listed.data).toEqual(again);
	});

	it('removes, idempotently', async () => {
		expect(await member.call(router.family.removeExclusion, { familyId, recipeId })).toEqual([]);
		expect(await member.call(router.family.removeExclusion, { familyId, recipeId })).toEqual([]);
	});

	it('refuses drafts, unknown recipes and strangers', async () => {
		expect((await member.errorOf(router.family.addExclusion, { familyId, recipeId: draftId })).code).toBe('not_found');
		expect((await member.errorOf(router.family.addExclusion, { familyId, recipeId: crypto.randomUUID() })).code).toBe('not_found');
		expect((await stranger.errorOf(router.family.addExclusion, { familyId, recipeId })).code).toBe('forbidden');
	});

	it('shows a former member as null', async () => {
		const leaving = await actors.user();
		await actors.db.addMember(familyId, leaving.userId, 'member');
		await leaving.call(router.family.addExclusion, { familyId, recipeId });
		await actors.db.admin`delete from app.family_members where family_id = ${familyId} and user_id = ${leaving.userId}`;
		const listed = await member.call<any>(router.family.listExclusions, { familyId });
		expect(listed.data[0].createdByName).toBeNull();
	});
});
```

Prima di scrivere `insertRecipe`, controllare in
`supabase/migrations/20261011100200_catalogue.sql` le colonne obbligatorie di
`app.recipes` (nome e descrizione jsonb bilingui, `source_type`, eventuali altri
`not null`) e completare l'`insert` di conseguenza.

- [ ] **Step 3: Verifica che falliscano**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server -- family-exclusions`
Expected: FAIL.

- [ ] **Step 4: Vista e gestori**

In `server/src/family/views.ts`:

```ts
export async function exclusionsView(tx: Tx, familyId: string, locale: Locale): Promise<ExclusionsView> {
	const rows = await tx<{ id: string; name: string; reason: string | null; createdByName: string | null; createdAt: Date }[]>`
		select r.id, r.name ->> ${locale} as name, e.reason,
			case when m.user_id is not null then p.display_name end as "createdByName", e.created_at as "createdAt"
		from app.recipe_exclusions e
		join app.recipes r on r.id = e.recipe_id
		left join app.family_members m on m.family_id = e.family_id and m.user_id = e.created_by
		left join app.profiles p on p.user_id = m.user_id
		where e.family_id = ${familyId}
		order by e.created_at desc, r.id`;
	return rows.map((row) => ({
		recipe: { id: row.id, name: row.name },
		reason: row.reason,
		createdByName: row.createdByName,
		createdAt: row.createdAt.toISOString(),
	}));
}
```

In `server/src/family/handlers.ts`:

```ts
export function familyExclusionHandlers(os: Implementer) {
	return {
		listExclusions: os.family.listExclusions.handler(async ({ context, input }) => fresh(context, await exclusionsView(context.tx, input.familyId, context.locale))),
		addExclusion: os.family.addExclusion.handler(async ({ context, input }) => {
			const { tx } = context;
			const [recipe] = await tx`select 1 from app.recipes where id = ${input.recipeId} and status <> 'draft'`;
			if (!recipe) throw appError('not_found');
			await tx`
				insert into app.recipe_exclusions (family_id, recipe_id, reason, created_by)
				values (${input.familyId}, ${input.recipeId}, ${input.reason ?? null}, auth.uid())
				on conflict (family_id, recipe_id) do nothing`;
			return exclusionsView(tx, input.familyId, context.locale);
		}),
		removeExclusion: os.family.removeExclusion.handler(async ({ context, input }) => {
			await context.tx`delete from app.recipe_exclusions where family_id = ${input.familyId} and recipe_id = ${input.recipeId}`;
			return exclusionsView(context.tx, input.familyId, context.locale);
		}),
	};
}
```

Il nome della ricetta viene dalla proiezione `recipes.name` (campo bilingue jsonb,
decisione dell'11 ottobre); se lo schema di W3 lo chiama diversamente, usare il nome
delle colonne della migrazione del catalogo. In `familyRouter`: aggiungere `...familyExclusionHandlers(os)`.

- [ ] **Step 5: Verifica**

Run: `CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/family server/src/family server/test/family-exclusions.test.ts
git commit -m "Famiglia: elenco, aggiunta e rimozione di «Non proporre più»"
```

---

### Task 9: MCP dell'area e copertura dei metadati

**Files:**
- Create: `server/test/profile-family-mcp.test.ts`
- Modify: `contract/src/contract.test.ts` (attese esplicite per le aree nuove)

**Interfaces:**
- Consumes: `collectTools(contract)` da `server/src/mcp.ts`; l'app di W1 con `/mcp`.
- Produces: nessuna interfaccia nuova; garanzia che ogni operazione dell'area sia uno
  strumento con `readOnlyHint` corretto e che gli errori arrivino localizzati.

- [ ] **Step 1: Test dei metadati**

In `contract/src/contract.test.ts` aggiungere:

```ts
it('exposes every profile and family operation to MCP with the expected role', () => {
	const expected: Record<string, [string, boolean]> = {
		'profile.get': ['user', true], 'profile.update': ['user', false], 'profile.setCurrentFamily': ['user', false],
		'family.get': ['familyMember', true], 'family.getSettings': ['familyMember', true], 'family.searchIngredients': ['familyMember', true],
		'family.listExclusions': ['familyMember', true], 'family.addExclusion': ['familyMember', false], 'family.removeExclusion': ['familyMember', false],
		'family.rename': ['familyAdmin', false], 'family.setMeasurementSystem': ['familyAdmin', false], 'family.setTimeZone': ['familyAdmin', false],
		'family.setMeal': ['familyAdmin', false], 'family.addRule': ['familyAdmin', false], 'family.removeRule': ['familyAdmin', false],
		'family.setKnownNew': ['familyAdmin', false], 'family.setGroupRange': ['familyAdmin', false],
		'family.setBookOwned': ['familyAdmin', false], 'family.setIngredientRestriction': ['familyAdmin', false],
	};
	for (const [name, [role, readOnly]] of Object.entries(expected)) {
		const [area, operation] = name.split('.') as [keyof typeof contract, string];
		const meta = (contract[area] as Record<string, { '~orpc': { meta: OperationMeta } }>)[operation]!['~orpc'].meta;
		expect(meta.role, name).toBe(role);
		expect(meta.mcp, name).toEqual({ readOnly });
		expect(meta.webOnly, name).toBeUndefined();
	}
});

it('declares not_found where the handler can answer it', () => {
	const errorsOf = (name: 'setBookOwned' | 'setIngredientRestriction' | 'addExclusion' | 'rename') =>
		Object.keys((contract.family[name] as unknown as { '~orpc': { errorMap: Record<string, unknown> } })['~orpc'].errorMap);
	for (const name of ['setBookOwned', 'setIngredientRestriction', 'addExclusion'] as const) expect(errorsOf(name), name).toContain('not_found');
	expect(errorsOf('rename')).not.toContain('not_found');
});
```

(importare `OperationMeta` da `./op.ts` se il file non lo fa già).

- [ ] **Step 2: Test MCP di integrazione**

`server/test/profile-family-mcp.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contract } from '@app/contract';
import { createApp } from '../src/app.ts';
import { collectTools } from '../src/mcp.ts';
import { messages } from '../src/messages.ts';
import { router } from '../src/router.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { mcp, rest, rpcClient, testEnv, toolBody } from './support/requests.ts';

describe('profile and family tools', () => {
	it('lists one tool per operation', () => {
		const names = collectTools(contract).map((tool) => tool.name);
		for (const name of ['profile_get', 'profile_update', 'family_getSettings', 'family_setMeal', 'family_addExclusion']) expect(names).toContain(name);
	});
});

describe.skipIf(!hasDatabase)('profile and family over MCP', () => {
	let actors: Actors;
	let app: ReturnType<typeof createApp>;
	beforeAll(async () => {
		actors = await setupActors();
		app = createApp({ contract, router, keys: () => actors.keys.keys, resourceName: 'test' });
	});
	afterAll(() => actors?.close());

	it('lets an admin agent write and read back', async () => {
		const { userId, sessionId } = await actors.db.createUser({ locale: 'it-IT' });
		const familyId = await actors.db.createFamily([{ userId, role: 'family_admin' }]);
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId, client_id: 'codex' });
		const env = testEnv(actors.db.appServerUrl);
		const write = await mcp(app, env, token, 'tools/call', {
			name: 'family_setMeal',
			arguments: { familyId, mealType: 'dinner', weekday: 5, servings: 4, fixedText: 'Cena libera', maxMinutes: null },
		});
		expect(write.body.result.isError).toBeFalsy();
		const read = await mcp(app, env, token, 'tools/call', { name: 'family_getSettings', arguments: { familyId } });
		expect(toolBody(read).data.settings.slots.dinner[5]).toEqual({ servings: 4, fixedText: 'Cena libera', maxMinutes: null });
	});

	it('answers not_found on RPC and REST as declared', async () => {
		const { userId, sessionId } = await actors.db.createUser();
		const familyId = await actors.db.createFamily([{ userId, role: 'family_admin' }]);
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId });
		const env = testEnv(actors.db.appServerUrl);
		const client = rpcClient<ContractRouterClient<Contract>>(app, env, token);
		await expect(client.family.setBookOwned({ familyId, bookId: crypto.randomUUID(), owned: true })).rejects.toMatchObject({ code: 'not_found', status: 404 });
		const response = await rest(app, env, 'POST', '/api/family/books', token, { familyId, bookId: crypto.randomUUID(), owned: true });
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: 'not_found' });
	});

	it('reads settings and refuses a member write with a localised forbidden', async () => {
		const { userId, sessionId } = await actors.db.createUser({ locale: 'en-GB' });
		const familyId = await actors.db.createFamily([{ userId, role: 'member' }]);
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId, client_id: 'codex' });
		const env = testEnv(actors.db.appServerUrl);
		const read = await mcp(app, env, token, 'tools/call', { name: 'family_getSettings', arguments: { familyId } });
		expect(read.body.result.isError).toBeFalsy();
		expect(toolBody(read).data.canEdit).toBe(false);
		const write = await mcp(app, env, token, 'tools/call', {
			name: 'family_setMeal',
			arguments: { familyId, mealType: 'lunch', weekday: 0, servings: 2, fixedText: null, maxMinutes: null },
		});
		expect(write.body.result.isError).toBe(true);
		expect(toolBody(write)).toMatchObject({ code: 'forbidden', message: messages.forbidden['en-GB'] });
	});
});
```

Helper `mcp`, `toolBody` e `createApp` come in `server/test/channels.test.ts`.

- [ ] **Step 3: Verifica**

Run: `npm test -w contract && CI=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -w server`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add contract/src/contract.test.ts server/test/profile-family-mcp.test.ts
git commit -m "Profilo e famiglia: strumenti MCP e metadati verificati"
```

---

### Task 10: Procedura per la famiglia di Federico

**Files:**
- Modify: `supabase/README.md`

- [ ] **Step 1: Sezione nuova dopo «Primi utenti del progetto vero»**

```markdown
### Impostazioni della famiglia dopo lo script

Lo script crea la famiglia con le impostazioni di default (sezione 2 della specifica).
Le impostazioni vere si sistemano poi dall'app (Profilo → Impostazioni) o da un agente
collegato (strumenti `family_setMeal`, `family_addRule`, `family_setIngredientRestriction`…),
da un amministratore della famiglia. Valori della famiglia di Federico, dalle regole del
progetto d'origine (`scripts/planner-data/family.ts`):

| Pasto | Lun | Mar | Mer | Gio | Ven | Sab | Dom |
|---|---|---|---|---|---|---|---|
| Pranzo | 2, ≤ 30 min | 3, ≤ 30 | 3, ≤ 30 | 3, ≤ 30 | 3, ≤ 30 | 4 | 4, fisso «Pizza» |
| Cena | 2, ≤ 20 | 4 | 2, ≤ 20 | 4 | 4 | 4, fisso «Cena libera» | 4 |

- Regole: pasta solo a pranzo; pesce almeno una volta il venerdì; mai pesce di
  pescheria il lunedì.
- Ingredienti: cetrioli limitati a 1 la settimana (dopo l'import del ricettario, che crea
  gli ingredienti).
- Quota note/nuove e intervalli: default.
- Sistema metrico, fuso `Europe/Rome` (già nello script).
```

Verificare i numeri con `scripts/planner-data/family.ts` prima del commit.

- [ ] **Step 2: Commit**

```bash
git add supabase/README.md
git commit -m "Database: impostazioni della famiglia di Federico dopo lo script dei primi utenti"
```

---

### Task 11: Da `me` a `profile` nel web

**Prerequisito:** la seconda PR di W5 (client oRPC reale) è su `main`. Prima
`git fetch origin && git rebase origin/main`; se quella PR non è unita, **fermarsi** e
scrivere `STATO: DOMANDA` al coordinatore (review, rilievo 4). Leggere la base unita:
`web/src/session/session.ts` (`wrapApi`, `Session.track`/`isLatest`/`isClosed`),
`web/src/session/SessionScope.tsx` (gestore degli errori, lingua del profilo),
`web/src/api/queries.ts` (`queryKeys`, `readThrough`, `familyOfKey`, `localeOfKey`),
`web/src/api/types.ts`, `web/src/api/fake/`, `web/src/session/useFamily.ts`. I nomi
sotto sono quelli della base all'11 ottobre; se la PR unita li ha cambiati, valgono
quelli uniti e il piano si segue nella sostanza.

**Files:**
- Modify: `web/src/session/session.ts`, `web/src/session/SessionScope.tsx`, `web/src/session/useFamily.ts`, `web/src/api/queries.ts`, `web/src/api/types.ts`, `web/src/api/fake/fakeApi.ts`, i test che usano `me` (per esempio `web/src/components/FamilyGate.test.tsx`)
- Create: `web/src/api/profile.ts`, `web/src/session/SessionScope.profile.test.tsx`

**Interfaces:**
- Consumes: client del contratto con le aree `profile` e `family` (Task 3-8).
- Produces: `queryKeys.profile(locale) = ['profile', 'get', { locale }]`;
  `profileQuery(deps)` (lettura non versionata: la cache contiene `ProfileView`);
  `Api` con `profile` e `family` al posto di `me`; `wrapApi` che avvolge anche
  `profile` e `family`; client finto con le stesse aree.

- [ ] **Step 1: Test che falliscono**

`web/src/session/SessionScope.profile.test.tsx`, con gli helper dei test di
`SessionScope.test.tsx` (backend d'accesso finto con rinnovo, `createApi` finto):

```tsx
it('reads the profile and a family view through the session, renewing once', async () => {
  const calls: string[] = [];
  const api = scriptedApi({
    'profile.get': [unauthorized(), profileView({ currentFamilyId: FAMILY })],
    'family.get': [familyRead()],
  }, calls);
  const { result } = renderSession({ api, renew: async () => true });
  await waitFor(() => expect(result.current.profile.data?.currentFamilyId).toBe(FAMILY));
  await act(() => result.current.api.family.get({ familyId: FAMILY }));
  expect(calls).toEqual(['profile.get', 'profile.get', 'family.get']); // one renewal, then success
});

it('revokes the family and reads the profile again after forbidden on a family call', async () => {
  const calls: string[] = [];
  const api = scriptedApi({
    'profile.get': [profileView({ currentFamilyId: FAMILY }), profileView({ families: [], currentFamilyId: null })],
    'family.getSettings': [forbidden()],
  }, calls);
  const { result } = renderSession({ api });
  await waitFor(() => expect(result.current.profile.data).toBeDefined());
  await expect(result.current.api.family.getSettings({ familyId: FAMILY })).rejects.toMatchObject({ code: 'forbidden' });
  expect(result.current.session.isRevoked(FAMILY)).toBe(true);
  await waitFor(() => expect(calls.filter((c) => c === 'profile.get')).toHaveLength(2));
  expect(result.current.queryClient.getQueryCache().findAll({ queryKey: ['me'] })).toHaveLength(0);
});
```

`scriptedApi` restituisce per ogni metodo, in ordine, le risposte o gli errori della
lista e annota le chiamate; `renderSession` monta `SessionScope` con `ApiProvider` e
restituisce `api` (quello del contesto, quindi avvolto), `session`, `queryClient` e
`useQuery(profileQuery(...))`. Se gli helper della base hanno altri nomi, si usano quelli.

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test -w web -- SessionScope.profile`
Expected: FAIL (`api.profile` e `api.family` non esistono dopo `wrapApi`).

- [ ] **Step 3: Implementazione**

- `web/src/api/types.ts`: `Api` con `profile: { get, update, setCurrentFamily }` e
  `family: { … }` (tipi dal contratto, `ContractRouterClient<Contract>['profile']`, se la
  base usa già il client del contratto); `MeView` → `ProfileView` da `@app/contract`.
- `web/src/session/session.ts`, `wrapApi`: l'oggetto restituito elenca `profile:
  wrapArea(api.profile)` e `family: wrapArea(api.family)` al posto di `me`, accanto a
  `menu`, `recipes`, `ratings` e alle aree aggiunte da W1, W4 e W6. Per `profile` il
  secondo argomento di `session.call` è `undefined` (nessuna famiglia), per `family` è
  `input.familyId` come per le altre aree: i segni di revoca valgono anche qui.
- `web/src/api/queries.ts`: `queryKeys.profile = (locale) => ['profile', 'get', { locale }]`
  al posto di `me`; `profileQuery` in `web/src/api/profile.ts`:

  ```ts
  export function profileQuery({ api, locale }: QueryDeps) {
    // Not versioned on the server (spec): the cache holds the view itself.
    return queryOptions({ queryKey: queryKeys.profile(locale), queryFn: () => api.profile.get({}) });
  }
  ```

- `web/src/session/SessionScope.tsx`: dopo `forbidden` con famiglia,
  `invalidateQueries({ queryKey: ['profile', 'get'] })` al posto di `['me']`; la lingua del
  profilo si legge da `ProfileView.user.locale`.
- `web/src/session/useFamily.ts`: `useMe()` → `useProfile()` su `profileQuery`;
  `FamilyState.me` → `profile`; la famiglia mostrata è `profile.currentFamilyId`.
- Client finto (`web/src/api/fake/fakeApi.ts`): `profile.get` (vista non versionata con
  `globalRoles: []` e `measurementSystem`), `profile.update`, `profile.setCurrentFamily`
  e le operazioni `family.*` sui dati dimostrativi, con le stesse forme del contratto.
- Ogni uso residuo: `grep -rn "\bme\b\|meQuery\|MeView" web/src` deve restare vuoto,
  test compresi.

- [ ] **Step 4: Verifica**

Run: `npm test -w web && npm run typecheck -w web`
Expected: PASS, compresi i test esistenti di `SessionScope`, `FamilyGate` e del client finto.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "Web: profilo al posto di me nel wrapper, nella sessione e nel client finto"
```

---

### Task 12: Applicazione delle mutazioni e invalidazioni

**Files:**
- Create: `web/src/api/mutations.ts`, `web/src/api/mutations.test.ts`, `web/src/api/family.ts`
- Modify: `web/src/api/profile.ts`, `web/src/session/SessionScope.tsx` (`useChooseLocale` passa da `profile.update`)

**Interfaces:**
- Consumes: `Session` (`track`, `isLatest`, `isClosed`), `QueryDeps`, `familyOfKey`,
  `queryKeys` (Task 11); chiavi delle altre aree: `['menu', …]` (W1), `['recipes',
  'search' | 'get']` (W6), `['shopping', …]` (W4, per esempio `getWeekList`).
- Produces:
  - `web/src/api/family.ts`: `familyKeys.family|settings|exclusions(familyId, locale)`,
    `familyQuery`, `settingsQuery`, `exclusionsQuery` (letture versionate con `readThrough`);
  - `web/src/api/mutations.ts`: `type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions'`,
    `INVALIDATIONS: Record<MutationName, Invalidation>`,
    `applyMutation(queryClient, { name, familyId, locale, view, isCurrent }): Promise<void>`,
    `useAreaMutation(name, familyId?)` (hook con `useMutation`, modello di `useRateRecipe`).

Modello (review, rilievo 2; `web/src/api/ratings.ts`): alla partenza `session.track(<vista>)`
e lingua annotata; alla risposta, se la sessione è chiusa, la lingua è cambiata o il
gettone non è più l'ultimo per quella vista, la risposta non si applica e la vista si
marca scaduta; altrimenti si cancellano le letture interessate in corso, si scrive la
vista, si invalidano le altre letture della tabella e ripartono le letture cancellate
senza dati.

- [ ] **Step 1: Tabella delle invalidazioni**

`web/src/api/mutations.ts` (prima parte), tradotta dalla spec («Viste aggiornate e
invalidate per operazione»):

```ts
import type { Query, QueryClient } from '@tanstack/react-query';
import { familyOfKey } from './queries';

export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions';
type Scope = 'all' | 'profile' | { area: string; operation?: string };

export interface Invalidation {
  target: MutationTarget;
  /** Other reads that depend on the changed value: 'all' = every query; area reads are of the same family. */
  stale: Scope[];
}

const familyReads = (...scopes: { area: string; operation?: string }[]) => scopes;

export const INVALIDATIONS = {
  'profile.updateName': { target: 'profile', stale: ['all'] },
  'profile.updateLocale': { target: 'profile', stale: [] },
  'profile.setCurrentFamily': { target: 'profile', stale: [] },
  'family.rename': { target: 'family', stale: ['profile'] },
  'family.setMeasurementSystem': { target: 'family', stale: ['profile', ...familyReads({ area: 'menu' }, { area: 'recipes' }, { area: 'shopping' })] },
  'family.setTimeZone': { target: 'family', stale: ['profile', ...familyReads({ area: 'menu' }, { area: 'recipes', operation: 'get' }, { area: 'shopping' })] },
  'family.setMeal': { target: 'settings', stale: [] },
  'family.addRule': { target: 'settings', stale: [] },
  'family.removeRule': { target: 'settings', stale: [] },
  'family.setKnownNew': { target: 'settings', stale: [] },
  'family.setGroupRange': { target: 'settings', stale: [] },
  'family.setBookOwned': { target: 'settings', stale: familyReads({ area: 'recipes', operation: 'search' }, { area: 'recipes', operation: 'get' }) },
  'family.setIngredientRestriction': { target: 'settings', stale: familyReads({ area: 'shopping' }) },
  'family.addExclusion': { target: 'exclusions', stale: [] },
  'family.removeExclusion': { target: 'exclusions', stale: [] },
} as const satisfies Record<string, Invalidation>;
export type MutationName = keyof typeof INVALIDATIONS;

const TARGET_KEY: Record<MutationTarget, [string, string]> = {
  profile: ['profile', 'get'],
  family: ['family', 'get'],
  settings: ['family', 'getSettings'],
  exclusions: ['family', 'listExclusions'],
};

function matches(scope: Scope, familyId: string | undefined) {
  return (query: Query) => {
    const [area, operation] = query.queryKey as [string, string];
    if (scope === 'all') return true;
    if (scope === 'profile') return area === 'profile' && operation === 'get';
    return area === scope.area && (!scope.operation || operation === scope.operation) && familyOfKey(query.queryKey) === familyId;
  };
}
```

`profile.update` sceglie il nome nella tabella dall'input: con `displayName` →
`profile.updateName` (anche se cambia insieme la lingua), solo `locale` →
`profile.updateLocale`.

- [ ] **Step 2: Test che falliscono**

`web/src/api/mutations.test.ts`, con un `QueryClient` vero e promesse controllate
(`deferred()` restituisce `{ promise, resolve }`):

```ts
const FAMILY = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const settingsKey = (familyId: string) => ['family', 'getSettings', { familyId, locale: 'it-IT' }];
const view = (servings: number) => ({ canEdit: true, settings: { slots: { lunch: [{ servings }] } }, books: [], restrictions: [] });

it('a read started before the mutation never overwrites its answer', async () => {
  const client = new QueryClient();
  const late = deferred<{ version: string; data: unknown }>();
  void client.fetchQuery({ queryKey: settingsKey(FAMILY), queryFn: () => late.promise });
  await applyMutation(client, { name: 'family.setMeal', familyId: FAMILY, locale: 'it-IT', view: view(3), isCurrent: () => true });
  late.resolve({ version: 'old', data: view(2) });
  await flush();
  expect(client.getQueryData(settingsKey(FAMILY))).toMatchObject({ data: view(3) });
});

it('two mutations on different keys: only the latest answer is applied, the earlier one marks the view stale', async () => {
  const { client, session, run } = harness(); // QueryClient + Session of the base + useAreaMutation outside React
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  const a = run('family.setMeal', FAMILY, () => first.promise);
  const b = run('family.setKnownNew', FAMILY, () => second.promise);
  second.resolve(view(4));
  await b;
  first.resolve(view(3)); // answered later, but started earlier
  await a;
  expect(client.getQueryData(settingsKey(FAMILY))).toMatchObject({ data: view(4) });
  expect(client.getQueryState(settingsKey(FAMILY))?.isInvalidated).toBe(true);
  void session;
});

it('drops an answer after sign-out or a change of language', async () => {
  for (const close of ['signOut', 'language'] as const) {
    const { client, session, setLocale, run } = harness();
    client.setQueryData(settingsKey(FAMILY), { version: 'v1', data: view(2) });
    const answer = deferred<unknown>();
    const done = run('family.setMeal', FAMILY, () => answer.promise);
    if (close === 'signOut') await session.close();
    else setLocale('en-GB');
    answer.resolve(view(3));
    await done;
    expect(client.getQueryData(settingsKey(FAMILY))).not.toMatchObject({ data: view(3) });
  }
});

it('marks exactly the reads of the table, of the same family only', async () => {
  const client = new QueryClient();
  const keys = {
    profile: ['profile', 'get', { locale: 'it-IT' }],
    week: ['menu', 'getWeek', { familyId: FAMILY, weekStartsOn: '2026-10-12', locale: 'it-IT' }],
    search: ['recipes', 'search', { familyId: FAMILY, query: {}, locale: 'it-IT' }],
    recipe: ['recipes', 'get', { familyId: FAMILY, recipeId: 'r', locale: 'it-IT' }],
    shopping: ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-12', locale: 'it-IT' }],
    otherWeek: ['menu', 'getWeek', { familyId: OTHER, weekStartsOn: '2026-10-12', locale: 'it-IT' }],
  };
  const stale = async (name: MutationName) => {
    for (const key of Object.values(keys)) client.setQueryData(key, { version: 'v', data: {} });
    await applyMutation(client, { name, familyId: FAMILY, locale: 'it-IT', view: {}, isCurrent: () => true });
    return Object.entries(keys).filter(([, key]) => client.getQueryState(key)?.isInvalidated).map(([name]) => name).sort();
  };
  expect(await stale('family.setMeal')).toEqual([]);
  expect(await stale('family.setBookOwned')).toEqual(['recipe', 'search']);
  expect(await stale('family.setIngredientRestriction')).toEqual(['shopping']);
  expect(await stale('family.setTimeZone')).toEqual(['profile', 'recipe', 'shopping', 'week']);
  expect(await stale('family.setMeasurementSystem')).toEqual(['profile', 'recipe', 'search', 'shopping', 'week']);
  expect(await stale('family.rename')).toEqual(['profile']);
  expect(await stale('profile.updateName')).toEqual(['otherWeek', 'recipe', 'search', 'shopping', 'week']);
});
```

`harness()` crea `QueryClient` e `Session` con i costruttori della base (come in
`web/src/api/ratings.test.ts`), una lingua modificabile e
`run(name, familyId, call)`, che esegue la stessa logica di `useAreaMutation` senza React
(funzione `runAreaMutation` esportata da `mutations.ts` e usata dall'hook). Nell'ultimo
caso il `profile.get` è la vista scritta, quindi non risulta fra le invalidate.

- [ ] **Step 3: Verifica che falliscano**

Run: `npm test -w web -- mutations`
Expected: FAIL («applyMutation is not exported»).

- [ ] **Step 4: Implementazione**

Seconda parte di `web/src/api/mutations.ts`:

```ts
export interface ApplyOptions {
  name: MutationName;
  familyId?: string;
  locale: string;
  view: unknown;
  /** Session open, same language, latest mutation of this view. */
  isCurrent: () => boolean;
}

const targetKey = (target: MutationTarget, familyId: string | undefined, locale: string) =>
  target === 'profile' ? ['profile', 'get', { locale }] : [...TARGET_KEY[target], { familyId, locale }];

/** Model of applyRating (W5): cancel affected reads, check, write, invalidate, restart the empty ones. */
export async function applyMutation(queryClient: QueryClient, options: ApplyOptions): Promise<void> {
  const { target, stale } = INVALIDATIONS[options.name] as Invalidation;
  const key = targetKey(target, options.familyId, options.locale);
  const isTarget = (query: Query) => JSON.stringify(query.queryKey) === JSON.stringify(key);
  const isStale = (query: Query) => !isTarget(query) && stale.some((scope) => matches(scope, options.familyId)(query));
  const affected = (query: Query) => isTarget(query) || isStale(query);
  const running = queryClient.getQueryCache().findAll({ predicate: affected, fetchStatus: 'fetching' });
  await queryClient.cancelQueries({ predicate: affected });
  if (!options.isCurrent()) {
    void queryClient.invalidateQueries({ predicate: isTarget });
    return;
  }
  queryClient.setQueryData(key, (old: { version: string } | undefined) =>
    target === 'profile' ? options.view : { version: old?.version ?? '', data: options.view },
  );
  void queryClient.invalidateQueries({ predicate: isStale });
  const empty = running.filter((query) => query.state.data === undefined && !isStale(query));
  if (empty.length) void queryClient.invalidateQueries({ predicate: (query) => empty.includes(query) });
}

export async function runAreaMutation<T>(
  deps: { queryClient: QueryClient; session: Session; currentLocale: () => string },
  name: MutationName,
  familyId: string | undefined,
  call: () => Promise<T>,
): Promise<T> {
  const { target } = INVALIDATIONS[name] as Invalidation;
  const trackKey = `${target}:${familyId ?? 'me'}`;
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const view = await call();
  const isCurrent = () => !deps.session.isClosed() && deps.currentLocale() === locale && deps.session.isLatest(trackKey, token);
  await applyMutation(deps.queryClient, { name, familyId, locale, view, isCurrent });
  return view;
}
```

La versione conservata resta quella vecchia: la lettura successiva riceve dati nuovi
(il contatore è cresciuto) e mai un «invariato» sbagliato. `useAreaMutation(name,
familyId)` avvolge `runAreaMutation` in `useMutation` con `meta: { familyId }`, come
`useRateRecipe`, e lo usano tutte le schermate dei Task 13-15. `useChooseLocale` (in
`SessionScope`): online `runAreaMutation('profile.updateLocale', undefined, () =>
api.profile.update({ locale }))`, poi la lingua del profilo si applica con il meccanismo
esistente; offline la scelta resta temporanea come oggi.

`web/src/api/family.ts`: chiavi e letture versionate.

```ts
export const familyKeys = {
  family: (familyId: string, locale: Locale) => ['family', 'get', { familyId, locale }] as const,
  settings: (familyId: string, locale: Locale) => ['family', 'getSettings', { familyId, locale }] as const,
  exclusions: (familyId: string, locale: Locale) => ['family', 'listExclusions', { familyId, locale }] as const,
};

export function settingsQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = familyKeys.settings(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.family.getSettings({ familyId, knownVersion })), select });
}
```

`familyQuery` ed `exclusionsQuery` con la stessa forma su `api.family.get` e
`api.family.listExclusions`; `select` è quello di `queries.ts` (`value.data`).

- [ ] **Step 5: Verifica**

Run: `npm test -w web && npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "Web: mutazioni di profilo e famiglia con il modello del voto e le invalidazioni per operazione"
```

---

### Task 13: Profilo, Preferenze e Membri

**Files:**
- Modify: `web/src/routes/ProfilePage.tsx` (e il suo CSS), `web/src/router.tsx` (registrazione delle rotte)
- Create: `web/src/routes/profile/PreferencesPage.tsx`, `web/src/routes/profile/MembersPage.tsx`, test accanto, `web/src/i18n/messages/family.ts`; chiavi nuove in `web/src/i18n/messages/profile.ts`

**Interfaces:**
- Consumes: `profileQuery` (Task 11), `useAreaMutation`, `familyQuery` (Task 12);
  `PageHeader`, `StateNotice`, `QueryError`, `Loading`, `Icon` della base.
- Produces: rotte `/profile`, `/profile/preferences`, `/profile/family`.

- [ ] **Step 1: Test che falliscono**

`web/src/routes/profile/PreferencesPage.test.tsx` (con il wrapper di test della base:
provider di API finta, lingua, router in memoria):

```tsx
it('saves the name on blur and shows the server value', async () => {
	const api = fakeApi({ profile: { update: vi.fn(async ({ displayName }) => profileView({ displayName: displayName.trim() })) } });
	render(<PreferencesPage />, { api });
	const field = await screen.findByLabelText('Nome');
	await userEvent.clear(field);
	await userEvent.type(field, '  Fede  ');
	await userEvent.tab();
	expect(api.profile.update).toHaveBeenCalledWith({ displayName: '  Fede  ' });
	expect(await screen.findByDisplayValue('Fede')).toBeInTheDocument();
});

it('restores the saved name after an error', async () => {
	const api = fakeApi({ profile: { update: vi.fn(async () => { throw new ApiError('invalid'); }) } });
	render(<PreferencesPage />, { api });
	const field = await screen.findByLabelText('Nome');
	await userEvent.clear(field);
	await userEvent.tab();
	expect(await screen.findByDisplayValue('Federico')).toBeInTheDocument();
});

it('switches language through the profile', async () => {
	const api = fakeApi({ profile: { update: vi.fn(async ({ locale }) => profileView({ locale })) } });
	render(<PreferencesPage />, { api });
	await userEvent.click(await screen.findByLabelText('English'));
	expect(api.profile.update).toHaveBeenCalledWith({ locale: 'en-GB' });
	expect(await screen.findByText('Preferences')).toBeInTheDocument();
});
```

`MembersPage.test.tsx`: un membro vede l'elenco con «tu» e la riga «Per gli inviti chiedi
a {nomi degli amministratori}»; nessun pulsante di modifica. `ProfilePage.test.tsx`:
le righe Membri, Impostazioni, Non proporre più sono link attivi; il tocco su un'altra
famiglia chiama `profile.setCurrentFamily` e alla risposta la segna come corrente;
nessuna riga dell'ondata 3 («Crea un'altra famiglia», inviti).

- [ ] **Step 2: Implementazione**

Riscrivere in React `prototype/src/routes/profile/+page.svelte`,
`prototype/src/routes/profile/preferences/+page.svelte` e
`prototype/src/routes/profile/family/+page.svelte` (solo la parte dei membri), con:

- le classi e i token esistenti (`settings-card`, `row-list`, `row-link`, `field`, `choice`);
- testi dalle chiavi dei dizionari, copiati dal prototipo
  (`prototype/src/lib/i18n/it-IT.ts` e `en-GB.ts`, chiavi `profile.*`, `preferences.*`,
  `family.*`) nelle due lingue;
- nessun aggiornamento ottimistico: il campo nome conserva il testo digitato fino alla
  risposta, poi mostra il valore del server; in errore torna al valore salvato e
  mostra `errors.<code>`;
- campi disattivati offline (`useConnectivity()` della base).

- [ ] **Step 3: Verifica**

Run: `npm test -w web && npm run typecheck -w web`
Expected: PASS, compreso il test dei dizionari (stesse chiavi nelle due lingue).

- [ ] **Step 4: Commit**

```bash
git add web/src
git commit -m "Web: Profilo, preferenze e membri collegati ai dati veri"
```

---

### Task 14: Pagina delle impostazioni

**Files:**
- Create: `web/src/routes/profile/SettingsPage.tsx`, `web/src/components/DinersGrid.tsx`, `web/src/components/MealRules.tsx`, `web/src/components/IngredientRestrictions.tsx`, `web/src/components/Stepper.tsx` (se la base non ha già uno stepper riusabile: `ServingsStepper` va esteso invece di duplicarlo), CSS e test accanto
- Modify: `web/src/router.tsx`, `web/src/i18n/messages/family.ts`

**Interfaces:**
- Consumes: `settingsQuery`, `familyQuery`, `useAreaMutation` (Task 12); le
  operazioni `family.*` dei Task 5-7; costanti `MAX_SERVINGS`, `TIME_LIMITS`,
  `KNOWN_NEW_MAX`, `GROUP_MAX`, `DISH_KINDS` da `@app/domain/family` e i vocabolari da
  `@app/domain/planner` (aggiungere `@app/domain` alle dipendenze di `web/`).
- Produces: rotta `/profile/family/settings`.

- [ ] **Step 1: Test che falliscono**

`SettingsPage.test.tsx`:

```tsx
it('is read-only for members', async () => {
	render(<SettingsPage />, { api: fakeApi({ family: { getSettings: settingsRead({ canEdit: false }) } }) });
	expect(await screen.findByText('Solo gli amministratori della famiglia possono cambiare le impostazioni.')).toBeInTheDocument();
	for (const input of screen.getAllByRole('spinbutton')) expect(input).toBeDisabled();
});

it('saves one meal and shows the server view', async () => {
	const setMeal = vi.fn(async (input) => settingsViewWith({ lunch: { 6: { servings: input.servings, fixedText: null, maxMinutes: null } } }));
	render(<SettingsPage />, { api: fakeApi({ family: { getSettings: settingsRead({ canEdit: true }), setMeal } }) });
	await userEvent.click(await screen.findByRole('button', { name: 'Aumenta porzioni domenica pranzo' }));
	expect(setMeal).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'lunch', weekday: 6, servings: 3 }));
});

it('restores the value and shows the error when saving fails', async () => {
	const setKnownNew = vi.fn(async () => { throw new ApiError('forbidden'); });
	render(<SettingsPage />, { api: fakeApi({ family: { getSettings: settingsRead({ canEdit: true }), setKnownNew } }) });
	await userEvent.click(await screen.findByText('Avanzate'));
	await userEvent.click(screen.getByRole('button', { name: 'Aumenta note' }));
	expect(await screen.findByRole('status')).toHaveTextContent('Non hai i permessi');
	expect(screen.getByLabelText('Note')).toHaveValue(7);
});

```

Altri tre test nello stesso file, sul modello dei primi tre (fake API con la funzione
spiata, azione dell'utente, chiamata attesa, valore della risposta a schermo), con le
etichette accessibili dei dizionari copiate dal prototipo:

- **regole:** scegliere il modello «almeno una volta» con pesce e venerdì e confermare →
  `addRule` con `{ kind: 'at_least_one', group: 'fish', weekday: 4 }`; la regola compare;
  «Togli» → `removeRule` con lo stesso valore; la regola sparisce;
- **ingredienti:** scrivere «c» non chiama `searchIngredients`, «ce» sì; scegliere
  «Cetrioli», poi «Limita» con massimo 1 → `setIngredientRestriction` con
  `{ restriction: 'limit', weeklyMax: 1 }`; la riga mostra «al massimo 1 volta la settimana»;
- **unità e fuso:** scegliere «Imperiale britannico» → `setMeasurementSystem`; una lettura
  del menu della stessa famiglia nella cache risulta invalidata, una di un'altra no;
  scegliere `Europe/London` → `setTimeZone`, stessa verifica.

- [ ] **Step 2: Implementazione**

Riscrivere in React `prototype/src/routes/profile/family/settings/+page.svelte` e i
componenti `prototype/src/lib/components/DinersGrid.svelte`, `MealRules.svelte`,
`IngredientRestrictions.svelte`, `Stepper.svelte`, con questi cambiamenti rispetto al
prototipo:

- ogni gesto chiama la sua operazione (`setMeal`, `addRule`, `removeRule`, `setKnownNew`,
  `setGroupRange`, `setBookOwned`, `setIngredientRestriction`, `rename`,
  `setMeasurementSystem`, `setTimeZone`); le regole si tolgono passando il valore, non un id;
- un controllo in attesa resta sul valore inviato ed è disattivato fino alla risposta;
- ogni gesto passa da `useAreaMutation('family.<operazione>', familyId)`: cosa si
  scrive e cosa scade lo decide `INVALIDATIONS` (Task 12), non la pagina;
- fuso: `select` con `Intl.supportedValuesOf('timeZone')` nella scheda delle unità;
- «Avanzate» in un `<details>` chiuso;
- nessun «Elimina la famiglia» (ondata 3);
- offline: campi disattivati e avviso «Le impostazioni si cambiano online».

- [ ] **Step 3: Verifica**

Run: `npm test -w web && npm run typecheck -w web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "Web: impostazioni della famiglia"
```

---

### Task 15: «Non proporre più» nel web e prova visiva

**Files:**
- Create: `web/src/routes/profile/ExclusionsPage.tsx`, test accanto
- Modify: `web/src/router.tsx`, `web/src/i18n/messages/family.ts`

**Interfaces:**
- Consumes: `exclusionsQuery`, `useAreaMutation` (Task 12), `family.removeExclusion`.
- Produces: rotta `/profile/family/exclusions`.

- [ ] **Step 1: Test che falliscono**

```tsx
it('lists exclusions with author or former member, and brings one back', async () => {
	const removeExclusion = vi.fn(async () => []);
	render(<ExclusionsPage />, { api: fakeApi({ family: { listExclusions: exclusionsRead([
		{ recipe: { id: 'r1', name: 'Pasta al pomodoro' }, reason: null, createdByName: 'Anna', createdAt: '2026-10-01T10:00:00Z' },
		{ recipe: { id: 'r2', name: 'Zuppa' }, reason: null, createdByName: null, createdAt: '2026-09-01T10:00:00Z' },
	]), removeExclusion } }) });
	expect(await screen.findByText('Anna')).toBeInTheDocument();
	expect(screen.getByText('ex membro')).toBeInTheDocument();
	await userEvent.click(screen.getAllByRole('button', { name: 'Riproponi' })[0]!);
	expect(removeExclusion).toHaveBeenCalledWith(expect.objectContaining({ recipeId: 'r1' }));
	expect(await screen.findByText('Nessuna ricetta esclusa.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implementazione**

Riscrivere `prototype/src/routes/profile/family/exclusions/+page.svelte` in React, con
«Riproponi» che chiama `family.removeExclusion` e scrive la lista restituita
tramite `useAreaMutation('family.removeExclusion', familyId)` (nessun'altra lettura
scade: la revisione dei pasti legge le esclusioni dal server).

- [ ] **Step 3: Prova visiva**

Con la skill agent-browser (e `caffeinate -d` attivo, vedi le note del progetto), app
locale con lo stack Supabase locale (`supabase start` come nel README di `supabase/`) e
utenti del seed (`anna@example.test` amministratrice, `bruno@example.test` membro,
password `password123`): aprire a larghezza di telefono `/profile`,
`/profile/preferences`, `/profile/family`, `/profile/family/settings`,
`/profile/family/exclusions`, in italiano e in inglese, come amministratrice e come
membro; screenshot confrontati con `design/index.html` e con le stesse pagine del
prototipo. Annotare le differenze e correggerle prima del commit.

- [ ] **Step 4: Verifica completa**

Run: `npm run typecheck && npm test && supabase test db`
Expected: tutto PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "Web: «Non proporre più» e prova visiva del Profilo"
```

---

## Ordine ed esecuzione

I Task 1-10 non dipendono dal web e si eseguono subito, in ordine (il contratto cresce
area per area). I Task 11-15 partono quando la seconda PR di W5 (client oRPC reale) è su
`main`, dopo un rebase; se non lo è, il worker si ferma con `STATO: DOMANDA`. Poi PR
verso `main` secondo il protocollo dei worker.
