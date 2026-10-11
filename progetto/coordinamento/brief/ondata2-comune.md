# Regole comuni dell'ondata 2

Valgono per ogni worker dell'ondata 2, insieme a `progetto/coordinamento/protocollo-worker.md`.

- **Attività verticali:** ogni attività comprende operazioni del contratto, gestori nel
  server, eventuali migrazioni, schermate web e strumenti MCP derivati, con i test.
- **Su cosa costruisci (già su `main`):** contratto, server e CI della piattaforma (W1,
  PR #5), schema e permessi (W2, PR #4). In arrivo: dominio unità e spesa (W4, PR #7),
  documento ricetta e import (W3), app web di base (W5, PR #6, poi una seconda PR con il
  client oRPC reale). Brainstorming, spec e piano si fanno subito; l'implementazione delle
  parti web parte quando la base di W5 è su `main` (te lo dice il coordinatore).
- **Proprietà dei file:** lavori nei file della tua area: `contract/src/<area>/`,
  `server/src/<area>/`, `web/src/features/<area>/` (o la struttura che la base di W5
  impone: segui quella), test accanto. I file condivisi (indice del contratto, router,
  rotte web, navbar, dizionari comuni) si toccano solo per registrare la tua area, con
  modifiche minime: le PR si uniscono una alla volta con rebase.
- **Migrazioni:** solo nuove migrazioni con timestamp, mai modifiche a quelle unite; ogni
  migrazione con test pgTAP. Dichiara nella spec le tabelle e le colonne che aggiungi o
  cambi: il coordinatore controlla i conflitti con le altre attività.
- **Interfacce decise:** leggi «Interfacce decise» del piano generale prima del
  brainstorming; sono vincolanti (versioni e «invariato», idempotenza, errori a codici,
  metadati `mcp`/`webOnly`/`offline`, campi bilingui jsonb, nessun aggiornamento
  ottimistico nelle mutazioni web).
- **MCP:** ogni operazione disponibile nell'app ha il suo strumento MCP salvo `webOnly`
  motivato (sezione 13).
- **Design:** schermate secondo `design/design.md`, `design/percorsi.md` e il prototipo in
  `prototype/` (sezione 14); niente componenti nuovi non previsti senza chiederlo.
