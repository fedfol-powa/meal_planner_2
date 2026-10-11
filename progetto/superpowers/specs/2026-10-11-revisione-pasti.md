# Revisione dei pasti: spec di dettaglio

Creata: 11 ottobre 2026 · Attività W1 dell'ondata 2 · Branch `traguardo/revisione-pasti`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 («Una settimana
tipo», «Le stelline»), sezioni 1, 2, 3 («Riuso durante la revisione»), 5, 13, 14, 15 e 16
(secondo giro del prototipo, 6 ottobre 2026); `design/percorsi.md`, giro 2; prototipo in
`prototype/src/lib/operations/revision.ts`, `suggestions.ts` e nei componenti
`MealActionList`, `MealEditor`, `RecipePicker`, `SwapPicker`, `UndoToast`.

Brainstorming chiuso con il coordinatore l'11 ottobre 2026: area `meals`, due PR (server,
poi web), annullamento senza limiti di tempo lato server, scritture che rispondono con la
vista aggiornata, sezioni 1-3 del design approvate.

## 1. Obiettivo e perimetro

Ogni membro della famiglia può modificare qualunque pasto di qualunque settimana visibile
(passato, in corso, futuro; con ricetta, libero o vuoto), dal web e da un agente MCP:

- cambiare le porzioni;
- cambiare la ricetta scegliendo fra cinque suggerimenti, chiedendone altri cinque
  («Proponimene altri») o cercando nel ricettario;
- segnare il pasto come libero, con un testo;
- scambiarlo con un altro pasto della stessa settimana;
- scrivere o togliere una nota;
- dire «Non proporre più» per la ricetta del pasto e scegliere subito il sostituto;
- annullare una propria modifica subito dopo averla fatta.

Ogni modifica aggiorna `updated_by` e `updated_at` dello slot e aggiunge una riga a
`meal_changes` con il canale (`web` o `mcp`). Vince l'ultimo salvataggio, senza avvisi
di conflitto né di settimana (sezione 5, decisioni del 6 ottobre 2026).

**Fuori dal perimetro:** generazione su richiesta («rigenera», ondata 3); storico completo
delle modifiche nell'interfaccia (si mostra solo l'ultima, già in `menu.getWeek`); elenco
delle esclusioni (W2, già unito); modifiche offline (il menu offline è in sola lettura,
sezione 5).

### Verifiche della sezione 5 fatte nel brainstorming

- L'annullamento non è limitato ai pasti futuri: «Valgono per pasti passati, in corso e
  futuri», «Nessuna azione dipende dalla settimana», l'istante del pasto passato «non
  blocca modifiche». Restano due regole: solo le proprie modifiche, solo se lo slot non è
  cambiato di nuovo.
- Il server non impone un tempo massimo all'annullamento; i «sei secondi» sono
  dell'interfaccia web (default del secondo giro).

## 2. Interfacce: cosa usa e cosa produce

### Usa (già su `main`)

| Interfaccia | Produttore | Firma usata |
|---|---|---|
| Implementatore e pipeline | piattaforma | `Implementer`, `OperationContext` (`tx`, `now`, `userId`, `channel`, `locale`), `fresh(context, view)` da `server/src/pipeline.ts` |
| Vista della settimana | W1 menu | `weekViewOf(context, familyId, weekStartsOn): Promise<WeekView>` da `server/src/menu/week-view.ts`; `weekView`, `mealView` da `contract/src/menu/views.ts` |
| Dati del pianificatore | W1 menu | `loadPlannerInput(tx, familyId, target: GenerationTarget): Promise<PlannerInput>` da `server/src/menu/generation.ts` |
| Pianificatore | W1 menu | `candidatesFor`, `slotRefOf`, `buildContext`, `scoreCandidate`, `compareIds`, `type Placed`, `type PlannerInput`, `type PastMeal` da `domain/src/planner/` |
| Viste della ricetta | W6 | `recipeSummaries(tx, refs: RecipeRef[], locale)`, `ratingSummaries(tx, familyId, userId, recipeIds)`, `recipeSummaryView`, `ratingSummaryView` |
| Esclusioni | W2 | `family.addExclusion({familyId, recipeId})` (idempotente), `family.removeExclusion`, `family.listExclusions` |
| Ricerca nel ricettario | W6 | `recipes.search({familyId, query})` e `RecipeFilters` nel web |
| Client web, sessione e mutazioni | W5, W2 | `SERVER_AREAS`, `Api`, `runAreaMutation`/`applyMutation` e `INVALIDATIONS` in `web/src/api/mutations.ts`, `useSession().track/isLatest`, `isOnline()` |
| Componenti web | W5, W6 | `RecipeCard`, `BottomSheet`, `ServingsStepper`, `RatingStars`, `RecipeFilters`, `Icon`, `StateNotice` |
| Schema | W2 | `app.meal_slots` (grant di `update` sulle colonne di contenuto), `app.meal_changes` (`id` dal client, `undoes` sullo stesso slot, `channel`), trigger dei contatori di famiglia |

### Produce

Nessun'altra attività dipende da queste interfacce. Le firme definitive sono:

**Dominio** (`domain/src/planner/suggest.ts`, esportato dall'indice):

```ts
/**
 * Recipe ids for one slot, best first (spec section 3, «Riuso durante la revisione»): the
 * generation's candidates and score with the other meals of the week fixed, without the
 * slot's current recipe. Deterministic: score, then id.
 */
export function rankSuggestions(
	input: PlannerInput,
	slot: PlannerSlotRef,
	otherMeals: PastMeal[],
	currentRecipeId: string | null,
): string[];
```

**Contratto** (`contract/src/meals/`, area `meals` registrata in `contract/src/contract.ts`):

```ts
const slot = z.object({ familyId: z.uuid(), slotId: z.uuid() });
/** Every write creates a meal_changes row whose id comes from the client. */
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });

export const mealChangeResult = z.object({
	week: weekView,
	/** Rows written to meal_changes, for meals.undo; empty when nothing changed. */
	changeIds: z.array(z.uuid()).max(2),
});
export const suggestionsView = z.object({
	recipes: z.array(z.object({ recipe: recipeSummaryView, rating: ratingSummaryView })).max(5),
	/** Offset of the next five; 0 when the ranking starts again. */
	nextOffset: z.number().int().min(0),
	/** Free-meal texts the family already used, most frequent first. */
	freeTexts: z.array(z.string()).max(4),
});

export const mealsContract = {
	getSuggestions: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
		// GET /families/{familyId}/meals/{slotId}/suggestions
		.errors({ not_found })
		// coerce: REST passes the offset in the query string.
		.input(versionedInput(slot.extend({ offset: z.coerce.number().int().min(0).max(1000).default(0) })))
		.output(versionedOutput(suggestionsView)),
	setServings: write() // PUT /families/{familyId}/meals/{slotId}/servings
		.errors({ not_found })
		.input(slot.extend({ id: z.uuid(), servings: z.number().int().min(1).max(20) }))
		.output(mealChangeResult),
	setRecipe: write() // PUT /families/{familyId}/meals/{slotId}/recipe
		.errors({ not_found })
		.input(slot.extend({ id: z.uuid(), recipeId: z.uuid() }))
		.output(mealChangeResult),
	setFree: write() // PUT /families/{familyId}/meals/{slotId}/free-text
		.errors({ not_found })
		.input(slot.extend({ id: z.uuid(), text: z.string().trim().min(1).max(60) }))
		.output(mealChangeResult),
	setNote: write() // PUT /families/{familyId}/meals/{slotId}/note
		.errors({ not_found })
		.input(slot.extend({ id: z.uuid(), note: z.string().trim().max(200).nullable() }))
		.output(mealChangeResult),
	swap: write() // POST /families/{familyId}/meals/{slotId}/swap
		.errors({ not_found })
		.input(slot.extend({ id: z.uuid(), otherSlotId: z.uuid(), otherId: z.uuid() }))
		.output(mealChangeResult),
	undo: write() // POST /families/{familyId}/meals/undo
		.errors({ not_found, not_allowed })
		.input(z.object({
			familyId: z.uuid(),
			/** The change ids a write answered with: one, or the two of a swap. */
			changeIds: z.array(z.uuid()).min(1).max(2),
			/** Id of the undo of changeIds[0]; otherId undoes changeIds[1]. */
			id: z.uuid(),
			otherId: z.uuid().optional(),
		}))
		.output(mealChangeResult),
};
```

Il controllo del contratto (`contract/src/check.ts`) chiede un `id` uuid alle operazioni
`creates`: per questo l'id della modifica si chiama `id`, e lo scambio e l'annullamento
hanno `otherId` per la seconda riga del registro.

Descrizioni per l'agente (inglese, campo `summary`), da rifinire nei test MCP:

| Operazione | Descrizione |
|---|---|
| `getSuggestions` | Five recipes that fit a meal, best first, from the same rules as the weekly menu; call again with `nextOffset` for five more; also the free-meal texts the family uses most |
| `setServings` | Set the servings of a meal (1-20); `id` is a new UUID you generate for this change |
| `setRecipe` | Put a published recipe in a meal (from suggestions or search); `id` is a new UUID for this change |
| `setFree` | Mark a meal as free (eating out, pizza...) with a short text; keeps the note |
| `setNote` | Write the meal's note (up to 200 characters) or remove it with null |
| `swap` | Swap two meals of the same week: dish or free text and note move, servings stay; `id` and `otherId` are new UUIDs, one per meal |
| `undo` | Undo your own change, given the `changeIds` a write answered with, if nobody changed the meal since; `id` (and `otherId` for a swap) are new UUIDs |

**Errori** (`contract/src/errors.ts`, modifica additiva): `notAllowedData.reason` riceve
`not_own_change` e `changed_since`. Il testo generico di `not_allowed` per MCP
(`server/src/messages.ts`) e per il web (`web/src/i18n/messages/errors.ts`) smette di
citare la ricetta: «Operazione non consentita nello stato attuale» / «This operation is
not allowed in the current state».

## 3. Server (prima PR)

### File

- `server/src/meals/router.ts`: `mealsRouter(os: Implementer)`, registrato in
  `server/src/router.ts` come `meals: mealsRouter(os)` (unica riga nel file condiviso).
- `server/src/meals/slots.ts`: lettura e blocco degli slot.
- `server/src/meals/changes.ts`: scrittura, registro, idempotenza, annullamento.
- `server/src/meals/suggestions.ts`: classifica, pagina e viste.

### Lettura e blocco dello slot

```sql
select s.id, s.week_id, w.starts_on::text, s.date::text, s.meal_type,
	s.recipe_id, s.free_text, s.servings, s.note
from app.meal_slots s join app.weeks w on w.id = s.week_id
where s.id = any($slots) and w.family_id = $familyId
order by s.id
for update of s
```

Gira nel ruolo dell'utente, sotto RLS: uno slot di un'altra famiglia o inesistente non
c'è, e diventa `not_found`. Lo scambio blocca i due slot nello stesso ordine (per id), così
due scambi incrociati non vanno in stallo.

### Contenuto e registro

Il contenuto di uno slot nel registro è
`{recipeId: string | null, freeText: string | null, servings: number, note: string | null}`
(chiavi in quest'ordine, confronto per valore).

Ogni scrittura, nella transazione della richiesta:

1. **Blocco** degli slot (sopra). Viene prima dell'idempotenza: due richieste uguali e
   concorrenti si mettono in fila sullo slot e la seconda vede la riga della prima.
2. **Idempotenza.** `select meal_slot_id, actor_id, undoes from app.meal_changes where id = any($ids)`.
   - Se le righe ci sono, sono dell'utente e sugli slot della richiesta (e, per
     l'annullamento, `undoes` è la modifica indicata): nessuna nuova scrittura, risposta
     con la vista attuale e gli id della richiesta.
   - Se ci sono ma sono di un altro utente o di un altro slot: `invalid` con percorso
     `['id']` (o `['otherId']`).
   - Un id già usato in un'altra famiglia non è visibile: l'inserimento fallisce sulla
     chiave primaria (`23505`) e diventa `invalid` con percorso `['id']`.
3. **Nuovo contenuto.** Se coincide con quello attuale: nessuna scrittura, `updated_by`
   invariato, `changeIds: []`.
4. **Aggiornamento** delle sole colonne previste: `recipe_id`, `free_text`, `servings`,
   `note`, `updated_by = auth.uid()`, `updated_at = now()`.
5. **Registro:** `insert into app.meal_changes (id, meal_slot_id, actor_id, channel, before, after, undoes)`
   con `actor_id = auth.uid()` e `channel = context.channel`.
6. **Risposta:** `{ week: await weekViewOf(context, familyId, startsOn), changeIds }`. La
   vista usa le versioni R1 all'istante della richiesta.

I contatori della famiglia crescono con i trigger esistenti su `meal_slots` e
`meal_changes`: `menu.getWeek`, `menu.getOpening`, `shopping.getWeekList`,
`recipes.get`, `recipes.search` e `meals.getSuggestions` non rispondono più «invariato».

### Regole per operazione

| Operazione | Nuovo contenuto | Rifiuti |
|---|---|---|
| `setServings` | `servings` | — |
| `setRecipe` | `recipeId`, `freeText: null` | ricetta non `published` (bozza, archiviata, inesistente): `not_found` |
| `setFree` | `recipeId: null`, `freeText: text` | — |
| `setNote` | `note` (stringa vuota dopo il trim → `null`) | — |
| `swap` | slot: piatto, testo e nota dell'altro; altro slot: quelli dello slot; porzioni ferme | `otherSlotId = slotId` o `otherId = id`: `invalid`; altro slot di un'altra settimana: `invalid` (`['otherSlotId']`); altro slot non visibile: `not_found` |

Lo scambio scrive due righe del registro (`id` per lo slot, `otherId` per l'altro) e
risponde con quelle che ha scritto (un lato senza effetti non si registra). Può spostare
una ricetta archiviata o una bozza dell'import: il trigger esistente lo permette perché la
famiglia la cita già.

### Annullamento

Per ogni modifica indicata, in ordine, con un solo blocco iniziale di tutti gli slot
coinvolti:

1. la modifica non è visibile o non è della famiglia: `not_found`;
2. `actor_id` non è l'utente: `not_allowed` con `reason: 'not_own_change'`;
3. l'ultima riga del registro dello slot (per `created_at`, poi `id`) non è questa
   modifica, oppure il contenuto attuale è diverso da `after`: `not_allowed` con
   `reason: 'changed_since'` (copre anche una modifica già annullata);
4. con due modifiche, devono essere su slot diversi della stessa settimana; `otherId`
   è obbligatorio con due modifiche e vietato con una (`invalid`).

Se tutti i controlli passano, ogni slot torna a `before` con una nuova riga
(`id`/`otherId`, `undoes` = la modifica annullata): tutto o niente. Ripetere la stessa
richiesta restituisce la vista (idempotenza sopra). Annullare un annullamento è permesso:
è una modifica propria come le altre. Nessun limite di tempo e nessun limite sui pasti
passati.

### Suggerimenti

1. Lettura dello slot senza blocco (stessa query, senza `for update`): `not_found` se manca.
2. `input = await loadPlannerInput(tx, familyId, { weekStart: startsOn })`.
3. `otherMeals`: gli altri slot della settimana con ricetta (`{date, mealType, recipeId}`).
4. `ranked = rankSuggestions(input, {date, mealType}, otherMeals, slot.recipeId)`.
5. Pagina: `start = offset < ranked.length ? offset : 0`, cinque elementi,
   `nextOffset = start + 5 < ranked.length ? start + 5 : 0`.
6. Viste: `recipeSummaries` con `{recipeId, version: null, servings: slot.servings}` (la
   versione corrente) e `ratingSummaries(tx, familyId, userId, ids)`.
7. `freeTexts`: i quattro `free_text` più usati negli slot della famiglia, a parità in
   ordine alfabetico (`order by count(*) desc, free_text`).

`rankSuggestions` nel dominio:

- `slotRef = slotRefOf(slot, input.settings)` (tempo massimo dalle impostazioni);
- `weekRecipes`: le ricette di `otherMeals` presenti nel catalogo del pianificatore;
- `candidatesFor(slotRef, input, weekRecipes)`: stesse regole della generazione
  (esclusioni, libri, ingredienti evitati, tipo di pasto, regole di pasto, tempi, ricette
  delle due settimane prima e dopo, massimi settimanali, voti bassi solo senza
  alternative);
- tolta `currentRecipeId`;
- `scoreCandidate(recipe, slot, buildContext(input, placed))` con `placed` = `otherMeals`
  presenti nel catalogo;
- ordinamento per punteggio decrescente, poi `compareIds`.

La ricerca nel ricettario resta libera (sezione 3): il web usa `recipes.search`.

### Strumenti MCP

Generati dal contratto: `meals_getSuggestions` (sola lettura), `meals_setServings`,
`meals_setRecipe`, `meals_setFree`, `meals_setNote`, `meals_swap`, `meals_undo`. Gli
errori arrivano all'agente con il codice, il testo nella lingua dell'utente e i dati
(`reason`, percorsi di `invalid`).

### Migrazioni

Nessuna. Lo schema di W2 ha già tutto: `meal_changes.id` dal client, `undoes` sullo
stesso slot con chiave esterna composta, `channel`, grant di `update` sulle colonne di
contenuto, policy di inserimento con `actor_id = auth.uid()`, contatori con trigger.

## 4. Web (seconda PR)

### Collegamento

- `meals` in `SERVER_AREAS` (`web/src/api/types.ts`).
- Client finto: `web/src/api/fake/fakeMeals.ts`, sul modello di `fakeShopping`, con la
  regola simulata del secondo giro (`design/percorsi.md`, «Suggerimenti simulati») e un
  registro in memoria per l'annullamento; aggiunto in `createFakeApi` e `withTransport`.
- Query: `suggestionsQuery(deps, familyId, slotId, offset)` con chiave
  `['meals', 'getSuggestions', { familyId, slotId, offset, locale }]`, letta con
  `readThrough`.

### Invalidazioni (`web/src/api/mutations.ts`)

- Nuovo bersaglio `week`: la chiave `['menu', 'getWeek', { familyId, weekStartsOn, locale }]`.
  `ApplyOptions` riceve `weekStartsOn`; `targetKey` e `sameView` lo usano per il bersaglio
  `week`. La chiave di tracciamento è `week:<familyId>:<weekStartsOn>`.
- Righe nuove di `INVALIDATIONS`:

| Operazione | Bersaglio | Viste scadute (stessa famiglia) |
|---|---|---|
| `meals.setServings`, `setRecipe`, `setFree`, `setNote`, `swap`, `undo` | `week` | `menu.getOpening`, `shopping.getWeekList`, `recipes.get`, `recipes.search`, `meals.getSuggestions` |
| `family.addExclusion`, `family.removeExclusion` (righe di W2) | `exclusions` (invariato) | in più `meals.getSuggestions` |

- La risposta scrive `week.data` mantenendo la versione vecchia (modello esistente), così
  la lettura successiva riceve dati nuovi; una risposta superata non si scrive e marca
  scadute le viste.
- Nessun aggiornamento ottimistico: il controllo mostra lo stato «in corso» fino alla
  risposta.
- Hook `useMealMutation(name, familyId, weekStartsOn)` in `web/src/features/meals/`:
  rifiuta subito offline con `network` (come i voti), genera gli `id` con
  `crypto.randomUUID()`, restituisce `changeIds` per l'annullamento.

### Componenti (`web/src/features/meals/`)

Dal secondo giro del prototipo, con la guida di `design/design.md`:

- **`RecipeCard`** (W6): prop facoltativa `actions?: ReactNode` resa nel footer (matita e
  pannello), per ogni tipo di pasto; lo slot vuoto mostra anche «Scegli una ricetta», che
  apre il foglio sui suggerimenti. `MenuPage` passa `<MealActions>`.
- **`MealActions`**: matita (`aria-expanded`) e pannello sotto la scheda con Porzioni (solo
  ricette; `ServingsStepper` da 1 a 20, salvataggio 800 ms dopo l'ultimo tocco e alla
  chiusura del pannello), «Cambia ricetta», «Nota».
- **`MealEditor`**: `BottomSheet` con le fasi `picker`, `swap`, `free`, `note`.
- **`RecipePicker`**: in cima «Segna come pasto libero», «Non proporre più» (solo con una
  ricetta), «Scambia con un altro pasto»; poi i suggerimenti in schede scorrevoli con
  `RatingStars` in sola lettura (media, numero di voti, proprio voto); «Proponimene altri»
  passa a `nextOffset` senza cambiare il piatto; poi la ricerca con `RecipeFilters` e
  `recipes.search`. Scegliere una ricetta chiama `meals.setRecipe` e chiude il foglio.
- **«Non proporre più»**: `family.addExclusion` per la ricetta del pasto, poi il foglio
  mostra i suggerimenti riletti con «Annulla esclusione» in cima (`removeExclusion`).
  Chiudere senza scegliere lascia l'esclusione e il pasto com'è.
- **`SwapPicker`**: gli altri slot della settimana dalla vista `getWeek` (giorno, pasto,
  contenuto); la scelta chiama `meals.swap`.
- **`FreeMealForm`**: proposte rapide (`freeTexts`) e campo di testo fino a 60 caratteri.
- **`NoteForm`**: campo fino a 200 caratteri con contatore, «Salva» e «Togli nota».
- **`UndoToast`**: dopo una modifica con `changeIds` non vuoti, per 6 secondi, «Annulla»
  manda `meals.undo` con id nuovi; con `not_allowed` mostra «Non si può più annullare: il
  pasto è stato cambiato» e la settimana si rilegge. Un nuovo avviso sostituisce il
  precedente.
- **Icona matita** in `web/src/components/Icon.tsx` dalla guida, se manca.

### Stati ed errori

- Offline: matita e azioni disattivate, menu in sola lettura (sezione 5), banner esistente.
- `not_found`: «Questo pasto o questa ricetta non è più disponibile», settimana riletta,
  foglio chiuso.
- `invalid`: messaggio nel modulo; `forbidden` e `unauthorized`: gestione globale.

### Testi

`web/src/i18n/messages/meals.ts` in italiano e inglese britannico, registrato nell'indice
dei dizionari. «Cambia ricetta» / «Change recipe» e «Non proporre più» / «Don’t suggest
again» sono identici alle etichette citate da `exclusions.emptyBody` (W2): un test lo
verifica, così il rimando dallo stato vuoto delle esclusioni resta vero (rilievo 3 della
prova sullo stack reale di W6).

## 5. Test e verifiche

**Prima PR (server):**

- dominio, `rankSuggestions`: stesse esclusioni della generazione, piatto attuale escluso,
  altri pasti della settimana esclusi, tempo massimo dello slot, massimi settimanali
  contati con gli altri pasti, ordine stabile;
- server (Vitest con Postgres, come `server/test/menu/`), file `server/test/meals/`:
  ogni scrittura con registro, canale `web` e `mcp`, `updated_by`; scrittura senza
  effetti; idempotenza e id riusati (stesso utente, altro utente, altra famiglia);
  isolamento fra famiglie; ricetta in bozza, archiviata e inesistente; scambio e i suoi
  rifiuti; annullamento semplice e di uno scambio, `changed_since`, `not_own_change`,
  annullamento ripetuto, annullamento di un annullamento; pasto passato modificabile con
  R1 coerente; contatore cresciuto (`getWeek` e `shopping.getWeekList` non «invariati»);
  suggerimenti (pagine, ritorno all'inizio, esclusione appena aggiunta, voti, testi
  liberi, `not_found`);
- MCP: elenco degli strumenti `meals_*` con `readOnlyHint` corretto, una scrittura e un
  errore `not_allowed` come li vede un agente;
- contratto: metadati e nuovi motivi di `not_allowed`.

**Seconda PR (web):** Vitest e Testing Library con il server di test (`rpcServer`):
ogni flusso del pannello e del foglio; porzioni con attesa e un solo annullamento;
«Proponimene altri»; esclusione e il suo annullamento; «Annulla» riuscito e rifiutato;
invalidazioni (bersaglio, viste scadute, risposta superata, cambio di lingua); azioni
disattivate offline; voto in sola lettura nei suggerimenti; etichette allineate allo stato
vuoto delle esclusioni.

**Prova visiva:** agent-browser in modalità finta (porta 8767, iPhone) a confronto con il
prototipo; poi **sullo stack reale in locale** come nella prova di W6
(`progetto/coordinamento/messaggi/w6-prova-stack-reale.md`): Supabase locale, Worker con
`wrangler dev`, catalogo caricato con le operazioni dei curatori, menu dal job settimanale;
percorsi da provare con due membri della stessa famiglia (modifica e ultima modifica
vista dall'altro, annullamento rifiutato dopo la modifica dell'altro, esclusione che
compare nel Profilo e nei suggerimenti, lista della spesa che segue il cambio di piatto) e
in inglese con misure imperiali.

**Ogni PR passa da sola i controlli di `main`** (CI: `supabase test db`, `npm run
typecheck`, `npm test`): la prima non tocca il web salvo i testi generici di `not_allowed`,
perché `meals` non è in `SERVER_AREAS`; la seconda parte da `main` con la prima già unita e
porta insieme client finto, `SERVER_AREAS` e schermate.

## 6. Decisioni da riportare nella specifica

### Prodotto

| Decisione | Sezioni |
|---|---|
| L'annullamento vale anche sui pasti passati e non ha limiti di tempo lato server: solo le proprie modifiche, solo se lo slot non è cambiato dopo; i 6 secondi sono dell'interfaccia; un annullamento si può a sua volta annullare | 5 |
| Una modifica che non cambia nulla non si registra e non cambia l'ultima modifica mostrata | 5 |
| Porzioni di un pasto da 1 a 20 nella revisione (limiti del prototipo); testo del pasto libero fino a 60 caratteri; proposte rapide: i quattro testi liberi più usati dalla famiglia | 5 |
| Nella revisione si sceglie solo una ricetta pubblicata (da suggerimenti o ricerca), anche di un libro non posseduto; una archiviata resta solo nei pasti che già la citano e si sposta con lo scambio | 5 |
| «Non proporre più» dal pasto: l'esclusione resta anche se si chiude il foglio senza scegliere il sostituto; si annulla dal foglio («Annulla esclusione») o dal Profilo | 5 |

### Tecniche

| Decisione | Sezioni |
|---|---|
| Area `meals` del contratto: `getSuggestions`, `setServings`, `setRecipe`, `setFree`, `setNote`, `swap`, `undo`; ogni scrittura con `id` della modifica dal client (`otherId` per la seconda riga di scambio e annullamento) e risposta `{week, changeIds}` con la vista della settimana | 1, 5, 13 |
| `not_allowed` con i motivi `not_own_change` e `changed_since`; testo generico non più legato alla ricetta | 1 |
| Suggerimenti: `rankSuggestions` nel dominio sulle funzioni della generazione (`candidatesFor`, `scoreCandidate`) con i dati di `loadPlannerInput`; pagine da 5 con `offset`, ordine per punteggio e id | 3 |
| Nessuna migrazione: lo schema di W2 basta (`meal_changes.id` dal client, `undoes`, grant delle colonne di contenuto) | 2 |
| Web: bersaglio `week` nelle mutazioni; le scritture dei pasti fanno scadere apertura, spesa, ricetta, ricerca e suggerimenti; le esclusioni fanno scadere anche i suggerimenti | 1 |
