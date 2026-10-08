# Prototipo di Cosa si mangia

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
- Reparti, ingredienti di dispensa e duplicati ricondotti, dimostrativi, in
  `scripts/demo-ingredients.json`.
- Persone, famiglie, voti, ingrediente evitato e due liste della spesa inventati in
  `src/lib/demo-data/seed.ts`; dal giro 4 anche Marco (ex membro, per la regola R2),
  Giulia (senza famiglie), tre inviti e le impostazioni della Famiglia Folloni ricavate
  dalle regole di origine. Dal giro 5 Lucia è curatrice; versioni, bozze di Lucia, la
  seconda versione degli hamburger di cavallo e la ricetta archiviata sono inventate.
  Dal giro 6 agenti collegati, inviti all'app e backup del ricettario (ricavati dallo
  storico delle versioni) sono inventati.
- Lo stato salvato ha una versione (`STORAGE_KEY` in `src/lib/store/persistence.ts`):
  va incrementata quando cambiano dati di partenza o impostazioni.

## Pannello Prova

Il pulsante "Prova" (in basso a destra) non fa parte dell'app: cambia utente e ruoli,
famiglia, lingua, unità, data e ora simulate, scenario, modalità offline e azzera i
dati demo. Simula anche un altro membro che cambia un pasto (giro 2) o spunta una
voce di una lista della spesa aperta (giro 3). Dal giro 4: utente «nessuno» e scenario
«Primo accesso», apertura dei link d'invito demo e del link di eliminazione della famiglia.
Dal giro 5: un'altra curatrice che salva la bozza aperta (conflitto). Dal giro 6: un agente che
chiede l'accesso (schermata di autorizzazione) e gli inviti all'app demo.

## Struttura

`src/lib/domain` tipi e calendario · `src/lib/units` quantità e conversioni ·
`src/lib/i18n` testi it-IT/en-GB · `src/lib/operations` operazioni simulate
(revisione dei pasti in `revision.ts`, suggerimenti simulati in `suggestions.ts`,
spesa in `shopping.ts` e liste salvate in `shopping-lists.ts`, famiglia e account in
`family.ts`, `invitations.ts`, `onboarding.ts`, `account.ts`; curatela in
`curation.ts`, con la validazione condivisa in `src/lib/domain/recipe-validation.ts`;
dal giro 6 amministrazione in `admin.ts`, `app-invitations.ts`, `catalogue-backup.ts`,
agenti in `agents.ts` e passaggi dei client in `src/lib/mcp-clients.ts`) ·
`src/lib/store` stato e persistenza · `src/lib/components` componenti ·
`src/routes` viste (`/menu`, `/shopping/[week]`, `/recipes`, `/recipes/[id]`, `/profile` e sottopagine,
`/welcome`, `/welcome/family`, `/invite/[token]`, dal giro 5 `/recipes/new`,
`/recipes/drafts/[id]`, `/recipes/[id]/versions` e `/recipes/[id]/versions/[version]`,
dal giro 6 `/profile/agents`, `/authorize`, `/admin` e sottopagine, `/invite/app/[token]`).
Il progetto usa SvelteKit 3: alias `#lib/...` con estensione esplicita.
