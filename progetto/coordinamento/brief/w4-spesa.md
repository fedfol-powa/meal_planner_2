# Brief W4: Spesa, anche offline

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/spesa` (da `origin/main`) · **Worktree:** `.worktrees/spesa`
- **Area:** `shopping`.
- **Specifica:** parte 1 («La lista della spesa», «Lingua e unità di misura»), sezioni 2,
  6, 12, 13 per gli strumenti MCP (lettura ed esportazioni); più 1, 15, 16.

## Obiettivo

- Lista della settimana dal dominio che hai scritto (`domain/src/shopping/`, PR #7 unita):
  consolidamento, unità della famiglia, reparti, unità di acquisto.
- Spunte condivise con `quantity_at_check` canonica, voci rimesse in lista quando la
  quantità cresce, voci libere; operazioni a stato assoluto e idempotenti.
- Modifica offline con coda locale e riconciliazione alla riconnessione, coerente con la
  cache persistita e la sessione di W5 (niente aggiornamenti ottimistici fuori dalla coda
  prevista dalla sezione 6: se la spec principale e le interfacce decise sembrano in
  conflitto, `STATO: DOMANDA`).
- Esportazioni del menu «…» previste per il traguardo A (testo, condivisione); pagina
  Bring! con token nel ruolo `anon` se rientra nel traguardo A secondo la sezione 6.
- Schermata Spesa collegata ai dati veri.
