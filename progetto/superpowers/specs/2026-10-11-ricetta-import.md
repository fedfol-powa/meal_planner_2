# Ricetta e import: spec di dettaglio

Creato: 11 ottobre 2026
Attività: W3 dell'ondata 1 (`fondamenta/ricetta-import`), piano generale
`progetto/superpowers/plans/2026-10-11-piano-generale.md`.
Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 2, 8, 11, 12, 15,
16, 17 R1 e R4) e alle sue decisioni; le scelte nuove sono raccolte in fondo, in
«Decisioni da riportare nella specifica».

## Obiettivo

1. **Documento ricetta**: uno schema unico in `domain/src/recipe/`, con un livello bozza
   (parziale) e un livello pubblicabile (completo), usato da contratto, bozze, versioni,
   MCP, modulo dei curatori e import.
2. **Controlli** di salvataggio e di pubblicazione con esiti a codici e percorsi dei
   campi; **proiezioni** del documento pubblicato nelle colonne del catalogo e nel
   formato del pianificatore.
3. **Import rilanciabile** da `../meal_planner/ricettario/ricette.yaml` in
   `scripts/import/`: un pacchetto di dati validati, un report delle ambiguità e una
   pagina di revisione per l'utente. Nessuna scrittura sul database: il pacchetto
   arriverà nel database tramite le operazioni dell'ondata 2 («Messa in produzione»).
4. **Dati di mappatura e traduzioni en-GB** preparati dall'agente e rivisti dall'utente.

Fuori perimetro: tabelle e migrazioni (W2), unità, conversioni e spesa (W4), operazioni
del contratto e MCP (ondata 2), impostazioni della famiglia (restano in
`scripts/planner-data/family.ts`).

## Dipendenze e interfacce

- **W4, tipi condivisi** (deciso dal coordinatore dopo la review): W4 possiede
  `LOCALES`, `Locale`, `Translated` (testo nelle due lingue) e `translatedTextSchema`
  (`domain/src/units/locale.ts`, `quantity.ts`), i codici e gli schemi delle unità
  (`UNIT_CODES`, `unitCodeSchema`) e la quantità completa (`Quantity`, `quantitySchema`,
  `publishableQuantitySchema`, che rifiuta `us_cup`). W3 possiede solo le varianti di
  bozza costruite sopra (`DraftTranslated`, quantità con valore ancora vuoto), senza
  ridefinire i tipi di W4.
- **W4, unità** (`domain/src/units/`): `UnitEquivalence`, `unitEquivalenceSchema`,
  `preparationKey`, `findEquivalence` (sceglie l'equivalenza della preparazione della
  riga, altrimenti quella senza preparazione), `assertUnambiguousEquivalences` e
  `applyRecipeEquivalence`. Si importano, non si duplicano. Interfaccia concordata dal
  coordinatore:
  - quantità `{ kind: 'amount', value, unit } | { kind: 'to_taste' } | { kind: 'text',
    text: { it-IT, en-GB } }`; intervalli e confezioni diventano `text`;
  - codici: massa `g kg oz lb`; volume `ml l uk_fl_oz uk_pint`; `tbsp tsp` (mai
    convertiti in ml); conteggi `piece clove slice pinch sprig bunch leaf`; `us_cup`
    ammessa solo in bozza;
  - le equivalenze di ambito `recipe` (tazze USA) si applicano in gestione o
    nell'import: la riga pubblicata contiene la quantità convertita;
  - un'equivalenza (di ricetta o di spesa) può avere una `preparation` facoltativa,
    testo italiano normalizzato: si applica a una riga solo se la preparazione della riga
    coincide (confronto normalizzato), oppure se l'equivalenza non ne ha. Se nessuna si
    applica, la tazza resta tale e la ricetta resta in bozza (deciso dal coordinatore,
    girato a W4 e W2).
- **W4, varietà** (`domain/src/shopping/variety.ts`): `varietyKey`.
- **W4, reparti** (`domain/src/shopping/departments.ts`): `produce`, `butcher`, `fish`,
  `chilled`, `bakery`, `pasta_grains`, `tinned`, `frozen`, `condiments`, `other`.
- **W2, schema**: usa la forma del documento per `recipe_versions.content` e
  `recipe_drafts.content` e le colonne di proiezione elencate sotto, in «Interfaccia per
  W2».
- **W1, piattaforma**: con i workspace npm `domain/` avrà il suo `package.json`; zod si
  aggiunge lì quando lo scheletro di W1 è su `main` (autorizzato dal coordinatore).
- **Pianificatore** (`domain/src/planner/`): non cambia. I vocabolari degli attributi
  si importano da lì; la proiezione `toPlannerRecipe` produce il suo `PlannerRecipe`.

## 1. Documento ricetta

### Testi bilingui

Deciso dall'utente l'11 ottobre 2026 (opzione B): ogni testo localizzato è un oggetto
`{ "it-IT": string, "en-GB": string }` (`Translated` di W4), nel documento e nelle
colonne jsonb del database. Nel livello bozza ciascuna lingua può mancare o essere vuota. Al salvataggio i
testi si ripuliscono dagli spazi in testa e in coda (e, per la varietà, dagli spazi
doppi, come nel prototipo).

### Forma (versione 1)

```ts
// Translated = { 'it-IT': string; 'en-GB': string }, da domain/src/units (W4)

interface RecipeDocument {
	schemaVersion: 1;
	name: Translated;
	description: Translated;
	sourceType: 'web' | 'youtube' | 'book' | 'home';
	sourceUrl: string | null;
	bookId: string | null;
	bookPages: string | null;
	durationMinutes: number;
	baseServings: number;
	mealType: 'lunch' | 'dinner' | 'both';
	proteinGroup: ProteinGroup;          // da domain/src/planner
	isFreshFish: boolean;
	carbohydrateGroup: CarbohydrateGroup;
	category: Category;
	hasVegetables: boolean;
	isHeavy: boolean;
	seasons: Season[];                    // vuoto = tutto l'anno
	ingredients: IngredientLine[];        // ordine della fonte
}

interface IngredientLine {
	ingredientId: string;                 // id del catalogo (slug nell'import, vedi sotto)
	variety: Translated | null;
	preparation: Translated | null;
	quantity: Quantity;                   // da domain/src/units (W4), senza us_cup
	sourceText: string;                   // riga della fonte com'è scritta
	isOptional: boolean;
	isPrimary: boolean;
}
```

**Livello bozza** (`RecipeDraftDocument`): stessi campi, tutti facoltativi o nullabili;
testi localizzati parziali (`DraftTranslated`); `amount.value` può essere `null`
(quantità ancora da scrivere); `us_cup` ammessa; `text.text` parziale; `ingredients` può
essere vuoto. `schemaVersion` è sempre presente.

**Righe irrisolte** (deciso dal coordinatore dopo la review): nel livello bozza
`ingredientId` può essere `null`. Una riga così conserva il `sourceText` della fonte e
la quantità letta, ma non ha ancora un ingrediente del catalogo (per esempio una riga
d'origine non mappata dall'import). Il salvataggio la accetta; `checkPublishable` la
segnala con `required` su `['ingredients', i, 'ingredientId']`. Il blocco vive quindi
nel documento e sopravvive al salvataggio della bozza, senza colonne nuove in W2.

**Scelte di forma:**

- **Campi della fonte piatti**, non un'unione per tipo: una bozza può cambiare tipo di
  fonte senza perdere i dati scritti. Le regole per tipo stanno nel controllo di
  pubblicazione, che chiede anche che i campi non pertinenti siano vuoti (una ricetta
  `home` non pubblica un URL rimasto da un tipo precedente).
- **Fuori dal documento**: tag, foto, stato, versione, date, autori e identità
  d'origine. Sono metadati della ricetta, non contenuto versionato.
- **Riferimenti**: `ingredientId` e `bookId` sono gli id del catalogo (o `null` per una
  riga irrisolta). L'import lavora
  con gli slug e il pacchetto li porta come tali; `resolveReferences(document, lookup)`
  li sostituisce con gli id al momento della scrittura (ondata 2).
- **`sourceText`** è la riga della fonte com'è scritta, nome e quantità
  («Pomodoro a dadini (varietà Roma): 1»): conserva alternative, note e quantità
  originali (prima di una conversione da tazze USA). È una trascrizione della fonte,
  non un testo localizzato (sezione 12).
- **Ingrediente principale**: `isPrimary` su al massimo una riga.

### Limiti

| Campo | Limite |
|---|---|
| `name` per lingua | 120 caratteri |
| `description` per lingua | 600 caratteri |
| `variety`, `quantity.text` per lingua | 40 caratteri |
| `preparation` per lingua | 60 caratteri |
| `sourceText` | 200 caratteri |
| `bookPages` | 20 caratteri |
| `durationMinutes` | intero positivo, al massimo 1440 |
| `baseServings` | intero positivo, al massimo 100 |

## 2. Controlli

### Approccio

Uno **schema zod strutturale** (`recipeDraftSchema`) rifiuta i dati di forma sbagliata:
tipi, valori fuori dai vocabolari, unità sconosciute. Due **funzioni pure** aggiungono
limiti, riferimenti e completezza e restituiscono esiti a codici:

```ts
checkDraft(document, lookup): ValidationIssue[]        // al salvataggio della bozza
checkPublishable(document, lookup): ValidationIssue[]  // alla pubblicazione, comprende checkDraft
toPublished(document): RecipeDocument                  // restringe il tipo dopo controlli superati
```

`toPublished` normalizza prima i campi assenti: `sourceUrl`, `bookId`, `bookPages`,
varietà e preparazione assenti o vuote diventano `null`, `seasons` assente diventa `[]`.
Invariante, provata nei test: un documento senza problemi di pubblicazione si converte
sempre con `toPublished`.

`domain/` si compila senza le librerie del DOM né quelle di Node: la verifica degli
indirizzi non usa il tipo globale `URL` ma un'espressione regolare su schema e host.

`lookup` è passato dal chiamante (`hasIngredient(id)`, `hasBook(id)`), così `domain/`
resta puro. Gli errori di zod si convertono negli stessi codici (`invalid_value`) con lo
stesso percorso: chi chiama riceve una sola lista.

### Esiti

```ts
interface ValidationIssue {
	path: (string | number)[];   // ['ingredients', 3, 'variety', 'en-GB']
	code: IssueCode;
}
```

| Codice | Quando | Bozza | Pubblicazione |
|---|---|---|---|
| `invalid_value` | Tipo sbagliato o valore fuori vocabolario | rifiutato | rifiutato |
| `too_long` | Oltre i limiti | rifiutato | rifiutato |
| `invalid_url` | Indirizzo non http(s); per `youtube`, host diverso da YouTube | rifiutato | rifiutato |
| `not_positive_integer` | Durata o porzioni non intere positive o oltre il massimo | rifiutato | rifiutato |
| `invalid_amount` | Quantità numerica non finita o non positiva | rifiutato | rifiutato |
| `unknown_ingredient`, `unknown_book` | Riferimento inesistente | rifiutato | rifiutato |
| `duplicate_ingredient` | Stesso ingrediente e stessa varietà normalizzata (sotto) | ammesso | rifiutato |
| `multiple_primary` | Più di una riga principale | rifiutato | rifiutato |
| `required` | Dato obbligatorio mancante, nessun testo in nessuna lingua, riga irrisolta | ammesso | rifiutato |
| `translation_missing` | Testo in una lingua sola (manca l'altra) | ammesso | rifiutato |
| `not_applicable` | Campo della fonte non pertinente al tipo | ammesso | rifiutato |
| `unit_not_publishable` | Unità `us_cup` senza equivalenza applicata | ammesso | rifiutato |

Unica eccezione al «ammesso» della colonna bozza: il salvataggio richiede almeno un nome
in una lingua (come nel prototipo), altrimenti `required` sul percorso `['name']`.

### Regole di pubblicazione

- nome e descrizione nelle due lingue;
- per `web` e `youtube` l'indirizzo; per `book` libro e pagine; per `home` nessun dato
  della fonte; i campi non pertinenti vuoti;
- durata e porzioni di riferimento;
- attributi del pianificatore tutti presenti tranne `seasons` (vuoto ammesso) e
  l'ingrediente principale (deciso dall'utente l'11 ottobre 2026: supera la scelta del
  quinto giro sul gruppo alimentare facoltativo);
- almeno un ingrediente; per ogni riga: `sourceText` non vuoto; quantità `amount` con
  valore e unità pubblicabile, oppure `to_taste`, oppure `text` nelle due lingue;
  varietà e preparazione, se presenti, nelle due lingue;
- il nome inglese degli ingredienti del catalogo si controlla con `lookup`
  (`ingredientHasEnglishName(id)`), come nel prototipo.

### Righe duplicate

Un duplicato è un problema di pubblicazione, mai un errore di salvataggio (deciso dal
coordinatore dopo la review): una bozza può contenere due righe dello stesso
ingrediente mentre il curatore decide come unirle. Il confronto riguarda solo righe con
ingrediente e la cui varietà è confrontabile: senza varietà in nessuna lingua, oppure con
la varietà italiana. Una riga con la varietà scritta solo in inglese non si confronta
(la sua identità non è ancora nota) e alla pubblicazione riceve comunque
`translation_missing`. Due righe confrontabili con la stessa chiave (`lineKey`:
ingrediente più `varietyKey` dell'italiano) danno `duplicate_ingredient` sulla seconda.

### Varietà

La chiave normalizzata della varietà è `varietyKey` di W4
(`domain/src/shopping/variety.ts`), la stessa della spesa e della colonna `variety_key`:
si importa, non si duplica. Da `prototype/src/lib/domain/ingredient-variety.ts` si
portano qui `cleanVariety`, `lineKey` (ingrediente più `varietyKey`) e i consigli
(`varietyHints`), che ricevono le varietà note di un ingrediente dal chiamante invece di
leggere un database dimostrativo.

### Riepilogo per le schede delle bozze

`missingData(issues)` restituisce le voci brevi del prototipo (`names`, `source`,
`details`, `attributes`, `baseServings`, `ingredients`, `translation`, `invalid`), in
ordine stabile. `attributes` è nuova e copre gli attributi del pianificatore.

## 3. Proiezioni

- `projectRecipe(document)` → `{ recipe: RecipeProjection, ingredients:
  RecipeIngredientProjection[] }`, con le colonne elencate nell'interfaccia per W2.
- `toPlannerRecipe(id, document, bookId)` → `PlannerRecipe` del pianificatore:
  `primaryIngredientId` dalla riga `isPrimary`, `ingredients` con `isOptional`.
- `projectDraftNames(draft)` → `{ name, description }` di una ricetta in bozza nuova,
  con stringa vuota per le lingue mancanti.
- `resolveReferences(document, lookup)` → stesso documento con gli id del catalogo al
  posto degli slug (per l'import).

## Interfaccia per W2

Proposta per le migrazioni; nomi e tipi definitivi li conferma W2 con il coordinatore.

**Forma di `content`.** `recipe_versions.content` contiene un `RecipeDocument` completo,
validato da `checkPublishable`; `recipe_drafts.content` e `recipe_draft_saves.content`
un `RecipeDraftDocument`. Entrambi hanno `schemaVersion: 1`; una forma futura alza il
numero e porta una funzione di aggiornamento in `domain/src/recipe/`. Chiavi in
camelCase come nel TypeScript (sopra, sezione 1).

**Colonne di `recipes` ricavate dal documento** (ricalcolate a ogni pubblicazione o
ripristino):

| Colonna | Tipo | Dal documento |
|---|---|---|
| `name` | jsonb `{it-IT, en-GB}` | `name` |
| `description` | jsonb `{it-IT, en-GB}` | `description` |
| `source_type` | text (`web`/`youtube`/`book`/`home`) | `sourceType` |
| `source_url` | text null | `sourceUrl` |
| `book_id` | riferimento a `books` null | `bookId` |
| `book_pages` | text null | `bookPages` |
| `duration_minutes` | integer | `durationMinutes` |
| `base_servings` | integer | `baseServings` |
| `meal_type` | text (`lunch`/`dinner`/`both`) | `mealType` |
| `protein_group` | text | `proteinGroup` |
| `is_fresh_fish` | boolean | `isFreshFish` |
| `carbohydrate_group` | text | `carbohydrateGroup` |
| `category` | text | `category` |
| `has_vegetables` | boolean | `hasVegetables` |
| `is_heavy` | boolean | `isHeavy` |
| `seasons` | text[] | `seasons` |

Per una ricetta mai pubblicata (stato `draft`, bozza `new`) `name` e `description` si
riempiono comunque dal documento della bozza: li scrive l'import e il server a ogni
salvataggio della bozza, così i membri vedono il nome dei pasti che la citano senza
leggere le bozze (deciso dal coordinatore l'11 ottobre 2026). Una lingua ancora mancante
vale stringa vuota. Le altre colonne di proiezione restano vuote fino alla
pubblicazione. Funzione: `projectDraftNames(draft)` → `{ name, description }`.

**Identità d'origine** su `recipes`, fuori dal documento perché sopravvive alle
modifiche: `origin_slug` text null, unico (lo slug della scheda in `ricette.yaml`), e
`origin_type` text null (`web`/`youtube`/`libro`/`casa`, il tipo com'era nell'origine).
Lo `slug` della ricetta nuova parte uguale a `origin_slug`, ma può cambiare; il
riconoscimento delle schede già importate usa solo `origin_slug`.

**Righe di `recipe_ingredients`** (una per riga del documento, ricalcolate con la
ricetta):

| Colonna | Tipo | Dal documento |
|---|---|---|
| `recipe_id` | riferimento | |
| `position` | smallint | indice nella lista, da 0 |
| `ingredient_id` | riferimento a `ingredients` | `ingredientId` |
| `variety` | jsonb `{it-IT, en-GB}` null | `variety` |
| `variety_key` | text, vuoto senza varietà | `varietyKey(variety['it-IT'])` di W4 |
| `quantity_kind` | text (`amount`/`to_taste`/`text`) | `quantity.kind` |
| `quantity` | numeric null | `quantity.value` |
| `unit` | text null (codici di W4) | `quantity.unit` |
| `quantity_text` | jsonb `{it-IT, en-GB}` null | `quantity.text` |
| `source_text` | text | `sourceText` |
| `preparation` | jsonb `{it-IT, en-GB}` null | `preparation` |
| `is_optional` | boolean | `isOptional` |
| `is_primary` | boolean | `isPrimary` |

Unicità consigliata: (`recipe_id`, `ingredient_id`, `variety_key`) e (`recipe_id`,
`position`). Con la decisione B la tabella `recipe_ingredient_translations` non serve.

**Ingredienti del catalogo** (prodotti dall'import, forma in
`domain/src/recipe/ingredient.ts`): `slug`, `name` jsonb `{it-IT, en-GB}`, `synonyms`
jsonb `{it-IT: string[], en-GB: string[]}`, `department` (codici di W4), `is_pantry`. Con
la decisione B `ingredient_translations` diventa colonne di `ingredients`.

## 4. Import

### Comando e ingressi

`node scripts/import/import-recipes.ts [--existing <file.json>] [--today <YYYY-MM-DD>]`
(lo script npm nella radice si aggiunge con W1, proprietario del `package.json` della radice).

| Ingresso | Contenuto |
|---|---|
| `../meal_planner/ricettario/ricette.yaml` | sola lettura, con `scripts/planner-data/origin.ts` |
| `scripts/import/recipe-attributes.yaml` | attributi del pianificatore, già rivisti (8 ottobre), letti con `scripts/planner-data/attributes.ts` |
| `scripts/import/ingredients.yaml` | catalogo degli ingredienti: slug, nomi nelle due lingue, sinonimi, reparto, dispensa |
| `scripts/import/ingredient-lines.yaml` | nome della riga d'origine → ingrediente, varietà, preparazione, facoltativo |
| `scripts/import/translations.en-GB.yaml` | nome e descrizione inglesi delle ricette, quantità a parole |
| `scripts/import/unit-equivalences.yaml` | equivalenze di ambito `recipe` per ingrediente (tazze USA), con la fonte e la preparazione facoltativa |
| `--existing` | facoltativo: `{ recipes: [origin_slug], ingredients: [slug], books: [slug] }` già presenti nel database |
| `--today` | data dell'import (`YYYY-MM-DD` esistente), per lo storico; di default oggi; una data non valida ferma il comando prima di leggere i dati |

**Approvazione legata al contenuto** (deciso dal coordinatore dopo la review). Ogni file
YAML d'ingresso ha in testa la riga
`# Revisione: <data>, rivisto dall'utente, sha256:<impronta>`, dove l'impronta è lo
SHA-256 del contenuto del file senza quella riga. Se la riga manca o l'impronta non
corrisponde al contenuto, il file risulta da rivedere (`pendingReview`): qualunque
modifica successiva alla revisione, anche una traduzione aggiunta per un rilancio, fa
tornare il file da rivedere. La riga la scrive `node scripts/import/approve.ts <file>
<data>`, eseguito solo su indicazione dell'utente.

### Mappatura delle righe

```yaml
lines:
  "Pomodoro a dadini (varietà Roma)":
    ingredient: pomodori
    variety: { it-IT: Roma, en-GB: Roma }
    preparation: { it-IT: a dadini, en-GB: diced }
    optional: false
  "Cipolla rossa di Tropea (o 1 cipollotto)":
    ingredient: cipolle
    variety: { it-IT: rossa di Tropea, en-GB: Tropea red }
    preparation: null
    optional: false
    note: "Alternativa (cipollotto) solo nel testo della fonte"
```

- La chiave è il nome della riga d'origine, esatto: nessuna corrispondenza
  approssimata. Un nome senza voce produce una **riga irrisolta**: resta nel documento
  con `ingredientId: null`, il `sourceText` d'origine e la quantità letta, e il report
  ne dà il motivo. Le voci che nessuna ricetta del pacchetto usa (per esempio quelle
  di schede già importate) sono ammesse.
- L'ingrediente è il prodotto generico, senza varietà, taglia o preparazione nel nome
  (sezione 8, «Ingredienti e varietà»). Le alternative («o Parmigiano») restano solo in
  `sourceText`; la riga punta al primo prodotto citato.
- Gli ingredienti vengono solo dalle righe della fonte, mai dal nome del piatto.
- Se dopo la mappatura due righe di una ricetta hanno lo stesso ingrediente e la stessa
  varietà, l'import non le unisce e le tiene entrambe: `checkPublishable` dà
  `duplicate_ingredient`, la ricetta resta in bozza e il report lo segnala (unire le
  quantità è una scelta del curatore, sezione 8).
- `primary_ingredient` di `recipe-attributes.yaml` (slug del nome d'origine) indica la
  riga con `isPrimary`.

### Quantità

Un parser in `scripts/import/quantity.ts` legge il testo italiano dell'origine:

- `q.b.`, `a piacere` → `to_taste`;
- numero, frazione o decimale, seguito facoltativamente da un'unità nota e da «circa» →
  `amount` (`300 g`, `1/2`, `3 cucchiai circa`); un numero da solo è `piece`;
  una nota finale tra parentesi resta solo nel testo della fonte, ma la nota si segnala;
- unità: `g kg ml l oz`, `cup`/`cups` → `us_cup`, `cucchiaio/i` → `tbsp`,
  `cucchiaino/i` → `tsp`, `spicchio/i` → `clove`, `fetta/e` → `slice`, `pizzico/chi` →
  `pinch`, `rametto/i` → `sprig`, `mazzetto/i` → `bunch`, `foglia/e` → `leaf`;
- tutto il resto (intervalli, confezioni, «un piccolo pezzo», «1 bicchiere») → `text`,
  con il testo italiano dell'origine e l'inglese da `translations.en-GB.yaml`;
- `us_cup` si converte con la funzione di W4 se c'è un'equivalenza per quell'ingrediente
  la cui preparazione coincide con quella della riga, o che non ne ha; altrimenti resta
  `us_cup` e la ricetta resta in bozza.

Le quantità con «circa» e quelle con una nota tra parentesi entrano nel report, anche
quando il ripiego è `text`: per esempio il caso reale «145 g crudo (330 g cotto)», che
resta testo ma va segnalato perché crudo e cotto danno quantità diverse.

### Ricette

Per ogni scheda d'origine non presente in `--existing`:

- `sourceType`: `web`, `youtube`, `libro` → `book`; `casa` senza URL → `home`; `casa` con
  URL → `web` con l'URL (R4, deciso l'11 ottobre 2026), con `origin_type: casa`
  conservato e la voce nel report;
- libro: `bookId` = slug del titolo, `bookPages` dalle pagine; i libri nuovi entrano nel
  pacchetto;
- testi: italiano da `nome` e `descrizione`, inglese da `translations.en-GB.yaml`;
- durata: `duration_minutes` di `recipe-attributes.yaml`, altrimenti `durationOf(tempo)`;
- porzioni: `porzioni_base`;
- attributi del pianificatore da `recipe-attributes.yaml` (`fresh_fish` → `isFreshFish`);
- tag d'origine non importati: li sostituiscono gli attributi (nel report una riga
  riassuntiva);
- **stato nel pacchetto**: `publishable` se `checkPublishable` non trova problemi,
  altrimenti `draft` con i problemi. Ogni impedimento dell'import (riga irrisolta, riga
  duplicata, attributi mancanti, tazza senza equivalenza, traduzione mancante) è un
  problema di `checkPublishable` sul documento stesso: lo stato dipende solo dal
  documento e il blocco sopravvive a `bundle.json` e al salvataggio della bozza. Una
  scheda senza ingredienti o senza porzioni è una bozza con quello che c'è (nome,
  descrizione, fonte, attributi);
- `recipe-attributes.yaml` classifica le 52 schede con ingredienti e porzioni; una
  scheda senza voce resta senza attributi (problemi `required`), senza classificazione
  inventata.

### Dati della famiglia

Solo per le ricette del pacchetto (con `--existing` le schede già importate non
ripetono voti né storico):

- **voti** di Federico: B=1, BB=3, BBB=4, BBBB=5 stelle (sezione 8);
- **pasti passati** dallo storico (data, pasto, ricetta). La `settimana` deve essere una
  data `YYYY-MM-DD` esistente e un lunedì: altrimenti la voce si scarta e si segnala,
  senza datarla per normalizzazione. Poi le regole R4 decise l'11 ottobre 2026:
  - `cucinata: true` → pasto;
  - `cucinata: false` → nessun pasto, nel report;
  - `cucinata: null` in una settimana conclusa prima di `--today` (domenica della
    settimana anteriore a `--today`) → pasto, nel report come «esito non registrato»; in una settimana non conclusa →
    nessun pasto, nel report;
  - giorno o pasto non riconosciuti → scartati, nel report;
- **`triedUndated`**: ricette `collaudata: true` senza pasti importati, nel pacchetto e
  nel report; nessun pasto inventato (R4a). Nel database finisce nella tabella
  `family_tried_recipes(family_id, recipe_id, source, created_at)` di W2, con
  `source: 'import'`; per ora il pianificatore non lo usa;
- nessuna esclusione: le esclusioni di `REGOLE.md` riguardano piatti mai entrati nel
  ricettario (nel report).

I pasti importati seguono la regola R1 di W2: un pasto passato mostra la prima versione
pubblicata della ricetta se precede la prima pubblicazione; se la ricetta non è mai
pubblicata mostra solo nome e descrizione (da `projectDraftNames`) e non entra nella
spesa. L'import non cambia per questo: produce solo data, pasto e scheda d'origine.

Le schede di `archivio.yaml` non si importano; il report ne dice il numero.

### Uscite

In `scripts/import/out/`, rigenerabile e ignorata da Git (con un `.gitignore` in
`scripts/import/`, per non toccare quello della radice):

- **`bundle.json`**:

  ```ts
  interface ImportBundle {
  	generatedAt: string;
  	importDate: IsoDate;
  	pendingReview: string[];          // file d'ingresso senza approvazione valida
  	books: { slug: string; title: string }[];
  	ingredients: CatalogueIngredient[];
  	recipes: {
  		origin: { slug: string; type: 'web' | 'youtube' | 'libro' | 'casa' };
  		status: 'publishable' | 'draft';
  		document: RecipeDraftDocument; // completo se publishable; riferimenti per slug
  		issues: ValidationIssue[];
  	}[];
  	family: {
  		ratings: { originSlug: string; stars: number }[];
  		meals: { date: IsoDate; mealType: 'lunch' | 'dinner'; originSlug: string }[];
  		triedUndated: string[];
  	};
  }
  ```

  Contiene solo libri, ingredienti e ricette nuovi rispetto a `--existing`. Le
  operazioni dell'ondata 2 non pubblicano finché `pendingReview` non è vuoto.
- **`report.md`**, il report delle ambiguità, in italiano, una sezione per causa:
  ricette in bozza con i problemi; R4 (casa con URL e adattamenti della famiglia dalle
  note, ricette provate senza data); storico scartato o senza esito; ingredienti di
  dispensa esclusi nell'origine («olio, sale e pepe esclusi»: non si aggiungono righe
  senza la fonte); alternative nei nomi; preparazioni di altre pagine del libro
  (`dipendenze_libro`); quantità con note; schede già presenti saltate; archivio.
- **`review.html`**, la pagina di revisione per l'utente: per ricetta, nome e
  descrizione in italiano e inglese, e per riga testo della fonte → ingrediente (due
  lingue, «da mappare» per una riga irrisolta), varietà, preparazione, quantità letta,
  facoltativo, principale, problemi;
  poi il catalogo degli ingredienti con reparto e dispensa. Pagina statica autonoma,
  testi in italiano. Il coordinatore la mostra all'utente; le correzioni si riportano
  nei YAML.

### Rilancio

Rilanciare l'import con lo stesso `--existing` dà lo stesso pacchetto (a parte
`generatedAt`). Le schede presenti in `--existing` non si toccano, anche se l'origine è
cambiata (sezione 11): la selezione delle schede nuove avviene **prima** di ogni
validazione che dipende dal contenuto delle schede (attributi, righe), così una scheda
già importata e poi modificata nell'origine non ferma l'import delle nuove. La lista `--existing` la produrrà un'operazione dell'ondata 2
dal database (`origin_slug` delle ricette, slug di ingredienti e libri).

## 5. Dati di mappatura e traduzioni

Li prepara l'agente durante l'implementazione, poi li rivede l'utente:

- **`ingredients.yaml`**: un ingrediente per prodotto generico, ricavato dalle 243 righe
  d'origine, con nome italiano e inglese britannico (courgette, aubergine, coriander),
  sinonimi utili alla ricerca, reparto e dispensa (olio, sale, pepe, spezie comuni:
  dispensa). Si parte dalla classificazione dimostrativa del prototipo
  (`prototype/scripts/demo-ingredients.json`), che però ha un ingrediente per nome di
  riga: qui si riduce al prodotto generico.
- **`ingredient-lines.yaml`**: la mappatura di ogni nome di riga.
- **`translations.en-GB.yaml`**: si parte da `prototype/scripts/demo-translations.en-GB.json`,
  ricontrollando nomi e descrizioni contro le righe vere (nessun ingrediente aggiunto o
  tolto rispetto all'italiano).
- **`unit-equivalences.yaml`**: dalle equivalenze del prototipo, solo quelle di ambito
  `recipe` con fonte verificata.
- **Revisione**: l'utente legge `review.html`, indica le correzioni, l'agente le
  applica; l'approvazione è la riga con data e impronta in testa a ogni file (decisa
  l'11 ottobre 2026, legata al contenuto dopo la review).
  Righe senza mappatura o traduzione lasciano la ricetta in bozza.

## 6. Struttura dei file

```
domain/src/recipe/
  localized.ts        DraftTranslated, schema dei testi di bozza, filled (tipi completi da W4)
  document.ts         recipeDraftSchema, publishedRecipeSchema, tipi, limiti
  ingredient.ts       ingrediente del catalogo (schema, tipo)
  variety.ts          cleanVariety, lineKey, consigli (varietyKey da W4)
  issues.ts           IssueCode, ValidationIssue, missingData, conversione degli errori zod
  clean.ts            cleanDraft (spazi dei testi e della varietà)
  check.ts            checkDraft, checkPublishable, toPublished
  projection.ts       projectRecipe, projectDraftNames, toPlannerRecipe, resolveReferences
  test-fixtures.ts    documenti d'esempio dei test
  index.ts
scripts/import/
  recipe-attributes.yaml  ingredients.yaml  ingredient-lines.yaml
  translations.en-GB.yaml  unit-equivalences.yaml
  inputs.ts           lettura e validazione dei YAML, approvazione con impronta
  approve.ts          scrive la riga d'approvazione (solo su indicazione dell'utente)
  quantity.ts         parser delle quantità d'origine
  recipes.ts          scheda d'origine → documento
  family.ts           voti, pasti, triedUndated
  bundle.ts           pacchetto e rilancio
  test-fixtures.ts    schede e ingressi d'esempio dei test
  report.ts           report delle ambiguità
  review-page.ts      pagina di revisione
  import-recipes.ts   comando
```

`scripts/planner-data/` si riusa così com'è (`origin.ts`, `attributes.ts`); se serve
adattarlo, senza cambiare il comportamento di `planner-report`.

## 7. Test

- **Schema e controlli**: per ogni codice almeno un caso; bozza che accetta dati
  incompleti e rifiuta dati sbagliati; pubblicazione per ogni tipo di fonte; campi non
  pertinenti; `us_cup`; varietà e preparazione in una sola lingua; righe duplicate con
  varietà normalizzata, solo inglesi e in lingue miste; righe irrisolte; percorsi degli
  esiti; invariante «nessun problema di pubblicazione ⇒ `toPublished` riesce».
- **Proiezioni**: colonne e righe da un documento d'esempio; `variety_key`;
  `toPlannerRecipe` confrontato con quanto produce oggi `scripts/planner-data` per le
  stesse ricette.
- **Import** su piccole fixture: casa con URL, provate senza storico, storico `false`,
  `null` prima e dopo `--today`, giorno non riconosciuto, settimana inesistente o non di
  lunedì, `--today` non valido, rilancio con `--existing` (anche dal comando, con una
  scheda già importata modificata e una nuova valida), nome di riga senza mappatura con
  il percorso completo import → JSON → bozza → `checkPublishable`, traduzione mancante,
  tazza con e senza equivalenza e con preparazione diversa, file senza approvazione o
  modificato dopo l'approvazione, quantità «145 g crudo (330 g cotto)».
- **Dati reali**: un test legge l'origine vera (saltato se assente: l'import si esegue in
  `beforeAll`, così la CI senza origine salta la suite senza errori) e verifica che il
  pacchetto sia valido, che ogni ricetta in bozza abbia almeno un problema nel report e
  che nessuna riga d'origine resti senza mappatura una volta completati i YAML.
- Typecheck di `domain/` senza Node, come oggi.

## Decisioni da riportare nella specifica

### Prodotto

| Decisione | Sezioni |
|---|---|
| Campi bilingui come oggetti `{it-IT, en-GB}` nel documento e colonne jsonb nel database per ricette, ingredienti e righe, al posto delle tabelle `*_translations` (scelta dall'utente l'11 ottobre 2026, opzione B) | 2, 12, 15 (voce «Lingue») |
| Attributi del pianificatore obbligatori per pubblicare, tranne `seasons` e ingrediente principale; supera la scelta del quinto giro sul gruppo alimentare facoltativo (utente, 11 ottobre 2026) | 8, 2 |
| Preparazione della riga facoltativa, ma se presente obbligatoria nelle due lingue per pubblicare, come la varietà (utente, 11 ottobre 2026) | 8, 12 |
| Campi della fonte non pertinenti al tipo vuoti per pubblicare | 8 |
| Testo della fonte obbligatorio su ogni riga per pubblicare; contiene la riga com'è scritta, anche dopo una conversione da tazze USA | 8 |
| R4a: ricette provate senza storico registrate come `triedUndated` nel pacchetto e nel report, senza pasti inventati (utente, 11 ottobre 2026); nel database nella tabella `family_tried_recipes` di W2 con `source: 'import'`; per ora il pianificatore non lo usa (coordinatore, 11 ottobre 2026) | 2, 11, 15 («Importazione»), 17 R4 |
| R4b: ricette `casa` con URL importate come `web` con l'URL, tipo d'origine conservato nell'identità d'origine, adattamenti della famiglia nel report (utente, 11 ottobre 2026) | 11, 15, 17 R4 |
| R4c: storico `cucinata: false` non importato; `null` in settimane concluse alla data dell'import importato come mangiato e segnalato; `null` in settimane non concluse non importato; giorni o pasti non riconosciuti e settimane non valide (data inesistente o non di lunedì) scartati e segnalati (utente, 11 ottobre 2026; settimane dopo la review) | 11, 15, 3 |
| Traduzioni en-GB dell'import preparate dall'agente in YAML versionati, riviste dall'utente su una pagina generata, approvate con una riga in testa a ogni file con data e impronta del contenuto; una modifica successiva richiede una nuova revisione; senza approvazione valida non si pubblica (utente e coordinatore, 11 ottobre 2026) | 12, 15 («Lingue»), 8 |
| Tag d'origine non importati: li sostituiscono gli attributi del pianificatore | 2, 11 |
| Ingredienti di dispensa esclusi nell'origine non aggiunti dall'import, segnalati nel report | 8, 11 |
| Righe dello stesso ingrediente e varietà dopo la mappatura non unite dall'import: restano entrambe e la ricetta resta in bozza | 8, 11 |
| Una bozza può contenere righe duplicate e righe senza ingrediente del catalogo (righe irrisolte, con il testo della fonte): sono problemi di pubblicazione, non errori di salvataggio; righe con varietà solo in inglese non si confrontano | 8 |
| Un'equivalenza di unità può avere una preparazione facoltativa e si applica solo alle righe con la stessa preparazione o se non ne ha (coordinatore, 11 ottobre 2026) | 6 |

### Tecniche

| Decisione | Sezioni |
|---|---|
| Documento ricetta v1 (`schemaVersion`), campi della fonte piatti, metadati fuori dal documento; schema zod strutturale più controlli a codici con percorsi | 2, 8 |
| Codici degli esiti di validazione (tabella in sezione 2 di questa spec) | 1 (errori a codici), 8 |
| Colonne di proiezione e identità d'origine (`origin_slug`, `origin_type`) su `recipes`; colonne di `recipe_ingredients` con `position`, `variety_key`, `quantity_kind`, `quantity_text` | 2 |
| Per una ricetta in bozza nuova `name` e `description` di `recipes` si riempiono dal documento della bozza (import e ogni salvataggio); le altre colonne di proiezione restano vuote fino alla pubblicazione | 2, 8 |
| Quantità e codici delle unità concordati con W4; `us_cup` solo in bozza; equivalenze di ambito `recipe` applicate in gestione o import | 6 |
| Proprietà dei tipi: W4 possiede `Translated`, `LOCALES`, quantità completa, codici e schemi delle unità; W3 le varianti di bozza costruite sopra | 1, 2 |
| `ingredientId` nullabile nel livello bozza (riga irrisolta); `toPublished` normalizza i campi assenti | 2, 8 |
| Import: pacchetto JSON, report e pagina di revisione in `scripts/import/out/`; `--existing` per il rilancio, applicato prima delle validazioni sul contenuto delle schede; nessuna scrittura sul database; pubblicazione bloccata da `pendingReview` | 8, 11 |
