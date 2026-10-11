# Gestione del ricettario tramite MCP: spec di dettaglio

Creata: 11 ottobre 2026 · Attività W3 dell'ondata 2 · Branch `traguardo/ricettario-mcp`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 2, 8, 12, 13,
15 e 16) e alle «Interfacce decise» del piano generale. Le scelte nuove sono nella sezione
finale «Decisioni da riportare nella specifica».

## Obiettivo

Nuova area `catalogue`: operazioni del contratto, gestori nel server, strumenti MCP derivati
e, dopo il cancello del web, le sezioni dell'app che mostrano le bozze ai curatori.

- **Bozze:** creare una ricetta nuova o una revisione di una pubblicata (anche archiviata),
  salvarla incompleta, riprenderla in un'altra sessione, scartarla.
- **Problemi di completezza** a codici e percorsi (`ValidationIssue` di W3), sia al
  salvataggio (solo i bloccanti) sia in un controllo senza pubblicare.
- **Conflitti** fra curatori sulla bozza, sulla versione pubblicata e sugli ingredienti.
- **Pubblicazione** di una versione nuova immutabile (R1), atomica, con le conversioni
  delle tazze USA tramite le equivalenze di ambito ricetta.
- **Archiviazione e ritorno nel ricettario**, **versioni** e **ripristino** della singola
  ricetta.
- **Ingredienti** (ricerca con varietà, creazione, modifica, varietà, consigli),
  **equivalenze di ambito ricetta** e **libri**, quanto serve per pubblicare.
- **Guida per l'agente** servita dal servizio (`catalogue.getGuide`).

**Fuori perimetro (ondata 3):** modulo manuale e modifica web delle bozze; archiviazione dal
menu «…» della scheda, «Versioni» e «Ripristina» nel web; avviso della versione R1 per i
curatori sulla scheda; ripristino dell'intero catalogo; archiviazione degli ingredienti;
equivalenze di ambito `shopping`. Nel traguardo A queste azioni, quando sono nel perimetro,
si fanno via MCP.

## Decisioni del brainstorming

Prese con il coordinatore l'11 ottobre 2026 (la 5 dall'utente):

1. **Web nel traguardo A (opzione A):** i componenti web dell'area sono di W3: sezione
   «Bozze» a schede solo per i curatori in testa al ricettario, «Archiviate» chiusa in fondo
   con «Riporta nel ricettario», pagina della bozza in sola lettura. Il montaggio in
   `RecipesPage` (W6) lo fa W3 come registrazione dell'area, con una modifica minima.
2. **«Elimina» una bozza nuova = chiusura `discarded`:** il database vieta la cancellazione
   fisica (review di W2); il vincolo «nessun pasto la cita» passa da una funzione
   `security definer` nuova, perché un curatore non vede i pasti delle altre famiglie.
3. **Ingredienti (opzione A):** creazione e modifica a stato assoluto con la versione di
   partenza e conflitto; equivalenze solo di ambito `recipe` con `source` obbligatoria e
   non vuota, `preparation` facoltativa, unicità per (ingrediente, ambito, dimensione
   dell'unità di partenza, preparazione); ogni scrittura su un ingrediente o sulle sue
   equivalenze scrive `ingredient_versions`. Niente archiviazione degli ingredienti né
   equivalenze di spesa.
4. **Equivalenze nelle ricette (opzione A):** la bozza resta com'è scritta (anche in
   `us_cup`); controllo e pubblicazione applicano le equivalenze di ambito ricetta con
   `findEquivalence` e `applyRecipeEquivalence` di W4 (gli stessi dell'import) prima di
   `checkPublishable`; il controllo restituisce le conversioni fatte; il documento
   pubblicato contiene la quantità convertita e il `sourceText` originale.
5. **Conferma del curatore e traduzioni via MCP (opzione C, scelta dell'utente):** solo
   le istruzioni della guida (mostrare la scheda completa con le traduzioni e pubblicare
   dopo un sì esplicito). `catalogue.publish` pubblica l'ultima revisione della bozza,
   senza vincolo sulla revisione controllata e senza flag sulle traduzioni. Restano la
   conferma esplicita per pubblicare da una versione superata e i conflitti.
6. **Conflitti (opzione A):** errore `conflict` con un discriminante (`draft`, `version`,
   `ingredient`); la sovrascrittura cita la revisione che sovrascrive; ripetizioni
   idempotenti.
7. **Approccio 1:** logica nel Worker, dentro la transazione della pipeline, con il dominio
   di W3 e di W4; nel database solo la funzione per le citazioni.
8. **Codice d'errore nuovo `not_allowed` (409)** con `reason` per le regole di stato.
9. **Scelte minori:** una revisione di una ricetta archiviata, pubblicata, resta archiviata
   (si riporta nel ricettario con `setArchived`); le varietà già usate si leggono dalle
   ricette pubblicate (`recipe_ingredients`), non dalle bozze.

## 1. Interfacce

### Uso da altre attività (su `main`)

| Da | Cosa | Uso |
|---|---|---|
| W3 dominio (`@app/domain/recipe`) | `recipeDraftSchema`, `RecipeDraftDocument`, `RecipeDocument`, `cleanDraft`, `checkDraft`, `checkPublishable`, `toPublished`, `blocksDraft`, `missingData`, `MissingData`, `ValidationIssue`, `CatalogueLookup`, `projectRecipe`, `projectDraftNames`, `varietyHints`, `cleanVariety`, `catalogueIngredientSchema`, `emptyDraft` | salvataggio, controlli, proiezioni, consigli |
| W4 unità (`@app/domain/units`, `@app/domain/shopping`) | `findEquivalence`, `applyRecipeEquivalence`, `unitEquivalenceSchema`, `UnitEquivalence`, `preparationKey`, `UNIT_CODES`, `DRAFT_ONLY_UNITS`, `DEPARTMENTS`, `quantitySchema`, `Amount`, `varietyKey` | conversioni, equivalenze, ingredienti |
| Piattaforma | `op`, `versionedInput`, `versionedOutput`, `errorDefinitions`, `checkContract`, `Implementer`, `fresh`, `appError`, `withInvalidOn`, `server/src/messages.ts`, `collectTools` (MCP dal contratto), `OperationContext.channel` | contratto, pipeline, MCP |
| W2 schema | tabelle del catalogo, RLS dei curatori, `app.has_role`, `app.catalogue_author_names()`, trigger dei contatori, trigger `check_meal_slot_recipe` | dati e permessi |
| W2 (`server/src/family/views.ts`) | `foldText` | ricerca degli ingredienti; interfaccia registrata, senza modificarla |
| W6 (`server/src/recipes/views.ts`) | `ingredientLinesView`, `loadIngredientNamesById(tx, ids)`, `loadBookTitlesById(tx, ids)` | righe delle versioni e nomi; le due funzioni di caricamento diventano interfaccia registrata, **senza modificarle** |
| W6 (web) | `RecipesPage` (punto di montaggio), `IngredientList` (versioni), componenti di `design/` | sezioni del ricettario |
| W5 (#17, unita) | client oRPC reale, `SERVER_AREAS` e `realClients` (`web/src/api/types.ts`, `clients.ts`), `useT()`, `isBlocking`, `CONTRACT_ERROR_CODES` e dizionari degli errori | web |
| W2 (#18) | `profile.get` con `globalRoles` nel web (passaggio da `me.get`) | sezioni solo per i curatori |
| W6 (#19) | `RecipesPage` sui dati veri, con `FamilyGate` attorno alla consultazione familiare | punto di montaggio |

### Prodotto per altre attività

- **Per W6:** due componenti montati in `RecipesPage` **fuori da `FamilyGate`**, perché il
  ruolo di curatore non dipende dalla famiglia: un curatore senza famiglia vede bozze e
  archiviate accanto all'avviso «nessuna famiglia». Ciascuno si nasconde da sé se l'utente
  non è curatore o se il server rifiuta la lettura:

  ```tsx
  export function RecipesPage() {
    return (
      <>
        <CatalogueDraftsSection />   {/* in testa, prima della consultazione */}
        <FamilyGate>{(family) => <RecipesView family={family} />}</FamilyGate>
        <ArchivedRecipesSection />   {/* in fondo */}
      </>
    );
  }
  ```

  Modifica di W3 in `web/src/routes/RecipesPage.tsx` limitata agli import e al corpo di
  `RecipesPage` qui sopra; `RecipesView` resta di W6 e non cambia. Le PR si uniscono in
  sequenza (punto di contatto con W6, dopo la #19).
- **Per la «Messa in produzione»:** modulo di scrittura riusabile senza la pipeline,
  `server/src/catalogue/write.ts`, con il canale esplicito (l'import usa `'import'`):

  ```ts
  // Firme definitive (registrate dal coordinatore). Tipi propri del modulo, distinti
  // dagli input del contratto: i gestori HTTP e MCP li adattano.
  export type Channel = 'web' | 'mcp' | 'import';
  export interface Actor { userId: string; channel: Channel }

  export interface CreateDraftInput {
  	draftId: string;                       // uuid stabile della creazione
  	content: RecipeDraftDocument;          // con id del catalogo (resolveReferences già applicato)
  	originSlug?: string | null;            // import: identità nell'origine, unica
  	originType?: string | null;
  }
  export interface CreatedDraft { draftId: string; recipeId: string; created: boolean }
  export interface SaveDraftInput { draftId: string; baseRevision: number; content: RecipeDraftDocument; overwriteRevision?: number }
  export interface SavedDraft { draftId: string; revision: number }
  export interface PublishInput { draftId: string; confirmVersion?: number }
  export interface Published { recipeId: string; version: number; publishedAt: Date; conversions: Conversion[] }
  export interface CreateIngredientInput {
  	ingredientId: string;                  // uuid stabile della creazione
  	slug?: string;                         // import: lo slug del pacchetto, conservato com'è
  	name: { 'it-IT': string; 'en-GB': string | null };
  	department: Department;
  	isPantry: boolean;
  	synonyms?: { 'it-IT': string[]; 'en-GB': string[] };
  }
  export interface CreatedIngredient { ingredientId: string; slug: string; created: boolean }
  export interface CreateBookInput { bookId: string; slug?: string; title: string }
  export interface CreatedBook { bookId: string; slug: string; title: string; created: boolean }

  export function createDraft(tx: Tx, actor: Actor, input: CreateDraftInput): Promise<CreatedDraft>;
  export function saveDraft(tx: Tx, actor: Actor, input: SaveDraftInput): Promise<SavedDraft>;
  export function publishDraft(tx: Tx, actor: Actor, input: PublishInput): Promise<Published>;
  export function createIngredient(tx: Tx, actor: Actor, input: CreateIngredientInput): Promise<CreatedIngredient>;
  export function createBook(tx: Tx, actor: Actor, input: CreateBookInput): Promise<CreatedBook>;
  ```

  **Identità per l'import:** uno `slug` passato si conserva com'è (per esempio
  `olio-extravergine-di-oliva` per «Olio extravergine d'oliva», da cui `slugify` darebbe
  un altro slug); se esiste già un ingrediente o un libro con quello slug, la funzione
  restituisce quello (`created: false`) senza scrivere, così un import ripetuto ritrova le
  entità e costruisce la `ReferenceLookup` di `resolveReferences` dalle risposte. Allo
  stesso modo `createDraft` con un `originSlug` già presente restituisce la ricetta
  esistente e la sua ultima bozza (`created: false`). Senza `slug` lo si ricava dal nome
  con un suffisso numerico se occupato. Lo stesso uuid ripetuto restituisce sempre
  l'entità già creata.

  Le funzioni lanciano gli stessi `appError` dei gestori; i gestori sono sottili attorno
  a esse. L'istante delle scritture lo prende il database (sezione 3, «Istante della
  pubblicazione»), quindi `Actor` non porta un orologio.
- **File condivisi toccati in modo minimo:**
  - **PR del server:** `contract/src/errors.ts` (`conflictData`, `not_allowed`),
    `contract/src/contract.ts` e `server/src/router.ts` (registrazione),
    `server/src/messages.ts` (testi MCP di `not_allowed` e del conflitto),
    `supabase/tests/coverage_test.sql` (elenco delle funzioni di `authenticated`) e, per
    la compatibilità del web con il nuovo codice d'errore, `web/src/api/errors.ts`
    (`CONTRACT_ERROR_CODES`) e `web/src/i18n/messages/errors.ts` (`errors.not_allowed`
    nelle due lingue);
  - **PR del web:** `SERVER_AREAS` in `web/src/api/types.ts`, client finto dell'area,
    rotte e `RecipesPage` (registrazione).

## 2. Contratto (`contract/src/catalogue/`)

Tutte le operazioni: `role: 'curator'`, `offline: false`, `mcp` presente (`readOnly`
secondo il tipo). Nessuna ha `familyId`: il ricettario è globale. Le rotte REST stanno
sotto `/catalogue/...`. Le creazioni hanno `creates: true` e un `id` uuid generato dal
client (`checkContract`).

**Letture versionate** (`reads: ['catalogue']`, input con `knownVersion`):
`searchRecipes`, `listVersions`, `getVersion`, `searchIngredients`, `getIngredient`,
`listVarieties`, `listBooks`. Dipendono
solo da ricette non in bozza, ingredienti, equivalenze e libri, che fanno crescere
`catalogue_state`.
**Letture non versionate:** `getGuide` (testo statico), `overview`, `getDraft`,
`checkDraft`, `checkVariety`: le bozze non toccano il contatore del ricettario (sezione 1
della specifica), quindi si leggono sempre fresche.

### Viste comuni

```ts
const draftDocument = recipeDraftSchema;            // W3, struttura della bozza
const issue = z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() });
const author = z.object({ userId: z.uuid().nullable(), name: z.string().nullable() }); // null: ex utente

const conversionView = z.object({                    // una riga in us_cup convertita
	line: z.number().int().min(0),
	from: quantitySchema,                             // W4, la quantità della bozza
	to: quantitySchema,                               // W4, sempre kind 'amount' (la quantità pubblicata)
	equivalence: z.object({ id: z.uuid(), factor: z.number(), source: z.string(), preparation: z.string().nullable() }),
});

const draftSummaryView = z.object({
	draftId: z.uuid(), recipeId: z.uuid(), kind: z.enum(['new', 'revision']),
	name: z.string(),                                 // lingua dell'utente, altrimenti l'altra
	createdBy: author, updatedBy: author, updatedAt: z.iso.datetime(),
	missing: z.array(z.enum(MISSING_DATA)),           // missingData(checkPublishable(...)) dopo le conversioni
});

const archivedSummaryView = z.object({
	recipeId: z.uuid(), name: z.string(), archivedBy: author, archivedAt: z.iso.datetime(),
});

const draftView = z.object({
	draftId: z.uuid(), recipeId: z.uuid(), kind: z.enum(['new', 'revision']),
	revision: z.number().int().min(1),
	content: draftDocument,
	createdBy: author, createdAt: z.iso.datetime(), updatedBy: author, updatedAt: z.iso.datetime(),
	baseVersion: z.number().int().min(1).nullable(),   // revisione: versione da cui parte
	currentVersion: z.number().int().min(0),           // versione pubblicata ora (0 se mai)
	recipeStatus: z.enum(['draft', 'published', 'archived']),
	issues: z.array(issue),                            // problemi di pubblicazione dopo le conversioni
	missing: z.array(z.enum(MISSING_DATA)),
	conversions: z.array(conversionView),
	outcome: z.enum(['published', 'discarded']).nullable(), // bozza chiusa: come; null se aperta
	canDiscard: z.boolean(),                           // aperta e revisione, oppure nuova non citata
	ingredientNames: z.record(z.uuid(), z.string()),   // ingredienti citati, lingua dell'utente
	bookTitle: z.string().nullable(),
});
```

`draftView.issues` sono quelle di `checkPublishable` sul documento convertito, con lo
stesso percorso del documento della bozza: una riga in tazze senza equivalenza resta
`unit_not_publishable` su `['ingredients', i, 'quantity', 'unit']`.

### Operazioni

| Operazione | Metodo e rotta | Input | Output | Errori |
|---|---|---|---|---|
| `getGuide` | GET `/catalogue/guide` | `{}` | `{ guide: string }` (Markdown in inglese) | |
| `overview` | GET `/catalogue/overview` | `{}` | `{ drafts: draftSummaryView[]; archived: archivedSummaryView[] }` | |
| `getDraft` | GET `/catalogue/drafts/{draftId}` | `{ draftId }` | `draftView` | `not_found` |
| `createDraft` | POST `/catalogue/drafts` | `{ id: uuid; content: draftDocument }` | `draftView` | `invalid` |
| `startRevision` | POST `/catalogue/recipes/{recipeId}/revision` | `{ recipeId; id: uuid }` | `draftView` | `not_found`, `not_allowed` (`not_published`) |
| `saveDraft` | PUT `/catalogue/drafts/{draftId}` | `{ draftId; baseRevision: int ≥ 1; content: draftDocument; overwriteRevision?: int ≥ 1 }` | `draftView` | `not_found`, `invalid`, `conflict` (`draft`) |
| `checkDraft` | GET `/catalogue/drafts/{draftId}/check` | `{ draftId }` | `{ revision; issues; missing; conversions }` | `not_found` |
| `publish` | POST `/catalogue/drafts/{draftId}/publish` | `{ draftId; confirmVersion?: int ≥ 1 }` | `{ recipeId; version; conversions }` | `not_found`, `invalid`, `conflict` (`version`) |
| `discardDraft` | POST `/catalogue/drafts/{draftId}/discard` | `{ draftId }` | `{ draftId; recipeId; kind }` | `not_found`, `not_allowed` (`cited_by_meals`) |
| `searchRecipes` | GET `/catalogue/recipes` | `versionedInput({ text?: string ≤ 60; status?: 'published' \| 'archived' \| 'any' })` | `versionedOutput({ items: { recipeId; name; status: 'published' \| 'archived'; version; updatedAt }[] })` | |
| `setArchived` | PUT `/catalogue/recipes/{recipeId}/archived` | `{ recipeId; archived: boolean }` | `{ recipeId; status: 'published' \| 'archived'; changedBy: author; changedAt }` | `not_found`, `not_allowed` (`not_published`) |
| `listVersions` | GET `/catalogue/recipes/{recipeId}/versions` | `versionedInput({ recipeId })` | `versionedOutput({ recipeId; name; status; current; versions: { version; publishedBy: author; publishedAt; channel; restoredFrom: int \| null }[] })` | `not_found` |
| `getVersion` | GET `/catalogue/recipes/{recipeId}/versions/{version}` | `versionedInput({ recipeId; version })` | `versionedOutput({ recipeId; version; current; publishedBy; publishedAt; restoredFrom; content: RecipeDocument; summary: recipeSummaryView; ingredients: ingredientLineView[]; issues })` | `not_found` |
| `restoreVersion` | POST `/catalogue/recipes/{recipeId}/versions/{version}/restore` | `{ recipeId; version; confirmVersion: int ≥ 1 }` | `{ recipeId; version; restoredFrom }` | `not_found`, `invalid`, `conflict` (`version`), `not_allowed` (`already_current`) |
| `searchIngredients` | GET `/catalogue/ingredients` | `versionedInput({ text: string 2..60 })` | `versionedOutput({ items: { ingredientId; name; department; isPantry; variety: Localized \| null; matched: 'name' \| 'synonym' \| 'variety' }[] })` | |
| `getIngredient` | GET `/catalogue/ingredients/{ingredientId}` | `versionedInput({ ingredientId })` | `versionedOutput(ingredientView)` | `not_found` |
| `listVarieties` | GET `/catalogue/ingredients/{ingredientId}/varieties` | `versionedInput({ ingredientId })` | `versionedOutput({ varieties: { variety: Localized; uses: int }[] })` | `not_found` |
| `checkVariety` | GET `/catalogue/ingredients/{ingredientId}/variety-check` | `{ ingredientId; text: string ≤ 40; locale: 'it-IT' \| 'en-GB' }` | `{ hints: VarietyHint[] }` | `not_found` |
| `createIngredient` | POST `/catalogue/ingredients` | `{ id: uuid; name: { it-IT: string; en-GB: string \| null }; department; isPantry?: boolean; synonyms?: { it-IT: string[]; en-GB: string[] } }` | `ingredientView` | `invalid` |
| `updateIngredient` | PUT `/catalogue/ingredients/{ingredientId}` | `{ ingredientId; baseVersion: int ≥ 1; name; synonyms; department; isPantry }` | `ingredientView` | `not_found`, `invalid`, `conflict` (`ingredient`) |
| `setEquivalence` | PUT `/catalogue/ingredients/{ingredientId}/equivalences` | `{ ingredientId; fromUnit; toUnit; factor > 0; preparation?: string \| null; source: string }` | `ingredientView` | `not_found`, `invalid` |
| `removeEquivalence` | DELETE `/catalogue/ingredients/{ingredientId}/equivalences/{equivalenceId}` | `{ ingredientId; equivalenceId }` | `ingredientView` | `not_found` (solo ingrediente inesistente) |
| `listBooks` | GET `/catalogue/books` | `versionedInput({})` | `versionedOutput({ books: { bookId; slug; title; archived: boolean }[] })` | |
| `createBook` | POST `/catalogue/books` | `{ id: uuid; title: string 1..200 }` | `{ bookId; slug; title }` | `invalid` |

`searchRecipes` è la ricerca globale del curatore, senza `familyId` e senza libri
posseduti: ricette pubblicate e archiviate (mai le bozze, che stanno in `overview`), per
nome e descrizione nella lingua dell'utente con `foldText` (testo vuoto: tutte), ordinate
per nome, al massimo 50. È il primo passo di un agente che deve rivedere, archiviare o
ripristinare una ricetta in una conversazione nuova: `searchRecipes` → `listVersions` o
`getVersion` → `startRevision`, `setArchived` o `restoreVersion`. Non dice se c'è una
revisione aperta (le bozze non fanno crescere il contatore del ricettario e la lettura è
versionata): `startRevision` la restituisce comunque.

`ingredientView`: `{ ingredientId; slug; name: Localized (en-GB può essere ''); synonyms;
department; isPantry; version; equivalences: { id; fromUnit; toUnit; factor; preparation;
source }[] }` (solo ambito `recipe`). È ciò che `getIngredient` restituisce: un agente in
una conversazione nuova cerca l'ingrediente, lo legge con versione, sinonimi ed
equivalenze (con i loro id) e solo allora lo modifica, senza perdere dati.

Un ingrediente nuovo può nascere senza nome inglese, come nel prototipo: lo segnala la
pubblicazione della ricetta (`ingredientHasEnglishName`) e si corregge con
`updateIngredient`. Nel database il nome mancante è la stringa vuota, ammessa da
`app.is_localized_text`; per questo la vista usa un testo semplice e non
`localizedSchema` di W4, che chiede entrambe le lingue non vuote.

### Errori (`contract/src/errors.ts`)

`conflictData` diventa un'unione con discriminante (nessun'altra attività lo usa):

```ts
export const conflictData = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('draft'), revision: z.number().int(), by: z.uuid().nullable(), byName: z.string().nullable(),
		at: z.iso.datetime(), theirFields: z.array(z.string()), myFields: z.array(z.string()), theirs: z.record(z.string(), z.unknown()) }),
	z.object({ kind: z.literal('version'), version: z.number().int(), by: z.uuid().nullable(), byName: z.string().nullable(),
		at: z.iso.datetime() }),
	z.object({ kind: z.literal('ingredient'), version: z.number().int(), by: z.uuid().nullable(), byName: z.string().nullable(),
		at: z.iso.datetime(), fields: z.array(z.string()) }),
]);
```

`theirs` è il documento della bozza (forma di `recipeDraftSchema`; tipizzato come record
per non far dipendere `errors.ts` dal dominio della ricetta). I campi sono le chiavi del
documento (`name`, `sourceUrl`, `ingredients`…) che differiscono fra la revisione di
partenza e l'ultima (`theirFields`) e fra la revisione di partenza e il contenuto inviato
(`myFields`), come `changedFields` del prototipo.

Nuovo codice `not_allowed` (409) con `notAllowedData = z.object({ reason:
z.enum(['cited_by_meals', 'not_published', 'already_current']) })`, aggiunto a
`errorCodes`, `errorDefinitions` e `server/src/messages.ts` (testi nelle due lingue).

## 3. Server (`server/src/catalogue/`)

| File | Contenuto |
|---|---|
| `router.ts` | `catalogueRouter(os: Implementer)`: gestori sottili |
| `write.ts` | scritture riusabili (sezione 1), `Actor`, `lockCreations`, `writeInstant` |
| `recipe-writes.ts` | proiezioni, righe e versione di una pubblicazione o di un ripristino |
| `check.ts` | controllo di pubblicazione dopo le conversioni (`publicationCheck`) |
| `ingredients.ts` | ingredienti, equivalenze, storico, ricerca, varietà, libri |
| `load.ts` | caricamento di bozza (con `for update`), ricetta, ingredienti citati, equivalenze, `CatalogueLookup` |
| `convert.ts` | `applyRecipeConversions(document, equivalencesByIngredient)` → `{ document, conversions }`, puro |
| `views.ts` | `draftView`, `overview`, versioni, ingredienti, libri |
| `guide.ts` | testo della guida |
| `slug.ts` | slug unici di ricette, ingredienti e libri |

### Regole comuni

- Ogni gestore lavora nella transazione della pipeline, nel ruolo dell'utente, sotto le
  RLS dei curatori. La revoca del ruolo vale subito (`checkRole` e RLS a ogni richiesta).
- Il canale (`web`/`mcp`) viene da `context.channel` e si scrive in
  `recipe_draft_saves.channel`, `recipe_versions.channel`, `recipe_status_changes.channel`,
  `ingredient_versions.channel`.
- **Lookup per i controlli:** ingredienti e libri citati dal documento caricati in blocco
  (`hasIngredient`: esiste e non è archiviato; `ingredientHasEnglishName`: nome `en-GB`
  non vuoto; `hasBook`: esiste e non è archiviato).
- **Conversioni** (`convert.ts`): per ogni riga con `quantity.kind = 'amount'`,
  `unit = 'us_cup'`, `value` non nullo e `ingredientId` noto, `findEquivalence(eqs,
  'recipe', 'us_cup', preparation?.['it-IT'])`; se c'è, la riga riceve
  `applyRecipeEquivalence` e la conversione si registra. La bozza salvata non cambia.
- **Nomi degli autori** con `app.catalogue_author_names()`.
- **Concorrenza:** la bozza si legge `for update` in `saveDraft`, `publish`,
  `discardDraft`; la ricetta `for update` in `publish`, `setArchived`, `restoreVersion`,
  `startRevision`; l'ingrediente `for update` nelle sue scritture. Due richieste
  concorrenti si serializzano e la seconda vede lo stato della prima.
- **Creazioni atomiche** (`createDraft`, `startRevision`, `createIngredient`,
  `createBook`): ogni creazione prende per prima cosa il lucchetto di transazione
  `pg_advisory_xact_lock(hashtext('app.catalogue_create'))`, poi cerca l'entità per uuid
  (e per `slug` o `originSlug` se passati), assegna lo slug e inserisce. Le creazioni del
  ricettario sono quindi serializzate fra loro (pochi curatori: il costo è trascurabile);
  la seconda di due richieste concorrenti con lo stesso uuid attende la prima e la trova
  già scritta (lettura nuova dopo il lucchetto, in `read committed`); due uuid diversi con
  lo stesso nome ricevono slug diversi. Nessuna violazione d'unicità arriva al client;
  una che arrivasse comunque resta `internal`, mai `invalid`.
- **Istante delle scritture:** ogni scrittura, dopo aver preso i lucchetti, legge
  `clock_timestamp()` una volta e lo usa per tutte le colonne di data che scrive
  (`published_at`, `closed_at`, `updated_at`, `saved_at`, `changed_at`, `archived_at`),
  non l'inizio della richiesta (`context.now`). Vedi «Istante della pubblicazione».

### Bozze

- **`createDraft`:** dopo il lucchetto delle creazioni, una bozza con lo stesso `id`
  (aperta o chiusa) → risposta con quella, senza scrivere (se il contenuto differisce vale
  comunque la bozza esistente: l'`id` identifica la creazione); con `originSlug` già
  presente → la ricetta esistente e la sua ultima bozza. Altrimenti `cleanDraft`, poi
  `checkDraft`; problemi bloccanti (`blocksDraft`) → `invalid`. Ricetta nuova in `recipes`
  (stato `draft`, versione 0, slug unico dal nome italiano o inglese, `name`/`description`
  da `projectDraftNames`), bozza `new` con `id` del client e `revision = 1`, prima riga in
  `recipe_draft_saves`.
- **`startRevision`**, in quest'ordine:
  1. lucchetto delle creazioni; una bozza con lo stesso `id` già esistente, **aperta o
     chiusa**, della stessa ricetta → risposta con quella (ripetizione dopo una risposta
     persa, anche se nel frattempo è stata pubblicata o scartata); di un'altra ricetta →
     `invalid` su `['id']`;
  2. ricetta `for update`; inesistente → `not_found`; in stato `draft` → `not_allowed`
     (`not_published`), anche se ha una bozza `new` aperta;
  3. una revisione aperta della ricetta (indice `recipe_drafts_one_open`) → risposta con
     quella (la si riprende, chiunque l'abbia aperta);
  4. altrimenti nuova revisione con l'`id` del client, `base_version = recipes.version` e
     il contenuto della versione corrente (`recipe_versions.content`).
- **`saveDraft`:** bozza aperta `for update` (chiusa: se l'ultimo salvataggio ha lo stesso
  contenuto si risponde con la vista, altrimenti `not_found`); `cleanDraft` e problemi
  bloccanti → `invalid`.
  1. **Ripetizione:** se il contenuto pulito è uguale (confronto canonico del JSON) a
     quello dell'ultima revisione, risposta con la vista e nessuna scrittura, qualunque
     sia `baseRevision`.
  2. **Conflitto:** se `baseRevision < revision` e `overwriteRevision !== revision` →
     `conflict` `draft` con l'ultima revisione, il suo autore e momento, `theirs`,
     `theirFields` (base → ultima) e `myFields` (base → inviato). La base si legge da
     `recipe_draft_saves`.
  3. **Salvataggio:** `revision + 1`, nuovo `content`, `updated_by/at`, riga in
     `recipe_draft_saves`; se c'era una sovrascrittura, le righe con revisione in
     (`baseRevision`, `overwriteRevision`] si marcano `overwritten = true`. Per una bozza
     `new` si aggiornano `recipes.name/description` (`projectDraftNames`): il trigger di W2
     fa crescere i contatori delle famiglie che la citano.
  `baseRevision > revision` → `invalid` su `['baseRevision']`.
- **`checkDraft`:** conversioni e `checkPublishable` sull'ultima revisione, senza scrivere.
- **`discardDraft`:** bozza aperta; `new` citata (`app.recipe_is_cited`) →
  `not_allowed` (`cited_by_meals`); altrimenti `closed_at/by`, `outcome = 'discarded'`. La
  ricetta di una bozza `new` resta in stato `draft`, senza bozza aperta: esce dalla
  panoramica e il trigger di W2 impedisce di collegarla a nuovi pasti. Ripetizione su una
  bozza già scartata: stessa risposta.

### Pubblicazione

`publish` su una bozza aperta (bozza e ricetta `for update`):

1. Conversioni e `checkPublishable` sull'ultima revisione; problemi → `invalid` con tutti
   i problemi.
2. **Versione superata** (solo `revision`): se `recipes.version ≠ base_version` e
   `confirmVersion ≠ recipes.version` → `conflict` `version` con versione corrente, autore
   e momento della sua pubblicazione.
3. `toPublished` sul documento convertito; `projectRecipe`; in un'unica transazione:
   - `recipes`: colonne di proiezione, `version + 1`, `status` (`draft` → `published`;
     `published` e `archived` restano), `updated_by/at`;
   - `recipe_ingredients`: righe cancellate e reinserite;
   - `recipe_versions`: `(recipe_id, version, content, published_by, published_at,
     channel)`, con `published_at` l'istante delle scritture (sotto);
   - `recipe_status_changes`: riga `published` solo alla prima pubblicazione;
   - bozza: `closed_at/by`, `outcome = 'published'`.
4. Ripetizione su una bozza già chiusa come `published`: risposta con la versione
   pubblicata dalla chiusura (quella con `published_at = closed_at` e `published_by =
   closed_by`), senza scrivere.

Un errore in qualunque passo annulla la transazione intera: nessuna ricetta parzialmente
pubblicata (sezione 8).

**Istante della pubblicazione (R1).** `app.recipe_version_at` sceglie la versione di un
pasto passato con `published_at <= istante del pasto`. Se `published_at` fosse l'inizio
della richiesta, una pubblicazione partita alle 15:29 e rimasta in attesa di un lucchetto
fino alle 15:31 risulterebbe in vigore per un pranzo già passato alle 15:30, cambiando a
posteriori la versione mangiata. Per questo `published_at` (e con lui `closed_at` della
bozza e `changed_at` della prima riga di stato, così la ripetizione riconosce la versione)
è `clock_timestamp()` letto **dopo tutte le attese**: dopo i lucchetti di bozza e
ricetta e dopo l'aggiornamento delle proiezioni e delle righe, che fa crescere
`catalogue_state` con il suo trigger e può attendere un'altra transazione che tiene quella
riga globale. Nell'ordine: lucchetti, `recipes` (proiezioni), `recipe_ingredients`,
istante, inserimento in `recipe_versions`, riga di stato, chiusura della bozza; queste
ultime tre scritture non toccano righe tenute da altri (`recipe_versions` e
`recipe_status_changes` non hanno trigger di contatore, la bozza è già bloccata). Resta
solo lo scarto fra l'istante e il commit, senza attese. Vale anche per `restoreVersion`.

### Archiviazione

`setArchived` a stato assoluto: ricetta `published` → `archived` (`archived_at/by`, riga in
`recipe_status_changes`), `archived` → `published` (campi azzerati, riga `published`);
stato già quello chiesto → risposta con lo stato e l'ultima modifica, nessuna scrittura;
ricetta `draft` → `not_allowed` (`not_published`). «Annulla» nel web e «Riporta nel
ricettario» sono la stessa operazione.

### Versioni e ripristino

- **`listVersions`, `getVersion`:** ricette `published` o `archived` (`draft` →
  `not_found`); `getVersion` legge il documento immutabile con `publishedRecipeSchema`,
  mostra le righe con `ingredientLinesView` alle porzioni di riferimento e nel sistema
  metrico, e i problemi di `checkPublishable` di oggi.
- **`restoreVersion`:** `version` = corrente → `not_allowed` (`already_current`);
  `confirmVersion ≠ recipes.version` → `conflict` `version` (il curatore conferma il
  ripristino guardando la versione corrente: niente ripristino su una ricetta cambiata nel
  frattempo); `checkPublishable` sul documento di allora con i lookup di oggi → `invalid`;
  altrimenti come la pubblicazione (punto 3) con `restored_from = version`, senza bozza.
  Una revisione aperta resta aperta e alla sua pubblicazione risulterà superata.
  Ripetizione: se la versione corrente ha `restored_from = version` ed è la successiva di
  `confirmVersion`, risposta con quella, senza scrivere.
- Il ripristino riporta solo campi e righe della ricetta, non ingredienti, nomi o reparti
  del catalogo (sezione 8).

### Ingredienti, equivalenze e libri

- **`searchIngredients`:** ingredienti non archiviati, nella lingua dell'utente, per nome,
  sinonimi (stessa lingua) e varietà già usate nelle ricette pubblicate; confronto con
  `foldText` di `server/src/family/views.ts` (W2, riuso senza modifiche, come la ricerca
  degli ingredienti della famiglia) per nomi e sinonimi e `varietyKey` di W4 per le
  varietà; al massimo 20 risultati, prima i nomi.
- **`listVarieties`:** varietà distinte per `variety_key` dalle righe pubblicate
  dell'ingrediente, con la grafia più usata e il numero di usi.
- **`checkVariety`:** `varietyHints` con nome dell'ingrediente e varietà note.
- **`getIngredient`:** la vista completa di un ingrediente non archiviato (versione,
  nomi, sinonimi, reparto, dispensa, equivalenze di ricetta con i loro id); inesistente o
  archiviato → `not_found`. È la lettura che precede `updateIngredient` e
  `removeEquivalence`.
- **`createIngredient`:** dopo il lucchetto delle creazioni: stesso uuid o stesso `slug`
  passato (import) → l'ingrediente esistente, senza scrivere. Altrimenti nome pulito con
  l'iniziale maiuscola (come il prototipo), slug passato com'è oppure unico dal nome
  italiano, reparto fra `DEPARTMENTS`, sinonimi ripuliti e senza doppioni; `version = 1` e
  riga 1 in `ingredient_versions`.
- **`updateIngredient`:** `baseVersion ≠ version` → `conflict` `ingredient` con autore e
  momento dell'ultima riga di `ingredient_versions` e i campi cambiati; contenuto uguale →
  nessuna scrittura; altrimenti `version + 1`, `updated_by/at` e nuova riga dello storico.
- **`setEquivalence`:** solo `scope = 'recipe'`; validazione con `unitEquivalenceSchema`
  (`source` non vuota, `factor > 0`, `preparation` normalizzata con `preparationKey`).
  Cerca l'equivalenza con la stessa chiave (ingrediente, ambito, dimensione di partenza,
  preparazione):
  - stessi `fromUnit`, `toUnit`, `factor` e `source` → **nessuna scrittura**: stessa vista,
    stesso id, stessa versione (ripetizione dopo una risposta persa);
  - esiste con altri valori → `update` sul posto di `to_unit`, `factor`, `source` (i
    permessi di W2 lo consentono): l'id resta; se cambia `fromUnit` nella stessa
    dimensione (per esempio `g` → `kg`), la riga si sostituisce;
  - non esiste → inserimento.

  Vincoli del database → `invalid` con `withInvalidOn`. Ogni scrittura effettiva:
  `ingredients.version + 1` e riga in `ingredient_versions`.
- **`removeEquivalence`:** ingrediente inesistente → `not_found`; equivalenza già assente
  (ripetizione dopo il successo) → stessa vista, nessuna scrittura e nessuna versione
  nuova; altrimenti cancellazione (solo ambito `recipe`) con la regola di versione.
- **Contenuto di `ingredient_versions`** (schema zod `ingredientVersionContent` in
  `server/src/catalogue/`): `{ slug, name, synonyms, department, isPantry, equivalences:
  { fromUnit, toUnit, factor, scope, preparation, source }[] }`, con tutte le equivalenze
  dell'ingrediente (anche di spesa). Serve al ripristino del catalogo dell'ondata 3.
- **`createBook`:** dopo il lucchetto delle creazioni, stesso uuid o stesso `slug` passato
  → il libro esistente; altrimenti titolo ripulito, slug passato o unico dal titolo.
  **`listBooks`:** tutti, con `archived`.

### Guida (`catalogue.getGuide`)

Markdown in inglese, statico nel server (`guide.ts`), in tre parti:

1. **Flusso:** cercare ingredienti e libri prima di crearli; per correggere un
   ingrediente leggerlo prima con `catalogue_getIngredient` e rimandare tutti i suoi dati
   con la sua versione; salvare spesso una bozza
   (`catalogue_createDraft`, `catalogue_saveDraft`); `catalogue_checkDraft` prima di
   proporre; mostrare al curatore la scheda completa con le traduzioni preparate e
   pubblicare (`catalogue_publish`) solo dopo un sì esplicito; in un `conflict` `draft`
   mostrare `theirs` e chiedere se prendere l'altra versione (rileggere la bozza) o
   sovrascriverla (`overwriteRevision`); in un `conflict` `version` chiedere conferma
   prima di ripetere con `confirmVersion`; ripristinare una versione solo dopo averla
   mostrata.
2. **Requisiti per pubblicare:** campi per tipo di fonte, attributi del pianificatore,
   due lingue, quantità, tazze USA convertite dalle equivalenze (con `source`).
3. **Istruzioni sugli ingredienti** del quinto giro (`prototype/src/lib/operations/
   curation-guide.ts`), con i nomi reali degli strumenti.

## 4. Migrazione e database

Una migrazione nuova, `supabase/migrations/20261011180000_catalogue_citations.sql`:

```sql
create function app.recipe_is_cited(p_recipe_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('recipe_curator') then
		raise exception 'curators only' using errcode = '42501';
	end if;
	return exists (select 1 from app.meal_slots where recipe_id = p_recipe_id);
end;
$$;
revoke execute on function app.recipe_is_cited(uuid) from public;
grant execute on function app.recipe_is_cited(uuid) to authenticated;
```

Nella stessa migrazione, `create or replace function app.catalogue_author_names()` con la
stessa firma e gli stessi permessi aggiunge agli autori `ingredient_versions.changed_by`,
così il conflitto `ingredient` e lo storico degli ingredienti mostrano il nome di chi ha
cambiato l'ingrediente. Nessun altro cambiamento della funzione.

Nessuna tabella né colonna nuova: le colonne e i permessi di W2 bastano (verificati nel
piano con i test del server). Se il piano trova un permesso mancante, lo dichiara al
coordinatore prima dell'implementazione.

Test pgTAP (`supabase/tests/catalogue_citations_test.sql`), sulle fixture condivise di
`supabase/tests/helpers/fixtures.psql` (gli helper `tests.recipe` e `tests.ingredient`
aggiungono da soli il prefisso `test-`):
- vero per `tests.recipe('new-draft')`, citata dalla cena di lunedì della famiglia
  `test-Rossi`, letto da `dario` (curatore, membro di nessuna famiglia);
- falso per `tests.recipe('old-minestrone')`, che nessun pasto cita;
- `42501` per `bruno` (membro, non curatore) e per `dario` dopo la revoca del ruolo,
  con le stesse credenziali;
- nessun `execute` per `public` e `anon`;
- `catalogue_author_names()` restituisce `gina` dopo una riga di `ingredient_versions`
  di `tests.ingredient('salt')` scritta da lei, a `dario`; nulla a `bruno`.

`supabase/tests/coverage_test.sql` confronta l'elenco completo delle funzioni eseguibili da
`authenticated`: la migrazione lo modifica aggiungendo `recipe_is_cited` all'elenco
ordinato (fra `meal_passed_at` e `recipe_version_at`).

## 5. Web (dopo il cancello)

**Cancello:** dopo il merge della #17 (W5, già unita), della #18 (W2, `profile.get` con
`globalRoles` al posto di `me.get`) della #19 (W6, ricettario sui dati veri, che cambia
`RecipesPage`) e della #21 (pagine di Profilo e famiglia), poi il via del coordinatore.

**Registrazione dell'area nel client:** `catalogue` entra in `SERVER_AREAS`
(`web/src/api/types.ts`), così `api.catalogue` è il client RPC del contratto in modalità
reale (`realClients` di `web/src/api/clients.ts`); il client finto implementa le stesse
operazioni con dati dimostrativi solo per la modalità finta ed è registrato anche nel suo
involucro di trasporto (`withTransport` di `web/src/api/fake/fakeApi.ts`, che elenca le
aree una per una), così la modalità finta, anche offline, ha l'area. Un test di `realClients`
verifica che `overview`, `getDraft` e `setArchived` vadano al client RPC.

**Rifiuti del server:** sezioni e pagina della bozza usano `isBlocking` come le altre
schermate: i dati in cache restano visibili solo per un errore di rete. Un `forbidden`
(ruolo revocato con il profilo ancora in cache), sia su una lettura sia sulla mutazione
«Riporta nel ricettario», rimuove le query `['catalogue', …]` e fa rileggere il profilo
(`globalRoles`): le sezioni spariscono, la pagina della bozza mostra l'avviso dei
permessi. Una sola funzione dell'area (`useCatalogueRevocation`) lo fa per entrambe. Un `unauthorized` segue il percorso della sessione di W5.

Nella struttura che la base impone (`web/src/features/catalogue/` se prevista):

- **`CatalogueDraftsSection`:** solo con `globalRoles` contenente `recipe_curator`;
  sezione «Bozze» collassabile in testa al ricettario, schede del prototipo (`DraftList`):
  etichetta Nuova o Modifica, nome nel font delle schede, «Lucia · 6 ott», dati mancanti
  come etichette brevi (`missing`); tocco → pagina della bozza. Legge `overview`.
- **`ArchivedRecipesSection`:** sezione «Archiviate» chiusa in fondo; per riga nome,
  autore e data, «Riporta nel ricettario» (`setArchived` con `archived: false`), senza
  aggiornamento ottimistico: la risposta aggiorna la panoramica e marca scadute ricerca
  del ricettario e scheda della ricetta.
- **`DraftPage`** (rotta `/recipes/drafts/$draftId`, solo curatori): sola lettura; nome e
  descrizione nella lingua dell'utente (l'altra se manca), fonte, attributi, porzioni,
  righe con nome dell'ingrediente (o «da collegare» per le irrisolte), varietà, testo
  della fonte; elenco dei problemi con i testi localizzati dei codici; autore e ultima
  modifica. Niente pulsanti di modifica né di pubblicazione (ondata 3).
- Dizionario `catalogue` in italiano e inglese britannico con `useT()`. Il testo di
  `errors.not_allowed` arriva già con la PR del server (sezione 1).

## 6. Test

- **Contratto:** `checkContract(contract)` restituisce `[]`; nessuno schema di input
  dell'area ha `familyId`; `conflictData` e `not_allowed` nei test degli errori.
- **Dominio puro del server:** `applyRecipeConversions` (con e senza equivalenza, con
  preparazione specifica e generica, valore nullo, riga irrisolta); confronto dei campi
  cambiati.
- **Server con database** (`setupActors`, un curatore, un secondo curatore, un membro):
  - permessi: non curatore `forbidden` su ogni operazione; revoca del ruolo efficace con
    lo stesso token;
  - creazioni: stesso uuid ripetuto in sequenza e **in parallelo** (una sola entità, stessa
    risposta, nessun `internal`); due uuid diversi con lo stesso nome in parallelo (slug
    diversi); ripetizione di `startRevision` dopo pubblicazione e dopo scarto della sua
    bozza; `startRevision` su una ricetta mai pubblicata con bozza aperta → `not_allowed`;
  - write.ts per l'import: ingrediente con `slug` `olio-extravergine-di-oliva` e nome
    «Olio extravergine d'oliva» conservato; secondo import con un uuid diverso e lo stesso
    slug → `created: false`, stesso id; `resolveReferences` con la lookup costruita dalle
    risposte; `createDraft` ripetuto con lo stesso `originSlug`;
  - bozze: creazione idempotente; nome della bozza nuova in `recipes` e contatore della
    famiglia che la cita; rifiuto dei soli problemi bloccanti; duplicati ammessi;
  - conflitti: conflitto con `theirs`, `theirFields` e `myFields`; sovrascrittura con le
    righe `overwritten`; terzo salvataggio fra conflitto e sovrascrittura → nuovo
    conflitto; ripetizione dopo il successo senza revisione nuova;
  - pubblicazione: nuova e di revisione (proiezioni, righe, versione, stato, chiusura,
    canale); errore forzato a metà senza scritture parziali; versione superata con e
    senza `confirmVersion`; tazze convertite, senza equivalenza `invalid`; revisione di
    un'archiviata che resta archiviata; ripetizione dopo la chiusura;
  - istante R1, due casi: la ricetta bloccata da un'altra transazione, e la riga globale
    `catalogue_state` tenuta da un'altra transazione (che cambia un altro ingrediente);
    in entrambi una pubblicazione avviata prima dello sblocco ha `published_at` non
    anteriore allo sblocco, e il resolver reale `app.recipe_version_at` restituisce la
    versione precedente per un istante fra l'inizio della richiesta e lo sblocco e la
    nuova da `published_at` in poi; lo stesso per `restoreVersion` con `catalogue_state`
    occupata;
  - ricerca globale: un curatore senza famiglia trova per nome una ricetta pubblicata e
    una archiviata senza conoscerne l'id, mai una bozza; poi ne legge le versioni e apre
    la revisione;
  - scarto: bozza nuova citata rifiutata, non citata chiusa; revisione scartata;
  - archiviazione: avanti e indietro con `recipe_status_changes`; ripetizione senza righe
    nuove; esclusione dal ricettario di W6;
  - versioni e ripristino: elenco, versione com'era, ripristino con `restored_from`,
    rifiuto se non supera i controlli di oggi, `already_current`, `confirmVersion`
    superata, ripetizione;
  - ingredienti: creazione, lettura con `getIngredient` e modifica da un client nuovo
    (ricerca → lettura → modifica, sinonimi ed equivalenze conservati), modifica con
    conflitto, righe di `ingredient_versions`; equivalenze: ripetizione identica senza
    nuove righe né versione (stesso id), modifica sul posto con lo stesso id, rimozione
    ripetuta senza `not_found`, `source` vuota; ricerca per sinonimo e varietà; consigli
    sulla varietà;
  - libri: creazione idempotente ed elenco;
  - MCP: strumenti `catalogue_*` elencati per un agente, una pubblicazione via MCP con
    canale `mcp` registrato, `conflict` e `invalid` resi nella lingua dell'utente.
- **pgTAP:** sezione 4.
- **Web:** Testing Library sulle due sezioni (nascoste ai non curatori, visibili a un
  curatore senza famiglia, schede e dati mancanti, «Riporta nel ricettario» senza
  aggiornamento ottimistico, dati già caricati seguiti da `forbidden` che spariscono) e
  sulla pagina della bozza; «Riporta nel ricettario» rifiutato con `forbidden` che toglie
  le viste; test di `realClients` e di `fakeClients` (anche offline) per l'area.

## 7. Consegna

1. **PR del server** (`traguardo/ricettario-mcp`): contratto, server, migrazione, MCP,
   test, più la compatibilità del web con `not_allowed` (sezione 1). Indipendente dalle
   schermate.
2. **PR del web** (stesso branch ribasato o `traguardo/ricettario-mcp-web`), dopo il
   cancello della sezione 5.

## Decisioni da riportare nella specifica

### Prodotto

- **Conferma del curatore e traduzioni nel percorso MCP** (chiude i due punti aperti della
  sezione 15, «Completezza delle ricette» e «Lingue»; sezioni 8, 12 e 13): la conferma la
  chiedono solo le istruzioni servite all'agente (mostrare la scheda completa con le
  traduzioni preparate e pubblicare dopo un sì esplicito); la pubblicazione prende
  l'ultima revisione della bozza, senza vincoli sulla revisione mostrata né flag sulle
  traduzioni (scelta dell'utente, 11 ottobre 2026).
- **Eliminare una bozza nuova** la chiude come scartata: la ricetta mai pubblicata resta
  nel database, fuori dalle bozze e dai pasti; vale solo se nessun pasto di nessuna
  famiglia la cita (sezioni 2 e 8).
- **Revisione di una ricetta archiviata:** si può aprire e pubblicare; la ricetta resta
  archiviata finché un curatore non la riporta nel ricettario (sezione 8).
- **Ripristino di una versione** su una ricetta cambiata dopo che il curatore l'ha
  guardata richiede una nuova conferma, come la pubblicazione da una versione superata
  (sezione 8).
- **Ingredienti dal percorso MCP:** ricerca, lettura completa, creazione e modifica di nomi, sinonimi, reparto e
  dispensa, ciascuna con la versione di partenza e conflitto; equivalenze di ambito
  ricetta; archiviazione degli ingredienti ed equivalenze di spesa nell'ondata 3
  (sezioni 8 e 13).
- **Web nel traguardo A:** «Bozze» e «Archiviate» nel ricettario, visibili ai curatori
  anche senza famiglia, e pagina della bozza in sola lettura; archiviazione dalla scheda, versioni e ripristino nell'app nell'ondata 3
  (sezioni 8 e 10).

### Tecniche

- **Ricerca globale delle ricette per i curatori** (`catalogue.searchRecipes`), senza
  famiglia, per ritrovare le ricette pubblicate e archiviate da rivedere (sezione 13).
- **Area `catalogue`** del contratto con le operazioni della sezione 2, ruolo `curator`,
  nessun `familyId`; strumenti MCP `catalogue_*` dal contratto (sezioni 1 e 13).
- **Conversioni delle tazze USA** applicate dal server al controllo e alla pubblicazione
  con le equivalenze di ambito ricetta; la bozza resta com'è scritta, il documento
  pubblicato ha la quantità convertita e il `sourceText` originale (sezioni 2, 6 e 8).
- **`conflict` con discriminante** (`draft`, `version`, `ingredient`), sovrascrittura che
  cita la revisione sovrascritta, ripetizioni idempotenti di salvataggi, pubblicazioni,
  ripristini e creazioni (sezione 1).
- **Codice d'errore `not_allowed`** (409) con `reason` (`cited_by_meals`,
  `not_published`, `already_current`) (sezione 1).
- **`app.recipe_is_cited`**, funzione `security definer` per i soli curatori, e
  `app.catalogue_author_names()` estesa agli autori di `ingredient_versions` (sezione 2).
- **Contenuto di `ingredient_versions`** con tutte le equivalenze dell'ingrediente;
  `ingredients.version` cresce anche per le equivalenze (sezione 2).
- **Letture della gestione non versionate** quando dipendono dalle bozze, che non toccano
  il contatore del ricettario (sezione 1).
- **Modulo di scrittura riusabile** `server/src/catalogue/write.ts` per l'import della
  messa in produzione, con canale `import` e slug dell'import conservati (sezioni 8 e 11).
- **Istante di pubblicazione per R1:** `published_at` è `clock_timestamp()` letto dopo
  tutte le attese (lucchetti e contatore del ricettario), subito prima dell'inserimento
  della versione, non l'inizio della richiesta, così un'attesa non rende retroattiva una
  versione per un pasto già passato (sezioni 2 e 5).
- **Creazioni del ricettario serializzate** con un lucchetto consultivo di transazione:
  idempotenza per uuid e slug unici anche con richieste concorrenti (sezione 1).
- **Equivalenze idempotenti:** una ripetizione identica non scrive; una modifica conserva
  l'id; la rimozione ripetuta riesce (sezione 2).
