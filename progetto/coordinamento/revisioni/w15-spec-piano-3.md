# Terza revisione W15 — spec e piano delle email dell’app

**Verdetto: APPROVABILE CON CORREZIONI**

Il nuovo disegno risolve i problemi strutturali delle revisioni precedenti e rispetta le semplificazioni decise. `generate_link` di tipo `recovery` è adatto al flusso previsto. Resta una correzione importante nella protezione dall’aggiornamento PWA dopo un salvataggio fallito, più due precisazioni minori. Non serve riprogettare il flusso.

Revisione in sola lettura del branch `ondata3/email`, commit `8107d6eb9137c1e72a51a72e5d34937de7fe8c48`. Confrontati brief, revisioni precedenti, messaggi 02 e 03, specifica principale, piano generale del checkout principale e codice interessato. Consultati Context7 e il sorgente Supabase Auth **v2.197.0**. Nessun file modificato. Test e build non eseguiti: questa revisione riguarda spec e piano, non un’implementazione già realizzata.

## Rilievi

### 1. Importante — La protezione PWA termina anche quando il salvataggio è ancora ripetibile

**Riferimenti:** [spec:315](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:315), [spec:328](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:328), [piano:328](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:328).

La protezione ora comincia correttamente prima della verifica, ma termina al salvataggio concluso «riuscito o fallito». Un errore recuperabile, per esempio di rete o di password debole, lascia invece il modulo utilizzabile e il token soltanto in memoria, con il frammento già rimosso.

Sequenza possibile:

1. verifica riuscita;
2. salvataggio fallito, con possibilità di correggere o riprovare;
3. passaggio a un’altra app e ritorno, senza un campo di testo focalizzato;
4. W8 rileva una versione nuova e ricarica, perdendo il token.

Il ritorno in primo piano azzera il segno d’interazione e ricontrolla la possibilità di ricaricare: [update.ts:85](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/web/src/pwa/update.ts:85). `trackBusy` termina quando la promessa si conclude, anche con errore: [busy.ts:13](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/web/src/pwa/busy.ts:13).

**Perché conta:** dopo un errore recuperabile l’app può interrompere autonomamente il percorso e obbligare a chiedere un altro link. La regola sul cursore nel campo non protegge tutto questo stato.

**Correzione proposta:** mantenere la pagina occupata finché conserva un token verificato utilizzabile e offre salvataggio o ritentativo. Liberarla al successo, a un esito terminale o all’abbandono della pagina. Si può usare `trackBusy` per le richieste e `useBusyCheck` per lo stato conservato fra esse.

Aggiungere un test: verifica riuscita → salvataggio fallito → ritorno in primo piano con aggiornamento disponibile → nessun reload → ritentativo riuscito.

### 2. Minore — Manca la conversione dell’account sparito nella risposta di `accept`

**Riferimenti:** [spec:175](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:175), [spec:196](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:196), [spec:225](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:225).

Dopo la chiusura dell’invito, la funzione SQL può restituire `unavailable`, oppure `sendPasswordEmail` può restituire `absent`. Per il reinvio è definita la conversione `absent → unavailable`; per `accept` manca, e il suo enum non contiene nessuno dei due valori.

**Perché conta:** il comportamento centrale è sicuro — nessuna ricreazione dell’account — ma il worker deve inventare la risposta di un caso esplicitamente previsto.

**Correzione proposta:** definire una conversione per entrambi gli esiti, coerente con il contratto e con il testo mostrato. Provare separatamente la cancellazione prima dell’autorizzazione SQL e quella dopo l’autorizzazione ma prima di `generate_link`. Nel primo caso non occorre chiamare Auth; nel secondo si verifica il `404`.

### 3. Minore — La descrizione dei tipi che possono creare utenti omette `invite`

**Riferimento:** [spec:92](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:92).

La parentesi «la creazione esiste solo per `magiclink` e `signup`» è inesatta: anche `generate_link` con tipo `invite` può creare un utente assente. Il ramo è presente in [`adminGenerateLink`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/mail.go#L116-L168).

**Perché conta:** è un’imprecisione nella sezione dichiarata verificata, senza conseguenze sul percorso scelto, che usa esclusivamente `recovery`.

**Correzione proposta:** aggiungere `invite` oppure limitarsi all’affermazione pertinente: «con tipo `recovery` non crea utenti».

## Verifica nel sorgente di Supabase Auth

Il comportamento necessario a W15 è confermato:

- **Nessun utente per quell’email:** il ramo `recovery` restituisce `404 user_not_found` prima della creazione. **Utente esistente, confermato o no:** aggiorna `recovery_token` e `recovery_sent_at`, registra il codice e restituisce `hashed_token`; non chiama l’invio delle email. [Generazione del link](https://github.com/supabase/auth/blob/v2.197.0/internal/api/mail.go#L46-L301).
- **Sostituzione del link:** la registrazione elimina il precedente codice dello stesso tipo per l’utente. [Gestione dei codici monouso](https://github.com/supabase/auth/blob/v2.197.0/internal/models/one_time_token.go#L121-L145).
- **Verifica:** `POST /verify` accetta `token_hash` con `type=recovery`; controlla la scadenza usando `RecoverySentAt` e `Mailer.OtpExp`. `recoverVerify` conferma l’email se necessario. [Verifica del codice](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L603-L648), [conferma dell’utente](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L348-L375).
- **Password attuale:** la verifica POST emette una sessione `OTP`, inclusa da `IsRecovery()` fra quelle ammesse all’eccezione. Il salvataggio può quindi avvenire senza password attuale anche con l’opzione accesa. [Emissione della sessione](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L268-L273), [classificazione](https://github.com/supabase/auth/blob/v2.197.0/internal/models/factor.go#L63-L69), [controllo nel salvataggio](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go#L154-L170).

Queste verifiche sostengono il disegno; le prove sullo stack previste dal piano restano necessarie per validare configurazione e integrazione effettive.

## Stato dei rilievi precedenti

| Seconda revisione | Esito nel nuovo disegno |
|---|---|
| 1 — Nome della famiglia nei metadati temporanei | **Risolto.** È un parametro della singola email del server; reinvio generico e template Supabase separato. |
| 2 — Sovrascrittura di `password_pending` | **Risolto.** Il metadato è eliminato; l’etichetta descrive precisamente `email_confirmed_at`. |
| 3 — Versione basata sul conteggio | **Risolto.** Impronta delle coppie ordinate, calcolata prima del confronto; previsto anche il test a conteggio invariato. |
| 4 — Reload durante la verifica | **Risolto per la verifica; residuo dopo un salvataggio fallito**, descritto nel rilievo 1. Corretto anche il messaggio sull’esito ambiguo della rete. |
| 5 — Adozione concorrente della sessione | **Risolto.** Nessuna adozione; salvataggio con il token del link e successivo accesso normale. |
| 6 — Riconciliazione che esclude eventi conclusi | **Risolto entro il perimetro deciso.** Stati conclusi compresi, finestra di sette giorni e limite dei job `done` dichiarato; previsti test evento → interruzione → completamento → riconciliazione. |
| 7 — Atomicità dell’allarme che blocca il job | **Risolto.** Transazioni separate; l’abbandono si conferma anche se l’allarme non si registra. |
| 8 — Destinatario variabile nel payload | **Gestito secondo la decisione.** Il `409` chiude la riga come ambigua, senza rispedizioni. |
| 9 — Allarmi scaduti senza seguito operativo | **Recepito.** Elenco e gestione manuale tramite dati e log, senza riattivazione o rispedizione. |
| 10 — Prove non integrate nella CI | **Risolto nel piano.** Inclusi workflow, Mailpit, servizi Auth aggiuntivi, variabili, pulizia e adattamento dei test esistenti. |

Restano recepite anche le correzioni della prima revisione su policy `app_job`, lettura del backup e prova di ripristino, credenziale catturata per il salvataggio, assenza di ricreazione dell’account, nome della famiglia nelle riprese dopo scadenza, non enumerazione limitata alla UI e matrice di transizione/rollback.

## Punti da decidere dal coordinatore o dall’utente

**Nessuna nuova decisione di prodotto necessaria.** Le scelte del messaggio 03 restano valide. Le correzioni richieste sono circoscritte: prolungare la protezione PWA negli stati recuperabili e completare la conversione degli esiti di `accept`, mantenendo allineati spec, piano e test.