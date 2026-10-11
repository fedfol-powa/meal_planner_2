# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu | .worktrees/menu | PR #13 (`mealRecipeVersions`, `versionedInput`, pianificatore con `noUncheckedIndexedAccess`) in review (revisioni/w1-pr13.md); prosegue sul branch principale senza parti web | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo | .worktrees/profilo | PR #10 unita; implementazione sul branch principale senza parti web | 11/10 |
| W3 ricetta-import | W3 ricetta-import | w1:pA | fondamenta/ricetta-import | .worktrees/ricetta-import | PR #9 unita. Libero: prossima attività da assegnare solo dopo la tabella produttori → consumatori | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | PR #11 corretta; verifica breve in corso (revisioni/w4-pr11-2.md) | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web-client | .worktrees/web | Seconda PR: spec e piano approvabili con correzioni; via all'implementazione (w5-06) | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario | .worktrees/ricettario | PR #14 (parte server: ricerca, scheda, MCP) in review (revisioni/w6-pr14.md); web dopo W5 | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R PR11 verifica | PR #11 dopo le correzioni | R PR11 verifica | w1:p1G | → revisioni/w4-pr11-2.md |
| R PR13 versioni | PR #13 di W1 | R PR13 versioni | w1:p1H | → revisioni/w1-pr13.md |
| R PR14 ricettario | PR #14 di W6 | R PR14 ricettario | w1:p1J | → revisioni/w6-pr14.md |

## Domande in sospeso

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo. Ordine dell'ondata 2 approvato dall'utente: vedi piano generale, «Ordine dell'ondata 2».

0. **In corso (ordine dell'ondata 2):**
   - Unite: #6, #9, #12 (viste di W6: i task di W1 che le usano sono sbloccati).
   - W5: implementa la seconda PR (client oRPC reale + agganci di W4) → review → merge;
     poi le parti web di W1, W2, W4, W6 (ognuno si ferma lì con `STATO: DOMANDA`).
   - W2: PR #10 unita; prosegue senza parti web.
   - W1: PR piccola di `mealRecipeVersions` + `versionedInput` + 11 errori del
     pianificatore con `noUncheckedIndexedAccess` nel tsconfig di `domain/` (blocca il
     typecheck web di W5) → review → merge → avvisare W5 (porta su main e prosegue) e W4
     task 8 (togliere lo schema scritto a mano e la query provvisoria).
   - W4: PR #11 → correzioni → verifica breve → merge.
   - W6: ricerca, dettaglio, MCP; poi parti web dopo W5.
   - W3 libero: prima di assegnargli un'attività scrivere la tabella produttori →
     consumatori nel piano generale.

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
