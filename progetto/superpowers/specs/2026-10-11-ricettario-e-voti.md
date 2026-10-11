# Ricettario e voti: spec di dettaglio

Creata: 11 ottobre 2026 · Attività W6 dell'ondata 2 · Branch `traguardo/ricettario`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`): parte 1 («Le stelline»,
«Il ricettario», «Lingua e unità di misura»), sezioni 1, 2, 6 (solo scalatura e
presentazione delle quantità), 8 (consultazione, proiezioni, versioni pubblicate), 12,
13, 15 e 16. Rispetta le «Interfacce decise» del piano generale e le regole comuni
dell'ondata 2.

## Obiettivo

- **Ricettario:** elenco delle ricette pubblicate visibili alla famiglia, con ricerca,
  filtri e ordinamenti del prototipo (primo giro), costruito sui documenti delle
  versioni correnti (sezione 1, «Regole comuni»).
- **Scheda ricetta:** versione corrente, oppure quella mangiata in un pasto passato (R1),
  con porzioni scalate e quantità nel sistema di misura della famiglia, nella lingua
  dell'utente; aperta da un pasto parte dalle porzioni di quel pasto; storico dei pasti
  della famiglia.
- **Voti:** stelline da 1 a 5 per membro, cambiabili e rimovibili; media dei membri
  attuali della famiglia; voto rifiutato offline.
- **Viste condivise** con il Menu (W1): riepilogo della ricetta, riepilogo del voto,
  righe di ingrediente pronte. W6 le possiede, W1 le importa (deciso dal coordinatore
  l'11 ottobre 2026).
- Strumenti MCP derivati dal contratto per tutte e tre le operazioni.

**Fuori perimetro:** bozze, ricette archiviate in elenco, versioni, modifica,
archiviazione e avvisi di versione per i curatori («Gestione del ricettario»); esclusioni
«non proporre più» (W2 profilo, `family.addExclusion`; nel prototipo stanno solo dentro
«Cambia ricetta» del pasto, quindi ricettario e scheda non le offrono né le filtrano);
foto (assenti dallo schema); filtro per stagione (escluso nel primo giro).

## Decisioni del brainstorming

Prese con il coordinatore l'11 ottobre 2026:

1. **Proprietà delle viste condivise:** schemi in `contract/src/recipes/views.ts`,
   caricatori in `server/src/recipes/views.ts` e l'operazione `ratings.set` sono di W6;
   W1 li importa e passa le versioni R1 dei suoi pasti. Consegna anticipata in una PR
   piccola (sotto, «Consegna»).
2. **Ricerca:** nella lingua dell'utente, su nome e descrizione della ricetta, nomi e
   varietà degli ingredienti e **sinonimi degli ingredienti nella stessa lingua**
   (sezione 15, «ricerca multilingue»).
3. **Approccio A:** il server carica in blocco le ricette visibili e i dati della
   famiglia e filtra, cerca e ordina con una funzione pura nel Worker. Niente filtri in
   SQL (servirebbero `unaccent` e una seconda normalizzazione), niente catalogo intero
   filtrato sul client (logica duplicata per MCP, client non più sottile).
4. **Dati che dipendono dall'ora:** le viste portano date e istanti dei pasti, non il
   giudizio «passato»; il web lo ricava sul dispositivo con il calendario di
   `domain/src/planner/` (W1), MCP riceve sempre dati freschi. Nessun nuovo ambito di
   versione nella piattaforma.

Dopo la review di spec e piano (coordinatore, 11 ottobre 2026):

5. **Interfaccia definitiva per W1** (sezione 1): W6 unico autore dei due `views.ts`,
   versioni storiche e ricette mai pubblicate già nella prima PR.
6. **Testi mancanti delle bozze citate:** nome nella lingua dell'utente, altrimenti
   nell'altra; descrizione `string | null` con lo stesso ripiego.
7. **Pasti futuri completi:** le letture trasmettono **tutti** i pasti futuri
   pianificati della ricetta (sono pochi), così la derivazione sul dispositivo resta
   corretta anche quando una rilettura risponde «invariato»; mentre la pagina è aperta un
   timer al prossimo `passesAt` fa ricalcolare la derivazione.
8. **Esclusioni** fuori perimetro: W6 non chiama `family.addExclusion`.
9. **File web condivisi:** tipi dell'API web, API finta e dati demo per le aree
   `recipes` e `ratings` li adegua W6; `IngredientList` è di W6 (componenti della
   ricetta), mostra la preparazione e W1 lo riusa.

## 1. Interfaccia per W1 (viste condivise)

**Definitiva** (decisione del coordinatore dell'11 ottobre 2026, dopo la review di spec e
piano): W6 è l'unico autore di `contract/src/recipes/views.ts` e
`server/src/recipes/views.ts`; W1 non li scrive e si adegua a queste firme. Arrivano con
la prima PR piccola (sezione 6), **complete delle versioni storiche (R1)** e delle
ricette mai pubblicate; quella PR parte dopo il merge del dominio ricetta di W3 (PR #9),
di cui usa `publishedRecipeSchema`.

### Contratto (`contract/src/recipes/views.ts`)

```ts
export const isoDateSchema = z.iso.date();
export const proteinGroupSchema = z.enum(PROTEIN_GROUPS);          // @app/domain/planner
export const mealTypeSchema = z.enum(MEAL_TYPES);                  // 'lunch' | 'dinner'
export const recipeMealTypeSchema = z.enum([...MEAL_TYPES, 'both']);
export const sourceTypeSchema = z.enum(['web', 'youtube', 'book', 'home']);

export const recipeSummaryView = z.object({
	id: z.uuid(),
	name: z.string(),                  // lingua dell'utente (ripiego: sotto)
	description: z.string().nullable(),
	durationMinutes: z.number().int().positive().nullable(),
	sourceType: sourceTypeSchema.nullable(),
	sourceUrl: z.string().nullable(),
	bookTitle: z.string().nullable(),  // titolo bibliografico originale (sezione 12)
	bookPages: z.string().nullable(),
	mealType: recipeMealTypeSchema.nullable(),
	proteinGroup: proteinGroupSchema.nullable(),
});

export const ratingSummaryView = z.object({
	familyAverage: z.number().min(1).max(5).nullable(), // null: nessun voto
	familyCount: z.number().int().min(0),
	myStars: z.number().int().min(1).max(5).nullable(),
});

export const ingredientLineView = z.object({
	ingredientId: z.uuid(),
	name: z.string(),                  // nome dell'ingrediente con la varietà
	amount: z.string(),                // già scalata, convertita e scritta: «200 g», «q.b.»
	preparation: z.string().nullable(),
	optional: z.boolean(),
});

export const mealOccurrenceView = z.object({
	date: isoDateSchema,
	mealType: mealTypeSchema,
	passesAt: z.iso.datetime({ offset: true }), // istante in cui il pasto diventa passato
});

export type RecipeSummaryView = z.infer<typeof recipeSummaryView>;
export type RatingSummaryView = z.infer<typeof ratingSummaryView>;
export type IngredientLineView = z.infer<typeof ingredientLineView>;
export type MealOccurrenceView = z.infer<typeof mealOccurrenceView>;
```

I vocabolari non si ridefiniscono: vengono da `@app/domain/planner`. Per questo
`contract/` e `server/` dichiarano il workspace `@app/domain` fra le dipendenze (pacchetto
interno, nessuna libreria esterna nuova; la sezione 1 della specifica prevede schemi del
contratto condivisi con `domain/`).

**Riepilogo di una ricetta mai pubblicata** (citata da pasti importati): solo `id`, nome
e descrizione; tutti gli altri campi `null`. `recipes.name` e `recipes.description` di una
bozza sono proiezioni parziali (ogni lingua può mancare o essere nulla, la colonna
`description` può essere nulla). Ripiego: **nome** nella lingua dell'utente, altrimenti
nell'altra lingua (le bozze hanno sempre almeno una lingua del nome; se mancassero
entrambe, stringa vuota); **descrizione** nella lingua dell'utente, altrimenti
nell'altra, altrimenti `null`. Per le ricette pubblicate e le loro versioni i testi sono
completi nelle due lingue e nessun campo del riepilogo è nullo, salvo `sourceUrl`,
`bookTitle` e `bookPages` secondo il tipo di fonte.

### Server (`server/src/recipes/views.ts`)

```ts
import type { Tx } from '../db.ts';

/** Un riferimento a una ricetta come la mostra un pasto o una scheda. */
export interface RecipeRef {
	recipeId: string;
	/**
	 * Numero: quella versione pubblicata (pasti passati, R1; anche la corrente).
	 * null: la ricetta com'è ora: la versione corrente se pubblicata o archiviata,
	 * altrimenti (mai pubblicata) solo nome e descrizione.
	 */
	version: number | null;
	servings: number;
}

/** Chiave delle mappe restituite: `${recipeId}@${version ?? 'now'}@${servings}`. */
export function recipeViewKey(ref: RecipeRef): string;

export interface Viewer { familyId: string; userId: string; locale: Locale }

/** Riepiloghi in blocco; chiave recipeViewKey. Ricette non leggibili (RLS) assenti dalla mappa. */
export function recipeSummaries(tx: Tx, refs: RecipeRef[], locale: Locale): Promise<Map<string, RecipeSummaryView>>;

/**
 * Righe pronte in blocco: documenti delle versioni, nomi degli ingredienti, scalatura alle
 * `servings` del riferimento (0: porzioni di riferimento), sistema della famiglia, lingua.
 * null per una ricetta mai pubblicata. Chiave recipeViewKey.
 */
export function ingredientLines(
	tx: Tx, refs: RecipeRef[], options: { familyId: string; locale: Locale },
): Promise<Map<string, IngredientLineView[] | null>>;

/** Media dei membri attuali (vista family_scores), numero di voti e voto di userId; chiave recipeId. */
export function ratingSummaries(
	tx: Tx, familyId: string, userId: string, recipeIds: string[],
): Promise<Map<string, RatingSummaryView>>;

/** Tutto insieme, per le schede: riepilogo, stato, versione mostrata, porzioni di riferimento, righe, voto. */
export interface RecipeView {
	summary: RecipeSummaryView;
	status: 'draft' | 'published' | 'archived';
	version: number;                   // versione mostrata; 0 per una ricetta mai pubblicata
	baseServings: number | null;       // null solo per le mai pubblicate
	ingredients: IngredientLineView[] | null;
	rating: RatingSummaryView | null;  // null per le mai pubblicate: non si votano (sezione 8)
}
export function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>>;

/** Pura, usata da ingredientLines e utile ai test: righe già caricate → righe pronte. */
export interface LineInput {
	ingredientId: string;
	variety: Localized | null;
	preparation: Localized | null;
	quantity: Quantity;                // @app/domain/units (W4)
	isOptional: boolean;
}
export type IngredientNames = ReadonlyMap<string, Localized>;
export function ingredientLinesView(
	lines: LineInput[], names: IngredientNames,
	options: { servings: number; baseServings: number; system: MeasurementSystem; locale: Locale },
): IngredientLineView[];
```

**Uso dal Menu:** per ogni pasto con ricetta W1 costruisce un `RecipeRef` con la versione
data da `mealRecipeVersions` (numero, oppure `null` per una ricetta mai pubblicata) e le
porzioni dello slot, poi chiama una volta per settimana `recipeSummaries`,
`ingredientLines` e `ratingSummaries` (oppure solo `recipeViews`) e legge le mappe con
`recipeViewKey`. Il voto del pasto è `null` per le mai pubblicate: W1 usa `RecipeView`
o controlla lo stato.

**Regole comuni:**

- **Contenuto sempre dal documento immutabile della versione** (correzione della seconda
  review, R1): per ogni riferimento si legge `recipe_versions.content` della versione
  richiesta, letto con `publishedRecipeSchema` di W3, anche quando coincide con la
  corrente; per `version: null` la versione è quella corrente. Stato, versione corrente,
  nome e descrizione delle bozze e documento arrivano da **una sola istruzione SQL**
  (`recipes` unita a `recipe_versions` sulla versione richiesta o corrente): Postgres in
  `read committed` dà a ogni istruzione una sola fotografia, quindi una pubblicazione
  concorrente non può mescolare due versioni (riepilogo di V1 con ingredienti di V2). Le
  proiezioni (`recipe_ingredients` e colonne di contenuto di `recipes`) servono a
  pianificazione e spesa, non alle viste.
- Poche query per insieme, mai una per pasto: contenuti in una istruzione; nomi degli
  ingredienti in una; **titoli dei libri in una, per i `bookId` dei documenti mostrati**
  (una versione dal libro A mostra il libro A anche se la corrente è del libro B o è
  diventata una fonte web); sistema di misura dalla famiglia. Nomi degli ingredienti e
  titoli dei libri sono entità condivise lette al momento: non fanno parte della
  versione (sezione 8).
- **Porzioni zero** (decisione del coordinatore dopo la seconda review):
  `meal_slots.servings` ammette 0 anche con una ricetta. Le viste non chiamano mai
  `scaleQuantity` con zero: per `servings: 0` le righe si mostrano alle porzioni di
  riferimento della ricetta, così la scheda resta leggibile; la spesa li esclude per
  conto suo. La chiave `recipeViewKey` conserva lo 0 del riferimento.
- Le funzioni non decidono permessi oltre l'RLS: chi le chiama ha già verificato la
  famiglia (ruolo `familyMember` della pipeline). Una ricetta che l'RLS nasconde (bozza
  non citata dalla famiglia) manca dalla mappa.
- **Nome con varietà:** nome dell'ingrediente nella lingua, seguito dalla varietà nella
  stessa lingua, come `withVariety` del prototipo («Pomodori Roma»). Nomi degli
  ingredienti e titoli dei libri sono quelli attuali del catalogo (entità condivise,
  sezione 8).
- **Ordine delle righe:** quello della fonte (`position`, ordine del documento).
- Un test d'integrazione della prima PR usa le viste come il Menu: una settimana con un
  pasto passato su una versione storica, uno su una ricetta mai pubblicata con il solo
  nome italiano letto da un utente inglese, la stessa ricetta con porzioni diverse in
  due pasti e un pasto con zero porzioni. Un secondo test pubblica una versione nuova fra
  la prima istruzione delle viste e le successive e verifica che ogni vista sia coerente
  con una sola versione.

## 2. Operazioni

Contratto in `contract/src/recipes/` (`recipes.ts`, `ratings.ts`, `views.ts`, `index.ts`),
registrato nell'indice del contratto con le sole chiavi `recipes` e `ratings`.

| Operazione | Ruolo | Metadati |
|---|---|---|
| `recipes.search` | `familyMember` | `mcp: { readOnly: true }`, `offline: false`, `reads: ['family', 'catalogue']` |
| `recipes.get` | `familyMember` | `mcp: { readOnly: true }`, `offline: false`, `reads: ['family', 'catalogue']` |
| `ratings.set` | `familyMember` | `mcp: { readOnly: false }`, `offline: false` |

### `recipes.search`

```ts
input: versionedInput(z.object({
	familyId: z.uuid(),
	query: z.object({
		text: z.string().max(100).optional(),
		mealType: z.enum(['lunch', 'dinner']).optional(),
		maxMinutes: z.number().int().positive().max(1440).optional(),
		proteinGroup: proteinGroupSchema.optional(),
		minStars: z.number().int().min(1).max(5).optional(),
		sort: z.enum(['name', 'rating', 'added', 'lastEaten']).optional(), // default name
		reversed: z.boolean().optional(),
	}),
}))
output: versionedOutput(z.object({ items: z.array(z.object({
	recipe: recipeSummaryView,
	rating: ratingSummaryView,
	baseServings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView), // per le porzioni di riferimento
	addedOn: isoDateSchema,
	lastEatenOn: isoDateSchema.nullable(),     // secondo l'ora del server
	upcoming: z.array(mealOccurrenceView),     // tutti i pasti non ancora passati
})) }))
```

**Insieme di partenza:** ricette `published`; quelle con `book_id` solo se il libro è
fra i `family_books` della famiglia. Il contenuto di ciascuna (testi, attributi, righe)
viene dal documento della versione corrente, caricato come nelle viste (sezione 1); il
filtro iniziale su stato e libro legge le colonne di `recipes`. Archiviate e bozze mai (le seconde l'RLS le
nasconde ai non curatori; per i curatori le escludiamo noi).

**Filtri** (tutti in AND):

- `mealType`: la ricetta ha quel pasto oppure `both`;
- `maxMinutes`: `duration_minutes <= maxMinutes`;
- `proteinGroup`: uguale;
- `minStars`: media della famiglia `>= minStars`; senza voti la ricetta non passa;
- `text`: normalizzato con `plainWords` di `domain/src/units` (minuscole, senza accenti
  né punteggiatura); **ogni parola** della ricerca deve comparire (come sottostringa) in
  almeno uno dei testi della ricetta nella lingua dell'utente: nome, descrizione, nome
  di ciascun ingrediente, varietà, sinonimi di ciascun ingrediente. Testo vuoto o fatto
  solo di punteggiatura = nessun filtro.

**Ordinamenti:** `name` crescente con `localeCompare` nella lingua dell'utente;
`rating` per media decrescente; `added` per `addedOn` decrescente; `lastEaten` per
`lastEatenOn` decrescente. A parità vale il nome. `reversed` inverte il criterio
principale, ma **i valori mancanti (nessun voto, mai mangiata) restano in fondo** in
entrambi i versi (il prototipo invertiva l'intero elenco: correzione da riportare).

**Campi:**

- `addedOn`: data di `recipes.created_at` nel fuso della famiglia (sezione 2: serve
  all'ordinamento «aggiunte di recente»);
- `lastEatenOn` e `upcoming`: pasti della famiglia con quella ricetta; un pasto è
  passato quando `app.meal_passed_at(date, meal_type, families.time_zone) <= now()`
  (W2). `upcoming` contiene **tutti** i pasti pianificati non ancora passati, in ordine
  crescente di `passesAt`: sono pochi (al più le settimane già generate) e servono
  tutti alla derivazione sul dispositivo (decisione 7). L'ordine dei pasti usa sempre
  l'istante `passesAt` (`meal_passed_at`), mai il testo del tipo di pasto: a parità di
  giorno la cena è più recente del pranzo.

La funzione pura `searchRecipes(candidates, query, locale)` sta in
`server/src/recipes/search.ts`: riceve le ricette già caricate con testi, ingredienti,
sinonimi, media, `addedOn`, `lastEatenOn`, e restituisce l'elenco filtrato e ordinato.

### `recipes.get`

```ts
input: versionedInput(z.object({
	familyId: z.uuid(),
	recipeId: z.uuid(),
	servings: z.number().int().min(1).max(100).optional(), // default: del pasto, se c'è, o di riferimento
	slotId: z.uuid().optional(),                             // aperta da quel pasto (R1, porzioni)
}))
output: versionedOutput(z.object({
	recipe: recipeSummaryView,
	status: z.enum(['published', 'archived']),
	baseServings: z.number().int().positive(),
	servings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView),
	rating: ratingSummaryView,
	history: z.array(z.object({ date: isoDateSchema, mealType })), // ultimi 5 passati, dal più recente
	upcoming: z.array(mealOccurrenceView),
}))
errors: not_found
```

**Visibilità:**

- `published` o `archived` (le archiviate restano leggibili e votabili dai pasti,
  sezione 8); una ricetta di un libro non posseduto solo se un pasto della famiglia la
  cita;
- bozza (anche citata da un pasto passato) → `not_found`: il Menu mostra nome e
  descrizione senza aprirla; la scheda della bozza è della «Gestione del ricettario»;
- inesistente → `not_found`.

**R1 con `slotId`:** il pasto deve essere della famiglia e citare `recipeId`, altrimenti
`not_found`. Se il pasto è passato secondo l'ora del server, si mostra
`app.recipe_version_at(recipeId, passesAt)`; altrimenti la versione corrente. La copia in
cache resta corretta: il contenuto cambia solo se la versione in vigore differisce dalla
corrente, e una versione nuova fa crescere il contatore del ricettario. Nessun avviso di
versione per i membri (deciso nel quinto giro; quello dei curatori è della «Gestione»).

**Porzioni con `slotId`** (decisione dell'utente, 11 ottobre 2026, dopo la prova sullo
stack reale): senza `servings` si scala alle porzioni del pasto, passato o futuro; un
pasto con zero porzioni torna alle porzioni di riferimento, come nelle viste del Menu.
`servings` esplicito vince sempre. `baseServings` resta quello della ricetta, per la
riga «Dosi della fonte». Il contatore della famiglia cresce quando cambiano le porzioni
di un pasto, quindi la copia in cache resta corretta.

**Storico:** `history` sono gli ultimi 5 pasti passati della famiglia secondo l'ora del
server, dal più recente per `passesAt`; `upcoming` tutti quelli non ancora passati. Il
web unisce i due elenchi sul dispositivo e mostra gli ultimi 5 passati (sezione 5).

### `ratings.set`

```ts
input: z.object({
	familyId: z.uuid(),
	recipeId: z.uuid(),
	stars: z.number().int().min(1).max(5).nullable(), // null: togli il mio voto
})
output: ratingSummaryView // della famiglia indicata
errors: not_found
```

- Stato assoluto, quindi idempotente: ripetere la richiesta dà lo stesso risultato
  (interfaccia «Idempotenza» del piano generale), senza id del client.
- Votabile: stessa visibilità di `recipes.get` (pubblicata o archiviata; libro
  posseduto o ricetta citata da un pasto della famiglia); bozza o invisibile →
  `not_found`.
- `stars` numerico: `insert … on conflict (user_id, recipe_id) do update set stars,
  updated_at = now()`; `null`: `delete`. Le policy di W2 garantiscono che si scriva solo
  il proprio voto e mai su una bozza.
- Il voto è personale: vale in tutte le famiglie dell'utente; il trigger di W2 fa
  crescere i contatori di tutte (`touch_families_of_user`).
- `offline: false`: il web lo rifiuta subito senza rete (interfaccia decisa con W5,
  review della PR #6).

### Errori e MCP

- Errori a codici della piattaforma; `not_found` si aggiunge con `.errors()` alle tre
  operazioni. Per MCP il testo localizzato esiste già in `server/src/messages.ts`.
- Gli strumenti MCP (`recipes_search`, `recipes_get`, `ratings_set`) si generano dal
  contratto; le descrizioni (`summary` delle rotte) dicono all'agente cosa fa ciascuno e
  che `stars: null` toglie il voto. Gli agenti non mandano `knownVersion` e ricevono
  sempre la vista fresca; `lastEatenOn` è già calcolato con l'ora del server.
- Rotte REST: `POST /families/{familyId}/recipes/search`,
  `POST /families/{familyId}/recipes/{recipeId}/view`,
  `PUT /families/{familyId}/ratings/{recipeId}`. Le due letture usano `POST` perché
  nella query string oRPC consegna tutti i valori come stringhe (notazione a parentesi,
  documentazione consultata con Context7 l'11 ottobre 2026): con `GET` numeri e booleani
  richiederebbero `z.coerce`, che toglie i tipi dallo schema JSON mostrato agli agenti
  MCP. Il percorso RPC dell'app web non cambia.

## 3. Server

```
server/src/recipes/
  lines.ts        funzione pura ingredientLinesView
  views.ts        viste condivise (sezione 1)
  access.ts       visibilità di una ricetta per la famiglia (scheda e voto)
  load.ts         query: candidati della ricerca, pasti della famiglia
  search.ts       funzione pura di ricerca e ordinamento
  router.ts       gestori di recipes.search, recipes.get, ratings.set
server/test/recipes/
  lines.test.ts  views.test.ts  menu-usage.test.ts  ratings.test.ts
  search.test.ts  recipes-search.test.ts  recipes-get.test.ts
  fixtures.ts     catalogo di prova scritto con l'utenza admin del database di test
```

Il router della piattaforma (`server/src/router.ts`) riceve solo la registrazione delle
due chiavi; i gestori arrivano da factory dell'area (`ratingsRouter(os)`,
`recipesRouter(os)`) che ricevono l'implementatore unico costruito in
`server/src/router.ts`, come faranno W1 e W2. Il tipo `Implementer` si esporta da
`server/src/pipeline.ts` (aggiunta di una riga, autorizzata dal coordinatore) da chi
arriva per primo. Tutte le query girano nella transazione dell'utente aperta dalla
pipeline.

**Query previste per `recipes.search`** (in parallelo dove possibile, stessa
transazione): famiglia (fuso, sistema); ricette candidate con libro; documenti delle
versioni correnti delle candidate (una istruzione); nomi e sinonimi degli ingredienti
citati; `family_scores` e
voti propri; pasti della famiglia con ricetta, con l'istante calcolato in SQL. Il costo è
lineare nel catalogo e si paga solo quando la versione cambia.

## 4. Nessuna migrazione

Schema, policy, viste dei punteggi, funzioni di R1 e trigger dei contatori ci sono già
(W2). Nessuna tabella o colonna aggiunta o cambiata.

## 5. Web

Le parti web partono quando la seconda PR di W5 (client oRPC reale) è su `main`, nella
struttura che la base impone (`web/src/features/recipes/` se prevista, altrimenti le
rotte di W5); file condivisi toccati solo per registrare l'area.

- **Ricettario** (`RecipesPage`): filtri e ordinamento come il prototipo e la base di
  W5 (pasto, tempo massimo 15/30/45, gruppo, voto minimo 3/4, ordinamento con freccia),
  stato «nessun risultato» con «Azzera i filtri», conteggio, schede con il componente
  del Menu e gli ingredienti alle porzioni di riferimento. I gruppi proteici passano
  agli 8 valori reali (`fish`, `white_meat`, `red_meat`, `cured_meat`, `legumes`,
  `eggs`, `cheese`, `vegetarian`; oggi la base ne ha 6 finti), con etichette nelle due
  lingue.
- **Scheda ricetta** (`RecipePage`): ordine approvato (titolo collegato alla fonte,
  voto, descrizione, durata e gruppo, fonte da libro o «di casa», porzioni con il
  selettore, porzioni di riferimento, ingredienti, storico). Ritorno al Menu o al
  Ricettario come oggi; `slotId` dal pasto, che dà anche le porzioni iniziali del
  selettore; `servings` nell'indirizzo, scelto con il selettore, vince.
- **Ora sul dispositivo:** funzioni pure `lastEatenOn(view, now)`, `pastMeals(view, now)`
  (unione di `history` con gli `upcoming` passati, ultimi 5) e `resortByLastEaten` (solo
  con `sort = lastEaten`, quando un `upcoming` è passato dopo la lettura), più
  `nextBoundary(views, now)`: il primo `passesAt` futuro. Il confronto usa l'istante
  `passesAt` già calcolato dal server, quindi non serve la regola delle 15:30 e 23:00 sul
  web; se W1 espone nel calendario di `domain/src/planner/` una funzione utile, la si usa
  senza riscriverla.
- **Ricalcolo mentre la pagina è aperta:** un hook `useMealClock(views)` tiene `now` in
  uno stato e programma un `setTimeout` al prossimo `passesAt` (al più un timer per
  pagina, rimesso dopo ogni scatto e cancellato all'uscita); allo scatto la pagina
  ricalcola la derivazione senza rileggere. Chiamare `new Date()` nel render da solo non
  basterebbe.
- **Adeguamenti espliciti alla base di W5** (tipi dell'API web, query, API finta, dati
  demo dell'area): `recipes.search` restituisce `{ items }` invece di un array;
  `RecipeListItem.servings` diventa `baseServings`; in `RecipeSummary` diventano
  nullabili `description`, `durationMinutes`, `sourceType`, `mealType` e `proteinGroup`
  (ricette mai pubblicate) e `photo` sparisce; `RecipeCard`, `RecipePage` e
  `sourceLine` (componenti della ricetta, di W6 per decisione del coordinatore) si
  adeguano: niente immagine, nessuna riga di fonte, durata o gruppo quando il campo è
  nullo; `IngredientLine` riceve `preparation`; il dettaglio
  riceve `status` e `upcoming`; i gruppi proteici passano agli 8 codici reali.
- **`IngredientList`** (componente di W6, riusato dal Menu): mostra la preparazione dopo
  il nome, nella lingua dell'utente, in tono secondario («Pomodori Roma, a dadini»).
- **Stelline:** `RatingStars` collegato a `ratings.set` con `useRateRecipe` di W5:
  stato in corso, nessun aggiornamento ottimistico, risposta applicata alle viste della
  stessa famiglia, ricerca rimarcata scaduta; offline il voto è rifiutato subito.
- **Testi:** dizionario `recipes` in italiano e inglese britannico con `useT()`, errori
  dai codici.

## 6. Consegna

1. **PR anticipata delle viste condivise** (dopo la review di spec e piano e dopo il
   merge della PR #9 di W3, da un branch `traguardo/ricettario-viste` da `origin/main`):
   `contract/src/recipes/views.ts`, `server/src/recipes/views.ts` completi della
   sezione 1 (versioni storiche e ricette mai pubblicate comprese), test d'uso come il
   Menu, `ratings.set` con contratto, gestore e test. Se la PR #9 tarda, il coordinatore
   decide se partire su di essa (base `fondamenta/ricetta-import`) o attendere.
2. **PR principale** (`traguardo/ricettario`, ribasata dopo il merge della prima):
   `recipes.search`, `recipes.get`, schermate web.

## 7. Test

- **Unitari puri:** `searchRecipes` (normalizzazione, accenti, ogni parola, sinonimi
  della sola lingua dell'utente, filtri, ordinamenti, mancanti in fondo anche invertendo,
  parità per nome); `ingredientLinesView` (scalatura, sistema imperiale, q.b., testo
  nella lingua, varietà, preparazione, opzionali); funzioni web dell'ora.
- **Server con il Postgres locale** (`TEST_DATABASE_URL`, come i test di W1): membri e
  non membri (`forbidden`); libri posseduti e no; archiviata leggibile e votabile ma non
  in elenco; bozza `not_found` anche per i curatori; R1 con un pasto passato e una
  versione successiva; versione storica dal libro A con la corrente dal libro B e con la
  corrente diventata fonte web; bozza citata con il solo nome italiano letta da un utente
  inglese e descrizione nulla; `slotId` di un'altra famiglia → `not_found`; porzioni dal
  pasto (futuro e passato), `servings` esplicito che vince e pasto a zero porzioni che
  torna a quelle di riferimento; ex membro
  **rimosso davvero** dopo aver votato: il suo voto esce dalla media e il suo stesso JWT
  riceve `forbidden`; voto tolto; voto su bozza rifiutato; pranzo e cena dello stesso
  giorno nell'ordine giusto e taglio agli ultimi 5; quattro pasti futuri tutti
  trasmessi; «invariato» dopo una lettura e versione nuova dopo un voto; chiamate MCP
  effettive di `recipes_search`, `recipes_get` e `ratings_set`, con `readOnlyHint`
  corretto.
- **Contratto:** il controllo esistente (`checkContract`) copre metadati e versioni.
- **Web** (test scritti e visti fallire prima di collegare le pagine): funzioni dell'ora
  con quattro pasti futuri e l'ora che avanza senza scritture mentre la lettura risponde
  «invariato»; `useMealClock` con timer finti; pagine con l'API finta nella forma reale
  di W6 (`{ items }`, `baseServings`, `upcoming`), cambio di famiglia, voto offline
  rifiutato senza invio, scheda aperta con `slotId` alle porzioni del pasto e con
  `servings` nell'indirizzo; `IngredientList` con la
  preparazione in italiano e in inglese; prova visiva con agent-browser e sull'iPhone
  (porta 8767).

## Decisioni da riportare nella specifica

### Prodotto

- Ricerca del ricettario nella lingua dell'utente, anche sui sinonimi degli ingredienti
  di quella lingua; ogni parola cercata deve comparire (sezioni 12 e 15, «ricerca
  multilingue»: chiusa per la ricerca).
- Ordinamento invertito con i valori mancanti sempre in fondo (sezione 14, primo giro).
- Ricettario e scheda non offrono «non proporre più» né filtrano le esclusioni, come nel
  prototipo (sezione 5).
- Scheda ricetta aperta da un pasto: porzioni iniziali del pasto, selettore invariato
  (utente, 11 ottobre 2026; sezioni 5 e 14).

### Tecniche

- Viste condivise fra Menu e Ricettario possedute dall'area `recipes` (sezione 1,
  contratto).
- Ricerca e ordinamento in una funzione pura nel Worker sui documenti delle versioni
  correnti caricati in blocco, senza filtri SQL (sezione 1).
- Viste delle ricette sempre dal documento immutabile della versione, caricato con la
  riga della ricetta in una sola istruzione, per non mescolare versioni durante una
  pubblicazione (sezioni 1 e 2, R1).
- Pasti con zero porzioni: righe mostrate alle porzioni di riferimento della ricetta
  (sezioni 5 e 6).
- Dati che dipendono dall'ora: le viste portano date e istanti dei pasti, il giudizio
  «passato» si fa sul dispositivo; nessun ambito di versione legato all'orologio
  (sezione 1, «Letture dalla copia sul dispositivo»).
- «Aggiunte di recente» dalla data di `recipes.created_at` nel fuso della famiglia
  (sezione 2).
- `ratings.set` a stato assoluto con `null` per togliere il voto (sezioni 1 e 13).
- Ricette mai pubblicate citate dai pasti: riepilogo con nome nella lingua dell'utente o,
  in mancanza, nell'altra, descrizione eventualmente nulla (sezioni 5 e 12).
- Letture con tutti i pasti futuri della ricetta e ricalcolo sul dispositivo a ogni
  `passesAt` mentre la pagina è aperta (sezione 1).
