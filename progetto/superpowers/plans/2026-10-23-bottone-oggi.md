# Pulsante «Oggi» nel Menu: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella barra del Menu, un pulsante «Oggi» (icona con etichetta) che compare quando il
Menu mostra un giorno diverso da oggi, se oggi ha pasti, e riporta a oggi.

**Architecture:** solo client. `MenuView` in `web/src/routes/MenuPage.tsx` sa già la data locale
della famiglia (`today`), il giorno di apertura (`openingDay`) e il giorno mostrato
(`selected`); il pulsante è un ramo della barra che usa la funzione `select` esistente. Nessuna
lettura nuova, nessun cambiamento a server, contratto o MCP.

**Tech Stack:** React, TanStack Router e Query, CSS Modules, Vitest con Testing Library.

**Spec:** `progetto/superpowers/specs/2026-10-23-bottone-oggi.md`

## Global Constraints

- Testi «Oggi» / «Today»; nome accessibile «Vai a oggi» / «Go to today».
- Nessuna dipendenza nuova; nessun cambiamento a `server/`, `contract/`, MCP.
- Non toccare `Skeleton.tsx` né `web/src/routes/menu/MenuSkeleton.tsx` (W22).
- Misure: altezza 44 px, freccia 22 px, Roboto Bold 14 px (`0.875rem`), colore `var(--ink)`,
  spazio 6 px, raggio 8 px, padding orizzontale 6 px.
- Codice, commenti e test in inglese; commit in italiano.
- Prove solo sul server di sviluppo con dati finti o sullo stack locale, mai la produzione.

## Review Focus

- App aperta a cavallo della mezzanotte senza nuovi disegni: il tocco non deve portare a ieri
  (test in Task 2, «re-reads the date when tapped after midnight»).
- Oggi senza pasti: il pulsante non deve comparire su nessun giorno (Task 2).
- Data della famiglia diversa da quella del dispositivo (dopo mezzanotte a Roma, prima in UTC):
  il pulsante segue il fuso della famiglia (Task 2).
- Ritorno da un'altra settimana non ancora letta: focus sul mese dopo lo skeleton, non perso
  (Task 2, focus da un'altra settimana).
- Barra che va a capo con un mese lungo in inglese: si controlla nel browser (Task 3).

---

### Task 1: icona e testi

**Files:**
- Modify: `web/src/components/Icon.tsx` (tipo `IconName` e mappa dei tracciati)
- Modify: `web/src/i18n/messages/menu.ts` (italiano dopo `menu.shopping`, inglese dopo `menu.shopping`)

**Interfaces:**
- Produces: `IconName` include `'today'`; chiavi `menu.today` («Oggi» / «Today») e
  `menu.todayLabel` («Vai a oggi» / «Go to today»).

- [ ] **Step 1:** aggiungi `'today'` a `IconName` con il tracciato del prototipo
  `<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />`.
- [ ] **Step 2:** aggiungi le due chiavi nelle due lingue.
- [ ] **Step 3:** `cd web && npx vitest run src/i18n` → PASS (stesse chiavi nelle due lingue);
  `npm run typecheck` → nessun errore.
- [ ] **Step 4:** commit «Pulsante Oggi: icona e testi».

### Task 2: pulsante nella barra del Menu

**Files:**
- Modify: `web/src/routes/MenuPage.tsx` (`MenuView`: barra, riga ~202-211)
- Modify: `web/src/routes/MenuPage.module.css` (classe `.today`)
- Test: `web/src/routes/MenuPage.test.tsx` (nuovo `describe('the Today button', …)` nel `describe('menu')`)

**Interfaces:**
- Consumes: `Icon name="today"`, `t('menu.today')`, `t('menu.todayLabel')` (Task 1); `select`,
  `today`, `openingDay`, `selected`, `localNow`, `family.timeZone` già in `MenuView`.

Contesto dei test: l'orologio finto è giovedì 8 ottobre 2026, 12:00 a Roma; i dati finti hanno
pasti l'8 e menu nella settimana del 12. `current()` e `weekShown()` sono già nel file.
`const todayButton = () => screen.queryByRole('button', { name: 'Vai a oggi' });`

- [ ] **Step 1: test che falliscono**
  - `it('is not shown on today')`: `renderApp('/menu')`, `weekShown('giovedì 8 ottobre')`,
    `expect(todayButton()).toBeNull()`.
  - `it('goes back to today from another day of the week')`: `renderApp('/menu?day=2026-10-06')`,
    `weekShown('martedì 6 ottobre')`; il pulsante ha testo `Oggi`; click; `history.location.search`
    contiene `2026-10-08`; `current()` è `giovedì 8 ottobre`; `todayButton()` è `null`;
    `document.activeElement` è il pulsante `ottobre 2026`.
  - `it('goes back to today from another week')`: `renderApp('/menu?day=2026-10-12')`,
    `weekShown('lunedì 12 ottobre')`; click; `weekShown('giovedì 8 ottobre')`; `current()` è
    giovedì 8; poi `await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ottobre 2026' })))`.
  - `it('is not shown when today has no meals')`: `api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 })`,
    `api.menu.getOpening` risponde `{ kind: 'day', date: '2026-10-09', weekStartsOn: '2026-10-05' }`;
    `renderApp('/menu?day=2026-10-06', { api })`, `weekShown('martedì 6 ottobre')`,
    `expect(todayButton()).toBeNull()`; poi click su `venerdì 9 ottobre`, ancora `null`.
  - `it('follows the family date, not the device one')`: `vi.setSystemTime(new Date('2026-10-08T22:30:00Z'))`
    (00:30 di venerdì 9 a Roma); `renderApp('/menu?day=2026-10-08')`; click sul pulsante;
    `current()` è `venerdì 9 ottobre`.
  - `it('re-reads the date when tapped after midnight')`: `renderApp('/menu?day=2026-10-06')`,
    `weekShown('martedì 6 ottobre')`; `vi.setSystemTime(new Date('2026-10-09T08:00:00Z'))` senza
    nuovi disegni; click; `history.location.search` non contiene `2026-10-08`; `current()` diventa
    `venerdì 9 ottobre`.
  - `it('speaks English')`: `renderApp('/menu?day=2026-10-06', { locale: 'en-GB' })` con profilo
    inglese come nel test `it.each` esistente; c'è un pulsante con nome `Go to today` e testo `Today`.
- [ ] **Step 2:** `cd web && npx vitest run src/routes/MenuPage.test.tsx -t "Today button"` → FAIL
  (pulsante assente).
- [ ] **Step 3: implementa in `MenuView`**
  - `const showToday = openingDay?.date === today && selected !== today;` (calcolato dopo
    `selected`; `today` è la costante esistente).
  - Ref `month = useRef<HTMLButtonElement>(null)` sul pulsante del mese; ref
    `focusMonth = useRef(false)`; un `useEffect` senza dipendenze ristrette che, se
    `focusMonth.current` e il pulsante del mese esiste, gli dà il focus e azzera il flag (il mese
    esiste solo con la settimana mostrata, quindi dopo lo skeleton).
  - `function goToday()`: `focusMonth.current = true`; se `localNow(family.timeZone).slice(0, 10) !== today`
    → `void navigate({ search: {} })` (come il secondo tocco su Menu); altrimenti `select(today)`.
  - Nella barra, primo figlio di `styles.actions`, solo se `showToday`:
    `<button type="button" className={styles.today} aria-label={t('menu.todayLabel')} onClick={goToday}><Icon name="today" /><span>{t('menu.today')}</span></button>`
    (`Icon` mette già `aria-hidden="true"`).
  - CSS: `.today { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 6px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); white-space: nowrap; cursor: pointer; }`
    e `.today :global(.icon) { width: 22px; height: 22px; }`; aggiungi `white-space: nowrap` a
    `.month`.
- [ ] **Step 4:** `npx vitest run src/routes/MenuPage.test.tsx` → tutti PASS, compresi i test
  esistenti (swipe, calendario, focus del calendario, tocco su Menu).
- [ ] **Step 5:** commit «Pulsante Oggi nella barra del Menu».

### Task 3: guida visiva, verifica e PR

**Files:**
- `design/design.md`, sezione «Calendario e navigazione» (delegata dal brief): già aggiornata

- [x] **Step 1:** `design/design.md` aggiornato con la forma scelta insieme a spec e piano.
- [ ] **Step 2:** dalla cartella `web`: test completi, controllo dei tipi e
  `vite build` con le variabili dello stack locale (mai `.env.production`, vedi `AGENTS.md`) →
  tutto verde.
- [ ] **Step 3:** prova con agent-browser sul server di sviluppo con dati finti, a 375 × 812:
  pulsante assente su oggi; presente su un altro giorno, dopo uno swipe e dal calendario; tocco
  che riporta a oggi; altezza della barra 44 px con e senza pulsante; in inglese con una
  settimana di settembre, nessun overflow della barra (`scrollWidth === clientWidth`).
  Screenshot nella cartella temporanea.
- [ ] **Step 4:** push, `gh pr create` verso `main` con
  descrizione in italiano (cosa fa, verifica, sezioni 5 e 14, cosa provare sull'iPhone dalla
  spec), poi `STATO: PR_APERTA <url>`.
