# Revisione PR #3 — Scheletro del monorepo

**Verdetto: APPROVABILE**

Revisione dell’11 ottobre 2026 sul commit `17592fafd3baf6c7134e471d9f13f653f4f0dbaf`, diff rispetto a `3a42bd7`. Perimetro: task 1 del piano W1, confrontato con specifica principale, specifica della piattaforma e interfacce del piano generale nel checkout principale.

## Rilievi

Nessun difetto bloccante o importante individuato nel perimetro della prima consegna. Non sono necessarie correzioni per approvare lo scheletro.

**Precisazione sulla copertura:** test e typecheck vengono realmente eseguiti per `domain`, `contract` e `server`, oltre ai controlli della radice. **Non vengono eseguiti per `web`**: `web/package.json:5` definisce soltanto `build`, e `--if-present` negli script della radice (`package.json:7–8`) salta gli script mancanti.

Questo è coerente con il segnaposto previsto dal task 1, passo 6; non costituisce un difetto di questa consegna. La descrizione della PR, quando parla di controlli su «ogni workspace», va quindi letta con questa eccezione.

## Verifiche eseguite

Ambiente locale: Node `26.11.1`, npm `11.20.0`, dipendenze già installate.

| Area | Test effettivamente eseguiti | Controllo dei tipi |
|---|---:|---|
| Radice / `scripts` | 12 test in 2 file, PASS | PASS; include script, dominio e relativi test |
| `@app/domain` | 54 test in 11 file, PASS | PASS; controllo separato senza tipi di Node |
| `@app/contract` | 1 test, PASS | PASS; sorgente, test e configurazione Vitest inclusi |
| `@app/server` | 1 test, PASS | PASS; sorgente, test e configurazione Vitest inclusi |
| `@app/web` | Nessuno: script assente | Nessuno: script assente |

- **`npm test`: PASS**, 68 test complessivi in 15 file. I 66 test preesistenti sono conservati; il diff non modifica `domain/src` né `scripts`.
- **`npm run typecheck`: PASS.** Verificati anche i file effettivamente inclusi nei quattro progetti TypeScript. Un errore deliberato di assegnazione, introdotto esclusivamente in memoria tramite il compilatore, viene rilevato in ciascun progetto.
- **Test segnaposto sensibili alle regressioni:** su copie temporanee, prima verificate senza modifiche, il test del contratto fallisce sostituendo l’oggetto esportato con `undefined`; quello del server fallisce cambiando lo stato HTTP da 404 a 200.
- **Build web: PASS.** Eseguito lo script di `web/package.json` su una copia temporanea per rispettare la sola lettura del worktree; produce `dist/index.html` con il contenuto previsto.
- **`npm ls --depth=0`: PASS.** Workspace collegati e dipendenze risolte nelle versioni previste.
- **`git diff --check 3a42bd7..HEAD`: PASS.**

Le configurazioni Vitest separate eseguono davvero le suite dei rispettivi workspace: non si limitano a ereditare la configurazione della radice con `passWithNoTests`. Il comportamento dei pattern e la separazione fra esecuzione dei test e controllo dei tipi sono stati riscontrati anche nella documentazione tramite Context7.

## CI

Il workflow in `.github/workflows/ci.yml:3–19` è coerente con il task: parte sulle pull request e sui push a `main`, usa Node 26 ed esegue `npm ci`, typecheck e test senza ignorarne gli errori.

GitHub riporta **SUCCESS** per il [job CI della PR](https://github.com/fedfol-powa/meal_planner_2/actions/runs/38127358483/job/114434389500), concluso alle 09:09:48 UTC. La PR punta al commit esaminato.

Il download dei log completi è fallito per un errore di connessione all’API: lo stato remoto è verificato, ma i conteggi delle suite riportati sopra provengono dall’esecuzione locale. La build non è inclusa nella CI del task 1, conformemente al piano.

## Coerenza con le interfacce decise

La struttura rispetta quanto concordato:

- quattro workspace `@app/*`, con `scripts/` nella radice;
- export TypeScript diretti di `@app/domain/planner` e `@app/contract`, entrambi risolti correttamente;
- dominio conservato senza dipendenze di runtime e con controllo dei tipi separato;
- tipi Workers nel server, senza introdurre Hono o ORM;
- dipendenze nuove conformi alle versioni indicate dal piano;
- prototipo e codice della prova tecnica esclusi dai workspace.

Contratto vuoto, Worker che risponde 404 e pagina web minima sono i segnaposto richiesti. Autenticazione, permessi, MCP, database e configurazione di pubblicazione appartengono ai task successivi e non risultano implementati o verificati da questa PR.

## Punti per il coordinatore

Nessuna nuova decisione di prodotto o architettura richiesta.

Alla consegna W5 occorrerà verificare che `web` aggiunga test e typecheck effettivi: con `--if-present`, la loro eventuale assenza continuerebbe a lasciare verdi i comandi della radice.

Revisione svolta senza modificare i file del lavoro esaminato, senza commit e senza commenti sulla PR. Stato Git finale pulito.