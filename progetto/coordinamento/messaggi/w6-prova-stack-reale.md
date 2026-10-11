# W6 → coordinatore: prova visiva sullo stack reale

11 ottobre 2026, branch `prova/stack-reale` da `origin/main` (`103a08d`, con #20, #21, #22 e #23).
Nessuna correzione al codice. Screenshot in `w6-prova-stack-reale/` (iPhone 14, 390×844 a 3×).

## Come è stato avviato

- Supabase locale con Auth, progetto separato (`project_id = "w6-prova"`, porte 573xx: le
  modifiche a `supabase/config.toml` sono solo locali, non nel commit), migrazioni e `seed.sql`.
- Password locale di `app_server`, `server/.env` verso il database e l'Auth locali.
- Web costruito in modalità vera (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`),
  servito dal Worker (`wrangler dev --port 8797 --test-scheduled`), come in produzione.
- **Catalogo:** il seed non ne ha e l'import scrive solo `bundle.json`. L'ho caricato con
  le operazioni vere dei curatori (REST `/api/catalogue/*`, accesso come `dario@example.test`):
  `w6-prova-stack-reale/carica-catalogo.mjs`, da
  `node scripts/import/import-recipes.ts --today 2026-10-11`. Risultato: 148 ingredienti,
  2 libri, 50 ricette pubblicate e 6 bozze, nessun errore.
- **Menu:** job settimanale vero (`/cdn-cgi/local/scheduled`), una volta adesso
  (settimana 12–18) e una con `time` = 30 settembre 21:30 (settimana 5–11). 14 pasti con
  ricetta per entrambe le famiglie, nessun errore.
- Utenti: Anna (amministratrice, it-IT), Bruno (membro, it-IT), Carla (en-GB, imperiale,
  Londra).

## Problemi

### 1. Bloccante: dopo la prima visita l'app non si riapre più

- **Area:** web, PWA (W5: `web/src/pwa/sw-core.ts`, `precache.ts`), con la
  configurazione degli asset del Worker (W1: `server/wrangler.jsonc`).
- **Percorso:** prima apertura e accesso (tutto bene), poi ricarica della pagina o apertura
  diretta di un indirizzo qualsiasi, anche `/`.
- **Atteso:** la shell installata dal service worker apre l'app, anche offline.
- **Osservato:** `net::ERR_FAILED` / `chrome-error://chromewebdata/` a ogni navigazione,
  finché il service worker resta registrato (`38-riapertura-err-failed.png`). Si naviga
  solo dentro l'app già aperta.
- **Causa verificata:**
  - Gli asset di Cloudflare (`html_handling` predefinito) rispondono a `/index.html`
    con `307 Location: /`.
  - L'installazione mette in cache `SHELL_URL = '/index.html'` seguendo il redirect.
    In cache resta una risposta con `redirected: true`. Dal browser:
    `{"redirected":true,"url":"http://localhost:8797/","status":200}`.
  - Chrome rifiuta una risposta "redirected" per una navigazione, quindi ogni
    navigazione fallisce.
  - `vite preview` non fa il redirect, per questo i test e le anteprime non lo vedevano.
- **Effetto:** in produzione c'è la stessa configurazione degli asset, quindi succede
  lì a ogni utente dalla seconda apertura. Per proseguire la prova ho tolto il service
  worker dal browser prima di ogni apertura diretta.

### 2. Nomi della spesa con la varietà attaccata male, nelle due lingue

- **Area:** W4, `domain/src/shopping/arrange.ts:64` (`displayName`:
  `${name} ${variety}`).
- **Percorso:** Menu → Lista della spesa, settimana 5–11, poi Bring!.
- **Atteso:** un nome leggibile della voce con varietà.
- **Osservato:**
  - in italiano «Cipolle rossa», «Cipolle rossa di Tropea»: nome plurale e varietà al
    singolare (`33-spesa-bruno-it.png`);
  - in inglese «Mushrooms button», «Onions red», «Peppers yellow», «Rice basmati»,
    «Tomatoes red and yellow cherry» (`23-spesa-en.png`);
  - gli stessi nomi finiscono nella pagina per Bring! (`/shopping-lists/<token>`,
    `"250 g Mushrooms button"`, `"1 Onions red"`).

### 3. «Non proporre più» non ha modo di aggiungere ricette

- **Area:** W1, revisione dei pasti (brief `w1-revisione-pasti`, ancora in corso).
  Lo segnalo per completezza: è un'attesa, non un errore.
- **Percorso:** Profilo → Non proporre più (`35-esclusioni.png`).
- **Atteso:** il testo dello stato vuoto rimanda a «Cambia ricetta» e «Non proporre più»
  nel menu.
- **Osservato:** sulle schede dei pasti di `main` non ci sono né «Cambia ricetta» né
  l'esclusione. Le esclusioni restano a 0 e non si possono provare.

### 4. «Dai 1 stelle» / «Give … 1 stars»

- **Area:** web, Menu (W5, `web/src/i18n/messages/menu.ts:38`, `rating.give`).
- **Percorso:** voto da scheda del pasto o da scheda ricetta, lettore di schermo.
- **Atteso:** il singolare per una stella («Dai 1 stella», «Give … 1 star»).
- **Osservato:** etichetta della prima stella al plurale nelle due lingue (dall'albero di
  accessibilità: `radio "Dai 1 stelle a Spaghetti al pomodoro"`,
  `"Give Baked aubergine balls 1 stars"`).
- **Gravità:** bassa.

### 5. Dopo «Esci» chi entra torna alla pagina dell'utente precedente

- **Area:** web, accesso (W5).
- **Percorso:** Anna in Account e preferenze → Esci → accesso come Bruno.
- **Atteso:** la nuova persona parte dal Menu.
- **Osservato:** l'indirizzo d'ingresso è `/login?redirect=%2Fprofile%2Fpreferences` e
  Bruno arriva sulle preferenze. I dati sono quelli di Bruno e la copia locale di Anna è
  cancellata (IndexedDB `kv` vuoto dopo l'uscita), quindi non c'è fuga di dati, solo un
  punto di partenza strano.
- **Gravità:** bassa.

### 6. «Last times» in inglese

- **Area:** W6 (mia), `web/src/i18n/messages/recipes.ts:81`.
- **Percorso:** scheda ricetta in en-GB (`22-scheda-en.png`).
- **Osservato:** titolo «Last times», poco naturale. Proposta: «Recently eaten» o «Last
  eaten».
- **Gravità:** bassa.

## Osservazioni, non errori

Comportamento da spec, ma da confermare con l'utente:

- **Porzioni della scheda aperta da un pasto.** «Paccheri con radicchio e bresaola» nel
  pasto di mercoledì 14 è per 2 porzioni (200 g di paccheri), ma la scheda aperta da lì
  mostra 1 porzione, cioè le porzioni della fonte (`07-scheda-ricetta-it.png`).
  - Per la spec di W6 è corretto: `slotId` sceglie solo la versione e le porzioni
    predefinite sono quelle di riferimento.
  - Chi arriva dal pasto si aspetterebbe forse le porzioni del pasto. Decisione di
    prodotto (W6, spec ricettario e voti).
- **Scalatura delle unità contate.** Aglio a 6 porzioni: «4½ spicchi»
  (`12-scheda-6-porzioni.png`). Area dominio (scalatura delle quantità).
- **Lista della spesa con «300 g + 1» melanzane:** due ricette con unità diverse,
  sommate come da spec della Spesa.

## Non verificato

- **Riapertura offline** della Spesa e del resto: impedita dal problema 1.
- **«Condividi»:** apre il foglio di condivisione nativo (`navigator.share` c'è
  nell'emulazione), che senza schermo non si osserva.
- **Bring! sul telefono:** verificati solo il link (`api.getbring.com/...deeplink?url=…`)
  e la pagina della lista temporanea, che esclude le voci spuntate.
- **Modifica di un pasto del menu:** vedi problema 3.

## Funziona

- **Accesso.** Email e password con l'Auth locale. Il Worker verifica il token (JWKS) e
  `whoami` risponde.
- **Menu (it e en).**
  - Settimana corrente e successiva dal calendario, giorno di oggi selezionato
    (`02-menu-it.png`, `05-menu-settimana-prossima.png`, `20-menu-en.png`).
  - Ingredienti del pasto alle porzioni del pasto, fonte e durata.
  - Voto confermato dal server (`ratings/set` 200, media 4,0, `03-voto-menu.png`).
  - Voto offline rifiutato con messaggio, nessuna richiesta al Worker
    (`31-voto-offline-en.png`).
- **Ricettario (it e en).**
  - 47 ricette: le 3 dei libri sono escluse; diventano 48 dopo aver segnato «Basta un Wok»
    come posseduto (`08-ricettario-it.png`).
  - Ricerca per ingrediente («zucchine»: 8).
  - Filtri per voto e gruppo, con il conteggio (`11-filtro-voto.png`).
  - «Mangiate di recente» con il pranzo di oggi in testa.
- **Scheda ricetta.** Gruppo alimentare accanto alla durata, selettore delle porzioni
  (URL `servings=6`), storico con il pranzo di oggi, ritorno al Menu sul giorno di
  partenza.
- **Profilo e famiglia.**
  - Membri, cambio lingua salvato nel profilo con tutta l'app che passa all'inglese.
  - Impostazioni salvate: porzioni di un pasto (`setMeal`), limite su un ingrediente
    (`setIngredientRestriction`), libro posseduto (`setBookOwned`), tutte 200
    (`15-impostazioni.png`).
  - Per un membro la pagina è in sola lettura.
- **Spesa.**
  - Spunte online.
  - Spunte offline con avviso «da sincronizzare» (`25-spesa-offline.png`), inviate al
    ritorno della rete: due `setItemChecked`, 3 spunte nel database
    (`27-spesa-sincronizzata.png`).
  - Bruno vede le spunte di Anna; «Quali pasti» per voce; Bring! con link e lista
    temporanea.
- **Famiglie separate.** Carla vede il suo menu, quantità in oz e 47 ricette
  (`36-carla-menu.png`, `37-carla-imperiale.png`).

## Stato dello stack

- Il Worker e il browser sono fermati. Supabase `w6-prova` resta avviato con i dati della
  prova; lo fermo con `supabase stop` quando non serve più.
- Le modifiche locali a `supabase/config.toml` e `server/.env` restano fuori dal commit.

STATO: FATTO
