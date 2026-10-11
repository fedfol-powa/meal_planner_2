# Revisione dei pasti: spec di dettaglio

Creata: 11 ottobre 2026 · Aggiornata: 12 ottobre 2026, dopo due review di spec e piano
(`progetto/coordinamento/revisioni/w1-revisione-pasti-spec-piano.md`, 14 rilievi;
`…-spec-piano-2.md`, 6 rilievi) e le decisioni del coordinatore
(`messaggi/w1-11-review-revisione-pasti.md` e risposta alla seconda review) · Attività W1
dell'ondata 2 · Branch `traguardo/revisione-pasti`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 («Una settimana
tipo», «Le stelline»), sezioni 1, 2, 3 («Riuso durante la revisione»), 5, 12, 13, 14, 15 e
16 (secondo giro del prototipo, 6 ottobre 2026); `design/percorsi.md`, giro 2; prototipo in
`prototype/src/lib/operations/revision.ts`, `suggestions.ts` e nei componenti
`RecipeCard`, `MealActionList`, `MealEditor`, `RecipePicker`, `SwapPicker`, `UndoToast`.

Brainstorming chiuso con il coordinatore l'11 ottobre 2026: area `meals`, due PR (server,
poi web), annullamento senza limiti di tempo lato server, scritture che rispondono con la
vista aggiornata. Dopo la review: azioni con identità persistente, lettura
dell'annullamento nella vista del pasto, richieste senza effetti ricordate, bozze
importate spostabili e ripristinabili, testi liberi come scritti.

## 1. Obiettivo e perimetro

Ogni membro della famiglia può modificare qualunque pasto di qualunque settimana visibile
(passato, in corso, futuro; con ricetta, libero o vuoto), dal web e da un agente MCP:

- cambiare le porzioni;
- cambiare la ricetta scegliendo fra cinque suggerimenti, chiedendone altri cinque
  («Proponimene altri») o cercando nel ricettario, anche con i soli filtri;
- segnare il pasto come libero, con un testo;
- scambiarlo con un altro pasto della stessa settimana;
- scrivere o togliere una nota;
- dire «Non proporre più» per la ricetta del pasto e scegliere subito il sostituto;
- annullare la propria ultima modifica, anche da una conversazione MCP nuova.

Ogni modifica è un'**azione** con un id scelto dal client. L'azione aggiorna `updated_by`,
`updated_at` e `last_action_id` degli slot che cambia e aggiunge una riga a `meal_changes`
per ciascuno, con il canale (`web` o `mcp`). Vince l'ultimo salvataggio, senza avvisi di
conflitto né di settimana (sezione 5, decisioni del 6 ottobre 2026).

**Fuori dal perimetro:** generazione su richiesta («rigenera», ondata 3); storico completo
delle modifiche nell'interfaccia (si mostra solo l'ultima); elenco delle esclusioni (W2,
già unito); modifiche offline (il menu offline è in sola lettura, sezione 5).

### Verifiche della sezione 5

- L'annullamento non è limitato ai pasti futuri: «Valgono per pasti passati, in corso e
  futuri», «Nessuna azione dipende dalla settimana», l'istante del pasto passato «non
  blocca modifiche». Restano due regole: solo le proprie modifiche, solo se gli slot non
  sono cambiati di nuovo.
- Il server non impone un tempo massimo all'annullamento; i «sei secondi» sono
  dell'interfaccia web (default del secondo giro). Da MCP si annulla l'ultima azione
  indicata dalla vista del pasto finché resta annullabile.
- **Testi liberi** (decisione del coordinatore, 12 ottobre 2026): note e testi dei pasti
  liberi restano come li scrive l'utente, senza traduzione, come le voci libere della
  spesa; tutti i testi dell'interfaccia restano bilingui.

## 2. Interfacce: cosa usa e cosa produce

### Usa (già su `main`)

| Interfaccia | Produttore | Firma usata |
|---|---|---|
| Implementatore e pipeline | piattaforma | `Implementer`, `OperationContext` (`tx`, `now`, `userId`, `channel`, `locale`), `fresh` da `server/src/pipeline.ts` |
| Vista della settimana | W1 menu | `weekViewOf(context, familyId, weekStartsOn): Promise<WeekView>` (`server/src/menu/week-view.ts`), estesa qui; `weekView`, `mealView` (`contract/src/menu/views.ts`), estesi qui |
| Dati del pianificatore | W1 menu | `loadPlannerInput(tx, familyId, target)` (`server/src/menu/generation.ts`), esteso qui con le ricette fissate |
| Pianificatore | W1 menu | `candidatesFor`, `slotRefOf`, `buildContext`, `scoreCandidate`, `compareIds`, `withSortedCatalogue`, `prepared`, tipi `Placed`, `PlannerInput`, `PastMeal`, `PlannerSlotRef` (`domain/src/planner/`) |
| Viste della ricetta | W6 | `recipeSummaries(tx, refs, locale)` (mappa per `recipeViewKey(ref)`), `ratingSummaries(tx, familyId, userId, ids)` (mappa per id), `recipeSummaryView`, `ratingSummaryView` |
| Esclusioni | W2 | `family.addExclusion({familyId, recipeId})` (idempotente), `family.removeExclusion`, `family.listExclusions` |
| Ricerca nel ricettario | W6 | `recipes.search({familyId, query})`; nel web `searchQuery`, `RecipeFilters({ query, onChange })`, `RatingStars({ summary, recipeId, recipeName, familyId })` |
| Client web, sessione e mutazioni | W5, W2 | `SERVER_AREAS`, `Api`, `applyMutation`, `INVALIDATIONS`, `applyRating`, `useSession().track/isLatest`, `isOnline()` |
| Componenti web | W5, W6 | `RecipeCard`, `BottomSheet`, `ServingsStepper({ value, min, max, onChange })`, `Icon`, `StateNotice` |
| Schema | W2 | `app.meal_slots`, `app.meal_changes`, `app.check_meal_slot_recipe`, trigger dei contatori, `app.recipe_drafts` (`closed_at`) |

### Produce

Nessun'altra attività dipende da queste interfacce. Firme definitive:

**Dominio** (`domain/src/planner/`):

```ts
// constraints.ts: un parametro in più, la generazione non lo passa
export function candidatesFor(slot: SlotRef, input: PlannerInput, weekRecipes: PlannerRecipe[], excludeIds?: ReadonlySet<string>): PlannerRecipe[];

// types.ts: PlannerInput riceve le ricette dei pasti già nel calendario che non si propongono più
export interface PlannerInput {
	// ...campi esistenti
	/** Recipes cited by meals but not proposable (archived): they count as neighbours, history and weekly limits, never as candidates. */
	fixedRecipes?: PlannerRecipe[];
}

// suggest.ts
export function rankSuggestions(input: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[];
```

**Contratto** (`contract/src/meals/`, area `meals`):

```ts
const slot = z.object({ familyId: z.uuid(), slotId: z.uuid() });
/** Every write is an action whose id comes from the client (check.ts: `creates` needs an `id`). */
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });

export const mealActionResult = z.object({
	week: weekView,
	/** The action of this request (the `id` sent). */
	actionId: z.uuid(),
	/** False when the request changed nothing (also when it repeats one that changed nothing). */
	changed: z.boolean(),
});

export const suggestionsView = z.object({
	recipes: z.array(z.object({ recipe: recipeSummaryView, rating: ratingSummaryView })).max(5),
	nextOffset: z.number().int().min(0),
	freeTexts: z.array(z.string()).max(4),
});

export const mealsContract = {
	/** Not versioned: the ranking depends on the global ratings, which no counter follows. */
	getSuggestions: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
		// GET /families/{familyId}/meals/{slotId}/suggestions
		.input(slot.extend({ offset: z.coerce.number().int().min(0).max(1000).default(0) }))
		.output(suggestionsView),
	setServings: write() // PUT .../meals/{slotId}/servings
		.input(slot.extend({ id: z.uuid(), servings: z.number().int().min(1).max(20) })).output(mealActionResult),
	setRecipe: write()   // PUT .../meals/{slotId}/recipe
		.input(slot.extend({ id: z.uuid(), recipeId: z.uuid() })).output(mealActionResult),
	setFree: write()     // PUT .../meals/{slotId}/free-text
		.input(slot.extend({ id: z.uuid(), text: z.string().trim().min(1).max(60) })).output(mealActionResult),
	setNote: write()     // PUT .../meals/{slotId}/note
		.input(slot.extend({ id: z.uuid(), note: z.string().trim().max(200).nullable() })).output(mealActionResult),
	swap: write()        // POST .../meals/{slotId}/swap
		.input(slot.extend({ id: z.uuid(), otherSlotId: z.uuid() })).output(mealActionResult),
	undo: write()        // POST /families/{familyId}/meals/undo
		.input(z.object({ familyId: z.uuid(), actionId: z.uuid(), id: z.uuid() })).output(mealActionResult),
};
```

Errori dichiarati: `not_found` su tutte; `not_allowed` su `undo`. `undo` riceve l'azione da
annullare (`actionId`) e l'id della nuova azione di annullamento (`id`).

**Vista del pasto** (`contract/src/menu/views.ts`, area mia; campi nuovi obbligatori in
uscita):

```ts
lastChange: z.object({
	userName: z.string().nullable(),
	at: localDateTimeSchema,
	/** The action that made the change; null for changes logged before actions existed. */
	actionId: z.uuid().nullable(),
	/** For the reader: their own action, still the last one of every slot it changed. */
	undoable: z.boolean(),
	/** Slots the action changed (two for a swap), so an agent knows what an undo touches. */
	slotIds: z.array(z.uuid()),
}).nullable(),
```

**Errori** (`contract/src/errors.ts`, additivo): `notAllowedData.reason` riceve
`not_own_change`, `changed_since`, `draft_closed`. Testo generico di `not_allowed` neutro
in MCP (`server/src/messages.ts`) e nel web (`web/src/i18n/messages/errors.ts`).

**Descrizioni per l'agente** (inglese, `summary`):

| Operazione | Descrizione |
|---|---|
| `getSuggestions` | Five recipes that fit a meal, best first, by the same rules as the weekly menu (ratings shown, not set here); call again with nextOffset for five more; also the free-meal texts the family uses most |
| `setServings` | Set the servings of a meal (1-20). `id` is a new UUID for this action; repeating the same request changes nothing |
| `setRecipe` | Put a published recipe in a meal, from the suggestions or a recipe search. `id` as above |
| `setFree` | Mark a meal as free (eating out, pizza...) with a short text, kept as written; the note stays. `id` as above |
| `setNote` | Write the note of a meal (up to 200 characters, kept as written, seen by the whole family) or remove it with null. `id` as above |
| `swap` | Swap two meals of the same week: dish or free text and note move, servings stay. `id` as above |
| `undo` | Undo your own last change of a meal: pass `lastChange.actionId` from menu_getWeek when `lastChange.undoable` is true (a swap comes back whole). `id` is a new UUID for the undo |

## 3. Schema: migrazione `20261012100000_meal_actions.sql`

Una sola migrazione nuova, con pgTAP in `supabase/tests/meal_actions_test.sql`. Le
migrazioni unite non si toccano; il test esaustivo dei privilegi
`supabase/tests/coverage_test.sql` si aggiorna con la funzione nuova eseguibile da
`authenticated` (`meal_action_restores_closed_draft`), conservando il confronto con
l'elenco completo.

### Tabella `app.meal_actions`

| Colonna | Tipo e vincoli |
|---|---|
| `id` | `uuid primary key`, dal client |
| `week_id` | `uuid not null` → `weeks(id)` on delete cascade |
| `actor_id` | `uuid` → `auth.users(id)` on delete set null |
| `channel` | `text not null`, `web` o `mcp` |
| `kind` | `text not null`: `set_servings`, `set_recipe`, `set_free`, `set_note`, `swap`, `undo` |
| `slot_ids` | `uuid[] not null`, 1 o 2 elementi: gli slot della richiesta (per `undo`, quelli cambiati dall'azione annullata) |
| `undoes` | `uuid`, valorizzato solo per `undo`; chiave esterna (`undoes`, `week_id`) → (`id`, `week_id`) |
| `created_at` | `timestamptz not null default clock_timestamp()` |

Vincoli: `unique (id, week_id)`; `check ((kind = 'undo') = (undoes is not null))`. Una riga
per richiesta, scritta una volta e mai modificata (modello di `app.recipe_draft_requests`
di W3): è insieme l'identità dell'azione e la memoria delle richieste, anche di quelle
senza effetti. **Perché una tabella sola e non due** (azioni e richieste): ogni richiesta
dell'area è un'azione, e una seconda tabella ripeterebbe le stesse colonne; resta
dell'area, non una tabella generica delle ricevute.

RLS: lettura ai membri (`app.can_access_week(week_id)`); inserimento con
`actor_id = auth.uid()`, settimana accessibile e ogni elemento di `slot_ids` slot di
quella settimana; nessun `update` né `delete`. Grant: `select, insert` ad `authenticated`.

### Colonne nuove

- `app.meal_changes.action_id uuid` → `meal_actions(id)` on delete cascade, con indice.
  Nullo solo per righe precedenti (import, test): le operazioni lo valorizzano sempre.
- `app.meal_slots.last_action_id uuid`, chiave esterna (`last_action_id`, `week_id`) →
  `meal_actions(id, week_id)` on delete set null (`last_action_id`): l'ultima azione che ha
  cambiato lo slot, sempre della stessa settimana. Grant `update (last_action_id)`.
- `app.meal_changes.created_at` passa al default `clock_timestamp()`.

### Regole nel database (trigger per `authenticated`)

1. **Verità del registro:** `before insert on meal_changes`: per `authenticated`, `before`
   deve coincidere con il contenuto attuale dello slot (`recipeId`, `freeText`,
   `servings`, `note`), `action_id` deve essere un'azione dell'utente che comprende lo slot
   in `slot_ids`, e `undoes`, se c'è, una riga dello stesso slot che appartiene all'azione
   annullata (`meal_actions.undoes`). Così un registro non può inventare che uno slot
   citava una bozza. La regola vale per le righe con `action_id`: quelle senza azione
   (import, test uniti di W2 che inseriscono `'{}'`) restano ammesse come oggi, ma non
   sono prove per la regola 3, che legge solo righe dell'azione in corso.
2. **Ultima azione:** `before update of last_action_id on meal_slots`: un valore non nullo
   deve essere un'azione dell'utente con lo slot in `slot_ids` e con una riga di
   `meal_changes` su questo slot.
3. **Bozze** (`create or replace function app.check_meal_slot_recipe`): collegare uno slot a
   una ricetta mai pubblicata resta vietato, salvo quando la bozza è ancora aperta
   (`recipe_drafts.closed_at is null`) e vale una di queste condizioni:
   - **(a)** un altro slot della stessa famiglia la cita (regola attuale, scambio
     nell'ordine favorevole);
   - **(b)** spostamento nella stessa azione: esiste una riga di `meal_changes` con
     `action_id = new.last_action_id`, su un altro slot della stessa settimana, con
     `before.recipeId` uguale alla bozza (scambio nell'ordine sfavorevole, due bozze che si
     scambiano);
   - **(c)** ripristino di un annullamento: esiste una riga con
     `action_id = new.last_action_id` su questo slot, `undoes` valorizzato, e la riga
     annullata ha `before.recipeId` uguale alla bozza.

   La regola (a) resta com'è anche per la bozza chiusa (non cambia il comportamento unito);
   (b) e (c) richiedono la bozza aperta. Niente privilegi nuovi né `app_job`: le prove
   vengono dal registro, reso veritiero dalla regola 1.

Il server, per questo, scrive nell'ordine: azione, righe di `meal_changes` di tutti gli
slot (con `before` ancora vero), poi gli `update` degli slot con `last_action_id`.

### Funzione per l'annullamento

`app.meal_action_restores_closed_draft(p_action_id uuid) returns boolean`, `security
definer`, eseguibile da `authenticated`: vero se annullare l'azione riporterebbe in un
pasto una ricetta mai pubblicata la cui bozza è chiusa (scartata). Legge **solo** le righe
di `meal_changes` di quell'azione (`action_id = p_action_id`), quindi solo prove rese
veritiere dalla regola 1, e solo se l'azione è di una settimana accessibile a chi chiama
(altrimenti falso). Non dipende dalla visibilità attuale della ricetta: dopo che un
`setFree` ha tolto l'ultima citazione, un membro non vede più la bozza in `app.recipes`, ma
la funzione risponde lo stesso. Non rivela lo stato di bozze di altre famiglie: una riga
senza azione con un `before` inventato non è mai letta.

### Test pgTAP

Scambio bozza↔pubblicata in entrambi gli ordini; due bozze che si scambiano; ripristino
della bozza dopo aver tolto l'ultima citazione (`setFree` poi annullamento); ripristino
rifiutato se la bozza è stata chiusa; `before` falso rifiutato; `last_action_id` di
un'azione altrui, di un'altra settimana o di un'altra famiglia rifiutato; azione con slot
di un'altra famiglia rifiutata; registro e azioni non modificabili né cancellabili;
lettura delle azioni solo ai membri; regola (a) invariata;
`meal_action_restores_closed_draft` vera solo per la bozza chiusa, falsa per un'azione di
un'altra famiglia e non ingannata da una riga senza azione con una citazione falsa;
`coverage_test.sql` con la funzione nell'elenco di `authenticated`.

## 4. Server (prima PR)

### File

- `server/src/meals/slots.ts`: lettura e blocco degli slot, contenuto.
- `server/src/meals/actions.ts`: azione, idempotenza, scrittura nell'ordine sopra,
  annullamento.
- `server/src/meals/suggestions.ts`: suggerimenti.
- `server/src/meals/router.ts`: `mealsRouter(os)`, registrato in `server/src/router.ts`.
- `server/src/menu/week-view.ts`: `lastChange` esteso (mia area).
- `server/src/menu/generation.ts`: `loadPlannerInput` carica anche le ricette fissate.

### Percorso di una scrittura

Nella transazione dell'utente (`read committed`, quella del pipeline), dopo autenticazione,
sessione, ruolo e appartenenza:

1. **Blocco** degli slot della richiesta, in ordine di id, sotto RLS:
   `select … from app.meal_slots s join app.weeks w … where s.id = any($ids) and w.family_id = $familyId order by s.id for update of s`.
   Manca uno slot: `not_found`. Due richieste uguali e concorrenti si mettono in fila qui.
2. **Ripetizione:** `select actor_id, kind, slot_ids, undoes from app.meal_actions where id = $id`.
   Se esiste ed è dell'utente con stesso tipo, stessi `slot_ids` (stesso ordine) e, per
   `undo`, stesso `undoes`: risposta con la vista attuale, `changed` = esistono righe di
   `meal_changes` dell'azione; **prima** di qualunque controllo sul contenuto (ricetta
   archiviata dopo la prima richiesta). Altrimenti, se esiste: `invalid` su `['id']`.
3. **Controlli del contenuto:** ricetta pubblicata per `setRecipe` (`not_found`), stessa
   settimana per `swap` (`invalid` su `['otherSlotId']`), regole dell'annullamento sotto.
4. **Azione:** `insert into app.meal_actions`. Un id già usato in un'altra famiglia non è
   visibile: l'inserimento fallisce sulla chiave primaria (`23505`) → `invalid` su `['id']`.
5. **Righe del registro:** per ogni slot il cui contenuto cambia,
   `insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)`.
   Uno slot senza cambiamenti non ha riga. Una richiesta senza effetti lascia solo
   l'azione: è ricordata, e un suo ritentativo dopo la modifica di un altro membro non
   sovrascrive nulla.
6. **Slot:** `update` delle colonne di contenuto con `updated_by = auth.uid()`,
   `updated_at = clock_timestamp()` (momento effettivo, dopo il lucchetto),
   `last_action_id = $id`.
7. **Risposta:** `{ week: await weekViewOf(context, familyId, startsOn), actionId: $id, changed }`.

I contatori della famiglia crescono con i trigger esistenti su `meal_slots` e
`meal_changes`. Una richiesta senza effetti non li fa crescere (inserisce solo in
`meal_actions`, che non ha trigger dei contatori) e non cambia la vista.

**Ordine del registro (rilievo 6):** l'ultima modifica di uno slot è `last_action_id`,
scritto sotto il lucchetto della riga: è l'ordine reale delle scritture serializzate,
indipendente dagli orologi. Gli istanti (`created_at`, `updated_at`) usano
`clock_timestamp()` dopo il lucchetto e servono solo a mostrare il momento.

### Regole per operazione

| Operazione | Tipo | `slot_ids` | Nuovo contenuto |
|---|---|---|---|
| `setServings` | `set_servings` | `[slotId]` | `servings` |
| `setRecipe` | `set_recipe` | `[slotId]` | `recipeId`, `freeText: null` (solo ricette `published`, altrimenti `not_found`) |
| `setFree` | `set_free` | `[slotId]` | `recipeId: null`, `freeText: text` |
| `setNote` | `set_note` | `[slotId]` | `note` (vuota dopo il trim → `null`) |
| `swap` | `swap` | `[slotId, otherSlotId]` | piatto, testo e nota dell'altro; porzioni ferme. `otherSlotId = slotId` → `invalid` |

### Annullamento

1. Lettura dell'azione `actionId` sotto RLS, con le sue righe di `meal_changes`: non
   visibile o di un'altra famiglia → `not_found`.
2. Blocco degli slot cambiati dall'azione (in ordine di id).
3. Ripetizione di `id` (tipo `undo`, `slot_ids` = slot cambiati, `undoes = actionId`).
4. Azione altrui → `not_allowed` / `not_own_change`.
5. Uno degli slot ha `last_action_id` diverso da `actionId` → `not_allowed` /
   `changed_since`.
6. `app.meal_action_restores_closed_draft(actionId)` vero → `not_allowed` /
   `draft_closed`, senza scritture. Se nel frattempo la bozza è stata **pubblicata**, la
   ricetta ha lo stesso id ed è ormai pubblicata: il ripristino procede (decisione del
   coordinatore, sotto).
7. Azione `undo` con una riga per slot: `after` = `before` della riga annullata,
   `undoes` = quella riga. Tutti gli slot dell'azione tornano insieme.

Un'azione senza effetti non ha nulla da annullare: l'annullamento si registra senza
righe e risponde `changed: false`. Annullare un annullamento è permesso: è un'azione propria
con le sue righe, e riporta di nuovo tutti i suoi slot.

### Lettura dell'annullamento (`menu.getWeek`)

`weekViewOf` unisce `meal_slots.last_action_id` a `meal_actions`:

- `actionId` = `last_action_id` (null per slot mai cambiati da un'azione);
- `slotIds` = slot con righe di `meal_changes` di quell'azione;
- `undoable` = `actor_id = utente che legge` e ogni slot in `slotIds` ha ancora
  `last_action_id = actionId`.

La versione di `getWeek` cambia con il contatore della famiglia, che cresce a ogni
scrittura che cambia uno slot: `undoable` non resta mai vecchio. Il caso raro della bozza
chiusa nel frattempo non è in `undoable` (le bozze non sono leggibili ai membri) e risponde
`draft_closed` all'annullamento.

### Suggerimenti

1. `readSlot` (senza blocco); `not_found` se manca.
2. `input = await loadPlannerInput(tx, familyId, { weekStart: startsOn })`, che ora carica
   anche `fixedRecipes`: le ricette **archiviate** citate dai pasti della famiglia, dal
   documento della loro versione corrente (le bozze mai pubblicate non hanno documento e
   restano fuori, come nella generazione).
3. `otherMeals`: gli altri slot della settimana con ricetta.
4. `rankSuggestions(input, {date, mealType}, otherMeals, slot.recipeId)`.
5. Pagina da 5: `start = offset < ranked.length ? offset : 0`,
   `nextOffset = start + 5 < ranked.length ? start + 5 : 0`.
6. Viste: `recipeSummaries` con `{recipeId, version: null, servings: slot.servings}` e
   `ratingSummaries`.
7. `freeTexts`: i quattro testi liberi più usati dalla famiglia, a parità in ordine
   alfabetico.

**Lettura non versionata:** la classifica usa anche `globalScores` (voti di tutte le
famiglie), che nessun contatore segue; una versione con i soli contatori `family` e
`catalogue` risponderebbe «invariato» a torto. I suggerimenti si leggono all'apertura del
foglio, quindi la versione non serve.

`rankSuggestions` nel dominio, un'unica logica con la generazione:

- `candidatesFor(slotRefOf(slot, settings), input, weekRecipes, new Set([currentRecipeId]))`:
  il piatto attuale si toglie **prima** della scelta fra ricette gradite e ripiego sui voti
  bassi, così se era l'unico gradito restano le alternative;
- `weekRecipes` e `placed`: gli altri pasti della settimana, cercati fra `recipes` e
  `fixedRecipes` (`prepared(input).byId` le comprende), quindi una ricetta archiviata già
  nella settimana conta per i massimi degli ingredienti, per la somiglianza e per gli
  intervalli;
- punteggio `scoreCandidate` con `buildContext(input, placed)`, ordine per punteggio e poi
  `compareIds`.

`prepared(input).byId` con `fixedRecipes` vale anche per la generazione: le ricette
archiviate dello storico pesano ora nella somiglianza e nella recentezza, come quelle
pubblicate. È la stessa logica, non un caso dei suggerimenti.

### Strumenti MCP

Generati dal contratto: `meals_getSuggestions` (sola lettura), `meals_setServings`,
`meals_setRecipe`, `meals_setFree`, `meals_setNote`, `meals_swap`, `meals_undo`. Un agente
in una conversazione nuova annulla con `menu_getWeek` → `lastChange.actionId` (se
`undoable`) → `meals_undo`.

## 5. Web (seconda PR)

### Collegamento

- `meals` in `SERVER_AREAS`; client finto `web/src/api/fake/fakeMeals.ts` (regola simulata
  del secondo giro, azioni in memoria con le stesse regole del server); `withTransport`.
- `suggestionsQuery(deps, familyId, slotId, offset)` con chiave
  `['meals', 'getSuggestions', { familyId, slotId, offset, locale }]`, lettura semplice
  (non versionata), `staleTime: 0`.

### Invalidazioni (`web/src/api/mutations.ts`, `web/src/api/ratings.ts`)

Bersaglio nuovo `week`: chiave `['menu', 'getWeek', { familyId, weekStartsOn, locale }]`,
tracciamento `week:<familyId>:<weekStartsOn>`. `applyMutation` cancella le letture in corso
del bersaglio e delle viste scadute prima di scrivere e invalidare (modello esistente):
una risposta di suggerimenti in volo non sovrascrive mai dopo la conferma.

| Operazione | Bersaglio | Viste scadute aggiunte (stessa famiglia) |
|---|---|---|
| `meals.setServings`, `setRecipe`, `setFree`, `setNote`, `swap`, `undo` | `week` | `menu.getOpening`, `shopping.getWeekList`, `recipes.get`, `recipes.search`, `meals.getSuggestions` |
| `family.addExclusion`, `removeExclusion` | `exclusions` | `meals.getSuggestions` |
| `family.setMeal`, `addRule`, `removeRule`, `setKnownNew`, `setGroupRange` | `settings` | `meals.getSuggestions` |
| `family.setBookOwned`, `setIngredientRestriction` | `settings` | `meals.getSuggestions` (in più alle attuali) |
| `ratings.set` (`applyRating`) | viste del voto | `meals.getSuggestions` cancellata e invalidata come la ricerca |

Nessun aggiornamento ottimistico. La risposta scrive `week.data` con la versione vecchia;
una risposta superata non si scrive e marca scadute le viste.

### Scheda del pasto (`RecipeCard`, ristrutturata come nel prototipo)

- Prop nuova `actions?: { label: string; disabled: boolean; panel: ReactNode; onChooseRecipe?: () => void }`.
- Il footer si mostra per le ricette **e** per ogni pasto con `actions` (libero e vuoto
  compresi): dettagli, voto e ingredienti solo con una ricetta; la matita sempre con
  `actions`.
- Un solo pannello aperto alla volta: lo stato `open` diventa
  `'rating' | 'ingredients' | 'actions' | null`; il pannello delle azioni è sotto il
  footer, come gli altri.
- Lo slot vuoto con `actions` mostra «Scegli una ricetta» nel contenuto, che apre il foglio
  sui suggerimenti.
- Passando da un tipo all'altro (ricetta → libero) il pannello aperto resta coerente:
  `rating` e `ingredients` si chiudono se il pasto non ha più una ricetta.

### Componenti (`web/src/features/meals/`)

- **`MealActions`** (il pannello): porzioni (solo ricette), «Cambia ricetta», «Nota».
- **Porzioni** (`useServingsDraft`); un invio respinto non sparisce in silenzio: con la
  scheda montata il pannello mostra l'errore (stesso testo degli altri errori dei pasti) e
  il valore torna a quello del server; dopo la navigazione resta un avviso persistente nel
  Menu («Le porzioni di … non sono state salvate»), chiuso solo dall'utente:
  - valore locale per la vista e riferimento al valore da salvare, separati;
  - invio 800 ms dopo l'ultimo tocco, sempre fuori dagli aggiornamenti di stato;
  - durante l'invio il selettore è disattivato e mostra il valore inviato fino alla
    risposta;
  - alla chiusura del pannello il valore in attesa parte subito;
  - smontando la scheda (navigazione) parte con `runMealMutation`, senza avviso
    «Annulla»;
  - offline: il selettore è disattivato, un valore in attesa non parte e torna al valore
    del server, con il messaggio offline;
  - in Strict Mode una sola richiesta;
  - gli avvisi dei salvataggi falliti dopo lo smontaggio stanno in un piccolo archivio
    legato alla sessione (`saveNotices.ts`, `WeakMap` per sessione, letto con
    `useSyncExternalStore`), mostrato in cima al Menu finché l'utente non lo chiude e
    cancellato alla chiusura della sessione.
- **`MealEditor`**: `BottomSheet` con le fasi `picker`, `swap`, `free`, `note`.
- **`RecipePicker`**:
  - in cima «Segna come pasto libero», «Non proporre più» (solo con una ricetta) e
    «Scambia con un altro pasto»;
  - poi i suggerimenti in schede scorrevoli, con `RatingStars` in sola lettura;
  - «Proponimene altri» passa a `nextOffset` senza cambiare il pasto;
  - poi la ricerca: `RecipeFilters({ query, onChange })`, che parte con il tipo di pasto
    dello slot. La ricerca si attiva con il testo **o** con un filtro diverso da quello
    iniziale (prototipo). I risultati mostrano nome, durata, gruppo e voto in sola lettura
    (media, numero di voti, proprio voto) e tolgono il piatto attuale.
- **`RatingStars`**: prop `readOnly` che mostra lo stesso riepilogo senza i pulsanti
  (modifica minima al componente di W6).
- **«Non proporre più»**: `family.addExclusion`, poi suggerimenti riletti con «Annulla
  esclusione» in cima (`removeExclusion`). Chiudere senza scegliere lascia l'esclusione e il
  pasto com'è.
- **`SwapPicker`**, **`FreeMealForm`** (proposte rapide, fino a 60 caratteri),
  **`NoteForm`** (fino a 200 caratteri con contatore, «Togli nota»).
- **`UndoToast`**:
  - per 6 secondi dopo un'azione con `changed: true`;
  - «Annulla» manda `meals.undo({ actionId, id: nuovo })`;
  - la risposta si applica alla settimana del pasto, anche se nel frattempo è cambiata la
    settimana mostrata o la lingua;
  - con `not_allowed` mostra «Non si può più annullare: il pasto è stato cambiato» e
    rilegge la settimana.
- **Icona** `edit` in `Icon.tsx`, dal prototipo (`#icon-edit`).

### Stati, errori, testi

- Offline: matita, selettore e azioni disattivati; menu in sola lettura.
- `not_found`: «Questo pasto o questa ricetta non è più disponibile», settimana riletta,
  foglio chiuso.
- `invalid`: messaggio nel modulo; `forbidden` e `unauthorized`: gestione globale.
- Testi in `web/src/i18n/messages/meals.ts`, italiano e inglese britannico.
  - «Cambia ricetta» / «Change recipe» e «Non proporre più» / «Don’t suggest again» sono
    identici a `exclusions.emptyBody`, verificato da un test.
  - Note e testi liberi si mostrano come scritti.

## 6. Test e verifiche

Ogni garanzia ha un test scritto nella fase rossa del task che la realizza, con tempo,
versioni e dati deterministici, effetti letti dal database e assenza di scritture nei
rifiuti. In sintesi:

- **pgTAP:** i casi della sezione 3.
- **Dominio:** piatto attuale unico gradito → restano le alternative con voto basso;
  ricetta archiviata fissata conta nel massimo settimanale; stesse regole della
  generazione; ordine stabile; generazione con storico archiviato invariata nei vincoli
  rigidi (test esistenti verdi).
- **Server:**
  - **scritture e registro:** ogni scrittura con azione, righe, canale `web` e `mcp`,
    `updated_by`, `last_action_id`; isolamento fra famiglie, anche per `undo` con l'azione
    di un'altra famiglia (`not_found`, nessuna scrittura);
  - **ripetizioni:** due richieste uguali concorrenti; ripetizione dopo l'archiviazione
    della ricetta (stessa risposta); id riusato con un altro tipo, slot o utente
    (`invalid`); id di un'altra famiglia (`invalid`); richiesta senza effetti ricordata,
    il cui ritentativo dopo la modifica di Bruno non sovrascrive;
  - **scambio e annullamento:** scambio con bozza e con archiviata in entrambi gli ordini;
    annullamento dello scambio sempre per intero, anche dell'annullamento;
    `changed_since` dopo la modifica di un altro su uno solo dei due slot, senza effetti;
    `not_own_change`; `draft_closed` sul percorso RPC completo di un membro non curatore,
    senza scritture dopo il rifiuto; bozza pubblicata nel frattempo ripristinata con lo
    stesso id; annullamento ripartendo solo da `menu.getWeek`. Le bozze importate dei test
    hanno la loro riga aperta in `recipe_drafts` (fixture dedicata) e la chiusura verifica
    di aver chiuso proprio quella;
  - **ordine e istanti:** transazione iniziata prima e bloccata sul lucchetto che salva
    dopo un'altra: `last_action_id`, `undoable` e `updated_at` seguono l'ordine reale;
  - **R1:** settimana passata (gennaio 2026) con due versioni della ricetta: il pasto
    cambiato mostra la versione in vigore quando è passato, non la corrente;
  - **suggerimenti:** pagine, ripartenza, `offset` oltre la fine; esclusione;
    `freeTexts`; voto di un'altra famiglia che cambia la classifica della lettura
    successiva; non versionata;
  - **MCP:** elenco e annotazioni; scrittura; `meals_undo` con l'azione di un altro
    membro → errore `not_allowed` con `reason`.
- **Web:**
  - scheda per ricetta, libero e vuoto, e passaggio da un tipo all'altro;
  - porzioni: numero e contenuto delle richieste, un solo annullamento, chiusura
    anticipata, smontaggio, offline, Strict Mode, richiesta respinta con la scheda
    montata (errore nel pannello) e dopo lo smontaggio (avviso persistente nel Menu);
  - suggerimenti, «Proponimene altri» senza chiamate di scrittura e con il pasto
    invariato;
  - ricerca con soli filtri e voti nei risultati, in italiano e in inglese;
  - esclusione e suo annullamento; scambio, libero, nota;
  - «Annulla» riuscito, rifiutato, dopo il cambio di settimana e dopo il cambio di
    lingua, assente senza effetti;
  - matrice delle invalidazioni con letture in volo; etichette allineate allo stato vuoto
    delle esclusioni.
- **Prova visiva:** modalità finta (porta 8767) a confronto con il prototipo, poi stack
  reale in locale come nella prova di W6. Percorsi a due membri: ultima modifica vista
  dall'altro, annullamento rifiutato dopo la modifica dell'altro, esclusione nel Profilo,
  spesa che segue il cambio. Poi Carla in inglese con misure imperiali.

**Ogni PR passa da sola i controlli di `main`** (`supabase test db`, `npm run typecheck`,
`npm test`).

- **Prima PR:** migrazione, dominio, contratto, server e MCP, più i ritocchi minimi al web
  che il typecheck richiede:
  - i campi nuovi di `lastChange` nel client finto e nelle fixture di test;
  - il testo generico di `not_allowed`.

  `meals` non entra in `SERVER_AREAS`.
- **Seconda PR:** parte da `main` con la prima unita.

## 7. Decisioni da riportare nella specifica

### Prodotto

| Decisione | Sezioni |
|---|---|
| L'annullamento vale anche sui pasti passati e non ha limiti di tempo lato server: solo la propria ultima azione, solo se nessuno ha cambiato dopo i suoi pasti; i 6 secondi sono dell'interfaccia; uno scambio si annulla sempre per intero; un annullamento si può annullare | 5 |
| Da un agente si annulla la propria ultima modifica di un pasto anche in una conversazione nuova: la vista del pasto dice se è annullabile e quali pasti coinvolge | 5, 13 |
| Una richiesta che non cambia nulla non cambia l'ultima modifica mostrata, ma è ricordata: ripeterla non sovrascrive modifiche successive | 1, 5 |
| Porzioni da 1 a 20 nella revisione; testo del pasto libero fino a 60 caratteri; proposte rapide: i quattro testi liberi più usati | 5 |
| Si sceglie solo una ricetta pubblicata (da suggerimenti o ricerca, anche di un libro non posseduto); una archiviata o una bozza importata resta nei pasti che la citano, si sposta con lo scambio e torna con l'annullamento, se la bozza è ancora aperta; se nel frattempo è stata pubblicata torna la ricetta pubblicata (stesso id); se è stata chiusa senza pubblicazione l'annullamento non è più possibile (decisione del coordinatore, 12 ottobre 2026) | 5 |
| Un salvataggio delle porzioni respinto si spiega sempre: errore nel pannello, oppure avviso nel Menu se nel frattempo si è cambiata pagina | 5 |
| Note e testi dei pasti liberi restano come li scrive l'utente, senza traduzione (come le voci libere della spesa); i testi dell'interfaccia restano bilingui | 12, 15 |
| «Non proporre più» dal pasto: l'esclusione resta anche se si chiude il foglio senza scegliere; si annulla dal foglio o dal Profilo | 5 |
| La ricerca del sostituto parte con il tipo di pasto dello slot e si attiva anche con i soli filtri; risultati con il voto in sola lettura, come i suggerimenti | 5 |

### Tecniche

| Decisione | Sezioni |
|---|---|
| Area `meals`: `getSuggestions` (non versionata, per i voti globali), `setServings`, `setRecipe`, `setFree`, `setNote`, `swap`, `undo({actionId, id})`; ogni scrittura è un'azione con `id` dal client e risposta `{week, actionId, changed}` | 1, 5, 13 |
| `app.meal_actions` (una riga per richiesta, mai modificata), `meal_changes.action_id`, `meal_slots.last_action_id` come ordine reale dell'ultima modifica, istanti con `clock_timestamp()` dopo il lucchetto | 2, 5 |
| Registro veritiero (`before` uguale allo slot) e regola delle bozze estesa allo spostamento nella stessa azione e al ripristino di un annullamento, con bozza aperta; `app.meal_action_restores_closed_draft` limitata alle righe dell'azione e alle settimane di chi chiama | 2 |
| `lastChange` della vista del pasto con `actionId`, `undoable`, `slotIds` | 1, 5 |
| `not_allowed` con `not_own_change`, `changed_since`, `draft_closed`; testo generico neutro | 1 |
| Suggerimenti con `rankSuggestions` sulle funzioni della generazione; piatto attuale escluso prima del ripiego sui voti bassi; `fixedRecipes` (archiviate citate dai pasti) nella stessa logica anche per la generazione | 3 |
| Web: bersaglio `week`; matrice delle invalidazioni dei suggerimenti (pasti, esclusioni, impostazioni, libri, ingredienti, voti) | 1 |

### Decisione del coordinatore (12 ottobre 2026)

**Sostituisce il punto 4 di `messaggi/w1-11-review-revisione-pasti.md`** nella parte sulla
bozza pubblicata: se nel frattempo un curatore ha **pubblicato** la bozza, l'annullamento
ripristina la ricetta pubblicata, che ha lo stesso id; `not_allowed` / `draft_closed` solo
se la bozza è stata **chiusa senza pubblicazione** (scartata). Test: `setFree` sull'ultima
citazione di una bozza importata, pubblicazione della bozza, annullamento riuscito con la
ricetta pubblicata nel pasto (`server/test/meals/undo.test.ts`).
