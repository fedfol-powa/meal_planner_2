# App web di base (W5, ondata 1)

Creato: 11 ottobre 2026
Stato: spec di dettaglio, brainstorming concluso con il coordinatore l'11 ottobre 2026.
Branch `fondamenta/web`, proprietà `web/`.

Estende e rispetta la specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 12 e 14),
`design/design.md`, `design/index.html` e `design/percorsi.md`. Il prototipo in
`prototype/` è il riferimento dei percorsi approvati: il suo codice Svelte si riscrive
in React, logica e test TypeScript si riusano dove servono.

## Obiettivo

La base dell'app React su cui l'ondata 2 aggiunge le funzioni vere. Riuscita:

- su iPhone, installata come PWA, Menu, Ricettario e Profilo sono coerenti con il
  riferimento approvato, in italiano e in inglese britannico;
- l'ondata 2 sostituisce il client finto con il client oRPC senza toccare le schermate;
- il componente voto prova lo schema delle mutazioni che aggiornano la copia locale.

## Perimetro

**Dentro:**

- SPA con Vite, TanStack Router e TanStack Query, mobile-first, PWA installabile con
  service worker scritto a mano;
- token, font e componenti di `design/` riscritti in React;
- localizzazione `it-IT` e `en-GB` senza librerie;
- Menu e Ricettario in sola lettura completi nella resa, Profilo come elenco con
  destinazioni segnaposto, voto funzionante su dati finti;
- login con email e password di Supabase; modalità finta senza variabili d'ambiente;
- cache persistita di TanStack Query in IndexedDB (proposta; integrazione vera con W1).

**Fuori** (ondata 2 o 3): revisione dei pasti (matita, foglio dal basso, avviso
«Annulla»), Spesa e coda offline, pagine del Profilo, famiglia e impostazioni, bozze e
gestione del ricettario, collegamento degli agenti, amministrazione, link via email,
Google, inviti, wizard. I componenti condivisi che servono solo a queste funzioni
(foglio dal basso, avviso con «Annulla», menu «…», pulsante rosso) arrivano con la
funzione che li usa.

## Struttura

```
web/
├── index.html, vite.config.ts, tsconfig.json, package.json
├── public/            manifest.webmanifest, icone, sw.js
├── scripts/           sync-assets.mjs, build-fake-data.mjs
└── src/
    ├── main.tsx       avvio: QueryClient persistito, contesti, router, service worker
    ├── design/        tokens.css, fonts.css, global.css
    ├── i18n/          LocaleProvider, useT(), dizionari per area, formattatori Intl
    ├── api/           types.ts, client.ts, queries.ts, persister.ts, fake/
    ├── auth/          sessione Supabase o utente finto, pagina di ingresso, guardia
    ├── components/    componenti condivisi con moduli CSS
    └── routes/        rotte definite in codice, una cartella per vista
```

`web/` è il workspace npm `@app/web` dello scheletro di W1 (PR #3): dipendenze installate
dalla radice con un solo `package-lock.json`, Vitest e TypeScript della radice,
`tsconfig.json` che estende `tsconfig.base.json`. Gli script `test` e `typecheck` di
`web/package.json` sono veri, perché la radice e la CI li lanciano con `--if-present`;
`build` produce `web/dist`, usata da `npm run deploy`.

## Dipendenze

| Pacchetto | Tipo | Perché | Costo di farne a meno |
|---|---|---|---|
| `react`, `react-dom` | esecuzione | Stack deciso (sezione 1) | — |
| `@tanstack/react-router` | esecuzione | Stack deciso | — |
| `@tanstack/react-query` | esecuzione | Stack deciso | — |
| `@tanstack/react-query-persist-client` | esecuzione | Ripristino della cache prima che le query partano (`PersistQueryClientProvider`) | Riscrivere ripristino e salvataggio con i loro tempi, circa 80 righe con casi limite |
| `@supabase/supabase-js` | esecuzione | Login e sessione con rinnovo del token (consentito dal brief) | — |
| `vite`, `@vitejs/plugin-react`, `typescript` (dalla radice) | sviluppo | Build e tipi | — |
| `vitest` | sviluppo (dalla radice) | Test, già usato nel prototipo e nello scheletro | — |
| `@testing-library/react` | sviluppo | Montaggio e interrogazioni per ruolo e nome accessibile | Montaggio a mano con `act`, test più lunghi e fragili, nessuna verifica dei nomi accessibili |
| `jsdom` | sviluppo | DOM dei test dei componenti | Nessun test dei componenti |

Esclusi di proposito: plugin delle rotte basate su file, `vite-plugin-pwa`, librerie di
localizzazione, `idb-keyval`, `fake-indexeddb`, `user-event`, zod nel web, Tailwind e
librerie di componenti o icone. Le versioni si verificano con Context7 nel piano.

## Rotte

Definite in codice con `createRoute` (niente plugin che genera le rotte dai file: con
una decina di rotte non ripaga dipendenza e codice generato). I parametri di ricerca
si validano con funzioni `validateSearch` nostre.

| Rotta | Contenuto |
|---|---|
| `/` | Rimanda a `/menu` |
| `/login` | Pagina di ingresso, senza navbar |
| `/menu?day=` | Menu sul giorno scelto, o sul giorno di apertura |
| `/recipes?q=&meal=&time=&group=&rating=&sort=&dir=` | Ricettario con ricerca, filtri e ordinamento |
| `/recipes/$recipeId?servings=&from=&day=` | Scheda ricetta; `from=menu&day=` per tornare al giorno |
| `/profile` | Profilo |

Senza sessione ogni rotta tranne `/login` rimanda a `/login`, conservando la
destinazione; dopo l'accesso si torna lì. Una rotta sconosciuta mostra «Contenuto non
trovato» con il collegamento al Menu.

## Design

- **Token** da `design/design.md` come variabili CSS in `src/design/tokens.css`
  (valori uguali a `prototype/src/lib/design/tokens.css`), font locali con
  `font-display: swap` e `font-synthesis: none`, stili di base in `global.css`.
- **Moduli CSS** di Vite per componente; nessun framework CSS.
- **Font e foto** copiati da `design/assets` in `web/public/` da `scripts/sync-assets.mjs`
  prima di `dev` e `build`, ignorati da Git (come nel prototipo, senza duplicati versionati).
- **Icone** SVG lineari in un componente `Icon` con un insieme chiuso di nomi, presi da
  `IconLibrary.svelte`; sempre con nome accessibile.
- **Componenti** (React, dal prototipo): `BottomNav`, `Icon`, `RecipeCard` (un solo
  componente per pasti e ricettario, con le forme con foto, senza foto, pasto libero e
  slot vuoto), `RatingStars`, `DaySelector`, `DatePicker`, `IngredientList`,
  `RecipeFilters`, `PageHeader`, `StateNotice`, `OfflineBanner`, `ServingsStepper`.
- **Controlli** da almeno 44 px, focus visibile, semantica nativa o ARIA, navbar che
  rispetta l'area sicura dell'iPhone.

## Schermate

### Menu

Come il percorso 1 approvato (`design/percorsi.md`, giro 1; `design/design.md`).

- **Apertura:** il giorno in `?day=` se ha un menu; altrimenti oggi se ha pasti, poi il
  primo giorno futuro con pasti; senza settimane «Ancora nessun menu» con il testo per i
  membri (la generazione arriva nell'ondata 2).
- **Barra** sopra il selettore: mese del giorno scelto in Agrandir Tight; a destra le
  icone calendario e borsa. Mese e calendario aprono `DatePicker`, un mese navigabile in
  cui sono attivi solo i giorni con menu. La borsa è visibile ma disattivata, con nome
  accessibile, finché la Spesa non esiste.
- **Selettore dei giorni** a tutta larghezza, bordo scuro e raggio 8 px, giorno attivo
  scuro con testo bianco; sincronizzato con le colonne.
- **Colonne dei giorni** a scorrimento orizzontale nativo con aggancio; dentro il giorno
  si scorre in verticale. Pranzo e cena in colonna sotto 768 px e affiancati sopra.
  Il giorno visibile si riflette in `?day=` senza aggiungere voci alla cronologia.
- **Schede dei pasti:** banner 3:1 con l'etichetta Pranzo/Cena, titolo collegato alla
  fonte, descrizione, riga con durata e porzioni e fonte troncata a 22 caratteri (testo
  completo nel `title` e per i lettori di schermo). Pasto libero su fondo e bordo dei
  pasti liberi; slot vuoto «Nessuna ricetta adatta». Nota e ultima modifica («Cambiato
  da Anna, giovedì 21:30», «ex membro») quando presenti.
- **Footer a icone:** scheda ricetta, voto con la media, ingredienti con il numero. Voto
  e ingredienti si aprono sotto il footer, uno alla volta. Niente matita.
- **Pasto passato** calcolato sul dispositivo, nel fuso orario della famiglia: pranzo
  passato dalle 15:30, cena dalle 23:00 (specifica, sezione 5). Serve solo dove cambia
  qualcosa nella resa; non c'è un'etichetta «Passato».
- **Navbar:** un tocco su Menu con il Menu già aperto porta al giorno di apertura.

### Ricettario

Come il percorso 2 approvato.

- Titolo, campo di ricerca e, a destra, l'icona senza riquadro che apre e chiude filtri e
  ordinamento; l'icona è verde su fondo verde chiaro quando un filtro o un ordinamento
  diverso dal nome è attivo.
- Filtri: pasto, tempo massimo, gruppo alimentare, voto minimo. Ordinamento: nome, voto,
  aggiunte di recente, mangiate di recente, con la freccia che inverte l'ordine. Nessun
  filtro per stagione. Stato nella query string, così indietro e ricarica lo conservano.
- Schede con lo stesso `RecipeCard`, etichetta del gruppo alimentare, footer con scheda,
  voto e ingredienti alle porzioni della fonte.
- «Nessun risultato» con l'invito ad allargare i filtri e il pulsante per toglierli.
- Ricerca per nome e ingrediente nella lingua dell'utente, fatta dal client finto (nel
  prodotto la fa il server).

### Scheda ricetta

Foto 16:9 quando c'è; titolo collegato alla fonte; voto in riga; descrizione; durata;
porzioni con `ServingsStepper` (− e + da 44 px, valore in `?servings=`); ingredienti
scalati; ultime volte in cui la famiglia l'ha mangiata, se presenti. La freccia
«indietro» porta al giorno del Menu se `from=menu`, altrimenti al Ricettario con i
filtri di prima.

### Profilo

Nome in Agrandir Tight 28 px ed email; `settings-card` con righe da 52 px:

- **Famiglia:** nome della famiglia mostrata; righe segnaposto disattivate (Membri e
  inviti, Impostazioni, Non proporre più).
- **Account:** lingua con due scelte (Italiano, English) che cambia subito l'interfaccia
  (in modalità finta la scelta vive sul dispositivo; il salvataggio sul profilo arriva
  con l'operazione dell'ondata 2); «Esci», solo in modalità vera (in modalità finta
  non c'è login).
- Le righe dei ruoli (gestione del ricettario, collegamento degli agenti,
  amministrazione) non compaiono: arrivano con le loro funzioni.

### Ingresso

Pagina senza navbar, colonna di 420 px, marchio «Cosa si mangia?» in verde maiuscolo,
titolo in Agrandir Tight 28 px, campi email e password alti 44 px, pulsante scuro a
tutta larghezza. Errori tradotti: credenziali errate, rete assente, errore generico.
Nessun «password dimenticata»: per ora la reimposta l'amministratore da Supabase. In
modalità finta la pagina non serve e `/login` rimanda al Menu.

## Localizzazione

Nessuna libreria (deciso con il coordinatore l'11 ottobre 2026).

- `Locale = 'it-IT' | 'en-GB'`; `LocaleProvider` con la lingua corrente e `useT()` che
  restituisce `t(key, params)` tipato sulle chiavi: una chiave inesistente non compila.
- Dizionari divisi per area (`common`, `nav`, `menu`, `recipes`, `profile`, `auth`,
  `errors`), uniti in un unico tipo; un test verifica stesse chiavi nelle due lingue e
  nessun testo vuoto. Così i worker dell'ondata 2 aggiungono file senza conflitti.
- Segnaposto `{name}` come nel prototipo. Plurali con `Intl.PluralRules`: chiavi con
  suffisso `.one` e `.other`, scelte da `t` quando c'è il parametro `count`.
- Date, numeri e medie con `Intl`, riusando i formattatori del prototipo
  (`prototype/src/lib/i18n/dates.ts`) e i loro test.
- Lingua iniziale: prima del login quella del browser (`en-GB` se la lingua del browser
  è inglese, altrimenti `it-IT`); dopo il login quella del profilo. L'attributo `lang`
  del documento segue la lingua.
- I testi delle ricette arrivano già localizzati nelle viste (sezione 1): il web non li
  traduce.

## Dati e client

### Interfaccia `Api`

Forma accettata dal coordinatore l'11 ottobre 2026 e girata a W1. Un oggetto annidato
per area, come il client oRPC (`createORPCClient` con `RPCLink` verso `/api/rpc`),
fornito alle schermate da un contesto React (`ApiProvider`, `useApi()`), mai importato
direttamente:

| Metodo | Input | Output (`data`) |
|---|---|---|
| `me.get` | — | utente, lingua, famiglie e famiglia mostrata |
| `menu.getOpening` | `familyId` | `{ kind: 'no_weeks' }` o giorno e settimana di apertura |
| `menu.getWeek` | `familyId`, `weekStartsOn` | `WeekView` |
| `menu.getDates` | `familyId`, `month` | giorni con menu nel mese |
| `recipes.search` | `familyId`, `query`, `filters`, `sort` | elenco di `RecipeCardView` |
| `recipes.get` | `familyId`, `recipeId`, `servings?` | `RecipeDetailView` |
| `ratings.set` | `familyId`, `recipeId`, `stars` (1-5 o `null`) | `RatingSummary` |

- Le viste sono già pronte: testi nella lingua dell'utente, quantità scalate e
  convertite. Tipi provvisori in `web/src/api/types.ts`, ricavati da
  `prototype/src/lib/operations/views.ts`; quando W1 pubblica `contract/`, il tipo di
  `Api` diventa il client del contratto e i nomi si allineano a quelli dell'ondata 2.
- **Errori a codici:** il client lancia `ApiError` con `code` (`forbidden`, `not_found`,
  `invalid`, `conflict`, `unauthorized`, `network`…) e dati facoltativi; il web li
  traduce con `errors.<code>`.
- **«Invariato» nel contratto** (decisione di W1 riportata dal coordinatore): le letture
  ricevono `knownVersion` facoltativo e restituiscono `{ unchanged: true, version }`
  oppure `{ unchanged: false, version, data }`. Lo strato delle query lo gestisce in
  modo trasparente: passa la versione posseduta e, se `unchanged`, restituisce la vista
  già in cache. Le schermate ricevono solo `data`. Il client finto restituisce sempre
  `unchanged: false`.
- **Token di sessione:** il client vero riceve `getAccessToken()`, che legge la sessione
  corrente di `supabase-js` a ogni richiesta, e lo mette in `Authorization: Bearer`.
- **Build:** `vite build` produce `web/dist`; il Worker di W1 la serve come asset
  statici con ripiego su `index.html` per le rotte della SPA (girato a W1).

### Query

`web/src/api/queries.ts` contiene le `queryOptions` scritte a mano, con chiavi
`[area, operazione, input]`, e la funzione che avvolge le letture con `knownVersion`.
Niente `@orpc/tanstack-query` per ora: l'integrazione ufficiale si valuta nell'ondata 2
(specifica, sezione 15, «da verificare»).

### Client finto

- `web/src/api/fake/`: implementazione completa di `Api` in memoria, usata nei test e
  in modalità finta, con una piccola attesa per rendere visibili i caricamenti.
- **Dati:** `scripts/build-fake-data.mjs` legge in sola lettura
  `prototype/src/lib/demo-data/generated.json` (ricette e ingredienti verificati di
  `../meal_planner`, testi inglesi dimostrativi, settimane, voti di Federico) e scrive
  `web/src/api/fake/demo-data.json`, versionato, con le sole ricette pubblicate e i campi
  usati. Persone, famiglia e voti di Anna e Tom come nel `seed.ts` del prototipo.
- **Date:** le settimane demo si spostano di settimane intere in modo che la settimana
  del 5 ottobre 2026 diventi la settimana corrente; così l'app ha sempre un menu di
  oggi. Quella del 12 ottobre diventa la successiva.
- **Porzioni:** scalatura lineare semplice, dichiarata nel codice come finta; quella vera
  la scrive W4 in `domain/`. Unità nel sistema metrico.
- **Voti:** in memoria per la sessione; la media si ricalcola come nel prototipo.

### Voto: schema delle mutazioni

`useRateRecipe()` è una `useMutation` che:

1. in `onMutate` aggiorna in modo ottimistico il `RatingSummary` della ricetta in tutte
   le viste in cache che la contengono (settimane, ricerche, scheda), salvando lo stato
   precedente;
2. in `onSuccess` applica il `RatingSummary` restituito dal server, senza rileggere;
3. in `onError` ripristina lo stato precedente e mostra l'errore tradotto vicino alle
   stelle.

È il modello per le mutazioni dell'ondata 2: «le proprie modifiche aggiornano la copia
locale senza rileggere» (sezione 1).

### Cache persistita (proposta)

- `PersistQueryClientProvider` con un persister su IndexedDB scritto a mano dietro
  un'interfaccia minima (`getItem`, `setItem`, `removeItem`); i test usano una
  implementazione in memoria della stessa interfaccia.
- Un database, una chiave per utente (`query-cache:<userId>`); all'uscita la cache in
  memoria si svuota e la copia dell'utente si cancella.
- `buster` uguale alla versione della build; `maxAge` 7 giorni, `gcTime` uguale.
- Si salvano solo le query riuscite; nessuna mutazione persistita (la coda offline è
  della Spesa, ondata 2).
- Rilettura al ritorno in primo piano e alla riconnessione (`refetchOnWindowFocus`,
  `refetchOnReconnect`); `staleTime` 0, così all'apertura si mostra la copia e si
  verifica la versione.

## Accesso e modalità

- **Modalità vera:** con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` l'app crea
  il client di Supabase e usa `signInWithPassword`; la sessione la conserva la libreria.
  Per lo sviluppo si usa lo stack locale (`supabase start`, valori da `supabase status`),
  la cui configurazione appartiene a W1. Finché il server di W1 non c'è, anche in
  modalità vera i dati arrivano dal client finto, con l'utente del login.
- **Modalità finta:** senza le variabili, utente demo Federico nella Famiglia Folloni,
  nessun login.
- `AuthProvider` espone `session`, `user`, `signIn`, `signOut`; `signOut` svuota la cache
  e cancella la copia persistita prima di tornare a `/login`.

## PWA e service worker

- `public/manifest.webmanifest` con nome «Cosa si mangia», `display: standalone`, colori
  del fondo crema e icone 192 e 512 px più l'icona Apple 180 px; meta tag Apple in
  `index.html`, `viewport-fit=cover` per l'area sicura.
- `public/sw.js` scritto a mano, circa 50 righe:
  - **navigazioni:** prima la rete, poi `index.html` dalla cache;
  - **`/assets/*`** (con hash, immutabili): dalla cache dopo il primo uso;
  - **`/api/*`** e ogni altra richiesta: mai intercettate;
  - nome della cache con la versione della build, vecchie cache cancellate
    all'attivazione; il nuovo service worker si attiva alla riapertura dell'app, senza
    avviso di aggiornamento.
- Registrato solo nella build di produzione. Le regole stanno in un modulo puro
  importabile dai test.
- Il bundle non si divide per rotta: offline sono disponibili tutte le schermate già
  caricate una volta.

## Errori e stati

- Errore di rotta con `errorComponent`: messaggio tradotto dal codice e «Riprova».
- `OfflineBanner` da `navigator.onLine` e dagli eventi `online`/`offline`: «Sei offline:
  puoi consultare i dati già caricati». Il voto offline fallisce con l'errore tradotto.
- Caricamenti con un semplice indicatore accessibile, senza scheletri decorativi.
- Stati vuoti: nessun menu, giorno senza pasti, nessun risultato, ricetta senza foto o
  descrizione.

## Verifiche

- **Test Vitest:** dizionari (stesse chiavi, nessun testo vuoto, plurali), formattatori,
  gestione di «invariato», persister, regole del service worker, pasto passato, giorno
  di apertura, spostamento delle date demo, client finto (ricerca, filtri, voti); con
  Testing Library: `RatingStars` con aggiornamento ottimistico e ripristino su errore,
  `DaySelector`, `RecipeFilters`, pagina di ingresso, guardia delle rotte.
- `tsc --noEmit` e `vite build` senza errori.
- **Prova nel browser** con agent-browser a 320, 390 e 1440 px, in italiano e inglese,
  confrontata con `design/index.html` e gli screenshot `design/references/hellofresh/preview-*`.
- **iPhone:** `npm run preview:lan` su porta 8767 per resa e installazione come PWA.
  Sulla rete locale l'indirizzo è `http`, e senza contesto sicuro il browser non
  registra il service worker: l'apertura offline si prova sul Mac con `localhost` e su
  iPhone dopo il deploy di W1 su `workers.dev` (HTTPS).

## Interfacce con altre attività

| Con | Cosa | Stato |
|---|---|---|
| W1 | Forma di `Api` e client oRPC, `getAccessToken()`, build in `web/dist` servita come asset con ripiego su `index.html` | Accettata dal coordinatore, girata a W1 |
| W1 | «Invariato» nel contratto con `knownVersion` | Deciso da W1 |
| W1 | Configurazione degli ambienti e variabili `VITE_SUPABASE_*` per lo stack locale | Da concordare tramite il coordinatore |
| W1 | `web/` come workspace `@app/web`, script `test` e `typecheck` eseguiti dalla CI | Scheletro unito su `main` (PR #3) |
| W4 | Scalatura e conversione vere delle quantità (il client finto le simula) | Ondata 2 |

## Decisioni da riportare nella specifica

**Prodotto:**

- Accesso del traguardo A solo con email e password di Supabase, senza «password
  dimenticata» nell'app; link via email e Google nell'ondata 3 (sezioni 7 e 14).
- Nella prima base dell'app la borsa della spesa è visibile ma disattivata e il Profilo
  mostra le destinazioni future come segnaposto (sezione 14; temporaneo, fino all'ondata 2).

**Tecniche:**

- Localizzazione del web senza librerie: dizionari TypeScript tipati divisi per area,
  `useT()`, plurali con `Intl.PluralRules`, date e numeri con `Intl`; lingua iniziale
  dal browser prima del login (sezioni 1 e 12; chiude in parte la voce «Lingue» della
  sezione 15 per l'impostazione iniziale della lingua).
- Rotte TanStack Router definite in codice, senza plugin delle rotte basate su file;
  stili in CSS puro con token e moduli CSS (sezione 1).
- Service worker scritto a mano senza `vite-plugin-pwa`: navigazioni dalla rete con
  ripiego su `index.html`, `/assets/*` dalla cache, `/api/*` mai intercettate,
  attivazione alla riapertura (sezione 1).
- Cache persistita con `@tanstack/react-query-persist-client` e persister IndexedDB
  scritto a mano, una copia per utente cancellata all'uscita, `buster` sulla versione
  della build, `maxAge` 7 giorni (sezione 1, letture dalla copia sul dispositivo).
- «Invariato» espresso nel contratto (`knownVersion`, `{ unchanged, version, data }`)
  al posto di HTTP 304 con `ETag`, gestito in modo trasparente dallo strato delle query
  del web (sezione 1; decisione di W1).
- Query del web con `queryOptions` scritte a mano; `@orpc/tanstack-query` da valutare
  nell'ondata 2 (sezioni 1 e 15).
- Mutazioni con aggiornamento ottimistico delle viste in cache, risposta applicata senza
  rileggere e ripristino su errore, provate con il voto (sezione 1).
- Test del web con Vitest, Testing Library e jsdom; prova visiva con agent-browser e
  iPhone, senza Playwright (sezione 9).
- Modalità finta del web senza variabili di Supabase, con client finto che implementa
  la stessa interfaccia del client vero (sezione 1).
