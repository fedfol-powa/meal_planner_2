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
| W5 (#17) | client oRPC reale, `useT()`, query e mutazioni, tipo e dizionari degli errori | web |
| W2 (PR web dopo la #17) | `profile.get` con `globalRoles` nel web (passaggio da `me.get`) | sezioni solo per i curatori |

### Prodotto per altre attività

- **Per W6:** due componenti montati in `RecipesPage`, ciascuno nascosto da sé se l'utente
  non è curatore:

  ```tsx
  <CatalogueDraftsSection />   // in testa, prima dei filtri
  <ArchivedRecipesSection />   // in fondo, dopo l'elenco
  ```

  Modifica di W3 in `web/src/routes/RecipesPage.tsx` limitata a import e queste due righe;
  le PR si uniscono in sequenza (punto di contatto con W6).
- **Per la «Messa in produzione»:** modulo di scrittura riusabile senza la pipeline,
  `server/src/catalogue/write.ts`, con il canale esplicito (l'import usa `'import'`):

  ```ts
  type Channel = 'web' | 'mcp' | 'import';
  interface Actor { userId: string; channel: Channel; now: Date }

  createDraft(tx: Tx, actor: Actor, input: { draftId: string; content: RecipeDraftDocument;
  	originSlug?: string | null; originType?: string | null }): Promise<{ draftId: string; recipeId: string }>;
  saveDraft(tx: Tx, actor: Actor, input: SaveDraftInput): Promise<DraftSaved>;
  publishDraft(tx: Tx, actor: Actor, input: { draftId: string; confirmVersion?: number }): Promise<Published>;
  createIngredient(tx: Tx, actor: Actor, input: CreateIngredientInput): Promise<{ ingredientId: string }>;
  createBook(tx: Tx, actor: Actor, input: { bookId: string; slug?: string; title: string }): Promise<{ bookId: string }>;
  ```

  Le funzioni lanciano gli stessi `appError` dei gestori; i gestori sono sottili attorno
  a esse. `SaveDraftInput`, `DraftSaved`, `Published`, `CreateIngredientInput` sono i tipi
  di input e output del contratto (sezione 2).
- **File condivisi toccati in modo minimo:** `contract/src/errors.ts` (`conflictData`,
  `not_allowed`), `contract/src/contract.ts` e `server/src/router.ts` (registrazione),
  `server/src/messages.ts` (testi MCP di `not_allowed` e del conflitto), nel web rotte e
  `RecipesPage` (registrazione) e, nella PR web, tipo e dizionari degli errori per
  `not_allowed`.

## 2. Contratto (`contract/src/catalogue/`)

Tutte le operazioni: `role: 'curator'`, `offline: false`, `mcp` presente (`readOnly`
secondo il tipo). Nessuna ha `familyId`: il ricettario è globale. Le rotte REST stanno
sotto `/catalogue/...`. Le creazioni hanno `creates: true` e un `id` uuid generato dal
client (`checkContract`).

**Letture versionate** (`reads: ['catalogue']`, input con `knownVersion`):
`listVersions`, `getVersion`, `searchIngredients`, `listVarieties`, `listBooks`. Dipendono
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
	canDiscard: z.boolean(),                           // revisione sempre; nuova se nessun pasto la cita
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
| `setArchived` | PUT `/catalogue/recipes/{recipeId}/archived` | `{ recipeId; archived: boolean }` | `{ recipeId; status: 'published' \| 'archived'; changedBy: author; changedAt }` | `not_found`, `not_allowed` (`not_published`) |
| `listVersions` | GET `/catalogue/recipes/{recipeId}/versions` | `versionedInput({ recipeId })` | `versionedOutput({ recipeId; name; status; current; versions: { version; publishedBy: author; publishedAt; channel; restoredFrom: int \| null }[] })` | `not_found` |
| `getVersion` | GET `/catalogue/recipes/{recipeId}/versions/{version}` | `versionedInput({ recipeId; version })` | `versionedOutput({ recipeId; version; current; publishedBy; publishedAt; restoredFrom; content: RecipeDocument; summary: recipeSummaryView; ingredients: ingredientLineView[]; issues })` | `not_found` |
| `restoreVersion` | POST `/catalogue/recipes/{recipeId}/versions/{version}/restore` | `{ recipeId; version; confirmVersion: int ≥ 1 }` | `{ recipeId; version; restoredFrom }` | `not_found`, `invalid`, `conflict` (`version`), `not_allowed` (`already_current`) |
| `searchIngredients` | GET `/catalogue/ingredients` | `versionedInput({ text: string 2..60 })` | `versionedOutput({ items: { ingredientId; name; department; isPantry; variety: Localized \| null; matched: 'name' \| 'synonym' \| 'variety' }[] })` | |
| `listVarieties` | GET `/catalogue/ingredients/{ingredientId}/varieties` | `versionedInput({ ingredientId })` | `versionedOutput({ varieties: { variety: Localized; uses: int }[] })` | `not_found` |
| `checkVariety` | GET `/catalogue/ingredients/{ingredientId}/variety-check` | `{ ingredientId; text: string ≤ 40; locale: 'it-IT' \| 'en-GB' }` | `{ hints: VarietyHint[] }` | `not_found` |
| `createIngredient` | POST `/catalogue/ingredients` | `{ id: uuid; name: { it-IT: string; en-GB: string \| null }; department; isPantry?: boolean; synonyms?: { it-IT: string[]; en-GB: string[] } }` | `ingredientView` | `invalid` |
| `updateIngredient` | PUT `/catalogue/ingredients/{ingredientId}` | `{ ingredientId; baseVersion: int ≥ 1; name; synonyms; department; isPantry }` | `ingredientView` | `not_found`, `invalid`, `conflict` (`ingredient`) |
| `setEquivalence` | PUT `/catalogue/ingredients/{ingredientId}/equivalences` | `{ ingredientId; fromUnit; toUnit; factor > 0; preparation?: string \| null; source: string }` | `ingredientView` | `not_found`, `invalid` |
| `removeEquivalence` | DELETE `/catalogue/ingredients/{ingredientId}/equivalences/{equivalenceId}` | `{ ingredientId; equivalenceId }` | `ingredientView` | `not_found` |
| `listBooks` | GET `/catalogue/books` | `versionedInput({})` | `versionedOutput({ books: { bookId; slug; title; archived: boolean }[] })` | |
| `createBook` | POST `/catalogue/books` | `{ id: uuid; title: string 1..200 }` | `{ bookId; slug; title }` | `invalid` |

`ingredientView`: `{ ingredientId; slug; name: Localized (en-GB può essere ''); synonyms;
department; isPantry; version; equivalences: { id; fromUnit; toUnit; factor; preparation;
source }[] }` (solo ambito `recipe`).

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
| `write.ts` | scritture riusabili (sezione 1) |
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

### Bozze

- **`createDraft`:** `cleanDraft`, poi `checkDraft`; problemi bloccanti (`blocksDraft`) →
  `invalid`. Ricetta nuova in `recipes` (stato `draft`, versione 0, slug unico dal nome
  italiano o inglese, `name`/`description` da `projectDraftNames`), bozza `new` con
  `id` del client e `revision = 1`, prima riga in `recipe_draft_saves`. Ripetizione con lo
  stesso `id`: restituisce la bozza esistente senza scrivere (se il contenuto differisce,
  vale comunque la bozza esistente: l'`id` identifica la creazione).
- **`startRevision`:** ricetta `published` o `archived`; se c'è una bozza aperta per la
  ricetta (indice `recipe_drafts_one_open`), restituisce quella; altrimenti crea la
  revisione con `base_version = recipes.version` e il contenuto della versione corrente
  (`recipe_versions.content`), con l'`id` del client. Ricetta in stato `draft` →
  `not_allowed` (`not_published`). Ripetizione con lo stesso `id`: la stessa bozza.
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
     channel)`;
   - `recipe_status_changes`: riga `published` solo alla prima pubblicazione;
   - bozza: `closed_at/by`, `outcome = 'published'`.
4. Ripetizione su una bozza già chiusa come `published`: risposta con la versione
   pubblicata dalla chiusura (quella con `published_at = closed_at` e `published_by =
   closed_by`), senza scrivere.

Un errore in qualunque passo annulla la transazione intera: nessuna ricetta parzialmente
pubblicata (sezione 8).

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
- **`createIngredient`:** nome pulito con l'iniziale maiuscola (come il prototipo), slug
  unico dal nome italiano, reparto fra `DEPARTMENTS`, sinonimi ripuliti e senza doppioni;
  `version = 1` e riga 1 in `ingredient_versions`. Ripetizione con lo stesso `id`: la
  stessa vista.
- **`updateIngredient`:** `baseVersion ≠ version` → `conflict` `ingredient` con autore e
  momento dell'ultima riga di `ingredient_versions` e i campi cambiati; contenuto uguale →
  nessuna scrittura; altrimenti `version + 1`, `updated_by/at` e nuova riga dello storico.
- **`setEquivalence`:** solo `scope = 'recipe'`; validazione con `unitEquivalenceSchema`
  (`source` non vuota, `factor > 0`, `preparation` normalizzata con `preparationKey`);
  sostituisce l'equivalenza con la stessa chiave (ingrediente, ambito, dimensione di
  partenza, preparazione) o ne crea una; doppioni e vincoli del database → `invalid` con
  `withInvalidOn`. Ogni modifica: `ingredients.version + 1` e riga in
  `ingredient_versions`.
- **`removeEquivalence`:** solo ambito `recipe`; stessa regola di versione.
- **Contenuto di `ingredient_versions`** (schema zod `ingredientVersionContent` in
  `server/src/catalogue/`): `{ slug, name, synonyms, department, isPantry, equivalences:
  { fromUnit, toUnit, factor, scope, preparation, source }[] }`, con tutte le equivalenze
  dell'ingrediente (anche di spesa). Serve al ripristino del catalogo dell'ondata 3.
- **`createBook`:** titolo ripulito, slug unico dal titolo; ripetizione con lo stesso
  `id`: lo stesso libro. **`listBooks`:** tutti, con `archived`.

### Guida (`catalogue.getGuide`)

Markdown in inglese, statico nel server (`guide.ts`), in tre parti:

1. **Flusso:** cercare ingredienti e libri prima di crearli; salvare spesso una bozza
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

Test pgTAP (`supabase/tests/catalogue_citations_test.sql`): vero con un pasto di una
famiglia di cui il curatore non è membro, falso senza pasti, `42501` per un utente non
curatore, nessun `execute` per `public` e `anon`, revoca del ruolo efficace con le stesse
credenziali; `catalogue_author_names()` restituisce l'autore di una riga di
`ingredient_versions` a un curatore e nulla a un non curatore.

## 5. Web (dopo il cancello)

**Cancello:** dopo il merge della seconda PR di W5 (#17, client oRPC reale) **e** della
PR web di W2 che porta `profile.get` (con `globalRoles`) nel web al posto di `me.get`.

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
- Dizionario `catalogue` in italiano e inglese britannico con `useT()`; testo di
  `not_allowed` nei dizionari degli errori della #17.

## 6. Test

- **Contratto:** `checkContract` su tutta l'area; `conflictData` e `not_allowed` nei test
  degli errori.
- **Dominio puro del server:** `applyRecipeConversions` (con e senza equivalenza, con
  preparazione specifica e generica, valore nullo, riga irrisolta); confronto dei campi
  cambiati.
- **Server con database** (`setupActors`, un curatore, un secondo curatore, un membro):
  - permessi: non curatore `forbidden` su ogni operazione; revoca del ruolo efficace con
    lo stesso token;
  - bozze: creazione idempotente; nome della bozza nuova in `recipes` e contatore della
    famiglia che la cita; rifiuto dei soli problemi bloccanti; duplicati ammessi;
  - conflitti: conflitto con `theirs`, `theirFields` e `myFields`; sovrascrittura con le
    righe `overwritten`; terzo salvataggio fra conflitto e sovrascrittura → nuovo
    conflitto; ripetizione dopo il successo senza revisione nuova;
  - pubblicazione: nuova e di revisione (proiezioni, righe, versione, stato, chiusura,
    canale); errore forzato a metà senza scritture parziali; versione superata con e
    senza `confirmVersion`; tazze convertite, senza equivalenza `invalid`; revisione di
    un'archiviata che resta archiviata; ripetizione dopo la chiusura;
  - scarto: bozza nuova citata rifiutata, non citata chiusa; revisione scartata;
  - archiviazione: avanti e indietro con `recipe_status_changes`; ripetizione senza righe
    nuove; esclusione dal ricettario di W6;
  - versioni e ripristino: elenco, versione com'era, ripristino con `restored_from`,
    rifiuto se non supera i controlli di oggi, `already_current`, `confirmVersion`
    superata, ripetizione;
  - ingredienti: creazione, modifica con conflitto, righe di `ingredient_versions`;
    equivalenze sostituite, `source` vuota, chiave doppia; ricerca per sinonimo e varietà;
    consigli sulla varietà;
  - libri: creazione idempotente ed elenco;
  - MCP: strumenti `catalogue_*` elencati per un agente, una pubblicazione via MCP con
    canale `mcp` registrato, `conflict` e `invalid` resi nella lingua dell'utente.
- **pgTAP:** sezione 4.
- **Web:** Testing Library sulle due sezioni (nascoste ai non curatori, schede e dati
  mancanti, «Riporta nel ricettario» senza aggiornamento ottimistico) e sulla pagina della
  bozza.

## 7. Consegna

1. **PR del server** (`traguardo/ricettario-mcp`): contratto, server, migrazione, MCP,
   test. Indipendente dal web.
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
- **Ingredienti dal percorso MCP:** creazione e modifica di nomi, sinonimi, reparto e
  dispensa, ciascuna con la versione di partenza e conflitto; equivalenze di ambito
  ricetta; archiviazione degli ingredienti ed equivalenze di spesa nell'ondata 3
  (sezioni 8 e 13).
- **Web nel traguardo A:** «Bozze» e «Archiviate» nel ricettario e pagina della bozza in
  sola lettura; archiviazione dalla scheda, versioni e ripristino nell'app nell'ondata 3
  (sezioni 8 e 10).

### Tecniche

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
  messa in produzione, con canale `import` (sezioni 8 e 11).
