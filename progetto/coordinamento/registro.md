# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | Implementazione (task 2-10); task 11 dopo il merge di W2; contesto pulito | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | Correzioni dalla review (verdetto «da rifare»); poi seconda review | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Correzioni dalla review di spec e piano; implementazione dopo il merge di W1 (scheletro) e W4 | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Aggiorna spec e piano per le equivalenze con preparazione; poi attesa del merge dello scheletro (PR #3) per implementare | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Correzioni dalla review (verdetto «da rifare»); poi seconda review | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- All'utente: verifica nella dashboard Supabase dell'integrazione GitHub (cartella, branch di produzione, «Deploy to production») prima del merge di W2.





## Prossima azione del coordinatore

Seguire il brainstorming dei cinque worker; rispondere alle domande; quando uno scrive STATO: SPEC_E_PIANO_PRONTI avviare un revisore separato.
