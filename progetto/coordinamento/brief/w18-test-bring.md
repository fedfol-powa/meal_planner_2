# Brief W18: test instabile `asset-routing` › pagina di Bring!

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui.

- **Branch:** `correzioni/test-bring` (da `origin/main`) · **Worktree:** `.worktrees/test-bring`
- **Richiesta dell'utente (18/10/2026):** sistemare il test instabile; «se è complesso da
  risolvere, togli il test».
- **Eccezione al protocollo:** niente brainstorming né spec. Piano breve in
  `progetto/superpowers/plans/2026-10-18-test-bring.md` (causa trovata, scelta fra
  correzione e rimozione, motivo), commit, poi avanti fino alla PR senza fermarti. La
  revisione Codex sarà sulla PR.

## Il problema

`server/test/asset-routing.test.ts` › «reaches the Bring! page of a valid token, never the
SPA» fallisce a volte in CI su `main` con:

```
TypeError: Body is unusable: Body has already been read
 ❯ _Response.text ../node_modules/undici/lib/web/fetch/body.js:337:14
 ❯ test/asset-routing.test.ts:100:26   expect(await response.text()).toContain('"recipeIngredient":["1 Lim…
```

Run falliti: `39107982509` (18/10 07:31 UTC) e `39113726530` (18/10 09:04 UTC, commit di soli
documenti). Log con `gh run view <id> --log-failed`. Il test usa `fetchBoth`, che manda in
parallelo con `Promise.all` due `mf.dispatchFetch` sullo stesso percorso (richiesta da server
e navigazione); il test dello zip di W17 usa lo stesso aiuto e finora passa.

## Cosa fare

1. Cerca la **causa** con un tempo limitato (indicativamente un'ora di lavoro): per esempio
   due risposte che condividono lo stesso corpo (cache o deduplicazione di Miniflare, il
   Worker di inoltro, l'adattatore verso l'app in Node, `Response` riusata), letture
   parallele, ordine delle letture. Riproduci in locale ripetendo il file molte volte sotto
   carico (`--repeat`, più processi in parallelo) prima di correggere.
2. Se trovi la causa e la correzione è piccola: correggi senza indebolire il test (niente
   `retry`, niente asserzioni tolte). Se la causa è nel codice dell'app o del Worker (una
   corsa vera che anche Bring! potrebbe incontrare), correggi il codice con un test che la
   dimostri e scrivilo nella PR.
3. Se la causa non si trova entro quel tempo, o la correzione è complessa: **togli il test**
   (o solo la parte instabile, per esempio la doppia richiesta in parallelo, se il resto è
   stabile), e scrivi nel piano e nella PR cosa non è più coperto e perché.
4. Prova di stabilità: almeno 50 ripetizioni del file sotto carico, comando ed esito nella
   PR; la CI della PR deve essere verde.

## Vincoli

- Solo test del server e, se serve, il codice che riguardano; niente cambi di prodotto.
- Dipendenze nuove no.
- Prove solo sullo stack locale (`AGENTS.md`, «Regole per tutti»).
- Alla fine: push, PR verso `main`, `STATO: PR_APERTA <url>`.
