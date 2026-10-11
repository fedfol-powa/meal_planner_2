# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | **Unito** (PR #5, 11/10, 13:15); task 10 (passi di produzione) rimandato alla prima pubblicazione; worker libero per l'ondata 2 | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | PR #4 unita; ora su `fondamenta/schema-fonte`: PR #8 (fonte obbligatoria nelle equivalenze): correzione del check sugli spazi Unicode in corso (messaggio w2-05), poi merge | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Spec e piano corretti e approvati; contesto pulito; implementazione dopo il merge di W4 (mandare messaggio di ripresa con via all implementazione) | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Correzioni della review della PR #7 in corso (messaggio w4-03, dopo /clear) | 11/10 |
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
2. **PR #5 (W1):** unita. Permesso `Bash(gh pr merge *)` aggiunto in
   `.claude/settings.local.json` su richiesta dell'utente. W1 libero.
3. **PR #8 (W2):** review Codex in corso. **PR #7 (W4)** e **PR #6 (W5):** correzioni in corso; a `PR_CORRETTA` nuova review Codex breve sul diff delle correzioni (per la #6 una completa sui tre punti), poi merge; ai rapporti
   passare i rilievi al worker con un file in `messaggi/`, oppure unire se senza rilievi.
   Prima di correggere, `/clear` al worker e messaggio di ripresa.
4. **W3:** dopo il merge di PR #7 (e di PR #5) messaggio di ripresa: brief, protocollo,
   spec e piano `2026-10-11-ricetta-import.md`, «sei in implementazione, rebase su
   origin/main, poi PR».
5. **W5:** anteprima http://192.168.178.64:8767/ data all'utente per l'iPhone.
6. A fine ondata 1: riportare nella specifica principale le «Decisioni da riportare»
   delle spec unite, riscrivere la sezione 10, chiudere le voci della sezione 15;
   mostrare all'utente le decisioni «da mostrare» del piano generale; pianificare
   l'ondata 2.
7. Passi di produzione (W1 task 10) all'utente solo prima della prima pubblicazione.
