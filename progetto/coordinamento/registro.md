# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu | .worktrees/menu | Review «da rifare» (revisioni/w1-menu-spec-piano.md); correzioni in corso (messaggi/w1-07-review-menu.md); aspetta la sezione «Interfaccia per W1» di W6 | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo | .worktrees/profilo | Review «da rifare» (revisioni/w2-profilo-spec-piano.md); correzioni in corso (messaggi/w2-06-review-profilo.md) | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | PR #9: review «approvabile con correzioni» (revisioni/w3-pr9.md); correzioni in corso (messaggi/w3-03-review-pr9.md); poi verifica breve e merge | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | Review «da rifare» (revisioni/w4-spesa-spec-piano.md); correzioni in corso (messaggi/w4-04-review-spesa.md); poi seconda review breve sui rilievi 1–4 e interfaccia di sessione da passare a W5 | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | PR #6: terza review APPROVABILE (revisioni/w5-pr6-3.md), CI verde su 3d0a4cd; merge negato dal classificatore della modalità auto, in attesa dell'utente | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario | .worktrees/ricettario | Review «da rifare» (revisioni/w6-ricettario-spec-piano.md); correzioni in corso (messaggi/w6-01-review-spec.md); poi la sezione «Interfaccia per W1» va passata a W1 | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #7 (unità e spesa), #8
(fonte delle equivalenze).

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo.

0. **In corso:** correzioni di spec e piano di W1, W2, W4, W6 (messaggi w1-07, w2-06,
   w4-04, w6-01) e della PR #9 di W3 (w3-03). Ai `SPEC_E_PIANO_CORRETTI`: seconda review
   Codex breve sui rilievi bloccanti (W4 rilievi 1–4; W1 e W6 l'interfaccia delle viste).
   La sezione «Interfaccia per W1» di W6 va passata a W1; la sezione «Interfaccia
   richiesta a W5» di W4 va passata a W5 per la sua seconda PR. Al `PR_CORRETTA` di W3:
   verifica breve, CI, merge.
   **PR #6:** approvata e con CI verde, ma il merge (`gh pr merge 6 --merge`) è stato
   negato dal classificatore della modalità auto: l'ha chiesto all'utente.

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
