# Brief W5: Esportazione notturna in R2

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/esportazione-r2` (da `origin/main`) · **Worktree:**
  `.worktrees/esportazione`
- **Area:** esportazione notturna dell'intero database in R2 di Cloudflare, al posto dei
  backup della piattaforma che il piano gratuito di Supabase non offre.
- **Specifica:** sezione 8 («Storico e backup», esportazione notturna, perdita massima di
  circa un giorno), sezione 4 (Cron Trigger orario del Worker, ruolo `app_job`), sezioni 2,
  9 e 15 («Backup e ripristino»), registro dell'8 e dell'11 ottobre 2026.

## Obiettivo

Ogni notte il Worker esporta tutto il database (catalogo e dati delle famiglie) in un
oggetto R2, ne conserva **le ultime 7** (deciso dall'utente l'11 ottobre 2026) e una
procedura documentata e provata ripristina un'esportazione in un ambiente di verifica.

## Su cosa costruisci (tutto su `main`)

- Cron Trigger orario e smistamento del job settimanale (`server/src/index.ts`, area
  `menu` di W1): l'esportazione si aggancia allo stesso evento `scheduled` senza
  interferire con il job.
- Ruoli Postgres e schema `app` (PR #4), pipeline e log della piattaforma (PR #5).

## Vincoli dal coordinamento

- **Da decidere nel brainstorming** e scrivere nella spec: formato (dump SQL o JSON per
  tabella), quale ruolo legge tutto (serve un ruolo dedicato in sola lettura? motivalo
  rispetto alla separazione dei ruoli della sezione 2), cifratura (almeno quella di R2;
  dichiara se serve altro), dimensioni e tempo di CPU attesi, ora dell'esportazione.
- **Ripristino:** procedura scritta e un test che esporta e ripristina in un database
  locale e confronta i contenuti. Senza la prova del ripristino l'attività non è finita.
- **Passi esterni:** creazione del bucket e binding in produzione li fa l'utente. Scrivi
  nella spec i comandi esatti e fermati con `STATO: DOMANDA` quando servono. In locale usa
  R2 simulato da Wrangler/Miniflare. Nessuna nuova dipendenza senza dire cosa sostituisce.
- Nella spec scrivi cosa **usi** e cosa **produci**; il file del cron è condiviso con W1
  (revisione dei pasti in corso): modifiche minime e dichiarate.
