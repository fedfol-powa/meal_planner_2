# Registro del coordinamento

Stato operativo dei worker. Aggiornato dal coordinatore a ogni cambio di fase.
Gli id dei pane cambiano: verifica con `herdr pane list` (etichetta della tab e `cwd`).

## Worker attivi

**Nessun worker attivo.** Il 12/10 pomeriggio l'utente ha messo in pausa il lavoro («riprendiamo quando riesco a dedicarci tempo»): W6 chiuso dopo il merge della #34, worktree rimosso. Alla ripresa, limite di un solo worker Claude (decisione del 12/10), revisori Codex senza limite. W2, W3, W4, W5 chiusi il 12/10 (lavoro tutto su main). Revisori Codex senza limite.

| Worker | Tab | Pane | Branch | Worktree | Fase | Ultimo controllo |
|---|---|---|---|---|---|---|

Unite su `main`: PR #3 (scheletro), #4 (schema), #5 (piattaforma), #6 (web), #7 (unità e spesa), #8
(fonte delle equivalenze), #9 (ricetta e import), #12 (viste della ricetta di W6), #10 (`resolveFamilySettings` di W2), #13 (`mealRecipeVersions`, `versionedInput`, dominio con `noUncheckedIndexedAccess`), #16 (profilo e famiglia lato server), #14 (ricettario lato server), #15 (menu lato server), #11 (spesa lato server), #17 (client oRPC reale e agganci di sessione), #18 (profilo al posto di me nel web), #19 (ricettario web), #20 (menu web), #21 (profilo e famiglia web), #22 (spesa web), #23 (gestione del ricettario lato server), #24 (nomi delle varietà nella spesa), #25 (correzioni della prova sullo stack reale, shell della PWA), #28 (porzioni del pasto nella scheda), #27 (unità contate scalate), #26 (bozze e archiviate nel web per i curatori), #29 (revisione dei pasti, server), #30 (esportazione notturna in R2), #32 (versione di migrazione duplicata), #31 (collegamento degli agenti), #33 (revisione dei pasti, web), #34 (strumenti della messa in produzione). Ondata 1 completata.

## Revisori attivi

| Revisore | Di cosa | Tab | Stato |
|---|---|---|---|

## Decisioni dell'utente da ricordare (11–12/10)

- **Un solo worker Claude** (12/10): W1 e W6 finiscono il lavoro in corso; il primo che termina si chiude (tab chiusa), l'altro resta l'unico worker. Revisori Codex senza limite.
- **Messa in produzione:** caricamento dei dati, migrazioni, `bootstrap.sql` e rilasci li esegue il coordinatore, con le credenziali in un file locale ignorato da Git scritto dall'utente (mai nella conversazione), anteprima e «vai» dell'utente prima di ogni scrittura; a fine avvio l'utente cambia le password. Avvio in tre fasi: 1 infrastruttura (dopo l'approvazione del piano), 2 import e famiglia (dopo revisione dei pasti web), 3 agenti. Finestra lunedì–mercoledì entro le 19. Rilasci a mano con `npm run release`. Migrazioni dalla CLI di Supabase. Impostazioni della famiglia dallo script. Settimane già pianificate nell'origine importate come «menu in corso». Produzione: `lronuqvtjdhfyychnscr`, partenza da workers.dev.
- **Iscrizioni libere spente in produzione** (12/10): account solo con «Add user».
- **Poteri dei token d'agente su Supabase Auth:** solo documentati per ora, testi veritieri; «ultimo rinnovo dell'accesso».
- **Altre:** 7 copie in R2 cifrate con chiave dell'utente; Annulla 6 s nell'app, nessun limite lato server; porzioni 1–20; scheda aperta da un pasto con le porzioni del pasto; unità contate scalate all'intero superiore tranne i pezzi (a mezzi in scheda e menu, interi nella spesa); voci della spesa «Nome (varietà)»; note e pasti liberi come scritti; ingrediente creabile senza nome inglese; nessun «Genera la prima settimana».

## Prossima azione del coordinatore

Aggiornato il 12 ottobre 2026, pomeriggio. **In pausa per scelta dell'utente.** main verde, nessuna PR aperta.

1. **Ripresa:** nessun passo in produzione finché l'utente non dà il via. Gli ho già spiegato le tre fasi, chi fa cosa e gli accessi (account solo creati a mano da lui in dashboard, iscrizioni spente); chiedere se vuole approfondire qualcosa (credenziali, ritorno indietro, esportazioni notturne) o fissare la finestra per la fase 1.
2. **Fase 1** (runbook R1–R14 in `progetto/superpowers/plans/2026-10-11-messa-in-produzione.md`, spec omonima sezione 4): serve un worker solo per la PR di configurazione (id di Hyperdrive, `account_id`, chiave pubblica in `server/wrangler.jsonc` e `web/.env.production`); i comandi in produzione li lancia il coordinatore, sempre anteprima → «vai» dell'utente → applicazione.
3. **Specifica principale:** riportare le decisioni della messa in produzione (sezione «Decisioni da riportare nella specifica» della spec di dettaglio, più le correzioni delle review della #34) con un agente in worktree, poi cherry-pick su main.
4. **Pulizia facoltativa:** worktree vecchi di PR già unite in `.worktrees/` (agenti, esportazione, menu, profilo, ricetta-import, ricettario, ricettario-mcp, spesa, web): verificare che siano puliti e uniti prima di rimuoverli.
5. **Revisori Codex:** formulare i prompt come revisione di qualità del proprio codice, non «avversariale» o «aggiramenti»: il filtro di sicurezza di Codex ha bloccato un revisore il 12/10.
6. **Merge:** `gh pr merge <n> --merge` solo dopo `gh pr checks` → `pass`; controllare le versioni delle migrazioni.
7. **Dopo un `/clear`:** `attendi.py --stato`, poi Monitor con `eventi.py` solo se ci sono worker o revisori attivi.
