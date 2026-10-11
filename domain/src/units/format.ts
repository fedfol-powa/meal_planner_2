import { COUNTED_UNITS, ML_PER_UK_TBSP, ML_PER_UK_TSP, type CountedUnit, type UnitCode } from './codes.ts';
import type { CombinedQuantity } from './combined.ts';
import { TO_TASTE, UNIT_LABELS } from './labels.ts';
import type { Locale } from './locale.ts';
import { presentAmount, presentCount, presentMass, presentVolume, type CountRounding, type MeasurementSystem, type PresentedAmount } from './present.ts';
import type { Quantity } from './quantity.ts';

const DECIMAL_UNITS: ReadonlySet<UnitCode> = new Set<UnitCode>(['g', 'kg', 'ml', 'l']);
const FRACTIONS: Record<number, string> = { 25: '¼', 50: '½', 75: '¾' };

function formatNumber(value: number, unit: UnitCode, locale: Locale): string {
	// Counted and imperial units read better as "1½ spicchi" than as decimals.
	if (!DECIMAL_UNITS.has(unit)) {
		const whole = Math.floor(value + 1e-9);
		const rest = Math.round((value - whole) * 100);
		if (rest === 0) return String(whole);
		const fraction = FRACTIONS[rest];
		if (fraction) return `${whole || ''}${fraction}`;
	}
	return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function formatAmount({ value, unit }: PresentedAmount, locale: Locale): string {
	const [singular, plural] = UNIT_LABELS[locale][unit];
	const label = value <= 1 ? singular : plural;
	const number = formatNumber(value, unit, locale);
	return label ? `${number} ${label}` : number;
}

/**
 * One recipe line, as in recipes, meal cards and item sources: `scaled` when the servings differ
 * from the source's (whole cloves, halves of pieces), `recipe` at the source's servings (counts as written).
 */
export function formatQuantity(q: Quantity, system: MeasurementSystem, locale: Locale, rounding: 'recipe' | 'scaled' = 'recipe'): string {
	if (q.kind === 'to_taste') return TO_TASTE[locale];
	if (q.kind === 'text') return q.text[locale];
	return formatAmount(presentAmount(q.value, q.unit, system, rounding), locale);
}

export interface FormatOptions {
	system: MeasurementSystem;
	locale: Locale;
	rounding?: CountRounding;
}

/** A sum to buy, converted and rounded only now: "50 g + 100 ml + 2 + q.b." (spec section 6). */
export function formatCombined(c: CombinedQuantity, { system, locale, rounding = 'shopping' }: FormatOptions): string {
	const parts: string[] = [];
	let merged: CountedUnit | null = null;
	if (c.mass_g !== null) parts.push(formatAmount(presentMass(c.mass_g, system), locale));
	if (c.volume_ml !== null) {
		const volume = presentVolume(c.volume_ml, system);
		const spoons = volume.unit === 'tbsp' || volume.unit === 'tsp' ? c.counts[volume.unit] : undefined;
		if (spoons !== undefined && (volume.unit === 'tbsp' || volume.unit === 'tsp')) {
			// "3 tbsp", not "2 tbsp + 1 tbsp": shown as one sum, still kept apart in the calculation.
			const perSpoon = volume.unit === 'tbsp' ? ML_PER_UK_TBSP : ML_PER_UK_TSP;
			parts.push(formatAmount(presentCount(c.volume_ml / perSpoon + spoons, volume.unit, rounding), locale));
			merged = volume.unit;
		} else parts.push(formatAmount(volume, locale));
	}
	for (const unit of COUNTED_UNITS) {
		const value = c.counts[unit];
		if (value !== undefined && unit !== merged) parts.push(formatAmount(presentCount(value, unit, rounding), locale));
	}
	parts.push(...c.texts.map((t) => t.text[locale]));
	if (c.to_taste) parts.push(TO_TASTE[locale]);
	return parts.join(' + ');
}
