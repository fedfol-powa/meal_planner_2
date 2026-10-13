# W9, revisione di spec e piano: da correggere

Rapporto completo: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w9-spec-piano.md`.
Correggi **tutti** i dodici rilievi nella spec e nel piano. Le decisioni del coordinatore
sui punti aperti:

1. **Ripresa dopo una creazione riuscita (rilievi 1, 5 e 11): il server non riscrive mai
   le credenziali di un account esistente.** Niente `PUT` della password né dei metadati.
   Se la creazione risponde `email_exists`, va in timeout o dà un esito ambiguo, il
   modulo legge l'utente con l'id prenotato: se esiste con l'email dell'invito, la
   creazione è considerata riuscita e si passa alla chiusura; altrimenti `account_exists`
   (o `internal` se non si riesce a leggere). Nome, lingua e password restano quelli del
   primo tentativo riuscito. La SPA prova `signInWithPassword` con la password appena
   scritta; se fallisce mostra «Il tuo account è pronto: entra con la password che hai
   scelto la prima volta» e porta a `/login` con l'email già scritta (una password
   dimenticata la reimposta l'amministratore dalla dashboard finché non c'è il dominio).
   Così la finestra di concorrenza sulle credenziali non esiste. Test deterministici con
   due accettazioni concorrenti e password diverse: la seconda non cambia nulla.
2. **Stack locale (rilievo 10): iscrizioni spente anche nello stack comune.** Persone di
   prova create con l'API di amministrazione negli helper (`web/src/test/stack.ts`,
   `scripts/oauth/agents-e2e.mjs`) **e** negli script `.sh` che passano le credenziali
   alle prove della password e di OAuth; via libera a toccare quei file, con modifiche
   minime e dichiarate. Configurazione dei test stack che li esegua davvero. Aggiungi la
   prova automatica dell'intero percorso (contratto e pipeline veri, Auth reale con
   iscrizioni spente, ruoli finali, famiglia nuova e menu generato).
3. **Connessioni (rilievo 4):** il contesto `public` non apre la transazione della
   pipeline; `get` apre una transazione breve, `accept` solo prenotazione e chiusura;
   nessuna connessione occupata durante la chiamata ad Auth, con un test sull'ordine.
4. **Revoca (rilievo 7):** revocabili dal web anche gli inviti scaduti ma ancora
   `pending` nel database.
5. Gli altri rilievi (CHECK senza sottoquery, ruoli come JSONB secondo la convenzione di
   `profile/views.ts`, creazioni serializzate su id ed email e su `create_family`, test
   pgTAP con `anon`, `useAreaMutation` e `INVALIDATIONS`, caso `public` in
   `permissions.ts`) come propone il revisore.

Fai commit, scrivi `STATO: SPEC_E_PIANO_CORRETTI` e aspetta: seguirà una seconda revisione.
