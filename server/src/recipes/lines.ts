import type { IngredientLineView } from '@app/contract';
import { formatQuantity, scaleQuantity, type Locale, type Localized, type MeasurementSystem, type Quantity } from '@app/domain/units';

/** A recipe line from a published document. */
export interface LineInput {
	ingredientId: string;
	variety: Localized | null;
	preparation: Localized | null;
	quantity: Quantity;
	isOptional: boolean;
}
export type IngredientNames = ReadonlyMap<string, Localized>;
export interface LinesOptions {
	servings: number;
	baseServings: number;
	system: MeasurementSystem;
	locale: Locale;
}

/** Lines ready to show (spec section 6): scaled, in the family's system, in the caller's language. */
export function ingredientLinesView(lines: LineInput[], names: IngredientNames, options: LinesOptions): IngredientLineView[] {
	const { servings, baseServings, system, locale } = options;
	return lines.map((line) => {
		const name = names.get(line.ingredientId);
		if (!name) throw new Error(`ingredient ${line.ingredientId} missing from the names`);
		return {
			ingredientId: line.ingredientId,
			name: line.variety ? `${name[locale]} ${line.variety[locale]}` : name[locale],
			// Other servings than the source's: whole cloves, halves of pieces (user decision, option 1).
			amount: formatQuantity(scaleQuantity(line.quantity, servings, baseServings), system, locale, servings === baseServings ? 'recipe' : 'scaled'),
			preparation: line.preparation?.[locale] ?? null,
			optional: line.isOptional,
		};
	});
}
