# Al worker W1: decisioni sulla review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-spec-piano.md`
(verdetto: approvabile con correzioni). Applica tutti i sette rilievi come proposto:

1. **Schema di W2 (bloccante):** allinea spec, query, fixture e dati di prova alla spec di
   W2 (`/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md`):
   schema `app`, `profiles.user_id`, `user_roles` con `recipe_curator`/`app_admin`,
   `family_members.role` con `family_admin`/`member`, profilo creato dal trigger. La
   fixture provvisoria deve usare gli stessi nomi; nessun ripiego silenzioso alla fixture
   quando lo schema reale c'è.
2. **Log senza segreti:** campi diagnostici scelti e id di correlazione; test che il
   logger non riceva password, bearer token o stringhe di connessione.
3. **Claim obbligatori:** `exp` obbligatorio (`requiredClaims`), `sub` e `session_id`
   UUID, `client_id` se presente stringa non vuota; un `client_id` invalido dà
   `unauthorized`, mai canale web. Test negativi che non arrivano al database.
4. **Validazione MCP:** adattatore che normalizza anche la validazione fatta dall'SDK in
   `{ code: 'invalid', data: { issues }, message }` localizzato; prova via `/mcp` con
   utente it-IT e en-GB.
5. **Revoca e `web_only`:** sessione e profilo verificati prima del rimando `web_only`
   (messaggio nella lingua del profilo); controllo della sessione anche all'ingresso MCP,
   compresi `initialize` e `tools/list`. Test con token revocato.
6. **CI contro lo schema reale:** la consegna completa di W1 richiede in CI le migrazioni
   di W2 e nessuna suite di integrazione saltata (database assente = fallimento). Ordine:
   W2 si unisce prima della PR completa di W1. Aggiungi il riuso della connessione dopo
   rollback.
7. **Convenzioni:** identificativi obbligatori e non nullabili, `knownVersion` stringa
   facoltativa; test negativi.

Punti decisi dal coordinatore:

- **Contatori:** nella tua spec fissa il contratto osservabile (cresce al massimo una
  volta per transazione che cambia i dati letti); il meccanismo è quello di W2 (trigger
  per riga con incremento deduplicato per transazione). Togli «trigger per istruzione».
- **Integrazione GitHub di Supabase:** la verifica esce dal task 10 e diventa un passo a
  sé, prima del merge di W2: lo faccio io con l'utente. Nel piano lascia solo il rimando.
- **Prova OAuth:** il task 10 non chiede un nuovo collegamento con consenso (la pagina
  `/authorize` arriva nell'ondata 2). La prova reale della revoca va nell'attività
  «Collegamento degli agenti» con questo criterio: revocare un client, riusare il suo
  access token non scaduto su MCP, RPC e REST, verificare il rifiuto e che gli altri
  client e la sessione web restino attivi. Scrivilo nella sezione «Decisioni da
  riportare».

Correggi spec e piano, commit, poi `STATO: SPEC_E_PIANO_CORRETTI`.
