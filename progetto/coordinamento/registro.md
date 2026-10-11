# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | Spec e piano in revisione; PR #3 dello scheletro aperta, in review | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | Spec e piano in revisione | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Correzioni dalla review di spec e piano; implementazione dopo il merge di W1 (scheletro) e W4 | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Aggiorna spec e piano per le equivalenze con preparazione; poi attesa del merge dello scheletro (PR #3) per implementare | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Brainstorming | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R1 PR scheletro (Codex) | PR #3 scheletro di W1, worktree `.worktrees/review-scheletro` | R1 PR scheletro | w1:pJ | in corso, rapporto in `revisioni/w1-pr3-scheletro.md` |
| R2 spec schema (Codex gpt-6-astra, high) | spec e piano W2 | R2 spec schema | w1:pH | in corso, rapporto in `revisioni/w2-spec-piano.md` |
| R1 spec piattaforma (Codex gpt-6-astra, high) | spec e piano W1 | R1 spec piattaforma | w1:pG | in corso, rapporto in `revisioni/w1-spec-piano.md` |

## Domande in sospeso





## Prossima azione del coordinatore

Seguire il brainstorming dei cinque worker; rispondere alle domande; quando uno scrive STATO: SPEC_E_PIANO_PRONTI avviare un revisore separato.
