# Revisione W3 «Ricetta e import» — spec e piano

**Verdetto: APPROVABILE CON CORREZIONI**

La struttura è coerente con l’attività W3 e con le decisioni del coordinamento. Occorre però correggere il passaggio delle ambiguità dell’import alle bozze persistenti, la conversione al documento pubblicato e alcuni problemi che impedirebbero di completare i controlli previsti dal piano.

Revisione sul branch `fondamenta/ricetta-import`, commit `1fb0e6b7fee987d2b2727291181390564608a54f`. Nessuna modifica al worktree o al progetto d’origine.

## Rilievi

### 1. Bloccante — Le righe scartate dall’import perdono il blocco di pubblicazione nel pacchetto

**Riferimenti:** [piano, righe 1782–1796](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:1782), [piano, righe 2077–2082 e 2123–2130](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:2077), [spec, righe 330–332](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:330).

`buildRecipe` elimina dal documento le righe non mappate e quelle duplicate dopo la mappatura. Il motivo resta in `recipeFindings`, che non viene serializzato in `bundle.json`. Nel pacchetto rimangono `status: 'draft'` e, se il resto è completo, `issues: []`.

**Verifica:** aggiungendo una terza riga non mappata alla fixture completa, il pacchetto contiene solo le prime due; `checkPublishable` sul documento risultante restituisce `[]`. Dopo il salvataggio come bozza, il normale percorso di pubblicazione non avrebbe informazioni per rilevare l’ingrediente mancante. Anche la pagina di revisione, che riceve soltanto il bundle, perde questa spiegazione.

**Correzione proposta:** conservare nel pacchetto e nella bozza persistente le righe originali irrisolte e i relativi impedimenti, senza unirle o completarle arbitrariamente. Definire con W2 come questi impedimenti sopravvivono al salvataggio e bloccano la pubblicazione finché risolti. Aggiungere un test completo: import → JSON → ripresa della bozza → tentativo di pubblicazione.

### 2. Importante — Un documento dichiarato pubblicabile può fallire in `toPublished`

**Riferimenti:** [piano, righe 325–337](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:325), [piano, righe 927–964](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:927).

Il livello bozza permette di omettere `sourceUrl`, `bookId`, `bookPages` e `seasons`. Per una ricetta `home`, `checkPublishable` accetta queste omissioni. Lo schema pubblicato richiede invece le chiavi della fonte, benché nullabili, e l’array `seasons`. `toPublished` normalizza soltanto varietà e preparazione.

**Verifica:** togliendo separatamente ciascuna delle quattro proprietà dalla fixture completa, `checkPublishable` restituisce sempre `[]`, mentre `toPublished` fallisce sul campo omesso.

**Perché conta:** un inserimento MCP valido secondo i controlli può fallire durante la pubblicazione, senza errori utili restituiti prima.

**Correzione proposta:** normalizzare i campi assenti non pertinenti a `null` e `seasons` a `[]` prima dello schema completo. Provare l’invariante: ogni documento senza problemi di pubblicazione deve essere convertibile con `toPublished`.

### 3. Importante — Il codice proposto non supera il typecheck previsto

**Riferimenti:** [piano, righe 744–746](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:744), [piano, righe 2313 e 2327–2332](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:2313), [configurazione del dominio](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/domain/tsconfig.json:3).

Ci sono due incompatibilità:

- `check.ts` usa il tipo globale `URL`, assente con `lib: ["ES2024"]` e `types: []`.
- `both` accetta `Partial<Localized>`, i cui valori non ammettono `null`, ma riceve testi della bozza che possono contenerlo.

**Verifica:** riproduzioni isolate con TypeScript restituiscono rispettivamente `TS2304` e `TS2345`.

**Correzione proposta:** rendere la validazione degli URL compatibile con le librerie dichiarate per il dominio, senza introdurre API Node; tipizzare `both` con `DraftLocalized`. Aggiornare il piano prima di richiedere gli esiti `PASS` dei compiti 4 e 12.

### 4. Importante — Il test sui dati reali fallisce anche quando dovrebbe essere saltato

**Riferimento:** [piano, righe 2422–2425](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:2422).

`runImport` viene chiamato direttamente nella funzione che definisce la suite `describe.skipIf(!hasOrigin)`. Vitest esegue quella funzione durante la raccolta dei test anche quando la suite è saltata. Senza il repository d’origine, `originDir` genera quindi un errore prima che i test possano essere saltati.

**Verifica:** una riproduzione minima con Vitest 4.1.11 e `describe.skipIf(true)` fallisce durante la raccolta se la funzione della suite lancia un errore.

**Perché conta:** la CI del nuovo repository non può presumere la presenza del repository privato d’origine.

**Correzione proposta:** spostare `runImport` in un `beforeAll` della suite oppure proteggerne esplicitamente l’esecuzione. Verificare entrambi gli ambienti: origine presente e assente.

### 5. Importante — Varietà diverse scritte soltanto in inglese vengono considerate duplicate

**Riferimenti:** [piano, righe 581–583](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:581), [piano, righe 779–784](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:779), [spec, righe 99–102](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:99).

`lineKey` usa esclusivamente `variety['it-IT']`. Due righe dello stesso ingrediente con varietà `{ 'en-GB': 'red' }` e `{ 'en-GB': 'green' }` producono entrambe una chiave con varietà vuota. `checkDraft` rifiuta la seconda come `duplicate_ingredient`.

**Perché conta:** la bozza ammette traduzioni incomplete e deve poter essere compilata partendo dall’inglese. Qui vengono rifiutati dati incompleti legittimi, senza che sia stata accertata una duplicazione.

**Correzione proposta:** distinguere il controllo provvisorio delle bozze dalla chiave canonica italiana del pubblicato. Non dichiarare equivalenti varietà la cui identità non è ancora confrontabile. Aggiungere casi con sole varietà inglesi e con lingue miste.

### 6. Importante — Lo storico non valida le date e può inventare una data mediante normalizzazione

**Riferimenti:** [piano, righe 1939–1958](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:1939), [piano, riga 2490](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:2490), [calendario, righe 4–7](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/domain/src/planner/calendar.ts:4).

Il piano controlla giorno e tipo di pasto, ma passa `settimana` direttamente ad `addDays`; anche `--today` resta una stringa non validata.

**Verifiche sui frammenti proposti:**

- `settimana: '2026-02-30'`, `pasto: 'lun-cena'` produce un pasto il **2 marzo**, senza segnalazione;
- una settimana indicata con un martedì attribuisce `lun-cena` a quel martedì;
- una stringa non interpretabile interrompe l’import con `Invalid time value`.

**Correzione proposta:** validare formato, esistenza della data e lunedì iniziale prima del calcolo. Segnalare e scartare le voci storiche invalide; rifiutare un `--today` invalido prima dell’import. Aggiungere test per questi casi. Le date del ricettario attuale risultano regolari: il difetto riguarda il contratto di ingresso e i rilanci futuri.

### 7. Importante — Le ricette già importate possono bloccare il rilancio prima di essere saltate

**Riferimenti:** [piano, righe 2476–2483](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:2476), [spec, righe 438–443](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:438).

`runImport` valida gli attributi contro tutte le ricette dell’origine prima di leggere e applicare `--existing`. Una modifica nell’origine a una scheda già importata può invalidare `primary_ingredient` e fermare l’intero comando, impedendo l’import delle schede nuove.

**Verifica:** modificando soltanto in memoria le righe di `wok-pollo-peperoni-riso-basmati`, il parser esistente produce l’errore sul riferimento `petto-di-pollo`. Il comando proposto lo tratterebbe come fatale anche con quello slug in `--existing`.

**Correzione proposta:** applicare la selezione delle schede nuove prima delle validazioni dipendenti dal loro contenuto. Aggiungere un test del comando, non soltanto di `buildBundle`, con una scheda già importata modificata e una nuova valida.

### 8. Importante — L’approvazione dei YAML resta valida dopo modifiche non revisionate

**Riferimenti:** [piano, righe 1452–1455 e 1561](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:1452), [spec, righe 423–424 e 461–463](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:423).

`pendingReview` verifica soltanto la presenza della riga di approvazione. Aggiungere nuove traduzioni o modificare mappature in un file già approvato lascia il file approvato. Il piano non prescrive di invalidare l’intestazione quando cambia il contenuto.

**Verifica:** aggiungendo una traduzione non revisionata dopo l’intestazione, `approvalDate` restituisce la stessa data.

**Perché conta:** il rilancio per nuove ricette può aggirare involontariamente la revisione richiesta prima della pubblicazione.

**Correzione proposta:** definire l’invalidazione dell’approvazione a ogni modifica. Preferibilmente legarla al contenuto revisionato; se si mantiene la sola intestazione, prescriverne almeno la rimozione durante ogni aggiornamento e prevedere un controllo del processo. Aggiungere un caso di file approvato successivamente modificato.

### 9. Minore — Una quantità ambigua reale non compare nel report delle quantità con note

**Riferimenti:** [piano, righe 1300–1314](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/plans/2026-10-11-ricetta-import.md:1300), [spec, righe 352–353](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricetta-import/progetto/superpowers/specs/2026-10-11-ricetta-import.md:352), [origine, riga 656](/Users/fedfol/Projects/meal_planner/ricettario/ricette.yaml:656).

La quantità reale `145 g crudo (330 g cotto)` viene conservata come testo, correttamente senza inventare una conversione, ma il ripiego a `text` azzera `note`. Non viene quindi prodotta la segnalazione promessa per quantità con significati diversi fra crudo e cotto.

**Correzione proposta:** conservare la nota rilevata anche nel ripiego testuale e aggiungere proprio questo caso reale al test del parser e del report.

## Verifica delle dipendenze da W4

Ho confrontato i nomi richiesti da W3 con la spec W4 nel worktree indicato e, dove la spec descrive il contenuto senza nominare l’export, con il relativo piano.

| Nome richiesto da W3 | Riscontro |
|---|---|
| `UnitCode`, `Quantity` | Presenti nella spec W4, sezioni 2 e 10; definiti nel piano |
| `UnitEquivalence`, `applyRecipeEquivalence` | Presenti nella spec W4, sezione 4, con campi e firma compatibili |
| `varietyKey` | Presente nella spec W4, sezioni 7 e 10 |
| `UNIT_CODES` | Nome non esplicitato nella spec; definito nel piano W4, riga 187 |
| `quantitySchema` | Schema descritto nella spec; nome definito nel piano W4, riga 260 |
| `DEPARTMENTS` | Percorso e codici presenti nella spec; nome definito nel piano W4, riga 1121 |

**Non risultano import inventati o nomi incompatibili con il piano W4.** I moduli non sono ancora implementati: la verifica degli export effettivi resta necessaria dopo il merge di W4.

Attenzione alla semantica: W4 distingue `quantitySchema`, che accetta `us_cup`, da `publishableQuantitySchema`, che la rifiuta. W3 usa il primo e applica il divieto in `checkPublishable`; questa separazione deve restare esplicita per i futuri consumatori del contratto.

## Punti da decidere con il coordinatore o l’utente

1. **Persistenza degli impedimenti dell’import.** Concordare con W2 la rappresentazione delle righe irrisolte e il loro percorso di risoluzione, come richiesto dal rilievo 1.

2. **Destino applicativo di `triedUndated`.** La raccolta nel bundle rispetta la decisione R4. Rimane da assegnare, nell’ondata 2, dove conservarla e come il pianificatore la userà: il tipo attuale del pianificatore si basa sullo storico datato. Non va dichiarato chiuso il recupero della familiarità solo perché compare nel report.

3. **Equivalenze riferite al prodotto generico.** W3 riduce le righe a ingredienti generici, mentre alcune equivalenze del prototipo dipendono anche dalla preparazione, per esempio cipolla a dadini o formaggio grattugiato. Concordare con W4 come impedire che una conversione verificata per una forma venga applicata automaticamente a un’altra.

4. **Proprietà dei tipi condivisi.** W3 definisce testi bilingui e quantità parziali; W4 definisce testi bilingui e quantità complete. Registrare esplicitamente la proprietà delle varianti di bozza e degli schemi comuni, per evitare divergenze successive.

## Verifiche e limiti

- Letti spec e piano W3, brief, sezioni pertinenti della specifica principale, riferimenti del prototipo e dati d’origine.
- Consultato anche il piano generale aggiornato nella radice del repository: la copia nel worktree ha ancora «Interfacce decise» vuoto.
- Consultata la documentazione di Zod e Vitest tramite Context7.
- Eseguiti controlli mirati sui frammenti del piano, riproduzioni TypeScript e una prova Vitest isolata; controllati i dati reali senza modificarli.
- Non eseguita una suite completa W3 né una build del prodotto: l’implementazione è ancora da realizzare. Le prove sopra verificano difetti del codice proposto nel piano, non una PR già implementata.