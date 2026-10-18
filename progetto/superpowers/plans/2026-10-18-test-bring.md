# Test instabile della pagina di Bring! (W18) - piano

> **Per chi esegue:** worker W18, worktree `.worktrees/test-bring`, branch
> `correzioni/test-bring`. Brief: `progetto/coordinamento/brief/w18-test-bring.md`
> (niente brainstorming né spec; la revisione Codex è sulla PR).

**Obiettivo:** `server/test/asset-routing.test.ts` › «reaches the Bring! page of a valid token,
never the SPA» smette di fallire a caso in CI, senza `retry` e senza togliere asserzioni.

**Scelta:** correzione, non rimozione. La causa è trovata, riprodotta in modo deterministico
e sta nel banco di prova (Miniflare + undici), non nell'app né nel Worker; la correzione è
di poche righe nell'aiuto `fetchBoth` del test.

## Causa

`Miniflare#dispatchFetch` passa per `fetch4` (`node_modules/miniflare/dist/src/index.js`),
che chiama `undici.fetch` e restituisce `new Response(response.body, response)`: una nuova
risposta attorno allo **stesso** stream, mentre la risposta originale di undici viene
scartata. undici però registra lo stream in un `FinalizationRegistry`
(`undici/lib/web/fetch/body.js`, `streamRegistry`) legato proprio a quella risposta
originale: quando il garbage collector la raccoglie, se lo stream non è ancora letto né
bloccato lo annulla («Response object has been garbage collected»). Lo stream annullato
risulta «disturbed», e il successivo `response.text()` sulla risposta di Miniflare fallisce
con `TypeError: Body is unusable: Body has already been read`, l'errore dei run CI
`39107982509` e `39113726530`.

`fetchBoth` mandava le due richieste con `Promise.all` e leggeva i corpi solo dopo che
**entrambe** le risposte erano arrivate. La prima risposta restava quindi non letta mentre
la seconda faceva la query al database (pagina di Bring!): una finestra in cui un GC, più
probabile in CI dove il processo è più carico, la svuota. Il test dello zip di W17 usa lo
stesso aiuto ma non tocca il database, quindi la finestra è molto più corta: era esposto
allo stesso modo, solo meno spesso.

Non è una corsa che Bring! può incontrare: in produzione la risposta arriva dal Worker vero,
senza `dispatchFetch` né l'involucro di Miniflare.

## Riproduzione

- **Deterministica:** una copia temporanea del test (non versionata) che, dopo `fetchBoth`,
  forza cinque GC (`v8.setFlagsFromString('--expose-gc')` + `vm.runInNewContext('gc')`) con
  20 ms fra l'uno e l'altro. Versione di `main`: 3 test su 6 falliscono (zip, Bring!, token
  scaduto), tutti con `Body is unusable: Body has already been read`. Versione corretta:
  6 su 6 verdi. Lo stesso effetto con uno script Node minimo su `dispatchFetch` e
  `node --expose-gc`.
- **Sotto carico, senza GC forzato:** 65 esecuzioni del file non lo avevano riprodotto
  nemmeno prima della correzione; il caso dipende da quando il GC parte, per questo serve
  la riproduzione deterministica.

## Correzione

`fetchBoth` legge ogni corpo appena arriva la sua risposta (`await response.text()` nella
stessa catena di microtask di `dispatchFetch`, dove le callback del `FinalizationRegistry`
non possono inserirsi) e restituisce `{ response, body }`. I test confrontano `body` invece
di chiamare `response.text()` più tardi. Stesse richieste in parallelo, stesse asserzioni.
I due test con una sola richiesta già leggevano il corpo subito dopo l'`await` e restano
com'erano.

## Verifica

1. Copia con GC forzato: prima 3 falliti su 6, dopo 6 su 6 (sopra).
2. Stabilità: 13 copie del file in un solo `vitest run`, ripetuto 5 volte (65 esecuzioni,
   390 test) con 10 processi `yes > /dev/null` in sottofondo (carico medio fino a 15):
   tutte verdi.
3. `npm run typecheck`, `npm test -w server` sullo stack locale, CI della PR.
