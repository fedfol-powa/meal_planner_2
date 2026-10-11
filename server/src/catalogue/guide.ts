// Guidance the MCP service gives to a curator's agent (spec section 8: the guidance is served by
// the service, not left to one agent's memory). Ingredient rules from the fifth prototype round
// (prototype/src/lib/operations/curation-guide.ts), with the real tool names.

export const CURATOR_GUIDE = `# Managing the recipe book as a curator

## Flow
1. Search ingredients (catalogue_searchIngredients) and books (catalogue_listBooks) before creating any.
   To fix an existing ingredient, read it first (catalogue_getIngredient) and send back all its data with
   its version (catalogue_updateIngredient).
2. To revise, archive or restore a published recipe, find it with catalogue_searchRecipes.
3. Save a draft early and often: catalogue_createDraft with a new id, then catalogue_saveDraft with the
   revision you last read as baseRevision. Incomplete data is fine; wrong data is refused with codes and paths.
   Open drafts are listed by catalogue_overview; a published recipe is edited through catalogue_startRevision.
4. Before proposing to publish, run catalogue_checkDraft and ask targeted questions for every problem.
5. Show the curator the complete card, translations included, and publish (catalogue_publish) only after an
   explicit yes.
6. conflict of kind "draft": another curator saved meanwhile. Show their version (theirs) and the fields each
   of you changed; either take theirs (read the draft again with catalogue_getDraft) or overwrite it by saving
   again with overwriteRevision set to their revision.
7. conflict of kind "version": the recipe got a newer version after the revision started. Tell the curator and
   publish again with confirmVersion only if they confirm.
8. To restore an older version (catalogue_restoreVersion) show it first (catalogue_getVersion) and pass the
   current version you saw as confirmVersion.

## What publishing requires
- Name and description in Italian and British English; duration; base servings.
- Source: web or youtube need the address; book needs the book and pages; home needs nothing else; fields not
  relevant to the type stay empty.
- Planner attributes: mealType, proteinGroup, carbohydrateGroup, category, isFreshFish, hasVegetables, isHeavy
  (seasons and the primary ingredient are optional).
- At least one ingredient line; each with an amount and a publishable unit, "to taste" when the source says so,
  or a quantity in words in both languages; variety and preparation in both languages when present.
- US cups are converted by the ingredient's recipe equivalence (catalogue_setEquivalence, with the source of
  the figure); a cup without an equivalence cannot be published.

# Recipe ingredients

Each ingredient line has: a catalogue ingredient, an optional variety, a quantity, the text as written
in the source, and whether it is optional. Amounts are for the recipe's base servings.

## 1. Only verified ingredients
- Use only ingredients read on the source or given by the curator. Never infer them from the name of
  the dish. If the source is unreadable or incomplete, save a draft and ask the curator.

## 2. Catalogue ingredient = the generic product
- The ingredient is what the shop sells in general: "Pomodori", "Uva", "Mele".
- Search first (catalogue_searchIngredients): the search also finds varieties already used,
  e.g. "cuore di bue" returns Pomodori with that variety. Reuse what you find.
- Create a new ingredient (catalogue_createIngredient) only when nothing fits, with the Italian and English
  name and the shopping aisle. Never put a variety, size or preparation in the ingredient name.

## 3. Variety: only when it changes what to buy
- Add a variety only when the source names a product you buy differently: a cultivar or type such as
  "Roma", "cuore di bue", "Granny Smith", "gialla senza semi".
- Not a variety: size ("grande", "piccola"), ripeness or quality ("maturo", "fresco"), preparation
  ("tritato", "a dadini", "succo", "scorza"). These stay only in the source text of the line.
- Before writing one, list the varieties already used for that ingredient (catalogue_listVarieties) and
  reuse the same spelling when it is the same variety.
- Write it without the ingredient name and without "tipo" or "varietà": "Roma", not "Pomodoro tipo Roma".
  Keep proper names capitalised; write common words in lower case ("gialla senza semi").
- Give it in Italian and British English; a proper name may stay the same ("Roma"/"Roma").
- Check it (catalogue_checkVariety) and resolve every hint before saving:
  - existing_spelling: use the suggested spelling unless the curator says it is a different variety;
  - repeats_ingredient: drop the ingredient name, use the suggestion;
  - preparation: remove the variety and keep the words in the source text.

## 4. Quantities
- Amount and unit as in the source, for the base servings. Convert nothing at this stage.
- "q.b." / to taste only when the source says so; an unknown amount is a question for the curator,
  never "q.b.".
- A quantity in words ("1 spicchio", "una manciata") is a text quantity, in both languages.
- sourceText is the line exactly as written in the source, preparation included.

## 5. One line per ingredient and variety
- The same ingredient may appear twice only with different varieties. If the source lists it twice
  (e.g. oil for the sauce and for frying), merge the amounts into one line and keep both in the
  source text.

## 6. Before saving and publishing
- Show the complete card to the curator, translations included, and publish only after an explicit yes.
- Saving a draft accepts missing data; publishing checks everything again (catalogue_checkDraft,
  catalogue_publish).
`;
