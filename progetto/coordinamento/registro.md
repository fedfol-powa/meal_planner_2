# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| W1 menu | W1 menu | w1:pW | traguardo/menu-web | .worktrees/menu | PR #20 «approvabile con correzioni»: corregge 3 e 4 ora; 1 e 2 dopo il merge di #18 e #19 (aggiorna su main); poi revisione dei pasti | 11/10 |
| W2 profilo | W2 profilo | w1:pY | traguardo/profilo-web | .worktrees/profilo | PR #18 «approvabile con correzioni» (test del collegamento reale di profile) → merge per prima; PR #21 in review | 11/10 |
| W3 ricettario-mcp | W3 ricettario-mcp | w1:pA | traguardo/ricettario-mcp | .worktrees/ricettario-mcp | Spec e piano «da rifare» (12 rilievi, w3-04 con le decisioni); poi seconda review breve | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | traguardo/spesa | .worktrees/spesa | Dopo `/clear`: web e coda offline (task 9-14; web-01) | 11/10 |
| W5 web | W5 web | w1:pC | fondamenta/web-client | .worktrees/web | PR #17 unita (tre review). Libero | 11/10 |
| W6 ricettario | W6 ricettario | w1:pX | traguardo/ricettario-web | .worktrees/ricettario | PR #19 «approvabile con correzioni»: corregge 2 e 3 ora; 1 dopo il merge della #18 | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|
| R PR21 profilo web | PR #21 | R PR21 profilo web | w1:p10 | → revisioni/w2-pr21.md |

## Domande in sospeso


- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo. Ordine dell'ondata 2 approvato dall'utente: vedi piano generale, «Ordine dell'ondata 2».

0. **In corso (ordine dell'ondata 2):**
   - Tutto il server e il client reale sono su main. Parti web (messaggio web-01): ordine dei merge #18 → #19 → #20 → #21, poi W4; merge una alla
     volta, chi arriva dopo porta il branch su main.
   - W3: brainstorming chiuso, scrive spec e piano della gestione del ricettario (area
     `catalogue`); web dopo la PR web di W2.
   - W5 libero: prossima attività da scegliere con la tabella del piano generale
     (collegamento agenti ed esportazione R2 richiedono passi esterni dell'utente).
   - W1 dopo il web del menu: revisione dei pasti (serve brief).
   - `eventi.py` ha ora un controllo di riconciliazione ogni 2 minuti (gli eventi
     `REVISORE_FINITO` a volte non arrivano); a ogni riarmo controllare comunque
     `attendi.py --stato`.

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
