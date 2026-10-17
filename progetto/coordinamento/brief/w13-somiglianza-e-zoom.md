# Brief W13: somiglianza dell'ingrediente principale (#48) e zoom di iOS sui campi (#51)

Segui `progetto/coordinamento/protocollo-worker.md`, con le eccezioni scritte qui sotto.

- **Branch:** `correzioni/somiglianza-e-zoom` · **Worktree:** `.worktrees/somiglianza`
- **Issue:** #48 e #51 (leggile con `gh issue view`).
- **Specifica principale:** sezione 3 («Punteggio», voce **somiglianza**), sezione 14
  (campi e tipografia), sezioni 1, 15 e 16 come da protocollo.
- **Scadenza:** il rilascio deve avvenire prima di mercoledì 21/10 alle 20:00, quando si
  genera la settimana del 26/10. Lavora per arrivare alla PR in giornata.

## Fasi per questa attività (decisione del coordinatore)

Le decisioni di prodotto sono già prese dall'utente (sotto): **niente brainstorming e
niente spec separata**. Scrivi solo un piano breve con `superpowers:writing-plans` in
`progetto/superpowers/plans/2026-10-17-somiglianza-e-zoom.md`, che finisce con la sezione
**«Decisioni da riportare nella specifica»**; commit, poi passa subito
all'implementazione (TDD). La revisione separata si fa sulla PR. Ti fermi con
`STATO: PR_APERTA <url>`.

## 1. Issue #48: due piatti con broccoli lo stesso giorno

Caso in produzione, martedì 20/10: pranzo «Orecchiette ai broccoli» (ingrediente
principale broccoli, 1 kg), cena «Riso saltato nel wok con broccoli e gamberi»
(ingrediente principale gamberi, broccoli 500-600 g riga non facoltativa). Proteina,
carboidrato, ingrediente principale e categoria diversi: `sharedFeatures`
(`domain/src/planner/groups.ts`) restituisce zero, nessuna penalità.

**Decisione dell'utente (17/10):** nuova caratteristica della somiglianza,
`primary_ingredient_line`: due ricette la condividono quando l'ingrediente principale di
una delle due è una riga **non facoltativa** dell'altra. Se hanno lo stesso ingrediente
principale vale già `primary_ingredient` e la nuova **non** si somma. Resta una
**penalità** (stesso peso e stessa finestra delle altre caratteristiche), **nessun
vincolo rigido**: l'utente non vuole regole nuove sul giorno, né per l'ingrediente né
per la proteina.

- Nel worktree c'è già, non committato, il test che riproduce il caso
  (`domain/src/planner/groups.test.ts`, due `it` nuovi in «similarity features»): oggi
  fallisce. Tienilo, adattalo se serve, e fallo passare.
- Aggiungi un test sul punteggio (`score.test.ts` o `generate.test.ts`) che mostri la
  penalità fra pranzo e cena dello stesso giorno con due ricette come quelle del caso.
- Controlla gli altri consumatori di `sharedFeatures` (`metrics.ts`, `closePairs` e il
  suo test; `scripts/planner-report.ts`) e il report: esegui `npm run planner-report`
  prima e dopo e riporta nella PR la differenza (coppie vicine, pasti fuori stagione,
  violazioni). Se il report mostra effetti indesiderati (per esempio settimane molto
  peggiori per gradimento), fermati con `STATO: DOMANDA`.
- Nella sezione «Decisioni da riportare nella specifica» del piano: il testo nuovo per
  la voce **somiglianza** della sezione 3. La specifica principale la aggiorna il
  coordinatore.

## 2. Issue #51: zoom automatico di iOS sui campi di testo

iOS Safari ingrandisce la pagina quando un campo ha il testo sotto i 16px. Elenco dei
campi e soluzione proposta nell'issue: regola globale `input, select, textarea` a
16px (1rem) con `font: inherit` anche su `select` e `textarea` e una dimensione
esplicita che non dipenda dall'etichetta; correggere gli override sotto 1rem
(`RecipeFilters.module.css`, `IngredientRestrictions.module.css`, `NoteForm.tsx`,
`meals.module.css` e gli altri che trovi). **Non** bloccare lo zoom nel viewport.

- Rispetta il linguaggio visivo (`design/design.md`): se un campo a 16px rompe un
  layout compatto, sistemalo senza scendere sotto i 16px e annotalo nella PR.
- Un test che fallisca se un campo ha una dimensione calcolata sotto i 16px (scegli
  nel piano il livello: test del CSS o prova nel browser).
- Verifica con la skill agent-browser a larghezza da telefono le pagine con campi
  (elenco nell'issue). Nella PR annota cosa resta da provare a mano sull'iPhone
  (Safari e PWA installata).

## Vincoli

- Nessuna migrazione e nessuna modifica al contratto previste; se servono, `STATO: DOMANDA`.
- Test, typecheck e build verdi prima della PR (`npm test`, `npm run typecheck`).
- Rilascio in produzione: **non lo fai tu**.
