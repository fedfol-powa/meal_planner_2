# «Gestione del ricettario» al posto di «curatela»: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sostituire il termine italiano «curatela» con «gestione del ricettario» (o
«gestione», con articoli e frasi adattati) nei documenti vivi e nell'interfaccia italiana
del prototipo, come deciso dall'utente.

**Architecture:** sola modifica di testo. Il ruolo «curatore/curatori» resta invariato,
il codice in inglese (`curation`, chiavi i18n, nomi di file) resta invariato. Dove la frase
si allunga, il paragrafo si riallinea alla larghezza abituale (circa 90 caratteri) senza
cambiare altro.

**Tech Stack:** Markdown; prototipo SvelteKit (`prototype/`, `npm run check`, `npm test`).

**Spec:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`.

## Global Constraints

- «curatore», «curatori», «curatrice» restano invariati.
- Identificatori, chiavi i18n e nomi di file in inglese (`curation`, `curation.ts`,
  `profile.dest.curation`, `messages-curation.ts`) restano invariati.
- Non si modificano i piani chiusi in `progetto/superpowers/plans/` (registro storico).
- Non si modificano le righe già presenti del registro delle revisioni (sezione 16 della
  specifica): registrano le decisioni con il linguaggio dell'epoca; la nuova riga spiega
  il cambio.

## Review Focus

1. **Etichetta inglese:** `profile.dest.curation` in inglese resta «Recipe curation».
   «Curation» in inglese non ha il significato giuridico dell'italiano «curatela» ed è
   coerente con «curator», che resta. Alternativa se il coordinatore preferisce il
   parallelo stretto: «Recipe book management».
2. **Righe storiche del registro** (specifica, righe 1878 e 1893): restano con
   «curatela» (vedi vincoli). Dopo il lavoro il grep troverà solo queste due righe e i
   piani chiusi.
3. **Intestazione della specifica:** «Ultimo aggiornamento» passa all'11 ottobre
   (proposta sotto); se si preferisce lasciarla, si toglie la sostituzione S0.
4. **Titoli usati come riferimento:** nessun link punta all'ancora `#curatela`
   (verificato con grep), quindi rinominare il titolo di `design/design.md` non rompe
   collegamenti.
5. **Testi del prototipo:** nessun test né altro file del prototipo contiene
   «Curatela del ricettario» (verificato con grep).

---

### Task 1: Interfaccia del prototipo

**Files:**
- Modify: `prototype/src/lib/i18n/messages.ts:155`

- [ ] **Step 1: Sostituzione**

| Riga | Prima | Dopo |
|---|---|---|
| 155 | `'profile.dest.curation': 'Curatela del ricettario',` | `'profile.dest.curation': 'Gestione del ricettario',` |
| 371 | `'profile.dest.curation': 'Recipe curation',` | invariata (Review Focus 1) |

- [ ] **Step 2: Verifica**

Run (in `prototype/`, dopo `npm install` se manca `node_modules`): `npm run check && npm test`
Expected: nessun errore, test verdi.

### Task 2: Specifica

**Files:**
- Modify: `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`

- [ ] **Step 1: Sostituzioni** (righe del file attuale su `main`, commit 03152b3)

| ID | Riga | Prima | Dopo |
|---|---|---|---|
| S0 | 4 | `Ultimo aggiornamento: 8 ottobre 2026 (nome dell'app «Cosa si mangia» e dominio` | `Ultimo aggiornamento: 11 ottobre 2026 («gestione del ricettario» al posto di «curatela»); 8 ottobre 2026 (nome dell'app «Cosa si mangia» e dominio` (riallineando le righe 4-6) |
| S1 | 292 | `una sezione dell'app dedicata alla curatela` | `una sezione dell'app dedicata alla gestione del ricettario` |
| S2 | 308-309 | `nel percorso iniziale di curatela MCP.` | `nel percorso iniziale di gestione del ricettario tramite MCP.` |
| S3 | 821 | `lavoro della curatela.` | `lavoro di gestione del ricettario.` |
| S4 | 1219 | `nella sezione di curatela dell'app` | `nella sezione di gestione del ricettario dell'app` |
| S5 | 1220 | `la sezione di curatela per la consultazione` | `la sezione di gestione per la consultazione` |
| S6 | 1279 | `restano parte della curatela iniziale.` | `restano parte della gestione iniziale del ricettario.` |
| S7 | 1285 | `parte del percorso di curatela.` | `parte del percorso di gestione del ricettario.` |
| S8 | 1446 | `**Curatela manuale (M6)**` | `**Gestione manuale del ricettario (M6)**` |
| S9 | 1490 | `operazioni di curatela e amministrazione.` | `operazioni di gestione del ricettario e amministrazione.` |
| S10 | 1505-1506 | `dipendenza fra curatela e pubblicazione del ricettario importato` | `dipendenza fra gestione e pubblicazione del ricettario importato` |
| S11 | 1512 | `Ripartizione di curatela e amministrazione` | `Ripartizione di gestione del ricettario e amministrazione` |
| S12 | 1517 | `**M6 Curatela manuale — ultima priorità**` | `**M6 Gestione manuale del ricettario — ultima priorità**` |
| S13 | 1524 | `richiesta insieme alla curatela tramite MCP.` | `richiesta insieme alla gestione del ricettario tramite MCP.` |
| S14 | 1561 | `durante la curatela,` | `durante la gestione del ricettario,` |
| S15 | 1626 | `\| Curatela \|` (prima colonna della tabella MCP) | `\| Gestione del ricettario \|` |
| S16 | 1674 | `il flusso di curatela` | `il flusso di gestione del ricettario` |
| S17 | 1710 | `account, Curatela, MCP,` | `account, Gestione del ricettario, MCP,` |
| S18 | 1747 | `**Quinto giro approvato il 7 ottobre 2026:** Curatela.` | `**Quinto giro approvato il 7 ottobre 2026:** Gestione del ricettario.` |
| S19 | 1753-1754 | `Il percorso consigliato per la curatela resta MCP.` | `Il percorso consigliato per la gestione del ricettario resta MCP.` |
| S20 | 1790 | `funzioni dei ruoli (curatela, amministrazione, istruzioni MCP)` | `funzioni dei ruoli (gestione del ricettario, amministrazione, istruzioni MCP)` |
| S21 | 1864 | `dalla curatela MCP o dal modulo manuale` | `dalla gestione tramite MCP o dal modulo manuale` |
| — | 1878, 1893 | righe storiche del registro | invariate (Review Focus 2) |

- [ ] **Step 2: Nuova riga del registro (sezione 16)**, inserita dopo la riga 1899
(«8 ottobre 2026, revisione dell'esperimento del pianificatore»), l'ultima in ordine
cronologico:

```markdown
| 11 ottobre 2026, gestione del ricettario | «Gestione del ricettario» (o «gestione») sostituisce «curatela» nei documenti vivi e nell'interfaccia italiana del prototipo («Gestione del ricettario» nel Profilo). Il ruolo resta «curatore», il codice in inglese resta `curation`; piani chiusi e righe precedenti di questo registro invariati |
```

### Task 3: Altri documenti vivi

**Files:**
- Modify: `AGENTS.md`, `design/design.md`, `design/percorsi.md`, `prototype/README.md`

- [ ] **Step 1: Sostituzioni**

| File | Riga | Prima | Dopo |
|---|---|---|---|
| `AGENTS.md` | 57 | `MCP, curatela, catalogo nel database` | `MCP, gestione del ricettario, catalogo nel database` |
| `AGENTS.md` | 67 | `il quinto (Curatela) e` | `il quinto (Gestione del ricettario) e` |
| `design/design.md` | 240 | `Famiglia, preferenze, curatela, amministrazione e` | `Famiglia, preferenze, gestione del ricettario, amministrazione e` |
| `design/design.md` | 308 | `## Curatela (quinto giro, approvato il 7 ottobre 2026)` | `## Gestione del ricettario (quinto giro, approvato il 7 ottobre 2026)` |
| `design/percorsi.md` | 7 | `(Curatela) e sesto giro` | `(Gestione del ricettario) e sesto giro` |
| `design/percorsi.md` | 64 | `\| 6 \| Curatela \|` | `\| 6 \| Gestione del ricettario \|` |
| `design/percorsi.md` | 247 | `famiglia; curatela.` | `famiglia; gestione del ricettario.` |
| `design/percorsi.md` | 276 | `curatela delle bozze (percorso 6)` | `gestione delle bozze (percorso 6)` |
| `design/percorsi.md` | 839 | `sezione «Curatela del ricettario»` | `sezione «Gestione del ricettario»` |
| `design/percorsi.md` | 1019 | `il flusso di curatela` | `il flusso di gestione del ricettario` |
| `prototype/README.md` | 59 | `curatela in` `` `curation.ts` `` | `gestione del ricettario in` `` `curation.ts` `` |

### Task 4: Verifica e commit

- [ ] **Step 1: grep finale**

Run: `grep -rIin curatel --exclude-dir=node_modules .`
Expected: solo `progetto/superpowers/plans/` (piani chiusi) e le righe 1878 e 1893 della
specifica (registro storico).

- [ ] **Step 2: prototipo e controlli della radice**

Run: in `prototype/` `npm run check && npm test`; nella radice `npm run typecheck && npm test`
(dopo `npm install` se servono le dipendenze).
Expected: tutto verde.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Specifica: «gestione del ricettario» al posto di «curatela»"
```
