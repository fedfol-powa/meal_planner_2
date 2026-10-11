# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|
| Codex | PR #28 di W6 | R PR28 | w1:p2H | in corso → revisioni/w6-pr28.md (worktree .worktrees/review-pr28) |
| W1 revisione-pasti | W1 revisione-pasti | w1:pW | traguardo/revisione-pasti | .worktrees/revisione-pasti | PR #29: review con 3 rilievi (concorrenza annullamento/chiusura bozza, UUID maiuscoli, autore delle azioni senza effetti) + test MCP tools/call; correzioni in corso; poi verifica breve → merge → PR web | 11/10 |
| W2 collegamento-agenti | W2 collegamento-agenti | w1:pY | traguardo/collegamento-agenti | .worktrees/agenti | Spec e piano approvati; contesto azzerato; implementazione fino a PR_APERTA | 11/10 |
| W3 ricettario-mcp | W3 ricettario-mcp | w1:pA | — | .worktrees/ricettario-mcp | PR #26 unita: gestione del ricettario completa (server e web). Contesto azzerato; libero | 11/10 |
| W4 spesa | W4 spesa | w1:pZ | — | .worktrees/spesa | PR #27 unita (specifica aggiornata; residuo accettato: decimali non realistici come 0,125 spicchi formattati a due cifre); libero | 11/10 |
| W5 esportazione-r2 | W5 esportazione-r2 | w1:pC | traguardo/esportazione-r2 | .worktrees/esportazione | PR #30 aperta, review Codex in corso (revisioni/w5-pr30.md, worktree .worktrees/review-pr30); contesto azzerato: ai rilievi messaggio di ripresa | 11/10 |
| W6 messa-in-produzione | W6 messa-in-produzione | w1:pX | traguardo/messa-in-produzione | .worktrees/produzione | Design approvato in 5 sezioni (esecuzione del coordinatore, fasi, finestra lun–mer, rotazione finale); scrive spec e piano → review | 11/10 |

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web), #23 (gestione del ricettario lato server), #24 (nomi delle varietà nella spesa), #25 (correzioni della prova sullo stack reale, shell della PWA), #28 (porzioni del pasto nella scheda), #27 (unità contate scalate), #26 (bozze e archiviate nel web per i curatori). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Pane | Stato |
|---|---|---|---|---|

## Domande in sospeso

- Decisa dall'utente l'11/10: caricamento dei dati, migrazioni e rilasci li esegue il coordinatore, con le credenziali in un file locale ignorato da Git scritto dall'utente, anteprima e «vai» dell'utente prima di ogni scrittura in produzione; a fine avvio l'utente cambia le password. Avvio a fasi: 1 infrastruttura, 2 import e famiglia (dopo revisione dei pasti, esportazione, bozze), 3 agenti.
- Decisa dall'utente l'11/10: rilasci a mano con un comando unico (npm run release), non automatici; impostazioni della famiglia scritte dallo script di caricamento (W6).
- Decise dall'utente l'11/10 (commit d0c02ca): permesso `Bash(herdr pane run *)`, produzione `lronuqvtjdhfyychnscr`, 7 copie in R2, i tre conflitti del consolidamento come proposto.

- **Passi di produzione (W1 task 10), da portare all'utente prima della prima pubblicazione:** dimensione del pool del Session pooler, chi imposta la password di `app_server` (proposta: l'utente lancia lui il comando), creazione di Hyperdrive (comando nella spec di W1), chi lancia il primo deploy, conferma del progetto Supabase `lronuqvtjdhfyychnscr` come produzione.

- **Decise dall'utente (prova di W6):** scheda aperta da un pasto con le porzioni del pasto (a W6 dopo il merge della #25); unità contate scalate all'intero superiore (W4).

## Prossima azione del coordinatore

Aggiornato l'11 ottobre 2026, pomeriggio. Nessun revisore attivo. Ordine dell'ondata 2 approvato dall'utente: vedi piano generale, «Ordine dell'ondata 2».

0. **In corso (ordine dell'ondata 2), aggiornato l'11/10 alle 17:40:**
   - **Merge web in sequenza: completati** (#20, #21, #22 unite). Prima era: W4 avvisato di portare di portare la #21
     su main → merge → scrivere a W4 di portare la #22 su main → merge. #21 e #22 sono già
     approvate: dopo il riallineamento basta controllare CI verde e risoluzione dei conflitti
     (diff dei file condivisi del web), senza nuova review salvo modifiche sostanziali.
   - **Dopo il merge della #20:** `/clear` a W1 e messaggio di ripresa per la revisione dei
     pasti: la sessione va riavviata nel worktree `.worktrees/revisione-pasti` (branch
     `traguardo/revisione-pasti`, già creato): `/exit`, `herdr pane run w1:pW "cd
     <worktree> && claude --permission-mode auto -n 'W1 revisione-pasti'"`, rinominare la
     tab, poi «Leggi progetto/coordinamento/brief/w1-revisione-pasti.md e
     progetto/coordinamento/protocollo-worker.md ed eseguili, partendo dal brainstorming».
     Nel brainstorming: controllare che ogni scrittura abbia la lettura che la rende usabile e
     che ogni PR passi da sola i controlli di main.
   - **W3:** implementazione della parte server di `catalogue`; review della PR quando la
     apre; il web dopo il merge della #21.
   - **W6 e W4 sulle correzioni della prova sullo stack reale; W2 collegamento degli agenti, W5 esportazione in R2.** Attività restanti senza assegnatario: collegamento degli agenti
     (serve confermare il server OAuth sul progetto di produzione, da verificare prima) ed
     esportazione notturna in R2 (serve un bucket e una chiave, e la conservazione da
     decidere con l'utente). Spiegate all'utente in modo semplice; lui ha detto di
     avvisarlo quando arriva il momento. Scrivere la tabella produttori → consumatori prima
     di assegnarle.
   - **Uso dell'account:** la finestra di 5 ore era al 78% alle 17:30 (rinnovo verso le 18:20).
   - **Merge:** `gh pr merge <n> --merge` come comando singolo (autorizzato dall'utente).
   - **`eventi.py`:** la riconciliazione ogni 2 minuti rilegge i pane e rinnova
     l'iscrizione; dopo un riarmo controllare comunque `attendi.py --stato`. Opzioni di
     prova: `EVENTI_RECONCILE=<s>` e `EVENTI_DEBUG=1`.
   - I testi nel campo di input dei pane (per esempio «Leggi il prossimo messaggio…») sono
     suggerimenti automatici di Claude Code, non messaggi: `agent prompt` li sostituisce.

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
6. **Fatto l'11/10 (commit 740e7e0, anche ondata 2 fino alla #23).** Era: riportare nella specifica principale le
   «Decisioni da riportare» delle spec unite e le decisioni del piano generale che
   superano la specifica (Cron Trigger al posto di pg_cron nella sezione 4, risposta
   «invariato» nella sezione 1, campi bilingui jsonb nelle sezioni 2, 12, 15, attributi
   del pianificatore obbligatori nella sezione 8, spesa offline nella sezione 6);
   riscrivere la sezione 10; chiudere le voci della sezione 15.
7. Passi di produzione (W1 task 10) all'utente solo prima della prima pubblicazione.
8. Anteprima di W5 per l'iPhone: http://192.168.178.64:8767/ (già data all'utente).
