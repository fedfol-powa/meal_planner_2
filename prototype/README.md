# Prototipo di App Famiglia

Prototipo esplorativo, solo client, per rivedere flussi e superfici prima
dell'implementazione. Requisiti: `../progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`;
percorsi e stato dei giri: `../design/percorsi.md`; linguaggio visivo: `../design/design.md`.

Nessun servizio reale: dati demo in memoria, salvati nel `localStorage` del browser,
e operazioni applicative simulate in `src/lib/operations` (bozza delle operazioni
condivise fra web e MCP).

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Installa le dipendenze (Node 26) |
| `npm run dev` | Avvia in sviluppo su http://localhost:5173 (copia prima font e foto da `../design/assets`) |
| `npm test` | Test Vitest di dominio, unità, dati demo, persistenza e operazioni |
| `npm run check` | Controllo dei tipi con svelte-check |
| `npm run build` | Build statica in `build/` |
| `npm run preview:lan` | Build e anteprima sulla rete locale, porta 8766, per la prova su iPhone |
| `npm run demo-data` | Rigenera `src/lib/demo-data/generated.json` da `../../meal_planner` (sola lettura) |

Durante `preview:lan`, prima di una nuova build fermare il server: la build cancella
i file che un browser aperto potrebbe ancora chiedere.

## Dati demo

- Ricette e menu dal progetto di origine `../../meal_planner`, letto e mai modificato.
- Testi inglesi dimostrativi in `scripts/demo-translations.en-GB.json` (ricette,
  ingredienti, quantità non numeriche): non sono traduzioni del catalogo.
- Persone, famiglie e voti inventati in `src/lib/demo-data/seed.ts`.
- Lo stato salvato ha una versione (`STORAGE_KEY` in `src/lib/store/persistence.ts`):
  va incrementata quando cambiano dati di partenza o impostazioni.

## Pannello Prova

Il pulsante "Prova" (in basso a destra) non fa parte dell'app: cambia utente e ruoli,
famiglia, lingua, unità, data e ora simulate, scenario, modalità offline e azzera i
dati demo. Dal giro 2 sceglie anche le varianti da confrontare (ingresso alle azioni
sul pasto, forma dei suggerimenti) e simula la modifica di un pasto da parte di un
altro membro.

## Struttura

`src/lib/domain` tipi e calendario · `src/lib/units` quantità e conversioni ·
`src/lib/i18n` testi it-IT/en-GB · `src/lib/operations` operazioni simulate
(revisione dei pasti in `revision.ts`, suggerimenti simulati in `suggestions.ts`) ·
`src/lib/store` stato e persistenza · `src/lib/components` componenti ·
`src/routes` viste (`/menu`, `/recipes`, `/recipes/[id]`, `/you`).
Il progetto usa SvelteKit 3: alias `#lib/...` con estensione esplicita.
