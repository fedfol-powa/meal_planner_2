# App web di base (W5): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Corretto l'11 ottobre 2026 dopo la review (`progetto/coordinamento/revisioni/w5-spec-piano.md`) con le decisioni del coordinatore (`progetto/coordinamento/messaggi/w5-01-review.md`): voto senza aggiornamento ottimistico, chiusura della sessione unica, accessi rifiutati, versioni stringa, PWA con shell completa, lingua per identità, riferimento allo slot. Corretto di nuovo dopo la seconda review: vedi «Correzioni della seconda review», che prevale sul codice dei task indicati.

**Goal:** Costruire in `web/` la base React dell'app (SPA, PWA, design, lingue, login, Menu, Ricettario e Profilo con dati finti) su cui l'ondata 2 aggiunge le funzioni vere.

**Architecture:** SPA Vite con rotte TanStack Router definite in codice e dati TanStack Query letti attraverso un'interfaccia `Api` con la stessa forma del futuro client oRPC. Per ora la implementa un client finto alimentato dai dati demo del prototipo. Una sessione per utente possiede `QueryClient`, copia persistita in IndexedDB e scelta di lingua, e si chiude con una sola procedura (uscita, uscita da un'altra scheda, cambio d'utente, rifiuto del server). Lo strato delle query gestisce in modo trasparente la risposta «invariato» del contratto, con versioni stringa opache. Il service worker è scritto a mano: la logica è un modulo testabile, la shell completa viene installata da un elenco generato dalla build.

**Tech Stack:** React 19, Vite 8 con `@vitejs/plugin-react`, TanStack Router 1, TanStack Query 5 con `@tanstack/react-query-persist-client`, `@supabase/supabase-js` 2, TypeScript 6, Vitest 4.1 (come la radice), Testing Library per React, jsdom. Node 26. `web/` è il workspace npm `@app/web` dello scheletro di W1 (PR #3).

**Spec:** `progetto/superpowers/specs/2026-10-11-app-web-di-base.md` (sotto la specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 12 e 14; linguaggio visivo in `design/design.md` e `design/index.html`; percorsi in `design/percorsi.md`).

## Global Constraints

- Lavorare solo in `web/` (proprietà di W5), più `package-lock.json` della radice per le dipendenze; non toccare `prototype/`, `design/` né altre directory, che si leggono soltanto.
- Codice, nomi di file, commenti e test in inglese; ogni testo per l'utente passa da `useT()` con chiavi presenti in `it-IT` e `en-GB`.
- Dipendenze di esecuzione solo: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@supabase/supabase-js`. Di sviluppo solo: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/dom`, `jsdom` (`typescript` e `vitest` dalla radice). Nessun'altra senza passare dal coordinatore.
- Versioni verificate l'11 ottobre 2026 (`npm view`): react 19.3, @tanstack/react-router 1.170, @tanstack/react-query 5.104, @supabase/supabase-js 2.117, vite 8.3, @vitejs/plugin-react 6.1, @testing-library/react 16.3, jsdom 30.1. Vitest e TypeScript sono quelli della radice (`vitest ^4.1.11`, `typescript ^6.0.3`): non se ne installa una seconda versione.
- Workspace npm: le dipendenze si installano dalla radice con `npm install -w web …` (un solo `package-lock.json`); `web/package.json` ha gli script `test` e `typecheck` veri, perché la radice e la CI li lanciano con `--if-present`.
- `web/tsconfig.json` estende `tsconfig.base.json` (`verbatimModuleSyntax`, `erasableSyntaxOnly`): tipi importati con `import type` o `type` in linea, niente `enum` né proprietà nei parametri dei costruttori.
- Prima di usare un'API di una libreria non mostrata in questo piano, consultarla con Context7 (`/tanstack/router`, `/tanstack/query`, `/supabase/supabase-js`, `/vitejs/vite`).
- Token e componenti di `design/design.md`: fondo `#FAF8F3`, testo `#232323`, verde `#067A46`, Agrandir per i titoli dei piatti, Agrandir Tight per le sezioni, Roboto per il corpo; controlli da almeno 44 px; schede senza raggio con ombra `0 1px 3px rgb(0 0 0 / 10%)`; pulsanti con raggio 8 px.
- Il pasto è passato dalle 15:30 (pranzo) e dalle 23:00 (cena), ora locale della famiglia.
- Versioni delle letture: `string` opaca, mai interpretata né convertita.
- Nessun aggiornamento ottimistico e nessuna coda di mutazioni: in cache e su disco solo dati confermati dal server.
- Nessuna schermata mostra dati in cache accanto a un errore diverso da `network`.
- Porta della prova su iPhone: 8767.
- Commit piccoli con messaggio in italiano e la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ingredienti mai dedotti dal nome del piatto: il client finto usa solo quelli dei dati demo.
- Il client oRPC vero non fa parte dei Task 1-19: è nella sezione «Seconda PR».

## Review Focus

Rilievi della review e loro test (i più probabili a colpire chi usa l'app):

- Telefono condiviso: uscita con errore di rete, uscita da un'altra scheda, cambio A→B, richiesta e scrittura su disco pendenti durante l'uscita, riapertura: nulla di A riappare (Task 8 e 9).
- Accesso rifiutato dal server con cache popolata: `unauthorized` con un rinnovo e poi login; `forbidden` toglie i dati della famiglia da memoria e disco, anche dopo ricarica (Task 9).
- Voto: risultato applicato solo alla stessa famiglia, liste del Ricettario rilette, risposte fuori ordine, risposta dopo l'uscita, voto offline senza invio alla riconnessione (Task 12).
- Lingua: A inglese → uscita → B con profilo italiano; preferenza preesistente sul dispositivo; risposta nella lingua precedente arrivata dopo il cambio (Task 9 e 17).
- PWA: prima visita → riapertura offline; aggiornamento A→B → riapertura offline; installazione interrotta (Task 18). Profilo che fallisce, nessuna famiglia, «Riprova» (Task 10). Altezze dei contenitori a 320 e 390 px (Task 19, nel browser).
- Altri rilievi coperti: versione composta attraverso query, client e risposta (Task 6), riferimento allo slot (Task 13, 14 e 16), fonte da libro (Task 16), focus del calendario (Task 14).

## Correzioni della seconda review

Seconda review: `progetto/coordinamento/revisioni/w5-spec-piano-2.md`; scelte tecniche del coordinatore: `progetto/coordinamento/messaggi/w5-02-review2.md`. Niente terza review del piano: queste correzioni **sostituiscono** il codice dei task indicati, che resta come traccia per le parti non toccate. L'implementazione segue questa sezione con TDD; i test elencati si aggiungono a quelli dei task.

**C1. Identità non ancora nota e pulizia (rilievo 1; Task 8 e 9).**
- `AuthState` resta `loading | signedOut | signedIn`, ma `loading` vuol dire «identità non ancora nota»: `SessionScope` non crea alcuna sessione, non monta i figli e non cancella nulla finché lo stato è `loading`.
- Nota l'identità, `purgeOtherCopies(store, userId)` cancella le copie (e i segni di revoca, C4) degli altri utenti; con `signedOut` confermato `purgeOtherCopies(store, null)` cancella tutto. La copia dell'utente che rientra non è mai toccata, così ripristino e pulizia non concorrono.
- Test (`SessionScope.test.tsx`): copia valida di A, `backend.check()` sospeso → la copia resta; completato come A verificato e come A `unverified` offline → la copia resta e il dato si mostra senza rete.

**C2. Eventi d'identità numerati (rilievo 3; Task 8).**
- `AuthProvider` tiene un contatore degli eventi d'identità (risposta di `check`, `onChange`, uscite) e lo stato corrente in un ref. Una `check()` (iniziale o alla riconnessione) si applica solo se nessun evento è arrivato dopo la sua partenza.
- Nuova API: `useAuth(): { state, backend, signOut(userId, cleanup), markSignedOut(userId) }`.
  - `signOut(userId, cleanup)`: se l'identità corrente non è `userId` non fa nulla (uscita di una generazione superata); altrimenti passa subito a `signedOut`, esegue `cleanup` (chiusura della sessione), poi chiama `backend.signOut()` solo se lo stato è ancora `signedOut` (un'identità arrivata nel frattempo non si chiude mai); gli errori di Supabase si ignorano.
  - `markSignedOut(userId)`: uscita solo locale, quando un'altra scheda lo annuncia (C4).
- Test (`AuthProvider.test.tsx`): verifica iniziale pendente seguita da `SIGNED_OUT` o dall'ingresso di B → il risultato tardivo si scarta; `signOut('a', …)` con B corrente non fa nulla.

**C3. Rinnovo unico per sessione (rilievi 2 e 3; Task 9).**
- La sessione è la generazione: `createSession(userId, store, deps?: { refresh?: () => Promise<boolean>; end?: (session) => void | Promise<void>; channel?: SessionChannel; now?: () => number })`.
- `session.call(run, familyId?)` avvolge ogni chiamata dell'`Api` (`wrapApi(api, session)` in `SessionScope` sostituisce il ramo `unauthorized` di `setErrorHandler`):
  - registra l'epoca dei token alla partenza; su `unauthorized` chiede `renew(epoca)`: se un rinnovo è già riuscito dopo la partenza risponde subito sì, se ce n'è uno in corso lo condivide, altrimenti chiama `deps.refresh()` una volta;
  - rinnovo riuscito → epoca + 1 e la chiamata si ripete una volta; rinnovo fallito → `end()`; ripetizione di nuovo `unauthorized` → `end()`. `end()` agisce una sola volta e mai a sessione chiusa;
  - dopo ogni attesa, una sessione chiusa scarta il risultato senza effetti: nessun `end()`, nessuna epoca.
- `end` in `SessionScope`: annuncia l'uscita alle altre schede e chiama `auth.signOut(session.userId, () => session.close())`. «Esci» usa lo stesso percorso.
- `close()` restituisce sempre la stessa promessa (chiamate ripetute aspettano la stessa chiusura).
- Test (`session.test.ts`): due e tre `unauthorized` concorrenti → un solo `refresh`, nessuna uscita, chiamate ripetute riuscite; ripetizione rifiutata in due chiamate → una sola `end`; chiamata partita prima di un rinnovo riuscito → nessun secondo rinnovo; rinnovo pendente di A, sessione chiusa (arriva B), rinnovo concluso riuscito e fallito → nessuna `end`. In `SessionScope.test.tsx`: A con rinnovo pendente → ingresso di B → rinnovo concluso → B resta e `signOutCalls` è 0.

**C4. Revoca fra schede e segno nella persistenza (rilievo 4; Task 7 e 9).**
- `web/src/session/channel.ts`: `type SessionMessage = { type: 'signedOut'; userId } | { type: 'revoked'; userId; familyId }`; `interface SessionChannel { post(message): void; subscribe(listener): () => void }`; `createBroadcastChannel(name = 'cosasimangia-session')` sopra `BroadcastChannel` del browser (assente → canale muto). Nei test `createMemoryHub()` (`web/src/test/memoryChannel.ts`): canali collegati in memoria, ciascuno riceve i messaggi degli altri.
- `persister.ts`: `revokedKey(userId) = 'revoked:<userId>'` con `Record<familyId, revocatoAlMs>`; `markRevoked(store, userId, familyId, at)`, `clearRevoked(store, userId, familyId, startedAt)` (toglie il segno solo se la revoca è precedente alla partenza della lettura riuscita). Il persister legge i segni **dentro** l'operazione in coda e toglie le query di quelle famiglie da ogni scrittura e da ogni ripristino; `close()` cancella copia e segni; `purgeOtherCopies` tratta anche i segni.
- `session.revoke(familyId, { announce = true })`: toglie le viste dalla memoria, segna la famiglia, scrive il segno e, se `announce`, lo annuncia. `session.call` su una lettura riuscita di una famiglia segnata, partita dopo la revoca, toglie il segno.
- `SessionScope` ascolta il canale: `revoked` dello stesso utente → `session.revoke(familyId, { announce: false })`; `signedOut` dello stesso utente → `auth.markSignedOut(userId)` (la sessione si chiude con la procedura unica, senza chiamare Supabase).
- Test: due sessioni dello stesso utente sullo stesso archivio (`persister.test.ts` e `SessionScope.test.tsx` con due app collegate dallo stesso hub): `forbidden` in una, scrittura tardiva nell'altra con la famiglia ancora in memoria, riapertura → la famiglia non c'è; l'altra scheda tolta la famiglia dalla memoria la mostra come revocata; uscita in una scheda → l'altra chiude la sessione e non riscrive la copia; lettura riuscita partita dopo la revoca → il segno sparisce.

**C5. Voto e letture pendenti (rilievo 5; Task 6 e 12).**
- `readThrough`: con `unchanged` rilegge la cache **dopo** la risposta e la usa solo se ha ancora la versione della risposta; altrimenti chiede la vista completa.
- `applyRating(queryClient, familyId, recipeId, summary, isCurrent = () => true): Promise<void>`: annulla (`cancelQueries`) le letture in corso di settimane e schede ricetta della famiglia, ricontrolla `isCurrent()` (ultima richiesta e sessione aperta), applica il risultato, invalida le liste e fa ripartire le letture annullate che non avevano dati.
- Test (`ratings.test.ts`): lettura della settimana pendente → voto confermato → risposta vecchia completa e risposta `unchanged` → in cache resta il voto confermato; con `persistQueryClientSave` e ripristino il voto confermato sopravvive.

**C6. Shell del service worker (rilievo 6; Task 18).**
- `respond` per le navigazioni: `cache.match(SHELL_URL)` della cache della propria versione, rete solo se manca; nessun `cache.put` della shell durante l'uso. Gli asset restano «cache, poi rete» con salvataggio nella cache della versione.
- Il test «refreshes the cached shell from the network while online» è sostituito da «serves the installed shell online even after a new deploy» e dalla sequenza della review: A attivo → rete aggiornata a B → navigazione online (risponde `index A`) → installazione B interrotta → offline la navigazione e `/assets/a.js` rispondono con A.

**C7. Dati precedenti solo nella stessa vista (rilievo 7; Task 6, 15 e 16).**
- `keepPreviousWithin(queryKey, fields)` in `queries.ts`: funzione per `placeholderData` che restituisce i dati precedenti solo se area, operazione e i campi indicati dell'input coincidono.
- Ricettario: `fields = ['familyId', 'locale']` (cambiano solo filtri e ordinamento). Scheda ricetta: `['familyId', 'locale', 'recipeId', 'slotId']` (cambiano solo le porzioni), con gli ingredienti `aria-busy` e attenuati finché `isPlaceholderData`.
- Test: cambio di lingua su Ricettario e scheda con risposta ritardata → si vede il caricamento, non il testo nella lingua precedente; passaggio fra due ricette e fra due slot con risposta ritardata → nessun dato della ricetta o dello slot precedente.

**C8. Profilo con errore (rilievo 8; Task 17).** `const profile = meBlocked ? undefined : me.data`; nome ed email si leggono da `profile`, altrimenti l'email della sessione. Test: profilo caricato → rilettura con errore non di rete → il nome del profilo sparisce, lingua ed «Esci» restano.

**C9. Versione stringa nelle fixture (rilievo 9; Task 14).** `version: 'opening-1'` nel test «says when the family has no menu yet»; `grep -n "version: [0-9]"` sul piano e su `web/src` non trova nulla.

## Correzioni della review della PR #6

Review: `progetto/coordinamento/revisioni/w5-pr6.md`; scelte tecniche del coordinatore: `progetto/coordinamento/messaggi/w5-03-review-pr6.md`. Sostituiscono le parti indicate di C2, C3 e C4.

**C10. «Esci» non annullato da un rinnovo (rilievo 1; C2).**
- `AuthBackend.onChange(listener: (event: AuthEvent) => void)`: l'evento conserva il tipo di Supabase (`SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, …) con l'utente, o `null` per `SIGNED_OUT`; nessun evento per una sessione vuota.
- `AuthProvider` tiene in un ref l'utente la cui generazione è **in chiusura**, da `signOut(userId, cleanup)` fino alla fine di `backend.signOut()`. In quella fase ogni evento dello stesso utente (rinnovo, ripetizione di `SIGNED_IN` al ritorno sulla scheda) si ignora; `SIGNED_OUT` e gli eventi di un altro utente si applicano. L'uscita si conclude sempre con `backend.signOut()`, salvo che nel frattempo sia entrato un altro utente. Chiusa la fase, un `SIGNED_IN` dello stesso utente è un accesso nuovo.
- Test (`AuthProvider.test.tsx`): pulizia sospesa → `TOKEN_REFRESHED` e `SIGNED_IN` di A → fine della pulizia ⇒ `signedOut`, una chiamata a `backend.signOut()`, alla riapertura nessuna sessione; dopo la chiusura un `SIGNED_IN` di A rientra. Resta verde l'ingresso di B durante la pulizia.

**C11. Segni di revoca atomici (rilievo 2; C4).**
- `KeyValueStore.transact(prefixes, change)`: legge le voci con uno dei prefissi e applica le scritture restituite da `change` (sincrona; `undefined` cancella) in **una sola transazione `readwrite`** di IndexedDB, serializzata anche fra schede. L'archivio in memoria fa lettura e scrittura senza attese intermedie, con la stessa atomicità.
- Un record per (utente, famiglia): `revokedKey(userId, familyId) = 'revoked:<userId>:<familyId>'` con il momento dell'ultima revoca. `markRevoked` tiene il massimo; `clearRevoked(startedAt)` cancella solo se il segno salvato è precedente a `startedAt` (una lettura partita nello stesso millisecondo della revoca non la prova).
- Il persister scrive la copia nella stessa transazione in cui legge i segni; il ripristino legge copia e segni insieme; `close()` cancella copia e segni in una transazione; `purgeOtherCopies` tiene la copia e i segni con il prefisso dell'utente rimasto.
- Dipendenza di sviluppo `fake-indexeddb` (approvata dal coordinatore): IndexedDB vero nei test dell'adattatore.
- Test (`persister.test.ts`, su archivio in memoria e su IndexedDB): revoca contemporanea di due famiglie; nuova revoca concorrente con la rimozione del vecchio segno, nei due ordini; poi scrittura tardiva di una scheda ignara e ripristino ⇒ le famiglie revocate non tornano. Venti transazioni «leggi e incrementa» concorrenti su IndexedDB ⇒ contatore a 20.

**C12. Lingua fissa per lettura (rilievo 3; C3).**
- Un client per lingua, creato da `SessionScope` alla prima richiesta in quella lingua (firma di `CreateApi` in C13). La lettura usa il client della lingua in cui è partita, e `session.call` ne ripete la stessa funzione: anche il tentativo dopo il rinnovo resta nella lingua di partenza. Il client finto usa quella lingua per dati e versione.
- `wrapApi(api, session, { locale, isCurrent })`: se all'arrivo della risposta la lingua mostrata è cambiata, annulla con `cancelQueries` le letture di quella lingua (`localeOfKey`), che tornano allo stato precedente senza scrivere in cache.
- Test (`SessionScope.test.tsx`): lettura italiana rifiutata → rinnovo sospeso → passaggio all'inglese → rinnovo riuscito ⇒ nessun dato sotto la chiave italiana, in memoria e nella copia salvata; ritorno all'italiano ⇒ testo italiano; ripristino ⇒ ogni lingua ha il suo testo.

---

## Mappa dei file

```
web/
├── .gitignore                    public/assets/ (copiati da design/)
├── README.md                     comandi, modalità, limiti
├── index.html                    meta PWA e Apple, viewport-fit=cover
├── package.json, tsconfig.json, vite.config.ts (con il plugin che genera precache.json)
├── public/
│   ├── manifest.webmanifest
│   └── icons/                    icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
├── scripts/
│   ├── sync-assets.mjs           font e foto da ../design/assets in public/assets
│   ├── build-fake-data.mjs       dati demo ridotti dal prototipo
│   └── make-icons.sh             icone PNG da icon.svg con ImageMagick (una tantum)
└── src/
    ├── main.tsx                  avvio e registrazione del service worker
    ├── App.tsx                   AppRoot: provider e router, usato anche dai test
    ├── env.ts, vite-env.d.ts     variabili VITE_SUPABASE_*, versione della build
    ├── design/                   tokens.css, fonts.css, global.css
    ├── lib/                      calendar.ts, connectivity.ts
    ├── i18n/                     messages/*.ts, translate.ts, dates.ts, text.ts, LocaleProvider.tsx
    ├── api/
    │   ├── types.ts              viste, input, Read<T>, Api
    │   ├── errors.ts             ApiError, codici, isBlocking
    │   ├── ApiProvider.tsx       contesto React di Api
    │   ├── queries.ts            readThrough, Versioned, chiavi con lingua, queryOptions
    │   ├── ratings.ts            useRateRecipe e applicazione del risultato
    │   ├── persister.ts          KeyValueStore, IndexedDB, memoria, persister in coda
    │   └── fake/                 demo-data.json, seed.ts, quantity.ts, fakeApi.ts
    ├── auth/                     backend.ts, supabaseBackend.ts, AuthProvider.tsx, LoginPage.tsx
    ├── session/                  SessionScope.tsx, session.ts, localePreference.ts, useFamily.ts
    ├── router.tsx                albero delle rotte, guardia, layout
    ├── components/               Icon, BottomNav, StateNotice, QueryError, FamilyGate, PageHeader,
    │                             OfflineBanner, Loading, RatingStars, RecipeCard, IngredientList,
    │                             DaySelector, DatePicker, RecipeFilters, ServingsStepper
    ├── routes/                   MenuPage, RecipesPage, RecipePage, ProfilePage, AppLayout,
    │                             NotFound, RouteError, search.ts, menu/
    ├── pwa/                      sw-rules.ts, precache.ts, sw-core.ts, sw.ts, register.ts
    └── test/                     setup.ts, connectivity.ts, stubBackend.ts, renderApp.tsx,
                                  renderWithProviders.tsx
```

---

### Task 1: Progetto Vite e design di base

**Files:**
- Modify: `web/package.json` (dello scheletro di W1)
- Create: `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/.gitignore`, `web/src/vite-env.d.ts`, `web/src/env.ts`, `web/src/main.tsx`, `web/src/App.tsx` (provvisorio), `web/src/design/tokens.css`, `web/src/design/fonts.css`, `web/src/design/global.css`, `web/scripts/sync-assets.mjs`, `web/src/test/setup.ts`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Produces: comandi `npm run dev|build|test|typecheck|preview:lan`; costante globale `__BUILD_VERSION__: string`; `env.supabase: { url: string; publishableKey: string } | null` e `env.buildVersion: string` da `src/env.ts`; classi CSS globali del prototipo (`.icon`, `.visually-hidden`, `.shell`, `.app-content`, `.app-view`, `.calendar`, `.day-navigation`, `.day-links`, `.day-link`, `.week-track`, `.day`, `.meal`, `.meal-media`, `.meal-photo`, `.meal-label`, `.meal-heading`, `.meal-content`, `.recipe-link`, `.description`, `.meal-meta`, `.meal-source`, `.ingredient-list`, `.ingredient-quantity`, `.meal-free`, `.free-mark`, `.bottom-navigation`, `.navigation-item`, `.navigation-icon`, `.secondary-view`, `.text-button`, `.meta-line`, `.page-title`, `.page-column`, `.page-header`, `.page-back`, `.settings-card`, `.row-list`, `.row-link`, `.row-main`, `.field`, `.choice`, `.label-chip`, `.skip-link`).

- [ ] **Step 0: Rebase su main**

Lo scheletro di W1 (workspace `domain`, `contract`, `server`, `web`, CI) è su `main` dalla PR #3.

Run:
```bash
git fetch origin
git rebase origin/main
npm ci
npm test && npm run typecheck
```
Expected: rebase senza conflitti (questo branch tocca solo `progetto/` e `web/`); test e tipi della radice verdi. Se il rebase va in conflitto su file fuori da `web/`, fermarsi e scrivere `STATO: DOMANDA` al coordinatore.

- [ ] **Step 1: Script di `web/package.json` e dipendenze**

Sostituire `web/package.json` dello scheletro, mantenendo nome e `build` verso `dist/` (lo usa `npm run deploy` della radice):
```json
{
  "name": "@app/web",
  "private": true,
  "type": "module",
  "scripts": {
    "sync-assets": "node scripts/sync-assets.mjs",
    "predev": "npm run sync-assets",
    "dev": "vite",
    "prebuild": "npm run sync-assets",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "preview:lan": "npm run build && vite preview --host --port 8767 --strictPort",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "fake-data": "node scripts/build-fake-data.mjs"
  }
}
```

Run dalla radice del repository:
```bash
npm install -w web react@^19.3.0 react-dom@^19.3.0 @tanstack/react-router@^1.170.0 @tanstack/react-query@^5.104.0 @tanstack/react-query-persist-client@^5.104.0 @supabase/supabase-js@^2.117.0
npm install -w web -D vite@^8.3.0 @vitejs/plugin-react@^6.1.0 @types/react@^19.3.0 @types/react-dom@^19.3.0 @testing-library/react@^16.3.0 @testing-library/dom@^10.4.0 jsdom@^30.1.0
```
Expected: dipendenze aggiunte a `web/package.json`, `package-lock.json` della radice aggiornato, nessun `web/package-lock.json`, nessun errore di peer dependency (Vite 8 con Vitest 4.1 è la combinazione già usata dal prototipo).

- [ ] **Step 2: Configurazione TypeScript, Vite, HTML e gitignore**

`web/tsconfig.json` (estende la base comune di W1, che impone `verbatimModuleSyntax` ed `erasableSyntaxOnly`: i tipi si importano con `import type` o `type` in linea, niente `enum` né proprietà nei parametri dei costruttori):
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`web/vite.config.ts` (verificare con Context7 su `/vitejs/vite` che in Vite 8 `build.rollupOptions` sia ancora accettato; se è stato rinominato `build.rolldownOptions`, usare il nuovo nome con gli stessi campi):
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// One value per build: cache names of the service worker and buster of the persisted query cache.
const buildVersion = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
  server: { port: 5174 },
  build: {
    rollupOptions: {
      // The service worker is a second entry, emitted at the root as /sw.js.
      input: { main: 'index.html', sw: 'src/pwa/sw.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
```
Nota: finché `src/pwa/sw.ts` non esiste (Task 18), creare un file provvisorio `web/src/pwa/sw.ts` con il solo commento `// Service worker: written in task 18.` così la build funziona.

`web/index.html`:
```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FAF8F3" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Cosa si mangia" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
    <title>Cosa si mangia</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/.gitignore` (`dist/` e `node_modules/` sono già ignorati dalla radice):
```
public/assets/
```

`web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
```

`web/src/env.ts`:
```ts
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const env = {
  /** null: fake mode, with the demo user and no sign-in (spec "Accesso e modalità"). */
  supabase: url && publishableKey ? { url, publishableKey } : null,
  buildVersion: __BUILD_VERSION__
};
```

- [ ] **Step 3: Copia degli asset e stili di base**

`web/scripts/sync-assets.mjs`:
```js
// Copies the approved fonts and recipe photos from design/ so they are not duplicated in Git.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, '../design/assets');
const target = resolve(root, 'public/assets');

mkdirSync(target, { recursive: true });
cpSync(resolve(design, 'hellofresh/fonts'), resolve(target, 'fonts'), { recursive: true });
cpSync(resolve(design, 'recipe-images'), resolve(target, 'recipe-images'), { recursive: true });
console.log('Assets synced to public/assets');
```

`web/src/design/tokens.css`: copiare `prototype/src/lib/design/tokens.css` così com'è (17 righe di variabili `--canvas`, `--paper`, `--ink`, `--body-text`, `--muted`, `--rule`, `--green`, `--soft-green`, `--free-surface`, `--free-border`, `--card-shadow`, `--text-font`, `--meal-title-font`, `--heading-font`), aggiungendo `--danger: #b3261e;`.

`web/src/design/fonts.css`: copiare `prototype/src/lib/design/fonts.css` (quattro `@font-face` con URL `/assets/fonts/...` e `font-display: swap`).

`web/src/design/global.css`: copiare `prototype/src/lib/design/global.css` con queste differenze:
- togliere le regole `.recipe-row*`, `.recipe-list`, `.recipe-thumbnail`, `.recipe-content`, `.section-intro*`, `.shopping-*`, `.ingredients summary*`, `.ingredient-count`, `.no-script`, `.symbol-library`, `.dev-toggle`, `.toast-region`, `.text-button.danger*`, `.danger-zone` e le corrispondenti righe nei blocchi `@media`;
- aggiungere in fondo:
```css
/* Web app additions (W5). */
/* Height chain for the React mount point: only the intended containers scroll (review, finding 8). */
html { height: 100%; }
#root { height: 100%; }
.field input[type='password'] { min-height: 44px; padding: 8px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--text-font); }
.recipe-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.loading { margin: 24px 0; color: var(--muted); }
@media (max-width: 767px) { .recipe-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; } }
```

- [ ] **Step 4: Scrivi il test che fallisce**

`web/src/test/setup.ts`:
```ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

`web/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the app name', () => {
  render(<App />);
  expect(screen.getByText('Cosa si mangia')).toBeTruthy();
});
```

- [ ] **Step 5: Verifica che fallisca**

Run: `cd web && npx vitest run src/App.test.tsx`
Expected: FAIL, `Failed to resolve import "./App"`. (Vitest usa `web/vite.config.ts`, non la configurazione della radice limitata a `scripts/`.)

- [ ] **Step 6: App provvisoria e avvio**

`web/src/App.tsx` (lo sostituisce il Task 10):
```tsx
export function App() {
  return <p>Cosa si mangia</p>;
}
```

`web/src/main.tsx` (lo completano i Task 10 e 18):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './design/fonts.css';
import './design/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Verifica test, tipi e build**

Run: `cd web && npm test && npm run typecheck && npm run build`, poi dalla radice `npm test && npm run typecheck`
Expected: 1 test PASS; nessun errore di tipi; `web/dist/index.html`, `web/dist/sw.js` e `web/dist/assets/fonts/*.woff2` presenti; dalla radice compaiono anche i test e il controllo dei tipi di `@app/web`.

- [ ] **Step 8: Commit**

```bash
git add web/ package-lock.json
git commit -m "Web: progetto Vite con token, font e stili del design approvato"
```

---

### Task 2: Calendario e ora della famiglia

**Files:**
- Create: `web/src/lib/calendar.ts`
- Test: `web/src/lib/calendar.test.ts`

**Interfaces:**
- Produces:
  - `type IsoDate = string` (YYYY-MM-DD), `type LocalDateTime = string` (YYYY-MM-DDTHH:mm), `type MealType = 'lunch' | 'dinner'`
  - `isIsoDate(value: unknown): value is IsoDate`
  - `addDays(date: IsoDate, days: number): IsoDate`
  - `mondayOf(date: IsoDate): IsoDate`
  - `weekDates(startsOn: IsoDate): IsoDate[]`
  - `daysBetween(from: IsoDate, to: IsoDate): number`
  - `MEAL_PAST_AT: Record<MealType, string>`
  - `isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean`
  - `localNow(timeZone: string, at?: Date): LocalDateTime`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, isMealPast, localNow, mondayOf, weekDates } from './calendar';

describe('calendar', () => {
  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2026-10-11')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('oggi')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate(20261011)).toBe(false);
  });
  it('moves across months and finds Mondays', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(weekDates('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(daysBetween('2026-10-05', '2026-10-19')).toBe(14);
    expect(daysBetween('2026-10-19', '2026-10-05')).toBe(-14);
  });
  it('marks lunch past from 15:30 and dinner from 23:00', () => {
    expect(isMealPast('2026-10-11', 'lunch', '2026-10-11T15:29')).toBe(false);
    expect(isMealPast('2026-10-11', 'lunch', '2026-10-11T15:30')).toBe(true);
    expect(isMealPast('2026-10-11', 'dinner', '2026-10-11T22:59')).toBe(false);
    expect(isMealPast('2026-10-11', 'dinner', '2026-10-12T00:10')).toBe(true);
  });
  it('reads the wall clock in the family time zone', () => {
    const at = new Date('2026-10-11T21:30:00Z');
    expect(localNow('Europe/Rome', at)).toBe('2026-10-11T23:30');
    expect(localNow('Europe/London', at)).toBe('2026-10-11T22:30');
    expect(localNow('America/New_York', new Date('2026-10-12T02:00:00Z'))).toBe('2026-10-11T22:00');
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/lib/calendar.test.ts`
Expected: FAIL, `Failed to resolve import "./calendar"`.

- [ ] **Step 3: Implementa**

```ts
// Calendar days are handled as UTC dates so the host time zone never shifts them.
export type IsoDate = string;
export type LocalDateTime = string;
export type MealType = 'lunch' | 'dinner';

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: IsoDate): IsoDate {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function weekDates(startsOn: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startsOn, i));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Spec section 5, family local time: a past meal counts as eaten. */
export const MEAL_PAST_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
  return now >= `${date}T${MEAL_PAST_AT[mealType]}`;
}

/** Wall-clock time of `at` in the given IANA time zone, as YYYY-MM-DDTHH:mm. */
export function localNow(timeZone: string, at: Date = new Date()): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/lib/calendar.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib
git commit -m "Web: date di calendario, pasto passato e ora locale della famiglia"
```

---

### Task 3: Localizzazione

**Files:**
- Create: `web/src/i18n/messages/common.ts`, `menu.ts`, `recipes.ts`, `profile.ts`, `auth.ts`, `errors.ts`, `index.ts`; `web/src/i18n/translate.ts`, `web/src/i18n/dates.ts`, `web/src/i18n/text.ts`, `web/src/i18n/LocaleProvider.tsx`
- Test: `web/src/i18n/i18n.test.ts`, `web/src/i18n/LocaleProvider.test.tsx`

**Interfaces:**
- Consumes: `addDays`, `IsoDate`, `LocalDateTime` da `src/lib/calendar.ts`.
- Produces:
  - `type Locale = 'it-IT' | 'en-GB'`, `LOCALES: readonly Locale[]`
  - `type MessageKey` (chiavi semplici più basi dei plurali), `type MessageParams = Record<string, string | number>`
  - `translate(locale: Locale, key: MessageKey, params?: MessageParams): string`
  - `initialLocale(languages: readonly string[]): Locale`
  - `formatDayShort`, `formatDayNumber`, `formatDayLong`, `formatDayMonth`, `formatMonthYear`, `formatChangeTime`, `formatAverage` (firma `(locale: Locale, value) => string`)
  - `truncate(text: string, max: number): string`
  - `<LocaleProvider initial: Locale>`; `useLocale(): { locale: Locale; setLocale(l: Locale): void }`; `useT(): (key: MessageKey, params?: MessageParams) => string`
  - il provider tiene solo la lingua corrente e l'attributo `lang`: quale lingua vale (dispositivo, browser, profilo, scelta per utente) lo decide la sessione nel Task 9

- [ ] **Step 1: Dizionari**

Ogni file esporta `it` (oggetto `as const` non serve: basta un oggetto letterale) ed `en` con `satisfies Record<keyof typeof it, string>`. I plurali usano i suffissi `.one` e `.other`.

`web/src/i18n/messages/common.ts`:
```ts
export const it = {
  appName: 'Cosa si mangia',
  skip: 'Vai al contenuto',
  'nav.main': 'Navigazione principale',
  'nav.menu': 'Menu',
  'nav.recipes': 'Ricettario',
  'nav.profile': 'Profilo',
  'common.back': 'Indietro',
  'common.close': 'Chiudi',
  'common.retry': 'Riprova',
  'common.loading': 'Caricamento…',
  'common.soon': 'In arrivo',
  'family.none.title': 'Non fai parte di nessuna famiglia',
  'family.none.body': 'Chiedi a un amministratore della famiglia di invitarti.',
  'offline.banner': 'Sei offline: puoi consultare i dati già caricati.',
  'notFound.title': 'Contenuto non trovato',
  'notFound.action': 'Vai al menu'
};

export const en = {
  appName: 'Cosa si mangia',
  skip: 'Skip to content',
  'nav.main': 'Main navigation',
  'nav.menu': 'Menu',
  'nav.recipes': 'Recipes',
  'nav.profile': 'Profile',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.soon': 'Coming soon',
  'family.none.title': 'You are not in a family',
  'family.none.body': 'Ask a family administrator to invite you.',
  'offline.banner': 'You are offline: you can browse what is already loaded.',
  'notFound.title': 'Not found',
  'notFound.action': 'Go to the menu'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/menu.ts`:
```ts
export const it = {
  'menu.days': 'Giorni della settimana',
  'menu.week': 'Pasti della settimana',
  'menu.noWeeks.title': 'Ancora nessun menu',
  'menu.noWeeks.body': 'Lo prepara un amministratore della famiglia.',
  'menu.dayEmpty': 'Nessun pasto pianificato in questo giorno.',
  'menu.pickDate': 'Scegli un giorno',
  'menu.previousMonth': 'Mese precedente',
  'menu.nextMonth': 'Mese successivo',
  'menu.shopping': 'Lista della spesa (in arrivo)',
  'meal.lunch': 'Pranzo',
  'meal.dinner': 'Cena',
  'meal.servings.one': '1 porzione',
  'meal.servings.other': '{count} porzioni',
  'meal.minutes': '{count} min',
  'meal.free': 'Pasto libero',
  'meal.empty.title': 'Nessuna ricetta adatta',
  'meal.empty.body': 'Il pianificatore non ha trovato una ricetta che rispetti le regole per questo pasto.',
  'meal.changedBy': 'Cambiato da {name}, {time}',
  'meal.formerMember': 'ex membro',
  'meal.note': 'Nota',
  'meal.details': 'Scheda ricetta',
  'meal.ratingAction': 'Voto della famiglia {value}: apri per votare',
  'meal.ingredientsAction.one': '1 ingrediente: mostra o nascondi',
  'meal.ingredientsAction.other': '{count} ingredienti: mostra o nascondi',
  'meal.ingredients': 'Ingredienti',
  'meal.ingredientsMissing': 'Ingredienti non ancora disponibili per questa ricetta.',
  'source.open': 'Apri la fonte',
  'source.youtube': 'Video YouTube',
  'source.book': 'Libro: {title}, pp. {pages}',
  'source.home': 'Ricetta di casa',
  'quantity.toTaste': 'q.b.',
  'rating.votes.one': '1 voto',
  'rating.votes.other': '{count} voti',
  'rating.none': 'Nessun voto',
  'rating.mine': 'Il tuo voto',
  'rating.sending': 'Invio del voto…',
  'rating.give': 'Dai {stars} stelle a {recipe}',
  'rating.removeStars': 'Il tuo voto: {stars} stelle. Tocca di nuovo per toglierlo',
  'rating.averageLabel': 'Media della famiglia: {value}, {votes}'
};

export const en = {
  'menu.days': 'Days of the week',
  'menu.week': 'Meals of the week',
  'menu.noWeeks.title': 'No menu yet',
  'menu.noWeeks.body': 'A family administrator prepares it.',
  'menu.dayEmpty': 'No meals planned on this day.',
  'menu.pickDate': 'Choose a day',
  'menu.previousMonth': 'Previous month',
  'menu.nextMonth': 'Next month',
  'menu.shopping': 'Shopping list (coming soon)',
  'meal.lunch': 'Lunch',
  'meal.dinner': 'Dinner',
  'meal.servings.one': '1 serving',
  'meal.servings.other': '{count} servings',
  'meal.minutes': '{count} min',
  'meal.free': 'Free meal',
  'meal.empty.title': 'No suitable recipe',
  'meal.empty.body': 'The planner could not find a recipe that fits the rules for this meal.',
  'meal.changedBy': 'Changed by {name}, {time}',
  'meal.formerMember': 'former member',
  'meal.note': 'Note',
  'meal.details': 'Recipe details',
  'meal.ratingAction': 'Family rating {value}: open to rate',
  'meal.ingredientsAction.one': '1 ingredient: show or hide',
  'meal.ingredientsAction.other': '{count} ingredients: show or hide',
  'meal.ingredients': 'Ingredients',
  'meal.ingredientsMissing': 'Ingredients are not available for this recipe yet.',
  'source.open': 'Open the source',
  'source.youtube': 'YouTube video',
  'source.book': 'Book: {title}, pp. {pages}',
  'source.home': 'Home recipe',
  'quantity.toTaste': 'to taste',
  'rating.votes.one': '1 vote',
  'rating.votes.other': '{count} votes',
  'rating.none': 'No ratings',
  'rating.mine': 'Your rating',
  'rating.sending': 'Sending your rating…',
  'rating.give': 'Give {recipe} {stars} stars',
  'rating.removeStars': 'Your rating: {stars} stars. Tap again to remove it',
  'rating.averageLabel': 'Family average: {value}, {votes}'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/recipes.ts`:
```ts
export const it = {
  'recipes.title': 'Ricettario',
  'recipes.search': 'Cerca per nome o ingrediente',
  'recipes.filters': 'Filtri',
  'recipes.toggleFilters': 'Filtri e ordinamento',
  'recipes.filter.meal': 'Pasto',
  'recipes.filter.time': 'Tempo massimo',
  'recipes.filter.group': 'Gruppo alimentare',
  'recipes.filter.stars': 'Voto minimo',
  'recipes.filter.any': 'Tutti',
  'recipes.filter.minutes': 'Fino a {count} min',
  'recipes.filter.starsAtLeast': 'Almeno {count} stelle',
  'recipes.sort': 'Ordina per',
  'recipes.reverse': 'Inverti l’ordine',
  'recipes.sort.name': 'Nome',
  'recipes.sort.rating': 'Voto',
  'recipes.sort.added': 'Aggiunte di recente',
  'recipes.sort.lastEaten': 'Mangiate di recente',
  'recipes.noResults.title': 'Nessuna ricetta trovata',
  'recipes.noResults.body': 'Prova a togliere qualche filtro o a cercare un altro ingrediente.',
  'recipes.reset': 'Azzera filtri',
  'group.fish': 'Pesce',
  'group.white_meat': 'Carne bianca',
  'group.meat': 'Carne',
  'group.legumes': 'Legumi',
  'group.eggs': 'Uova',
  'group.vegetarian': 'Vegetariano',
  'recipe.servingsLabel': 'Porzioni',
  'recipe.lessServings': 'Una porzione in meno',
  'recipe.moreServings': 'Una porzione in più',
  'recipe.baseServings.one': 'Dosi della fonte per 1 porzione',
  'recipe.baseServings.other': 'Dosi della fonte per {count} porzioni',
  'recipe.history': 'Le ultime volte',
  'recipe.historyEmpty': 'Non l’avete ancora mangiata.',
  'recipe.historyItem': '{day}, {meal}'
};

export const en = {
  'recipes.title': 'Recipes',
  'recipes.search': 'Search by name or ingredient',
  'recipes.filters': 'Filters',
  'recipes.toggleFilters': 'Filters and sorting',
  'recipes.filter.meal': 'Meal',
  'recipes.filter.time': 'Maximum time',
  'recipes.filter.group': 'Food group',
  'recipes.filter.stars': 'Minimum rating',
  'recipes.filter.any': 'Any',
  'recipes.filter.minutes': 'Up to {count} min',
  'recipes.filter.starsAtLeast': 'At least {count} stars',
  'recipes.sort': 'Sort by',
  'recipes.reverse': 'Reverse the order',
  'recipes.sort.name': 'Name',
  'recipes.sort.rating': 'Rating',
  'recipes.sort.added': 'Recently added',
  'recipes.sort.lastEaten': 'Recently eaten',
  'recipes.noResults.title': 'No recipes found',
  'recipes.noResults.body': 'Try removing a filter or searching for another ingredient.',
  'recipes.reset': 'Clear filters',
  'group.fish': 'Fish',
  'group.white_meat': 'White meat',
  'group.meat': 'Meat',
  'group.legumes': 'Pulses',
  'group.eggs': 'Eggs',
  'group.vegetarian': 'Vegetarian',
  'recipe.servingsLabel': 'Servings',
  'recipe.lessServings': 'One serving fewer',
  'recipe.moreServings': 'One serving more',
  'recipe.baseServings.one': 'Source quantities for 1 serving',
  'recipe.baseServings.other': 'Source quantities for {count} servings',
  'recipe.history': 'Last times',
  'recipe.historyEmpty': 'You have not had it yet.',
  'recipe.historyItem': '{day}, {meal}'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/profile.ts`:
```ts
export const it = {
  'profile.title': 'Profilo',
  'profile.family': 'Famiglia',
  'profile.members': 'Membri e inviti',
  'profile.settings': 'Impostazioni della famiglia',
  'profile.exclusions': 'Non proporre più',
  'profile.account': 'Account',
  'profile.language': 'Lingua',
  'profile.language.it-IT': 'Italiano',
  'profile.language.en-GB': 'English',
  'profile.signOut': 'Esci',
  'profile.role.family_admin': 'Amministratore',
  'profile.role.member': 'Membro'
};

export const en = {
  'profile.title': 'Profile',
  'profile.family': 'Family',
  'profile.members': 'Members and invitations',
  'profile.settings': 'Family settings',
  'profile.exclusions': 'Never suggest again',
  'profile.account': 'Account',
  'profile.language': 'Language',
  'profile.language.it-IT': 'Italiano',
  'profile.language.en-GB': 'English',
  'profile.signOut': 'Sign out',
  'profile.role.family_admin': 'Administrator',
  'profile.role.member': 'Member'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/auth.ts`:
```ts
export const it = {
  'auth.brand': 'Cosa si mangia?',
  'auth.title': 'Accedi',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.submit': 'Accedi',
  'auth.submitting': 'Accesso in corso…',
  'auth.error.invalid_credentials': 'Email o password non corrette.',
  'auth.error.network': 'Non riesco a raggiungere il servizio: controlla la connessione.',
  'auth.error.unknown': 'Accesso non riuscito: riprova tra poco.'
};

export const en = {
  'auth.brand': 'Cosa si mangia?',
  'auth.title': 'Sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'auth.submitting': 'Signing in…',
  'auth.error.invalid_credentials': 'Wrong email or password.',
  'auth.error.network': 'The service cannot be reached: check your connection.',
  'auth.error.unknown': 'Sign-in failed: please try again shortly.'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/errors.ts`:
```ts
export const it = {
  'errors.forbidden': 'Non hai accesso a questa famiglia.',
  'errors.not_found': 'Contenuto non trovato.',
  'errors.invalid': 'Dati non validi.',
  'errors.conflict': 'Qualcun altro l’ha cambiato nel frattempo.',
  'errors.unauthorized': 'La sessione è scaduta: accedi di nuovo.',
  'errors.network': 'Sei offline o il servizio non risponde: riprova quando torni in linea.',
  'errors.unknown': 'Qualcosa non ha funzionato: riprova.'
};

export const en = {
  'errors.forbidden': 'You do not have access to this family.',
  'errors.not_found': 'Not found.',
  'errors.invalid': 'Invalid data.',
  'errors.conflict': 'Someone else changed it in the meantime.',
  'errors.unauthorized': 'Your session has expired: please sign in again.',
  'errors.network': 'You are offline or the service is not responding: try again when you are back online.',
  'errors.unknown': 'Something went wrong: please try again.'
} satisfies Record<keyof typeof it, string>;
```

`web/src/i18n/messages/index.ts`:
```ts
import * as auth from './auth';
import * as common from './common';
import * as errors from './errors';
import * as menu from './menu';
import * as profile from './profile';
import * as recipes from './recipes';

// One file per area, so parallel work in wave 2 adds files instead of editing the same one.
const it = { ...common.it, ...menu.it, ...recipes.it, ...profile.it, ...auth.it, ...errors.it };
const en: Record<keyof typeof it, string> = { ...common.en, ...menu.en, ...recipes.en, ...profile.en, ...auth.en, ...errors.en };

export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];

type RawKey = keyof typeof it;
type PluralBase<K> = K extends `${infer Base}.other` ? Base : never;
/** Plain keys, plus the base of plural keys (`meal.servings` for `meal.servings.one|other`). */
export type MessageKey = Exclude<RawKey, `${string}.one` | `${string}.other`> | PluralBase<RawKey>;

export const messages: Record<Locale, Record<string, string>> = { 'it-IT': it, 'en-GB': en };
```

- [ ] **Step 2: Scrivi i test che falliscono**

`web/src/i18n/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatAverage, formatChangeTime, formatDayMonth, formatDayShort, formatMonthYear } from './dates';
import { messages } from './messages';
import { truncate } from './text';
import { initialLocale, translate } from './translate';

describe('messages', () => {
  it('has the same keys in both locales', () => {
    expect(Object.keys(messages['en-GB']).sort()).toEqual(Object.keys(messages['it-IT']).sort());
  });
  it('has no empty texts', () => {
    for (const dict of Object.values(messages)) for (const text of Object.values(dict)) expect(text.trim()).not.toBe('');
  });
  it('gives every plural both forms', () => {
    for (const dict of Object.values(messages)) {
      for (const key of Object.keys(dict)) {
        if (key.endsWith('.one')) expect(dict[key.replace(/\.one$/, '.other')]).toBeDefined();
        if (key.endsWith('.other')) expect(dict[key.replace(/\.other$/, '.one')]).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('fills parameters', () => {
    expect(translate('it-IT', 'meal.changedBy', { name: 'Anna', time: 'giovedì 21:30' })).toBe('Cambiato da Anna, giovedì 21:30');
  });
  it('chooses plural forms with Intl.PluralRules', () => {
    expect(translate('it-IT', 'meal.servings', { count: 1 })).toBe('1 porzione');
    expect(translate('it-IT', 'meal.servings', { count: 4 })).toBe('4 porzioni');
    expect(translate('en-GB', 'meal.servings', { count: 1 })).toBe('1 serving');
    expect(translate('en-GB', 'meal.servings', { count: 0 })).toBe('0 servings');
  });
  it('leaves unknown placeholders visible', () => {
    expect(translate('en-GB', 'meal.changedBy', { name: 'Tom' })).toBe('Changed by Tom, {time}');
  });
  it('picks the starting language from the browser', () => {
    expect(initialLocale(['en-US', 'it'])).toBe('en-GB');
    expect(initialLocale(['it-IT'])).toBe('it-IT');
    expect(initialLocale(['fr-FR', 'en'])).toBe('it-IT');
    expect(initialLocale([])).toBe('it-IT');
  });
});

describe('dates and numbers', () => {
  it('formats per locale', () => {
    expect(formatDayShort('it-IT', '2026-10-06')).toBe('MAR');
    expect(formatDayShort('en-GB', '2026-10-06')).toBe('TUE');
    expect(formatDayMonth('it-IT', '2026-10-07')).toBe('7 ottobre');
    expect(formatMonthYear('en-GB', '2026-10-07')).toBe('October 2026');
    expect(formatChangeTime('it-IT', '2026-10-02T21:30')).toBe('venerdì 21:30');
    expect(formatAverage('it-IT', 4.333)).toBe('4,3');
    expect(formatAverage('en-GB', 4)).toBe('4.0');
  });
  it('truncates without a dangling space', () => {
    expect(truncate('gnambox.com', 22)).toBe('gnambox.com');
    expect(truncate('Libro: Panini e tramezzini, pp. 110-111', 22)).toBe('Libro: Panini e trame…');
    expect(truncate('Libro: Panini e tramezzini', 17)).toBe('Libro: Panini e…');
  });
});
```

`web/src/i18n/LocaleProvider.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LocaleProvider, useLocale, useT } from './LocaleProvider';

function Probe() {
  const t = useT();
  const { setLocale } = useLocale();
  return (
    <>
      <p>{t('nav.recipes')}</p>
      <button onClick={() => setLocale('en-GB')}>en</button>
    </>
  );
}

it('switches language and sets the document language, without storing anything', () => {
  render(<LocaleProvider initial="it-IT"><Probe /></LocaleProvider>);
  expect(screen.getByText('Ricettario')).toBeTruthy();
  expect(document.documentElement.lang).toBe('it');
  act(() => screen.getByText('en').click());
  expect(screen.getByText('Recipes')).toBeTruthy();
  expect(document.documentElement.lang).toBe('en-GB');
  expect(localStorage.length).toBe(0);
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `cd web && npx vitest run src/i18n`
Expected: FAIL, import di `./translate`, `./dates`, `./text`, `./LocaleProvider` non risolti.

- [ ] **Step 4: Implementa**

`web/src/i18n/translate.ts`:
```ts
import { messages, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey } from './messages';
export { LOCALES } from './messages';
export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  const dict = messages[locale];
  let template = dict[key];
  if (template === undefined && typeof params.count === 'number') {
    const category = new Intl.PluralRules(locale).select(params.count);
    template = dict[`${key}.${category}`] ?? dict[`${key}.other`];
  }
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Before sign-in: English if the browser prefers English, Italian otherwise. */
export function initialLocale(languages: readonly string[]): Locale {
  const first = languages[0]?.toLowerCase() ?? '';
  return first.startsWith('en') ? 'en-GB' : 'it-IT';
}
```

`web/src/i18n/dates.ts`: copiare da `prototype/src/lib/i18n/dates.ts` le funzioni `formatDayShort`, `formatDayNumber`, `formatDayLong`, `formatDayMonth`, `formatChangeTime`, `formatAverage` cambiando gli import in `import { type IsoDate, type LocalDateTime } from '../lib/calendar';` e `import type { Locale } from './translate';` (togliere `formatWeekRange` e `formatDateTime`, non usate). Aggiungere:
```ts
export function formatMonthYear(locale: Locale, date: IsoDate): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(asUtc(date));
}
```

`web/src/i18n/text.ts`:
```ts
/** Cuts a text to at most `max` characters, ellipsis included, without a dangling space. */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
```

`web/src/i18n/LocaleProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey, type MessageParams } from './translate';

interface LocaleContextValue {
  locale: Locale;
  /** Which language applies (device, browser, profile, per-user choice) is decided by the session. */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = locale === 'it-IT' ? 'it' : 'en-GB';
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale outside LocaleProvider');
  return value;
}

export function useT() {
  const { locale } = useLocale();
  return useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale]);
}
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/i18n`
Expected: PASS (tutti i test di `i18n.test.ts` e `LocaleProvider.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add web/src/i18n
git commit -m "Web: testi in italiano e inglese britannico senza librerie, plurali e date con Intl"
```

---

### Task 4: Tipi delle viste, errori e interfaccia Api

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/errors.ts`, `web/src/api/ApiProvider.tsx`
- Test: `web/src/api/errors.test.ts`

**Interfaces:**
- Consumes: `IsoDate`, `LocalDateTime`, `MealType` da `src/lib/calendar.ts`; `Locale`, `MessageKey` da `src/i18n/translate.ts`.
- Produces (tutto esportato da `src/api/types.ts`):

```ts
export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type ProteinGroup = 'fish' | 'white_meat' | 'meat' | 'legumes' | 'eggs' | 'vegetarian';
export const PROTEIN_GROUPS: readonly ProteinGroup[];
export type FamilyRole = 'family_admin' | 'member';

export interface RatingSummary { familyAverage: number | null; familyCount: number; myStars: number | null }
export interface RecipeSummary {
  id: string; name: string; description: string; photo: string | null; durationMinutes: number | null;
  sourceType: SourceType; sourceUrl: string | null; bookTitle: string | null; bookPages: string | null;
  mealType: RecipeMealType; proteinGroup: ProteinGroup | null;
}
/** Quantity already scaled, converted and written in the user's language (spec section 1, ready views). */
export interface IngredientLine { ingredientId: string; name: string; amount: string; optional: boolean }
export interface MealView {
  slotId: string; date: IsoDate; mealType: MealType; kind: 'recipe' | 'free' | 'empty';
  recipe: RecipeSummary | null; freeText: string | null; servings: number;
  /** null when the recipe has no verified ingredients yet. */
  ingredients: IngredientLine[] | null; note: string | null;
  /** null when the recipe cannot be rated or opened by this user (e.g. a draft). */
  rating: RatingSummary | null; canOpenRecipe: boolean;
  /** userName null: the author is no longer a member. */
  lastChange: { userName: string | null; at: LocalDateTime } | null;
}
export interface DayView { date: IsoDate; meals: MealView[] }
export interface WeekView { startsOn: IsoDate; days: DayView[] }
export type OpeningView = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };
export type RecipeSort = 'name' | 'rating' | 'added' | 'lastEaten';
export interface RecipeQuery {
  text?: string; mealType?: MealType; maxMinutes?: number; proteinGroup?: ProteinGroup; minStars?: number;
  sort?: RecipeSort; reversed?: boolean;
}
export interface RecipeListItem { recipe: RecipeSummary; rating: RatingSummary; servings: number; ingredients: IngredientLine[] }
export interface RecipeDetailView {
  recipe: RecipeSummary; baseServings: number | null; servings: number; ingredients: IngredientLine[];
  rating: RatingSummary; history: { date: IsoDate; mealType: MealType }[];
}
export interface FamilyView { id: string; name: string; timeZone: string; role: FamilyRole }
export interface MeView {
  user: { id: string; displayName: string; email: string; locale: Locale };
  families: FamilyView[]; currentFamilyId: string | null;
}

/** «Invariato» in the contract (decided by W1). The version is an opaque string: kept and sent back, never parsed. */
export type Read<T> = { unchanged: true; version: string } | { unchanged: false; version: string; data: T };
export interface ReadInput { knownVersion?: string }
export interface FamilyInput extends ReadInput { familyId: string }

/** Same shape as the future oRPC client (nested by area). Names align with wave 2's contract. */
export interface Api {
  me: { get(input: ReadInput): Promise<Read<MeView>> };
  menu: {
    getOpening(input: FamilyInput): Promise<Read<OpeningView>>;
    getWeek(input: FamilyInput & { weekStartsOn: IsoDate }): Promise<Read<WeekView>>;
    /** Days with a menu in a month (YYYY-MM), for the date picker. */
    getDates(input: FamilyInput & { month: string }): Promise<Read<IsoDate[]>>;
  };
  recipes: {
    search(input: FamilyInput & { query: RecipeQuery }): Promise<Read<RecipeListItem[]>>;
    /** slotId: opened from that meal; wave 2 shows the version it was eaten with (spec R1). */
    get(input: FamilyInput & { recipeId: string; servings?: number; slotId?: string }): Promise<Read<RecipeDetailView>>;
  };
  ratings: { set(input: { familyId: string; recipeId: string; stars: number | null }): Promise<RatingSummary> };
}
```

- Produces (da `src/api/errors.ts`):

```ts
export type ApiErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unauthorized' | 'network' | 'unknown';
export class ApiError extends Error { readonly code: ApiErrorCode; readonly data?: unknown; constructor(code: ApiErrorCode, data?: unknown) }
export function toApiError(error: unknown): ApiError;
export function errorKey(error: unknown): MessageKey; // 'errors.<code>'
/** True when a screen must show the error instead of cached data: anything but a network error with data. */
export function isBlocking(error: unknown, hasData: boolean): boolean;
```

- Produces (da `src/api/ApiProvider.tsx`): `<ApiProvider api={Api}>`, `useApi(): Api`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, errorKey, isBlocking, toApiError } from './errors';

describe('api errors', () => {
  it('keeps API errors and wraps everything else', () => {
    const notFound = new ApiError('not_found');
    expect(toApiError(notFound)).toBe(notFound);
    expect(toApiError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toApiError('boom').code).toBe('unknown');
  });
  it('maps codes to message keys', () => {
    expect(errorKey(new ApiError('forbidden'))).toBe('errors.forbidden');
    expect(errorKey(new Error('x'))).toBe('errors.unknown');
  });
  it('lets only network errors keep cached data on screen', () => {
    expect(isBlocking(new ApiError('network'), true)).toBe(false);
    expect(isBlocking(new ApiError('network'), false)).toBe(true);
    expect(isBlocking(new ApiError('forbidden'), true)).toBe(true);
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd web && npx vitest run src/api/errors.test.ts`
Expected: FAIL, `Failed to resolve import "./errors"`.

- [ ] **Step 3: Implementa**

`web/src/api/types.ts`: il blocco «Produces» qui sopra, con gli import `import type { IsoDate, LocalDateTime, MealType } from '../lib/calendar';` e `import type { Locale } from '../i18n/translate';`, più:
```ts
export const PROTEIN_GROUPS = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'] as const satisfies readonly ProteinGroup[];
```

`web/src/api/errors.ts`:
```ts
import type { MessageKey } from '../i18n/translate';

export type ApiErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unauthorized' | 'network' | 'unknown';

/** Errors are codes, never texts (spec section 1): the web translates them. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly data?: unknown;
  constructor(code: ApiErrorCode, data?: unknown) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  // fetch rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return new ApiError('network');
  return new ApiError('unknown');
}

export function errorKey(error: unknown): MessageKey {
  return `errors.${toApiError(error).code}`;
}

/** Offline, the stored copy stays readable; any other error hides it (review, finding 2). */
export function isBlocking(error: unknown, hasData: boolean): boolean {
  return toApiError(error).code !== 'network' || !hasData;
}
```

`web/src/api/ApiProvider.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { Api } from './types';

const ApiContext = createContext<Api | null>(null);

/** Screens get the client from context, never by import, so tests and wave 2 can swap it. */
export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi outside ApiProvider');
  return api;
}
```

- [ ] **Step 4: Verifica che passi, tipi compresi**

Run: `cd web && npx vitest run src/api/errors.test.ts && npm run typecheck`
Expected: PASS; nessun errore di tipi (in particolare `errors.${code}` deve essere una `MessageKey` valida).

- [ ] **Step 5: Commit**

```bash
git add web/src/api
git commit -m "Web: viste provvisorie, errori a codici e interfaccia Api con la forma del client oRPC"
```

---

### Task 5: Connettività, dati demo e client finto

**Files:**
- Create: `web/src/lib/connectivity.ts`, `web/src/test/connectivity.ts`, `web/scripts/build-fake-data.mjs`, `web/src/api/fake/demo-data.json` (generato), `web/src/api/fake/seed.ts`, `web/src/api/fake/quantity.ts`, `web/src/api/fake/fakeApi.ts`
- Test: `web/src/api/fake/quantity.test.ts`, `web/src/api/fake/fakeApi.test.ts`

**Interfaces:**
- Consumes: tipi di `src/api/types.ts`; `ApiError`; funzioni di `src/lib/calendar.ts`; `translate`, `Locale`.
- Produces:
  - `isOnline(): boolean`, `subscribeConnectivity(onChange: () => void): () => void` (da `src/lib/connectivity.ts`)
  - `setOnline(online: boolean): void` per i test (da `src/test/connectivity.ts`)
  - `createFakeApi(options: FakeApiOptions): Api` con `interface FakeApiOptions { getLocale: () => Locale; user?: { id: string; email: string }; latencyMs?: number }`
  - `DEMO_FAMILY_ID = 'family-main'`, `DEMO_USER_ID = 'user-federico'`
  - `formatAmount(quantity: Quantity, sourceText: string, text: Translated | null, locale: Locale): string`, `scaleQuantity(quantity: Quantity, factor: number): Quantity`

- [ ] **Step 0: Connettività**

Un solo meccanismo per banner offline, client finto e test (review, rilievo 14).

`web/src/lib/connectivity.ts`:
```ts
/** The device's view of the network; the fake client and the offline banner both read it. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function subscribeConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
```

`web/src/test/connectivity.ts`:
```ts
/** Puts jsdom on- or offline and fires the event, as the browser does. */
export function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}
```

`web/src/test/setup.ts`, aggiungere:
```ts
import { beforeEach } from 'vitest';
import { setOnline } from './connectivity';

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});
```

- [ ] **Step 1: Script dei dati demo e generazione**

`web/scripts/build-fake-data.mjs`:
```js
// Reads the prototype demo data (read only) and keeps what the fake client needs.
// Recipes and verified ingredients come from ../meal_planner via the prototype; English texts are demo only.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(resolve(root, '../prototype/src/lib/demo-data/generated.json'), 'utf8'));

const data = {
  books: source.books,
  ingredients: source.ingredients.map(({ id, name }) => ({ id, name })),
  recipes: source.recipes.map((r) => ({
    id: r.id, status: r.status, name: r.name, description: r.description, sourceType: r.sourceType,
    sourceUrl: r.sourceUrl, bookId: r.bookId, bookPages: r.bookPages, durationMinutes: r.durationMinutes,
    baseServings: r.baseServings, mealType: r.mealType, proteinGroup: r.proteinGroup, photo: r.photo, addedOn: r.addedOn,
    ingredients: r.ingredients.map(({ ingredientId, quantity, sourceText, text, isOptional }) => ({ ingredientId, quantity, sourceText, text: text ?? null, isOptional }))
  })),
  weeks: source.weeks.map(({ startsOn, generatedAt, slots }) => ({
    startsOn, generatedAt,
    slots: slots.map(({ id, date, mealType, recipeId, freeText, servings, note }) => ({ id, date, mealType, recipeId, freeText, servings, note }))
  })),
  federicoRatings: source.federicoRatings
};

writeFileSync(resolve(root, 'src/api/fake/demo-data.json'), `${JSON.stringify(data, null, 1)}\n`);
console.log(`Fake data: ${data.recipes.length} recipes, ${data.weeks.length} weeks`);
```

Run: `cd web && mkdir -p src/api/fake && npm run fake-data`
Expected: `Fake data: 56 recipes, 4 weeks`.

- [ ] **Step 2: Persone, voti e modifiche demo**

`web/src/api/fake/seed.ts` (stessi dati inventati di `prototype/src/lib/demo-data/seed.ts`):
```ts
import type { Locale } from '../../i18n/translate';
import type { FamilyRole } from '../types';

export const DEMO_FAMILY_ID = 'family-main';
export const DEMO_USER_ID = 'user-federico';
export const DEMO_FAMILY = { id: DEMO_FAMILY_ID, name: 'Famiglia Folloni', timeZone: 'Europe/Rome' };

export interface DemoPerson { id: string; displayName: string; email: string; locale: Locale; role: FamilyRole }
export const DEMO_PEOPLE: DemoPerson[] = [
  { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT', role: 'family_admin' },
  { id: 'user-anna', displayName: 'Anna', email: 'anna@example.com', locale: 'it-IT', role: 'member' },
  { id: 'user-tom', displayName: 'Tom', email: 'tom@example.com', locale: 'en-GB', role: 'member' }
];

/** Changes on the week of 5 October 2026 (before the date shift). Marco is a former member. */
export const DEMO_CHANGES = [
  { slotId: '2026-10-05-dinner', updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10', note: null },
  { slotId: '2026-10-07-lunch', updatedBy: 'user-marco', updatedAt: '2026-10-01T20:40', note: null },
  { slotId: '2026-10-08-lunch', updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30', note: 'Doppia dose, avanza per venerdì' }
];

export interface DemoRating { userId: string; recipeId: string; stars: number }

/** Federico's ratings from the origin project; Anna's and Tom's invented, deterministic. */
export function seedRatings(federico: { recipeId: string; stars: number }[]): DemoRating[] {
  const ratings: DemoRating[] = federico.map((r) => ({ userId: 'user-federico', ...r }));
  federico.forEach((r, index) => {
    if (index % 2 === 0) ratings.push({ userId: 'user-anna', recipeId: r.recipeId, stars: Math.max(1, r.stars - 1) });
    if (index % 3 === 0) ratings.push({ userId: 'user-tom', recipeId: r.recipeId, stars: Math.min(5, r.stars + 1) });
  });
  return ratings;
}
```

- [ ] **Step 3: Scrivi i test delle quantità che falliscono**

`web/src/api/fake/quantity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatAmount, scaleQuantity } from './quantity';

describe('fake quantities', () => {
  it('formats metric amounts per locale', () => {
    expect(formatAmount({ kind: 'amount', value: 150, unit: 'g' }, '150 g', null, 'it-IT')).toBe('150 g');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'l' }, '1,5 l', null, 'it-IT')).toBe('1,5 l');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'l' }, '1,5 l', null, 'en-GB')).toBe('1.5 l');
  });
  it('writes countable units with fractions and plurals', () => {
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'clove' }, '1/2', null, 'it-IT')).toBe('½ spicchio');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'clove' }, '', null, 'it-IT')).toBe('1½ spicchi');
    expect(formatAmount({ kind: 'amount', value: 2, unit: 'piece' }, '2', null, 'en-GB')).toBe('2');
    expect(formatAmount({ kind: 'amount', value: 0.1, unit: 'piece' }, '', null, 'en-GB')).toBe('¼');
  });
  it('shows to-taste and text quantities in the user language', () => {
    expect(formatAmount({ kind: 'to_taste' }, 'q.b.', null, 'en-GB')).toBe('to taste');
    const text = { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' };
    expect(formatAmount({ kind: 'text' }, '1 mazzetto', text, 'en-GB')).toBe('1 bunch');
    expect(formatAmount({ kind: 'text' }, '3 matasse', null, 'en-GB')).toBe('3 matasse');
  });
  it('scales only numeric amounts', () => {
    expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 0.5)).toEqual({ kind: 'amount', value: 150, unit: 'g' });
    expect(scaleQuantity({ kind: 'text' }, 2)).toEqual({ kind: 'text' });
  });
});
```

- [ ] **Step 4: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/fake/quantity.test.ts`
Expected: FAIL, `Failed to resolve import "./quantity"`.

- [ ] **Step 5: Implementa le quantità finte**

`web/src/api/fake/quantity.ts`:
```ts
import { translate, type Locale } from '../../i18n/translate';

// FAKE: linear scaling and metric only. The real scaling and conversion belong to W4 (domain/) and the server.
export type UnitCode = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'us_cup' | 'piece' | 'clove' | 'tbsp' | 'tsp' | 'slice' | 'pinch';
export type Quantity = { kind: 'amount'; value: number; unit: UnitCode } | { kind: 'to_taste' } | { kind: 'text' };
export type Translated = { 'it-IT': string; 'en-GB': string | null };

// [singular, plural]; an empty label means the number alone (pieces).
const UNIT_LABELS: Record<Locale, Record<UnitCode, [string, string]>> = {
  'it-IT': {
    g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'], us_cup: ['tazza USA', 'tazze USA'],
    piece: ['', ''], clove: ['spicchio', 'spicchi'], tbsp: ['cucchiaio', 'cucchiai'], tsp: ['cucchiaino', 'cucchiaini'],
    slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi']
  },
  'en-GB': {
    g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'], us_cup: ['US cup', 'US cups'],
    piece: ['', ''], clove: ['clove', 'cloves'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
    slice: ['slice', 'slices'], pinch: ['pinch', 'pinches']
  }
};
const FRACTION_UNITS = new Set<UnitCode>(['us_cup', 'piece', 'clove', 'tbsp', 'tsp', 'slice', 'pinch']);
const FRACTIONS: Record<number, string> = { 25: '¼', 50: '½', 75: '¾' };

export function scaleQuantity(quantity: Quantity, factor: number): Quantity {
  return quantity.kind === 'amount' ? { ...quantity, value: quantity.value * factor } : quantity;
}

function round(value: number, unit: UnitCode): number {
  if (FRACTION_UNITS.has(unit)) return Math.max(0.25, Math.round(value * 4) / 4);
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

export function formatAmount(quantity: Quantity, sourceText: string, text: Translated | null, locale: Locale): string {
  if (quantity.kind === 'to_taste') return translate(locale, 'quantity.toTaste');
  if (quantity.kind === 'text') return text?.[locale] ?? sourceText;
  const value = round(quantity.value, quantity.unit);
  const [singular, plural] = UNIT_LABELS[locale][quantity.unit];
  const fraction = FRACTION_UNITS.has(quantity.unit) ? FRACTIONS[Math.round((value % 1) * 100)] : undefined;
  const number = fraction !== undefined
    ? `${Math.floor(value) || ''}${fraction}`
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const label = value <= 1 ? singular : plural;
  return label ? `${number} ${label}` : number;
}
```

- [ ] **Step 6: Scrivi i test del client finto che falliscono**

`web/src/api/fake/fakeApi.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../../i18n/translate';
import { isOnline } from '../../lib/connectivity';
import { ApiError } from '../errors';
import { setOnline } from '../../test/connectivity';
import type { Read } from '../types';
import { createFakeApi, DEMO_FAMILY_ID } from './fakeApi';

const data = <T,>(read: Read<T>): T => {
  if (read.unchanged) throw new Error('fake reads are never unchanged');
  return read.data;
};

let locale: Locale = 'it-IT';
const api = () => createFakeApi({ getLocale: () => locale, latencyMs: 0 });
const familyId = DEMO_FAMILY_ID;

beforeEach(() => {
  locale = 'it-IT';
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome: the demo week of 5 October is the current one (no shift).
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('fake api', () => {
  it('opens on today and shifts the demo weeks to the current week', async () => {
    expect(data(await api().menu.getOpening({ familyId }))).toEqual({ kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' });
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    const week = data(await api().menu.getWeek({ familyId, weekStartsOn: '2026-11-02' }));
    expect(week.days.map((d) => d.date)[0]).toBe('2026-11-02');
    expect(week.days.flatMap((d) => d.meals).length).toBeGreaterThan(0);
  });
  it('rejects unknown weeks and other families', async () => {
    await expect(api().menu.getWeek({ familyId, weekStartsOn: '2030-01-07' })).rejects.toEqual(new ApiError('not_found'));
    await expect(api().menu.getOpening({ familyId: 'family-other' })).rejects.toEqual(new ApiError('forbidden'));
  });
  it('shows changes, notes and former members on meals', async () => {
    const week = data(await api().menu.getWeek({ familyId, weekStartsOn: '2026-10-05' }));
    const meals = week.days.flatMap((d) => d.meals);
    expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.lastChange).toEqual({ userName: 'Anna', at: '2026-10-02T21:30' });
    expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.note).toBe('Doppia dose, avanza per venerdì');
    expect(meals.find((m) => m.slotId === '2026-10-07-lunch')?.lastChange?.userName).toBeNull();
  });
  it('lists the days with a menu in a month', async () => {
    const dates = data(await api().menu.getDates({ familyId, month: '2026-10' }));
    expect(dates).toContain('2026-10-05');
    expect(dates).toContain('2026-10-18');
    expect(dates.every((d) => d.startsWith('2026-10'))).toBe(true);
  });
  it('searches by ingredient in the user language and filters by time', async () => {
    locale = 'en-GB';
    const found = data(await api().recipes.search({ familyId, query: { text: 'basmati' } }));
    expect(found.map((i) => i.recipe.id)).toContain('wok-pollo-peperoni-riso-basmati');
    expect(found[0]?.recipe.name).toMatch(/[A-Za-z]/);
    const quick = data(await api().recipes.search({ familyId, query: { text: 'basmati', maxMinutes: 20 } }));
    expect(quick.map((i) => i.recipe.id)).not.toContain('wok-pollo-peperoni-riso-basmati');
  });
  it('sorts by rating and reverses the order', async () => {
    const byRating = data(await api().recipes.search({ familyId, query: { sort: 'rating' } }));
    const averages = byRating.map((i) => i.rating.familyAverage ?? 0);
    expect(averages).toEqual([...averages].sort((a, b) => b - a));
    const reversed = data(await api().recipes.search({ familyId, query: { sort: 'rating', reversed: true } }));
    expect(reversed.map((i) => i.recipe.id)).toEqual(byRating.map((i) => i.recipe.id).reverse());
  });
  it('scales the recipe detail to the chosen servings', async () => {
    const detail = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', servings: 3 }));
    expect(detail.baseServings).toBe(6);
    expect(detail.servings).toBe(3);
    expect(detail.ingredients.find((i) => i.ingredientId === 'riso-basmati')?.amount).toBe('150 g');
    const fallback = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', servings: -2 }));
    expect(fallback.servings).toBe(6);
    await expect(api().recipes.get({ familyId, recipeId: 'nope' })).rejects.toEqual(new ApiError('not_found'));
  });
  it('sets and removes the own rating, updating the family average', async () => {
    const client = api();
    const recipeId = 'wok-pollo-peperoni-riso-basmati';
    const rated = await client.ratings.set({ familyId, recipeId, stars: 5 });
    expect(rated.myStars).toBe(5);
    const removed = await client.ratings.set({ familyId, recipeId, stars: null });
    expect(removed.myStars).toBeNull();
    expect(removed.familyCount).toBe(rated.familyCount - 1);
    await expect(client.ratings.set({ familyId, recipeId, stars: 6 })).rejects.toEqual(new ApiError('invalid'));
  });
  it('fails every call while the device is offline, like a real transport', async () => {
    const client = api();
    setOnline(false);
    await expect(client.menu.getOpening({ familyId })).rejects.toEqual(new ApiError('network'));
    await expect(client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 4 })).rejects.toEqual(new ApiError('network'));
    setOnline(true);
    expect((await client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 4 })).myStars).toBe(4);
  });
  it('answers with opaque composite versions that change with the data and the language', async () => {
    const client = api();
    const first = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05' });
    expect(typeof first.version).toBe('string');
    await client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 2 });
    const second = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05', knownVersion: first.version });
    expect(second.version).not.toBe(first.version);
    locale = 'en-GB';
    const english = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05' });
    expect(english.version).not.toBe(second.version);
  });
  it('accepts the meal reference when a recipe is opened from a meal', async () => {
    const detail = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', slotId: '2026-10-05-dinner' }));
    expect(detail.recipe.id).toBe('wok-pollo-peperoni-riso-basmati');
  });
  it('returns the signed-in user and the demo family', async () => {
    const me = data(await createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, user: { id: 'u-1', email: 'giulia@example.com' } }).me.get({}));
    expect(me.user).toMatchObject({ id: 'u-1', email: 'giulia@example.com', displayName: 'Giulia' });
    expect(me.currentFamilyId).toBe(familyId);
    expect(me.families[0]).toMatchObject({ name: 'Famiglia Folloni', timeZone: 'Europe/Rome' });
  });
});
```

- [ ] **Step 7: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/fake/fakeApi.test.ts`
Expected: FAIL, `Failed to resolve import "./fakeApi"`.

- [ ] **Step 8: Implementa il client finto**

`web/src/api/fake/fakeApi.ts`:
```ts
import { addDays, daysBetween, isMealPast, localNow, mondayOf, weekDates, type IsoDate, type LocalDateTime, type MealType } from '../../lib/calendar';
import type { Locale } from '../../i18n/translate';
import { ApiError } from '../errors';
import type { Api, IngredientLine, MealView, OpeningView, RatingSummary, Read, RecipeListItem, RecipeMealType, RecipeQuery, RecipeSummary, SourceType, ProteinGroup } from '../types';
import raw from './demo-data.json';
import { formatAmount, scaleQuantity, type Quantity, type Translated } from './quantity';
import { DEMO_CHANGES, DEMO_FAMILY, DEMO_PEOPLE, DEMO_USER_ID, seedRatings, type DemoRating } from './seed';

export { DEMO_FAMILY_ID, DEMO_USER_ID } from './seed';

// FAKE client for tests and fake mode (spec "Client finto"). Same interface as the real one.
interface DemoRecipe {
  id: string; status: string; name: Translated; description: Translated; sourceType: SourceType; sourceUrl: string | null;
  bookId: string | null; bookPages: string | null; durationMinutes: number | null; baseServings: number | null;
  mealType: RecipeMealType; proteinGroup: ProteinGroup | null; photo: string | null; addedOn: IsoDate;
  ingredients: { ingredientId: string; quantity: Quantity; sourceText: string; text: Translated | null; isOptional: boolean }[];
}
interface DemoSlot {
  id: string; date: IsoDate; mealType: MealType; recipeId: string | null; freeText: string | null; servings: number;
  note: string | null; updatedBy: string | null; updatedAt: LocalDateTime | null;
}
interface DemoWeek { startsOn: IsoDate; generatedAt: LocalDateTime; slots: DemoSlot[] }

const data = raw as unknown as {
  books: { id: string; title: string }[];
  ingredients: { id: string; name: Translated }[];
  recipes: DemoRecipe[];
  weeks: { startsOn: IsoDate; generatedAt: LocalDateTime; slots: Omit<DemoSlot, 'updatedBy' | 'updatedAt'>[] }[];
  federicoRatings: { recipeId: string; stars: number }[];
};

const DEMO_CURRENT_WEEK = '2026-10-05';
const MEAL_ORDER: Record<MealType, number> = { lunch: 0, dinner: 1 };

export interface FakeApiOptions {
  getLocale: () => Locale;
  user?: { id: string; email: string };
  latencyMs?: number;
}

const shiftTime = (time: LocalDateTime, days: number) => `${addDays(time.slice(0, 10), days)}${time.slice(10)}`;
const localized = (text: Translated, locale: Locale) => text[locale] ?? text['it-IT'];
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
// Descending order with missing values last.
const desc = <T extends string | number>(a: T | null, b: T | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);

export function createFakeApi(options: FakeApiOptions): Api {
  const now = () => localNow(DEMO_FAMILY.timeZone);
  // The demo week of 5 October 2026 becomes the current week, so there is always a menu for today.
  const offset = daysBetween(DEMO_CURRENT_WEEK, mondayOf(now().slice(0, 10)));
  const weeks: DemoWeek[] = data.weeks.map((w) => ({
    startsOn: addDays(w.startsOn, offset),
    generatedAt: shiftTime(w.generatedAt, offset),
    slots: w.slots.map((s) => {
      const change = DEMO_CHANGES.find((c) => c.slotId === s.id);
      return {
        ...s,
        date: addDays(s.date, offset),
        note: change?.note ?? s.note,
        updatedBy: change?.updatedBy ?? null,
        updatedAt: change ? shiftTime(change.updatedAt, offset) : null
      };
    })
  }));
  const recipes = data.recipes.map((r) => ({ ...r, addedOn: addDays(r.addedOn, offset) }));
  const ratings: DemoRating[] = seedRatings(data.federicoRatings);
  const userId = options.user?.id ?? DEMO_USER_ID;
  const memberIds = new Set([...DEMO_PEOPLE.map((p) => p.id), userId]);

  // Grows at every rating: stands for the family counter of the real versions.
  let revision = 1;
  async function respond<T>(value: T): Promise<Read<T>> {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    // Opaque and composite like W1's versions (family, counter, language, deploy); the web never parses it.
    const version = `family:${DEMO_FAMILY.id}|rev:${revision}|lang:${options.getLocale()}|deploy:fake`;
    return { unchanged: false, version, data: structuredClone(value) };
  }
  function checkFamily(familyId: string) {
    if (familyId !== DEMO_FAMILY.id) throw new ApiError('forbidden');
  }
  const visibleWeeks = () => weeks.filter((w) => w.generatedAt <= now()).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const published = (id: string) => recipes.find((r) => r.id === id && r.status === 'published') ?? null;

  function ratingSummary(recipeId: string): RatingSummary {
    const family = ratings.filter((r) => r.recipeId === recipeId && memberIds.has(r.userId));
    const total = family.reduce((sum, r) => sum + r.stars, 0);
    return {
      familyAverage: family.length ? total / family.length : null,
      familyCount: family.length,
      myStars: family.find((r) => r.userId === userId)?.stars ?? null
    };
  }
  function summary(recipe: DemoRecipe, locale: Locale): RecipeSummary {
    return {
      id: recipe.id, name: localized(recipe.name, locale), description: localized(recipe.description, locale),
      photo: recipe.photo, durationMinutes: recipe.durationMinutes, sourceType: recipe.sourceType, sourceUrl: recipe.sourceUrl,
      bookTitle: data.books.find((b) => b.id === recipe.bookId)?.title ?? null, bookPages: recipe.bookPages,
      mealType: recipe.mealType, proteinGroup: recipe.proteinGroup
    };
  }
  function lines(recipe: DemoRecipe, servings: number, locale: Locale): IngredientLine[] | null {
    if (!recipe.baseServings || recipe.ingredients.length === 0) return null;
    const factor = servings / recipe.baseServings;
    return recipe.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      name: localized(data.ingredients.find((i) => i.id === line.ingredientId)?.name ?? { 'it-IT': line.ingredientId, 'en-GB': null }, locale),
      amount: formatAmount(scaleQuantity(line.quantity, factor), line.sourceText, line.text, locale),
      optional: line.isOptional
    }));
  }
  function pastMeals(recipeId: string) {
    return visibleWeeks().flatMap((w) => w.slots).filter((s) => s.recipeId === recipeId && isMealPast(s.date, s.mealType, now()));
  }
  function mealView(slot: DemoSlot, locale: Locale): MealView {
    const recipe = slot.recipeId ? recipes.find((r) => r.id === slot.recipeId) ?? null : null;
    const isPublished = recipe?.status === 'published';
    const author = slot.updatedBy ? DEMO_PEOPLE.find((p) => p.id === slot.updatedBy)?.displayName ?? null : null;
    return {
      slotId: slot.id, date: slot.date, mealType: slot.mealType,
      kind: recipe ? 'recipe' : slot.freeText ? 'free' : 'empty',
      recipe: recipe ? summary(recipe, locale) : null, freeText: slot.freeText, servings: slot.servings,
      ingredients: recipe ? lines(recipe, slot.servings, locale) : null, note: slot.note,
      rating: recipe && isPublished ? ratingSummary(recipe.id) : null,
      canOpenRecipe: isPublished,
      lastChange: slot.updatedBy && slot.updatedAt ? { userName: author, at: slot.updatedAt } : null
    };
  }
  function matches(recipe: DemoRecipe, locale: Locale, needle: string) {
    if (!needle) return true;
    const names = recipe.ingredients.map((l) => localized(data.ingredients.find((i) => i.id === l.ingredientId)?.name ?? { 'it-IT': '', 'en-GB': null }, locale));
    return [localized(recipe.name, locale), localized(recipe.description, locale), ...names].some((t) => normalize(t).includes(needle));
  }

  const api: Api = {
    me: {
      async get() {
        const person = DEMO_PEOPLE.find((p) => p.id === userId);
        const email = options.user?.email ?? person?.email ?? '';
        const fromEmail = email.split('@')[0] ?? '';
        return respond({
          user: {
            id: userId,
            displayName: person?.displayName ?? (fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1)),
            email,
            locale: person?.locale ?? options.getLocale()
          },
          families: [{ ...DEMO_FAMILY, role: person?.role ?? 'member' }],
          currentFamilyId: DEMO_FAMILY.id
        });
      }
    },
    menu: {
      async getOpening({ familyId }) {
        checkFamily(familyId);
        const visible = visibleWeeks();
        if (visible.length === 0) return respond<OpeningView>({ kind: 'no_weeks' });
        const today = now().slice(0, 10);
        const next = visible
          .flatMap((w) => w.slots.filter((s) => s.recipeId || s.freeText).map((s) => ({ date: s.date, weekStartsOn: w.startsOn })))
          .filter((d) => d.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        const last = visible[visible.length - 1]!;
        return respond<OpeningView>(next ? { kind: 'day', ...next } : { kind: 'day', date: last.startsOn, weekStartsOn: last.startsOn });
      },
      async getWeek({ familyId, weekStartsOn }) {
        checkFamily(familyId);
        const week = visibleWeeks().find((w) => w.startsOn === weekStartsOn);
        if (!week) throw new ApiError('not_found');
        const locale = options.getLocale();
        return respond({
          startsOn: week.startsOn,
          days: weekDates(week.startsOn).map((date) => ({
            date,
            meals: week.slots
              .filter((s) => s.date === date)
              .sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])
              .map((s) => mealView(s, locale))
          }))
        });
      },
      async getDates({ familyId, month }) {
        checkFamily(familyId);
        const dates = new Set(visibleWeeks().flatMap((w) => w.slots.map((s) => s.date)).filter((d) => d.startsWith(month)));
        return respond([...dates].sort());
      }
    },
    recipes: {
      async search({ familyId, query }: { familyId: string; query: RecipeQuery }) {
        checkFamily(familyId);
        const locale = options.getLocale();
        const needle = normalize(query.text ?? '');
        const lastEaten = (id: string) => pastMeals(id).map((s) => s.date).sort().at(-1) ?? null;
        const items = recipes
          .filter((r) => r.status === 'published')
          .filter((r) => !query.mealType || r.mealType === query.mealType || r.mealType === 'both')
          .filter((r) => !query.maxMinutes || (r.durationMinutes !== null && r.durationMinutes <= query.maxMinutes))
          .filter((r) => !query.proteinGroup || r.proteinGroup === query.proteinGroup)
          .filter((r) => matches(r, locale, needle))
          .map((r) => ({ r, item: { recipe: summary(r, locale), rating: ratingSummary(r.id), servings: r.baseServings ?? 1, ingredients: lines(r, r.baseServings ?? 1, locale) ?? [] } satisfies RecipeListItem }))
          .filter(({ item }) => !query.minStars || (item.rating.familyAverage ?? 0) >= query.minStars)
          .sort((a, b) => {
            const byName = a.item.recipe.name.localeCompare(b.item.recipe.name, locale);
            const primary =
              query.sort === 'rating' ? desc(a.item.rating.familyAverage, b.item.rating.familyAverage)
              : query.sort === 'added' ? desc(a.r.addedOn, b.r.addedOn)
              : query.sort === 'lastEaten' ? desc(lastEaten(a.r.id), lastEaten(b.r.id))
              : 0;
            return primary || byName;
          })
          .map(({ item }) => item);
        return respond(query.reversed ? items.reverse() : items);
      },
      // slotId is accepted and ignored: versions of past meals arrive with wave 2.
      async get({ familyId, recipeId, servings }) {
        checkFamily(familyId);
        const recipe = published(recipeId);
        if (!recipe) throw new ApiError('not_found');
        const locale = options.getLocale();
        const base = recipe.baseServings;
        const chosen = servings && Number.isInteger(servings) && servings > 0 && servings <= 50 ? servings : (base ?? 1);
        return respond({
          recipe: summary(recipe, locale), baseServings: base, servings: chosen,
          ingredients: lines(recipe, chosen, locale) ?? [], rating: ratingSummary(recipe.id),
          history: pastMeals(recipe.id).map((s) => ({ date: s.date, mealType: s.mealType })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
        });
      }
    },
    ratings: {
      async set({ familyId, recipeId, stars }) {
        checkFamily(familyId);
        if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) throw new ApiError('invalid');
        if (!published(recipeId)) throw new ApiError('not_found');
        if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
        const index = ratings.findIndex((r) => r.userId === userId && r.recipeId === recipeId);
        if (stars === null) {
          if (index !== -1) ratings.splice(index, 1);
        } else if (index === -1) ratings.push({ userId, recipeId, stars });
        else ratings[index]!.stars = stars;
        revision += 1;
        return ratingSummary(recipeId);
      }
    }
  };
  return withTransport(api);
}

/** Every method fails with `network` while the device is offline, before touching any data. */
function withTransport(api: Api): Api {
  const wrap = <T extends object>(area: T): T =>
    Object.fromEntries(
      Object.entries(area).map(([name, method]) => [
        name,
        (...args: unknown[]) => (isOnline() ? (method as (...a: unknown[]) => Promise<unknown>)(...args) : Promise.reject(new ApiError('network')))
      ])
    ) as T;
  return { me: wrap(api.me), menu: wrap(api.menu), recipes: wrap(api.recipes), ratings: wrap(api.ratings) };
}
```

- [ ] **Step 9: Verifica che passino, tipi compresi**

Run: `cd web && npx vitest run src/api/fake && npm run typecheck`
Expected: PASS; nessun errore di tipi. Se un'aspettativa sui dati (per esempio la ricetta `wok-pollo-peperoni-riso-basmati` a 25 minuti per 6 porzioni, o la presenza del 18 ottobre fra le date) non corrisponde a `demo-data.json`, verificare il dato nel JSON e correggere il test, non il client.

- [ ] **Step 10: Commit**

```bash
git add web/scripts/build-fake-data.mjs web/src/api/fake web/src/lib/connectivity.ts web/src/test
git commit -m "Web: client finto con i dati demo del prototipo, spostati sulla settimana corrente"
```

---

### Task 6: Query con «invariato» trasparente e lingua nelle chiavi

> Seconda review: `readThrough` e `keepPreviousWithin` come in C5 e C7.


**Files:**
- Create: `web/src/api/queries.ts`
- Test: `web/src/api/queries.test.ts`

**Interfaces:**
- Consumes: `Api`, `Read<T>`, viste da `src/api/types.ts`; `useApi`; `useLocale`, `Locale`.
- Produces:
  - `interface Versioned<T> { version: string; data: T }`
  - `readThrough<T>(queryClient: QueryClient, queryKey: QueryKey, read: (knownVersion?: string) => Promise<Read<T>>): Promise<Versioned<T>>`
  - `interface QueryDeps { api: Api; queryClient: QueryClient; locale: Locale }`, `useQueryDeps(): QueryDeps`
  - `queryKeys`: `me(locale)`, `opening(familyId, locale)`, `week(familyId, weekStartsOn, locale)`, `dates(familyId, month, locale)`, `search(familyId, query, locale)`, `recipe(familyId, recipeId, locale, servings?, slotId?)`; la forma è sempre `[area, operazione, { familyId?, …, locale }]`
  - `familyOfKey(queryKey: QueryKey): string | null`
  - `meQuery(deps)`, `openingQuery(deps, familyId)`, `weekQuery(deps, familyId, weekStartsOn)`, `datesQuery(deps, familyId, month)`, `searchQuery(deps, familyId, query)`, `recipeQuery(deps, familyId, recipeId, servings?, slotId?)`: `queryOptions` con dati in cache `Versioned<T>` e `select` che restituisce `T`

La lingua è nelle chiavi (spec, Localizzazione): una risposta nella lingua precedente, anche se arriva dopo il cambio, finisce sotto la sua chiave e non si mostra mai nella nuova lingua.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { familyOfKey, queryKeys, readThrough, weekQuery, type Versioned } from './queries';
import type { Api, Read, WeekView } from './types';

const key = queryKeys.week('f', '2026-10-05', 'it-IT');
// A realistic version from W1: family, counters, language and deploy, opaque to the web.
const V1 = 'family:f|counter:12|catalogue:40|lang:it-IT|deploy:2026-10-11T10:00Z';

describe('readThrough', () => {
  it('reads without a version when nothing is cached', async () => {
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: V1, data: 'week' }));
    expect(await readThrough(new QueryClient(), key, read)).toEqual({ version: V1, data: 'week' });
    expect(read).toHaveBeenCalledWith(undefined);
  });
  it('sends the cached version back as is and keeps the cached view when unchanged', async () => {
    const client = new QueryClient();
    const cached: Versioned<string> = { version: V1, data: 'week' };
    client.setQueryData(key, cached);
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: true, version: V1 }));
    expect(await readThrough(client, key, read)).toBe(cached);
    expect(read).toHaveBeenCalledWith(V1);
  });
  it('takes the new view when it changed', async () => {
    const client = new QueryClient();
    client.setQueryData(key, { version: V1, data: 'old' });
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: `${V1}+1`, data: 'new' }));
    expect(await readThrough(client, key, read)).toEqual({ version: `${V1}+1`, data: 'new' });
  });
  it('reads again without a version if the server answers unchanged but the cache is gone', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ unchanged: true, version: V1 })
      .mockResolvedValueOnce({ unchanged: false, version: V1, data: 'week' });
    expect(await readThrough(new QueryClient(), key, read)).toEqual({ version: V1, data: 'week' });
    expect(read).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('query options', () => {
  it('carries the composite version from client to cache and back, unchanged included', async () => {
    const view = { startsOn: '2026-10-05', days: [] } as WeekView;
    const getWeek = vi.fn()
      .mockResolvedValueOnce({ unchanged: false, version: V1, data: view })
      .mockResolvedValueOnce({ unchanged: true, version: V1 });
    const api = { menu: { getWeek } } as unknown as Api;
    const queryClient = new QueryClient();
    const options = weekQuery({ api, queryClient, locale: 'it-IT' }, 'f', '2026-10-05');
    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(getWeek).toHaveBeenNthCalledWith(1, { familyId: 'f', weekStartsOn: '2026-10-05', knownVersion: undefined });
    expect(getWeek).toHaveBeenNthCalledWith(2, { familyId: 'f', weekStartsOn: '2026-10-05', knownVersion: V1 });
    expect(queryClient.getQueryData<Versioned<WeekView>>(options.queryKey)).toEqual({ version: V1, data: view });
  });
  it('keeps languages and families apart in the keys', () => {
    expect(queryKeys.week('f', '2026-10-05', 'it-IT')).not.toEqual(queryKeys.week('f', '2026-10-05', 'en-GB'));
    expect(familyOfKey(queryKeys.search('f2', {}, 'en-GB'))).toBe('f2');
    expect(familyOfKey(queryKeys.me('it-IT'))).toBeNull();
    expect(queryKeys.recipe('f', 'r', 'it-IT', 2, 'slot-1')[2]).toEqual({ familyId: 'f', recipeId: 'r', locale: 'it-IT', servings: 2, slotId: 'slot-1' });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/queries.test.ts`
Expected: FAIL, `Failed to resolve import "./queries"`.

- [ ] **Step 3: Implementa**

```ts
import { queryOptions, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useLocale } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import type { IsoDate } from '../lib/calendar';
import { useApi } from './ApiProvider';
import type { Api, Read, RecipeQuery } from './types';

/** What the cache keeps: the view and its opaque version, sent back as knownVersion. */
export interface Versioned<T> { version: string; data: T }

/** Wraps a read so screens never see «unchanged» (contract decided by W1). */
export async function readThrough<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: (knownVersion?: string) => Promise<Read<T>>
): Promise<Versioned<T>> {
  const cached = queryClient.getQueryData<Versioned<T>>(queryKey);
  const result = await read(cached?.version);
  if (!result.unchanged) return { version: result.version, data: result.data };
  if (cached) return cached;
  // Unchanged but nothing to show (cache cleared meanwhile): ask for the full view.
  const fresh = await read(undefined);
  if (fresh.unchanged) throw new Error('unchanged answer to a read without version');
  return { version: fresh.version, data: fresh.data };
}

export interface QueryDeps { api: Api; queryClient: QueryClient; locale: Locale }

export function useQueryDeps(): QueryDeps {
  return { api: useApi(), queryClient: useQueryClient(), locale: useLocale().locale };
}

export const queryKeys = {
  me: (locale: Locale) => ['me', 'get', { locale }] as const,
  opening: (familyId: string, locale: Locale) => ['menu', 'getOpening', { familyId, locale }] as const,
  week: (familyId: string, weekStartsOn: IsoDate, locale: Locale) => ['menu', 'getWeek', { familyId, weekStartsOn, locale }] as const,
  dates: (familyId: string, month: string, locale: Locale) => ['menu', 'getDates', { familyId, month, locale }] as const,
  search: (familyId: string, query: RecipeQuery, locale: Locale) => ['recipes', 'search', { familyId, query, locale }] as const,
  recipe: (familyId: string, recipeId: string, locale: Locale, servings?: number, slotId?: string) =>
    ['recipes', 'get', { familyId, recipeId, locale, servings, slotId }] as const
};

/** The family a cached view belongs to, if any: ratings and revocations act per family. */
export function familyOfKey(queryKey: QueryKey): string | null {
  const input = queryKey[2];
  if (typeof input !== 'object' || input === null || !('familyId' in input)) return null;
  const familyId = (input as { familyId: unknown }).familyId;
  return typeof familyId === 'string' ? familyId : null;
}

const select = <T,>(value: Versioned<T>) => value.data;

export function meQuery({ api, queryClient, locale }: QueryDeps) {
  const queryKey = queryKeys.me(locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.me.get({ knownVersion })), select });
}

export function openingQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = queryKeys.opening(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getOpening({ familyId, knownVersion })), select });
}

export function weekQuery({ api, queryClient, locale }: QueryDeps, familyId: string, weekStartsOn: IsoDate) {
  const queryKey = queryKeys.week(familyId, weekStartsOn, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getWeek({ familyId, weekStartsOn, knownVersion })), select });
}

export function datesQuery({ api, queryClient, locale }: QueryDeps, familyId: string, month: string) {
  const queryKey = queryKeys.dates(familyId, month, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getDates({ familyId, month, knownVersion })), select });
}

export function searchQuery({ api, queryClient, locale }: QueryDeps, familyId: string, query: RecipeQuery) {
  const queryKey = queryKeys.search(familyId, query, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.search({ familyId, query, knownVersion })), select });
}

export function recipeQuery({ api, queryClient, locale }: QueryDeps, familyId: string, recipeId: string, servings?: number, slotId?: string) {
  const queryKey = queryKeys.recipe(familyId, recipeId, locale, servings, slotId);
  return queryOptions({
    queryKey,
    queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.get({ familyId, recipeId, servings, slotId, knownVersion })),
    select
  });
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/api/queries.test.ts && npm run typecheck`
Expected: PASS; nessun errore di tipi.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/queries.ts web/src/api/queries.test.ts
git commit -m "Web: query con versione opaca, risposta «invariato» trasparente e lingua nelle chiavi"
```

---

### Task 7: Cache persistita con scritture in coda

> Seconda review: segni delle famiglie revocate e pulizia come in C1 e C4.


**Files:**
- Create: `web/src/api/persister.ts`
- Test: `web/src/api/persister.test.ts`

**Interfaces:**
- Consumes: `toApiError`.
- Produces:
  - `interface KeyValueStore { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void>; keys(): Promise<string[]> }`
  - `createMemoryStore(): KeyValueStore & { entries: Map<string, unknown> }`
  - `createIndexedDbStore(dbName?: string): KeyValueStore`
  - `CACHE_PREFIX = 'query-cache:'`, `cacheKey(userId: string): string`
  - `interface SessionPersister extends Persister { close(): Promise<void> }`
  - `createPersister(store: KeyValueStore, userId: string): SessionPersister`
  - `purgeOtherCopies(store: KeyValueStore, keepUserId: string | null): Promise<void>`
  - `PERSIST_MAX_AGE: number` (7 giorni in ms)
  - `createQueryClient(handlers?: { onError?: (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void }): QueryClient`
  - `persistOptions(persister: Persister, buster: string): Omit<PersistQueryClientOptions, 'queryClient'>`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { cacheKey, createMemoryStore, createPersister, createQueryClient, persistOptions, purgeOtherCopies, type KeyValueStore } from './persister';

const week = ['menu', 'getWeek', { familyId: 'f', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
const options = (buster: string) => persistOptions(createPersister(createMemoryStore(), 'x'), buster).dehydrateOptions;

async function saved(store = createMemoryStore(), buster = 'build-1') {
  const persister = createPersister(store, 'user-a');
  const client = createQueryClient();
  client.setQueryData(week, { version: 'v1', data: 'week' });
  await persistQueryClientSave({ queryClient: client, persister, buster, dehydrateOptions: options(buster) });
  return { store, persister };
}

/** A store whose writes wait until released, to reproduce writes still running during sign-out. */
function slowStore() {
  const inner = createMemoryStore();
  const pending: (() => void)[] = [];
  const store: KeyValueStore = {
    ...inner,
    set: (key, value) => new Promise<void>((resolve) => pending.push(() => void inner.set(key, value).then(resolve)))
  };
  return { store, entries: inner.entries, pending, release: () => pending.splice(0).forEach((run) => run()) };
}

describe('persister', () => {
  it('saves one entry per user and restores it', async () => {
    const { store, persister } = await saved();
    expect([...store.entries.keys()]).toEqual([cacheKey('user-a')]);
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister, buster: 'build-1' });
    expect(restored.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('discards a copy made by another build', async () => {
    const { persister } = await saved();
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister, buster: 'build-2' });
    expect(restored.getQueryData(week)).toBeUndefined();
  });
  it('treats an unreadable copy as empty and removes it', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('user-a'), 'not a cache');
    expect(await createPersister(store, 'user-a').restoreClient()).toBeUndefined();
    expect(store.entries.has(cacheKey('user-a'))).toBe(false);
  });
  it('survives a store that fails', async () => {
    const fail = () => Promise.reject(new Error('blocked'));
    const persister = createPersister({ get: fail, set: fail, delete: fail, keys: fail }, 'user-a');
    expect(await persister.restoreClient()).toBeUndefined();
    await expect(persister.persistClient({ timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } })).resolves.toBeUndefined();
    await expect(persister.close()).resolves.toBeUndefined();
  });
  it('deletes the copy after a write still running at close, and writes nothing afterwards', async () => {
    const { store, entries, pending, release } = slowStore();
    const persister = createPersister(store, 'user-a');
    const client = { timestamp: 1, buster: 'b', clientState: { queries: [], mutations: [] } };
    const writing = persister.persistClient(client);
    // The write has reached the store and is still running when the session closes.
    await vi.waitFor(() => expect(pending.length).toBe(1));
    const closing = persister.close();
    await persister.persistClient(client);
    release();
    await Promise.all([writing, closing]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(entries.has(cacheKey('user-a'))).toBe(false);
    expect(await persister.restoreClient()).toBeUndefined();
  });
  it('removes the copies of every other user', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), {});
    store.entries.set(cacheKey('b'), {});
    store.entries.set('unrelated', 1);
    await purgeOtherCopies(store, 'b');
    expect([...store.entries.keys()].sort()).toEqual([cacheKey('b'), 'unrelated']);
    await purgeOtherCopies(store, null);
    expect([...store.entries.keys()]).toEqual(['unrelated']);
  });
  it('keeps only successful queries', async () => {
    const store = createMemoryStore();
    const persister = createPersister(store, 'user-a');
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'week' });
    await client.fetchQuery({ queryKey: ['broken'], queryFn: () => Promise.reject(new ApiError('not_found')) }).catch(() => undefined);
    await persistQueryClientSave({ queryClient: client, persister, buster: 'b', dehydrateOptions: options('b') });
    const entry = store.entries.get(cacheKey('user-a')) as { clientState: { queries: { queryKey: unknown }[] } };
    expect(entry.clientState.queries.map((q) => q.queryKey)).toEqual([week]);
  });
  it('retries only network errors and reports every error with its family', async () => {
    const onError = vi.fn();
    const client = createQueryClient({ onError });
    const retry = client.getDefaultOptions().queries?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new ApiError('network'))).toBe(true);
    expect(retry(2, new ApiError('network'))).toBe(false);
    expect(retry(0, new ApiError('not_found'))).toBe(false);
    await client.fetchQuery({ queryKey: week, queryFn: () => Promise.reject(new ApiError('forbidden')) }).catch(() => undefined);
    expect(onError).toHaveBeenCalledWith(new ApiError('forbidden'), { queryKey: week, familyId: 'f' });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/persister.test.ts`
Expected: FAIL, `Failed to resolve import "./persister"`.

- [ ] **Step 3: Implementa**

```ts
import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { toApiError } from './errors';
import { familyOfKey } from './queries';

/** Minimal storage used by the persister: IndexedDB in the app, memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const CACHE_PREFIX = 'query-cache:';

export function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

export function createMemoryStore(): KeyValueStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key) => structuredClone(entries.get(key)),
    set: async (key, value) => void entries.set(key, structuredClone(value)),
    delete: async (key) => void entries.delete(key),
    keys: async () => [...entries.keys()]
  };
}

/** One database, one object store, one entry per user. */
export function createIndexedDbStore(dbName = 'cosasimangia'): KeyValueStore {
  const storeName = 'kv';
  let opening: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  const run = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String)
  };
}

const isPersistedClient = (value: unknown): value is PersistedClient =>
  typeof value === 'object' && value !== null &&
  typeof (value as PersistedClient).timestamp === 'number' &&
  typeof (value as PersistedClient).buster === 'string' &&
  typeof (value as PersistedClient).clientState === 'object';

export interface SessionPersister extends Persister {
  /** Stops writing and deletes the copy once the writes already running are done. */
  close(): Promise<void>;
}

/** Storage errors never break the app: the cache is only a faster start (spec, cache persistita). */
export function createPersister(store: KeyValueStore, userId: string): SessionPersister {
  const key = cacheKey(userId);
  let closed = false;
  // Operations run one after the other, so a delete never races a write that started earlier.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<unknown>) => {
    queue = queue.then(operation).then(() => undefined, () => undefined);
    return queue;
  };
  return {
    persistClient(client) {
      return closed ? Promise.resolve() : enqueue(async () => {
        if (!closed) await store.set(key, client);
      });
    },
    async restoreClient() {
      if (closed) return undefined;
      const value = await store.get(key).catch(() => undefined);
      if (value === undefined) return undefined;
      if (isPersistedClient(value)) return value;
      await enqueue(() => store.delete(key));
      return undefined;
    },
    removeClient() {
      return enqueue(() => store.delete(key));
    },
    close() {
      closed = true;
      return enqueue(() => store.delete(key));
    }
  };
}

/** Deletes every user's copy but the one kept (at start and at each change of identity). */
export async function purgeOtherCopies(store: KeyValueStore, keepUserId: string | null): Promise<void> {
  const keep = keepUserId ? cacheKey(keepUserId) : null;
  const keys = await store.keys().catch(() => [] as string[]);
  await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== keep).map((k) => store.delete(k).catch(() => undefined)));
}

type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void;

export function createQueryClient(handlers: { onError?: ErrorHandler } = {}): QueryClient {
  const report: ErrorHandler = (error, scope) => handlers.onError?.(error, scope);
  return new QueryClient({
    // One place sees every failure: the session turns unauthorized and forbidden into actions.
    queryCache: new QueryCache({ onError: (error, query) => report(error, { queryKey: query.queryKey, familyId: familyOfKey(query.queryKey) ?? undefined }) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        const familyId = mutation.options.meta?.familyId;
        report(error, { familyId: typeof familyId === 'string' ? familyId : undefined });
      }
    }),
    defaultOptions: {
      queries: {
        gcTime: PERSIST_MAX_AGE,
        // Show the stored copy at once, then check the version (spec section 1).
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => toApiError(error).code === 'network' && count < 2
      },
      // No queue: offline a mutation fails at once (spec, voto).
      mutations: { networkMode: 'always' }
    }
  });
}

export function persistOptions(persister: Persister, buster: string): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister,
    buster,
    maxAge: PERSIST_MAX_AGE,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === 'success',
      shouldDehydrateMutation: () => false
    }
  };
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/api/persister.test.ts && npm run typecheck`
Expected: PASS (8 test). Verificare con Context7 (`/tanstack/query`, «MutationCache onError parameters») l'ordine dei parametri di `MutationCache.onError` in 5.104 (`error, variables, onMutateResult, mutation`) e adattarlo se diverso. Se `persistQueryClientRestore` e `persistQueryClientSave` non sono esportati da `@tanstack/react-query-persist-client`, importarli nei soli test da `@tanstack/query-persist-client-core`, che il pacchetto React installa già.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/persister.ts web/src/api/persister.test.ts
git commit -m "Web: cache persistita per utente con scritture in coda, chiusura e pulizia delle altre copie"
```

---

### Task 8: Backend di accesso e stato dell'accesso

> Seconda review: `AuthProvider` con eventi numerati, `signOut(userId, cleanup)` e `markSignedOut(userId)` come in C2.


**Files:**
- Create: `web/src/auth/backend.ts`, `web/src/auth/supabaseBackend.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/test/stubBackend.ts`
- Test: `web/src/auth/supabaseBackend.test.ts`, `web/src/auth/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `subscribeConnectivity` (Task 5).
- Produces:
  - `interface AuthUser { id: string; email: string }`
  - `type SessionCheck = { status: 'signedIn'; user: AuthUser } | { status: 'unverified'; user: AuthUser } | { status: 'signedOut' }`
  - `type SignInFailure = 'invalid_credentials' | 'network' | 'unknown'`; `type SignInResult = { ok: true } | { ok: false; reason: SignInFailure }`
  - `interface AuthBackend { readonly mode: 'fake' | 'supabase'; check(): Promise<SessionCheck>; onChange(listener: (user: AuthUser | null) => void): () => void; signIn(email: string, password: string): Promise<SignInResult>; signOut(): Promise<void>; refresh(): Promise<boolean>; getAccessToken(): Promise<string | null> }`
  - `DEMO_USER: AuthUser` (`{ id: 'user-federico', email: 'federico@example.com' }`), `createFakeBackend(): AuthBackend`
  - `AUTH_STORAGE_KEY = 'cosasimangia-auth'`; `createSupabaseBackend(url: string, publishableKey: string, deps?: { auth?: AuthClient; storage?: Pick<Storage, 'getItem' | 'removeItem'> }): AuthBackend`; `signInFailure(error: { code?: string; status?: number; name?: string }): SignInFailure`
  - `type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser; verified: boolean }`; `<AuthProvider backend>`; `useAuth(): { state: AuthState; backend: AuthBackend; markSignedOut(): void }`
  - `createStubBackend(initial: AuthUser | null, mode?: 'fake' | 'supabase')` con `setUser(user)`, `setCheck(check)`, `nextSignIn`, `signOutCalls`, `signOutError`, `refreshResult`, `refreshCalls`

Comportamenti di Supabase verificati con Context7 (`/supabase/supabase-js`, 11 ottobre 2026): `signOut` toglie la sessione salvata anche quando il server non risponde e restituisce comunque l'errore; un rinnovo fallito per la rete conserva il token salvato ma `getSession` restituisce `session: null` con un `AuthRetryableFetchError`; un rinnovo rifiutato con token scaduto toglie la sessione ed emette `SIGNED_OUT`.

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/auth/supabaseBackend.test.ts`:
```ts
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, createSupabaseBackend, signInFailure, type AuthClient } from './supabaseBackend';

type Listener = (event: string, session: { user: { id: string; email?: string } } | null) => void;

function setup(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  let listener: Listener = () => {};
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: {} }, error: null })),
    ...overrides
  };
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
  const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', { auth: auth as unknown as AuthClient, storage });
  return { auth, stored, backend, emit: (event: string, session: Parameters<Listener>[1]) => listener(event, session) };
}

describe('supabase backend', () => {
  it('maps sign-in errors to our reasons', () => {
    expect(signInFailure({ code: 'invalid_credentials', status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(signInFailure({ status: 500 })).toBe('unknown');
  });
  it('signs out of this device only and leaves nothing stored even when the service fails', async () => {
    const { auth, stored, backend } = setup({ signOut: vi.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })) });
    stored.set(AUTH_STORAGE_KEY, '{}');
    stored.set(`${AUTH_STORAGE_KEY}-code-verifier`, 'x');
    await expect(backend.signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stored.size).toBe(0);
  });
  it('tells a verified session, an unverifiable one and no session apart', async () => {
    const user = { id: 'u1', email: 'anna@example.com' };
    const signedIn = setup({ getSession: vi.fn(async () => ({ data: { session: { user } }, error: null })) });
    expect(await signedIn.backend.check()).toEqual({ status: 'signedIn', user });
    const offline = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })) });
    offline.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await offline.backend.check()).toEqual({ status: 'unverified', user });
    const refused = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400 } })) });
    refused.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await refused.backend.check()).toEqual({ status: 'signedOut' });
    expect(await setup().backend.check()).toEqual({ status: 'signedOut' });
  });
  it('reports sign-outs and new tokens, ignoring empty initial events', () => {
    const { backend, emit } = setup();
    const listener = vi.fn();
    backend.onChange(listener);
    emit('INITIAL_SESSION', null);
    expect(listener).not.toHaveBeenCalled();
    emit('TOKEN_REFRESHED', { user: { id: 'u1', email: 'a@example.com' } });
    expect(listener).toHaveBeenLastCalledWith({ id: 'u1', email: 'a@example.com' });
    emit('SIGNED_OUT', null);
    expect(listener).toHaveBeenLastCalledWith(null);
  });
  it('renews the session once on request', async () => {
    expect(await setup().backend.refresh()).toBe(true);
    const refused = setup({ refreshSession: vi.fn(async () => ({ data: { session: null }, error: { status: 400 } })) });
    expect(await refused.backend.refresh()).toBe(false);
  });
});
```

`web/src/auth/AuthProvider.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setOnline } from '../test/connectivity';
import { createStubBackend } from '../test/stubBackend';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { state, markSignedOut } = useAuth();
  const text = state.status === 'signedIn' ? `in:${state.user.id}:${state.verified ? 'verified' : 'unverified'}` : state.status;
  return <><p>{text}</p><button onClick={markSignedOut}>out</button></>;
}

const anna = { id: 'anna', email: 'anna@example.com' };

describe('auth state', () => {
  it('keeps an unverifiable session for reading and checks it again when the network is back', async () => {
    const backend = createStubBackend(null);
    backend.setCheck({ status: 'unverified', user: anna });
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    expect(await screen.findByText('in:anna:unverified')).toBeTruthy();
    backend.setCheck({ status: 'signedIn', user: anna });
    act(() => setOnline(true));
    expect(await screen.findByText('in:anna:verified')).toBeTruthy();
  });
  it('ends an unverifiable session when the renewal is refused after reconnecting', async () => {
    const backend = createStubBackend(null);
    backend.setCheck({ status: 'unverified', user: anna });
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:anna:unverified');
    backend.setCheck({ status: 'signedOut' });
    act(() => setOnline(true));
    expect(await screen.findByText('signedOut')).toBeTruthy();
  });
  it('follows sign-outs from elsewhere and forced local sign-outs', async () => {
    const backend = createStubBackend(anna);
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:anna:verified');
    act(() => backend.setUser(null));
    expect(await screen.findByText('signedOut')).toBeTruthy();
    act(() => backend.setUser(anna));
    await screen.findByText('in:anna:verified');
    act(() => screen.getByText('out').click());
    expect(await screen.findByText('signedOut')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/auth`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa i backend**

`web/src/auth/backend.ts`:
```ts
export interface AuthUser { id: string; email: string }
export type SessionCheck = { status: 'signedIn'; user: AuthUser } | { status: 'unverified'; user: AuthUser } | { status: 'signedOut' };
export type SignInFailure = 'invalid_credentials' | 'network' | 'unknown';
export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };

/** What the app needs from authentication; Supabase in real mode, a fixed demo user in fake mode. */
export interface AuthBackend {
  readonly mode: 'fake' | 'supabase';
  /** unverified: offline with a session that cannot be renewed now (read-only use of the stored copy). */
  check(): Promise<SessionCheck>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** This device only; nothing stays stored even when the service cannot be reached. */
  signOut(): Promise<void>;
  /** One renewal of the session; false when it was refused or impossible. */
  refresh(): Promise<boolean>;
  /** For the future oRPC link (Authorization: Bearer), read at every request. */
  getAccessToken(): Promise<string | null>;
}

export const DEMO_USER: AuthUser = { id: 'user-federico', email: 'federico@example.com' };

/** Fake mode (no VITE_SUPABASE_*): always signed in as the demo user, no sign-in page. */
export function createFakeBackend(): AuthBackend {
  return {
    mode: 'fake',
    check: async () => ({ status: 'signedIn', user: DEMO_USER }),
    onChange: () => () => undefined,
    signIn: async () => ({ ok: true }),
    signOut: async () => undefined,
    refresh: async () => true,
    getAccessToken: async () => null
  };
}
```

`web/src/auth/supabaseBackend.ts`:
```ts
import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthBackend, AuthUser, SignInFailure } from './backend';

export const AUTH_STORAGE_KEY = 'cosasimangia-auth';
export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut' | 'refreshSession'>;

export function signInFailure(error: { code?: string; status?: number; name?: string }): SignInFailure {
  if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid_credentials';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  return 'unknown';
}

const toUser = (user: { id: string; email?: string } | null | undefined): AuthUser | null =>
  user ? { id: user.id, email: user.email ?? '' } : null;

/** Email and password only (spec: link and Google come in wave 3). The library keeps and renews the session. */
export function createSupabaseBackend(
  url: string,
  publishableKey: string,
  deps: { auth?: AuthClient; storage?: Pick<Storage, 'getItem' | 'removeItem'> } = {}
): AuthBackend {
  const storage = deps.storage ?? window.localStorage;
  const auth: AuthClient =
    deps.auth ??
    createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }
    }).auth;

  // Offline with an expired token the library keeps the stored session but reports no session.
  const storedUser = (): AuthUser | null => {
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      return raw ? toUser((JSON.parse(raw) as { user?: { id: string; email?: string } }).user) : null;
    } catch {
      return null;
    }
  };

  return {
    mode: 'supabase',
    async check() {
      const { data, error } = await auth.getSession();
      const user = toUser(data.session?.user);
      if (user) return { status: 'signedIn', user };
      const stored = error && isAuthRetryableFetchError(error) ? storedUser() : null;
      return stored ? { status: 'unverified', user: stored } : { status: 'signedOut' };
    },
    onChange(listener) {
      // No Supabase calls inside the callback: the library holds a lock while it runs.
      const { data } = auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') listener(null);
        else if (session) listener(toUser(session.user));
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await auth.signInWithPassword({ email, password });
      return error ? { ok: false, reason: signInFailure(error) } : { ok: true };
    },
    async signOut() {
      const { error } = await auth.signOut({ scope: 'local' });
      // The library removes the stored session even when it returns an error; make sure of it.
      if (error) {
        for (const key of [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]) {
          try {
            storage.removeItem(key);
          } catch {
            // Storage unavailable: nothing was stored there either.
          }
        }
      }
    },
    async refresh() {
      const { data, error } = await auth.refreshSession();
      return !error && !!data.session;
    },
    async getAccessToken() {
      const { data } = await auth.getSession();
      return data.session?.access_token ?? null;
    }
  };
}
```
Verificare con Context7 che `isAuthRetryableFetchError` e `AuthRetryableFetchError` siano esportati da `@supabase/supabase-js` 2.117 (riesportano `@supabase/auth-js`); in caso contrario confrontare `error.name === 'AuthRetryableFetchError'`.

`web/src/test/stubBackend.ts`:
```ts
import type { AuthBackend, AuthUser, SessionCheck, SignInResult } from '../auth/backend';

/** Controllable backend for tests: identity, check result, sign-in, sign-out and renewal outcomes. */
export function createStubBackend(initial: AuthUser | null, mode: 'fake' | 'supabase' = 'supabase') {
  let current: SessionCheck = initial ? { status: 'signedIn', user: initial } : { status: 'signedOut' };
  const listeners = new Set<(user: AuthUser | null) => void>();
  const backend = {
    mode,
    nextSignIn: { ok: true } as SignInResult,
    signOutCalls: 0,
    signOutError: null as Error | null,
    refreshResult: true,
    refreshCalls: 0,
    setUser(user: AuthUser | null) {
      current = user ? { status: 'signedIn', user } : { status: 'signedOut' };
      listeners.forEach((listener) => listener(user));
    },
    setCheck(next: SessionCheck) {
      current = next;
    },
    check: async () => current,
    onChange(listener: (user: AuthUser | null) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async signIn(email: string) {
      if (backend.nextSignIn.ok) backend.setUser({ id: `user-${email}`, email });
      return backend.nextSignIn;
    },
    async signOut() {
      backend.signOutCalls += 1;
      if (backend.signOutError) throw backend.signOutError;
      backend.setUser(null);
    },
    async refresh() {
      backend.refreshCalls += 1;
      return backend.refreshResult;
    },
    getAccessToken: async () => (current.status === 'signedOut' ? null : 'token')
  } satisfies AuthBackend & Record<string, unknown>;
  return backend;
}
```

- [ ] **Step 4: Implementa lo stato dell'accesso**

`web/src/auth/AuthProvider.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { subscribeConnectivity } from '../lib/connectivity';
import type { AuthBackend, AuthUser, SessionCheck } from './backend';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser; verified: boolean };

interface AuthContextValue { state: AuthState; backend: AuthBackend; markSignedOut: () => void }
const AuthContext = createContext<AuthContextValue | null>(null);

const fromCheck = (check: SessionCheck): AuthState =>
  check.status === 'signedOut' ? { status: 'signedOut' } : { status: 'signedIn', user: check.user, verified: check.status === 'signedIn' };

export function AuthProvider({ backend, children }: { backend: AuthBackend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // Token refreshes repeat the same user: keep the state object so nothing re-renders.
  const apply = useCallback(
    (next: AuthState) =>
      setState((previous) =>
        previous.status === 'signedIn' && next.status === 'signedIn' && previous.user.id === next.user.id && previous.verified === next.verified ? previous : next
      ),
    []
  );

  useEffect(() => {
    let active = true;
    void backend.check().then((check) => active && apply(fromCheck(check)));
    const unsubscribe = backend.onChange((user) => apply(user ? { status: 'signedIn', user, verified: true } : { status: 'signedOut' }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend, apply]);

  // An unverified session is checked again when the network comes back; a refusal ends it.
  const unverified = state.status === 'signedIn' && !state.verified;
  useEffect(() => {
    if (!unverified) return;
    return subscribeConnectivity(() => {
      if (navigator.onLine) void backend.check().then((check) => apply(fromCheck(check)));
    });
  }, [unverified, backend, apply]);

  const markSignedOut = useCallback(() => apply({ status: 'signedOut' }), [apply]);
  const value = useMemo(() => ({ state, backend, markSignedOut }), [state, backend, markSignedOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/auth && npm run typecheck`
Expected: PASS; nessun errore di tipi.

- [ ] **Step 6: Commit**

```bash
git add web/src/auth web/src/test/stubBackend.ts
git commit -m "Web: accesso con Supabase o utente demo, uscita locale sicura e sessione non verificabile offline"
```

---

### Task 9: Sessione per utente: chiusura, rifiuti del server e lingua

> Seconda review: nessuna sessione a identità non nota (C1), rinnovo unico con `session.call` e `wrapApi` (C3), canale fra schede e revoca persistita (C4).


**Files:**
- Create: `web/src/session/session.ts`, `web/src/session/localePreference.ts`, `web/src/session/SessionScope.tsx`, `web/src/test/sessionHarness.tsx`
- Test: `web/src/session/session.test.ts`, `web/src/session/SessionScope.test.tsx`

**Interfaces:**
- Consumes: `createQueryClient`, `createPersister`, `persistOptions`, `purgeOtherCopies`, `cacheKey`, `KeyValueStore` (Task 7); `familyOfKey`, `meQuery`, `useQueryDeps` (Task 6); `toApiError`; `ApiProvider`, `Api`; `useAuth`, `AuthUser` (Task 8); `useLocale`, `initialLocale`, `LOCALES`, `Locale` (Task 3); `env.buildVersion`.
- Produces:
  - `interface Session { readonly userId: string | null; readonly queryClient: QueryClient; isClosed(): boolean; close(): Promise<void>; revoke(familyId: string): void; isRevoked(familyId: string): boolean; subscribe(listener: () => void): () => void; revision(): number; track(key: string): number; isLatest(key: string, token: number): boolean; setErrorHandler(handler: ErrorHandler): void }`; `createSession(userId: string | null, store: KeyValueStore): Session`; `persisterOf(session): SessionPersister | null`
  - `type PreferenceScope = 'device' | \`user:${string}\``; `userScope(id)`, `readPreference(scope)`, `writePreference(scope, locale)`, `clearPreference(scope)`
  - `type CreateApi = (user: AuthUser | null, getLocale: () => Locale) => Api`; `<SessionScope store createApi>`
  - `useSession(): Session`, `useSessionRevision(): number`, `useSignOut(): () => Promise<void>`, `useChooseLocale(): (locale: Locale) => void`
  - `renderSession(ui, options)` (test): monta `LocaleProvider`, `AuthProvider`, `SessionScope` con backend, negozio e client dati

**Chiusura della sessione** (spec, Accesso e sessione; review, rilievo 1): `close()` rende la sessione inerte (le risposte arrivate dopo si scartano), annulla le richieste, svuota cache e mutazioni, chiude il persister (che cancella la copia dopo le scritture già partite) e cancella la scelta di lingua dell'utente. La usano «Esci», l'evento di uscita da un'altra scheda e ogni cambio d'utente. `SessionScope` la chiama quando la sessione mostrata cambia, mai nella pulizia di un effetto, così lo `StrictMode` di sviluppo non chiude una sessione viva.

- [ ] **Step 1: Scrivi i test dell'oggetto sessione che falliscono**

`web/src/session/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cacheKey, createMemoryStore } from '../api/persister';
import { queryKeys } from '../api/queries';
import { createSession, persisterOf } from './session';
import { readPreference, userScope, writePreference } from './localePreference';

describe('session', () => {
  it('closes once: clears the cache, deletes the stored copy and the language choice', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), { timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } });
    writePreference(userScope('a'), 'en-GB');
    const session = createSession('a', store);
    session.queryClient.setQueryData(queryKeys.me('it-IT'), { version: 'v', data: 'me' });
    await session.close();
    await session.close();
    expect(session.isClosed()).toBe(true);
    expect(session.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(store.entries.has(cacheKey('a'))).toBe(false);
    expect(readPreference(userScope('a'))).toBeNull();
    expect(await persisterOf(session)?.restoreClient()).toBeUndefined();
  });
  it('revokes a family: its views leave the cache, the others stay', () => {
    const session = createSession('a', createMemoryStore());
    session.queryClient.setQueryData(queryKeys.week('f1', '2026-10-05', 'it-IT'), { version: 'v', data: 1 });
    session.queryClient.setQueryData(queryKeys.week('f2', '2026-10-05', 'it-IT'), { version: 'v', data: 2 });
    const before = session.revision();
    session.revoke('f1');
    expect(session.isRevoked('f1')).toBe(true);
    expect(session.revision()).toBeGreaterThan(before);
    expect(session.queryClient.getQueryData(queryKeys.week('f1', '2026-10-05', 'it-IT'))).toBeUndefined();
    expect(session.queryClient.getQueryData(queryKeys.week('f2', '2026-10-05', 'it-IT'))).toBeDefined();
  });
  it('remembers only the latest request per object', () => {
    const session = createSession('a', createMemoryStore());
    const first = session.track('rating:r1');
    const second = session.track('rating:r1');
    const other = session.track('rating:r2');
    expect(session.isLatest('rating:r1', first)).toBe(false);
    expect(session.isLatest('rating:r1', second)).toBe(true);
    expect(session.isLatest('rating:r2', other)).toBe(true);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/session/session.test.ts`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa sessione e preferenze di lingua**

`web/src/session/localePreference.ts`:
```ts
import { LOCALES, type Locale } from '../i18n/translate';

/** device: fake mode only. user:<id>: temporary choice of a signed-in person until the profile can be saved. */
export type PreferenceScope = 'device' | `user:${string}`;

export const userScope = (id: string): PreferenceScope => `user:${id}`;
const keyOf = (scope: PreferenceScope) => `locale:${scope}`;

// Storage may be unavailable (private mode): the choice then lasts only for the page.
export function readPreference(scope: PreferenceScope): Locale | null {
  try {
    const value = localStorage.getItem(keyOf(scope));
    return LOCALES.includes(value as Locale) ? (value as Locale) : null;
  } catch {
    return null;
  }
}

export function writePreference(scope: PreferenceScope, locale: Locale): void {
  try {
    localStorage.setItem(keyOf(scope), locale);
  } catch {
    // Not stored; still applied.
  }
}

export function clearPreference(scope: PreferenceScope): void {
  try {
    localStorage.removeItem(keyOf(scope));
  } catch {
    // Nothing stored.
  }
}
```

`web/src/session/session.ts`:
```ts
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { createPersister, createQueryClient, type KeyValueStore, type SessionPersister } from '../api/persister';
import { familyOfKey } from '../api/queries';
import { clearPreference, userScope } from './localePreference';

export type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void;

export interface Session {
  readonly userId: string | null;
  readonly queryClient: QueryClient;
  isClosed(): boolean;
  close(): Promise<void>;
  revoke(familyId: string): void;
  isRevoked(familyId: string): boolean;
  subscribe(listener: () => void): () => void;
  revision(): number;
  track(key: string): number;
  isLatest(key: string, token: number): boolean;
  setErrorHandler(handler: ErrorHandler): void;
}

const persisters = new WeakMap<Session, SessionPersister>();

export function persisterOf(session: Session): SessionPersister | null {
  return persisters.get(session) ?? null;
}

/** Everything one signed-in person has on this device; closing it leaves nothing behind. */
export function createSession(userId: string | null, store: KeyValueStore): Session {
  let closed = false;
  let handler: ErrorHandler = () => {};
  let rev = 0;
  const revoked = new Set<string>();
  const listeners = new Set<() => void>();
  const requests = new Map<string, number>();
  const queryClient = createQueryClient({ onError: (error, scope) => !closed && handler(error, scope) });
  const persister = userId ? createPersister(store, userId) : null;
  const changed = () => {
    rev += 1;
    listeners.forEach((listener) => listener());
  };

  const session: Session = {
    userId,
    queryClient,
    isClosed: () => closed,
    async close() {
      if (closed) return;
      closed = true;
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.getMutationCache().clear();
      if (userId) clearPreference(userScope(userId));
      await persister?.close();
      changed();
    },
    revoke(familyId) {
      revoked.add(familyId);
      queryClient.removeQueries({ predicate: (query) => familyOfKey(query.queryKey) === familyId });
      changed();
    },
    isRevoked: (familyId) => revoked.has(familyId),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    revision: () => rev,
    track(key) {
      const token = (requests.get(key) ?? 0) + 1;
      requests.set(key, token);
      return token;
    },
    isLatest: (key, token) => requests.get(key) === token,
    setErrorHandler(next) {
      handler = next;
    }
  };
  if (persister) persisters.set(session, persister);
  return session;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/session/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Scrivi i test della sessione nell'app che falliscono**

`web/src/test/sessionHarness.tsx`:
```tsx
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createFakeApi } from '../api/fake/fakeApi';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import type { Api } from '../api/types';
import type { AuthBackend } from '../auth/backend';
import { AuthProvider } from '../auth/AuthProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import { SessionScope, type CreateApi } from '../session/SessionScope';

export function renderSession(ui: ReactNode, options: { backend: AuthBackend; store?: KeyValueStore; api?: (user: string | null) => Api; locale?: Locale }) {
  const store = options.store ?? createMemoryStore();
  const createApi: CreateApi = options.api
    ? (user) => options.api!(user?.id ?? null)
    : (user, getLocale) => createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 0 });
  const result = render(
    <LocaleProvider initial={options.locale ?? 'it-IT'}>
      <AuthProvider backend={options.backend}>
        <SessionScope store={store} createApi={createApi}>{ui}</SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
  return { ...result, store };
}
```

`web/src/session/SessionScope.test.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { cacheKey, createMemoryStore } from '../api/persister';
import { meQuery, useQueryDeps, weekQuery } from '../api/queries';
import type { Api, MeView, Read, WeekView } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useLocale } from '../i18n/LocaleProvider';
import { createStubBackend } from '../test/stubBackend';
import { renderSession } from '../test/sessionHarness';
import { readPreference, userScope, writePreference } from './localePreference';
import { useChooseLocale, useSession, useSessionRevision, useSignOut } from './SessionScope';

const A = { id: 'a', email: 'a@example.com' };
const B = { id: 'b', email: 'b@example.com' };

const meOf = (id: string | null, locale: 'it-IT' | 'en-GB' = 'it-IT'): Read<MeView> => ({
  unchanged: false,
  version: `me:${id}`,
  data: { user: { id: id ?? 'anon', displayName: (id ?? 'anon').toUpperCase(), email: '', locale }, families: [], currentFamilyId: null }
});

/** Fake data client whose profile read can be replaced per user. */
function api(me: (id: string | null) => Promise<Read<MeView>>) {
  return (id: string | null) => {
    const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    return { ...base, me: { get: () => me(id) } } as Api;
  };
}

function Probe() {
  const { state } = useAuth();
  const me = useQuery({ ...meQuery(useQueryDeps()), enabled: state.status === 'signedIn' });
  const signOut = useSignOut();
  const choose = useChooseLocale();
  const { locale } = useLocale();
  return (
    <>
      <p>auth: {state.status}</p>
      <p>name: {me.data?.user.displayName ?? '-'}</p>
      <p>locale: {locale}</p>
      <button onClick={() => void signOut()}>out</button>
      <button onClick={() => choose('en-GB')}>english</button>
    </>
  );
}

describe('closing the session', () => {
  it('cleans up locally on sign-out even when the service fails, and nothing comes back on reopening', async () => {
    const backend = createStubBackend(A);
    backend.signOutError = new Error('offline');
    const { store, unmount } = renderSession(<Probe />, { backend, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: A');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));
    fireEvent.click(screen.getByText('out'));
    await screen.findByText('auth: signedOut');
    expect(store.entries.has(cacheKey('a'))).toBe(false);
    unmount();
    // Reopen as A without network: no stored copy to restore.
    const reopened = createStubBackend(A);
    renderSession(<Probe />, { backend: reopened, store, api: api(() => new Promise(() => {})) });
    await screen.findByText('auth: signedIn');
    expect(screen.getByText('name: -')).toBeTruthy();
  });
  it('closes the session when another tab signs out', async () => {
    const backend = createStubBackend(A);
    const { store } = renderSession(<Probe />, { backend, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: A');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));
    act(() => backend.setUser(null));
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
    expect(screen.queryByText('name: A')).toBeNull();
  });
  it('drops answers still pending when the user changes and keeps only the new user on disk', async () => {
    let releaseA: (value: Read<MeView>) => void = () => {};
    const backend = createStubBackend(A);
    const { store } = renderSession(<Probe />, {
      backend,
      api: api((id) => (id === 'a' ? new Promise((resolve) => (releaseA = resolve)) : Promise.resolve(meOf(id))))
    });
    await screen.findByText('auth: signedIn');
    act(() => backend.setUser(B));
    await screen.findByText('name: B');
    await act(async () => releaseA(meOf('a')));
    expect(screen.queryByText('name: A')).toBeNull();
    await waitFor(() => expect([...store.entries.keys()]).toEqual([cacheKey('b')]));
  });
  it('removes copies of other users when it starts', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('old'), {});
    renderSession(<Probe />, { backend: createStubBackend(B), store, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: B');
    await waitFor(() => expect(store.entries.has(cacheKey('old'))).toBe(false));
  });
});

describe('access refused by the server', () => {
  it('renews the session once on unauthorized and reads again', async () => {
    const backend = createStubBackend(A);
    let calls = 0;
    renderSession(<Probe />, { backend, api: api(async (id) => (calls++ === 0 ? Promise.reject(new ApiError('unauthorized')) : meOf(id))) });
    await screen.findByText('name: A');
    expect(backend.refreshCalls).toBe(1);
    expect(backend.signOutCalls).toBe(0);
  });
  it('signs out when the renewal is refused', async () => {
    const backend = createStubBackend(A);
    backend.refreshResult = false;
    const { store } = renderSession(<Probe />, { backend, api: api(() => Promise.reject(new ApiError('unauthorized'))) });
    await screen.findByText('auth: signedOut');
    expect(backend.signOutCalls).toBe(1);
    expect(store.entries.has(cacheKey('a'))).toBe(false);
  });
  it('signs out when the server refuses again after a renewal', async () => {
    const backend = createStubBackend(A);
    renderSession(<Probe />, { backend, api: api(() => Promise.reject(new ApiError('unauthorized'))) });
    await screen.findByText('auth: signedOut');
    expect(backend.refreshCalls).toBe(1);
  });
  it('removes a forbidden family from memory and disk, also after reopening', async () => {
    const week = { startsOn: '2026-10-05', days: [] } as WeekView;
    let refuse = false;
    const familyApi = (id: string | null) => {
      const base = api(async () => meOf(id))(id);
      return { ...base, menu: { ...base.menu, getWeek: async () => (refuse ? Promise.reject(new ApiError('forbidden')) : { unchanged: false as const, version: 'w1', data: week }) } };
    };
    function WeekProbe({ enabled = true }: { enabled?: boolean }) {
      const session = useSession();
      useSessionRevision();
      // Like the real screens behind FamilyGate: no reads for a revoked family.
      const query = useQuery({ ...weekQuery(useQueryDeps(), 'f', '2026-10-05'), enabled: enabled && !session.isRevoked('f') });
      return (
        <>
          <p>week: {query.data ? 'shown' : 'none'}</p>
          <p>{session.isRevoked('f') ? 'revoked' : 'allowed'}</p>
          <button onClick={() => void query.refetch()}>reload</button>
        </>
      );
    }
    const backend = createStubBackend(A);
    const { store, unmount } = renderSession(<WeekProbe />, { backend, api: familyApi });
    await screen.findByText('week: shown');
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey('a')) ?? '')).toContain('getWeek'));
    refuse = true;
    fireEvent.click(screen.getByText('reload'));
    await screen.findByText('revoked');
    expect(screen.getByText('week: none')).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey('a')) ?? '')).not.toContain('getWeek'));
    unmount();
    renderSession(<WeekProbe enabled={false} />, { backend: createStubBackend(A), store, api: familyApi });
    await screen.findByText('allowed');
    expect(screen.getByText('week: none')).toBeTruthy();
  });
});

describe('language', () => {
  it('applies the profile language at each identity, forgetting the previous person\'s choice', async () => {
    const backend = createStubBackend(A);
    renderSession(<Probe />, { backend, api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('name: A');
    fireEvent.click(screen.getByText('english'));
    await screen.findByText('locale: en-GB');
    expect(readPreference(userScope('a'))).toBe('en-GB');
    fireEvent.click(screen.getByText('out'));
    await screen.findByText('auth: signedOut');
    expect(readPreference(userScope('a'))).toBeNull();
    act(() => backend.setUser(B));
    await screen.findByText('name: B');
    await screen.findByText('locale: it-IT');
  });
  it('ignores a device preference when a real profile exists, and uses it in fake mode', async () => {
    writePreference('device', 'en-GB');
    const real = renderSession(<Probe />, { backend: createStubBackend(B), api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('name: B');
    await screen.findByText('locale: it-IT');
    real.unmount();
    renderSession(<Probe />, { backend: createStubBackend(B, 'fake'), api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('locale: en-GB');
  });
  it('never shows an answer in the previous language after a switch', async () => {
    let releaseItalian: (value: Read<WeekView>) => void = () => {};
    const weekIn = (label: string) => ({ startsOn: label, days: [] }) as WeekView;
    // Fake mode: no profile language to re-apply after the switch.
    const backend = createStubBackend(A, 'fake');
    function LanguageProbe() {
      const { setLocale } = useLocale();
      const week = useQuery(weekQuery(useQueryDeps(), 'f', '2026-10-05'));
      return <><p>week: {week.data?.startsOn ?? '-'}</p><button onClick={() => setLocale('en-GB')}>switch</button></>;
    }
    renderSession(<LanguageProbe />, {
      backend,
      locale: 'it-IT',
      api: (id) => {
        const base = api(async () => meOf(id))(id);
        let call = 0;
        return { ...base, menu: { ...base.menu, getWeek: () => (call++ === 0 ? new Promise((resolve) => (releaseItalian = resolve)) : Promise.resolve({ unchanged: false as const, version: 'en', data: weekIn('english') })) } };
      }
    });
    await screen.findByText('week: -');
    fireEvent.click(screen.getByText('switch'));
    await screen.findByText('week: english');
    await act(async () => releaseItalian({ unchanged: false, version: 'it', data: weekIn('italiano') }));
    expect(screen.queryByText('week: italiano')).toBeNull();
  });
});
```
Nota sul test «never shows…»: `renderSession` crea il client dati una volta per utente, quindi il contatore `call` vale per tutta la sessione.

- [ ] **Step 6: Verifica che falliscano**

Run: `cd web && npx vitest run src/session/SessionScope.test.tsx`
Expected: FAIL, `Failed to resolve import "./SessionScope"`.

- [ ] **Step 7: Implementa `SessionScope`**

`web/src/session/SessionScope.tsx`:
```tsx
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { toApiError } from '../api/errors';
import { persistOptions, purgeOtherCopies, type KeyValueStore } from '../api/persister';
import { meQuery, useQueryDeps } from '../api/queries';
import type { Api } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import type { AuthUser } from '../auth/backend';
import { env } from '../env';
import { useLocale } from '../i18n/LocaleProvider';
import { initialLocale, type Locale } from '../i18n/translate';
import { readPreference, userScope, writePreference } from './localePreference';
import { createSession, persisterOf, type Session } from './session';

export type CreateApi = (user: AuthUser | null, getLocale: () => Locale) => Api;

interface SessionContextValue {
  session: Session;
  signOut: () => Promise<void>;
  chooseLocale: (locale: Locale) => void;
}
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionScope({ store, createApi, children }: { store: KeyValueStore; createApi: CreateApi; children: ReactNode }) {
  const { state, backend, markSignedOut } = useAuth();
  const user = state.status === 'signedIn' ? state.user : null;
  const userId = user?.id ?? null;
  const { locale, setLocale } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const session = useMemo(() => createSession(userId, store), [userId, store]);
  // The data client depends on the user only; the language is read at each call.
  const api = useMemo(() => createApi(user, () => localeRef.current), [userId, createApi]);

  // One closing procedure for sign-out, sign-out elsewhere and change of user. Never in an
  // effect cleanup: StrictMode re-runs effects and would close a live session.
  const shown = useRef<Session | null>(null);
  useEffect(() => {
    const previous = shown.current;
    shown.current = session;
    if (previous && previous !== session) void previous.close();
    void purgeOtherCopies(store, userId);
  }, [session, store, userId]);

  const signOut = useCallback(async () => {
    await session.close();
    try {
      await backend.signOut();
    } catch {
      // Local data are already gone; the session is over on this device anyway.
    }
    markSignedOut();
  }, [session, backend, markSignedOut]);

  // Refusals from the server: unauthorized → one renewal, then sign-in; forbidden → drop the family.
  useEffect(() => {
    let recovering = false;
    const recover = async () => {
      if (recovering) return void signOut();
      recovering = true;
      const renewed = await backend.refresh().catch(() => false);
      if (!renewed || session.isClosed()) return void signOut();
      await session.queryClient.refetchQueries({ type: 'active' });
      recovering = false;
    };
    session.setErrorHandler((error, scope) => {
      const code = toApiError(error).code;
      if (code === 'unauthorized') void recover();
      if (code === 'forbidden' && scope.familyId) {
        session.revoke(scope.familyId);
        void session.queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    });
  }, [session, backend, signOut]);

  // Which language applies (spec, Lingua): device in fake mode, browser without a session,
  // otherwise the person's temporary choice or, once read, the profile language.
  useEffect(() => {
    if (backend.mode === 'fake') {
      const device = readPreference('device');
      if (device) setLocale(device);
    } else if (!userId) {
      setLocale(initialLocale(navigator.languages));
    } else {
      const chosen = readPreference(userScope(userId));
      if (chosen) setLocale(chosen);
    }
  }, [userId, backend.mode, setLocale]);

  const chooseLocale = useCallback(
    (next: Locale) => {
      setLocale(next);
      if (backend.mode === 'fake') writePreference('device', next);
      else if (userId) writePreference(userScope(userId), next);
    },
    [backend.mode, userId, setLocale]
  );

  const value = useMemo(() => ({ session, signOut, chooseLocale }), [session, signOut, chooseLocale]);
  const content = (
    <ApiProvider api={api}>
      <SessionContext.Provider value={value}>
        {backend.mode === 'supabase' && userId && <ProfileLocale userId={userId} />}
        {children}
      </SessionContext.Provider>
    </ApiProvider>
  );
  const persister = persisterOf(session);
  if (!persister) return <QueryClientProvider client={session.queryClient}>{content}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider key={userId} client={session.queryClient} persistOptions={persistOptions(persister, env.buildVersion)}>
      {content}
    </PersistQueryClientProvider>
  );
}

/** At each identity the profile language applies, unless this person chose another one meanwhile. */
function ProfileLocale({ userId }: { userId: string }) {
  const me = useQuery(meQuery(useQueryDeps()));
  const { setLocale } = useLocale();
  const profileLocale = me.data?.user.id === userId ? me.data.user.locale : undefined;
  useEffect(() => {
    if (profileLocale && !readPreference(userScope(userId))) setLocale(profileLocale);
  }, [profileLocale, userId, setLocale]);
  return null;
}

function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('session hooks outside SessionScope');
  return value;
}

export const useSession = () => useSessionContext().session;
export const useSignOut = () => useSessionContext().signOut;
export const useChooseLocale = () => useSessionContext().chooseLocale;

/** Re-renders when the session changes state (revoked family, closing). */
export function useSessionRevision(): number {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.revision, session.revision);
}
```

- [ ] **Step 8: Verifica che passino**

Run: `cd web && npx vitest run src/session && npm run typecheck`
Expected: PASS. Se il test «drops answers still pending» trova `name: A` per un istante, controllare che `Probe` legga la query dal `QueryClient` della nuova sessione (`useQueryDeps` dentro `SessionScope`) e non da quello vecchio.

- [ ] **Step 9: Commit**

```bash
git add web/src/session web/src/test/sessionHarness.tsx
git commit -m "Web: sessione per utente con chiusura unica, rifiuti del server gestiti e lingua per identità"
```

---

### Task 10: Rotte, guardia, layout, stato della famiglia e componenti di base

**Files:**
- Create: `web/src/routes/search.ts`, `web/src/router.tsx`, `web/src/routes/AppLayout.tsx`, `web/src/routes/NotFound.tsx`, `web/src/routes/RouteError.tsx`, `web/src/routes/menu/lastDay.ts`, `web/src/session/useFamily.ts`, `web/src/components/Icon.tsx`, `web/src/components/BottomNav.tsx`, `web/src/components/StateNotice.tsx`, `web/src/components/PageHeader.tsx`, `web/src/components/OfflineBanner.tsx`, `web/src/components/Loading.tsx`, `web/src/components/QueryError.tsx`, `web/src/components/FamilyGate.tsx`, segnaposto `web/src/routes/MenuPage.tsx`, `RecipesPage.tsx`, `RecipePage.tsx`, `ProfilePage.tsx`, `web/src/auth/LoginPage.tsx` (segnaposto), `web/src/test/renderApp.tsx`, `web/src/test/renderWithProviders.tsx`, `web/src/test/browserLanguages.ts`
- Modify: `web/src/App.tsx` (sostituito), `web/src/main.tsx`, `web/src/design/global.css` (in fondo), `web/src/test/setup.ts`
- Delete: `web/src/App.test.tsx`
- Test: `web/src/routes/search.test.ts`, `web/src/router.test.tsx`, `web/src/components/FamilyGate.test.tsx`

**Interfaces:**
- Consumes: tutto dai Task 2-9.
- Produces:
  - da `src/routes/search.ts`: `MenuSearch { day?: IsoDate }`, `RecipesSearch { q?: string; meal?: MealType; time?: number; group?: ProteinGroup; rating?: number; sort?: 'rating' | 'added' | 'lastEaten'; dir?: 'reverse' }`, `RecipeSearch { servings?: number; from?: 'menu' | 'recipes'; day?: IsoDate; slot?: string }`, `LoginSearch { redirect?: string }`; `validateMenuSearch`, `validateRecipesSearch`, `validateRecipeSearch`, `validateLoginSearch` (tutte `(raw: Record<string, unknown>) => …Search`); `toRecipeQuery(search: RecipesSearch): RecipeQuery`; `toRecipesSearch(query: RecipeQuery): RecipesSearch`
  - id delle rotte per `getRouteApi`: `'/login'`, `'/_app/menu'`, `'/_app/recipes'`, `'/_app/recipes/$recipeId'`, `'/_app/profile'`
  - `createAppRouter(history?: RouterHistory)`; `interface RouterContext { auth: AuthState }`
  - `<AppRoot backend store createApi history? initialLocale?>` da `src/App.tsx`
  - `type FamilyState = { status: 'loading' } | { status: 'error'; error: unknown; retry: () => void } | { status: 'none' } | { status: 'revoked' } | { status: 'ready'; family: FamilyView; me: MeView }`; `useFamily(): FamilyState`; `useMe()`: la query del profilo
  - `<FamilyGate>{(family: FamilyView) => ReactNode}</FamilyGate>`; `<QueryError error onRetry>`
  - `rememberMenuDay(day: IsoDate | undefined): void`, `rememberedMenuDay(): IsoDate | undefined`
  - `type IconName = 'arrow' | 'clock' | 'calendar' | 'book' | 'bag' | 'user' | 'star' | 'chevron-left' | 'chevron-right' | 'recipe' | 'list' | 'filter' | 'sort' | 'users' | 'gear' | 'ban'`; `<Icon name className?>`
  - `<StateNotice title body? children?>`, `<PageHeader back={ReactNode} title={ReactNode} titleId?>`, `<OfflineBanner>`, `<Loading>`, `<BottomNav>`
  - `renderApp(path: string, options?: { backend?: AuthBackend; api?: Api; locale?: Locale; store?: KeyValueStore }): RenderResult & { history: RouterHistory }`
  - `renderWithProviders(ui: ReactNode, options?: { api?: Api; locale?: Locale; backend?: AuthBackend }): RenderResult & { queryClient(): QueryClient; session(): Session }` (con la stessa sessione dell'app)

- [ ] **Step 1: Scrivi i test dei parametri che falliscono**

`web/src/routes/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toRecipeQuery, toRecipesSearch, validateLoginSearch, validateMenuSearch, validateRecipeSearch, validateRecipesSearch } from './search';

describe('search params', () => {
  it('keeps only real days for the menu', () => {
    expect(validateMenuSearch({ day: '2026-10-06' })).toEqual({ day: '2026-10-06' });
    expect(validateMenuSearch({ day: '2026-02-30' })).toEqual({});
    expect(validateMenuSearch({ day: 20261006 })).toEqual({});
  });
  it('validates catalogue filters, accepting numbers parsed as text or numbers', () => {
    expect(validateRecipesSearch({ q: ' riso ', meal: 'lunch', time: '30', group: 'fish', rating: 4, sort: 'rating', dir: 'reverse' }))
      .toEqual({ q: ' riso ', meal: 'lunch', time: 30, group: 'fish', rating: 4, sort: 'rating', dir: 'reverse' });
    expect(validateRecipesSearch({ meal: 'brunch', time: -5, group: 'pizza', rating: 9, sort: 'price', dir: 'up', q: '' })).toEqual({});
  });
  it('maps between URL and query', () => {
    const search = { q: 'riso', time: 30, sort: 'added', dir: 'reverse' } as const;
    expect(toRecipeQuery(search)).toEqual({ text: 'riso', maxMinutes: 30, sort: 'added', reversed: true });
    expect(toRecipesSearch(toRecipeQuery(search))).toEqual(search);
  });
  it('validates the recipe page', () => {
    expect(validateRecipeSearch({ servings: '3', from: 'menu', day: '2026-10-06', slot: '2026-10-06-dinner' }))
      .toEqual({ servings: 3, from: 'menu', day: '2026-10-06', slot: '2026-10-06-dinner' });
    expect(validateRecipeSearch({ servings: 0, from: 'elsewhere', day: 'x', slot: '<script>' })).toEqual({});
    expect(validateRecipeSearch({ servings: 51 })).toEqual({});
  });
  it('accepts only local redirects after sign-in', () => {
    expect(validateLoginSearch({ redirect: '/recipes?q=riso' })).toEqual({ redirect: '/recipes?q=riso' });
    expect(validateLoginSearch({ redirect: '//evil.example' })).toEqual({});
    expect(validateLoginSearch({ redirect: 'https://evil.example' })).toEqual({});
    expect(validateLoginSearch({ redirect: '/login' })).toEqual({});
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/search.test.ts`
Expected: FAIL, `Failed to resolve import "./search"`.

- [ ] **Step 3: Implementa i parametri**

`web/src/routes/search.ts`:
```ts
import { PROTEIN_GROUPS, type ProteinGroup, type RecipeQuery } from '../api/types';
import { isIsoDate, type IsoDate, type MealType } from '../lib/calendar';

// TanStack Router parses search values as JSON: numbers may arrive as numbers or strings.
export interface MenuSearch { day?: IsoDate }
export interface RecipesSearch {
  q?: string; meal?: MealType; time?: number; group?: ProteinGroup; rating?: number;
  sort?: 'rating' | 'added' | 'lastEaten'; dir?: 'reverse';
}
export interface RecipeSearch { servings?: number; from?: 'menu' | 'recipes'; day?: IsoDate; slot?: string }
export interface LoginSearch { redirect?: string }

const SORTS = ['rating', 'added', 'lastEaten'] as const;
const MEALS = ['lunch', 'dinner'] as const;

function positiveInt(value: unknown, max: number): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
}
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.includes(value as T) ? (value as T) : undefined;
// Drops undefined fields so URLs and comparisons stay clean.
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

export function validateMenuSearch(raw: Record<string, unknown>): MenuSearch {
  return isIsoDate(raw.day) ? { day: raw.day } : {};
}

export function validateRecipesSearch(raw: Record<string, unknown>): RecipesSearch {
  return compact({
    q: typeof raw.q === 'string' && raw.q !== '' ? raw.q : undefined,
    meal: oneOf(MEALS, raw.meal),
    time: positiveInt(raw.time, 600),
    group: oneOf(PROTEIN_GROUPS, raw.group),
    rating: positiveInt(raw.rating, 5),
    sort: oneOf(SORTS, raw.sort),
    dir: raw.dir === 'reverse' ? ('reverse' as const) : undefined
  });
}

export function validateRecipeSearch(raw: Record<string, unknown>): RecipeSearch {
  return compact({
    servings: positiveInt(raw.servings, 50),
    from: oneOf(['menu', 'recipes'] as const, raw.from),
    day: isIsoDate(raw.day) ? raw.day : undefined,
    // Meal the recipe was opened from: the hook for past versions (spec R1, wave 2).
    slot: typeof raw.slot === 'string' && /^[\w-]{1,80}$/.test(raw.slot) ? raw.slot : undefined
  });
}

export function validateLoginSearch(raw: Record<string, unknown>): LoginSearch {
  const target = raw.redirect;
  const local = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login');
  return local ? { redirect: target } : {};
}

export function toRecipeQuery(search: RecipesSearch): RecipeQuery {
  return compact({
    text: search.q, mealType: search.meal, maxMinutes: search.time, proteinGroup: search.group,
    minStars: search.rating, sort: search.sort, reversed: search.dir === 'reverse' ? true : undefined
  });
}

export function toRecipesSearch(query: RecipeQuery): RecipesSearch {
  return compact({
    q: query.text || undefined, meal: query.mealType, time: query.maxMinutes, group: query.proteinGroup,
    rating: query.minStars, sort: query.sort === 'name' ? undefined : query.sort,
    dir: query.reversed ? ('reverse' as const) : undefined
  });
}
```

Run: `cd web && npx vitest run src/routes/search.test.ts`
Expected: PASS.

- [ ] **Step 4: Scrivi i test delle rotte che falliscono**

`web/src/router.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeBackend } from './auth/backend';
import { createStubBackend } from './test/stubBackend';
import { renderApp } from './test/renderApp';

describe('routes', () => {
  it('sends signed-out people to the sign-in page, keeping the destination', async () => {
    const { history } = renderApp('/recipes?q=riso', { backend: createStubBackend(null) });
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain('redirect');
    expect(screen.queryByRole('navigation', { name: 'Navigazione principale' })).toBeNull();
  });
  it('opens the menu from the root', async () => {
    const { history } = renderApp('/');
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });
  it('skips the sign-in page in fake mode', async () => {
    const { history } = renderApp('/login', { backend: createFakeBackend() });
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });
  it('shows a not found page for unknown paths', async () => {
    renderApp('/nope');
    expect(await screen.findByText('Contenuto non trovato')).toBeTruthy();
  });
  it('has an icon navbar with accessible names and the current view marked', async () => {
    renderApp('/recipes');
    const nav = await screen.findByRole('navigation', { name: 'Navigazione principale' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Menu', 'Ricettario', 'Profilo']);
    expect(links[1]?.getAttribute('aria-current')).toBe('page');
    expect(links[0]?.getAttribute('aria-current')).toBeNull();
  });
});
```

- [ ] **Step 5: Verifica che falliscano**

Run: `cd web && npx vitest run src/router.test.tsx`
Expected: FAIL, `Failed to resolve import "./test/renderApp"`.

- [ ] **Step 6: Componenti di base**

`web/src/components/Icon.tsx` (tracciati da `prototype/src/lib/components/IconLibrary.svelte`):
```tsx
import type { ReactNode } from 'react';

export type IconName = 'arrow' | 'clock' | 'calendar' | 'book' | 'bag' | 'user' | 'star' | 'chevron-left' | 'chevron-right' | 'recipe' | 'list' | 'filter' | 'sort' | 'users' | 'gear' | 'ban';

const PATHS: Record<IconName, ReactNode> = {
  arrow: <path d="M5 19 19 5M5 5h14v14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  calendar: <path d="M3 5h18v16H3ZM3 10h18M8 2v6M16 2v6M7 14h3M14 14h3M7 18h3" />,
  book: <path d="M12 5v16M12 5C8 2 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-6-2-10 1Z" />,
  bag: <path d="M4 7h16l1 14H3ZM8 8V6a4 4 0 0 1 8 0v2" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  recipe: <path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 13h7M9 17h5" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  sort: <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.8 5.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>
};

/** Decorative: the control around it always carries the accessible name. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
```

`web/src/components/StateNotice.tsx`:
```tsx
import type { ReactNode } from 'react';

export function StateNotice({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <section className="state-notice" role="status">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children}
    </section>
  );
}
```

`web/src/components/PageHeader.tsx`:
```tsx
import type { ReactNode } from 'react';

/** Secondary page header (round 3 pattern): back link with the destination name, then the title (text or link). */
export function PageHeader({ back, title, titleId }: { back: ReactNode; title: ReactNode; titleId?: string }) {
  return (
    <header className="page-header">
      {back}
      <h1 className="page-title" id={titleId}>{title}</h1>
    </header>
  );
}
```

`web/src/components/OfflineBanner.tsx`:
```tsx
import { useSyncExternalStore } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { isOnline, subscribeConnectivity } from '../lib/connectivity';

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}

export function OfflineBanner() {
  const t = useT();
  return useOnline() ? null : <p className="offline-banner" role="status">{t('offline.banner')}</p>;
}
```

`web/src/components/Loading.tsx`:
```tsx
import { useT } from '../i18n/LocaleProvider';

export function Loading() {
  const t = useT();
  return <p className="loading" role="status">{t('common.loading')}</p>;
}
```

`web/src/components/QueryError.tsx`:
```tsx
import { errorKey } from '../api/errors';
import { useT } from '../i18n/LocaleProvider';
import { StateNotice } from './StateNotice';

/** A failed read with a way out: «Riprova» repeats it (review, finding 9). */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  return (
    <StateNotice title={t(errorKey(error))}>
      <button type="button" className="text-button" onClick={onRetry}>{t('common.retry')}</button>
    </StateNotice>
  );
}
```

`web/src/routes/menu/lastDay.ts`:
```ts
import type { IsoDate } from '../../lib/calendar';

// The day shown in the menu survives a trip to another view (design.md, navigation).
let lastDay: IsoDate | undefined;

export function rememberMenuDay(day: IsoDate | undefined): void {
  lastDay = day;
}

export function rememberedMenuDay(): IsoDate | undefined {
  return lastDay;
}
```

`web/src/components/BottomNav.tsx`:
```tsx
import { Link, useLocation } from '@tanstack/react-router';
import { useT } from '../i18n/LocaleProvider';
import { rememberedMenuDay } from '../routes/menu/lastDay';
import { Icon } from './Icon';

export function BottomNav() {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  // A tap on Menu while the menu is open goes back to the opening day; from elsewhere it keeps the day.
  const day = pathname === '/menu' ? undefined : rememberedMenuDay();
  return (
    <nav className="bottom-navigation" aria-label={t('nav.main')}>
      <Link to="/menu" search={day ? { day } : {}} className="navigation-item" aria-label={t('nav.menu')} activeOptions={{ includeSearch: false }}>
        <span className="navigation-icon"><Icon name="calendar" /></span>
      </Link>
      <Link to="/recipes" className="navigation-item" aria-label={t('nav.recipes')} activeOptions={{ includeSearch: false }}>
        <span className="navigation-icon"><Icon name="book" /></span>
      </Link>
      <Link to="/profile" className="navigation-item" aria-label={t('nav.profile')}>
        <span className="navigation-icon"><Icon name="user" /></span>
      </Link>
    </nav>
  );
}
```
Verificare con Context7 (`/tanstack/router`, «Link active state aria-current») che `Link` imposti `aria-current="page"` quando è attivo; se non lo fa, aggiungere `activeProps={{ 'aria-current': 'page' }}` a ciascun `Link`.

`web/src/design/global.css`, in fondo:
```css
.state-notice { margin: 16px 0; padding: 20px; background: var(--paper); box-shadow: var(--card-shadow); }
.state-notice h2 { margin: 0 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
.state-notice p { margin: 0 0 16px; color: var(--body-text); }
.offline-banner { flex: none; margin: 0; padding: 8px 16px; color: #fff; background: var(--ink); font-size: 0.875rem; text-align: center; }
```

- [ ] **Step 7: Sessione, pagine segnaposto e layout**

`web/src/session/useFamily.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { isBlocking } from '../api/errors';
import { meQuery, useQueryDeps } from '../api/queries';
import type { FamilyView, MeView } from '../api/types';
import { useSession, useSessionRevision } from './SessionScope';

export type FamilyState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'none' }
  | { status: 'revoked' }
  | { status: 'ready'; family: FamilyView; me: MeView };

export function useMe() {
  return useQuery(meQuery(useQueryDeps()));
}

/** Loading, error, no family, revoked family or ready: screens never wait forever (review, finding 9). */
export function useFamily(): FamilyState {
  const me = useMe();
  const session = useSession();
  useSessionRevision();
  if (me.isError && isBlocking(me.error, !!me.data)) return { status: 'error', error: me.error, retry: () => void me.refetch() };
  if (!me.data) return { status: 'loading' };
  const family = me.data.families.find((f) => f.id === me.data.currentFamilyId);
  if (!family) return { status: 'none' };
  if (session.isRevoked(family.id)) return { status: 'revoked' };
  return { status: 'ready', family, me: me.data };
}
```

`web/src/components/FamilyGate.tsx`:
```tsx
import type { ReactNode } from 'react';
import type { FamilyView } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import { useFamily } from '../session/useFamily';
import { Loading } from './Loading';
import { QueryError } from './QueryError';
import { StateNotice } from './StateNotice';

/** In front of every family screen: its reads start only with a family that is still allowed. */
export function FamilyGate({ children }: { children: (family: FamilyView) => ReactNode }) {
  const t = useT();
  const state = useFamily();
  if (state.status === 'ready') return <>{children(state.family)}</>;
  return (
    <section className="secondary-view app-view">
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <QueryError error={state.error} onRetry={state.retry} />}
      {state.status === 'none' && <StateNotice title={t('family.none.title')} body={t('family.none.body')} />}
      {state.status === 'revoked' && <StateNotice title={t('errors.forbidden')} />}
    </section>
  );
}
```

Segnaposto (li sostituiscono i Task 11, 14, 15, 16 e 17). `web/src/routes/MenuPage.tsx`:
```tsx
import { FamilyGate } from '../components/FamilyGate';
import { useT } from '../i18n/LocaleProvider';

export function MenuPage() {
  const t = useT();
  return <FamilyGate>{() => <section className="secondary-view app-view"><h1 className="page-title">{t('nav.menu')}</h1></section>}</FamilyGate>;
}
```
Uguali, con `RecipesPage`/`nav.recipes` e `RecipePage`/`recipes.title`. Senza `FamilyGate`: `ProfilePage`/`nav.profile` (il Profilo funziona anche senza famiglia) e `web/src/auth/LoginPage.tsx` con `LoginPage`/`auth.title` e `<main className="entry-page">` al posto di `<section …>`.

`web/src/routes/NotFound.tsx`:
```tsx
import { Link } from '@tanstack/react-router';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';

export function NotFound() {
  const t = useT();
  return (
    <main className="secondary-view app-view" id="app-content">
      <StateNotice title={t('notFound.title')}>
        <Link to="/menu" className="text-button">{t('notFound.action')}</Link>
      </StateNotice>
    </main>
  );
}
```

`web/src/routes/RouteError.tsx`:
```tsx
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { errorKey } from '../api/errors';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';

export function RouteError({ error, reset }: ErrorComponentProps) {
  const t = useT();
  const router = useRouter();
  const queryReset = useQueryErrorResetBoundary();
  return (
    <section className="secondary-view app-view">
      <StateNotice title={t(errorKey(error))}>
        <button type="button" className="text-button" onClick={() => { queryReset.reset(); reset(); void router.invalidate(); }}>
          {t('common.retry')}
        </button>
      </StateNotice>
    </section>
  );
}
```

`web/src/routes/AppLayout.tsx`:
```tsx
import { Outlet } from '@tanstack/react-router';
import { BottomNav } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';
import { useT } from '../i18n/LocaleProvider';

export function AppLayout() {
  const t = useT();
  return (
    <div className="shell">
      <a className="skip-link" href="#app-content">{t('skip')}</a>
      <OfflineBanner />
      <main className="app-content" id="app-content" tabIndex={-1}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 8: Router e radice dell'app**

`web/src/router.tsx` (verificare con Context7 che `redirect({ href })` sia accettato; in alternativa usare `redirect({ to: '/menu' })` quando manca `redirect` nel search e `redirect({ href: search.redirect })` altrimenti):
```tsx
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect, type RouterHistory } from '@tanstack/react-router';
import type { AuthState } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { AppLayout } from './routes/AppLayout';
import { MenuPage } from './routes/MenuPage';
import { NotFound } from './routes/NotFound';
import { ProfilePage } from './routes/ProfilePage';
import { RecipePage } from './routes/RecipePage';
import { RecipesPage } from './routes/RecipesPage';
import { RouteError } from './routes/RouteError';
import { validateLoginSearch, validateMenuSearch, validateRecipeSearch, validateRecipesSearch } from './routes/search';

export interface RouterContext { auth: AuthState }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === 'signedIn') throw redirect({ href: search.redirect ?? '/menu', replace: true });
  },
  component: LoginPage
});

// Pathless layout: every view behind sign-in, with the navbar.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'signedIn') throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
  },
  component: AppLayout,
  errorComponent: RouteError
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/menu', replace: true });
  }
});
const menuRoute = createRoute({ getParentRoute: () => appRoute, path: '/menu', validateSearch: validateMenuSearch, component: MenuPage });
const recipesRoute = createRoute({ getParentRoute: () => appRoute, path: '/recipes', validateSearch: validateRecipesSearch, component: RecipesPage });
const recipeRoute = createRoute({ getParentRoute: () => appRoute, path: '/recipes/$recipeId', validateSearch: validateRecipeSearch, component: RecipePage });
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile', component: ProfilePage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, menuRoute, recipesRoute, recipeRoute, profileRoute])
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history, context: { auth: { status: 'loading' } } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
```

`web/src/App.tsx`:
```tsx
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import type { KeyValueStore } from './api/persister';
import type { AuthBackend } from './auth/backend';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LocaleProvider } from './i18n/LocaleProvider';
import { initialLocale, type Locale } from './i18n/translate';
import { createAppRouter } from './router';
import { SessionScope, type CreateApi } from './session/SessionScope';

export interface AppRootProps {
  backend: AuthBackend;
  store: KeyValueStore;
  createApi: CreateApi;
  history?: RouterHistory;
  initialLocale?: Locale;
}

export function AppRoot({ backend, store, createApi, history, initialLocale: locale }: AppRootProps) {
  return (
    <LocaleProvider initial={locale ?? initialLocale(navigator.languages)}>
      <AuthProvider backend={backend}>
        <SessionScope store={store} createApi={createApi}>
          <AppRouter history={history} />
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
}

function AppRouter({ history }: { history?: RouterHistory }) {
  const { state } = useAuth();
  const router = useMemo(() => createAppRouter(history), [history]);
  // Signing in or out re-runs the guards, which redirect on their own.
  useEffect(() => {
    void router.invalidate();
  }, [state, router]);
  if (state.status === 'loading') return null;
  return <RouterProvider router={router} context={{ auth: state }} />;
}
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './design/fonts.css';
import './design/global.css';
import { AppRoot } from './App';
import { createFakeApi } from './api/fake/fakeApi';
import { createIndexedDbStore } from './api/persister';
import { createFakeBackend } from './auth/backend';
import { createSupabaseBackend } from './auth/supabaseBackend';
import { env } from './env';
import type { CreateApi } from './session/SessionScope';

const backend = env.supabase ? createSupabaseBackend(env.supabase.url, env.supabase.publishableKey) : createFakeBackend();
// Until W1's server exists, data come from the fake client in both modes (spec "Accesso e modalità").
const createApi: CreateApi = (user, getLocale) => createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 150 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot backend={backend} store={createIndexedDbStore()} createApi={createApi} />
  </StrictMode>
);
```

- [ ] **Step 9: Strumenti di test**

`web/src/test/renderApp.tsx`:
```tsx
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { AppRoot } from '../App';
import { createFakeApi } from '../api/fake/fakeApi';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import type { Api } from '../api/types';
import { DEMO_USER, type AuthBackend } from '../auth/backend';
import type { Locale } from '../i18n/translate';
import type { CreateApi } from '../session/SessionScope';
import { createStubBackend } from './stubBackend';

export function renderApp(path: string, options: { backend?: AuthBackend; api?: Api; locale?: Locale; store?: KeyValueStore } = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const backend = options.backend ?? createStubBackend(DEMO_USER);
  const createApi: CreateApi = options.api
    ? () => options.api!
    : (user, getLocale) => createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 0 });
  const result = render(
    <AppRoot backend={backend} store={options.store ?? createMemoryStore()} createApi={createApi} history={history} initialLocale={options.locale ?? 'it-IT'} />
  );
  return { ...result, history };
}
```

`web/src/test/renderWithProviders.tsx`:
```tsx
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api } from '../api/types';
import { DEMO_USER, type AuthBackend } from '../auth/backend';
import type { Locale } from '../i18n/translate';
import type { Session } from '../session/session';
import { useSession } from '../session/SessionScope';
import { renderSession } from './sessionHarness';
import { createStubBackend } from './stubBackend';

/** One component inside the real session stack and a minimal router (for links). */
export function renderWithProviders(ui: ReactNode, options: { api?: Api; locale?: Locale; backend?: AuthBackend } = {}) {
  const locale = options.locale ?? 'it-IT';
  const api = options.api ?? createFakeApi({ getLocale: () => locale, latencyMs: 0 });
  let client: QueryClient | null = null;
  let current: Session | null = null;
  function Capture() {
    client = useQueryClient();
    current = useSession();
    return null;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <><Capture />{ui}</> }),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  const result = renderSession(<RouterProvider router={router} />, {
    backend: options.backend ?? createStubBackend(DEMO_USER, 'fake'),
    api: () => api,
    locale
  });
  return {
    ...result,
    queryClient: () => client ?? (() => { throw new Error('not rendered yet'); })(),
    session: () => current ?? (() => { throw new Error('not rendered yet'); })()
  };
}
```

`web/src/test/browserLanguages.ts`:
```ts
/** Browser languages, read before sign-in (jsdom says en-US by default). */
export function setBrowserLanguages(languages: string[]): void {
  Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => languages });
}
```

`web/src/test/setup.ts` diventa (versione completa):
```ts
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { rememberMenuDay } from '../routes/menu/lastDay';
import { setBrowserLanguages } from './browserLanguages';
import { setOnline } from './connectivity';

// jsdom has no layout: scrolling is a no-op.
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Each test starts with a clean Italian device: storage, network, languages, remembered menu day.
beforeEach(() => {
  localStorage.clear();
  setOnline(true);
  setBrowserLanguages(['it-IT', 'it']);
  rememberMenuDay(undefined);
});
afterEach(() => cleanup());
```

Cancellare `web/src/App.test.tsx`, ormai superato.

- [ ] **Step 10: Test dello stato della famiglia**

`web/src/components/FamilyGate.test.tsx` (review, rilievo 9):
```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api, MeView } from '../api/types';
import { renderApp } from '../test/renderApp';

function withMe(get: () => Promise<MeView>): Api {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  return { ...base, me: { get: async () => ({ unchanged: false, version: 'me', data: await get() }) } };
}
const me = (patch: Partial<MeView>): MeView => ({
  user: { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT' },
  families: [{ id: 'family-main', name: 'Famiglia Folloni', timeZone: 'Europe/Rome', role: 'family_admin' }],
  currentFamilyId: 'family-main',
  ...patch
});

describe('family state', () => {
  it('shows the error with a retry that works', async () => {
    let calls = 0;
    renderApp('/recipes', { api: withMe(async () => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : me({}))) });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: 'Ricettario' })).toBeTruthy();
  });
  it('says when the person has no family', async () => {
    renderApp('/menu', { api: withMe(async () => me({ families: [], currentFamilyId: null })) });
    expect(await screen.findByText('Non fai parte di nessuna famiglia')).toBeTruthy();
  });
  it('treats a vanished current family as no family', async () => {
    renderApp('/menu', { api: withMe(async () => me({ currentFamilyId: 'family-gone' })) });
    expect(await screen.findByText('Non fai parte di nessuna famiglia')).toBeTruthy();
  });
});
```

- [ ] **Step 11: Verifica che passino**

Run: `cd web && npx vitest run && npm run typecheck`
Expected: PASS di tutti i test; nessun errore di tipi.

- [ ] **Step 12: Commit**

```bash
git add -A web/
git commit -m "Web: rotte con guardia di accesso, navbar a icone, stato della famiglia, errori e pagina non trovata"
```

---

### Task 11: Pagina di ingresso

**Files:**
- Modify: `web/src/auth/LoginPage.tsx` (sostituisce il segnaposto), `web/src/design/global.css` (in fondo)
- Test: `web/src/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `SignInFailure`, `useT`, rotta `'/login'` con `LoginSearch`.
- Produces: `LoginPage`.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setBrowserLanguages } from '../test/browserLanguages';
import { createStubBackend } from '../test/stubBackend';
import { renderApp } from '../test/renderApp';

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Accedi' }));
}

describe('sign-in page', () => {
  it('explains wrong credentials and network problems', async () => {
    const backend = createStubBackend(null);
    renderApp('/login', { backend });
    await screen.findByRole('heading', { name: 'Accedi' });
    backend.nextSignIn = { ok: false, reason: 'invalid_credentials' };
    fill('anna@example.com', 'wrong');
    expect((await screen.findByRole('alert')).textContent).toBe('Email o password non corrette.');
    backend.nextSignIn = { ok: false, reason: 'network' };
    fill('anna@example.com', 'secret');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Non riesco a raggiungere il servizio: controlla la connessione.'));
  });
  it('goes back to the requested page after signing in', async () => {
    const backend = createStubBackend(null);
    const { history } = renderApp('/recipes', { backend });
    await screen.findByRole('heading', { name: 'Accedi' });
    fill('anna@example.com', 'secret');
    await waitFor(() => expect(history.location.pathname).toBe('/recipes'));
  });
  it('speaks English when the browser does', async () => {
    setBrowserLanguages(['en-GB']);
    renderApp('/login', { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/auth/LoginPage.test.tsx`
Expected: FAIL, nessun campo «Email» nel segnaposto.

- [ ] **Step 3: Implementa**

`web/src/auth/LoginPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { useAuth } from './AuthProvider';
import type { SignInFailure } from './backend';

/** Entry page (round 4 pattern): no navbar, 420 px column, green brand. Email and password only. */
export function LoginPage() {
  const t = useT();
  const { backend } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await backend.signIn(email.trim(), password);
    setBusy(false);
    // On success the session changes and the route guard redirects to the requested page.
    if (!result.ok) setFailure(result.reason);
  }

  return (
    <main className="entry-page" id="app-content">
      <p className="entry-brand">{t('auth.brand')}</p>
      <h1 className="entry-title">{t('auth.title')}</h1>
      {failure && <p className="form-error" role="alert">{t(`auth.error.${failure}`)}</p>}
      <form onSubmit={submit}>
        <label className="field">
          {t('auth.email')}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          {t('auth.password')}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="text-button primary wide" disabled={busy}>
          {busy ? t('auth.submitting') : t('auth.submit')}
        </button>
      </form>
    </main>
  );
}
```

`web/src/design/global.css`, in fondo:
```css
/* Entry pages (round 4): sign-in. */
.entry-page { height: 100%; overflow-y: auto; width: min(100%, 420px); margin-inline: auto; padding: max(48px, env(safe-area-inset-top)) 16px 32px; }
.entry-brand { margin: 0 0 8px; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
.entry-title { margin: 0 0 24px; font: 400 1.75rem/1.3 var(--heading-font); }
.text-button.wide { width: 100%; }
.form-error { margin: 0 0 16px; padding: 12px 16px; border-left: 4px solid var(--danger); background: var(--paper); box-shadow: var(--card-shadow); }
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/auth && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/auth/LoginPage.tsx web/src/auth/LoginPage.test.tsx web/src/design/global.css
git commit -m "Web: pagina di ingresso con email e password ed errori tradotti"
```

---

### Task 12: Stelline e voto senza aggiornamento ottimistico

> Seconda review: `applyRating` asincrona che annulla le letture pendenti (C5).


**Files:**
- Create: `web/src/api/ratings.ts`, `web/src/components/RatingStars.tsx`, `web/src/components/RatingStars.module.css`
- Test: `web/src/api/ratings.test.ts`, `web/src/components/RatingStars.test.tsx`

**Interfaces:**
- Consumes: `familyOfKey`, `useQueryDeps`, `Versioned` (Task 6); `useSession` (Task 9); `errorKey`; viste; `formatAverage`; `Icon`.
- Produces:
  - `applyRating(queryClient: QueryClient, familyId: string, recipeId: string, summary: RatingSummary): void`
  - `interface RateInput { recipeId: string; stars: number | null }`; `useRateRecipe(familyId: string)` (una `useMutation` con `meta: { familyId }`)
  - `<RatingStars summary recipeId recipeName familyId>`

Schema deciso dal coordinatore dopo la review (rilievi 4, 5, 6, 14): il voto si invia e si mostra lo stato di invio; alla risposta il risultato del server si applica alle settimane e alle schede ricetta **della stessa famiglia** che contengono la ricetta; le liste del Ricettario della famiglia si marcano scadute (si rileggono quando sono mostrate, subito se lo sono già); per la stessa ricetta vale solo l'ultima richiesta; le risposte arrivate a sessione chiusa si scartano; offline il voto fallisce subito. In cache e su disco entrano solo dati confermati.

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/api/ratings.test.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys, type Versioned } from './queries';
import { applyRating } from './ratings';
import type { MealView, RatingSummary, RecipeDetailView, RecipeListItem, WeekView } from './types';

const none: RatingSummary = { familyAverage: null, familyCount: 0, myStars: null };
const confirmed: RatingSummary = { familyAverage: 2, familyCount: 1, myStars: 2 };
const weekWith = (rating: RatingSummary): Versioned<WeekView> => ({
  version: 'v',
  data: { startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ recipe: { id: 'r1' }, rating } as MealView] }] }
});
const ratingIn = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<Versioned<WeekView>>(key)?.data.days[0]?.meals[0]?.rating;

describe('applyRating', () => {
  it('updates the views of the same family only and marks its lists as stale', () => {
    const client = new QueryClient();
    const mine = queryKeys.week('f1', '2026-10-05', 'it-IT');
    const other = queryKeys.week('f2', '2026-10-05', 'it-IT');
    const detail = queryKeys.recipe('f1', 'r1', 'it-IT');
    const list = queryKeys.search('f1', { minStars: 3 }, 'it-IT');
    const otherList = queryKeys.search('f2', {}, 'it-IT');
    client.setQueryData(mine, weekWith(none));
    client.setQueryData(other, weekWith({ familyAverage: 5, familyCount: 3, myStars: null }));
    client.setQueryData<Versioned<RecipeDetailView>>(detail, { version: 'v', data: { recipe: { id: 'r1' }, rating: none } as RecipeDetailView });
    client.setQueryData<Versioned<RecipeListItem[]>>(list, { version: 'v', data: [] });
    client.setQueryData<Versioned<RecipeListItem[]>>(otherList, { version: 'v', data: [] });
    applyRating(client, 'f1', 'r1', confirmed);
    expect(ratingIn(client, mine)).toEqual(confirmed);
    expect(ratingIn(client, other)).toEqual({ familyAverage: 5, familyCount: 3, myStars: null });
    expect(client.getQueryData<Versioned<RecipeDetailView>>(detail)?.data.rating).toEqual(confirmed);
    expect(client.getQueryState(list)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherList)?.isInvalidated).toBe(false);
  });
});
```

`web/src/components/RatingStars.test.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../api/fake/fakeApi';
import { queryKeys, type Versioned } from '../api/queries';
import type { Api, MealView, RatingSummary, WeekView } from '../api/types';
import { setOnline } from '../test/connectivity';
import { renderWithProviders } from '../test/renderWithProviders';
import { RatingStars } from './RatingStars';

const start: RatingSummary = { familyAverage: 4, familyCount: 2, myStars: null };
const weekKey = queryKeys.week('family-main', '2026-10-05', 'it-IT');
const weekWith = (rating: RatingSummary): Versioned<WeekView> => ({
  version: 'v',
  data: { startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ recipe: { id: 'wok', name: 'Wok' }, rating } as MealView] }] }
});

/** Reads the rating from the cached week, as the menu card does. */
function Harness() {
  const rating = useQuery({
    queryKey: weekKey,
    queryFn: () => new Promise<never>(() => {}),
    staleTime: Infinity,
    select: (v: Versioned<WeekView>) => v.data.days[0]!.meals[0]!.rating
  });
  return rating.data ? <RatingStars summary={rating.data} recipeId="wok" recipeName="Wok" familyId="family-main" /> : null;
}

async function setup(set?: Api['ratings']['set'], rating = start) {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const api = set ? { ...base, ratings: { set } } : base;
  const spy = vi.spyOn(api.ratings, 'set');
  const view = renderWithProviders(<Harness />, { api });
  // The session stack mounts asynchronously: wait for its QueryClient, then seed the confirmed week.
  const client = await waitFor(() => view.queryClient());
  act(() => client.setQueryData(weekKey, weekWith(rating)));
  return { ...view, spy };
}
const cached = (view: Awaited<ReturnType<typeof setup>>) => view.queryClient().getQueryData<Versioned<WeekView>>(weekKey)?.data.days[0]?.meals[0]?.rating;

describe('RatingStars', () => {
  it('shows the sending state and then the confirmed result, never an unconfirmed one', async () => {
    let resolve: (value: RatingSummary) => void = () => {};
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => (resolve = r))));
    fireEvent.click(await screen.findByLabelText('Dai 4 stelle a Wok'));
    expect(await screen.findByText('Invio del voto…')).toBeTruthy();
    expect(cached(view)).toEqual(start);
    await act(async () => resolve({ familyAverage: 4.5, familyCount: 3, myStars: 4 }));
    await waitFor(() => expect(cached(view)).toEqual({ familyAverage: 4.5, familyCount: 3, myStars: 4 }));
    expect(screen.getByText('4,5')).toBeTruthy();
    expect(screen.queryByText('Invio del voto…')).toBeNull();
  });
  it('keeps the confirmed value and explains the error when the rating fails', async () => {
    const view = await setup(vi.fn(() => Promise.reject(new Error('boom'))));
    fireEvent.click(await screen.findByLabelText('Dai 2 stelle a Wok'));
    expect((await screen.findByRole('alert')).textContent).toBe('Qualcosa non ha funzionato: riprova.');
    expect(cached(view)).toEqual(start);
  });
  it('fails at once offline through the real connectivity path, and sends nothing when back online', async () => {
    const view = await setup();
    await screen.findByLabelText('Dai 3 stelle a Wok');
    act(() => setOnline(false));
    fireEvent.click(screen.getByLabelText('Dai 3 stelle a Wok'));
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.spy).toHaveBeenCalledTimes(1);
    expect(cached(view)).toEqual(start);
  });
  it('applies only the answer to the latest request for the same recipe', async () => {
    const pending: ((value: RatingSummary) => void)[] = [];
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => pending.push(r))));
    const session = view.session();
    // Two requests for the same recipe (for example card and recipe page): the first answers last.
    const first = session.track('rating:wok');
    const second = session.track('rating:wok');
    expect(session.isLatest('rating:wok', first)).toBe(false);
    expect(session.isLatest('rating:wok', second)).toBe(true);
    fireEvent.click(await screen.findByLabelText('Dai 5 stelle a Wok'));
    await waitFor(() => expect(pending).toHaveLength(1));
    // A newer request on the same recipe starts while this one is pending.
    session.track('rating:wok');
    await act(async () => pending[0]!({ familyAverage: 5, familyCount: 3, myStars: 5 }));
    expect(cached(view)).toEqual(start);
  });
  it('drops an answer that arrives after the session is closed', async () => {
    let resolve: (value: RatingSummary) => void = () => {};
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => (resolve = r))));
    fireEvent.click(await screen.findByLabelText('Dai 4 stelle a Wok'));
    const session = view.session();
    const client = view.queryClient();
    await act(async () => {
      await session.close();
      // Even if something cached the week again, a late answer of a closed session must not touch it.
      client.setQueryData(weekKey, weekWith(start));
      resolve({ familyAverage: 4.5, familyCount: 3, myStars: 4 });
    });
    expect(client.getQueryData<Versioned<WeekView>>(weekKey)?.data.days[0]?.meals[0]?.rating).toEqual(start);
  });
  it('removes the rating when the chosen star is tapped again', async () => {
    const set = vi.fn(async () => ({ familyAverage: 4, familyCount: 1, myStars: null }));
    await setup(set, { familyAverage: 4, familyCount: 2, myStars: 4 });
    fireEvent.click(await screen.findByLabelText('Il tuo voto: 4 stelle. Tocca di nuovo per toglierlo'));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ familyId: 'family-main', recipeId: 'wok', stars: null }));
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/ratings.test.ts src/components/RatingStars.test.tsx`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa il voto**

`web/src/api/ratings.ts`:
```ts
import { useMutation, type Query, type QueryClient } from '@tanstack/react-query';
import { useSession } from '../session/SessionScope';
import { familyOfKey, useQueryDeps, type Versioned } from './queries';
import type { MealView, RatingSummary, RecipeDetailView, WeekView } from './types';

const ofFamily = (familyId: string) => (query: Query) => familyOfKey(query.queryKey) === familyId;

const patchMeal = (meal: MealView, recipeId: string, summary: RatingSummary): MealView =>
  meal.recipe?.id === recipeId && meal.rating ? { ...meal, rating: summary } : meal;

/**
 * The server's answer reaches the views of the same family that show the recipe; lists whose
 * membership or order depend on ratings are read again instead of being patched (spec, voto).
 */
export function applyRating(queryClient: QueryClient, familyId: string, recipeId: string, summary: RatingSummary): void {
  queryClient.setQueriesData<Versioned<WeekView>>({ queryKey: ['menu', 'getWeek'], predicate: ofFamily(familyId) }, (old) =>
    old && { ...old, data: { ...old.data, days: old.data.days.map((d) => ({ ...d, meals: d.meals.map((m) => patchMeal(m, recipeId, summary)) })) } }
  );
  queryClient.setQueriesData<Versioned<RecipeDetailView>>({ queryKey: ['recipes', 'get'], predicate: ofFamily(familyId) }, (old) =>
    old && old.data.recipe.id === recipeId ? { ...old, data: { ...old.data, rating: summary } } : old
  );
  void queryClient.invalidateQueries({ queryKey: ['recipes', 'search'], predicate: ofFamily(familyId) });
}

export interface RateInput { recipeId: string; stars: number | null }

/** The model for wave 2 mutations: send, show the pending state, apply only confirmed and current answers. */
export function useRateRecipe(familyId: string) {
  const { api, queryClient } = useQueryDeps();
  const session = useSession();
  return useMutation({
    meta: { familyId },
    mutationFn: async ({ recipeId, stars }: RateInput) => {
      const token = session.track(`rating:${recipeId}`);
      const summary = await api.ratings.set({ familyId, recipeId, stars });
      return { summary, token };
    },
    onSuccess: ({ summary, token }, { recipeId }) => {
      if (session.isClosed() || !session.isLatest(`rating:${recipeId}`, token)) return;
      applyRating(queryClient, familyId, recipeId, summary);
    }
  });
}
```

- [ ] **Step 4: Implementa il componente**

`web/src/components/RatingStars.tsx`:
```tsx
import { useId } from 'react';
import { errorKey } from '../api/errors';
import { useRateRecipe } from '../api/ratings';
import type { RatingSummary } from '../api/types';
import { formatAverage } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { Icon } from './Icon';
import styles from './RatingStars.module.css';

interface Props { summary: RatingSummary; recipeId: string; recipeName: string; familyId: string }

/** Family average and own stars on one row, no labels (round 1 review). Tapping the chosen star removes it. */
export function RatingStars({ summary, recipeId, recipeName, familyId }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const name = useId();
  const rate = useRateRecipe(familyId);
  const average = summary.familyAverage === null ? null : formatAverage(locale, summary.familyAverage);
  const choose = (value: number) => rate.mutate({ recipeId, stars: summary.myStars === value ? null : value });

  return (
    <div className={styles.rating}>
      <div className={styles.row}>
        <p
          className={styles.average}
          aria-label={average === null ? t('rating.none') : t('rating.averageLabel', { value: average, votes: t('rating.votes', { count: summary.familyCount }) })}
        >
          {average === null ? (
            <span className={`${styles.value} ${styles.muted}`} aria-hidden="true">–</span>
          ) : (
            <>
              <span className={styles.value} aria-hidden="true">{average}</span>
              <span className={styles.count} aria-hidden="true">({summary.familyCount})</span>
            </>
          )}
        </p>
        <fieldset className={styles.stars} disabled={rate.isPending} aria-busy={rate.isPending}>
          <legend className="visually-hidden">{t('rating.mine')}</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={styles.star} data-filled={summary.myStars !== null && value <= summary.myStars}>
              <input className="visually-hidden" type="radio" name={name} value={value} checked={summary.myStars === value} onChange={() => undefined} onClick={() => choose(value)} />
              <Icon name="star" />
              <span className="visually-hidden">
                {summary.myStars === value ? t('rating.removeStars', { stars: value }) : t('rating.give', { stars: value, recipe: recipeName })}
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      {rate.isPending && <p className="meta-line" role="status">{t('rating.sending')}</p>}
      {rate.isError && <p className="meta-line" role="alert">{t(errorKey(rate.error))}</p>}
    </div>
  );
}
```

`web/src/components/RatingStars.module.css` (da `prototype/src/lib/components/RatingStars.svelte`):
```css
.rating { margin: 0 0 16px; font-size: 0.875rem; }
.row { display: flex; align-items: center; gap: 8px; }
.average { display: flex; align-items: baseline; gap: 4px; margin: 0; min-width: 3.5ch; }
.value { font: 700 1.5rem/1 var(--text-font); color: var(--ink); }
.muted { color: var(--muted); }
.count { color: var(--muted); font-size: 0.8125rem; }
.stars { display: inline-flex; margin: 0; padding: 0; border: 0; }
.star { display: grid; place-items: center; width: 44px; height: 44px; color: var(--ink); cursor: pointer; }
.star :global(.icon) { width: 26px; height: 26px; }
.star[data-filled='true'] :global(.icon) { fill: var(--green); stroke: var(--green); }
.star:has(input:focus-visible) { outline: 3px solid var(--green); outline-offset: -3px; border-radius: 8px; }
.stars:disabled .star { opacity: 0.5; cursor: progress; }
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/api/ratings.test.ts src/components/RatingStars.test.tsx && npm run typecheck`
Expected: PASS. Verificare con Context7 (`/tanstack/query`) che `setQueriesData` e `invalidateQueries` accettino `predicate` nei filtri in 5.104.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/ratings.ts web/src/api/ratings.test.ts web/src/components/RatingStars.*
git commit -m "Web: voto inviato e confermato dal server, applicato alla sola famiglia, senza dati non confermati"
```

---

### Task 13: Scheda del pasto e della ricetta

**Files:**
- Create: `web/src/components/source.ts`, `web/src/components/IngredientList.tsx`, `web/src/components/RecipeCard.tsx`, `web/src/components/RecipeCard.module.css`
- Test: `web/src/components/source.test.ts`, `web/src/components/RecipeCard.test.tsx`

**Interfaces:**
- Consumes: viste; `RecipeSearch` (con `slot`); `RatingStars`; `Icon`; `truncate`, `formatAverage`, `formatChangeTime`.
- Produces:
  - `safeSourceUrl(url: string | null): string | null` (solo `http:` e `https:`)
  - `sourceLine(recipe: RecipeSummary, t: (key: MessageKey, params?: MessageParams) => string): string | null`
  - `SOURCE_MAX_CHARS = 22`
  - `<IngredientList ingredients={IngredientLine[]}>`
  - `interface RecipeCardProps { cardKey: string; label: string | null; kind: 'recipe' | 'free' | 'empty'; recipe: RecipeSummary | null; freeText: string | null; servings: number | null; ingredients: IngredientLine[] | null; note: string | null; rating: RatingSummary | null; lastChange: MealView['lastChange']; detailSearch: RecipeSearch | null; familyId: string; isPast?: boolean }`; `<RecipeCard {...props}>`

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/components/source.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RecipeSummary } from '../api/types';
import { translate } from '../i18n/translate';
import { safeSourceUrl, sourceLine } from './source';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('it-IT', key, params);
const recipe = (patch: Partial<RecipeSummary>) => ({ sourceType: 'web', sourceUrl: null, bookTitle: null, bookPages: null, ...patch }) as RecipeSummary;

describe('source', () => {
  it('accepts only web addresses', () => {
    expect(safeSourceUrl('https://www.giallozafferano.it/x')).toBe('https://www.giallozafferano.it/x');
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSourceUrl('not a url')).toBeNull();
    expect(safeSourceUrl(null)).toBeNull();
  });
  it('names the source by kind', () => {
    expect(sourceLine(recipe({ sourceUrl: 'https://www.gnambox.com/r' }), t)).toBe('gnambox.com');
    expect(sourceLine(recipe({ sourceType: 'youtube', sourceUrl: 'https://youtu.be/x' }), t)).toBe('Video YouTube');
    expect(sourceLine(recipe({ sourceType: 'book', bookTitle: 'Basta un Wok', bookPages: '12' }), t)).toBe('Libro: Basta un Wok, pp. 12');
    expect(sourceLine(recipe({ sourceType: 'home' }), t)).toBe('Ricetta di casa');
    expect(sourceLine(recipe({ sourceType: 'web', sourceUrl: 'bad' }), t)).toBeNull();
  });
});
```

`web/src/components/RecipeCard.test.tsx`:
```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecipeSummary } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { RecipeCard, type RecipeCardProps } from './RecipeCard';

const recipe: RecipeSummary = {
  id: 'r1', name: 'Spaghetti al pomodoro', description: 'Semplici.', photo: '/assets/recipe-images/x.jpg', durationMinutes: 20,
  sourceType: 'web', sourceUrl: 'https://ricette.giallozafferano.it/spaghetti', bookTitle: null, bookPages: null, mealType: 'both', proteinGroup: 'vegetarian'
};
const base: RecipeCardProps = {
  cardKey: 's1', label: 'Pranzo', kind: 'recipe', recipe, freeText: null, servings: 4,
  ingredients: [{ ingredientId: 'pasta', name: 'Spaghetti', amount: '320 g', optional: false }, { ingredientId: 'pasta', name: 'Spaghetti', amount: '10 g', optional: false }],
  note: null, rating: { familyAverage: 4, familyCount: 2, myStars: null }, lastChange: null,
  detailSearch: { from: 'menu', day: '2026-10-08', slot: '2026-10-08-lunch' }, familyId: 'family-main'
};

describe('RecipeCard', () => {
  it('links the title to the source and truncates the source line', async () => {
    renderWithProviders(<RecipeCard {...base} />);
    const title = await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(title.getAttribute('href')).toBe('https://ricette.giallozafferano.it/spaghetti');
    expect(title.getAttribute('target')).toBe('_blank');
    expect(screen.getByTitle('ricette.giallozafferano.it')).toBeTruthy();
    expect(screen.getByText('ricette.giallozaffera…')).toBeTruthy();
    expect(screen.getByText(/4 porzioni/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scheda ricetta' }).getAttribute('href')).toBe('/recipes/r1?from=menu&day=2026-10-08&slot=2026-10-08-lunch');
  });
  it('opens rating and ingredients one at a time', async () => {
    renderWithProviders(<RecipeCard {...base} />);
    const ratingButton = await screen.findByRole('button', { name: 'Voto della famiglia 4,0: apri per votare' });
    const ingredientsButton = screen.getByRole('button', { name: '2 ingredienti: mostra o nascondi' });
    fireEvent.click(ratingButton);
    expect(ratingButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Dai 5 stelle a Spaghetti al pomodoro')).toBeTruthy();
    fireEvent.click(ingredientsButton);
    expect(ratingButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('320 g')).toBeTruthy();
    expect(screen.queryByLabelText('Dai 5 stelle a Spaghetti al pomodoro')).toBeNull();
  });
  it('shows free meals, empty slots, changes by former members and missing ingredients', async () => {
    const { unmount } = renderWithProviders(<RecipeCard {...base} kind="free" recipe={null} freeText="Pizza" rating={null} ingredients={null} />);
    expect(await screen.findByText('Pasto libero')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pizza' })).toBeTruthy();
    unmount();
    const empty = renderWithProviders(<RecipeCard {...base} kind="empty" recipe={null} rating={null} ingredients={null} />);
    expect(await screen.findByRole('heading', { name: 'Nessuna ricetta adatta' })).toBeTruthy();
    empty.unmount();
    renderWithProviders(<RecipeCard {...base} rating={null} ingredients={null} detailSearch={null} lastChange={{ userName: null, at: '2026-10-01T20:40' }} />);
    expect(await screen.findByText('Cambiato da ex membro, giovedì 20:40')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Voto della famiglia/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Scheda ricetta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ingredienti: mostra o nascondi/ }));
    expect(screen.getByText('Ingredienti non ancora disponibili per questa ricetta.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/components/source.test.ts src/components/RecipeCard.test.tsx`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa**

`web/src/components/source.ts`:
```ts
import type { RecipeSummary } from '../api/types';
import type { MessageKey, MessageParams } from '../i18n/translate';

export const SOURCE_MAX_CHARS = 22;

/** Only http(s) addresses become links: data from imports and agents are not trusted. */
export function safeSourceUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function sourceLine(recipe: RecipeSummary, t: (key: MessageKey, params?: MessageParams) => string): string | null {
  if (recipe.sourceType === 'book' && recipe.bookTitle) return t('source.book', { title: recipe.bookTitle, pages: recipe.bookPages ?? '—' });
  if (recipe.sourceType === 'youtube') return t('source.youtube');
  if (recipe.sourceType === 'home') return t('source.home');
  const url = safeSourceUrl(recipe.sourceUrl);
  return url ? new URL(url).hostname.replace(/^www\./, '') : null;
}
```
`web/src/components/IngredientList.tsx`:
```tsx
import type { IngredientLine } from '../api/types';

export function IngredientList({ ingredients }: { ingredients: IngredientLine[] }) {
  return (
    <ul className="ingredient-list">
      {ingredients.map((item, index) => (
        // The same ingredient may appear twice in a recipe: the position keeps keys unique.
        <li key={`${index}-${item.ingredientId}`}>
          <span>{item.name}</span>
          <span className="ingredient-quantity">{item.amount}</span>
        </li>
      ))}
    </ul>
  );
}
```

`web/src/components/RecipeCard.tsx`:
```tsx
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { IngredientLine, MealView, RatingSummary, RecipeSummary } from '../api/types';
import { formatAverage, formatChangeTime } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { truncate } from '../i18n/text';
import type { RecipeSearch } from '../routes/search';
import { Icon } from './Icon';
import { IngredientList } from './IngredientList';
import { RatingStars } from './RatingStars';
import styles from './RecipeCard.module.css';
import { safeSourceUrl, SOURCE_MAX_CHARS, sourceLine } from './source';

export interface RecipeCardProps {
  cardKey: string;
  /** Chip on the photo: meal type in the menu, food group in the catalogue. */
  label: string | null;
  kind: 'recipe' | 'free' | 'empty';
  recipe: RecipeSummary | null;
  freeText: string | null;
  servings: number | null;
  ingredients: IngredientLine[] | null;
  note: string | null;
  rating: RatingSummary | null;
  lastChange: MealView['lastChange'];
  detailSearch: RecipeSearch | null;
  familyId: string;
  isPast?: boolean;
}

/** One card for menu meals and catalogue recipes (round 1). Footer: details, rating, ingredients. */
export function RecipeCard(props: RecipeCardProps) {
  const { cardKey, label, kind, recipe, freeText, servings, ingredients, note, rating, lastChange, detailSearch, familyId, isPast } = props;
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState<'rating' | 'ingredients' | null>(null);
  const toggle = (section: 'rating' | 'ingredients') => setOpen((current) => (current === section ? null : section));
  const headingId = `card-${cardKey}`;
  const source = recipe ? sourceLine(recipe, t) : null;
  const sourceUrl = recipe ? safeSourceUrl(recipe.sourceUrl) : null;
  const averageText = rating?.familyAverage != null ? formatAverage(locale, rating.familyAverage) : '–';
  const chip = label ? <span className="meal-label">{label}</span> : null;

  return (
    <article className={`meal${kind !== 'recipe' ? ' meal-free' : ''}${isPast ? ` ${styles.past}` : ''}`} aria-labelledby={headingId}>
      {recipe?.photo ? (
        <div className={`meal-media ${styles.banner}`}>
          <img className="meal-photo" src={recipe.photo} alt="" loading="lazy" decoding="async" />
          {chip}
        </div>
      ) : (
        <div className="meal-heading">{chip}</div>
      )}

      <div className={`meal-content ${styles.content}`}>
        {kind === 'free' && (
          <>
            <span className="free-mark">{t('meal.free')}</span>
            <h3 id={headingId}>{freeText}</h3>
          </>
        )}
        {kind === 'empty' && (
          <>
            <h3 id={headingId}>{t('meal.empty.title')}</h3>
            <p className="description">{t('meal.empty.body')}</p>
          </>
        )}
        {kind === 'recipe' && recipe && (
          <>
            <h3 id={headingId}>
              {sourceUrl ? (
                <a className="recipe-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  {recipe.name} <Icon name="arrow" /><span className="visually-hidden">({t('source.open')})</span>
                </a>
              ) : (
                recipe.name
              )}
            </h3>
            {recipe.description && <p className="description">{recipe.description}</p>}
            <div className={styles.metaRow}>
              <p className="meal-meta">
                {recipe.durationMinutes ? <><Icon name="clock" />{t('meal.minutes', { count: recipe.durationMinutes })}</> : null}
                {recipe.durationMinutes && servings ? ' · ' : null}
                {servings ? t('meal.servings', { count: servings }) : null}
              </p>
              {source && (
                <p className={`meal-source ${styles.source}`} title={source}>
                  <span aria-hidden="true">{truncate(source, SOURCE_MAX_CHARS)}</span>
                  <span className="visually-hidden">{source}</span>
                </p>
              )}
            </div>
          </>
        )}
        {lastChange && (
          <p className="meta-line">
            {t('meal.changedBy', { name: lastChange.userName ?? t('meal.formerMember'), time: formatChangeTime(locale, lastChange.at) })}
          </p>
        )}
        {note && <p className="meta-line"><strong>{t('meal.note')}:</strong> {note}</p>}
      </div>

      {kind === 'recipe' && recipe && (
        <>
          <div className={styles.footer}>
            {detailSearch && (
              <Link to="/recipes/$recipeId" params={{ recipeId: recipe.id }} search={detailSearch} className={styles.action} aria-label={t('meal.details')}>
                <Icon name="recipe" />
              </Link>
            )}
            {rating && (
              <button type="button" className={styles.action} aria-expanded={open === 'rating'} aria-label={t('meal.ratingAction', { value: averageText })} onClick={() => toggle('rating')}>
                <Icon name="star" className={rating.myStars != null ? styles.mine : undefined} />
                <span aria-hidden="true">{averageText}</span>
              </button>
            )}
            <button type="button" className={styles.action} aria-expanded={open === 'ingredients'} aria-label={t('meal.ingredientsAction', { count: ingredients?.length ?? 0 })} onClick={() => toggle('ingredients')}>
              <Icon name="list" />
              <span aria-hidden="true">{ingredients?.length ?? '–'}</span>
            </button>
          </div>
          {open === 'rating' && rating && (
            <div className={styles.panel}>
              <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} />
            </div>
          )}
          {open === 'ingredients' && (
            <div className={styles.panel}>
              {ingredients ? <IngredientList ingredients={ingredients} /> : <p className="meta-line">{t('meal.ingredientsMissing')}</p>}
            </div>
          )}
        </>
      )}
    </article>
  );
}
```

`web/src/components/RecipeCard.module.css` (da `prototype/src/lib/components/RecipeCard.svelte`):
```css
/* Low banner (3:1), chosen in the round 1 review instead of the reference 16:9. */
.banner { aspect-ratio: 3 / 1; }
.content { padding-bottom: 14px; }
.metaRow { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.metaRow :global(.meal-meta) { flex: none; margin: 0; }
/* Fixed-length cut first; on very narrow screens the CSS ellipsis keeps it inside the card. */
.source { flex: 0 1 auto; min-width: 0; margin: 0; overflow: hidden; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.past :global(.meal-photo) { filter: grayscale(0.4); opacity: 0.85; }
.footer { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); border-top: 1px solid var(--rule); }
.action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 8px; border: 0; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); text-decoration: none; cursor: pointer; }
.action + .action { border-left: 1px solid var(--rule); }
.action :global(.icon) { width: 22px; height: 22px; }
.mine { fill: var(--green); stroke: var(--green); }
.action[aria-expanded='true'] { color: var(--green); background: var(--soft-green); }
.action:focus-visible { outline-offset: -3px; }
.panel { padding: 16px 18px 18px; border-top: 1px solid var(--rule); }
.panel :global(.ingredient-list) { margin-top: 0; }
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/components && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components
git commit -m "Web: scheda unica per pasti e ricette, con fonte, voto e ingredienti nel footer"
```

---

### Task 14: Menu

**Files:**
- Create: `web/src/routes/menu/selection.ts`, `web/src/components/DaySelector.tsx`, `web/src/components/DatePicker.tsx`, `web/src/components/DatePicker.module.css`, `web/src/routes/MenuPage.module.css`
- Modify: `web/src/routes/MenuPage.tsx` (sostituisce il segnaposto)
- Test: `web/src/routes/menu/selection.test.ts`, `web/src/routes/MenuPage.test.tsx`

**Interfaces:**
- Consumes: `openingQuery`, `weekQuery`, `datesQuery`, `useQueryDeps`; `FamilyGate`, `QueryError`; `isBlocking`, `toApiError`; `RecipeCard`; `StateNotice`, `Loading`, `Icon`; `rememberMenuDay`; calendario; formattatori.
- Produces:
  - `pickSelected(days: IsoDate[], requested?: IsoDate, opening?: IsoDate): IsoDate | null`
  - `addMonths(month: string, delta: number): string` (in `selection.ts`, mese `YYYY-MM`)
  - `<DaySelector dates selected onSelect>`; `<DatePicker familyId selected open onToggle onClose onSelect>` con `onToggle(opener: HTMLElement)`: chi apre il calendario lo passa, e a ogni chiusura il focus torna lì; `MenuPage`

- [ ] **Step 1: Scrivi i test della selezione che falliscono**

`web/src/routes/menu/selection.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addMonths, pickSelected } from './selection';

const days = ['2026-10-05', '2026-10-06', '2026-10-07'];

describe('menu selection', () => {
  it('prefers the requested day, then the opening day, then the first day of the week', () => {
    expect(pickSelected(days, '2026-10-06', '2026-10-07')).toBe('2026-10-06');
    expect(pickSelected(days, '2026-11-01', '2026-10-07')).toBe('2026-10-07');
    expect(pickSelected(days, undefined, '2026-12-01')).toBe('2026-10-05');
    expect(pickSelected([], '2026-10-06')).toBeNull();
  });
  it('moves across years by month', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});
```

Run: `cd web && npx vitest run src/routes/menu/selection.test.ts`
Expected: FAIL, `Failed to resolve import "./selection"`.

- [ ] **Step 2: Implementa la selezione**

`web/src/routes/menu/selection.ts`:
```ts
import type { IsoDate } from '../../lib/calendar';

export function pickSelected(days: IsoDate[], requested?: IsoDate, opening?: IsoDate): IsoDate | null {
  if (requested && days.includes(requested)) return requested;
  if (opening && days.includes(opening)) return opening;
  return days[0] ?? null;
}

export function addMonths(month: string, delta: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
```

Run: `cd web && npx vitest run src/routes/menu/selection.test.ts`
Expected: PASS.

- [ ] **Step 3: Scrivi i test del Menu che falliscono**

`web/src/routes/MenuPage.test.tsx` (Review Focus: `?day=` sbagliato):
```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { renderApp } from '../test/renderApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome.
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const current = () => within(screen.getByRole('navigation', { name: 'Giorni della settimana' })).getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'location');

describe('menu', () => {
  it('opens on today with the month bar and the week', async () => {
    renderApp('/menu');
    await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
    expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre');
    expect(screen.getByRole('button', { name: 'ottobre 2026' })).toBeTruthy();
    expect(screen.getByText('Doppia dose, avanza per venerdì', { exact: false })).toBeTruthy();
    expect(screen.getByText('Cambiato da Anna, venerdì 21:30')).toBeTruthy();
    const bag = screen.getByRole('button', { name: 'Lista della spesa (in arrivo)' });
    expect((bag as HTMLButtonElement).disabled).toBe(true);
  });
  it('opens the requested day', async () => {
    renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    expect(current()?.getAttribute('aria-label')).toBe('martedì 6 ottobre');
  });
  it('falls back to the opening day for malformed or unknown days', async () => {
    const malformed = renderApp('/menu?day=domani');
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    malformed.unmount();
    const { history } = renderApp('/menu?day=2030-01-07');
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    expect(history.location.search).not.toContain('2030');
  });
  it('selects a day from the selector and keeps it in the address', async () => {
    const { history } = renderApp('/menu');
    fireEvent.click(await screen.findByRole('link', { name: 'lunedì 5 ottobre' }));
    await waitFor(() => expect(history.location.search).toContain('2026-10-05'));
    expect(current()?.getAttribute('aria-label')).toBe('lunedì 5 ottobre');
  });
  it('chooses any day with a menu from the calendar', async () => {
    const { history } = renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli un giorno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'lunedì 12 ottobre' }) as HTMLButtonElement).disabled).toBe(false));
    expect((within(dialog).getByRole('button', { name: 'sabato 31 ottobre' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'lunedì 12 ottobre' }));
    await waitFor(() => expect(history.location.search).toContain('2026-10-12'));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('lunedì 12 ottobre'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('goes back to the opening day when Menu is tapped on the menu', async () => {
    const { history } = renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
    await waitFor(() => expect(history.location.search).not.toContain('2026-10-06'));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
  });
  it('keeps the chosen day when coming back from the recipes', async () => {
    const { history } = renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    fireEvent.click(screen.getByRole('link', { name: 'Ricettario' }));
    await waitFor(() => expect(history.location.pathname).toBe('/recipes'));
    fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('martedì 6 ottobre'));
  });
  it('links each meal to its recipe with the meal reference', async () => {
    renderApp('/menu');
    await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
    const details = screen.getAllByRole('link', { name: 'Scheda ricetta' }).map((a) => a.getAttribute('href') ?? '');
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((href) => /from=menu&day=\d{4}-\d{2}-\d{2}&slot=\d{4}-\d{2}-\d{2}-(lunch|dinner)/.test(href))).toBe(true);
  });
  it('offers to retry a week that failed to load', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const getWeek = api.menu.getWeek;
    let calls = 0;
    api.menu.getWeek = (input) => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : getWeek(input));
    renderApp('/menu', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('link', { name: 'giovedì 8 ottobre' })).toBeTruthy();
  });
  it('gives focus back to the calendar icon after choosing a day or pressing Escape', async () => {
    renderApp('/menu');
    const icon = await screen.findByRole('button', { name: 'Scegli un giorno' });
    icon.focus();
    fireEvent.click(icon);
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'martedì 6 ottobre' }));
    await waitFor(() => expect(document.activeElement).toBe(icon));
    fireEvent.click(icon);
    await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(icon);
  });
  it('gives focus back to the month when the calendar was opened from it', async () => {
    renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'ottobre 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'lunedì 5 ottobre' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'lunedì 5 ottobre' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ottobre 2026' })));
  });
  it('does not steal focus from the month arrows when the days are read again', async () => {
    renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli un giorno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mese successivo' }));
    const previous = within(dialog).getByRole('button', { name: 'Mese precedente' });
    previous.focus();
    fireEvent.click(previous);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'giovedì 8 ottobre' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(previous);
  });
  it('says when the family has no menu yet', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.menu.getOpening = async () => ({ unchanged: false, version: 'opening-1', data: { kind: 'no_weeks' } });
    renderApp('/menu', { api });
    expect(await screen.findByRole('heading', { name: 'Ancora nessun menu' })).toBeTruthy();
  });
});
```
- [ ] **Step 4: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/MenuPage.test.tsx`
Expected: FAIL, il segnaposto non ha il selettore dei giorni.

- [ ] **Step 5: Selettore dei giorni e calendario**

`web/src/components/DaySelector.tsx`:
```tsx
import { formatDayLong, formatDayNumber, formatDayShort } from '../i18n/dates';
import { useLocale } from '../i18n/LocaleProvider';
import type { IsoDate } from '../lib/calendar';

export function DaySelector({ dates, selected, onSelect }: { dates: IsoDate[]; selected: IsoDate; onSelect: (date: IsoDate) => void }) {
  const { locale } = useLocale();
  return (
    <div className="day-links">
      {dates.map((date) => (
        <a
          key={date}
          className="day-link"
          href={`#day-${date}`}
          aria-current={date === selected ? 'location' : undefined}
          aria-label={formatDayLong(locale, date)}
          onClick={(event) => {
            event.preventDefault();
            onSelect(date);
          }}
        >
          <span>{formatDayShort(locale, date)}</span>
          <strong>{formatDayNumber(locale, date)}</strong>
        </a>
      ))}
    </div>
  );
}
```

`web/src/components/DatePicker.tsx` (da `prototype/src/lib/components/DatePicker.svelte`; focus secondo il rilievo 13):
```tsx
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { datesQuery, useQueryDeps } from '../api/queries';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { addDays, mondayOf, type IsoDate } from '../lib/calendar';
import { addMonths } from '../routes/menu/selection';
import styles from './DatePicker.module.css';
import { Icon } from './Icon';

interface Props {
  familyId: string;
  selected: IsoDate;
  open: boolean;
  /** Opens or closes from a toggle (this icon or the month): the opener gets focus back on closing. */
  onToggle: (opener: HTMLElement) => void;
  /** The only way to close: choice, Escape or a tap outside. */
  onClose: () => void;
  onSelect: (date: IsoDate) => void;
}

/** A browsable month where only days with a menu can be chosen (round 1). */
export function DatePicker({ familyId, selected, open, onToggle, onClose, onSelect }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [browsed, setBrowsed] = useState<string | null>(null);
  const month = browsed ?? selected.slice(0, 7);
  const dates = useQuery({ ...datesQuery(useQueryDeps(), familyId, month), enabled: open });
  const available = new Set(dates.data ?? []);
  const panel = useRef<HTMLDivElement>(null);
  const focusedThisOpening = useRef(false);

  useEffect(() => {
    if (!open) return;
    setBrowsed(null);
    focusedThisOpening.current = false;
  }, [open]);

  // Initial focus on the chosen day, once per opening: later reads (other months) never move it.
  useEffect(() => {
    if (!open || focusedThisOpening.current || !dates.data) return;
    focusedThisOpening.current = true;
    panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')?.focus();
  }, [open, dates.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!panel.current?.contains(target) && !target.closest?.('[data-date-picker-toggle]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [open, onClose]);

  // Six Monday-first weeks from the Monday on or before the 1st.
  const start = mondayOf(`${month}-01`);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${addDays('2026-10-05', i)}T00:00:00Z`))
  );

  return (
    <div className={styles.picker}>
      <button type="button" className={styles.toggle} data-date-picker-toggle aria-expanded={open} aria-label={t('menu.pickDate')} onClick={(e) => onToggle(e.currentTarget)}>
        <Icon name="calendar" />
      </button>
      {open && (
        <div ref={panel} className={styles.panel} role="dialog" aria-label={t('menu.pickDate')}>
          <div className={styles.month}>
            <button type="button" className={styles.nav} aria-label={t('menu.previousMonth')} onClick={() => setBrowsed(addMonths(month, -1))}>
              <Icon name="chevron-left" />
            </button>
            <strong>{formatMonthYear(locale, `${month}-01`)}</strong>
            <button type="button" className={styles.nav} aria-label={t('menu.nextMonth')} onClick={() => setBrowsed(addMonths(month, 1))}>
              <Icon name="chevron-right" />
            </button>
          </div>
          <div className={styles.grid}>
            {weekdays.map((weekday, i) => <span key={i} className={styles.weekday} aria-hidden="true">{weekday}</span>)}
            {cells.map((date) =>
              date.slice(0, 7) === month ? (
                <button
                  key={date}
                  type="button"
                  className={styles.day}
                  aria-pressed={date === selected}
                  aria-label={formatDayLong(locale, date)}
                  disabled={!available.has(date)}
                  onClick={() => {
                    onSelect(date);
                    onClose();
                  }}
                >
                  {Number(date.slice(8, 10))}
                </button>
              ) : (
                <span key={date} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

`web/src/components/DatePicker.module.css`: le regole dello `<style>` di `prototype/src/lib/components/DatePicker.svelte` con questi nomi di classe: `.date-picker` → `.picker`, `.toggle`, `.panel`, `.month`, `.nav`, `.grid`, `.weekday`, `.day` invariati; `.toggle .icon` diventa `.toggle :global(.icon)`.

- [ ] **Step 6: Pagina del Menu**

`web/src/routes/MenuPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isBlocking, toApiError } from '../api/errors';
import { openingQuery, useQueryDeps, weekQuery } from '../api/queries';
import type { FamilyView } from '../api/types';
import { DatePicker } from '../components/DatePicker';
import { DaySelector } from '../components/DaySelector';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { StateNotice } from '../components/StateNotice';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { isMealPast, localNow, mondayOf, type IsoDate } from '../lib/calendar';
import { rememberMenuDay } from './menu/lastDay';
import { pickSelected } from './menu/selection';
import styles from './MenuPage.module.css';

const route = getRouteApi('/_app/menu');

export function MenuPage() {
  return <FamilyGate>{(family) => <MenuView family={family} />}</FamilyGate>;
}

const notice = (content: ReactNode) => <section className="secondary-view app-view">{content}</section>;

function MenuView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const { day: requested } = route.useSearch();
  const navigate = route.useNavigate();
  const familyId = family.id;

  const opening = useQuery(openingQuery(deps, familyId));
  const openingDay = opening.data?.kind === 'day' ? opening.data : null;
  const weekStart = requested ? mondayOf(requested) : openingDay?.weekStartsOn;
  const week = useQuery({ ...weekQuery(deps, familyId, weekStart ?? ''), enabled: !!weekStart, retry: false });
  const track = useRef<HTMLDivElement>(null);
  // Day the track is already moving to (smooth tap or user scroll): no instant jump over it.
  const settling = useRef<IsoDate | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // One path to open and close the calendar, remembering who opened it (review, finding 13).
  const [pickerOpen, setPickerOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    opener.current?.focus();
  }, []);
  const togglePicker = (element: HTMLElement) => {
    if (pickerOpen) return closePicker();
    opener.current = element;
    setPickerOpen(true);
  };

  const days = week.data?.days.map((d) => d.date) ?? [];
  const selected = pickSelected(days, requested, openingDay?.date);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // A day whose week does not exist (old link, typo) falls back to the opening day.
  const weekMissing = !!requested && week.isError && toApiError(week.error).code === 'not_found';
  useEffect(() => {
    if (weekMissing) void navigate({ search: {}, replace: true });
  }, [weekMissing, navigate]);

  useEffect(() => rememberMenuDay(requested), [requested]);

  useLayoutEffect(() => {
    if (!selected) return;
    if (settling.current === selected) {
      settling.current = null;
      return;
    }
    track.current?.querySelector(`#day-${selected}`)?.scrollIntoView({ block: 'nearest', inline: 'start' });
  }, [selected, week.data?.startsOn]);

  function select(date: IsoDate) {
    if (days.includes(date)) {
      settling.current = date;
      track.current?.querySelector(`#day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      void navigate({ search: { day: date }, replace: true });
    } else {
      void navigate({ search: { day: date } });
    }
  }

  // Debounced instead of `scrollend`, which older iOS Safari versions do not fire.
  function onScroll() {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const element = track.current;
      const shown = element && week.data?.days[Math.round(element.scrollLeft / element.clientWidth)];
      if (!shown || shown.date === selectedRef.current) return;
      settling.current = shown.date;
      void navigate({ search: { day: shown.date }, replace: true });
    }, 120);
  }

  if (opening.isError && isBlocking(opening.error, !!opening.data)) return notice(<QueryError error={opening.error} onRetry={() => void opening.refetch()} />);
  if (!opening.data) return notice(<Loading />);
  if (opening.data.kind === 'no_weeks') return notice(<StateNotice title={t('menu.noWeeks.title')} body={t('menu.noWeeks.body')} />);
  if (week.isError && !weekMissing && isBlocking(week.error, !!week.data)) return notice(<QueryError error={week.error} onRetry={() => void week.refetch()} />);
  if (!week.data || !selected) return notice(<Loading />);

  const now = localNow(family.timeZone);
  return (
    <section className="calendar app-view" aria-label={t('nav.menu')}>
      <nav className="day-navigation" aria-label={t('menu.days')}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.month} data-date-picker-toggle aria-expanded={pickerOpen} onClick={(e) => togglePicker(e.currentTarget)}>
            {formatMonthYear(locale, selected)}
          </button>
          <div className={styles.actions}>
            <DatePicker familyId={familyId} selected={selected} open={pickerOpen} onToggle={togglePicker} onClose={closePicker} onSelect={select} />
            <button type="button" className={styles.action} aria-label={t('menu.shopping')} disabled>
              <Icon name="bag" />
            </button>
          </div>
        </div>
        <DaySelector dates={days} selected={selected} onSelect={select} />
      </nav>
      <div className="week-track" ref={track} tabIndex={0} role="region" aria-label={t('menu.week')} onScroll={onScroll}>
        {week.data.days.map((day) => (
          <section className="day" id={`day-${day.date}`} key={day.date} aria-labelledby={`heading-${day.date}`}>
            <h2 className="visually-hidden" id={`heading-${day.date}`}>{formatDayLong(locale, day.date)}</h2>
            {day.meals.length === 0 && <StateNotice title={t('menu.dayEmpty')} />}
            {day.meals.map((meal) => (
              <RecipeCard
                key={meal.slotId}
                cardKey={meal.slotId}
                label={t(`meal.${meal.mealType}`)}
                kind={meal.kind}
                recipe={meal.recipe}
                freeText={meal.freeText}
                servings={meal.servings}
                ingredients={meal.ingredients}
                note={meal.note}
                rating={meal.rating}
                lastChange={meal.lastChange}
                detailSearch={meal.recipe && meal.canOpenRecipe ? { from: 'menu', day: meal.date, slot: meal.slotId } : null}
                familyId={familyId}
                isPast={isMealPast(meal.date, meal.mealType, now)}
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
```

`web/src/routes/MenuPage.module.css` (dallo `<style>` di `prototype/src/routes/menu/+page.svelte`):
```css
.toolbar { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -4px 0 8px; }
.month { min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 400 1.25rem/1.3 var(--heading-font); text-transform: capitalize; cursor: pointer; }
.month[aria-expanded='true'] { color: var(--green); }
.actions { display: flex; align-items: center; gap: 4px; }
.action { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--ink); }
.action :global(.icon) { width: 26px; height: 26px; }
.action:disabled { color: var(--muted); opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 7: Verifica che passino**

Run: `cd web && npx vitest run src/routes && npm run typecheck`
Expected: PASS. Se un test sui dati demo non trova il testo atteso (nota di Anna, giorni del 12 o del 31 ottobre), controllare `demo-data.json` dopo lo spostamento delle date e correggere il test.

- [ ] **Step 8: Commit**

```bash
git add web/src
git commit -m "Web: Menu con apertura sul giorno, selettore dei giorni, calendario accessibile e schede dei pasti"
```

---

### Task 15: Ricettario

**Files:**
- Create: `web/src/components/RecipeFilters.tsx`, `web/src/components/RecipeFilters.module.css`
- Modify: `web/src/routes/RecipesPage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/RecipesPage.test.tsx`

**Interfaces:**
- Consumes: `searchQuery`, `FamilyGate`, `QueryError`, `isBlocking`, `RecipeCard`, `toRecipeQuery`, `toRecipesSearch`, `PROTEIN_GROUPS`.
- Produces: `<RecipeFilters query onChange>` con `query: RecipeQuery`, `onChange: (query: RecipeQuery) => void`; `RecipesPage`.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { setOnline } from '../test/connectivity';
import { renderApp } from '../test/renderApp';

const WOK = 'Wok di pollo con peperoni, carote e zucchine; riso basmati';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('recipes', () => {
  it('searches by ingredient and keeps the text in the address', async () => {
    const { history } = renderApp('/recipes');
    await screen.findByRole('heading', { name: 'Ricettario', level: 1 });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o ingrediente' }), { target: { value: 'basmati' } });
    expect(await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
    await waitFor(() => expect(history.location.search).toContain('basmati'));
  });
  it('opens filters, applies one and marks the toggle as active', async () => {
    const { history } = renderApp('/recipes');
    const toggle = await screen.findByRole('button', { name: 'Filtri e ordinamento' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('Tempo massimo'), { target: { value: '15' } });
    await waitFor(() => expect(history.location.search).toContain('time=15'));
    expect(toggle.getAttribute('data-active')).toBe('true');
    expect(screen.queryByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeNull();
  });
  it('offers to clear filters when nothing matches', async () => {
    const { history } = renderApp('/recipes?q=zzzz');
    expect(await screen.findByRole('heading', { name: 'Nessuna ricetta trovata' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('shows the error instead of cached recipes when a read is refused, with a retry', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const search = api.recipes.search;
    let calls = 0;
    api.recipes.search = (input) => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : search(input));
    renderApp('/recipes', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
  });
  it('keeps cached recipes readable offline', async () => {
    renderApp('/recipes');
    await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) });
    act(() => setOnline(false));
    // Returning to the app re-checks the data; offline the read pauses and the copy stays.
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
    expect(screen.getByText('Sei offline: puoi consultare i dati già caricati.')).toBeTruthy();
  });
  it('reads sorting from the address', async () => {
    renderApp('/recipes?sort=rating&dir=reverse');
    fireEvent.click(await screen.findByRole('button', { name: 'Filtri e ordinamento' }));
    expect((screen.getByLabelText('Ordina per') as HTMLSelectElement).value).toBe('rating');
    expect(screen.getByRole('button', { name: 'Inverti l’ordine' }).getAttribute('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/RecipesPage.test.tsx`
Expected: FAIL, nessun campo di ricerca nel segnaposto.

- [ ] **Step 3: Filtri**

`web/src/components/RecipeFilters.tsx` (da `prototype/src/lib/components/RecipeFilters.svelte`):
```tsx
import { useEffect, useState } from 'react';
import { PROTEIN_GROUPS, type ProteinGroup, type RecipeQuery, type RecipeSort } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import type { MealType } from '../lib/calendar';
import { Icon } from './Icon';
import styles from './RecipeFilters.module.css';

const SORTS: RecipeSort[] = ['name', 'rating', 'added', 'lastEaten'];

export function RecipeFilters({ query, onChange }: { query: RecipeQuery; onChange: (query: RecipeQuery) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Local text keeps the caret steady while the address follows; external changes (clear) win.
  const [text, setText] = useState(query.text ?? '');
  useEffect(() => setText(query.text ?? ''), [query.text]);
  const set = (patch: Partial<RecipeQuery>) => onChange({ ...query, ...patch });
  const num = (value: string) => (value ? Number(value) : undefined);
  const active = !!(query.mealType || query.maxMinutes || query.proteinGroup || query.minStars || query.reversed || (query.sort && query.sort !== 'name'));

  return (
    <form className={styles.filters} role="search" onSubmit={(e) => e.preventDefault()}>
      <div className={styles.searchRow}>
        <label className={styles.search}>
          <span className="visually-hidden">{t('recipes.search')}</span>
          <input
            type="search"
            placeholder={t('recipes.search')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              set({ text: e.target.value || undefined });
            }}
          />
        </label>
        <button type="button" className={styles.toggle} data-active={active} aria-expanded={open} aria-controls="recipe-filters" aria-label={t('recipes.toggleFilters')} onClick={() => setOpen(!open)}>
          <Icon name="filter" />
        </button>
      </div>
      <fieldset id="recipe-filters" className={styles.fields} hidden={!open}>
        <legend className="visually-hidden">{t('recipes.filters')}</legend>
        <div className={styles.sort}>
          <label>
            {t('recipes.sort')}
            <select value={query.sort ?? 'name'} onChange={(e) => set({ sort: e.target.value === 'name' ? undefined : (e.target.value as RecipeSort) })}>
              {SORTS.map((sort) => <option key={sort} value={sort}>{t(`recipes.sort.${sort}`)}</option>)}
            </select>
          </label>
          <button type="button" className={styles.reverse} aria-pressed={!!query.reversed} aria-label={t('recipes.reverse')} onClick={() => set({ reversed: query.reversed ? undefined : true })}>
            <Icon name="sort" />
          </button>
        </div>
        <label>
          {t('recipes.filter.meal')}
          <select value={query.mealType ?? ''} onChange={(e) => set({ mealType: (e.target.value || undefined) as MealType | undefined })}>
            <option value="">{t('recipes.filter.any')}</option>
            <option value="lunch">{t('meal.lunch')}</option>
            <option value="dinner">{t('meal.dinner')}</option>
          </select>
        </label>
        <label>
          {t('recipes.filter.time')}
          <select value={String(query.maxMinutes ?? '')} onChange={(e) => set({ maxMinutes: num(e.target.value) })}>
            <option value="">{t('recipes.filter.any')}</option>
            {[15, 30, 45].map((minutes) => <option key={minutes} value={String(minutes)}>{t('recipes.filter.minutes', { count: minutes })}</option>)}
          </select>
        </label>
        <label>
          {t('recipes.filter.group')}
          <select value={query.proteinGroup ?? ''} onChange={(e) => set({ proteinGroup: (e.target.value || undefined) as ProteinGroup | undefined })}>
            <option value="">{t('recipes.filter.any')}</option>
            {PROTEIN_GROUPS.map((group) => <option key={group} value={group}>{t(`group.${group}`)}</option>)}
          </select>
        </label>
        <label>
          {t('recipes.filter.stars')}
          <select value={String(query.minStars ?? '')} onChange={(e) => set({ minStars: num(e.target.value) })}>
            <option value="">{t('recipes.filter.any')}</option>
            {[3, 4].map((stars) => <option key={stars} value={String(stars)}>{t('recipes.filter.starsAtLeast', { count: stars })}</option>)}
          </select>
        </label>
      </fieldset>
    </form>
  );
}
```

`web/src/components/RecipeFilters.module.css`: le regole dello `<style>` di `prototype/src/lib/components/RecipeFilters.svelte` con queste corrispondenze: `.search-row` → `.searchRow`; `.filter-toggle` → `.toggle` (con `.toggle[data-active='true']` al posto di `.filter-toggle.active`); `fieldset` → `.fields` (con `.fields[hidden]`); `label`, `select`, `input[type='search']` dentro `.filters` (per esempio `.filters label`); `.sort`, `.reverse` invariati; le `.icon` diventano `:global(.icon)`.

- [ ] **Step 4: Pagina del Ricettario**

`web/src/routes/RecipesPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { isBlocking } from '../api/errors';
import { keepPreviousWithin, searchQuery, useQueryDeps } from '../api/queries';
import type { FamilyView, RecipeQuery } from '../api/types';
import { FamilyGate } from '../components/FamilyGate';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeFilters } from '../components/RecipeFilters';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';
import { toRecipeQuery, toRecipesSearch } from './search';

const route = getRouteApi('/_app/recipes');

export function RecipesPage() {
  return <FamilyGate>{(family) => <RecipesView family={family} />}</FamilyGate>;
}

function RecipesView({ family }: { family: FamilyView }) {
  const t = useT();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const query = toRecipeQuery(search);
  const deps = useQueryDeps();
  const options = searchQuery(deps, family.id, query);
  // Previous results only while filters or sorting change (second review, C7).
  const results = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale']) });
  const update = (next: RecipeQuery) => void navigate({ search: toRecipesSearch(next), replace: true });
  // Cached recipes stay visible only when the device is offline (review, finding 2).
  const blocked = results.isError && isBlocking(results.error, !!results.data);
  const items = blocked ? undefined : results.data;

  return (
    <section className="secondary-view app-view">
      <div className="page-column wide">
        <header className="page-header">
          <h1 className="page-title">{t('recipes.title')}</h1>
        </header>
        <RecipeFilters query={query} onChange={update} />
        {blocked && <QueryError error={results.error} onRetry={() => void results.refetch()} />}
        {!blocked && results.isPending && <Loading />}
        {items?.length === 0 && (
          <StateNotice title={t('recipes.noResults.title')} body={t('recipes.noResults.body')}>
            <button type="button" className="text-button" onClick={() => update({})}>{t('recipes.reset')}</button>
          </StateNotice>
        )}
        {!!items?.length && (
          <div className="recipe-grid">
            {items.map((item) => (
              <RecipeCard
                key={item.recipe.id}
                cardKey={item.recipe.id}
                label={item.recipe.proteinGroup ? t(`group.${item.recipe.proteinGroup}`) : null}
                kind="recipe"
                recipe={item.recipe}
                freeText={null}
                servings={item.servings}
                ingredients={item.ingredients}
                note={null}
                rating={item.rating}
                lastChange={null}
                detailSearch={{ from: 'recipes' }}
                familyId={family.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

`web/src/design/global.css`, in fondo (il Ricettario usa la griglia larga, non la colonna da 720 px delle pagine secondarie):
```css
.page-column.wide { max-width: 1200px; }
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/routes/RecipesPage.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "Web: Ricettario con ricerca, filtri e ordinamento nell'indirizzo"
```

---

### Task 16: Scheda ricetta

**Files:**
- Create: `web/src/components/ServingsStepper.tsx`, `web/src/routes/RecipePage.module.css`
- Modify: `web/src/routes/RecipePage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/RecipePage.test.tsx`

**Interfaces:**
- Consumes: `recipeQuery`, `FamilyGate`, `QueryError`, `isBlocking`, `RatingStars`, `IngredientList`, `PageHeader`, `safeSourceUrl`, `sourceLine`, `formatDayLong`, `RecipeSearch` (con `slot`).
- Produces: `<ServingsStepper value min? max? onChange>`; `RecipePage`.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../api/fake/fakeApi';
import { renderApp } from '../test/renderApp';

const WOK = 'wok-pollo-peperoni-riso-basmati';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('recipe page', () => {
  it('shows source, rating, servings and ingredients, with a way back to the menu day', async () => {
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-08`);
    const title = await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(title.getAttribute('href')).toBe('https://ricetta.it/riso-basmati-con-pollo-e-verdure');
    expect(screen.getByRole('link', { name: 'Menu', exact: false }).getAttribute('href')).toBe('/menu?day=2026-10-08');
    expect(screen.getByText('Dosi della fonte per 6 porzioni')).toBeTruthy();
    expect(row('Riso basmati').textContent).toContain('300 g');
    expect(screen.getByRole('group', { name: 'Il tuo voto' })).toBeTruthy();
  });
  it('scales the ingredients with the servings and keeps them in the address', async () => {
    const { history } = renderApp(`/recipes/${WOK}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(history.location.search).toContain('servings=7'));
    await waitFor(() => expect(row('Riso basmati').textContent).toContain('350 g'));
  });
  it('does not go below one serving', async () => {
    renderApp(`/recipes/${WOK}?servings=1`);
    expect(((await screen.findByRole('button', { name: 'Una porzione in meno' })) as HTMLButtonElement).disabled).toBe(true);
  });
  it('lists the last times the family had it', async () => {
    renderApp('/recipes/omelette-spinaci-montasio');
    expect(await screen.findByText('lunedì 21 settembre, Cena')).toBeTruthy();
  });
  it('names the book and its pages under the title', async () => {
    renderApp('/recipes/burrito-vegan');
    expect(await screen.findByText(/^Libro: .+, pp\. 110-111$/)).toBeTruthy();
  });
  it('passes the meal reference to the read when opened from a meal', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.spyOn(api.recipes, 'get');
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-05&slot=2026-10-05-dinner`, { api });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ recipeId: WOK, slotId: '2026-10-05-dinner' }));
  });
  it('says when a recipe does not exist', async () => {
    renderApp('/recipes/nope');
    expect(await screen.findByText('Contenuto non trovato.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/RecipePage.test.tsx`
Expected: FAIL, il segnaposto non mostra la ricetta.

- [ ] **Step 3: Contatore delle porzioni**

`web/src/components/ServingsStepper.tsx`:
```tsx
import { useT } from '../i18n/LocaleProvider';

/** − value + with 44 px buttons (round 2 and 4 pattern). */
export function ServingsStepper({ value, min = 1, max = 50, onChange }: { value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const t = useT();
  return (
    <div className="stepper" role="group" aria-label={t('recipe.servingsLabel')}>
      <button type="button" className="stepper-button" aria-label={t('recipe.lessServings')} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className="stepper-value" aria-live="polite">{t('meal.servings', { count: value })}</output>
      <button type="button" className="stepper-button" aria-label={t('recipe.moreServings')} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
```

`web/src/design/global.css`, in fondo:
```css
.stepper { display: inline-flex; align-items: center; gap: 12px; }
.stepper-button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 700 1.25rem/1 var(--text-font); cursor: pointer; }
.stepper-button:disabled { opacity: 0.4; cursor: not-allowed; }
.stepper-value { min-width: 9ch; text-align: center; font-weight: 700; }
```

- [ ] **Step 4: Pagina della scheda**

`web/src/routes/RecipePage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { isBlocking } from '../api/errors';
import { keepPreviousWithin, recipeQuery, useQueryDeps } from '../api/queries';
import type { FamilyView } from '../api/types';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { IngredientList } from '../components/IngredientList';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { QueryError } from '../components/QueryError';
import { RatingStars } from '../components/RatingStars';
import { ServingsStepper } from '../components/ServingsStepper';
import { safeSourceUrl, sourceLine } from '../components/source';
import { formatDayLong } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import styles from './RecipePage.module.css';

const route = getRouteApi('/_app/recipes/$recipeId');

export function RecipePage() {
  return <FamilyGate>{(family) => <RecipeView family={family} />}</FamilyGate>;
}

function RecipeView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { recipeId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // The meal reference travels with the read: wave 2 shows the version that meal was eaten with.
  const options = recipeQuery(useQueryDeps(), family.id, recipeId, search.servings, search.slot);
  // Previous data only while the servings change (second review, C7).
  const detail = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale', 'recipeId', 'slotId']) });

  // Back to the menu day, or to the catalogue with its filters (history) when we came from there.
  const back =
    search.from === 'menu' ? (
      <Link to="/menu" search={search.day ? { day: search.day } : {}} className="page-back">
        <Icon name="chevron-left" />{t('nav.menu')}
      </Link>
    ) : (
      <Link
        to="/recipes"
        className="page-back"
        onClick={(event) => {
          if (search.from === 'recipes' && router.history.canGoBack()) {
            event.preventDefault();
            router.history.back();
          }
        }}
      >
        <Icon name="chevron-left" />{t('nav.recipes')}
      </Link>
    );
  const page = (content: ReactNode) => (
    <section className="secondary-view app-view"><div className="page-column">{content}</div></section>
  );

  if (detail.isError && isBlocking(detail.error, !!detail.data)) {
    return page(<><header className="page-header">{back}</header><QueryError error={detail.error} onRetry={() => void detail.refetch()} /></>);
  }
  if (!detail.data) return page(<Loading />);

  const { recipe, rating, servings, baseServings, ingredients, history } = detail.data;
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  // Books, home recipes and videos are named under the title (review, finding 12).
  const source = recipe.sourceType === 'web' ? null : sourceLine(recipe, t);
  return (
    <section className="secondary-view app-view">
      <article className="page-column">
        {recipe.photo && <img className={styles.photo} src={recipe.photo} alt="" />}
        {/* The title is always the link to the source when there is one (spec section 14). */}
        <PageHeader
          back={back}
          title={
            sourceUrl ? (
              <a className="recipe-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {recipe.name} <Icon name="arrow" /><span className="visually-hidden">({t('source.open')})</span>
              </a>
            ) : (
              recipe.name
            )
          }
        />
        {source && <p className="meal-source">{source}</p>}
        <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={family.id} />
        {recipe.description && <p className="description">{recipe.description}</p>}
        {recipe.durationMinutes && <p className="meal-meta"><Icon name="clock" />{t('meal.minutes', { count: recipe.durationMinutes })}</p>}
        <section className={styles.section} aria-labelledby="ingredients-title">
          <h2 id="ingredients-title" className={styles.heading}>{t('meal.ingredients')}</h2>
          <ServingsStepper value={servings} onChange={(value) => void navigate({ search: { ...search, servings: value }, replace: true })} />
          {baseServings && <p className="meta-line">{t('recipe.baseServings', { count: baseServings })}</p>}
          <IngredientList ingredients={ingredients} />
        </section>
        <section className={styles.section} aria-labelledby="history-title">
          <h2 id="history-title" className={styles.heading}>{t('recipe.history')}</h2>
          {history.length === 0 ? (
            <p className="meta-line">{t('recipe.historyEmpty')}</p>
          ) : (
            <ul className="row-list">
              {history.map((h) => (
                <li key={`${h.date}-${h.mealType}`}>{t('recipe.historyItem', { day: formatDayLong(locale, h.date), meal: t(`meal.${h.mealType}`) })}</li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </section>
  );
}
```

`web/src/routes/RecipePage.module.css`:
```css
.photo { display: block; width: calc(100% + 32px); margin: 0 -16px; aspect-ratio: 16 / 9; object-fit: cover; }
.section { margin: 24px 0 0; padding: 16px 18px; background: var(--paper); box-shadow: var(--card-shadow); }
.heading { margin: 0 0 12px; font: 400 1.25rem/1.3 var(--heading-font); }
@media (min-width: 768px) { .photo { width: 100%; margin: 16px 0 0; } }
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/routes/RecipePage.test.tsx && npm run typecheck`
Expected: PASS. Verificare con Context7 che `router.history.canGoBack()` esista in TanStack Router 1.170; se manca, usare `window.history.length > 1`.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "Web: scheda ricetta con fonte, voto, porzioni, ingredienti e ultime volte"
```

---

### Task 17: Profilo e lingua

**Files:**
- Create: `web/src/routes/ProfilePage.module.css`
- Modify: `web/src/routes/ProfilePage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `useFamily` (Task 10); `useAuth`; `useSignOut`, `useChooseLocale` (Task 9); `useLocale`, `LOCALES`; `QueryError`, `Icon`.
- Produces: `ProfilePage`.

La scheda Account (lingua ed «Esci») è sempre disponibile, anche se la lettura del profilo fallisce o la persona non ha famiglie (review, rilievo 9). La lingua scelta qui passa da `useChooseLocale`: preferenza del dispositivo in modalità finta, scelta temporanea dell'utente in modalità vera (Task 9).

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/routes/ProfilePage.test.tsx`:
```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { DEMO_USER } from '../auth/backend';
import { createStubBackend } from '../test/stubBackend';
import { renderApp } from '../test/renderApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('profile', () => {
  it('shows the person, the family and the future destinations as placeholders', async () => {
    renderApp('/profile', { backend: createStubBackend(DEMO_USER, 'fake') });
    expect(await screen.findByRole('heading', { name: 'Federico' })).toBeTruthy();
    expect(screen.getByText('federico@example.com')).toBeTruthy();
    expect(screen.getByText('Famiglia Folloni')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Membri e inviti/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Esci' })).toBeNull();
  });
  it('switches the whole app to English, recipe texts included', async () => {
    renderApp('/profile');
    fireEvent.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en-GB');
    fireEvent.click(screen.getByRole('link', { name: 'Recipes' }));
    expect(await screen.findByRole('heading', { name: /Chicken stir-fry/ })).toBeTruthy();
  });
  it('keeps language and sign-out available when the profile cannot be read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.me.get = () => Promise.reject(new ApiError('unknown'));
    const backend = createStubBackend(DEMO_USER, 'supabase');
    renderApp('/profile', { backend, api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.getByText('federico@example.com')).toBeTruthy();
    expect(screen.getByLabelText('English')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy();
  });
  it('signs out in real mode, clearing the session, and goes to the sign-in page', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(backend.signOutCalls).toBe(1);
  });
  it('does not carry a person\'s language choice over to the next one', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile', { backend });
    fireEvent.click(await screen.findByLabelText('English'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    act(() => backend.setUser({ id: 'user-anna', email: 'anna@example.com' }));
    // Back to the page requested before sign-in, in Anna's profile language (Italian in the fake client).
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
    expect(await screen.findByText('Lingua')).toBeTruthy();
    expect(screen.queryByText('Language')).toBeNull();
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/ProfilePage.test.tsx`
Expected: FAIL, il segnaposto non mostra il nome.

- [ ] **Step 3: Implementa**

`web/src/routes/ProfilePage.tsx`:
```tsx
import { isBlocking } from '../api/errors';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { LOCALES, type MessageKey } from '../i18n/translate';
import { useChooseLocale, useSignOut } from '../session/SessionScope';
import { useFamily, useMe } from '../session/useFamily';
import styles from './ProfilePage.module.css';

// Destinations that arrive with wave 2 (spec, Profilo): visible, disabled.
const PLACEHOLDERS: { icon: IconName; label: MessageKey }[] = [
  { icon: 'users', label: 'profile.members' },
  { icon: 'gear', label: 'profile.settings' },
  { icon: 'ban', label: 'profile.exclusions' }
];

export function ProfilePage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const me = useMe();
  const family = useFamily();
  const meBlocked = me.isError && isBlocking(me.error, !!me.data);
  // No cached profile next to a blocking error (second review, C8).
  const profile = meBlocked ? undefined : me.data;
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');

  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <header className={styles.header}>
          <h1 className={styles.name}>{profile?.user.displayName ?? email}</h1>
          {profile && <p className={styles.email}>{email}</p>}
        </header>
        {meBlocked && <QueryError error={me.error} onRetry={() => void me.refetch()} />}
        {!meBlocked && !me.data && <Loading />}
        {family.status === 'ready' && (
          <section className="settings-card" aria-labelledby="family-title">
            <h2 id="family-title">{t('profile.family')}</h2>
            <ul className="row-list">
              <li>
                <span className="row-main">{family.family.name}<small>{t(`profile.role.${family.family.role}`)}</small></span>
              </li>
              {PLACEHOLDERS.map((row) => (
                <li key={row.label}>
                  <button type="button" className="row-link" disabled>
                    <Icon name={row.icon} />
                    <span className="row-main">{t(row.label)}<small>{t('common.soon')}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* Always available: language and sign-out must work even without a profile or a family. */}
        <section className="settings-card" aria-labelledby="account-title">
          <h2 id="account-title">{t('profile.account')}</h2>
          <fieldset className={styles.language}>
            <legend className={styles.legend}>{t('profile.language')}</legend>
            {LOCALES.map((option) => (
              <label key={option} className="choice">
                <input type="radio" name="locale" checked={locale === option} onChange={() => chooseLocale(option)} />
                {t(`profile.language.${option}`)}
              </label>
            ))}
          </fieldset>
          {backend.mode === 'supabase' && (
            <button type="button" className="text-button" onClick={() => void signOut()}>{t('profile.signOut')}</button>
          )}
        </section>
      </div>
    </section>
  );
}
```
Quando la lettura del profilo fallisce, il titolo mostra l'email della sessione; il test «keeps language…» la trova nel titolo.

`web/src/routes/ProfilePage.module.css`:
```css
.header { padding: max(20px, env(safe-area-inset-top)) 0 20px; }
.name { margin: 0; font: 400 1.75rem/1.3 var(--heading-font); overflow-wrap: anywhere; }
.email { margin: 4px 0 0; color: var(--muted); }
.language { margin: 0 0 16px; padding: 0; border: 0; }
.legend { margin-bottom: 4px; font-size: 0.875rem; font-weight: 700; }
```

`web/src/design/global.css`, in fondo:
```css
.row-link:disabled { color: var(--muted); cursor: not-allowed; }
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/routes/ProfilePage.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "Web: Profilo con famiglia, destinazioni future, lingua per identità e uscita sempre disponibili"
```

---

### Task 18: PWA e service worker

> Seconda review: navigazioni dalla shell installata, mai riscritta durante l'uso (C6).


**Files:**
- Create: `web/src/pwa/sw-rules.ts`, `web/src/pwa/precache.ts`, `web/src/pwa/sw-core.ts`, `web/src/pwa/register.ts`, `web/public/manifest.webmanifest`, `web/public/icons/icon.svg`, `web/scripts/make-icons.sh`, `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`, `web/public/icons/apple-touch-icon.png`
- Modify: `web/src/pwa/sw.ts` (sostituisce il segnaposto), `web/vite.config.ts`, `web/src/main.tsx`
- Test: `web/src/pwa/sw-rules.test.ts`, `web/src/pwa/precache.test.ts`, `web/src/pwa/sw-core.test.ts`

**Interfaces:**
- Produces:
  - `type Strategy = 'shell' | 'asset' | 'passthrough'`; `strategyFor(request: { url: string; method: string; mode: string; origin: string }): Strategy`; `cacheName(version)`, `staleCaches(names, version)`, `SHELL_URL = '/index.html'`, `PRECACHE_URL = '/precache.json'`, `SERVER_PREFIXES`
  - `precacheList(bundleFiles: string[], fontFiles: string[]): string[]`
  - `interface WorkerDeps { caches: CachesLike; fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>; version: string; origin: string }`; `install(deps)`, `activate(deps)`, `respond(info: { url; method; mode }, target: RequestInfo, deps): Promise<Response>`
  - `registerServiceWorker(): void`

Ciclo deciso dal coordinatore (review, rilievo 7): l'installazione mette in cache la shell completa (HTML, JavaScript e CSS con hash, font) elencata dalla build in `precache.json`; se un file manca l'installazione fallisce, la cache parziale si cancella e resta la versione precedente; le vecchie cache si cancellano solo all'attivazione, cioè a nuova cache completa. La logica sta in `sw-core.ts` con cache e rete come dipendenze, così i tre scenari si provano in Node.

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/pwa/sw-rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cacheName, staleCaches, strategyFor } from './sw-rules';

const origin = 'https://cosasimangia.example';
const req = (path: string, mode = 'cors', method = 'GET', base = origin) => ({ url: `${base}${path}`, method, mode, origin });

describe('service worker rules', () => {
  it('serves navigations from the network, falling back to the cached shell', () => {
    expect(strategyFor(req('/menu?day=2026-10-08', 'navigate'))).toBe('shell');
    expect(strategyFor(req('/recipes/wok', 'navigate'))).toBe('shell');
  });
  it('caches hashed assets, fonts and photos', () => {
    expect(strategyFor(req('/assets/index-abc123.js'))).toBe('asset');
    expect(strategyFor(req('/assets/fonts/roboto-regular.woff2'))).toBe('asset');
  });
  it('never touches server routes, other origins or writes', () => {
    expect(strategyFor(req('/api/rpc/menu/getWeek', 'cors', 'POST'))).toBe('passthrough');
    expect(strategyFor(req('/api/rpc/menu/getWeek'))).toBe('passthrough');
    expect(strategyFor(req('/api/openapi.json', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/mcp', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/shopping-lists/abc', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/internal/jobs/weekly', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/sw.js'))).toBe('passthrough');
    expect(strategyFor(req('/precache.json'))).toBe('passthrough');
    expect(strategyFor(req('/assets/x.js', 'cors', 'GET', 'https://cdn.example'))).toBe('passthrough');
  });
  it('names caches by build and finds the old ones', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b', 'other'], 'b')).toEqual(['cosasimangia-a']);
  });
});
```

`web/src/pwa/precache.test.ts`:
```ts
import { expect, it } from 'vitest';
import { precacheList } from './precache';

it('lists the shell: index, hashed scripts and styles, fonts; never the worker or the list itself', () => {
  expect(precacheList(['index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'sw.js', 'precache.json', 'assets/logo-c3.svg', '.vite/manifest.json'], ['roboto-regular.woff2']))
    .toEqual(['/index.html', '/assets/index-a1.js', '/assets/index-b2.css', '/assets/fonts/roboto-regular.woff2']);
});
```

`web/src/pwa/sw-core.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { activate, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';

const origin = 'https://app.example';
const url = (path: string) => `${origin}${path}`;

/** In-memory Cache Storage keyed by URL, enough for the worker's needs. */
function memoryCaches(): CachesLike & { names(): string[] } {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: RequestInfo) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const open = async (name: string): Promise<CacheLike> => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (request) => store.get(keyOf(request))?.clone(),
      put: async (request, response) => void store.set(keyOf(request), response)
    };
  };
  return {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const store of stores.values()) {
        const found = store.get(keyOf(request));
        if (found) return found.clone();
      }
      return undefined;
    },
    names: () => [...stores.keys()]
  };
}

/** A deployed build on the network; `offline` and `failing` simulate trouble. */
function network(build: Record<string, string>) {
  const state = { offline: false, failing: new Set<string>() };
  const fetch = async (input: RequestInfo) => {
    const path = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
    if (state.offline) throw new TypeError('Failed to fetch');
    if (state.failing.has(path)) return new Response('error', { status: 500 });
    const body = build[path];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
  };
  return { fetch, state };
}

const buildA = { '/precache.json': JSON.stringify(['/index.html', '/assets/a.js']), '/index.html': 'index A', '/assets/a.js': 'script A' };
const buildB = { '/precache.json': JSON.stringify(['/index.html', '/assets/b.js']), '/index.html': 'index B', '/assets/b.js': 'script B' };
const navigate = (path: string) => ({ url: url(path), method: 'GET', mode: 'navigate' });
const asset = (path: string) => ({ url: url(path), method: 'GET', mode: 'cors' });
const text = async (response: Response) => response.text();

describe('service worker lifecycle', () => {
  it('opens offline after the first visit: shell and its assets are all installed', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps: WorkerDeps = { caches, fetch: net.fetch, version: 'A', origin };
    await install(deps);
    await activate(deps);
    net.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), deps))).toBe('script A');
  });
  it('updates A→B keeping A until B is complete, then opens offline on B', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA: WorkerDeps = { caches, fetch: netA.fetch, version: 'A', origin };
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    const depsB: WorkerDeps = { caches, fetch: netB.fetch, version: 'B', origin };
    await install(depsB);
    // B waits for the app to be reopened: A still serves with its own cache.
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B']);
    await activate(depsB);
    expect(caches.names()).toEqual(['cosasimangia-B']);
    netB.state.offline = true;
    expect(await text(await respond(navigate('/recipes'), url('/recipes'), depsB))).toBe('index B');
    expect(await text(await respond(asset('/assets/b.js'), url('/assets/b.js'), depsB))).toBe('script B');
  });
  it('keeps A in service when the install of B is interrupted', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA: WorkerDeps = { caches, fetch: netA.fetch, version: 'A', origin };
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    netB.state.failing.add('/assets/b.js');
    await expect(install({ caches, fetch: netB.fetch, version: 'B', origin })).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-A']);
    netA.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), depsA))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), depsA))).toBe('script A');
  });
  it('refreshes the cached shell from the network while online', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps: WorkerDeps = { caches, fetch: net.fetch, version: 'A', origin };
    await install(deps);
    await activate(deps);
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toBe('index A');
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/pwa`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Regole, elenco della shell e logica del service worker**

`web/src/pwa/sw-rules.ts`:
```ts
export type Strategy = 'shell' | 'asset' | 'passthrough';

/** Routes answered by the Worker, never by the app shell (spec section 1, routes table). */
export const SERVER_PREFIXES = ['/api', '/mcp', '/internal', '/shopping-lists', '/.well-known', '/openapi.json', '/sw.js', '/precache.json'];
export const SHELL_URL = '/index.html';
export const PRECACHE_URL = '/precache.json';
const PREFIX = 'cosasimangia-';

export function strategyFor(request: { url: string; method: string; mode: string; origin: string }): Strategy {
  if (request.method !== 'GET') return 'passthrough';
  const url = new URL(request.url);
  if (url.origin !== request.origin) return 'passthrough';
  if (SERVER_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return 'passthrough';
  if (request.mode === 'navigate') return 'shell';
  if (url.pathname.startsWith('/assets/')) return 'asset';
  return 'passthrough';
}

export const cacheName = (version: string) => `${PREFIX}${version}`;

export const staleCaches = (names: string[], version: string) =>
  names.filter((name) => name.startsWith(PREFIX) && name !== cacheName(version));
```

`web/src/pwa/precache.ts`:
```ts
/** The shell the worker installs: index, hashed scripts and styles, fonts (not the photos, cached on use). */
export function precacheList(bundleFiles: string[], fontFiles: string[]): string[] {
  const bundle = bundleFiles.filter((file) => file.startsWith('assets/') && /\.(js|css)$/.test(file)).map((file) => `/${file}`);
  const fonts = fontFiles.filter((file) => file.endsWith('.woff2')).map((file) => `/assets/fonts/${file}`);
  return ['/index.html', ...bundle, ...fonts];
}
```

`web/src/pwa/sw-core.ts`:
```ts
import { cacheName, PRECACHE_URL, SHELL_URL, staleCaches, strategyFor } from './sw-rules';

export interface CacheLike {
  match(request: RequestInfo): Promise<Response | undefined>;
  put(request: RequestInfo, response: Response): Promise<void>;
}
export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: RequestInfo): Promise<Response | undefined>;
}
export interface WorkerDeps {
  caches: CachesLike;
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  version: string;
  origin: string;
}

/** All or nothing: a missing file fails the install, the partial cache goes and the previous version stays. */
export async function install({ caches, fetch, version }: WorkerDeps): Promise<void> {
  const name = cacheName(version);
  try {
    const listing = await fetch(PRECACHE_URL, { cache: 'no-store' });
    if (!listing.ok) throw new Error(`precache list: ${listing.status}`);
    const urls = (await listing.json()) as string[];
    const responses = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
        return [url, response] as const;
      })
    );
    const cache = await caches.open(name);
    for (const [url, response] of responses) await cache.put(url, response);
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}

/** Runs only after a complete install: now the older versions can go. */
export async function activate({ caches, version }: WorkerDeps): Promise<void> {
  const names = await caches.keys();
  await Promise.all(staleCaches(names, version).map((name) => caches.delete(name)));
}

export async function respond(info: { url: string; method: string; mode: string }, target: RequestInfo, deps: WorkerDeps): Promise<Response> {
  const { caches, fetch, version, origin } = deps;
  const cache = await caches.open(cacheName(version));
  const strategy = strategyFor({ ...info, origin });
  if (strategy === 'shell') {
    try {
      const response = await fetch(target);
      if (response.ok) await cache.put(SHELL_URL, response.clone());
      return response;
    } catch {
      return (await cache.match(SHELL_URL)) ?? Response.error();
    }
  }
  if (strategy === 'asset') {
    const cached = (await cache.match(info.url)) ?? (await caches.match(info.url));
    if (cached) return cached;
    const response = await fetch(target);
    if (response.ok) await cache.put(info.url, response.clone());
    return response;
  }
  return fetch(target);
}
```

`web/src/pwa/sw.ts`:
```ts
import { activate, install, respond, type WorkerDeps } from './sw-core';
import { strategyFor } from './sw-rules';

// Built by Vite as a second entry (/sw.js). Minimal local types: the project compiles with the DOM library only.
interface ExtendableEventLike extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike { readonly request: Request; respondWith(response: Promise<Response>): void }
interface WorkerScope {
  readonly location: Location;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

const worker = self as unknown as WorkerScope;
const deps: WorkerDeps = { caches, fetch: (input, init) => fetch(input, init), version: __BUILD_VERSION__, origin: worker.location.origin };

// No skipWaiting: a new version takes over when the app is reopened, with its cache already complete.
worker.addEventListener('install', (event) => event.waitUntil(install(deps)));
worker.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
worker.addEventListener('fetch', (event) => {
  const info = { url: event.request.url, method: event.request.method, mode: event.request.mode };
  if (strategyFor({ ...info, origin: deps.origin }) === 'passthrough') return;
  event.respondWith(respond(info, event.request, deps));
});
```

`web/src/pwa/register.ts`:
```ts
/** Production only, and only where the browser allows it (HTTPS or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
```

`web/src/main.tsx`: aggiungere `import { registerServiceWorker } from './pwa/register';` e, dopo `createRoot(...).render(...)`, la riga `registerServiceWorker();`.

- [ ] **Step 4: `precache.json` generato dalla build**

`web/vite.config.ts`, versione completa:
```ts
import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { precacheList } from './src/pwa/precache';

// One value per build: cache names of the service worker and buster of the persisted query cache.
const buildVersion = new Date().toISOString();
const fontsDir = fileURLToPath(new URL('./public/assets/fonts', import.meta.url));

/** Emits /precache.json: the shell the service worker installs as a whole (review, finding 7). */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const fonts = readdirSync(fontsDir);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(precacheList(Object.keys(bundle), fonts)) });
    }
  };
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
  server: { port: 5174 },
  build: {
    rollupOptions: {
      // The service worker is a second entry, emitted at the root as /sw.js.
      input: { main: 'index.html', sw: 'src/pwa/sw.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
```
`index.html` non passa da `generateBundle` come chiave `assets/…`, ma `precacheList` lo mette sempre in testa. Verificare con Context7 (`/vitejs/vite`, «plugin generateBundle emitFile») che in Vite 8 l'hook e `emitFile` funzionino così.

- [ ] **Step 5: Manifest e icone**

`web/public/manifest.webmanifest`:
```json
{
  "name": "Cosa si mangia",
  "short_name": "Cosa si mangia",
  "start_url": "/menu",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FAF8F3",
  "theme_color": "#FAF8F3",
  "lang": "it",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`web/public/icons/icon.svg` (piatto crema su verde, dentro la zona sicura delle icone mascherabili):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#067A46"/>
  <circle cx="256" cy="256" r="150" fill="#FAF8F3"/>
  <circle cx="256" cy="256" r="100" fill="none" stroke="#067A46" stroke-width="12"/>
</svg>
```

`web/scripts/make-icons.sh`:
```bash
#!/bin/sh
# Rasterises the app icon with ImageMagick (run once; the PNGs are committed).
set -e
cd "$(dirname "$0")/../public/icons"
for size in 192 512; do magick -background none -density 384 icon.svg -resize "${size}x${size}" "icon-${size}.png"; done
magick -background none -density 384 icon.svg -resize 180x180 apple-touch-icon.png
```

Run: `cd web && sh scripts/make-icons.sh && file public/icons/*.png`
Expected: tre PNG con le dimensioni 192, 512 e 180. Aprire `public/icons/icon-512.png` con Read per controllare la resa.

- [ ] **Step 6: Verifica test, build e service worker autonomo**

Run: `cd web && npx vitest run src/pwa && npm run build && grep -c "^import" dist/sw.js; cat dist/precache.json; ls dist/manifest.webmanifest dist/icons`
Expected: PASS; build senza errori; `grep` stampa `0` (il service worker non importa altri moduli); `precache.json` elenca `/index.html`, i file `/assets/*.js` e `/assets/*.css` e i quattro font; manifest e icone in `dist/`. Se `dist/sw.js` contiene `import` (il bundler ha messo codice condiviso in un pezzo a parte), costruire il service worker con una seconda build dedicata: script `"build:sw": "vite build --config vite.sw.config.ts"` con `build.lib` su `src/pwa/sw.ts`, formato `iife`, `outDir: 'dist'`, `emptyOutDir: false`, nome file `sw.js` (opzioni verificate con Context7 su `/vitejs/vite`), togliere `sw` dagli input di `vite.config.ts` e aggiungere `&& npm run build:sw` allo script `build`.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "Web: PWA installabile con shell completa in cache, aggiornamenti sicuri e icone"
```

---

### Task 19: README e verifiche finali

**Files:**
- Create: `web/README.md`

- [ ] **Step 1: README**

`web/README.md`:
```markdown
# App web di Cosa si mangia

SPA React (Vite, TanStack Router e Query), PWA mobile-first. Requisiti nella
specifica (`../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1,
12 e 14) e nella spec di dettaglio `../progetto/superpowers/specs/2026-10-11-app-web-di-base.md`;
linguaggio visivo in `../design/design.md`.

## Seconda PR: client reale e agganci di sessione

Branch `fondamenta/web-client` da `main` (PR #6 unita). Spec: sezione «Seconda PR» della
spec di W5; richiesta del coordinatore `progetto/coordinamento/messaggi/w5-05-seconda-pr.md`;
firme di W4 dalla sezione «Interfaccia richiesta a W5» di
`progetto/superpowers/specs/2026-10-11-spesa.md` (commit `7d1ebce`), da non adattare:
se una non si può implementare, `STATO: DOMANDA`. Ogni task con TDD: test di
regressione prima, visto fallire, poi il codice; commit per task.

Vincoli in più rispetto ai «Global Constraints»: nuove dipendenze solo `@orpc/client`
1.15.5 (esecuzione), `@app/contract` (workspace, solo `import type` nel codice
dell'app) e `@orpc/server` 1.15.5 (sviluppo, solo nei test). API di oRPC verificate con
Context7 (`/dinwwwh/orpc`): `createORPCClient`, `RPCLink` con `url`, `headers` asincroni,
`interceptors` e `fetch`; `ContractRouterClient` dal pacchetto `@orpc/contract` 1.15.5.

### Task 20: dipendenze e codici d'errore del contratto

**File:** `web/package.json`, `package-lock.json`, `web/src/api/errors.ts`,
`web/src/i18n/messages/errors.ts`, `web/src/api/errors.test.ts`.

- [ ] `npm install -w web @orpc/client@1.15.5 @app/contract` e
  `npm install -w web -D @orpc/server@1.15.5`; il lockfile non cambia versioni esistenti.
- [ ] Test: `toApiError` conserva un `ApiError('last_admin')`; ogni codice di
  `ApiErrorCode` ha un testo in `it-IT` e `en-GB` (il controllo di tipo del dizionario
  lo garantisce; il test verifica `errorKey`).
- [ ] `ApiErrorCode = ErrorCode | 'network' | 'unknown'` con `import type { ErrorCode }
  from '@app/contract'`; `CONTRACT_ERROR_CODES` scritto a mano
  `as const satisfies readonly ErrorCode[]` con un controllo di completezza a livello di
  tipo (`Exclude<ErrorCode, (typeof CONTRACT_ERROR_CODES)[number]>` deve essere
  `never`), usato dalla conversione del Task 25 senza importare il contratto a runtime.
- [ ] Testi nuovi: `internal`, `last_admin`, `last_app_admin`, `sole_member`, `web_only`.
- [ ] Commit «Web: codici d'errore del contratto e dipendenze del client oRPC».

### Task 21: esiti del rinnovo nel backend di accesso

**File:** `web/src/auth/backend.ts`, `web/src/auth/supabaseBackend.ts`,
`web/src/test/stubBackend.ts`, test relativi.

- [ ] Test (`supabaseBackend.test.ts`): `refreshSession` con sessione → `{kind:'ok',
  userId}` dell'utente della sessione; `AuthRetryableFetchError` → `{kind:'network'}`;
  errore 400 o sessione assente → `{kind:'rejected'}`.
- [ ] `RenewResult` in `auth/backend.ts`, riesportato da `session/session.ts` (firma di
  W4); `AuthBackend.refresh(): Promise<RenewResult>`; backend finto → `ok` con
  `DEMO_USER.id`.
- [ ] Stub: `refreshResult: RenewResult` (predefinito `ok` con l'utente corrente) e
  `holdRefresh()` che risponde con un `RenewResult`; aggiornare i test che usano
  `true`/`false`.
- [ ] Commit.

### Task 22: `renew`, `call` protetta, agganci di chiusura e revoca

**File:** `web/src/session/session.ts`, `web/src/session/session.test.ts`,
`web/src/session/SessionScope.tsx`.

- [ ] Test (`session.test.ts`), uno per comportamento della spec («Test della seconda
  PR»): `renew()` concorrenti più un `unauthorized` dentro `call` → un solo `refresh`;
  `rejected` → `end` atteso e `close()` (con gli agganci) completata prima che `renew`
  risponda; `network` → nessuna `end`; sessione chiusa → `rejected` senza `refresh`;
  `call` su sessione chiusa → `SessionClosedError` e `run` mai eseguita; chiusura
  durante il rinnovo dentro `call` → `SessionClosedError` senza ripetizione; `network`
  dentro `call` → `ApiError('network')` e sessione aperta; `onClose` attesi dopo
  `persister.close()` nell'ordine di registrazione e tutti completati prima che
  `close()` si risolva, anche se uno rifiuta in modo asincrono **o lancia in modo
  sincrono** (gli agganci successivi vengono comunque eseguiti), e disiscrizione; `onRevoke` per `revoke` locale e con `announce: false`, mai a sessione
  chiusa, errore di un aggancio che non ferma gli altri; `store` e `channel`.
- [ ] Codice:
  - `SessionDeps.refresh?: () => Promise<RenewResult>`; `end` restituisce la promessa
    della procedura di chiusura e `renew` la attende;
  - un solo `renewing: Promise<RenewResult> | null` per `renew()` e per `call`; `ok` →
    `epoch += 1`; `rejected` → `await end()`; `network` → nulla; a sessione chiusa,
    prima di chiamare `refresh` e alla risposta, `rejected`;
  - `call`: `if (closed) throw new SessionClosedError()` all'inizio e prima della
    ripetizione; esito `network` → `throw new ApiError('network')`; esito `rejected` →
    `throw new SessionClosedError()`;
  - `close()`: dopo `persister?.close()`,
    `await Promise.allSettled([...closeHooks].map((hook) => Promise.resolve().then(hook)))`
    (ogni invocazione dentro una promessa, così un'eccezione sincrona non interrompe il
    `map`), poi `changed()`;
  - `revoke()`: dopo le operazioni attuali, ogni aggancio in `try`, promessa con
    `.catch(() => undefined)`, non attesa;
  - `store` e `channel: deps.channel ?? null` come proprietà.
- [ ] `SessionScope`: `end` restituisce `endRef.current(s)` (già una promessa).
- [ ] Commit.

### Task 23: messaggi fra schede per argomento

**File:** `web/src/session/channel.ts`, `web/src/session/SessionScope.tsx`,
`web/src/test/memoryChannel.ts`, test.

- [ ] Test: in `SessionScope.test.tsx` un `extension` dello stesso utente non chiude la
  sessione né revoca; un messaggio di tipo sconosciuto è ignorato; `signedOut` chiude
  come oggi. In `channel.test.ts`: `subscribeExtension` riceve `(userId, payload)` solo per
  il suo `topic`, e la disiscrizione funziona.
- [ ] `SessionMessage` con il caso `extension`; `subscribeExtension(channel, topic,
  listener)`; ricevitore di `SessionScope`: `if (message.type === 'revoked') …
  else if (message.type === 'signedOut') markSignedOut(…)`, nient'altro.
- [ ] Commit.

### Task 24: prefissi per utente nella pulizia

**File:** `web/src/api/persister.ts`, `web/src/api/persister.test.ts`.

- [ ] Test: `registerUserKeyPrefix('shopping-queue:')` prima di qualsiasi sessione;
  archivio con `shopping-queue:a` e `shopping-queue:b` → `purgeOtherCopies(store, 'b')`
  tiene solo `shopping-queue:b`; con `null` le cancella tutte; registrazione due volte
  dello stesso prefisso senza effetti; prefisso registrato dopo una prima pulizia
  rispettato dalla successiva. Un aiuto `resetUserKeyPrefixes()` solo per i test.
- [ ] Registro di modulo (`Set<string>`); `purgeOtherCopies` cancella anche
  `k.startsWith(prefix) && k !== prefix + keep`.
- [ ] Commit.

### Task 25: client oRPC con token ed errori

**File:** `web/src/api/rpc.ts`, `web/src/api/rpc.test.ts`.

- [ ] Test con un server del contratto nello stesso processo: `implement(contract)` di
  `@orpc/server` con `session.whoami` che registra in uno spy gli header ricevuti
  (`authorization`) e restituisce un oggetto conforme al contratto
  (`{ userId: <uuid>, channel: 'web', clientId: null, locale: 'it-IT' }`), oppure lancia
  l'errore scelto dal test, `RPCHandler` di `@orpc/server/fetch` con prefisso
  `/api/rpc`, passato a `RPCLink` come `fetch`. Casi: token letto a ogni richiesta
  (cambia fra due chiamate); nessun header senza token; `ORPCError('forbidden')` →
  `ApiError('forbidden')`; `ORPCError('invalid', {data})` → codice e dati; codice fuori
  contratto e risposta 502 in testo → `unknown`; `fetch` che rifiuta con `TypeError` →
  `network`; chiamata diretta con `{ signal }` annullato → il `fetch` del link riceve il
  segnale annullato e l'errore d'annullamento passa invariato.
- [ ] `createRpcClient({ getAccessToken, fetch? }): ContractRouterClient<Contract>`:

  ```ts
  const link = new RPCLink({
    url: new URL('/api/rpc', location.origin).toString(),
    headers: async () => {
      const token = await getAccessToken();
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    interceptors: [toApiErrors],
    ...(fetch ? { fetch } : {})
  });
  return createORPCClient(link);
  ```

  `toApiErrors` converte come nella spec (`CONTRACT_ERROR_CODES` del Task 20).
  Firma esatta di `fetch` e `interceptors` di `RPCLink` 1.15.5 verificata con Context7
  prima di scrivere il codice.
- [ ] Commit.

### Task 26: composizione per area e avvolgimento con `Proxy`

**File:** `web/src/api/types.ts`, `web/src/api/fake/fakeApi.ts`,
`web/src/api/clients.ts` (nuovo), `web/src/session/session.ts`, `web/src/main.tsx`,
test.

- [ ] Test: `wrapApi` su un client che è un `Proxy` senza chiavi (come quello di oRPC)
  passa da `session.call` con `familyId` dall'input e scarta le risposte nella lingua
  superata; inoltra **tutti gli argomenti** (`input` e le opzioni del client, compreso
  `signal`), anche nella ripetizione dopo un rinnovo; annullamento attraverso `wrapApi`
  sul client oRPC del Task 25: il `fetch` del link riceve il segnale annullato; un `unauthorized` del server di test del Task 25 rinnova una volta e ripete.
  `realClients({ backend, rpc })` (in `clients.ts`): `session.whoami` va al client oRPC,
  `menu.getWeek` al client finto con l'utente del login; `fakeClients` risponde anche a
  `session.whoami` con l'utente demo.
- [ ] `SERVER_AREAS = ['session'] as const satisfies readonly (keyof Contract)[]`;
  `ProvisionalApi` (le aree di oggi); `Api = ContractRouterClient<Pick<Contract,
  ServerArea>> & ProvisionalApi`. `session.whoami` nel client finto.
- [ ] `wrapApi` con `Proxy` ricorsivo: `get` restituisce l'avvolgimento del figlio,
  `apply` riceve `...args` e chiama `session.call(() => target(...args),
  familyIdOf(args[0]))` (la stessa funzione serve la ripetizione dopo il rinnovo, quindi
  con gli stessi argomenti, `signal` compreso) e lo scarto di C12; le chiavi non stringa (`Symbol`, `then`) restituite come sono, perché un `Proxy`
  non sembri una promessa.
- [ ] `realClients`: `(user) => { const fake = fakeClients()(user); return (locale) =>
  compose(SERVER_AREAS, rpc, fake(locale)); }`; `main.tsx` usa `realClients` con
  `env.supabase`, `fakeClients` senza.
- [ ] Commit.

### Task 27: proxy di sviluppo, banner della Spesa, README

**File:** `web/vite.config.ts`, `web/src/vite-env.d.ts`, `web/src/routes/AppLayout.tsx`,
`web/src/components/OfflineBanner.tsx`, `web/src/i18n/messages/common.ts`,
`web/README.md`, test.

- [ ] Test: offline sulla rotta `/shopping/2026-10-05` (rotta di prova nel test)
  `AppLayout` mostra `offline.bannerShopping`, su `/menu` `offline.banner`.
- [ ] `server.proxy` e `preview.proxy`: `'/api': process.env.VITE_API_TARGET ??
  'http://localhost:8787'` (letto con `loadEnv`).
- [ ] `OfflineBanner` con `variant`; testi `offline.bannerShopping` in due lingue.
- [ ] README: modalità vera con lo stack locale e `wrangler dev`, aree dal server e
  finte, agganci per la coda (puntatore alla spec).
- [ ] Commit.

### Task 27b: test instabile della sessione non verificata (richiesta del coordinatore)

- Causa: `AuthProvider` ascolta l'evento `online` da un effetto montato solo con la sessione
  «non verificata»; se la rete torna prima (durante la prima verifica, o prima che
  l'effetto giri in una CI lenta) l'evento si perde e la sessione non si ricontrolla più.
- Test: prima verifica sospesa offline → rete di nuovo presente → risposta «non
  verificata» ⇒ sessione verificata. I test della sessione non verificata partono offline,
  come nella realtà. Nessun timeout allungato.
- Codice: all'iscrizione, se `navigator.onLine`, il controllo parte subito.
- Verifica: il file ripetuto 20 volte, poi 24 volte con tre processi in parallelo.

### Correzioni della review della PR #17

Review: `progetto/coordinamento/revisioni/w5-pr17.md`; scelte del coordinatore:
`progetto/coordinamento/messaggi/w5-07-review-pr17.md`.

- **Nessun invio dopo la chiusura (rilievo 1).** `session.signal`, annullato da `close()`
  con motivo `SessionClosedError`; `wrapApi` passa alle opzioni del client un segnale che
  unisce quello del chiamante e quello della sessione (`AbortSignal.any`); il `fetch` del
  link oRPC, chiamato dopo `getAccessToken()`, rifiuta con il motivo se il segnale è
  annullato; la conversione degli errori propaga `SessionClosedError` e lascia
  l'annullamento del chiamante com'è. `SessionClosedError` sta in `api/errors.ts` ed è
  riesportata da `session/session.ts` (firma di W4 invariata). Test: lettura del token
  sospesa, `close()`, token di B rilasciato ⇒ nessuna chiamata a `fetch`, esito
  `SessionClosedError`; richiesta in volo annullata alla chiusura; annullamento del
  chiamante ancora `AbortError`.
- **Rinnovo per un altro utente (rilievo 2).** Se il rinnovo risponde `ok` con un
  `userId` diverso da quello della sessione, l'epoca non cresce, la sessione chiude se
  stessa (`close()`, senza `end`, quindi senza uscita da Supabase) e `call` rifiuta con
  `SessionClosedError` senza ripetere; `renew()` restituisce l'esito com'è, così la coda
  della Spesa vede l'altro utente. Test unitario e test integrato con `AuthProvider` e
  `SessionScope` reali: B annunciato durante il rinnovo di A ⇒ una sola esecuzione della
  lettura di A, B resta dentro, nessuna uscita.

- **Seconda verifica, rilievo 1 (`w5-pr17-2.md`).** Restava la finestra prima dell'effetto
  React che chiude A: il token letto dopo l'ingresso di B era quello di B.
  - `AuthBackend.getCredentials()` (token e `userId` dalla stessa sessione di Supabase)
    al posto di `getAccessToken()`; `wrapApi` mette `sessionUserId` nel contesto della
    chiamata; il link, appena lette le credenziali, rifiuta con `SessionClosedError` se
    sono di un'altra persona.
  - `SessionScope` ascolta gli eventi del backend: un evento con un'altra identità (o
    l'uscita) chiude subito la sessione mostrata, senza aspettare l'effetto React.
  - Test: nel link, credenziali di B per una chiamata di A ⇒ nessun invio; integrato con
    `AuthProvider`, `SessionScope`, wrapper e client oRPC reali: lettura del token di A
    sospesa, ingresso di B, token di B restituito ⇒ A chiusa subito, zero invii,
    `SessionClosedError`, B dentro senza uscite. Senza le correzioni la richiesta partiva.

### Task 28: verifiche e PR

- [ ] `npm test` e `npm run typecheck` dalla radice e da `web/`; `npm run build` (il
  bundle non deve contenere `zod` né il contratto: `grep -c zod web/dist/assets/*.js`
  uguale a prima).
- [ ] Prova con lo stack locale (decisione del coordinatore: stack di W1 `w1-piattaforma`,
  Auth sulla 55321, password di `app_server` impostata solo su quel database locale in un
  `server/.env` non versionato, Worker con `wrangler dev` sulla 8788): test d'integrazione
  facoltativo `src/api/live.test.ts` (accesso, `session.whoami` dal Worker, `renew()` con
  token nuovo accettato, uscita, token vecchio rifiutato, chiusura unica al rifiuto) e
  prova nel browser (accesso, Menu, «Esci» con copia e sessione cancellate).
- [ ] Anteprima sulla porta 8767 riavviata; push e PR verso `main` con descrizione in
  italiano, `STATO: PR_APERTA <url>`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Installa le dipendenze (Node 26) |
| `npm run dev` | Sviluppo su http://localhost:5174 (copia prima font e foto da `../design/assets`) |
| `npm test` | Test Vitest |
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
scelta temporanea della lingua. «Esci», l'uscita da un'altra scheda e ogni cambio
d'utente chiudono la sessione con la stessa procedura e cancellano tutto; all'avvio si
cancellano le copie di chiunque altro. `unauthorized` dal server: un rinnovo, poi
l'ingresso; `forbidden`: i dati di quella famiglia spariscono. Il voto non è ottimistico:
in cache entra solo quello che il server ha confermato.

Il service worker si registra solo nella build e solo in un contesto sicuro
(`localhost` o HTTPS): sulla rete locale in `http` l'iPhone installa l'app ma non la
apre offline.

## Struttura

`src/api` interfaccia `Api`, query, voto, cache persistita, client finto ·
`src/auth` accesso · `src/session` cache per utente · `src/i18n` testi e formati ·
`src/components` componenti · `src/routes` viste · `src/pwa` service worker ·
`src/design` token, font e stili.
```

- [ ] **Step 2: Verifiche automatiche**

Run: `cd web && npm test && npm run typecheck && npm run build`
Expected: tutti i test PASS, nessun errore di tipi, build riuscita. Riportare il numero di test nel messaggio della PR.

- [ ] **Step 3: Prova nel browser**

Oltre ai controlli qui sotto, i punti della review che jsdom non può verificare:
- **altezze** (rilievo 8): Ricettario lungo e Menu con gli ingredienti aperti a 320 e 390 px: navbar sempre visibile, fine del contenuto raggiungibile, scorrimento solo nei contenitori previsti (colonne dei giorni, viste secondarie);
- **tastiera e VoiceOver** (rilievo 13): calendario aperto dal mese e dall'icona, scelta con Invio, Escape, frecce del mese; stelle del voto con Tab e spazio; con VoiceOver su macOS (Safari) i nomi letti sono quelli dei test;
- **aggiornamento della PWA** (rilievo 7) su `localhost`: build A, apertura, chiusura, rete disattivata e riapertura (si apre); build B con un testo cambiato, riapertura online e poi offline (si apre B, la cache di A è sparita in DevTools → Application → Cache Storage).


Con la skill `agent-browser`, su `npm run preview -- --port 8767` (build di produzione, `localhost`):
- `/menu`, `/recipes`, `/recipes/wok-pollo-peperoni-riso-basmati`, `/profile` a 320, 390 e 1440 px, in italiano e (dal Profilo) in inglese; screenshot nello scratchpad;
- confronto con `design/index.html` aperto alla stessa larghezza e con `design/references/hellofresh/preview-mobile.png`: fondo crema, font, banner 3:1, selettore dei giorni, navbar a icone;
- nessuno scorrimento orizzontale della pagina, titoli lunghi che vanno a capo, fonte troncata;
- offline: dopo la seconda visita (installazione completa), rete disattivata (se agent-browser non lo consente, con chrome-devtools MCP `emulate` offline), ricarica di `/menu`: l'app si apre con i dati in cache e il banner offline; un voto offline mostra l'errore e non parte alla riconnessione.
- pagina di ingresso: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=placeholder npm run dev` e apertura di `/login` a 390 px (credenziali errate → messaggio di rete o di credenziali). Se lo stack locale di Supabase è attivo, accesso vero con un utente di prova.

Annotare nella PR ciò che non torna rispetto al riferimento.

- [ ] **Step 4: Rete locale per l'iPhone**

Run: `cd web && npm run preview:lan` (in background) e stampare l'indirizzo `http://<ip del Mac>:8767`.
Scrivere al coordinatore l'indirizzo, chiedendo la prova su iPhone di resa e installazione (Aggiungi a Home).

- [ ] **Step 5: Commit**

```bash
git add web/README.md
git commit -m "Web: README con comandi, modalità, sessione e limiti del service worker sulla rete locale"
```

**C13. Stato finto condiviso dalle lingue (seconda review della PR #6, rilievo 1; regressione di C12).**
- `CreateApi = (user) => (locale) => Api`: il primo passo si esegue una volta per sessione, il secondo una volta per lingua; i client delle lingue condividono quello che il primo passo ha creato.
- `createFakeData(user)` tiene settimane, ricette, voti e contatore di versione; `createFakeApi({ getLocale, data })` ci costruisce sopra il client di una lingua (senza `data` ne crea uno nuovo, come prima). `fakeClients({ latencyMs })` è la `CreateApi` della modalità finta e dei test. Restano la lingua fissa per richiesta e lo scarto delle risposte superate di C12.
- Test: `SessionScope.test.tsx`, voto di 1 stella in italiano → inglese → italiano, con scheda ricetta, settimana del Menu e lista del Ricettario sempre a 1; voto di 5 stelle in inglese, coerente dopo rilettura, nella copia salvata e al ripristino in entrambe le lingue (fallisce sul codice di C12). `fakeApi.test.ts`: due lingue della stessa sessione condividono voto e contatore, ciascuna risponde nella sua lingua; un'altra sessione riparte dai dati demo.
