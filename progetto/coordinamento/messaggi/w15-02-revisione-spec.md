# W15, rilievi della revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w15-spec-piano.md` (verdetto DA RIFARE, 12
rilievi). Leggilo per intero: i rilievi sono tutti accolti e vanno corretti in spec e piano,
con i test, il runbook e la sezione «Decisioni da riportare nella specifica» aggiornati.
Verifica tu nel codice e nel sorgente di Supabase Auth ciò che il revisore afferma, prima di
correggere: se un rilievo non regge, scrivilo con l'evidenza.

## Decisioni del coordinatore sui punti aperti del rapporto

1. **Stato della prima password (rilievo 1).** Serve un indicatore dell'app, non dedotto da
   hash o conferma dell'email. Proposta da verificare: `user_metadata.password_pending: true`
   scritto alla creazione e tolto nella stessa chiamata che salva la password
   (`updateUser({ password, data: { password_pending: false } })`, una sola richiesta, quindi
   atomica in Auth); la funzione dell'etichetta legge quel campo. Che la persona possa
   modificarlo da sé è accettabile: danneggia solo la propria etichetta. Se trovi una via
   migliore, motivala. Correggi anche la motivazione sull'eccezione della password attuale
   per gli inviti e provala sullo stack con l'opzione accesa (obbligatoria, non facoltativa).
2. **Garanzia degli allarmi (rilievi 7 e 8).** Meglio un doppione raro che un allarme
   perso. Acquisizione atomica della consegna (`update … where sent_at is null and
   (claimed_at is null or claimed_at < now() - interval …) returning`), corpo salvato
   nella riga alla creazione e mai ricalcolato, ritentativi entro 24 ore (finestra di
   idempotenza di Resend); oltre, la riga resta non spedita con un log di errore. Contro le
   perdite prima dell'inserimento, una riconciliazione nel cron orario dagli stati
   persistiti (job `abandoned` o in ritardo senza allarme, esportazione del giorno assente
   dopo le 04:30, cancellazioni bloccate), così l'aggancio ai log non è l'unica fonte.
3. **Non enumerazione (rilievo 9).** Il requisito riguarda la UI. La pagina mostra lo stesso
   messaggio generico anche per il `429` per indirizzo (l'email è già partita da meno di un
   minuto); un messaggio diverso solo per il limite di progetto. Il canale residuo
   dell'endpoint pubblico di Supabase è accettato e va scritto nella spec come rischio
   noto.
4. **Reinvio e nome della famiglia (rilievi 10 e 11).** Il nome della famiglia sta solo nella
   prima email, quella spedita subito dopo l'accettazione, con il nome letto dentro la
   transazione di chiusura (o da una lettura autorizzata per `user_id` prenotato, non dal
   token), senza nuove precondizioni su prenotazione e chiusura; se il nome non è
   disponibile, l'email esce senza. «Rimanda l'email» spedisce il testo generico «Scegli la
   password per Cosa si mangia», mai il nome della famiglia. Il template di recupero
   distingue la prima password (con `password_pending`) dal recupero ordinario solo nel
   testo, senza nominare famiglie. Per il rilievo 5, la spedizione non deve poter creare
   account: valuta se la prima email può partire con il recupero (che non crea utenti) e
   un template condizionale; se resta `/invite`, dimostra con un test che la corsa con la
   cancellazione non crea un account nuovo.
5. **Ritorno alla versione precedente (rilievo 12).** Correzione in avanti come scelta
   normale. Il runbook dice che un rollback alla versione senza `/password` rende inutili i
   link spediti nel frattempo: chi li ha ricevuti usa «Password dimenticata» dopo la
   correzione. Aggiungi la matrice di transizione chiesta dal revisore (SPA vecchia con
   invio riuscito e fallito, apertura di `/password#…` dalla shell vecchia) con i test
   possibili e il resto nelle prove a mano.

Rilievi 2, 3, 4 e 6: correggili come propone il revisore (policy per `app_job` o funzioni
circoscritte con test sotto il ruolo reale; `SELECT` per `app_backup` con esportazione e
ripristino provati con un allarme presente; sessione catturata come in W7; stato della
password fuori dalla versione della famiglia o dentro il confronto, con il test di due
letture con `knownVersion`).

Finito: commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta.
