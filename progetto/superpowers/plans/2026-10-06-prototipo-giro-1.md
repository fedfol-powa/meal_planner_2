# Prototipo, giro 1: Fondamenta, Menu, Ricettario e voti — piano

> **Per gli agenti che eseguono:** sotto-skill richiesta: superpowers:subagent-driven-development
> (consigliata) oppure superpowers:executing-plans, attività per attività. I passi usano
> le caselle (`- [ ]`) per il tracciamento.

**Obiettivo:** un prototipo SvelteKit navigabile da iPhone e desktop con Menu (oggi,
settimane e loro stati), Ricettario (ricerca, filtri, scheda) e componente voto in due
varianti, su dati demo ricavati dal progetto di origine.

**Architettura:** progetto SvelteKit autonomo in `prototype/`, solo client
(`ssr = false`, `adapter-static` con fallback). Le schermate chiamano operazioni
applicative simulate e pure (`src/lib/operations`) su un database demo in memoria,
persistito in `localStorage`. Un pannello di prova cambia utente, famiglia, lingua,
unità, data simulata, scenario, modalità offline e variante del voto.

**Stack:** Node 26, SvelteKit 2 con Svelte 5 (runes), TypeScript, `sv` 1.1.0,
`@sveltejs/adapter-static`, Vitest, `yaml` (solo per lo script dei dati demo).
Nessuna libreria di interfaccia o i18n: dizionari tipizzati e `Intl`.

**Riferimenti da leggere prima di iniziare:**
- specifica: `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 2,
  5, 6, 8, 12 e 14;
- percorsi: `design/percorsi.md`, sezioni "Architettura del prototipo" e "Giro 1";
- linguaggio visivo: `design/design.md`, `design/index.html`,
  `design/references/hellofresh/preview-*.png`.

**Sezioni della specifica realizzate (in forma simulata):** 2 (stati della settimana,
ruoli e appartenenza come contesto), 5 (vista di apertura, contenuto del pasto, cosa è
modificabile, "non cucinato", voto sempre visibile, ultima modifica, offline in sola
lettura), 6 (scalatura e presentazione metrica e imperiale britannica, provvisoria),
8 (catalogo pubblicato, esclusione delle bozze e dei libri non posseduti), 12 (lingua
dell'utente), 14 (linguaggio visivo e quarta voce della navbar).

## Vincoli globali

- Codice in inglese: identificatori, file, commenti, test. Documentazione in italiano.
- Testi visibili localizzati in `it-IT` ed `en-GB`; nessuna stringa visibile nei
  componenti fuori dai dizionari, tranne dati (nomi di ricette, testi liberi, titoli
  dei libri).
- Linguaggio visivo approvato: colori, font, misure e componenti di `design/design.md`;
  nessun nuovo colore di accento; stati semantici con testo esplicito, non solo colore.
- Font: i quattro WOFF2 di `design/assets/hellofresh/fonts/`, alias `Reference Agrandir`,
  `Reference Agrandir Tight`, `Reference Roboto`, `font-display: swap`,
  `font-synthesis: none`.
- Controlli alti almeno 44 px; focus visibile; semantica nativa o ARIA.
- Pasto passato: pranzo alle 15:30, cena alle 23:00, ora locale della famiglia.
- Ingredienti: solo quelli verificati del progetto di origine; mai dedotti. I testi
  inglesi del catalogo sono dimostrativi e vanno marcati come tali in
  `design/percorsi.md`.
- Progetto di origine `../meal_planner`: solo lettura.
- Chiavi di traduzione composte: scrivere `` app.t(`meal.${meal.mealType}` as const) ``
  (vale per tutti i template literal passati a `t`), così TypeScript le verifica
  come `MessageKey`; dove il piano omette `as const` aggiungerlo.
- Nessun push. Commit locali a ogni attività sul branch `prototipo-giro-1`.
- Porta di anteprima sulla rete locale: `8766` (la `8765` serve il riferimento).

## Focus della review

Casi che la specifica implica e che è facile rompere; ciascuno ha un test nell'attività
indicata.

1. **Quantità piccole dopo la scalatura** (1 spicchio per 6 porzioni scalato a 2): non
   deve mai comparire "0"; si mostra il minimo arrotondato. Test nell'attività 3.
2. **Confini temporali:** pasto esattamente alle 15:30 o alle 23:00, domenica 23:00 →
   lunedì, chiusura automatica il mercoledì alle 20:00. Test nell'attività 6.
3. **`localStorage` corrotto, di un'altra versione o non disponibile** (Safari
   privato): l'app riparte dai dati demo senza errori. Test nell'attività 5.
4. **Ricerca con accenti, maiuscole e lingua** ("perche", "POLLO", ingredienti in
   inglese per un utente `en-GB`). Test nell'attività 11.
5. **Cambio di famiglia o di settimana con un giorno selezionato che non le appartiene:**
   il Menu sceglie un giorno valido invece di mostrare una colonna vuota. Test
   nell'attività 7 (funzione `pickSelectedDate`).

Titoli lunghi e testi inglesi a 320 px si verificano nel browser alle tappe
(attività 10 e 15).

---

## Struttura dei file

```
prototype/
├── package.json, svelte.config.js, vite.config.ts, tsconfig.json   (da sv, poi adattati)
├── .gitignore                       node_modules, .svelte-kit, build, static/assets
├── scripts/
│   ├── sync-assets.mjs              copia font e foto da ../design/assets in static/assets
│   ├── build-demo-data.ts           legge ../meal_planner (YAML) → src/lib/demo-data/generated.json
│   └── demo-translations.en-GB.json testi inglesi dimostrativi di ricette e ingredienti
├── src/
│   ├── app.html
│   ├── lib/
│   │   ├── design/                  tokens.css, fonts.css, global.css
│   │   ├── domain/                  types.ts, calendar.ts (+ test)
│   │   ├── units/                   parse.ts, scale.ts, present.ts, format.ts (+ test)
│   │   ├── i18n/                    messages.ts, translate.ts, dates.ts (+ test)
│   │   ├── demo-data/               generated.json, seed.ts (+ test)
│   │   ├── store/                   persistence.ts, scenarios.ts (+ test), app.svelte.ts
│   │   ├── operations/              context.ts, access.ts, views.ts, meals.ts, recipes.ts (+ test)
│   │   └── components/              IconLibrary, BottomNav, DevPanel, OfflineBanner,
│   │                                StateNotice, WeekHeader, DaySelector, MealCard,
│   │                                IngredientList, RatingStars, RecipeCard, RecipeFilters
│   └── routes/
│       ├── +layout.ts, +layout.svelte, +page.ts (redirect a /menu)
│       ├── menu/+page.svelte
│       ├── recipes/+page.svelte
│       ├── recipes/[id]/+page.svelte
│       ├── shopping/+page.svelte
│       └── you/+page.svelte
```

Responsabilità: `domain` non conosce Svelte né lo stato; `operations` sono funzioni pure
`(db, ctx, args) → OpResult`, uniche a leggere e scrivere il database demo;
`store` tiene stato, persistenza e scenari; i componenti ricevono viste già pronte.

---

### Attività 1: progetto, asset e linguaggio visivo di base

**File:**
- Crea: `prototype/` con `sv`, `prototype/scripts/sync-assets.mjs`,
  `prototype/src/lib/design/tokens.css`, `fonts.css`, `global.css`,
  `prototype/src/routes/+layout.ts`, `+layout.svelte`, `+page.ts`
- Modifica: `prototype/svelte.config.js`, `prototype/package.json`, `prototype/.gitignore`,
  `prototype/src/app.html`

**Interfacce:**
- Produce: classi CSS globali del riferimento (`.shell`, `.app-content`, `.meal`,
  `.meal-free`, `.day-navigation`, `.day-links`, `.day-link`, `.week-track`, `.day`,
  `.ingredients`, `.ingredient-list`, `.bottom-navigation`, `.navigation-item`,
  `.secondary-view`, `.recipe-list`, `.recipe-row`, `.visually-hidden`, `.skip-link`,
  `.icon`) e variabili `--canvas --paper --ink --body-text --muted --rule --green
  --soft-green --free-surface --free-border --text-font --meal-title-font --heading-font`.
  Asset serviti da `/assets/fonts/*.woff2` e `/assets/recipe-images/*.jpg`.

- [ ] **Passo 1: branch e scaffolding**

```bash
cd /Users/fedfol/Projects/meal_planner_2
git switch -c prototipo-giro-1
npx -y sv@1.1.0 create prototype --template minimal --types ts \
  --add vitest="usages:unit" sveltekit-adapter="adapter:static" --install npm
```

Se `sv` rifiuta la sintassi delle opzioni degli add-on, creare con
`--no-add-ons --install npm` e poi, dentro `prototype/`, eseguire
`npx sv@1.1.0 add vitest="usages:unit"` e `npx sv@1.1.0 add sveltekit-adapter="adapter:static"`.
Poi: `cd prototype && npm install -D yaml`.

- [ ] **Passo 2: SPA e adapter**

`prototype/svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
```

`prototype/src/routes/+layout.ts`:

```ts
export const ssr = false;
export const prerender = false;
```

`prototype/src/routes/+page.ts`:

```ts
import { redirect } from '@sveltejs/kit';

export function load() {
	redirect(307, '/menu');
}
```

- [ ] **Passo 3: copia degli asset**

`prototype/scripts/sync-assets.mjs`:

```js
// Copies the approved fonts and recipe photos from design/ so they are not duplicated in Git.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const design = resolve(root, '../design/assets');
const target = resolve(root, 'static/assets');

mkdirSync(target, { recursive: true });
cpSync(resolve(design, 'hellofresh/fonts'), resolve(target, 'fonts'), { recursive: true });
cpSync(resolve(design, 'recipe-images'), resolve(target, 'recipe-images'), { recursive: true });
console.log('Assets synced to static/assets');
```

In `package.json`, sezione `scripts`, aggiungere:

```json
"sync-assets": "node scripts/sync-assets.mjs",
"predev": "npm run sync-assets",
"prebuild": "npm run sync-assets",
"demo-data": "node scripts/build-demo-data.ts",
"preview:lan": "npm run build && vite preview --host --port 8766"
```

In `prototype/.gitignore` aggiungere la riga `/static/assets`.

- [ ] **Passo 4: token e font**

`prototype/src/lib/design/tokens.css`:

```css
/* Values from design/design.md (approved 2026-10-04). */
:root {
	color-scheme: light;
	--canvas: #faf8f3;
	--paper: #fff;
	--ink: #232323;
	--body-text: #454545;
	--muted: #676767;
	--rule: #e4e4e4;
	--green: #067a46;
	--soft-green: #eef5e8;
	--free-surface: #f0f3ea;
	--free-border: #dce4d2;
	--card-shadow: 0 1px 3px rgb(0 0 0 / 10%);
	--text-font: 'Reference Roboto', Helvetica, Arial, sans-serif;
	--meal-title-font: 'Reference Agrandir', Verdana, sans-serif;
	--heading-font: 'Reference Agrandir Tight', Verdana, sans-serif;
}
```

`prototype/src/lib/design/fonts.css`:

```css
@font-face { font-family: 'Reference Agrandir'; src: url('/assets/fonts/agrandir-regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Reference Agrandir Tight'; src: url('/assets/fonts/agrandir-tight-bold.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Reference Roboto'; src: url('/assets/fonts/roboto-regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Reference Roboto'; src: url('/assets/fonts/roboto-bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
```

- [ ] **Passo 5: CSS globale portato dal riferimento**

Creare `prototype/src/lib/design/global.css` copiando **testualmente** le righe 28–155
di `design/index.html` (dalla regola `* { box-sizing: border-box; }` alla chiusura del
blocco `@media print`), con queste sole sostituzioni:

- `#recipe-list` → `.recipe-list` (tre occorrenze);
- in `.bottom-navigation`: `repeat(3, minmax(0, 1fr))` → `repeat(4, minmax(0, 1fr))`;
- `color: #454545` → `color: var(--body-text)`;
- in `.meal-free`: `#f0f3ea` → `var(--free-surface)` e `#dce4d2` → `var(--free-border)`;
- `box-shadow: 0 1px 3px rgb(0 0 0 / 10%)` → `box-shadow: var(--card-shadow)`.

In coda aggiungere le regole comuni per i nuovi elementi del prototipo:

```css
/* Prototype additions, same visual language. */
.label-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; color: var(--green); background: var(--soft-green); font: 700 0.75rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
.label-chip.neutral { color: var(--ink); background: var(--rule); }
.text-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--ink); border-radius: 8px; color: var(--ink); background: var(--paper); font: 700 0.875rem/1.5 var(--text-font); cursor: pointer; text-decoration: none; }
.text-button.primary { color: #fff; background: var(--ink); }
.text-button:disabled { opacity: 0.5; cursor: not-allowed; }
.link-inline { color: var(--green); font-weight: 700; text-underline-offset: 3px; }
.meta-line { margin: 0 0 6px; color: var(--muted); font-size: 0.875rem; }
.page-title { margin: 0 0 16px; font: 400 1.25rem/1.3 var(--heading-font); }
```

- [ ] **Passo 6: layout minimo e verifica**

`prototype/src/app.html`: impostare `<html lang="it">`, aggiungere
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
`<meta name="robots" content="noindex, nofollow">` e
`<meta name="referrer" content="no-referrer">`.

`prototype/src/routes/+layout.svelte` provvisorio (completato nell'attività 8):

```svelte
<script lang="ts">
	import '$lib/design/tokens.css';
	import '$lib/design/fonts.css';
	import '$lib/design/global.css';
	let { children } = $props();
</script>

<div class="shell">
	<main class="app-content" id="app-content" tabindex="-1">{@render children()}</main>
</div>
```

Creare `prototype/src/routes/menu/+page.svelte` con `<p class="secondary-view">Menu</p>`.

Run: `cd prototype && npm run check && npm run build`
Atteso: nessun errore; `build/index.html` presente; `static/assets/fonts` contiene 4 file.

- [ ] **Passo 7: commit**

```bash
git add prototype
git commit -m "Prototipo: progetto SvelteKit, asset e linguaggio visivo di base"
```

---

### Attività 2: tipi del dominio e traduzioni dell'interfaccia

**File:**
- Crea: `prototype/src/lib/domain/types.ts`, `prototype/src/lib/i18n/messages.ts`,
  `prototype/src/lib/i18n/translate.ts`, `prototype/src/lib/i18n/dates.ts`,
  `prototype/src/lib/i18n/i18n.test.ts`

**Interfacce:**
- Produce: tutti i tipi di `types.ts` sotto; `translate(locale, key, params?)`,
  `MessageKey`, `formatDayShort`, `formatDayLong`, `formatDayNumber`,
  `formatWeekRange`, `formatChangeTime`, `formatAverage`.

- [ ] **Passo 1: tipi**

`prototype/src/lib/domain/types.ts`:

```ts
export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];
export type MeasurementSystem = 'metric' | 'uk_imperial';
export type MealType = 'lunch' | 'dinner';
export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type RecipeStatus = 'published' | 'draft';
export type ProteinGroup = 'fish' | 'white_meat' | 'meat' | 'legumes' | 'eggs' | 'vegetarian';
export type GlobalRole = 'recipe_curator' | 'app_admin';
export type FamilyRole = 'family_admin' | 'member';
export type Channel = 'web' | 'mcp';
export type WeekStatus = 'draft' | 'in_progress' | 'pending_close' | 'closed';
/** Calendar date, YYYY-MM-DD. */
export type IsoDate = string;
/** Wall-clock time in the family's time zone, YYYY-MM-DDTHH:mm. Compared as strings. */
export type LocalDateTime = string;

/** Italian is always present; English may be missing only on draft recipes. */
export type Translated = { 'it-IT': string; 'en-GB': string | null };

export type UnitCode = 'g' | 'kg' | 'ml' | 'l' | 'oz' | 'piece' | 'clove' | 'tbsp' | 'tsp' | 'slice' | 'pinch';

export type Quantity =
	| { kind: 'amount'; value: number; unit: UnitCode }
	| { kind: 'to_taste' }
	| { kind: 'text' };

export interface Ingredient {
	id: string;
	name: Translated;
}

export interface RecipeIngredient {
	ingredientId: string;
	quantity: Quantity;
	/** Quantity exactly as written in the source, shown when it is not numeric. */
	sourceText: string;
}

export interface Book {
	id: string;
	title: string;
}

export interface Recipe {
	id: string;
	status: RecipeStatus;
	name: Translated;
	description: Translated;
	sourceType: SourceType;
	sourceUrl: string | null;
	bookId: string | null;
	bookPages: string | null;
	durationMinutes: number | null;
	baseServings: number | null;
	ingredients: RecipeIngredient[];
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup | null;
	tags: string[];
	photo: string | null;
}

export interface User {
	id: string;
	displayName: string;
	locale: Locale;
	globalRoles: GlobalRole[];
}

export interface FamilyMember {
	userId: string;
	role: FamilyRole;
}

export interface Family {
	id: string;
	name: string;
	measurementSystem: MeasurementSystem;
	timeZone: string;
	members: FamilyMember[];
	bookIds: string[];
}

export interface MealSlot {
	id: string;
	date: IsoDate;
	mealType: MealType;
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	cooked: boolean | null;
	/** null means the app (planner) wrote it. */
	updatedBy: string | null;
	updatedAt: LocalDateTime | null;
}

export interface Week {
	id: string;
	familyId: string;
	startsOn: IsoDate;
	generatedAt: LocalDateTime;
	closedAt: LocalDateTime | null;
	slots: MealSlot[];
}

export interface Rating {
	userId: string;
	recipeId: string;
	stars: number;
}

export interface DemoDatabase {
	users: User[];
	families: Family[];
	books: Book[];
	ingredients: Ingredient[];
	recipes: Recipe[];
	weeks: Week[];
	ratings: Rating[];
}
```

- [ ] **Passo 2: test che falliscono**

`prototype/src/lib/i18n/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { translate } from './translate';
import { formatAverage, formatChangeTime, formatDayShort, formatWeekRange } from './dates';

describe('messages', () => {
	it('has the same keys in both locales', () => {
		expect(Object.keys(messages['en-GB']).sort()).toEqual(Object.keys(messages['it-IT']).sort());
	});
	it('has no empty strings', () => {
		for (const dict of Object.values(messages)) {
			for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
		}
	});
});

describe('translate', () => {
	it('fills parameters', () => {
		expect(translate('it-IT', 'meal.servings', { count: 4 })).toBe('4 porzioni');
		expect(translate('en-GB', 'meal.servings', { count: 4 })).toBe('4 servings');
	});
});

describe('dates', () => {
	it('formats short weekday per locale', () => {
		expect(formatDayShort('it-IT', '2026-10-06')).toBe('MAR');
		expect(formatDayShort('en-GB', '2026-10-06')).toBe('TUE');
	});
	it('formats week ranges', () => {
		expect(formatWeekRange('it-IT', '2026-10-05')).toBe('5–11 ott');
		expect(formatWeekRange('en-GB', '2026-09-28')).toBe('28 Sept–4 Oct');
	});
	it('formats change time with weekday', () => {
		expect(formatChangeTime('it-IT', '2026-10-02T21:30')).toBe('venerdì 21:30');
		expect(formatChangeTime('en-GB', '2026-10-02T21:30')).toBe('Friday 21:30');
	});
	it('formats averages with one decimal', () => {
		expect(formatAverage('it-IT', 4.333)).toBe('4,3');
		expect(formatAverage('en-GB', 4)).toBe('4.0');
	});
});
```

Run: `npx vitest run src/lib/i18n` → Atteso: FAIL (moduli mancanti).

- [ ] **Passo 3: dizionari**

`prototype/src/lib/i18n/messages.ts`. Le chiavi elencate qui sono quelle usate in tutto
il giro; aggiungerne altre solo insieme nei due dizionari.

```ts
const it = {
	skip: 'Vai al contenuto',
	'nav.main': 'Navigazione principale',
	'nav.menu': 'Menu',
	'nav.recipes': 'Ricettario',
	'nav.shopping': 'Spesa',
	'nav.you': 'Tu',
	'common.comingSoon': 'Disponibile in un prossimo giro del prototipo',
	'common.back': 'Indietro',
	'common.close': 'Chiudi',
	'offline.banner': 'Sei offline: puoi consultare i dati già caricati, le modifiche non sono disponibili.',
	'offline.blocked': 'Non disponibile offline',
	'error.forbidden': 'Non hai accesso a questa famiglia.',
	'error.notFound': 'Contenuto non trovato.',
	'error.invalid': 'Dati non validi.',
	'error.offline': 'Sei offline: riprova quando torni in linea.',
	'error.notAllowed': 'Questa azione non è più possibile.',
	'menu.days': 'Giorni della settimana',
	'menu.week': 'Pasti della settimana',
	'menu.previousWeek': 'Settimana precedente',
	'menu.nextWeek': 'Settimana successiva',
	'menu.noWeeks.title': 'Ancora nessun menu',
	'menu.noWeeks.body': 'Questa famiglia non ha ancora una settimana pianificata.',
	'menu.noWeeks.action': 'Genera la prima settimana',
	'menu.noWeeks.simulated': 'Simulato: la generazione arriva con il percorso Famiglia e account.',
	'menu.dayEmpty': 'Nessun pasto pianificato in questo giorno.',
	'week.status.draft': 'Bozza',
	'week.status.in_progress': 'In corso',
	'week.status.pending_close': 'Da chiudere',
	'week.status.closed': 'Chiusa',
	'week.hint.draft': 'In revisione fino a domenica {date}',
	'week.hint.in_progress': 'Si possono cambiare i pasti non ancora passati',
	'week.hint.pending_close': 'Puoi segnare i pasti non cucinati fino a mercoledì {date} alle 20:00',
	'week.hint.closed': 'Sola lettura',
	'meal.lunch': 'Pranzo',
	'meal.dinner': 'Cena',
	'meal.servings': '{count} porzioni',
	'meal.minutes': '{count} min',
	'meal.free': 'Pasto libero',
	'meal.empty.title': 'Nessuna ricetta adatta',
	'meal.empty.body': 'Il pianificatore non ha trovato una ricetta che rispetti le regole per questo pasto.',
	'meal.past': 'Passato',
	'meal.notCooked': 'Non cucinato',
	'meal.markNotCooked': 'Segna come non cucinato',
	'meal.undoNotCooked': 'Era cucinato',
	'meal.changedBy': 'Cambiato da {name}, {time}',
	'meal.formerMember': 'ex membro',
	'meal.note': 'Nota',
	'meal.details': 'Scheda ricetta',
	'meal.ingredients': 'Ingredienti',
	'meal.ingredientsMissing': 'Ingredienti non ancora disponibili per questa ricetta.',
	'meal.translationMissing': 'traduzione mancante',
	'source.open': 'Apri la fonte',
	'source.youtube': 'Video YouTube',
	'source.book': 'Libro: {title}, pp. {pages}',
	'source.home': 'Ricetta di casa',
	'quantity.toTaste': 'q.b.',
	'rating.family': 'Famiglia',
	'rating.votes': '{count} voti',
	'rating.oneVote': '1 voto',
	'rating.none': 'Nessun voto',
	'rating.mine': 'Il tuo voto',
	'rating.notRated': 'Non hai votato',
	'rating.you': 'tu {stars}',
	'rating.give': 'Dai {stars} stelle a {recipe}',
	'rating.remove': 'Togli il mio voto',
	'rating.open': 'Voto di {recipe}: apri per votare',
	'recipes.title': 'Ricettario',
	'recipes.search': 'Cerca per nome o ingrediente',
	'recipes.filters': 'Filtri',
	'recipes.filter.meal': 'Pasto',
	'recipes.filter.time': 'Tempo massimo',
	'recipes.filter.group': 'Gruppo alimentare',
	'recipes.filter.stars': 'Voto minimo',
	'recipes.filter.any': 'Tutti',
	'recipes.filter.minutes': 'Fino a {count} min',
	'recipes.filter.starsAtLeast': 'Almeno {count} stelle',
	'recipes.count': '{count} ricette',
	'recipes.noResults.title': 'Nessuna ricetta trovata',
	'recipes.noResults.body': 'Prova a togliere qualche filtro o a cercare un altro ingrediente.',
	'recipes.reset': 'Azzera filtri',
	'group.fish': 'Pesce',
	'group.white_meat': 'Carne bianca',
	'group.meat': 'Carne',
	'group.legumes': 'Legumi',
	'group.eggs': 'Uova',
	'group.vegetarian': 'Vegetariano',
	'recipe.backToMenu': 'Torna al menu',
	'recipe.backToRecipes': 'Torna al ricettario',
	'recipe.servingsLabel': 'Porzioni',
	'recipe.lessServings': 'Una porzione in meno',
	'recipe.moreServings': 'Una porzione in più',
	'recipe.baseServings': 'Dosi della fonte per {count} porzioni',
	'recipe.history': 'Le ultime volte',
	'recipe.historyEmpty': 'Non l’avete ancora mangiata.',
	'recipe.unavailable': 'Questa ricetta non è disponibile per la tua famiglia.',
	'shopping.title': 'Spesa',
	'you.title': 'Tu',
	'you.families': 'Le tue famiglie',
	'you.role.family_admin': 'Amministratore',
	'you.role.member': 'Membro',
	'you.next': 'In arrivo',
	'you.dest.family': 'Famiglia, membri e inviti',
	'you.dest.preferences': 'Preferenze: lingua',
	'you.dest.curation': 'Curatela del ricettario',
	'you.dest.admin': 'Amministrazione dell’app',
	'you.dest.mcp': 'Collega il tuo agente (MCP)',
	'dev.open': 'Prova',
	'dev.title': 'Strumenti di prova',
	'dev.disclaimer': 'Non fanno parte dell’app: servono a provare scenari e ruoli.',
	'dev.user': 'Utente',
	'dev.family': 'Famiglia',
	'dev.language': 'Lingua dell’utente',
	'dev.units': 'Unità della famiglia',
	'dev.units.metric': 'Metrico',
	'dev.units.uk_imperial': 'Imperiale britannico',
	'dev.now': 'Data e ora simulate',
	'dev.scenario': 'Scenario',
	'dev.scenario.standard': 'Famiglia con storico',
	'dev.scenario.new_family': 'Famiglia nuova senza settimane',
	'dev.scenario.empty_today': 'Oggi senza pasti',
	'dev.applyScenario': 'Applica scenario',
	'dev.offline': 'Simula offline',
	'dev.ratingVariant': 'Variante del voto',
	'dev.ratingVariant.inline': 'Stelle dirette',
	'dev.ratingVariant.panel': 'Riepilogo e pannello',
	'dev.reset': 'Azzera i dati demo',
	'dev.demoData': 'Dati dimostrativi: testi inglesi e alcune classificazioni sono di prova.'
} as const;

export type MessageKey = keyof typeof it;

const en: Record<MessageKey, string> = {
	skip: 'Skip to content',
	'nav.main': 'Main navigation',
	'nav.menu': 'Menu',
	'nav.recipes': 'Recipes',
	'nav.shopping': 'Shopping',
	'nav.you': 'You',
	'common.comingSoon': 'Coming in a later round of the prototype',
	'common.back': 'Back',
	'common.close': 'Close',
	'offline.banner': 'You are offline: you can browse what is already loaded, but changes are unavailable.',
	'offline.blocked': 'Unavailable offline',
	'error.forbidden': 'You do not have access to this family.',
	'error.notFound': 'Not found.',
	'error.invalid': 'Invalid data.',
	'error.offline': 'You are offline: try again when you are back online.',
	'error.notAllowed': 'This action is no longer possible.',
	'menu.days': 'Days of the week',
	'menu.week': 'Meals of the week',
	'menu.previousWeek': 'Previous week',
	'menu.nextWeek': 'Next week',
	'menu.noWeeks.title': 'No menu yet',
	'menu.noWeeks.body': 'This family does not have a planned week yet.',
	'menu.noWeeks.action': 'Generate the first week',
	'menu.noWeeks.simulated': 'Simulated: generation arrives with the Family and account journey.',
	'menu.dayEmpty': 'No meals planned on this day.',
	'week.status.draft': 'Draft',
	'week.status.in_progress': 'In progress',
	'week.status.pending_close': 'To be closed',
	'week.status.closed': 'Closed',
	'week.hint.draft': 'Open for review until Sunday {date}',
	'week.hint.in_progress': 'Meals that have not happened yet can still be changed',
	'week.hint.pending_close': 'You can mark meals as not cooked until Wednesday {date} at 20:00',
	'week.hint.closed': 'Read only',
	'meal.lunch': 'Lunch',
	'meal.dinner': 'Dinner',
	'meal.servings': '{count} servings',
	'meal.minutes': '{count} min',
	'meal.free': 'Free meal',
	'meal.empty.title': 'No suitable recipe',
	'meal.empty.body': 'The planner could not find a recipe that fits the rules for this meal.',
	'meal.past': 'Past',
	'meal.notCooked': 'Not cooked',
	'meal.markNotCooked': 'Mark as not cooked',
	'meal.undoNotCooked': 'It was cooked',
	'meal.changedBy': 'Changed by {name}, {time}',
	'meal.formerMember': 'former member',
	'meal.note': 'Note',
	'meal.details': 'Recipe details',
	'meal.ingredients': 'Ingredients',
	'meal.ingredientsMissing': 'Ingredients are not available for this recipe yet.',
	'meal.translationMissing': 'translation missing',
	'source.open': 'Open the source',
	'source.youtube': 'YouTube video',
	'source.book': 'Book: {title}, pp. {pages}',
	'source.home': 'Home recipe',
	'quantity.toTaste': 'to taste',
	'rating.family': 'Family',
	'rating.votes': '{count} ratings',
	'rating.oneVote': '1 rating',
	'rating.none': 'No ratings',
	'rating.mine': 'Your rating',
	'rating.notRated': 'You have not rated it',
	'rating.you': 'you {stars}',
	'rating.give': 'Give {recipe} {stars} stars',
	'rating.remove': 'Remove my rating',
	'rating.open': 'Rating for {recipe}: open to rate',
	'recipes.title': 'Recipes',
	'recipes.search': 'Search by name or ingredient',
	'recipes.filters': 'Filters',
	'recipes.filter.meal': 'Meal',
	'recipes.filter.time': 'Maximum time',
	'recipes.filter.group': 'Food group',
	'recipes.filter.stars': 'Minimum rating',
	'recipes.filter.any': 'Any',
	'recipes.filter.minutes': 'Up to {count} min',
	'recipes.filter.starsAtLeast': 'At least {count} stars',
	'recipes.count': '{count} recipes',
	'recipes.noResults.title': 'No recipes found',
	'recipes.noResults.body': 'Try removing a filter or searching for another ingredient.',
	'recipes.reset': 'Clear filters',
	'group.fish': 'Fish',
	'group.white_meat': 'White meat',
	'group.meat': 'Meat',
	'group.legumes': 'Pulses',
	'group.eggs': 'Eggs',
	'group.vegetarian': 'Vegetarian',
	'recipe.backToMenu': 'Back to menu',
	'recipe.backToRecipes': 'Back to recipes',
	'recipe.servingsLabel': 'Servings',
	'recipe.lessServings': 'One serving fewer',
	'recipe.moreServings': 'One serving more',
	'recipe.baseServings': 'Source quantities for {count} servings',
	'recipe.history': 'Recent times',
	'recipe.historyEmpty': 'You have not had it yet.',
	'recipe.unavailable': 'This recipe is not available to your family.',
	'shopping.title': 'Shopping',
	'you.title': 'You',
	'you.families': 'Your families',
	'you.role.family_admin': 'Administrator',
	'you.role.member': 'Member',
	'you.next': 'Coming soon',
	'you.dest.family': 'Family, members and invitations',
	'you.dest.preferences': 'Preferences: language',
	'you.dest.curation': 'Recipe curation',
	'you.dest.admin': 'App administration',
	'you.dest.mcp': 'Connect your agent (MCP)',
	'dev.open': 'Test',
	'dev.title': 'Prototype tools',
	'dev.disclaimer': 'Not part of the app: they let you try scenarios and roles.',
	'dev.user': 'User',
	'dev.family': 'Family',
	'dev.language': 'User language',
	'dev.units': 'Family units',
	'dev.units.metric': 'Metric',
	'dev.units.uk_imperial': 'UK imperial',
	'dev.now': 'Simulated date and time',
	'dev.scenario': 'Scenario',
	'dev.scenario.standard': 'Family with history',
	'dev.scenario.new_family': 'New family with no weeks',
	'dev.scenario.empty_today': 'No meals today',
	'dev.applyScenario': 'Apply scenario',
	'dev.offline': 'Simulate offline',
	'dev.ratingVariant': 'Rating variant',
	'dev.ratingVariant.inline': 'Direct stars',
	'dev.ratingVariant.panel': 'Summary and panel',
	'dev.reset': 'Reset demo data',
	'dev.demoData': 'Demo data: English texts and some classifications are placeholders for testing.'
};

export const messages: Record<'it-IT' | 'en-GB', Record<MessageKey, string>> = { 'it-IT': it, 'en-GB': en };
```

`prototype/src/lib/i18n/translate.ts`:

```ts
import type { Locale } from '$lib/domain/types';
import { messages, type MessageKey } from './messages';

export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
	const template = messages[locale][key];
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}
```

`prototype/src/lib/i18n/dates.ts`:

```ts
import type { IsoDate, Locale, LocalDateTime } from '$lib/domain/types';
import { addDays } from '$lib/domain/calendar';

// Dates are calendar days: format them in UTC so the host time zone never shifts them.
function asUtc(date: IsoDate): Date {
	return new Date(`${date}T00:00:00Z`);
}

export function formatDayShort(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
		.format(asUtc(date))
		.replace('.', '')
		.toLocaleUpperCase(locale);
}

export function formatDayNumber(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatDayLong(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	}).format(asUtc(date));
}

export function formatWeekRange(locale: Locale, startsOn: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
		.formatRange(asUtc(startsOn), asUtc(addDays(startsOn, 6)))
		.replace(/\s*–\s*/, '–')
		.replace('.', '');
}

export function formatChangeTime(locale: Locale, at: LocalDateTime): string {
	const [date, time] = at.split('T');
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
		asUtc(date)
	);
	return `${weekday} ${time}`;
}

export function formatAverage(locale: Locale, value: number): string {
	return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
		value
	);
}
```

`dates.ts` importa `addDays` dall'attività 6: creare subito
`prototype/src/lib/domain/calendar.ts` con la sola funzione `addDays` (il resto arriva
nell'attività 6):

```ts
import type { IsoDate } from './types';

export function addDays(date: IsoDate, days: number): IsoDate {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
```

- [ ] **Passo 4: verifica**

Run: `npx vitest run src/lib/i18n` → Atteso: PASS. Se il formato di `formatRange` di
Node differisce nei separatori o nelle abbreviazioni ("Sept"/"Sep", "ott"), adeguare
l'atteso del test all'output reale di `Intl` di Node 26, non forzare stringhe a mano:
il test serve a fissare il comportamento, verificato a occhio una volta.
Run: `npm run check` → Atteso: nessun errore.

- [ ] **Passo 5: commit**

```bash
git add prototype/src/lib
git commit -m "Prototipo: tipi del dominio, dizionari it-IT ed en-GB, formati di data"
```

---

### Attività 3: quantità, scalatura e presentazione delle unità

**File:**
- Crea: `prototype/src/lib/units/parse.ts`, `scale.ts`, `present.ts`, `format.ts`,
  `units.test.ts`

**Interfacce:**
- Consuma: `Quantity`, `UnitCode`, `Locale`, `MeasurementSystem` (attività 2);
  `translate` (attività 2).
- Produce:
  - `parseQuantity(raw: string): Quantity`
  - `scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity`
  - `type PresentedUnit = UnitCode | 'lb' | 'fl_oz' | 'pint'`
  - `presentAmount(value: number, unit: UnitCode, system: MeasurementSystem): { value: number; unit: PresentedUnit }`
  - `formatQuantity(q: Quantity, sourceText: string, system: MeasurementSystem, locale: Locale): string`

`parse.ts` non deve importare moduli con alias `$lib` (lo usa anche lo script Node):
solo `import type` relativi.

- [ ] **Passo 1: test che falliscono**

`prototype/src/lib/units/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseQuantity } from './parse';
import { scaleQuantity } from './scale';
import { presentAmount } from './present';
import { formatQuantity } from './format';

describe('parseQuantity', () => {
	it.each([
		['300 g', { kind: 'amount', value: 300, unit: 'g' }],
		['1/2', { kind: 'amount', value: 0.5, unit: 'piece' }],
		['2', { kind: 'amount', value: 2, unit: 'piece' }],
		['3 cucchiai circa', { kind: 'amount', value: 3, unit: 'tbsp' }],
		['1 spicchio', { kind: 'amount', value: 1, unit: 'clove' }],
		['6 fette', { kind: 'amount', value: 6, unit: 'slice' }],
		['500 ml', { kind: 'amount', value: 500, unit: 'ml' }],
		['1,5 kg', { kind: 'amount', value: 1.5, unit: 'kg' }],
		['q.b.', { kind: 'to_taste' }],
		['a piacere', { kind: 'to_taste' }],
		['circa 213 g', { kind: 'text' }],
		['1/2-1 cucchiaino', { kind: 'text' }],
		['1 g crudo (330 g cotto)', { kind: 'text' }],
		['1/4 cup', { kind: 'text' }]
	])('parses %s', (raw, expected) => {
		expect(parseQuantity(raw)).toEqual(expected);
	});
});

describe('scaleQuantity', () => {
	it('scales amounts and leaves other kinds unchanged', () => {
		expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 3, 6)).toEqual({
			kind: 'amount',
			value: 150,
			unit: 'g'
		});
		expect(scaleQuantity({ kind: 'to_taste' }, 3, 6)).toEqual({ kind: 'to_taste' });
	});
});

describe('presentAmount', () => {
	it('keeps metric values and converts ounces to grams', () => {
		expect(presentAmount(150, 'g', 'metric')).toEqual({ value: 150, unit: 'g' });
		expect(presentAmount(1, 'oz', 'metric').unit).toBe('g');
	});
	it('converts to UK imperial with pounds and pints above thresholds', () => {
		expect(presentAmount(100, 'g', 'uk_imperial')).toEqual({ value: 100 / 28.349523125, unit: 'oz' });
		expect(presentAmount(1, 'kg', 'uk_imperial').unit).toBe('lb');
		expect(presentAmount(100, 'ml', 'uk_imperial').unit).toBe('fl_oz');
		expect(presentAmount(1, 'l', 'uk_imperial').unit).toBe('pint');
		expect(presentAmount(2, 'clove', 'uk_imperial')).toEqual({ value: 2, unit: 'clove' });
	});
});

describe('formatQuantity', () => {
	const amount = (value: number, unit: 'g' | 'clove' | 'tbsp' | 'piece' | 'ml') =>
		({ kind: 'amount', value, unit }) as const;

	it('rounds grams to tens, and to fives below 50 g', () => {
		expect(formatQuantity(amount(243, 'g'), '', 'metric', 'it-IT')).toBe('240 g');
		expect(formatQuantity(amount(37, 'g'), '', 'metric', 'it-IT')).toBe('35 g');
	});
	it('never shows zero for small amounts', () => {
		expect(formatQuantity(amount(2, 'g'), '', 'metric', 'it-IT')).toBe('2 g');
		expect(formatQuantity(amount(0.2, 'g'), '', 'metric', 'it-IT')).toBe('1 g');
		expect(formatQuantity(amount(1 / 3, 'clove'), '', 'metric', 'it-IT')).toBe('0,5 spicchi');
		expect(formatQuantity(amount(0.1, 'tbsp'), '', 'metric', 'en-GB')).toBe('0.5 tbsp');
	});
	it('rounds pieces and cloves up to the half', () => {
		expect(formatQuantity(amount(1.2, 'clove'), '', 'metric', 'it-IT')).toBe('1,5 spicchi');
		expect(formatQuantity(amount(1, 'clove'), '', 'metric', 'en-GB')).toBe('1 clove');
		expect(formatQuantity(amount(0.75, 'piece'), '', 'metric', 'it-IT')).toBe('1');
	});
	it('localises to taste and keeps free text', () => {
		expect(formatQuantity({ kind: 'to_taste' }, 'q.b.', 'metric', 'en-GB')).toBe('to taste');
		expect(formatQuantity({ kind: 'text' }, 'circa 213 g', 'metric', 'en-GB')).toBe('circa 213 g');
	});
	it('formats UK imperial', () => {
		expect(formatQuantity(amount(300, 'g'), '', 'uk_imperial', 'en-GB')).toBe('11 oz');
		expect(formatQuantity(amount(500, 'ml'), '', 'uk_imperial', 'en-GB')).toBe('18 fl oz');
	});
});
```

Run: `npx vitest run src/lib/units` → Atteso: FAIL (moduli mancanti).

- [ ] **Passo 2: implementazione**

`prototype/src/lib/units/parse.ts`:

```ts
import type { Quantity, UnitCode } from '../domain/types';

// Italian unit words used by the origin recipe book. Anything else stays as free text.
const UNIT_WORDS: Record<string, UnitCode> = {
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l',
	oz: 'oz',
	cucchiaio: 'tbsp',
	cucchiai: 'tbsp',
	cucchiaino: 'tsp',
	cucchiaini: 'tsp',
	spicchio: 'clove',
	spicchi: 'clove',
	fetta: 'slice',
	fette: 'slice',
	pizzico: 'pinch',
	pizzichi: 'pinch'
};

const TO_TASTE = new Set(['q.b.', 'qb', 'a piacere']);

function parseNumber(token: string): number | null {
	if (/^\d+\/\d+$/.test(token)) {
		const [numerator, denominator] = token.split('/').map(Number);
		return denominator > 0 ? numerator / denominator : null;
	}
	if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
	return null;
}

export function parseQuantity(raw: string): Quantity {
	const text = raw.trim().toLowerCase();
	if (TO_TASTE.has(text)) return { kind: 'to_taste' };
	const parts = text.split(/\s+/);
	const value = parseNumber(parts[0]);
	if (value === null) return { kind: 'text' };
	if (parts.length === 1) return { kind: 'amount', value, unit: 'piece' };
	const unit = UNIT_WORDS[parts[1]];
	if (!unit) return { kind: 'text' };
	const rest = parts.slice(2);
	if (rest.length > 1 || (rest.length === 1 && rest[0] !== 'circa')) return { kind: 'text' };
	return { kind: 'amount', value, unit };
}
```

`prototype/src/lib/units/scale.ts`:

```ts
import type { Quantity } from '$lib/domain/types';

export function scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity {
	if (q.kind !== 'amount') return q;
	return { ...q, value: (q.value * servings) / baseServings };
}
```

`prototype/src/lib/units/present.ts`:

```ts
import type { MeasurementSystem, UnitCode } from '$lib/domain/types';

// Provisional factors: the verified list is still open (spec section 15, "Misure").
const G_PER_OZ = 28.349523125;
const OZ_PER_LB = 16;
const ML_PER_UK_FL_OZ = 28.4130625;
const UK_FL_OZ_PER_PINT = 20;

export type PresentedUnit = UnitCode | 'lb' | 'fl_oz' | 'pint';
export interface PresentedAmount {
	value: number;
	unit: PresentedUnit;
}

export function presentAmount(value: number, unit: UnitCode, system: MeasurementSystem): PresentedAmount {
	if (system === 'metric') {
		return unit === 'oz' ? { value: value * G_PER_OZ, unit: 'g' } : { value, unit };
	}
	let grams: number | null = null;
	let millilitres: number | null = null;
	if (unit === 'g') grams = value;
	else if (unit === 'kg') grams = value * 1000;
	else if (unit === 'ml') millilitres = value;
	else if (unit === 'l') millilitres = value * 1000;
	else return { value, unit };

	if (grams !== null) {
		const ounces = grams / G_PER_OZ;
		return ounces >= OZ_PER_LB ? { value: ounces / OZ_PER_LB, unit: 'lb' } : { value: ounces, unit: 'oz' };
	}
	const fluidOunces = (millilitres as number) / ML_PER_UK_FL_OZ;
	return fluidOunces >= UK_FL_OZ_PER_PINT
		? { value: fluidOunces / UK_FL_OZ_PER_PINT, unit: 'pint' }
		: { value: fluidOunces, unit: 'fl_oz' };
}

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

function ceilTo(value: number, step: number): number {
	return Math.ceil(value / step - 1e-9) * step;
}

/** Display rounding only (spec section 6); never applied to values that are summed. */
export function roundForDisplay({ value, unit }: PresentedAmount): PresentedAmount {
	let rounded: number;
	switch (unit) {
		case 'g':
		case 'ml':
			rounded = value < 5 ? Math.max(1, Math.round(value)) : roundTo(value, value < 50 ? 5 : 10);
			break;
		case 'kg':
		case 'l':
			rounded = Math.max(0.1, roundTo(value, 0.1));
			break;
		case 'piece':
		case 'clove':
			rounded = ceilTo(value, 0.5);
			break;
		case 'tbsp':
		case 'tsp':
			rounded = Math.max(0.5, roundTo(value, 0.5));
			break;
		case 'slice':
		case 'pinch':
			rounded = Math.max(1, Math.ceil(value - 1e-9));
			break;
		case 'oz':
			rounded = value < 4 ? Math.max(0.5, roundTo(value, 0.5)) : Math.round(value);
			break;
		case 'fl_oz':
			rounded = Math.max(0.5, value < 4 ? roundTo(value, 0.5) : Math.round(value));
			break;
		case 'lb':
		case 'pint':
			rounded = Math.max(0.25, roundTo(value, 0.25));
			break;
	}
	return { value: rounded, unit };
}
```

`prototype/src/lib/units/format.ts`:

```ts
import type { Locale, MeasurementSystem, Quantity } from '$lib/domain/types';
import { translate } from '$lib/i18n/translate';
import { presentAmount, roundForDisplay, type PresentedUnit } from './present';

// [singular, plural]; an empty label means the number alone (pieces).
const UNIT_LABELS: Record<Locale, Record<PresentedUnit, [string, string]>> = {
	'it-IT': {
		g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'],
		lb: ['lb', 'lb'], fl_oz: ['fl oz', 'fl oz'], pint: ['pinta', 'pinte'], piece: ['', ''],
		clove: ['spicchio', 'spicchi'], tbsp: ['cucchiaio', 'cucchiai'],
		tsp: ['cucchiaino', 'cucchiaini'], slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi']
	},
	'en-GB': {
		g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'],
		lb: ['lb', 'lb'], fl_oz: ['fl oz', 'fl oz'], pint: ['pint', 'pints'], piece: ['', ''],
		clove: ['clove', 'cloves'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
		slice: ['slice', 'slices'], pinch: ['pinch', 'pinches']
	}
};

export function formatQuantity(
	q: Quantity,
	sourceText: string,
	system: MeasurementSystem,
	locale: Locale
): string {
	if (q.kind === 'to_taste') return translate(locale, 'quantity.toTaste');
	if (q.kind === 'text') return sourceText;
	const { value, unit } = roundForDisplay(presentAmount(q.value, q.unit, system));
	const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
	const [singular, plural] = UNIT_LABELS[locale][unit];
	const label = value === 1 ? singular : plural;
	return label ? `${number} ${label}` : number;
}
```

- [ ] **Passo 3: verifica**

Run: `npx vitest run src/lib/units` → Atteso: PASS.

- [ ] **Passo 4: commit**

```bash
git add prototype/src/lib/units
git commit -m "Prototipo: lettura, scalatura e presentazione delle quantità"
```

---

### Attività 4: dati demo dal progetto di origine

**File:**
- Crea: `prototype/scripts/build-demo-data.ts`,
  `prototype/scripts/demo-translations.en-GB.json`,
  `prototype/src/lib/demo-data/generated.json` (generato e versionato),
  `prototype/src/lib/demo-data/generated.test.ts`

**Interfacce:**
- Consuma: `parseQuantity` (attività 3), tipi (attività 2).
- Produce: `generated.json` con forma
  `{ books: Book[]; ingredients: Ingredient[]; recipes: Recipe[]; weeks: Week[]; federicoRatings: { recipeId: string; stars: number }[] }`,
  settimane della famiglia `family-main`.

**Regole dei dati** (da riportare in `design/percorsi.md` all'attività 10):

- sorgenti in sola lettura: `../meal_planner/ricettario/ricette.yaml` e
  `../meal_planner/menu/{2026-09-21,2026-09-28,2026-10-05}/menu.yaml` (le settimane
  precedenti citano ricette archiviate e sono escluse);
- `tipo`: `web`→`web`, `youtube`→`youtube`, `libro`→`book`, `casa`→`home`; una ricetta
  `casa` con `url` resta `home` e conserva `sourceUrl` (caso R4, da discutere in review);
- `status`: `published` se ha ingredienti, `porzioni_base` e testi inglesi completi;
  altrimenti `draft` (non compare nel ricettario; nei menu passati mostra "ingredienti
  non ancora disponibili");
- `durationMinutes`: numero più alto in `tempo` ("25-30 min" → 30), altrimenti `null`;
- `mealType` dallo `storico` (solo pranzi → `lunch`, solo cene → `dinner`, altrimenti
  `both`); `proteinGroup` dai tag (`pesce`→`fish`, `pollo`→`white_meat`,
  `carne`→`meat`, `legumi`→`legumes`, `uova`→`eggs`, `vegetariano`→`vegetarian`, primo
  trovato in quest'ordine): classificazioni dimostrative;
- identità degli ingredienti: slug del nome italiano; nomi inglesi dal file di
  traduzioni;
- foto: `/assets/recipe-images/<id>.jpg` se il file esiste in `design/assets/recipe-images`;
- voti di Federico da `feedback`: 1→1, 2→3, 3→4, 4→5 (specifica, sezione 8);
- settimane: slot dal menu (ricetta o `libero`), `porzioni` dal menu, `cooked` dallo
  `storico` della ricetta per quella settimana e quel pasto; le sostituzioni di nome e
  descrizione dei singoli slot del menu di origine sono ignorate;
  `generatedAt` = mercoledì precedente alle 20:00; `closedAt` = mercoledì successivo
  alle 20:00 per il 21 settembre, `null` per il 28 settembre e il 5 ottobre;
- bozza del 12 ottobre generata dallo script: stessi slot liberi del 5 ottobre; per gli
  altri slot la prima ricetta pubblicata, in ordine di `id`, non usata nelle settimane
  del 28 settembre e del 5 ottobre né già nella bozza, con `mealType` compatibile;
  porzioni come lo stesso slot del 5 ottobre; la cena di mercoledì 14 resta vuota per
  mostrare "nessuna ricetta adatta"; `generatedAt` = `2026-10-07T20:00`. È una scelta
  dimostrativa, non il pianificatore.

- [ ] **Passo 1: test di integrità che fallisce**

`prototype/src/lib/demo-data/generated.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import data from './generated.json';
import type { Ingredient, Recipe, Week } from '$lib/domain/types';

const recipes = data.recipes as Recipe[];
const ingredients = data.ingredients as Ingredient[];
const weeks = data.weeks as Week[];

describe('generated demo data', () => {
	it('has unique ids', () => {
		expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);
		expect(new Set(ingredients.map((i) => i.id)).size).toBe(ingredients.length);
	});
	it('publishes only complete, bilingual recipes', () => {
		const byId = new Map(ingredients.map((i) => [i.id, i]));
		for (const recipe of recipes.filter((r) => r.status === 'published')) {
			expect(recipe.name['en-GB'], recipe.id).toBeTruthy();
			expect(recipe.description['en-GB'], recipe.id).toBeTruthy();
			expect(recipe.baseServings, recipe.id).toBeGreaterThan(0);
			expect(recipe.ingredients.length, recipe.id).toBeGreaterThan(0);
			for (const line of recipe.ingredients) expect(byId.get(line.ingredientId)?.name['en-GB']).toBeTruthy();
		}
	});
	it('keeps drafts for recipes without ingredients', () => {
		expect(recipes.find((r) => r.id === 'polpettine-tacchino-skottle')?.status).toBe('draft');
	});
	it('references existing recipes from every slot', () => {
		const ids = new Set(recipes.map((r) => r.id));
		for (const week of weeks) for (const slot of week.slots) if (slot.recipeId) expect(ids.has(slot.recipeId)).toBe(true);
	});
	it('contains the four demo weeks', () => {
		expect(weeks.map((w) => w.startsOn)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
	});
	it('leaves one empty slot in the draft week', () => {
		const draft = weeks.find((w) => w.startsOn === '2026-10-12')!;
		expect(draft.slots.filter((s) => !s.recipeId && !s.freeText)).toHaveLength(1);
	});
});
```

Run: `npx vitest run src/lib/demo-data` → Atteso: FAIL (file mancante).

- [ ] **Passo 2: script**

`prototype/scripts/build-demo-data.ts` (eseguito da Node 26 con type stripping):

```ts
// Builds the prototype demo data from the origin project, read only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseQuantity } from '../src/lib/units/parse.ts';
import type { Book, Ingredient, MealSlot, MealType, Recipe, RecipeMealType, Week } from '../src/lib/domain/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = resolve(root, '../../meal_planner');
const imagesDir = resolve(root, '../design/assets/recipe-images');
const output = resolve(root, 'src/lib/demo-data/generated.json');
const translations = JSON.parse(readFileSync(resolve(root, 'scripts/demo-translations.en-GB.json'), 'utf8')) as {
	recipes: Record<string, { name: string; description: string }>;
	ingredients: Record<string, string>;
};
const reportMissing = process.argv.includes('--report-missing');

type OriginRecipe = {
	id: string; nome: string; descrizione: string; tipo: 'web' | 'youtube' | 'libro' | 'casa';
	url?: string | null; libro?: { titolo: string; pagine: string } | null; tempo?: string | null;
	porzioni_base: number | null; ingredienti: { nome: string; quantita: string | number }[] | null;
	feedback: number | null; tag: string[];
	storico: { settimana: string; pasto: string; cucinata: boolean | null }[];
};
type OriginSlot = { ricetta?: string; libero?: string; porzioni?: number };
type OriginMenu = { settimana: { inizio: string }; giorni: ({ data: string } & Record<'pranzo' | 'cena', OriginSlot | undefined>)[] };

const slug = (text: string) =>
	text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const addDays = (date: string, days: number) => {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

const MEAL_KEYS: Record<'pranzo' | 'cena', MealType> = { pranzo: 'lunch', cena: 'dinner' };
const DAY_KEYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const SOURCE: Record<OriginRecipe['tipo'], Recipe['sourceType']> = { web: 'web', youtube: 'youtube', libro: 'book', casa: 'home' };
const PROTEIN_TAGS: [string, NonNullable<Recipe['proteinGroup']>][] = [
	['pesce', 'fish'], ['pollo', 'white_meat'], ['carne', 'meat'], ['legumi', 'legumes'], ['uova', 'eggs'], ['vegetariano', 'vegetarian']
];
const FEEDBACK_TO_STARS: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

const originRecipes = (parse(readFileSync(resolve(origin, 'ricettario/ricette.yaml'), 'utf8')) as { ricette: OriginRecipe[] }).ricette;
const missing: { recipes: Record<string, { name: string; description: string }>; ingredients: Record<string, string> } = { recipes: {}, ingredients: {} };

const books = new Map<string, Book>();
const ingredients = new Map<string, Ingredient>();

function mealTypeOf(r: OriginRecipe): RecipeMealType {
	const kinds = new Set(r.storico.map((s) => (s.pasto.endsWith('pranzo') ? 'lunch' : 'dinner')));
	return kinds.size === 1 ? ([...kinds][0] as MealType) : 'both';
}

function durationOf(text: string | null | undefined): number | null {
	const numbers = (text ?? '').match(/\d+/g)?.map(Number);
	return numbers?.length ? Math.max(...numbers) : null;
}

const recipes: Recipe[] = originRecipes.map((r) => {
	const en = translations.recipes[r.id];
	const lines = (r.ingredienti ?? []).map((line) => {
		const id = slug(line.nome);
		const enName = translations.ingredients[line.nome] ?? null;
		if (!ingredients.has(id)) ingredients.set(id, { id, name: { 'it-IT': line.nome, 'en-GB': enName } });
		return { ingredientId: id, quantity: parseQuantity(String(line.quantita)), sourceText: String(line.quantita), enName, name: line.nome };
	});
	const hasData = lines.length > 0 && !!r.porzioni_base;
	if (hasData) {
		if (!en) missing.recipes[r.id] = { name: r.nome, description: r.descrizione };
		for (const line of lines) if (!line.enName) missing.ingredients[line.name] = '';
	}
	const complete = hasData && !!en && lines.every((l) => l.enName);
	let bookId: string | null = null;
	if (r.libro) {
		bookId = slug(r.libro.titolo);
		books.set(bookId, { id: bookId, title: r.libro.titolo });
	}
	return {
		id: r.id,
		status: complete ? 'published' : 'draft',
		name: { 'it-IT': r.nome, 'en-GB': en?.name ?? null },
		description: { 'it-IT': r.descrizione, 'en-GB': en?.description ?? null },
		sourceType: SOURCE[r.tipo],
		sourceUrl: r.url ?? null,
		bookId,
		bookPages: r.libro?.pagine ?? null,
		durationMinutes: durationOf(r.tempo),
		baseServings: r.porzioni_base,
		ingredients: lines.map(({ ingredientId, quantity, sourceText }) => ({ ingredientId, quantity, sourceText })),
		mealType: mealTypeOf(r),
		proteinGroup: PROTEIN_TAGS.find(([tag]) => r.tag.includes(tag))?.[1] ?? null,
		tags: r.tag,
		photo: existsSync(resolve(imagesDir, `${r.id}.jpg`)) ? `/assets/recipe-images/${r.id}.jpg` : null
	};
});

if (reportMissing) {
	console.log(JSON.stringify(missing, null, 2));
	process.exit(0);
}
if (Object.keys(missing.recipes).length || Object.keys(missing.ingredients).length) {
	console.error('Missing en-GB translations. Run with --report-missing and complete scripts/demo-translations.en-GB.json');
	process.exit(1);
}

const byId = new Map(recipes.map((r) => [r.id, r]));
const cookedOf = (recipeId: string, startsOn: string, dayIndex: number, meal: 'pranzo' | 'cena') =>
	originRecipes.find((r) => r.id === recipeId)?.storico.find((s) => s.settimana === startsOn && s.pasto === `${DAY_KEYS[dayIndex]}-${meal}`)?.cucinata ?? null;

function weekFromMenu(startsOn: string, closedAt: string | null): Week {
	const menu = parse(readFileSync(resolve(origin, `menu/${startsOn}/menu.yaml`), 'utf8')) as OriginMenu;
	const slots: MealSlot[] = [];
	menu.giorni.forEach((day, dayIndex) => {
		for (const key of ['pranzo', 'cena'] as const) {
			const s = day[key];
			if (!s) continue;
			const mealType = MEAL_KEYS[key];
			slots.push({
				id: `${day.data}-${mealType}`,
				date: day.data,
				mealType,
				recipeId: s.ricetta ?? null,
				freeText: s.libero ?? null,
				servings: s.porzioni ?? 4,
				note: null,
				cooked: s.ricetta ? cookedOf(s.ricetta, startsOn, dayIndex, key) : null,
				updatedBy: null,
				updatedAt: null
			});
		}
	});
	return { id: `week-${startsOn}`, familyId: 'family-main', startsOn, generatedAt: `${addDays(startsOn, -5)}T20:00`, closedAt, slots };
}

const weeks = [
	weekFromMenu('2026-09-21', '2026-09-30T20:00'),
	weekFromMenu('2026-09-28', null),
	weekFromMenu('2026-10-05', null)
];

function draftWeek(template: Week, recent: Week[]): Week {
	const startsOn = '2026-10-12';
	const used = new Set(recent.flatMap((w) => w.slots.map((s) => s.recipeId)).filter(Boolean));
	const candidates = recipes.filter((r) => r.status === 'published').sort((a, b) => a.id.localeCompare(b.id));
	const slots = template.slots.map((slot): MealSlot => {
		const date = addDays(startsOn, (new Date(`${slot.date}T00:00:00Z`).getUTCDay() + 6) % 7);
		const base = { ...slot, id: `${date}-${slot.mealType}`, date, cooked: null, updatedBy: null, updatedAt: null, note: null };
		if (slot.freeText) return base;
		if (date === '2026-10-14' && slot.mealType === 'dinner') return { ...base, recipeId: null };
		const pick = candidates.find((r) => !used.has(r.id) && (r.mealType === 'both' || r.mealType === slot.mealType));
		if (pick) used.add(pick.id);
		return { ...base, recipeId: pick?.id ?? null };
	});
	return { id: `week-${startsOn}`, familyId: 'family-main', startsOn, generatedAt: '2026-10-07T20:00', closedAt: null, slots };
}

weeks.push(draftWeek(weeks[2], weeks.slice(1)));

for (const week of weeks) for (const slot of week.slots) if (slot.recipeId && !byId.has(slot.recipeId)) throw new Error(`Unknown recipe ${slot.recipeId}`);

const federicoRatings = originRecipes
	.filter((r) => r.feedback && FEEDBACK_TO_STARS[r.feedback])
	.map((r) => ({ recipeId: r.id, stars: FEEDBACK_TO_STARS[r.feedback as number] }));

writeFileSync(
	output,
	JSON.stringify({ books: [...books.values()], ingredients: [...ingredients.values()], recipes, weeks, federicoRatings }, null, '\t') + '\n'
);
console.log(`Wrote ${recipes.length} recipes, ${ingredients.size} ingredients, ${weeks.length} weeks`);
```

- [ ] **Passo 3: traduzioni dimostrative**

Creare `prototype/scripts/demo-translations.en-GB.json` con
`{ "recipes": {}, "ingredients": {} }`, poi:

Run: `cd prototype && node scripts/build-demo-data.ts --report-missing > /tmp/missing.json`
(usare la scratchpad della sessione al posto di `/tmp`).

Compilare il file con un nome e una descrizione in inglese britannico per ogni ricetta
elencata e un nome inglese per ogni ingrediente, traducendo fedelmente il testo italiano
senza aggiungere ingredienti o dettagli (ortografia britannica: "courgette",
"aubergine", "chickpeas", "coriander", "minced", "pulses"). Chiavi degli ingredienti =
nome italiano esatto.

- [ ] **Passo 4: generazione e verifica**

Run: `npm run demo-data` → Atteso: `Wrote 56 recipes, … ingredients, 4 weeks`.
Run: `npx vitest run src/lib/demo-data` → Atteso: PASS.

- [ ] **Passo 5: commit**

```bash
git add prototype/scripts prototype/src/lib/demo-data
git commit -m "Prototipo: dati demo dal ricettario e dai menu di origine"
```

---

### Attività 5: seed, persistenza e scenari

**File:**
- Crea: `prototype/src/lib/demo-data/seed.ts`, `prototype/src/lib/store/persistence.ts`,
  `prototype/src/lib/store/scenarios.ts`, `prototype/src/lib/store/store.test.ts`,
  `prototype/src/lib/store/app.svelte.ts`

**Interfacce:**
- Consuma: `generated.json` (attività 4), tipi, `translate`, `MessageKey`.
- Produce:
  - `createSeedDatabase(): DemoDatabase`
  - `type ScenarioId = 'standard' | 'new_family' | 'empty_today'`
  - `type RatingVariant = 'inline' | 'panel'`
  - `interface PrototypeSettings { userId: string; familyId: string; now: LocalDateTime; offline: boolean; ratingVariant: RatingVariant; scenario: ScenarioId }`
  - `interface Persisted { version: 1; db: DemoDatabase; settings: PrototypeSettings }`
  - `STORAGE_KEY = 'app-famiglia-prototype-v1'`
  - `createInitial(): Persisted`, `applyScenario(id: ScenarioId): Persisted`
  - `loadPersisted(storage: Pick<Storage, 'getItem'> | null): Persisted`
  - `savePersisted(storage: Pick<Storage, 'setItem'> | null, value: Persisted): void`
  - `app` (istanza di `AppState`) con `db`, `settings`, `user`, `family`, `locale`,
    `ctx`, `selectedDate`, `t(key, params?)`, `update(fn)`, `reset()`,
    `setScenario(id)`, `switchUser(userId)`

- [ ] **Passo 1: test che falliscono**

`prototype/src/lib/store/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, createInitial, loadPersisted, savePersisted } from './persistence';
import { applyScenario } from './scenarios';

const storageWith = (value: string | null) => ({ getItem: (key: string) => (key === STORAGE_KEY ? value : null) });

describe('seed', () => {
	it('starts as Federico in the main family on 6 October at noon', () => {
		const initial = createInitial();
		expect(initial.settings).toMatchObject({ userId: 'user-federico', familyId: 'family-main', now: '2026-10-06T12:00', offline: false, ratingVariant: 'inline', scenario: 'standard' });
		expect(initial.db.users.map((u) => u.id)).toEqual(['user-federico', 'user-anna', 'user-tom', 'user-lucia']);
	});
	it('records the Monday dinner change by Federico and a change by Anna', () => {
		const week = createInitial().db.weeks.find((w) => w.startsOn === '2026-10-05')!;
		expect(week.slots.find((s) => s.id === '2026-10-05-dinner')).toMatchObject({ updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10' });
		expect(week.slots.find((s) => s.id === '2026-10-08-lunch')).toMatchObject({ updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30' });
	});
});

describe('loadPersisted', () => {
	it('falls back to the seed without storage', () => {
		expect(loadPersisted(null).settings.userId).toBe('user-federico');
	});
	it('falls back to the seed on corrupt JSON', () => {
		expect(loadPersisted(storageWith('{not json')).version).toBe(1);
	});
	it('falls back to the seed on another version', () => {
		expect(loadPersisted(storageWith(JSON.stringify({ version: 0, db: {}, settings: {} }))).db.users.length).toBe(4);
	});
	it('falls back to the seed when getItem throws', () => {
		const throwing = { getItem: () => { throw new Error('SecurityError'); } };
		expect(loadPersisted(throwing).version).toBe(1);
	});
	it('round-trips a saved value', () => {
		let stored: string | null = null;
		const value = createInitial();
		value.settings.offline = true;
		savePersisted({ setItem: (_k: string, v: string) => { stored = v; } }, value);
		expect(loadPersisted(storageWith(stored)).settings.offline).toBe(true);
	});
	it('does not throw when setItem throws', () => {
		expect(() => savePersisted({ setItem: () => { throw new Error('QuotaExceeded'); } }, createInitial())).not.toThrow();
	});
});

describe('scenarios', () => {
	it('new_family selects the grandparents family without weeks', () => {
		const s = applyScenario('new_family');
		expect(s.settings.familyId).toBe('family-grandparents');
		expect(s.db.weeks.some((w) => w.familyId === 'family-grandparents')).toBe(false);
	});
	it('empty_today removes the slots of the simulated day', () => {
		const s = applyScenario('empty_today');
		expect(s.db.weeks.flatMap((w) => w.slots).some((slot) => slot.date === '2026-10-06')).toBe(false);
	});
});
```

Run: `npx vitest run src/lib/store` → Atteso: FAIL.

- [ ] **Passo 2: seed**

`prototype/src/lib/demo-data/seed.ts`:

```ts
import type { DemoDatabase, Rating } from '$lib/domain/types';
import data from './generated.json';

// Demo people: Federico from the origin project, the others invented for the prototype.
export function createSeedDatabase(): DemoDatabase {
	const generated = structuredClone(data) as unknown as Omit<DemoDatabase, 'users' | 'families' | 'ratings'> & {
		federicoRatings: { recipeId: string; stars: number }[];
	};
	const ratings: Rating[] = generated.federicoRatings.map((r) => ({ userId: 'user-federico', ...r }));
	// Deterministic invented ratings so averages differ from Federico's own.
	generated.federicoRatings.forEach((r, index) => {
		if (index % 2 === 0) ratings.push({ userId: 'user-anna', recipeId: r.recipeId, stars: Math.max(1, r.stars - 1) });
		if (index % 3 === 0) ratings.push({ userId: 'user-tom', recipeId: r.recipeId, stars: Math.min(5, r.stars + 1) });
	});

	const weeks = generated.weeks;
	const current = weeks.find((w) => w.startsOn === '2026-10-05');
	const mondayDinner = current?.slots.find((s) => s.id === '2026-10-05-dinner');
	if (mondayDinner) Object.assign(mondayDinner, { updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10' });
	const thursdayLunch = current?.slots.find((s) => s.id === '2026-10-08-lunch');
	if (thursdayLunch) Object.assign(thursdayLunch, { updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30', note: 'Doppia dose, avanza per venerdì' });

	return {
		users: [
			{ id: 'user-federico', displayName: 'Federico', locale: 'it-IT', globalRoles: ['recipe_curator', 'app_admin'] },
			{ id: 'user-anna', displayName: 'Anna', locale: 'it-IT', globalRoles: [] },
			{ id: 'user-tom', displayName: 'Tom', locale: 'en-GB', globalRoles: [] },
			{ id: 'user-lucia', displayName: 'Lucia', locale: 'it-IT', globalRoles: [] }
		],
		families: [
			{
				id: 'family-main',
				name: 'Famiglia Folloni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-federico', role: 'family_admin' },
					{ userId: 'user-anna', role: 'member' },
					{ userId: 'user-tom', role: 'member' }
				],
				bookIds: generated.books.map((b) => b.id)
			},
			{
				id: 'family-grandparents',
				name: 'Nonni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-lucia', role: 'family_admin' },
					{ userId: 'user-federico', role: 'member' }
				],
				bookIds: []
			}
		],
		books: generated.books,
		ingredients: generated.ingredients,
		recipes: generated.recipes,
		weeks,
		ratings
	};
}
```

- [ ] **Passo 3: persistenza e scenari**

`prototype/src/lib/store/persistence.ts`:

```ts
import type { DemoDatabase, LocalDateTime } from '$lib/domain/types';
import { createSeedDatabase } from '$lib/demo-data/seed';

export type ScenarioId = 'standard' | 'new_family' | 'empty_today';
export type RatingVariant = 'inline' | 'panel';

export interface PrototypeSettings {
	userId: string;
	familyId: string;
	now: LocalDateTime;
	offline: boolean;
	ratingVariant: RatingVariant;
	scenario: ScenarioId;
}

export interface Persisted {
	version: 1;
	db: DemoDatabase;
	settings: PrototypeSettings;
}

export const STORAGE_KEY = 'app-famiglia-prototype-v1';

export function createInitial(): Persisted {
	return {
		version: 1,
		db: createSeedDatabase(),
		settings: {
			userId: 'user-federico',
			familyId: 'family-main',
			now: '2026-10-06T12:00',
			offline: false,
			ratingVariant: 'inline',
			scenario: 'standard'
		}
	};
}

function isPersisted(value: unknown): value is Persisted {
	const v = value as Persisted | null;
	return !!v && v.version === 1 && Array.isArray(v.db?.users) && Array.isArray(v.db?.weeks) && typeof v.settings?.userId === 'string';
}

export function loadPersisted(storage: Pick<Storage, 'getItem'> | null): Persisted {
	try {
		const raw = storage?.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (isPersisted(parsed)) return parsed;
		}
	} catch {
		// Private browsing, blocked storage or corrupt data: start from the seed.
	}
	return createInitial();
}

export function savePersisted(storage: Pick<Storage, 'setItem'> | null, value: Persisted): void {
	try {
		storage?.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// The prototype keeps working in memory when storage is unavailable.
	}
}
```

`prototype/src/lib/store/scenarios.ts`:

```ts
import { createInitial, type Persisted, type ScenarioId } from './persistence';

export function applyScenario(id: ScenarioId): Persisted {
	const state = createInitial();
	state.settings.scenario = id;
	if (id === 'new_family') {
		state.settings.familyId = 'family-grandparents';
	}
	if (id === 'empty_today') {
		const today = state.settings.now.slice(0, 10);
		for (const week of state.db.weeks) week.slots = week.slots.filter((slot) => slot.date !== today);
	}
	return state;
}
```

- [ ] **Passo 4: stato reattivo dell'app**

`prototype/src/lib/store/app.svelte.ts`:

```ts
import { browser } from '$app/environment';
import type { IsoDate, Locale } from '$lib/domain/types';
import type { MessageKey } from '$lib/i18n/messages';
import { translate, type MessageParams } from '$lib/i18n/translate';
import type { OperationContext } from '$lib/operations/context';
import { createInitial, loadPersisted, savePersisted, type Persisted, type ScenarioId } from './persistence';
import { applyScenario } from './scenarios';

function safeStorage(): Storage | null {
	try {
		return browser ? window.localStorage : null;
	} catch {
		return null;
	}
}

class AppState {
	#state = $state<Persisted>(loadPersisted(safeStorage()));
	/** Day chosen in the menu, kept while switching views (design.md, navigation). */
	selectedDate = $state<IsoDate | null>(null);

	get db() { return this.#state.db; }
	get settings() { return this.#state.settings; }
	get user() { return this.db.users.find((u) => u.id === this.settings.userId) ?? this.db.users[0]; }
	get family() { return this.db.families.find((f) => f.id === this.settings.familyId) ?? null; }
	get locale(): Locale { return this.user.locale; }
	get ctx(): OperationContext {
		return { userId: this.settings.userId, familyId: this.settings.familyId, channel: 'web', now: this.settings.now, offline: this.settings.offline };
	}

	t = (key: MessageKey, params?: MessageParams) => translate(this.locale, key, params);

	update(change: (state: Persisted) => void) {
		change(this.#state);
		this.#save();
	}

	switchUser(userId: string) {
		this.update((s) => {
			s.settings.userId = userId;
			const family = s.db.families.find((f) => f.members.some((m) => m.userId === userId));
			if (family) s.settings.familyId = family.id;
		});
		this.selectedDate = null;
	}

	reset() {
		this.#state = createInitial();
		this.selectedDate = null;
		this.#save();
	}

	setScenario(id: ScenarioId) {
		this.#state = applyScenario(id);
		this.selectedDate = null;
		this.#save();
	}

	#save() {
		savePersisted(safeStorage(), $state.snapshot(this.#state) as Persisted);
	}
}

export const app = new AppState();
```

`OperationContext` è definito nell'attività 7; per far passare il controllo dei tipi
ora, creare già `prototype/src/lib/operations/context.ts` con il contenuto del passo 1
dell'attività 7.

- [ ] **Passo 5: verifica e commit**

Run: `npx vitest run src/lib/store && npm run check` → Atteso: PASS, nessun errore.

```bash
git add prototype/src/lib
git commit -m "Prototipo: seed demo, persistenza tollerante e scenari"
```

---

### Attività 6: calendario e stati della settimana

**File:**
- Modifica: `prototype/src/lib/domain/calendar.ts`
- Crea: `prototype/src/lib/domain/calendar.test.ts`

**Interfacce:**
- Produce: `addDays`, `mondayOf(date)`, `MEAL_PAST_AT`, `isMealPast(date, mealType, now)`,
  `automaticCloseAt(startsOn)`, `weekStatus(week, now)`, `isWeekVisible(week, now)`,
  `weekDates(startsOn): IsoDate[]`.

- [ ] **Passo 1: test che falliscono**

`prototype/src/lib/domain/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, automaticCloseAt, isMealPast, isWeekVisible, mondayOf, weekDates, weekStatus } from './calendar';

const week = (closedAt: string | null = null) => ({ startsOn: '2026-10-05', closedAt, generatedAt: '2026-09-30T20:00' });

describe('dates', () => {
	it('adds days across months and finds Mondays', () => {
		expect(addDays('2026-09-28', 6)).toBe('2026-10-04');
		expect(mondayOf('2026-10-11')).toBe('2026-10-05');
		expect(mondayOf('2026-10-05')).toBe('2026-10-05');
		expect(weekDates('2026-10-05')).toHaveLength(7);
	});
});

describe('isMealPast', () => {
	it('lunch becomes past at 15:30 exactly', () => {
		expect(isMealPast('2026-10-06', 'lunch', '2026-10-06T15:29')).toBe(false);
		expect(isMealPast('2026-10-06', 'lunch', '2026-10-06T15:30')).toBe(true);
	});
	it('dinner becomes past at 23:00 exactly', () => {
		expect(isMealPast('2026-10-06', 'dinner', '2026-10-06T22:59')).toBe(false);
		expect(isMealPast('2026-10-06', 'dinner', '2026-10-06T23:00')).toBe(true);
	});
});

describe('weekStatus', () => {
	it('is draft before Monday', () => {
		expect(weekStatus(week(), '2026-10-04T23:59')).toBe('draft');
	});
	it('is in progress from Monday 00:00 to Sunday', () => {
		expect(weekStatus(week(), '2026-10-05T00:00')).toBe('in_progress');
		expect(weekStatus(week(), '2026-10-11T23:59')).toBe('in_progress');
	});
	it('is pending close from the next Monday until Wednesday 20:00', () => {
		expect(weekStatus(week(), '2026-10-12T00:00')).toBe('pending_close');
		expect(weekStatus(week(), '2026-10-14T19:59')).toBe('pending_close');
		expect(automaticCloseAt('2026-10-05')).toBe('2026-10-14T20:00');
		expect(weekStatus(week(), '2026-10-14T20:00')).toBe('closed');
	});
	it('is closed once closedAt has passed', () => {
		expect(weekStatus(week('2026-10-12T10:00'), '2026-10-12T10:00')).toBe('closed');
	});
});

describe('isWeekVisible', () => {
	it('hides weeks generated in the future', () => {
		const draft = { startsOn: '2026-10-12', closedAt: null, generatedAt: '2026-10-07T20:00' };
		expect(isWeekVisible(draft, '2026-10-07T19:59')).toBe(false);
		expect(isWeekVisible(draft, '2026-10-07T20:00')).toBe(true);
	});
});
```

Run: `npx vitest run src/lib/domain` → Atteso: FAIL.

- [ ] **Passo 2: implementazione**

`prototype/src/lib/domain/calendar.ts`:

```ts
import type { IsoDate, LocalDateTime, MealType, Week, WeekStatus } from './types';

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

/** Confirmed 2026-10-06 (spec section 5), family local time. */
export const MEAL_PAST_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
	return now >= `${date}T${MEAL_PAST_AT[mealType]}`;
}

/** The Wednesday job after the week closes it (spec section 4); simulated by the clock. */
export function automaticCloseAt(startsOn: IsoDate): LocalDateTime {
	return `${addDays(startsOn, 9)}T20:00`;
}

export function weekStatus(week: Pick<Week, 'startsOn' | 'closedAt'>, now: LocalDateTime): WeekStatus {
	if (week.closedAt !== null && week.closedAt <= now) return 'closed';
	if (now >= automaticCloseAt(week.startsOn)) return 'closed';
	const today = now.slice(0, 10);
	if (today < week.startsOn) return 'draft';
	if (today <= addDays(week.startsOn, 6)) return 'in_progress';
	return 'pending_close';
}

export function isWeekVisible(week: Pick<Week, 'generatedAt'>, now: LocalDateTime): boolean {
	return week.generatedAt <= now;
}
```

- [ ] **Passo 3: verifica e commit**

Run: `npx vitest run src/lib/domain src/lib/i18n` → Atteso: PASS.

```bash
git add prototype/src/lib/domain
git commit -m "Prototipo: stati della settimana e pasti passati"
```

---

### Attività 7: operazioni del Menu

**File:**
- Crea: `prototype/src/lib/operations/context.ts`, `access.ts`, `views.ts`, `meals.ts`,
  `meals.test.ts`

**Interfacce:**
- Consuma: tipi, calendario, `createInitial` (solo nei test).
- Produce:

```ts
// context.ts
export interface OperationContext { userId: string; familyId: string; channel: Channel; now: LocalDateTime; offline: boolean }
export type OpErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'offline' | 'not_allowed';
export type OpResult<T> = { ok: true; value: T } | { ok: false; error: OpErrorCode };
export const ok: <T>(value: T) => OpResult<T>;
export const fail: <T>(error: OpErrorCode) => OpResult<T>;

// views.ts
export interface RatingSummary { familyAverage: number | null; familyCount: number; myStars: number | null }
export interface RecipeSummary { id: string; name: string; description: string; translationMissing: boolean; photo: string | null; durationMinutes: number | null; sourceType: SourceType; sourceUrl: string | null; bookTitle: string | null; bookPages: string | null; mealType: RecipeMealType; proteinGroup: ProteinGroup | null }
export interface ScaledIngredient { ingredientId: string; name: string; quantity: Quantity; sourceText: string }
export interface MealView { slotId: string; date: IsoDate; mealType: MealType; kind: 'recipe' | 'free' | 'empty'; recipe: RecipeSummary | null; freeText: string | null; servings: number; ingredients: ScaledIngredient[] | null; note: string | null; isPast: boolean; cooked: boolean | null; canMarkNotCooked: boolean; canRate: boolean; rating: RatingSummary | null; lastChange: { userName: string | null; at: LocalDateTime } | null }
export interface DayView { date: IsoDate; meals: MealView[] }
export interface WeekView { startsOn: IsoDate; status: WeekStatus; days: DayView[]; previous: IsoDate | null; next: IsoDate | null; measurementSystem: MeasurementSystem }
export type OpeningTarget = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };

// access.ts
export function familyFor(db: DemoDatabase, ctx: OperationContext): Family | null; // null if not a member
export function localized(text: Translated, locale: Locale): { text: string; missing: boolean };
export function visibleRecipe(db: DemoDatabase, family: Family, recipeId: string): Recipe | null;
export function ratingSummary(db: DemoDatabase, family: Family, userId: string, recipeId: string): RatingSummary;
export function recipeSummary(db: DemoDatabase, recipe: Recipe, locale: Locale): RecipeSummary;
export function scaledIngredients(db: DemoDatabase, recipe: Recipe, servings: number, locale: Locale): ScaledIngredient[] | null;

// meals.ts
export function getOpeningTarget(db, ctx): OpResult<OpeningTarget>;
export function getWeekView(db, ctx, startsOn: IsoDate): OpResult<WeekView>;
export function setMealCooked(db, ctx, slotId: string, cooked: false | null): OpResult<MealView>;
export function pickSelectedDate(week: WeekView, preferred: IsoDate | null, opening: IsoDate | null): IsoDate;
```

`lastChange.userName` è `null` quando l'autore non è più membro: l'interfaccia mostra
"ex membro" (specifica, sezione 7).

- [ ] **Passo 1: contesto**

`prototype/src/lib/operations/context.ts`:

```ts
import type { Channel, LocalDateTime } from '$lib/domain/types';

/** Who is acting, on which family, through which channel. Shared shape for web and MCP. */
export interface OperationContext {
	userId: string;
	familyId: string;
	channel: Channel;
	now: LocalDateTime;
	offline: boolean;
}

export type OpErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'offline' | 'not_allowed';
export type OpResult<T> = { ok: true; value: T } | { ok: false; error: OpErrorCode };

export const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
export const fail = <T>(error: OpErrorCode): OpResult<T> => ({ ok: false, error });
```

- [ ] **Passo 2: test che falliscono**

`prototype/src/lib/operations/meals.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '$lib/store/persistence';
import type { DemoDatabase } from '$lib/domain/types';
import type { OperationContext } from './context';
import { getOpeningTarget, getWeekView, pickSelectedDate, setMealCooked } from './meals';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});

beforeEach(() => { db = createInitial().db; });

describe('getOpeningTarget', () => {
	it('opens on today when today has meals', () => {
		expect(getOpeningTarget(db, ctx())).toEqual({ ok: true, value: { kind: 'day', date: '2026-10-06', weekStartsOn: '2026-10-05' } });
	});
	it('opens on the next day with meals when today has none', () => {
		for (const w of db.weeks) w.slots = w.slots.filter((s) => s.date !== '2026-10-06');
		expect(getOpeningTarget(db, ctx())).toMatchObject({ ok: true, value: { date: '2026-10-07' } });
	});
	it('reports no weeks for a family without weeks', () => {
		expect(getOpeningTarget(db, ctx({ familyId: 'family-grandparents' }))).toEqual({ ok: true, value: { kind: 'no_weeks' } });
	});
	it('refuses a family the user does not belong to', () => {
		expect(getOpeningTarget(db, ctx({ userId: 'user-tom', familyId: 'family-grandparents' }))).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('getWeekView', () => {
	it('builds seven days with status and neighbours, hiding the not yet generated draft', () => {
		const view = getWeekView(db, ctx(), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		expect(view.value.status).toBe('in_progress');
		expect(view.value.days).toHaveLength(7);
		expect(view.value.previous).toBe('2026-09-28');
		expect(view.value.next).toBeNull();
	});
	it('shows the draft after Wednesday 20:00', () => {
		const view = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-05');
		expect(view.ok && view.value.next).toBe('2026-10-12');
		const draft = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-12');
		expect(draft.ok && draft.value.status).toBe('draft');
	});
	it('marks past meals, free meals, empty slots and last changes', () => {
		const view = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		const meals = view.value.days.flatMap((d) => d.meals);
		expect(meals.find((m) => m.slotId === '2026-10-06-lunch')?.isPast).toBe(true);
		expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.isPast).toBe(false);
		expect(meals.some((m) => m.kind === 'free')).toBe(true);
		expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.lastChange).toEqual({ userName: 'Anna', at: '2026-10-02T21:30' });
		const draft = getWeekView(db, ctx({ now: '2026-10-08T09:00' }), '2026-10-12');
		expect(draft.ok && draft.value.days.flatMap((d) => d.meals).filter((m) => m.kind === 'empty')).toHaveLength(1);
	});
	it('scales ingredients to the slot servings and localises names', () => {
		const view = getWeekView(db, ctx({ userId: 'user-tom' }), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		const meal = view.value.days[1].meals.find((m) => m.kind === 'recipe' && m.ingredients)!;
		const recipe = db.recipes.find((r) => r.id === meal.recipe!.id)!;
		const first = db.ingredients.find((i) => i.id === recipe.ingredients[0].ingredientId)!;
		expect(meal.ingredients![0].name).toBe(first.name['en-GB']);
		expect(meal.recipe!.name).toBe(recipe.name['en-GB']);
		expect(meal.recipe!.translationMissing).toBe(false);
		const line = recipe.ingredients[0].quantity;
		if (line.kind === 'amount') {
			expect(meal.ingredients![0].quantity).toEqual({ ...line, value: (line.value * meal.servings) / recipe.baseServings! });
		}
	});
	it('shows former members as null names', () => {
		db.families[0].members = db.families[0].members.filter((m) => m.userId !== 'user-anna');
		const view = getWeekView(db, ctx(), '2026-10-05');
		const meal = view.ok ? view.value.days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-08-lunch') : null;
		expect(meal?.lastChange?.userName).toBeNull();
	});
	it('closes the previous week automatically on Wednesday at 20:00 and treats unknown cooked as cooked', () => {
		const view = getWeekView(db, ctx({ now: '2026-10-07T20:00' }), '2026-09-28');
		if (!view.ok) throw new Error(view.error);
		expect(view.value.status).toBe('closed');
		expect(view.value.days.flatMap((d) => d.meals).filter((m) => m.kind === 'recipe').every((m) => m.cooked !== null)).toBe(true);
	});
});

describe('setMealCooked', () => {
	it('marks a past meal as not cooked in a week pending close and records the author', () => {
		const result = setMealCooked(db, ctx(), '2026-10-02-dinner', false);
		expect(result.ok && result.value.cooked).toBe(false);
		const slot = db.weeks.flatMap((w) => w.slots).find((s) => s.id === '2026-10-02-dinner')!;
		expect(slot).toMatchObject({ cooked: false, updatedBy: 'user-federico', updatedAt: '2026-10-06T12:00' });
	});
	it('refuses future meals, closed weeks and offline use', () => {
		expect(setMealCooked(db, ctx(), '2026-10-09-dinner', false)).toEqual({ ok: false, error: 'not_allowed' });
		expect(setMealCooked(db, ctx(), '2026-09-22-dinner', false)).toEqual({ ok: false, error: 'not_allowed' });
		expect(setMealCooked(db, ctx({ offline: true }), '2026-10-02-dinner', false)).toEqual({ ok: false, error: 'offline' });
	});
});

describe('pickSelectedDate', () => {
	it('keeps the preferred day only if it belongs to the week, else the opening day, else Monday', () => {
		const view = getWeekView(db, ctx(), '2026-10-05');
		if (!view.ok) throw new Error(view.error);
		expect(pickSelectedDate(view.value, '2026-10-09', '2026-10-06')).toBe('2026-10-09');
		expect(pickSelectedDate(view.value, '2026-09-30', '2026-10-06')).toBe('2026-10-06');
		expect(pickSelectedDate(view.value, '2026-09-30', '2026-09-30')).toBe('2026-10-05');
		expect(pickSelectedDate(view.value, null, null)).toBe('2026-10-05');
	});
});
```

Gli id degli slot usati nei test (`2026-10-02-dinner`, `2026-10-09-dinner`,
`2026-09-22-dinner`) devono esistere nei dati generati; se un giorno del menu di
origine non ha quel pasto, sostituire con uno slot con ricetta della stessa settimana
e dello stesso stato temporale, annotandolo nel commit.

Run: `npx vitest run src/lib/operations` → Atteso: FAIL.

- [ ] **Passo 3: accesso e viste**

`prototype/src/lib/operations/views.ts`: copiare esattamente le interfacce `views.ts`
dal blocco "Produce" di questa attività, con gli `import type` di `IsoDate`,
`LocalDateTime`, `MealType`, `MeasurementSystem`, `ProteinGroup`, `Quantity`,
`RecipeMealType`, `SourceType`, `WeekStatus` da `$lib/domain/types`.

`prototype/src/lib/operations/access.ts`:

```ts
import type { DemoDatabase, Family, Locale, Recipe, Translated } from '$lib/domain/types';
import { scaleQuantity } from '$lib/units/scale';
import type { OperationContext } from './context';
import type { RatingSummary, RecipeSummary, ScaledIngredient } from './views';

export function familyFor(db: DemoDatabase, ctx: OperationContext): Family | null {
	const family = db.families.find((f) => f.id === ctx.familyId);
	return family && family.members.some((m) => m.userId === ctx.userId) ? family : null;
}

export function localeOf(db: DemoDatabase, ctx: OperationContext): Locale {
	return db.users.find((u) => u.id === ctx.userId)?.locale ?? 'it-IT';
}

export function localized(text: Translated, locale: Locale): { text: string; missing: boolean } {
	const value = text[locale];
	return value ? { text: value, missing: false } : { text: text['it-IT'], missing: true };
}

/** Published recipes, excluding books the family does not own (spec section 3). */
export function visibleRecipe(db: DemoDatabase, family: Family, recipeId: string): Recipe | null {
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe || recipe.status !== 'published') return null;
	if (recipe.bookId && !family.bookIds.includes(recipe.bookId)) return null;
	return recipe;
}

export function ratingSummary(db: DemoDatabase, family: Family, userId: string, recipeId: string): RatingSummary {
	const memberIds = new Set(family.members.map((m) => m.userId));
	const ratings = db.ratings.filter((r) => r.recipeId === recipeId && memberIds.has(r.userId));
	const total = ratings.reduce((sum, r) => sum + r.stars, 0);
	return {
		familyAverage: ratings.length ? total / ratings.length : null,
		familyCount: ratings.length,
		myStars: ratings.find((r) => r.userId === userId)?.stars ?? null
	};
}

export function recipeSummary(db: DemoDatabase, recipe: Recipe, locale: Locale): RecipeSummary {
	const name = localized(recipe.name, locale);
	const description = localized(recipe.description, locale);
	return {
		id: recipe.id,
		name: name.text,
		description: description.text,
		translationMissing: name.missing || description.missing,
		photo: recipe.photo,
		durationMinutes: recipe.durationMinutes,
		sourceType: recipe.sourceType,
		sourceUrl: recipe.sourceUrl,
		bookTitle: db.books.find((b) => b.id === recipe.bookId)?.title ?? null,
		bookPages: recipe.bookPages,
		mealType: recipe.mealType,
		proteinGroup: recipe.proteinGroup
	};
}

export function scaledIngredients(db: DemoDatabase, recipe: Recipe, servings: number, locale: Locale): ScaledIngredient[] | null {
	if (!recipe.baseServings || recipe.ingredients.length === 0) return null;
	const base = recipe.baseServings;
	return recipe.ingredients.map((line) => {
		const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
		return {
			ingredientId: line.ingredientId,
			name: ingredient ? localized(ingredient.name, locale).text : line.ingredientId,
			quantity: scaleQuantity(line.quantity, servings, base),
			sourceText: line.sourceText
		};
	});
}
```

- [ ] **Passo 4: operazioni del Menu**

`prototype/src/lib/operations/meals.ts`:

```ts
import { isMealPast, isWeekVisible, mondayOf, weekDates, weekStatus } from '$lib/domain/calendar';
import type { DemoDatabase, Family, IsoDate, Locale, MealSlot, Week, WeekStatus } from '$lib/domain/types';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, localeOf, ratingSummary, recipeSummary, scaledIngredients, visibleRecipe } from './access';
import type { DayView, MealView, OpeningTarget, WeekView } from './views';

const MEAL_ORDER = { lunch: 0, dinner: 1 } as const;

function visibleWeeks(db: DemoDatabase, family: Family, ctx: OperationContext): Week[] {
	return db.weeks
		.filter((w) => w.familyId === family.id && isWeekVisible(w, ctx.now))
		.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

const hasContent = (slot: MealSlot) => slot.recipeId !== null || slot.freeText !== null;

export function getOpeningTarget(db: DemoDatabase, ctx: OperationContext): OpResult<OpeningTarget> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const weeks = visibleWeeks(db, family, ctx);
	if (weeks.length === 0) return ok({ kind: 'no_weeks' });
	const today = ctx.now.slice(0, 10);
	const dates = weeks
		.flatMap((w) => w.slots.filter(hasContent).map((s) => ({ date: s.date, weekStartsOn: w.startsOn })))
		.filter((d) => d.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date));
	if (dates.length > 0) return ok({ kind: 'day', ...dates[0] });
	const last = weeks[weeks.length - 1];
	return ok({ kind: 'day', date: last.startsOn, weekStartsOn: last.startsOn });
}

function mealView(db: DemoDatabase, family: Family, ctx: OperationContext, locale: Locale, slot: MealSlot, status: WeekStatus): MealView {
	const recipe = slot.recipeId ? db.recipes.find((r) => r.id === slot.recipeId) ?? null : null;
	const isPast = isMealPast(slot.date, slot.mealType, ctx.now);
	const kind = recipe ? 'recipe' : slot.freeText ? 'free' : 'empty';
	const cooked = kind === 'recipe' ? (slot.cooked ?? (status === 'closed' ? true : null)) : null;
	const author = slot.updatedBy && family.members.some((m) => m.userId === slot.updatedBy)
		? db.users.find((u) => u.id === slot.updatedBy)?.displayName ?? null
		: null;
	return {
		slotId: slot.id,
		date: slot.date,
		mealType: slot.mealType,
		kind,
		recipe: recipe ? recipeSummary(db, recipe, locale) : null,
		freeText: slot.freeText,
		servings: slot.servings,
		ingredients: recipe ? scaledIngredients(db, recipe, slot.servings, locale) : null,
		note: slot.note,
		isPast,
		cooked,
		canMarkNotCooked: kind === 'recipe' && isPast && (status === 'in_progress' || status === 'pending_close'),
		canRate: recipe ? visibleRecipe(db, family, recipe.id) !== null : false,
		rating: recipe ? ratingSummary(db, family, ctx.userId, recipe.id) : null,
		lastChange: slot.updatedBy && slot.updatedAt ? { userName: author, at: slot.updatedAt } : null
	};
}

export function getWeekView(db: DemoDatabase, ctx: OperationContext, startsOn: IsoDate): OpResult<WeekView> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const weeks = visibleWeeks(db, family, ctx);
	const index = weeks.findIndex((w) => w.startsOn === mondayOf(startsOn));
	if (index === -1) return fail('not_found');
	const week = weeks[index];
	const status = weekStatus(week, ctx.now);
	const locale = localeOf(db, ctx);
	const days: DayView[] = weekDates(week.startsOn).map((date) => ({
		date,
		meals: week.slots
			.filter((s) => s.date === date)
			.sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])
			.map((s) => mealView(db, family, ctx, locale, s, status))
	}));
	return ok({
		startsOn: week.startsOn,
		status,
		days,
		previous: weeks[index - 1]?.startsOn ?? null,
		next: weeks[index + 1]?.startsOn ?? null,
		measurementSystem: family.measurementSystem
	});
}

export function setMealCooked(db: DemoDatabase, ctx: OperationContext, slotId: string, cooked: false | null): OpResult<MealView> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const week = visibleWeeks(db, family, ctx).find((w) => w.slots.some((s) => s.id === slotId));
	const slot = week?.slots.find((s) => s.id === slotId);
	if (!week || !slot) return fail('not_found');
	const status = weekStatus(week, ctx.now);
	const view = mealView(db, family, ctx, localeOf(db, ctx), slot, status);
	if (!view.canMarkNotCooked) return fail('not_allowed');
	slot.cooked = cooked;
	slot.updatedBy = ctx.userId;
	slot.updatedAt = ctx.now;
	return ok(mealView(db, family, ctx, localeOf(db, ctx), slot, status));
}

export function pickSelectedDate(week: WeekView, preferred: IsoDate | null, opening: IsoDate | null): IsoDate {
	const dates = week.days.map((d) => d.date);
	if (preferred && dates.includes(preferred)) return preferred;
	if (opening && dates.includes(opening)) return opening;
	return week.startsOn;
}
```

- [ ] **Passo 5: verifica e commit**

Run: `npx vitest run && npm run check` → Atteso: PASS, nessun errore.

```bash
git add prototype/src/lib/operations
git commit -m "Prototipo: operazioni simulate del menu"
```

---

### Attività 8: struttura dell'app, navbar, pannello di prova e segnaposto

**File:**
- Crea: `prototype/src/lib/components/IconLibrary.svelte`, `BottomNav.svelte`,
  `DevPanel.svelte`, `OfflineBanner.svelte`, `StateNotice.svelte`,
  `prototype/src/routes/shopping/+page.svelte`, `prototype/src/routes/you/+page.svelte`
- Modifica: `prototype/src/routes/+layout.svelte`

**Interfacce:**
- Consuma: `app` (attività 5), `translate`.
- Produce: icone `#icon-arrow #icon-clock #icon-calendar #icon-book #icon-bag
  #icon-user #icon-star #icon-chevron-left #icon-chevron-right #icon-tools`;
  `StateNotice` con props `{ title: string; body?: string; children?: Snippet }`.

- [ ] **Passo 1: icone**

`IconLibrary.svelte`: le cinque `<symbol>` delle righe 161–165 di `design/index.html`,
più:

```svelte
<svg class="symbol-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
	<!-- righe 161–165 di design/index.html qui, invariate -->
	<symbol id="icon-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></symbol>
	<symbol id="icon-star" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/></symbol>
	<symbol id="icon-chevron-left" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></symbol>
	<symbol id="icon-chevron-right" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></symbol>
	<symbol id="icon-tools" viewBox="0 0 24 24"><path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2Z"/></symbol>
</svg>
```

- [ ] **Passo 2: navbar a quattro voci**

`BottomNav.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { app } from '$lib/store/app.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const items: { href: string; icon: string; label: MessageKey }[] = [
		{ href: '/menu', icon: 'calendar', label: 'nav.menu' },
		{ href: '/recipes', icon: 'book', label: 'nav.recipes' },
		{ href: '/shopping', icon: 'bag', label: 'nav.shopping' },
		{ href: '/you', icon: 'user', label: 'nav.you' }
	];
	const current = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<nav class="bottom-navigation" aria-label={app.t('nav.main')}>
	{#each items as item (item.href)}
		<a class="navigation-item" href={item.href} aria-current={current(item.href) ? 'page' : undefined}>
			<span class="navigation-icon"><svg class="icon" aria-hidden="true"><use href="#icon-{item.icon}" /></svg></span>
			<span>{app.t(item.label)}</span>
		</a>
	{/each}
</nav>
```

- [ ] **Passo 3: avvisi di stato e offline**

`StateNotice.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, body, children }: { title: string; body?: string; children?: Snippet } = $props();
</script>

<section class="state-notice" role="status">
	<h2>{title}</h2>
	{#if body}<p>{body}</p>{/if}
	{@render children?.()}
</section>

<style>
	.state-notice { margin: 16px 0; padding: 20px; background: var(--paper); box-shadow: var(--card-shadow); }
	h2 { margin: 0 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	p { margin: 0 0 16px; color: var(--body-text); }
</style>
```

`OfflineBanner.svelte`:

```svelte
<script lang="ts">
	import { app } from '$lib/store/app.svelte';
</script>

{#if app.settings.offline}
	<p class="offline-banner" role="status">{app.t('offline.banner')}</p>
{/if}

<style>
	.offline-banner { margin: 0; padding: 10px 16px; color: var(--ink); background: var(--rule); font-size: 0.875rem; font-weight: 700; }
</style>
```

- [ ] **Passo 4: pannello di prova**

`DevPanel.svelte`:

```svelte
<script lang="ts">
	import { app } from '$lib/store/app.svelte';
	import { LOCALES, type Locale, type MeasurementSystem } from '$lib/domain/types';
	import type { RatingVariant, ScenarioId } from '$lib/store/persistence';

	let dialog: HTMLDialogElement;
	let scenario = $state<ScenarioId>(app.settings.scenario);
	const scenarios: ScenarioId[] = ['standard', 'new_family', 'empty_today'];
	const userFamilies = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
</script>

<button class="dev-toggle" type="button" onclick={() => dialog.showModal()}>
	<svg class="icon" aria-hidden="true"><use href="#icon-tools" /></svg>{app.t('dev.open')}
</button>

<dialog class="dev-panel" bind:this={dialog} aria-labelledby="dev-title">
	<header>
		<h2 id="dev-title">{app.t('dev.title')}</h2>
		<button type="button" class="text-button" onclick={() => dialog.close()}>{app.t('common.close')}</button>
	</header>
	<p class="meta-line">{app.t('dev.disclaimer')}</p>

	<label>{app.t('dev.user')}
		<select value={app.user.id} onchange={(e) => app.switchUser(e.currentTarget.value)}>
			{#each app.db.users as user (user.id)}<option value={user.id}>{user.displayName} ({user.globalRoles.join(', ') || '—'})</option>{/each}
		</select>
	</label>
	<label>{app.t('dev.family')}
		<select value={app.settings.familyId} onchange={(e) => { const id = e.currentTarget.value; app.update((s) => (s.settings.familyId = id)); app.selectedDate = null; }}>
			{#each userFamilies as family (family.id)}<option value={family.id}>{family.name}</option>{/each}
		</select>
	</label>
	<label>{app.t('dev.language')}
		<select value={app.locale} onchange={(e) => { const locale = e.currentTarget.value as Locale; app.update((s) => { const u = s.db.users.find((x) => x.id === s.settings.userId); if (u) u.locale = locale; }); }}>
			{#each LOCALES as locale (locale)}<option value={locale}>{locale}</option>{/each}
		</select>
	</label>
	{#if app.family}
		<label>{app.t('dev.units')}
			<select value={app.family.measurementSystem} onchange={(e) => { const system = e.currentTarget.value as MeasurementSystem; app.update((s) => { const f = s.db.families.find((x) => x.id === s.settings.familyId); if (f) f.measurementSystem = system; }); }}>
				<option value="metric">{app.t('dev.units.metric')}</option>
				<option value="uk_imperial">{app.t('dev.units.uk_imperial')}</option>
			</select>
		</label>
	{/if}
	<label>{app.t('dev.now')}
		<input type="datetime-local" value={app.settings.now} onchange={(e) => { const now = e.currentTarget.value.slice(0, 16); if (now) app.update((s) => (s.settings.now = now)); }} />
	</label>
	<div class="row">
		<label>{app.t('dev.scenario')}
			<select bind:value={scenario}>
				{#each scenarios as id (id)}<option value={id}>{app.t(`dev.scenario.${id}`)}</option>{/each}
			</select>
		</label>
		<button type="button" class="text-button" onclick={() => app.setScenario(scenario)}>{app.t('dev.applyScenario')}</button>
	</div>
	<label class="check"><input type="checkbox" checked={app.settings.offline} onchange={(e) => { const offline = e.currentTarget.checked; app.update((s) => (s.settings.offline = offline)); }} />{app.t('dev.offline')}</label>
	<fieldset>
		<legend>{app.t('dev.ratingVariant')}</legend>
		{#each ['inline', 'panel'] as const as variant (variant)}
			<label class="check"><input type="radio" name="rating-variant" value={variant} checked={app.settings.ratingVariant === variant} onchange={() => app.update((s) => (s.settings.ratingVariant = variant as RatingVariant))} />{app.t(`dev.ratingVariant.${variant}`)}</label>
		{/each}
	</fieldset>
	<p class="meta-line">{app.t('dev.demoData')}</p>
	<button type="button" class="text-button" onclick={() => app.reset()}>{app.t('dev.reset')}</button>
</dialog>

<style>
	.dev-toggle { position: fixed; top: max(8px, env(safe-area-inset-top)); right: 8px; z-index: 20; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 4px 10px; border: 1px dashed var(--ink); border-radius: 8px; background: #fff8d6; color: var(--ink); font: 700 0.75rem/1.3 var(--text-font); opacity: 0.85; cursor: pointer; }
	.dev-toggle .icon { width: 14px; height: 14px; }
	.dev-panel { width: min(100% - 32px, 420px); max-height: calc(100dvh - 32px); padding: 20px; border: 2px dashed var(--ink); border-radius: 8px; background: #fffdf2; }
	.dev-panel::backdrop { background: rgb(0 0 0 / 30%); }
	header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	h2 { margin: 0; font: 400 1.25rem/1.3 var(--heading-font); }
	label, fieldset { display: grid; gap: 4px; margin: 0 0 14px; font-size: 0.875rem; font-weight: 700; }
	fieldset { border: 0; padding: 0; }
	select, input[type='datetime-local'] { min-height: 44px; padding: 8px; border: 1px solid var(--ink); border-radius: 8px; background: #fff; font-weight: 400; }
	.check { display: flex; align-items: center; gap: 8px; font-weight: 400; min-height: 44px; }
	.row { display: flex; align-items: end; gap: 8px; }
	.row label { flex: 1; margin: 0; }
</style>
```

Il pulsante in alto a destra non deve coprire il selettore dei giorni: nell'attività 9
il `.day-navigation` riserva 40 px a destra nella riga dell'intestazione della
settimana, dove il pulsante si appoggia.

- [ ] **Passo 5: layout completo e segnaposto**

`prototype/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import '$lib/design/tokens.css';
	import '$lib/design/fonts.css';
	import '$lib/design/global.css';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import DevPanel from '$lib/components/DevPanel.svelte';
	import IconLibrary from '$lib/components/IconLibrary.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import { app } from '$lib/store/app.svelte';

	let { children } = $props();

	$effect(() => {
		document.documentElement.lang = app.locale === 'it-IT' ? 'it' : 'en-GB';
	});
</script>

<IconLibrary />
<a class="skip-link" href="#app-content">{app.t('skip')}</a>
<div class="shell">
	<OfflineBanner />
	<main class="app-content" id="app-content" tabindex="-1">{@render children()}</main>
	<BottomNav />
</div>
<DevPanel />
```

`prototype/src/routes/shopping/+page.svelte`:

```svelte
<script lang="ts">
	import StateNotice from '$lib/components/StateNotice.svelte';
	import { app } from '$lib/store/app.svelte';
</script>

<section class="secondary-view app-view">
	<StateNotice title={app.t('shopping.title')} body={app.t('common.comingSoon')} />
</section>
```

`prototype/src/routes/you/+page.svelte`:

```svelte
<script lang="ts">
	import { app } from '$lib/store/app.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	const destinations = $derived(
		[
			['you.dest.family', true],
			['you.dest.preferences', true],
			['you.dest.curation', app.user.globalRoles.includes('recipe_curator')],
			['you.dest.admin', app.user.globalRoles.includes('app_admin')],
			['you.dest.mcp', true]
		].filter(([, visible]) => visible).map(([key]) => key as MessageKey)
	);
</script>

<section class="secondary-view app-view you">
	<h1 class="page-title">{app.user.displayName}</h1>
	<h2>{app.t('you.families')}</h2>
	<ul>
		{#each families as family (family.id)}
			{@const role = family.members.find((m) => m.userId === app.user.id)!.role}
			<li><span>{family.name}</span><span class="label-chip neutral">{app.t(`you.role.${role}`)}</span></li>
		{/each}
	</ul>
	<h2>{app.t('you.next')}</h2>
	<ul>
		{#each destinations as key (key)}
			<li><span>{app.t(key)}</span><span class="meta-line">{app.t('common.comingSoon')}</span></li>
		{/each}
	</ul>
</section>

<style>
	.you { padding-top: max(20px, env(safe-area-inset-top)); }
	h2 { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	ul { margin: 0; padding: 0; list-style: none; background: var(--paper); box-shadow: var(--card-shadow); }
	li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; padding: 12px 16px; border-bottom: 1px solid var(--rule); }
	li:last-child { border-bottom: 0; }
</style>
```

- [ ] **Passo 6: verifica e commit**

Run: `npm run check && npm run build` → Atteso: nessun errore.
Run: `npm run dev -- --port 5173` e aprire con agent-browser `/you` e `/shopping`:
navbar con 4 voci, voce attiva verde, pannello di prova apribile, cambio lingua che
traduce navbar e pagine.

```bash
git add prototype/src
git commit -m "Prototipo: struttura dell'app, navbar a quattro voci e pannello di prova"
```

---

### Attività 9: vista Menu

**File:**
- Crea: `prototype/src/lib/components/WeekHeader.svelte`, `DaySelector.svelte`,
  `MealCard.svelte`, `IngredientList.svelte`
- Modifica: `prototype/src/routes/menu/+page.svelte`

**Interfacce:**
- Consuma: `getOpeningTarget`, `getWeekView`, `setMealCooked`, `pickSelectedDate`
  (attività 7); `formatQuantity` (attività 3); formati di data (attività 2); `app`.
- Produce: `MealCard` con props
  `{ meal: MealView; system: MeasurementSystem; rating?: Snippet<[MealView]>; onToggleCooked?: (meal: MealView) => void }`
  (lo snippet `rating` viene riempito nell'attività 12; finché manca, la scheda mostra il
  riepilogo testuale del voto); `IngredientList` con props
  `{ ingredients: ScaledIngredient[]; system: MeasurementSystem; label: string; collapsible?: boolean }`.

- [ ] **Passo 1: lista degli ingredienti**

`IngredientList.svelte`:

```svelte
<script lang="ts">
	import type { MeasurementSystem } from '$lib/domain/types';
	import type { ScaledIngredient } from '$lib/operations/views';
	import { formatQuantity } from '$lib/units/format';
	import { app } from '$lib/store/app.svelte';

	let { ingredients, system, label, collapsible = true }: { ingredients: ScaledIngredient[]; system: MeasurementSystem; label: string; collapsible?: boolean } = $props();
</script>

{#snippet rows()}
	<ul class="ingredient-list">
		{#each ingredients as item (item.ingredientId)}
			<li><span>{item.name}</span><span class="ingredient-quantity">{formatQuantity(item.quantity, item.sourceText, system, app.locale)}</span></li>
		{/each}
	</ul>
{/snippet}

{#if collapsible}
	<details class="ingredients">
		<summary aria-label="{app.t('meal.ingredients')}: {label}">{app.t('meal.ingredients')}<span class="ingredient-count">({ingredients.length})</span></summary>
		{@render rows()}
	</details>
{:else}
	{@render rows()}
{/if}
```

- [ ] **Passo 2: scheda del pasto**

`MealCard.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MeasurementSystem } from '$lib/domain/types';
	import type { MealView } from '$lib/operations/views';
	import { formatAverage, formatChangeTime } from '$lib/i18n/dates';
	import { app } from '$lib/store/app.svelte';
	import IngredientList from './IngredientList.svelte';

	let { meal, system, rating, onToggleCooked }: { meal: MealView; system: MeasurementSystem; rating?: Snippet<[MealView]>; onToggleCooked?: (meal: MealView) => void } = $props();

	const headingId = $derived(`meal-${meal.slotId}`);
	const recipe = $derived(meal.recipe);
	const sourceLine = $derived.by(() => {
		if (!recipe) return null;
		if (recipe.sourceType === 'book' && recipe.bookTitle) return app.t('source.book', { title: recipe.bookTitle, pages: recipe.bookPages ?? '—' });
		if (recipe.sourceType === 'youtube') return app.t('source.youtube');
		if (recipe.sourceUrl) return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '');
		return app.t('source.home');
	});
	const ratingText = $derived.by(() => {
		const r = meal.rating;
		if (!r) return '';
		const family = r.familyAverage === null ? app.t('rating.none') : `★ ${formatAverage(app.locale, r.familyAverage)} · ${r.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: r.familyCount })}`;
		return r.myStars === null ? `${family} · ${app.t('rating.notRated')}` : `${family} · ${app.t('rating.you', { stars: r.myStars })}`;
	});
</script>

<article class="meal" class:meal-free={meal.kind !== 'recipe'} class:is-past={meal.isPast} aria-labelledby={headingId}>
	{#snippet label()}<span class="meal-label">{app.t(`meal.${meal.mealType}`)}</span>{/snippet}

	{#if recipe?.photo}
		<div class="meal-media"><img class="meal-photo" src={recipe.photo} alt="" loading="lazy" decoding="async" />{@render label()}</div>
	{:else}
		<div class="meal-heading">{@render label()}</div>
	{/if}

	<div class="meal-content">
		<div class="status-row">
			{#if meal.isPast}<span class="label-chip neutral">{app.t('meal.past')}</span>{/if}
			{#if meal.cooked === false}<span class="label-chip neutral">{app.t('meal.notCooked')}</span>{/if}
		</div>

		{#if meal.kind === 'free'}
			<span class="free-mark">{app.t('meal.free')}</span>
			<h3 id={headingId}>{meal.freeText}</h3>
		{:else if meal.kind === 'empty'}
			<h3 id={headingId}>{app.t('meal.empty.title')}</h3>
			<p class="description">{app.t('meal.empty.body')}</p>
		{:else if recipe}
			<h3 id={headingId}>
				{#if recipe.sourceUrl}
					<a class="recipe-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{recipe.name} <svg class="icon" aria-hidden="true"><use href="#icon-arrow" /></svg><span class="visually-hidden">({app.t('source.open')})</span></a>
				{:else}{recipe.name}{/if}
			</h3>
			{#if recipe.translationMissing}<p class="meta-line">({app.t('meal.translationMissing')})</p>{/if}
			<p class="description">{recipe.description}</p>
			<p class="meal-meta">
				{#if recipe.durationMinutes}<svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{app.t('meal.minutes', { count: recipe.durationMinutes })} · {/if}{app.t('meal.servings', { count: meal.servings })}
			</p>
			{#if sourceLine}<p class="meal-source">{sourceLine}</p>{/if}
			{#if rating}{@render rating(meal)}{:else}<p class="meta-line rating-text">{ratingText}</p>{/if}
			<p><a class="link-inline" href="/recipes/{recipe.id}?from=menu&day={meal.date}">{app.t('meal.details')}</a></p>
		{/if}

		{#if meal.lastChange}
			<p class="meta-line">{app.t('meal.changedBy', { name: meal.lastChange.userName ?? app.t('meal.formerMember'), time: formatChangeTime(app.locale, meal.lastChange.at) })}</p>
		{/if}
		{#if meal.note}<p class="meta-line"><strong>{app.t('meal.note')}:</strong> {meal.note}</p>{/if}
		{#if meal.canMarkNotCooked && onToggleCooked}
			<p><button type="button" class="text-button" disabled={app.settings.offline} onclick={() => onToggleCooked(meal)}>{meal.cooked === false ? app.t('meal.undoNotCooked') : app.t('meal.markNotCooked')}</button></p>
		{/if}

		{#if meal.kind === 'recipe' && recipe}
			{#if meal.ingredients}
				<IngredientList ingredients={meal.ingredients} {system} label={recipe.name} />
			{:else}
				<p class="meta-line">{app.t('meal.ingredientsMissing')}</p>
			{/if}
		{/if}
	</div>
</article>

<style>
	.status-row { display: flex; flex-wrap: wrap; gap: 6px; }
	.status-row:not(:empty) { margin-bottom: 12px; }
	.is-past .meal-photo { filter: grayscale(0.4); opacity: 0.85; }
	.rating-text { color: var(--ink); }
</style>
```

- [ ] **Passo 3: intestazione della settimana e selettore dei giorni**

`WeekHeader.svelte`:

```svelte
<script lang="ts">
	import { addDays } from '$lib/domain/calendar';
	import type { WeekView } from '$lib/operations/views';
	import { formatDayLong, formatWeekRange } from '$lib/i18n/dates';
	import { app } from '$lib/store/app.svelte';

	let { week, onNavigate }: { week: WeekView; onNavigate: (startsOn: string) => void } = $props();

	const hint = $derived.by(() => {
		if (week.status === 'draft') return app.t('week.hint.draft', { date: formatDayLong(app.locale, addDays(week.startsOn, -1)) });
		if (week.status === 'pending_close') return app.t('week.hint.pending_close', { date: formatDayLong(app.locale, addDays(week.startsOn, 9)) });
		return app.t(`week.hint.${week.status}`);
	});
</script>

<div class="week-header">
	<button type="button" class="week-nav" disabled={!week.previous} aria-label={app.t('menu.previousWeek')} onclick={() => week.previous && onNavigate(week.previous)}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg></button>
	<div class="week-title">
		<strong>{formatWeekRange(app.locale, week.startsOn)}</strong>
		<span class="label-chip" class:neutral={week.status === 'closed'}>{app.t(`week.status.${week.status}`)}</span>
	</div>
	<button type="button" class="week-nav" disabled={!week.next} aria-label={app.t('menu.nextWeek')} onclick={() => week.next && onNavigate(week.next)}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></button>
</div>
<p class="week-hint">{hint}</p>

<style>
	.week-header { display: flex; align-items: center; gap: 8px; margin: 0 72px 8px 0; }
	.week-title { flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
	.week-nav { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); cursor: pointer; }
	.week-nav:disabled { opacity: 0.3; cursor: not-allowed; }
	.week-hint { margin: 0 0 10px; color: var(--muted); font-size: 0.8125rem; text-align: center; }
</style>
```

`DaySelector.svelte`:

```svelte
<script lang="ts">
	import type { IsoDate } from '$lib/domain/types';
	import { formatDayLong, formatDayNumber, formatDayShort } from '$lib/i18n/dates';
	import { app } from '$lib/store/app.svelte';

	let { dates, selected, onSelect }: { dates: IsoDate[]; selected: IsoDate; onSelect: (date: IsoDate) => void } = $props();
</script>

<div class="day-links">
	{#each dates as date (date)}
		<a class="day-link" href="#day-{date}" aria-current={date === selected ? 'location' : undefined} aria-label={formatDayLong(app.locale, date)} onclick={(e) => { e.preventDefault(); onSelect(date); }}>
			<span>{formatDayShort(app.locale, date)}</span><strong>{formatDayNumber(app.locale, date)}</strong>
		</a>
	{/each}
</div>
```

- [ ] **Passo 4: pagina Menu**

`prototype/src/routes/menu/+page.svelte`:

```svelte
<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import DaySelector from '$lib/components/DaySelector.svelte';
	import MealCard from '$lib/components/MealCard.svelte';
	import StateNotice from '$lib/components/StateNotice.svelte';
	import WeekHeader from '$lib/components/WeekHeader.svelte';
	import { formatDayLong } from '$lib/i18n/dates';
	import type { MessageKey } from '$lib/i18n/messages';
	import { getOpeningTarget, getWeekView, pickSelectedDate, setMealCooked } from '$lib/operations/meals';
	import type { MealView } from '$lib/operations/views';
	import { app } from '$lib/store/app.svelte';

	let track: HTMLDivElement | undefined = $state();
	let actionError = $state<MessageKey | null>(null);
	let simulatedNotice = $state(false);

	const opening = $derived(getOpeningTarget(app.db, app.ctx));
	const openingDay = $derived(opening.ok && opening.value.kind === 'day' ? opening.value : null);
	const weekParam = $derived(page.url.searchParams.get('week'));
	const dayParam = $derived(page.url.searchParams.get('day'));
	const weekResult = $derived(openingDay ? getWeekView(app.db, app.ctx, weekParam ?? dayParam ?? app.selectedDate ?? openingDay.weekStartsOn) : null);
	const week = $derived(weekResult?.ok ? weekResult.value : null);
	const selected = $derived(week ? pickSelectedDate(week, dayParam ?? app.selectedDate, openingDay?.date ?? null) : null);

	function scrollToDate(date: string, behavior: ScrollBehavior) {
		track?.querySelector(`#day-${date}`)?.scrollIntoView({ behavior, inline: 'start', block: 'nearest' });
	}

	function select(date: string) {
		app.selectedDate = date;
		scrollToDate(date, 'smooth');
	}

	// Debounced instead of `scrollend`, which older iOS Safari versions do not fire.
	let scrollTimer: ReturnType<typeof setTimeout> | undefined;
	function onScroll() {
		clearTimeout(scrollTimer);
		scrollTimer = setTimeout(() => {
			if (!track || !week) return;
			const day = week.days[Math.round(track.scrollLeft / track.clientWidth)];
			if (day && day.date !== app.selectedDate) app.selectedDate = day.date;
		}, 120);
	}

	function navigateWeek(startsOn: string) {
		app.selectedDate = null;
		goto(`/menu?week=${startsOn}`, { keepFocus: true, noScroll: true });
	}

	function toggleCooked(meal: MealView) {
		const result = setMealCooked(app.db, app.ctx, meal.slotId, meal.cooked === false ? null : false);
		actionError = result.ok ? null : (`error.${result.error === 'not_allowed' ? 'notAllowed' : result.error === 'not_found' ? 'notFound' : result.error}` as MessageKey);
		if (result.ok) app.update(() => {});
	}

	$effect(() => {
		if (!week || !selected) return;
		const target = selected;
		tick().then(() => scrollToDate(target, 'instant'));
	});
</script>

{#if !opening.ok}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.forbidden')} /></section>
{:else if opening.value.kind === 'no_weeks'}
	<section class="secondary-view app-view">
		<StateNotice title={app.t('menu.noWeeks.title')} body={app.t('menu.noWeeks.body')}>
			<button type="button" class="text-button primary" onclick={() => (simulatedNotice = true)}>{app.t('menu.noWeeks.action')}</button>
			{#if simulatedNotice}<p class="meta-line" role="status">{app.t('menu.noWeeks.simulated')}</p>{/if}
		</StateNotice>
	</section>
{:else if week && selected}
	<section class="calendar app-view" aria-label={app.t('nav.menu')}>
		<nav class="day-navigation" aria-label={app.t('menu.days')}>
			<WeekHeader {week} onNavigate={navigateWeek} />
			<DaySelector dates={week.days.map((d) => d.date)} {selected} onSelect={select} />
			{#if actionError}<p class="meta-line" role="alert">{app.t(actionError)}</p>{/if}
		</nav>
		<div class="week-track" bind:this={track} tabindex="0" role="region" aria-label={app.t('menu.week')} onscroll={onScroll}>
			{#each week.days as day (day.date)}
				<section class="day" id="day-{day.date}" aria-labelledby="heading-{day.date}">
					<h2 class="day-title visually-hidden" id="heading-{day.date}">{formatDayLong(app.locale, day.date)}</h2>
					{#each day.meals as meal (meal.slotId)}
						<MealCard {meal} system={week.measurementSystem} onToggleCooked={toggleCooked} />
					{:else}
						<StateNotice title={app.t('menu.dayEmpty')} />
					{/each}
				</section>
			{/each}
		</div>
	</section>
{:else}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.notFound')} /></section>
{/if}
```

Nota: `setMealCooked` muta il proxy `$state` di `app.db`, quindi la vista si aggiorna;
`app.update(() => {})` serve solo a salvare in `localStorage`.

- [ ] **Passo 5: verifica nel browser**

Run: `npm run dev -- --port 5173`. Con agent-browser a 390 px:

1. `/menu` apre martedì 6 ottobre, settimana 5–11 ott "In corso".
2. Con la data simulata a `2026-10-06T16:00` il pranzo del 6 mostra "Passato" e il
   pulsante "Segna come non cucinato"; premendolo compaiono "Non cucinato" e "Cambiato da
   Federico, martedì 16:00".
3. Freccia "Settimana precedente": 28 set–4 ott "Da chiudere" con l'indicazione di
   mercoledì 7 ottobre.
4. Data simulata `2026-10-08T09:00`: la freccia successiva porta alla bozza 12–18 ott,
   con lo slot "Nessuna ricetta adatta" mercoledì sera.
5. Scenario "Famiglia nuova": invito a generare la prima settimana e messaggio
   simulato. Scenario "Oggi senza pasti": apertura su mercoledì 7.
6. Unità imperiali: le quantità in grammi diventano oz/lb; utente Tom: testi inglesi.
7. Offline: banner visibile, pulsante "non cucinato" disabilitato.
8. Scorrimento laterale: aggiorna il giorno attivo; il tocco sul giorno scorre alla
   colonna.

- [ ] **Passo 6: commit**

```bash
git add prototype/src
git commit -m "Prototipo: vista Menu con stati della settimana e schede dei pasti"
```

---

### Attività 10: tappa intermedia — verifica, documenti, controllo dell'utente

**File:**
- Modifica: `design/percorsi.md`, questo piano (caselle)

- [ ] **Passo 1: verifica automatica**

Run: `cd prototype && npx vitest run && npm run check && npm run build`
Atteso: tutto verde.

- [ ] **Passo 2: verifica visiva**

Con agent-browser, screenshot di `/menu` a 320, 390 e 1440 px in italiano e in inglese
(utente Tom), confrontati con `design/index.html` e
`design/references/hellofresh/preview-mobile.png`: font caricati, foto 16:9, etichette
Pranzo/Cena, giorno attivo scuro, navbar che non copre il contenuto, titoli lunghi a
capo senza troncamenti, pulsante "Prova" che non copre il selettore. Correggere le
differenze prima di proseguire.

- [ ] **Passo 3: pubblicazione sulla rete locale**

Run (in background): `npm run preview:lan`. Ricavare l'IP con
`ipconfig getifaddr en0` e comunicare l'indirizzo `http://<ip>:8766/menu`.

- [ ] **Passo 4: documento dei percorsi**

In `design/percorsi.md`: giro 1 "In corso — tappa intermedia"; aggiungere sotto
"Giro 1" il paragrafo "Dati dimostrativi" con le regole dei dati dell'attività 4 e i
limiti noti: testi inglesi del catalogo dimostrativi; quantità non numeriche mostrate
come nella fonte italiana anche in inglese; fattori imperiali provvisori; titolo della
scheda collegato alla fonte come nel riferimento approvato, con il link "Scheda
ricetta" separato.

- [ ] **Passo 5: commit e STOP**

```bash
git add design/percorsi.md progetto/superpowers/plans/2026-10-06-prototipo-giro-1.md
git commit -m "Prototipo: tappa intermedia del giro 1"
```

Fermarsi e chiedere all'utente il controllo veloce su struttura, stati della settimana
e strumenti di prova. Riportare le osservazioni nel piano ("Esito della tappa
intermedia") prima dell'attività 11.

---

### Attività 10b: adeguamenti dopo la tappa intermedia

Approvata dall'utente il 6 ottobre 2026. Specifica, `design.md` e `percorsi.md` sono
già aggiornati.

- [ ] Test prima: in `calendar.test.ts` tolti i test di `weekStatus` e
  `automaticCloseAt`; in `meals.test.ts` vista settimana senza `status`, `previous`,
  `next`; "non cucinato" possibile su un pasto passato di una settimana di settembre e
  rifiutato su un pasto futuro; un pasto passato con `cooked` null vale cucinato; nuova
  `getMenuDates(db, ctx): OpResult<IsoDate[]>` con i soli giorni che hanno slot,
  ordinati, escluse le settimane non ancora generate.
- [ ] Codice: `calendar.ts` senza stati e chiusura; `WeekView` senza `status`,
  `previous`, `next`; `Week.closedAt` rimosso da tipi, script e dati; `getMenuDates`;
  rimossi `WeekHeader`, chip "Passato" e chiavi di testo inutilizzate; nuovo
  `DatePicker.svelte` (icona calendario accanto ai sette giorni, mese navigabile, solo
  giorni con menu selezionabili, giorno scelto scuro); navbar a tre voci e rimozione di
  `/shopping`; pulsante "Prova" in basso a destra sopra la navbar.
- [ ] Verifica: vitest, check, build, browser a 320, 390 e 1440 px; nuova anteprima
  sulla rete locale; commit.

### Attività 11: operazioni del Ricettario e dei voti

**File:**
- Crea: `prototype/src/lib/operations/recipes.ts`, `recipes.test.ts`

**Interfacce:**
- Consuma: `access.ts`, `views.ts`, `context.ts` (attività 7).
- Produce:

```ts
export interface RecipeQuery { text?: string; mealType?: MealType; maxMinutes?: number; proteinGroup?: ProteinGroup; minStars?: number }
export interface RecipeListItem { recipe: RecipeSummary; rating: RatingSummary }
export interface RecipeDetail { recipe: RecipeSummary; baseServings: number; servings: number; ingredients: ScaledIngredient[]; rating: RatingSummary; history: { date: IsoDate; mealType: MealType }[]; measurementSystem: MeasurementSystem }
export function normalizeForSearch(text: string): string;
export function searchRecipes(db, ctx, query: RecipeQuery): OpResult<RecipeListItem[]>;
export function getRecipeDetail(db, ctx, recipeId: string, servings?: number): OpResult<RecipeDetail>;
export function rateRecipe(db, ctx, recipeId: string, stars: number | null): OpResult<RatingSummary>;
```

- [ ] **Passo 1: test che falliscono**

`prototype/src/lib/operations/recipes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '$lib/store/persistence';
import type { DemoDatabase } from '$lib/domain/types';
import type { OperationContext } from './context';
import { getRecipeDetail, normalizeForSearch, rateRecipe, searchRecipes } from './recipes';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const ids = (result: ReturnType<typeof searchRecipes>) => (result.ok ? result.value.map((i) => i.recipe.id) : []);

beforeEach(() => { db = createInitial().db; });

describe('normalizeForSearch', () => {
	it('ignores case and accents', () => {
		expect(normalizeForSearch('Perché POLLO')).toBe('perche pollo');
	});
});

describe('searchRecipes', () => {
	it('lists only published recipes, sorted by name', () => {
		const all = ids(searchRecipes(db, ctx(), {}));
		expect(all.length).toBe(db.recipes.filter((r) => r.status === 'published').length);
		expect(all).not.toContain('polpettine-tacchino-skottle');
	});
	it('matches names and ingredients without accents or case', () => {
		expect(ids(searchRecipes(db, ctx(), { text: 'POLLO' }))).toContain('wok-pollo-peperoni-riso-basmati');
		expect(ids(searchRecipes(db, ctx(), { text: 'basmati' }))).toContain('wok-pollo-peperoni-riso-basmati');
	});
	it('searches in the user language', () => {
		expect(ids(searchRecipes(db, ctx({ userId: 'user-tom' }), { text: 'chicken' }))).toContain('wok-pollo-peperoni-riso-basmati');
	});
	it('hides book recipes from families without the book', () => {
		const bookIds = db.recipes.filter((r) => r.bookId && r.status === 'published').map((r) => r.id);
		const grandparents = ids(searchRecipes(db, ctx({ familyId: 'family-grandparents' }), {}));
		for (const id of bookIds) expect(grandparents).not.toContain(id);
	});
	it('filters by meal, time, group and minimum stars', () => {
		const result = searchRecipes(db, ctx(), { mealType: 'dinner', maxMinutes: 30, proteinGroup: 'white_meat', minStars: 1 });
		if (!result.ok) throw new Error(result.error);
		for (const item of result.value) {
			expect(['dinner', 'both']).toContain(item.recipe.mealType);
			expect(item.recipe.durationMinutes ?? Infinity).toBeLessThanOrEqual(30);
			expect(item.recipe.proteinGroup).toBe('white_meat');
			expect(item.rating.familyAverage ?? 0).toBeGreaterThanOrEqual(1);
		}
	});
	it('returns an empty list when nothing matches', () => {
		expect(ids(searchRecipes(db, ctx(), { text: 'zzzz' }))).toEqual([]);
	});
});

describe('getRecipeDetail', () => {
	it('scales to the requested servings and lists recent meals', () => {
		const detail = getRecipeDetail(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 3);
		if (!detail.ok) throw new Error(detail.error);
		expect(detail.value.baseServings).toBe(6);
		expect(detail.value.ingredients[0].quantity).toEqual({ kind: 'amount', value: 150, unit: 'g' });
		expect(detail.value.history.every((h) => h.date <= '2026-10-06')).toBe(true);
	});
	it('defaults to base servings and refuses drafts', () => {
		const detail = getRecipeDetail(db, ctx(), 'wok-pollo-peperoni-riso-basmati');
		expect(detail.ok && detail.value.servings).toBe(6);
		expect(getRecipeDetail(db, ctx(), 'polpettine-tacchino-skottle')).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('rateRecipe', () => {
	it('sets, changes and removes the own rating, updating the family average', () => {
		const id = 'wok-pollo-peperoni-riso-basmati';
		const set = rateRecipe(db, ctx({ userId: 'user-tom' }), id, 2);
		expect(set.ok && set.value.myStars).toBe(2);
		const changed = rateRecipe(db, ctx({ userId: 'user-tom' }), id, 5);
		expect(changed.ok && changed.value.myStars).toBe(5);
		const removed = rateRecipe(db, ctx({ userId: 'user-tom' }), id, null);
		expect(removed.ok && removed.value.myStars).toBeNull();
		expect(db.ratings.filter((r) => r.userId === 'user-tom' && r.recipeId === id)).toHaveLength(0);
	});
	it('shows no ratings after the only rating is removed', () => {
		db.ratings = db.ratings.filter((r) => r.recipeId !== 'wok-pollo-peperoni-riso-basmati');
		rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 4);
		const removed = rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', null);
		expect(removed.ok && removed.value).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});
	it('rejects invalid stars and offline use', () => {
		expect(rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 6)).toEqual({ ok: false, error: 'invalid' });
		expect(rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 2.5)).toEqual({ ok: false, error: 'invalid' });
		expect(rateRecipe(db, ctx({ offline: true }), 'wok-pollo-peperoni-riso-basmati', 3)).toEqual({ ok: false, error: 'offline' });
	});
});
```

Run: `npx vitest run src/lib/operations/recipes.test.ts` → Atteso: FAIL.

- [ ] **Passo 2: implementazione**

`prototype/src/lib/operations/recipes.ts`:

```ts
import { isWeekVisible } from '$lib/domain/calendar';
import type { DemoDatabase, IsoDate, MealType, MeasurementSystem, ProteinGroup } from '$lib/domain/types';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, localeOf, localized, ratingSummary, recipeSummary, scaledIngredients, visibleRecipe } from './access';
import type { RatingSummary, RecipeSummary, ScaledIngredient } from './views';

export interface RecipeQuery {
	text?: string;
	mealType?: MealType;
	maxMinutes?: number;
	proteinGroup?: ProteinGroup;
	minStars?: number;
}

export interface RecipeListItem {
	recipe: RecipeSummary;
	rating: RatingSummary;
}

export interface RecipeDetail {
	recipe: RecipeSummary;
	baseServings: number;
	servings: number;
	ingredients: ScaledIngredient[];
	rating: RatingSummary;
	history: { date: IsoDate; mealType: MealType }[];
	measurementSystem: MeasurementSystem;
}

export function normalizeForSearch(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function searchRecipes(db: DemoDatabase, ctx: OperationContext, query: RecipeQuery): OpResult<RecipeListItem[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	const needle = normalizeForSearch(query.text ?? '');
	const items = db.recipes
		.filter((r) => visibleRecipe(db, family, r.id))
		.filter((r) => !query.mealType || r.mealType === query.mealType || r.mealType === 'both')
		.filter((r) => !query.maxMinutes || (r.durationMinutes !== null && r.durationMinutes <= query.maxMinutes))
		.filter((r) => !query.proteinGroup || r.proteinGroup === query.proteinGroup)
		.filter((r) => {
			if (!needle) return true;
			const ingredientNames = r.ingredients.map((line) => {
				const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
				return ingredient ? localized(ingredient.name, locale).text : '';
			});
			const haystack = [localized(r.name, locale).text, localized(r.description, locale).text, ...ingredientNames];
			return haystack.some((value) => normalizeForSearch(value).includes(needle));
		})
		.map((r) => ({ recipe: recipeSummary(db, r, locale), rating: ratingSummary(db, family, ctx.userId, r.id) }))
		.filter((item) => !query.minStars || (item.rating.familyAverage ?? 0) >= query.minStars)
		.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name, locale));
	return ok(items);
}

export function getRecipeDetail(db: DemoDatabase, ctx: OperationContext, recipeId: string, servings?: number): OpResult<RecipeDetail> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const recipe = visibleRecipe(db, family, recipeId);
	if (!recipe || !recipe.baseServings) return fail('not_found');
	const locale = localeOf(db, ctx);
	const chosen = servings && Number.isInteger(servings) && servings > 0 ? servings : recipe.baseServings;
	const today = ctx.now.slice(0, 10);
	const history = db.weeks
		.filter((w) => w.familyId === family.id && isWeekVisible(w, ctx.now))
		.flatMap((w) => w.slots)
		.filter((s) => s.recipeId === recipeId && s.date <= today && s.cooked !== false)
		.map((s) => ({ date: s.date, mealType: s.mealType }))
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, 5);
	return ok({
		recipe: recipeSummary(db, recipe, locale),
		baseServings: recipe.baseServings,
		servings: chosen,
		ingredients: scaledIngredients(db, recipe, chosen, locale) ?? [],
		rating: ratingSummary(db, family, ctx.userId, recipeId),
		history,
		measurementSystem: family.measurementSystem
	});
}

export function rateRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string, stars: number | null): OpResult<RatingSummary> {
	if (ctx.offline) return fail('offline');
	if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) return fail('invalid');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (!visibleRecipe(db, family, recipeId)) return fail('not_found');
	const index = db.ratings.findIndex((r) => r.userId === ctx.userId && r.recipeId === recipeId);
	if (stars === null) {
		if (index !== -1) db.ratings.splice(index, 1);
	} else if (index === -1) {
		db.ratings.push({ userId: ctx.userId, recipeId, stars });
	} else {
		db.ratings[index].stars = stars;
	}
	return ok(ratingSummary(db, family, ctx.userId, recipeId));
}
```

Nota: il voto si dà anche alle ricette dei menu passati purché pubblicate e visibili;
una ricetta in bozza non si può votare (resta solo consultabile nel menu).

- [ ] **Passo 3: verifica e commit**

Run: `npx vitest run && npm run check` → Atteso: PASS.

```bash
git add prototype/src/lib/operations
git commit -m "Prototipo: ricerca, scheda ricetta e voti simulati"
```

---

### Attività 12: componente voto in due varianti

**File:**
- Crea: `prototype/src/lib/components/RatingStars.svelte`
- Modifica: `prototype/src/routes/menu/+page.svelte` (snippet `rating` per `MealCard`)

**Interfacce:**
- Consuma: `rateRecipe` (attività 11), `RatingSummary`, `app.settings.ratingVariant`.
- Produce: `RatingStars` con props
  `{ summary: RatingSummary; recipeId: string; recipeName: string; variant: RatingVariant; size?: 'compact' | 'large' }`.
  Il componente chiama `rateRecipe` e salva; mostra l'errore offline in linea.

- [ ] **Passo 1: componente**

`RatingStars.svelte`:

```svelte
<script lang="ts">
	import { formatAverage } from '$lib/i18n/dates';
	import { rateRecipe } from '$lib/operations/recipes';
	import type { RatingSummary } from '$lib/operations/views';
	import { app } from '$lib/store/app.svelte';
	import type { RatingVariant } from '$lib/store/persistence';

	let { summary, recipeId, recipeName, variant, size = 'compact' }: { summary: RatingSummary; recipeId: string; recipeName: string; variant: RatingVariant; size?: 'compact' | 'large' } = $props();

	let open = $state(false);
	let error = $state(false);
	const groupName = $derived(`rating-${recipeId}-${Math.random().toString(36).slice(2, 8)}`);
	const familyText = $derived(
		summary.familyAverage === null
			? app.t('rating.none')
			: `${formatAverage(app.locale, summary.familyAverage)} · ${summary.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: summary.familyCount })}`
	);

	function rate(stars: number | null) {
		const result = rateRecipe(app.db, app.ctx, recipeId, stars);
		error = !result.ok;
		if (result.ok) app.update(() => {});
	}
</script>

{#snippet stars()}
	<fieldset class="stars" class:large={size === 'large' || variant === 'panel'} disabled={app.settings.offline}>
		<legend class="visually-hidden">{app.t('rating.mine')}</legend>
		{#each [1, 2, 3, 4, 5] as value (value)}
			<label class="star" class:filled={summary.myStars !== null && value <= summary.myStars}>
				<input class="visually-hidden" type="radio" name={groupName} {value} checked={summary.myStars === value} onchange={() => rate(value)} />
				<svg class="icon" aria-hidden="true"><use href="#icon-star" /></svg>
				<span class="visually-hidden">{app.t('rating.give', { stars: value, recipe: recipeName })}</span>
			</label>
		{/each}
	</fieldset>
	{#if summary.myStars !== null}
		<button type="button" class="remove" disabled={app.settings.offline} onclick={() => rate(null)}>{app.t('rating.remove')}</button>
	{/if}
	{#if error}<p class="meta-line" role="alert">{app.t('error.offline')}</p>{/if}
{/snippet}

<div class="rating">
	{#if variant === 'inline'}
		<p class="family"><span>{app.t('rating.family')}</span> <strong>★ {familyText}</strong></p>
		<div class="mine">
			<span>{summary.myStars === null ? app.t('rating.notRated') : app.t('rating.mine')}</span>
			{@render stars()}
		</div>
	{:else}
		<button type="button" class="summary" aria-expanded={open} aria-label={app.t('rating.open', { recipe: recipeName })} onclick={() => (open = !open)}>
			<span>★ {familyText}</span>
			<span>{summary.myStars === null ? app.t('rating.notRated') : app.t('rating.you', { stars: summary.myStars })}</span>
			<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
		</button>
		{#if open}
			<div class="panel">
				<p class="family"><span>{app.t('rating.mine')}</span></p>
				{@render stars()}
				<p class="meta-line">{app.t('rating.family')}: {familyText}</p>
				<button type="button" class="text-button" onclick={() => (open = false)}>{app.t('common.close')}</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.rating { margin: 0 0 16px; font-size: 0.875rem; }
	.family { margin: 0 0 4px; color: var(--muted); }
	.family strong { color: var(--ink); }
	.mine { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--muted); }
	.stars { display: inline-flex; margin: 0; padding: 0; border: 0; }
	.star { display: grid; place-items: center; width: 36px; height: 44px; color: var(--ink); cursor: pointer; }
	.star .icon { width: 22px; height: 22px; }
	.star.filled .icon { fill: var(--green); stroke: var(--green); }
	.stars.large .star { width: 48px; height: 48px; }
	.stars.large .icon { width: 30px; height: 30px; }
	.star:has(input:focus-visible) { outline: 3px solid var(--green); outline-offset: -3px; border-radius: 8px; }
	.stars:disabled .star { opacity: 0.4; cursor: not-allowed; }
	.remove { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--green); font: 700 0.875rem/1.5 var(--text-font); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; width: 100%; min-height: 44px; padding: 8px 0; border: 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); background: none; color: var(--ink); font: 700 0.875rem/1.5 var(--text-font); text-align: left; cursor: pointer; }
	.summary .icon { margin-left: auto; width: 16px; height: 16px; }
	.summary[aria-expanded='true'] .icon { transform: rotate(90deg); }
	.panel { margin-top: 8px; padding: 16px; background: var(--soft-green); border-radius: 8px; }
</style>
```

- [ ] **Passo 2: voto nelle schede del Menu**

In `prototype/src/routes/menu/+page.svelte`, importare `RatingStars` e passare lo
snippet a `MealCard`:

```svelte
{#snippet mealRating(meal: MealView)}
	{#if meal.recipe && meal.rating}
		<RatingStars summary={meal.rating} recipeId={meal.recipe.id} recipeName={meal.recipe.name} variant={app.settings.ratingVariant} />
	{/if}
{/snippet}
```

e sostituire `<MealCard {meal} system={week.measurementSystem} onToggleCooked={toggleCooked} />`
con `<MealCard {meal} system={week.measurementSystem} rating={mealRating} onToggleCooked={toggleCooked} />`.

Per le ricette non votabili (bozze nei menu passati, libri non posseduti) `MealCard`
mostra solo il riepilogo testuale: in `MealCard` sostituire
`{#if rating}{@render rating(meal)}{:else}` con
`{#if rating && meal.canRate}{@render rating(meal)}{:else}`.

- [ ] **Passo 3: verifica nel browser e commit**

Con agent-browser a 390 px: variante "Stelle dirette" → tocco sulla 4ª stella aggiorna
"il tuo voto" e la media; "Togli il mio voto" torna a "Non hai votato". Variante
"Riepilogo e pannello" dal pannello di prova → riga compatta, apertura del pannello,
voto, chiusura. Navigazione da tastiera: Tab raggiunge le stelle, frecce cambiano voto.
Offline: stelle disabilitate.

```bash
git add prototype/src
git commit -m "Prototipo: componente voto in due varianti"
```

---

### Attività 13: vista Ricettario

**File:**
- Crea: `prototype/src/lib/components/RecipeCard.svelte`, `RecipeFilters.svelte`
- Modifica: `prototype/src/routes/recipes/+page.svelte` (crea)

**Interfacce:**
- Consuma: `searchRecipes`, `RecipeQuery`, `RecipeListItem` (attività 11),
  `RatingStars` (attività 12).
- Produce: filtri nei parametri dell'URL `q`, `meal`, `time`, `group`, `stars`.

- [ ] **Passo 1: filtri**

`RecipeFilters.svelte`:

```svelte
<script lang="ts">
	import type { MealType, ProteinGroup } from '$lib/domain/types';
	import type { RecipeQuery } from '$lib/operations/recipes';
	import { app } from '$lib/store/app.svelte';

	let { query, onChange }: { query: RecipeQuery; onChange: (query: RecipeQuery) => void } = $props();
	const groups: ProteinGroup[] = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'];
	const set = (patch: Partial<RecipeQuery>) => onChange({ ...query, ...patch });
	const num = (value: string) => (value ? Number(value) : undefined);
</script>

<form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
	<label class="search">
		<span class="visually-hidden">{app.t('recipes.search')}</span>
		<input type="search" placeholder={app.t('recipes.search')} value={query.text ?? ''} oninput={(e) => set({ text: e.currentTarget.value || undefined })} />
	</label>
	<fieldset>
		<legend class="visually-hidden">{app.t('recipes.filters')}</legend>
		<label>{app.t('recipes.filter.meal')}
			<select value={query.mealType ?? ''} onchange={(e) => set({ mealType: (e.currentTarget.value || undefined) as MealType | undefined })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				<option value="lunch">{app.t('meal.lunch')}</option>
				<option value="dinner">{app.t('meal.dinner')}</option>
			</select>
		</label>
		<label>{app.t('recipes.filter.time')}
			<select value={String(query.maxMinutes ?? '')} onchange={(e) => set({ maxMinutes: num(e.currentTarget.value) })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each [15, 30, 45] as minutes (minutes)}<option value={String(minutes)}>{app.t('recipes.filter.minutes', { count: minutes })}</option>{/each}
			</select>
		</label>
		<label>{app.t('recipes.filter.group')}
			<select value={query.proteinGroup ?? ''} onchange={(e) => set({ proteinGroup: (e.currentTarget.value || undefined) as ProteinGroup | undefined })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each groups as group (group)}<option value={group}>{app.t(`group.${group}`)}</option>{/each}
			</select>
		</label>
		<label>{app.t('recipes.filter.stars')}
			<select value={String(query.minStars ?? '')} onchange={(e) => set({ minStars: num(e.currentTarget.value) })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each [3, 4] as stars (stars)}<option value={String(stars)}>{app.t('recipes.filter.starsAtLeast', { count: stars })}</option>{/each}
			</select>
		</label>
	</fieldset>
</form>

<style>
	.filters { display: grid; gap: 12px; margin-bottom: 16px; }
	input[type='search'] { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); }
	fieldset { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
	label { display: grid; gap: 4px; font-size: 0.75rem; font-weight: 700; color: var(--muted); }
	select { min-height: 44px; padding: 8px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 0.875rem; }
	@media (max-width: 767px) { fieldset { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
```

- [ ] **Passo 2: scheda nell'elenco**

`RecipeCard.svelte` (struttura `.recipe-row` del riferimento):

```svelte
<script lang="ts">
	import type { RecipeListItem } from '$lib/operations/recipes';
	import { app } from '$lib/store/app.svelte';
	import RatingStars from './RatingStars.svelte';

	let { item }: { item: RecipeListItem } = $props();
	const recipe = $derived(item.recipe);
</script>

<article class="recipe-row" class:has-photo={!!recipe.photo}>
	{#if recipe.photo}<img class="recipe-thumbnail" src={recipe.photo} alt="" loading="lazy" decoding="async" />{/if}
	<div class="recipe-content">
		<h2><a class="title-link" href="/recipes/{recipe.id}">{recipe.name}</a></h2>
		<p>{recipe.description}</p>
		<p class="meta">
			{#if recipe.durationMinutes}{app.t('meal.minutes', { count: recipe.durationMinutes })}{/if}
			{#if recipe.proteinGroup} · {app.t(`group.${recipe.proteinGroup}`)}{/if}
		</p>
		<RatingStars summary={item.rating} recipeId={recipe.id} recipeName={recipe.name} variant={app.settings.ratingVariant} />
	</div>
</article>

<style>
	.title-link { color: inherit; text-decoration: none; }
	.title-link:hover { color: var(--green); }
	.meta { font-weight: 700; color: var(--ink) !important; }
</style>
```

- [ ] **Passo 3: pagina**

`prototype/src/routes/recipes/+page.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import RecipeFilters from '$lib/components/RecipeFilters.svelte';
	import StateNotice from '$lib/components/StateNotice.svelte';
	import type { MealType, ProteinGroup } from '$lib/domain/types';
	import { searchRecipes, type RecipeQuery } from '$lib/operations/recipes';
	import { app } from '$lib/store/app.svelte';

	const query = $derived.by((): RecipeQuery => {
		const p = page.url.searchParams;
		const n = (key: string) => (p.get(key) ? Number(p.get(key)) : undefined);
		return {
			text: p.get('q') ?? undefined,
			mealType: (p.get('meal') ?? undefined) as MealType | undefined,
			maxMinutes: n('time'),
			proteinGroup: (p.get('group') ?? undefined) as ProteinGroup | undefined,
			minStars: n('stars')
		};
	});
	const result = $derived(searchRecipes(app.db, app.ctx, query));

	function update(next: RecipeQuery) {
		const p = new URLSearchParams();
		if (next.text) p.set('q', next.text);
		if (next.mealType) p.set('meal', next.mealType);
		if (next.maxMinutes) p.set('time', String(next.maxMinutes));
		if (next.proteinGroup) p.set('group', next.proteinGroup);
		if (next.minStars) p.set('stars', String(next.minStars));
		goto(`/recipes${p.size ? `?${p}` : ''}`, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<section class="secondary-view app-view recipes">
	<h1 class="page-title">{app.t('recipes.title')}</h1>
	<RecipeFilters {query} onChange={update} />
	{#if !result.ok}
		<StateNotice title={app.t('error.forbidden')} />
	{:else if result.value.length === 0}
		<StateNotice title={app.t('recipes.noResults.title')} body={app.t('recipes.noResults.body')}>
			<button type="button" class="text-button" onclick={() => update({})}>{app.t('recipes.reset')}</button>
		</StateNotice>
	{:else}
		<p class="meta-line" role="status">{app.t('recipes.count', { count: result.value.length })}</p>
		<div class="recipe-list">
			{#each result.value as item (item.recipe.id)}<RecipeCard {item} />{/each}
		</div>
	{/if}
</section>

<style>
	.recipes { padding-top: max(20px, env(safe-area-inset-top)); }
</style>
```

- [ ] **Passo 4: verifica e commit**

Con agent-browser: ricerca "pollo" e, da utente Tom, "chicken"; filtri combinati; stato
"Nessuna ricetta trovata" con "Azzera filtri"; famiglia Nonni senza ricette da libro;
voto dalla lista che si riflette nel Menu.

```bash
git add prototype/src
git commit -m "Prototipo: ricettario con ricerca, filtri e voto"
```

---

### Attività 14: scheda ricetta

**File:**
- Crea: `prototype/src/routes/recipes/[id]/+page.svelte`

**Interfacce:**
- Consuma: `getRecipeDetail` (attività 11), `IngredientList` (attività 9),
  `RatingStars` (attività 12).
- Produce: rotta `/recipes/[id]?from=menu&day=YYYY-MM-DD&servings=N`.

- [ ] **Passo 1: pagina**

`prototype/src/routes/recipes/[id]/+page.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import IngredientList from '$lib/components/IngredientList.svelte';
	import RatingStars from '$lib/components/RatingStars.svelte';
	import StateNotice from '$lib/components/StateNotice.svelte';
	import { formatDayLong } from '$lib/i18n/dates';
	import { getRecipeDetail } from '$lib/operations/recipes';
	import { app } from '$lib/store/app.svelte';

	const fromMenu = $derived(page.url.searchParams.get('from') === 'menu');
	const day = $derived(page.url.searchParams.get('day'));
	const servingsParam = $derived(Number(page.url.searchParams.get('servings')) || undefined);
	const result = $derived(getRecipeDetail(app.db, app.ctx, page.params.id ?? '', servingsParam));
	const backHref = $derived(fromMenu ? `/menu${day ? `?day=${day}` : ''}` : '/recipes');

	function setServings(servings: number) {
		const p = new URLSearchParams(page.url.searchParams);
		p.set('servings', String(servings));
		goto(`?${p}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	$effect(() => {
		if (fromMenu && day) app.selectedDate = day;
	});
</script>

<section class="secondary-view app-view detail">
	<a class="link-inline back" href={backHref}>‹ {fromMenu ? app.t('recipe.backToMenu') : app.t('recipe.backToRecipes')}</a>

	{#if !result.ok}
		<StateNotice title={app.t('recipe.unavailable')} />
	{:else}
		{@const d = result.value}
		<article class="meal">
			{#if d.recipe.photo}<div class="meal-media"><img class="meal-photo" src={d.recipe.photo} alt="" /></div>{/if}
			<div class="meal-content">
				<h1 class="title">{d.recipe.name}</h1>
				<p class="description">{d.recipe.description}</p>
				<p class="meal-meta">{#if d.recipe.durationMinutes}{app.t('meal.minutes', { count: d.recipe.durationMinutes })} · {/if}{#if d.recipe.proteinGroup}{app.t(`group.${d.recipe.proteinGroup}`)}{/if}</p>
				<p class="meal-source">
					{#if d.recipe.sourceType === 'book' && d.recipe.bookTitle}{app.t('source.book', { title: d.recipe.bookTitle, pages: d.recipe.bookPages ?? '—' })}
					{:else if d.recipe.sourceUrl}<a class="link-inline" href={d.recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{app.t('source.open')} ↗</a>
					{:else}{app.t('source.home')}{/if}
				</p>
				<RatingStars summary={d.rating} recipeId={d.recipe.id} recipeName={d.recipe.name} variant={app.settings.ratingVariant} size="large" />

				<div class="servings">
					<span>{app.t('recipe.servingsLabel')}</span>
					<button type="button" class="step" aria-label={app.t('recipe.lessServings')} disabled={d.servings <= 1} onclick={() => setServings(d.servings - 1)}>−</button>
					<strong aria-live="polite">{d.servings}</strong>
					<button type="button" class="step" aria-label={app.t('recipe.moreServings')} disabled={d.servings >= 12} onclick={() => setServings(d.servings + 1)}>+</button>
				</div>
				<p class="meta-line">{app.t('recipe.baseServings', { count: d.baseServings })}</p>
				<IngredientList ingredients={d.ingredients} system={d.measurementSystem} label={d.recipe.name} collapsible={false} />

				<h2 class="history-title">{app.t('recipe.history')}</h2>
				{#if d.history.length}
					<ul class="history">{#each d.history as h (h.date + h.mealType)}<li>{formatDayLong(app.locale, h.date)} · {app.t(`meal.${h.mealType}`)}</li>{/each}</ul>
				{:else}
					<p class="meta-line">{app.t('recipe.historyEmpty')}</p>
				{/if}
			</div>
		</article>
	{/if}
</section>

<style>
	.detail { padding-top: max(16px, env(safe-area-inset-top)); }
	.back { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: 8px; text-decoration: none; }
	.title { margin: 0 0 12px; font: 400 1.375rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.servings { display: flex; align-items: center; gap: 12px; margin: 8px 0 4px; font-weight: 700; }
	.step { width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); font: 700 1.25rem/1 var(--text-font); cursor: pointer; }
	.step:disabled { opacity: 0.3; cursor: not-allowed; }
	.history-title { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	.history { margin: 0; padding: 0; list-style: none; }
	.history li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	@media (min-width: 768px) { .meal { max-width: 720px; } }
</style>
```

- [ ] **Passo 2: verifica e commit**

Con agent-browser: dal Menu "Scheda ricetta" → scheda; porzioni +/− ricalcolano gli
ingredienti; "Torna al menu" riporta allo stesso giorno; dal Ricettario "Torna al
ricettario"; ricetta in bozza o da libro non posseduto → "Questa ricetta non è
disponibile per la tua famiglia"; unità imperiali e inglese.

```bash
git add prototype/src
git commit -m "Prototipo: scheda ricetta con porzioni e storico"
```

---

### Attività 15: verifica finale, documenti e review completa

**File:**
- Modifica: `design/percorsi.md`, questo piano

- [ ] **Passo 1: verifica automatica**

Run: `cd prototype && npx vitest run && npm run check && npm run build` → Atteso: verde.

- [ ] **Passo 2: verifica visiva completa**

Con agent-browser a 320, 390 e 1440 px, in italiano (Federico) e inglese (Tom), con
metrico e imperiale: Menu (quattro stati della settimana), Ricettario (risultati e
nessun risultato), scheda ricetta, Spesa e Tu segnaposto, pannello di prova, offline.
Confronto con `design/index.html`: font, foto, spaziature, navbar, focus visibile.
Annotare nel piano eventuali scostamenti voluti.

- [ ] **Passo 3: pubblicazione sulla rete locale**

Run (in background): `npm run preview:lan`; comunicare `http://<ip>:8766/menu`.

- [ ] **Passo 4: documenti**

`design/percorsi.md`: percorsi 0, 1 e 2 "In review"; sotto "Giro 1" elencare le rotte
(`/menu`, `/recipes`, `/recipes/[id]`, `/shopping`, `/you`), i componenti introdotti
(`WeekHeader`, `DaySelector`, `MealCard`, `IngredientList`, `RatingStars` con due
varianti, `RecipeCard`, `RecipeFilters`, `StateNotice`, `OfflineBanner`, `DevPanel`) e
le domande per la review:

1. variante del voto da adottare;
2. etichetta della quarta voce ("Tu" / "You" o altro);
3. titolo della scheda collegato alla fonte (riferimento approvato) e link separato
   "Scheda ricetta": confermare o invertire;
4. ricette `casa` con URL (R4) e ricette in bozza nei menu passati;
5. quantità non numeriche lasciate nel testo italiano della fonte anche in inglese;
6. filtro per stagione non incluso: i dati di origine non hanno la stagione (deciso
   nella scrittura del piano, da confermare).

- [ ] **Passo 5: commit e review**

```bash
git add design/percorsi.md progetto/superpowers/plans/2026-10-06-prototipo-giro-1.md
git commit -m "Prototipo: giro 1 pronto per la review"
```

Avviare la review con l'utente seguendo il ciclo di `design/percorsi.md` e compilare
"Esito della review" qui e nel documento dei percorsi.

---

## Esito della tappa intermedia

Raggiunta il 6 ottobre 2026 (attività 1–9 completate, 67 test verdi, verifica a 320,
390 e 1440 px). Anteprima: `http://192.168.178.64:8766/menu`.

Osservazioni dell'utente e decisioni (dettaglio in `design/percorsi.md`): nessun vincolo
né stato per settimana e nessuna chiusura; via le etichette non informative; calendario
accanto ai giorni al posto delle frecce, solo giorni con menu; Spesa fuori dalla navbar,
ingresso da decidere nel percorso Spesa. Adeguamenti nell'attività 10b, approvata
dall'utente.

## Esito della review

Approvato dall'utente il 6 ottobre 2026. Review indipendente del codice: nessun
problema critico, cinque importanti corretti con test. Durante la review con l'utente
il prototipo è stato iterato (barra con mese e calendario, footer delle schede, foto
3:1, fonte troncata, voto in riga, filtri richiudibili con ordinamento, bozze per i
curatori, navbar a sole icone, quantità non numeriche tradotte). Dettaglio e
decisioni in `design/percorsi.md`, sezione "Giro 1"; 102 test verdi alla chiusura.
