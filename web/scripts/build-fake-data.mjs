// Reads the prototype demo data (read only) and keeps what the fake client needs.
// Recipes and verified ingredients come from ../meal_planner via the prototype; English texts are demo only.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(resolve(root, '../prototype/src/lib/demo-data/generated.json'), 'utf8'));
// Protein groups as classified for the import (8 codes of domain/src/planner); the prototype had 6.
const attributes = parse(readFileSync(resolve(root, '../scripts/import/recipe-attributes.yaml'), 'utf8')).recipes;
const proteinGroup = (r) => attributes[r.id]?.protein_group ?? (r.proteinGroup === 'meat' ? 'red_meat' : r.proteinGroup);

// The list marks optional lines itself: the names keep only the ingredient.
const OPTIONAL_SUFFIX = / \((facoltativ[oa]|opzionale|optional)\)$/;
const plainName = (name) => Object.fromEntries(Object.entries(name).map(([locale, text]) => [locale, text?.replace(OPTIONAL_SUFFIX, '') ?? text]));

const data = {
  books: source.books,
  ingredients: source.ingredients.map(({ id, name, department, isPantry }) => ({ id, name: plainName(name), department, isPantry })),
  recipes: source.recipes.map((r) => ({
    id: r.id, status: r.status, name: r.name, description: r.description, sourceType: r.sourceType,
    sourceUrl: r.sourceUrl, bookId: r.bookId, bookPages: r.bookPages, durationMinutes: r.durationMinutes,
    baseServings: r.baseServings, mealType: r.mealType, proteinGroup: proteinGroup(r), addedOn: r.addedOn,
    ingredients: r.ingredients.map(({ ingredientId, quantity, sourceText, text, isOptional }) => ({ ingredientId, quantity, sourceText, text: text ?? null, isOptional }))
  })),
  weeks: source.weeks.map(({ startsOn, generatedAt, slots }) => ({
    startsOn, generatedAt,
    slots: slots.map(({ id, date, mealType, recipeId, freeText, servings, note }) => ({ id, date, mealType, recipeId, freeText, servings, note }))
  })),
  federicoRatings: source.federicoRatings
};

writeFileSync(resolve(root, 'src/api/fake/demo-data.json'), `${JSON.stringify(data, null, 1)}\n`);
console.log(`Fake data: ${data.recipes.length} recipes, ${data.weeks.length} weeks`);
