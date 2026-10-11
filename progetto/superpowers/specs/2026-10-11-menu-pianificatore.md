# Menu, pianificatore, job del mercoledì e generazione pigra: spec di dettaglio

Creato: 11 ottobre 2026
Stato: brainstorming chiuso con il coordinatore l'11 ottobre 2026.
Attività: W1 dell'ondata 2 (`progetto/superpowers/plans/2026-10-11-piano-generale.md`,
brief `progetto/coordinamento/brief/w1-menu-pianificatore.md`), branch `traguardo/menu`.

Estende la specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 («Quando apri
l'app», «Una settimana tipo», «Come sceglie i piatti»), sezioni 2, 3, 4, 5 (solo
lettura e generazione del menu), 12 e 13. In caso di contrasto vale la specifica
principale, salvo le scelte elencate in fondo come decisioni da riportare.

## Obiettivo

1. **Lettura del menu**: giorno di apertura, settimana e giorni con menu, come viste
   pronte nella lingua dell'utente, versionate con la risposta «invariato»; uno strumento
   MCP di sola lettura per ciascuna.
2. **R1**: ogni pasto usa la versione della ricetta giusta per il momento del pasto;
   la scelta è una funzione riusabile del server, usata anche dalla spesa (W4).
3. **Generazione** di una settimana con il pianificatore della sezione 3, già in
   `domain/src/planner/` (esperimento M0), a partire dai dati del database.
4. **Job orario** con un Cron Trigger di Cloudflare: la settimana successiva per le
   famiglie per cui è passato mercoledì alle 20:00 nel loro fuso.
5. **Generazione pigra** alla lettura del menu, che copre anche la prima generazione
   di una famiglia senza settimane.
6. **Schermata Menu** dell'app web sui dati veri.

**Fuori da questa attività:** azioni sui pasti, suggerimenti, annullamento e registro
delle modifiche (attività «Revisione dei pasti»); operazione esplicita «rigenera» e
wizard della famiglia nuova (ondata 3); giudice AI; email di allarme, che arriva con
Resend nell'ondata 3 (qui solo una riga di log, sezione 4.4).

## Dipendenze e interfacce

| Da | Cosa | Stato |
|---|---|---|
| W1 piattaforma (su `main`) | contratto, `createImplementer`, `withDb` con i ruoli `user` e `job`, `readVersion`, MCP generato | unito |
| W2 schema (su `main`) | `app.weeks`, `app.meal_slots`, `app.weekly_jobs`, `app.recipe_version_at`, `app.meal_passed_at`, `family_scores`, `global_scores`, contatori di versione, ruolo `app_job` | unito |
| W3 ricetta e import | `RecipeDocument` e `toPlannerRecipe(id, document, bookId)` in `domain/src/recipe/` | in implementazione |
| W2 profilo e famiglia | `resolveFamilySettings(saved) → PlannerSettings` in `domain/src/family/settings.ts`, con lo schema zod dei valori salvati in `families.settings` (deciso dal coordinatore) | in brainstorming |
| W6 ricettario e voti | `ingredientLinesView`, `ratingSummaries`, `recipeSummaryView` e i relativi schemi del contratto (sezione 6, proposta) | in brainstorming |
| W4 unità e spesa | scalatura e presentazione delle quantità, usate da W6 dentro `ingredientLinesView`; W4 importa `mealRecipeVersions` (sezione 3) | PR #7 |
| W5 app web | `MenuPage`, `DatePicker`, `DaySelector`, `RecipeCard`, `RatingStars`, `IngredientList`, client oRPC reale (seconda PR di W5) | PR #6 |

Il pianificatore (`PlannerSettings`, `PlannerInput`, default) resta di questa attività;
lo schema delle impostazioni salvate è di W2 profilo: qui non si ridefinisce.

## 1. Dominio: aggiunte al pianificatore

Il comportamento della generazione non cambia: stessi passi, pesi e report
(`npm run planner-report` dà le stesse settimane). Si aggiunge solo:

### 1.1 Primo pasto da pianificare

`PlannerInput.from?: { date: IsoDate; mealType: MealType }`. Gli slot prima di quel
pasto non si creano (come se le porzioni fossero 0): serve a generare la settimana
corrente a metà, «dai pasti non ancora passati» (sezione 4). Senza `from` si pianifica
la settimana intera. `from` fuori dalla settimana è un errore di programmazione
(eccezione).

### 1.2 Calendario nel fuso della famiglia

In `domain/src/planner/local-time.ts` (accanto a `calendar.ts`, che lavora su date
senza fuso), solo con `Intl` (ECMAScript, nessuna API del runtime):

- `localDateTime(instant: Date, timeZone: string) → { date: IsoDate; time: 'HH:mm' }`:
  data e ora locali (con `Intl.DateTimeFormat` e `formatToParts`, calendario
  gregoriano, ore 00-23).
- `MEAL_PASSES_AT` (`lunch: '15:30'`, `dinner: '23:00'`) e
  `isMealPast(date, mealType, local)`: confronto sull'ora locale, coerente con
  `app.meal_passed_at` (sezione 5 della specifica).
- `firstOpenMeal(local) → { date, mealType }`: il primo pasto non ancora passato
  (pranzo di oggi prima delle 15:30, cena di oggi prima delle 23:00, altrimenti il
  pranzo di domani).
- `mondayOf(date)` e `nextWeekStart(local)`.
- `generationTargets(local, existingWeekStarts) → { weekStart, from? }[]`, la regola
  unica della sezione 4:
  - **settimana corrente** (il lunedì della data locale) se manca, con
    `from = firstOpenMeal(local)`; se il primo pasto aperto cade dopo domenica, nulla;
  - **settimana successiva** se manca e la data e ora locali sono uguali o successive
    a mercoledì della settimana corrente alle 20:00; senza `from`.
- `isNextWeekDue(local)` e `isNextWeekOverdue(local)` (giovedì alle 08:00 locali, 12 ore
  dopo mercoledì alle 20:00; l'ora legale non cambia mai di mercoledì o giovedì nei fusi
  europei, e altrove lo scarto è al più di un'ora) per il job.

Un fuso non valido non arriva qui: lo valida W2 al salvataggio. Il server, se `Intl` lo
rifiuta comunque, usa `Europe/Rome` e registra una riga di log (sezione 4.4).

Lo storico che il server passa al pianificatore (`history`) comprende tutti gli slot con
ricetta della famiglia con data precedente al lunedì generato, anche quelli non ancora
passati della settimana corrente: per la somiglianza e per «non due volte in 14 giorni»
contano come mangiati (specifica, sezione 3: «storico degli slot delle settimane
precedenti e della settimana in corso»).

## 2. Generazione nel server

`server/src/menu/generation.ts`:

```ts
/** Everything the planner reads, from the database, in the transaction's role. */
loadPlannerInput(tx: Tx, familyId: string, target: { weekStart: IsoDate; from?: PlannerSlotRef }): Promise<PlannerInput>

/** Creates the week if it does not exist yet. Returns false when it already existed. */
generateWeek(tx: Tx, familyId: string, target: { weekStart: IsoDate; from?: PlannerSlotRef }): Promise<boolean>

/** Lazy generation: the targets of generationTargets() for the family, now. */
ensureWeeks(tx: Tx, familyId: string, now: Date): Promise<void>
```

**Ingresso del pianificatore** (`loadPlannerInput`), poche query nella stessa
transazione:

| Campo | Fonte |
|---|---|
| `settings` | `resolveFamilySettings(families.settings)` di W2 |
| `recipes` | ricette `published` (non archiviate, non bozze) con il documento della versione corrente: `recipes r join recipe_versions v on (v.recipe_id, v.version) = (r.id, r.version)`, poi `toPlannerRecipe(r.id, v.content, r.book_id)` di W3. Il contenuto è già validato alla pubblicazione e non si rivalida |
| `ownedBookIds` | `family_books` |
| `exclusions` | `recipe_exclusions` |
| `restrictions` | `family_ingredients` |
| `familyScores` | `family_scores` della famiglia |
| `globalScores` | `global_scores` |
| `history` | slot con `recipe_id` delle settimane della famiglia con `date < weekStart`, in ordine di data e pasto |
| `from` | dal bersaglio |

**Scrittura** (`generateWeek`):

1. `insert into app.weeks (family_id, starts_on, generated_at) values (…, now())
   on conflict (family_id, starts_on) do nothing returning id`. Senza riga restituita la
   settimana esiste già (un'altra richiesta o il job l'hanno creata, anche in
   concorrenza: con `read committed` l'`insert` attende l'altra transazione) e la
   funzione restituisce `false` senza calcolare niente.
2. `loadPlannerInput`, poi `generateWeek` del dominio (nessun giudice).
3. Un `insert` di tutti gli slot: `recipe_id` oppure `free_text` (slot fisso), entrambi
   null per «nessuna ricetta adatta»; `servings` dalla matrice; `updated_by` null
   (l'app); niente righe in `meal_changes`, perché la generazione crea e non modifica.

La settimana e gli slot fanno crescere il contatore della famiglia tramite i trigger di
W2, una sola volta per transazione.

**Ruolo**, come chiesto dal coordinatore, senza allargare i permessi dei membri:

- **generazione pigra**: nella transazione dell'utente, ruolo `authenticated`. Le policy
  di W2 già esistenti bastano: `weeks_member` e `meal_slots_member` (insert nella
  propria famiglia), lettura di `recipe_versions`, `family_scores`, `global_scores` e
  delle tabelle della famiglia. Un membro poteva già creare settimane e slot della sua
  famiglia; nessuna grant o policy nuova. Le candidate sono ricette pubblicate, quindi
  il trigger di W2 sulle bozze non interviene. Un test lo verifica (sezione 8).
- **job**: ruolo `app_job` (`withDb(..., { kind: 'job' })`), con le grant di W2.

Stesso codice in entrambi i casi: cambia solo il ruolo della transazione.

## 3. Versione della ricetta per pasto (R1)

`server/src/menu/versions.ts`, riusabile, **importata da W4 per la spesa** (richiesta
del coordinatore):

```ts
export interface MealRecipeVersion {
	slotId: string;
	recipeId: string;
	/** Version shown by the meal; null when the recipe was never published. */
	version: number | null;
	/** True when the meal is past at the time of the call. */
	isPast: boolean;
}

/** Slots with a recipe of one week, with the version each meal uses (spec section 5, R1). */
export function mealRecipeVersions(tx: Tx, familyId: string, weekId: string): Promise<MealRecipeVersion[]>
```

Una sola query, nel ruolo della transazione chiamante (utente o job): per ogni slot con
ricetta, se `app.meal_passed_at(date, meal_type, families.time_zone) <= now()` allora
`app.recipe_version_at(recipe_id, quel momento)`, altrimenti `recipes.version` se la
ricetta è stata pubblicata almeno una volta (`version > 0`), altrimenti null. Dove
`recipe_version_at` non trova una versione al momento del pasto prende la prima
pubblicata, e null se non ce ne sono (decisione del coordinatore dell'11 ottobre). Una
settimana di un'altra famiglia o inesistente dà un elenco vuoto (RLS e filtro su
`familyId`).

Un pasto con versione null mostra solo nome e descrizione da `recipes` (sezione 5.3) e
non entra nella spesa (W4).

## 4. Job del mercoledì

### 4.1 Pianificazione

Cron Trigger di Cloudflare (scelto con il coordinatore al posto di `pg_cron` con
`pg_net`): niente segreto condiviso, niente rotta `/internal/jobs/*` e niente passi nel
Vault di Supabase. In `server/wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 * * * *"] }
```

In `server/src/index.ts` (modifica minima) il Worker esporta anche
`scheduled(controller, env, ctx)`, che chiama `runWeeklyJob(env, new Date(controller.scheduledTime))`
di `server/src/menu/job.ts`. Sul piano a pagamento un'invocazione di un Cron Trigger ha
fino a 15 minuti di CPU (documentazione di Cloudflare consultata l'11 ottobre 2026), molto
oltre i circa 25 ms per famiglia. La query oraria tiene anche attivo il progetto gratuito
di Supabase (sezione 1 della specifica). La configurazione remota non serve: il Cron
Trigger si attiva con il primo `wrangler deploy` (passi di produzione della piattaforma).
In locale: `wrangler dev --test-scheduled` e `curl
"http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.

### 4.2 Esecuzione

`runWeeklyJob(env, now)`:

1. **Smistamento**, una transazione `app_job`: legge le famiglie (`id`, `time_zone`) e,
   per ciascuna, se esiste già la settimana successiva; per quelle con
   `isNextWeekDue(local)` e senza settimana inserisce la riga
   `weekly_jobs (family_id, target_week)` con `on conflict do nothing`.
2. **Elaborazione**, una famiglia alla volta, ciascuna nelle sue transazioni e nel suo
   `try/catch`: righe con `status` `pending` o `failed`. Per ognuna:
   - una transazione esegue `generateWeek` e scrive `status = 'done'`, `attempts + 1`,
     `error = null`; se la settimana esisteva già, per esempio creata dalla generazione
     pigra, la riga diventa comunque `done`;
   - in caso di errore la transazione si annulla e una seconda transazione scrive
     `status = 'failed'`, `attempts + 1`, `error` (codice e nome dell'errore, al massimo
     500 caratteri, mai dati né segreti) e `updated_at`; si passa alla famiglia
     successiva.
   Lo stato `running` dello schema non si usa: la generazione e il suo esito stanno in
   una sola transazione, quindi un'esecuzione interrotta lascia la riga com'era e la
   successiva la riprende.
3. **Ritardi**: per le righe non `done` con `isNextWeekOverdue(local)`, una riga di log
   per famiglia (sezione 4.4) a ogni esecuzione oraria, finché la settimana manca.

Un'esecuzione senza famiglie da servire legge le famiglie e finisce. Due esecuzioni
sovrapposte non fanno danni: la generazione è idempotente per l'unicità di
(`family_id`, `starts_on`) e lo stato della riga è solo informativo (al più un
tentativo contato due volte). Il job genera solo la
settimana successiva: la settimana corrente mancante (famiglia nuova, buchi) la crea la
generazione pigra quando qualcuno apre il menu.

### 4.3 Generazione pigra

Hook `prepare` nel percorso della richiesta (approvato dal coordinatore, modifica
minima in `server/src/pipeline.ts` con test): `createImplementer(contract, { prepare })`
riceve una mappa dal percorso dell'operazione (`'menu.getOpening'`…) a
`(context: OperationContext, input) => Promise<void>`, eseguita nella transazione
dell'utente dopo sessione, controllo `web_only` e ruolo, **prima** di `readVersion`.
Così la versione restituita comprende già la settimana generata e un client con la
versione in cache non riceve «invariato» quando la settimana è appena nata.

Le tre letture del menu registrano `prepare: ensureWeeks(tx, input.familyId, now)`:

- legge le settimane esistenti della famiglia fra il lunedì corrente e il successivo
  (una query piccola), calcola `generationTargets` e chiama `generateWeek` per ciascun
  bersaglio;
- ogni generazione gira in un **savepoint**: se fallisce, il savepoint si annulla, la
  riga di log `lazy_generation_failed` registra famiglia e codice d'errore, e la lettura
  prosegue senza quella settimana (il job ritenterà la successiva; la corrente al
  prossimo accesso);
- costo: la prima apertura dopo mercoledì sera aggiunge circa 25 ms di CPU per
  settimana generata; tutte le altre letture una sola query.

Anche via MCP le letture possono quindi scrivere una settimana: è la rete di sicurezza
della sezione 4 della specifica («o un agente legge il menu»). Lo strumento resta
marcato in sola lettura per l'agente: la scrittura è idempotente e non dipende
dall'input.

### 4.4 Log

Righe JSON con campi scelti (convenzione della piattaforma, mai messaggi o segreti):
`weekly_job_failed` (famiglia, settimana, tentativi, codice), `weekly_job_overdue`
(famiglia, settimana, tentativi), `lazy_generation_failed` (famiglia, settimana,
codice), `invalid_time_zone` (famiglia). L'email al referente operativo arriva con
Resend nell'ondata 3; il punto di aggancio è `weekly_job_overdue`.

## 5. Letture del menu

### 5.1 Contratto (`contract/src/menu/`)

Registrate nell'indice del contratto con una riga. Metadati comuni: `mcp: { readOnly:
true }`, `offline: false`, `role: 'familyMember'`, `reads: ['family', 'catalogue']`
(nomi e contenuti delle ricette seguono il ricettario).

| Operazione | Input | Output (`data`) | Errori propri |
|---|---|---|---|
| `menu.getOpening` | `familyId`, `today?` | `OpeningView` | — |
| `menu.getWeek` | `familyId`, `weekStartsOn` (lunedì) | `WeekView` | `not_found` (settimana inesistente) |
| `menu.getDates` | `familyId`, `month` (`YYYY-MM`) | `IsoDate[]` | — |

Tutte con `versionedInput` e `versionedOutput`. Rotte REST `GET /families/{familyId}/menu/opening`,
`GET /families/{familyId}/menu/weeks/{weekStartsOn}`, `GET /families/{familyId}/menu/dates/{month}`.

**`today` in `getOpening`.** Il giorno di apertura dipende dalla data, che la versione
non contiene. Il web manda sempre `today`, la data locale della famiglia calcolata sul
dispositivo (come fa già per i pasti passati), così ogni giorno è un input diverso con
la sua versione. Senza `today` (agenti MCP, che non mandano `knownVersion`) il server
usa la data locale della famiglia. Un `today` lontano più di un giorno dalla data locale
del server è `invalid` (orologio del dispositivo sbagliato).

### 5.2 Viste

Forma dell'`Api` di W5 (`web/src/api/types.ts`), con i vocabolari del dominio:

```ts
type OpeningView = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };

interface WeekView { startsOn: IsoDate; days: DayView[] }          // sette giorni, da lunedì
interface DayView { date: IsoDate; meals: MealView[] }              // pranzo prima della cena
interface MealView {
	slotId: string;
	date: IsoDate;
	mealType: 'lunch' | 'dinner';
	kind: 'recipe' | 'free' | 'empty';
	recipe: RecipeSummaryView | null;        // W6
	freeText: string | null;
	servings: number;
	ingredients: IngredientLineView[] | null; // W6; null se la versione è null
	note: string | null;
	rating: RatingSummary | null;            // W6; null se la ricetta non è mai stata pubblicata
	canOpenRecipe: boolean;                  // false se la versione è null
	lastChange: { userName: string | null; at: LocalDateTime } | null;
}
```

- **Apertura**: oggi (`today`) se ha almeno un pasto con contenuto (ricetta o testo
  libero), altrimenti il primo giorno successivo che ne ha, altrimenti l'ultimo giorno
  con slot prima di oggi; `no_weeks` se la famiglia non ha settimane (anche dopo la
  generazione pigra, per esempio senza ricette adatte e senza slot).
- **Giorni con menu** (`getDates`): giorni del mese con almeno uno slot nelle settimane
  della famiglia, quelli che il calendario rende selezionabili.
- **Ultima modifica**: `updated_by` e `updated_at` dello slot, solo se `updated_by` non è
  null (la generazione non mostra un autore); `userName` è il `display_name` del profilo
  se l'autore è ancora membro, altrimenti null («ex membro»); `at` è l'ora locale della
  famiglia (`YYYY-MM-DDTHH:mm`).
- **Slot vuoto** (`empty`): «Nessuna ricetta adatta».

### 5.3 Composizione della settimana

`server/src/menu/week-view.ts`, nel gestore di `getWeek` (e per l'apertura solo le date):

1. la settimana e i suoi slot, con nome dell'autore dell'ultima modifica;
2. `mealRecipeVersions(tx, familyId, weekId)`;
3. i documenti delle coppie distinte (ricetta, versione) da `recipe_versions` in una
   query; per le ricette con versione null nome e descrizione da `recipes.name` e
   `recipes.description` (riempiti anche per le bozze nuove, decisione del coordinatore
   dell'11 ottobre), nella lingua dell'utente;
4. `recipeSummaryView`, `ingredientLinesView` (porzioni dello slot, sistema di misura della
   famiglia, lingua dell'utente) e `ratingSummaries` di W6, in blocco per tutta la
   settimana (nessuna query per pasto).

Le ricette archiviate restano visibili e votabili dai pasti che le usano (specifica,
sezione 5). L'output non dipende dall'ora oltre alla generazione: il passaggio di un
pasto a «passato» non cambia la versione mostrata se nel frattempo il ricettario non è
cambiato, e quando il ricettario cambia cresce il suo contatore.

## 6. Interfaccia con W6 (proposta, da concordare tramite il coordinatore)

W6 possiede le viste della ricetta; il Menu le importa. Proposta di firme, in
`server/src/recipes/views.ts` (W6) e `contract/src/recipes/views.ts` (W6, schemi zod
`recipeSummaryView`, `ingredientLineView`, `ratingSummary`):

```ts
export interface RecipeAtVersion {
	recipeId: string;
	version: number;
	document: RecipeDocument; // W3
}

/** Ready ingredient lines, batched: one query for the ingredient names of every item. */
export function ingredientLinesView(
	tx: Tx,
	items: { key: string; recipe: RecipeAtVersion; servings: number }[],
	options: { locale: Locale; measurementSystem: 'metric' | 'uk_imperial' },
): Promise<Map<string, IngredientLineView[]>>;

/** Family average, number of votes and the caller's stars, for each recipe. */
export function ratingSummaries(tx: Tx, familyId: string, recipeIds: string[]): Promise<Map<string, RatingSummary>>;

/** Card data of a recipe at a version, in the user's language (book title looked up in batch). */
export function recipeSummaryViews(
	tx: Tx,
	recipes: RecipeAtVersion[],
	locale: Locale,
): Promise<Map<string, RecipeSummaryView>>; // key: `${recipeId}:${version}`
```

Se il Menu arriva prima di W6, scrivo questo modulo nella stessa posizione con queste
firme e W6 lo adotta (scelta del coordinatore). Per i pasti con versione null il Menu
costruisce da solo il riassunto minimo (nome, descrizione, nient'altro).

## 7. Web

Sulla base di W5, quando la sua seconda PR (client oRPC reale) è su `main`:

- `Api.menu` diventa il client del contratto; i tipi di `web/src/api/types.ts` del menu
  lasciano il posto a quelli del contratto (con i vocabolari del dominio, per esempio
  `protein_group` con `red_meat` e `cured_meat` al posto di `meat`); il client finto si
  allinea.
- `getOpening` riceve `today`, la data locale della famiglia calcolata con
  `families.time_zone` (già nella `FamilyView` di W5).
- La schermata `MenuPage` non cambia nella resa: ultima modifica, slot vuoto e stati
  sono già quelli del percorso 1. «Ancora nessun menu» diventa raro (famiglia senza slot
  dopo la generazione pigra).
- Nessuna mutazione in questa attività.

## 8. Test

- **Dominio** (Vitest): `from` (slot precedenti non creati, settimana intera senza);
  `localDateTime` in `Europe/Rome`, `Europe/London` e `America/New_York` attorno ai
  cambi dell'ora legale; `firstOpenMeal` ai confini 15:30 e 23:00; `generationTargets`
  per famiglia senza settimane, lunedì mattina, domenica a mezzanotte meno un minuto,
  mercoledì 19:59 e 20:00, settimane già presenti; `isNextWeekOverdue`. Report del
  pianificatore invariato.
- **Server** (Vitest con Postgres locale e le migrazioni reali, come la piattaforma):
  - `generateWeek`: crea settimana e slot (ricette, testi fissi, vuoti, porzioni); seconda
    chiamata `false` senza scritture; due chiamate concorrenti creano una sola settimana;
    stesso ingresso, stessa settimana;
  - nel ruolo `authenticated`: un membro genera la propria famiglia e non un'altra
    (`forbidden`/nessuna scrittura); nessuna grant o policy aggiunta (confronto con i
    privilegi di W2);
  - `mealRecipeVersions`: pasto futuro sulla versione corrente, pasto passato sulla
    versione in vigore allora, pasto più vecchio della prima pubblicazione sulla prima,
    ricetta mai pubblicata con null, settimana di un'altra famiglia vuota;
  - `runWeeklyJob`: martedì nessuna riga; mercoledì 20:00 riga e settimana; famiglie in
    fusi diversi; una famiglia che fallisce non ferma le altre e resta `failed` con
    `attempts`; riesecuzione `done`; settimana creata prima dalla generazione pigra →
    `done`; riga `weekly_job_overdue` giovedì dopo le 08:00;
  - hook `prepare` (piattaforma): eseguito prima di `readVersion`, nella stessa
    transazione, non eseguito se la sessione o il ruolo falliscono;
  - letture: `getOpening` con generazione pigra (prima settimana da oggi, settimana
    successiva dopo mercoledì sera), «invariato» con la versione della risposta e non
    con quella di prima della generazione; `getWeek` con R1, ultima modifica ed ex
    membro, `not_found`; `getDates`; strumenti MCP presenti e in sola lettura;
    generazione fallita in savepoint e lettura riuscita.
- **Web** (Testing Library): `today` nella chiave e nell'input di `getOpening`; client
  finto allineato al contratto. Prova visiva con agent-browser sul Menu con dati veri
  (stack Supabase locale).

## 9. Migrazioni

Nessuna: tabelle, grant, policy e funzioni necessarie sono già su `main` (W2). Se
durante l'implementazione servisse un indice (per esempio sullo storico degli slot), si
aggiunge con una nuova migrazione con test pgTAP e si segnala al coordinatore.

## 10. Dipendenze

Nessuna libreria nuova. Il dominio usa `Intl` (ECMAScript); zod in `domain/` arriva con
W3 e W4.

## 11. Ordine di lavoro

Dominio e job non dipendono da altri worker e partono subito dopo il via. La generazione
aspetta `toPlannerRecipe` (W3) e `resolveFamilySettings` (W2 profilo); la vista della
settimana le funzioni di W6; il web la seconda PR di W5. Se una di queste non è su
`main` quando serve, `STATO: DOMANDA` al coordinatore (eventualmente scrivo io il modulo
con la firma concordata, come previsto per W6).

## Decisioni da riportare nella specifica

### Prodotto

| Decisione | Sezioni |
|---|---|
| Una sola regola di generazione alla lettura: se manca la settimana corrente si genera dai pasti non ancora passati; se manca la successiva ed è passato mercoledì alle 20:00 si genera intera. Copre la prima generazione di una famiglia nuova (senza wizard nel traguardo A) e i buchi, per esempio dopo l'import | 4, 5 (vista di apertura) |
| Il job orario genera solo la settimana successiva; la settimana corrente mancante la crea la generazione pigra | 4 |
| Allarme del job dopo 12 ore: per ora riga di log `weekly_job_overdue`; email con Resend nell'ondata 3 | 4 |
| Apertura senza pasti oggi né dopo: ultimo giorno con slot prima di oggi | 5 (vista di apertura) |

### Tecniche

| Decisione | Sezioni |
|---|---|
| Job con un Cron Trigger di Cloudflare (`0 * * * *`, handler `scheduled` del Worker) al posto di `pg_cron` con `pg_net`: niente segreto nel Vault, niente rotta `/internal/jobs/*`; ogni famiglia nelle sue transazioni `app_job` e nel suo `try/catch` dentro la stessa invocazione (fino a 15 minuti di CPU) | 1 (tabella delle rotte), 4 |
| Generazione pigra nella transazione dell'utente, ruolo `authenticated`, con le policy esistenti di W2; job nel ruolo `app_job`; stesso codice | 1, 4 |
| Hook `prepare` per operazione nel percorso della richiesta, prima del calcolo della versione | 1 (strato delle operazioni) |
| Candidate del pianificatore dal documento della versione corrente con `toPlannerRecipe` di W3; impostazioni con `resolveFamilySettings` di W2 | 2, 3 |
| `mealRecipeVersions(tx, familyId, weekId)` in `server/src/menu/versions.ts` come unica scelta della versione per pasto (R1), usata da Menu e spesa | 5, 6 |
| `menu.getOpening` riceve la data locale `today` dal client per restare corretta con la risposta «invariato» | 1 (letture dalla copia sul dispositivo), 5 |
| La generazione non scrive `meal_changes` e lascia `updated_by` null: l'ultima modifica mostrata è solo quella delle persone | 2, 5 |
| `PlannerInput.from` per generare una settimana a metà | 3 |
