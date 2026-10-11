# Brief W6: Messa in produzione (spec e piano)

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/messa-in-produzione` (da `origin/main`) · **Worktree:**
  `.worktrees/produzione`
- **Area:** portare il traguardo A in produzione per la famiglia dell'utente: risorse di
  Cloudflare e Supabase, primo deploy, import del ricettario e dei dati della famiglia,
  collaudo, ritorno indietro.
- **Specifica:** sezione 11 (convivenza con il progetto di origine, import, casi R4),
  sezioni 1, 2, 4, 8, 9, 10 e 13, piano generale («Ondate», «Interfacce decise», registro);
  Task 10 del piano della piattaforma
  (`progetto/superpowers/plans/2026-10-11-piattaforma.md`, «Risorse di produzione e prima
  pubblicazione») e le «Domande in sospeso» di `progetto/coordinamento/registro.md` (pool
  del Session pooler, password di `app_server`, Hyperdrive, primo deploy).

## Obiettivo, in questa fase

**Solo brainstorming, spec e piano, con review avversariale.** Nessuna operazione sulla
produzione, nessun deploy, nessuna scrittura sul progetto Supabase `lronuqvtjdhfyychnscr`
(confermato come produzione dall'utente l'11 ottobre). L'esecuzione parte solo dopo
l'approvazione dell'utente del piano, passo per passo.

## Cosa deve contenere

- **Ordine dei passi** dall'inizio al collaudo, con per ognuno chi lo fa (worker o utente),
  il comando esatto da copiare o il percorso nella dashboard, come si verifica che è
  riuscito e come si torna indietro.
- **Passi esterni già noti**, da raccogliere dalle altre attività senza duplicarli: Task 10
  della piattaforma (password di `app_server`, Hyperdrive, Session pooler, primo deploy),
  OAuth e URL per il collegamento degli agenti (W2, spec in `.worktrees/agenti`), bucket R2
  e chiave di cifratura (W5, spec in `.worktrees/esportazione`). Dove una di quelle spec non
  è ancora unita, rimanda alla sua sezione e segnala la dipendenza.
- **Import del ricettario:** dal pacchetto di `scripts/import` (YAML approvati) al database
  tramite `server/src/catalogue/write.ts`, canale `import`, slug conservati, rilanciabile
  (sezione 11). W6 l'ha già fatto sullo stack locale nella prova (messaggi/w6-prova-stack-reale.md,
  `carica-catalogo.mjs`): parti da lì e decidi se diventa uno script del repository.
- **Dati della famiglia:** utenti e famiglia creati a mano su Supabase (decisione: niente
  inviti né Google nel traguardo A), impostazioni, libri posseduti, storico dei pasti e voti
  dall'import (`scripts/import/family.ts`), casi R4.
- **Collaudo** con l'utente sull'iPhone e **ritorno indietro** se qualcosa non va.
- **Dipendenze:** quali attività devono essere unite prima di ogni passo (revisione dei
  pasti, collegamento degli agenti, esportazione, bozze nell'app).

Chiudi con `STATO: SPEC_PIANO_PRONTI` come ultima riga; segue la review avversariale.
