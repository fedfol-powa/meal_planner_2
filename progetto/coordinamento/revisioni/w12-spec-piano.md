# Revisione W12 — Foto delle ricette, issue #39

Revisione di spec e piano al commit `5096a3c`, branch `ondata3/foto-ricette`. **Esito: DA CORREGGERE.**

Il perimetro recepisce le decisioni dell’utente del 16 ottobre: comandi solo nella scheda aperta, nessuna provenienza, ricerca dell’immagine anche fuori dalla fonte con conferma esplicita del curatore, foto correnti delle bozze servite prima della pubblicazione. Restano sei rilievi che incidono su recuperabilità, cache, robustezza e verificabilità del piano.

## Rilievi

### 1. Bloccante — La pulizia può cancellare immagini necessarie alle esportazioni ancora conservate

**Riferimenti:** [spec, righe 442–455](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:442); [piano, righe 282–295](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:282).

La pulizia considera soltanto il database corrente e l’età degli oggetti. Dopo un ripristino, ciò non basta a distinguere un caricamento fallito da una foto ancora necessaria a un’altra esportazione conservata.

Esempio:

1. L’esportazione A precede il caricamento di una foto.
2. L’esportazione B contiene quella foto corrente.
3. Si ripristina A; la foto scompare dal database, ma B resta fra le sette copie.
4. Se l’oggetto è stato caricato da oltre due giorni, la pulizia lo elimina come orfano.
5. Ripristinare successivamente B produce un riferimento rotto.

Anche «30 giorni coprono le 7 esportazioni» non è garantito: sono le ultime sette copie riuscite, non necessariamente sette giorni. Il codice conserva le copie precedenti quando l’esportazione fallisce ([`export.ts`, righe 84–97](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/server/src/backup/export.ts:84)), mentre il piano fa proseguire comunque la pulizia.

**Correzione proposta:** subordinare la cancellazione all’assenza della chiave dalle foto correnti **e dalle esportazioni ancora ripristinabili**, mediante manifesti dei riferimenti o un meccanismo equivalente. In caso di verifica incompleta, conservare gli oggetti. Integrare il piano con prove di esportazione → ripristino → pulizia → secondo ripristino, verificando anche la presenza dei byte nel bucket, e con esportazioni fallite per un periodo prolungato.

### 2. Importante — La cache HTTP annuale contraddice la cancellazione sul dispositivo e la revoca dichiarate

**Riferimenti:** [spec, righe 167–191](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:167); [spec, righe 413–424](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:413); [piano, righe 375–385](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:375).

`Cache-Control: public, max-age=31536000, immutable` permette al browser e alle cache condivise di riutilizzare la risposta senza interrogare il Worker. Cancellare `cosasimangia-photos-v1` elimina la cache gestita dall’app, ma non la cache HTTP del browser. Quest’ultima può quindi conservare e restituire l’immagine dopo l’uscita; una cache condivisa può inoltre continuare a servirla dopo la rimozione. [Documentazione di Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

Non sono dunque soddisfatte le affermazioni «niente resta di un utente che esce» e «togliere la foto la rende irraggiungibile dalla rete». Il test previsto controlla soltanto la cancellazione di Cache Storage.

**Correzione proposta:** distinguere esplicitamente cache HTTP e cache offline. Una soluzione compatibile con il requisito è impedire la conservazione HTTP e usare soltanto la cache esplicita del service worker per l’offline; la Cache API non applica automaticamente le direttive HTTP. [Documentazione della Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache). Prevedere anche il caso di una risposta arrivata durante il logout, affinché non ricrei dati della sessione chiusa. Documentare che le copie già scaricate da terzi non sono revocabili.

### 3. Importante — AVIF in ingresso non è compatibile con il piano Images Free dichiarato

**Riferimenti:** [spec, righe 229–240 e 253–261](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:229); [piano, righe 173–175](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:173).

Spec, contratto e messaggi promettono di accettare AVIF. La documentazione Cloudflare, verificata con Context7 e sulla pagina ufficiale, indica invece **AVIF in ingresso disponibile sul piano Enterprise**. Il supporto AVIF in uscita è distinto. [Formati supportati da Cloudflare Images](https://developers.cloudflare.com/images/get-started/limits/#supported-formats).

Il problema riguarda soprattutto MCP, dove arrivano i byte originali: la ricodifica JPEG del browser non interviene. I binding finti e il simulatore locale non dimostrano la disponibilità del formato sul piano scelto.

**Correzione proposta:** restringere i formati ricevuti dal Worker a quelli disponibili su Free e aggiornare contratto, guida, errori e test. L’eventuale conversione nel browser può restare distinta dai formati ammessi via URL. Aggiungere una prova esplicita dell’errore `9422`: risposta controllata, foto precedente intatta, nessun nuovo oggetto o riferimento.

La soglia gratuita di 5.000 trasformazioni e il rifiuto senza addebiti oltre soglia risultano invece documentati correttamente. [Prezzi di Images](https://developers.cloudflare.com/images/pricing/#images-free).

### 4. Importante — Il limite dell’upload web interviene dopo il caricamento del corpo in memoria

**Riferimenti:** [spec, righe 259–260 e 290–294](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:259); [piano, righe 173–175](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:173).

Il limite di 10 MiB è affidato a `z.file().max(...)`. Questo valida un file già deserializzato: oRPC mantiene normalmente `File` e `Blob` in memoria. [Documentazione oRPC](https://orpc.dev/llms-full.txt).

Nel server attuale la richiesta passa direttamente a `handler.handle`, senza un limite preventivo del corpo ([`app.ts`, righe 131–136](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/server/src/app.ts:131)). Il ridimensionamento del browser non protegge da richieste costruite direttamente. Un corpo molto superiore al limite, anche senza autenticazione valida, può essere letto prima del rifiuto e consumare memoria del Worker.

**Correzione proposta:** aggiungere un limite del corpo applicato durante la lettura, prima del parser multipart, sui percorsi RPC e OpenAPI interessati. Distinguere il limite del file dal margine per l’involucro multipart; non affidarsi soltanto a `Content-Length`. Prevedere test con corpo oltre soglia senza quell’intestazione, verificando l’interruzione della lettura e l’assenza di chiamate a Images e R2.

### 5. Importante — La sola invalidazione delle query non protegge dalle risposte concorrenti dei pasti

**Riferimenti:** [spec, righe 390–396](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/specs/2026-10-16-foto-ricette.md:390); [piano, righe 342–344](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:342).

La spec richiama il registro delle mutazioni; il piano prescrive invece `useMutation` con sole invalidazioni in `onSuccess`, senza integrare il riconoscimento delle risposte superate.

Caso concreto: una modifica del pasto produce una settimana con la vecchia foto; la risposta tarda ad arrivare. Nel frattempo termina un caricamento e la rilettura mostra la nuova foto. Quando arriva la risposta del pasto, `runMealMutation` può riscrivere la settimana precedente: controlla le altre modifiche del pasto e i voti confermati, ma non le foto ([`mutations.ts`, righe 255–276](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/web/src/api/mutations.ts:255)). Il contatore nel database non impedisce questa scrittura locale.

**Correzione proposta:** integrare le modifiche delle foto nel meccanismo comune che rende superate le risposte contenenti dati precedenti del ricettario. Aggiungere un test con risposta del pasto ritardata, caricamento o rimozione confermati e successivo arrivo della risposta vecchia: questa deve essere scartata e la settimana riletta.

### 6. Importante — I comandi TDD dei compiti 2 e 3 non eseguono i test indicati

**Riferimenti:** [piano, riga 153](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:153); [piano, riga 219](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/progetto/superpowers/plans/2026-10-16-foto-ricette.md:219).

I comandi `npx vitest run server/test/...` lanciati dalla radice selezionano la configurazione della radice, che include soltanto `scripts/**/*.test.ts` e imposta `passWithNoTests: true` ([`vitest.config.ts`, righe 10–12](/Users/fedfol/Projects/meal_planner_2/.worktrees/foto/vitest.config.ts:10)).

Ho riprodotto la selezione con un test server già esistente, usando `--configLoader runner` per evitare la scrittura temporanea fuori dai percorsi consentiti:

```text
filter: server/test/recipes/views.test.ts
include: scripts/**/*.test.ts
No test files found, exiting with code 0
```

Il ciclo «FAIL → implementazione → PASS» può quindi risultare verde senza eseguire alcuna asserzione.

**Correzione proposta:** usare il workspace corretto, per esempio:

```sh
npm test -w server -- test/catalogue/photos-unit.test.ts
npm test -w server -- test/catalogue/photos.test.ts
```

Esplicitare inoltre l’applicazione della nuova migrazione al database locale e la configurazione di `TEST_DATABASE_URL` prima dei test d’integrazione; `supabase test db` esegue i test sullo schema presente, non applica automaticamente la migrazione appena scritta.

## Aspetti verificati senza rilievi autonomi

- Tabella dedicata, foto fuori dalle versioni, comportamento di bozze, archiviazione e ripristino della singola ricetta definiti.
- Scritture riservate ai curatori, RLS, funzione pubblica con `search_path = ''` ed `EXECUTE` ristretto, incremento del contatore e test pgTAP previsti.
- Migrazione `20261016110000` non in collisione con il `main` locale esaminato.
- Chiavi casuali motivate; rotta sotto `run_worker_first`, intestazioni difensive e bucket privato in giurisdizione `eu` previsti.
- Scaricamento con HTTPS, controlli dell’URL, redirect manuali rivalidati, limite complessivo di tempo e conteggio dei byte previsto. La protezione delle destinazioni risolte dal DNS si appoggia al `fetch` globale di Workers, non alla sola lista dei suffissi.
- Banner 3:1, dettaglio 16:9, schede senza foto invariate, testi bilingui e cache runtime separata dal precache previsti.
- Strumenti MCP e conferma del curatore nella guida definiti; `mcp: false` per il caricamento di file motivato.
- PR unica, passi esterni per il coordinatore e assenza di nuove dipendenze npm dichiarati.

## Punti per il coordinatore

Le correzioni non richiedono di riaprire le decisioni di prodotto del 16 ottobre. Se si volesse mantenere la cache HTTP annuale, servirebbe invece concordare esplicitamente una deroga alla cancellazione dei dati sul dispositivo e correggere le garanzie sulla rimozione.

Prima dell’implementazione vanno fissati il criterio di protezione delle immagini citate dalle esportazioni e l’integrazione delle mutazioni delle foto con le risposte concorrenti. Il consolidamento nella specifica principale resta al coordinatore, come previsto dal protocollo.

Revisione svolta in sola lettura; nessun file tracciato modificato. Non sono stati eseguiti collaudi funzionali, build o pgTAP della funzionalità, che non è ancora implementata.

**Verdetto finale: DA CORREGGERE.**