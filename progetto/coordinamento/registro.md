# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | Task 11 in corso (test sulle migrazioni reali e CI con database), poi merge di PR #5; task 10 rimandato | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | **Unito** (PR #4, 11/10); worker libero per l'ondata 2 | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Spec e piano corretti e approvati; contesto pulito; implementazione dopo il merge di W4 (mandare messaggio di ripresa con via all implementazione) | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Aggiorna spec e piano per le equivalenze con preparazione; poi attesa del merge dello scheletro (PR #3) per implementare | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Correzioni della seconda review, poi implementazione e PR (niente terza review di spec) | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.






## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, 12:25.

1. Riprendere l'attesa: `progetto/coordinamento/attendi.sh w1:p8 w1:pB w1:pC` in background
   (W2 `w1:p9` è fermo e libero; W3 `w1:pA` è fermo con il contesto pulito).
2. **W1** (task 11): quando scrive `STATO: PR_CORRETTA` con CI verde, verificare `gh pr checks 5`
   e unire la PR #5 (review del codice già fatta: `revisioni/w1-pr5.md`, rilievi corretti).
   Se il task 11 ha cambiato molto codice, far fare una review breve con `avvia-revisore.sh`.
3. **W4**: in implementazione; alla PR avviare la review Codex (worktree di review con
   `git worktree add .worktrees/review-prN origin/<branch> --detach` e `npm ci`).
4. **W3**: dopo il merge di W4 mandare il messaggio di ripresa (brief, protocollo, spec
   `2026-10-11-ricetta-import.md`, piano omonimo, «sei in implementazione, rebase su
   origin/main, poi PR»).
5. **W5**: in implementazione; quando scrive `STATO: ANTEPRIMA <url>` girare il link
   all'utente per l'iPhone; alla PR review Codex.
6. A fine ondata 1: riportare nella specifica principale le sezioni «Decisioni da
   riportare» delle spec di dettaglio unite, riscrivere la sezione 10 con lo schema del
   piano generale, chiudere le voci della sezione 15; mostrare all'utente le decisioni
   prese dal coordinatore marcate «da mostrare» nel piano generale; pianificare
   l'ondata 2 (W2 è già libero).
7. Passi di produzione (W1 task 10) da portare all'utente solo prima della prima
   pubblicazione (vedi «Domande in sospeso»).
