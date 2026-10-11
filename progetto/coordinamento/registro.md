# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu | .worktrees/menu | Ondata 2: brainstorming (brief w1-menu-pianificatore) | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario | .worktrees/ricettario | Ondata 2: brainstorming (brief w6-ricettario-voti) | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo | .worktrees/profilo | Ondata 2: brainstorming (brief w2-profilo-famiglia); PR #8 unita | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Implementazione in corso (via dato dopo il merge della PR #7), poi PR | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | Ondata 2: brainstorming (brief w4-spesa); PR #7 unita | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Correzioni della review della PR #6 in corso (verdetto «da rifare» su 3 punti; messaggio w5-03, dopo /clear) | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.






## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, 13:05.

1. Dopo un `/clear`: `progetto/coordinamento/attendi.py --stato`, gestire i «DA GESTIRE»,
   poi `attendi.py` in background (vedi README). Mai chiudere un turno senza attesa attiva.
2. **Ondata 2 avviata (approvata dall'utente, 11/10):** W1 menu e W6 ricettario in brainstorming; W2 profilo in brainstorming (PR #8 unita). Regole comuni in `brief/ondata2-comune.md`. Mostrare all'utente le decisioni «da mostrare» (misure imperiali, R1). Altre attività dell'ondata 2 ai worker che si liberano (W3, W4, W5).
3. **PR #6 (W5):** correzioni in corso; a `PR_CORRETTA` nuova review Codex sui tre punti, poi merge; ai rapporti
   passare i rilievi al worker con un file in `messaggi/`, oppure unire se senza rilievi.
   Prima di correggere, `/clear` al worker e messaggio di ripresa.
4. **W3:** in implementazione; alla PR review Codex.
5. **W5:** anteprima http://192.168.178.64:8767/ data all'utente per l'iPhone.
6. A fine ondata 1: riportare nella specifica principale le «Decisioni da riportare»
   delle spec unite, riscrivere la sezione 10, chiudere le voci della sezione 15;
   mostrare all'utente le decisioni «da mostrare» del piano generale; pianificare
   l'ondata 2.
7. Passi di produzione (W1 task 10) all'utente solo prima della prima pubblicazione.
