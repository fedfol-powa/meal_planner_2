# App web di base (W5, ondata 1)

Creato: 11 ottobre 2026
Stato: spec di dettaglio, brainstorming concluso con il coordinatore l'11 ottobre 2026;
corretta l'11 ottobre dopo la review (`progetto/coordinamento/revisioni/w5-spec-piano.md`)
con le decisioni del coordinatore (`progetto/coordinamento/messaggi/w5-01-review.md`) e
dopo la seconda review (`progetto/coordinamento/revisioni/w5-spec-piano-2.md`, scelte
tecniche in `progetto/coordinamento/messaggi/w5-02-review2.md`).
Branch `fondamenta/web`, proprietà `web/`. Seconda PR (client oRPC reale e agganci di
sessione per la coda della spesa) sul branch `fondamenta/web-client`, dalla richiesta del
coordinatore `progetto/coordinamento/messaggi/w5-05-seconda-pr.md`: sezione «Seconda PR».

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
- il voto prova lo schema delle mutazioni: invio, risultato del server applicato alla
  copia locale, nessun dato non confermato salvato sul dispositivo;
- sessione, copia sul dispositivo e PWA reggono uscite, cambi d'utente, accessi revocati,
  assenza di rete e aggiornamenti dell'app.

## Perimetro

**Dentro:**

- SPA con Vite, TanStack Router e TanStack Query, mobile-first, PWA installabile con
  service worker scritto a mano;
- token, font e componenti di `design/` riscritti in React;
- localizzazione `it-IT` e `en-GB` senza librerie;
- Menu e Ricettario in sola lettura completi nella resa, Profilo come elenco con
  destinazioni segnaposto, voto funzionante su dati finti;
- login con email e password di Supabase; modalità finta senza variabili d'ambiente;
- cache persistita di TanStack Query in IndexedDB, legata alla sessione.

Il client oRPC vero **non** è in questa consegna: dopo il merge di W1 una seconda PR
piccola «client reale» aggiunge adattatore oRPC, conversione degli errori, token, proxy
di Vite e gestione di `unauthorized` dal server, pianificata allora. Qui si fissa solo
l'interfaccia `Api` che quel client implementerà.

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
├── public/            manifest.webmanifest, icone
├── scripts/           sync-assets.mjs, build-fake-data.mjs
└── src/
    ├── main.tsx       avvio: QueryClient persistito, contesti, router, service worker
    ├── design/        tokens.css, fonts.css, global.css
    ├── i18n/          LocaleProvider, useT(), dizionari per area, formattatori Intl
    ├── api/           types.ts, queries.ts, ratings.ts, persister.ts, fake/
    ├── auth/          backend Supabase o finto, stato dell'accesso, pagina di ingresso
    ├── session/       sessione: QueryClient e copia per utente, chiusura, lingua
    ├── lib/           calendario, connettività
    ├── components/    componenti condivisi con moduli CSS
    ├── routes/        rotte definite in codice, una cartella per vista
    └── pwa/           service worker: regole, installazione, registrazione
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
| `/recipes/$recipeId?servings=&from=&day=&slot=` | Scheda ricetta; `from=menu&day=&slot=` quando è aperta da un pasto |
| `/profile` | Profilo |

Senza sessione ogni rotta tranne `/login` rimanda a `/login`, conservando la
destinazione (solo percorsi locali); dopo l'accesso si torna lì. Una rotta sconosciuta
mostra «Contenuto non trovato» con il collegamento al Menu.

**Riferimento al pasto (rilievo 11).** La scheda aperta da un pasto conserva l'id dello
slot in `?slot=`, nell'input `recipes.get({ slotId })` e nella chiave della query. Oggi
il client finto lo ignora; nell'ondata 2 il server lo usa per mostrare la versione con
cui il pasto passato è stato mangiato e le ricette archiviate citate dai pasti
(specifica, sezioni 5 e 8, R1).

## Design

- **Token** da `design/design.md` come variabili CSS in `src/design/tokens.css`
  (valori uguali a `prototype/src/lib/design/tokens.css`), font locali con
  `font-display: swap` e `font-synthesis: none`, stili di base in `global.css`.
- **Catena delle altezze** (rilievo 8): `html`, `body` e `#root` hanno un'altezza
  definita (`body` a `100dvh` con `overflow: hidden`, `#root` al 100%), così `.shell`
  occupa lo schermo e scorrono solo i contenitori previsti (colonne dei giorni, viste
  secondarie, pagina di ingresso). La navbar resta sempre visibile.
- **Moduli CSS** di Vite per componente; nessun framework CSS.
- **Font e foto** copiati da `design/assets` in `web/public/assets/` da
  `scripts/sync-assets.mjs` prima di `dev` e `build`, ignorati da Git.
- **Icone** SVG lineari in un componente `Icon` con un insieme chiuso di nomi, presi da
  `IconLibrary.svelte`; sempre con nome accessibile.
- **Componenti** (React, dal prototipo): `BottomNav`, `Icon`, `RecipeCard` (un solo
  componente per pasti e ricettario, con le forme con foto, senza foto, pasto libero e
  slot vuoto), `RatingStars`, `DaySelector`, `DatePicker`, `IngredientList`,
  `RecipeFilters`, `PageHeader`, `StateNotice`, `QueryError`, `FamilyGate`,
  `OfflineBanner`, `ServingsStepper`.
- **Controlli** da almeno 44 px, focus visibile, semantica nativa o ARIA, navbar che
  rispetta l'area sicura dell'iPhone.

## Schermate

### Menu

Come il percorso 1 approvato (`design/percorsi.md`, giro 1; `design/design.md`).

- **Apertura:** il giorno in `?day=` se ha un menu; altrimenti oggi se ha pasti, poi il
  primo giorno futuro con pasti; senza settimane «Ancora nessun menu» con il testo per i
  membri (la generazione arriva nell'ondata 2). Un `?day=` malformato o di una settimana
  inesistente riporta al giorno di apertura.
- **Barra** sopra il selettore: mese del giorno scelto in Agrandir Tight; a destra le
  icone calendario e borsa. Mese e calendario aprono `DatePicker`, un mese navigabile in
  cui sono attivi solo i giorni con menu. La borsa è visibile ma disattivata, con nome
  accessibile, finché la Spesa non esiste.
- **Calendario e focus** (rilievo 13): apertura e chiusura passano da un solo percorso
  che ricorda il controllo che l'ha aperto (mese o icona); alla scelta di un giorno, con
  Escape o con un tocco fuori, il focus torna a quel controllo. Il focus iniziale va al
  giorno scelto una sola volta per apertura: una rilettura dei dati non lo sposta.
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
- **Footer a icone:** scheda ricetta (con il riferimento allo slot), voto con la media,
  ingredienti con il numero. Voto e ingredienti si aprono sotto il footer, uno alla
  volta. Niente matita.
- **Pasto passato** calcolato sul dispositivo, nel fuso orario della famiglia: pranzo
  passato dalle 15:30, cena dalle 23:00 (specifica, sezione 5). Serve solo dove cambia
  qualcosa nella resa; non c'è un'etichetta «Passato».
- **Navbar:** un tocco su Menu con il Menu già aperto porta al giorno di apertura; da
  un'altra vista il Menu torna sul giorno scelto prima.

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

Foto 16:9 quando c'è; titolo collegato alla fonte web; sotto il titolo la riga della
fonte quando non è un sito (rilievo 12): «Libro: titolo, pp. pagine», «Ricetta di
casa», «Video YouTube»; voto in riga; descrizione; durata; porzioni con
`ServingsStepper` (− e + da 44 px, valore in `?servings=`); ingredienti scalati; ultime
volte in cui la famiglia l'ha mangiata, se presenti. La freccia «indietro» porta al
giorno del Menu se `from=menu`, altrimenti al Ricettario con i filtri di prima.

### Profilo

Nome in Agrandir Tight 28 px ed email; `settings-card` con righe da 52 px:

- **Famiglia:** nome della famiglia mostrata e ruolo; righe segnaposto disattivate
  (Membri e inviti, Impostazioni, Non proporre più).
- **Account:** lingua con due scelte (Italiano, English) che cambia subito l'interfaccia
  (vedi «Lingua»); «Esci», solo in modalità vera.
- La scheda Account resta sempre disponibile (rilievo 9): anche se la lettura del
  profilo fallisce o la persona non ha famiglie, lingua ed «Esci» funzionano; al posto
  del nome compare l'email della sessione. Con un errore diverso da `network` nome ed
  email del profilo in cache non si mostrano (seconda review, rilievo 8).
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
- L'attributo `lang` del documento segue la lingua.
- I testi delle ricette arrivano già localizzati nelle viste (sezione 1): il web non li
  traduce. Le chiavi delle query comprendono la lingua, così una risposta nella lingua
  precedente (anche se arriva dopo il cambio) non si mostra mai nella nuova.
- **Dati precedenti durante una nuova lettura** (seconda review, rilievo 7): mai quando
  cambiano lingua, famiglia, ricetta o pasto. Sono ammessi solo fra letture della stessa
  vista che differiscono per filtri e ordinamento (Ricettario) o per porzioni (scheda
  ricetta, con gli ingredienti segnati «in aggiornamento» finché arriva la risposta).

**Quale lingua vale** (rilievo 10, decisione del coordinatore):

| Situazione | Lingua |
|---|---|
| Modalità finta | Preferenza del dispositivo (chiave `locale:device`), altrimenti quella del browser |
| Modalità vera, nessuna sessione | Lingua del browser (`en-GB` se inglese, altrimenti `it-IT`) |
| Modalità vera, con sessione | A ogni cambio d'identità la lingua del profilo (`me.user.locale`); la scelta nel Profilo è temporanea per quell'utente (chiave `locale:user:<id>`), mai globale, e si cancella con la chiusura della sessione |

Il salvataggio della lingua sul profilo arriva con l'operazione dell'ondata 2. Il client
finto localizza leggendo la lingua corrente dal web; il server di W1 localizza dal
profilo: con il client reale la scelta nel Profilo dovrà passare da quell'operazione.

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
| `recipes.search` | `familyId`, `query`, `filters`, `sort` | elenco di ricette con voto e ingredienti |
| `recipes.get` | `familyId`, `recipeId`, `servings?`, `slotId?` | `RecipeDetailView` |
| `ratings.set` | `familyId`, `recipeId`, `stars` (1-5 o `null`) | `RatingSummary` |

- Le viste sono già pronte: testi nella lingua dell'utente, quantità scalate e
  convertite. Tipi provvisori in `web/src/api/types.ts`, ricavati da
  `prototype/src/lib/operations/views.ts`; quando W1 pubblica `contract/`, il tipo di
  `Api` diventa il client del contratto e i nomi si allineano a quelli dell'ondata 2.
- **Errori a codici:** il client lancia `ApiError` con `code` (`forbidden`, `not_found`,
  `invalid`, `conflict`, `unauthorized`, `network`…) e dati facoltativi; il web li
  traduce con `errors.<code>`.
- **«Invariato» nel contratto** (decisione di W1): le letture ricevono `knownVersion`
  facoltativo e restituiscono `{ unchanged: true, version }` oppure
  `{ unchanged: false, version, data }`. **La versione è una stringa opaca** (rilievo 3):
  il web non la interpreta né la confronta, la conserva e la rimanda. Lo strato delle
  query la gestisce in modo trasparente: passa la versione posseduta e, se `unchanged`,
  restituisce la vista già in cache. Le schermate ricevono solo `data`. Il client finto
  restituisce sempre `unchanged: false` con una versione composta realistica.
- **Token di sessione:** il backend di accesso espone `getAccessToken()`, letto a ogni
  richiesta dal futuro client reale (`Authorization: Bearer`).
- **Build:** `vite build` produce `web/dist`; il Worker di W1 la serve come asset
  statici con ripiego su `index.html` per le rotte della SPA.

### Query

`web/src/api/queries.ts` contiene le `queryOptions` scritte a mano, con chiavi
`[area, operazione, input]` in cui l'input comprende `familyId` e la lingua, e la
funzione che avvolge le letture con `knownVersion`. Con `unchanged` la funzione rilegge la
cache **dopo** la risposta e la restituisce solo se ha ancora la versione inviata;
altrimenti chiede la vista completa (seconda review, rilievo 5). Niente `@orpc/tanstack-query` per
ora: l'integrazione ufficiale si valuta nell'ondata 2 (specifica, sezione 15).

### Client finto

- `web/src/api/fake/`: implementazione completa di `Api` in memoria, usata nei test e
  in modalità finta, con una piccola attesa per rendere visibili i caricamenti.
- **Dati:** `scripts/build-fake-data.mjs` legge in sola lettura
  `prototype/src/lib/demo-data/generated.json` (ricette e ingredienti verificati di
  `../meal_planner`, testi inglesi dimostrativi, settimane, voti di Federico) e scrive
  `web/src/api/fake/demo-data.json`, versionato. Persone, famiglia e voti di Anna e Tom
  come nel `seed.ts` del prototipo.
- **Date:** le settimane demo si spostano di settimane intere in modo che la settimana
  del 5 ottobre 2026 diventi la settimana corrente.
- **Porzioni:** scalatura lineare semplice, dichiarata nel codice come finta; quella vera
  la scrive W4 in `domain/`. Unità nel sistema metrico.
- **Connettività** (rilievo 14): come un trasporto vero, il client finto rifiuta ogni
  chiamata con `network` quando il dispositivo è offline (`navigator.onLine`, lo stesso
  meccanismo del banner offline).

### Voto: schema delle mutazioni

Semplificato dal coordinatore dopo la review (rilievi 4, 5, 6, 14): **nessun
aggiornamento ottimistico**, quindi nessun dato non confermato entra nella cache né
nella copia sul dispositivo.

1. Il voto si invia; le stelle mostrano lo stato di invio («Invio del voto…», stelle
   non modificabili) finché non arriva la risposta.
2. Alla risposta, il `RatingSummary` del server si applica alle viste in cache **della
   stessa famiglia** che contengono la ricetta: settimane del Menu e schede ricetta.
3. Le liste del Ricettario della stessa famiglia, la cui appartenenza o ordine può
   dipendere dal voto, si marcano scadute e si rileggono quando sono mostrate.
4. Per la stessa ricetta vale solo la risposta dell'ultima richiesta; le risposte
   arrivate dopo la chiusura della sessione o un cambio d'utente si scartano.
5. Prima di applicare il risultato si annullano le letture in corso delle settimane e
   delle schede ricetta della famiglia (seconda review, rilievo 5): la loro risposta,
   partita prima della conferma, non sovrascrive il voto né finisce sul dispositivo. Le
   letture annullate che non avevano ancora dati ripartono dopo il voto.
6. Errore: le stelle restano al valore confermato e compare l'errore tradotto. Offline il
   voto fallisce subito con `network`, senza coda e senza invio alla riconnessione.

È il modello per le mutazioni dell'ondata 2.

### Cache persistita

- `PersistQueryClientProvider` con un persister su IndexedDB scritto a mano dietro
  un'interfaccia minima (`get`, `set`, `delete`, `keys`); i test usano una
  implementazione in memoria della stessa interfaccia.
- Una chiave per utente (`query-cache:<userId>`). Le scritture di un persister passano
  in coda: dopo la chiusura il persister non scrive più e la cancellazione avviene dopo
  le scritture già partite, così nulla ripopola la copia cancellata.
- **Pulizia solo a identità nota** (seconda review, rilievo 1): finché Supabase non ha
  risposto l'identità è «non ancora nota», non esiste alcuna sessione e non si cancella
  nulla. Nota l'identità, si cancellano le copie degli **altri** utenti; con un'uscita
  confermata (nessuna sessione) si cancellano tutte. La copia dell'utente che rientra
  resta e si ripristina, anche offline.
- **Famiglie revocate sul dispositivo** (seconda review, rilievo 4): accanto alla copia c'è
  un segno per utente (`revoked:<userId>`, famiglia e momento della revoca). Il persister
  toglie le viste delle famiglie segnate a ogni scrittura e a ogni ripristino, così
  nessuna scheda, nemmeno una che non sa ancora della revoca, le riporta in vita. Il segno
  di una famiglia si toglie quando una lettura di quella famiglia **partita dopo la revoca**
  riesce: il server l'ha resa di nuovo.
- `buster` uguale alla versione della build; `maxAge` 7 giorni, `gcTime` uguale.
- Si salvano solo le query riuscite; nessuna mutazione.
- Rilettura al ritorno in primo piano e alla riconnessione (`refetchOnWindowFocus`,
  `refetchOnReconnect`); `staleTime` 0, così all'apertura si mostra la copia e si
  verifica la versione.

## Accesso e sessione

- **Modalità vera:** con `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` l'app crea
  il client di Supabase (chiave di archiviazione propria `cosasimangia-auth`) e usa
  `signInWithPassword`; la sessione la conserva e rinnova la libreria. Per lo sviluppo si
  usa lo stack locale (`supabase start`, valori da `supabase status`), la cui
  configurazione appartiene a W1. Finché il client reale non c'è, anche in modalità vera
  i dati arrivano dal client finto, con l'utente del login.
- **Modalità finta:** senza le variabili, utente demo Federico nella Famiglia Folloni,
  nessun login.

**Identità e generazioni** (seconda review, rilievi 1-3). Lo stato dell'accesso distingue
«identità non ancora nota» (`loading`, all'avvio finché Supabase non ha risposto) da
«uscita confermata» (`signedOut`): solo la seconda chiude e cancella. Ogni evento
d'identità (risposta della verifica, evento di Supabase, uscita) porta un numero
progressivo: una verifica partita prima di un evento più recente si scarta. Ogni identità
mostrata ha la sua sessione, che fa da generazione: rinnovi, risposte e uscite di una
sessione già chiusa non hanno effetti su quella nuova, e un'uscita non chiude mai
un'identità arrivata nel frattempo.

**Chiusura della sessione** (rilievo 1, decisione del coordinatore). Una sola procedura,
usata da «Esci», dall'evento `SIGNED_OUT` arrivato da un'altra scheda o dalla libreria e
da ogni cambio d'utente:

1. la sessione chiusa diventa inerte: le richieste pendenti si annullano e le loro
   risposte, come quelle delle mutazioni, si scartano;
2. si svuota la cache in memoria, si chiude il persister e si cancella la copia
   persistita dell'utente, dopo le scritture già partite;
3. si cancella la scelta temporanea di lingua di quell'utente;
4. per «Esci»: `signOut({ scope: 'local' })`, cioè solo questo dispositivo. Se Supabase
   restituisce un errore (per esempio rete assente) la pulizia locale avviene comunque:
   la libreria toglie la sessione salvata anche in quel caso, e il backend lo verifica
   cancellando la propria chiave se fosse rimasta.

**Accesso rifiutato dal server** (rilievo 2):

- `unauthorized`: gestito dalla sessione attorno a ogni chiamata dell'`Api`. Un solo
  rinnovo alla volta per sessione: le chiamate rifiutate mentre è in corso aspettano lo
  stesso rinnovo, quelle partite prima di un rinnovo già riuscito ripetono subito la
  chiamata. Riuscito il rinnovo, ogni chiamata rifiutata si ripete una volta; se il
  rinnovo fallisce o la ripetizione è di nuovo rifiutata, la sessione si chiude (una
  volta sola) e compare la pagina di ingresso. Il client finto non lo produce mai; il
  meccanismo si prova con un client di test e riceverà il caso reale con il client oRPC.
- `forbidden` su una lettura di famiglia: le viste di quella famiglia si tolgono dalla
  memoria e dalla copia persistita (con il segno descritto sopra), la famiglia è segnata
  come revocata per la sessione e le schermate mostrano «Non hai accesso a questa
  famiglia», senza dati; il profilo si rilegge.
- **Fra schede** (seconda review, rilievo 4): la scheda che riceve `forbidden` o chiude la
  sessione lo annuncia con `BroadcastChannel` del browser, senza librerie. Le altre
  schede dello stesso utente tolgono quella famiglia o chiudono la sessione e non
  riscrivono la copia.
- Nessuna schermata mostra dati in cache accanto a un errore diverso da `network`.

**Offline senza poter verificare la sessione.** Se all'avvio il rinnovo del token non
riesce per mancanza di rete, la sessione salvata vale come «non verificata»: la copia sul
dispositivo si mostra in sola consultazione (banner offline). Alla riconnessione si
rinnova la sessione; se il rinnovo è rifiutato, si chiude la sessione come sopra.
Unica eccezione, dalla seconda PR: la lista della spesa resta modificabile (sezione «Spesa
offline con sessione non verificata»).

## PWA e service worker

- `public/manifest.webmanifest` con nome «Cosa si mangia», `display: standalone`, colori
  del fondo crema e icone 192 e 512 px più l'icona Apple 180 px; meta tag Apple in
  `index.html`, `viewport-fit=cover` per l'area sicura.
- Service worker scritto a mano, costruito da Vite come seconda entrata (`/sw.js`), con
  la logica in un modulo testabile (cache e rete passate come dipendenze):
  - **installazione** (rilievo 7): scarica l'elenco della shell generato dalla build
    (`precache.json`: `index.html`, JavaScript e CSS con hash, font) e lo mette tutto in
    una cache nuova legata alla versione. Se un file non arriva, l'installazione fallisce,
    la cache parziale si cancella e resta in servizio la versione precedente;
  - **attivazione:** solo quando la nuova cache è completa si cancellano le vecchie; il
    nuovo service worker prende il controllo alla riapertura dell'app, senza avvisi;
  - **navigazioni** (seconda review, rilievo 6): dalla shell installata e completa della
    versione in servizio, mai scritta durante l'uso; la rete solo se quella cache non ha
    la shell. Così non si serve mai HTML nuovo con bundle mancanti: la nuova shell entra
    in servizio intera, alla riapertura dopo la sua installazione completa;
  - **`/assets/*`:** dalla cache, poi dalla rete (le foto entrano in cache al primo uso);
  - **rotte del server** (`/api`, `/mcp`, `/internal`, `/shopping-lists`,
    `/.well-known`, `/openapi.json`) e ogni altra origine o metodo: mai intercettate.
- Registrato solo nella build di produzione e solo in contesto sicuro: la prima apertura
  offline è possibile dalla seconda visita, dopo che l'installazione è completa.

## Errori e stati

- Ogni lettura distingue **caricamento**, **errore** e **dati** (rilievo 9). Gli errori
  mostrano il messaggio tradotto con «Riprova», che ripete la lettura fallita.
- `FamilyGate` davanti a Menu, Ricettario e scheda ricetta: caricamento del profilo,
  errore del profilo con «Riprova», nessuna famiglia («Non fai parte di nessuna
  famiglia», anche quando la famiglia mostrata non c'è più) e famiglia revocata.
- `OfflineBanner` dalla connettività (`navigator.onLine` ed eventi `online`/`offline`):
  «Sei offline: puoi consultare i dati già caricati».
- Errori di rete con dati già in cache: si mostrano i dati (sola consultazione).
- Caricamenti con un semplice indicatore accessibile, senza scheletri decorativi.
- Stati vuoti: nessun menu, giorno senza pasti, nessun risultato, ricetta senza foto o
  descrizione.

## Verifiche

- **Test Vitest** sui comportamenti critici indicati dalla review: uscita con errore di
  rete, `SIGNED_OUT` esterno, cambio A→B, richiesta e scrittura persistita pendenti
  durante l'uscita, riapertura dopo ciascuno; `unauthorized` con rinnovo riuscito e
  fallito; `forbidden` con cache popolata, anche dopo ricarica; versione composta
  attraverso query, client e risposta, anche `unchanged`; voto confermato applicato solo
  alla stessa famiglia, liste rilette, risposte fuori ordine, risposta dopo l'uscita,
  voto offline senza invio alla riconnessione; lingua A inglese → uscita → B italiano,
  riapertura con preferenza preesistente, risposte nella lingua precedente; profilo che
  fallisce, nessuna famiglia, famiglia scomparsa, «Riprova»; riferimento allo slot; fonte
  da libro; focus del calendario; service worker: prima visita → riapertura offline,
  aggiornamento A→B → riapertura offline, installazione interrotta.
- **Seconda review:** avvio con copia valida e verifica sospesa, completata come utente
  verificato e come non verificabile offline (la copia resta e si mostra); due o più
  `unauthorized` concorrenti con un solo rinnovo; rifiuto dopo il rinnovo con una sola
  chiusura; rinnovo di A pendente → ingresso di B → rinnovo concluso (riuscito e fallito),
  B resta; verifica iniziale pendente seguita da uscita o cambio d'identità; due schede
  dello stesso utente sullo stesso archivio, `forbidden` in una e scrittura tardiva
  nell'altra, riapertura offline senza la famiglia; lettura pendente → voto confermato →
  risposta vecchia, completa e `unchanged`, con cache, copia e riapertura; worker A →
  deploy B → navigazione online → installazione di B interrotta → riapertura offline con
  la shell A intera; cambio di lingua, di ricetta e di pasto sulle schermate vere con
  risposta ritardata; Profilo con errore non di rete dopo dati caricati.
- Dizionari, formattatori, calendario, client finto, componenti con Testing Library.
- `tsc` e `vite build` senza errori, anche dalla radice (`npm test`, `npm run typecheck`).
- **Prova nel browser** con agent-browser a 320, 390 e 1440 px, in italiano e inglese,
  confrontata con `design/index.html` e gli screenshot
  `design/references/hellofresh/preview-*`; Ricettario lungo e Menu con ingredienti
  aperti a 320 e 390 px (navbar visibile, fine del contenuto raggiungibile); prova da
  tastiera e con VoiceOver del calendario e delle stelle; apertura offline e
  aggiornamento della build su `localhost`.
- **iPhone:** `npm run preview:lan` su porta 8767 per resa e installazione come PWA.
  Sulla rete locale l'indirizzo è `http`, e senza contesto sicuro il browser non
  registra il service worker: l'apertura offline si prova sul Mac con `localhost` e su
  iPhone dopo il deploy di W1 su `workers.dev` (HTTPS).

## Seconda PR: client reale e agganci di sessione

Dopo il merge della PR #6 e della piattaforma di W1 (PR #5). È la base delle parti web
dell'ondata 2 (W1, W2, W4, W6), quindi resta piccola: trasporto, errori, composizione
delle aree, agganci della sessione e deroga della Spesa. Nessuna schermata nuova.

### Client oRPC

- **Trasporto:** `createRpcClient({ getAccessToken, fetch? })` in `web/src/api/rpc.ts`:
  `createORPCClient` con `RPCLink` verso `/api/rpc` dell'origine corrente (la rotta di
  `server/src/app.ts`), tipato con `ContractRouterClient<Contract>` dal contratto
  importato solo come tipo. A ogni richiesta l'header `authorization: Bearer <token>`
  legge `backend.getAccessToken()`; senza token la richiesta parte senza header e il
  server risponde `unauthorized`, che segue il protocollo della sessione (rinnovo, poi
  ingresso).
- **Errori** (interceptor del link): `ORPCError` con un codice del contratto →
  `ApiError(code, data)`; fallimento del trasporto (`TypeError` di `fetch`) →
  `network`; ogni altro errore, comprese risposte che non sono del protocollo (pagina
  del proxy, 502) → `unknown`; l'annullamento di una lettura (`AbortError`) passa
  invariato, perché TanStack Query lo riconosca. `ApiErrorCode` diventa l'unione dei
  codici del contratto (`ErrorCode`, importato come tipo) con `network` e `unknown`,
  e il dizionario `errors` ha un testo per ognuno (i nuovi: `internal`, `last_admin`,
  `last_app_admin`, `sole_member`, `web_only`).
- **Aree dal server e aree ancora finte.** Il contratto su `main` ha solo
  `session.whoami`; Menu, Ricettario, voto e profilo arrivano con i produttori
  dell'ondata 2. Perciò:
  - `SERVER_AREAS` in `web/src/api/types.ts`: elenco scritto a mano delle aree del
    contratto lette dal server (oggi `['session']`), controllato con
    `satisfies readonly (keyof Contract)[]`;
  - `Api = ContractRouterClient<Pick<Contract, ServerArea>> & ProvisionalApi`, dove
    `ProvisionalApi` sono le aree provvisorie di oggi (`me`, `menu`, `recipes`,
    `ratings`);
  - in **modalità vera** il client della sessione si compone per area: le aree di
    `SERVER_AREAS` dal client oRPC, le altre dal client finto con l'utente del login
    (come oggi). In **modalità finta** tutto dal client finto, che implementa anche le
    aree del server con la loro forma (oggi `session.whoami` dell'utente demo);
  - ogni produttore che aggiunge la sua area al contratto la mette in `SERVER_AREAS`,
    la toglie da `ProvisionalApi` e adegua alla forma del contratto le sue `queryOptions`
    e il client finto (che resta per la modalità finta e i test). Il passaggio da
    `me.get` a `profile.get` lo fa W2 (piano generale).
- **Avvolgimento della sessione:** il client oRPC è un `Proxy` senza chiavi enumerabili,
  quindi `wrapApi` avvolge con un `Proxy` ricorsivo: ogni metodo chiamato passa da
  `session.call` (con `familyId` dall'input, come oggi) e dallo scarto delle risposte in
  una lingua superata (C12). Il client finto, con oggetti normali, segue lo stesso
  percorso.
- **Lingua:** il server risponde nella lingua del profilo, riletta a ogni richiesta
  (`loadSession`); il web non la invia. Il client per lingua di C12 resta: conserva la
  lingua della chiave e scarta le risposte superate. Le letture di famiglia partono
  solo dopo il profilo (`FamilyGate`) e `ProfileLocale` applica la lingua del profilo,
  quindi coincide con quella della risposta; fa eccezione la scelta temporanea fatta
  online prima che W2 la salvi con `profile.update`, che resta sulle aree finte fino ad
  allora (limitazione dichiarata, chiusa da W2).
- **Sviluppo:** proxy di Vite per `/api` in `dev` e `preview` verso `VITE_API_TARGET`
  (predefinito `http://localhost:8787`, `wrangler dev` di W1). In produzione la build
  è servita dallo stesso Worker, stessa origine.
- **Modalità:** senza `VITE_SUPABASE_*` tutto come oggi (utente demo, client finto). Con
  le variabili: accesso Supabase e client composto.

### Agganci di sessione per la coda della spesa

Interfaccia definitiva di W4 (sezione «Interfaccia richiesta a W5» di
`progetto/superpowers/specs/2026-10-11-spesa.md`, commit `7d1ebce` del branch
`traguardo/spesa`), con le firme di W4:

- `RenewResult = {kind:'ok'; userId} | {kind:'rejected'} | {kind:'network'}` e
  `SessionClosedError` in `web/src/session/session.ts`.
- **`AuthBackend.refresh(): Promise<RenewResult>`** al posto del booleano: con Supabase
  `refreshSession()` riuscito → `ok` con l'utente del token rinnovato; errore
  `isAuthRetryableFetchError` → `network`; ogni altro errore o sessione assente →
  `rejected`. Il backend finto risponde `ok` con l'utente demo.
- **`session.renew()`**: un solo tentativo per sessione, condiviso con il rinnovo dentro
  `call` (la stessa promessa). Su sessione chiusa risponde `rejected` senza chiamare
  Supabase. `rejected` esegue la procedura unica di chiusura (annuncio alle altre
  schede, `close()` con i suoi agganci, uscita da Supabase) e risponde solo dopo;
  `network` non cambia nulla; `ok` fa crescere l'epoca dei token, così le chiamate
  rifiutate prima ripetono senza un secondo rinnovo.
- **`session.call(run, familyId?)`**: su sessione chiusa rifiuta con
  `SessionClosedError` senza eseguire `run`, anche prima della ripetizione dopo un
  rinnovo. Esiti del rinnovo dentro `call`: `ok` → una ripetizione; `rejected` → la
  sessione si chiude e la chiamata rifiuta con `SessionClosedError`; `network` → la
  chiamata rifiuta con `network` e la sessione resta (offline). Oggi ogni rinnovo
  fallito chiude: con gli esiti distinti la mancanza di rete non fa più uscire.
- **`session.onClose(hook)`**: `close()` attende gli agganci dopo la chiusura del
  persister e prima di risolversi, tutti anche se uno fallisce
  (`Promise.allSettled`). Un aggancio non deve attendere `renew()` né `call` della
  stessa sessione.
- **`session.onRevoke(hook)`**: chiamato da `revoke(familyId)`, sia locale sia
  annunciato da un'altra scheda, mai a sessione chiusa; la promessa non è attesa e un
  errore non ferma gli altri.
- **`session.store`** e **`session.channel`** (`SessionChannel | null`): archivio e canale
  della sessione.
- **`registerUserKeyPrefix(prefix)`** in `web/src/api/persister.ts`: elenco di modulo,
  chiamabile prima del montaggio dei provider; `purgeOtherCopies(store, keep)` lo legge
  al momento della chiamata e cancella le chiavi `<prefix><userId>` di ogni utente
  diverso da `keep` (con `null`, tutte), oltre a `query-cache:` e `revoked:`. La Spesa
  lo chiama in `main.tsx` prima del rendering (`registerShoppingStorage()` di W4).
- **Messaggi fra schede:** `SessionMessage` acquista
  `{type:'extension'; userId; topic; payload}`; `subscribeExtension(channel, topic,
  listener)` in `web/src/session/channel.ts` consegna solo gli `extension` di
  quell'argomento. Il ricevitore di `SessionScope` tratta come uscita solo
  `signedOut`, gestisce `revoked` come oggi e ignora ogni altro tipo.

### Spesa offline con sessione non verificata

Deroga della sola Spesa alla «sola consultazione» (piano generale, «Spesa offline senza
sessione verificabile»). Con la sessione «non verificata» il resto dell'app resta in
sola consultazione; la rotta della Spesa accetta modifiche nella sua coda in IndexedDB,
fuori dalla cache delle query, e le invia solo dopo un `renew()` riuscito con lo stesso
utente. La base fornisce: la regola qui e nella sezione «Accesso e sessione»; lo stato
`verified` già esposto da `useAuth()`; nel dizionario comune il testo del banner offline
per la Spesa, `offline.bannerShopping` («Sei offline: le modifiche alla lista restano su
questo telefono e si sincronizzano quando torni in linea»), che `AppLayout` mostra al posto
di `offline.banner` sulle rotte che iniziano con `/shopping/`. L'avviso delle modifiche da
sincronizzare resta di W4.

### Dipendenze della seconda PR

| Pacchetto | Tipo | Perché | Costo di farne a meno |
|---|---|---|---|
| `@orpc/client` 1.15.5 | esecuzione | Client del contratto con `RPCLink`, stessa versione del server (piano generale, «Client web») | Riscrivere a mano la codifica del protocollo RPC di oRPC (tipi speciali, errori), circa 150 righe da tenere allineate al server; oppure passare dalle rotte OpenAPI perdendo il client tipato |
| `@app/contract` | workspace | Tipi del contratto e dei codici d'errore, solo `import type`: nessun codice del contratto (né `zod`) entra nel bundle | Ricopiare a mano i tipi delle operazioni |
| `@orpc/server` 1.15.5 | sviluppo | Un server del contratto nello stesso processo dei test del client (token, errori, rete) | Risposte del protocollo RPC scritte a mano nei test, fragili a ogni aggiornamento di oRPC |

### Test della seconda PR

- `rpc.test.ts`, con `RPCHandler` di `@orpc/server` dietro un `fetch` di test:
  header con il token letto a ogni richiesta e assente senza token; `ORPCError`
  `forbidden` con dati → `ApiError` con codice e dati; codice fuori contratto e risposta
  non oRPC → `unknown`; `fetch` che fallisce → `network`; lettura annullata → annullata.
- Composizione: in modalità vera `session.whoami` va al server e `menu.getWeek` al client
  finto; in modalità finta entrambe dal finto; `wrapApi` sul client oRPC passa da
  `session.call` (un `unauthorized` del server di test rinnova e ripete).
- `session.test.ts`: `renew()` concorrenti e rinnovo dentro `call` → un solo
  `refresh`; `rejected` → chiusura completata (agganci compresi) prima della risposta;
  `network` → nessuna chiusura; sessione chiusa → `rejected` senza `refresh`; `call` su
  sessione chiusa e chiusura durante il rinnovo → `SessionClosedError` senza eseguire
  `run`; `network` dentro `call` → errore `network`, sessione aperta; `onClose` attesi
  dopo il persister, anche se uno fallisce; `onRevoke` per revoca locale e annunciata,
  non a sessione chiusa; `store` e `channel`.
- `persister.test.ts`: prefisso registrato prima del montaggio; avvio con B e coda di A
  sul disco → cancellata; uscita confermata → cancellate tutte; chiave di B intatta.
- `channel` e `SessionScope.test.tsx`: `extension` non chiude la sessione né tocca le
  revoche; `subscribeExtension` riceve solo il suo argomento; tipo sconosciuto ignorato.
- `supabaseBackend.test.ts`: esiti `ok` con l'utente, `network`, `rejected`.
- `AppLayout`: offline sulla rotta `/shopping/…` il banner della Spesa, altrove quello
  normale.

## Interfacce con altre attività

| Con | Cosa | Stato |
|---|---|---|
| W1 | Forma di `Api`, `getAccessToken()`, build in `web/dist` servita come asset con ripiego su `index.html` | Accettata dal coordinatore, girata a W1 |
| W1 | «Invariato» nel contratto con `knownVersion`; versione stringa opaca | Deciso da W1 |
| W1 | Client oRPC reale, errori, token, proxy di Vite, `unauthorized` | Seconda PR di W5 (sezione «Seconda PR») |
| W1, W2, W4, W6 | Aree del contratto lette dal server (`SERVER_AREAS`), aggiunte da ogni produttore | Seconda PR di W5 |
| W4 | Agganci di sessione per la coda della spesa, deroga della Spesa offline | Seconda PR di W5, firme di W4 (`7d1ebce`) |
| W1 | Configurazione degli ambienti e variabili `VITE_SUPABASE_*` per lo stack locale | Da concordare tramite il coordinatore |
| W1 | `web/` come workspace `@app/web`, script `test` e `typecheck` eseguiti dalla CI | Scheletro unito su `main` (PR #3) |
| W4 | Scalatura e conversione vere delle quantità (il client finto le simula) | Ondata 2 |
| Ondata 2 | Salvataggio della lingua sul profilo; versioni storiche dei pasti tramite `slotId` | Ondata 2 |

## Decisioni da riportare nella specifica

**Prodotto:**

- Accesso del traguardo A solo con email e password di Supabase, senza «password
  dimenticata» nell'app; link via email e Google nell'ondata 3 (sezioni 7 e 14).
- «Esci» chiude la sessione solo su questo dispositivo e cancella i dati salvati
  dell'utente anche se il servizio non risponde (sezione 7).
- Offline con sessione non verificabile: la copia sul dispositivo resta consultabile;
  alla riconnessione un rinnovo rifiutato chiude la sessione (sezioni 1 e 7).
- Accesso revocato a una famiglia: i suoi dati spariscono subito dal dispositivo
  (sezioni 1 e 7).
- Lingua: profilo a ogni accesso; prima del login quella del browser; la scelta nel
  Profilo è per utente e, fino all'operazione di salvataggio, temporanea (sezione 12;
  chiude in parte la voce «Lingue» della sezione 15 per l'impostazione iniziale).
- Nella prima base dell'app la borsa della spesa è visibile ma disattivata e il Profilo
  mostra le destinazioni future come segnaposto (sezione 14; temporaneo, fino
  all'ondata 2).
- La prima apertura offline dell'app installata è garantita dalla seconda visita
  (sezione 1).

**Tecniche:**

- Localizzazione del web senza librerie: dizionari TypeScript tipati divisi per area,
  `useT()`, plurali con `Intl.PluralRules`, date e numeri con `Intl`; lingua nelle chiavi
  delle query (sezioni 1 e 12).
- Rotte TanStack Router definite in codice, senza plugin delle rotte basate su file;
  stili in CSS puro con token e moduli CSS (sezione 1).
- Service worker scritto a mano senza `vite-plugin-pwa`: shell completa installata da
  un elenco generato dalla build, vecchie cache cancellate solo a nuova cache completa,
  navigazioni dalla rete con ripiego sulla shell, rotte del server mai intercettate,
  attivazione alla riapertura (sezione 1).
- Cache persistita con `@tanstack/react-query-persist-client` e persister IndexedDB
  scritto a mano con scritture in coda, una copia per utente legata alla sessione e
  cancellata a ogni chiusura, `buster` sulla versione della build, `maxAge` 7 giorni
  (sezione 1, letture dalla copia sul dispositivo).
- «Invariato» espresso nel contratto (`knownVersion`, `{ unchanged, version, data }`)
  con versione stringa opaca, al posto di HTTP 304 con `ETag`, gestito in modo
  trasparente dallo strato delle query del web (sezione 1; decisione di W1).
- Mutazioni senza aggiornamento ottimistico: risultato del server applicato alle viste
  della stessa famiglia, liste derivate rilette, ultima risposta per oggetto, risposte
  di sessioni chiuse scartate, nessuna coda offline fuori dalla Spesa (sezione 1).
- Una sola procedura di chiusura della sessione; `unauthorized` con un rinnovo e poi
  login; `forbidden` con rimozione delle viste dell'ambito (sezione 1).
- Stato dell'accesso con identità «non ancora nota» distinta dall'uscita confermata,
  eventi d'identità numerati e una sessione per identità come generazione; rinnovo unico
  per sessione condiviso dalle chiamate rifiutate (sezione 1).
- Revoche e uscite annunciate alle altre schede con `BroadcastChannel`; segno delle
  famiglie revocate nella persistenza, rispettato da ogni scrittura e ripristino (sezione
  1, letture dalla copia sul dispositivo).
- Service worker: navigazioni servite dalla shell installata della versione in servizio,
  mai riscritta durante l'uso (sezione 1).
- Mutazioni: le letture in corso delle viste toccate si annullano prima di applicare il
  risultato confermato; nessun dato precedente fra lingue o contesti diversi (sezione 1).
- Query del web con `queryOptions` scritte a mano; `@orpc/tanstack-query` da valutare
  nell'ondata 2 (sezioni 1 e 15).
- Riferimento allo slot nella scheda aperta da un pasto, per le versioni storiche
  (sezioni 5 e 8, R1).
- Test del web con Vitest, Testing Library e jsdom; prova visiva con agent-browser e
  iPhone, senza Playwright (sezione 9).
- Modalità finta del web senza variabili di Supabase, con client finto che implementa
  la stessa interfaccia del client vero e simula l'assenza di rete (sezione 1).
- Seconda PR: client oRPC con `RPCLink` verso `/api/rpc`, token di Supabase a ogni
  richiesta, errori convertiti in codici; aree lette dal server elencate a mano e aree
  non ancora nel contratto servite dal client finto anche in modalità vera, finché il
  loro produttore non le aggiunge (sezione 1).
- Seconda PR: rinnovo esplicito della sessione con esiti `ok`, `rejected` e `network`;
  la mancanza di rete durante un rinnovo non chiude più la sessione; agganci di chiusura
  e revoca, prefissi per utente registrabili per la pulizia, messaggi fra schede per
  argomento (sezione 1, letture dalla copia sul dispositivo; sezione 6 per la coda).

**Prodotto (seconda PR):**

- Offline con sessione non verificata la sola lista della spesa resta modificabile, con
  il proprio testo nel banner offline; il resto dell'app resta in sola consultazione
  (sezioni 1 e 6).
