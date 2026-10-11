# W1 menu — viste di W6 definitive

Fase: correzioni di spec e piano dopo la review. Hai già corretto tutto tranne
l'adeguamento alle viste condivise (commit `7a56a93`; rilievi in
`/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-menu-spec-piano.md`,
decisioni in `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/messaggi/w1-07-review-menu.md`).

L'interfaccia di W6 è ora **definitiva**: sezione 1 di
`/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md`
(commit `f5b1dd2` del branch `traguardo/ricettario`). Registrata nel piano generale,
«Interfaccia per W1 definitiva».

Da fare:

1. Adegua spec e piano (task 4 e 9 e ovunque citi le viste) a quelle firme esatte:
   `RecipeRef` costruiti da `mealRecipeVersions` e dalle porzioni dello slot,
   `recipeViews` / `recipeSummaries` / `ingredientLines` / `ratingSummaries(tx, familyId,
   userId, recipeIds)`, chiavi `recipeViewKey`. Non scrivi mai i due `views.ts`.
2. Cancello dei task che le usano: PR delle viste di W6 unita (con `ratings.set`,
   `RecipeCard`, `IngredientList` e tipi web della ricetta adeguati da W6). Prova del voto
   dal Menu con risposta applicata solo dopo conferma del server.
3. Implementatore unico in `server/src/router.ts` con `{ prepare }`; aree come factory che
   ricevono `os` (tipo `Implementer` da `server/src/pipeline.ts`).
4. Sei **produttore** di `mealRecipeVersions` per W4: nel piano metti per primo un task
   che lo consegna in una **PR piccola** (`server/src/menu/versions.ts` con test), da
   unire subito; dipende solo dallo schema già su `main`.

Commit, `STATO: SPEC_E_PIANO_CORRETTI`, e aspetta: segue una seconda review breve.
