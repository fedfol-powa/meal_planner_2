import type { CatalogueLookup } from '../../domain/src/recipe/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import type { OriginRecipe } from '../planner-data/origin.ts';
import type { ImportInputs, IngredientLineMapping } from './inputs.ts';

export const originRecipe = (over: Partial<OriginRecipe> = {}): OriginRecipe => ({
	id: 'pasta-tonno', nome: 'Pasta al tonno', descrizione: 'Condisci la pasta col tonno.', tipo: 'casa', url: null, tempo: '20 min',
	libro: null, porzioni_base: 4,
	ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }],
	collaudata: true, feedback: 3, tag: ['pesce', 'pasta'], storico: [], note: null, ...over
});

export const attributesFor = (over: Partial<RecipeAttributes> = {}): RecipeAttributes => ({
	mealType: 'lunch', proteinGroup: 'fish', freshFish: false, carbohydrateGroup: 'pasta', category: 'other', hasVegetables: false,
	isHeavy: false, seasons: [], primaryIngredient: 'tonno-sott-olio', durationMinutes: null, uncertain: [], note: null, ...over
});

const named = (slug: string, it: string, en: string) => ({ slug, name: { 'it-IT': it, 'en-GB': en }, synonyms: { 'it-IT': [], 'en-GB': [] }, department: 'pasta_grains' as const, isPantry: false });
const plainLine = (ingredient: string): IngredientLineMapping => ({ ingredient, variety: null, preparation: null, optional: false, note: null });

export const inputsWith = (over: Partial<ImportInputs> = {}): ImportInputs => ({
	ingredients: [named('pasta-corta', 'Pasta corta', 'Short pasta'), named('tonno', 'Tonno', 'Tuna'), named('cipolle', 'Cipolle', 'Onions')],
	lines: new Map([
		['Pasta corta', plainLine('pasta-corta')],
		["Tonno sott'olio", { ...plainLine('tonno'), preparation: { 'it-IT': "sott'olio", 'en-GB': 'in oil' } }],
		['Cipolla a dadini', { ...plainLine('cipolle'), preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' } }],
		['Cipolla', plainLine('cipolle')],
		['Cipolla (o 1 cipollotto)', plainLine('cipolle')]
	]),
	recipeTranslations: new Map([['pasta-tonno', { name: 'Tuna pasta', description: 'Dress the pasta with tuna.' }]]),
	quantityTranslations: new Map([['1 vaschetta da 250 g', '1 punnet (250 g)']]),
	equivalences: [],
	pendingReview: [],
	...over
});

/** The catalogue of a bundle as the checks see it. */
export const bundleLookup = (bundle: { ingredients: { slug: string }[]; books: { slug: string }[] }): CatalogueLookup => ({
	hasIngredient: (id) => bundle.ingredients.some((i) => i.slug === id),
	ingredientHasEnglishName: () => true,
	hasBook: (id) => bundle.books.some((b) => b.slug === id)
});
