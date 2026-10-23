# Revisione W24 — spec e piano

**Verdetto: APPROVABILE CON CORREZIONI**

Revisione del commit `b62119c1ef4c153abf22296dd08722689b76b5a8`, branch `evolutive/avviso-menu-pronto`.

Le scelte dell’utente sono recepite: pallino sul calendario, numeri verdi senza puntini nel mese, email a righe compatte e preferenza personale per disattivarle. L’impostazione generale è coerente con il codice esistente, ma vanno corretti alcuni passaggi che oggi non garantiscono il comportamento dichiarato.

Nel seguito, **Spec** indica `progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md`; **Piano** indica `progetto/superpowers/plans/2026-10-23-avviso-menu-pronto.md`.

## Rilievi

### 1. Importante — Il conteggio di `sent_at` non garantisce il tetto giornaliero

**Riferimenti:** Spec, righe 291–303; Piano, righe 270–287; `server/src/mail/transport.ts`, righe 34–40.

Il tetto di 60 email viene calcolato contando gli invii confermati nel database. Questo lascia fuori due casi:

- due consegne concorrenti possono leggere entrambe 59 invii, acquisire righe diverse e superare il limite;
- Resend può accettare un’email mentre il Worker perde la risposta o fallisce prima di salvare `sent_at`: quella email consuma quota, ma non entra nel conteggio.

L’acquisizione atomica della singola email impedisce che due processi acquisiscano **quella riga**, non protegge il budget comune. Il test con 60 righe già confermate non verifica questi casi.

**Correzione proposta:** definire una prenotazione persistente e atomica del budget giornaliero, coordinata con l’acquisizione, oppure un meccanismo equivalente. Gli esiti incerti devono consumare prudentemente il budget; specificare anche il trattamento delle riprove oltre mezzanotte. Aggiungere test con 59 invii e due consegne concorrenti, risposta persa e fallimento della registrazione dell’esito.

### 2. Importante — La finestra di idempotenza va ricontrollata durante la consegna

**Riferimenti:** Spec, righe 285–298; Piano, righe 274–291; `server/src/ops-alerts/index.ts`, righe 90–100.

La Spec prescrive la scadenza **prima del giro**, ma non richiede esplicitamente di ricontrollarla nell’acquisizione di ogni riga. Una candidata ancora valida all’inizio può raggiungere le 24 ore mentre vengono elaborate le precedenti. Lo stesso problema esiste attraversando il lunedì locale.

Il codice degli allarmi richiamato come modello include invece il controllo temporale anche nell’`UPDATE` di acquisizione. Per W24 deve essere adattato esplicitamente a `first_attempt_at` e alla settimana locale. Resend conserva le chiavi per [24 ore](https://resend.com/docs/dashboard/emails/idempotency-keys).

**Correzione proposta:** fissare nel piano il controllo atomico della scadenza a ogni acquisizione e una verifica immediatamente prima della richiesta, con margine prudenziale rispetto alla finestra del provider.

Integrare il Task 7 con prove di:

- invio accettato e risposta persa;
- errore nel salvataggio di `sent_at`;
- recupero di un’acquisizione abbandonata;
- scadenza raggiunta durante il giro;
- riprova con chiave e contenuto immutati.

Il finto provider deve distinguere le richieste ricevute dalle email effettivamente accettate: nelle riprove possono esserci più richieste legittime.

### 3. Importante — La guardia «una volta per settimana e montaggio» impedisce riprove e visite in altre famiglie

**Riferimenti:** Piano, righe 344–348; Spec, righe 324–328; `web/src/routes/MenuPage.tsx`, righe 36–40 e 68–80.

Il Piano limita `markWeekSeen` a una volta per settimana e montaggio. La Spec promette invece una nuova chiamata alla visita successiva dopo un errore.

Inoltre `MenuView` non è montato con una `key` legata alla famiglia: passando dalla famiglia A alla B può rimanere la stessa istanza. Una guardia basata sulla sola settimana può quindi impedire la registrazione della visita in B dopo averla registrata in A.

**Correzione proposta:** distinguere richieste in corso ed esiti confermati usando almeno `(familyId, weekStartsOn)`. Liberare la guardia dopo un errore e definire il ripristino della cache ottimistica, proteggendola dalle letture già in corso.

Aggiungere test per errore → uscita dalla settimana → nuova visita, e visita della stessa settimana in due famiglie senza rimontare la pagina.

### 4. Importante — La lettura separata dell’avviso può precedere la generazione pigra

**Riferimenti:** Spec, righe 188–190 e 314–315; Piano, righe 146–158 e 327–348; `server/src/menu/router.ts`, righe 15–33.

Le letture esistenti del menu eseguono `ensureWeeks`; la nuova operazione proposta legge soltanto `new_menu_week`.

Dopo un job fallito può quindi accadere che:

1. `getNewWeek` risponda `null`, perché la settimana ancora non esiste;
2. una lettura parallela del menu generi e confermi la settimana;
3. l’avviso resti assente fino a un successivo evento di aggiornamento.

Uno `staleTime` breve non avvia da solo una nuova richiesta al termine dell’intervallo: i normali aggiornamenti dipendono da montaggio, ritorno in primo piano o riconnessione. [Documentazione TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

**Correzione proposta:** stabilire una dipendenza esplicita fra la conclusione della lettura che può generare e l’aggiornamento dell’avviso, oppure integrare opportunamente la preparazione server. Aggiungere un test che faccia terminare `getNewWeek` prima del commit della generazione pigra.

### 5. Importante — Escludere la persistenza non nasconde l’avviso offline nella sessione aperta

**Riferimenti:** Spec, righe 330–332; Piano, righe 331–348; `web/src/api/persister.ts`, righe 326–350.

Il Piano verifica soltanto che la query non venga salvata su disco. Una risposta già presente nella cache in memoria rimane disponibile quando la rete scompare: pallino e giorni verdi possono restare visibili nella sessione aperta.

TanStack Query sospende le richieste offline senza eliminare i dati disponibili. [Documentazione sul funzionamento offline](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode).

**Correzione proposta:** subordinare esplicitamente pallino, evidenziazione e registrazione della visita allo stato online, secondo la scelta dichiarata nella Spec. Aggiungere prove per passaggio online → offline con avviso già caricato, navigazione offline e successiva riconnessione.

### 6. Importante — Il seme del primo rilascio usa il giorno del database invece del fuso della famiglia

**Riferimenti:** Spec, righe 139–144; Piano, righe 95–96 e 390–393.

Il filtro `starts_on > current_date` non coincide sempre con «settimana futura» per una famiglia.

Esempio: lunedì alle 00:30 UTC è ancora domenica a Los Angeles. La settimana che comincia quel lunedì è annunciabile secondo la regola locale, ma non viene inserita dal seme perché `starts_on = current_date`. Il primo cron può quindi spedire un’email arretrata che la migrazione intende sopprimere.

**Correzione proposta:** calcolare la data locale di ciascuna famiglia oppure seminare tutte le settimane già esistenti, lasciando alla pulizia la rimozione dello storico. Il test deve verificare il comportamento atteso, senza ripetere soltanto lo stesso predicato della migrazione, e includere famiglie su lati diversi della mezzanotte UTC.

### 7. Importante — Il nome accessibile non risolve la distinzione affidata al solo colore

**Riferimenti:** Spec, righe 319–323 e 353–357; `design/design.md`, righe 227–235; `web/src/components/DatePicker.module.css`, regola `.day`.

L’affermazione «Il verde non è l’unico segnale» non è corretta per chi vede il calendario ma non usa un lettore di schermo: l’aggiunta all’`aria-label` non produce un’alternativa visibile.

Il contrasto verde/bianco è adeguato, ma misura la leggibilità. Il contrasto fra il verde `#067a46` e il normale inchiostro `#232323` è circa **2,90:1**, inferiore anche alla distinzione di luminanza 3:1 descritta dal criterio WCAG. Tutti i numeri sono già in grassetto. Il [criterio sull’uso del colore](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) richiede un’alternativa visibile; le sole informazioni per tecnologie assistive non bastano.

**Correzione proposta:** concordare un secondo segnale visibile compatibile con «numeri verdi, senza puntini», per esempio una sottolineatura discreta. Aggiornare insieme Spec, design e test, conservando il giorno selezionato scuro con testo bianco.

### 8. Importante — La cache pubblica delle miniature contraddice la scomparsa delle foto rimosse

**Riferimenti:** Spec, righe 54–55 e 269–275; specifica principale, righe 1048–1053; `server/src/photos/serve.ts`, righe 9–12 e 29–35.

La Spec promette che una foto rimossa non compaia più nelle email vecchie, ma prescrive `Cache-Control: public, max-age=604800`.

Una copia già memorizzata può essere riutilizzata per sette giorni senza interrogare la rotta: il controllo `app.served_photo` protegge soltanto le richieste che raggiungono il server. Il test «foto rimossa → 404» non dimostra la scomparsa dalle copie già scaricate.

La scelta modifica inoltre la precedente decisione esplicita di evitare cache HTTP non svuotabili dall’app.

**Correzione proposta:** scegliere fra una politica di cache coerente con la revoca sul server e l’accettazione della permanenza delle copie. In entrambi i casi evitare una garanzia assoluta sulle immagini già scaricate dai client email; riportare chiaramente il limite e l’eccezione alla decisione precedente.

### 9. Minore — Il piano non recepisce le dipendenze aggiornate da W23 e W22

**Riferimenti:** Spec, righe 404–407; Piano, Task 9–11; `progetto/coordinamento/registro.md` del checkout principale, righe 34–35.

L’ordine W23 → W24 è già deciso, mentre la Spec lo lascia ancora al coordinatore e il Piano non inserisce il riallineamento obbligatorio prima della verifica finale.

Anche «W22: nessun file in comune previsto» è inesatto: il piano di W22, sul suo branch, include `PreferencesPage.tsx` alle righe 322–325 e `design/design.md` alle righe 602–605.

**Correzione proposta:** aggiungere un passo esplicito di riallineamento dopo W23 e prima della verifica finale/PR. Verificare la barra con «Oggi», calendario con avviso e borsa, preservando focus e aggiornamento della data introdotti da W23. Registrare l’intersezione con W22 e adeguare lo skeleton delle Preferenze alla nuova opzione.

### 10. Minore — Manca l’applicazione della migrazione nella sequenza del Task 1

**Riferimenti:** Piano, righe 91–100 e 390–393.

Dopo aver scritto la migrazione, il Task 1 passa direttamente a `supabase test db`. Il comando esegue i test sul database locale: manca il passaggio che applica la nuova migrazione.

Per il primo rilascio, inoltre, un normale reset con dati caricati dopo le migrazioni non prova il seme su settimane preesistenti.

**Correzione proposta:** inserire esplicitamente l’applicazione locale della migrazione prima del secondo giro pgTAP. Per il test di aggiornamento, preparare il database alla migrazione precedente, inserire le settimane e applicare W24; documentare una sequenza ripetibile senza dati o credenziali di produzione.

## Aspetti verificati senza rilievi autonomi

- **Modello e RLS:** preferenza nella tabella privata corretta; chiave composta delle visite coerente con `family_members`; cancellazioni a cascata; annunci e corpi non accessibili ad `authenticated`; funzioni privilegiate con `search_path` vuoto e destinatari espliciti. Il Piano prevede anche l’aggiornamento del controllo generale degli ACL.
- **Transazioni e isolamento:** miniature fuori transazione; annuncio e corpi registrati atomicamente; invio separato dalla generazione; gestione degli errori per famiglia e passi del cron indipendenti. Non serve cambiare la transazione di `generateWeek`.
- **Preferenza e lingua:** valore predefinito attivo anche senza riga, controllo prima dell’annuncio e prima dell’invio, testi bilingui, ripiego del nome della ricetta e contenuti HTML sottoposti a escaping.
- **Contratto e MCP:** le nuove firme sono compatibili con le convenzioni attuali. `collectTools` esclude effettivamente `mcp: false`; la preferenza resta disponibile tramite il profilo. L’esclusione dall’elenco degli strumenti non costituisce un divieto generale per un token agente di chiamare REST/RPC.
- **Prove senza email reali:** Mailpit e `fetch` finto sono coerenti con il trasporto esistente. I vincoli del Piano vietano chiavi di produzione e richiedono configurazione locale anche per la build web.

## Decisioni per coordinatore o utente

1. **Eccezione alla parità MCP.** Confermare l’esclusione delle due operazioni dell’avviso: è ragionevole per uno stato di visualizzazione personale, ma amplia le eccezioni della sezione 13 della specifica principale.
2. **Accessibilità del calendario.** Scegliere il secondo segnale visibile del rilievo 7, mantenendo numeri verdi e assenza di puntini.
3. **Miniature rimosse.** Decidere quale permanenza delle copie sia accettabile e allineare cache e promessa di prodotto.
4. **Invii incerti.** Confermare esplicitamente il compromesso: per evitare doppioni, una consegna ambigua o scaduta può lasciare una persona senza email. L’avviso in app rimane disponibile.
5. **Primo rilascio.** Confermare la soppressione delle email delle settimane già preparate e la possibile comparsa del pallino anche a chi le aveva già guardate: sono scelte del worker, dichiarate nella Spec.

Revisione svolta in sola lettura. Nessun file modificato, nessuna email inviata e nessuna operazione sulla produzione. Non ho eseguito build o suite dell’app: questa è una revisione di spec e piano, non una validazione dell’implementazione W24.