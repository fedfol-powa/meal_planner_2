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
  filtri e ordinamenti del prototipo (primo giro), costruito sulle proiezioni.
- **Scheda ricetta:** versione corrente, oppure quella mangiata in un pasto passato (R1),
  con porzioni scalate e quantità nel sistema di misura della famiglia, nella lingua
  dell'utente; storico dei pasti della famiglia.
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

## 1. Viste condivise

### Contratto (`contract/src/recipes/views.ts`)

```ts
export const recipeSummaryView = z.object({
	id: z.uuid(),
	name: z.string(),                 // lingua dell'utente
	description: z.string(),
	durationMinutes: z.number().int().positive().nullable(),
	sourceType: z.enum(['web', 'youtube', 'book', 'home']).nullable(),
	sourceUrl: z.url().nullable(),
	bookTitle: z.string().nullable(), // titolo bibliografico originale (sezione 12)
	bookPages: z.string().nullable(),
	mealType: z.enum(['lunch', 'dinner', 'both']).nullable(),
	proteinGroup: proteinGroupSchema.nullable(),
});

export const ratingSummaryView = z.object({
	familyAverage: z.number().min(1).max(5).nullable(), // null: nessun voto
	familyCount: z.number().int().min(0),
	myStars: z.number().int().min(1).max(5).nullable(),
});

export const ingredientLineView = z.object({
	ingredientId: z.uuid(),
	name: z.string(),                 // nome dell'ingrediente con la varietà
	amount: z.string(),               // già scalata, convertita e scritta: «200 g», «q.b.»
	preparation: z.string().nullable(),
	optional: z.boolean(),
});

export const mealOccurrenceView = z.object({
	date: isoDateSchema,              // AAAA-MM-GG
	mealType: z.enum(['lunch', 'dinner']),
	passesAt: z.iso.datetime({ offset: true }), // istante in cui il pasto diventa passato
});
```

I campi nullabili del riepilogo servono alle ricette mai pubblicate citate dai pasti
passati (import), che il Menu mostra con solo nome e descrizione; per le pubblicate
sono sempre valorizzati. I vocabolari non si ridefiniscono: `proteinGroupSchema` è
`z.enum(PROTEIN_GROUPS)` di `domain/src/planner/types.ts`, il tipo di pasto usa
`MEAL_TYPES`. Per questo `contract/` e `server/` dichiarano il workspace `@app/domain`
fra le dipendenze (pacchetto interno, nessuna libreria esterna nuova; la sezione 1
della specifica prevede schemi del contratto condivisi con `domain/`). `isoDateSchema`
(`z.iso.date()`) sta in `views.ts`.

### Server (`server/src/recipes/views.ts`)

Firme proposte, da confrontare con le attese di W1:

```ts
export interface Viewer { familyId: string; userId: string; locale: Locale }

/** Medie dei membri attuali (vista family_scores) e voto proprio, per un insieme di ricette. */
export function ratingSummaries(
	tx: Tx, familyId: string, userId: string, recipeIds: string[],
): Promise<Map<string, RatingSummaryView>>;

/** Riga di ingrediente in ingresso: proiezione o riga del documento di W3, stessa forma. */
export interface LineInput {
	ingredientId: string;
	variety: Localized | null;
	preparation: Localized | null;
	quantity: Quantity;               // domain/src/units (W4)
	isOptional: boolean;
}
export interface IngredientNames { get(ingredientId: string): Localized | undefined }

/** Pura: scalatura (scaleQuantity), sistema della famiglia e lingua (formatQuantity). */
export function ingredientLinesView(
	lines: LineInput[], names: IngredientNames,
	options: { servings: number; baseServings: number; system: MeasurementSystem; locale: Locale },
): IngredientLineView[];

export interface RecipeRef {
	recipeId: string;
	/** null: versione corrente (proiezioni); numero: quella versione (pasti passati, R1). */
	version: number | null;
	servings: number;
}
export interface RecipeView {
	summary: RecipeSummaryView;
	status: 'draft' | 'published' | 'archived';
	version: number;                  // versione mostrata (0 per una ricetta mai pubblicata)
	baseServings: number | null;
	/** null: ricetta mai pubblicata, senza ingredienti verificati. */
	ingredients: IngredientLineView[] | null;
	/** null per le ricette mai pubblicate: non si votano (sezione 8). */
	rating: RatingSummaryView | null;
}

/** Chiave del risultato: `${recipeId}@${version ?? 'current'}@${servings}`. */
export function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>>;
export const recipeViewKey: (ref: RecipeRef) => string;
```

- `recipeViews` legge il sistema di misura della famiglia una volta, le ricette citate
  (con RLS: una bozza è leggibile ai membri solo se citata da un loro pasto), i nomi
  degli ingredienti e i voti con poche query per insieme, non per ricetta.
- **Versione corrente:** colonne di `recipes` e righe di `recipe_ingredients`.
- **Versione numerata** diversa dalla corrente: `recipe_versions.content` letto con lo
  schema del documento pubblicato di W3 (`domain/src/recipe/`); riepilogo e righe da lì,
  nomi degli ingredienti e titolo del libro dal catalogo attuale (entità condivise,
  sezione 8). Una versione uguale alla corrente usa le proiezioni.
- **Nome con varietà:** nome dell'ingrediente nella lingua, seguito dalla varietà nella
  stessa lingua, come `withVariety` del prototipo («Pomodori Roma»).
- **Ordine delle righe:** quello della fonte (`position`, ordine del documento).
- La funzione non decide permessi oltre l'RLS: chi la chiama ha già verificato la
  famiglia (ruolo `familyMember` della pipeline).

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
	upcoming: z.array(mealOccurrenceView),     // pasti non ancora passati, al più 3
})) }))
```

**Insieme di partenza:** ricette `published`; quelle con `book_id` solo se il libro è
fra i `family_books` della famiglia. Archiviate e bozze mai (le seconde l'RLS le
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
  (W2). `upcoming` in ordine crescente, al più 3 per ricetta.

La funzione pura `searchRecipes(candidates, query, locale)` sta in
`server/src/recipes/search.ts`: riceve le ricette già caricate con testi, ingredienti,
sinonimi, media, `addedOn`, `lastEatenOn`, e restituisce l'elenco filtrato e ordinato.

### `recipes.get`

```ts
input: versionedInput(z.object({
	familyId: z.uuid(),
	recipeId: z.uuid(),
	servings: z.number().int().min(1).max(100).optional(), // default: porzioni di riferimento
	slotId: z.uuid().optional(),                             // aperta da quel pasto (R1)
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

**Storico:** `history` sono gli ultimi 5 pasti passati della famiglia secondo l'ora del
server; `upcoming` quelli non ancora passati (al più 3). Il web unisce i due elenchi
sul dispositivo (sezione 5 di questa spec).

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
  views.ts        viste condivise (sezione 1)
  load.ts         query: candidati della ricerca, ricetta singola, pasti della famiglia
  search.ts       funzione pura di ricerca e ordinamento
  router.ts       gestori di recipes.search, recipes.get, ratings.set
server/test/recipes/
  search.test.ts  views.test.ts  recipes.test.ts  ratings.test.ts
  fixtures.ts     catalogo di prova scritto con l'utenza admin del database di test
```

Il router della piattaforma (`server/src/router.ts`) riceve solo la registrazione delle
due chiavi. Tutte le query girano nella transazione dell'utente aperta dalla pipeline.

**Query previste per `recipes.search`** (in parallelo dove possibile, stessa
transazione): famiglia (fuso, sistema); ricette candidate con libro; righe di
ingrediente delle candidate; nomi e sinonimi degli ingredienti citati; `family_scores` e
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
  Ricettario come oggi; `slotId` dal pasto.
- **Ora sul dispositivo:** funzione pura `lastEaten(view, now)` (e il riordino solo con
  `sort = lastEaten` quando un `upcoming` è passato) e unione di `history` con gli
  `upcoming` passati, prendendo gli ultimi 5. Il confronto usa l'istante `passesAt`;
  se W1 espone nel calendario di `domain/src/planner/` una funzione per l'ora del pasto
  si usa quella, senza riscriverla.
- **Stelline:** `RatingStars` collegato a `ratings.set` con `useRateRecipe` di W5:
  stato in corso, nessun aggiornamento ottimistico, risposta applicata alle viste della
  stessa famiglia, ricerca rimarcata scaduta; offline il voto è rifiutato subito.
- **Testi:** dizionario `recipes` in italiano e inglese britannico con `useT()`, errori
  dai codici.

## 6. Consegna

1. **PR anticipata delle viste condivise** (dopo la review di spec e piano, da un branch
   `traguardo/ricettario-viste` da `origin/main`): `contract/src/recipes/views.ts`,
   `server/src/recipes/views.ts` con test, `ratings.set` con contratto, gestore e test.
   Se il dominio ricetta di W3 non è ancora su `main`, le versioni numerate diverse
   dalla corrente rispondono con un errore interno esplicito ("version views need the
   recipe document") e arrivano nella PR principale; la firma non cambia.
2. **PR principale** (`traguardo/ricettario`, dopo il merge della prima e di W3):
   `recipes.search`, `recipes.get`, viste con versione numerata, schermate web.

## 7. Test

- **Unitari puri:** `searchRecipes` (normalizzazione, accenti, ogni parola, sinonimi
  della sola lingua dell'utente, filtri, ordinamenti, mancanti in fondo anche invertendo,
  parità per nome); `ingredientLinesView` (scalatura, sistema imperiale, q.b., testo
  nella lingua, varietà, preparazione, opzionali); funzioni web dell'ora.
- **Server con il Postgres locale** (`TEST_DATABASE_URL`, come i test di W1): membri e
  non membri (`forbidden`); libri posseduti e no; archiviata leggibile e votabile ma non
  in elenco; bozza `not_found` anche per i curatori; R1 con un pasto passato e una
  versione successiva; `slotId` di un'altra famiglia → `not_found`; media dei soli
  membri attuali con un voto di un ex membro; voto tolto; voto su bozza rifiutato;
  «invariato» dopo una lettura e versione nuova dopo un voto; strumenti MCP presenti
  con `readOnlyHint` corretto.
- **Contratto:** il controllo esistente (`checkContract`) copre metadati e versioni.
- **Web:** testing-library sulle due pagine con l'API finta di W5 aggiornata alle forme
  nuove; prova visiva con agent-browser e sull'iPhone (porta 8767).

## Decisioni da riportare nella specifica

### Prodotto

- Ricerca del ricettario nella lingua dell'utente, anche sui sinonimi degli ingredienti
  di quella lingua; ogni parola cercata deve comparire (sezioni 12 e 15, «ricerca
  multilingue»: chiusa per la ricerca).
- Ordinamento invertito con i valori mancanti sempre in fondo (sezione 14, primo giro).
- Ricettario e scheda non offrono «non proporre più» né filtrano le esclusioni, come nel
  prototipo (sezione 5).

### Tecniche

- Viste condivise fra Menu e Ricettario possedute dall'area `recipes` (sezione 1,
  contratto).
- Ricerca e ordinamento in una funzione pura nel Worker sulle proiezioni caricate in
  blocco, senza filtri SQL (sezione 1).
- Dati che dipendono dall'ora: le viste portano date e istanti dei pasti, il giudizio
  «passato» si fa sul dispositivo; nessun ambito di versione legato all'orologio
  (sezione 1, «Letture dalla copia sul dispositivo»).
- «Aggiunte di recente» dalla data di `recipes.created_at` nel fuso della famiglia
  (sezione 2).
- `ratings.set` a stato assoluto con `null` per togliere il voto (sezioni 1 e 13).
