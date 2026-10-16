**Revisione PR #53 — DA CORREGGERE**

Esaminato il commit `8c8eda3`, branch `traguardo/specifica-c`, con `git diff origin/main...HEAD`. Confrontati i tre documenti modificati con la spec di dettaglio C, il codice unito, il brief W11, i messaggi `w11-01…w11-07`, le revisioni precedenti e il piano generale nel checkout principale. Considerati come riferimento editoriale i commit `919b723` e `827ecc2` della PR #50.

La copertura delle decisioni è ampia e lo stato **«unita il 16 ottobre 2026, non ancora rilasciata»** è riportato correttamente. Restano due incoerenze importanti e tre rilievi minori. Nessun rilievo bloccante.

**1. Importante — Resta la promessa di atomicità dell’intera cancellazione dell’account**

Riferimento: [specifica principale:922](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:922).

Il paragrafo «Transazioni» comprende ancora l’eliminazione dell’account fra le operazioni «atomiche, in una transazione o in una funzione Postgres». C ha invece deciso una procedura in tre passi: transazione applicativa, cancellazione in Auth dopo il commit, chiusura. Gli stati intermedi sono previsti e recuperabili.

Il nuovo testo della sezione 7 lo descrive correttamente, ma non corregge questa garanzia generale. Il codice conferma il confine: [server/src/account/delete.ts:84](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/server/src/account/delete.ts:84) esegue la prima transazione e restituisce il seguito `afterCommit`; la [spec di dettaglio:1010](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md:1010) distingue esplicitamente le interruzioni possibili.

**Correzione proposta:** limitare l’atomicità alla prima transazione sui dati dell’app e rimandare alla sezione 7 per il completamento in Auth. Precisare nello stesso senso «evitare cancellazioni parziali» alla riga 2390: nessuna successione o cancellazione familiare a metà nella prima transazione; completamento esterno riprendibile.

**2. Importante — La tabella MCP attribuisce il solo rimando web anche a `family_getDeletion`**

Riferimento: [specifica principale:3301](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3301).

La riga «Famiglia e account» associa «restituire solo l’URL della pagina web» a entrambi gli strumenti `family_getDeletion` e `family_delete`.

Il primo è invece una lettura disponibile anche tramite MCP: restituisce nome, membri, numero di settimane e possibilità di eliminare. Solo `family_delete` ha `webOnly`. Lo stabiliscono sia la [spec di dettaglio:592](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md:592) sia il [contratto:61](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/contract/src/family/members.ts:61).

La formulazione introduce un’eccezione MCP più ampia di quella approvata e contraddice l’elenco corretto poco sopra.

**Correzione proposta:** distinguere «leggere il riepilogo dell’eliminazione (`family_getDeletion`)» da «richiedere l’eliminazione (`family_delete`), ottenendo solo il collegamento alla pagina web».

**3. Minore — Le vecchie frasi sulla validità dei link non distinguono quelli creati dalla persona rimossa o uscita**

Riferimento: [specifica principale:2200](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2200).

Restano le affermazioni «gli stessi link restano validi per gli altri» e «L’uscita volontaria non blocca i link». Con C valgono soltanto distinguendo l’autore: i link creati dalla persona rimossa o uscita vengono revocati per tutti.

La regola nuova è riportata correttamente alla riga 2169 ed è applicata dalle funzioni SQL di [rimozione:534](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/supabase/migrations/20261016100000_family_management.sql:534) e [uscita:561](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/supabase/migrations/20261016100000_family_management.sql:561). Il vecchio riepilogo resta però troppo assoluto.

**Correzione proposta:** chiarire che la rimozione impedisce il rientro personale tramite link precedenti, senza invalidare per gli altri quelli creati da altri amministratori; l’uscita volontaria non impone un link successivo, ma revoca comunque quelli creati da chi esce.

**4. Minore — La sezione 17 presenta ancora come restante una verifica appena dichiarata realizzata**

Riferimento: [specifica principale:3791](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3791).

Il testo conserva «resta la revoca alla cancellazione di un account (ondata 3)» e subito dopo aggiunge «Realizzata con l’attività C». È un residuo del testo precedente: chi legge l’elenco delle verifiche aperte riceve due indicazioni opposte.

**Correzione proposta:** sostituire il periodo precedente, oppure renderlo esplicitamente storico: «Restava da realizzare…; realizzata con C, unita e non ancora rilasciata». La verifica sull’iPhone può restare distinta nella sezione 10.

**5. Minore — Alcuni passaggi duplicano eccessivamente la spec di dettaglio e il registro**

Riferimenti nella specifica principale: [riepilogo iniziale:325](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:325), [inviti:2156](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2156), [chiusura della decisione:3641](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3641), [registro:3695](/Users/fedfol/Projects/meal_planner_2/.claude/worktrees/agent-a2b455c9679a6cf24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3695).

Le stesse decisioni ricompaiono nel riepilogo iniziale, nelle sezioni operative, negli scostamenti del prototipo, nella chiusura della sezione 15 e nella lunga riga del registro. In particolare:

- la sezione 7 riproduce numerosi testi integrali di pulsanti e dialoghi già definiti nella spec C;
- la voce chiusa «Cancellazione» ripete anche tutto ciò che «era da decidere»;
- il registro elenca nuovamente strumenti, tabelle, trigger e dettagli della cache.

Questo aumenta i punti da aggiornare senza aggiungere requisiti.

**Correzione proposta:** mantenere nelle sezioni pertinenti regole, garanzie ed esiti; rimandare alla spec C per testi completi e sequenze delle schermate. Ridurre la sezione 15 a esito, data e rimandi, e il registro a decisioni principali, stato e sezioni aggiornate. Gli scostamenti in `design/percorsi.md` sono invece pertinenti al ruolo di quel documento.

**Verifiche**

| Controllo | Esito |
|---|---|
| `git diff --check origin/main...HEAD` | Superato |
| `npm run typecheck` | Superato in tutti i workspace |
| Test dominio | 270 superati |
| Test contratto | 58 superati |
| Test web | 857 superati, 11 saltati |
| Test server senza database configurato | 113 superati, 457 saltati |
| Build web | Superata; avviso sul bundle oltre 500 kB |
| Test degli script alla radice | 186 superati, 10 falliti, 29 saltati; errore aggiuntivo nel setup del server locale |

Test e build hanno richiesto `--configLoader runner`, e i test `--no-cache`, perché il caricatore standard tenta di scrivere nella directory delle dipendenze del checkout principale, fuori dai percorsi consentiti. I fallimenti degli script riguardano dipendenze non risolte (`postgres` nei checkout temporanei, percorso locale di Wrangler), sottoprocessi che ricadono sul caricatore standard e `listen EPERM` nel sandbox. Non li attribuisco al diff documentale della PR.

Non eseguiti pgTAP, integrazione con database o collaudo sull’iPhone. Il rapporto non certifica il rilascio di C.

**Punti per il coordinatore**

Non servono nuove decisioni di prodotto: le correzioni richieste allineano il testo alle decisioni già approvate. Nessun ulteriore rilievo sostanziale sul piano generale o su `design/percorsi.md`; le interfacce condivise di C erano già presenti nel piano.

Nessun file tracciato modificato, nessun commit o commento pubblicato sulla PR. Worktree pulito al termine; rapporto non scritto su file.

**Verdetto: DA CORREGGERE.**