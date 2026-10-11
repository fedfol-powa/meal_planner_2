# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | Brainstorming | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | Brainstorming | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Spec e piano pronti, in revisione; implementazione dopo il merge di W1 (scheletro) e W4 | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Correzioni dalla review di spec e piano | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Brainstorming | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R3 spec ricetta-import (Codex gpt-6-astra, high) | spec e piano W3 | R3 spec ricetta-import | w1:pF | in corso, rapporto in `revisioni/w3-spec-piano.md` |

## Domande in sospeso

- Da girare a W2: `quantity_at_check.texts` bilingue `[{key, text:{it-IT,en-GB}}]`; vincolo di unicità delle equivalenze per (ingrediente, ambito, dimensione dell'unità di partenza).




## Prossima azione del coordinatore

Seguire il brainstorming dei cinque worker; rispondere alle domande; quando uno scrive STATO: SPEC_E_PIANO_PRONTI avviare un revisore separato.
