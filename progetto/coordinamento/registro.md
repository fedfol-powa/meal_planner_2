# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 piattaforma | W1 piattaforma | w1:p8 | fondamenta/piattaforma | .worktrees/piattaforma | PR #5: review approvabile con 2 correzioni minori, in correzione; poi task 11 dopo il merge di PR #4; task 10 rimandato | 11/10 |
| W2 schema | W2 schema | w1:p9 | fondamenta/schema | .worktrees/schema | PR #4: review approvabile con 2 correzioni, in correzione; prima del merge il coordinatore rilancia i test pgTAP e serve la verifica dell'integrazione GitHub di Supabase | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | Spec e piano corretti e approvati; contesto pulito; implementazione dopo il merge di W4 (mandare messaggio di ripresa con via all implementazione) | 11/10 |
| W4 unita-spesa | W4 unita-spesa | w1:pB | fondamenta/unita-spesa | .worktrees/unita-spesa | Aggiorna spec e piano per le equivalenze con preparazione; poi attesa del merge dello scheletro (PR #3) per implementare | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web | .worktrees/web | Correzioni della seconda review, poi implementazione e PR (niente terza review di spec) | 11/10 |

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

- All'utente: verifica nella dashboard Supabase dell'integrazione GitHub (cartella, branch di produzione, «Deploy to production») prima del merge di W2.





## Prossima azione del coordinatore

Seguire il brainstorming dei cinque worker; rispondere alle domande; quando uno scrive STATO: SPEC_E_PIANO_PRONTI avviare un revisore separato.
