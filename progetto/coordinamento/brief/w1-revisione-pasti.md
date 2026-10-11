# Brief W1: Revisione dei pasti

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/revisione-pasti` (da `origin/main`) · **Worktree:**
  `.worktrees/revisione-pasti`
- **Area:** modifiche dei pasti della settimana da parte dei membri (area `menu` o una
  nuova area `meals`: decidilo nel brainstorming, il menu è tuo).
- **Specifica:** sezione 5 (revisione dei pasti, modifiche, annullamento, R1), parte 1
  sulla revisione dei pasti, la decisione del 6 ottobre 2026 sul secondo giro del prototipo
  (sezione 16: niente avvisi di settimana; vince l'ultimo salvataggio; scambio nella stessa
  settimana con piatto e nota; «non proporre più» che apre la scelta del sostituto;
  «proponimene altri»; voto solo visualizzato nei suggerimenti; annullamento delle proprie
  modifiche; pannello dalla matita con porzioni, cambia ricetta, nota, pasto libero,
  esclusione e scambio), `design/percorsi.md` e il prototipo; più 1, 13, 15, 16.

## Obiettivo

Operazioni del contratto, server, strumenti MCP e schermate per rivedere i pasti della
settimana: porzioni, cambio di ricetta con suggerimenti, nota, pasto libero, scambio,
«non proporre più», annullamento, con lo storico in `meal_slot_changes` (o la tabella
dello schema) e le versioni R1.

## Su cosa costruisci (tutto su `main`)

- Menu, pianificatore, `mealRecipeVersions`, `mealPassedCount`, viste della settimana
  (tuoi, PR #13, #15, #20 quando unita).
- Esclusioni di W2: `family.addExclusion` (idempotente) per «non proporre più» (PR #16).
- Viste e voti di W6 (`server/src/recipes/views.ts`, PR #12) per i suggerimenti.
- Client reale e sessione di W5 (PR #17); profilo di W2 (PR #18 quando unita).

## Vincoli dal coordinamento (ordine dell'ondata 2)

- Nella spec scrivi cosa **usi** da altre attività e cosa **produci**, con le firme; il
  coordinatore le fissa prima dell'implementazione.
- I suggerimenti di «cambia ricetta» riusano il pianificatore, non una seconda logica.
- Le modifiche cambiano i contatori della famiglia; le letture del menu e della spesa che
  ne dipendono si rinnovano (versioni e invalidazioni esplicite nel web).
- Migrazioni solo se servono, dichiarate nella spec, con pgTAP.
