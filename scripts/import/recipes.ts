import { lineKey, type DraftIngredientLine, type DraftQuantity, type RecipeDraftDocument, type SourceType } from '../../domain/src/recipe/index.ts';
import { applyRecipeEquivalence, findEquivalence } from '../../domain/src/units/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import { durationOf, slug, type OriginRecipe } from '../planner-data/origin.ts';
import type { ImportInputs } from './inputs.ts';
import { parseOriginQuantity } from './quantity.ts';

// One origin card → one recipe document (detail spec, section 4). Ingredients only from the card's own
// lines; every obstacle stays in the document (unresolved or duplicate lines, missing data), so it survives
// bundle.json and the draft save. Findings only explain them in the report.

export type OriginType = OriginRecipe['tipo'];

export type FindingKind =
	| 'home_with_url' | 'book_dependency' | 'unmapped_line' | 'duplicate_after_mapping' | 'quantity_note' | 'cup_without_equivalence'
	| 'mapping_note' | 'alternative_in_name' | 'pantry_excluded' | 'missing_attributes';
export interface RecipeFinding {
	kind: FindingKind;
	detail: string;
}

export interface BuiltRecipe {
	origin: { slug: string; type: OriginType };
	document: RecipeDraftDocument;
	findings: RecipeFinding[];
}

const SOURCE_TYPE: Record<OriginType, SourceType> = { web: 'web', youtube: 'youtube', libro: 'book', casa: 'home' };
const OPTIONAL = /facoltativ|opzional/i;
const ALTERNATIVE = /\((?:o|oppure) |\boppure\b| o [a-zà-ù0-9]/i;
const BOOK_PAGE = /pagina \d+ del libro/i;

function lineQuantity(raw: string | number, ingredient: string | null, preparation: string | null, inputs: ImportInputs, findings: RecipeFinding[], sourceText: string): DraftQuantity {
	const { quantity, note } = parseOriginQuantity(raw);
	if (note) findings.push({ kind: 'quantity_note', detail: sourceText });
	if (quantity.kind === 'text') {
		const italian = String(raw).trim();
		return { kind: 'text', text: { 'it-IT': italian, 'en-GB': inputs.quantityTranslations.get(italian) ?? '' } };
	}
	if (quantity.kind === 'amount' && quantity.unit === 'us_cup') {
		// W4 picks the equivalence of the line's preparation, otherwise one without preparation, never another one.
		const own = ingredient ? inputs.equivalences.filter((e) => e.ingredientId === ingredient) : [];
		const equivalence = findEquivalence(own, 'recipe', 'us_cup', preparation);
		if (equivalence) return applyRecipeEquivalence(quantity, equivalence);
		findings.push({ kind: 'cup_without_equivalence', detail: sourceText });
	}
	return quantity;
}

export function buildRecipe(origin: OriginRecipe, attributes: RecipeAttributes | undefined, inputs: ImportInputs): BuiltRecipe {
	const findings: RecipeFinding[] = [];
	const sourceType = origin.tipo === 'casa' && origin.url ? 'web' : SOURCE_TYPE[origin.tipo];
	if (origin.tipo === 'casa' && origin.url) findings.push({ kind: 'home_with_url', detail: origin.note ?? origin.url });
	if (origin.dipendenze_libro) findings.push({ kind: 'book_dependency', detail: JSON.stringify(origin.dipendenze_libro) });
	if (origin.note && /esclus/i.test(origin.note) && /olio|sale|pepe/i.test(origin.note)) findings.push({ kind: 'pantry_excluded', detail: origin.note });
	if (!attributes) findings.push({ kind: 'missing_attributes', detail: origin.id });

	const seen = new Set<string>();
	const lines: DraftIngredientLine[] = (origin.ingredienti ?? []).map((line) => {
		const sourceText = `${line.nome}: ${line.quantita}`;
		const mapping = inputs.lines.get(line.nome);
		const optional = OPTIONAL.test(String(line.quantita));
		const isPrimary = attributes?.primaryIngredient === slug(line.nome);
		if (!mapping) {
			findings.push({ kind: 'unmapped_line', detail: line.nome });
			return { ingredientId: null, variety: null, preparation: null, quantity: lineQuantity(line.quantita, null, null, inputs, findings, sourceText), sourceText, isOptional: optional, isPrimary };
		}
		if (ALTERNATIVE.test(line.nome)) findings.push({ kind: 'alternative_in_name', detail: line.nome });
		if (BOOK_PAGE.test(line.nome)) findings.push({ kind: 'book_dependency', detail: line.nome });
		if (mapping.note) findings.push({ kind: 'mapping_note', detail: `${line.nome}: ${mapping.note}` });
		const key = lineKey({ ingredientId: mapping.ingredient, variety: mapping.variety });
		if (seen.has(key)) findings.push({ kind: 'duplicate_after_mapping', detail: sourceText });
		seen.add(key);
		return {
			ingredientId: mapping.ingredient,
			variety: mapping.variety,
			preparation: mapping.preparation,
			quantity: lineQuantity(line.quantita, mapping.ingredient, mapping.preparation?.['it-IT'] ?? null, inputs, findings, sourceText),
			sourceText,
			isOptional: mapping.optional || optional,
			isPrimary
		};
	});

	const english = inputs.recipeTranslations.get(origin.id);
	const document: RecipeDraftDocument = {
		schemaVersion: 1,
		name: { 'it-IT': origin.nome, 'en-GB': english?.name ?? '' },
		description: { 'it-IT': origin.descrizione ?? '', 'en-GB': english?.description ?? '' },
		sourceType,
		sourceUrl: origin.url ?? null,
		bookId: origin.libro ? slug(origin.libro.titolo) : null,
		bookPages: origin.libro?.pagine ?? null,
		durationMinutes: attributes?.durationMinutes ?? durationOf(origin.tempo),
		baseServings: origin.porzioni_base,
		mealType: attributes?.mealType ?? null,
		proteinGroup: attributes?.proteinGroup ?? null,
		isFreshFish: attributes?.freshFish ?? null,
		carbohydrateGroup: attributes?.carbohydrateGroup ?? null,
		category: attributes?.category ?? null,
		hasVegetables: attributes?.hasVegetables ?? null,
		isHeavy: attributes?.isHeavy ?? null,
		seasons: attributes?.seasons ?? [],
		ingredients: lines
	};
	return { origin: { slug: origin.id, type: origin.tipo }, document, findings };
}
