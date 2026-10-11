# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 revisione-pasti | W1 menu (da rinominare) | w1:pW | traguardo/revisione-pasti | .worktrees/revisione-pasti | PR #20 unita. Sessione chiusa, pane già nel worktree (branch avanzato a main); avvio di `claude --permission-mode auto` bloccato dal classificatore: serve l'utente | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo-web | .worktrees/profilo | PR #21 unita; libero | 11/10 |
| W3 ricettario-mcp | W3 ricettario-mcp | w1:pA | traguardo/ricettario-mcp | .worktrees/ricettario-mcp | PR #23 (server di `catalogue`): review «approvabile con correzioni» (revisioni/w3-pr23.md, 3 rilievi); correzioni in corso da messaggi/w3-05-review-pr23.md. A PR_CORRETTA: verifica breve Codex, CI con suite database eseguite → merge. Il web dopo il merge della #23 | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa-web | .worktrees/spesa | PR #22 unita; libero | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web-client | .worktrees/web | Libero (PR #17 unita). Candidato per collegamento agenti o esportazione R2, che richiedono passi esterni dell'utente | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario-web | .worktrees/ricettario | PR #19 unita; libero | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso


- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo. Ordine dell'ondata 2 approvato dall'utente: vedi piano generale, «Ordine dell'ondata 2».

0. **In corso (ordine dell'ondata 2), aggiornato l'11/10 alle 17:40:**
   - **Merge web in sequenza: completati** (#20, #21, #22 unite). Prima era: W4 avvisato di portare di portare la #21
     su main → merge → scrivere a W4 di portare la #22 su main → merge. #21 e #22 sono già
     approvate: dopo il riallineamento basta controllare CI verde e risoluzione dei conflitti
     (diff dei file condivisi del web), senza nuova review salvo modifiche sostanziali.
   - **Dopo il merge della #20:** `/clear` a W1 e messaggio di ripresa per la revisione dei
     pasti: la sessione va riavviata nel worktree `.worktrees/revisione-pasti` (branch
     `traguardo/revisione-pasti`, già creato): `/exit`, `herdr pane run w1:pW "cd
     <worktree> && claude --permission-mode auto -n 'W1 revisione-pasti'"`, rinominare la
     tab, poi «Leggi progetto/coordinamento/brief/w1-revisione-pasti.md e
     progetto/coordinamento/protocollo-worker.md ed eseguili, partendo dal brainstorming».
     Nel brainstorming: controllare che ogni scrittura abbia la lettura che la rende usabile e
     che ogni PR passi da sola i controlli di main.
   - **W3:** implementazione della parte server di `catalogue`; review della PR quando la
     apre; il web dopo il merge della #21.
   - **W5 e W6 liberi.** Attività restanti senza assegnatario: collegamento degli agenti
     (serve confermare il server OAuth sul progetto di produzione, da verificare prima) ed
     esportazione notturna in R2 (serve un bucket e una chiave, e la conservazione da
     decidere con l'utente). Spiegate all'utente in modo semplice; lui ha detto di
     avvisarlo quando arriva il momento. Scrivere la tabella produttori → consumatori prima
     di assegnarle.
   - **Uso dell'account:** la finestra di 5 ore era al 78% alle 17:30 (rinnovo verso le 18:20).
   - **Merge:** `gh pr merge <n> --merge` come comando singolo (autorizzato dall'utente).
   - **`eventi.py`:** la riconciliazione ogni 2 minuti rilegge i pane e rinnova
     l'iscrizione; dopo un riarmo controllare comunque `attendi.py --stato`. Opzioni di
     prova: `EVENTI_RECONCILE=<s>` e `EVENTI_DEBUG=1`.
   - I testi nel campo di input dei pane (per esempio «Leggi il prossimo messaggio…») sono
     suggerimenti automatici di Claude Code, non messaggi: `agent prompt` li sostituisce.

1. **Dopo un `/clear`:** `progetto/coordinamento/attendi.py --stato`, gestire ogni «DA
   GESTIRE» (anche `MENU:`), poi il Monitor con `eventi.py` (README, «Attesa degli
   eventi»), da riarmare a ogni scadenza. Messaggi ai worker con `herdr agent prompt`.
2. **PR #6 (W5):** seconda review approvabile salvo una regressione (voti al cambio di
   lingua); a `PR_CORRETTA` verifica breve del commit (o review Codex breve), CI verde →
   merge (`gh pr merge 6 --merge`). Poi W5 fa la seconda PR (client oRPC reale) prevista dalla
   sua spec; dopo, i worker dell'ondata 2 possono implementare le parti web.
3. **Ondata 2:** spec e piano di W1, W2, W4, W6 in review Codex (le review confrontano
   anche le interfacce incrociate). Ai rapporti: rilievi al worker con un file in
   `messaggi/`, `/clear` prima delle correzioni se il contesto è alto, poi via
   all'implementazione. Già fatto: review Codex per ciascuno
   (`avvia-revisore.sh`, worktree di review o direttamente il worktree del worker in sola
   lettura). Controllare in quella fase le interfacce incrociate registrate nel piano
   generale (viste di W6 per W1, `mealRecipeVersions` di W1 per W4, `resolveFamilySettings`
   di W2 per W1, elenco a–f che W4 chiede alla sessione di W5, esclusioni di W2).
   W6 consegna presto una PR piccola con le viste condivise.
4. **PR #9 (W3):** review Codex in corso; poi correzioni e merge. YAML approvati
   dall'utente; W3 li segna con `approve.ts` sul branch della PR.
5. **Attività dell'ondata 2 non ancora assegnate:** revisione dei pasti, gestione del
   ricettario tramite MCP, collegamento degli agenti, esportazione notturna in R2, messa
   in produzione. Assegnarle ai worker che si liberano (W3 dopo il merge, W5 dopo la
   seconda PR), con un brief nuovo in `brief/` come quelli esistenti.
6. **Fine ondata 1** (dopo il merge di W3 e W5): riportare nella specifica principale le
   «Decisioni da riportare» delle spec unite e le decisioni del piano generale che
   superano la specifica (Cron Trigger al posto di pg_cron nella sezione 4, risposta
   «invariato» nella sezione 1, campi bilingui jsonb nelle sezioni 2, 12, 15, attributi
   del pianificatore obbligatori nella sezione 8, spesa offline nella sezione 6);
   riscrivere la sezione 10; chiudere le voci della sezione 15.
7. Passi di produzione (W1 task 10) all'utente solo prima della prima pubblicazione.
8. Anteprima di W5 per l'iPhone: http://192.168.178.64:8767/ (già data all'utente).
