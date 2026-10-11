# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu | .worktrees/menu | Spec e piano adeguati alle viste (6f42b05); seconda review breve in corso (revisioni/w1-menu-spec-piano-2.md) | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo | .worktrees/profilo | Seconda review «approvabile con correzioni»; corregge (w2-07), poi PR piccola di `resolveFamilySettings` e implementazione senza parti web | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | PR #9 unita. Libero: prossima attività da assegnare solo dopo la tabella produttori → consumatori | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | Seconda review «approvabile con correzioni»; corregge (w4-05), poi implementa senza task 8, task 10 e parti web; l'«Interfaccia richiesta a W5» va a W5 | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web-client | .worktrees/web | PR #6 unita. Seconda PR (client oRPC reale + agganci di W4): aggiorna spec e piano (w5-05), poi review breve | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario-viste | .worktrees/ricettario | Implementa la PR piccola delle viste (w6-03) | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R PR10 impostazioni | PR #10 di W2 (`resolveFamilySettings`), worktree .worktrees/review-pr10 | R PR10 impostazioni | w1:p1B | in corso → revisioni/w2-pr10.md |
| R menu spec 2 | seconda review di spec e piano di W1 | R menu spec 2 | w1:p1C | in corso → revisioni/w1-menu-spec-piano-2.md |

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo. Ordine dell'ondata 2 approvato dall'utente: vedi piano generale, «Ordine dell'ondata 2».

0. **In corso (ordine dell'ondata 2):**
   - PR #6 e #9 unite (merge eseguito dal coordinatore su conferma esplicita dell'utente).
   - W6: PR piccola delle viste → review → merge; poi W1 può implementare le schede.
   - W5: seconda PR (spec e piano → review breve → implementazione → review → merge);
     poi le parti web di W1, W2, W4, W6.
   - W2: PR #10 in review → merge; poi il resto senza parti web.
   - W1: seconda review in corso; poi PR piccola di `mealRecipeVersions` → merge → W4
     task 8.
   - W4: implementa senza task 8, task 10 e parti web.
   - W3 libero: prima di assegnargli un'attività (revisione dei pasti, gestione MCP del
     ricettario, collegamento agenti, esportazione R2, messa in produzione) scrivere la
     tabella produttori → consumatori nel piano generale.
   - Fine ondata 1: riportare nella specifica principale le decisioni (punto 6 sotto).

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
