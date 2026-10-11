# Brief W1: Menu, pianificatore, job del mercoledì e generazione pigra

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/menu` (da `origin/main`) · **Worktree:** `.worktrees/menu`
- **Area:** `menu` (settimane, slot, pasti, generazione).
- **Specifica:** parte 1 («Quando apri l'app», «Una settimana tipo», «Come sceglie i
  piatti»), sezioni 2, 3, 4, 5 (solo ciò che serve a mostrare e generare il menu: le
  azioni di modifica e la revisione dei pasti sono un'attività separata), 12, 13 per gli
  strumenti MCP di lettura e generazione; più 1, 15, 16 come sempre.

## Obiettivo

- Lettura della settimana corrente e di quelle vicine (Menu) con versioni e «invariato».
- Pianificatore della sezione 3 nel dominio puro (`domain/`), riusando quanto esiste in
  `domain/` e nel prototipo; ricette candidate dalle proiezioni (`toPlannerRecipe` di W3).
- Job del mercoledì (sezione 4) su `/internal/jobs/*` nel ruolo `app_job`, idempotente;
  generazione pigra all'apertura di una settimana non ancora generata.
- R1: un pasto usa la versione pubblicata della ricetta al momento del pasto; se manca,
  la prima pubblicata; se la ricetta non è mai stata pubblicata, solo nome e descrizione.
- Schermata Menu collegata ai dati veri (oggi è su dati finti nella base di W5).

## Vincoli dal coordinamento

- Pianificazione del cron di Cloudflare: proponila nella spec; la configurazione remota
  si fa alla prima pubblicazione (passi di produzione).
- Dipendenze ammesse senza discussione: quelle già nel repository. Altre: proponile.
