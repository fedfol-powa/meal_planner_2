# Revisione PR #9 — Documento ricetta e import

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `7c597cf481a20d38e0fde25dd4084e925ec13740`, con `git diff origin/main...HEAD` e confronto con specifica principale, spec e piano W3, piano generale aggiornato nel checkout principale e review precedente.

L’impianto è coerente con le interfacce concordate e i nove rilievi precedenti sono stati affrontati. Restano due difetti di conversione, una mappatura che perde un ingrediente e alcuni problemi minori. Test e typecheck passano, ma non coprono tutti i casi descritti sotto.

Nessuna modifica al codice del worktree o al progetto d’origine, nessun commit o commento sulla PR. Le prove che richiedevano scritture sono state eseguite in cartelle temporanee.

## Rilievi

### 1. Importante — I campi della fonte vuoti non diventano `null`

**Riferimento:** [domain/src/recipe/check.ts:155](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/domain/src/recipe/check.ts:155).

`toPublished` normalizza soltanto `undefined` e `null`. Le stringhe vuote o composte da spazi, considerate assenti dai controlli, restano nel documento pubblicato.

**Riproduzione:** una ricetta `home` completa con `bookId: ''` oppure `bookId: ' '` ottiene `checkPublishable(...) === []`. Dopo `toPublished`, `toPlannerRecipe` conserva quel valore come `bookId`.

**Perché conta:**

- il pianificatore considera qualunque `bookId !== null` un vincolo di possesso: la ricetta di casa viene esclusa;
- `resolveReferences` tenta di risolvere `' '` come slug e fallisce;
- la proiezione non produce il `null` atteso dalla colonna UUID `recipes.book_id`.

`cleanDraft` non risolve il problema: non normalizza `bookId`, e le stringhe vuote degli altri campi restano comunque stringhe.

**Correzione proposta:** convertire a `null` tutti i campi della fonte semanticamente vuoti, usando lo stesso criterio dei controlli. Aggiungere test con `''`, spazi, `null` e chiavi omesse, verificando anche proiezione, risoluzione dei riferimenti e disponibilità nel pianificatore.

### 2. Importante — Il separatore delle migliaia altera silenziosamente le quantità

**Riferimento:** [scripts/import/quantity.ts:22](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/scripts/import/quantity.ts:22).

Il parser interpreta sempre il punto come separatore decimale:

```text
1.000 g  → amount, value: 1, unit: g, note: null
1.500 ml → amount, value: 1.5, unit: ml, note: null
```

**Perché conta:** una quantità italiana può essere ridotta di mille volte, superare la validazione ed entrare nella spesa senza alcuna segnalazione. Non considero questo rinvio soltanto cosmetico.

Non ho trovato questi esempi nel ricettario attuale: il difetto riguarda i futuri rilanci e il contratto del parser.

**Correzione proposta:** stabilire una grammatica esplicita per i numeri italiani oppure conservare come testo le forme ambigue, segnalandole. Evitare di scegliere automaticamente tra `1` e `1000`. Aggiungere regressioni per separatori delle migliaia, virgola decimale e forme miste.

### 3. Importante — «Sale e pepe» diventa una ricetta pubblicabile senza il pepe strutturato

**Riferimento:** [scripts/import/ingredient-lines.yaml:386](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/scripts/import/ingredient-lines.yaml:386).

La riga è mappata soltanto su `sale`; la nota dichiara che il pepe resta nel testo della fonte.

**Verifica sui dati reali:** `polpette-melanzane-forno` risulta `publishable`; la riga originale `Sale e pepe: 1 pizzico` produce esclusivamente `ingredientId: 'sale'`.

**Perché conta:** «e» indica due ingredienti, non un’alternativa. Conservare il pepe in `sourceText` non lo rende disponibile alle elaborazioni per ingrediente. Il controllo di completezza approva così una rappresentazione incompleta.

La scelta è dichiarata nella descrizione della PR e tutti i YAML sono ancora da approvare: non è avvenuta una pubblicazione indebita, ma il problema va risolto prima dell’approvazione dei dati.

**Correzione proposta:** lasciare temporaneamente la riga irrisolta, con blocco persistente di pubblicazione, oppure rappresentare entrambi gli ingredienti dopo aver chiarito le quantità con fonte o utente. Non attribuire automaticamente un pizzico a ciascuno.

### 4. Minore — Nei rilanci la pagina di revisione perde i nomi bilingui degli ingredienti esistenti

**Riferimenti:** [scripts/import/review-page.ts:17](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/scripts/import/review-page.ts:17), [scripts/import/bundle.ts:85](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/scripts/import/bundle.ts:85).

La pagina costruisce il dizionario dei nomi da `bundle.ingredients`, che contiene correttamente solo gli ingredienti nuovi. Per quelli già presenti mostra quindi lo slug.

**Riproduzione:** indicando in `--existing` tutti i 148 ingredienti e nessuna ricetta, l’import prepara le 56 ricette, ma la riga `Riso basmati: 300 g` mostra `riso` al posto del nome nelle due lingue.

**Perché conta:** il percorso di revisione bilingue si degrada proprio nel rilancio previsto dalla specifica.

**Correzione proposta:** fornire al renderer un catalogo completo per la visualizzazione, distinto dall’elenco degli ingredienti da inserire. Aggiungere un test con ingrediente esistente usato da una ricetta nuova.

### 5. Minore — La data predefinita dell’import segue UTC, non il giorno locale

**Riferimento:** [scripts/import/import-recipes.ts:18](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/scripts/import/import-recipes.ts:18).

Il parametro esplicito `--today` funziona correttamente. Il problema riguarda il valore predefinito, ricavato da `toISOString()`.

**Riproduzione:** alle `2026-10-11T22:30:00Z`, già lunedì 12 ottobre in Italia:

- senza `--today`: data `2026-10-11`, **35 pasti** importati;
- con `--today 2026-10-12`: **47 pasti** importati.

Cambia anche `triedUndated`.

**Perché conta:** lo scarto di giorno modifica le decisioni R4 sullo storico. Dopo l’inserimento nel database, un successivo rilancio salterebbe quelle ricette e non recupererebbe automaticamente i pasti omessi.

**Correzione proposta:** rendere obbligatoria la data esplicita oppure definirne il fuso e documentarlo. Aggiungere una prova al confine domenica/lunedì.

### 6. Minore — Le parole ignorate nelle varietà sono duplicate

**Riferimenti:** [domain/src/recipe/variety.ts:7](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/domain/src/recipe/variety.ts:7), [domain/src/shopping/variety.ts:4](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/domain/src/shopping/variety.ts:4).

Le due costanti `FILLER` contengono oggi gli stessi valori. Non ho rilevato una divergenza attuale, ma una modifica futura può disallineare i suggerimenti durante la compilazione dalla normalizzazione usata per duplicati e spesa.

**Correzione proposta:** condividere il vocabolario o il predicato dal modulo che possiede la normalizzazione. È un intervento di manutenzione, non una ragione autonoma per fermare il merge.

### 7. Minore — Il passaggio di `bookId` al pianificatore non è protetto da un test e la firma documentata è vecchia

**Riferimenti:** [domain/src/recipe/projection.test.ts:31](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/domain/src/recipe/projection.test.ts:31), [spec W3:254](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr9/progetto/superpowers/specs/2026-10-11-ricetta-import.md:254).

L’implementazione attuale è corretta: `toPlannerRecipe(id, document)` legge `document.bookId`. Il test usa però soltanto una ricetta con `bookId: null`.

**Verifica mediante mutazione su copia temporanea:** sostituendo `bookId: d.bookId` con `bookId: null`, tutti i **210 test del dominio continuano a passare**.

La specifica descrive ancora `toPlannerRecipe(id, document, bookId)`.

**Perché conta:** una regressione potrebbe eliminare il vincolo del libro senza essere rilevata; la documentazione può inoltre indurre gli altri worker a usare la vecchia firma.

**Correzione proposta:** aggiungere un caso con libro non nullo, preferibilmente dopo `resolveReferences`, e aggiornare la firma nella spec e negli esempi pertinenti del piano.

## Verifica dei rilievi precedenti

| Rilievo di `w3-spec-piano.md` | Esito nel codice |
|---|---|
| 1. Righe irrisolte e duplicate perse | **Risolto:** conservate nel documento; test import → JSON → bozza → pubblicazione. Il caso composito del rilievo 3 sopra resta distinto. |
| 2. Conversione fallita con chiavi omesse | **Risolto per le omissioni:** fonte, stagioni, varietà e preparazione vengono normalizzate. Restano le stringhe vuote descritte nel nuovo rilievo 1. |
| 3. Errori TypeScript | **Risolto:** typecheck completo verde, dominio senza tipi Node/DOM. |
| 4. Suite reale eseguita anche senza origine | **Risolto:** import in `beforeAll`; verificati quattro test saltati senza errori in ambiente privo dell’origine. |
| 5. Varietà solo inglesi considerate duplicate | **Risolto:** ammesso il salvataggio; confrontate solo identità determinabili, con test per lingue miste. |
| 6. Date storiche normalizzate impropriamente | **Risolto:** controllo di formato, esistenza e lunedì; data dell’import invalida rifiutata. |
| 7. Schede esistenti validate prima dello scarto | **Risolto:** selezione preventiva; presente test del comando con scheda già importata modificata. |
| 8. Approvazione valida dopo modifiche | **Risolto:** verifica SHA-256 del contenuto senza intestazione. |
| 9. Nota di quantità persa nel ripiego testuale | **Risolto:** `145 g crudo (330 g cotto)` resta testo ed entra nel report. |

## Coerenza con le interfacce e con R4

- Nessuna ridefinizione dei tipi completi posseduti da W4 e nessuna modifica a `domain/src/units/`. W3 riusa schemi, unità, quantità pubblicabile, equivalenze e normalizzazione delle varietà; definisce le varianti di bozza.
- Controlli strutturali e controlli di pubblicazione restano distinti, con esiti a codici e percorsi. `us_cup` è ammessa in bozza e rifiutata nel pubblicato.
- Le equivalenze rispettano la preparazione specifica e il ripiego generico; sono presenti test con preparazione diversa.
- Proiezioni, nomi delle bozze e risoluzione degli slug sono presenti. La firma implementata di `toPlannerRecipe` è quella richiesta.
- R4: conservati URL delle ricette `casa`, tipo d’origine e familiarità senza data; nessun pasto inventato per `triedUndated`; applicate le regole per storico `false`, `null` e date invalide.
- L’import costruisce le righe dagli ingredienti dell’origine, non dal nome del piatto. Le quattro ricette senza ingredienti restano prive di righe e in bozza.
- Nessuna scrittura sul database nel percorso di import. L’applicazione del blocco `pendingReview` alle future operazioni di pubblicazione resta responsabilità dell’ondata 2.

## Verifiche eseguite

| Verifica | Esito |
|---|---|
| `npm test` | **331 passati**, 21 saltati: radice 62, dominio 210, contratto 16, server 43 |
| `npm run typecheck` | **PASS**, radice e workspace previsti |
| Build web | **PASS** eseguendo lo script del checkout in una copia temporanea; è ancora la build segnaposto |
| Suite dati reali senza origine | **PASS:** quattro test saltati, nessun errore di raccolta |
| Import reale, due chiamate con data e orario fissati | **Identità byte per byte** di `bundle.json`, `report.md`, `review.html`, verificata con SHA-256 |
| Due esecuzioni del comando CLI in copia temporanea | **Stesso output escluso `generatedAt`**, come previsto dalla specifica |
| Rilancio con tutte le entità in `--existing` | 56 ricette saltate; nessuna nuova ricetta, ingrediente, libro, voto o pasto |
| Report del pianificatore prima/dopo la modifica a `origin.ts` | Identico escludendo i tempi CPU |
| Worktree al termine | Nessuna modifica rilevata da Git |

Con `--today 2026-10-11`, l’import reale produce **56 ricette, 50 pubblicabili e 6 bozze**, 148 ingredienti, 2 libri, 30 voti e 35 pasti. Tutti e quattro i YAML risultano correttamente **non approvati**.

Le sei bozze corrispondono alle quattro schede incomplete, a `pollo-corn-flakes` per il duplicato del limone e a `erbazzone-uova-strapazzate-stracchino` per la durata mancante.

**Efficacia dei test:** su copie temporanee, eliminare il blocco delle righe irrisolte fa fallire il test del bundle; eliminare il confronto dell’hash fa fallire il test dell’approvazione. La mutazione di `bookId` sopravvive invece alla suite, come descritto nel rilievo 7.

**Limiti:** pagina controllata nel sorgente e nell’HTML generato, senza verifica visiva: `agent-browser` è stato bloccato dalla directory del socket non scrivibile e Chrome non era disponibile tramite il controllo UI. Non eseguite scritture o integrazioni database; i 21 test server saltati non costituiscono verifiche superate. Consultata la documentazione Zod tramite Context7.

## Punti da decidere con coordinatore o utente

1. **Revisione dei dati ancora necessaria.** Confermare tagli di carne come varietà, rappresentazione degli ingredienti cotti/precotti, preparazioni del libro come prodotti e interpretazione del peperoncino secco. Per «Sale e pepe» serve prima risolvere la perdita descritta nel rilievo 3.

2. **Materiale necessario per approvare i quattro YAML.** La pagina non mostra fonti e fattori delle equivalenze, sinonimi o stato delle approvazioni. Occorre affiancarle i file pertinenti oppure completarla prima di usarla come unico supporto alla revisione. Questa review non certifica nuovamente le fonti esterne delle cinque equivalenze.

3. **Data dell’import.** Scegliere tra data esplicita obbligatoria e un fuso documentato per il valore predefinito.

4. **Consolidamento della specifica principale.** Le decisioni raccolte nella spec W3 e nel registro del coordinamento restano da riportare nel documento autorevole. `triedUndated` è conservato come concordato, ma il suo utilizzo nel pianificatore resta deliberatamente rimandato.