# App web di Cosa si mangia

SPA React (Vite, TanStack Router e Query), PWA mobile-first. Requisiti nella
specifica (`../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1,
12 e 14) e nella spec di dettaglio `../progetto/superpowers/specs/2026-10-11-app-web-di-base.md`;
linguaggio visivo in `../design/design.md`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Installa le dipendenze (Node 26) |
| `npm run dev` | Sviluppo su http://localhost:5174 (copia prima font e foto da `../design/assets`) |
| `npm test` | Test Vitest (con `--no-experimental-webstorage`: in Node 26 il `localStorage` di Node nasconde quello di jsdom) |
| `npm run typecheck` | Controllo dei tipi |
| `npm run build` | Build in `dist/`, servita dal Worker come file statici |
| `npm run preview:lan` | Build e anteprima sulla rete locale, porta 8767, per l'iPhone |
| `npm run fake-data` | Rigenera `src/api/fake/demo-data.json` dai dati demo del prototipo |

## Modalità

- **Finta** (nessuna variabile): utente demo Federico nella Famiglia Folloni, nessun accesso.
- **Vera**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (per lo sviluppo, dallo
  stack locale: `supabase status`). Accesso con email e password; finché il client oRPC
  non c'è (seconda PR, dopo W1), i dati arrivano comunque dal client finto.

## Sessione e dati sul dispositivo

Una sessione per persona: cache in memoria, copia in IndexedDB (`query-cache:<id>`) e
scelta temporanea della lingua. Finché Supabase non ha detto chi è entrato non esiste
alcuna sessione e non si cancella nulla; nota l'identità, si cancellano le copie di
chiunque altro. «Esci», l'uscita da un'altra scheda e ogni cambio d'utente chiudono la
sessione con la stessa procedura e cancellano tutto.

`unauthorized` dal server: un solo rinnovo per sessione, condiviso dalle chiamate
rifiutate, che poi si ripetono una volta; se il rinnovo fallisce o il rifiuto si ripete,
l'ingresso. `forbidden`: i dati di quella famiglia spariscono, anche dalle altre schede
(`BroadcastChannel`) e dalla copia, dove un segno per famiglia (`revoked:<utente>:<famiglia>`,
aggiornato in una sola transazione di IndexedDB) impedisce di riscriverli finché una lettura
nuova non riesce. Ogni lettura resta nella lingua in cui è partita, anche nel tentativo dopo
un rinnovo; se nel frattempo la lingua cambia, la risposta si scarta. Il voto non è ottimistico: in cache entra
solo quello che il server ha confermato, dopo aver annullato le letture partite prima.

Il service worker installa la shell intera (`precache.json`) e serve le navigazioni da
quella della versione in servizio; una nuova versione entra in servizio intera alla
riapertura dopo la sua installazione. Si registra solo nella build e solo in un contesto sicuro
(`localhost` o HTTPS): sulla rete locale in `http` l'iPhone installa l'app ma non la
apre offline.

## Struttura

`src/api` interfaccia `Api`, query, voto, cache persistita, client finto ·
`src/auth` accesso · `src/session` cache per utente · `src/i18n` testi e formati ·
`src/components` componenti · `src/routes` viste · `src/pwa` service worker ·
`src/design` token, font e stili.
