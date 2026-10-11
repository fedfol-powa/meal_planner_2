**Verdetto: APPROVABILE CON CORREZIONI**

Seconda review in sola lettura del commit `a45654c`, confrontato con il checkout principale a `100d7e6`, il messaggio `w3-04-review-spec.md` e la voce «Gestione del ricettario, review di spec e piano» del piano generale.

Riferimenti:

- **S**: [spec di dettaglio](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario-mcp/progetto/superpowers/specs/2026-10-11-ricettario-mcp.md).
- **P**: [piano di implementazione](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario-mcp/progetto/superpowers/plans/2026-10-11-ricettario-mcp.md).
- I percorsi del codice sotto sono relativi al repository; `contract/`, `server/`, `web/` e `supabase/` risultano identici fra worktree e main esaminato.

**Rilievi nuovi o non completamente risolti**

1. **Importante — Manca la ricerca globale delle ricette pubblicate per il curatore.**

   **Riferimenti:** S:240–252; P:711–718, 724–727; `contract/src/recipes/recipes.ts:54–75`.

   `overview` permette di ritrovare bozze e archiviate, ma non le ricette pubblicate senza revisione aperta. `startRevision`, `setArchived` e `listVersions` richiedono già il `recipeId`. La ricerca esistente, `recipes.search`, richiede invece appartenenza a una famiglia e `familyId`.

   In una conversazione nuova, un curatore senza famiglia non può trovare una ricetta pubblicata da modificare, archiviare o ripristinare. La lettura del documento esiste, ma manca il percorso per scoprirne l’identità.

   **Correzione proposta:** aggiungere una ricerca o un elenco globale riservato ai curatori, con identificativo e stato, e documentare il percorso ricerca → lettura della versione → operazione. Testarlo con un curatore senza famiglia e senza identificativi conservati.

2. **Importante — Il rilievo 7 resta parzialmente aperto: il timestamp precede ancora possibili attese.**

   **Riferimenti:** S:417–425; P:1753–1770, 1816–1818; `supabase/migrations/20261011100700_versions.sql:29–33,147–156`.

   Il piano legge `clock_timestamp()` dopo i lock di bozza e ricetta, ma **prima** dell’aggiornamento delle proiezioni. Quest’ultimo attiva il trigger che aggiorna la riga globale `catalogue_state`: può quindi attendere una transazione che modifica un altro ingrediente o un’altra ricetta.

   Una pubblicazione può acquisire il timestamp prima delle 15:30, attendere quel contatore e inserire la versione dopo le 15:30, ancora retrodatata per R1. Non è lo scarto di pochi millisecondi senza attese dichiarato dalla spec. Il test P:1682–1706 blocca soltanto la ricetta e non copre questo caso.

   **Correzione proposta:** fissare l’istante effettivo dopo le attese delle scritture preliminari, al momento dell’inserimento della versione, mantenendolo identico per la chiusura della bozza. Aggiungere un test con contatore globale occupato da un’altra transazione e verifica tramite `app.recipe_version_at`; applicare la stessa soluzione al ripristino.

3. **Importante — Il rilievo 10 resta aperto per il rifiuto della mutazione web.**

   **Riferimenti:** S:572–576; P:2793–2803, 2819–2828, 2884–2887.

   La rimozione delle viste dopo `forbidden` è prevista soltanto nelle letture. `useBringBack` gestisce esclusivamente il successo.

   Se il ruolo viene revocato dopo il caricamento e il curatore preme «Riporta nel ricettario», la mutazione riceve `forbidden`, ma bozze e archiviate restano nella cache e sullo schermo fino a una successiva rilettura.

   **Correzione proposta:** condividere la gestione della revoca anche con `useBringBack`: rimuovere le query `catalogue` e aggiornare il profilo. Testare dati già visibili → mutazione rifiutata → viste rimosse.

4. **Minore — La registrazione web non comprende esplicitamente il wrapper del client finto.**

   **Riferimenti:** P:2691–2697; `web/src/api/types.ts:58–62`; `web/src/api/fake/fakeApi.ts:286–298`.

   Il piano aggiunge `catalogue` a `SERVER_AREAS` e all’oggetto finto, ma `withTransport` restituisce un elenco esplicito delle aree. Senza aggiungere anche lì `catalogue`, il valore restituito non soddisfa più `Api`: la seconda PR fallisce il typecheck e perde l’area in modalità finta.

   **Correzione proposta:** includere esplicitamente `catalogue: wrap(api.catalogue)` e verificare il client restituito da `fakeClients`, anche offline. Il test proposto per `realClients` non copre questo wrapper.

**Punti per il coordinatore**

Registrare la lettura globale del punto 1 e precisare l’istante R1 del punto 2. Non emergono nuove decisioni di prodotto da chiedere all’utente.

**Limiti della verifica**

Confronto statico: nessun file modificato, nessuna migrazione o suite eseguita. La divisione delle PR recepisce il supporto anticipato di `not_allowed`; il test proposto ora verifica correttamente `checkContract(contract) === []`. Il superamento effettivo di typecheck, test e build richiederà l’implementazione. Comportamento dei lock e di `clock_timestamp()` verificato tramite Context7.