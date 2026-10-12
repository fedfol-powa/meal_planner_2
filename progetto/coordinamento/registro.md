# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

**Dal 12/10, su richiesta dell'utente: un solo worker Claude.** I lavori in corso (W1, W6) finiscono; chi termina per primo si chiude, l'altro resta l'unico worker. W2, W3, W4, W5 chiusi il 12/10 (lavoro tutto su main). Revisori Codex senza limite.

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 revisione-pasti | W1 revisione-pasti | w1:pW | traguardo/revisione-pasti-web | .worktrees/revisione-pasti | PR #33: review approvabile con 5 correzioni (revisioni/w1-pr33.md); W1 corregge; a PR_CORRETTA verifica breve, CI pass → merge | 12/10 |
| W6 messa-in-produzione | W6 messa-in-produzione | w1:pX | traguardo/messa-in-produzione | .worktrees/produzione | Spec e piano approvati (0df8737, 5 correzioni della seconda review; il caricamento ora si collega come postgres per bloccare le tabelle). /clear fatto, implementazione in corso; poi PR e review Codex. Nessun passo in produzione prima di portare il piano all'utente | 12/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web), #23 (gestione del ricettario lato server), #24 (nomi delle varietà nella spesa), #25 (correzioni della prova sullo stack reale, shell della PWA), #28 (porzioni del pasto nella scheda), #27 (unità contate scalate), #26 (bozze e archiviate nel web per i curatori), #29 (revisione dei pasti, server), #30 (esportazione notturna in R2), #32 (versione di migrazione duplicata), #31 (collegamento degli agenti). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Stato |
|---|---|---|---|

## Decisioni dell'utente da ricordare (11–12/10)

- **Un solo worker Claude** (12/10): W1 e W6 finiscono il lavoro in corso; il primo che termina si chiude (tab chiusa), l'altro resta l'unico worker. Revisori Codex senza limite.
- **Messa in produzione:** caricamento dei dati, migrazioni, `bootstrap.sql` e rilasci li esegue il coordinatore, con le credenziali in un file locale ignorato da Git scritto dall'utente (mai nella conversazione), anteprima e «vai» dell'utente prima di ogni scrittura; a fine avvio l'utente cambia le password. Avvio in tre fasi: 1 infrastruttura (dopo l'approvazione del piano), 2 import e famiglia (dopo revisione dei pasti web), 3 agenti. Finestra lunedì–mercoledì entro le 19. Rilasci a mano con `npm run release`. Migrazioni dalla CLI di Supabase. Impostazioni della famiglia dallo script. Settimane già pianificate nell'origine importate come «menu in corso». Produzione: `lronuqvtjdhfyychnscr`, partenza da workers.dev.
- **Poteri dei token d'agente su Supabase Auth:** solo documentati per ora, testi veritieri; «ultimo rinnovo dell'accesso».
- **Altre:** 7 copie in R2 cifrate con chiave dell'utente; Annulla 6 s nell'app, nessun limite lato server; porzioni 1–20; scheda aperta da un pasto con le porzioni del pasto; unità contate scalate all'intero superiore tranne i pezzi (a mezzi in scheda e menu, interi nella spesa); voci della spesa «Nome (varietà)»; note e pasti liberi come scritti; ingrediente creabile senza nome inglese; nessun «Genera la prima settimana».

## Prossima azione del coordinatore

Aggiornato il 12 ottobre 2026, notte. main verde (ultima CI su 532f57a «success»).

1. **Dopo un `/clear`:** `progetto/coordinamento/attendi.py --stato`, gestire ogni «DA GESTIRE», poi il Monitor con `eventi.py` (README, «Attesa degli eventi»), da riarmare a ogni scadenza. Messaggi ai worker con `herdr agent prompt`. Ai fermi «senza nuovo STATO» leggere sempre il pane: un worker può aspettare una risposta.
2. **PR #33 (W1, web della revisione dei pasti):** rilievi già inviati a W1; a `PR_CORRETTA` verifica breve Codex del diff dopo d1eb4d6, CI pass → merge. Poi: se W6 è ancora attivo, chiudere W1; altrimenti W1 resta l'unico worker.
3. **W6 (messa in produzione):** in implementazione (script di caricamento, `npm run release`, documenti); a `PR_APERTA` review Codex della PR. Poi **portare il piano all'utente** prima di qualsiasi passo in produzione; fase 1 per prima. Se W1 ha già finito ed è chiuso, W6 resta l'unico worker.
4. **Specifica principale:** riportare le decisioni di #31 (collegamento agenti, spec `2026-10-11-collegamento-agenti.md`), #33 (revisione dei pasti web) e della messa in produzione, con un agente in worktree come per fcffe66, poi cherry-pick su main.
5. **Merge:** `gh pr merge <n> --merge` come comando singolo, **solo dopo aver controllato** `gh pr checks <n> --json name,bucket` → `check pass` (l'11/10 la #30 è stata unita con la CI rossa). Controllare le versioni delle migrazioni contro main (`scripts/migrations.test.ts`).
6. **Regole di metodo:** `/clear` ai worker a ogni cambio di fase (spec approvate → implementazione; PR aperta → correzioni; nuovo compito) e oltre ~50% di contesto, a lavoro committato, poi messaggio di ripresa. I worker devono chiudere ogni fermata con una riga `STATO:` (protocollo-worker.md).
7. **Revisori:** `progetto/coordinamento/avvia-revisore.sh "<etichetta>" <worktree> <rapporto> "<istruzioni>"` (per le PR: `git worktree add --detach .worktrees/review-prNN origin/<branch>`); al `REVISORE_FINITO` leggere il rapporto, chiudere la tab, rimuovere il worktree di review, `attendi.py --visto <pane>`.
