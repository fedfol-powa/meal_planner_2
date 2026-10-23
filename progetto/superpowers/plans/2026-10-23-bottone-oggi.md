# Pulsante «Oggi» nel Menu: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella barra del Menu, un pulsante «Oggi» (icona con etichetta) che compare quando il
Menu mostra un giorno diverso da oggi e oggi ha pasti accertati, e riporta a oggi.

**Architecture:** solo client. Un hook nuovo dà la data locale della famiglia e forza un
disegno al ritorno in primo piano se il giorno è cambiato. `MenuView` in
`web/src/routes/MenuPage.tsx` osserva la settimana di oggi con la `weekQuery` esistente (stessa
chiave della settimana mostrata, quindi nessuna lettura doppia) e mostra il pulsante solo se
oggi ha un pasto con `kind !== 'empty'`. Il tocco usa `select` esistente, o la navigazione del
secondo tocco su Menu se la data è cambiata; l'intento di focus è legato alla destinazione.
Nessun cambiamento a server, contratto, MCP o regola di apertura.

**Tech Stack:** React, TanStack Router e Query, CSS Modules, Vitest con Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-23-bottone-oggi.md` (punti 1-8 di «Comportamento»)

## Global Constraints

- Testi «Oggi» / «Today»; nome accessibile «Vai a oggi» / «Go to today».
- Nessuna dipendenza nuova; nessun cambiamento a `server/`, `contract/`, MCP; `savedOpening` e
  `openingQuery` invariati.
- Non toccare `web/src/components/Skeleton.tsx` né `web/src/routes/menu/MenuSkeleton.tsx` (W22).
- Misure: altezza 44 px, freccia 22 px, Roboto Bold 14 px (`0.875rem`), colore `var(--ink)`,
  spazio 6 px, raggio 8 px, padding orizzontale 6 px.
- Codice, commenti e test in inglese; commit in italiano.
- Prove solo sul server di sviluppo con dati finti o sullo stack locale, mai la produzione.

## Review Focus

- Oggi con soli slot vuoti, o senza slot, mentre l'apertura risponde oggi: nessun pulsante
  (Task 3, due test).
- Settimana di oggi non ancora letta o offline senza copia: nessun pulsante finché manca
  (Task 3, «waits for today's week»).
- Ritorno in primo piano dopo mezzanotte con risposte invariate, pulsante prima assente (Task 2
  per l'hook, Task 3 per il Menu).
- Tocco dopo mezzanotte senza nuovi disegni: mai a ieri (Task 3).
- Focus spostato su una navigazione successiva diversa dal tocco, o consumato sull'apertura
  provvisoria dopo mezzanotte (Task 4, due promesse controllate e interruzioni).

## Contesto dei test

`web/src/routes/MenuPage.test.tsx`: orologio finto giovedì 8 ottobre 2026, 12:00 a Roma
(`2026-10-08T10:00:00Z`); `createFakeData` rende corrente la settimana di «adesso» al momento
della creazione, quindi cambiare l'ora dopo `renderApp` non sposta i dati. Nei dati finti tutte
le giornate dal 28/9 al 18/10 hanno contenuto (il 14/10 un pasto vuoto); settimane 21/9, 28/9,
5/10, 12/10. Aiuti già nel file: `weekShown(name)`, `current()`; `setOnline` da
`../test/connectivity`. Nuovi aiuti nel `describe('the Today button')`:

```ts
const todayButton = () => screen.queryByRole('button', { name: 'Vai a oggi' });
const month = () => screen.getByRole('button', { name: 'ottobre 2026' });
const toForeground = () => act(() => { document.dispatchEvent(new Event('visibilitychange')); });
// If jsdom does not report `visibilityState === 'visible'`, define it on `document` in the test.
/** getWeek of one week waits for `release`; the others answer as usual. */
function holdWeek(api: Api, held: IsoDate) { /* wraps api.menu.getWeek; returns { release(): void } */ }
/** getOpening for one family date waits for `release`; the others answer as usual. */
function holdOpening(api: Api, today: IsoDate) { /* wraps api.menu.getOpening; returns { release(): void; fail(error: Error): void }; only the first call waits */ }
```

---

### Task 1: icona e testi

**Files:**
- Modify: `web/src/components/Icon.tsx` (tipo `IconName` e mappa dei tracciati)
- Modify: `web/src/i18n/messages/menu.ts` (dopo `menu.shopping`, nelle due lingue)

**Interfaces:**
- Produces: `IconName` include `'today'`; chiavi `menu.today` («Oggi» / «Today») e
  `menu.todayLabel` («Vai a oggi» / «Go to today»).

- [ ] **Step 1:** aggiungi `'today'` a `IconName` con il tracciato del prototipo
  `<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />` (`Icon` mette già `aria-hidden`).
- [ ] **Step 2:** aggiungi le due chiavi nelle due lingue.
- [ ] **Step 3:** `cd web && npx vitest run src/i18n && npm run typecheck` → PASS, nessun errore.
- [ ] **Step 4:** commit «Pulsante Oggi: icona e testi».

### Task 2: data della famiglia che segue il ritorno in primo piano

**Files:**
- Create: `web/src/routes/menu/today.ts`
- Create: `web/src/routes/menu/today.test.ts`
- Modify: `web/src/routes/MenuPage.tsx:83` (`const today = …`)

**Interfaces:**
- Consumes: `localNow(timeZone: string): LocalDateTime`, `IsoDate` da `../../lib/calendar`.
- Produces: `useFamilyToday(timeZone: string): IsoDate`. Restituisce sempre
  `localNow(timeZone).slice(0, 10)` letto al disegno; tiene la stessa data in uno stato che
  aggiorna su `document` `visibilitychange` (solo se `document.visibilityState === 'visible'`) e
  su `window` `pageshow`: se il giorno è cambiato lo stato cambia e forza un disegno, altrimenti
  React non ridisegna. Ascoltatori tolti allo smontaggio.

- [ ] **Step 1: test che falliscono** (`renderHook` di Testing Library, orologio finto come sopra)
  - `it('reads the family date, not the device one')`: ora `2026-10-08T22:30:00Z`,
    `useFamilyToday('Europe/Rome')` → `'2026-10-09'`; con `'UTC'` → `'2026-10-08'`.
  - `it('renders again when the app comes back on another day')`: conta i disegni; cambia l'ora
    a `2026-10-09T08:00:00Z`; nessun disegno finché non arriva un evento; `visibilitychange` →
    un disegno, valore `'2026-10-09'`.
  - `it('also on pageshow')`: come sopra con `window.dispatchEvent(new Event('pageshow'))`.
  - `it('does not render again on the same day')`: `visibilitychange` senza cambio di ora →
    nessun disegno in più.
- [ ] **Step 2:** `npx vitest run src/routes/menu/today.test.ts` → FAIL (modulo assente).
- [ ] **Step 3:** implementa `useFamilyToday`; in `MenuView` sostituisci il calcolo di `today`
  con `const today = useFamilyToday(family.timeZone);` (stesso valore al disegno: la regola di
  apertura non cambia).
- [ ] **Step 4:** `npx vitest run src/routes/menu/today.test.ts src/routes/MenuPage.test.tsx` →
  PASS, compresi i test esistenti dell'apertura e di «offline after the day changed».
- [ ] **Step 5:** commit «Menu: data della famiglia ricalcolata al ritorno in primo piano».

### Task 3: pulsante nella barra, visibilità e tocco

**Files:**
- Modify: `web/src/routes/MenuPage.tsx` (`MenuView`: query della settimana di oggi, barra ~202-211)
- Modify: `web/src/routes/MenuPage.module.css` (classe `.today`, `white-space: nowrap` su `.month`)
- Test: `web/src/routes/MenuPage.test.tsx` (nuovo `describe('the Today button', …)` dentro `describe('menu')`)

**Interfaces:**
- Consumes: Task 1 (`Icon name="today"`, chiavi); Task 2 (`today`); `weekQuery`, `mondayOf`,
  `select`, `navigate`, `selected`, `localNow` già in `MenuView`.
- Produces: `goToday(): void` e `month` ref (`useRef<HTMLButtonElement>(null)` sul pulsante del
  mese), usati dal Task 4.

- [ ] **Step 1: test che falliscono**
  - `it('is not shown on today')`: `renderApp('/menu')`, `weekShown('giovedì 8 ottobre')` →
    `todayButton()` null.
  - `it('goes back to today from another day of the week')`: `?day=2026-10-06`; pulsante con
    testo `Oggi`; click → `history.location.search` contiene `2026-10-08`, `current()` è giovedì
    8, `todayButton()` null.
  - `it('goes back to today from another week already read')`: `?day=2026-10-12`,
    `weekShown('lunedì 12 ottobre')`; click → `weekShown('giovedì 8 ottobre')`, `current()` giovedì 8.
  - `it('is not shown when today has only empty slots')`: `getWeek` del 5/10 riscritto con i
    pasti dell'8 a `kind: 'empty'` (come il test `it.each` esistente sugli slot vuoti);
    `getOpening` risponde comunque l'8; `?day=2026-10-06` → null.
  - `it('is not shown when today has no slots')`: come sopra con `meals: []` per l'8 → null.
  - `it('waits for today\'s week before showing')`: `holdWeek(api, '2026-10-05')`,
    `?day=2026-10-12`, `weekShown('lunedì 12 ottobre')` → null; `release()` → il pulsante compare.
  - `it('does not need the opening')`: `getOpening` che non risponde mai (`new Promise(() => {})`);
    `?day=2026-10-06` → il pulsante compare.
  - `it('uses the saved copy of today\'s week offline')`: `?day=2026-10-06` online,
    `weekShown`; vai a Profilo, `setOnline(false)`, `history.push('/menu?day=2026-10-12')` (letta
    in anticipo come settimana accanto) → il pulsante compare. Variante senza copia: `holdWeek`
    sul 5/10 mai rilasciato, `?day=2026-10-12`, poi `setOnline(false)` → null.
  - `it('follows the family date, not the device one')`: ora `2026-10-08T22:30:00Z`;
    `?day=2026-10-08` → pulsante presente; click → `current()` venerdì 9.
  - `it('appears when the app comes back on the next day')`: `?day=2026-10-08`,
    `weekShown`, null; ora `2026-10-09T08:00:00Z`; `toForeground()` → pulsante presente (cache
    popolata, nessuna risposta cambiata).
  - `it('follows the next day without a button when no day is asked')`: `/menu`, giovedì 8;
    ora venerdì; `toForeground()` → `current()` venerdì 9, null.
  - `it('stays hidden when the next day has no meals')`: `getWeek` del 5/10 con i pasti del 9 a
    `kind: 'empty'`; `?day=2026-10-08`; ora venerdì; `toForeground()` → null.
  - `it('re-reads the date when tapped after midnight')`: `?day=2026-10-06`; ora
    `2026-10-09T08:00:00Z` senza eventi; click → `history.location.search` non contiene `day=`,
    `current()` venerdì 9.
  - `it('speaks English')`: profilo `en-GB` come nel test `it.each` esistente,
    `?day=2026-10-06` → pulsante con nome `Go to today` e testo `Today`.
- [ ] **Step 2:** `npx vitest run src/routes/MenuPage.test.tsx -t "Today button"` → FAIL.
- [ ] **Step 3: implementa in `MenuView`**
  - `const todayWeek = useQuery({ ...weekQuery(deps, familyId, mondayOf(today)), retry: false });`
    con le stesse opzioni della query della settimana mostrata, niente di più (stessa chiave
    quando coincidono; normale ciclo di letture, spec punto 1).
  - `const todayHasMeals = !!todayWeek.data?.days.find((d) => d.date === today)?.meals.some((m) => m.kind !== 'empty');`
  - `const showToday = todayHasMeals && selected !== today;`
  - `goToday()`: se `localNow(family.timeZone).slice(0, 10) !== today` →
    `void navigate({ search: {} })`; altrimenti `select(today)`. (Il focus arriva col Task 4.)
  - Nella barra, primo figlio di `styles.actions`, solo se `showToday`:
    `<button type="button" className={styles.today} aria-label={t('menu.todayLabel')} onClick={goToday}><Icon name="today" /><span>{t('menu.today')}</span></button>`.
  - CSS: `.today { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 6px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); white-space: nowrap; cursor: pointer; }`,
    `.today :global(.icon) { width: 22px; height: 22px; }`; `white-space: nowrap` su `.month`.
- [ ] **Step 4:** `npx vitest run src/routes/MenuPage.test.tsx` → tutti PASS (anche swipe,
  calendario, tocco su Menu, offline).
- [ ] **Step 5:** commit «Pulsante Oggi nella barra del Menu».

### Task 4: focus sul mese all'arrivo

**Files:**
- Modify: `web/src/routes/MenuPage.tsx` (`MenuView`)
- Test: `web/src/routes/MenuPage.test.tsx` (stesso `describe`)

**Interfaces:**
- Consumes: `goToday`, ref `month` (Task 3); `requested` (search `day`), `selected`, `week.data`.
- Produces: tipo `FocusIntent = { kind: 'day'; day: IsoDate } | { kind: 'opening'; date: IsoDate }`
  e ref `focusOnArrival = useRef<FocusIntent | null>(null)`.

Regola (spec, punto 3):
- `goToday` imposta `{ kind: 'day', day: today }` prima di `select(today)`, oppure
  `{ kind: 'opening', date: <nuova data> }` prima di `navigate({ search: {} })`.
- Un `useEffect` a ogni disegno calcola la destinazione dell'intento:
  - annulla se `kind === 'day'` e `requested !== day`, o se `kind === 'opening'` e
    (`requested !== undefined` o `today !== date` o `opening.isError`: l'errore toglie la copia
    provvisoria e il Menu mostra `QueryError`, quindi niente focus);
  - `kind === 'day'` → destinazione `day`;
  - `kind === 'opening'` → destinazione `openingDay.date` solo se l'apertura è risolta:
    `opening.data` c'è e (`!opening.isPlaceholderData` o `opening.fetchStatus === 'paused'`);
    altrimenti nessuna destinazione e si aspetta (con `today === date`, la
    chiave della query è già quella della nuova data);
  - con una destinazione: se `week.data` c'è, `selected === destinazione` e `month.current`
    esiste → `month.current.focus()` e annulla.
- In `togglePicker`, il percorso condiviso da mese e icona del calendario, quando il calendario
  si apre: `focusOnArrival.current = null`.

- [ ] **Step 1: test che falliscono**
  - Aggiungi a «goes back to today from another day of the week» e «…from another week already
    read»: `await waitFor(() => expect(document.activeElement).toBe(month()))`.
  Preparazione comune dei test dopo mezzanotte: ora domenica `2026-10-11T10:00:00Z` prima di
  `renderApp`; `const week = holdWeek(api, '2026-10-12')`, `const opening = holdOpening(api, '2026-10-12')`;
  `?day=2026-10-06`, `weekShown` (l'apertura di domenica 11 e la settimana del 5 sono salvate,
  quella del 12 no; pulsante presente perché domenica ha pasti); ora lunedì
  `2026-10-12T08:00:00Z`, nessun evento; click su «Vai a oggi».
  - `it('waits for the real opening before moving the focus')`: dopo il click il Menu mostra
    l'apertura provvisoria salvata (`current()` domenica 11) e `document.activeElement` non è
    `month()`; `opening.release()` → compare lo skeleton
    (`document.querySelector('.calendar [aria-busy="true"]')` non null), focus ancora non sul
    mese, `todayButton()` null; `week.release()` → `weekShown('lunedì 12 ottobre')`,
    `current()` lunedì 12, `await waitFor(() => expect(document.activeElement).toBe(month()))`.
  - `it('drops the focus intent when a day is chosen on the provisional opening')`: dopo il
    click, sull'apertura provvisoria click su `sabato 10 ottobre`; `opening.release()`,
    `week.release()` → `current()` sabato 10, `document.activeElement` diverso da `month()`.
  - `it('drops the focus intent when another day is chosen while waiting')`: dopo il click,
    `opening.release()`; nello skeleton click su `martedì 13 ottobre`; `week.release()` →
    `current()` martedì 13, `document.activeElement` diverso da `month()`.
  - `it('drops the focus intent when the calendar is opened while waiting')`: dopo il click,
    sull'apertura provvisoria click su `Scegli un giorno` (icona; ripeti in una seconda
    esecuzione con il mese `ottobre 2026`, `it.each`); nel dialogo dai il focus a
    `Mese precedente` e cliccalo; `week.release()`, poi `opening.release()` →
    `document.activeElement` resta un controllo del dialogo `Scegli un giorno`, non `month()`.
  - `it('drops the focus intent when the opening fails')`: come la preparazione, ma
    `holdOpening` rifiuta la prima richiesta con `new ApiError('unknown')` (codice non `network`, che
    non si ritenta) invece di rispondere; dopo il rifiuto compare l'errore con «Riprova»;
    `week.release()` e click su «Riprova» con `getOpening` che ora risponde lunedì 12 →
    `current()` lunedì 12 e `document.activeElement` diverso da `month()`.
  - `it('moves the focus on the saved opening when offline')`: come la preparazione, ma
    `setOnline(false)` prima del click; dopo il click il Menu resta sull'apertura salvata
    (domenica 11, richiesta in pausa) e il focus va su `month()`.
- [ ] **Step 2:** `npx vitest run src/routes/MenuPage.test.tsx -t "Today button"` → FAIL sui focus.
- [ ] **Step 3:** implementa la regola sopra.
- [ ] **Step 4:** `npx vitest run src/routes/MenuPage.test.tsx` → PASS, compresi i test di focus
  esistenti del calendario («gives focus back to the calendar icon…», «…to the month…»,
  «does not steal focus from the month arrows…»).
- [ ] **Step 5:** commit «Pulsante Oggi: focus sul mese all'arrivo».

### Task 5: verifica e PR

**Files:**
- `design/design.md`, sezione «Calendario e navigazione»: già aggiornata con spec e piano.

- [ ] **Step 1:** dalla cartella `web`: `npm test`, `npm run typecheck`, poi `vite build` con le
  variabili dello stack locale (mai `.env.production`, vedi `AGENTS.md`) → tutto verde. Dalla
  radice `npm test` per gli altri pacchetti.
- [ ] **Step 2:** prova con agent-browser sul server di sviluppo con dati finti, a 375 × 812, in
  italiano e in inglese (settimana di settembre in inglese per «September 2026»):
  - `getBoundingClientRect()` di mese, pulsante del calendario, borsa e fila dei giorni su oggi
    e su un altro giorno della stessa settimana: `x`, `y`, `width`, `height` identici;
  - pulsante «Oggi» alto almeno 44 px, barra senza overflow (`scrollWidth === clientWidth`);
  - con Tab il pulsante riceve il focus e ha un contorno visibile (`outline-style` non `none`
    in `:focus-visible`);
  - tocco che riporta a oggi da un altro giorno, dopo uno swipe e dal calendario.
  Screenshot nella cartella temporanea della sessione.
- [ ] **Step 3:** push, `gh pr create` verso `main` con descrizione in italiano (cosa fa,
  verifica, sezioni 5 e 14, «Da provare a mano sull'iPhone» dalla spec), poi
  `STATO: PR_APERTA <url>`.
