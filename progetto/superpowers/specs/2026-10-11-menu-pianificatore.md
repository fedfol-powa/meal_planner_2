# Menu, pianificatore, job del mercoledì e generazione pigra: spec di dettaglio

Creato: 11 ottobre 2026
Stato: brainstorming chiuso con il coordinatore l'11 ottobre 2026; corretta dopo la
review di spec e piano (verdetto «da rifare», otto rilievi, decisioni del coordinatore
in `progetto/coordinamento/messaggi/w1-07-review-menu.md`) l'11 ottobre 2026.
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
   `domain/src/planner/` (esperimento M0), a partire dai dati del database, coerente con
   le settimane vicine già pianificate, prima e dopo.
4. **Job orario** con un Cron Trigger di Cloudflare: la settimana successiva per le
   famiglie per cui è passato mercoledì alle 20:00 nel loro fuso, con recupero dei
   tentativi falliti.
5. **Generazione pigra** alla lettura del menu, che copre anche la prima generazione
   di una famiglia senza settimane.
6. **Schermata Menu** dell'app web sui dati veri, voto compreso.

**Fuori da questa attività:** azioni sui pasti, suggerimenti, annullamento e registro
delle modifiche (attività «Revisione dei pasti»); operazione esplicita «rigenera» e
wizard della famiglia nuova (ondata 3); giudice AI; email di allarme, che arriva con
Resend nell'ondata 3 (qui solo una riga di log, sezione 4.5).

## Dipendenze e interfacce

| Da | Cosa | Stato |
|---|---|---|
| W1 piattaforma (su `main`) | contratto, `createImplementer`, `withDb` con i ruoli `user` e `job`, `readVersion`, MCP generato | unito |
| W2 schema (su `main`) | `app.weeks`, `app.meal_slots`, `app.weekly_jobs`, `app.recipe_version_at`, `app.meal_passed_at`, `family_scores`, `global_scores`, contatori di versione, ruolo `app_job` | unito |
| W3 ricetta e import | `RecipeDocument` e `toPlannerRecipe(id, document)` in `domain/src/recipe/projection.ts` (il libro viene da `document.bookId`) | PR #9 |
| W2 profilo e famiglia | `resolveFamilySettings(saved) → PlannerSettings` in `domain/src/family/settings.ts`, con lo schema zod dei valori salvati in `families.settings`. Non fallisce sui valori malformati: li sostituisce con i default | in implementazione |
| W6 ricettario e voti | autore unico di `contract/src/recipes/views.ts` e `server/src/recipes/views.ts`; interfaccia **definitiva** nella sua spec, sezione 1 «Interfaccia per W1» (`2026-10-11-ricettario-e-voti.md`, commit `f5b1dd2`), registrata nel piano generale; `ratings.set`; `RecipeCard`, `IngredientList` con la preparazione e tipi web della ricetta | in implementazione |
| W4 unità e spesa | scalatura e presentazione delle quantità, usate da W6; W4 **consuma** `mealRecipeVersions` (sezione 3), che questa attività consegna per prima in una PR piccola | PR #7 |
| W5 app web | `MenuPage`, `DatePicker`, `DaySelector`, `RecipeCard`, `RatingStars`, client oRPC reale (seconda PR di W5) | PR #6 |

Il pianificatore (`PlannerSettings`, `PlannerInput`, default) resta di questa attività;
lo schema delle impostazioni salvate è di W2 profilo; le viste della ricetta sono di W6.
Qui non si ridefiniscono e non si scrivono i loro file, nemmeno come ripiego.

**Implementatore unico** (decisione del coordinatore): l'implementatore oRPC si
costruisce solo in `server/src/router.ts`, con `createImplementer(contract, { prepare })`;
ogni area esporta un factory che lo riceve (`menuRouter(os)`, come `recipesRouter(os)`
di W6), con il tipo `Implementer` esportato da `server/src/pipeline.ts` (da chi arriva
per primo, una riga).

## 1. Dominio: aggiunte al pianificatore

Il comportamento della generazione con gli ingressi di oggi non cambia: stessi passi,
pesi e report (`npm run planner-report` dà le stesse settimane). Si aggiunge:

### 1.1 Primo pasto da pianificare

`PlannerInput.from?: { date: IsoDate; mealType: MealType }`. Gli slot prima di quel
pasto non si creano (come se le porzioni fossero 0): serve a generare la settimana
corrente a metà, «dai pasti non ancora passati» (sezione 4). Senza `from` si pianifica
la settimana intera. `from` fuori dalla settimana è un errore di programmazione
(eccezione).

### 1.2 Settimane successive già pianificate

`PlannerInput.upcoming?: PastMeal[]`: i pasti con ricetta già pianificati **dopo** la
settimana da generare (settimane generate prima di questa, per esempio la successiva
creata dal job prima che qualcuno apra la corrente, o il recupero di una settimana
mancante fra due pianificate). Contano come vicini, simmetrici allo storico:

- **vincolo rigido**: una ricetta presente nei 14 giorni dopo la fine della settimana
  non si propone (come i 14 giorni prima);
- **somiglianza**: i pasti successivi entro la finestra di 6 pasti pesano come quelli
  precedenti (distanza in pasti, in valore assoluto, già così nel punteggio);
- non contano per «tempo dall'ultima volta» né per la quota note/nuove, che guardano
  solo ciò che è già stato mangiato prima.

Le settimane esistenti non si toccano mai: la generazione crea solo la settimana
mancante.

### 1.3 Calendario nel fuso della famiglia

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
  pranzo di domani). Mercoledì alle 20:00 è la cena di mercoledì.
- `mondayOf(date)` e `nextWeekStart(local)`.
- `catchUpTarget(local, weekStart) → { weekStart, from? } | null`: una settimana non
  ancora iniziata si genera intera; una già iniziata dai pasti ancora aperti
  (`from = firstOpenMeal(local)`); una finita (nessun pasto aperto entro la sua domenica)
  dà `null`.
- `generationTargets(local, existingWeekStarts) → { weekStart, from? }[]`, la regola
  unica della sezione 4:
  - **settimana corrente** (il lunedì della data locale) se manca:
    `catchUpTarget(local, lunedì corrente)`, se non è `null`;
  - **settimana successiva** se manca e la data e ora locali sono uguali o successive
    a mercoledì della settimana corrente alle 20:00; intera.
- `isNextWeekDue(local)`: da mercoledì alle 20:00 della settimana corrente.
- `isJobOverdue(local, targetWeek)`: dal giovedì alle 08:00 che precede `targetWeek`
  (12 ore dopo il mercoledì alle 20:00 a cui il job appartiene), qualunque sia la
  settimana corrente. L'ora legale non cambia mai di mercoledì o giovedì nei fusi
  europei; altrove lo scarto è al più di un'ora.

Un fuso non valido non arriva qui: lo rifiuta il trigger di W2 su `families`. Il server,
se `Intl` lo rifiuta comunque, usa `Europe/Rome` e registra una riga di log (sezione 4.5).

Lo storico che il server passa al pianificatore (`history`) comprende tutti gli slot con
ricetta della famiglia con data precedente al lunedì generato, anche quelli non ancora
passati della settimana corrente: per la somiglianza e per «non due volte in 14 giorni»
contano come mangiati (specifica, sezione 3: «storico degli slot delle settimane
precedenti e della settimana in corso»). `upcoming` comprende gli slot con ricetta con
data successiva alla domenica generata.

## 2. Generazione nel server

`server/src/menu/generation.ts`:

```ts
/** Everything the planner reads, from the database, in the transaction's role. */
loadPlannerInput(tx: Tx, familyId: string, target: GenerationTarget): Promise<PlannerInput>

/** Creates the week if it does not exist yet. Returns false when it already existed. */
generateWeek(tx: Tx, familyId: string, target: GenerationTarget): Promise<boolean>

/** Lazy generation: the targets of generationTargets() for the family at `now`. */
ensureWeeks(tx: Tx, familyId: string, now: Date): Promise<void>

/** Serialises the generations of one family until the end of the transaction. */
lockFamilyWeeks(tx: Tx, familyId: string): Promise<void>
```

Il calcolo del pianificatore passa da un modulo sottile, `server/src/menu/plan.ts`
(`planWeek(input)`, che chiama `generateWeek` del dominio): è il **punto controllato**
che i test sostituiscono con `vi.mock` per simulare un errore di generazione, dato che
`resolveFamilySettings` non fallisce sui valori malformati.

**Ingresso del pianificatore** (`loadPlannerInput`), poche query nella stessa
transazione:

| Campo | Fonte |
|---|---|
| `settings` | `resolveFamilySettings(families.settings)` di W2 |
| `recipes` | ricette `published` (non archiviate, non bozze) con il documento della versione corrente: `recipes r join recipe_versions v on (v.recipe_id, v.version) = (r.id, r.version)`, poi `toPlannerRecipe(r.id, v.content)` di W3, che prende il libro dal documento. Il contenuto è già validato alla pubblicazione e non si rivalida |
| `ownedBookIds` | `family_books` |
| `exclusions` | `recipe_exclusions` |
| `restrictions` | `family_ingredients` |
| `familyScores` | `family_scores` della famiglia |
| `globalScores` | `global_scores` |
| `history` | slot con `recipe_id` delle settimane della famiglia con `date < weekStart`, in ordine di data e pasto |
| `upcoming` | slot con `recipe_id` con `date > weekStart + 6`, in ordine |
| `from` | dal bersaglio |

**Scrittura** (`generateWeek`):

1. `lockFamilyWeeks`: `select pg_advisory_xact_lock(hashtextextended('app.weeks:' ||
   family_id, 0))`. Funzioni di sistema eseguibili da tutti i ruoli: nessun permesso
   nuovo su `families` né altrove. Il blocco è rientrante nella stessa transazione e si
   rilascia alla sua fine.
2. `insert into app.weeks (family_id, starts_on, generated_at) values (…, now())
   on conflict (family_id, starts_on) do nothing returning id`. Senza riga restituita la
   settimana esiste già e la funzione restituisce `false` senza calcolare niente.
3. `loadPlannerInput`, poi `planWeek` (nessun giudice).
4. Un `insert` di tutti gli slot: `recipe_id` oppure `free_text` (slot fisso), entrambi
   null per «nessuna ricetta adatta»; `servings` dalla matrice; `updated_by` null
   (l'app); niente righe in `meal_changes`, perché la generazione crea e non modifica.

La settimana e gli slot fanno crescere il contatore della famiglia tramite i trigger di
W2, una sola volta per transazione.

**Concorrenza** (rilievo 3, decisione del coordinatore). Il blocco consultivo per
famiglia si prende **prima di ogni scrittura** sia nella generazione pigra (all'inizio
di `ensureWeeks`, fuori dai savepoint, prima di leggere le settimane esistenti) sia nel
job (all'inizio della transazione di ogni famiglia, dentro `generateWeek`). Così due
generazioni della stessa famiglia non si intrecciano: chi arriva secondo attende il
primo, poi legge le settimane già create (con `read committed` ogni istruzione vede i
dati committati) e non crea doppioni. Senza blocco, cron e richiesta pigra potevano
attendersi a vicenda sul contatore della famiglia e sull'unicità delle settimane
(deadlock). Le altre scritture della famiglia (pasti, voti) non prendono il blocco e
restano libere.

**Ruolo**, senza allargare i permessi dei membri:

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
del coordinatore). Questa attività ne è il produttore: la consegna per prima, in una PR
piccola a parte (`versions.ts`, i dati di prova del menu e i test), da unire subito; dipende
solo dallo schema e dalla piattaforma già su `main`.

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

Una sola query, nel ruolo della transazione chiamante: per ogni slot con ricetta, se
`app.meal_passed_at(date, meal_type, families.time_zone) <= now()` allora
`app.recipe_version_at(recipe_id, quel momento)`, altrimenti `recipes.version` se la
ricetta è stata pubblicata almeno una volta (`version > 0`), altrimenti null. Dove
`recipe_version_at` non trova una versione al momento del pasto prende la prima
pubblicata, e null se non ce ne sono (decisione del coordinatore dell'11 ottobre). Una
settimana di un'altra famiglia o inesistente dà un elenco vuoto (RLS e filtro su
`familyId`). L'istante di confronto è `now()` della transazione; una variante interna
`mealRecipeVersionsAt(tx, familyId, weekId, at)` lo riceve come parametro
(`coalesce(at, now())`), così i test verificano le soglie delle 15:30 e delle 23:00 con
istanti fissi, senza dipendere dall'ora reale.

Il comportamento per l'utente è quello del ruolo `authenticated`: un membro vede anche
le ricette mai pubblicate citate dai pasti della sua famiglia (policy
`recipes_read_cited_draft` di W2). Il ruolo `app_job` non vede le bozze (`recipes_job`),
quindi per lui gli slot con una ricetta mai pubblicata non compaiono: il job non usa
questa funzione.

Un pasto con versione null mostra solo nome e descrizione (sezione 5.3) e non entra
nella spesa (W4). Nel registro generale il campo si chiama `version` (numero di
versione), non `versionId`.

## 4. Job del mercoledì

### 4.1 Pianificazione

Cron Trigger di Cloudflare (scelto con il coordinatore al posto di `pg_cron` con
`pg_net`): niente segreto condiviso, niente rotta `/internal/jobs/*` e niente passi nel
Vault di Supabase. In `server/wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 * * * *"] }
```

In `server/src/index.ts` (modifica minima) il Worker esporta anche
`scheduled(controller, env)`, che chiama
`runWeeklyJob(env.HYPERDRIVE.connectionString, new Date(controller.scheduledTime))` di
`server/src/menu/job.ts`. Sul piano a pagamento un'invocazione di un Cron Trigger ha
fino a 15 minuti di CPU (documentazione di Cloudflare consultata l'11 ottobre 2026), molto
oltre i circa 25 ms per famiglia. La query oraria tiene anche attivo il progetto gratuito
di Supabase (sezione 1 della specifica). La configurazione remota non serve: il Cron
Trigger si attiva con il primo `wrangler deploy` (passi di produzione della piattaforma).
In locale: `wrangler dev --test-scheduled` e `curl
"http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.

### 4.2 Smistamento ed elaborazione

`runWeeklyJob(connectionString, now)` (rilievo 4, decisione del coordinatore), in tre
passi separati. `runWeeklyJobOn(sql, now, { families })` accetta un filtro facoltativo
sulle famiglie, usato solo dai test: il database dei test contiene migliaia di famiglie
di altri test, e il job orario le serve tutte.

1. **Smistamento dei nuovi bersagli**, una transazione `app_job`: legge le famiglie
   (`id`, `time_zone`); per quelle con `isNextWeekDue(local)` e senza la settimana
   successiva inserisce `weekly_jobs (family_id, target_week = nextWeekStart(local))` con
   `on conflict do nothing`.
2. **Lettura dei job aperti**, indipendente dallo smistamento: tutte le righe con
   `status` `pending` o `failed`, di qualunque `target_week`, con il fuso della famiglia.
3. **Elaborazione**, un job alla volta, ciascuno nelle sue transazioni e nel suo
   `try/catch`:
   - se `catchUpTarget(local, target_week)` è `null` (la settimana è finita): la riga
     diventa `abandoned` e si registra `weekly_job_abandoned` (livello errore), senza
     generare;
   - altrimenti una transazione esegue `generateWeek` con quel bersaglio (intero se la
     settimana non è iniziata, dai pasti ancora aperti se è già iniziata, come la
     generazione pigra) e scrive `status = 'done'`, `attempts + 1`, `error = null`; se
     la settimana esisteva già, per esempio creata dalla generazione pigra, la riga
     diventa comunque `done`;
   - in caso di errore la transazione si annulla e una seconda transazione scrive
     `status = 'failed'`, `attempts + 1`, `error` (codice o nome dell'errore, al massimo
     500 caratteri, mai messaggi, dati o segreti) e `updated_at`; si registra
     `weekly_job_failed` e, se `isJobOverdue(local, target_week)`, anche
     `weekly_job_overdue`; si passa al job successivo.

Lo stato `running` dello schema non si usa: la generazione e il suo esito stanno in una
sola transazione, quindi un'esecuzione interrotta lascia la riga com'era e la successiva
la riprende. Un job fallito si ritenta ogni ora finché la sua settimana non è finita.

Un'esecuzione senza famiglie da servire legge le famiglie e i job e finisce. Due
esecuzioni sovrapposte non fanno danni: il blocco per famiglia e l'unicità di
(`family_id`, `starts_on`) impediscono doppioni; lo stato della riga è solo informativo
(al più un tentativo contato due volte). Il job crea solo le settimane dei suoi job: la
settimana corrente di una famiglia che non ne ha mai avuto uno (famiglia nuova, buchi)
la crea la generazione pigra quando qualcuno apre il menu.

### 4.3 Migrazione: stato `abandoned`

Una nuova migrazione `supabase/migrations/20261011140000_weekly_jobs_abandoned.sql`
amplia il vocabolario di `app.weekly_jobs.status` con `abandoned`
(`drop constraint weekly_jobs_status_check`, `add constraint ... check (status in
('pending', 'running', 'done', 'failed', 'abandoned'))`, nome verificato sullo schema
locale). Nessuna tabella, colonna, grant o policy nuova. Test pgTAP in
`supabase/tests/weekly_jobs_abandoned_test.sql`: `app_job` scrive `abandoned`, un
valore fuori vocabolario resta rifiutato (`23514`).

### 4.4 Generazione pigra

Hook `prepare` nel percorso della richiesta (approvato dal coordinatore, modifica
minima in `server/src/pipeline.ts` con test):

- `createImplementer(contract, { prepare })` riceve una mappa dal percorso
  dell'operazione (`'menu.getOpening'`…) a
  `(context: OperationContext, input) => Promise<PrepareResult | void>`, con
  `PrepareResult = { versionPart?: string }`;
- l'hook gira nella transazione dell'utente dopo sessione, controllo `web_only` e ruolo,
  **prima** di `readVersion` e dell'uscita «invariato»: può validare l'input contro lo
  stato del server (errore prima dell'uscita anticipata) e scrivere;
- `versionPart`, se c'è, si aggiunge in fondo alla versione dell'operazione (sezione
  5.1);
- `OperationContext.now: Date` è l'istante della richiesta, fissato una volta dalla
  pipeline (da `RequestContext.clock?.()`, sostituibile nei test, altrimenti
  `new Date()`): hook e gestore vedono la stessa ora. L'orologio del contesto della
  richiesta si chiama `clock` e non `now` perché oRPC non accetta che un campo cambi
  tipo fra il contesto iniziale e quello del middleware.

Le tre letture del menu registrano `ensureWeeks(tx, input.familyId, context.now)`:

- prende il blocco della famiglia, legge le settimane esistenti fra il lunedì corrente
  e il successivo (una query piccola), calcola `generationTargets` e chiama
  `generateWeek` per ciascun bersaglio, la corrente per prima;
- ogni generazione gira in un **savepoint**: se fallisce, il savepoint si annulla, la
  riga di log `lazy_generation_failed` registra famiglia, settimana e codice d'errore, e
  la lettura prosegue senza quella settimana (la ritenta la lettura successiva, e il job
  per la settimana successiva);
- la generazione sta nella transazione della lettura: se la lettura finisce con un
  errore (per esempio `getWeek` di una settimana inesistente → `not_found`), la
  transazione si annulla e con lei le settimane appena generate, che la lettura
  successiva rigenera;
- costo: la prima apertura dopo mercoledì sera aggiunge circa 25 ms di CPU per
  settimana generata; tutte le altre letture due query piccole.

Anche via MCP le letture possono quindi scrivere una settimana: è la rete di sicurezza
della sezione 4 della specifica («o un agente legge il menu»). Lo strumento resta
marcato in sola lettura per l'agente: la scrittura è idempotente e non dipende
dall'input.

### 4.5 Log

Righe JSON con campi scelti (convenzione della piattaforma, mai messaggi o segreti):
`weekly_job_failed` (famiglia, settimana, tentativi, codice), `weekly_job_overdue`
(famiglia, settimana, tentativi), `weekly_job_abandoned` (famiglia, settimana,
tentativi; livello errore), `lazy_generation_failed` (famiglia, settimana, codice),
`invalid_time_zone` (famiglia). L'email al referente operativo arriva con Resend
nell'ondata 3; i punti di aggancio sono `weekly_job_overdue` e `weekly_job_abandoned`.

## 5. Letture del menu

### 5.1 Contratto (`contract/src/menu/`)

Metadati comuni: `mcp: { readOnly: true }`, `offline: false`, `role: 'familyMember'`,
`reads: ['family', 'catalogue']` (nomi e contenuti delle ricette seguono il ricettario).

| Operazione | Input | Output (`data`) | Errori propri |
|---|---|---|---|
| `menu.getOpening` | `familyId`, `today?` | `OpeningView` | — |
| `menu.getWeek` | `familyId`, `weekStartsOn` (lunedì) | `WeekView` | `not_found` (settimana inesistente) |
| `menu.getDates` | `familyId`, `month` (`YYYY-MM`) | `IsoDate[]` | — |

Tutte con `versionedInput` e `versionedOutput`. Rotte REST `GET /families/{familyId}/menu/opening`,
`GET /families/{familyId}/menu/weeks/{weekStartsOn}`, `GET /families/{familyId}/menu/dates/{month}`.

**Data di `getOpening`** (rilievo 6, decisione del coordinatore). Il giorno di apertura
dipende dalla data. La **data effettiva** (`today` se presente, altrimenti la data locale
della famiglia all'istante della richiesta) entra nella versione dell'operazione
(`versionPart: 'd' + data`), tramite l'hook `prepare`. Lo stesso hook valida `today`
**prima** dell'uscita «invariato»: un `today` distante più di un giorno dalla data locale
della famiglia è `invalid` (`path: ['today']`, `code: 'out_of_range'`), anche con una
`knownVersion`. Così un client (web o agente) che ripresenta la versione del giorno
prima riceve la vista nuova, senza dipendere da convenzioni del client. Il web manda
sempre `today`, la data locale della famiglia calcolata sul dispositivo.

### 5.2 Viste

Forma dell'`Api` di W5 (`web/src/api/types.ts`), con gli schemi di W6:

```ts
type OpeningView = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };

interface WeekView { startsOn: IsoDate; days: DayView[] }          // sette giorni, da lunedì
interface DayView { date: IsoDate; meals: MealView[] }              // pranzo prima della cena
interface MealView {
	slotId: string;
	date: IsoDate;
	mealType: 'lunch' | 'dinner';
	kind: 'recipe' | 'free' | 'empty';
	recipe: RecipeSummaryView | null;          // W6
	freeText: string | null;
	servings: number;
	ingredients: IngredientLineView[] | null;  // W6; null per una ricetta mai pubblicata
	note: string | null;
	rating: RatingSummaryView | null;          // W6; null per una ricetta mai pubblicata
	canOpenRecipe: boolean;                    // false per una ricetta mai pubblicata
	lastChange: { userName: string | null; at: LocalDateTime } | null;
}
```

- **Apertura** (rilievo 5, decisione del coordinatore), con `d` la data effettiva:
  1. nessuna settimana della famiglia → `no_weeks`;
  2. il primo giorno da `d` in avanti con un pasto con contenuto (ricetta o testo libero);
  3. altrimenti il primo giorno da `d` in avanti con uno slot qualsiasi (anche solo
     «Nessuna ricetta adatta»);
  4. altrimenti l'ultimo giorno con uno slot prima di `d`;
  5. altrimenti (settimane senza slot) il lunedì della settimana più recente.

  Una settimana appena generata senza ricette adatte resta quindi visibile con le sue
  schede vuote, non diventa «Ancora nessun menu».
- **Giorni con menu** (`getDates`): giorni del mese con almeno uno slot nelle settimane
  della famiglia, quelli che il calendario rende selezionabili.
- **Ultima modifica**: `updated_by` e `updated_at` dello slot, solo se `updated_by` non è
  null (la generazione non mostra un autore); `userName` è il `display_name` del profilo
  se l'autore è ancora membro, altrimenti null («ex membro»); `at` è l'ora locale della
  famiglia (`YYYY-MM-DDTHH:mm`).
- **Slot vuoto** (`empty`): «Nessuna ricetta adatta».

### 5.3 Composizione della settimana

`server/src/menu/week-view.ts`, nel gestore di `getWeek`, con l'interfaccia di W6 (sua
spec, sezione 1):

1. la settimana e i suoi slot, con nome dell'autore dell'ultima modifica;
2. `mealRecipeVersions(tx, familyId, weekId)`;
3. per ogni pasto con ricetta un `RecipeRef { recipeId, version, servings }` di W6, con
   la versione data da `mealRecipeVersions` (numero, oppure `null` solo per una ricetta
   mai pubblicata) e le porzioni dello slot, 0 compreso;
4. una sola chiamata `recipeViews(tx, { familyId, userId, locale }, refs)` per tutta la
   settimana; ogni pasto legge la sua `RecipeView` con `recipeViewKey(ref)`
   (`${recipeId}@${version ?? 'now'}@${servings}`): `recipe = view.summary`,
   `ingredients = view.ingredients`, `rating = view.rating`,
   `canOpenRecipe = view.status !== 'draft'`.

Equivalente ammesso dall'interfaccia di W6: `recipeSummaries(tx, refs, locale)`,
`ingredientLines(tx, refs, { familyId, locale })` e `ratingSummaries(tx, familyId,
userId, recipeIds)`, una chiamata ciascuna per settimana, con le stesse chiavi
(`recipeId` per i voti) e il voto `null` per le mai pubblicate. Il Menu usa `recipeViews`,
che dà già stato e voto nullo.

Porzioni: due pasti con la stessa ricetta e versione ma porzioni diverse hanno chiavi e
righe diverse; un pasto con 0 porzioni mostra le righe alle porzioni di riferimento della
ricetta (regola di W6) e la sua chiave conserva lo 0.

Le ricette archiviate restano visibili e votabili dai pasti che le usano (specifica,
sezione 5). L'output di `getWeek` e `getDates` non dipende dall'ora oltre alla
generazione: il passaggio di un pasto a «passato» non cambia la versione mostrata se nel
frattempo il ricettario non è cambiato, e quando il ricettario cambia cresce il suo
contatore.

## 6. Interfaccia con W6

**Definitiva** (decisione del coordinatore dell'11 ottobre 2026): spec di W6, sezione 1
«Interfaccia per W1», commit `f5b1dd2` del branch `traguardo/ricettario`, registrata nel
piano generale («Interfaccia per W1 definitiva»). Il Menu la importa così com'è e non
scrive mai `contract/src/recipes/views.ts` né `server/src/recipes/views.ts`, nemmeno come
ripiego. Firme usate:

- contratto: `recipeSummaryView`, `ratingSummaryView`, `ingredientLineView`,
  `isoDateSchema`, `mealTypeSchema`;
- server: `RecipeRef { recipeId: string; version: number | null; servings: number }`,
  `recipeViewKey(ref)`, `Viewer { familyId, userId, locale }`,
  `recipeViews(tx, viewer, refs): Promise<Map<string, RecipeView>>` con
  `RecipeView { summary, status, version, baseServings, ingredients, rating }`; in
  alternativa `recipeSummaries(tx, refs, locale)`, `ingredientLines(tx, refs, { familyId,
  locale })`, `ratingSummaries(tx, familyId, userId, recipeIds)`.

`RecipeRef` si costruisce sempre da `mealRecipeVersions` (versione) e dallo slot
(porzioni). Il contenuto viene dal documento immutabile della versione richiesta (R1
coerente anche con una pubblicazione concorrente, garanzia di W6). Ogni modifica
all'interfaccia passa dal coordinatore.

**Cancello** dei task che usano le viste (vista della settimana e web): PR delle viste di
W6 unita (complete di R1: versioni storiche e ricette mai pubblicate), con `ratings.set`,
`RecipeCard`, `IngredientList` (con la preparazione) e tipi web della ricetta adeguati da
W6. Il voto dal Menu si prova con la risposta applicata solo dopo la conferma del server
(sezione 7).

## 7. Web

Sulla base di W5, quando la sua seconda PR (client oRPC reale) e la PR di W6 sono su
`main`:

- `Api.menu` diventa il client del contratto; i tipi del menu di `web/src/api/types.ts`
  lasciano il posto a quelli del contratto (con gli schemi di W6, per esempio
  `description` e `sourceType` nullabili e nessuna `photo` nel riepilogo); il client
  finto si allinea. Le modifiche a `types.ts` e `queries.ts`, condivisi con W2 e W6, si
  limitano alle voci del menu.
- `getOpening` riceve `today`, la data locale della famiglia calcolata con
  `families.time_zone` (già nella `FamilyView` di W5).
- La schermata `MenuPage` non cambia nella resa: ultima modifica, slot vuoto e stati
  sono già quelli del percorso 1. Le schede «Nessuna ricetta adatta» di una settimana
  senza ricette adatte si vedono, nelle due lingue.
- Il voto dal Menu usa `ratings.set` di W6 con lo schema delle mutazioni di W5: la
  risposta si applica alla settimana in cache solo dopo la conferma del server, nessun
  aggiornamento ottimistico.
- Nessun'altra mutazione in questa attività.

## 8. Test

- **Dominio** (Vitest):
  - `from` (slot precedenti non creati, settimana intera senza);
  - `upcoming`: una ricetta presente nei 14 giorni dopo la settimana non si propone; con
    20 candidate, la settimana corrente generata dopo la successiva non ripete le sue
    ricette entro 14 giorni; senza `upcoming` le settimane sono quelle di oggi;
  - `localDateTime` in `Europe/Rome`, `Europe/London` e `America/New_York` attorno ai
    loro cambi dell'ora legale (25 ottobre 2026 in Europa, 1° novembre 2026 a New York);
  - `firstOpenMeal` ai confini 15:30 e 23:00 (mercoledì 20:00 → cena di mercoledì);
  - `catchUpTarget` per settimana futura, iniziata e finita;
  - `generationTargets` per famiglia senza settimane, mercoledì 19:59 e 20:00, domenica
    alle 23:30, settimane già presenti;
  - `isJobOverdue` riferito a `targetWeek`, anche nella settimana successiva;
  - report del pianificatore invariato.
- **Server** (Vitest con Postgres locale e le migrazioni reali, come la piattaforma):
  - `generateWeek`: crea settimana e slot (ricette, testi fissi, vuoti, porzioni); seconda
    chiamata `false` senza scritture; due chiamate concorrenti della stessa settimana ne
    creano una; stesso ingresso, stessa settimana; ricette di un libro non posseduto mai
    proposte, del libro posseduto sì (libro dal documento);
  - **settimane fuori ordine**: prima apertura dopo il cron (successiva già creata, poi
    la corrente) senza ricette ripetute entro 14 giorni fra le due; prima apertura prima
    del cron; recupero di una settimana mancante fra due pianificate, coerente con
    entrambe; le settimane esistenti restano identiche;
  - **concorrenza cron ↔ generazione pigra**: con entrambe le settimane assenti e il
    blocco tenuto da una terza connessione, job e `ensureWeeks` partono insieme; al
    rilascio nessuno dei due fallisce, esistono esattamente le due settimane e la
    lettura pigra le vede;
  - nel ruolo `authenticated`: un membro genera la propria famiglia e non un'altra
    (nessuna scrittura); nessuna grant o policy aggiunta;
  - `mealRecipeVersions` **nel ruolo del membro**: pasto futuro sulla versione corrente,
    pasto passato sulla versione in vigore allora, pasto più vecchio della prima
    pubblicazione sulla prima, ricetta mai pubblicata con null; confini 15:30 e 23:00
    (un minuto prima e dopo, con versioni pubblicate a cavallo); cambio di fuso della
    famiglia che sposta il passaggio; confronto con `app.meal_passed_at` e
    `app.recipe_version_at`; settimana di un'altra famiglia vuota;
  - `runWeeklyJob`: martedì nessuna riga; mercoledì 20:00 riga e settimana; famiglie in
    fusi diversi; un job che fallisce (punto controllato) non ferma gli altri e resta
    `failed` con `attempts`; ritentato all'ora dopo e `done`; settimana creata prima dalla
    generazione pigra → `done`; job fallito fino a domenica e ripreso lunedì → settimana
    generata dai pasti aperti di lunedì; interruzione di più settimane → il job della
    settimana finita diventa `abandoned` con il log, quello nuovo si elabora;
    `weekly_job_overdue` dal giovedì alle 08:00 riferito a `target_week`, anche lunedì;
  - hook `prepare` (piattaforma): eseguito prima di `readVersion`, nella stessa
    transazione, non eseguito se la sessione o il ruolo falliscono; `versionPart` in
    fondo alla versione; un errore dell'hook arriva al client anche con `knownVersion`;
  - letture: `getOpening` con generazione pigra (prima settimana da oggi, settimana
    successiva dopo mercoledì sera), «invariato» con la versione della risposta e non
    con quella di prima della generazione; apertura nei cinque casi della sezione 5.2,
    compresa una settimana di soli slot vuoti; `getWeek` con R1, ultima modifica ed ex
    membro, la stessa ricetta con porzioni diverse in due pasti (righe diverse) e un
    pasto con 0 porzioni (righe alle porzioni di riferimento), `not_found`; `getDates`; generazione fallita in savepoint e lettura
    riuscita;
  - **MCP**: `tools/list` con le tre letture in sola lettura; `tools/call` di
    `getOpening` che genera la prima settimana; cambio di giorno con `knownVersion` del
    giorno prima e nessuna scrittura intermedia → vista nuova; `today` fuori intervallo
    → errore `invalid` anche con `knownVersion`; `getWeek` di una settimana inesistente
    → `not_found`; famiglia altrui → `forbidden`.
- **Web** (Testing Library): `today` nella chiave e nell'input di `getOpening`; client
  finto allineato al contratto; settimana di soli slot vuoti resa con «Nessuna ricetta
  adatta» e «No suitable recipe»; voto dal Menu applicato solo dopo la risposta del
  server. Prova visiva con agent-browser sul Menu con dati veri (stack Supabase locale),
  nelle due lingue.

## 9. Migrazioni

Una sola, nuova: stato `abandoned` di `app.weekly_jobs` (sezione 4.3), con test pgTAP.
Nessuna tabella o colonna aggiunta; nessuna grant o policy nuova.

## 10. Dipendenze

Nessuna libreria nuova. Il dominio usa `Intl` (ECMAScript); zod in `domain/` arriva con
W3 e W4; `server/` dichiara il workspace interno `@app/domain`.

## 11. Ordine di lavoro

Per prima, `mealRecipeVersions` in una PR piccola per W4 (sezione 3). Poi dominio, hook,
contratto e migrazione, che non dipendono da altri worker. La generazione e il job aspettano `toPlannerRecipe` (W3) e
`resolveFamilySettings` (W2 profilo); la vista della settimana il cancello di W6
(sezione 6); il web anche la seconda PR di W5. Se uno di questi non è su `main` quando
serve, `STATO: DOMANDA` al coordinatore; i file degli altri worker non si scrivono.

## Decisioni da riportare nella specifica

### Prodotto

| Decisione | Sezioni |
|---|---|
| Una sola regola di generazione alla lettura: se manca la settimana corrente si genera dai pasti non ancora passati; se manca la successiva ed è passato mercoledì alle 20:00 si genera intera. Copre la prima generazione di una famiglia nuova (senza wizard nel traguardo A) e i buchi, per esempio dopo l'import | 4, 5 (vista di apertura) |
| Una settimana generata tiene conto delle settimane vicine già pianificate, prima e dopo (14 giorni e somiglianza in entrambe le direzioni); le settimane esistenti non si sovrascrivono mai | 3, 4 |
| Il job orario crea le settimane dei suoi job; un job fallito si ritenta ogni ora finché la settimana non è finita (se è iniziata genera i pasti ancora aperti), poi si chiude come abbandonato con un log d'errore; la settimana corrente di una famiglia senza job la crea la generazione pigra | 4 |
| Allarme del job: log `weekly_job_overdue` dal giovedì alle 08:00 che precede la settimana del job e `weekly_job_abandoned`; email con Resend nell'ondata 3 | 4 |
| Apertura: `no_weeks` solo senza settimane; altrimenti il primo giorno da oggi con un pasto con contenuto, poi il primo da oggi con uno slot (anche vuoto), poi l'ultimo giorno con slot prima di oggi; le schede «Nessuna ricetta adatta» restano visibili | 5 (vista di apertura) |

### Tecniche

| Decisione | Sezioni |
|---|---|
| Job con un Cron Trigger di Cloudflare (`0 * * * *`, handler `scheduled` del Worker) al posto di `pg_cron` con `pg_net`: niente segreto nel Vault, niente rotta `/internal/jobs/*`; ogni job nelle sue transazioni `app_job` e nel suo `try/catch` dentro la stessa invocazione (fino a 15 minuti di CPU); smistamento dei nuovi bersagli separato dalla lettura dei job aperti; stato `abandoned` | 1 (tabella delle rotte), 2 (`weekly_jobs`), 4 |
| Generazione pigra nella transazione dell'utente, ruolo `authenticated`, con le policy esistenti di W2; job nel ruolo `app_job`; stesso codice | 1, 4 |
| Generazioni della stessa famiglia serializzate con `pg_advisory_xact_lock` su una chiave derivata dal `family_id`, preso prima di ogni scrittura nella richiesta pigra e nel job | 4 |
| Hook `prepare` per operazione nel percorso della richiesta, prima del calcolo della versione e dell'uscita «invariato», con una parte di versione facoltativa; istante della richiesta fissato una volta nel contesto; implementatore unico in `server/src/router.ts` con factory per area | 1 (strato delle operazioni) |
| Candidate del pianificatore dal documento della versione corrente con `toPlannerRecipe(id, document)` di W3; impostazioni con `resolveFamilySettings` di W2 | 2, 3 |
| `mealRecipeVersions(tx, familyId, weekId)` in `server/src/menu/versions.ts` come unica scelta della versione per pasto (R1), usata da Menu e spesa; consegnata per prima in una PR piccola | 5, 6 |
| Menu sulle viste definitive di W6: un `RecipeRef` per pasto da `mealRecipeVersions` e dalle porzioni dello slot, una chiamata `recipeViews` per settimana, mappe lette con `recipeViewKey` | 5, 8 |
| La data effettiva di `menu.getOpening` entra nella versione dell'operazione e `today` si valida prima della risposta «invariato» | 1 (letture dalla copia sul dispositivo), 5 |
| La generazione non scrive `meal_changes` e lascia `updated_by` null: l'ultima modifica mostrata è solo quella delle persone | 2, 5 |
| `PlannerInput.from` per generare una settimana a metà e `PlannerInput.upcoming` per le settimane successive già pianificate | 3 |
