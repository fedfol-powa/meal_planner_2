# App web di base (W5): piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire in `web/` la base React dell'app (SPA, PWA, design, lingue, login, Menu, Ricettario e Profilo con dati finti) su cui l'ondata 2 aggiunge le funzioni vere.

**Architecture:** SPA Vite con rotte TanStack Router definite in codice e dati TanStack Query letti attraverso un'interfaccia `Api` con la stessa forma del futuro client oRPC. Per ora la implementa un client finto alimentato dai dati demo del prototipo. Lo strato delle query gestisce in modo trasparente la risposta «invariato» del contratto. La cache è persistita per utente in IndexedDB. Il service worker è scritto a mano e costruito da Vite come seconda entrata.

**Tech Stack:** React 19, Vite 8 con `@vitejs/plugin-react`, TanStack Router 1, TanStack Query 5 con `@tanstack/react-query-persist-client`, `@supabase/supabase-js` 2, TypeScript 6, Vitest 4.1 (come la radice), Testing Library per React, jsdom. Node 26. `web/` è il workspace npm `@app/web` dello scheletro di W1 (PR #3).

**Spec:** `progetto/superpowers/specs/2026-10-11-app-web-di-base.md` (sotto la specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1, 12 e 14; linguaggio visivo in `design/design.md` e `design/index.html`; percorsi in `design/percorsi.md`).

## Global Constraints

- Lavorare solo in `web/` (proprietà di W5); non toccare la radice, `prototype/`, `design/` né altre directory, che si leggono soltanto.
- Codice, nomi di file, commenti e test in inglese; ogni testo per l'utente passa da `useT()` con chiavi presenti in `it-IT` e `en-GB`.
- Dipendenze di esecuzione solo: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-query-persist-client`, `@supabase/supabase-js`. Di sviluppo solo: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/dom`, `jsdom` (`typescript` e `vitest` dalla radice). Nessun'altra senza passare dal coordinatore.
- Versioni verificate l'11 ottobre 2026 (`npm view`): react 19.3, @tanstack/react-router 1.170, @tanstack/react-query 5.104, @supabase/supabase-js 2.117, vite 8.3, @vitejs/plugin-react 6.1, @testing-library/react 16.3, jsdom 30.1. Vitest e TypeScript sono quelli della radice (`vitest ^4.1.11`, `typescript ^6.0.3`): non se ne installa una seconda versione.
- Workspace npm: le dipendenze si installano dalla radice con `npm install -w web …` (un solo `package-lock.json`, alla radice); `web/package.json` deve avere gli script `test` e `typecheck` veri, perché la radice e la CI li lanciano con `--if-present`.
- Prima di usare un'API di una libreria non mostrata in questo piano, consultarla con Context7 (`/tanstack/router`, `/tanstack/query`, `/supabase/supabase-js`, `/vitejs/vite`).
- Token e componenti di `design/design.md`: fondo `#FAF8F3`, testo `#232323`, verde `#067A46`, Agrandir per i titoli dei piatti, Agrandir Tight per le sezioni, Roboto per il corpo; controlli da almeno 44 px; schede senza raggio con ombra `0 1px 3px rgb(0 0 0 / 10%)`; pulsanti con raggio 8 px.
- Il pasto è passato dalle 15:30 (pranzo) e dalle 23:00 (cena), ora locale della famiglia.
- Porta della prova su iPhone: 8767.
- Commit piccoli con messaggio in italiano e la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ingredienti mai dedotti dal nome del piatto: il client finto usa solo quelli dei dati demo.

## Review Focus

- Due persone sullo stesso telefono: dopo l'uscita di A e l'ingresso di B, B non deve vedere nulla di A, né in memoria né da IndexedDB (test nel Task 8).
- `?day=` scritto a mano, malformato o di una settimana che non esiste: il Menu apre il giorno di apertura senza errori (test nel Task 13).
- Voto che fallisce (offline, server che rifiuta): le stelle e la media tornano ovunque al valore di prima e compare l'errore tradotto (test nel Task 11).
- Cambio di lingua: tutta l'interfaccia e i testi delle ricette passano all'altra lingua e cambia l'attributo `lang` del documento (test nel Task 16).
- Copia salvata illeggibile o di una build precedente: l'app parte comunque, a cache vuota (test nel Task 7).

## Mappa dei file

```
web/
├── .gitignore                    dist/, public/assets/ (copiati), node_modules/
├── README.md                     comandi e modalità
├── index.html                    meta PWA e Apple, viewport-fit=cover
├── package.json, tsconfig.json, vite.config.ts
├── public/
│   ├── manifest.webmanifest
│   └── icons/                    icon-192.png, icon-512.png, apple-touch-icon.png, icon.svg
├── scripts/
│   ├── sync-assets.mjs           font e foto da ../design/assets in public/assets
│   ├── build-fake-data.mjs       dati demo ridotti dal prototipo
│   └── make-icons.sh             icone PNG da icon.svg con ImageMagick (una tantum)
└── src/
    ├── main.tsx                  avvio e registrazione del service worker
    ├── App.tsx                   AppRoot: provider e router, usato anche dai test
    ├── env.ts                    lettura di VITE_SUPABASE_* e versione della build
    ├── vite-env.d.ts             tipi di import.meta.env e __BUILD_VERSION__
    ├── design/                   tokens.css, fonts.css, global.css
    ├── lib/calendar.ts           date ISO, settimane, pasto passato, ora locale
    ├── i18n/                     messages/*.ts, translate.ts, dates.ts, text.ts, LocaleProvider.tsx
    ├── api/
    │   ├── types.ts              viste, input, Read<T>, Api
    │   ├── errors.ts             ApiError e codici
    │   ├── ApiProvider.tsx       contesto React di Api
    │   ├── queries.ts            readThrough, Versioned, queryOptions
    │   ├── ratings.ts            useRateRecipe e aggiornamento delle viste
    │   ├── persister.ts          KeyValueStore, IndexedDB, memoria, createPersister
    │   └── fake/                 demo-data.json, seed.ts, quantity.ts, fakeApi.ts
    ├── auth/                     backend.ts, supabaseBackend.ts, AuthProvider.tsx, LoginPage.tsx
    ├── session/SessionScope.tsx  QueryClient e persister per utente, useSignOut
    ├── router.tsx                albero delle rotte, guardia, layout
    ├── components/               Icon, BottomNav, StateNotice, PageHeader, OfflineBanner,
    │                             RatingStars, RecipeCard, IngredientList, DaySelector,
    │                             DatePicker, RecipeFilters, ServingsStepper
    ├── routes/                   MenuPage, RecipesPage, RecipePage, ProfilePage, NotFound, RouteError
    ├── pwa/                      sw-rules.ts, sw.ts, register.ts
    └── test/                     setup.ts, renderApp.tsx
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
Nota: finché `src/pwa/sw.ts` non esiste (Task 17), creare un file provvisorio `web/src/pwa/sw.ts` con il solo commento `// Service worker: written in task 17.` così la build funziona.

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

`web/src/App.tsx` (lo sostituisce il Task 9):
```tsx
export function App() {
  return <p>Cosa si mangia</p>;
}
```

`web/src/main.tsx` (lo completano i Task 9 e 17):
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
  - `<LocaleProvider initial: Locale>`; `useLocale(): { locale: Locale; setLocale(l: Locale, options?: { remember?: boolean }): void; hasDeviceChoice: boolean }`; `useT(): (key: MessageKey, params?: MessageParams) => string`; `useProfileLocale(profileLocale: Locale | undefined): void`
  - chiave di `localStorage`: `'locale'`

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
import { beforeEach, expect, it } from 'vitest';
import { LocaleProvider, useLocale, useT } from './LocaleProvider';

function Probe() {
  const t = useT();
  const { setLocale, hasDeviceChoice } = useLocale();
  return (
    <>
      <p>{t('nav.recipes')}</p>
      <p>{hasDeviceChoice ? 'chosen' : 'default'}</p>
      <button onClick={() => setLocale('en-GB')}>en</button>
    </>
  );
}

beforeEach(() => localStorage.clear());

it('switches language, remembers it on the device and sets the document language', () => {
  render(<LocaleProvider initial="it-IT"><Probe /></LocaleProvider>);
  expect(screen.getByText('Ricettario')).toBeTruthy();
  expect(screen.getByText('default')).toBeTruthy();
  expect(document.documentElement.lang).toBe('it');
  act(() => screen.getByText('en').click());
  expect(screen.getByText('Recipes')).toBeTruthy();
  expect(screen.getByText('chosen')).toBeTruthy();
  expect(document.documentElement.lang).toBe('en-GB');
  expect(localStorage.getItem('locale')).toBe('en-GB');
});

it('starts from the stored choice', () => {
  localStorage.setItem('locale', 'en-GB');
  render(<LocaleProvider initial="it-IT"><Probe /></LocaleProvider>);
  expect(screen.getByText('Recipes')).toBeTruthy();
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
import { LOCALES, translate, type Locale, type MessageKey, type MessageParams } from './translate';

const STORAGE_KEY = 'locale';

// Storage may be unavailable (private mode): the choice then lasts only for the session.
function readStored(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(value as Locale) ? (value as Locale) : null;
  } catch {
    return null;
  }
}

interface LocaleContextValue {
  locale: Locale;
  /** remember: false applies the profile language without making it a device choice. */
  setLocale: (locale: Locale, options?: { remember?: boolean }) => void;
  /** True when this device chose a language; it then wins over the profile (spec, Profilo). */
  hasDeviceChoice: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [stored, setStored] = useState<Locale | null>(readStored);
  const [fallback, setFallback] = useState<Locale>(initial);
  const locale = stored ?? fallback;

  const setLocale = useCallback((next: Locale, options?: { remember?: boolean }) => {
    setFallback(next);
    if (options?.remember === false) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; still applied for this session.
    }
    setStored(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'it-IT' ? 'it' : 'en-GB';
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, hasDeviceChoice: stored !== null }), [locale, setLocale, stored]);
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

/** Profile language from the server, applied only if this device made no choice. */
export function useProfileLocale(profileLocale: Locale | undefined) {
  const { hasDeviceChoice, locale, setLocale } = useLocale();
  useEffect(() => {
    if (profileLocale && !hasDeviceChoice && profileLocale !== locale) setLocale(profileLocale, { remember: false });
  }, [profileLocale, hasDeviceChoice, locale, setLocale]);
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

/** «Invariato» in the contract (decided by W1): reads take knownVersion and may answer unchanged. */
export type Read<T> = { unchanged: true; version: number } | { unchanged: false; version: number; data: T };
export interface ReadInput { knownVersion?: number }
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
    get(input: FamilyInput & { recipeId: string; servings?: number }): Promise<Read<RecipeDetailView>>;
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
```

- Produces (da `src/api/ApiProvider.tsx`): `<ApiProvider api={Api}>`, `useApi(): Api`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, errorKey, toApiError } from './errors';

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

### Task 5: Dati demo e client finto

**Files:**
- Create: `web/scripts/build-fake-data.mjs`, `web/src/api/fake/demo-data.json` (generato), `web/src/api/fake/seed.ts`, `web/src/api/fake/quantity.ts`, `web/src/api/fake/fakeApi.ts`
- Test: `web/src/api/fake/quantity.test.ts`, `web/src/api/fake/fakeApi.test.ts`

**Interfaces:**
- Consumes: tipi di `src/api/types.ts`; `ApiError`; funzioni di `src/lib/calendar.ts`; `translate`, `Locale`.
- Produces:
  - `createFakeApi(options: FakeApiOptions): Api` con `interface FakeApiOptions { getLocale: () => Locale; user?: { id: string; email: string }; latencyMs?: number }`
  - `DEMO_FAMILY_ID = 'family-main'`, `DEMO_USER_ID = 'user-federico'`
  - `formatAmount(quantity: Quantity, sourceText: string, text: Translated | null, locale: Locale): string`, `scaleQuantity(quantity: Quantity, factor: number): Quantity`

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
import { ApiError } from '../errors';
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

  async function respond<T>(value: T): Promise<Read<T>> {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return { unchanged: false, version: 1, data: structuredClone(value) };
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

  return {
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
        return ratingSummary(recipeId);
      }
    }
  };
}
```

- [ ] **Step 9: Verifica che passino, tipi compresi**

Run: `cd web && npx vitest run src/api/fake && npm run typecheck`
Expected: PASS; nessun errore di tipi. Se un'aspettativa sui dati (per esempio la ricetta `wok-pollo-peperoni-riso-basmati` a 25 minuti per 6 porzioni, o la presenza del 18 ottobre fra le date) non corrisponde a `demo-data.json`, verificare il dato nel JSON e correggere il test, non il client.

- [ ] **Step 10: Commit**

```bash
git add web/scripts/build-fake-data.mjs web/src/api/fake
git commit -m "Web: client finto con i dati demo del prototipo, spostati sulla settimana corrente"
```

---

### Task 6: Query con «invariato» trasparente

**Files:**
- Create: `web/src/api/queries.ts`
- Test: `web/src/api/queries.test.ts`

**Interfaces:**
- Consumes: `Api`, `Read<T>`, viste da `src/api/types.ts`; `toApiError`; `useApi`.
- Produces:
  - `interface Versioned<T> { version: number; data: T }`
  - `readThrough<T>(queryClient: QueryClient, queryKey: QueryKey, read: (knownVersion?: number) => Promise<Read<T>>): Promise<Versioned<T>>`
  - `interface QueryDeps { api: Api; queryClient: QueryClient }`, `useQueryDeps(): QueryDeps`
  - `queryKeys`: `me()`, `opening(familyId)`, `week(familyId, weekStartsOn)`, `dates(familyId, month)`, `search(familyId, query)`, `recipe(familyId, recipeId, servings?)`; prefissi `RATED_PREFIXES = [['menu','getWeek'], ['recipes','search'], ['recipes','get']]`
  - `meQuery(deps)`, `openingQuery(deps, familyId)`, `weekQuery(deps, familyId, weekStartsOn)`, `datesQuery(deps, familyId, month)`, `searchQuery(deps, familyId, query)`, `recipeQuery(deps, familyId, recipeId, servings?)`: `queryOptions` con dati in cache `Versioned<T>` e `select` che restituisce `T`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { readThrough, type Versioned } from './queries';
import type { Read } from './types';

const key = ['menu', 'getWeek', { familyId: 'f', weekStartsOn: '2026-10-05' }] as const;

describe('readThrough', () => {
  it('reads without a version when nothing is cached', async () => {
    const client = new QueryClient();
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: 3, data: 'week' }));
    expect(await readThrough(client, key, read)).toEqual({ version: 3, data: 'week' });
    expect(read).toHaveBeenCalledWith(undefined);
  });
  it('sends the cached version and keeps the cached view when unchanged', async () => {
    const client = new QueryClient();
    const cached: Versioned<string> = { version: 3, data: 'week' };
    client.setQueryData(key, cached);
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: true, version: 3 }));
    expect(await readThrough(client, key, read)).toBe(cached);
    expect(read).toHaveBeenCalledWith(3);
  });
  it('takes the new view when it changed', async () => {
    const client = new QueryClient();
    client.setQueryData(key, { version: 3, data: 'old' });
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: 4, data: 'new' }));
    expect(await readThrough(client, key, read)).toEqual({ version: 4, data: 'new' });
  });
  it('reads again without a version if the server answers unchanged but the cache is gone', async () => {
    const client = new QueryClient();
    const read = vi.fn()
      .mockResolvedValueOnce({ unchanged: true, version: 3 })
      .mockResolvedValueOnce({ unchanged: false, version: 3, data: 'week' });
    expect(await readThrough(client, key, read)).toEqual({ version: 3, data: 'week' });
    expect(read).toHaveBeenNthCalledWith(2, undefined);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/queries.test.ts`
Expected: FAIL, `Failed to resolve import "./queries"`.

- [ ] **Step 3: Implementa**

```ts
import { queryOptions, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { IsoDate } from '../lib/calendar';
import { useApi } from './ApiProvider';
import type { Api, Read, RecipeQuery } from './types';

/** What the cache keeps: the view and its version, sent back as knownVersion. */
export interface Versioned<T> { version: number; data: T }

/** Wraps a read so screens never see «unchanged» (contract decided by W1). */
export async function readThrough<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: (knownVersion?: number) => Promise<Read<T>>
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

export interface QueryDeps { api: Api; queryClient: QueryClient }

export function useQueryDeps(): QueryDeps {
  return { api: useApi(), queryClient: useQueryClient() };
}

export const queryKeys = {
  me: () => ['me', 'get'] as const,
  opening: (familyId: string) => ['menu', 'getOpening', { familyId }] as const,
  week: (familyId: string, weekStartsOn: IsoDate) => ['menu', 'getWeek', { familyId, weekStartsOn }] as const,
  dates: (familyId: string, month: string) => ['menu', 'getDates', { familyId, month }] as const,
  search: (familyId: string, query: RecipeQuery) => ['recipes', 'search', { familyId, query }] as const,
  recipe: (familyId: string, recipeId: string, servings?: number) => ['recipes', 'get', { familyId, recipeId, servings }] as const
};

/** Views that contain ratings, patched in place by the rating mutation. */
export const RATED_PREFIXES = [['menu', 'getWeek'], ['recipes', 'search'], ['recipes', 'get']] as const;

const select = <T,>(value: Versioned<T>) => value.data;

export function meQuery({ api, queryClient }: QueryDeps) {
  const queryKey = queryKeys.me();
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.me.get({ knownVersion })), select });
}

export function openingQuery({ api, queryClient }: QueryDeps, familyId: string) {
  const queryKey = queryKeys.opening(familyId);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getOpening({ familyId, knownVersion })), select });
}

export function weekQuery({ api, queryClient }: QueryDeps, familyId: string, weekStartsOn: IsoDate) {
  const queryKey = queryKeys.week(familyId, weekStartsOn);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getWeek({ familyId, weekStartsOn, knownVersion })), select });
}

export function datesQuery({ api, queryClient }: QueryDeps, familyId: string, month: string) {
  const queryKey = queryKeys.dates(familyId, month);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getDates({ familyId, month, knownVersion })), select });
}

export function searchQuery({ api, queryClient }: QueryDeps, familyId: string, query: RecipeQuery) {
  const queryKey = queryKeys.search(familyId, query);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.search({ familyId, query, knownVersion })), select });
}

export function recipeQuery({ api, queryClient }: QueryDeps, familyId: string, recipeId: string, servings?: number) {
  const queryKey = queryKeys.recipe(familyId, recipeId, servings);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.get({ familyId, recipeId, servings, knownVersion })), select });
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/api/queries.test.ts && npm run typecheck`
Expected: PASS; nessun errore di tipi.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/queries.ts web/src/api/queries.test.ts
git commit -m "Web: query con versione posseduta e risposta «invariato» trasparente"
```

---

### Task 7: Cache persistita

**Files:**
- Create: `web/src/api/persister.ts`
- Test: `web/src/api/persister.test.ts`

**Interfaces:**
- Consumes: `toApiError`.
- Produces:
  - `interface KeyValueStore { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> }`
  - `createMemoryStore(): KeyValueStore & { entries: Map<string, unknown> }`
  - `createIndexedDbStore(dbName?: string): KeyValueStore`
  - `cacheKey(userId: string): string` → `query-cache:<userId>`
  - `createPersister(store: KeyValueStore, userId: string): Persister`
  - `PERSIST_MAX_AGE: number` (7 giorni in ms)
  - `createQueryClient(): QueryClient`
  - `persistOptions(persister: Persister, buster: string): Omit<PersistQueryClientOptions, 'queryClient'>`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';
import { cacheKey, createMemoryStore, createPersister, createQueryClient, persistOptions } from './persister';

const week = ['menu', 'getWeek', { familyId: 'f', weekStartsOn: '2026-10-05' }];

async function saved(store = createMemoryStore(), buster = 'build-1') {
  const persister = createPersister(store, 'user-a');
  const client = createQueryClient();
  client.setQueryData(week, { version: 1, data: 'week' });
  await persistQueryClientSave({ queryClient: client, persister, buster, dehydrateOptions: persistOptions(persister, buster).dehydrateOptions });
  return { store, persister };
}

describe('persister', () => {
  it('saves one entry per user and restores it', async () => {
    const { store, persister } = await saved();
    expect([...store.entries.keys()]).toEqual([cacheKey('user-a')]);
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister, buster: 'build-1' });
    expect(restored.getQueryData(week)).toEqual({ version: 1, data: 'week' });
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
    const persister = createPersister(store, 'user-a');
    expect(await persister.restoreClient()).toBeUndefined();
    expect(store.entries.has(cacheKey('user-a'))).toBe(false);
  });
  it('survives a store that fails', async () => {
    const broken = { get: () => Promise.reject(new Error('blocked')), set: () => Promise.reject(new Error('blocked')), delete: () => Promise.reject(new Error('blocked')) };
    const persister = createPersister(broken, 'user-a');
    expect(await persister.restoreClient()).toBeUndefined();
    await expect(persister.persistClient({ timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } })).resolves.toBeUndefined();
    await expect(persister.removeClient()).resolves.toBeUndefined();
  });
  it('keeps only successful queries', async () => {
    const store = createMemoryStore();
    const persister = createPersister(store, 'user-a');
    const client = createQueryClient();
    client.setQueryData(week, { version: 1, data: 'week' });
    await client.fetchQuery({ queryKey: ['broken'], queryFn: () => Promise.reject(new ApiError('not_found')) }).catch(() => undefined);
    await persistQueryClientSave({ queryClient: client, persister, buster: 'b', dehydrateOptions: persistOptions(persister, 'b').dehydrateOptions });
    const entry = store.entries.get(cacheKey('user-a')) as { clientState: { queries: { queryKey: unknown }[] } };
    expect(entry.clientState.queries.map((q) => q.queryKey)).toEqual([week]);
  });
  it('retries only network errors, at most twice', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new ApiError('network'))).toBe(true);
    expect(retry(2, new ApiError('network'))).toBe(false);
    expect(retry(0, new ApiError('not_found'))).toBe(false);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/persister.test.ts`
Expected: FAIL, `Failed to resolve import "./persister"`.

- [ ] **Step 3: Implementa**

```ts
import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { toApiError } from './errors';

/** Minimal storage used by the persister: IndexedDB in the app, memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function cacheKey(userId: string): string {
  return `query-cache:${userId}`;
}

export function createMemoryStore(): KeyValueStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key) => structuredClone(entries.get(key)),
    set: async (key, value) => void entries.set(key, structuredClone(value)),
    delete: async (key) => void entries.delete(key)
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
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key)))
  };
}

const isPersistedClient = (value: unknown): value is PersistedClient =>
  typeof value === 'object' && value !== null &&
  typeof (value as PersistedClient).timestamp === 'number' &&
  typeof (value as PersistedClient).buster === 'string' &&
  typeof (value as PersistedClient).clientState === 'object';

/** Storage errors never break the app: the cache is only a faster start (spec, cache persistita). */
export function createPersister(store: KeyValueStore, userId: string): Persister {
  const key = cacheKey(userId);
  return {
    async persistClient(client) {
      await store.set(key, client).catch(() => undefined);
    },
    async restoreClient() {
      const value = await store.get(key).catch(() => undefined);
      if (value === undefined) return undefined;
      if (isPersistedClient(value)) return value;
      await store.delete(key).catch(() => undefined);
      return undefined;
    },
    async removeClient() {
      await store.delete(key).catch(() => undefined);
    }
  };
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: PERSIST_MAX_AGE,
        // Show the stored copy at once, then check the version (spec section 1).
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => toApiError(error).code === 'network' && count < 2
      },
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
      // No queued mutations yet: the offline queue belongs to the shopping list (wave 2).
      shouldDehydrateMutation: () => false
    }
  };
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd web && npx vitest run src/api/persister.test.ts && npm run typecheck`
Expected: PASS (6 test). Se `persistQueryClientRestore` e `persistQueryClientSave` non sono esportati da `@tanstack/react-query-persist-client`, importarli da `@tanstack/query-persist-client-core` (dipendenza già installata con il pacchetto React) solo nei test, dopo averlo verificato con Context7.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/persister.ts web/src/api/persister.test.ts
git commit -m "Web: cache persistita in IndexedDB, una copia per utente con scadenza e versione della build"
```

---

### Task 8: Accesso e sessione per utente

**Files:**
- Create: `web/src/auth/backend.ts`, `web/src/auth/supabaseBackend.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/session/SessionScope.tsx`, `web/src/test/stubBackend.ts`
- Test: `web/src/auth/supabaseBackend.test.ts`, `web/src/session/SessionScope.test.tsx`

**Interfaces:**
- Consumes: `KeyValueStore`, `createPersister`, `createQueryClient`, `persistOptions`, `cacheKey` (Task 7); `ApiProvider`, `Api` (Task 4); `useLocale`, `Locale` (Task 3); `env.buildVersion` (Task 1).
- Produces:
  - `interface AuthUser { id: string; email: string }`
  - `type SignInFailure = 'invalid_credentials' | 'network' | 'unknown'`; `type SignInResult = { ok: true } | { ok: false; reason: SignInFailure }`
  - `interface AuthBackend { readonly mode: 'fake' | 'supabase'; getUser(): Promise<AuthUser | null>; onChange(listener: (user: AuthUser | null) => void): () => void; signIn(email: string, password: string): Promise<SignInResult>; signOut(): Promise<void>; getAccessToken(): Promise<string | null> }`
  - `DEMO_USER: AuthUser` (`{ id: 'user-federico', email: 'federico@example.com' }`), `createFakeBackend(): AuthBackend`
  - `createSupabaseBackend(url: string, publishableKey: string): AuthBackend`, `signInFailure(error: { code?: string; status?: number; name?: string }): SignInFailure`
  - `type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser }`; `<AuthProvider backend>`; `useAuth(): { state: AuthState; backend: AuthBackend }`
  - `type CreateApi = (user: AuthUser | null, getLocale: () => Locale) => Api`; `<SessionScope store createApi>`; `useSignOut(): () => Promise<void>`
  - `createStubBackend(initial: AuthUser | null, mode?: 'fake' | 'supabase'): AuthBackend & { setUser(user: AuthUser | null): void; nextSignIn: SignInResult; signOutCalls: number }`

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/auth/supabaseBackend.test.ts`:
```ts
import { expect, it } from 'vitest';
import { signInFailure } from './supabaseBackend';

it('maps Supabase sign-in errors to our reasons', () => {
  expect(signInFailure({ code: 'invalid_credentials', status: 400 })).toBe('invalid_credentials');
  expect(signInFailure({ status: 400 })).toBe('invalid_credentials');
  expect(signInFailure({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
  expect(signInFailure({ status: 500 })).toBe('unknown');
});
```

`web/src/session/SessionScope.test.tsx` (Review Focus: due persone sullo stesso telefono):
```tsx
import { useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { meQuery, useQueryDeps } from '../api/queries';
import { cacheKey, createMemoryStore } from '../api/persister';
import type { Api } from '../api/types';
import { AuthProvider } from '../auth/AuthProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { createStubBackend } from '../test/stubBackend';
import { SessionScope, useSignOut, type CreateApi } from './SessionScope';

function Probe() {
  const me = useQuery(meQuery(useQueryDeps()));
  const signOut = useSignOut();
  return (
    <>
      <p>name: {me.data?.user.displayName ?? '-'}</p>
      <button onClick={() => void signOut()}>out</button>
    </>
  );
}

const createApi: CreateApi = (user) =>
  ({
    me: {
      get: async () => ({
        unchanged: false,
        version: 1,
        data: { user: { id: user?.id ?? 'anon', displayName: user ? user.id.toUpperCase() : 'ANON', email: '', locale: 'it-IT' }, families: [], currentFamilyId: null }
      })
    }
  }) as unknown as Api;

it('never shows the previous user data after signing out on the same device', async () => {
  const store = createMemoryStore();
  const backend = createStubBackend({ id: 'a', email: 'a@example.com' }, 'supabase');
  render(
    <LocaleProvider initial="it-IT">
      <AuthProvider backend={backend}>
        <SessionScope store={store} createApi={createApi}>
          <Probe />
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
  await screen.findByText('name: A');
  await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));

  act(() => screen.getByText('out').click());
  await waitFor(() => expect(backend.signOutCalls).toBe(1));
  expect(store.entries.has(cacheKey('a'))).toBe(false);

  act(() => backend.setUser({ id: 'b', email: 'b@example.com' }));
  await screen.findByText('name: B');
  expect(screen.queryByText('name: A')).toBeNull();
  await waitFor(() => expect([...store.entries.keys()]).toEqual([cacheKey('b')]));
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/auth src/session`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa i backend**

`web/src/auth/backend.ts`:
```ts
export interface AuthUser { id: string; email: string }
export type SignInFailure = 'invalid_credentials' | 'network' | 'unknown';
export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };

/** What the app needs from authentication; Supabase in real mode, a fixed demo user in fake mode. */
export interface AuthBackend {
  readonly mode: 'fake' | 'supabase';
  getUser(): Promise<AuthUser | null>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** For the oRPC link (Authorization: Bearer), read at every request. */
  getAccessToken(): Promise<string | null>;
}

export const DEMO_USER: AuthUser = { id: 'user-federico', email: 'federico@example.com' };

/** Fake mode (no VITE_SUPABASE_*): always signed in as the demo user, no sign-in page. */
export function createFakeBackend(): AuthBackend {
  return {
    mode: 'fake',
    getUser: async () => DEMO_USER,
    onChange: () => () => undefined,
    signIn: async () => ({ ok: true }),
    signOut: async () => undefined,
    getAccessToken: async () => null
  };
}
```

`web/src/auth/supabaseBackend.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import type { AuthBackend, AuthUser, SignInFailure } from './backend';

export function signInFailure(error: { code?: string; status?: number; name?: string }): SignInFailure {
  if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid_credentials';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  return 'unknown';
}

const toUser = (user: { id: string; email?: string } | null | undefined): AuthUser | null =>
  user ? { id: user.id, email: user.email ?? '' } : null;

/** Email and password only (spec: link and Google come in wave 3). The library keeps and refreshes the session. */
export function createSupabaseBackend(url: string, publishableKey: string): AuthBackend {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return {
    mode: 'supabase',
    async getUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onChange(listener) {
      // No Supabase calls inside the callback: the library holds a lock while it runs.
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return error ? { ok: false, reason: signInFailure(error) } : { ok: true };
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    }
  };
}
```

`web/src/test/stubBackend.ts`:
```ts
import type { AuthBackend, AuthUser, SignInResult } from '../auth/backend';

export function createStubBackend(initial: AuthUser | null, mode: 'fake' | 'supabase' = 'supabase') {
  let user = initial;
  const listeners = new Set<(user: AuthUser | null) => void>();
  const backend = {
    mode,
    nextSignIn: { ok: true } as SignInResult,
    signOutCalls: 0,
    setUser(next: AuthUser | null) {
      user = next;
      listeners.forEach((listener) => listener(next));
    },
    getUser: async () => user,
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
      backend.setUser(null);
    },
    getAccessToken: async () => (user ? 'token' : null)
  } satisfies AuthBackend & Record<string, unknown>;
  return backend;
}
```

- [ ] **Step 4: Implementa provider e sessione**

`web/src/auth/AuthProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthBackend, AuthUser } from './backend';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

const AuthContext = createContext<{ state: AuthState; backend: AuthBackend } | null>(null);

const toState = (user: AuthUser | null): AuthState => (user ? { status: 'signedIn', user } : { status: 'signedOut' });

export function AuthProvider({ backend, children }: { backend: AuthBackend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    // Token refreshes repeat the same user: keep the state object so nothing re-renders.
    const apply = (user: AuthUser | null) =>
      setState((previous) =>
        previous.status === 'signedIn' && user && previous.user.id === user.id ? previous : toState(user)
      );
    backend.getUser().then((user) => active && apply(user));
    const unsubscribe = backend.onChange(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend]);

  const value = useMemo(() => ({ state, backend }), [state, backend]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
```

`web/src/session/SessionScope.tsx`:
```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { createPersister, createQueryClient, persistOptions, type KeyValueStore } from '../api/persister';
import type { Api } from '../api/types';
import type { AuthUser } from '../auth/backend';
import { useAuth } from '../auth/AuthProvider';
import { env } from '../env';
import { useLocale } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';

export type CreateApi = (user: AuthUser | null, getLocale: () => Locale) => Api;

const SignOutContext = createContext<(() => Promise<void>) | null>(null);

/** One QueryClient and one persisted copy per user: nothing leaks to the next person (spec, cache persistita). */
export function SessionScope({ store, createApi, children }: { store: KeyValueStore; createApi: CreateApi; children: ReactNode }) {
  const { state, backend } = useAuth();
  const user = state.status === 'signedIn' ? state.user : null;
  const userId = user?.id ?? null;
  const { locale } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const session = useMemo(
    () => ({ queryClient: createQueryClient(), persister: userId ? createPersister(store, userId) : null }),
    [userId, store]
  );
  // The client depends on the user only; the language is read at each call.
  const api = useMemo(() => createApi(user, () => localeRef.current), [userId, createApi]);

  // Views are localised by the server: a new language means new data.
  const shownLocale = useRef(locale);
  useEffect(() => {
    if (shownLocale.current === locale) return;
    shownLocale.current = locale;
    void session.queryClient.invalidateQueries();
  }, [locale, session]);

  const signOut = useCallback(async () => {
    session.queryClient.clear();
    await session.persister?.removeClient();
    await backend.signOut();
  }, [session, backend]);

  const content = (
    <ApiProvider api={api}>
      <SignOutContext.Provider value={signOut}>{children}</SignOutContext.Provider>
    </ApiProvider>
  );
  if (!session.persister) return <QueryClientProvider client={session.queryClient}>{content}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider key={userId} client={session.queryClient} persistOptions={persistOptions(session.persister, env.buildVersion)}>
      {content}
    </PersistQueryClientProvider>
  );
}

export function useSignOut(): () => Promise<void> {
  const signOut = useContext(SignOutContext);
  if (!signOut) throw new Error('useSignOut outside SessionScope');
  return signOut;
}
```
- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/auth src/session && npm run typecheck`
Expected: PASS; nessun errore di tipi.

- [ ] **Step 6: Commit**

```bash
git add web/src/auth web/src/session web/src/test/stubBackend.ts
git commit -m "Web: accesso con Supabase o utente demo e sessione con cache separata per utente"
```

---

### Task 9: Rotte, guardia, layout e componenti di base

**Files:**
- Create: `web/src/routes/search.ts`, `web/src/router.tsx`, `web/src/routes/AppLayout.tsx`, `web/src/routes/NotFound.tsx`, `web/src/routes/RouteError.tsx`, `web/src/routes/menu/lastDay.ts`, `web/src/session/useFamily.ts`, `web/src/components/Icon.tsx`, `web/src/components/BottomNav.tsx`, `web/src/components/StateNotice.tsx`, `web/src/components/PageHeader.tsx`, `web/src/components/OfflineBanner.tsx`, `web/src/components/Loading.tsx`, segnaposto `web/src/routes/MenuPage.tsx`, `RecipesPage.tsx`, `RecipePage.tsx`, `ProfilePage.tsx`, `web/src/auth/LoginPage.tsx` (segnaposto), `web/src/test/renderApp.tsx`, `web/src/test/renderWithProviders.tsx`
- Modify: `web/src/App.tsx` (sostituito), `web/src/main.tsx`, `web/src/design/global.css` (in fondo), `web/src/test/setup.ts`
- Delete: `web/src/App.test.tsx`
- Test: `web/src/routes/search.test.ts`, `web/src/router.test.tsx`

**Interfaces:**
- Consumes: tutto dai Task 2-8.
- Produces:
  - da `src/routes/search.ts`: `MenuSearch { day?: IsoDate }`, `RecipesSearch { q?: string; meal?: MealType; time?: number; group?: ProteinGroup; rating?: number; sort?: 'rating' | 'added' | 'lastEaten'; dir?: 'reverse' }`, `RecipeSearch { servings?: number; from?: 'menu' | 'recipes'; day?: IsoDate }`, `LoginSearch { redirect?: string }`; `validateMenuSearch`, `validateRecipesSearch`, `validateRecipeSearch`, `validateLoginSearch` (tutte `(raw: Record<string, unknown>) => …Search`); `toRecipeQuery(search: RecipesSearch): RecipeQuery`; `toRecipesSearch(query: RecipeQuery): RecipesSearch`
  - id delle rotte per `getRouteApi`: `'/login'`, `'/_app/menu'`, `'/_app/recipes'`, `'/_app/recipes/$recipeId'`, `'/_app/profile'`
  - `createAppRouter(history?: RouterHistory)`; `interface RouterContext { auth: AuthState }`
  - `<AppRoot backend store createApi history? initialLocale?>` da `src/App.tsx`
  - `useFamily(): { me: UseQueryResult<MeView>; family: FamilyView | null }`
  - `rememberMenuDay(day: IsoDate | undefined): void`, `rememberedMenuDay(): IsoDate | undefined`
  - `type IconName = 'arrow' | 'clock' | 'calendar' | 'book' | 'bag' | 'user' | 'star' | 'chevron-left' | 'chevron-right' | 'recipe' | 'list' | 'filter' | 'sort' | 'users' | 'gear' | 'ban'`; `<Icon name className?>`
  - `<StateNotice title body? children?>`, `<PageHeader back={ReactNode} title={ReactNode} titleId?>`, `<OfflineBanner>`, `<Loading>`, `<BottomNav>`
  - `renderApp(path: string, options?: { backend?: AuthBackend; api?: Api; locale?: Locale; store?: KeyValueStore }): RenderResult & { history: RouterHistory }`
  - `renderWithProviders(ui: ReactNode, options?: { api?: Api; queryClient?: QueryClient; locale?: Locale }): RenderResult & { queryClient: QueryClient }`

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
    expect(validateRecipeSearch({ servings: '3', from: 'menu', day: '2026-10-06' })).toEqual({ servings: 3, from: 'menu', day: '2026-10-06' });
    expect(validateRecipeSearch({ servings: 0, from: 'elsewhere', day: 'x' })).toEqual({});
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
export interface RecipeSearch { servings?: number; from?: 'menu' | 'recipes'; day?: IsoDate }
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
    day: isIsoDate(raw.day) ? raw.day : undefined
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

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
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
import { meQuery, useQueryDeps } from '../api/queries';

/** The signed-in person and the family shown (one per session for now). */
export function useFamily() {
  const me = useQuery(meQuery(useQueryDeps()));
  const family = me.data?.families.find((f) => f.id === me.data?.currentFamilyId) ?? null;
  return { me, family };
}
```

Segnaposto (li sostituiscono i Task 10, 13, 14, 15 e 16). `web/src/routes/MenuPage.tsx`:
```tsx
import { useT } from '../i18n/LocaleProvider';

export function MenuPage() {
  const t = useT();
  return <section className="secondary-view app-view"><h1 className="page-title">{t('nav.menu')}</h1></section>;
}
```
Uguali, con `RecipesPage`/`nav.recipes`, `RecipePage`/`recipes.title`, `ProfilePage`/`nav.profile`, e `web/src/auth/LoginPage.tsx` con `LoginPage`/`auth.title` e `<main className="entry-page">` al posto di `<section …>`.

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
import { useProfileLocale, useT } from '../i18n/LocaleProvider';
import { useFamily } from '../session/useFamily';

export function AppLayout() {
  const t = useT();
  const { me } = useFamily();
  useProfileLocale(me.data?.user.locale);
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api } from '../api/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';

/** A single component with every provider and a minimal router (for links). */
export function renderWithProviders(ui: ReactNode, options: { api?: Api; queryClient?: QueryClient; locale?: Locale } = {}) {
  const locale = options.locale ?? 'it-IT';
  const queryClient = options.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const api = options.api ?? createFakeApi({ getLocale: () => locale, latencyMs: 0 });
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <>{ui}</> }),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  const result = render(
    <LocaleProvider initial={locale}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={api}>
          <RouterProvider router={router} />
        </ApiProvider>
      </QueryClientProvider>
    </LocaleProvider>
  );
  return { ...result, queryClient };
}
```

`web/src/test/setup.ts`, aggiungere:
```ts
import { beforeEach } from 'vitest';

// jsdom has no layout: scrolling is a no-op, and each test starts with a clean device.
Element.prototype.scrollIntoView = function scrollIntoView() {};
beforeEach(() => localStorage.clear());
```

Cancellare `web/src/App.test.tsx`, ormai superato.

- [ ] **Step 10: Verifica che passino**

Run: `cd web && npx vitest run && npm run typecheck`
Expected: PASS di tutti i test; nessun errore di tipi.

- [ ] **Step 11: Commit**

```bash
git add -A web/
git commit -m "Web: rotte con guardia di accesso, navbar a icone, errori e pagina non trovata"
```

---

### Task 10: Pagina di ingresso

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
    renderApp('/login', { backend: createStubBackend(null), locale: 'en-GB' });
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

### Task 11: Stelline e mutazione del voto

**Files:**
- Create: `web/src/api/ratings.ts`, `web/src/components/RatingStars.tsx`, `web/src/components/RatingStars.module.css`
- Test: `web/src/api/ratings.test.ts`, `web/src/components/RatingStars.test.tsx`

**Interfaces:**
- Consumes: `RATED_PREFIXES`, `Versioned`, `useQueryDeps` (Task 6); `errorKey`; viste; `formatAverage`; `Icon`.
- Produces:
  - `optimisticRating(current: RatingSummary, stars: number | null): RatingSummary`
  - `patchRatings(queryClient: QueryClient, recipeId: string, summary: RatingSummary): void`
  - `interface RateInput { recipeId: string; stars: number | null; current: RatingSummary }`; `useRateRecipe(familyId: string)` (una `useMutation`)
  - `<RatingStars summary recipeId recipeName familyId>`

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/api/ratings.test.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys, type Versioned } from './queries';
import { optimisticRating, patchRatings } from './ratings';
import type { RecipeListItem, WeekView } from './types';

describe('optimistic rating', () => {
  it('adds, changes and removes the own stars in the average', () => {
    expect(optimisticRating({ familyAverage: 4, familyCount: 2, myStars: null }, 1)).toEqual({ familyAverage: 3, familyCount: 3, myStars: 1 });
    expect(optimisticRating({ familyAverage: 4, familyCount: 2, myStars: 5 }, 1)).toEqual({ familyAverage: 2, familyCount: 2, myStars: 1 });
    expect(optimisticRating({ familyAverage: 5, familyCount: 1, myStars: 5 }, null)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
  });
  it('patches every cached view that shows the recipe', () => {
    const client = new QueryClient();
    const summary = { familyAverage: 2, familyCount: 1, myStars: 2 };
    const recipe = { id: 'r1' } as RecipeListItem['recipe'];
    const week: Versioned<WeekView> = { version: 1, data: { startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ recipe, rating: { familyAverage: null, familyCount: 0, myStars: null } } as WeekView['days'][number]['meals'][number]] }] } };
    const list: Versioned<RecipeListItem[]> = { version: 1, data: [{ recipe, rating: { familyAverage: null, familyCount: 0, myStars: null }, servings: 2, ingredients: [] }] };
    client.setQueryData(queryKeys.week('f', '2026-10-05'), week);
    client.setQueryData(queryKeys.search('f', {}), list);
    patchRatings(client, 'r1', summary);
    expect(client.getQueryData<Versioned<WeekView>>(queryKeys.week('f', '2026-10-05'))?.data.days[0]?.meals[0]?.rating).toEqual(summary);
    expect(client.getQueryData<Versioned<RecipeListItem[]>>(queryKeys.search('f', {}))?.data[0]?.rating).toEqual(summary);
  });
});
```

`web/src/components/RatingStars.test.tsx` (Review Focus: voto che fallisce):
```tsx
import { QueryClient, useQuery } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { queryKeys, type Versioned } from '../api/queries';
import type { Api, RatingSummary, RecipeListItem } from '../api/types';
import { renderWithProviders } from '../test/renderWithProviders';
import { RatingStars } from './RatingStars';

const start: RatingSummary = { familyAverage: 4, familyCount: 2, myStars: null };
const listKey = queryKeys.search('f', {});
const list = (rating: RatingSummary): Versioned<RecipeListItem[]> => ({
  version: 1,
  data: [{ recipe: { id: 'r1', name: 'Pasta' } as RecipeListItem['recipe'], rating, servings: 2, ingredients: [] }]
});

function Harness() {
  const rating = useQuery({ queryKey: listKey, queryFn: () => new Promise<never>(() => {}), staleTime: Infinity, select: (v: Versioned<RecipeListItem[]>) => v.data[0]!.rating });
  return rating.data ? <RatingStars summary={rating.data} recipeId="r1" recipeName="Pasta" familyId="f" /> : null;
}

function setup(set: Api['ratings']['set'], rating = start) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(listKey, list(rating));
  const api = { ...createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 }), ratings: { set } };
  renderWithProviders(<Harness />, { api, queryClient });
  return queryClient;
}

const cached = (client: QueryClient) => client.getQueryData<Versioned<RecipeListItem[]>>(listKey)?.data[0]?.rating;

describe('RatingStars', () => {
  it('updates the copy at once, then applies the server answer without reading again', async () => {
    let resolve: (value: RatingSummary) => void = () => {};
    const set = vi.fn(() => new Promise<RatingSummary>((r) => (resolve = r)));
    const client = setup(set);
    fireEvent.click(await screen.findByLabelText('Dai 4 stelle a Pasta'));
    await waitFor(() => expect(cached(client)).toEqual({ familyAverage: 4, familyCount: 3, myStars: 4 }));
    expect(set).toHaveBeenCalledWith({ familyId: 'f', recipeId: 'r1', stars: 4 });
    resolve({ familyAverage: 4.5, familyCount: 3, myStars: 4 });
    await waitFor(() => expect(cached(client)).toEqual({ familyAverage: 4.5, familyCount: 3, myStars: 4 }));
    expect(screen.getByText('4,5')).toBeTruthy();
  });
  it('puts everything back and explains the error when the rating fails', async () => {
    const client = setup(vi.fn(() => Promise.reject(new ApiError('network'))));
    fireEvent.click(await screen.findByLabelText('Dai 2 stelle a Pasta'));
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    expect(cached(client)).toEqual(start);
  });
  it('removes the rating when the chosen star is tapped again', async () => {
    const set = vi.fn(async () => ({ familyAverage: 4, familyCount: 1, myStars: null }));
    setup(set, { familyAverage: 4, familyCount: 2, myStars: 4 });
    fireEvent.click(await screen.findByLabelText('Il tuo voto: 4 stelle. Tocca di nuovo per toglierlo'));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ familyId: 'f', recipeId: 'r1', stars: null }));
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/api/ratings.test.ts src/components/RatingStars.test.tsx`
Expected: FAIL, import non risolti.

- [ ] **Step 3: Implementa la mutazione**

`web/src/api/ratings.ts`:
```ts
import { useMutation, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { RATED_PREFIXES, useQueryDeps, type Versioned } from './queries';
import type { MealView, RatingSummary, RecipeDetailView, RecipeListItem, WeekView } from './types';

export function optimisticRating(current: RatingSummary, stars: number | null): RatingSummary {
  let total = (current.familyAverage ?? 0) * current.familyCount;
  let count = current.familyCount;
  if (current.myStars !== null) {
    total -= current.myStars;
    count -= 1;
  }
  if (stars !== null) {
    total += stars;
    count += 1;
  }
  return { familyAverage: count > 0 ? total / count : null, familyCount: count, myStars: stars };
}

const patchMeal = (meal: MealView, recipeId: string, summary: RatingSummary): MealView =>
  meal.recipe?.id === recipeId && meal.rating ? { ...meal, rating: summary } : meal;

/** Own changes update the copy on the device without reading again (spec section 1). */
export function patchRatings(queryClient: QueryClient, recipeId: string, summary: RatingSummary): void {
  queryClient.setQueriesData<Versioned<WeekView>>({ queryKey: ['menu', 'getWeek'] }, (old) =>
    old && { ...old, data: { ...old.data, days: old.data.days.map((d) => ({ ...d, meals: d.meals.map((m) => patchMeal(m, recipeId, summary)) })) } }
  );
  queryClient.setQueriesData<Versioned<RecipeListItem[]>>({ queryKey: ['recipes', 'search'] }, (old) =>
    old && { ...old, data: old.data.map((item) => (item.recipe.id === recipeId ? { ...item, rating: summary } : item)) }
  );
  queryClient.setQueriesData<Versioned<RecipeDetailView>>({ queryKey: ['recipes', 'get'] }, (old) =>
    old && old.data.recipe.id === recipeId ? { ...old, data: { ...old.data, rating: summary } } : old
  );
}

export interface RateInput { recipeId: string; stars: number | null; current: RatingSummary }

/** The model for wave 2 mutations: optimistic patch, server answer applied, rollback on error. */
export function useRateRecipe(familyId: string) {
  const { api, queryClient } = useQueryDeps();
  return useMutation({
    mutationFn: ({ recipeId, stars }: RateInput) => api.ratings.set({ familyId, recipeId, stars }),
    onMutate: async ({ recipeId, stars, current }) => {
      await Promise.all(RATED_PREFIXES.map((prefix) => queryClient.cancelQueries({ queryKey: [...prefix] })));
      const snapshot: [QueryKey, unknown][] = RATED_PREFIXES.flatMap((prefix) => queryClient.getQueriesData({ queryKey: [...prefix] }));
      patchRatings(queryClient, recipeId, optimisticRating(current, stars));
      return { snapshot };
    },
    onError: (_error, _input, result) => {
      result?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSuccess: (summary, { recipeId }) => patchRatings(queryClient, recipeId, summary)
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
  const choose = (value: number) => rate.mutate({ recipeId, stars: summary.myStars === value ? null : value, current: summary });

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
        <fieldset className={styles.stars}>
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
```

- [ ] **Step 5: Verifica che passino**

Run: `cd web && npx vitest run src/api/ratings.test.ts src/components/RatingStars.test.tsx && npm run typecheck`
Expected: PASS. Se il terzo argomento di `onError` in TanStack Query 5.104 non è il risultato di `onMutate`, verificarlo con Context7 (`/tanstack/query`, «useMutation onMutate onError context») e adattare la firma.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/ratings.ts web/src/api/ratings.test.ts web/src/components/RatingStars.*
git commit -m "Web: stelline con aggiornamento ottimistico della copia locale e ripristino sugli errori"
```

---

### Task 12: Scheda del pasto e della ricetta

**Files:**
- Create: `web/src/components/source.ts`, `web/src/components/IngredientList.tsx`, `web/src/components/RecipeCard.tsx`, `web/src/components/RecipeCard.module.css`
- Test: `web/src/components/source.test.ts`, `web/src/components/RecipeCard.test.tsx`

**Interfaces:**
- Consumes: viste; `RecipeSearch`; `RatingStars`; `Icon`; `truncate`, `formatAverage`, `formatChangeTime`.
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
  detailSearch: { from: 'menu', day: '2026-10-08' }, familyId: 'family-main'
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
    expect(screen.getByRole('link', { name: 'Scheda ricetta' }).getAttribute('href')).toBe('/recipes/r1?from=menu&day=2026-10-08');
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

### Task 13: Menu

**Files:**
- Create: `web/src/routes/menu/selection.ts`, `web/src/components/DaySelector.tsx`, `web/src/components/DatePicker.tsx`, `web/src/components/DatePicker.module.css`, `web/src/routes/MenuPage.module.css`
- Modify: `web/src/routes/MenuPage.tsx` (sostituisce il segnaposto)
- Test: `web/src/routes/menu/selection.test.ts`, `web/src/routes/MenuPage.test.tsx`

**Interfaces:**
- Consumes: `openingQuery`, `weekQuery`, `datesQuery`, `useQueryDeps`; `useFamily`; `RecipeCard`; `StateNotice`, `Loading`, `Icon`; `rememberMenuDay`; calendario; formattatori.
- Produces:
  - `pickSelected(days: IsoDate[], requested?: IsoDate, opening?: IsoDate): IsoDate | null`
  - `addMonths(month: string, delta: number): string` (in `selection.ts`, mese `YYYY-MM`)
  - `<DaySelector dates selected onSelect>`; `<DatePicker familyId selected open onOpenChange onSelect>`; `MenuPage`

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
  it('says when the family has no menu yet', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.menu.getOpening = async () => ({ unchanged: false, version: 1, data: { kind: 'no_weeks' } });
    renderApp('/menu', { api });
    expect(await screen.findByRole('heading', { name: 'Ancora nessun menu' })).toBeTruthy();
  });
});
```
`web/src/test/setup.ts`: `rememberMenuDay` è stato di modulo, quindi ogni test riparte senza giorno ricordato. Sostituire il `beforeEach` del Task 9 con:
```ts
import { rememberMenuDay } from '../routes/menu/lastDay';

beforeEach(() => {
  localStorage.clear();
  rememberMenuDay(undefined);
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

`web/src/components/DatePicker.tsx` (da `prototype/src/lib/components/DatePicker.svelte`):
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
  onOpenChange: (open: boolean) => void;
  onSelect: (date: IsoDate) => void;
}

/** A browsable month where only days with a menu can be chosen (round 1). */
export function DatePicker({ familyId, selected, open, onOpenChange, onSelect }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [browsed, setBrowsed] = useState<string | null>(null);
  const month = browsed ?? selected.slice(0, 7);
  const dates = useQuery({ ...datesQuery(useQueryDeps(), familyId, month), enabled: open });
  const available = new Set(dates.data ?? []);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setBrowsed(null);
  }, [open]);

  useEffect(() => {
    if (open && dates.data) panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')?.focus();
  }, [open, dates.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      toggle.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!panel.current?.contains(target) && !toggle.current?.contains(target) && !target.closest?.('[data-date-picker-toggle]')) onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [open, onOpenChange]);

  // Six Monday-first weeks from the Monday on or before the 1st.
  const start = mondayOf(`${month}-01`);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${addDays('2026-10-05', i)}T00:00:00Z`))
  );

  return (
    <div className={styles.picker}>
      <button ref={toggle} type="button" className={styles.toggle} aria-expanded={open} aria-label={t('menu.pickDate')} onClick={() => onOpenChange(!open)}>
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
                    onOpenChange(false);
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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { errorKey, toApiError } from '../api/errors';
import { openingQuery, useQueryDeps, weekQuery } from '../api/queries';
import { DatePicker } from '../components/DatePicker';
import { DaySelector } from '../components/DaySelector';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { RecipeCard } from '../components/RecipeCard';
import { StateNotice } from '../components/StateNotice';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { isMealPast, localNow, mondayOf, type IsoDate } from '../lib/calendar';
import { useFamily } from '../session/useFamily';
import { rememberMenuDay } from './menu/lastDay';
import { pickSelected } from './menu/selection';
import styles from './MenuPage.module.css';

const route = getRouteApi('/_app/menu');

export function MenuPage() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const { me, family } = useFamily();
  const { day: requested } = route.useSearch();
  const navigate = route.useNavigate();
  const familyId = family?.id ?? '';

  const opening = useQuery({ ...openingQuery(deps, familyId), enabled: !!family });
  const openingDay = opening.data?.kind === 'day' ? opening.data : null;
  const weekStart = requested ? mondayOf(requested) : openingDay?.weekStartsOn;
  const week = useQuery({ ...weekQuery(deps, familyId, weekStart ?? ''), enabled: !!family && !!weekStart, retry: false });
  const [pickerOpen, setPickerOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  // Day the track is already moving to (smooth tap or user scroll): no instant jump over it.
  const settling = useRef<IsoDate | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  if (me.isError) return <section className="secondary-view app-view"><StateNotice title={t(errorKey(me.error))} /></section>;
  if (!family || opening.isPending) return <section className="secondary-view app-view"><Loading /></section>;
  if (opening.isError) return <section className="secondary-view app-view"><StateNotice title={t(errorKey(opening.error))} /></section>;
  if (opening.data.kind === 'no_weeks') {
    return <section className="secondary-view app-view"><StateNotice title={t('menu.noWeeks.title')} body={t('menu.noWeeks.body')} /></section>;
  }
  if (week.isError && !weekMissing) return <section className="secondary-view app-view"><StateNotice title={t(errorKey(week.error))} /></section>;
  if (!week.data || !selected) return <section className="secondary-view app-view"><Loading /></section>;

  const now = localNow(family.timeZone);
  return (
    <section className="calendar app-view" aria-label={t('nav.menu')}>
      <nav className="day-navigation" aria-label={t('menu.days')}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.month} data-date-picker-toggle aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}>
            {formatMonthYear(locale, selected)}
          </button>
          <div className={styles.actions}>
            <DatePicker familyId={familyId} selected={selected} open={pickerOpen} onOpenChange={setPickerOpen} onSelect={select} />
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
                detailSearch={meal.recipe && meal.canOpenRecipe ? { from: 'menu', day: meal.date } : null}
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
git commit -m "Web: Menu con apertura sul giorno, selettore dei giorni, calendario e schede dei pasti"
```

---

### Task 14: Ricettario

**Files:**
- Create: `web/src/components/RecipeFilters.tsx`, `web/src/components/RecipeFilters.module.css`
- Modify: `web/src/routes/RecipesPage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/RecipesPage.test.tsx`

**Interfaces:**
- Consumes: `searchQuery`, `useFamily`, `RecipeCard`, `toRecipeQuery`, `toRecipesSearch`, `PROTEIN_GROUPS`.
- Produces: `<RecipeFilters query onChange>` con `query: RecipeQuery`, `onChange: (query: RecipeQuery) => void`; `RecipesPage`.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { errorKey } from '../api/errors';
import { searchQuery, useQueryDeps } from '../api/queries';
import type { RecipeQuery } from '../api/types';
import { Loading } from '../components/Loading';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeFilters } from '../components/RecipeFilters';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';
import { useFamily } from '../session/useFamily';
import { toRecipeQuery, toRecipesSearch } from './search';

const route = getRouteApi('/_app/recipes');

export function RecipesPage() {
  const t = useT();
  const { family } = useFamily();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const query = toRecipeQuery(search);
  const familyId = family?.id ?? '';
  const results = useQuery({ ...searchQuery(useQueryDeps(), familyId, query), enabled: !!family, placeholderData: keepPreviousData });
  const update = (next: RecipeQuery) => void navigate({ search: toRecipesSearch(next), replace: true });

  return (
    <section className="secondary-view app-view">
      <div className="page-column wide">
        <header className="page-header">
          <h1 className="page-title">{t('recipes.title')}</h1>
        </header>
        <RecipeFilters query={query} onChange={update} />
        {results.isError && <StateNotice title={t(errorKey(results.error))} />}
        {results.isPending && <Loading />}
        {results.data?.length === 0 && (
          <StateNotice title={t('recipes.noResults.title')} body={t('recipes.noResults.body')}>
            <button type="button" className="text-button" onClick={() => update({})}>{t('recipes.reset')}</button>
          </StateNotice>
        )}
        {!!results.data?.length && (
          <div className="recipe-grid">
            {results.data.map((item) => (
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
                familyId={familyId}
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

### Task 15: Scheda ricetta

**Files:**
- Create: `web/src/components/ServingsStepper.tsx`, `web/src/routes/RecipePage.module.css`
- Modify: `web/src/routes/RecipePage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/RecipePage.test.tsx`

**Interfaces:**
- Consumes: `recipeQuery`, `useFamily`, `RatingStars`, `IngredientList`, `PageHeader`, `safeSourceUrl`, `formatDayLong`, `RecipeSearch`.
- Produces: `<ServingsStepper value min? max? onChange>`; `RecipePage`.

- [ ] **Step 1: Scrivi i test che falliscono**

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { errorKey } from '../api/errors';
import { recipeQuery, useQueryDeps } from '../api/queries';
import { Icon } from '../components/Icon';
import { IngredientList } from '../components/IngredientList';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { RatingStars } from '../components/RatingStars';
import { ServingsStepper } from '../components/ServingsStepper';
import { safeSourceUrl } from '../components/source';
import { StateNotice } from '../components/StateNotice';
import { formatDayLong } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { useFamily } from '../session/useFamily';
import styles from './RecipePage.module.css';

const route = getRouteApi('/_app/recipes/$recipeId');

export function RecipePage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { family } = useFamily();
  const { recipeId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const familyId = family?.id ?? '';
  const detail = useQuery({ ...recipeQuery(useQueryDeps(), familyId, recipeId, search.servings), enabled: !!family, placeholderData: keepPreviousData });

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

  if (detail.isError) {
    return <section className="secondary-view app-view"><div className="page-column"><header className="page-header">{back}</header><StateNotice title={t(errorKey(detail.error))} /></div></section>;
  }
  if (!detail.data) return <section className="secondary-view app-view"><Loading /></section>;

  const { recipe, rating, servings, baseServings, ingredients, history } = detail.data;
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  return (
    <section className="secondary-view app-view">
      <article className="page-column">
        {recipe.photo && <img className={styles.photo} src={recipe.photo} alt="" />}
        {/* The title is always the link to the source (spec section 14). */}
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
        <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} />
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

### Task 16: Profilo e lingua

**Files:**
- Create: `web/src/routes/ProfilePage.module.css`
- Modify: `web/src/routes/ProfilePage.tsx` (sostituisce il segnaposto), `web/src/design/global.css`
- Test: `web/src/routes/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `useFamily`, `useAuth`, `useSignOut`, `useLocale`, `LOCALES`, `Icon`.
- Produces: `ProfilePage`.

- [ ] **Step 1: Scrivi i test che falliscono**

`web/src/routes/ProfilePage.test.tsx` (Review Focus: cambio di lingua):
```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('signs out in real mode, clearing the session, and goes to the sign-in page', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(backend.signOutCalls).toBe(1);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/routes/ProfilePage.test.tsx`
Expected: FAIL, il segnaposto non mostra il nome.

- [ ] **Step 3: Implementa**

`web/src/routes/ProfilePage.tsx`:
```tsx
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { Loading } from '../components/Loading';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { LOCALES, type MessageKey } from '../i18n/translate';
import { useFamily } from '../session/useFamily';
import { useSignOut } from '../session/SessionScope';
import styles from './ProfilePage.module.css';

// Destinations that arrive with wave 2 (spec, Profilo): visible, disabled.
const PLACEHOLDERS: { icon: IconName; label: MessageKey }[] = [
  { icon: 'users', label: 'profile.members' },
  { icon: 'gear', label: 'profile.settings' },
  { icon: 'ban', label: 'profile.exclusions' }
];

export function ProfilePage() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { backend } = useAuth();
  const signOut = useSignOut();
  const { me, family } = useFamily();
  if (!me.data) return <section className="secondary-view app-view"><Loading /></section>;

  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <header className={styles.header}>
          <h1 className={styles.name}>{me.data.user.displayName}</h1>
          <p className={styles.email}>{me.data.user.email}</p>
        </header>
        {family && (
          <section className="settings-card" aria-labelledby="family-title">
            <h2 id="family-title">{t('profile.family')}</h2>
            <ul className="row-list">
              <li>
                <span className="row-main">{family.name}<small>{t(`profile.role.${family.role}`)}</small></span>
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
        <section className="settings-card" aria-labelledby="account-title">
          <h2 id="account-title">{t('profile.account')}</h2>
          <fieldset className={styles.language}>
            <legend className={styles.legend}>{t('profile.language')}</legend>
            {LOCALES.map((option) => (
              <label key={option} className="choice">
                <input type="radio" name="locale" checked={locale === option} onChange={() => setLocale(option)} />
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
git commit -m "Web: Profilo con famiglia, destinazioni future, lingua e uscita"
```

---

### Task 17: PWA e service worker

**Files:**
- Create: `web/src/pwa/sw-rules.ts`, `web/src/pwa/register.ts`, `web/public/manifest.webmanifest`, `web/public/icons/icon.svg`, `web/scripts/make-icons.sh`, `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`, `web/public/icons/apple-touch-icon.png`
- Modify: `web/src/pwa/sw.ts` (sostituisce il segnaposto), `web/src/main.tsx`
- Test: `web/src/pwa/sw-rules.test.ts`

**Interfaces:**
- Produces:
  - `type Strategy = 'shell' | 'asset' | 'passthrough'`
  - `strategyFor(request: { url: string; method: string; mode: string; origin: string }): Strategy`
  - `cacheName(version: string): string`, `staleCaches(names: string[], version: string): string[]`, `SHELL_URL = '/index.html'`, `SERVER_PREFIXES`
  - `registerServiceWorker(): void`

- [ ] **Step 1: Scrivi i test che falliscono**

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
    expect(strategyFor(req('/assets/x.js', 'cors', 'GET', 'https://cdn.example'))).toBe('passthrough');
    expect(strategyFor(req('/manifest.webmanifest'))).toBe('passthrough');
  });
  it('names caches by build and finds the old ones', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b', 'other'], 'b')).toEqual(['cosasimangia-a']);
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd web && npx vitest run src/pwa`
Expected: FAIL, `Failed to resolve import "./sw-rules"`.

- [ ] **Step 3: Regole e service worker**

`web/src/pwa/sw-rules.ts`:
```ts
export type Strategy = 'shell' | 'asset' | 'passthrough';

/** Routes answered by the Worker, never by the app shell (spec section 1, routes table). */
export const SERVER_PREFIXES = ['/api', '/mcp', '/internal', '/shopping-lists', '/.well-known', '/openapi.json', '/sw.js'];
export const SHELL_URL = '/index.html';
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

`web/src/pwa/sw.ts`:
```ts
import { cacheName, SHELL_URL, staleCaches, strategyFor } from './sw-rules';

// Built by Vite as a second entry (/sw.js). Minimal local types: the project compiles with the DOM library only.
interface ExtendableEventLike extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike { readonly request: Request; respondWith(response: Promise<Response>): void }
interface WorkerScope {
  readonly location: Location;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

const worker = self as unknown as WorkerScope;
const CACHE = cacheName(__BUILD_VERSION__);

// No skipWaiting: a new version takes over when the app is reopened (spec, PWA).
worker.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL_URL)));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(staleCaches(names, __BUILD_VERSION__).map((name) => caches.delete(name)))));
});

worker.addEventListener('fetch', (event) => {
  const strategy = strategyFor({ url: event.request.url, method: event.request.method, mode: event.request.mode, origin: worker.location.origin });
  if (strategy === 'shell') event.respondWith(shell(event.request));
  if (strategy === 'asset') event.respondWith(asset(event.request));
});

async function shell(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(CACHE)).put(SHELL_URL, response.clone());
    return response;
  } catch {
    return (await caches.match(SHELL_URL)) ?? Response.error();
  }
}

async function asset(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
  return response;
}
```

`web/src/pwa/register.ts`:
```ts
/** Production only: in development Vite serves unbundled modules the worker must not cache. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
```

`web/src/main.tsx`: aggiungere `import { registerServiceWorker } from './pwa/register';` e, dopo `createRoot(...).render(...)`, la riga `registerServiceWorker();`.

- [ ] **Step 4: Manifest e icone**

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

- [ ] **Step 5: Verifica test, build e service worker autonomo**

Run: `cd web && npx vitest run src/pwa && npm run build && grep -c "^import" dist/sw.js; ls dist/manifest.webmanifest dist/icons`
Expected: PASS; build senza errori; `grep` stampa `0` (il service worker non importa altri moduli); manifest e icone in `dist/`. Se `dist/sw.js` contiene `import` (perché il bundler ha messo `sw-rules` in un pezzo condiviso), costruire il service worker con una seconda build dedicata: script `"build:sw": "vite build --config vite.sw.config.ts"` con `build.lib` su `src/pwa/sw.ts`, formato `iife`, `outDir: 'dist'`, `emptyOutDir: false`, nome file `sw.js` (verificare le opzioni con Context7 su `/vitejs/vite`), togliere `sw` dagli input di `vite.config.ts` e aggiungere `&& npm run build:sw` allo script `build`.

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "Web: PWA installabile con manifest, icone e service worker scritto a mano"
```

---

### Task 18: README e verifiche finali

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
  stack locale: `supabase status`). Accesso con email e password; finché il server non
  c'è, i dati arrivano comunque dal client finto.

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

Con la skill `agent-browser`, su `npm run preview -- --port 8767` (build di produzione, `localhost`):
- `/menu`, `/recipes`, `/recipes/wok-pollo-peperoni-riso-basmati`, `/profile` a 320, 390 e 1440 px, in italiano e (dal Profilo) in inglese; screenshot nello scratchpad;
- confronto con `design/index.html` aperto alla stessa larghezza e con `design/references/hellofresh/preview-mobile.png`: fondo crema, font, banner 3:1, selettore dei giorni, navbar a icone;
- nessuno scorrimento orizzontale della pagina, titoli lunghi che vanno a capo, fonte troncata;
- offline: dopo il primo caricamento, rete disattivata (se agent-browser non lo consente, con chrome-devtools MCP `emulate` offline), ricarica di `/menu`: l'app si apre con i dati in cache e il banner offline.
- pagina di ingresso: `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=placeholder npm run dev` e apertura di `/login` a 390 px (credenziali errate → messaggio di rete o di credenziali). Se lo stack locale di Supabase è attivo, accesso vero con un utente di prova.

Annotare nella PR ciò che non torna rispetto al riferimento.

- [ ] **Step 4: Rete locale per l'iPhone**

Run: `cd web && npm run preview:lan` (in background) e stampare l'indirizzo `http://<ip del Mac>:8767`.
Scrivere al coordinatore l'indirizzo, chiedendo la prova su iPhone di resa e installazione (Aggiungi a Home).

- [ ] **Step 5: Commit**

```bash
git add web/README.md
git commit -m "Web: README con comandi, modalità e limiti del service worker sulla rete locale"
```
