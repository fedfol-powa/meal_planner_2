# Somiglianza dell'ingrediente principale (#48) e zoom di iOS sui campi (#51) - piano

> **Per chi esegue:** TDD (`superpowers:test-driven-development`), esecuzione in linea nel
> worktree `.worktrees/somiglianza`, branch `correzioni/somiglianza-e-zoom`. Brief:
> `progetto/coordinamento/brief/w13-somiglianza-e-zoom.md` (niente brainstorming né spec
> separata: le decisioni di prodotto sono dell'utente, 17/10).

**Obiettivo:** il pianificatore penalizza due pasti vicini quando l'ingrediente principale
di uno è una riga non facoltativa dell'altro; i campi di testo dell'app non scendono mai
sotto i 16px, così iOS non ingrandisce la pagina.

**Architettura:** una caratteristica in più in `sharedFeatures` (`domain/src/planner/groups.ts`),
che arriva da sola al punteggio (`score.ts`) e alle coppie vicine (`metrics.ts`, report).
Per i campi una regola globale in `web/src/design/global.css` e la correzione degli
override, con un test statico del CSS.

**Specifica:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezione 3
(Punteggio, voce somiglianza), sezione 14 (linguaggio visivo) e `design/design.md` (Moduli).

## Vincoli globali

- Nessuna migrazione, nessuna modifica al contratto, nessuna dipendenza nuova.
- Codice e test in inglese; commit e documenti in italiano.
- Somiglianza: **penalità**, stesso peso (`weights.similarity`) e stessa finestra
  (`SIMILARITY_WINDOW`) delle altre caratteristiche; nessun vincolo rigido nuovo.
- Zoom: **non** bloccare lo zoom nel viewport (`maximum-scale`, `user-scalable`).
- `npm test`, `npm run typecheck` e build del web verdi prima della PR.

## Punti da sorvegliare in revisione

1. Il report del pianificatore usa come identificativo lo slug del nome della riga
   d'origine («Broccolo» → `broccolo`, «Broccoli» → `broccoli`), mentre in produzione
   l'import mappa le due righe sullo stesso ingrediente `broccoli`
   (`scripts/import/ingredient-lines.yaml`). Senza correggerlo il report non vede il caso
   dell'issue: Task 2 lo allinea all'import, con un test.
2. Ricetta senza ingrediente principale (`primaryIngredientId: null`): la caratteristica
   nuova si valuta solo dal lato che ne ha uno (test in Task 1).
3. Riga facoltativa con l'ingrediente principale dell'altra: non conta (test già presente).
4. Campo che eredita la dimensione dall'etichetta (`.filters label` a 0,75rem, `.field`
   a 0,875rem): la regola globale deve dare una dimensione esplicita, non `inherit`
   (test in Task 4).
5. Select a 16px in griglie strette (filtri del ricettario a 2 colonne sul telefono,
   restrizioni con `max-width: 46%`): testo troncato o righe che vanno a capo; si
   verifica nel browser (Task 5).

---

### Task 1: caratteristica `primary_ingredient_line`

**File:**
- Modifica: `domain/src/planner/groups.ts` (`sharedFeatures`)
- Test: `domain/src/planner/groups.test.ts` (i due `it` già scritti), `domain/src/planner/score.test.ts`

**Interfacce:** `sharedFeatures(a, b): string[]` resta com'è; può restituire in più
`'primary_ingredient_line'`, dopo `'primary_ingredient'` e prima di `'category'`.

- [ ] **Passo 1:** aggiungere a `groups.test.ts` il caso con un solo lato dotato di
  ingrediente principale: `recipe('x', { primaryIngredientId: null, ingredients: [{ ingredientId: 'broccoli', isOptional: false }] })`
  contro una ricetta con principale `broccoli` → `['primary_ingredient_line']` in tutti e
  due gli ordini.
- [ ] **Passo 2:** in `score.test.ts`, test «penalises lunch and dinner of the same day
  when one's primary ingredient is a line of the other (issue #48)»: martedì 2026-10-13,
  in `week` le orecchiette (principale `broccoli`) a pranzo; a cena il wok (principale
  `gamberi`, riga `broccoli` non facoltativa) ha punteggio minore di un wok gemello con
  `zucchine` al posto dei broccoli; la differenza vale `weights.similarity` (distanza 1,
  una caratteristica). Proteina, carboidrato e categoria diversi da quelli delle orecchiette.
- [ ] **Passo 3:** eseguire `npx vitest run domain/src/planner/groups.test.ts domain/src/planner/score.test.ts`:
  falliscono i test nuovi.
- [ ] **Passo 4:** in `sharedFeatures`, se non c'è già `primary_ingredient`, aggiungere
  `primary_ingredient_line` quando `a.primaryIngredientId` non è null e `uses(b, a.primaryIngredientId)`,
  oppure lo stesso con i ruoli scambiati. Aggiornare il commento della funzione.
- [ ] **Passo 5:** test del dominio verdi (`npx vitest run domain`), compresi
  `metrics.test.ts` e `generate.test.ts` (il catalogo sintetico ha come unica riga
  l'ingrediente principale, quindi non cambia).
- [ ] **Passo 6:** commit «Pianificatore: somiglianza per l'ingrediente principale fra le righe dell'altra ricetta (#48)».

### Task 2: report con gli ingredienti dell'import

**File:**
- Modifica: `scripts/planner-data/attributes.ts` (`toPlannerRecipes`), `scripts/planner-report.ts`
- Test: `scripts/planner-data/attributes.test.ts`

**Interfacce:** `toPlannerRecipes(recipes, attributes, lines?: ReadonlyMap<string, IngredientLineMapping>)`
(`IngredientLineMapping` da `scripts/import/inputs.ts`). Con `lines`, `ingredientId` è
`lines.get(nome).ingredient` (fallback allo slug se la riga manca), `isOptional` è
`mapping.optional` o la regola attuale sul nome, e `primaryIngredientId` è l'ingrediente
della riga il cui slug è `primary_ingredient`. Senza `lines` resta tutto com'è.

- [ ] **Passo 1:** test «maps lines and the primary ingredient to the import's ingredients»:
  ricetta con righe «Broccolo» e «Gamberi», mappa `{ Broccolo → broccoli, Gamberi → gamberi (optional: true) }`,
  principale `broccolo` → `primaryIngredientId: 'broccoli'`, righe `broccoli` (non
  facoltativa) e `gamberi` (facoltativa).
- [ ] **Passo 2:** test rosso, implementazione, test verde.
- [ ] **Passo 3:** `planner-report.ts` legge `readInputs(resolve(root, 'scripts/import')).lines`
  e la passa. Eseguire `npm run planner-report` **con la somiglianza vecchia** (Task 1
  messo da parte con un commit temporaneo annullato, oppure eseguendo prima del Task 1)
  e salvare il report come riferimento «B» nello scratchpad: è la base del confronto.
  Il riferimento «A» (report di partenza, già salvato) mostra solo l'effetto degli id.
- [ ] **Passo 4:** commit «Report del pianificatore: ingredienti come nell'import».

Ordine pratico: Task 2 si esegue prima del Task 1, così il report «B» è il codice di
`main` più gli id dell'import e il confronto B → C isola la caratteristica nuova.

### Task 3: confronto dei report

- [ ] **Passo 1:** `npm run planner-report` dopo i Task 1 e 2 (report «C», committato in
  `progetto/reports/planner-report.md`).
- [ ] **Passo 2:** confrontare A, B e C: coppie vicine (con la nuova caratteristica),
  pasti fuori stagione, violazioni, «nessuna ricetta adatta», settimane con problemi di
  regole, ricette usate; gradimento medio per settimana calcolato con uno script nello
  scratchpad dalle stelle delle tabelle. Se il gradimento o le regole peggiorano molto,
  fermarsi con `STATO: DOMANDA`.
- [ ] **Passo 3:** commit del report.

### Task 4: campi a 16px

**File:**
- Modifica: `web/src/design/global.css`, `web/src/components/RecipeFilters.module.css`,
  `web/src/components/IngredientRestrictions.module.css`
- Crea: `web/src/design/fieldFontSize.test.ts`

**Scelta del test:** test statico del CSS in vitest (nessun browser nella suite, nessuna
dipendenza nuova); la prova nel browser è il Task 5. Il test legge `global.css` e tutti i
`*.module.css` di `web/src`, divide le regole su una riga (`selettore { dichiarazioni }`,
anche dentro `@media`) e controlla:

1. «gives every field an explicit size of at least 16px»: esiste in `global.css` una regola
   il cui selettore contiene `input`, `select` e `textarea` e che dichiara `font` o
   `font-size` con una misura ≥ 1rem/16px (non `inherit`).
2. «never sets a field below 16px»: nessuna regola che colpisce un campo dichiara una
   dimensione sotto 1rem/16px, in `em`/`%` sotto 1, o `inherit`/`smaller` su `font`/`font-size`.
   Colpisce un campo il selettore il cui ultimo composto è `input`, `select`, `textarea`
   (con classi, attributi o pseudo-classi), oppure una classe di modulo usata come
   `className={styles.x}` su un elemento `<input`, `<select` o `<textarea` dei `.tsx`
   (si risale all'ultimo `<tag` prima dell'attributo).

- [ ] **Passo 1:** scrivere il test; eseguire `npx vitest run src/design/fieldFontSize.test.ts`
  in `web`: fallisce su `button, input { font: inherit }`, `.filters select` (0,875rem) e
  `.select` di `IngredientRestrictions` (0,875rem).
- [ ] **Passo 2:** `global.css`: `button { font: inherit; }` e
  `input, select, textarea { font: 400 1rem/1.5 var(--text-font); }` (dimensione esplicita,
  non legata all'etichetta). Le regole dei campi in `.field` restano a 1rem.
- [ ] **Passo 3:** `.filters select` a `font-size: 1rem`; `.select` delle restrizioni a
  `font: 400 1rem/1.3 var(--text-font)`. Il campo di ricerca dei filtri prende la regola globale.
- [ ] **Passo 4:** test verdi in `web`; commit «Campi a 16px: niente zoom automatico di iOS (#51)».

### Task 5: prova nel browser

- [ ] **Passo 1:** server di sviluppo del web con i dati finti (`npm run dev -w web`, niente
  produzione), skill agent-browser a 390×844.
- [ ] **Passo 2:** su ogni pagina con campi (login, ricettario e «Cambia pasto» con filtri,
  pasto libero e nota, spesa, impostazioni con restrizioni, regole e «Chi mangia quando»,
  preferenze, nuova famiglia, inviti, amministrazione, password) eseguire nel browser uno
  script che elenca i `input`/`select`/`textarea` visibili con `getComputedStyle().fontSize`
  sotto 16px (atteso: nessuno, salvo caselle e radio che non aprono la tastiera) e fare uno
  screenshot dei layout compatti (filtri, restrizioni). Sistemare i layout rotti senza
  scendere sotto i 16px e annotarlo nella PR.

### Task 6: verifica e PR

- [ ] `npm test`, `npm run typecheck`, `npm run build -w web` verdi
  (`superpowers:verification-before-completion`).
- [ ] Push e PR verso `main`: cosa fa, differenza dei report A/B/C, campi corretti, cosa
  resta da provare sull'iPhone (Safari e PWA installata: tocco su «Cerca ricetta» in «Cambia
  pasto», nota, pasto libero, select dei filtri e delle restrizioni). `STATO: PR_APERTA <url>`.

## Decisioni da riportare nella specifica

**Prodotto (sezione 3, Punteggio, voce somiglianza)** - testo proposto:

> - **somiglianza**: penalità per pasti vicini che condividono proteina principale,
>   carboidrato principale, ingrediente principale o categoria, oppure quando l'ingrediente
>   principale di uno è una riga non facoltativa dell'altro (per esempio orecchiette ai
>   broccoli e riso saltato con broccoli e gamberi; deciso il 17 ottobre 2026, issue #48).
>   Se le due ricette hanno lo stesso ingrediente principale conta una volta sola. Ogni
>   caratteristica condivisa pesa allo stesso modo; il peso decresce con la distanza in
>   pasti. Resta una penalità, non un vincolo: nessuna regola sul giorno per ingredienti o
>   proteine. La finestra è mobile, attraversa le settimane e guarda anche ai pasti già
>   pianificati dopo;

**Prodotto (sezione 3, regole di settimana)** - deciso dall'utente il 17 ottobre 2026, revisione
della PR #60: con la somiglianza nuova il report del curatore ha la carne rossa oltre il massimo in 3
settimane su 20 invece di 1. Si accetta così, senza correzioni: nessun cambio al passo 4 della sezione 3
(la riparazione continua a tenere la modifica che sistema di più, quota note/nuove e intervalli alla
pari). Motivo: il ricettario ha ancora troppe poche ricette e le uniche nuove rimaste sono di carne
rossa, quindi la quota le spinge; la soluzione è estendere il ricettario con ricette più varie, che
l'utente farà a breve.

**Tecniche**

- Sezione 3 / report del pianificatore: il report usa gli ingredienti dell'import
  (`ingredient-lines.yaml`) come la produzione, non più lo slug del nome della riga d'origine.
- Sezione 14 (e `design/design.md`, Moduli): il testo dei campi (`input`, `select`,
  `textarea`) è sempre di almeno 16px, con dimensione esplicita che non dipende
  dall'etichetta, perché iOS non ingrandisca la pagina; lo zoom del viewport resta libero
  (issue #51). Un test del CSS (`web/src/design/fieldFontSize.test.ts`) lo controlla.
