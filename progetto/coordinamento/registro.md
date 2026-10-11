# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu | .worktrees/menu | Ondata 2: design approvato, scrive spec e piano | 11/10 13:20 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo | .worktrees/profilo | Ondata 2: design approvato, scrive spec e piano | 11/10 13:20 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Ondata 1: implementazione in corso, poi PR | 11/10 13:20 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | Ondata 2: design approvato, scrive spec e piano | 11/10 13:20 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | PR #6 corretta (C10–C12), ferma in attesa della seconda review | 11/10 13:20 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario | .worktrees/ricettario | Ondata 2: design approvato, scrive spec e piano | 11/10 13:20 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #7 (unità e spesa), #8
(fonte delle equivalenze).

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R PR6 correzioni | seconda review della PR #6 (W5), worktree .worktrees/review-pr6 | R PR6 correzioni | w1:p0 | in corso → revisioni/w5-pr6-2.md |

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, 13:20.

1. **Dopo un `/clear`:** `progetto/coordinamento/attendi.py --stato`, gestire ogni «DA
   GESTIRE» (anche `MENU:`), poi `attendi.py` in background. Mai chiudere un turno senza
   attesa attiva. Prima di inviare testo a un pane controllare che non ci sia un menu
   aperto («Enter to select»): con un menu si risponde solo col numero.
2. **PR #6 (W5):** al rapporto `revisioni/w5-pr6-2.md`: se approvabile, CI verde → merge
   (`gh pr merge 6 --merge`, permesso concesso), chiudere la tab del revisore, togliere
   `.worktrees/review-pr6`. Poi W5 fa la seconda PR (client oRPC reale) prevista dalla
   sua spec; dopo, i worker dell'ondata 2 possono implementare le parti web.
3. **Ondata 2 (approvata dall'utente):** W1 menu, W2 profilo, W4 spesa, W6 ricettario
   scrivono spec e piano. A `SPEC_E_PIANO_PRONTI`: review Codex per ciascuno
   (`avvia-revisore.sh`, worktree di review o direttamente il worktree del worker in sola
   lettura). Controllare in quella fase le interfacce incrociate registrate nel piano
   generale (viste di W6 per W1, `mealRecipeVersions` di W1 per W4, `resolveFamilySettings`
   di W2 per W1, elenco a–f che W4 chiede alla sessione di W5, esclusioni di W2).
   W6 consegna presto una PR piccola con le viste condivise.
4. **W3:** in implementazione; alla PR review Codex, poi merge.
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
