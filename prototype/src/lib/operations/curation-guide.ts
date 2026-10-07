// Guidance the MCP service gives to a curator's agent when it writes recipe ingredients (round 5, draft).
// The spec (section 8) wants the guidance served by the service, not left to one agent's memory: the
// MCP route (percorso 7) exposes this text with the operations it names. Italian review copy in
// design/percorsi.md, "Giro 5".

export const INGREDIENT_GUIDE = `# Recipe ingredients

Each ingredient line has: a catalogue ingredient, an optional variety, a quantity, the text as written
in the source, and whether it is optional. Amounts are for the recipe's base servings.

## 1. Only verified ingredients
- Use only ingredients read on the source or given by the curator. Never infer them from the name of
  the dish. If the source is unreadable or incomplete, save a draft and ask the curator.

## 2. Catalogue ingredient = the generic product
- The ingredient is what the shop sells in general: "Pomodori", "Uva", "Mele".
- Search first (searchCatalogueIngredients): the search also finds varieties already used,
  e.g. "cuore di bue" returns Pomodori with that variety. Reuse what you find.
- Create a new ingredient (createIngredient) only when nothing fits, with the Italian and English name
  and the shopping aisle. Never put a variety, size or preparation in the ingredient name.

## 3. Variety: only when it changes what to buy
- Add a variety only when the source names a product you buy differently: a cultivar or type such as
  "Roma", "cuore di bue", "Granny Smith", "gialla senza semi".
- Not a variety: size ("grande", "piccola"), ripeness or quality ("maturo", "fresco"), preparation
  ("tritato", "a dadini", "succo", "scorza"). These stay only in the source text of the line.
- Before writing one, list the varieties already used for that ingredient (getIngredientVarieties) and
  reuse the same spelling when it is the same variety.
- Write it without the ingredient name and without "tipo" or "varietà": "Roma", not "Pomodoro tipo Roma".
  Keep proper names capitalised; write common words in lower case ("gialla senza semi").
- Give it in Italian and British English; a proper name may stay the same ("Roma"/"Roma").
- Check it (checkVariety) and resolve every hint before saving:
  - existing_spelling: use the suggested spelling unless the curator says it is a different variety;
  - repeats_ingredient: drop the ingredient name, use the suggestion;
  - preparation: remove the variety and keep the words in the source text.

## 4. Quantities
- Amount and unit as in the source, for the base servings. Convert nothing at this stage.
- "q.b." / to taste only when the source says so; an unknown amount is a question for the curator,
  never "q.b.".
- A quantity in words ("1 spicchio", "una manciata") is a text quantity, in both languages.
- sourceText is the quantity exactly as written in the source, preparation included.

## 5. One line per ingredient and variety
- The same ingredient may appear twice only with different varieties. If the source lists it twice
  (e.g. oil for the sauce and for frying), merge the amounts into one line and keep both in the
  source text.

## 6. Before saving
- Show the complete card to the curator, translations included, and save only after confirmation.
- Saving a draft accepts missing data; publishing checks everything again (verifyDraft, publishDraft).
`;
