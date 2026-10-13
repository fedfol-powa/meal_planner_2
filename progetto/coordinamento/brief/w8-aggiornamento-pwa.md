# Brief W8: La PWA installata si aggiorna dopo un rilascio (issue #42)

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `traguardo/aggiornamento-pwa` (da `origin/main`) · **Worktree:**
  `.worktrees/pwa`
- **Issue:** #42 (`gh issue view 42`): leggila tutta, è il punto di partenza.
- **Area:** service worker e registrazione (`web/src/pwa/`), con il minimo indispensabile
  nella shell dell'app.
- **Specifica:** sezione 1 (PWA, «Service worker scritto a mano», «Modifiche solo
  additive», uscita e dati sul dispositivo, richieste in coda offline), sezione 6 (spesa
  offline), sezioni 15 e 16.

## Contesto

L'app è in produzione per una famiglia, usata soprattutto come PWA installata su iPhone.
Il 13 ottobre 2026 un rilascio non è arrivato all'app: il service worker serve le
navigazioni dalla cache e la versione nuova resta in attesa finché tutte le finestre non
si chiudono, cosa che su iOS può non succedere mai.

## Obiettivo

Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata;
offline resta la shell installata. Nessuna scrittura persa o interrotta.

## Vincoli dal coordinamento

- **Il più semplice che renda impossibile restare indietro**, senza librerie (niente
  Workbox: service worker scritto a mano, come da specifica).
- **Momento del passaggio:** da decidere nel brainstorming, con un'opzione consigliata.
  Il coordinatore propende per il passaggio silenzioso all'apertura o al ritorno in
  primo piano quando non ci sono scritture in corso (Annulla di 6 secondi, coda offline,
  invii in volo), senza banner. Se proponi un banner o una scelta diversa, motivala.
  Considera anche la sessione e i dati locali: un ricaricamento non deve far uscire né
  perdere la lista della spesa offline.
- **Convivenza:** fra l'attivazione del service worker nuovo e il ricaricamento, la
  pagina vecchia non deve rompersi, per esempio per un asset vecchio cancellato dalla
  cache.
- **Test:** unità sulle regole e sul nucleo del service worker (come i test esistenti
  in `web/src/pwa/`), più una prova del passaggio da una versione all'altra in un browser
  vero (agent-browser o un test automatico, il più semplice che dia una prova reale).
  Annota nella spec cosa resta da provare a mano sull'iPhone; quella prova la fa l'utente
  dopo il rilascio.
- Rilascio in produzione: **non lo fai tu**. Lo fa il coordinatore dopo il merge.
