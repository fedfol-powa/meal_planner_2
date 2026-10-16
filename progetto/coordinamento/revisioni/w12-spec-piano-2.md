# Seconda revisione W12 — Foto delle ricette, issue #39

Revisione al commit `437c3f8`, branch `ondata3/foto-ricette`, rispetto alla prima revisione su `5096a3c`.

**Esito: DA CORREGGERE.** Le decisioni vincolanti sono recepite. Restano due problemi nel nuovo limite dell’upload, una lacuna nella prova delle risposte concorrenti e un residuo contraddittorio nella spec.

## Rilievi

### 1. Importante — Il limite dell’upload è aggirabile aggiungendo lo slash finale

**Riferimenti:** [piano, righe 335–336](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:335); [spec, righe 312–322](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:312).

`isPhotoUploadPath` riconosce il percorso RPC esatto e una regex OpenAPI ancorata alla fine. oRPC, invece, normalizza lo slash finale prima di cercare l’operazione.

Ho riprodotto il comportamento con gli handler RPC e OpenAPI della dipendenza installata:

| Percorso | Riconosciuto dal limite descritto | Riconosciuto da oRPC |
|---|---:|---:|
| `/api/rpc/catalogue/uploadPhoto` | Sì | Sì |
| `/api/rpc/catalogue/uploadPhoto/` | No | Sì |
| `/api/catalogue/recipes/<id>/photo/upload` | Sì | Sì |
| `/api/catalogue/recipes/<id>/photo/upload/` | No | Sì |

Una richiesta costruita direttamente può quindi raggiungere il parser senza il limite preventivo, riproducendo il rischio del rilievo 4 iniziale.

**Correzione proposta:** allineare il riconoscimento alla normalizzazione degli handler oppure rifiutare le varianti non canoniche prima del parser. Nel compito 6 aggiungere prove attraverso l’app reale per **entrambi i trasporti**, con e senza slash finale, corpo oltre soglia senza `Content-Length` e senza autenticazione: lettura interrotta e nessuna chiamata a Images o R2.

### 2. Importante — L’errore del flusso non arriva a `route` come previsto dal piano

**Riferimenti:** [piano, righe 334–342](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:334); [spec, righe 320–322](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:320); [interceptor attuale, righe 79–84](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/server/src/errors.ts:79).

Il piano prescrive un `TransformStream` che va in errore e affida a `route` il riconoscimento dell’errore per restituire `413`.

Nel percorso attuale, però, `mapUnreadableRequest` converte un errore ordinario di lettura in `invalid` con stato `400` e `issues: []`. oRPC intercetta e serializza l’errore **dentro** `handler.handle`: il chiamante riceve una risposta, non l’eccezione originale.

La riproduzione con un corpo multipart in errore e lo stesso interceptor ha restituito, su entrambi i trasporti:

```text
status: 400
code: invalid
data: { issues: [] }
eccezione propagata a route: no
```

Il ramo senza `Content-Length` non può quindi produrre il risultato specificato mediante il solo meccanismo descritto.

**Correzione proposta:** esplicitare come il superamento del limite attraversa gli interceptor senza perdere stato e codice: per esempio un errore oRPC riconosciuto con stato `413` e issue `photo_too_large`, oppure uno stato del limitatore consultabile da `route`. Aggiungere gli eventuali file interessati al compito e verificare risposta HTTP e corpo attraverso `createApp`, su RPC e OpenAPI, senza simulare `handler.handle`.

### 3. Importante — Il test delle risposte dei pasti non verifica il collegamento alle mutazioni delle foto

**Riferimenti:** [piano, righe 406–409](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:406); [piano, righe 427–431](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:427); [spec, righe 424–434](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:424).

La soluzione descritta è coerente: contatore globale per sessione, incrementato dalle mutazioni riuscite e controllato da `runMealMutation`.

Il test previsto, però, chiama direttamente `countCatalogueChangeConfirmed`. Dimostra che il consumatore reagisce al contatore, ma non che upload e rimozione lo incrementino davvero. Eliminando la chiamata dagli `onSuccess`, questo test resterebbe verde; anche le prove di `RecipePage` elencate verificano la rilettura, senza controllare tale collegamento. Il difetto originale potrebbe quindi sopravvivere alla suite prevista.

**Correzione proposta:** mantenere la prova unitaria e aggiungere uno scenario che:

1. trattiene la risposta di una mutazione del pasto con la vecchia foto;
2. completa il percorso reale di `useUploadPhoto` oppure `useRemovePhoto`, senza incrementare manualmente il contatore;
3. lascia aggiornare la vista;
4. libera la risposta vecchia e verifica che non sovrascriva la settimana e che parta la rilettura.

Parametrizzare per caricamento e rimozione. Il test deve fallire togliendo l’incremento dagli `onSuccess`, oltre che togliendo il controllo da `runMealMutation`.

### 4. Minore — La motivazione della tabella parla ancora di eliminazione differita

**Riferimento:** [spec, righe 78–81](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:78).

La tabella dedicata è ancora motivata con «l’eliminazione differita degli oggetti in R2» e con la necessità di sapere quali oggetti cancellare. Questo testo contraddice la conservazione illimitata introdotta nella sezione 7 e la decisione vincolante del coordinatore.

**Correzione proposta:** motivare la tabella con storico, attribuzione, idempotenza e individuazione della foto corrente. L’eventuale pulizia resta esclusivamente futura e subordinata alla verifica di tutte le esportazioni conservate. Non occorre rimettere in discussione la tabella scelta.

## Esito dei sei rilievi iniziali

| Rilievo iniziale | Esito nella spec e nel piano corretti |
|---|---|
| **1. Recuperabilità delle immagini** | Risolto nell’architettura: eliminata la pulizia automatica, orfani conservati, prova di esportazione/sostituzione/ripristino con oggetto ancora presente. Resta il residuo testuale del rilievo 4 sopra. |
| **2. Cache HTTP e logout** | Risolto nel disegno: `private, no-store`, cache esplicita del service worker, epoca contro le risposte tardive e prove dedicate. Limiti delle copie esterne dichiarati. |
| **3. AVIF e limite Images** | Risolto nel disegno e nei test previsti: ingresso JPEG/PNG/WebP, AVIF rifiutato anche via URL, errore `9422` con foto precedente intatta e nessuna nuova scrittura. |
| **4. Limite prima del parser** | Non chiuso: riconoscimento aggirabile e propagazione dell’errore da precisare, rilievi 1–2 sopra. |
| **5. Risposte concorrenti dei pasti** | Soluzione definita; prova del collegamento alle mutazioni incompleta, rilievo 3 sopra. |
| **6. Comandi TDD** | Risolto: workspace corretti, applicazione della migrazione e `TEST_DATABASE_URL` espliciti, divieto di considerare valido «No test files found». |

Non emergono ulteriori contraddizioni nelle correzioni rispetto alle decisioni dell’utente e alle sezioni pertinenti della specifica principale. Le scelte già verificate senza rilievi nella prima revisione non vengono riaperte.

## Verifiche e limiti

- Esaminati i due documenti e il diff `5096a3c..437c3f8`, prima revisione, istruzioni del coordinatore, brief, registro e riferimenti pertinenti.
- Consultata la documentazione oRPC tramite Context7; riprodotti localmente normalizzazione dei percorsi e trattamento degli errori con gli handler installati.
- Verificata la selezione dei workspace con `--configLoader runner`: `server/test/auth.test.ts`, **16 test passati**; `web` con filtro `sw-rules`, **5 test passati**.
- I file server `recipes/views.test.ts` e `asset-routing.test.ts` sono stati selezionati correttamente ma saltati senza `TEST_DATABASE_URL`, come ora documentato dal piano.
- `git diff --check 5096a3c 437c3f8` senza errori; worktree pulito.
- Nessun collaudo della funzionalità foto, build o pgTAP: l’implementazione non esiste ancora. Nessun file tracciato modificato e nessun rapporto scritto su file.

## Punti per il coordinatore

Non servono nuove decisioni di prodotto. Le correzioni richieste riguardano l’eseguibilità tecnica e le prove del piano; restano ferme la conservazione illimitata e l’assenza di cache HTTP.

**Verdetto finale: DA CORREGGERE.**