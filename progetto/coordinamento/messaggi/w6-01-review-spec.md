# W6 ricettario — rilievi della review di spec e piano

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w6-ricettario-spec-piano.md`.
Verdetto «da rifare». Leggilo tutto e correggi spec e piano.

## Decisioni del coordinatore

**Rilievo 1 — viste condivise con W1.** Tu sei l'unico autore di
`contract/src/recipes/views.ts` e `server/src/recipes/views.ts`; le firme sono le tue e
W1 si adegua (glielo passo io). Nella spec scrivi una sezione **«Interfaccia per W1»**
con le firme TypeScript esatte e definitive, che coprano ciò che serve al Menu:
- riepiloghi per un insieme di riferimenti `{recipeId, version: number | null,
  servings}` in blocco, **comprese le versioni storiche** (R1) e le ricette mai
  pubblicate (solo nome e descrizione), già nella prima PR piccola;
- `ratingSummaries(tx, familyId, userId, recipeIds)` con il tuo nome dello schema;
- righe di ingrediente: tieni la funzione pura e aggiungi un caricatore asincrono in
  blocco (transazione + riferimenti → mappa per chiave) che W1 chiama senza ricostruire
  i nomi da solo;
- le chiavi (`recipeViewKey`) esportate.
Nella prima PR aggiungi un test che usa le viste come le userà il Menu (versione
storica, ricetta mai pubblicata, porzioni diverse).

**Rilievo 2 — testi mancanti nelle bozze.** Proiezioni tipizzate come parziali; nome
nella lingua dell'utente, altrimenti nell'altra lingua (`recipes.name` ha sempre
almeno una lingua per le bozze); descrizione `string | null`. Test con bozza citata,
utente inglese, traduzione assente, descrizione nulla.

**Rilievo 3 — storico nella cache.** La lettura trasmette **tutti** i pasti futuri
pianificati della ricetta (sono pochi), non i primi tre; la UI ne mostra tre. Mentre la
pagina è aperta, un timer al prossimo `passesAt` fa ricalcolare la derivazione. Test con
quattro occorrenze, ora che avanza senza scritture e risposta «invariato».

**Esclusioni:** fuori dal tuo perimetro, nessuna chiamata a `family.addExclusion` da W6
(la userà la revisione dei pasti). Correggo io il piano generale.

**File condivisi:** `domain/package.json` solo con aggiunte puntuali; tipi dell'API web,
API finta e dati demo li adegui tu per l'area `recipes`/`ratings`; `IngredientList` è
tuo (componenti della ricetta): aggiungi la preparazione (rilievo 7), W1 lo riusa.

## Rilievi tecnici: correggi come propone il revisore

4 (libro della versione storica dal suo `bookId`, titoli in blocco), 6 (ordine per
`p.at`), 7, 8 (test web prima del collegamento, adeguamenti espliciti alla forma di W5:
`{items}`, `baseServings`), e dalla sezione 3 il test con un ex membro rimosso davvero
(stesso JWT) e chiamate MCP effettive di ricerca e dettaglio. Il rilievo 5 riguarda W2:
lo correggo con lui.

Contesto: W2 e W1 costruiranno l'implementatore in un solo punto (`server/src/router.ts`)
passando `os` ai factory delle aree come fai già tu: tieni quel modello ed esporta il tipo
`Implementer` da `server/src/pipeline.ts` se arrivi prima.

Quando hai finito: commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta.
