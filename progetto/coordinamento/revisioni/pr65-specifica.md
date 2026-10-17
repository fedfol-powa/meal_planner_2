**Verdetto: APPROVABILE CON CORREZIONI**

Revisione della PR #65, branch `docs/specifica-email`, commit `bb7dc9e`, confrontata con la spec email e con `main` a `ecdc14f`, che comprende la PR #64. La PR modifica soltanto i tre documenti richiesti.

**Rilievi**

1. **Importante — L’etichetta viene legata erroneamente alla scelta della password.**

   **Dove:** [design/percorsi.md:1210](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/design/percorsi.md:1210); nella [specifica principale:2691](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2691), anche alle righe 773 e 2646.

   Il testo dice che «Non ha ancora confermato l’email» resta finché la persona non sceglie la password. In realtà scompare quando viene confermata l’email, durante la verifica del link, **prima del salvataggio della password**. Chi apre il link e abbandona il modulo può quindi non avere più l’etichetta, pur non avendo scelto una password.

   Lo stabiliscono la spec di dettaglio, sezione 2, e [la migrazione:122](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/supabase/migrations/20261017100000_email.sql:122), che legge esclusivamente `email_confirmed_at`. Il caso è esplicitamente coperto dal test [email.stack.test.ts:147](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/server/test/stack/email.stack.test.ts:147).

   **Perché conta:** la documentazione attribuisce all’etichetta una garanzia che il sistema non fornisce e contraddice la descrizione tecnica già riportata nella stessa specifica.

   **Correzione proposta:** sostituire le condizioni sulla password con «finché l’email non è confermata» in tutte le occorrenze; precisare che la conferma può precedere il salvataggio e che, abbandonando il modulo, si usa «Password dimenticata».

2. **Importante — Manca l’eccezione per il 409 transitorio nella consegna degli allarmi.**

   **Dove:** [specifica principale:2040](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2040) e [piano generale:252](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/progetto/superpowers/plans/2026-10-11-piano-generale.md:252).

   Il riepilogo afferma che un `409` di idempotenza chiude la riga come ambigua, senza ritentativi. La [spec di dettaglio:526](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/progetto/superpowers/specs/2026-10-17-email.md:526) distingue invece `concurrent_idempotent_requests`: è transitorio, libera l’acquisizione e permette un nuovo tentativo. Il [codice unito:104](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-ab62c1cd548ff86f1/server/src/ops-alerts/index.ts:104) implementa questa eccezione.

   **Perché conta:** la fonte principale prescrive una chiusura definitiva anche per un errore recuperabile, perdendo una decisione necessaria alla consegna degli allarmi.

   **Correzione proposta:** specificare «ogni 409 tranne `concurrent_idempotent_requests`»; per quest’ultimo indicare `claimed_at = null` e ritentativo entro la finestra prevista. Allineare anche i riepiloghi nei registri.

**Altri controlli**

- Le decisioni finali della spec email risultano riportate, salvo le discrepanze sopra.
- La password sulla pagina dell’invito resta esplicitamente descritta come il flusso in produzione fino al rilascio, nella Parte 1 e nella sezione 7.
- Non risultano indicazioni operative residue che presentino D come ancora da implementare; i riferimenti precedenti nei registri sono storici.
- La sezione 14 registra gli scostamenti già decisi dal prototipo, senza modificare il linguaggio visivo approvato.

**Verifiche eseguite**

- `git diff --check`: superato; worktree rimasto pulito.
- `npm run typecheck`: superato.
- Test rilanciati con `--configLoader runner --no-cache`: dominio **274 passati**, contratto **65**, server **184**, web **982**. Saltati **574** test server e **11** web; le prove dello stack non sono state eseguite.
- Test degli script: **189 passati, 10 falliti, 29 saltati**, più un errore non gestito. I fallimenti osservati riguardano dipendenze mancanti nei percorsi attesi e restrizioni del sandbox su cache e socket.
- Build tentata con Auth locale, output in `/private/tmp` e senza il prebuild che modifica il worktree: non completata per i font generati mancanti in `web/public/assets/fonts`.

**Punti da decidere**

Nessuna nuova decisione di prodotto necessaria: le correzioni richieste sono già determinate dalla spec di dettaglio e dal codice unito. Nessun file modificato, nessun commento pubblicato sulla PR.