# W15, rilievi della seconda revisione di spec e piano

Rapporto: `progetto/coordinamento/revisioni/w15-spec-piano-2.md` (DA RIFARE, 10 rilievi).
Leggilo per intero. Molti rilievi nascono da stato condiviso nei metadati di Auth e
dall'adozione automatica della sessione: invece di proteggere quei meccanismi, **li
togliamo**. Decisioni del coordinatore:

## 1. Prima email spedita dal server (rilievi 1, 2, 3)

- La prima email («Scegli la password», con il nome della famiglia se c'è) e «Rimanda
  l'email» dalla pagina dell'invito le spedisce **il server con Resend**, non Supabase: il
  server ottiene il link con l'API di amministrazione `generate_link` di tipo `recovery`
  (verifica con Context7 e nel sorgente che non spedisca nulla, che non crei utenti e che
  restituisca il `hashed_token` utilizzabile con `verifyOtp` e `type=recovery`), compone
  l'email nella lingua della pagina e la spedisce con la chiave Resend del server già
  prevista per gli allarmi. Il nome della famiglia è un parametro della singola spedizione,
  mai nei metadati. Il reinvio usa il testo generico; l'intervallo di 60 secondi lo applica il
  server (limitatore del Worker o riga nel database, scegli e motiva).
- Il template `recovery` di Supabase serve solo alla «Password dimenticata» pubblica, con il
  solo testo del recupero, nelle due lingue dai metadati `locale`.
- Niente `family_name` né `password_pending` nei metadati: restano solo nome e `locale`.
- **Etichetta:** diventa «Non ha ancora confermato l'email» (testo da proporre nelle due
  lingue), letta da `auth.users.email_confirmed_at is null` con la funzione già prevista.
  Lo stato passa solo da vero a falso (non c'è cambio dell'email), quindi un ambito di
  versione con il conteggio basta; se non sei sicuro della monotonia, usa l'impronta delle
  coppie ordinate come propone il revisore. Chi apre il link e non salva la password usa
  «Password dimenticata»: è accettato.
- Template, testi e test si semplificano di conseguenza; i template delle email del server
  stanno nel codice del server, con i colori di `design/design.md`.

## 2. Nessuna adozione automatica della sessione (rilievi 4, 5)

- `/password` dichiara la pagina occupata con `trackBusy` **prima** della verifica e fino
  al salvataggio concluso.
- Dopo il salvataggio la pagina non adotta la sessione del link: mostra «Password salvata»
  e «Accedi», che porta a `/login` con l'email già scritta (nella PWA l'accesso serve
  comunque). Il token della verifica si usa solo per il salvataggio e poi si scarta.
  Togli `getSession`/`setSession` dal percorso.
- Rete ambigua dopo la verifica: messaggio con «Chiedi un link nuovo», senza promettere
  che il codice non sia consumato.

## 3. Allarmi (rilievi 6, 7, 8, 9)

- L'abbandono del job si conferma anche se la registrazione dell'allarme fallisce: niente
  transazione comune; l'allarme si recupera dalla riconciliazione.
- La riconciliazione rilegge gli stati persistiti su una finestra di 7 giorni, compresi gli
  stati già conclusi: job `abandoned`, job generati dopo la soglia del ritardo (se lo stato
  lo permette; altrimenti dichiara il limite), cancellazioni con tentativi ≥ 3 anche se poi
  completate, esportazioni mancanti negli ultimi 7 giorni. La chiave primaria evita i
  doppioni.
- Payload: a un `409` di idempotenza la riga si chiude come esito ambiguo con un log di
  errore, senza nuovi tentativi; non salvare il destinatario nella riga.
- Righe scadute o ambigue: nessuna rispedizione automatica né manuale. Il runbook dice come
  elencarle e che si leggono e si gestiscono a mano (log e database); lo script di elenco
  già previsto basta.

## 4. CI (rilievo 10)

Workflow e script di avvio dello stack sono nei file da modificare del piano: Mailpit,
secondo servizio Auth con l'opzione della password attuale accesa, variabili, pulizia;
aggiorna i test dello stack esistenti che accettano inviti con la password.

Aggiorna spec, piano, test, runbook e «Decisioni da riportare nella specifica». Poi commit,
`STATO: SPEC_E_PIANO_CORRETTI`, e aspetta.
