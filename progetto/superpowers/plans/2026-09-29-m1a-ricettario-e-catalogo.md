# M1a Ricettario e catalogo: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare il ricettario del progetto di origine nel nuovo formato strutturato, validato in CI, e sincronizzarlo in un catalogo Supabase leggibile solo dagli utenti autenticati.

**Architecture:** Il ricettario vive in tre YAML versionati (`ricettario/libri.yaml`, `ricettario/ingredienti.yaml`, `ricettario/ricette.yaml`). Una libreria TypeScript (`lib/ricettario/`) li carica e li valida con zod più controlli incrociati. Uno script di import una tantum (`lib/importa/`, `scripts/importa-ricettario.ts`) converte il vecchio `ricette.yaml` in bozza più report; la bozza si rivede a mano (curatore + AI) finché la validazione passa. Una migrazione Supabase crea il catalogo con RLS, e uno script di sync (`lib/sync/`) fa l'upsert idempotente in una transazione, lanciato da GitHub Actions al merge su `main`.

**Tech Stack:** Node 22+ (locale 26), pnpm 11, TypeScript, tsx, vitest, zod 4, yaml (eemeli), postgres (porsager), Supabase CLI, pgTAP, GitHub Actions.

**Spec:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezioni 2, 8, 9, 10, 11). Leggila prima di cominciare.

**Piano successivo:** M1b Fondamenta dell'app (Auth, Famiglia, inviti, seed della famiglia del curatore, vista di apertura), da scrivere dopo questo.

## Global Constraints

- Lingua: codice, identificatori di dominio, messaggi e documenti in italiano, con gli accenti normali.
- Ingredienti solo se verificati sulla fonte o forniti dal curatore, trascritti per `porzioni_base`, mai dedotti dal nome del piatto. Una quantità che l'import non sa interpretare NON si inventa: diventa un errore di validazione da risolvere in revisione.
- Il ricettario va in una sola direzione: git → database. Nessun utente scrive nel catalogo; lo scrive solo la sync con la service role.
- Una scheda tolta dal YAML non si cancella mai dal database: la sync la archivia.
- Tutte le ricette sono globali. `casa` = ricetta senza fonte esterna, senza `url`.
- Reparti standard, in quest'ordine: FRUTTA E VERDURA, MACELLERIA, PESCHERIA, BANCO FRIGO E LATTICINI, PANE E PRODOTTI DA FORNO, PASTA RISO E CEREALI, SCATOLAME E CONSERVE, CONDIMENTI E DISPENSA.
- Il progetto di origine `../meal_planner` si legge soltanto, non si modifica.
- Nessun push su GitHub e nessuna scrittura sul progetto Supabase remoto senza richiesta esplicita dell'utente.
- Documentazione di librerie e servizi: consultarla con Context7 prima di usare un'API di cui non si è certi.

## Review Focus

1. **YAML malformato** (tab, chiave duplicata, file mancante): la validazione deve restituire un problema con nome del file, non lanciare un'eccezione. Test in Task 3.
2. **Stesso sinonimo su due ingredienti canonici**: renderebbe ambigua la mappatura; deve essere un errore di validazione. Test in Task 3.
3. **Rilancio dell'import con `--solo-nuove` su un ricettario già rivisto**: non deve toccare le schede e gli ingredienti esistenti, solo aggiungere quelli nuovi. Test in Task 7.
4. **Ricetta archiviata dalla sync che ricompare nel YAML**: deve tornare attiva (`archiviata` = null). Test in Task 10.
5. **Quantità numeriche nel vecchio YAML** (`quantita: 2` senza virgolette, letta come numero): l'import deve trattarle come testo. Test in Task 4.

## Struttura dei file

```
package.json, pnpm-lock.yaml, tsconfig.json, vitest.config.ts
lib/ricettario/unita.ts        unità ammesse e scalabilità
lib/ricettario/schema.ts       enum di dominio, schemi zod, tipi
lib/ricettario/carica.ts       lettura dei tre YAML → Catalogo + problemi di formato
lib/ricettario/valida.ts       controlli incrociati → problemi
scripts/valida-ricettario.ts   CLI: pnpm valida
lib/importa/vecchio.ts         tipi del formato del progetto di origine
lib/importa/quantita.ts        "2 spicchi" → {2, spicchio}
lib/importa/tempo.ts           "15-20 min" → 20
lib/importa/ingredienti.ts     nomi → anagrafica canonica proposta
lib/importa/attributi.ts       tag e ingredienti → attributi proposti
lib/importa/famiglia.ts        voti, storico, menu → seed della famiglia del curatore
lib/importa/converti.ts        orchestrazione pura: vecchio → nuovo + report
lib/importa/report.ts          report Markdown
scripts/importa-ricettario.ts  CLI: pnpm importa
ricettario/libri.yaml, ricettario/ingredienti.yaml, ricettario/ricette.yaml
seed/famiglia-curatore.json    dati della famiglia del curatore (usati in M1b)
progetto/import/report-import.md
supabase/config.toml, supabase/migrations/<ts>_catalogo.sql, supabase/tests/catalogo.test.sql
lib/sync/righe.ts              Catalogo → righe delle tabelle; slug da archiviare
lib/sync/applica.ts            upsert in transazione (postgres.js)
scripts/sync-ricettario.ts     CLI: pnpm sync
.github/workflows/ci.yml, .github/workflows/deploy.yml
tests/…                        un file di test per modulo; tests/db/ per i test sul database
```

---

### Task 0: Prerequisiti e decisioni con l'utente

Nessun codice. Serve l'utente: fermati e chiedi, una domanda per volta dove serve.

**Files:** nessuno (al massimo `AGENTS.md`, step 5).

- [ ] **Step 1: Runtime per i container.** Supabase in locale (e i test RLS e di sync) richiede un runtime Docker. Verifica con `docker info`. Se manca, chiedi all'utente di installarne uno: consigliato OrbStack (`brew install orbstack`, poi aprirlo una volta), in alternativa Docker Desktop. Atteso: `docker info` risponde.

- [ ] **Step 2: Supabase CLI.** Verifica con `supabase --version`. Se manca: `brew install supabase/tap/supabase`. Atteso: stampa una versione.

- [ ] **Step 3: Progetto Supabase remoto.** Chiedi all'utente il *project ref* del progetto creato nell'organizzazione (lo si vede nell'URL della dashboard). Non serve ancora la password del database: servirà in Task 11.

- [ ] **Step 4: Integrazione GitHub di Supabase.** L'utente ha collegato il repository. Chiedigli di aprire Project Settings → Integrations → GitHub e di dirti se è attiva la sincronizzazione del branch di produzione, che applica le migrazioni di `supabase/migrations` al merge. Decisione da proporre: **le migrazioni in produzione le applica il workflow `deploy.yml` (Task 11), prima della sync**, perché così l'ordine migrazioni → sync è garantito. Quindi la sincronizzazione automatica della produzione va disattivata; i preview branch per le pull request possono restare. Registra la scelta dell'utente.

- [ ] **Step 5: Flusso git.** Proponi all'utente lo stesso flusso del progetto di origine: branch permanente `sviluppo`, pull request verso `main` con merge commit, mai commit diretti su `main`. Se approva, crea il branch con `git -C /Users/fedfol/Projects/meal_planner_2 switch -c sviluppo` e aggiungi a `AGENTS.md`, sezione "Regole di lavoro", la riga: `- Si lavora su \`sviluppo\`; si pubblica con una pull request verso \`main\` (merge commit). Il merge su \`main\` applica le migrazioni e sincronizza il ricettario in produzione.` Commit: `git commit -am "Flusso git: sviluppo e pull request verso main"`.

---

### Task 1: Progetto TypeScript e unità di misura

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `lib/ricettario/unita.ts`
- Modify: `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md` (sezione 6, elenco unità)
- Test: `tests/ricettario/unita.test.ts`

**Interfaces:**
- Produces: `UNITA`, `UNITA_SCALABILI`, `UNITA_SOLO_ELENCATE` (array readonly), `type Unita`, `eUnita(x: string): x is Unita`, `scalabile(u: Unita): boolean`.

L'elenco delle unità della spec è più corto di quanto usi davvero il ricettario attuale (bicchiere, bustina, foglia, rametto, fetta, vasetto, vaschetta, ciuffo, goccio). Questo task allinea codice e spec.

- [ ] **Step 1: Crea il progetto**

`package.json`:

```json
{
  "name": "meal-planner-2",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.7.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run --project unit",
    "test:db": "vitest run --project db",
    "typecheck": "tsc --noEmit",
    "valida": "tsx scripts/valida-ricettario.ts",
    "importa": "tsx scripts/importa-ricettario.ts",
    "sync": "tsx scripts/sync-ricettario.ts"
  }
}
```

Poi, dalla radice del repository:

```bash
pnpm add zod yaml postgres
pnpm add -D typescript tsx vitest @types/node
```

Se pnpm avvisa che ha ignorato script di build (per esempio di esbuild), esegui `pnpm approve-builds` e approva esbuild.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["lib", "scripts", "tests", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/db/**'] } },
      { test: { name: 'db', include: ['tests/db/**/*.test.ts'], fileParallelism: false } },
    ],
  },
})
```

Gli import tra file TypeScript usano l'estensione `.ts` (`import { x } from './unita.ts'`): lo richiede `NodeNext` con `allowImportingTsExtensions`, e tsx e vitest li risolvono.

- [ ] **Step 2: Scrivi il test che fallisce**

`tests/ricettario/unita.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { UNITA, eUnita, scalabile } from '../../lib/ricettario/unita.ts'

describe('unità', () => {
  test('le unità di massa, volume e pezzo sono scalabili', () => {
    for (const u of ['g', 'kg', 'ml', 'l', 'pz', 'spicchio', 'cucchiaio', 'cucchiaino', 'bicchiere',
      'bustina', 'foglia', 'rametto', 'fetta', 'vasetto', 'vaschetta'] as const) {
      expect(scalabile(u)).toBe(true)
    }
  })

  test('mazzetto, ciuffo, pizzico, goccio e q.b. sono solo elencate', () => {
    for (const u of ['mazzetto', 'ciuffo', 'pizzico', 'goccio', 'q.b.'] as const) {
      expect(scalabile(u)).toBe(false)
    }
  })

  test('eUnita riconosce solo le unità ammesse, al singolare', () => {
    expect(eUnita('spicchio')).toBe(true)
    expect(eUnita('spicchi')).toBe(false)
    expect(eUnita('manciata')).toBe(false)
  })

  test('nessuna unità è ripetuta', () => {
    expect(new Set(UNITA).size).toBe(UNITA.length)
  })
})
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `pnpm test tests/ricettario/unita.test.ts`
Expected: FAIL, modulo `lib/ricettario/unita.ts` non trovato.

- [ ] **Step 4: Implementa**

`lib/ricettario/unita.ts`:

```ts
// Le unità ammesse nel ricettario. Le scalabili si moltiplicano per le porzioni
// dello slot; le "solo elencate" compaiono nella lista così come sono.
export const UNITA_SCALABILI = [
  'g', 'kg', 'ml', 'l', 'pz', 'spicchio', 'cucchiaio', 'cucchiaino', 'bicchiere',
  'bustina', 'foglia', 'rametto', 'fetta', 'vasetto', 'vaschetta',
] as const

export const UNITA_SOLO_ELENCATE = ['mazzetto', 'ciuffo', 'pizzico', 'goccio', 'q.b.'] as const

export const UNITA = [...UNITA_SCALABILI, ...UNITA_SOLO_ELENCATE] as const

export type Unita = (typeof UNITA)[number]

const insieme: ReadonlySet<string> = new Set(UNITA)
const scalabili: ReadonlySet<string> = new Set(UNITA_SCALABILI)

export function eUnita(x: string): x is Unita {
  return insieme.has(x)
}

export function scalabile(u: Unita): boolean {
  return scalabili.has(u)
}
```

- [ ] **Step 5: Esegui i test e il typecheck**

Run: `pnpm test tests/ricettario/unita.test.ts && pnpm typecheck`
Expected: PASS, nessun errore di tipo.

- [ ] **Step 6: Allinea la spec**

In `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezione 6, sostituisci il punto **Unità** con:

```markdown
- **Unità** (elenco in `lib/ricettario/unita.ts`):
  - scalabili: `g`, `kg`, `ml`, `l`, `pz`, `spicchio`, `cucchiaio`, `cucchiaino`,
    `bicchiere`, `bustina`, `foglia`, `rametto`, `fetta`, `vasetto`, `vaschetta`;
  - solo elencate: `mazzetto`, `ciuffo`, `pizzico`, `goccio`, `q.b.`.
```

Nello stesso punto, nell'elenco degli arrotondamenti, sostituisci "pezzi e spicchi al mezzo superiore" con "pezzi, spicchi e unità a pezzo (bustina, foglia, rametto, fetta, vasetto, vaschetta, bicchiere) al mezzo superiore".

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts lib tests progetto/superpowers/specs
git commit -m "Progetto TypeScript e unità di misura del ricettario"
```

---

### Task 2: Schema del ricettario

**Files:**
- Create: `lib/ricettario/schema.ts`
- Test: `tests/ricettario/schema.test.ts`

**Interfaces:**
- Consumes: `UNITA` da `lib/ricettario/unita.ts`.
- Produces:
  - costanti readonly `REPARTI`, `TIPI`, `PROTEINE`, `CARBOIDRATI`, `CATEGORIE`, `PASTI`, `STAGIONI` e i tipi `Reparto`, `Tipo`, `Proteina`, `Carboidrato`, `Categoria`, `Pasto`, `Stagione`;
  - `SLUG_RE`;
  - schemi `LibroSchema`, `IngredienteSchema`, `VoceSchema`, `RicettaSchema`, `FileLibriSchema`, `FileIngredientiSchema`, `FileRicetteSchema`;
  - tipi `Libro`, `Ingrediente`, `Voce`, `Ricetta` (output zod, default applicati).

- [ ] **Step 1: Scrivi il test che fallisce**

`tests/ricettario/schema.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { IngredienteSchema, RicettaSchema } from '../../lib/ricettario/schema.ts'

const ricettaValida = {
  slug: 'cous-cous-ceci-zucchine',
  nome: 'Cous cous con ceci e zucchine',
  descrizione: 'Soffriggi zucchine e ceci, condisci il cous cous.',
  tipo: 'web',
  url: 'https://www.esempio.it/cous-cous',
  tempo_min: 15,
  porzioni_base: 2,
  proteina: 'legumi',
  carboidrato: 'cereali',
  verdure: true,
  categoria: 'piatto-unico',
  pasto: 'entrambi',
  stagioni: ['primavera', 'estate'],
  pesante: false,
  tag: ['veloce'],
  ingredienti: [
    { ingrediente: 'cous-cous', quantita: 120, unita: 'g', testo: 'Cous cous 120 g', principale: true },
    { ingrediente: 'prezzemolo', quantita: 1, unita: 'mazzetto', testo: 'Prezzemolo un mazzetto' },
  ],
}

describe('RicettaSchema', () => {
  test('accetta una ricetta completa e applica i default', () => {
    const r = RicettaSchema.parse(ricettaValida)
    expect(r.libro).toBeNull()
    expect(r.archiviata).toBeNull()
    expect(r.dipendenze_libro).toEqual([])
    expect(r.ingredienti?.[1]?.opzionale).toBe(false)
    expect(r.ingredienti?.[1]?.principale).toBe(false)
  })

  test('rifiuta una proteina fuori elenco', () => {
    const esito = RicettaSchema.safeParse({ ...ricettaValida, proteina: 'tofu' })
    expect(esito.success).toBe(false)
  })

  test('rifiuta campi sconosciuti, per esempio il vecchio feedback', () => {
    const esito = RicettaSchema.safeParse({ ...ricettaValida, feedback: 3 })
    expect(esito.success).toBe(false)
  })

  test('rifiuta tempo_min zero, il segnaposto dell import', () => {
    expect(RicettaSchema.safeParse({ ...ricettaValida, tempo_min: 0 }).success).toBe(false)
  })

  test('rifiuta l unità segnaposto "?" dell import', () => {
    const conPunto = {
      ...ricettaValida,
      ingredienti: [{ ingrediente: 'curry', quantita: null, unita: '?', testo: 'Curry un pochino' }],
    }
    expect(RicettaSchema.safeParse(conPunto).success).toBe(false)
  })

  test('accetta ingredienti null (ingredienti non noti)', () => {
    expect(RicettaSchema.safeParse({ ...ricettaValida, ingredienti: null, porzioni_base: null }).success).toBe(true)
  })

  test('rifiuta uno slug con maiuscole o spazi', () => {
    expect(RicettaSchema.safeParse({ ...ricettaValida, slug: 'Cous Cous' }).success).toBe(false)
  })
})

describe('IngredienteSchema', () => {
  test('rifiuta il reparto segnaposto "?" dell import', () => {
    expect(IngredienteSchema.safeParse({ slug: 'curry', nome: 'Curry', reparto: '?' }).success).toBe(false)
  })

  test('applica i default di dispensa e sinonimi', () => {
    const i = IngredienteSchema.parse({ slug: 'aglio', nome: 'Aglio', reparto: 'FRUTTA E VERDURA' })
    expect(i.dispensa).toBe(false)
    expect(i.sinonimi).toEqual([])
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pnpm test tests/ricettario/schema.test.ts`
Expected: FAIL, modulo `schema.ts` non trovato.

- [ ] **Step 3: Implementa**

`lib/ricettario/schema.ts`:

```ts
import { z } from 'zod'
import { UNITA } from './unita.ts'

export const REPARTI = [
  'FRUTTA E VERDURA', 'MACELLERIA', 'PESCHERIA', 'BANCO FRIGO E LATTICINI',
  'PANE E PRODOTTI DA FORNO', 'PASTA RISO E CEREALI', 'SCATOLAME E CONSERVE',
  'CONDIMENTI E DISPENSA',
] as const
export const TIPI = ['web', 'youtube', 'libro', 'casa'] as const
export const PROTEINE = [
  'pesce-fresco', 'pesce-conserva', 'carne-bianca', 'carne-rossa', 'salumi',
  'uova', 'legumi', 'formaggi', 'nessuna',
] as const
export const CARBOIDRATI = ['pasta', 'riso', 'cereali', 'pane', 'patate', 'nessuno'] as const
export const CATEGORIE = [
  'primo', 'zuppa', 'insalata', 'secondo', 'piatto-unico', 'wok', 'panino-piadina',
  'torta-salata', 'bowl', 'pizza-focaccia',
] as const
export const PASTI = ['pranzo', 'cena', 'entrambi'] as const
export const STAGIONI = ['primavera', 'estate', 'autunno', 'inverno'] as const

export type Reparto = (typeof REPARTI)[number]
export type Tipo = (typeof TIPI)[number]
export type Proteina = (typeof PROTEINE)[number]
export type Carboidrato = (typeof CARBOIDRATI)[number]
export type Categoria = (typeof CATEGORIE)[number]
export type Pasto = (typeof PASTI)[number]
export type Stagione = (typeof STAGIONI)[number]

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const slug = z.string().regex(SLUG_RE, 'slug non valido: minuscole, cifre e trattini')
const testo = z.string().trim().min(1)

export const LibroSchema = z.object({ id: slug, titolo: testo }).strict()

export const IngredienteSchema = z.object({
  slug,
  nome: testo,
  reparto: z.enum(REPARTI),
  dispensa: z.boolean().default(false),
  sinonimi: z.array(testo).default([]),
}).strict()

export const VoceSchema = z.object({
  ingrediente: slug,
  quantita: z.number().positive().nullable(),
  unita: z.enum(UNITA),
  testo,
  opzionale: z.boolean().default(false),
  principale: z.boolean().default(false),
}).strict()

export const RicettaSchema = z.object({
  slug,
  nome: testo,
  descrizione: testo,
  tipo: z.enum(TIPI),
  url: z.url().nullable().default(null),
  libro: z.object({ id: slug, pagine: testo }).strict().nullable().default(null),
  dipendenze_libro: z.array(testo).default([]),
  tempo_min: z.number().int().positive(),
  porzioni_base: z.number().int().positive().nullable(),
  proteina: z.enum(PROTEINE),
  carboidrato: z.enum(CARBOIDRATI),
  verdure: z.boolean(),
  categoria: z.enum(CATEGORIE),
  pasto: z.enum(PASTI),
  stagioni: z.array(z.enum(STAGIONI)).min(1),
  pesante: z.boolean(),
  tag: z.array(slug).default([]),
  ingredienti: z.array(VoceSchema).min(1).nullable(),
  archiviata: z.iso.date().nullable().default(null),
  note_curatore: z.string().nullable().default(null),
}).strict()

export const FileLibriSchema = z.object({ libri: z.array(LibroSchema) }).strict()
export const FileIngredientiSchema = z.object({ ingredienti: z.array(IngredienteSchema) }).strict()
export const FileRicetteSchema = z.object({ ricette: z.array(RicettaSchema) }).strict()

export type Libro = z.output<typeof LibroSchema>
export type Ingrediente = z.output<typeof IngredienteSchema>
export type Voce = z.output<typeof VoceSchema>
export type Ricetta = z.output<typeof RicettaSchema>
```

- [ ] **Step 4: Esegui i test**

Run: `pnpm test tests/ricettario && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ricettario/schema.ts tests/ricettario/schema.test.ts
git commit -m "Schema del ricettario con attributi del pianificatore"
```

---

### Task 3: Caricamento, validazione incrociata e `pnpm valida`

**Files:**
- Create: `lib/ricettario/carica.ts`, `lib/ricettario/valida.ts`, `scripts/valida-ricettario.ts`
- Test: `tests/ricettario/carica.test.ts`, `tests/ricettario/valida.test.ts`, fixture in `tests/fixture/ricettario-valido/`

**Interfaces:**
- Consumes: gli schemi e i tipi di Task 2.
- Produces:
  - `type Catalogo = { libri: Libro[]; ingredienti: Ingrediente[]; ricette: Ricetta[] }`;
  - `type Problema = { file: string; percorso: string; messaggio: string }`;
  - `caricaCatalogo(dir: string): Promise<{ catalogo: Catalogo | null; problemi: Problema[] }>`, dove `dir` contiene i tre YAML;
  - `validaCatalogo(c: Catalogo): Problema[]`;
  - `verificaRicettario(dir: string): Promise<{ catalogo: Catalogo | null; problemi: Problema[] }>`, che fa caricamento più validazione (in `valida.ts`).

- [ ] **Step 1: Crea la fixture valida**

`tests/fixture/ricettario-valido/libri.yaml`:

```yaml
libri:
  - {id: basta-un-wok, titolo: Basta un Wok}
```

`tests/fixture/ricettario-valido/ingredienti.yaml`:

```yaml
ingredienti:
  - {slug: ceci-cotti, nome: Ceci cotti, reparto: SCATOLAME E CONSERVE, sinonimi: [Ceci lessati, Ceci già cotti]}
  - {slug: riso, nome: Riso, reparto: PASTA RISO E CEREALI}
  - {slug: olio-extravergine, nome: Olio extravergine, reparto: CONDIMENTI E DISPENSA, dispensa: true}
```

`tests/fixture/ricettario-valido/ricette.yaml`:

```yaml
ricette:
  - slug: riso-ceci
    nome: Riso e ceci
    descrizione: Cuoci il riso e saltalo con i ceci.
    tipo: web
    url: https://www.esempio.it/riso-ceci
    tempo_min: 20
    porzioni_base: 2
    proteina: legumi
    carboidrato: riso
    verdure: false
    categoria: piatto-unico
    pasto: entrambi
    stagioni: [primavera, estate, autunno, inverno]
    pesante: false
    ingredienti:
      - {ingrediente: riso, quantita: 160, unita: g, testo: Riso 160 g, principale: true}
      - {ingrediente: ceci-cotti, quantita: 240, unita: g, testo: Ceci lessati 240 g, principale: true}
      - {ingrediente: olio-extravergine, quantita: 2, unita: cucchiaio, testo: Olio 2 cucchiai}
  - slug: riso-curry-wok
    nome: Riso al curry
    descrizione: Dal libro, saltato nel wok.
    tipo: libro
    libro: {id: basta-un-wok, pagine: 76-77}
    tempo_min: 25
    porzioni_base: null
    proteina: nessuna
    carboidrato: riso
    verdure: true
    categoria: wok
    pasto: cena
    stagioni: [autunno, inverno]
    pesante: false
    ingredienti: null
```

- [ ] **Step 2: Scrivi i test che falliscono**

`tests/ricettario/carica.test.ts`:

```ts
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { caricaCatalogo } from '../../lib/ricettario/carica.ts'

const FIXTURE = fileURLToPath(new URL('../fixture/ricettario-valido', import.meta.url))

async function copiaFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ricettario-'))
  await cp(FIXTURE, dir, { recursive: true })
  return dir
}

describe('caricaCatalogo', () => {
  test('carica la fixture valida senza problemi', async () => {
    const { catalogo, problemi } = await caricaCatalogo(FIXTURE)
    expect(problemi).toEqual([])
    expect(catalogo?.ricette.map((r) => r.slug)).toEqual(['riso-ceci', 'riso-curry-wok'])
  })

  test('file mancante: un problema con il nome del file, niente eccezioni', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vuoto-'))
    const { catalogo, problemi } = await caricaCatalogo(dir)
    expect(catalogo).toBeNull()
    expect(problemi.map((p) => p.file)).toEqual(['libri.yaml', 'ingredienti.yaml', 'ricette.yaml'])
  })

  test('YAML malformato: problema di sintassi sul file giusto', async () => {
    const dir = await copiaFixture()
    await writeFile(join(dir, 'libri.yaml'), 'libri:\n  - {id: a, titolo: A}\n  - {id: b\n')
    const { catalogo, problemi } = await caricaCatalogo(dir)
    expect(catalogo).toBeNull()
    expect(problemi).toHaveLength(1)
    expect(problemi[0]?.file).toBe('libri.yaml')
    expect(problemi[0]?.messaggio).toMatch(/YAML/)
  })

  test('errore di schema: il percorso usa lo slug della ricetta', async () => {
    const dir = await copiaFixture()
    const originale = await readFile(join(dir, 'ricette.yaml'), 'utf8')
    await writeFile(join(dir, 'ricette.yaml'), originale.replace('proteina: legumi', 'proteina: tofu'))
    const { problemi } = await caricaCatalogo(dir)
    expect(problemi).toEqual([
      expect.objectContaining({ file: 'ricette.yaml', percorso: 'riso-ceci.proteina' }),
    ])
  })
})
```

`tests/ricettario/valida.test.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { caricaCatalogo, type Catalogo } from '../../lib/ricettario/carica.ts'
import { validaCatalogo } from '../../lib/ricettario/valida.ts'

const FIXTURE = fileURLToPath(new URL('../fixture/ricettario-valido', import.meta.url))

async function base(): Promise<Catalogo> {
  const { catalogo } = await caricaCatalogo(FIXTURE)
  if (!catalogo) throw new Error('fixture non valida')
  return structuredClone(catalogo)
}

function messaggi(c: Catalogo): string[] {
  return validaCatalogo(c).map((p) => `${p.percorso}: ${p.messaggio}`)
}

describe('validaCatalogo', () => {
  test('la fixture valida non ha problemi', async () => {
    expect(validaCatalogo(await base())).toEqual([])
  })

  test('slug di ricetta duplicato', async () => {
    const c = await base()
    c.ricette.push({ ...c.ricette[0]! })
    expect(messaggi(c)).toContain('riso-ceci.slug: slug duplicato')
  })

  test('ingrediente non in anagrafica', async () => {
    const c = await base()
    c.ricette[0]!.ingredienti![0]!.ingrediente = 'riso-venere'
    expect(messaggi(c)).toContain('riso-ceci.ingredienti.0: ingrediente "riso-venere" non in anagrafica')
  })

  test('libro non in libri.yaml', async () => {
    const c = await base()
    c.ricette[1]!.libro = { id: 'altro-libro', pagine: '1' }
    expect(messaggi(c)).toContain('riso-curry-wok.libro: libro "altro-libro" non in libri.yaml')
  })

  test('web senza url', async () => {
    const c = await base()
    c.ricette[0]!.url = null
    expect(messaggi(c)).toContain('riso-ceci.url: obbligatorio per il tipo web')
  })

  test('casa con url', async () => {
    const c = await base()
    c.ricette[0]!.tipo = 'casa'
    expect(messaggi(c)).toContain('riso-ceci.url: una ricetta di tipo casa non ha url')
  })

  test('libro senza campo libro', async () => {
    const c = await base()
    c.ricette[1]!.libro = null
    expect(messaggi(c)).toContain('riso-curry-wok.libro: obbligatorio per il tipo libro')
  })

  test('ingredienti senza porzioni_base', async () => {
    const c = await base()
    c.ricette[0]!.porzioni_base = null
    expect(messaggi(c)).toContain('riso-ceci.porzioni_base: obbligatorio quando ci sono ingredienti')
  })

  test('unità scalabile senza quantità', async () => {
    const c = await base()
    c.ricette[0]!.ingredienti![0]!.quantita = null
    expect(messaggi(c)).toContain('riso-ceci.ingredienti.0: l unità "g" richiede una quantità')
  })

  test('nessun ingrediente principale', async () => {
    const c = await base()
    for (const v of c.ricette[0]!.ingredienti!) v.principale = false
    expect(messaggi(c)).toContain('riso-ceci.ingredienti: serve almeno un ingrediente principale')
  })

  test('stesso sinonimo su due ingredienti canonici', async () => {
    const c = await base()
    c.ingredienti[1]!.sinonimi = ['Ceci lessati']
    expect(messaggi(c)).toContain('riso.sinonimi: "Ceci lessati" è già sinonimo di ceci-cotti')
  })

  test('slug di ingrediente duplicato', async () => {
    const c = await base()
    c.ingredienti.push({ ...c.ingredienti[0]! })
    expect(messaggi(c)).toContain('ceci-cotti.slug: slug duplicato')
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `pnpm test tests/ricettario`
Expected: FAIL, moduli `carica.ts` e `valida.ts` non trovati.

- [ ] **Step 4: Implementa il caricamento**

`lib/ricettario/carica.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { z } from 'zod'
import {
  FileIngredientiSchema, FileLibriSchema, FileRicetteSchema,
  type Ingrediente, type Libro, type Ricetta,
} from './schema.ts'

export type Catalogo = { libri: Libro[]; ingredienti: Ingrediente[]; ricette: Ricetta[] }
export type Problema = { file: string; percorso: string; messaggio: string }

// Nei percorsi degli errori l'indice di una scheda diventa il suo slug (o id):
// "ricette.3.proteina" si legge meglio come "riso-ceci.proteina".
function percorso(dati: unknown, path: PropertyKey[]): string {
  const [radice, indice, ...resto] = path
  if (typeof indice === 'number' && typeof radice === 'string') {
    const elenco = (dati as Record<string, unknown>)?.[radice]
    const voce = Array.isArray(elenco) ? elenco[indice] as Record<string, unknown> | undefined : undefined
    const nome = voce?.slug ?? voce?.id
    if (typeof nome === 'string') return [nome, ...resto].map(String).join('.')
  }
  return path.map(String).join('.')
}

async function leggi<S extends z.ZodType>(
  dir: string, file: string, schema: S,
): Promise<{ valore: z.output<S> | null; problemi: Problema[] }> {
  let testo: string
  try {
    testo = await readFile(join(dir, file), 'utf8')
  } catch {
    return { valore: null, problemi: [{ file, percorso: '', messaggio: 'file mancante' }] }
  }
  let dati: unknown
  try {
    dati = parse(testo, { uniqueKeys: true })
  } catch (e) {
    return { valore: null, problemi: [{ file, percorso: '', messaggio: `YAML non valido: ${(e as Error).message}` }] }
  }
  const esito = schema.safeParse(dati)
  if (esito.success) return { valore: esito.data, problemi: [] }
  return {
    valore: null,
    problemi: esito.error.issues.map((i) => ({ file, percorso: percorso(dati, i.path), messaggio: i.message })),
  }
}

export async function caricaCatalogo(dir: string): Promise<{ catalogo: Catalogo | null; problemi: Problema[] }> {
  const libri = await leggi(dir, 'libri.yaml', FileLibriSchema)
  const ingredienti = await leggi(dir, 'ingredienti.yaml', FileIngredientiSchema)
  const ricette = await leggi(dir, 'ricette.yaml', FileRicetteSchema)
  const problemi = [...libri.problemi, ...ingredienti.problemi, ...ricette.problemi]
  if (!libri.valore || !ingredienti.valore || !ricette.valore) return { catalogo: null, problemi }
  return {
    catalogo: { libri: libri.valore.libri, ingredienti: ingredienti.valore.ingredienti, ricette: ricette.valore.ricette },
    problemi,
  }
}
```

- [ ] **Step 5: Implementa la validazione incrociata**

`lib/ricettario/valida.ts`:

```ts
import { caricaCatalogo, type Catalogo, type Problema } from './carica.ts'
import { scalabile } from './unita.ts'

function duplicati(chiavi: string[]): Set<string> {
  const visti = new Set<string>()
  const doppi = new Set<string>()
  for (const k of chiavi) (visti.has(k) ? doppi : visti).add(k)
  return doppi
}

export function validaCatalogo(c: Catalogo): Problema[] {
  const problemi: Problema[] = []
  const p = (file: string, percorso: string, messaggio: string) => problemi.push({ file, percorso, messaggio })

  for (const id of duplicati(c.libri.map((l) => l.id))) p('libri.yaml', `${id}.id`, 'id duplicato')

  for (const s of duplicati(c.ingredienti.map((i) => i.slug))) p('ingredienti.yaml', `${s}.slug`, 'slug duplicato')
  const proprietario = new Map<string, string>()
  for (const i of c.ingredienti) {
    for (const sin of i.sinonimi) {
      const gia = proprietario.get(sin)
      if (gia && gia !== i.slug) p('ingredienti.yaml', `${i.slug}.sinonimi`, `"${sin}" è già sinonimo di ${gia}`)
      else proprietario.set(sin, i.slug)
    }
  }

  const libri = new Set(c.libri.map((l) => l.id))
  const ingredienti = new Set(c.ingredienti.map((i) => i.slug))
  for (const s of duplicati(c.ricette.map((r) => r.slug))) p('ricette.yaml', `${s}.slug`, 'slug duplicato')

  for (const r of c.ricette) {
    const f = 'ricette.yaml'
    if ((r.tipo === 'web' || r.tipo === 'youtube') && !r.url) p(f, `${r.slug}.url`, `obbligatorio per il tipo ${r.tipo}`)
    if (r.tipo === 'casa' && r.url) p(f, `${r.slug}.url`, 'una ricetta di tipo casa non ha url')
    if (r.tipo === 'libro' && !r.libro) p(f, `${r.slug}.libro`, 'obbligatorio per il tipo libro')
    if (r.tipo !== 'libro' && r.libro) p(f, `${r.slug}.libro`, 'solo le ricette di tipo libro hanno il campo libro')
    if (r.libro && !libri.has(r.libro.id)) p(f, `${r.slug}.libro`, `libro "${r.libro.id}" non in libri.yaml`)
    if (r.ingredienti === null) continue
    if (r.porzioni_base === null) p(f, `${r.slug}.porzioni_base`, 'obbligatorio quando ci sono ingredienti')
    r.ingredienti.forEach((v, n) => {
      if (!ingredienti.has(v.ingrediente)) p(f, `${r.slug}.ingredienti.${n}`, `ingrediente "${v.ingrediente}" non in anagrafica`)
      if (scalabile(v.unita) && v.quantita === null) p(f, `${r.slug}.ingredienti.${n}`, `l unità "${v.unita}" richiede una quantità`)
    })
    if (!r.ingredienti.some((v) => v.principale)) p(f, `${r.slug}.ingredienti`, 'serve almeno un ingrediente principale')
  }
  return problemi
}

export async function verificaRicettario(dir: string): Promise<{ catalogo: Catalogo | null; problemi: Problema[] }> {
  const { catalogo, problemi } = await caricaCatalogo(dir)
  if (!catalogo) return { catalogo, problemi }
  return { catalogo, problemi: [...problemi, ...validaCatalogo(catalogo)] }
}
```

- [ ] **Step 6: Esegui i test**

Run: `pnpm test tests/ricettario && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Scrivi la CLI**

`scripts/valida-ricettario.ts`:

```ts
// Uso: pnpm valida [cartella]  (default: ricettario/)
import { verificaRicettario } from '../lib/ricettario/valida.ts'

const dir = process.argv[2] ?? 'ricettario'
const { catalogo, problemi } = await verificaRicettario(dir)
for (const p of problemi) console.log(`${p.file} ${p.percorso}: ${p.messaggio}`)
if (problemi.length > 0 || !catalogo) {
  console.log(`\nRICETTARIO NON VALIDO: ${problemi.length} problemi`)
  process.exit(1)
}
console.log(`Ricettario valido: ${catalogo.ricette.length} ricette, ${catalogo.ingredienti.length} ingredienti, ${catalogo.libri.length} libri`)
```

Run: `pnpm valida tests/fixture/ricettario-valido`
Expected: `Ricettario valido: 2 ricette, 3 ingredienti, 1 libri`, codice di uscita 0.

Run: `pnpm valida /tmp/non-esiste; echo $?`
Expected: tre righe "file mancante", `RICETTARIO NON VALIDO`, e `1`.

- [ ] **Step 8: Commit**

```bash
git add lib/ricettario scripts/valida-ricettario.ts tests
git commit -m "Caricamento e validazione del ricettario, comando pnpm valida"
```

---

### Task 4: Interpretazione di quantità e tempi del vecchio ricettario

**Files:**
- Create: `lib/importa/quantita.ts`, `lib/importa/tempo.ts`
- Test: `tests/importa/quantita.test.ts`, `tests/importa/tempo.test.ts`

**Interfaces:**
- Consumes: `type Unita`, `eUnita` (Task 1).
- Produces:
  - `type EsitoQuantita = { esito: 'ok'; quantita: number | null; unita: Unita } | { esito: 'da-confermare'; quantita: number | null; unita: Unita; motivo: string } | { esito: 'non-interpretato'; motivo: string }`;
  - `interpretaQuantita(grezza: string | number | null): EsitoQuantita`;
  - `type EsitoTempo = { esito: 'ok'; minuti: number } | { esito: 'da-confermare'; minuti: number; motivo: string } | { esito: 'non-interpretato'; motivo: string }`;
  - `interpretaTempo(grezzo: string): EsitoTempo`.

I casi di test sono tutte le forme non numeriche presenti oggi in `../meal_planner/ricettario/ricette.yaml`, più i casi base.

- [ ] **Step 1: Scrivi i test che falliscono**

`tests/importa/quantita.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { interpretaQuantita } from '../../lib/importa/quantita.ts'

describe('interpretaQuantita: forme sicure', () => {
  test.each([
    ['500 g', 500, 'g'], ['1,5 kg', 1.5, 'kg'], ['200 ml', 200, 'ml'], ['2', 2, 'pz'],
    ['1/2', 0.5, 'pz'], ['1 bicchiere', 1, 'bicchiere'], ['1/2 bicchiere', 0.5, 'bicchiere'],
    ['2 bustine', 2, 'bustina'], ['1 bustina', 1, 'bustina'], ['1 ciuffo', 1, 'ciuffo'],
    ['2 spicchi', 2, 'spicchio'], ['1 spicchio', 1, 'spicchio'], ['6 fette', 6, 'fetta'],
    ['5 rametti', 5, 'rametto'], ['1 goccio', 1, 'goccio'], ['1 foglia', 1, 'foglia'],
    ['2 cucchiai', 2, 'cucchiaio'], ['1 cucchiaino', 1, 'cucchiaino'], ['1 vasetto', 1, 'vasetto'],
    ['un pizzico', 1, 'pizzico'], ['1 pizzico', 1, 'pizzico'], ['un mazzetto', 1, 'mazzetto'],
    ['1 mazzetto', 1, 'mazzetto'],
  ])('%s → %s %s', (testo, quantita, unita) => {
    expect(interpretaQuantita(testo)).toEqual({ esito: 'ok', quantita, unita })
  })

  test.each(['q.b.', 'a piacere', 'Q.B.'])('%s → q.b. senza quantità', (testo) => {
    expect(interpretaQuantita(testo)).toEqual({ esito: 'ok', quantita: null, unita: 'q.b.' })
  })

  test('un numero YAML (quantita: 2 senza virgolette) vale come testo', () => {
    expect(interpretaQuantita(2)).toEqual({ esito: 'ok', quantita: 2, unita: 'pz' })
  })
})

describe('interpretaQuantita: da confermare', () => {
  test.each([
    ['8/10', 10, 'pz'], ['500-600 g', 600, 'g'], ['2-3 foglie', 3, 'foglia'],
  ])('intervallo %s → il massimo, da confermare', (testo, quantita, unita) => {
    const e = interpretaQuantita(testo)
    expect(e).toMatchObject({ esito: 'da-confermare', quantita, unita })
  })

  test.each([
    ['1 cucchiaino abbondante', 1, 'cucchiaino'], ['3 cucchiai circa', 3, 'cucchiaio'],
    ['145 g crudo (330 g cotto)', 145, 'g'], ['200 g circa (2 fette)', 200, 'g'],
    ['15 cucchiai (per rosolare le melanzane)', 15, 'cucchiaio'], ['1 vaschetta da 250 g', 1, 'vaschetta'],
  ])('testo aggiuntivo %s → %s %s, da confermare', (testo, quantita, unita) => {
    const e = interpretaQuantita(testo)
    expect(e).toMatchObject({ esito: 'da-confermare', quantita, unita })
    if (e.esito === 'da-confermare') expect(e.motivo).toMatch(/testo aggiuntivo/)
  })
})

describe('interpretaQuantita: non interpretate', () => {
  test.each(['un piccolo pezzo', 'per servire, facoltativo', '', 'una manciata'])('%s', (testo) => {
    expect(interpretaQuantita(testo).esito).toBe('non-interpretato')
  })

  test('null → non interpretato', () => {
    expect(interpretaQuantita(null).esito).toBe('non-interpretato')
  })
})
```

`tests/importa/tempo.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { interpretaTempo } from '../../lib/importa/tempo.ts'

describe('interpretaTempo', () => {
  test.each([['10 min', 10], ['15 min', 15], ['50 min', 50]])('%s → %i', (t, m) => {
    expect(interpretaTempo(t)).toEqual({ esito: 'ok', minuti: m })
  })

  test.each([['15-20 min', 20], ['25-30 min', 30]])('intervallo %s → %i, da confermare', (t, m) => {
    expect(interpretaTempo(t)).toMatchObject({ esito: 'da-confermare', minuti: m })
  })

  test('somma di tempi con tempo passivo, da confermare', () => {
    expect(interpretaTempo('20 min + 40 min forno')).toMatchObject({ esito: 'da-confermare', minuti: 60 })
  })

  test.each(['mezz ora', '', 'veloce'])('%s → non interpretato', (t) => {
    expect(interpretaTempo(t).esito).toBe('non-interpretato')
  })
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm test tests/importa`
Expected: FAIL, moduli non trovati.

- [ ] **Step 3: Implementa le quantità**

`lib/importa/quantita.ts`:

```ts
import { eUnita, type Unita } from '../ricettario/unita.ts'

export type EsitoQuantita =
  | { esito: 'ok'; quantita: number | null; unita: Unita }
  | { esito: 'da-confermare'; quantita: number | null; unita: Unita; motivo: string }
  | { esito: 'non-interpretato'; motivo: string }

const PLURALI: Record<string, Unita> = {
  cucchiai: 'cucchiaio', cucchiaini: 'cucchiaino', spicchi: 'spicchio', bicchieri: 'bicchiere',
  bustine: 'bustina', foglie: 'foglia', rametti: 'rametto', fette: 'fetta', vasetti: 'vasetto',
  vaschette: 'vaschetta', mazzetti: 'mazzetto', ciuffi: 'ciuffo', gocci: 'goccio', pizzichi: 'pizzico',
}
const UNO = new Set(['un', 'uno', 'una', "un'"])
const QB = new Set(['q.b.', 'qb', 'a piacere'])

// Nessuna parola = pezzi ("2" → 2 pz). Parola sconosciuta = null.
function unitaDa(parola: string | undefined): Unita | null {
  if (parola === undefined) return 'pz'
  const p = parola.toLowerCase()
  if (eUnita(p)) return p
  return PLURALI[p] ?? null
}

// "2", "1,5", "1/2". Una frazione vale solo se è davvero una frazione
// (numeratore < denominatore <= 4): "8/10" nel vecchio ricettario è un intervallo.
function numero(t: string): number | null {
  if (UNO.has(t.toLowerCase())) return 1
  const fr = /^(\d+)\/(\d+)$/.exec(t)
  if (fr) {
    const a = Number(fr[1]), b = Number(fr[2])
    return a < b && b <= 4 ? a / b : null
  }
  if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'))
  return null
}

export function interpretaQuantita(grezza: string | number | null): EsitoQuantita {
  if (grezza === null) return { esito: 'non-interpretato', motivo: 'quantità assente' }
  const t = String(grezza).trim().replace(/\s+/g, ' ')
  if (QB.has(t.toLowerCase())) return { esito: 'ok', quantita: null, unita: 'q.b.' }

  const semplice = /^(\S+)(?: (\S+))?$/.exec(t)
  if (semplice) {
    const n = numero(semplice[1]!)
    const u = unitaDa(semplice[2])
    if (n !== null && u !== null) return { esito: 'ok', quantita: n, unita: u }
  }

  const intervallo = /^(\d+) ?[-/] ?(\d+)(?: (\S+))?$/.exec(t)
  if (intervallo) {
    const u = unitaDa(intervallo[3])
    if (u !== null) {
      return {
        esito: 'da-confermare', quantita: Number(intervallo[2]), unita: u,
        motivo: `intervallo ${intervallo[1]}-${intervallo[2]}: proposto il massimo`,
      }
    }
  }

  const conResto = /^(\S+) (\S+) (.+)$/.exec(t)
  if (conResto) {
    const n = numero(conResto[1]!)
    const u = unitaDa(conResto[2])
    if (n !== null && u !== null) {
      return { esito: 'da-confermare', quantita: n, unita: u, motivo: `testo aggiuntivo: "${conResto[3]}"` }
    }
  }
  return { esito: 'non-interpretato', motivo: `forma non riconosciuta: "${t}"` }
}
```

- [ ] **Step 4: Implementa i tempi**

`lib/importa/tempo.ts`:

```ts
export type EsitoTempo =
  | { esito: 'ok'; minuti: number }
  | { esito: 'da-confermare'; minuti: number; motivo: string }
  | { esito: 'non-interpretato'; motivo: string }

export function interpretaTempo(grezzo: string): EsitoTempo {
  const t = grezzo.trim()
  const semplice = /^(\d+) ?min$/.exec(t)
  if (semplice) return { esito: 'ok', minuti: Number(semplice[1]) }
  const intervallo = /^(\d+) ?- ?(\d+) ?min$/.exec(t)
  if (intervallo) {
    return { esito: 'da-confermare', minuti: Number(intervallo[2]), motivo: `intervallo "${t}": proposto il massimo` }
  }
  const parti = [...t.matchAll(/(\d+) ?min/g)].map((m) => Number(m[1]))
  if (parti.length >= 2) {
    return {
      esito: 'da-confermare', minuti: parti.reduce((a, b) => a + b, 0),
      motivo: `somma di tempi "${t}": include tempo passivo`,
    }
  }
  return { esito: 'non-interpretato', motivo: `tempo non riconosciuto: "${t}"` }
}
```

- [ ] **Step 5: Esegui i test**

Run: `pnpm test tests/importa && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/importa tests/importa
git commit -m "Import: interpretazione di quantità e tempi del vecchio ricettario"
```

---

### Task 5: Anagrafica degli ingredienti e attributi proposti

**Files:**
- Create: `lib/importa/vecchio.ts`, `lib/importa/ingredienti.ts`, `lib/importa/attributi.ts`
- Test: `tests/importa/ingredienti.test.ts`, `tests/importa/attributi.test.ts`

**Interfaces:**
- Consumes: tipi di dominio (Task 2).
- Produces:
  - `vecchio.ts`: tipi `VecchiaVoce = { nome: string; quantita: string | number | null }`, `VecchiaRicetta`, `VecchioSlot`, `VecchioMenu`, `Giorno = 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'`;
  - `ingredienti.ts`: `slugIngrediente(nome: string): string`, `nomeVisualizzato(nome: string): string`, `eDispensa(slug: string): boolean`, `type IngredienteProposto = { slug: string; nome: string; reparto: Reparto | null; dispensa: boolean; sinonimi: string[] }`, `proponiAnagrafica(nomi: string[], repartoDaSpesa: Map<string, Reparto>): IngredienteProposto[]`;
  - `attributi.ts`: `type Proposta<T> = { valore: T; certo: boolean; motivo?: string }`, `type AttributiProposti`, `proponiAttributi(r: VecchiaRicetta, repartoDi: (nome: string) => Reparto | null): AttributiProposti`.

- [ ] **Step 1: Scrivi i tipi del vecchio formato**

`lib/importa/vecchio.ts`:

```ts
// Il formato di ../meal_planner (ricettario/ricette.yaml, archivio.yaml,
// menu/*/menu.yaml), solo nei campi che l'import usa. Si legge, non si scrive.
export type Giorno = 'lun' | 'mar' | 'mer' | 'gio' | 'ven' | 'sab' | 'dom'

export type VecchiaVoce = { nome: string; quantita: string | number | null }

export type VecchiaRicetta = {
  id: string
  nome: string
  descrizione: string
  tipo: 'web' | 'youtube' | 'libro' | 'casa'
  url?: string | null
  libro?: { titolo: string; pagine: string | number; file?: string } | null
  dipendenze_libro?: string[] | null
  tempo: string
  porzioni_base?: number | null
  ingredienti: VecchiaVoce[] | null
  collaudata?: boolean
  feedback?: number | null
  tag?: string[] | null
  storico?: { settimana: string; pasto: string; cucinata: boolean | null }[] | null
  note?: string | null
  archiviata?: string | null
}

export type VecchioSlot = { ricetta?: string | null; porzioni?: number | null; libero?: string | null; nome?: string | null }

export type VecchioMenu = {
  settimana: { inizio: string; fine?: string }
  giorni: { giorno: Giorno; data: string; pranzo: VecchioSlot; cena: VecchioSlot }[]
  spesa?: { reparto: string; voci: { nome: string; quantita?: string | number | null }[] }[] | null
}
```

- [ ] **Step 2: Scrivi i test che falliscono**

`tests/importa/ingredienti.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { eDispensa, nomeVisualizzato, proponiAnagrafica, slugIngrediente } from '../../lib/importa/ingredienti.ts'
import type { Reparto } from '../../lib/ricettario/schema.ts'

describe('slugIngrediente e nomeVisualizzato', () => {
  test.each([
    ["Ceci gia' cotti", 'ceci-gia-cotti', 'Ceci già cotti'],
    ['Pollo già cotto', 'pollo-gia-cotto', 'Pollo già cotto'],
    ['Cipolla rossa di Tropea (o 1 cipollotto)', 'cipolla-rossa-di-tropea', 'Cipolla rossa di Tropea'],
    ['Salsa di soia (senza glutine)', 'salsa-di-soia', 'Salsa di soia'],
    ['Olio extravergine d\'oliva', 'olio-extravergine-doliva', 'Olio extravergine d\'oliva'],
  ])('%s → %s / %s', (nome, slug, visualizzato) => {
    expect(slugIngrediente(nome)).toBe(slug)
    expect(nomeVisualizzato(nome)).toBe(visualizzato)
  })
})

describe('eDispensa', () => {
  test.each(['olio-extravergine', 'sale', 'sale-grosso', 'pepe', 'pepe-nero', 'aceto-balsamico', 'curry', 'acqua'])(
    '%s è dispensa', (s) => expect(eDispensa(s)).toBe(true))
  test.each(['peperone-rosso', 'salmone', 'salsa-di-soia', 'acciughe'])(
    '%s non è dispensa', (s) => expect(eDispensa(s)).toBe(false))
})

describe('proponiAnagrafica', () => {
  const spesa = new Map<string, Reparto>([['Zucchine', 'FRUTTA E VERDURA'], ['Ceci lessati', 'SCATOLAME E CONSERVE']])

  test('unisce i nomi con lo stesso slug e tiene gli altri come sinonimi', () => {
    const a = proponiAnagrafica(["Ceci gia' cotti", 'Ceci già cotti', 'Zucchine'], spesa)
    expect(a).toEqual([
      { slug: 'ceci-gia-cotti', nome: 'Ceci già cotti', reparto: null, dispensa: false, sinonimi: [] },
      { slug: 'zucchine', nome: 'Zucchine', reparto: 'FRUTTA E VERDURA', dispensa: false, sinonimi: [] },
    ])
  })

  test('il reparto viene dalla spesa dei vecchi menu, per nome esatto', () => {
    const [ceci] = proponiAnagrafica(['Ceci lessati'], spesa)
    expect(ceci?.reparto).toBe('SCATOLAME E CONSERVE')
  })

  test('gli ingredienti di dispensa vanno in CONDIMENTI E DISPENSA', () => {
    const [olio] = proponiAnagrafica(['Olio extravergine'], spesa)
    expect(olio).toMatchObject({ dispensa: true, reparto: 'CONDIMENTI E DISPENSA' })
  })

  test('un nome originale diverso dal nome visualizzato diventa sinonimo', () => {
    const [c] = proponiAnagrafica(['Cipolla rossa di Tropea (o 1 cipollotto)'], spesa)
    expect(c?.sinonimi).toEqual(['Cipolla rossa di Tropea (o 1 cipollotto)'])
  })
})
```

`tests/importa/attributi.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { proponiAttributi } from '../../lib/importa/attributi.ts'
import type { VecchiaRicetta } from '../../lib/importa/vecchio.ts'
import type { Reparto } from '../../lib/ricettario/schema.ts'

function ricetta(tag: string[], ingredienti: string[] = []): VecchiaRicetta {
  return {
    id: 'x', nome: 'X', descrizione: 'X', tipo: 'web', tempo: '20 min', porzioni_base: 2, tag,
    ingredienti: ingredienti.map((nome) => ({ nome, quantita: '100 g' })),
  }
}
const repartoDi = (nome: string): Reparto | null => (nome === 'Zucchine' ? 'FRUTTA E VERDURA' : null)

describe('proponiAttributi', () => {
  test('pollo → carne bianca, certo', () => {
    expect(proponiAttributi(ricetta(['pollo']), repartoDi).proteina).toEqual({ valore: 'carne-bianca', certo: true })
  })

  test('pesce → pesce fresco, da confermare (fresco o in scatola?)', () => {
    expect(proponiAttributi(ricetta(['pesce']), repartoDi).proteina).toMatchObject({ valore: 'pesce-fresco', certo: false })
  })

  test('nessuna proteina nei tag → nessuna, da confermare', () => {
    expect(proponiAttributi(ricetta(['vegetariano']), repartoDi).proteina).toMatchObject({ valore: 'nessuna', certo: false })
  })

  test('pasta → carboidrato pasta, categoria primo, solo pranzo', () => {
    const a = proponiAttributi(ricetta(['pasta']), repartoDi)
    expect(a.carboidrato).toEqual({ valore: 'pasta', certo: true })
    expect(a.categoria).toEqual({ valore: 'primo', certo: true })
    expect(a.pasto).toEqual({ valore: 'pranzo', certo: true })
  })

  test('pane-wrap → pane', () => {
    expect(proponiAttributi(ricetta(['pane-wrap']), repartoDi).carboidrato.valore).toBe('pane')
  })

  test('wok → categoria wok, certo', () => {
    expect(proponiAttributi(ricetta(['wok', 'riso']), repartoDi).categoria).toEqual({ valore: 'wok', certo: true })
  })

  test('stagioni dai tag; senza tag stagionali tutto l anno da confermare', () => {
    expect(proponiAttributi(ricetta(['autunno']), repartoDi).stagioni).toEqual({ valore: ['autunno'], certo: true })
    expect(proponiAttributi(ricetta([]), repartoDi).stagioni).toMatchObject({
      valore: ['primavera', 'estate', 'autunno', 'inverno'], certo: false,
    })
  })

  test('verdure dal reparto degli ingredienti, sempre da confermare', () => {
    expect(proponiAttributi(ricetta([], ['Zucchine']), repartoDi).verdure).toMatchObject({ valore: true, certo: false })
    expect(proponiAttributi(ricetta([], ['Riso']), repartoDi).verdure).toMatchObject({ valore: false, certo: false })
  })

  test('i tag usati dagli attributi escono dai tag, gli altri restano', () => {
    expect(proponiAttributi(ricetta(['pasta', 'veloce', 'ricetta-di-casa', 'skottle']), repartoDi).tag)
      .toEqual(['veloce', 'skottle'])
  })
})
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `pnpm test tests/importa`
Expected: FAIL, moduli `ingredienti.ts` e `attributi.ts` non trovati.

- [ ] **Step 4: Implementa l'anagrafica proposta**

`lib/importa/ingredienti.ts`:

```ts
import type { Reparto } from '../ricettario/schema.ts'

const ACCENTI: Record<string, string> = { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' }

function senzaParentesi(nome: string): string {
  return nome.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

// "gia'" → "già": nel vecchio ricettario gli accenti finali sono apostrofi.
export function nomeVisualizzato(nome: string): string {
  return senzaParentesi(nome).replace(/([aeiouAEIOU])'(?=\s|$)/g, (_, v: string) => ACCENTI[v] ?? v)
}

export function slugIngrediente(nome: string): string {
  return senzaParentesi(nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const DISPENSA_PREFISSI = ['olio', 'sale', 'pepe', 'aceto', 'acqua']
const SPEZIE = new Set(['curry', 'paprika', 'cumino', 'curcuma', 'origano', 'noce-moscata', 'cannella'])

export function eDispensa(slug: string): boolean {
  return SPEZIE.has(slug) || DISPENSA_PREFISSI.some((p) => slug === p || slug.startsWith(`${p}-`))
}

export type IngredienteProposto = { slug: string; nome: string; reparto: Reparto | null; dispensa: boolean; sinonimi: string[] }

export function proponiAnagrafica(nomi: string[], repartoDaSpesa: Map<string, Reparto>): IngredienteProposto[] {
  const perSlug = new Map<string, IngredienteProposto>()
  for (const originale of nomi) {
    const slug = slugIngrediente(originale)
    let voce = perSlug.get(slug)
    if (!voce) {
      const dispensa = eDispensa(slug)
      voce = { slug, nome: nomeVisualizzato(originale), reparto: dispensa ? 'CONDIMENTI E DISPENSA' : null, dispensa, sinonimi: [] }
      perSlug.set(slug, voce)
    }
    voce.reparto ??= repartoDaSpesa.get(originale) ?? null
    const diverso = senzaParentesi(originale) !== originale || nomeVisualizzato(originale) !== voce.nome
    if (diverso && !voce.sinonimi.includes(originale)) {
      voce.sinonimi.push(originale)
    }
  }
  return [...perSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug))
}
```

Nota sui sinonimi: un nome originale entra tra i sinonimi se aveva delle parentesi, oppure se, una volta normalizzato, è diverso dal nome della voce (stesso slug, grafia diversa). Una differenza solo di accenti scritti con l'apostrofo non conta: `Ceci gia' cotti` e `Ceci già cotti` producono la stessa voce senza sinonimi, come chiede il primo test.

- [ ] **Step 5: Implementa gli attributi proposti**

`lib/importa/attributi.ts`:

```ts
import {
  STAGIONI,
  type Carboidrato, type Categoria, type Pasto, type Proteina, type Reparto, type Stagione,
} from '../ricettario/schema.ts'
import type { VecchiaRicetta } from './vecchio.ts'

export type Proposta<T> = { valore: T; certo: boolean; motivo?: string }
export type AttributiProposti = {
  proteina: Proposta<Proteina>
  carboidrato: Proposta<Carboidrato>
  verdure: Proposta<boolean>
  categoria: Proposta<Categoria>
  pasto: Proposta<Pasto>
  stagioni: Proposta<Stagione[]>
  pesante: Proposta<boolean>
  tag: string[]
}

// In ordine di priorità: se una ricetta ha più tag proteici vince il primo.
const PROTEINE_DA_TAG: [string, Proteina, boolean, string?][] = [
  ['pesce', 'pesce-fresco', false, 'pesce: fresco o in scatola?'],
  ['pollo', 'carne-bianca', true],
  ['carne', 'carne-rossa', false, 'carne: rossa, bianca o salumi?'],
  ['legumi', 'legumi', true],
  ['uova', 'uova', true],
]
const CARBOIDRATI_DA_TAG: [string, Carboidrato][] = [
  ['pasta', 'pasta'], ['riso', 'riso'], ['cereali', 'cereali'], ['pane-wrap', 'pane'], ['patate', 'patate'],
]
const TAG_ASSORBITI = new Set([
  'pesce', 'pollo', 'carne', 'uova', 'legumi', 'vegetariano', 'pasta', 'riso', 'cereali', 'pane-wrap',
  'patate', 'ricetta-di-casa', 'libro', ...STAGIONI,
])

export function proponiAttributi(r: VecchiaRicetta, repartoDi: (nome: string) => Reparto | null): AttributiProposti {
  const tag = r.tag ?? []

  const proteine = PROTEINE_DA_TAG.filter(([t]) => tag.includes(t))
  const [primaP] = proteine
  const proteina: Proposta<Proteina> = !primaP
    ? { valore: 'nessuna', certo: false, motivo: 'nessuna proteina nei tag: vegetariana o formaggi?' }
    : proteine.length > 1
      ? { valore: primaP[1], certo: false, motivo: `più proteine nei tag: ${proteine.map(([t]) => t).join(', ')}` }
      : primaP[2] ? { valore: primaP[1], certo: true } : { valore: primaP[1], certo: false, motivo: primaP[3]! }

  const carbo = CARBOIDRATI_DA_TAG.filter(([t]) => tag.includes(t))
  const [primoC] = carbo
  const carboidrato: Proposta<Carboidrato> = !primoC
    ? { valore: 'nessuno', certo: false, motivo: 'nessun carboidrato nei tag' }
    : carbo.length > 1
      ? { valore: primoC[1], certo: false, motivo: `più carboidrati nei tag: ${carbo.map(([t]) => t).join(', ')}` }
      : { valore: primoC[1], certo: true }

  const categoria: Proposta<Categoria> = tag.includes('wok')
    ? { valore: 'wok', certo: true }
    : carboidrato.valore === 'pasta' ? { valore: 'primo', certo: true }
      : carboidrato.valore === 'pane' ? { valore: 'panino-piadina', certo: false, motivo: 'pane: panino o piadina?' }
        : { valore: 'piatto-unico', certo: false, motivo: 'categoria da scegliere' }

  const pasto: Proposta<Pasto> = carboidrato.valore === 'pasta'
    ? { valore: 'pranzo', certo: true }
    : { valore: 'entrambi', certo: true }

  const stagioniTag = STAGIONI.filter((s) => tag.includes(s))
  const stagioni: Proposta<Stagione[]> = stagioniTag.length > 0
    ? { valore: stagioniTag, certo: true }
    : { valore: [...STAGIONI], certo: false, motivo: "nessuna stagione nei tag: tutto l'anno?" }

  const conVerdura = (r.ingredienti ?? []).some((v) => repartoDi(v.nome) === 'FRUTTA E VERDURA')
  const verdure: Proposta<boolean> = { valore: conVerdura, certo: false, motivo: 'dedotto dal reparto degli ingredienti' }

  const pesante: Proposta<boolean> = { valore: false, certo: false, motivo: 'fritto o pesante?' }

  return {
    proteina, carboidrato, verdure, categoria, pasto, stagioni, pesante,
    tag: tag.filter((t) => !TAG_ASSORBITI.has(t)),
  }
}
```

- [ ] **Step 6: Esegui i test**

Run: `pnpm test tests/importa && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/importa tests/importa
git commit -m "Import: anagrafica ingredienti e attributi proposti"
```

---

### Task 6: Seed della famiglia del curatore

**Files:**
- Create: `lib/importa/famiglia.ts`
- Test: `tests/importa/famiglia.test.ts`

**Interfaces:**
- Consumes: `VecchiaRicetta`, `VecchioMenu`, `Giorno` (Task 5).
- Produces:
  - `STELLE_DA_B: Record<number, number>`;
  - `type SlotSeed = { giorno: Giorno; pasto: 'pranzo' | 'cena'; ricetta: string | null; libero: string | null; porzioni: number | null; cucinata: boolean | null }`;
  - `type SeedFamiglia = { voti: { ricetta: string; stelle: number }[]; settimane: { inizio: string; slot: SlotSeed[] }[]; note_da_rivedere: { ricetta: string; nota: string }[] }`;
  - `costruisciSeed(ricette: VecchiaRicetta[], menu: VecchioMenu[]): SeedFamiglia`.

Il seed è l'input di M1b, che lo caricherà nelle tabelle della famiglia. Qui si produce soltanto.

- [ ] **Step 1: Scrivi il test che fallisce**

`tests/importa/famiglia.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { costruisciSeed } from '../../lib/importa/famiglia.ts'
import type { VecchiaRicetta, VecchioMenu } from '../../lib/importa/vecchio.ts'

const ricette: VecchiaRicetta[] = [
  {
    id: 'riso-ceci', nome: 'Riso e ceci', descrizione: '.', tipo: 'web', tempo: '20 min', ingredienti: null,
    feedback: 4, storico: [{ settimana: '2026-09-07', pasto: 'lun-pranzo', cucinata: true }],
    note: 'Ai bambini non piace il piccante.',
  },
  {
    id: 'orata', nome: 'Orata', descrizione: '.', tipo: 'web', tempo: '20 min', ingredienti: null,
    feedback: null, storico: [{ settimana: '2026-09-07', pasto: 'lun-cena', cucinata: false }], note: null,
  },
  { id: 'pasta-tonno', nome: 'Pasta', descrizione: '.', tipo: 'casa', tempo: '10 min', ingredienti: null, feedback: 1 },
]

const menu: VecchioMenu[] = [{
  settimana: { inizio: '2026-09-07' },
  giorni: [
    { giorno: 'lun', data: '2026-09-07', pranzo: { ricetta: 'riso-ceci', porzioni: 3 }, cena: { ricetta: 'orata', porzioni: 2 } },
    { giorno: 'sab', data: '2026-09-12', pranzo: { ricetta: 'pasta-tonno', porzioni: 4 }, cena: { libero: 'Cena libera' } },
  ],
}]

describe('costruisciSeed', () => {
  test('converte i voti B in stelle: B=1, BB=3, BBB=4, BBBB=5; nessun voto resta fuori', () => {
    expect(costruisciSeed(ricette, menu).voti).toEqual([
      { ricetta: 'riso-ceci', stelle: 5 },
      { ricetta: 'pasta-tonno', stelle: 1 },
    ])
  })

  test('ogni slot porta ricetta, porzioni e cucinata dallo storico', () => {
    const [settimana] = costruisciSeed(ricette, menu).settimane
    expect(settimana?.inizio).toBe('2026-09-07')
    expect(settimana?.slot).toEqual([
      { giorno: 'lun', pasto: 'pranzo', ricetta: 'riso-ceci', libero: null, porzioni: 3, cucinata: true },
      { giorno: 'lun', pasto: 'cena', ricetta: 'orata', libero: null, porzioni: 2, cucinata: false },
      { giorno: 'sab', pasto: 'pranzo', ricetta: 'pasta-tonno', libero: null, porzioni: 4, cucinata: null },
      { giorno: 'sab', pasto: 'cena', ricetta: null, libero: 'Cena libera', porzioni: null, cucinata: null },
    ])
  })

  test('le note delle schede finiscono tra le note da rivedere', () => {
    expect(costruisciSeed(ricette, menu).note_da_rivedere).toEqual([
      { ricetta: 'riso-ceci', nota: 'Ai bambini non piace il piccante.' },
    ])
  })
})
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pnpm test tests/importa/famiglia.test.ts`
Expected: FAIL, modulo non trovato.

- [ ] **Step 3: Implementa**

`lib/importa/famiglia.ts`:

```ts
import type { Giorno, VecchiaRicetta, VecchioMenu, VecchioSlot } from './vecchio.ts'

// Conversione decisa nella spec, sezione 8.
export const STELLE_DA_B: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5 }

export type SlotSeed = {
  giorno: Giorno; pasto: 'pranzo' | 'cena'; ricetta: string | null; libero: string | null
  porzioni: number | null; cucinata: boolean | null
}
export type SeedFamiglia = {
  voti: { ricetta: string; stelle: number }[]
  settimane: { inizio: string; slot: SlotSeed[] }[]
  note_da_rivedere: { ricetta: string; nota: string }[]
}

export function costruisciSeed(ricette: VecchiaRicetta[], menu: VecchioMenu[]): SeedFamiglia {
  const voti = ricette.flatMap((r) => {
    const stelle = r.feedback == null ? undefined : STELLE_DA_B[r.feedback]
    return stelle === undefined ? [] : [{ ricetta: r.id, stelle }]
  })

  const cucinata = new Map<string, boolean | null>()
  for (const r of ricette) {
    for (const s of r.storico ?? []) cucinata.set(`${r.id}|${s.settimana}|${s.pasto}`, s.cucinata)
  }

  const slot = (inizio: string, giorno: Giorno, pasto: 'pranzo' | 'cena', s: VecchioSlot): SlotSeed => {
    if (s.libero) return { giorno, pasto, ricetta: null, libero: s.libero, porzioni: null, cucinata: null }
    const ricetta = s.ricetta ?? null
    const c = ricetta ? cucinata.get(`${ricetta}|${inizio}|${giorno}-${pasto}`) : undefined
    return { giorno, pasto, ricetta, libero: null, porzioni: s.porzioni ?? null, cucinata: c ?? null }
  }

  const settimane = menu
    .map((m) => ({
      inizio: m.settimana.inizio,
      slot: m.giorni.flatMap((g) => [
        slot(m.settimana.inizio, g.giorno, 'pranzo', g.pranzo),
        slot(m.settimana.inizio, g.giorno, 'cena', g.cena),
      ]),
    }))
    .sort((a, b) => a.inizio.localeCompare(b.inizio))

  const note_da_rivedere = ricette.flatMap((r) => (r.note ? [{ ricetta: r.id, nota: r.note }] : []))
  return { voti, settimane, note_da_rivedere }
}
```

- [ ] **Step 4: Esegui i test**

Run: `pnpm test tests/importa && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/importa/famiglia.ts tests/importa/famiglia.test.ts
git commit -m "Import: seed della famiglia del curatore"
```

---

### Task 7: Conversione, report e script di import

**Files:**
- Create: `lib/importa/converti.ts`, `lib/importa/report.ts`, `scripts/importa-ricettario.ts`
- Test: `tests/importa/converti.test.ts`, fixture in `tests/fixture/vecchio/` (`ricettario/ricette.yaml`, `ricettario/archivio.yaml`, `menu/2026-09-07/menu.yaml`)

**Interfaces:**
- Consumes: tutto `lib/importa/*`, `Catalogo` (Task 3).
- Produces:
  - `type Segnalazione = { ricetta: string | null; campo: string; livello: 'bloccante' | 'da-confermare'; messaggio: string }`;
  - `type Conversione = { catalogo: CatalogoBozza; segnalazioni: Segnalazione[] }`, dove `CatalogoBozza` ha la stessa forma di `Catalogo` ma ammette i segnaposto `unita: '?'`, `reparto: '?'` e `tempo_min: 0`, che la validazione rifiuta finché non si correggono;
  - `converti(vecchie: VecchiaRicetta[], menu: VecchioMenu[], esistente: Catalogo | null): Conversione` (con `esistente` non null converte solo le ricette e gli ingredienti nuovi e restituisce il catalogo esistente più i nuovi);
  - `scriviReport(c: Conversione, seed: SeedFamiglia): string`;
  - CLI `pnpm importa [--origine ../meal_planner] [--solo-nuove]`.

I segnaposto servono a una cosa sola: rendere il YAML scrivibile senza inventare niente. Una quantità non interpretata diventa `quantita: null, unita: "?"`, un reparto sconosciuto `reparto: "?"`, un tempo non interpretato `tempo_min: 0`. `pnpm valida` li rifiuta, quindi la revisione (Task 8) non può chiudersi finché restano.

- [ ] **Step 1: Crea la fixture del vecchio formato**

`tests/fixture/vecchio/ricettario/ricette.yaml`:

```yaml
ricette:
  - id: cous-cous-ceci
    nome: Cous cous con ceci
    descrizione: Condisci il cous cous con ceci e zucchine.
    tipo: web
    url: https://www.esempio.it/cous-cous
    tempo: 15 min
    porzioni_base: 2
    ingredienti:
      - {nome: Cous cous, quantita: 120 g}
      - {nome: "Ceci gia' cotti", quantita: 200 g}
      - {nome: Zucchine, quantita: "2"}
      - {nome: Pomodorini, quantita: "8/10"}
      - {nome: Curry, quantita: un piccolo pezzo}
    collaudata: true
    feedback: 2
    tag: [legumi, vegetariano, veloce]
    storico:
      - {settimana: 2026-09-07, pasto: lun-pranzo, cucinata: true}
    note: Verificata sulla fonte.
  - id: piadine-casa
    nome: Piadine di casa
    descrizione: Piadine farcite.
    tipo: casa
    url: https://www.esempio.it/piadine
    tempo: 15-20 min
    porzioni_base: 4
    ingredienti:
      - {nome: Piadine, quantita: 4}
    collaudata: true
    feedback: 3
    tag: [pane-wrap, ricetta-di-casa]
    storico: []
    note: null
  - id: riso-curry-wok
    nome: Riso al curry
    descrizione: Dal libro.
    tipo: libro
    libro: {titolo: Basta un Wok, pagine: 76-77, file: ricettario/libri/basta-un-wok/p76.pdf}
    dipendenze_libro: [Salsa curry p. 20]
    tempo: mezz'ora
    porzioni_base: null
    ingredienti: null
    collaudata: false
    feedback: null
    tag: [riso, wok]
    storico: []
    note: null
```

`tests/fixture/vecchio/ricettario/archivio.yaml`:

```yaml
ricette:
  - id: vecchia-scheda
    nome: Vecchia scheda
    descrizione: Tolta dal ricettario.
    tipo: web
    url: https://www.esempio.it/vecchia
    tempo: 10 min
    porzioni_base: 2
    ingredienti:
      - {nome: Zucchine, quantita: "1"}
    collaudata: true
    feedback: null
    tag: []
    storico: []
    archiviata: 2026-09-27
    note: Cancellata su richiesta.
```

`tests/fixture/vecchio/menu/2026-09-07/menu.yaml`:

```yaml
settimana: {inizio: 2026-09-07, fine: 2026-09-13}
giorni:
  - giorno: lun
    data: 2026-09-07
    pranzo: {ricetta: cous-cous-ceci, porzioni: 3}
    cena: {libero: Cena libera}
spesa:
  - reparto: FRUTTA E VERDURA
    voci:
      - {nome: Zucchine, quantita: "4"}
  - reparto: PASTA RISO E CEREALI
    voci:
      - {nome: Cous cous, quantita: 240 g}
```

- [ ] **Step 2: Scrivi il test che fallisce**

`tests/importa/converti.test.ts`:

```ts
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, test } from 'vitest'
import { converti } from '../../lib/importa/converti.ts'
import type { VecchiaRicetta, VecchioMenu } from '../../lib/importa/vecchio.ts'
import { validaCatalogo } from '../../lib/ricettario/valida.ts'
import type { Catalogo } from '../../lib/ricettario/carica.ts'

const ORIGINE = fileURLToPath(new URL('../fixture/vecchio', import.meta.url))

async function vecchio(): Promise<{ ricette: VecchiaRicetta[]; menu: VecchioMenu[] }> {
  const attive = parse(await readFile(join(ORIGINE, 'ricettario/ricette.yaml'), 'utf8')).ricette
  const archivio = parse(await readFile(join(ORIGINE, 'ricettario/archivio.yaml'), 'utf8')).ricette
  const settimane = await readdir(join(ORIGINE, 'menu'))
  const menu = await Promise.all(settimane.map(async (s) => parse(await readFile(join(ORIGINE, 'menu', s, 'menu.yaml'), 'utf8'))))
  return { ricette: [...attive, ...archivio], menu }
}

describe('converti', () => {
  test('converte tutte le schede, archivio compreso', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo } = converti(ricette, menu, null)
    expect(catalogo.ricette.map((r) => r.slug)).toEqual(['cous-cous-ceci', 'piadine-casa', 'riso-curry-wok', 'vecchia-scheda'])
    expect(catalogo.ricette.find((r) => r.slug === 'vecchia-scheda')?.archiviata).toBe('2026-09-27')
  })

  test('quantità interpretate e testo originale conservato', async () => {
    const { ricette, menu } = await vecchio()
    const cous = converti(ricette, menu, null).catalogo.ricette[0]!
    expect(cous.ingredienti?.[0]).toMatchObject({ ingrediente: 'cous-cous', quantita: 120, unita: 'g', testo: 'Cous cous 120 g' })
    expect(cous.ingredienti?.[3]).toMatchObject({ ingrediente: 'pomodorini', quantita: 10, unita: 'pz' })
  })

  test('quantità non interpretata: segnaposto "?" e segnalazione bloccante', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo, segnalazioni } = converti(ricette, menu, null)
    expect(catalogo.ricette[0]!.ingredienti?.[4]).toMatchObject({ ingrediente: 'curry', quantita: null, unita: '?' })
    expect(segnalazioni).toContainEqual(expect.objectContaining({
      ricetta: 'cous-cous-ceci', campo: 'ingredienti.4', livello: 'bloccante',
    }))
  })

  test('numero YAML senza virgolette (quantita: 4) interpretato come testo', async () => {
    const { ricette, menu } = await vecchio()
    const piadine = converti(ricette, menu, null).catalogo.ricette[1]!
    expect(piadine.ingredienti?.[0]).toMatchObject({ quantita: 4, unita: 'pz', testo: 'Piadine 4' })
  })

  test('casa con url diventa web, segnalato', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo, segnalazioni } = converti(ricette, menu, null)
    expect(catalogo.ricette[1]).toMatchObject({ tipo: 'web', url: 'https://www.esempio.it/piadine' })
    expect(segnalazioni).toContainEqual(expect.objectContaining({ ricetta: 'piadine-casa', campo: 'tipo', livello: 'da-confermare' }))
  })

  test('libro: libri.yaml dal titolo, pagine come testo, dipendenze conservate', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo } = converti(ricette, menu, null)
    expect(catalogo.libri).toEqual([{ id: 'basta-un-wok', titolo: 'Basta un Wok' }])
    expect(catalogo.ricette[2]).toMatchObject({
      libro: { id: 'basta-un-wok', pagine: '76-77' }, dipendenze_libro: ['Salsa curry p. 20'], ingredienti: null,
    })
  })

  test('tempo non interpretato: tempo_min 0 e segnalazione bloccante', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo, segnalazioni } = converti(ricette, menu, null)
    expect(catalogo.ricette[2]!.tempo_min).toBe(0)
    expect(segnalazioni).toContainEqual(expect.objectContaining({ ricetta: 'riso-curry-wok', campo: 'tempo_min', livello: 'bloccante' }))
  })

  test('reparto dalla spesa dei menu; sconosciuto → "?" bloccante', async () => {
    const { ricette, menu } = await vecchio()
    const { catalogo, segnalazioni } = converti(ricette, menu, null)
    expect(catalogo.ingredienti.find((i) => i.slug === 'zucchine')?.reparto).toBe('FRUTTA E VERDURA')
    expect(catalogo.ingredienti.find((i) => i.slug === 'pomodorini')?.reparto).toBe('?')
    expect(segnalazioni).toContainEqual(expect.objectContaining({ ricetta: null, campo: 'pomodorini.reparto', livello: 'bloccante' }))
  })

  test('ingrediente principale proposto: il più pesante in grammi, da confermare', async () => {
    const { ricette, menu } = await vecchio()
    const cous = converti(ricette, menu, null).catalogo.ricette[0]!
    expect(cous.ingredienti?.filter((v) => v.principale).map((v) => v.ingrediente)).toEqual(['ceci-gia-cotti'])
  })

  test('--solo-nuove: le schede e gli ingredienti esistenti restano identici', async () => {
    const { ricette, menu } = await vecchio()
    const primo = converti(ricette.slice(0, 1), menu, null).catalogo as unknown as Catalogo
    primo.ricette[0]!.nome = 'Nome rivisto a mano'
    primo.ingredienti.find((i) => i.slug === 'zucchine')!.nome = 'Zucchine verdi'
    const secondo = converti(ricette, menu, primo).catalogo
    expect(secondo.ricette[0]!.nome).toBe('Nome rivisto a mano')
    expect(secondo.ingredienti.find((i) => i.slug === 'zucchine')?.nome).toBe('Zucchine verdi')
    expect(secondo.ricette.map((r) => r.slug)).toContain('piadine-casa')
  })

  test('senza segnaposto e con gli attributi confermati, la bozza è valida', async () => {
    const { ricette, menu } = await vecchio()
    const soloArchiviata = ricette.filter((r) => r.id === 'vecchia-scheda')
    const { catalogo } = converti(soloArchiviata, menu, null)
    expect(validaCatalogo(catalogo as unknown as Catalogo)).toEqual([])
  })
})
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `pnpm test tests/importa/converti.test.ts`
Expected: FAIL, modulo non trovato.

- [ ] **Step 4: Implementa la conversione**

`lib/importa/converti.ts`:

```ts
import type { Catalogo } from '../ricettario/carica.ts'
import { REPARTI, type Ingrediente, type Libro, type Reparto, type Ricetta, type Voce } from '../ricettario/schema.ts'
import { proponiAttributi, type Proposta } from './attributi.ts'
import { proponiAnagrafica, slugIngrediente } from './ingredienti.ts'
import { interpretaQuantita } from './quantita.ts'
import { interpretaTempo } from './tempo.ts'
import type { VecchiaRicetta, VecchioMenu } from './vecchio.ts'

export type Segnalazione = { ricetta: string | null; campo: string; livello: 'bloccante' | 'da-confermare'; messaggio: string }

// Come il Catalogo, ma con i segnaposto che la validazione rifiuta.
type VoceBozza = Omit<Voce, 'unita'> & { unita: Voce['unita'] | '?' }
type RicettaBozza = Omit<Ricetta, 'ingredienti'> & { ingredienti: VoceBozza[] | null }
type IngredienteBozza = Omit<Ingrediente, 'reparto'> & { reparto: Reparto | '?' }
export type CatalogoBozza = { libri: Libro[]; ingredienti: IngredienteBozza[]; ricette: RicettaBozza[] }
export type Conversione = { catalogo: CatalogoBozza; segnalazioni: Segnalazione[] }

const eReparto = (x: string): x is Reparto => (REPARTI as readonly string[]).includes(x)

function repartiDaSpesa(menu: VecchioMenu[]): Map<string, Reparto> {
  const mappa = new Map<string, Reparto>()
  for (const m of menu) {
    for (const r of m.spesa ?? []) {
      if (!eReparto(r.reparto)) continue
      for (const v of r.voci) if (!mappa.has(v.nome)) mappa.set(v.nome, r.reparto)
    }
  }
  return mappa
}

function grammi(v: VoceBozza): number {
  if (v.quantita === null) return 0
  if (v.unita === 'g' || v.unita === 'ml') return v.quantita
  if (v.unita === 'kg' || v.unita === 'l') return v.quantita * 1000
  return 0
}

export function converti(vecchie: VecchiaRicetta[], menu: VecchioMenu[], esistente: Catalogo | null): Conversione {
  const segnalazioni: Segnalazione[] = []
  const segnala = (ricetta: string | null, campo: string, livello: Segnalazione['livello'], messaggio: string) =>
    segnalazioni.push({ ricetta, campo, livello, messaggio })

  const giaRicette = new Set(esistente?.ricette.map((r) => r.slug))
  const giaIngredienti = new Set(esistente?.ingredienti.map((i) => i.slug))
  const daConvertire = vecchie.filter((r) => !giaRicette.has(r.id))

  const spesa = repartiDaSpesa(menu)
  const nomi = daConvertire.flatMap((r) => (r.ingredienti ?? []).map((v) => v.nome))
  const nuoviIngredienti: IngredienteBozza[] = proponiAnagrafica(nomi, spesa)
    .filter((i) => !giaIngredienti.has(i.slug))
    .map((i) => {
      if (i.reparto === null) segnala(null, `${i.slug}.reparto`, 'bloccante', `reparto sconosciuto per "${i.nome}"`)
      return { slug: i.slug, nome: i.nome, reparto: i.reparto ?? '?', dispensa: i.dispensa, sinonimi: i.sinonimi }
    })
  const repartoDi = (nome: string) => spesa.get(nome) ?? null

  const libri = new Map<string, Libro>((esistente?.libri ?? []).map((l) => [l.id, l]))

  const nuoveRicette: RicettaBozza[] = daConvertire.map((r) => {
    const a = proponiAttributi(r, repartoDi)
    const valore = <T>(campo: string, p: Proposta<T>): T => {
      if (!p.certo) segnala(r.id, campo, 'da-confermare', p.motivo ?? 'da confermare')
      return p.valore
    }

    let tipo = r.tipo
    let url = r.url ?? null
    if (tipo === 'casa' && url) {
      tipo = 'web'
      segnala(r.id, 'tipo', 'da-confermare', 'era "casa" con url fornito dall utente: convertita in web')
    }
    if (tipo === 'casa') url = null

    let libro: Ricetta['libro'] = null
    if (r.libro) {
      const id = slugIngrediente(r.libro.titolo)
      libri.set(id, { id, titolo: r.libro.titolo })
      libro = { id, pagine: String(r.libro.pagine) }
    }

    const t = interpretaTempo(r.tempo)
    let tempo_min = 0
    if (t.esito === 'non-interpretato') segnala(r.id, 'tempo_min', 'bloccante', t.motivo)
    else {
      tempo_min = t.minuti
      if (t.esito === 'da-confermare') segnala(r.id, 'tempo_min', 'da-confermare', t.motivo)
    }

    const ingredienti: VoceBozza[] | null = r.ingredienti === null ? null : r.ingredienti.map((v, n) => {
      const testo = `${v.nome} ${v.quantita ?? ''}`.trim()
      const ingrediente = slugIngrediente(v.nome)
      const q = interpretaQuantita(v.quantita)
      if (q.esito === 'non-interpretato') {
        segnala(r.id, `ingredienti.${n}`, 'bloccante', `${testo}: ${q.motivo}`)
        return { ingrediente, quantita: null, unita: '?', testo, opzionale: false, principale: false }
      }
      if (q.esito === 'da-confermare') segnala(r.id, `ingredienti.${n}`, 'da-confermare', `${testo}: ${q.motivo}`)
      return { ingrediente, quantita: q.quantita, unita: q.unita, testo, opzionale: false, principale: false }
    })
    if (ingredienti && ingredienti.length > 0) {
      const principale = ingredienti.reduce((max, v) => (grammi(v) > grammi(max) ? v : max), ingredienti[0]!)
      principale.principale = true
      segnala(r.id, 'ingredienti', 'da-confermare', `ingrediente principale proposto: ${principale.ingrediente}`)
    }

    return {
      slug: r.id, nome: r.nome, descrizione: r.descrizione, tipo, url, libro,
      dipendenze_libro: r.dipendenze_libro ?? [], tempo_min, porzioni_base: r.porzioni_base ?? null,
      proteina: valore('proteina', a.proteina), carboidrato: valore('carboidrato', a.carboidrato),
      verdure: valore('verdure', a.verdure), categoria: valore('categoria', a.categoria),
      pasto: valore('pasto', a.pasto), stagioni: valore('stagioni', a.stagioni),
      pesante: valore('pesante', a.pesante), tag: a.tag, ingredienti,
      archiviata: r.archiviata ?? null, note_curatore: r.note ?? null,
    }
  })

  return {
    catalogo: {
      libri: [...libri.values()].sort((x, y) => x.id.localeCompare(y.id)),
      ingredienti: [...(esistente?.ingredienti ?? []), ...nuoviIngredienti],
      ricette: [...(esistente?.ricette ?? []), ...nuoveRicette],
    },
    segnalazioni,
  }
}
```

Nota: l'ultimo test usa `vecchia-scheda`, che ha solo "Zucchine" (reparto noto, quantità sicura). La scheda però ha attributi da confermare (proteina `nessuna`, carboidrato `nessuno` e così via): sono valori *validi* anche se non certi, quindi la bozza passa la validazione. È voluto: gli attributi incerti sono lavoro di revisione, non errori di formato. Bloccanti restano solo i segnaposto.

- [ ] **Step 5: Esegui i test**

Run: `pnpm test tests/importa && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Scrivi il report**

`lib/importa/report.ts`:

```ts
import type { SeedFamiglia } from './famiglia.ts'
import type { Conversione } from './converti.ts'

export function scriviReport(c: Conversione, seed: SeedFamiglia): string {
  const bloccanti = c.segnalazioni.filter((s) => s.livello === 'bloccante')
  const daConfermare = c.segnalazioni.filter((s) => s.livello === 'da-confermare')
  const righe: string[] = [
    '# Report dell\'import del ricettario',
    '',
    `Ricette: ${c.catalogo.ricette.length} · ingredienti: ${c.catalogo.ingredienti.length} · libri: ${c.catalogo.libri.length}`,
    `Bloccanti: ${bloccanti.length} · da confermare: ${daConfermare.length}`,
    '',
    '## Bloccanti',
    '',
    'Finché restano, `pnpm valida` fallisce. Non si inventano: si leggono sulla fonte o si chiedono al curatore.',
    '',
    ...bloccanti.map((s) => `- [ ] \`${s.ricetta ?? 'anagrafica'}\` ${s.campo}: ${s.messaggio}`),
    '',
    '## Da confermare, per ricetta',
    '',
  ]
  const perRicetta = Map.groupBy(daConfermare, (s) => s.ricetta ?? 'anagrafica')
  for (const [ricetta, elenco] of perRicetta) {
    righe.push(`### ${ricetta}`, '', ...elenco.map((s) => `- [ ] ${s.campo}: ${s.messaggio}`), '')
  }
  righe.push('## Possibili sinonimi', '', 'Ingredienti con la stessa prima parola: valutare se unirli.', '')
  const perRadice = Map.groupBy(c.catalogo.ingredienti, (i) => i.slug.split('-')[0]!)
  for (const [radice, gruppo] of perRadice) {
    if (gruppo.length > 1) righe.push(`- [ ] ${radice}: ${gruppo.map((i) => `\`${i.slug}\``).join(', ')}`)
  }
  righe.push('', '## Note delle schede da rivedere', '',
    'Diventano esclusioni o preferenze della famiglia del curatore (M1b), oppure restano note del curatore.', '',
    ...seed.note_da_rivedere.map((n) => `- [ ] \`${n.ricetta}\`: ${n.nota}`), '')
  return righe.join('\n')
}
```

`Map.groupBy` è disponibile da Node 21.

- [ ] **Step 7: Scrivi la CLI di import**

`scripts/importa-ricettario.ts`:

```ts
// Uso: pnpm importa [--origine ../meal_planner] [--solo-nuove]
// Legge il ricettario e i menu del progetto di origine (senza modificarli) e
// scrive ricettario/*.yaml, seed/famiglia-curatore.json e progetto/import/report-import.md.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parse, stringify } from 'yaml'
import { converti } from '../lib/importa/converti.ts'
import { costruisciSeed } from '../lib/importa/famiglia.ts'
import { scriviReport } from '../lib/importa/report.ts'
import type { VecchiaRicetta, VecchioMenu } from '../lib/importa/vecchio.ts'
import { caricaCatalogo } from '../lib/ricettario/carica.ts'

const { values } = parseArgs({
  options: { origine: { type: 'string', default: '../meal_planner' }, 'solo-nuove': { type: 'boolean', default: false } },
})
const origine = values.origine!

const leggiYaml = async (p: string) => parse(await readFile(p, 'utf8'))
const attive: VecchiaRicetta[] = (await leggiYaml(join(origine, 'ricettario/ricette.yaml'))).ricette
const archivio: VecchiaRicetta[] = (await leggiYaml(join(origine, 'ricettario/archivio.yaml'))).ricette ?? []
const settimane = (await readdir(join(origine, 'menu'))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
const menu: VecchioMenu[] = await Promise.all(settimane.map((s) => leggiYaml(join(origine, 'menu', s, 'menu.yaml'))))

let esistente = null
if (values['solo-nuove']) {
  const caricato = await caricaCatalogo('ricettario')
  if (!caricato.catalogo) {
    for (const p of caricato.problemi) console.error(`${p.file} ${p.percorso}: ${p.messaggio}`)
    throw new Error('--solo-nuove richiede un ricettario che si carica: correggi prima i problemi')
  }
  esistente = caricato.catalogo
}

const vecchie = [...attive, ...archivio]
const conversione = converti(vecchie, menu, esistente)
const seed = costruisciSeed(vecchie, menu)

const INTESTAZIONE: Record<string, string> = {
  'libri.yaml': '# Libri da cui vengono le ricette di tipo libro. Formato: lib/ricettario/schema.ts (LibroSchema).\n',
  'ingredienti.yaml': '# Anagrafica degli ingredienti canonici. Formato: lib/ricettario/schema.ts (IngredienteSchema).\n',
  'ricette.yaml': '# Ricettario. Formato: lib/ricettario/schema.ts (RicettaSchema). Validazione: pnpm valida.\n',
}
await mkdir('ricettario', { recursive: true })
const { libri, ingredienti, ricette } = conversione.catalogo
for (const [file, dati] of [['libri.yaml', { libri }], ['ingredienti.yaml', { ingredienti }], ['ricette.yaml', { ricette }]] as const) {
  await writeFile(join('ricettario', file), INTESTAZIONE[file] + '\n' + stringify(dati, { lineWidth: 0 }))
}
await mkdir('seed', { recursive: true })
await writeFile('seed/famiglia-curatore.json', JSON.stringify(seed, null, 2) + '\n')
await mkdir('progetto/import', { recursive: true })
await writeFile('progetto/import/report-import.md', scriviReport(conversione, seed))

const b = conversione.segnalazioni.filter((s) => s.livello === 'bloccante').length
console.log(`Import: ${ricette.length} ricette, ${ingredienti.length} ingredienti, ${libri.length} libri, ${seed.settimane.length} settimane`)
console.log(`Segnalazioni: ${b} bloccanti, ${conversione.segnalazioni.length - b} da confermare. Report: progetto/import/report-import.md`)
```

- [ ] **Step 8: Prova la CLI sulla fixture, poi sui dati reali**

Run, dalla radice di `meal_planner_2`: `pnpm importa --origine tests/fixture/vecchio && pnpm valida; git status --short`
Expected: stampa 4 ricette e le segnalazioni; `pnpm valida` fallisce sui segnaposto (`?` e `tempo_min` 0). `git status` mostra `ricettario/`, `seed/` e `progetto/import/`.

Ripristina con `git clean -fd ricettario seed progetto/import` (sono file non tracciati appena creati).

Run: `pnpm importa`
Expected: stampa circa 49 ricette (48 attive più le archiviate), circa 180-200 ingredienti, 2 libri, 4 settimane. `pnpm valida` fallisce: è atteso.

- [ ] **Step 9: Commit della bozza**

La bozza non passa la validazione: si committa lo stesso, perché la revisione del Task 8 deve partire da uno stato registrato.

```bash
git add lib/importa scripts/importa-ricettario.ts tests ricettario seed progetto/import
git commit -m "Import del ricettario: conversione, report e bozza dai dati reali"
```

---

### Task 8: Revisione del ricettario (curatore + AI)

Task di dati, non di codice: il "test" è `pnpm valida` verde più l'approvazione dell'utente. Regole vincolanti:

- ingredienti e quantità solo dalla fonte (apri l'`url` con lo strumento web e leggi la lista reale) o chiesti all'utente;
- mai dedurli dal nome del piatto;
- per le ricette `casa` senza fonte, chiedere all'utente.

**Files:**
- Modify: `ricettario/libri.yaml`, `ricettario/ingredienti.yaml`, `ricettario/ricette.yaml`, `progetto/import/report-import.md`

- [ ] **Step 1: Elenca i bloccanti**

Run: `pnpm valida`
Expected: l'elenco dei problemi (segnaposto `?`, `tempo_min` 0 e simili). Tienilo come lista di lavoro, insieme alla sezione "Bloccanti" del report.

- [ ] **Step 2: Risolvi le quantità bloccanti delle ricette con fonte**

Per ogni `unita: "?"` di una ricetta `web` o `youtube`, apri l'url e trascrivi quantità e unità come le scrive la fonte, per `porzioni_base`. Se la fonte scrive "q.b." usa `unita: q.b.` con `quantita: null`. Aggiorna `testo` se la fonte dice altro. Spunta la voce nel report.

- [ ] **Step 3: Raccogli le domande per l'utente**

In un unico messaggio all'utente elenca ciò che solo lui può dire:
- quantità delle ricette `casa` e da libro rimaste bloccanti;
- tempi non interpretati;
- ricette convertite da `casa` a `web`: confermare;
- ricette ancora senza ingredienti (`ingredienti: null`): fornirli o lasciarle così.

Aspetta le risposte e applicale.

- [ ] **Step 4: Anagrafica: reparti e sinonimi**

Assegna il reparto a ogni `reparto: "?"`, scegliendo tra i reparti standard. Per ogni gruppo della sezione "Possibili sinonimi" decidi se unire, per esempio `ceci-gia-cotti` e `ceci-lessati` in `ceci-cotti`. Per unire:
1. tieni una voce con slug e nome canonici;
2. sposta gli altri nomi in `sinonimi`;
3. cambia `ingrediente:` in tutte le ricette che usavano gli slug tolti;
4. cancella le voci tolte.

Tieni un elenco delle unioni fatte per lo Step 6.

- [ ] **Step 5: Attributi, ricetta per ricetta**

Per ogni ricetta della sezione "Da confermare" controlla e correggi proteina, carboidrato, verdure, categoria, pasto, stagioni, pesante e l'ingrediente principale (uno o più `principale: true`). Leggi la scheda (nome, descrizione, ingredienti) e, se serve, la fonte. Per `pesce-fresco` / `pesce-conserva` guarda gli ingredienti (tonno o sgombro in scatola → conserva). Spunta le voci nel report.

Se una categoria necessaria manca da `CATEGORIE`, fermati e proponila all'utente. Se approva, aggiungila in `lib/ricettario/schema.ts` e in un test di `tests/ricettario/schema.test.ts`, poi fai un commit separato.

- [ ] **Step 6: Note delle schede**

Per ogni voce di "Note delle schede da rivedere" decidi con l'utente se è:
- (a) una preferenza o esclusione della famiglia, da tenere nel seed per M1b: aggiungi a `seed/famiglia-curatore.json` una chiave `esclusioni: [{ricetta, motivo}]` o `ingredienti_famiglia: [{ingrediente, livello: "evita" | "limita"}]`;
- (b) una nota di lavoro del curatore, che resta in `note_curatore`;
- (c) superata, e si toglie.

- [ ] **Step 7: Approvazione dell'utente**

Presenta all'utente un riepilogo breve:
- unioni di ingredienti;
- ricette cambiate di tipo;
- attributi cambiati rispetto alla proposta, con una riga per ricetta solo dove hai cambiato qualcosa;
- esclusioni e preferenze finite nel seed.

Aspetta l'approvazione o le correzioni.

- [ ] **Step 8: Verifica e commit**

Run: `pnpm valida && pnpm test`
Expected: `Ricettario valido: …`, test verdi.

In fondo a `progetto/import/report-import.md` aggiungi una sezione `## Esito della revisione` con la data, lo stato (tutte le voci spuntate) e il riepilogo approvato.

```bash
git add ricettario seed progetto/import lib tests
git commit -m "Ricettario rivisto e validato"
```

---

### Task 9: Supabase locale e migrazione del catalogo

**Files:**
- Create: `supabase/config.toml` (da `supabase init`), `supabase/migrations/<timestamp>_catalogo.sql`, `supabase/tests/catalogo.test.sql`

**Interfaces:**
- Produces: le tabelle `public.libri(id, titolo)`, `public.ingredienti(slug, nome, reparto, dispensa, sinonimi)`, `public.ricette(slug, nome, descrizione, tipo, url, libro_id, libro_pagine, dipendenze_libro, tempo_min, porzioni_base, proteina, carboidrato, verdure, categoria, pasto, stagioni, pesante, tag, ingredienti_noti, archiviata, note_curatore, aggiornata_il)` e `public.ricetta_ingredienti(ricetta_slug, posizione, ingrediente_slug, quantita, unita, testo, opzionale, principale)`, con RLS: lettura per `authenticated`, nessuna scrittura per nessun ruolo esposto.

- [ ] **Step 1: Inizializza Supabase in locale**

Run: `supabase init` (rispondi no alle domande sugli IDE), poi `supabase start`.
Expected: il comando stampa gli URL locali, tra cui `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Il primo avvio scarica le immagini e può durare alcuni minuti.

- [ ] **Step 2: Scrivi il test pgTAP che fallisce**

`supabase/tests/catalogo.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.libri (id, titolo) values ('basta-un-wok', 'Basta un Wok');
insert into public.ingredienti (slug, nome, reparto) values ('riso', 'Riso', 'PASTA RISO E CEREALI');
insert into public.ricette (slug, nome, descrizione, tipo, url, tempo_min, porzioni_base, proteina, carboidrato,
  verdure, categoria, pasto, stagioni, pesante, ingredienti_noti)
values ('riso-bianco', 'Riso bianco', 'Riso lesso.', 'casa', null, 15, 2, 'nessuna', 'riso', false, 'primo',
  'entrambi', '{primavera,estate,autunno,inverno}', false, true);
insert into public.ricetta_ingredienti (ricetta_slug, posizione, ingrediente_slug, quantita, unita, testo, principale)
values ('riso-bianco', 0, 'riso', 160, 'g', 'Riso 160 g', true);

select throws_ok(
  $$insert into public.ricette (slug, nome, descrizione, tipo, tempo_min, proteina, carboidrato, verdure, categoria,
    pasto, stagioni, pesante, ingredienti_noti)
    values ('x', 'X', 'X', 'web', 10, 'tofu', 'riso', false, 'primo', 'entrambi', '{estate}', false, false)$$,
  '23514', null, 'una proteina fuori elenco viola il vincolo check');

set local role anon;
select is((select count(*) from public.ricette)::int, 0, 'anon non legge le ricette');
select is((select count(*) from public.ingredienti)::int, 0, 'anon non legge gli ingredienti');

set local role authenticated;
select is((select count(*) from public.ricette)::int, 1, 'autenticato legge le ricette');
select is((select count(*) from public.ricetta_ingredienti)::int, 1, 'autenticato legge gli ingredienti delle ricette');
select throws_ok($$insert into public.libri (id, titolo) values ('altro', 'Altro')$$,
  '42501', null, 'autenticato non inserisce nel catalogo');
update public.ricette set nome = 'Modificata' where slug = 'riso-bianco';
reset role;
select is((select nome from public.ricette where slug = 'riso-bianco'), 'Riso bianco', 'autenticato non modifica il catalogo');

select * from finish();
rollback;
```

Run: `supabase test db`
Expected: FAIL, la relazione `public.libri` non esiste.

- [ ] **Step 3: Scrivi la migrazione**

Run: `supabase migration new catalogo`
Expected: crea `supabase/migrations/<timestamp>_catalogo.sql`, vuoto. Scrivici:

```sql
-- Catalogo delle ricette: globale, scritto solo dalla sync (service role),
-- letto dagli utenti autenticati. Gli elenchi dei check devono restare uguali
-- a quelli di lib/ricettario/schema.ts e lib/ricettario/unita.ts.

create table public.libri (
  id text primary key,
  titolo text not null
);

create table public.ingredienti (
  slug text primary key,
  nome text not null,
  reparto text not null check (reparto in (
    'FRUTTA E VERDURA', 'MACELLERIA', 'PESCHERIA', 'BANCO FRIGO E LATTICINI',
    'PANE E PRODOTTI DA FORNO', 'PASTA RISO E CEREALI', 'SCATOLAME E CONSERVE', 'CONDIMENTI E DISPENSA')),
  dispensa boolean not null default false,
  sinonimi text[] not null default '{}'
);

create table public.ricette (
  slug text primary key,
  nome text not null,
  descrizione text not null,
  tipo text not null check (tipo in ('web', 'youtube', 'libro', 'casa')),
  url text,
  libro_id text references public.libri (id),
  libro_pagine text,
  dipendenze_libro text[] not null default '{}',
  tempo_min integer not null check (tempo_min > 0),
  porzioni_base integer check (porzioni_base > 0),
  proteina text not null check (proteina in ('pesce-fresco', 'pesce-conserva', 'carne-bianca', 'carne-rossa',
    'salumi', 'uova', 'legumi', 'formaggi', 'nessuna')),
  carboidrato text not null check (carboidrato in ('pasta', 'riso', 'cereali', 'pane', 'patate', 'nessuno')),
  verdure boolean not null,
  categoria text not null check (categoria in ('primo', 'zuppa', 'insalata', 'secondo', 'piatto-unico', 'wok',
    'panino-piadina', 'torta-salata', 'bowl', 'pizza-focaccia')),
  pasto text not null check (pasto in ('pranzo', 'cena', 'entrambi')),
  stagioni text[] not null check (stagioni <@ array['primavera', 'estate', 'autunno', 'inverno'] and cardinality(stagioni) > 0),
  pesante boolean not null,
  tag text[] not null default '{}',
  ingredienti_noti boolean not null,
  archiviata date,
  note_curatore text,
  aggiornata_il timestamptz not null default now(),
  check ((tipo in ('web', 'youtube')) = (url is not null) or tipo = 'libro'),
  check ((tipo = 'libro') = (libro_id is not null))
);

create table public.ricetta_ingredienti (
  ricetta_slug text not null references public.ricette (slug) on delete cascade,
  posizione integer not null,
  ingrediente_slug text not null references public.ingredienti (slug),
  quantita numeric check (quantita > 0),
  unita text not null check (unita in ('g', 'kg', 'ml', 'l', 'pz', 'spicchio', 'cucchiaio', 'cucchiaino',
    'bicchiere', 'bustina', 'foglia', 'rametto', 'fetta', 'vasetto', 'vaschetta',
    'mazzetto', 'ciuffo', 'pizzico', 'goccio', 'q.b.')),
  testo text not null,
  opzionale boolean not null default false,
  principale boolean not null default false,
  primary key (ricetta_slug, posizione)
);

alter table public.libri enable row level security;
alter table public.ingredienti enable row level security;
alter table public.ricette enable row level security;
alter table public.ricetta_ingredienti enable row level security;

-- Solo lettura, solo autenticati. Nessuna policy di scrittura: scrive soltanto
-- la sync, con il ruolo che bypassa la RLS.
create policy "catalogo: lettura autenticati" on public.libri for select to authenticated using (true);
create policy "catalogo: lettura autenticati" on public.ingredienti for select to authenticated using (true);
create policy "catalogo: lettura autenticati" on public.ricette for select to authenticated using (true);
create policy "catalogo: lettura autenticati" on public.ricetta_ingredienti for select to authenticated using (true);
```

Nota sul primo check della tabella `ricette`: esprime "web e youtube hanno l'url, casa no", e il tipo libro è libero sull'url.

- [ ] **Step 4: Applica ed esegui i test**

Run: `supabase db reset && supabase test db`
Expected: `catalogo.test.sql .. ok`, 7 test passati.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "Supabase: migrazione del catalogo con RLS in sola lettura"
```

---

### Task 10: Sync del ricettario nel catalogo

**Files:**
- Create: `lib/sync/righe.ts`, `lib/sync/applica.ts`, `scripts/sync-ricettario.ts`
- Test: `tests/sync/righe.test.ts`, `tests/db/sync.test.ts`

**Interfaces:**
- Consumes: `Catalogo` (Task 3), le tabelle del Task 9.
- Produces:
  - `type Righe = { libri: RigaLibro[]; ingredienti: RigaIngrediente[]; ricette: RigaRicetta[]; ricetta_ingredienti: RigaRicettaIngrediente[] }` (i nomi dei campi sono quelli delle tabelle);
  - `righeDaCatalogo(c: Catalogo): Righe`;
  - `slugDaArchiviare(slugYaml: Set<string>, inDb: { slug: string; archiviata: string | null }[]): string[]`;
  - `type EsitoSync = { ricette: number; ingredienti: number; libri: number; archiviate: string[] }`;
  - `applicaSync(sql: postgres.Sql, righe: Righe, oggi: string): Promise<EsitoSync>`;
  - CLI `pnpm sync`, con la variabile d'ambiente `SUPABASE_DB_URL`.

- [ ] **Step 1: Scrivi il test puro che fallisce**

`tests/sync/righe.test.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { caricaCatalogo } from '../../lib/ricettario/carica.ts'
import { righeDaCatalogo, slugDaArchiviare } from '../../lib/sync/righe.ts'

const FIXTURE = fileURLToPath(new URL('../fixture/ricettario-valido', import.meta.url))

describe('righeDaCatalogo', () => {
  test('una riga per ricetta e una per ingrediente di ricetta, con la posizione', async () => {
    const { catalogo } = await caricaCatalogo(FIXTURE)
    const r = righeDaCatalogo(catalogo!)
    expect(r.ricette.map((x) => x.slug)).toEqual(['riso-ceci', 'riso-curry-wok'])
    expect(r.ricetta_ingredienti.map((x) => [x.ricetta_slug, x.posizione, x.ingrediente_slug])).toEqual([
      ['riso-ceci', 0, 'riso'], ['riso-ceci', 1, 'ceci-cotti'], ['riso-ceci', 2, 'olio-extravergine'],
    ])
  })

  test('ingredienti null → ingredienti_noti false; libro appiattito', async () => {
    const { catalogo } = await caricaCatalogo(FIXTURE)
    const wok = righeDaCatalogo(catalogo!).ricette[1]!
    expect(wok).toMatchObject({ ingredienti_noti: false, libro_id: 'basta-un-wok', libro_pagine: '76-77' })
  })
})

describe('slugDaArchiviare', () => {
  test('archivia solo ciò che manca dal YAML e non è già archiviato', () => {
    expect(slugDaArchiviare(new Set(['a']), [
      { slug: 'a', archiviata: null }, { slug: 'b', archiviata: null }, { slug: 'c', archiviata: '2026-09-01' },
    ])).toEqual(['b'])
  })
})
```

Run: `pnpm test tests/sync`
Expected: FAIL, modulo non trovato.

- [ ] **Step 2: Implementa le righe**

`lib/sync/righe.ts`:

```ts
import type { Catalogo } from '../ricettario/carica.ts'

export type RigaLibro = { id: string; titolo: string }
export type RigaIngrediente = { slug: string; nome: string; reparto: string; dispensa: boolean; sinonimi: string[] }
export type RigaRicetta = {
  slug: string; nome: string; descrizione: string; tipo: string; url: string | null
  libro_id: string | null; libro_pagine: string | null; dipendenze_libro: string[]
  tempo_min: number; porzioni_base: number | null; proteina: string; carboidrato: string; verdure: boolean
  categoria: string; pasto: string; stagioni: string[]; pesante: boolean; tag: string[]
  ingredienti_noti: boolean; archiviata: string | null; note_curatore: string | null
}
export type RigaRicettaIngrediente = {
  ricetta_slug: string; posizione: number; ingrediente_slug: string; quantita: number | null
  unita: string; testo: string; opzionale: boolean; principale: boolean
}
export type Righe = {
  libri: RigaLibro[]; ingredienti: RigaIngrediente[]; ricette: RigaRicetta[]; ricetta_ingredienti: RigaRicettaIngrediente[]
}

export function righeDaCatalogo(c: Catalogo): Righe {
  return {
    libri: c.libri.map((l) => ({ id: l.id, titolo: l.titolo })),
    ingredienti: c.ingredienti.map((i) => ({ slug: i.slug, nome: i.nome, reparto: i.reparto, dispensa: i.dispensa, sinonimi: i.sinonimi })),
    ricette: c.ricette.map((r) => ({
      slug: r.slug, nome: r.nome, descrizione: r.descrizione, tipo: r.tipo, url: r.url,
      libro_id: r.libro?.id ?? null, libro_pagine: r.libro?.pagine ?? null, dipendenze_libro: r.dipendenze_libro,
      tempo_min: r.tempo_min, porzioni_base: r.porzioni_base, proteina: r.proteina, carboidrato: r.carboidrato,
      verdure: r.verdure, categoria: r.categoria, pasto: r.pasto, stagioni: r.stagioni, pesante: r.pesante,
      tag: r.tag, ingredienti_noti: r.ingredienti !== null, archiviata: r.archiviata, note_curatore: r.note_curatore,
    })),
    ricetta_ingredienti: c.ricette.flatMap((r) => (r.ingredienti ?? []).map((v, posizione) => ({
      ricetta_slug: r.slug, posizione, ingrediente_slug: v.ingrediente, quantita: v.quantita, unita: v.unita,
      testo: v.testo, opzionale: v.opzionale, principale: v.principale,
    }))),
  }
}

export function slugDaArchiviare(slugYaml: Set<string>, inDb: { slug: string; archiviata: string | null }[]): string[] {
  return inDb.filter((r) => !slugYaml.has(r.slug) && r.archiviata === null).map((r) => r.slug).sort()
}
```

Run: `pnpm test tests/sync && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Scrivi il test sul database che fallisce**

`tests/db/sync.test.ts`:

```ts
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { caricaCatalogo } from '../../lib/ricettario/carica.ts'
import { applicaSync } from '../../lib/sync/applica.ts'
import { righeDaCatalogo, type Righe } from '../../lib/sync/righe.ts'

// Richiede `supabase start`. Senza database il test deve fallire, non saltare.
const sql = postgres(process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', { max: 1, onnotice: () => {} })
const FIXTURE = fileURLToPath(new URL('../fixture/ricettario-valido', import.meta.url))

async function righe(): Promise<Righe> {
  const { catalogo } = await caricaCatalogo(FIXTURE)
  return righeDaCatalogo(catalogo!)
}
const conta = async (tabella: string) => Number((await sql`select count(*)::int as n from ${sql(tabella)}`)[0]!.n)

beforeEach(async () => {
  await sql`truncate public.ricetta_ingredienti, public.ricette, public.ingredienti, public.libri cascade`
})
afterAll(async () => { await sql.end() })

describe('applicaSync', () => {
  test('scrive libri, ingredienti, ricette e ingredienti delle ricette', async () => {
    const esito = await applicaSync(sql, await righe(), '2026-09-29')
    expect(esito).toEqual({ ricette: 2, ingredienti: 3, libri: 1, archiviate: [] })
    expect(await conta('ricetta_ingredienti')).toBe(3)
    const [r] = await sql`select stagioni, tag, dipendenze_libro from public.ricette where slug = 'riso-ceci'`
    expect(r).toEqual({ stagioni: ['primavera', 'estate', 'autunno', 'inverno'], tag: [], dipendenze_libro: [] })
  })

  test('idempotente: una seconda esecuzione non cambia niente', async () => {
    await applicaSync(sql, await righe(), '2026-09-29')
    const esito = await applicaSync(sql, await righe(), '2026-09-29')
    expect(esito.archiviate).toEqual([])
    expect(await conta('ricette')).toBe(2)
    expect(await conta('ricetta_ingredienti')).toBe(3)
  })

  test('una ricetta tolta dal YAML si archivia, non si cancella', async () => {
    await applicaSync(sql, await righe(), '2026-09-29')
    const senza = await righe()
    senza.ricette = senza.ricette.filter((r) => r.slug !== 'riso-ceci')
    senza.ricetta_ingredienti = senza.ricetta_ingredienti.filter((r) => r.ricetta_slug !== 'riso-ceci')
    const esito = await applicaSync(sql, senza, '2026-09-30')
    expect(esito.archiviate).toEqual(['riso-ceci'])
    const [r] = await sql`select archiviata::text as a from public.ricette where slug = 'riso-ceci'`
    expect(r!.a).toBe('2026-09-30')
    expect(await conta('ricetta_ingredienti')).toBe(3)
  })

  test('una ricetta archiviata che ricompare nel YAML torna attiva', async () => {
    await applicaSync(sql, await righe(), '2026-09-29')
    await sql`update public.ricette set archiviata = '2026-09-30' where slug = 'riso-ceci'`
    await applicaSync(sql, await righe(), '2026-10-01')
    const [r] = await sql`select archiviata from public.ricette where slug = 'riso-ceci'`
    expect(r!.archiviata).toBeNull()
  })

  test('un errore annulla tutto: il database resta com era', async () => {
    await applicaSync(sql, await righe(), '2026-09-29')
    const rotte = await righe()
    rotte.ricette[0]!.nome = 'Nome cambiato'
    rotte.ricetta_ingredienti[0]!.ingrediente_slug = 'non-esiste'
    await expect(applicaSync(sql, rotte, '2026-09-30')).rejects.toThrow()
    const [r] = await sql`select nome from public.ricette where slug = 'riso-ceci'`
    expect(r!.nome).toBe('Riso e ceci')
  })
})
```

Run: `pnpm test:db`
Expected: FAIL, modulo `applica.ts` non trovato. Se invece fallisce per connessione rifiutata, avvia `supabase start`.

- [ ] **Step 4: Implementa l'applicazione in transazione**

`lib/sync/applica.ts`:

```ts
import type postgres from 'postgres'
import { slugDaArchiviare, type Righe } from './righe.ts'

export type EsitoSync = { ricette: number; ingredienti: number; libri: number; archiviate: string[] }

// Tutto in una transazione: se qualcosa fallisce il catalogo resta com'era.
export async function applicaSync(sql: postgres.Sql, righe: Righe, oggi: string): Promise<EsitoSync> {
  return sql.begin(async (tx) => {
    if (righe.libri.length > 0) {
      await tx`insert into public.libri ${tx(righe.libri)}
        on conflict (id) do update set titolo = excluded.titolo`
    }
    if (righe.ingredienti.length > 0) {
      await tx`insert into public.ingredienti ${tx(righe.ingredienti.map((i) => ({ ...i, sinonimi: tx.array(i.sinonimi) })))}
        on conflict (slug) do update set nome = excluded.nome, reparto = excluded.reparto,
          dispensa = excluded.dispensa, sinonimi = excluded.sinonimi`
    }
    if (righe.ricette.length > 0) {
      const ricette = righe.ricette.map((r) => ({
        ...r, dipendenze_libro: tx.array(r.dipendenze_libro), stagioni: tx.array(r.stagioni), tag: tx.array(r.tag),
      }))
      await tx`insert into public.ricette ${tx(ricette)}
        on conflict (slug) do update set nome = excluded.nome, descrizione = excluded.descrizione,
          tipo = excluded.tipo, url = excluded.url, libro_id = excluded.libro_id, libro_pagine = excluded.libro_pagine,
          dipendenze_libro = excluded.dipendenze_libro, tempo_min = excluded.tempo_min,
          porzioni_base = excluded.porzioni_base, proteina = excluded.proteina, carboidrato = excluded.carboidrato,
          verdure = excluded.verdure, categoria = excluded.categoria, pasto = excluded.pasto,
          stagioni = excluded.stagioni, pesante = excluded.pesante, tag = excluded.tag,
          ingredienti_noti = excluded.ingredienti_noti, archiviata = excluded.archiviata,
          note_curatore = excluded.note_curatore, aggiornata_il = now()`
      const slug = righe.ricette.map((r) => r.slug)
      await tx`delete from public.ricetta_ingredienti where ricetta_slug in ${tx(slug)}`
    }
    if (righe.ricetta_ingredienti.length > 0) {
      await tx`insert into public.ricetta_ingredienti ${tx(righe.ricetta_ingredienti)}`
    }
    const inDb = await tx<{ slug: string; archiviata: string | null }[]>`
      select slug, archiviata::text as archiviata from public.ricette`
    const archiviate = slugDaArchiviare(new Set(righe.ricette.map((r) => r.slug)), inDb)
    if (archiviate.length > 0) {
      await tx`update public.ricette set archiviata = ${oggi}, aggiornata_il = now() where slug in ${tx(archiviate)}`
    }
    return { ricette: righe.ricette.length, ingredienti: righe.ingredienti.length, libri: righe.libri.length, archiviate }
  })
}
```

Se `tx.array(...)` dentro gli oggetti del helper di insert non viene serializzato come array Postgres, consulta Context7 (`/porsager/postgres`, "arrays in dynamic inserts") e adatta. Il test "scrive libri, ingredienti…" verifica proprio gli array.

- [ ] **Step 5: Esegui i test sul database**

Run: `pnpm test:db`
Expected: PASS, 5 test.

- [ ] **Step 6: Scrivi la CLI**

`scripts/sync-ricettario.ts`:

```ts
// Uso: SUPABASE_DB_URL=... pnpm sync
// Valida il ricettario e lo scrive nel catalogo. Si ferma se la validazione fallisce.
import postgres from 'postgres'
import { verificaRicettario } from '../lib/ricettario/valida.ts'
import { applicaSync } from '../lib/sync/applica.ts'
import { righeDaCatalogo } from '../lib/sync/righe.ts'

const url = process.env.SUPABASE_DB_URL
if (!url) throw new Error('manca SUPABASE_DB_URL')

const { catalogo, problemi } = await verificaRicettario('ricettario')
if (!catalogo || problemi.length > 0) {
  for (const p of problemi) console.error(`${p.file} ${p.percorso}: ${p.messaggio}`)
  throw new Error('ricettario non valido: sync annullata')
}
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
try {
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  const esito = await applicaSync(sql, righeDaCatalogo(catalogo), oggi)
  console.log(`Sync: ${esito.ricette} ricette, ${esito.ingredienti} ingredienti, ${esito.libri} libri`)
  if (esito.archiviate.length > 0) console.log(`Archiviate: ${esito.archiviate.join(', ')}`)
} finally {
  await sql.end()
}
```

`toLocaleDateString('sv-SE')` produce la forma `AAAA-MM-GG`.

- [ ] **Step 7: Sync del ricettario reale sul database locale**

Run: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm sync`
Expected: `Sync: N ricette, M ingredienti, 2 libri`, con N e M uguali all'output di `pnpm valida`. Se fallisce su un vincolo `check`, gli elenchi della migrazione e di `schema.ts` non coincidono: allineali e aggiungi un test.

- [ ] **Step 8: Commit**

```bash
git add lib/sync scripts/sync-ricettario.ts tests
git commit -m "Sync idempotente del ricettario nel catalogo"
```

---

### Task 11: CI, deploy e prima pubblicazione

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Modify: `AGENTS.md` (comandi e stato)

- [ ] **Step 1: Workflow di verifica**

`.github/workflows/ci.yml`:

```yaml
name: Verifica
on:
  pull_request:
  push:
    branches-ignore: [main]

jobs:
  verifica:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm valida
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start
      - run: supabase test db
      - run: pnpm test:db
      - run: pnpm sync
        env:
          SUPABASE_DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 2: Workflow di deploy**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-produzione
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm valida
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - run: supabase db push
      - run: pnpm sync
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

L'ordine è voluto: validazione, poi migrazioni, poi sync. Se una migrazione fallisce, la sync non parte.

- [ ] **Step 3: Verifica in locale quello che la CI eseguirà**

Run: `pnpm typecheck && pnpm test && pnpm valida && supabase test db && pnpm test:db`
Expected: tutto verde.

- [ ] **Step 4: Aggiorna `AGENTS.md`**

In `AGENTS.md`, sostituisci la sezione "Stato" con lo stato reale: M1a completata, prossimo passo il piano di M1b. Aggiungi una sezione "Comandi":

```markdown
## Comandi

pnpm test            # test unitari
pnpm test:db         # test sul database locale (richiede `supabase start`)
supabase test db     # test pgTAP di schema e RLS
pnpm valida          # validazione del ricettario
pnpm importa --solo-nuove   # importa le schede nuove da ../meal_planner (poi revisione)
pnpm sync            # ricettario → catalogo (SUPABASE_DB_URL)
```

Commit:

```bash
git add .github AGENTS.md
git commit -m "CI e deploy: verifica, migrazioni e sync al merge su main"
```

- [ ] **Step 5: Prima pubblicazione (con l'utente)**

Fermati e chiedi all'utente il permesso di pubblicare. Poi, con lui:

1. l'utente crea nel repository GitHub i secret `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens nella dashboard Supabase), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` (il project ref del Task 0) e `SUPABASE_DB_URL` (la stringa di connessione del *session pooler*, dalla dashboard, pulsante Connect);
2. `git push -u origin sviluppo` e controlla che il workflow "Verifica" sia verde (`gh run watch`);
3. apri la pull request `gh pr create --base main --head sviluppo`, con il riepilogo di M1a e le righe di attribuzione richieste;
4. dopo il merge fatto dall'utente, controlla il workflow "Deploy" (`gh run watch`). Expected: `supabase db push` applica la migrazione e `pnpm sync` stampa il numero di ricette;
5. riallinea `sviluppo`: `git fetch origin && git merge --ff-only origin/main && git push`.
