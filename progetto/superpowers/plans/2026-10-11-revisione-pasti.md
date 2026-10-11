# Revisione dei pasti: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** area `meals` (suggerimenti, porzioni, ricetta, pasto libero, nota, scambio,
annullamento) con migrazione delle azioni, server, MCP e schermate del Menu, in due PR che
passano ciascuna da sola i controlli di `main`.

**Architecture:** ogni scrittura è un'azione con id dal client, registrata in
`app.meal_actions` anche senza effetti; le righe di `meal_changes` di un'azione portano
`action_id` e `meal_slots.last_action_id` indica l'ultima azione di ogni slot, scritta sotto
il lucchetto. Il database rende veritiero il registro e, su quella base, ammette lo
spostamento e il ripristino delle bozze importate. I suggerimenti sono una funzione pura del
pianificatore sulla stessa logica della generazione. Il web applica la risposta alla vista
della settimana senza aggiornamenti ottimistici.

**Tech Stack:** TypeScript, zod, oRPC, Postgres.js, Postgres 17 con pgTAP (Supabase),
Vitest, React con TanStack Query e Router, Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-11-revisione-pasti.md` (subordinata a
`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 2, 3, 5, 12, 13).

## Global Constraints

- Codice, identificatori, commenti e test in inglese; documenti e commit in italiano; testi
  dell'interfaccia in italiano e inglese britannico; note e testi liberi come scritti.
- Nessuna dipendenza nuova. Una sola migrazione nuova:
  `supabase/migrations/20261012100000_meal_actions.sql`, con
  `supabase/tests/meal_actions_test.sql`. Migrazioni e test pgTAP già uniti non si toccano.
- Porzioni 1-20; testo libero 1-60 caratteri dopo il trim; nota fino a 200, vuota → `null`;
  5 suggerimenti per pagina; al massimo 4 proposte rapide.
- Scritture: `role: 'familyMember'`, `mcp: { readOnly: false }`, `offline: false`,
  `creates: true`, `id` uuid = id dell'azione. `getSuggestions` non versionata.
- Contenuto di uno slot nel registro: esattamente `{ recipeId, freeText, servings, note }`.
- Ordine nel server: blocco degli slot → ripetizione → controlli del contenuto → azione →
  righe di `meal_changes` di tutti gli slot → `update` degli slot con `last_action_id` e
  `updated_at = clock_timestamp()`.
- Annullamento: solo azioni proprie, solo se ogni slot cambiato ha ancora
  `last_action_id` = azione; scambio sempre per intero; nessun limite di tempo né sui pasti
  passati; bozza chiusa → `draft_closed`.
- Web: nessun aggiornamento ottimistico; modifiche impossibili offline; «Annulla» 6 s;
  porzioni salvate 800 ms dopo l'ultimo tocco, mai dentro un aggiornamento di stato.
- Etichette «Cambia ricetta» / «Change recipe», «Non proporre più» / «Don’t suggest again»
  identiche a quelle di `exclusions.emptyBody`.
- File condivisi toccati solo per registrare l'area o per i ritocchi elencati nei task:
  `contract/src/contract.ts`, `contract/src/index.ts`, `contract/src/errors.ts`,
  `server/src/router.ts`, `server/src/messages.ts`, `web/src/api/types.ts`,
  `web/src/api/mutations.ts`, `web/src/api/ratings.ts`, `web/src/api/fake/fakeApi.ts`,
  `web/src/i18n/messages/index.ts`, `web/src/i18n/messages/errors.ts`,
  `web/src/i18n/messages/menu.ts`, `web/src/components/RecipeCard.tsx`,
  `web/src/components/RatingStars.tsx`, `web/src/components/Icon.tsx`,
  `web/src/routes/MenuPage.tsx`, `web/src/test/rpcServer.ts`, `web/src/test/renderApp.tsx`.
- Ogni PR passa `supabase test db`, `npm run typecheck`, `npm test` da sola.

## Review Focus

1. **Richiesta ripetuta dopo che un altro membro ha cambiato il pasto** (ritentativo di
   rete): non deve sovrascrivere, anche se la prima volta non aveva effetti. Test nel Task 4.
2. **Scambio fra una bozza importata e una ricetta nei due ordini di id**, due bozze che
   si scambiano, poi annullamento: tutto riesce senza aprire bozze ad altre famiglie. Test
   nei Task 1 e 5.
3. **Agente in una conversazione nuova che chiede «annulla la mia ultima modifica»**:
   ricava tutto da `menu_getWeek`. Test nei Task 6 e 8.
4. **Transazione iniziata prima e bloccata sul lucchetto che salva dopo un'altra**: l'ultima
   modifica e l'annullabilità seguono l'ordine reale. Test nel Task 6.
5. **Porzioni regolate e poi pannello chiuso, scheda smontata o rete persa prima
   dell'invio**: una sola richiesta o nessuna, mai valori persi in silenzio. Test nel
   Task 11.

## Struttura dei file

**Prima PR (server), branch `traguardo/revisione-pasti`:**

| File | Responsabilità |
|---|---|
| `supabase/migrations/20261012100000_meal_actions.sql`, `supabase/tests/meal_actions_test.sql` | azioni, colonne, regole del registro e delle bozze, `recipe_draft_is_open` |
| `domain/src/planner/constraints.ts`, `prepared.ts`, `types.ts` | `excludeIds`, `fixedRecipes` |
| `domain/src/planner/suggest.ts` (+ test) | `rankSuggestions` |
| `contract/src/errors.ts` | motivi nuovi |
| `contract/src/menu/views.ts`, `server/src/menu/week-view.ts` | `lastChange` esteso |
| `server/src/menu/generation.ts` | `fixedRecipes` in `loadPlannerInput` |
| `contract/src/meals/*` | area `meals` |
| `server/src/meals/slots.ts`, `actions.ts`, `suggestions.ts`, `router.ts` | server dell'area |
| `server/test/support/meals.ts`, `server/test/meals/*.test.ts` | test |
| `web/src/api/fake/fakeApi.ts`, `web/src/components/RecipeCard.test.tsx`, `web/src/i18n/messages/errors.ts` | ritocchi richiesti dal typecheck e testo generico |

**Seconda PR (web), branch `traguardo/revisione-pasti-web` da `main` dopo il merge della
prima (nome da confermare con il coordinatore):**

| File | Responsabilità |
|---|---|
| `web/src/api/fake/fakeMeals.ts` (+ test) | client finto dell'area |
| `web/src/features/meals/queries.ts`, `useMealMutation.ts` | lettura e invio |
| `web/src/features/meals/useServingsDraft.ts` | porzioni con salvataggio differito |
| `web/src/features/meals/MealActions.tsx`, `MealEditor.tsx`, `RecipePicker.tsx`, `SwapPicker.tsx`, `FreeMealForm.tsx`, `NoteForm.tsx` | pannello e foglio |
| `web/src/features/meals/UndoProvider.tsx`, `UndoToast.tsx`, `useMealErrors.ts` | «Annulla» ed errori |
| `web/src/features/meals/meals.module.css`, `web/src/i18n/messages/meals.ts` | stili e testi |
| `web/src/features/meals/testApp.tsx`, `*.test.tsx` | test |

---

## Prima PR: migrazione, dominio, contratto, server, MCP

### Task 1: migrazione delle azioni

**Files:**
- Create: `supabase/migrations/20261012100000_meal_actions.sql`
- Create: `supabase/tests/meal_actions_test.sql`

**Interfaces:**
- Consumes: `app.weeks`, `app.meal_slots`, `app.meal_changes`, `app.recipes`,
  `app.recipe_drafts`, `app.can_access_week`; fixture pgTAP (`supabase/tests/helpers/fixtures.psql`):
  Rossi (Anna admin, Bruno), slot `c0c0…0001` pranzo con la pasta pubblicata, slot
  `c0c0…0002` cena con la bozza `test-new-draft` (unica citazione, bozza aperta); Verdi
  (Franco), slot `c0c0…0003`; helper `tests.login`, `tests.uid`, `tests.week`,
  `tests.recipe`, `tests.affected`.
- Produces: tabella `app.meal_actions(id, week_id, actor_id, channel, kind, slot_ids, undoes, created_at)`;
  colonne `meal_changes.action_id`, `meal_slots.last_action_id`; trigger
  `app.check_meal_change()`, `app.check_meal_slot_last_action()`; `app.check_meal_slot_recipe()`
  sostituita; funzione `app.recipe_draft_is_open(uuid) returns boolean` per i membri.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/meal_actions_test.sql
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Truthful content of a slot, as the server writes it in meal_changes.
create function tests.content(p_slot uuid) returns jsonb language sql as $$
	select jsonb_build_object('recipeId', recipe_id, 'freeText', free_text, 'servings', servings, 'note', note)
	from app.meal_slots where id = p_slot
$$;
grant execute on function tests.content(uuid) to authenticated;

-- Two more drafts (owner): B cited by a new Rossi slot, C cited by nobody.
insert into app.recipes (slug, name) values ('test-draft-b', '{"it-IT": "Bozza B", "en-GB": null}'), ('test-draft-c', '{"it-IT": "Bozza C", "en-GB": null}');
insert into app.recipe_drafts (recipe_id, kind, content, revision, created_by, updated_by)
	select id, 'new', '{}', 1, tests.uid('anna'), tests.uid('anna') from app.recipes where slug in ('test-draft-b', 'test-draft-c');
insert into app.meal_slots (id, week_id, date, meal_type, recipe_id, servings)
	values ('c0c0c0c0-0000-4000-8000-0000000000b0', tests.week('Rossi'), '2026-10-13', 'lunch', tests.recipe('draft-b'), 2);

\set lunch '''c0c0c0c0-0000-4000-8000-000000000001'''
\set dinner '''c0c0c0c0-0000-4000-8000-000000000002'''
\set slotb '''c0c0c0c0-0000-4000-8000-0000000000b0'''
\set verdi '''c0c0c0c0-0000-4000-8000-000000000003'''

-- A swap where the slot holding the draft is updated FIRST: rule (b).
reset role;
select tests.login('anna');
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000001', %L, tests.uid('anna'), 'web', 'swap', array[%s, %s]::uuid[])$$,
	tests.week('Rossi'), :dinner, :lunch), 'member records an action on two slots of the week');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%s, tests.uid('anna'), 'web', tests.content(%s), tests.content(%s), 'e0000000-0000-4000-8000-000000000001'),
	       (%s, tests.uid('anna'), 'web', tests.content(%s), tests.content(%s), 'e0000000-0000-4000-8000-000000000001')$$,
	:dinner, :dinner, :lunch, :lunch, :lunch, :dinner), 'truthful rows of the swap, before any update');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000001',
	updated_by = tests.uid('anna'), updated_at = clock_timestamp() where id = %s$$, tests.recipe('pasta-al-pomodoro'), :dinner)),
	1::bigint, 'the draft slot takes the pasta first: its last citation goes away');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000001',
	updated_by = tests.uid('anna'), updated_at = clock_timestamp() where id = %s$$, tests.recipe('new-draft'), :lunch)),
	1::bigint, 'rule (b): the draft moves within the same action');

-- Undo of the swap, both slots: rule (c) brings the draft back to the dinner.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
	values ('e0000000-0000-4000-8000-000000000002', %L, tests.uid('anna'), 'web', 'undo', array[%s, %s]::uuid[], 'e0000000-0000-4000-8000-000000000001')$$,
	tests.week('Rossi'), :lunch, :dinner), 'undo action');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
	select c.meal_slot_id, tests.uid('anna'), 'web', tests.content(c.meal_slot_id), c.before, c.id, 'e0000000-0000-4000-8000-000000000002'
	from app.meal_changes c where c.action_id = 'e0000000-0000-4000-8000-000000000001'$$, 'undo rows point to the undone rows');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000002'
	where id = %s$$, tests.recipe('pasta-al-pomodoro'), :lunch)), 1::bigint, 'lunch back to the pasta');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000002'
	where id = %s$$, tests.recipe('new-draft'), :dinner)), 1::bigint, 'rule (c): dinner back to the draft');

-- Two drafts swapping (dinner: new-draft, slot B: draft-b), the dinner updated first.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000005', %L, tests.uid('anna'), 'web', 'swap', array[%s, %s]::uuid[])$$,
	tests.week('Rossi'), :dinner, :slotb), 'swap of two drafts');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%s, tests.uid('anna'), 'web', tests.content(%s), tests.content(%s), 'e0000000-0000-4000-8000-000000000005'),
	       (%s, tests.uid('anna'), 'web', tests.content(%s), tests.content(%s), 'e0000000-0000-4000-8000-000000000005')$$,
	:dinner, :dinner, :slotb, :slotb, :slotb, :dinner), 'rows of the two-draft swap');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000005' where id = %s$$,
	tests.recipe('draft-b'), :dinner)), 1::bigint, 'draft B reaches the dinner');
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000005' where id = %s$$,
	tests.recipe('new-draft'), :slotb)), 1::bigint, 'the first draft reaches slot B');

-- Free meal on the last citation of draft B, then undo: rule (c); refused once the draft is closed.
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values ('e0000000-0000-4000-8000-000000000003', %L, tests.uid('anna'), 'web', 'set_free', array[%s]::uuid[])$$, tests.week('Rossi'), :dinner), 'set_free action');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%s, tests.uid('anna'), 'web', tests.content(%s), tests.content(%s) || '{"recipeId": null, "freeText": "Fuori"}', 'e0000000-0000-4000-8000-000000000003')$$,
	:dinner, :dinner, :dinner), 'set_free row');
select is(tests.affected(format($$update app.meal_slots set recipe_id = null, free_text = 'Fuori', last_action_id = 'e0000000-0000-4000-8000-000000000003'
	where id = %s$$, :dinner)), 1::bigint, 'the last citation of draft B goes away');
select lives_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
	values ('e0000000-0000-4000-8000-000000000004', %L, tests.uid('anna'), 'web', 'undo', array[%s]::uuid[], 'e0000000-0000-4000-8000-000000000003')$$,
	tests.week('Rossi'), :dinner), 'undo of the free meal');
select lives_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
	select %s, tests.uid('anna'), 'web', tests.content(%s), c.before, c.id, 'e0000000-0000-4000-8000-000000000004'
	from app.meal_changes c where c.action_id = 'e0000000-0000-4000-8000-000000000003'$$, :dinner, :dinner), 'undo row');
select is(app.recipe_draft_is_open(tests.recipe('draft-b')), true, 'members learn that the draft their log cites is open');
savepoint closed;
reset role;
update app.recipe_drafts set closed_at = now(), outcome = 'discarded' where recipe_id = tests.recipe('draft-b');
select tests.login('anna');
select is(app.recipe_draft_is_open(tests.recipe('draft-b')), false, 'and that it is closed');
select throws_ok(format($$update app.meal_slots set recipe_id = %L, free_text = null, last_action_id = 'e0000000-0000-4000-8000-000000000004'
	where id = %s$$, tests.recipe('draft-b'), :dinner), '42501', null, 'a closed draft does not come back');
rollback to savepoint closed;
select is(tests.affected(format($$update app.meal_slots set recipe_id = %L, free_text = null, last_action_id = 'e0000000-0000-4000-8000-000000000004'
	where id = %s$$, tests.recipe('draft-b'), :dinner)), 1::bigint, 'an open draft comes back with the undo');

-- Without evidence, an uncited draft is still refused, whatever the action.
select throws_ok(format($$update app.meal_slots set recipe_id = %L, last_action_id = 'e0000000-0000-4000-8000-000000000004' where id = %s$$,
	tests.recipe('draft-c'), :dinner), '42501', null, 'an uncited draft never reaches a meal');

-- The change log cannot lie, and actions cannot point elsewhere.
select throws_ok(format($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id)
	values (%s, tests.uid('anna'), 'web', '{"recipeId": null, "freeText": null, "servings": 9, "note": null}', '{}', 'e0000000-0000-4000-8000-000000000001')$$, :lunch),
	'42501', null, 'a before that is not the slot''s content is refused');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000003' where id = %s$$, :lunch),
	'42501', null, 'last_action_id of an action that did not change the slot');
select throws_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values (gen_random_uuid(), %L, tests.uid('anna'), 'web', 'set_note', array[%s]::uuid[])$$, tests.week('Rossi'), :verdi),
	'42501', null, 'an action with a slot of another family');
select throws_ok(format($$insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids)
	values (gen_random_uuid(), %L, tests.uid('bruno'), 'web', 'set_note', array[%s]::uuid[])$$, tests.week('Rossi'), :lunch),
	'42501', null, 'only as oneself');
select throws_ok($$update app.meal_actions set kind = 'swap'$$, '42501', null, 'actions are never changed');
select throws_ok($$delete from app.meal_actions$$, '42501', null, 'actions are never deleted');
select lives_ok($$insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after)
	values ('c0c0c0c0-0000-4000-8000-000000000001', tests.uid('anna'), 'web', '{}', '{}')$$, 'rows without an action stay as before (no evidence)');

-- Another member cannot use Anna's action; another family cannot see or use it.
reset role;
select tests.login('bruno');
select is((select count(*) from app.meal_actions), 5::bigint, 'Bruno reads the family''s actions');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000001' where id = %s$$, :lunch),
	'42501', null, 'Bruno cannot claim Anna''s action');
reset role;
select tests.login('franco');
select is((select count(*) from app.meal_actions), 0::bigint, 'Franco sees no Rossi actions');
select is(app.recipe_draft_is_open(tests.recipe('new-draft')), false, 'Franco learns nothing about a Rossi draft');
select throws_ok(format($$update app.meal_slots set last_action_id = 'e0000000-0000-4000-8000-000000000001' where id = %s$$, :verdi),
	'23503', null, 'an action of another week is refused by the foreign key');

select * from finish();
rollback;
```

(`update` and `delete` without grants raise `42501`, as for the immutable log in
`meals_test.sql`.)

- [ ] **Step 2: Run** `supabase test db` — Expected: FAIL (`relation "app.meal_actions" does not exist`).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261012100000_meal_actions.sql
-- Revision of the meals (W1, wave 2): every write is an action with a client id, one row per
-- request, never changed. The meal_changes rows of an action carry its id; each slot points
-- to the last action that changed it, written under the row lock: the real order of the
-- serialised writes. Spec of the revision, section 3.

create table app.meal_actions (
	id uuid primary key,
	week_id uuid not null references app.weeks (id) on delete cascade,
	actor_id uuid references auth.users (id) on delete set null,
	channel text not null check (channel in ('web', 'mcp')),
	kind text not null check (kind in ('set_servings', 'set_recipe', 'set_free', 'set_note', 'swap', 'undo')),
	slot_ids uuid[] not null check (cardinality(slot_ids) between 1 and 2),
	undoes uuid,
	created_at timestamptz not null default clock_timestamp(),
	unique (id, week_id),
	foreign key (undoes, week_id) references app.meal_actions (id, week_id) on delete cascade,
	check ((kind = 'undo') = (undoes is not null))
);
create index meal_actions_week on app.meal_actions (week_id);

alter table app.meal_changes add column action_id uuid references app.meal_actions (id) on delete cascade;
create index meal_changes_action on app.meal_changes (action_id);
-- The moment of the save, after the lock: not the start of the transaction.
alter table app.meal_changes alter column created_at set default clock_timestamp();

alter table app.meal_slots add column last_action_id uuid;
alter table app.meal_slots add constraint meal_slots_last_action
	foreign key (last_action_id, week_id) references app.meal_actions (id, week_id) on delete set null (last_action_id);

alter table app.meal_actions enable row level security;
grant select, insert on app.meal_actions to authenticated;
grant update (last_action_id) on app.meal_slots to authenticated;

create policy meal_actions_read on app.meal_actions for select to authenticated
	using (app.can_access_week(week_id));
create policy meal_actions_insert on app.meal_actions for insert to authenticated
	with check (
		actor_id = (select auth.uid())
		and app.can_access_week(week_id)
		and not exists (
			select 1 from unnest(slot_ids) x (id)
			where not exists (select 1 from app.meal_slots s where s.id = x.id and s.week_id = meal_actions.week_id)
		)
	);

-- Rule 1: a change of an action states the slot's real content as `before`, belongs to the
-- user's action on that slot, and an undo row points to a row of the undone action. Rows
-- without an action (import, older tests) stay as before and prove nothing to rule 3.
-- Security invoker: the user's RLS applies; another family's slot is simply not found.
create function app.check_meal_change()
returns trigger language plpgsql set search_path = '' as $$
declare
	v_action app.meal_actions;
	v_content jsonb;
begin
	if new.action_id is null then
		return new;
	end if;
	select * into v_action from app.meal_actions where id = new.action_id;
	select jsonb_build_object('recipeId', recipe_id, 'freeText', free_text, 'servings', servings, 'note', note)
		into v_content from app.meal_slots where id = new.meal_slot_id;
	if v_action.id is null or v_content is null
		or v_action.actor_id is distinct from auth.uid()
		or not (new.meal_slot_id = any (v_action.slot_ids))
		or new.before is distinct from v_content
		or (new.undoes is null) <> (v_action.undoes is null)
		or (new.undoes is not null and not exists (
			select 1 from app.meal_changes c where c.id = new.undoes and c.action_id = v_action.undoes))
	then
		raise exception 'meal change does not match its action or the meal' using errcode = '42501';
	end if;
	return new;
end;
$$;
create trigger meal_changes_check before insert on app.meal_changes
	for each row when (current_user = 'authenticated') execute function app.check_meal_change();

-- Rule 2: the last action of a slot is one of the user's actions that changed it.
create function app.check_meal_slot_last_action()
returns trigger language plpgsql set search_path = '' as $$
begin
	if new.last_action_id is not null and not exists (
		select 1 from app.meal_actions a join app.meal_changes c on c.action_id = a.id and c.meal_slot_id = new.id
		where a.id = new.last_action_id and a.actor_id = auth.uid() and new.id = any (a.slot_ids)
	) then
		raise exception 'last action % did not change meal %', new.last_action_id, new.id using errcode = '42501';
	end if;
	return new;
end;
$$;
create trigger meal_slots_check_last_action before update of last_action_id on app.meal_slots
	for each row when (current_user = 'authenticated' and new.last_action_id is distinct from old.last_action_id)
	execute function app.check_meal_slot_last_action();

-- Rule 3: a never-published recipe reaches a meal of a user only (a) when another slot of the
-- family cites it (unchanged), or, while its draft is open, (b) when the same action moves it
-- from another slot of the week or (c) when the action undoes a change of this slot that took
-- it away. The evidence is the change log of the action in progress, truthful by rule 1.
create or replace function app.check_meal_slot_recipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	if app.can_access_week(new.week_id)
		and exists (select 1 from app.recipes r where r.id = new.recipe_id and r.status = 'draft')
		and not exists (
			select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id
			where s.recipe_id = new.recipe_id and s.id <> new.id
				and w.family_id = (select family_id from app.weeks where id = new.week_id)
		)
		and not (
			new.last_action_id is not null
			and exists (select 1 from app.recipe_drafts d where d.recipe_id = new.recipe_id and d.closed_at is null)
			and exists (
				select 1 from app.meal_actions a
				where a.id = new.last_action_id and a.actor_id = auth.uid() and a.week_id = new.week_id
			)
			and (
				exists (
					select 1 from app.meal_changes c join app.meal_slots o on o.id = c.meal_slot_id
					where c.action_id = new.last_action_id and c.meal_slot_id <> new.id and o.week_id = new.week_id
						and c.before ->> 'recipeId' = new.recipe_id::text
				)
				or exists (
					select 1 from app.meal_changes u join app.meal_changes c on c.id = u.undoes and c.meal_slot_id = new.id
					where u.action_id = new.last_action_id and u.meal_slot_id = new.id
						and c.before ->> 'recipeId' = new.recipe_id::text
				)
			)
		)
	then
		raise exception 'recipe % cannot be linked to a meal', new.recipe_id using errcode = '42501';
	end if;
	return new;
end;
$$;

-- Whether a never-published recipe that the user's family log cites still has an open draft
-- (undo of a meal): a boolean only, false for recipes the family never cited. Members cannot
-- read recipe_drafts.
create function app.recipe_draft_is_open(p_recipe_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
	select exists (select 1 from app.recipe_drafts d where d.recipe_id = p_recipe_id and d.closed_at is null)
		and exists (
			select 1 from app.meal_changes c join app.meal_slots s on s.id = c.meal_slot_id
			where c.before ->> 'recipeId' = p_recipe_id::text and app.can_access_week(s.week_id)
		);
$$;

revoke execute on function app.check_meal_change(), app.check_meal_slot_last_action(), app.recipe_draft_is_open(uuid) from public;
grant execute on function app.recipe_draft_is_open(uuid) to authenticated;
```

(`app.check_meal_slot_recipe` keeps its grants with `create or replace`; the triggers
`meal_slots_check_recipe_insert/update` already call it. `app.recipe_draft_is_open` checks
`can_access_week` inside: the definer reads every family, the answer only covers the
caller's.)

- [ ] **Step 4: Run** `supabase test db` — Expected: PASS, every existing file included
  (`meals_test.sql` and `versions_test.sql` insert rows without `action_id`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261012100000_meal_actions.sql supabase/tests/meal_actions_test.sql
git commit -m "Schema: azioni della revisione dei pasti, registro veritiero e bozze spostabili o ripristinabili"
```

### Task 2: pianificatore, una logica per generazione e suggerimenti

**Files:**
- Modify: `domain/src/planner/types.ts` (`fixedRecipes`), `domain/src/planner/prepared.ts` (`byId`), `domain/src/planner/constraints.ts` (`excludeIds`)
- Create: `domain/src/planner/suggest.ts`, `domain/src/planner/suggest.test.ts`
- Modify: `domain/src/planner/index.ts`

**Interfaces:**
- Consumes: `candidatesFor`, `slotRefOf`, `prepared`, `buildContext`, `scoreCandidate`, `compareIds`, `withSortedCatalogue`, fixture `baseInput`, `recipe`.
- Produces:
  - `PlannerInput.fixedRecipes?: PlannerRecipe[]`;
  - `candidatesFor(slot: SlotRef, input: PlannerInput, weekRecipes: PlannerRecipe[], excludeIds?: ReadonlySet<string>): PlannerRecipe[]`;
  - `rankSuggestions(input: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[]`.

- [ ] **Step 1: Failing tests**

```ts
// domain/src/planner/suggest.test.ts
import { describe, expect, it } from 'vitest';
import { candidatesFor, hardViolations, slotRefOf } from './constraints.ts';
import { generateWeek } from './generate.ts';
import { rankSuggestions } from './suggest.ts';
import { baseInput, recipe } from './test-fixtures.ts';

const monday = '2026-10-12';
const slot = { date: '2026-10-14', mealType: 'lunch' as const };

describe('rankSuggestions', () => {
	it('gives the generation candidates of the slot, without the current recipe and the other meals of the week', () => {
		const input = baseInput({ weekStart: monday });
		const ranked = rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'dinner', recipeId: 'r01' }], 'r02');
		const expected = candidatesFor(slotRefOf(slot, input.settings), input, [input.recipes.find((r) => r.id === 'r01')!], new Set(['r02'])).map((r) => r.id);
		expect([...ranked].sort()).toEqual([...expected].sort());
		expect(ranked).not.toContain('r02');
		expect(ranked).not.toContain('r01');
	});

	it('falls back to low-rated alternatives when the current recipe was the only liked one', () => {
		const recipes = [recipe('liked'), recipe('low1'), recipe('low2')];
		const input = baseInput({ weekStart: monday, recipes, familyScores: { liked: 5, low1: 2, low2: 1 } });
		expect(rankSuggestions(input, slot, [], 'liked').sort()).toEqual(['low1', 'low2']);
	});

	it('counts an archived recipe already in the week against a weekly maximum', () => {
		const salmon = [{ ingredientId: 'salmon', isOptional: false }];
		const input = baseInput({
			weekStart: monday,
			recipes: [recipe('salmon-new', { ingredients: salmon }), recipe('plain')],
			fixedRecipes: [recipe('salmon-archived', { ingredients: salmon })],
			restrictions: [{ ingredientId: 'salmon', restriction: 'limit', weeklyMax: 1 }]
		});
		expect(rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'lunch', recipeId: 'salmon-archived' }], null)).toEqual(['plain']);
	});

	it('drops excluded recipes and respects the time limit of the slot', () => {
		const input = baseInput({ weekStart: monday, exclusions: ['r03'] });
		const ranked = rankSuggestions(input, { date: monday, mealType: 'dinner' }, [], null); // 20-minute limit
		expect(ranked).not.toContain('r03');
		for (const id of ranked) expect(input.recipes.find((r) => r.id === id)!.durationMinutes).toBeLessThanOrEqual(20);
	});

	it('orders by score, then id, the same every time', () => {
		const make = () => baseInput({ weekStart: monday, familyScores: { r05: 5 } });
		const first = rankSuggestions(make(), slot, [], null);
		expect(rankSuggestions(make(), slot, [], null)).toEqual(first);
		expect(first[0]).toBe('r05');
	});
});

describe('generation with fixed recipes', () => {
	it('stays valid and never plans a fixed recipe', () => {
		const input = baseInput({ weekStart: monday, fixedRecipes: [recipe('archived-1')], history: [{ date: '2026-10-08', mealType: 'dinner', recipeId: 'archived-1' }] });
		const week = generateWeek(input);
		expect(hardViolations(week, input)).toEqual([]);
		expect(week.slots.some((s) => s.content.kind === 'recipe' && s.content.recipeId === 'archived-1')).toBe(false);
	});
});
```

(`r05` in `syntheticCatalogue`: index 5 → `mealType: 'both'`, 40 minutes; Wednesday lunch
in `familySettings()` has no time limit.)

- [ ] **Step 2: Run** `npx vitest run domain/src/planner/suggest.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// domain/src/planner/types.ts, inside PlannerInput
	/** Recipes cited by meals but not proposable (archived): neighbours, history and weekly limits, never candidates. */
	fixedRecipes?: PlannerRecipe[];
```

```ts
// domain/src/planner/prepared.ts, in prepared(): fixed recipes first, the catalogue wins on the same id
	const byId = new Map([...(input.fixedRecipes ?? []), ...input.recipes].map((r) => [r.id, r]));
```

```ts
// domain/src/planner/constraints.ts
/** Recipes that can go in the slot given the rest of the week; low-rated ones only if nothing else fits. `excludeIds` leave before that choice. */
export function candidatesFor(slot: SlotRef, input: PlannerInput, weekRecipes: PlannerRecipe[], excludeIds?: ReadonlySet<string>): PlannerRecipe[] {
	const used = new Set(weekRecipes.map((r) => r.id));
	const recent = prepared(input).recentIds;
	const valid = input.recipes.filter(
		(r) =>
			!used.has(r.id) &&
			!excludeIds?.has(r.id) &&
			isAvailable(r, input) &&
			fitsSlot(r, slot, input.settings.rules) &&
			!recent.has(r.id) &&
			withinLimits(r, weekRecipes, input.restrictions)
	);
	const liked = valid.filter((r) => (input.familyScores[r.id] ?? Infinity) > LOW_SCORE);
	return liked.length > 0 ? liked : valid;
}
```

```ts
// domain/src/planner/suggest.ts
import { candidatesFor, slotRefOf } from './constraints.ts';
import { prepared } from './prepared.ts';
import { compareIds } from './random.ts';
import { withSortedCatalogue } from './repair.ts';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import type { PastMeal, PlannerInput, PlannerSlotRef } from './types.ts';

/**
 * Recipe ids for one slot, best first (spec section 3, «Riuso durante la revisione»): the
 * generation's candidates and score with the other meals of the week fixed (archived ones
 * included through fixedRecipes), the current recipe left out before the fallback on low
 * ratings. Deterministic: score, then id.
 */
export function rankSuggestions(rawInput: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[] {
	const input = withSortedCatalogue(rawInput);
	const { byId } = prepared(input);
	const placed: Placed[] = otherMeals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
	});
	const exclude = new Set(currentRecipeId ? [currentRecipeId] : []);
	const ctx = buildContext(input, placed);
	return candidatesFor(slotRefOf(slot, input.settings), input, placed.map((p) => p.recipe), exclude)
		.map((recipe) => ({ id: recipe.id, score: scoreCandidate(recipe, slot, ctx) }))
		.sort((a, b) => b.score - a.score || compareIds(a.id, b.id))
		.map((r) => r.id);
}
```

`domain/src/planner/index.ts`: `export * from './suggest.ts';`. `withSortedCatalogue`
(`repair.ts:101`) spreads the input, so `fixedRecipes` passes through; if it rebuilds the
object field by field, add `fixedRecipes`.

- [ ] **Step 4: Run** `npx vitest run domain && npm run typecheck` — Expected: PASS, every existing planner test green.

- [ ] **Step 5: Commit**

```bash
git add domain/src/planner
git commit -m "Pianificatore: suggerimenti con gli altri pasti fissati, ricette archiviate nella stessa logica"
```

### Task 3: motivi di `not_allowed` e ultima azione nella vista del pasto

**Files:**
- Modify: `contract/src/errors.ts`, `contract/src/errors.test.ts`, `server/src/messages.ts`, `web/src/i18n/messages/errors.ts`
- Modify: `contract/src/menu/views.ts`, `server/src/menu/week-view.ts`, `server/test/menu/week.test.ts`
- Modify (typecheck): `web/src/api/fake/fakeApi.ts:204`, `web/src/components/RecipeCard.test.tsx:49`

**Interfaces:**
- Produces: `NotAllowedReason` with `not_own_change | changed_since | draft_closed`;
  `MealView['lastChange'] = { userName: string | null; at: string; actionId: string | null; undoable: boolean; slotIds: string[] } | null`.

- [ ] **Step 1: Failing tests**

```ts
// contract/src/errors.test.ts (added)
it('not_allowed carries the reasons of the meal undo', () => {
	for (const reason of ['not_own_change', 'changed_since', 'draft_closed']) expect(notAllowedData.parse({ reason })).toEqual({ reason });
});
```

```ts
// server/test/menu/week.test.ts: lines 87-88 become
expect(on(meals, '2026-01-15').lastChange).toEqual({
	userName: null, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), actionId: null, undoable: false, slotIds: [],
});
expect(on(meals, '2026-01-16').lastChange).toMatchObject({ userName: expect.any(String), actionId: null, undoable: false });
```

New test in the same file (same fixtures and `db.admin` as the file's other tests):

```ts
it('shows the last action and whether the reader can undo it', async () => {
	// Owner writes as the server would: action, truthful row, slot pointer.
	const actionId = crypto.randomUUID();
	const [slot] = await db.admin<{ id: string; week_id: string }[]>`select id, week_id from app.meal_slots where week_id = ${weekId} order by date, meal_type limit 1`;
	await db.admin`insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids) values (${actionId}, ${slot!.week_id}, ${member.userId}, 'web', 'set_note', array[${slot!.id}]::uuid[])`;
	await db.admin`insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, action_id) values (${slot!.id}, ${member.userId}, 'web', '{}', '{}', ${actionId})`;
	await db.admin`update app.meal_slots set note = 'x', updated_by = ${member.userId}, last_action_id = ${actionId} where id = ${slot!.id}`;
	const mine = await readWeek(member);
	expect(mealOf(mine, slot!.id).lastChange).toMatchObject({ actionId, undoable: true, slotIds: [slot!.id] });
	const theirs = await readWeek(other);
	expect(mealOf(theirs, slot!.id).lastChange).toMatchObject({ actionId, undoable: false });
});
```

Use the file's existing names for the reader helpers (`member`, `other`, `weekId`, the read
function and the meal lookup); add `other` (a second member of the same family) to its
setup if it has only one.

- [ ] **Step 2: Run** `npx vitest run contract server/test/menu/week.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// contract/src/errors.ts
/** A rule of state, not wrong data: catalogue states and meal undos that are no longer possible. */
export const notAllowedData = z.object({
	reason: z.enum(['cited_by_meals', 'not_published', 'already_current', 'not_own_change', 'changed_since', 'draft_closed']),
});
```

`server/src/messages.ts`, `not_allowed`: «Operazione non consentita nello stato attuale.» /
«This operation is not allowed in the current state.» `web/src/i18n/messages/errors.ts`,
`errors.not_allowed`: «Non si può fare nello stato attuale.» / «This cannot be done in the
current state.»

```ts
// contract/src/menu/views.ts, in mealView
	/** userName null: the author is no longer a member. actionId: the action that made the change (null before actions existed). */
	lastChange: z
		.object({
			userName: z.string().nullable(),
			at: localDateTimeSchema,
			actionId: z.uuid().nullable(),
			/** For the reader: their own action, still the last one of every slot it changed (meals.undo). */
			undoable: z.boolean(),
			/** Slots the action changed: two for a swap. */
			slotIds: z.array(z.uuid()),
		})
		.nullable(),
```

`server/src/menu/week-view.ts`:

```ts
// SlotRow gains
	actionId: string | null;
	actorId: string | null;
	stillLast: boolean;
	changedSlotIds: string[];
// select gains, after "authorName":
			s.last_action_id as "actionId",
			a.actor_id as "actorId",
			coalesce((select array_agg(c.meal_slot_id::text order by c.meal_slot_id) from app.meal_changes c where c.action_id = s.last_action_id), '{}') as "changedSlotIds",
			not exists (
				select 1 from app.meal_changes c join app.meal_slots o on o.id = c.meal_slot_id
				where c.action_id = s.last_action_id and o.last_action_id is distinct from s.last_action_id
			) as "stillLast"
// from gains:
		left join app.meal_actions a on a.id = s.last_action_id
// lastChange:
			lastChange: slot.changedAt
				? {
						userName: slot.authorName,
						at: slot.changedAt,
						actionId: slot.actionId,
						undoable: slot.actionId !== null && slot.actorId === context.userId && slot.stillLast,
						slotIds: slot.actionId ? slot.changedSlotIds : [],
					}
				: null,
```

Web, for the typecheck only:

```ts
// web/src/api/fake/fakeApi.ts:204
      lastChange: slot.updatedBy && slot.updatedAt ? { userName: author, at: slot.updatedAt, actionId: null, undoable: false, slotIds: [] } : null
```

```ts
// web/src/components/RecipeCard.test.tsx:49
lastChange={{ userName: null, at: '2026-10-01T20:40', actionId: null, undoable: false, slotIds: [] }}
```

- [ ] **Step 4: Run** `npm run typecheck && npx vitest run contract server/test/menu && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src/errors.ts contract/src/errors.test.ts contract/src/menu/views.ts server/src/messages.ts server/src/menu/week-view.ts server/test/menu/week.test.ts web/src
git commit -m "Menu: ultima azione del pasto nella vista, annullabile da chi legge; motivi nuovi di not_allowed"
```

### Task 4: area `meals`, scritture su un pasto

**Files:**
- Create: `contract/src/meals/views.ts`, `operations.ts`, `index.ts`, `meals-contract.test.ts`
- Modify: `contract/src/contract.ts`, `contract/src/index.ts`
- Create: `server/src/meals/slots.ts`, `server/src/meals/actions.ts`, `server/src/meals/router.ts`
- Modify: `server/src/router.ts`
- Create: `server/test/support/meals.ts`, `server/test/meals/writes.test.ts`

**Interfaces:**
- Consumes: `weekView`, `weekViewOf`, `appError`, `Implementer`, `OperationContext`,
  `menuFixtures`, `catalogueFixture`, `setupActors` (`Actors` has `db`, `keys`, `app`,
  `env`), `errorOf`, `rpcClient`.
- Produces:
  - `mealsContract.{setServings, setRecipe, setFree, setNote}`, `mealActionResult`, `type MealActionResult`;
  - `slots.ts`: `SlotRow`, `SlotContent`, `contentOf`, `sameContent`, `lockSlots(tx, familyId, ids): Promise<SlotRow[]>` (in the order asked), `readSlot(tx, familyId, id): Promise<SlotRow>`;
  - `actions.ts`: `type ActionKind`, `interface ActionRequest { id: string; kind: ActionKind; slots: SlotRow[]; undoes?: string }`, `interface Edit { slot: SlotRow; after: SlotContent; undoes?: string }`, `replay(context, familyId, request): Promise<MealActionResult | null>`, `perform(context, familyId, request, edits): Promise<MealActionResult>`;
  - `support/meals.ts`: `mealsSetup(actors)`, `mealOf(week: WeekView, slotId): MealView`, `agentClient(actors, actor)`.

- [ ] **Step 1: Contract test (failing)**

```ts
// contract/src/meals/meals-contract.test.ts
import { describe, expect, it } from 'vitest';
import { contract } from '../contract.ts';

const valid = (schema: unknown, value: unknown) =>
	!('issues' in ((schema as { '~standard': { validate(v: unknown): object } })['~standard'].validate(value) as object));

describe('meals contract', () => {
	it('declares member writes that create an action with a client id', () => {
		for (const name of ['setServings', 'setRecipe', 'setFree', 'setNote'] as const) {
			expect(contract.meals[name]['~orpc'].meta).toEqual({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
		}
	});
	it('validates the inputs', () => {
		const base = { familyId: crypto.randomUUID(), slotId: crypto.randomUUID(), id: crypto.randomUUID() };
		const input = (name: 'setServings' | 'setFree' | 'setNote') => contract.meals[name]['~orpc'].inputSchema;
		expect(valid(input('setServings'), { ...base, servings: 0 })).toBe(false);
		expect(valid(input('setServings'), { ...base, servings: 21 })).toBe(false);
		expect(valid(input('setServings'), { ...base, servings: 20 })).toBe(true);
		expect(valid(input('setFree'), { ...base, text: '   ' })).toBe(false);
		expect(valid(input('setFree'), { ...base, text: 'x'.repeat(61) })).toBe(false);
		expect(valid(input('setNote'), { ...base, note: 'x'.repeat(201) })).toBe(false);
		expect(valid(input('setNote'), { ...base, note: null })).toBe(true);
	});
});
```

`contract/src/contract.test.ts` already runs the contract checks (metadata on every
operation, `id` on creating ones): it covers the new area.

- [ ] **Step 2: Run** `npx vitest run contract/src/meals` — Expected: FAIL (`contract.meals` undefined).

- [ ] **Step 3: Contract**

```ts
// contract/src/meals/views.ts
import { z } from 'zod';
import { weekView } from '../menu/views.ts';

export const mealActionResult = z.object({
	week: weekView,
	/** The action of this request: the `id` sent. */
	actionId: z.uuid(),
	/** False when the request changed nothing (also when it repeats one that changed nothing). */
	changed: z.boolean(),
});
export type MealActionResult = z.infer<typeof mealActionResult>;
```

```ts
// contract/src/meals/operations.ts
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { mealActionResult } from './views.ts';

const slot = z.object({ familyId: z.uuid(), slotId: z.uuid() });
/** Every write is an action whose id comes from the client. */
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
const notFound = { not_found: errorDefinitions.not_found };
const idHint = '`id` is a new UUID for this action; repeating the same request changes nothing';

export const mealsContract = {
	setServings: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/servings', summary: `Set the servings of a meal (1-20). ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), servings: z.number().int().min(1).max(20) }))
		.output(mealActionResult),
	setRecipe: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/recipe', summary: `Put a published recipe in a meal, from the suggestions or a recipe search. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), recipeId: z.uuid() }))
		.output(mealActionResult),
	setFree: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/free-text', summary: `Mark a meal as free (eating out, pizza...) with a short text, kept as written; the note stays. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), text: z.string().trim().min(1).max(60) }))
		.output(mealActionResult),
	setNote: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/note', summary: `Write the note of a meal (up to 200 characters, kept as written, seen by the whole family) or remove it with null. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), note: z.string().trim().max(200).nullable() }))
		.output(mealActionResult),
};
```

```ts
// contract/src/meals/index.ts
export { mealsContract } from './operations.ts';
export * from './views.ts';
```

`contract/src/contract.ts`: `import { mealsContract } from './meals/index.ts';` and
`meals: mealsContract,` after `menu`. `contract/src/index.ts`: `export * from './meals/index.ts';`.

- [ ] **Step 4: Run** `npx vitest run contract` — Expected: PASS; `npm run typecheck` FAILS in `server/src/router.ts` (missing `meals`), fixed below.

- [ ] **Step 5: Test support**

```ts
// server/test/support/meals.ts
import type { Contract, MealView, WeekView } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type { Actor, Actors } from './actors.ts';
import { menuFixtures } from './menu.ts';
import { rpcClient } from './requests.ts';

export function mealOf(week: WeekView, slotId: string): MealView {
	const meal = week.days.flatMap((d) => d.meals).find((m) => m.slotId === slotId);
	if (!meal) throw new Error(`no meal ${slotId}`);
	return meal;
}

/** The same person through an agent: a token with client_id, so the channel is mcp. */
export async function agentClient(actors: Actors, actor: Actor): Promise<ContractRouterClient<Contract>> {
	const token = await actors.keys.sign({ sub: actor.userId, session_id: actor.sessionId, client_id: 'test-agent' });
	return rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token);
}

/** A family of two members with one week: a recipe lunch, a free dinner, an empty Tuesday lunch. */
export async function mealsSetup(actors: Actors) {
	const fx = menuFixtures(actors.db);
	const anna = await actors.user();
	const bruno = await actors.user();
	const familyId = await actors.db.createFamily([
		{ userId: anna.userId, role: 'family_admin' },
		{ userId: bruno.userId, role: 'member' },
	]);
	await actors.db.admin`update app.profiles set display_name = 'Anna' where user_id = ${anna.userId}`;
	await actors.db.admin`update app.profiles set display_name = 'Bruno' where user_id = ${bruno.userId}`;
	const recipes: string[] = [];
	for (let i = 0; i < 12; i++) recipes.push(await fx.publishRecipe());
	const weekStartsOn = '2026-10-12';
	const weekId = await fx.insertWeek(familyId, weekStartsOn);
	const slots = {
		monLunch: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId: recipes[0] }),
		monDinner: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'dinner', freeText: 'Pizza' }),
		tueLunch: await fx.insertSlot(weekId, { date: '2026-10-13', mealType: 'lunch' }),
	};
	const changes = (slotId: string) =>
		actors.db.admin<{ actor_id: string; channel: string; before: Record<string, unknown>; after: Record<string, unknown>; undoes: string | null; action_id: string | null }[]>`
			select actor_id, channel, before, after, undoes, action_id from app.meal_changes where meal_slot_id = ${slotId} order by created_at, id`;
	const slotRow = async (slotId: string) =>
		(await actors.db.admin<{ servings: number; note: string | null; recipe_id: string | null; free_text: string | null; last_action_id: string | null; updated_by: string | null }[]>`
			select servings, note, recipe_id, free_text, last_action_id, updated_by from app.meal_slots where id = ${slotId}`)[0]!;
	const action = async (id: string) =>
		(await actors.db.admin<{ kind: string; slot_ids: string[]; actor_id: string; channel: string }[]>`
			select kind, slot_ids::text[] as slot_ids, actor_id, channel from app.meal_actions where id = ${id}`)[0];
	const week = async (actor: Actor) => {
		const read = await actor.client.menu.getWeek({ familyId, weekStartsOn });
		if (read.unchanged) throw new Error('expected data');
		return read.data;
	};
	return { fx, anna, bruno, familyId, recipes, weekStartsOn, weekId, slots, changes, slotRow, action, week };
}
```

- [ ] **Step 6: Failing server tests**

```ts
// server/test/meals/writes.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { agentClient, mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal writes', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('sets servings: action, truthful change, slot pointer and author', async () => {
		const actionId = id();
		const result = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 5 });
		expect(result).toMatchObject({ actionId, changed: true });
		const meal = mealOf(result.week, s.slots.monLunch);
		expect(meal.servings).toBe(5);
		expect(meal.lastChange).toMatchObject({ userName: 'Anna', actionId, undoable: true, slotIds: [s.slots.monLunch] });
		expect(await s.action(actionId)).toMatchObject({ kind: 'set_servings', slot_ids: [s.slots.monLunch], actor_id: s.anna.userId, channel: 'web' });
		const [row] = await s.changes(s.slots.monLunch);
		expect(row).toMatchObject({ action_id: actionId, channel: 'web', undoes: null, before: { recipeId: s.recipes[0], freeText: null, servings: 2, note: null } });
		expect(row!.after).toEqual({ recipeId: s.recipes[0], freeText: null, servings: 5, note: null });
		expect(await s.slotRow(s.slots.monLunch)).toMatchObject({ last_action_id: actionId, updated_by: s.anna.userId });
	});

	it('records channel mcp for the same person through an agent', async () => {
		const agent = await agentClient(actors, s.anna);
		const actionId = id();
		await agent.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: actionId, note: 'from the agent' });
		expect((await s.action(actionId))!.channel).toBe('mcp');
		expect((await s.changes(s.slots.tueLunch)).at(-1)!.channel).toBe('mcp');
	});

	it('sets a recipe on an empty slot and a free text kept as written, with the note', async () => {
		await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'Senza glutine' });
		const withRecipe = await s.bruno.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), recipeId: s.recipes[3]! });
		expect(mealOf(withRecipe.week, s.slots.tueLunch)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[3] } });
		const free = await s.bruno.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), text: '  Cena da Zia Pina  ' });
		expect(mealOf(free.week, s.slots.tueLunch)).toMatchObject({ kind: 'free', freeText: 'Cena da Zia Pina', recipe: null, note: 'Senza glutine' });
	});

	it('turns an empty note into null', async () => {
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'x' });
		const result = await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: '   ' });
		expect(mealOf(result.week, s.slots.tueLunch).note).toBeNull();
	});

	it('remembers a request without effect; its retry after another change does not overwrite', async () => {
		const actionId = id();
		const first = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 2 });
		expect(first).toMatchObject({ actionId, changed: false });
		expect(await s.changes(s.slots.monLunch)).toHaveLength(0);
		expect(mealOf(first.week, s.slots.monLunch).lastChange).toBeNull();
		await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 6 });
		const retry = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 2 });
		expect(retry.changed).toBe(false);
		expect((await s.slotRow(s.slots.monLunch)).servings).toBe(6);
	});

	it('two identical requests at once write one action', async () => {
		const input = { familyId: s.familyId, slotId: s.slots.monDinner, id: id(), note: 'twice' };
		const [a, b] = await Promise.all([s.anna.client.meals.setNote(input), s.anna.client.meals.setNote(input)]);
		expect([a.changed, b.changed]).toEqual([true, true]);
		expect((await s.changes(s.slots.monDinner)).filter((r) => r.action_id === input.id)).toHaveLength(1);
	});

	it('repeats a completed setRecipe after the recipe was archived', async () => {
		const input = { familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId: s.recipes[5]! };
		await s.anna.client.meals.setRecipe(input);
		await catalogueFixture(actors.db).archive(s.recipes[5]!);
		expect(await s.anna.client.meals.setRecipe(input)).toMatchObject({ actionId: input.id, changed: true });
	});

	it('refuses an id reused by someone else, on another slot or for another kind, without writing', async () => {
		const actionId = id();
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, note: 'a' });
		const cases = [
			s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, note: 'a' }),
			s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: actionId, note: 'a' }),
			s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, servings: 3 }),
		];
		for (const call of cases) {
			const error = await errorOf(call);
			expect(error.code).toBe('invalid');
			expect(error.data.issues[0].path).toEqual(['id']);
		}
		expect(await s.changes(s.slots.tueLunch)).toHaveLength(0);
		expect((await s.slotRow(s.slots.monDinner)).servings).toBe(2);
	});

	it('refuses an id used in another family as invalid, without writing', async () => {
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		const week = await s.fx.insertWeek(family, '2026-10-12');
		const slot = await s.fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', freeText: 'x' });
		const shared = id();
		await stranger.client.meals.setNote({ familyId: family, slotId: slot, id: shared, note: 'mine' });
		expect((await errorOf(s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: shared, note: 'x' }))).code).toBe('invalid');
		expect((await s.slotRow(s.slots.monDinner)).note).toBeNull();
	});

	it('not_found for a slot of another family, forbidden for a stranger, nothing written', async () => {
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.setServings({ familyId: family, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('not_found');
		expect((await errorOf(stranger.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('forbidden');
		expect((await s.slotRow(s.slots.monLunch)).servings).toBe(2);
	});

	it('refuses drafts, archived and unknown recipes with not_found', async () => {
		const archived = await s.fx.publishRecipe();
		await catalogueFixture(actors.db).archive(archived);
		const draft = await s.fx.draftRecipe('Bozza');
		for (const recipeId of [archived, draft, crypto.randomUUID()]) {
			expect((await errorOf(s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId }))).code).toBe('not_found');
		}
		expect((await s.slotRow(s.slots.monLunch)).recipe_id).toBe(s.recipes[0]);
	});

	it('a past meal changed shows the version in force when it passed (R1)', async () => {
		const recipe = await s.fx.publishRecipe({ name: 'Zuppa', publishedAt: '2025-12-01T00:00:00Z' });
		await s.fx.publishVersion(recipe, '2026-02-01T00:00:00Z'); // current version: «Zuppa v2»
		const pastWeek = await s.fx.insertWeek(s.familyId, '2026-01-05');
		const past = await s.fx.insertSlot(pastWeek, { date: '2026-01-05', mealType: 'lunch', freeText: 'x' });
		const result = await s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: past, id: id(), recipeId: recipe });
		expect(mealOf(result.week, past).recipe?.name).toBe('Zuppa');
	});

	it('the week and the shopping list read as changed after a write', async () => {
		const week = await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		const list = await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 7 });
		expect((await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: week.version })).unchanged).toBe(false);
		expect((await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: list.version })).unchanged).toBe(false);
	});
});
```

(`shopping.getWeekList` is the client path because `contract.ts` spreads
`shoppingContract`, which is `{ shopping: {...} }`: check `contract/src/shopping/operations.ts`
and adjust if the area key differs.)

- [ ] **Step 7: Run** `npx vitest run server/test/meals/writes.test.ts` — Expected: FAIL (compile: `meals` not in the router).

- [ ] **Step 8: `slots.ts`**

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
	lastActionId: string | null;
}

/** What meal_changes keeps of a slot: exactly these keys (the database compares `before` with them). */
export interface SlotContent {
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
}

export const contentOf = (s: SlotContent): SlotContent => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });

export const sameContent = (a: SlotContent, b: SlotContent) =>
	a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

/**
 * The slots of the family, locked for the transaction in id order (two crossed swaps never
 * deadlock), returned in the order asked. Under RLS: another family's or a missing slot is not_found.
 */
export async function lockSlots(tx: Tx, familyId: string, slotIds: string[]): Promise<SlotRow[]> {
	const sorted = [...new Set(slotIds)].sort();
	const rows = await tx<SlotRow[]>`
		select s.id, s.week_id as "weekId", w.starts_on::text as "startsOn", s.date::text as date, s.meal_type as "mealType",
			s.recipe_id as "recipeId", s.free_text as "freeText", s.servings, s.note, s.last_action_id as "lastActionId"
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = any(${sorted}::uuid[]) and w.family_id = ${familyId}
		order by s.id
		for update of s`;
	if (rows.length !== sorted.length) throw appError('not_found');
	return slotIds.map((id) => rows.find((r) => r.id === id)!);
}

export async function readSlot(tx: Tx, familyId: string, slotId: string): Promise<SlotRow> {
	const [row] = await tx<SlotRow[]>`
		select s.id, s.week_id as "weekId", w.starts_on::text as "startsOn", s.date::text as date, s.meal_type as "mealType",
			s.recipe_id as "recipeId", s.free_text as "freeText", s.servings, s.note, s.last_action_id as "lastActionId"
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = ${slotId} and w.family_id = ${familyId}`;
	if (!row) throw appError('not_found');
	return row;
}
```

- [ ] **Step 9: `actions.ts`**

```ts
// server/src/meals/actions.ts
import type { MealActionResult } from '@app/contract';
import { appError } from '../errors.ts';
import { weekViewOf } from '../menu/week-view.ts';
import type { OperationContext } from '../pipeline.ts';
import { contentOf, sameContent, type SlotContent, type SlotRow } from './slots.ts';

export type ActionKind = 'set_servings' | 'set_recipe' | 'set_free' | 'set_note' | 'swap' | 'undo';

export interface ActionRequest {
	/** Client id of the action. */
	id: string;
	kind: ActionKind;
	/** Locked slots of the request, in the request's order. */
	slots: SlotRow[];
	/** The undone action (kind undo). */
	undoes?: string;
}

export interface Edit {
	slot: SlotRow;
	after: SlotContent;
	/** The meal_changes row this edit undoes (kind undo). */
	undoes?: string;
}

const invalidId = () => appError('invalid', { issues: [{ path: ['id'], code: 'already_used' }] });

async function answer(context: OperationContext, familyId: string, request: ActionRequest, changed: boolean): Promise<MealActionResult> {
	return { week: await weekViewOf(context, familyId, request.slots[0]!.startsOn), actionId: request.id, changed };
}

/**
 * A request already recorded (spec of the revision, section 4): same id, user, kind, slots and
 * undone action answer the current week; any other reuse of the id is invalid. Called after the
 * slots are locked and before any check on the new content.
 */
export async function replay(context: OperationContext, familyId: string, request: ActionRequest): Promise<MealActionResult | null> {
	const [row] = await context.tx<{ actorId: string | null; kind: string; slotIds: string[]; undoes: string | null; changed: boolean }[]>`
		select actor_id as "actorId", kind, slot_ids::text[] as "slotIds", undoes,
			exists (select 1 from app.meal_changes c where c.action_id = a.id) as changed
		from app.meal_actions a where id = ${request.id}`;
	if (!row) return null;
	const sameSlots = row.slotIds.length === request.slots.length && row.slotIds.every((id, i) => id === request.slots[i]!.id);
	if (row.actorId !== context.userId || row.kind !== request.kind || !sameSlots || (row.undoes ?? undefined) !== request.undoes) throw invalidId();
	return answer(context, familyId, request, row.changed);
}

/**
 * Writes an action in the order the database checks need: the action, the truthful change rows
 * of every changed slot, then the slots with their pointer and the moment after the lock.
 */
export async function perform(context: OperationContext, familyId: string, request: ActionRequest, edits: Edit[]): Promise<MealActionResult> {
	const { tx } = context;
	try {
		await tx`
			insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
			values (${request.id}, ${request.slots[0]!.weekId}, auth.uid(), ${context.channel}, ${request.kind},
				${request.slots.map((s) => s.id)}::uuid[], ${request.undoes ?? null})`;
	} catch (error) {
		// An id of another family is invisible to replay: the primary key tells.
		if ((error as { code?: string }).code === '23505') throw invalidId();
		throw error;
	}
	const changed = edits.filter((e) => !sameContent(contentOf(e.slot), e.after));
	for (const edit of changed) {
		await tx`
			insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
			values (${edit.slot.id}, auth.uid(), ${context.channel}, ${tx.json({ ...contentOf(edit.slot) })}, ${tx.json({ ...edit.after })},
				${edit.undoes ?? null}, ${request.id})`;
	}
	for (const edit of changed) {
		await tx`
			update app.meal_slots
			set recipe_id = ${edit.after.recipeId}, free_text = ${edit.after.freeText}, servings = ${edit.after.servings},
				note = ${edit.after.note}, updated_by = auth.uid(), updated_at = clock_timestamp(), last_action_id = ${request.id}
			where id = ${edit.slot.id}`;
	}
	return answer(context, familyId, request, changed.length > 0);
}
```

- [ ] **Step 10: Router and registration**

```ts
// server/src/meals/router.ts
import { appError } from '../errors.ts';
import type { Implementer, OperationContext } from '../pipeline.ts';
import { perform, replay, type ActionKind } from './actions.ts';
import { contentOf, lockSlots, type SlotContent, type SlotRow } from './slots.ts';

/** One-slot write: lock, replay before any content check, check, perform. */
async function oneSlot(
	context: OperationContext,
	input: { familyId: string; slotId: string; id: string },
	kind: ActionKind,
	next: (slot: SlotRow) => Promise<SlotContent> | SlotContent,
) {
	const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
	const request = { id: input.id, kind, slots: [slot!] };
	const replayed = await replay(context, input.familyId, request);
	if (replayed) return replayed;
	return perform(context, input.familyId, request, [{ slot: slot!, after: await next(slot!) }]);
}

export function mealsRouter(os: Implementer) {
	return {
		setServings: os.meals.setServings.handler(({ context, input }) =>
			oneSlot(context, input, 'set_servings', (slot) => ({ ...contentOf(slot), servings: input.servings })),
		),
		/** Only published recipes: drafts and archived ones are not offered (spec section 5). */
		setRecipe: os.meals.setRecipe.handler(({ context, input }) =>
			oneSlot(context, input, 'set_recipe', async (slot) => {
				const [recipe] = await context.tx`select 1 from app.recipes where id = ${input.recipeId} and status = 'published'`;
				if (!recipe) throw appError('not_found');
				return { ...contentOf(slot), recipeId: input.recipeId, freeText: null };
			}),
		),
		setFree: os.meals.setFree.handler(({ context, input }) =>
			oneSlot(context, input, 'set_free', (slot) => ({ ...contentOf(slot), recipeId: null, freeText: input.text })),
		),
		setNote: os.meals.setNote.handler(({ context, input }) =>
			oneSlot(context, input, 'set_note', (slot) => ({ ...contentOf(slot), note: input.note || null })),
		),
	};
}
```

`server/src/router.ts`: `import { mealsRouter } from './meals/router.ts';` and
`meals: mealsRouter(os),` after `menu`.

- [ ] **Step 11: Run** `npm run typecheck && npx vitest run server/test/meals contract && supabase test db` — Expected: PASS. Then `npm test`; if a global MCP test lists every tool (`grep -rn "tools/list" server/test`), add the four `meals_*` names there now.

- [ ] **Step 12: Commit**

```bash
git add contract/src/meals contract/src/contract.ts contract/src/index.ts server/src/meals server/src/router.ts server/test/support/meals.ts server/test/meals
git commit -m "Revisione dei pasti: porzioni, ricetta, pasto libero e nota come azioni ripetibili"
```

### Task 5: scambio

**Files:**
- Modify: `contract/src/meals/operations.ts`, `contract/src/meals/meals-contract.test.ts`, `server/src/meals/router.ts`
- Create: `server/test/meals/swap.test.ts`

**Interfaces:**
- Consumes: `lockSlots`, `replay`, `perform`, `contentOf`, `SlotRow` (Task 4).
- Produces: `mealsContract.swap` (input `{ familyId, slotId, otherSlotId, id }`).

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/swap.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal swap', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('moves dish and note, servings stay; one action, one row per slot', async () => {
		await actors.db.admin`update app.meal_slots set note = 'n1', servings = 3 where id = ${s.slots.monLunch}`;
		const actionId = id();
		const result = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: actionId });
		expect(mealOf(result.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza', note: null, servings: 3 });
		expect(mealOf(result.week, s.slots.monDinner)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[0] }, note: 'n1', servings: 2 });
		expect(await s.action(actionId)).toMatchObject({ kind: 'swap', slot_ids: [s.slots.monLunch, s.slots.monDinner] });
		expect([...mealOf(result.week, s.slots.monLunch).lastChange!.slotIds].sort()).toEqual([s.slots.monLunch, s.slots.monDinner].sort());
	});

	for (const order of ['draft first', 'draft second'] as const) {
		it(`moves an imported draft and an archived recipe (${order} in id order)`, async () => {
			const archived = await s.fx.publishRecipe();
			await catalogueFixture(actors.db).archive(archived);
			const draft = await s.fx.draftRecipe('Bozza importata');
			const [a, b] = [s.slots.monLunch, s.slots.tueLunch].sort();
			const [draftSlot, otherSlot] = order === 'draft first' ? [a!, b!] : [b!, a!];
			await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${draftSlot}`;
			await actors.db.admin`update app.meal_slots set recipe_id = ${archived}, free_text = null where id = ${otherSlot}`;
			const result = await s.bruno.client.meals.swap({ familyId: s.familyId, slotId: draftSlot, otherSlotId: otherSlot, id: id() });
			expect(mealOf(result.week, otherSlot).recipe?.id).toBe(draft);
			expect(mealOf(result.week, draftSlot).recipe?.id).toBe(archived);
		});
	}

	it('swaps two imported drafts', async () => {
		const [d1, d2] = [await s.fx.draftRecipe('Bozza uno'), await s.fx.draftRecipe('Bozza due')];
		await actors.db.admin`update app.meal_slots set recipe_id = ${d1}, free_text = null where id = ${s.slots.monLunch}`;
		await actors.db.admin`update app.meal_slots set recipe_id = ${d2}, free_text = null where id = ${s.slots.tueLunch}`;
		const result = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.tueLunch, id: id() });
		expect(mealOf(result.week, s.slots.monLunch).recipe?.id).toBe(d2);
		expect(mealOf(result.week, s.slots.tueLunch).recipe?.id).toBe(d1);
	});

	it('refuses the same slot and a slot of another week, not_found for an unknown slot, nothing written', async () => {
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monLunch, id: id() }))).code).toBe('invalid');
		const nextWeek = await s.fx.insertWeek(s.familyId, '2026-10-19');
		const far = await s.fx.insertSlot(nextWeek, { date: '2026-10-19', mealType: 'lunch', freeText: 'x' });
		const week = await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: far, id: id() }));
		expect(week.code).toBe('invalid');
		expect(week.data.issues[0].path).toEqual(['otherSlotId']);
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: crypto.randomUUID(), id: id() }))).code).toBe('not_found');
		expect(await s.changes(s.slots.monLunch)).toHaveLength(0);
	});

	it('a swap id already used for a note of the first slot is invalid, and nothing moves', async () => {
		const actionId = id();
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, note: 'x' });
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: actionId }))).code).toBe('invalid');
		expect(mealOf(await s.week(s.anna), s.slots.monDinner).freeText).toBe('Pizza');
	});

	it('two crossed swaps at once both finish', async () => {
		await Promise.all([
			s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.tueLunch, id: id() }),
			s.bruno.client.meals.swap({ familyId: s.familyId, slotId: s.slots.tueLunch, otherSlotId: s.slots.monLunch, id: id() }),
		]);
	});
});
```

Add to the contract test: `swap` has the same metadata as the other writes.

- [ ] **Step 2: Run** `npx vitest run server/test/meals/swap.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// contract/src/meals/operations.ts, in mealsContract
	swap: write()
		.route({
			method: 'POST',
			path: '/families/{familyId}/meals/{slotId}/swap',
			summary: `Swap two meals of the same week: dish or free text and note move, servings stay. ${idHint}`,
		})
		.errors(notFound)
		.input(slot.extend({ id: z.uuid(), otherSlotId: z.uuid() }))
		.output(mealActionResult),
```

```ts
// server/src/meals/router.ts, in mealsRouter
		/** Dish or free text and note move, servings stay with the slot (spec section 5). */
		swap: os.meals.swap.handler(async ({ context, input }) => {
			const issue = (code: string) => appError('invalid', { issues: [{ path: ['otherSlotId'], code }] });
			if (input.otherSlotId === input.slotId) throw issue('same_slot');
			const [slot, other] = await lockSlots(context.tx, input.familyId, [input.slotId, input.otherSlotId]);
			const request = { id: input.id, kind: 'swap' as const, slots: [slot!, other!] };
			const replayed = await replay(context, input.familyId, request);
			if (replayed) return replayed;
			if (slot!.weekId !== other!.weekId) throw issue('other_week');
			const moved = (from: SlotRow) => ({ recipeId: from.recipeId, freeText: from.freeText, note: from.note });
			return perform(context, input.familyId, request, [
				{ slot: slot!, after: { ...contentOf(slot!), ...moved(other!) } },
				{ slot: other!, after: { ...contentOf(other!), ...moved(slot!) } },
			]);
		}),
```

- [ ] **Step 4: Run** `npm run typecheck && npx vitest run server/test/meals` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contract/src/meals server/src/meals server/test/meals/swap.test.ts
git commit -m "Revisione dei pasti: scambio nella stessa settimana, anche delle bozze importate"
```

### Task 6: annullamento

**Files:**
- Modify: `contract/src/meals/operations.ts`, `server/src/meals/actions.ts` (adds `undoAction`), `server/src/meals/router.ts`
- Create: `server/test/meals/undo.test.ts`

**Interfaces:**
- Consumes: `lockSlots`, `replay`, `perform`, `SlotContent` (Task 4), `app.recipe_draft_is_open` (Task 1).
- Produces: `mealsContract.undo` (input `{ familyId, actionId, id }`); `undoAction(context, familyId, input): Promise<MealActionResult>`.

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/undo.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { agentClient, mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal undo', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('restores the content with an undo action; repeated, nothing new', async () => {
		const changed = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 6 });
		const undoId = id();
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: undoId });
		expect(undone).toMatchObject({ actionId: undoId, changed: true });
		expect(mealOf(undone.week, s.slots.monLunch).servings).toBe(2);
		expect(await s.action(undoId)).toMatchObject({ kind: 'undo', slot_ids: [s.slots.monLunch] });
		await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: undoId });
		expect((await s.changes(s.slots.monLunch)).filter((r) => r.action_id === undoId)).toHaveLength(1);
	});

	it('an agent in a new conversation undoes from menu_getWeek alone', async () => {
		await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		const agent = await agentClient(actors, s.anna);
		const read = await agent.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		if (read.unchanged) throw new Error('expected data');
		const last = mealOf(read.data, s.slots.monDinner).lastChange!;
		expect(last.undoable).toBe(true);
		expect([...last.slotIds].sort()).toEqual([s.slots.monLunch, s.slots.monDinner].sort());
		const undone = await agent.meals.undo({ familyId: s.familyId, actionId: last.actionId!, id: id() });
		expect(mealOf(undone.week, s.slots.monDinner)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		expect(mealOf(undone.week, s.slots.monLunch)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[0] } });
	});

	it('undoes a swap whole, and the undo of the undo whole again', async () => {
		const swapped = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: swapped.actionId, id: id() });
		const redone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: undone.actionId, id: id() });
		expect(mealOf(redone.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		expect(mealOf(redone.week, s.slots.monDinner)).toMatchObject({ recipe: { id: s.recipes[0] } });
	});

	it('changed_since when another member changed one of the two swapped meals; nothing written', async () => {
		const swapped = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), note: 'Bruno' });
		const before = await s.week(s.anna);
		expect(mealOf(before, s.slots.monLunch).lastChange?.undoable).toBe(false);
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: swapped.actionId, id: id() }))).data).toEqual({ reason: 'changed_since' });
		expect(await s.week(s.anna)).toEqual(before);
	});

	it('not_own_change for another member’s action', async () => {
		const changed = await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'Bruno' });
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: id() }))).data).toEqual({ reason: 'not_own_change' });
	});

	it('restores the last citation of an imported draft; draft_closed once it was discarded', async () => {
		const draft = await s.fx.draftRecipe('Bozza importata');
		await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.monDinner}`;
		const freed = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: freed.actionId, id: id() });
		expect(mealOf(undone.week, s.slots.monDinner).recipe?.id).toBe(draft);
		const again = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
		await actors.db.admin`update app.recipe_drafts set closed_at = now(), outcome = 'discarded' where recipe_id = ${draft}`;
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: again.actionId, id: id() }))).data).toEqual({ reason: 'draft_closed' });
	});

	it('an action without effect undoes to nothing', async () => {
		const same = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 2 });
		expect((await s.anna.client.meals.undo({ familyId: s.familyId, actionId: same.actionId, id: id() })).changed).toBe(false);
	});

	it('works on a past meal', async () => {
		const pastWeek = await s.fx.insertWeek(s.familyId, '2026-01-05');
		const past = await s.fx.insertSlot(pastWeek, { date: '2026-01-05', mealType: 'lunch', recipeId: s.recipes[1] });
		const changed = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: past, id: id(), servings: 4 });
		expect(mealOf((await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: id() })).week, past).servings).toBe(2);
	});

	it('not_found for an unknown action or one of another family, without writing', async () => {
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: crypto.randomUUID(), id: id() }))).code).toBe('not_found');
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		const strangerWeek = await s.fx.insertWeek(family, '2026-10-12');
		const slot = await s.fx.insertSlot(strangerWeek, { date: '2026-10-12', mealType: 'lunch', freeText: 'x' });
		const theirs = await stranger.client.meals.setNote({ familyId: family, slotId: slot, id: id(), note: 'mine' });
		const undoId = id();
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: theirs.actionId, id: undoId }))).code).toBe('not_found');
		expect(await s.action(undoId)).toBeUndefined();
	});

	it('a transaction started first but blocked on the lock saves last, and the pointer follows', async () => {
		const [first, second] = [s.slots.monLunch, s.slots.monDinner].sort();
		const swapId = id();
		const noteId = id();
		let swap: Promise<unknown> | undefined;
		await actors.db.admin.begin(async (hold) => {
			await hold`select 1 from app.meal_slots where id = ${first!} for update`;
			// The swap begins now and waits on `first` before locking `second`.
			swap = s.anna.client.meals.swap({ familyId: s.familyId, slotId: first!, otherSlotId: second!, id: swapId });
			await new Promise((r) => setTimeout(r, 300));
			// Bruno's note starts later, locks `second` at once and commits first.
			await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: second!, id: noteId, note: 'Bruno' });
		});
		await swap;
		expect((await s.slotRow(second!)).last_action_id).toBe(swapId);
		expect(mealOf(await s.week(s.anna), second!).lastChange).toMatchObject({ actionId: swapId, undoable: true });
		expect((await s.changes(second!)).at(-1)!.action_id).toBe(swapId);
		expect((await errorOf(s.bruno.client.meals.undo({ familyId: s.familyId, actionId: noteId, id: id() }))).data).toEqual({ reason: 'changed_since' });
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
				'Undo your own last change of a meal: pass lastChange.actionId from menu_getWeek when lastChange.undoable is true (a swap comes back whole). `id` is a new UUID for the undo',
		})
		.errors({ ...notFound, not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ familyId: z.uuid(), actionId: z.uuid(), id: z.uuid() }))
		.output(mealActionResult),
```

- [ ] **Step 4: Server**

```ts
// server/src/meals/actions.ts (added; add `lockSlots` to the import from './slots.ts')
const notAllowed = (reason: 'not_own_change' | 'changed_since' | 'draft_closed') => appError('not_allowed', { reason });

/**
 * meals.undo (spec section 5): own actions only, only while every slot it changed still has it
 * as last action; all its slots together; a draft comes back only while open.
 */
export async function undoAction(context: OperationContext, familyId: string, input: { actionId: string; id: string }): Promise<MealActionResult> {
	const { tx } = context;
	const [action] = await tx<{ actorId: string | null; slotIds: string[] }[]>`
		select a.actor_id as "actorId", a.slot_ids::text[] as "slotIds"
		from app.meal_actions a join app.weeks w on w.id = a.week_id
		where a.id = ${input.actionId} and w.family_id = ${familyId}`;
	if (!action) throw appError('not_found');
	const rows = await tx<{ id: string; slotId: string; before: SlotContent }[]>`
		select id, meal_slot_id as "slotId", before from app.meal_changes where action_id = ${input.actionId} order by meal_slot_id`;
	// An action without rows has nothing to undo: the undo is recorded on its slots, without rows.
	const slots = await lockSlots(tx, familyId, rows.length > 0 ? rows.map((r) => r.slotId) : action.slotIds);
	const request = { id: input.id, kind: 'undo' as const, slots, undoes: input.actionId };
	const replayed = await replay(context, familyId, request);
	if (replayed) return replayed;
	if (rows.length === 0) return perform(context, familyId, request, []);
	if (action.actorId !== context.userId) throw notAllowed('not_own_change');
	if (slots.some((s) => s.lastActionId !== input.actionId)) throw notAllowed('changed_since');
	const drafts = rows.map((r) => r.before.recipeId).filter((id): id is string => id !== null);
	const [closed] = await tx<{ id: string }[]>`
		select r.id from app.recipes r
		where r.id = any(${drafts}::uuid[]) and r.status = 'draft' and not app.recipe_draft_is_open(r.id)
		limit 1`;
	if (closed) throw notAllowed('draft_closed');
	return perform(context, familyId, request, rows.map((row) => ({ slot: slots.find((s) => s.id === row.slotId)!, after: row.before, undoes: row.id })));
}
```

```ts
// server/src/meals/router.ts, in mealsRouter (import undoAction)
		undo: os.meals.undo.handler(({ context, input }) => undoAction(context, input.familyId, input)),
```

A draft published in the meantime has `status = 'published'`: it is not refused and the
restore goes on (spec, «Scostamento da segnalare al coordinatore»).

- [ ] **Step 5: Run** `supabase test db && npm run typecheck && npx vitest run server/test/meals` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add contract/src/meals server/src/meals server/test/meals/undo.test.ts
git commit -m "Revisione dei pasti: annullamento delle proprie azioni, scambi interi, bozze ancora aperte"
```

### Task 7: suggerimenti

**Files:**
- Modify: `server/src/menu/generation.ts` (`fixedRecipes`)
- Modify: `contract/src/meals/views.ts`, `contract/src/meals/operations.ts`
- Create: `server/src/meals/suggestions.ts`; modify `server/src/meals/router.ts`
- Create: `server/test/meals/suggestions.test.ts`

**Interfaces:**
- Consumes: `rankSuggestions` (Task 2), `readSlot` (Task 4), `recipeSummaries`, `recipeViewKey`, `ratingSummaries`, `rest(app, env, method, path, token)`.
- Produces: `mealsContract.getSuggestions` (input `{ familyId, slotId, offset? }`, output `SuggestionsView`), `suggestionsOf(context, familyId, slotId, offset): Promise<SuggestionsView>`.

- [ ] **Step 1: Failing tests**

```ts
// server/test/meals/suggestions.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealsSetup } from '../support/meals.ts';
import { rest } from '../support/requests.ts';

describe.skipIf(!hasDatabase)('meal suggestions', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const read = (offset?: number, slotId = s.slots.tueLunch) =>
		s.anna.client.meals.getSuggestions({ familyId: s.familyId, slotId, ...(offset === undefined ? {} : { offset }) });
	const ranking = async (slotId = s.slots.tueLunch) => {
		const ids: string[] = [];
		let offset = 0;
		do {
			const page = await read(offset, slotId);
			ids.push(...page.recipes.map((r) => r.recipe.id));
			offset = page.nextOffset;
		} while (offset !== 0);
		return ids;
	};

	it('five recipes with their rating, without the other meals of the week', async () => {
		const page = await read();
		expect(page.recipes).toHaveLength(5);
		expect(page.recipes.map((r) => r.recipe.id)).not.toContain(s.recipes[0]);
		expect(page.recipes[0]!.rating).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(page.nextOffset).toBe(5);
	});

	it('pages through the ranking and starts again, also from an offset past the end', async () => {
		const first = (await read(0)).recipes.map((r) => r.recipe.id);
		const all = await ranking();
		expect(all.slice(0, 5)).toEqual(first);
		expect(new Set(all).size).toBe(all.length);
		expect((await read(999)).recipes.map((r) => r.recipe.id)).toEqual(first);
	});

	it('leaves out the current recipe and an exclusion added just now', async () => {
		expect(await ranking(s.slots.monLunch)).not.toContain(s.recipes[0]);
		const top = (await read()).recipes[0]!.recipe.id;
		await s.anna.client.family.addExclusion({ familyId: s.familyId, recipeId: top });
		expect(await ranking()).not.toContain(top);
	});

	it('a rating in another family changes the next read (not versioned)', async () => {
		const before = await ranking();
		const last = before.at(-1)!;
		const outsider = await actors.user();
		const otherFamily = await actors.db.createFamily([{ userId: outsider.userId, role: 'member' }]);
		await outsider.client.ratings.set({ familyId: otherFamily, recipeId: last, stars: 5 });
		const after = await ranking();
		expect(after.indexOf(last)).toBeLessThan(before.indexOf(last));
	});

	it('counts an archived recipe already in the week against the weekly maximum', async () => {
		const limited = await s.fx.ingredient();
		const archived = await s.fx.publishRecipe({ ingredientIds: [limited] });
		const sameIngredient = await s.fx.publishRecipe({ ingredientIds: [limited] });
		await catalogueFixture(actors.db).archive(archived);
		await actors.db.admin`update app.meal_slots set recipe_id = ${archived} where id = ${s.slots.monLunch}`;
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max) values (${s.familyId}, ${limited}, 'limit', 1)`;
		expect(await ranking()).not.toContain(sameIngredient);
	});

	it('the four free texts the family uses most, ties in alphabetical order', async () => {
		const texts = { '2026-10-13': 'Fuori', '2026-10-14': 'Fuori', '2026-10-15': 'Fuori', '2026-10-16': 'Avanzi', '2026-10-17': 'Sushi' };
		for (const [date, freeText] of Object.entries(texts)) await s.fx.insertSlot(s.weekId, { date, mealType: 'dinner', freeText });
		expect((await read()).freeTexts).toEqual(['Fuori', 'Avanzi', 'Pizza', 'Sushi']);
	});

	it('REST passes the offset in the query string; another family gets not_found', async () => {
		const response = await rest(actors.app, actors.env, 'GET', `/api/families/${s.familyId}/meals/${s.slots.tueLunch}/suggestions?offset=5`, s.anna.token);
		expect(response.status).toBe(200);
		expect((await response.json()).nextOffset).toBe(10);
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.getSuggestions({ familyId: family, slotId: s.slots.tueLunch }))).code).toBe('not_found');
	});
});
```

(`mealsSetup` publishes 12 recipes; with 3 slots in the week and no history the Tuesday
lunch has at least 10 candidates, so `offset=5` answers `nextOffset` 10.)

- [ ] **Step 2: Run** `npx vitest run server/test/meals/suggestions.test.ts` — Expected: FAIL.

- [ ] **Step 3: `fixedRecipes` in `loadPlannerInput`**

```ts
// server/src/menu/generation.ts, in loadPlannerInput, after `recipes`
	// Archived recipes cited by the family's meals: neighbours, history and limits, never candidates.
	const fixed = await tx<{ id: string; content: RecipeDocument }[]>`
		select r.id, v.content
		from app.recipes r join app.recipe_versions v on v.recipe_id = r.id and v.version = r.version
		where r.status = 'archived'
			and exists (select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id where s.recipe_id = r.id and w.family_id = ${familyId})`;
// in the returned object
		fixedRecipes: fixed.map((r) => toPlannerRecipe(r.id, r.content)),
```

Run `npx vitest run server/test/menu` too: the generation tests stay green.

- [ ] **Step 4: Contract**

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
	/** Not versioned: the ranking also uses the ratings of every family, which no counter follows. */
	getSuggestions: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
		.route({
			method: 'GET',
			path: '/families/{familyId}/meals/{slotId}/suggestions',
			summary:
				'Five recipes that fit a meal, best first, by the same rules as the weekly menu (ratings shown, not set here); call again with nextOffset for five more. Also the free-meal texts the family uses most',
		})
		.errors(notFound)
		.input(slot.extend({ offset: z.coerce.number().int().min(0).max(1000).default(0) }))
		.output(suggestionsView),
```

- [ ] **Step 5: Server**

```ts
// server/src/meals/suggestions.ts
import type { SuggestionsView } from '@app/contract';
import { rankSuggestions } from '@app/domain/planner';
import { loadPlannerInput } from '../menu/generation.ts';
import type { OperationContext } from '../pipeline.ts';
import { ratingSummaries, recipeSummaries, recipeViewKey } from '../recipes/views.ts';
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
	const refs = ranked.slice(start, start + SUGGESTION_PAGE).map((recipeId) => ({ recipeId, version: null, servings: slot.servings }));
	const summaries = await recipeSummaries(tx, refs, context.locale);
	const ratings = await ratingSummaries(tx, familyId, context.userId, refs.map((r) => r.recipeId));
	const texts = await tx<{ text: string }[]>`
		select s.free_text as text from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.free_text is not null
		group by s.free_text order by count(*) desc, s.free_text limit ${FREE_TEXTS}`;
	return {
		recipes: refs.flatMap((ref) => {
			const recipe = summaries.get(recipeViewKey(ref));
			const rating = ratings.get(ref.recipeId);
			return recipe && rating ? [{ recipe, rating }] : [];
		}),
		nextOffset: start + SUGGESTION_PAGE < ranked.length ? start + SUGGESTION_PAGE : 0,
		freeTexts: texts.map((t) => t.text),
	};
}
```

```ts
// server/src/meals/router.ts, in mealsRouter (import suggestionsOf)
		getSuggestions: os.meals.getSuggestions.handler(({ context, input }) => suggestionsOf(context, input.familyId, input.slotId, input.offset)),
```

- [ ] **Step 6: Run** `npm run typecheck && npx vitest run server/test/meals server/test/menu domain contract` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/menu/generation.ts contract/src/meals server/src/meals server/test/meals/suggestions.test.ts
git commit -m "Revisione dei pasti: suggerimenti dal pianificatore, non versionati, con le ricette archiviate fissate"
```

### Task 8: MCP, verifica completa e PR del server

**Files:**
- Create: `server/test/meals/mcp.test.ts`

**Interfaces:**
- Consumes: `mcp`, `testEnv`, `toolBody` (`server/test/support/requests.ts`), `menuFixtures`, `setupDatabase`, `createTestKeys`, `createApp`, `router`.

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
	let anna: { userId: string; sessionId: string };
	let bruno: { userId: string; sessionId: string };
	let familyId: string;
	let slotId: string;
	const env = () => testEnv(db.appServerUrl);
	const token = (u: { userId: string; sessionId: string }) => keys.sign({ sub: u.userId, session_id: u.sessionId, client_id: 'codex' });
	const call = async (u: typeof anna, name: string, args: Record<string, unknown>) => mcp(app, env(), await token(u), 'tools/call', { name, arguments: args });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		anna = await db.createUser();
		bruno = await db.createUser();
		familyId = await db.createFamily([{ userId: anna.userId, role: 'member' }, { userId: bruno.userId, role: 'member' }]);
		const fx = menuFixtures(db);
		const recipe = await fx.publishRecipe();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		slotId = await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', recipeId: recipe });
		for (let i = 0; i < 6; i++) await fx.publishRecipe();
	});
	afterAll(() => db?.close());

	it('lists the meal tools, only the suggestions read-only', async () => {
		const list = await mcp(app, env(), await token(anna), 'tools/list');
		const tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] = list.body.result.tools.filter((t: { name: string }) => t.name.startsWith('meals_'));
		expect(tools.map((t) => t.name).sort()).toEqual(['meals_getSuggestions', 'meals_setFree', 'meals_setNote', 'meals_setRecipe', 'meals_setServings', 'meals_swap', 'meals_undo']);
		expect(tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name)).toEqual(['meals_getSuggestions']);
	});

	it('changes a meal, and refuses to undo another member’s action with not_allowed', async () => {
		const changed = toolBody(await call(anna, 'meals_setServings', { familyId, slotId, id: crypto.randomUUID(), servings: 3 }));
		expect(changed).toMatchObject({ changed: true });
		const refused = await call(bruno, 'meals_undo', { familyId, actionId: changed.actionId, id: crypto.randomUUID() });
		expect(refused.body.result.isError).toBe(true);
		const text = JSON.stringify(refused.body.result);
		expect(text).toContain('not_allowed');
		expect(text).toContain('not_own_change');
	});
});
```

(The tool error shape is the one `server/test/shopping-mcp.test.ts` asserts; the JSON of
the whole result contains the code and the data in either form.)

- [ ] **Step 2: Run** `npx vitest run server/test/meals/mcp.test.ts` — Expected: PASS.

- [ ] **Step 3: Full verification** (skill `superpowers:verification-before-completion`)

Run: `supabase test db && npm run typecheck && npm test` with `TEST_DATABASE_URL` as in CI.
Expected: all green.

- [ ] **Step 4: Commit, push, PR** (after the coordinator's go)

```bash
git add server/test/meals/mcp.test.ts
git commit -m "Revisione dei pasti: strumenti MCP dell'area meals"
git push -u origin traguardo/revisione-pasti
gh pr create --base main --title "Revisione dei pasti: azioni, server, contratto e MCP" --body-file "$SCRATCH/pr-server.md"
```

`$SCRATCH/pr-server.md` (scratchpad): what it does, the migration, the verifications, spec
sections 2, 3, 5 and 13, closing line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
Then `STATO: PR_APERTA <url>` and stop.

---

## Seconda PR: web

Parte dopo il merge della prima: `git fetch && git switch -c traguardo/revisione-pasti-web origin/main`.
Prima di ogni task leggere `design/design.md`, i componenti del prototipo citati e
`web/src/routes/MenuPage.tsx`.

### Task 9: area `meals` nel client, finto e vero

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/api/fake/fakeApi.ts`
- Create: `web/src/api/fake/fakeMeals.ts`, `web/src/api/fake/fakeMeals.test.ts`
- Modify: `web/src/test/rpcServer.ts`, `web/src/test/renderApp.tsx` (opzione `strict`)
- Create: `web/src/features/meals/queries.ts`, `web/src/features/meals/testApp.tsx`

**Interfaces:**
- Produces:
  - `SERVER_AREAS` with `'meals'`; types `MealActionResult`, `SuggestionsView` re-exported from `web/src/api/types.ts`;
  - `createFakeMeals(options: FakeMealsOptions): { api: Api['meals']; lastChangeOf(slot: FakeSlot) }`;
  - `mealKeys.suggestions(familyId, slotId, offset, locale)`, `suggestionsQuery(deps, familyId, slotId, offset)`;
  - test server: `answerMenu({ opening, weeks })`, `answerMeals(handlers)`, `defaultMeals` (default handlers), `mealCalls: { op: string; input: Record<string, unknown> }[]`, `weekReads: { weekStartsOn: string }[]`, `currentWeek(startsOn): WeekView`, `familySeen` also with `addExclusion`/`removeExclusion`;
  - `renderApp(path, { strict?: boolean })`;
  - `realMealsApp(path?, options?: { locale?: 'it-IT' | 'en-GB'; strict?: boolean; extra?: ReactNode })` with slots `LUNCH`, `DINNER` (8 October) and `NEXT_LUNCH` (12 October).

- [ ] **Step 1: Failing test of the fake client**

```ts
// web/src/api/fake/fakeMeals.test.ts
import { describe, expect, it } from 'vitest';
import { createFakeApi, createFakeData } from './fakeApi';
import type { Api, WeekView } from '../types';

async function demoWeek(api: Api, familyId: string): Promise<WeekView> {
  const opening = await api.menu.getOpening({ familyId });
  if (opening.unchanged || opening.data.kind !== 'day') throw new Error('demo menu');
  const week = await api.menu.getWeek({ familyId, weekStartsOn: opening.data.weekStartsOn });
  if (week.unchanged) throw new Error('expected data');
  return week.data;
}

describe('fake meals', () => {
  it('changes servings as an action and undoes it from the week alone', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const meal = (await demoWeek(api, familyId)).days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    const changed = await api.meals.setServings({ familyId, slotId: meal.slotId, id: crypto.randomUUID(), servings: meal.servings + 1 });
    expect(changed.changed).toBe(true);
    const last = changed.week.days.flatMap((d) => d.meals).find((m) => m.slotId === meal.slotId)!.lastChange!;
    expect(last).toMatchObject({ actionId: changed.actionId, undoable: true, slotIds: [meal.slotId] });
    const undone = await api.meals.undo({ familyId, actionId: last.actionId!, id: crypto.randomUUID() });
    expect(undone.week.days.flatMap((d) => d.meals).find((m) => m.slotId === meal.slotId)!.servings).toBe(meal.servings);
  });

  it('pages at most five suggestions and remembers a request without effect', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const meal = (await demoWeek(api, familyId)).days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    expect((await api.meals.getSuggestions({ familyId, slotId: meal.slotId, offset: 0 })).recipes.length).toBeLessThanOrEqual(5);
    expect((await api.meals.setServings({ familyId, slotId: meal.slotId, id: crypto.randomUUID(), servings: meal.servings })).changed).toBe(false);
  });
});
```

(`profile.get` takes `{}` in the contract: `contract/src/profile/index.ts`.)

- [ ] **Step 2: Run** `npm test -w web -- fakeMeals` — Expected: FAIL (`api.meals` undefined).

- [ ] **Step 3: Implement `fakeMeals.ts`**

```ts
// web/src/api/fake/fakeMeals.ts
import type { MealActionResult, SuggestionsView, WeekView } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';

export interface FakeSlot {
  id: string; date: string; mealType: 'lunch' | 'dinner';
  recipeId: string | null; freeText: string | null; servings: number; note: string | null;
  updatedBy?: string | null; updatedAt?: string | null; lastActionId?: string | null;
}
interface Content { recipeId: string | null; freeText: string | null; servings: number; note: string | null }
interface Row { slotId: string; before: Content; after: Content }
interface Action { id: string; actorId: string; kind: string; slotIds: string[]; undoes: string | null; rows: Row[] }

export interface FakeMealsOptions {
  userId: string;
  latencyMs?: number;
  checkFamily(familyId: string): void;
  /** Every slot of the visible weeks, with its week's Monday (mutable objects of the fake data). */
  slots(): { weekStartsOn: string; slot: FakeSlot }[];
  /** The week as menu.getWeek shows it. */
  weekView(weekStartsOn: string): WeekView;
  /** Simulated ranking of round 2 (design/percorsi.md, «Suggerimenti simulati»): recipe ids, best first. */
  rank(slotId: string): string[];
  suggestion(recipeId: string): SuggestionsView['recipes'][number];
  now(): string;
  bump(): void;
}

const contentOf = (s: FakeSlot): Content => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });
const same = (a: Content, b: Content) => a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

/** The same rules as the server (spec of the revision, section 4), in memory. */
export function createFakeMeals(o: FakeMealsOptions) {
  const actions = new Map<string, Action>();
  const wait = () => (o.latencyMs ? new Promise((r) => setTimeout(r, o.latencyMs)) : Promise.resolve());
  const find = (slotId: string) => {
    const found = o.slots().find((s) => s.slot.id === slotId);
    if (!found) throw new ApiError('not_found');
    return found;
  };
  const result = (weekStartsOn: string, action: Action): MealActionResult => ({ week: o.weekView(weekStartsOn), actionId: action.id, changed: action.rows.length > 0 });
  function act(id: string, kind: string, slotIds: string[], next: (slot: FakeSlot) => Content, undoes: string | null = null): MealActionResult {
    const weekStartsOn = find(slotIds[0]!).weekStartsOn;
    const known = actions.get(id);
    if (known) {
      if (known.actorId !== o.userId || known.kind !== kind || known.slotIds.join() !== slotIds.join() || known.undoes !== undoes) throw new ApiError('invalid');
      return result(weekStartsOn, known);
    }
    const slots = slotIds.map((sid) => find(sid).slot);
    const edits = slots.map((slot) => ({ slot, before: contentOf(slot), after: next(slot) })).filter((e) => !same(e.before, e.after));
    const action: Action = { id, actorId: o.userId, kind, slotIds, undoes, rows: edits.map((e) => ({ slotId: e.slot.id, before: e.before, after: e.after })) };
    actions.set(id, action);
    for (const e of edits) Object.assign(e.slot, e.after, { updatedBy: o.userId, updatedAt: o.now(), lastActionId: id });
    if (edits.length) o.bump();
    return result(weekStartsOn, action);
  }
  const api: Api['meals'] = {
    async getSuggestions({ familyId, slotId, offset = 0 }) {
      o.checkFamily(familyId);
      await wait();
      find(slotId);
      const ranked = o.rank(slotId);
      const start = offset < ranked.length ? offset : 0;
      const counts = new Map<string, number>();
      for (const { slot } of o.slots()) if (slot.freeText) counts.set(slot.freeText, (counts.get(slot.freeText) ?? 0) + 1);
      return {
        recipes: ranked.slice(start, start + 5).map(o.suggestion),
        nextOffset: start + 5 < ranked.length ? start + 5 : 0,
        freeTexts: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([t]) => t)
      };
    },
    async setServings({ familyId, slotId, id, servings }) { o.checkFamily(familyId); await wait(); return act(id, 'set_servings', [slotId], (s) => ({ ...contentOf(s), servings })); },
    async setRecipe({ familyId, slotId, id, recipeId }) { o.checkFamily(familyId); await wait(); return act(id, 'set_recipe', [slotId], (s) => ({ ...contentOf(s), recipeId, freeText: null })); },
    async setFree({ familyId, slotId, id, text }) { o.checkFamily(familyId); await wait(); return act(id, 'set_free', [slotId], (s) => ({ ...contentOf(s), recipeId: null, freeText: text.trim() })); },
    async setNote({ familyId, slotId, id, note }) { o.checkFamily(familyId); await wait(); return act(id, 'set_note', [slotId], (s) => ({ ...contentOf(s), note: note?.trim() || null })); },
    async swap({ familyId, slotId, otherSlotId, id }) {
      o.checkFamily(familyId);
      await wait();
      const [a, b] = [find(slotId), find(otherSlotId)];
      if (slotId === otherSlotId || a.weekStartsOn !== b.weekStartsOn) throw new ApiError('invalid');
      const moved = (s: FakeSlot) => ({ recipeId: s.recipeId, freeText: s.freeText, note: s.note });
      const [ma, mb] = [moved(a.slot), moved(b.slot)];
      return act(id, 'swap', [slotId, otherSlotId], (s) => ({ ...contentOf(s), ...(s.id === slotId ? mb : ma) }));
    },
    async undo({ familyId, actionId, id }) {
      o.checkFamily(familyId);
      await wait();
      const target = actions.get(actionId);
      if (!target) throw new ApiError('not_found');
      const slotIds = target.rows.length ? target.rows.map((r) => r.slotId) : target.slotIds;
      if (!actions.has(id) && target.rows.length) {
        if (target.actorId !== o.userId) throw new ApiError('not_allowed');
        if (target.rows.some((r) => find(r.slotId).slot.lastActionId !== actionId)) throw new ApiError('not_allowed');
      }
      return act(id, 'undo', slotIds, (s) => target.rows.find((r) => r.slotId === s.id)?.before ?? contentOf(s), actionId);
    }
  };
  return {
    api,
    /** The action fields of lastChange, as the server computes them for the reader. */
    lastChangeOf(slot: FakeSlot) {
      const action = slot.lastActionId ? actions.get(slot.lastActionId) : undefined;
      if (!action) return { actionId: null, undoable: false, slotIds: [] as string[] };
      const slotIds = action.rows.map((r) => r.slotId);
      const undoable = action.actorId === o.userId && slotIds.every((sid) => find(sid).slot.lastActionId === action.id);
      return { actionId: action.id, undoable, slotIds };
    }
  };
}
```

In `createFakeApi`:

- build `const meals = createFakeMeals({...})` from the existing helpers:
  - `checkFamily`;
  - `slots` from `visibleWeeks()`;
  - `weekView` = the function `menu.getWeek` uses for its data;
  - `rank` with the round-2 rule: family average or 3, +0.1 per week since last eaten
    (up to 1), −1 for the same protein group as the meal before or after. Excluded: the
    meals of the week, those of the two weeks before, and the excluded recipes;
  - `suggestion` from `recipeSummary` and `ratingSummary`;
  - `now` from the existing `now()`;
  - `bump: () => void (state.revision += 1)`;
- at line 204, use `{ userName: author, at: slot.updatedAt, ...meals.lastChangeOf(slot) }`;
- add `meals: meals.api` to the `Api` object;
- add `meals: wrap(api.meals)` to `withTransport`.

The fake slot type must carry `lastActionId`: add the optional field to the demo slot
type, the same `FakeSlot` shape.

- [ ] **Step 4: Types, query, test server, harness**

```ts
// web/src/api/types.ts
export const SERVER_AREAS = ['session', 'profile', 'recipes', 'ratings', 'menu', 'family', 'shopping', 'meals'] as const satisfies readonly (keyof Contract)[];
export type { MealActionResult, SuggestionsView } from '@app/contract';
```

```ts
// web/src/features/meals/queries.ts
import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';
import type { Locale } from '../../i18n/translate';

export const mealKeys = {
  suggestions: (familyId: string, slotId: string, offset: number, locale: Locale) => ['meals', 'getSuggestions', { familyId, slotId, offset, locale }] as const
};

/** Not versioned (spec of the revision, 4): read when the sheet opens, always from the server. */
export function suggestionsQuery({ api, locale }: QueryDeps, familyId: string, slotId: string, offset: number) {
  return queryOptions({
    queryKey: mealKeys.suggestions(familyId, slotId, offset, locale),
    queryFn: () => api.meals.getSuggestions({ familyId, slotId, offset }),
    staleTime: 0
  });
}
```

```tsx
// web/src/test/renderApp.tsx: options gain `strict?: boolean`; the rendered tree becomes
  const tree = (
    <AppRoot /* unchanged props */>
      {options.extra}
    </AppRoot>
  );
  const result = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
```

`web/src/test/rpcServer.ts`:

- `implement({ ..., meals: contract.meals })`;
- `answerMenu` accepts `weeks: WeekView[]` (answered by `weekStartsOn`) besides `week`,
  without changing existing callers; `weekReads` records every `menu.getWeek` input;
  `currentWeek(startsOn)` returns the stored week;
- `mealCalls` records every `meals.*` call;
- `defaultMeals` are the default handlers:
  - each write applies to the stored week and answers
    `{ week, actionId: input.id, changed: true }`;
  - the changed meals get `lastChange: { userName: 'Persona dal server', at: '2026-10-08T12:00', actionId: input.id, undoable: true, slotIds }`;
  - `undo` restores the copy taken before the action;
  - `getSuggestions` answers `{ recipes: [{ recipe: SERVER_RECIPE.recipe, rating: SERVER_RECIPE.rating }], nextOffset: input.offset === 0 ? 5 : 0, freeTexts: ['Pizza'] }`;
- `answerMeals(handlers)` overrides any of them;
- `familyApi` gains `addExclusion` and `removeExclusion` (answer `[]`), recorded in `familySeen`.

```tsx
// web/src/features/meals/testApp.tsx
import type { ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import { realClients } from '../../api/clients';
import { createRpcClient } from '../../api/rpc';
import { DEMO_USER } from '../../auth/backend';
import { addDays } from '../../lib/calendar';
import { createRpcTestServer, SERVER_RECIPE } from '../../test/rpcServer';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

export const LUNCH = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const DINNER = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
export const NEXT_LUNCH = '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f';

const meal = (slotId: string, date: string, mealType: 'lunch' | 'dinner', free: string | null): MealView => ({
  slotId, date, mealType, kind: free ? 'free' : 'recipe', recipe: free ? null : SERVER_RECIPE.recipe,
  freeText: free, servings: 4, ingredients: free ? null : SERVER_RECIPE.ingredients, note: null,
  rating: free ? null : SERVER_RECIPE.rating, canOpenRecipe: !free, lastChange: null
});

const week = (startsOn: string, meals: MealView[]): WeekView => ({
  startsOn,
  days: Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startsOn, i);
    return { date, meals: meals.filter((m) => m.date === date) };
  })
});

/** Thursday 8 October with a recipe lunch and a free dinner, Monday 12 with a lunch, from the test server. */
export function realMealsApp(path = '/menu', options: { locale?: 'it-IT' | 'en-GB'; strict?: boolean; extra?: ReactNode } = {}) {
  const server = createRpcTestServer();
  server.answerMenu({
    opening: { kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' },
    weeks: [
      week('2026-10-05', [meal(LUNCH, '2026-10-08', 'lunch', null), meal(DINNER, '2026-10-08', 'dinner', 'Pizza')]),
      week('2026-10-12', [meal(NEXT_LUNCH, '2026-10-12', 'lunch', null)])
    ]
  });
  const backend = createStubBackend(DEMO_USER);
  const rpc = createRpcClient({ getCredentials: () => backend.getCredentials(), fetch: server.fetch });
  return { server, ...renderApp(path, { backend, createApi: realClients({ rpc, latencyMs: 0 }), locale: options.locale, strict: options.strict, extra: options.extra }) };
}
```

- [ ] **Step 5: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/api web/src/features/meals web/src/test
git commit -m "Web: area meals nel client vero e in quello finto, con le azioni"
```

### Task 10: mutazioni dei pasti e invalidazioni

**Files:**
- Modify: `web/src/api/mutations.ts`, `web/src/api/mutations.test.ts`, `web/src/api/ratings.ts`, `web/src/api/ratings.test.ts`
- Create: `web/src/features/meals/useMealMutation.ts`, `web/src/features/meals/useMealMutation.test.tsx`

**Interfaces:**
- Produces:
  - `MutationTarget` with `'week'`, `ApplyOptions.weekStartsOn?: string`;
  - `type MealMutationName = 'meals.setServings' | 'meals.setRecipe' | 'meals.setFree' | 'meals.setNote' | 'meals.swap' | 'meals.undo'`;
  - `runMealMutation(deps: MutationDeps, name: MealMutationName, familyId: string, weekStartsOn: string, call: () => Promise<MealActionResult>): Promise<MutationOutcome<MealActionResult>>`;
  - `useMealMutation<I>(name, familyId, weekStartsOn, call: (input: I & { id: string }) => Promise<MealActionResult>)`: `mutationFn(input: I)` resolves `{ view: MealActionResult; applied: boolean }`.

- [ ] **Step 1: Failing tests**

```ts
// web/src/api/mutations.test.ts (added; FAMILY, OTHER, deferred, flush, harness exist in the file)
const weekKey = (weekStartsOn: string, locale = 'it-IT') => ['menu', 'getWeek', { familyId: FAMILY, weekStartsOn, locale }];
const weekView = (servings: number) => ({ startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ slotId: 's', servings }] }] });
const suggestionsKey = (familyId = FAMILY) => ['meals', 'getSuggestions', { familyId, slotId: 's', offset: 0, locale: 'it-IT' }];

describe('meal mutations', () => {
  it('write the week of the meal, keep its version, make the dependent reads stale', async () => {
    const client = new QueryClient();
    client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    client.setQueryData(weekKey('2026-10-12'), { version: 'w2', data: weekView(9) });
    client.setQueryData(weekKey('2026-10-05', 'en-GB'), { version: 'w1en', data: weekView(2) });
    const stale = [
      ['menu', 'getOpening', { familyId: FAMILY, today: '2026-10-08', locale: 'it-IT' }],
      ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT' }],
      ['recipes', 'get', { familyId: FAMILY, recipeId: 'r', locale: 'it-IT' }],
      ['recipes', 'search', { familyId: FAMILY, query: {}, locale: 'it-IT' }],
      suggestionsKey()
    ];
    for (const key of stale) client.setQueryData(key, { version: 'x', data: {} });
    client.setQueryData(suggestionsKey(OTHER), { recipes: [] });
    await applyMutation(client, { name: 'meals.setServings', familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT', view: weekView(4), sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryData(weekKey('2026-10-05'))).toEqual({ version: 'w1', data: weekView(4) });
    expect(client.getQueryState(weekKey('2026-10-12'))?.isInvalidated).toBe(false);
    expect(client.getQueryState(weekKey('2026-10-05', 'en-GB'))?.isInvalidated).toBe(true);
    for (const key of stale) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(suggestionsKey(OTHER))?.isInvalidated).toBe(false);
  });

  it.each([
    'family.addExclusion', 'family.removeExclusion', 'family.setMeal', 'family.addRule', 'family.removeRule',
    'family.setKnownNew', 'family.setGroupRange', 'family.setBookOwned', 'family.setIngredientRestriction'
  ] as const)('%s makes the suggestions stale', async (name) => {
    const client = new QueryClient();
    client.setQueryData(suggestionsKey(), { recipes: [] });
    await applyMutation(client, { name, familyId: FAMILY, locale: 'it-IT', view: {}, sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryState(suggestionsKey())?.isInvalidated).toBe(true);
  });

  it('a suggestions answer still in flight never lands after the confirmation', async () => {
    const client = new QueryClient();
    const late = deferred<unknown>();
    void client.fetchQuery({ queryKey: suggestionsKey(), queryFn: () => late.promise }).catch(() => undefined);
    await applyMutation(client, { name: 'family.addExclusion', familyId: FAMILY, locale: 'it-IT', view: [], sessionOpen: () => true, isLatest: () => true });
    late.resolve({ recipes: ['old'] });
    await flush();
    expect(client.getQueryData(suggestionsKey())).not.toEqual({ recipes: ['old'] });
  });

  it('a superseded answer of the same week is not written', async () => {
    const h = harness();
    h.client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    const deps = { queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' };
    const answer = (servings: number, actionId: string) => ({ week: weekView(servings), actionId, changed: true }) as unknown as MealActionResult;
    const slow = deferred<MealActionResult>();
    const first = runMealMutation(deps, 'meals.setServings', FAMILY, '2026-10-05', () => slow.promise);
    await runMealMutation(deps, 'meals.setNote', FAMILY, '2026-10-05', async () => answer(5, 'b'));
    slow.resolve(answer(3, 'a'));
    expect((await first).applied).toBe(false);
    expect((h.client.getQueryData(weekKey('2026-10-05')) as { data: unknown }).data).toEqual(weekView(5));
  });
});
```

(Import `runMealMutation` from `./mutations` and `type MealActionResult` from `./types`.)

```ts
// web/src/api/ratings.test.ts (added)
it('a rating cancels and invalidates the suggestions of the family', async () => {
  const client = new QueryClient();
  const key = ['meals', 'getSuggestions', { familyId: FAMILY, slotId: 's', offset: 0, locale: 'it-IT' }];
  client.setQueryData(key, { recipes: [] });
  await applyRating(client, FAMILY, 'r', { familyAverage: 4, familyCount: 1, myStars: 4 });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
```

(Use the family constant the file already defines.)

- [ ] **Step 2: Run** `npm test -w web -- mutations ratings` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/api/mutations.ts
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week';

const SUGGESTIONS = { area: 'meals', operation: 'getSuggestions' } as const;
const MEAL_STALE = familyReads(
  { area: 'menu', operation: 'getOpening' },
  { area: 'shopping', operation: 'getWeekList' },
  { area: 'recipes', operation: 'get' },
  { area: 'recipes', operation: 'search' },
  SUGGESTIONS
);

// INVALIDATIONS: rows changed or added
  'family.setMeal': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.addRule': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.removeRule': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setKnownNew': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setGroupRange': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setBookOwned': { target: 'settings', stale: familyReads({ area: 'recipes', operation: 'search' }, { area: 'recipes', operation: 'get' }, SUGGESTIONS) },
  'family.setIngredientRestriction': { target: 'settings', stale: familyReads({ area: 'shopping' }, SUGGESTIONS) },
  'family.addExclusion': { target: 'exclusions', stale: familyReads(SUGGESTIONS) },
  'family.removeExclusion': { target: 'exclusions', stale: familyReads(SUGGESTIONS) },
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
    query.queryKey[0] === area &&
    query.queryKey[1] === operation &&
    (target === 'profile' || familyOfKey(query.queryKey) === familyId) &&
    (target !== 'week' || (query.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn);
}
```

`ApplyOptions` gets `weekStartsOn?: string`; `applyMutation` passes it to `targetKey` and
`sameView` (the rest already cancels target and stale reads before writing, which is what
keeps a late suggestions answer from landing). Then:

```ts
import type { MealActionResult } from './types';

export type MealMutationName = Extract<MutationName, `meals.${string}`>;

/** As runAreaMutation for the meals: the target is the week of the meal (spec of the revision, 5). */
export async function runMealMutation(
  deps: MutationDeps,
  name: MealMutationName,
  familyId: string,
  weekStartsOn: string,
  call: () => Promise<MealActionResult>
): Promise<MutationOutcome<MealActionResult>> {
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

```ts
// web/src/api/ratings.ts
const isSuggestions = (query: Query) => query.queryKey[0] === 'meals' && query.queryKey[1] === 'getSuggestions';
// in applyRating:
  const affected = (query: Query) => ofFamily(familyId)(query) && (showsRatings(query) || isSuggestions(query));
// after the existing invalidation of recipes.search:
  void queryClient.invalidateQueries({ predicate: (query) => ofFamily(familyId)(query) && isSuggestions(query) });
```

```ts
// web/src/features/meals/useMealMutation.ts
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../api/errors';
import { runMealMutation, type MealMutationName } from '../../api/mutations';
import type { MealActionResult } from '../../api/types';
import { isOnline } from '../../lib/connectivity';
import { useCurrentLocale, useSession } from '../../session/SessionScope';

/** Sends one meal action with a new id; refused at once offline (offline: false in the contract). */
export function useMealMutation<I>(name: MealMutationName, familyId: string, weekStartsOn: string, call: (input: I & { id: string }) => Promise<MealActionResult>) {
  const session = useSession();
  const currentLocale = useCurrentLocale();
  return useMutation({
    meta: { familyId },
    mutationFn: async (input: I) => {
      if (!isOnline()) throw new ApiError('network');
      const id = crypto.randomUUID();
      return runMealMutation({ queryClient: session.queryClient, session, currentLocale }, name, familyId, weekStartsOn, () => call({ ...input, id }));
    }
  });
}
```

```tsx
// web/src/features/meals/useMealMutation.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setOnline } from '../../test/connectivity';
import { sessionWrapper } from '../../test/sessionHarness';
import { useMealMutation } from './useMealMutation';

describe('useMealMutation', () => {
  it('offline: network at once, no call', async () => {
    const call = vi.fn();
    const { result } = renderHook(() => useMealMutation('meals.setNote', 'f', '2026-10-05', call), { wrapper: sessionWrapper() });
    act(() => setOnline(false));
    await act(() => result.current.mutateAsync({}).catch(() => undefined));
    expect(call).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ code: 'network' });
    act(() => setOnline(true));
  });
  it('a new uuid per call', async () => {
    const ids: string[] = [];
    const call = vi.fn(async ({ id }: { id: string }) => { ids.push(id); return { week: { startsOn: '2026-10-05', days: [] }, actionId: id, changed: true } as never; });
    const { result } = renderHook(() => useMealMutation('meals.setNote', 'f', '2026-10-05', call), { wrapper: sessionWrapper() });
    await act(() => result.current.mutateAsync({}));
    await act(() => result.current.mutateAsync({}));
    await waitFor(() => expect(ids).toHaveLength(2));
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

(Use the session wrapper `web/src/test/sessionHarness.tsx` provides; if it exports a
differently named helper, use that.)

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api web/src/features/meals/useMealMutation.ts web/src/features/meals/useMealMutation.test.tsx
git commit -m "Web: mutazioni dei pasti sulla vista della settimana e matrice delle invalidazioni dei suggerimenti"
```

### Task 11: scheda del pasto, matita, pannello e porzioni

**Files:**
- Create: `web/src/i18n/messages/meals.ts`; modify `web/src/i18n/messages/index.ts`
- Modify: `web/src/components/Icon.tsx` (`edit`), `web/src/components/RecipeCard.tsx`, `web/src/components/RecipeCard.test.tsx`
- Create: `web/src/features/meals/useServingsDraft.ts`, `MealActions.tsx`, `MealEditor.tsx`, `UndoProvider.tsx`, `meals.module.css`, `MealActions.test.tsx`
- Modify: `web/src/routes/MenuPage.tsx`

**Interfaces:**
- Consumes: `useMealMutation`, `runMealMutation` (Task 10), `ServingsStepper({ value, min, max, onChange })`, `useOnline` (`web/src/components/OfflineBanner.tsx`), `BottomSheet`.
- Produces:
  - `CardActions = { label: string; disabled: boolean; panel: ReactNode; onToggle?: (open: boolean) => void; onChooseRecipe?: () => void }`, `RecipeCardProps.actions?: CardActions`;
  - `useServingsDraft({ familyId, weekStartsOn, slotId, servings, online, onSaved })` → `{ value: number; busy: boolean; step(next: number): void; flush(): void }`;
  - `useMealActions({ familyId, weekStartsOn, meal, week, online })` → `{ actions: CardActions; sheet: ReactNode }`;
  - `UndoProvider({ familyId, children })`, `useUndo(): { current: UndoOffer | null; offer(actionId: string, weekStartsOn: string): void; clear(): void }`;
  - `EditorStage = 'picker' | 'swap' | 'free' | 'note'`, `MealEditor` (stages filled in Tasks 12-13).

- [ ] **Step 1: Messages**

```ts
// web/src/i18n/messages/meals.ts
export const it = {
  'meals.edit': 'Modifica il pasto',
  'meals.changeRecipe': 'Cambia ricetta',
  'meals.chooseRecipe': 'Scegli una ricetta',
  'meals.note': 'Nota',
  'meals.markFree': 'Segna come pasto libero',
  'meals.exclude': 'Non proporre più',
  'meals.swap': 'Scambia con un altro pasto',
  'meals.suggestions': 'Suggerimenti',
  'meals.more': 'Proponimene altri',
  'meals.search': 'Cerca nel ricettario',
  'meals.pick': 'Scegli {recipe}',
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
  'meals.sending': 'Salvataggio…',
  'meals.noSuggestions': 'Nessuna ricetta adatta: prova con la ricerca.',
  'meals.noResults': 'Nessuna ricetta trovata.',
  'meals.myStars': 'Il tuo voto: {count}',
  'meals.notRated': 'Non hai votato'
} as const;

export const en: Record<keyof typeof it, string> = {
  'meals.edit': 'Edit the meal',
  'meals.changeRecipe': 'Change recipe',
  'meals.chooseRecipe': 'Choose a recipe',
  'meals.note': 'Note',
  'meals.markFree': 'Mark as a free meal',
  'meals.exclude': 'Don’t suggest again',
  'meals.swap': 'Swap with another meal',
  'meals.suggestions': 'Suggestions',
  'meals.more': 'Suggest others',
  'meals.search': 'Search the recipe book',
  'meals.pick': 'Choose {recipe}',
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
  'meals.sending': 'Saving…',
  'meals.noSuggestions': 'No suitable recipe: try the search.',
  'meals.noResults': 'No recipe found.',
  'meals.myStars': 'Your rating: {count}',
  'meals.notRated': 'You haven’t rated it'
};
```

`web/src/i18n/messages/index.ts`: `import * as meals from './meals';` and `...meals.it` /
`...meals.en` in the two spreads.

- [ ] **Step 2: Failing tests**

```tsx
// web/src/features/meals/MealActions.test.tsx
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOnline } from '../../test/connectivity';
import * as family from '../../i18n/messages/family';
import * as meals from '../../i18n/messages/meals';
import { realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const card = (name: RegExp) => screen.findByRole('article', { name });
const pencil = (article: HTMLElement) => within(article).getByRole('button', { name: 'Modifica il pasto' }) as HTMLButtonElement;
const more = (article: HTMLElement) => within(article).getByRole('button', { name: 'Una porzione in più' }) as HTMLButtonElement;
const servingsCalls = (server: ReturnType<typeof realMealsApp>['server']) => server.mealCalls.filter((c) => c.op === 'meals.setServings');

describe('meal card actions', () => {
  it('every kind has the pencil; only a recipe has rating and ingredients; one panel at a time', async () => {
    realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    const dinner = await card(/Pizza/);
    expect(pencil(dinner)).toBeTruthy();
    expect(within(dinner).queryByRole('button', { name: /ingredienti/i })).toBeNull();
    fireEvent.click(within(lunch).getByRole('button', { name: /ingredienti/i }));
    expect(within(lunch).getByText('Ceci', { exact: false })).toBeTruthy();
    fireEvent.click(pencil(lunch));
    expect(within(lunch).getByRole('button', { name: 'Cambia ricetta' })).toBeTruthy();
    expect(within(lunch).queryByText('Ceci', { exact: false })).toBeNull();
  });

  it('a free meal has no servings in the panel but can change recipe and note', async () => {
    realMealsApp();
    const dinner = await card(/Pizza/);
    fireEvent.click(pencil(dinner));
    expect(within(dinner).queryByRole('button', { name: 'Una porzione in più' })).toBeNull();
    expect(within(dinner).getByRole('button', { name: 'Cambia ricetta' })).toBeTruthy();
    expect(within(dinner).getByRole('button', { name: 'Nota' })).toBeTruthy();
  });

  it('servings: three taps, one request after 800 ms, one undo restores', async () => {
    const { server } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    for (let i = 0; i < 3; i++) fireEvent.click(more(lunch));
    expect(servingsCalls(server)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(servingsCalls(server).map((c) => c.input.servings)).toEqual([7]));
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(within(lunch).getByText(/4 porzioni/)).toBeTruthy());
    expect(server.mealCalls.filter((c) => c.op === 'meals.undo')).toHaveLength(1);
  });

  it('closing the panel sends the pending value at once; the stepper is disabled until the answer', async () => {
    const { server } = realMealsApp();
    let release: () => void = () => {};
    server.answerMeals({ setServings: (input) => new Promise((done) => (release = () => done(server.defaultMeals.setServings(input)))) });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    fireEvent.click(pencil(lunch));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
    fireEvent.click(pencil(lunch));
    expect(more(lunch).disabled).toBe(true);
    expect(within(lunch).getByText(/5 porzioni/)).toBeTruthy();
    release();
    await waitFor(() => expect(more(lunch).disabled).toBe(false));
  });

  it('leaving the menu sends the pending value once, without undo', async () => {
    const { server, history } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => history.push('/recipes'));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('losing the network: nothing is sent, the value goes back, the controls are disabled', async () => {
    const { server } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    act(() => setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(servingsCalls(server)).toHaveLength(0);
    expect(within(lunch).getByText(/4 porzioni/)).toBeTruthy();
    expect(pencil(lunch).disabled).toBe(true);
    act(() => setOnline(true));
  });

  it('the labels match the empty state of the exclusions', () => {
    expect(family.it['exclusions.emptyBody']).toContain(`«${meals.it['meals.changeRecipe']}»`);
    expect(family.it['exclusions.emptyBody']).toContain(`«${meals.it['meals.exclude']}»`);
    expect(family.en['exclusions.emptyBody']).toContain(`“${meals.en['meals.changeRecipe']}”`);
    expect(family.en['exclusions.emptyBody']).toContain(`“${meals.en['meals.exclude']}”`);
  });
});

describe('servings in Strict Mode', () => {
  it('one request for one adjustment', async () => {
    const { server } = realMealsApp('/menu', { strict: true });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
  });
});
```

`RecipeCard.test.tsx` (`renderWithProviders`): with `actions` a recipe card shows details,
rating, ingredients and pencil, a free card and an empty card only the pencil, the empty
card also «Scegli una ricetta»; without `actions` (catalogue) the card is as today; a card
re-rendered from `kind: 'recipe'` with the ingredients panel open to `kind: 'free'` shows
no panel.

- [ ] **Step 3: Run** `npm test -w web -- MealActions RecipeCard` — Expected: FAIL.

- [ ] **Step 4: `RecipeCard`**

```tsx
// web/src/components/RecipeCard.tsx (changes)
import { useEffect, useState, type ReactNode } from 'react';

/** Meal actions of the menu (round 2): the pencil in the footer and its panel under it. */
export interface CardActions {
  label: string;
  disabled: boolean;
  panel: ReactNode;
  onToggle?: (open: boolean) => void;
  /** Empty slot: «Scegli una ricetta» in the content. */
  onChooseRecipe?: () => void;
}
// RecipeCardProps gains: actions?: CardActions;

  const [open, setOpen] = useState<'rating' | 'ingredients' | 'actions' | null>(null);
  const hasRecipe = kind === 'recipe' && !!recipe;
  const toggle = (section: 'rating' | 'ingredients' | 'actions') =>
    setOpen((current) => {
      const next = current === section ? null : section;
      if (current === 'actions' || next === 'actions') queueMicrotask(() => actions?.onToggle?.(next === 'actions'));
      return next;
    });
  // One panel at a time (round 2); a meal that no longer has a recipe closes the recipe panels,
  // actions disabled (offline) close their panel.
  useEffect(() => {
    if (!hasRecipe) setOpen((current) => (current === 'actions' ? current : null));
  }, [hasRecipe]);
  useEffect(() => {
    if (actions?.disabled) setOpen((current) => (current === 'actions' ? null : current));
  }, [actions?.disabled]);
```

(The callback to the parent runs in a microtask, outside the state updater, so Strict
Mode's double call of the updater never calls it twice.)

The empty branch of the content gains, after the description:

```tsx
            {actions?.onChooseRecipe && (
              <button type="button" className="text-button" disabled={actions.disabled} onClick={actions.onChooseRecipe}>{t('meals.chooseRecipe')}</button>
            )}
```

The footer block replaces `{kind === 'recipe' && recipe && (` with
`{(hasRecipe || actions) && (`. Inside it, the details link, rating button and ingredients
button are each wrapped in `hasRecipe &&` (`recipe!` where TypeScript needs it). After them:

```tsx
            {actions && (
              <button type="button" className={styles.action} aria-expanded={open === 'actions'} aria-label={actions.label} disabled={actions.disabled} onClick={() => toggle('actions')}>
                <Icon name="edit" />
              </button>
            )}
          </div>
          {open === 'actions' && actions && <div className={styles.panel}>{actions.panel}</div>}
```

The rating and ingredients panels keep their code with `hasRecipe &&` in the condition.

`Icon.tsx`: add `'edit'` to `IconName` and its `PATHS` entry, copied from the prototype's
`icon-edit` symbol (`grep -n "icon-edit" -A4 prototype/src/lib/components/IconLibrary.svelte`).

- [ ] **Step 5: `useServingsDraft`**

```ts
// web/src/features/meals/useServingsDraft.ts
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { runMealMutation } from '../../api/mutations';
import { useCurrentLocale, useSession } from '../../session/SessionScope';
import { useMealMutation } from './useMealMutation';

export const SAVE_DELAY_MS = 800;

/**
 * Servings with a delayed save (round 2): the value shown and the value to save are separate;
 * the save never runs inside a state update (Strict Mode replays those), leaves at once when the
 * panel closes, still leaves when the card unmounts (without the undo offer) and never offline.
 */
export function useServingsDraft(o: { familyId: string; weekStartsOn: string; slotId: string; servings: number; online: boolean; onSaved(actionId: string, changed: boolean): void }) {
  const api = useApi();
  const session = useSession();
  const currentLocale = useCurrentLocale();
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(o);
  latest.current = o;
  const save = useMealMutation<{ servings: number }>('meals.setServings', o.familyId, o.weekStartsOn, ({ servings, id }) =>
    api.meals.setServings({ familyId: o.familyId, slotId: o.slotId, servings, id })
  );

  const flush = () => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    if (!latest.current.online || value === latest.current.servings) {
      setDraft(null);
      return;
    }
    save.mutate({ servings: value }, {
      onSuccess: ({ view }) => latest.current.onSaved(view.actionId, view.changed),
      onSettled: () => setDraft(null)
    });
  };

  const step = (next: number) => {
    pending.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  // Offline: a pending value is dropped and the server's value comes back.
  useEffect(() => {
    if (!o.online && pending.current !== null) {
      clearTimeout(timer.current);
      pending.current = null;
      setDraft(null);
    }
  }, [o.online]);

  // Unmount (navigation): the pending value still leaves, through the session, without the undo offer.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const value = pending.current;
      pending.current = null;
      const { familyId, weekStartsOn, slotId, servings, online } = latest.current;
      if (value === null || value === servings || !online) return;
      void runMealMutation({ queryClient: session.queryClient, session, currentLocale }, 'meals.setServings', familyId, weekStartsOn, () =>
        api.meals.setServings({ familyId, slotId, servings: value, id: crypto.randomUUID() })
      ).catch(() => undefined);
    },
    // Mount and unmount only: the latest values are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { value: draft ?? o.servings, busy: save.isPending, step, flush };
}
```

(`draft` stays set until `onSettled`, so the stepper shows the value sent until the answer.
In Strict Mode the development double mount runs the unmount cleanup once with nothing
pending: no request.)

- [ ] **Step 6: `UndoProvider`, `useMealActions`, `MealEditor`, `MenuPage`**

```tsx
// web/src/features/meals/UndoProvider.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useT } from '../../i18n/LocaleProvider';
import { useMealMutation } from './useMealMutation';

export interface UndoOffer { actionId: string; weekStartsOn: string; key: number }
interface UndoState { current: UndoOffer | null; offer(actionId: string, weekStartsOn: string): void; clear(): void }
const UndoContext = createContext<UndoState | null>(null);

/** Provisional undo (replaced by UndoToast in Task 14): a status line with «Annulla». */
function ProvisionalUndo({ offer, familyId, onDone }: { offer: UndoOffer; familyId: string; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useMealMutation<Record<string, never>>('meals.undo', familyId, offer.weekStartsOn, ({ id }) => api.meals.undo({ familyId, actionId: offer.actionId, id }));
  return (
    <div role="status">
      {t('meals.changed')} <button type="button" onClick={() => undo.mutate({}, { onSuccess: onDone })}>{t('meals.undo')}</button>
    </div>
  );
}

/** The last action the user can undo (one at a time: a new one replaces it). */
export function UndoProvider({ familyId, children }: { familyId: string; children: ReactNode }) {
  const [current, setCurrent] = useState<UndoOffer | null>(null);
  const offer = useCallback((actionId: string, weekStartsOn: string) => setCurrent({ actionId, weekStartsOn, key: Date.now() }), []);
  const clear = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, offer, clear }), [current, offer, clear]);
  return (
    <UndoContext.Provider value={value}>
      {children}
      {current && <ProvisionalUndo key={current.key} offer={current} familyId={familyId} onDone={clear} />}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoState {
  const value = useContext(UndoContext);
  if (!value) throw new Error('useUndo outside UndoProvider');
  return value;
}
```

```tsx
// web/src/features/meals/MealEditor.tsx (stages filled in Tasks 12-13)
import type { ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import { BottomSheet } from '../../components/BottomSheet';
import { useT } from '../../i18n/LocaleProvider';

export type EditorStage = 'picker' | 'swap' | 'free' | 'note';

/** The sheet of round 2: change recipe, swap, free meal and note. */
export function MealEditor(props: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; stage: EditorStage; onStage: (s: EditorStage) => void; onClose: () => void }) {
  const t = useT();
  const titles: Record<EditorStage, string> = { picker: t('meals.changeRecipe'), swap: t('meals.swapTitle'), free: t('meals.freeTitle'), note: t('meals.note') };
  const content: Record<EditorStage, ReactNode> = { picker: null, swap: null, free: null, note: null };
  return <BottomSheet open title={titles[props.stage]} onClose={props.onClose}>{content[props.stage]}</BottomSheet>;
}
```

```tsx
// web/src/features/meals/MealActions.tsx
import { useState, type ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import type { CardActions } from '../../components/RecipeCard';
import { ServingsStepper } from '../../components/ServingsStepper';
import { useT } from '../../i18n/LocaleProvider';
import { MealEditor, type EditorStage } from './MealEditor';
import { useUndo } from './UndoProvider';
import { useServingsDraft } from './useServingsDraft';
import styles from './meals.module.css';

const MAX_SERVINGS = 20;

/** Pencil, panel under the card (round 2: servings, change recipe, note) and the editor sheet. */
export function useMealActions({ familyId, weekStartsOn, meal, week, online }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; online: boolean }): { actions: CardActions; sheet: ReactNode } {
  const t = useT();
  const undo = useUndo();
  const [stage, setStage] = useState<EditorStage | null>(null);
  const servings = useServingsDraft({
    familyId, weekStartsOn, slotId: meal.slotId, servings: meal.servings, online,
    onSaved: (actionId, changed) => {
      if (changed) undo.offer(actionId, weekStartsOn);
    }
  });
  const panel = (
    <ul className={styles.panel}>
      {meal.kind === 'recipe' && (
        <li>
          {/* ServingsStepper has no disabled prop: the fieldset disables its buttons. */}
          <fieldset disabled={servings.busy || !online} className={styles.plain}>
            <ServingsStepper value={servings.value} min={1} max={MAX_SERVINGS} onChange={servings.step} />
          </fieldset>
          {servings.busy && <p className="meta-line" role="status">{t('meals.sending')}</p>}
        </li>
      )}
      <li><button type="button" className="text-button wide" disabled={!online} onClick={() => setStage('picker')}>{t('meals.changeRecipe')}</button></li>
      <li><button type="button" className="text-button wide" disabled={!online} onClick={() => setStage('note')}>{t('meals.note')}</button></li>
    </ul>
  );
  return {
    actions: {
      label: t('meals.edit'),
      disabled: !online,
      panel,
      onToggle: (open) => {
        if (!open) servings.flush();
      },
      onChooseRecipe: meal.kind === 'empty' ? () => setStage('picker') : undefined
    },
    sheet: stage && <MealEditor familyId={familyId} weekStartsOn={weekStartsOn} meal={meal} week={week} stage={stage} onStage={setStage} onClose={() => setStage(null)} />
  };
}
```

`MenuPage.tsx`:

- wrap the `<section className="calendar app-view">` in `<UndoProvider familyId={familyId}>`;
- move the rendering of one meal into a component `MenuMeal({ meal, week, familyId, now })`
  in the same file;
- `MenuMeal` calls `useMealActions({ familyId, weekStartsOn: week.startsOn, meal, week, online: useOnline() })`
  and renders the existing `<RecipeCard …/>` with `actions={actions}`, then `{sheet}`;
- import `useOnline` from `../components/OfflineBanner`.

`meals.module.css`: `.panel` (list without bullets, rows separated by `var(--rule)`, as the
prototype's `MealActionList.svelte`), `.plain` (`border: 0; padding: 0; margin: 0;`), and
the classes used in Tasks 12-13 (`.picker`, `.topActions`, `.title`, `.cards`,
`.suggestion`, `.name`, `.description`, `.rows`, `.notice`) copied from
`RecipePicker.svelte`, `SwapPicker.svelte` and `MealEditor.svelte` with the tokens of
`web/src/design/tokens.css`.

- [ ] **Step 7: Run** `npm run typecheck && npm test -w web` — Expected: PASS (existing `MenuPage`, `RecipeCard`, `RecipesPage` tests still green).

- [ ] **Step 8: Commit**

```bash
git add web/src/i18n/messages web/src/components web/src/features/meals web/src/routes/MenuPage.tsx
git commit -m "Web: matita per ogni pasto, un pannello alla volta, porzioni con salvataggio differito"
```

### Task 12: foglio «Cambia ricetta»: suggerimenti, ricerca, esclusione

**Files:**
- Modify: `web/src/features/meals/MealEditor.tsx`, `web/src/components/RatingStars.tsx`, `web/src/components/RatingStars.test.tsx`
- Create: `web/src/features/meals/RecipePicker.tsx`, `web/src/features/meals/useMealErrors.ts`, `web/src/features/meals/RecipePicker.test.tsx`

**Interfaces:**
- Consumes: `suggestionsQuery` (Task 9), `searchQuery(deps, familyId, query)`, `RecipeFilters({ query, onChange })`, `useAreaMutation(name, familyId, call)`, `useMealMutation`, `useUndo`, `toApiError`, `errorKey`, `familyOfKey`.
- Produces: `RatingStars` prop `readOnly?: boolean`; `RecipePicker({ familyId, weekStartsOn, meal, onStage, onDone })`; `useMealErrors(familyId, weekStartsOn): (error: unknown) => string`.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/RecipePicker.test.tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_RECIPE } from '../../test/rpcServer';
import { DINNER, realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const NAME = SERVER_RECIPE.recipe.name;

async function openPicker(card: RegExp, labels = { edit: 'Modifica il pasto', change: 'Cambia ricetta' }) {
  const article = await screen.findByRole('article', { name: card });
  fireEvent.click(within(article).getByRole('button', { name: labels.edit }));
  fireEvent.click(within(article).getByRole('button', { name: labels.change }));
  return { article, sheet: await screen.findByRole('dialog') };
}

describe('change recipe', () => {
  it('suggestions with read-only stars; «Proponimene altri» changes page, not the meal', async () => {
    const { server } = realMealsApp();
    const { article, sheet } = await openPicker(new RegExp(NAME));
    await within(sheet).findByRole('button', { name: `Scegli ${NAME}` });
    expect(within(sheet).queryAllByRole('radio')).toHaveLength(0);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Proponimene altri' }));
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.getSuggestions').map((c) => c.input.offset)).toContain(5));
    expect(server.mealCalls.some((c) => c.op.startsWith('meals.set'))).toBe(false);
    expect(within(article).getByRole('heading', { level: 3 }).textContent).toContain(NAME);
  });

  it('choosing a suggestion changes the meal and closes the sheet', async () => {
    const { server } = realMealsApp();
    const { sheet } = await openPicker(/Pizza/);
    fireEvent.click(await within(sheet).findByRole('button', { name: `Scegli ${NAME}` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.mealCalls.find((c) => c.op === 'meals.setRecipe')?.input).toMatchObject({ slotId: DINNER, recipeId: SERVER_RECIPE.recipe.id });
  });

  it.each([
    ['it-IT', { edit: 'Modifica il pasto', change: 'Cambia ricetta', toggle: 'Filtri e ordinamento', group: 'Gruppo alimentare', pick: 'Scegli', none: 'Nessun voto' }],
    ['en-GB', { edit: 'Edit the meal', change: 'Change recipe', toggle: 'Filters and sorting', group: 'Food group', pick: 'Choose', none: 'No ratings' }]
  ] as const)('the search runs with filters only and shows the read-only rating (%s)', async (locale, l) => {
    const { server } = realMealsApp('/menu', { locale });
    const { sheet } = await openPicker(/Pizza/, l);
    fireEvent.click(within(sheet).getByRole('button', { name: l.toggle }));
    fireEvent.change(within(sheet).getByRole('combobox', { name: l.group }), { target: { value: 'legumes' } });
    await waitFor(() => expect(server.recipeCalls.find((c) => c.op === 'recipes.search')?.input).toMatchObject({ query: { proteinGroup: 'legumes' } }));
    const results = await within(sheet).findByRole('list', { name: /risultati|results/i });
    const row = within(results).getByRole('button', { name: `${l.pick} ${NAME}` }).closest('li')!;
    expect(within(row).getByLabelText(l.none)).toBeTruthy();
    expect(within(row).queryAllByRole('radio')).toHaveLength(0);
  });

  it('«Non proporre più» excludes, offers the undo in the sheet, keeps the meal until a choice', async () => {
    const { server } = realMealsApp();
    const { article, sheet } = await openPicker(new RegExp(NAME));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Non proporre più' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Annulla esclusione' }));
    await waitFor(() => expect(server.familySeen.map((c) => c.operation)).toEqual(expect.arrayContaining(['addExclusion', 'removeExclusion'])));
    fireEvent.click(within(sheet).getByRole('button', { name: /Chiudi/ }));
    expect(within(article).getByRole('heading', { level: 3 }).textContent).toContain(NAME);
    expect(server.mealCalls.some((c) => c.op === 'meals.setRecipe')).toBe(false);
  });
});
```

(The English label of `recipes.filter.group` must be «Food group»: check
`web/src/i18n/messages/recipes.ts` and use its value. The results list gets
`aria-label={t('meals.results')}` — add `'meals.results': 'Risultati'` / `'Results'` to the
dictionary. The sheet's close button label comes from `BottomSheet`: check it and use it.)

`RatingStars.test.tsx` (added): with `readOnly` the component shows the average with its
label, «Il tuo voto: 4» or «Non hai votato», and no radios.

- [ ] **Step 2: Run** `npm test -w web -- RecipePicker RatingStars` — Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/components/RatingStars.tsx (changes)
interface Props { summary: RatingSummary; recipeId: string; recipeName: string; familyId: string; readOnly?: boolean }

export function RatingStars({ summary, recipeId, recipeName, familyId, readOnly }: Props) {
  // ...existing hooks unchanged
  return (
    <div className={styles.rating}>
      <div className={styles.row}>
        {/* existing <p className={styles.average} …> unchanged */}
        {readOnly ? (
          <p className="meta-line">{summary.myStars === null ? t('meals.notRated') : t('meals.myStars', { count: summary.myStars })}</p>
        ) : (
          /* existing <fieldset …> unchanged */
        )}
      </div>
      {!readOnly && rate.isPending && <p className="meta-line" role="status">{t('rating.sending')}</p>}
      {!readOnly && rate.isError && <p className="meta-line" role="alert">{t(errorKey(rate.error))}</p>}
    </div>
  );
}
```

```ts
// web/src/features/meals/useMealErrors.ts
import { useQueryClient } from '@tanstack/react-query';
import { errorKey, toApiError } from '../../api/errors';
import { familyOfKey } from '../../api/queries';
import { useT } from '../../i18n/LocaleProvider';

/** Message for a failed meal action; not_found and not_allowed read the meal's week again. */
export function useMealErrors(familyId: string, weekStartsOn: string) {
  const t = useT();
  const queryClient = useQueryClient();
  return (error: unknown): string => {
    const { code } = toApiError(error);
    if (code === 'not_found' || code === 'not_allowed') {
      void queryClient.invalidateQueries({
        queryKey: ['menu', 'getWeek'],
        predicate: (q) => familyOfKey(q.queryKey) === familyId && (q.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn
      });
    }
    if (code === 'not_found') return t('meals.gone');
    if (code === 'not_allowed') return t('meals.undoRefused');
    if (code === 'network') return t('meals.offline');
    return t(errorKey(error));
  };
}
```

```tsx
// web/src/features/meals/RecipePicker.tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useAreaMutation } from '../../api/mutations';
import { searchQuery, useQueryDeps } from '../../api/queries';
import type { MealView, RecipeQuery } from '../../api/types';
import { RatingStars } from '../../components/RatingStars';
import { RecipeFilters } from '../../components/RecipeFilters';
import { useT } from '../../i18n/LocaleProvider';
import type { EditorStage } from './MealEditor';
import { suggestionsQuery } from './queries';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

const MAX_RESULTS = 30;

/** «Cambia ricetta» (round 2 review): free, exclude and swap first, then suggestions, then search. */
export function RecipePicker({ familyId, weekStartsOn, meal, onStage, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onStage: (stage: EditorStage) => void; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const deps = useQueryDeps();
  const undo = useUndo();
  const message = useMealErrors(familyId, weekStartsOn);
  const [offset, setOffset] = useState(0);
  // Starts on the slot's meal; results appear once the user types or changes a filter (prototype).
  const [query, setQuery] = useState<RecipeQuery>({ mealType: meal.mealType });
  const searching = !!query.text || query.mealType !== meal.mealType || !!query.maxMinutes || !!query.proteinGroup || !!query.minStars || !!query.sort || !!query.reversed;
  const [excluded, setExcluded] = useState<{ id: string; name: string } | null>(null);
  const suggestions = useQuery(suggestionsQuery(deps, familyId, meal.slotId, offset));
  const search = useQuery({ ...searchQuery(deps, familyId, query), enabled: searching });
  const setRecipe = useMealMutation<{ recipeId: string }>('meals.setRecipe', familyId, weekStartsOn, ({ recipeId, id }) =>
    api.meals.setRecipe({ familyId, slotId: meal.slotId, recipeId, id })
  );
  const exclude = useAreaMutation('family.addExclusion', familyId, (recipeId: string) => api.family.addExclusion({ familyId, recipeId }));
  const include = useAreaMutation('family.removeExclusion', familyId, (recipeId: string) => api.family.removeExclusion({ familyId, recipeId }));
  const choose = (recipeId: string) =>
    setRecipe.mutate({ recipeId }, {
      onSuccess: ({ view }) => {
        if (view.changed) undo.offer(view.actionId, weekStartsOn);
        onDone();
      }
    });
  const results = (search.data?.items ?? []).filter((item) => item.recipe.id !== meal.recipe?.id).slice(0, MAX_RESULTS);
  const current = meal.recipe;
  return (
    <div className={styles.picker}>
      {excluded && (
        <p className={styles.notice} role="status">
          {t('meals.excluded', { name: excluded.name })}{' '}
          <button type="button" className="text-button" disabled={include.isPending} onClick={() => include.mutate(excluded.id, { onSuccess: () => setExcluded(null) })}>{t('meals.undoExclusion')}</button>
        </p>
      )}
      <ul className={styles.topActions}>
        <li><button type="button" className="text-button wide" onClick={() => onStage('free')}>{t('meals.markFree')}</button></li>
        {current && !excluded && (
          <li>
            <button type="button" className="text-button wide" disabled={exclude.isPending} onClick={() => exclude.mutate(current.id, { onSuccess: () => setExcluded({ id: current.id, name: current.name }) })}>
              {t('meals.exclude')}
            </button>
          </li>
        )}
        <li><button type="button" className="text-button wide" onClick={() => onStage('swap')}>{t('meals.swap')}</button></li>
      </ul>
      {setRecipe.isError && <p role="alert">{message(setRecipe.error)}</p>}
      <section aria-labelledby={`${meal.slotId}-suggestions`}>
        <h3 id={`${meal.slotId}-suggestions`} className={styles.title}>{t('meals.suggestions')}</h3>
        {suggestions.data?.recipes.length === 0 && <p className="meta-line">{t('meals.noSuggestions')}</p>}
        <ul className={styles.cards}>
          {suggestions.data?.recipes.map(({ recipe, rating }) => (
            <li key={recipe.id} className={styles.suggestion}>
              <button type="button" aria-label={t('meals.pick', { recipe: recipe.name })} disabled={setRecipe.isPending} onClick={() => choose(recipe.id)}>
                <span className={styles.name}>{recipe.name}</span>
                {recipe.description && <span className={styles.description}>{recipe.description}</span>}
              </button>
              <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} readOnly />
            </li>
          ))}
        </ul>
        {!!suggestions.data?.recipes.length && (suggestions.data.nextOffset !== 0 || offset !== 0) && (
          <button type="button" className="text-button" onClick={() => setOffset(suggestions.data!.nextOffset)}>{t('meals.more')}</button>
        )}
      </section>
      <section aria-labelledby={`${meal.slotId}-search`}>
        <h3 id={`${meal.slotId}-search`} className={styles.title}>{t('meals.search')}</h3>
        <RecipeFilters query={query} onChange={setQuery} />
        {searching && (results.length > 0 ? (
          <ul className={styles.rows} aria-label={t('meals.results')}>
            {results.map((item) => (
              <li key={item.recipe.id}>
                <button type="button" aria-label={t('meals.pick', { recipe: item.recipe.name })} disabled={setRecipe.isPending} onClick={() => choose(item.recipe.id)}>
                  <span className={styles.name}>{item.recipe.name}</span>
                </button>
                <RatingStars summary={item.rating} recipeId={item.recipe.id} recipeName={item.recipe.name} familyId={familyId} readOnly />
              </li>
            ))}
          </ul>
        ) : search.isSuccess ? <p className="meta-line">{t('meals.noResults')}</p> : null)}
      </section>
    </div>
  );
}
```

`MealEditor.tsx`: `picker: <RecipePicker familyId={props.familyId} weekStartsOn={props.weekStartsOn} meal={props.meal} onStage={props.onStage} onDone={props.onClose} />`.

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals web/src/components/RatingStars.tsx web/src/components/RatingStars.test.tsx web/src/i18n/messages
git commit -m "Web: Cambia ricetta con suggerimenti, Proponimene altri, ricerca anche per filtri e Non proporre più"
```

### Task 13: scambio, pasto libero e nota

**Files:**
- Create: `web/src/features/meals/SwapPicker.tsx`, `FreeMealForm.tsx`, `NoteForm.tsx`, `forms.test.tsx`
- Modify: `web/src/features/meals/MealEditor.tsx`

**Interfaces:**
- Consumes: `useMealMutation('meals.swap' | 'meals.setFree' | 'meals.setNote', …)`, `suggestionsQuery` (`freeTexts`), `useUndo`, `useMealErrors`, `formatDayLong(locale, date)`.
- Produces: `SwapPicker({ familyId, weekStartsOn, meal, week, onDone })`, `FreeMealForm({ familyId, weekStartsOn, meal, onDone })`, `NoteForm({ familyId, weekStartsOn, meal, onDone })`.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/forms.test.tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DINNER, LUNCH, realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function open(card: RegExp, button: string) {
  const article = await screen.findByRole('article', { name: card });
  fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
  fireEvent.click(within(article).getByRole('button', { name: button }));
  return { article, sheet: await screen.findByRole('dialog') };
}

describe('swap, free meal and note', () => {
  it('swaps with another meal of the week', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scambia con un altro pasto' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /Pizza/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.mealCalls.find((c) => c.op === 'meals.swap')?.input).toMatchObject({ slotId: LUNCH, otherSlotId: DINNER });
  });

  it('marks a meal free from a typed text, kept as written; quick picks shown', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: () => ({ recipes: [], nextOffset: 0, freeTexts: ['Fuori', 'Avanzi'] }) });
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Segna come pasto libero' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'Fuori' })).toBeTruthy();
    const input = within(dialog).getByRole('textbox', { name: 'Pasto libero' }) as HTMLInputElement;
    expect(input.maxLength).toBe(60);
    const save = within(dialog).getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Cena da Zia Pina' } });
    fireEvent.click(save);
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.setFree')?.input).toMatchObject({ slotId: LUNCH, text: 'Cena da Zia Pina' }));
  });

  it('writes a note with a counter and removes it', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Pizza/, 'Nota');
    const box = within(sheet).getByRole('textbox', { name: 'Nota' }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: 'Senza cipolla' } });
    expect(within(sheet).getByText('13/200')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.setNote')?.input).toMatchObject({ slotId: DINNER, note: 'Senza cipolla' }));
    const article = await screen.findByRole('article', { name: /Pizza/ });
    await waitFor(() => expect(within(article).getByText('Senza cipolla', { exact: false })).toBeTruthy());
    fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Nota' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Togli nota' }));
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.setNote').at(-1)?.input.note).toBeNull());
  });
});
```

- [ ] **Step 2: Run** `npm test -w web -- forms` — Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// web/src/features/meals/SwapPicker.tsx
import { useApi } from '../../api/ApiProvider';
import type { MealView, WeekView } from '../../api/types';
import { formatDayLong } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

/** Every other meal of the week (spec section 5): dish or free text and note move, servings stay. */
export function SwapPicker({ familyId, weekStartsOn, meal, week, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const api = useApi();
  const undo = useUndo();
  const message = useMealErrors(familyId, weekStartsOn);
  const swap = useMealMutation<{ otherSlotId: string }>('meals.swap', familyId, weekStartsOn, ({ otherSlotId, id }) =>
    api.meals.swap({ familyId, slotId: meal.slotId, otherSlotId, id })
  );
  const others = week.days.flatMap((d) => d.meals).filter((m) => m.slotId !== meal.slotId);
  const pick = (otherSlotId: string) =>
    swap.mutate({ otherSlotId }, {
      onSuccess: ({ view }) => {
        if (view.changed) undo.offer(view.actionId, weekStartsOn);
        onDone();
      }
    });
  return (
    <>
      {swap.isError && <p role="alert">{message(swap.error)}</p>}
      <ul className={styles.rows}>
        {others.map((other) => (
          <li key={other.slotId}>
            <button type="button" disabled={swap.isPending} onClick={() => pick(other.slotId)}>
              <span className="meta-line">{formatDayLong(locale, other.date)} · {t(`meal.${other.mealType}`)}</span>
              <span className={styles.name}>{other.recipe?.name ?? other.freeText ?? t('meal.empty.title')}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
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
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

const MAX_FREE_TEXT = 60;

/** Free meal: quick picks (texts the family uses most) or a text kept as written. */
export function FreeMealForm({ familyId, weekStartsOn, meal, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const message = useMealErrors(familyId, weekStartsOn);
  const [text, setText] = useState(meal.freeText ?? '');
  const picks = useQuery(suggestionsQuery(useQueryDeps(), familyId, meal.slotId, 0)).data?.freeTexts ?? [];
  const save = useMealMutation<{ text: string }>('meals.setFree', familyId, weekStartsOn, ({ text, id }) => api.meals.setFree({ familyId, slotId: meal.slotId, text, id }));
  const send = (value: string) =>
    save.mutate({ text: value.trim() }, {
      onSuccess: ({ view }) => {
        if (view.changed) undo.offer(view.actionId, weekStartsOn);
        onDone();
      }
    });
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
      {picks.length > 0 && (
        <ul>{picks.map((p) => <li key={p}><button type="button" className="text-button" disabled={save.isPending} onClick={() => send(p)}>{p}</button></li>)}</ul>
      )}
      <input aria-label={t('meals.freeTitle')} placeholder={t('meals.freePlaceholder')} maxLength={MAX_FREE_TEXT} value={text} onChange={(e) => setText(e.target.value)} />
      {save.isError && <p role="alert">{message(save.error)}</p>}
      <button type="submit" className="text-button primary" disabled={!text.trim() || save.isPending}>{t('meals.save')}</button>
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
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';

const MAX_NOTE = 200;

/** Note of the meal, seen by the whole family, kept as written (up to 200 characters). */
export function NoteForm({ familyId, weekStartsOn, meal, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const message = useMealErrors(familyId, weekStartsOn);
  const [note, setNote] = useState(meal.note ?? '');
  const save = useMealMutation<{ note: string | null }>('meals.setNote', familyId, weekStartsOn, ({ note, id }) => api.meals.setNote({ familyId, slotId: meal.slotId, note, id }));
  const send = (value: string | null) =>
    save.mutate({ note: value }, {
      onSuccess: ({ view }) => {
        if (view.changed) undo.offer(view.actionId, weekStartsOn);
        onDone();
      }
    });
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(note.trim() || null); }}>
      <textarea aria-label={t('meals.note')} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
      <p aria-live="polite">{t('meals.noteCount', { count: note.length })}</p>
      {save.isError && <p role="alert">{message(save.error)}</p>}
      <button type="submit" className="text-button primary" disabled={save.isPending}>{t('meals.save')}</button>
      {meal.note && <button type="button" className="text-button" disabled={save.isPending} onClick={() => send(null)}>{t('meals.removeNote')}</button>}
    </form>
  );
}
```

`MealEditor`: `swap: <SwapPicker {...common} week={props.week} />`,
`free: <FreeMealForm {...common} />`, `note: <NoteForm {...common} />` with
`const common = { familyId: props.familyId, weekStartsOn: props.weekStartsOn, meal: props.meal, onDone: props.onClose }`.

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals
git commit -m "Web: scambio, pasto libero con proposte rapide e nota"
```

### Task 14: «Annulla» ed errori

**Files:**
- Create: `web/src/features/meals/UndoToast.tsx`, `web/src/features/meals/UndoToast.test.tsx`
- Modify: `web/src/features/meals/UndoProvider.tsx` (renders `UndoToast` instead of the provisional line)

**Interfaces:**
- Consumes: `useMealMutation('meals.undo', …)`, `useMealErrors` (Task 12), `UndoOffer`.
- Produces: `UndoToast({ offer, familyId, onDone })`, `UNDO_MS = 6000`.

- [ ] **Step 1: Failing tests**

```tsx
// web/src/features/meals/UndoToast.test.tsx
import { ORPCError } from '@orpc/server';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitch } from '../../test/LanguageSwitch';
import { realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Servings +1 and panel closed: the value leaves at once. */
async function changeServings() {
  const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
  fireEvent.click(within(article).getByRole('button', { name: /Modifica il pasto|Edit the meal/ }));
  fireEvent.click(within(article).getByRole('button', { name: /Una porzione in più|One serving more/ }));
  fireEvent.click(within(article).getByRole('button', { name: /Modifica il pasto|Edit the meal/ }));
  return article;
}

describe('undo', () => {
  it('offers «Annulla» for 6 seconds and restores the meal with the action id', async () => {
    const { server } = realMealsApp();
    await changeServings();
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.setServings')).toBe(true));
    const action = server.mealCalls.find((c) => c.op === 'meals.setServings')!.input.id;
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.undo')?.input).toMatchObject({ actionId: action }));
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('a refused undo explains and reads the week again', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ undo: () => { throw new ORPCError('not_allowed', { status: 409, data: { reason: 'changed_since' } }); } });
    await changeServings();
    const reads = server.weekReads.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    expect(await screen.findByText('Non si può più annullare: il pasto è stato cambiato.')).toBeTruthy();
    await waitFor(() => expect(server.weekReads.length).toBeGreaterThan(reads));
  });

  it('after moving to another week the undo still targets the meal’s week', async () => {
    const { server, history } = realMealsApp();
    await changeServings();
    await act(() => history.push('/menu?day=2026-10-12'));
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.undo')).toBe(true));
    await act(() => history.push('/menu?day=2026-10-08'));
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    await waitFor(() => expect(within(article).getByText(/4 porzioni/)).toBeTruthy());
  });

  it('after switching to English the undo still applies to the meal', async () => {
    const { server } = realMealsApp('/menu', { extra: <LanguageSwitch /> });
    await changeServings();
    const undo = await screen.findByRole('button', { name: 'Annulla' });
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }).catch(() => undo));
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.undo')).toBe(true));
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    await waitFor(() => expect(within(article).getByText(/4 servings/)).toBeTruthy());
  });

  it('no toast when nothing changed', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ setNote: (input) => ({ week: server.currentWeek('2026-10-05'), actionId: input.id, changed: false }) });
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Nota' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npm test -w web -- UndoToast` — Expected: FAIL (6-second timer and refusal message missing).

- [ ] **Step 3: Implement**

```tsx
// web/src/features/meals/UndoToast.tsx
import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useT } from '../../i18n/LocaleProvider';
import type { UndoOffer } from './UndoProvider';
import { useMealErrors } from './useMealErrors';
import { useMealMutation } from './useMealMutation';

export const UNDO_MS = 6000;

/** «Annulla» after each action that changed something (spec section 5, round 2 default: 6 s). */
export function UndoToast({ offer, familyId, onDone }: { offer: UndoOffer; familyId: string; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const message = useMealErrors(familyId, offer.weekStartsOn);
  const [refusal, setRefusal] = useState<string | null>(null);
  const undo = useMealMutation<Record<string, never>>('meals.undo', familyId, offer.weekStartsOn, ({ id }) =>
    api.meals.undo({ familyId, actionId: offer.actionId, id })
  );
  // The offer, then the refusal, each stay 6 seconds: the timer restarts when the refusal shows.
  useEffect(() => {
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
  }, [offer.key, refusal, onDone]);
  if (refusal) return <div role="status" className="toast">{refusal}</div>;
  return (
    <div role="status" className="toast">
      {t('meals.changed')}{' '}
      <button type="button" className="text-button" disabled={undo.isPending} onClick={() => undo.mutate({}, { onSuccess: onDone, onError: (error) => setRefusal(message(error)) })}>
        {t('meals.undo')}
      </button>
    </div>
  );
}
```

`UndoProvider`: replace `ProvisionalUndo` with
`{current && <UndoToast key={current.key} offer={current} familyId={familyId} onDone={clear} />}`
and remove `ProvisionalUndo`. The undo goes through `runMealMutation` with the offer's
`weekStartsOn`, so its answer lands on the meal's week whatever week is shown; after a
language change the answer marks the week stale instead of writing it (rule of
`applyMutation`), and the next read shows the restored value. Styles of `.toast`: from
the prototype's `UndoToast.svelte` (fixed at the bottom above the navbar), in
`meals.module.css` if `global.css` has no `.toast`.

- [ ] **Step 4: Run** `npm run typecheck && npm test -w web` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/meals
git commit -m "Web: Annulla per sei secondi, annullamento rifiutato ed errori delle azioni"
```

### Task 15: prova visiva, stack reale e PR del web

- [ ] **Step 1: Full verification** — `supabase test db && npm run typecheck && npm test`: all green.

- [ ] **Step 2: Fake mode** (skill `agent-browser`; `caffeinate -d -t 3600 &` before screenshots)

`npm run dev -w web -- --host 0.0.0.0 --port 8767`. At 390×844 compare with the prototype
(round 2):

- pencil on recipe, free and empty meals, one panel at a time;
- servings with one undo;
- «Cambia ricetta» with free/exclude/swap first, five cards, «Proponimene altri»;
- search by filters only, with ratings;
- swap list, free meal with quick picks, note with counter;
- toast for 6 s;
- offline disabled.

Check spacing and type against `design/design.md`.

- [ ] **Step 3: Real stack in local** (as in `progetto/coordinamento/messaggi/w6-prova-stack-reale.md`)

1. Separate local Supabase project (`project_id` and ports changed only in the working
   copy of `supabase/config.toml`), `supabase start`, migrations and `seed.sql`. With Podman,
   if the copy of the secret files fails, use the wrapper in `~/.cache/podwrap`.
2. `app_server` password and `server/.env` towards the local database and Auth (not committed).
3. `npm run build -w web` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then
   `npx wrangler dev --port 8797 --test-scheduled` in `server/`.
4. Catalogue: `node scripts/import/import-recipes.ts --today 2026-10-11`, then load it with
   the curators' operations. The `carica-catalogo.mjs` of W6's report is not in the
   repository: ask the coordinator (`STATO: DOMANDA`) or write an equivalent in the
   scratchpad that calls `/api/catalogue/*` as `dario@example.test`.
5. Menu from the real job: `curl "http://localhost:8797/cdn-cgi/local/scheduled"` and with
   `?time=` of the previous Wednesday.
6. Paths, Anna and Bruno of the same family in two browser sessions:
   - Anna changes a dish → Bruno, after reloading, sees «Cambiato da Anna»;
   - Bruno changes the same meal → Anna's «Annulla» is refused;
   - «Non proporre più» → the recipe is in Profilo → Non proporre più and not in the
     suggestions;
   - changing a dish updates the week's shopping list;
   - a swap and its undo;
   - a past meal changed;
   - an imported draft swapped and undone.

   Then Carla (en-GB, imperial): the same panel and sheet in English. Mind the PWA issue
   of W6's report if it is not fixed on `main` (remove the service worker before a direct
   reopening).
7. `supabase stop` for that project at the end.

- [ ] **Step 4: Push and PR**

```bash
git push -u origin traguardo/revisione-pasti-web
gh pr create --base main --title "Revisione dei pasti: schermate del Menu" --body-file "$SCRATCH/pr-web.md"
```

`$SCRATCH/pr-web.md` (scratchpad): what it does, verifications (tests, fake mode, real
stack), spec sections 3, 5 and 14, closing line
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then
`STATO: PR_APERTA <url>` and stop.
