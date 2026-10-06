import type { Locale, MeasurementSystem, Quantity } from '#lib/domain/types.ts';
import { translate } from '#lib/i18n/translate.ts';
import { presentAmount, roundForDisplay, type PresentedUnit } from './present';

// [singular, plural]; an empty label means the number alone (pieces).
const UNIT_LABELS: Record<Locale, Record<PresentedUnit, [string, string]>> = {
	'it-IT': {
		g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'],
		lb: ['lb', 'lb'], fl_oz: ['fl oz', 'fl oz'], pint: ['pinta', 'pinte'], piece: ['', ''],
		clove: ['spicchio', 'spicchi'], tbsp: ['cucchiaio', 'cucchiai'],
		tsp: ['cucchiaino', 'cucchiaini'], slice: ['fetta', 'fette'], pinch: ['pizzico', 'pizzichi']
	},
	'en-GB': {
		g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], oz: ['oz', 'oz'],
		lb: ['lb', 'lb'], fl_oz: ['fl oz', 'fl oz'], pint: ['pint', 'pints'], piece: ['', ''],
		clove: ['clove', 'cloves'], tbsp: ['tbsp', 'tbsp'], tsp: ['tsp', 'tsp'],
		slice: ['slice', 'slices'], pinch: ['pinch', 'pinches']
	}
};

const FRACTION_UNITS = new Set<PresentedUnit>(['piece', 'clove', 'tbsp', 'tsp', 'slice', 'pinch', 'lb', 'pint']);
const FRACTIONS: Record<number, string> = { 25: '¼', 50: '½', 75: '¾' };

export function formatQuantity(
	q: Quantity,
	sourceText: string,
	system: MeasurementSystem,
	locale: Locale
): string {
	if (q.kind === 'to_taste') return translate(locale, 'quantity.toTaste');
	if (q.kind === 'text') return sourceText;
	const { value, unit } = roundForDisplay(presentAmount(q.value, q.unit, system));
	const [singular, plural] = UNIT_LABELS[locale][unit];
	const fraction = FRACTION_UNITS.has(unit) ? FRACTIONS[Math.round((value % 1) * 100)] : undefined;
	// Countable units read better as "½ spicchio", "1½ spicchi" than as decimals.
	const number =
		fraction !== undefined
			? `${Math.floor(value) || ''}${fraction}`
			: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
	const label = value <= 1 ? singular : plural;
	return label ? `${number} ${label}` : number;
}
