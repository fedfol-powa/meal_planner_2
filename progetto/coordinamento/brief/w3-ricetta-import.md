# Brief W3: Ricetta e import

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `fondamenta/ricetta-import` · **Worktree:** `.worktrees/ricetta-import`
- **Proprietà:** `domain/src/recipe/`, `scripts/import/` (esiste già
  `recipe-attributes.yaml`), `scripts/planner-data/` se serve adattarlo.
- **Specifica:** sezioni 2 (catalogo), 8, 11, 12, 15, 16, 17 (R1, R4); `design/percorsi.md`
  per il quinto giro; il prototipo in `prototype/src/lib/domain` e
  `prototype/src/lib/operations/curation.ts`, `recipes.ts` come riferimento;
  `../meal_planner` in sola lettura.

## Obiettivo

- **Documento ricetta**: schema zod unico con livello bozza (parziale) e livello
  pubblicabile (completo), campi obbligatori per tipo di fonte, vocabolari confermati,
  righe di ingrediente (ingrediente, varietà, quantità, unità, testo della fonte,
  preparazione, facoltativo, principale), testi nelle due lingue;
- controlli di completezza e messaggi a codici; funzioni che ricavano le proiezioni;
- **proposta sui campi bilingui** (sezione 15): presentala al coordinatore con
  pro e contro, decide l'utente;
- **import rilanciabile** da `../meal_planner/ricettario/ricette.yaml`: identità
  d'origine conservata, solo schede nuove, casi R4 (familiarità iniziale, ricette di
  casa con URL), voci dello storico non riconosciute nel report delle ambiguità; output
  pensato per finire nel database tramite le operazioni (non scrivere su database in
  questa attività: produci dati validati e il report);
- traduzioni en-GB: proposta di come prepararle e farle rivedere all'utente; gli
  ingredienti si prendono solo dalla fonte, mai dedotti dal nome del piatto.

## Vincoli dal coordinamento

- I codici delle unità e la forma della quantità li condividi con W4 (unità e spesa):
  proponili presto al coordinatore, sono un'interfaccia.
- La forma del documento la usa W2 per `recipe_versions.content` e le proiezioni:
  pubblica una bozza dello schema appena stabile.
- Il pianificatore in `domain/src/planner/` legge già gli attributi: non romperlo.
