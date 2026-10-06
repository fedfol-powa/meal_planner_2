import type { CombinedQuantity, Locale, MeasurementSystem, Quantity, UnitCode } from '#lib/domain/types.ts';
import { translate } from '#lib/i18n/translate.ts';
import { formatQuantity } from './format';
import { ML_PER_US_CUP } from './present';

// Provisional factor, same as present.ts (spec section 15, "Misure").
const G_PER_OZ = 28.349523125;

export type { CombinedQuantity };

export const emptyCombined = (): CombinedQuantity => ({ amounts: [], texts: [], toTaste: false });

function common(value: number, unit: UnitCode): { value: number; unit: UnitCode } {
	if (unit === 'kg') return { value: value * 1000, unit: 'g' };
	if (unit === 'oz') return { value: value * G_PER_OZ, unit: 'g' };
	if (unit === 'l') return { value: value * 1000, unit: 'ml' };
	if (unit === 'us_cup') return { value: value * ML_PER_US_CUP, unit: 'ml' };
	return { value, unit };
}

export function addQuantity(c: CombinedQuantity, q: Quantity, text: string): CombinedQuantity {
	if (q.kind === 'to_taste') return { ...c, toTaste: true };
	if (q.kind === 'text') return c.texts.includes(text) ? c : { ...c, texts: [...c.texts, text] };
	const next = common(q.value, q.unit);
	const found = c.amounts.find((a) => a.unit === next.unit);
	const amounts = found
		? c.amounts.map((a) => (a === found ? { ...a, value: a.value + next.value } : a))
		: [...c.amounts, next];
	return { ...c, amounts };
}

/** Converts and rounds only now, after the sum (spec section 6). */
export function formatCombined(c: CombinedQuantity, system: MeasurementSystem, locale: Locale): string {
	const parts = c.amounts.map(({ value, unit }) => {
		const large = (unit === 'g' || unit === 'ml') && value >= 1000;
		const shown: Quantity = { kind: 'amount', value: large ? value / 1000 : value, unit: large ? (unit === 'g' ? 'kg' : 'l') : unit };
		return formatQuantity(shown, '', system, locale);
	});
	parts.push(...c.texts);
	if (c.toTaste) parts.push(translate(locale, 'quantity.toTaste'));
	return parts.join(' + ');
}

/** True when `now` asks for more than `before` (a ticked item needs ticking again). */
export function exceeds(now: CombinedQuantity, before: CombinedQuantity): boolean {
	const more = now.amounts.some((a) => {
		const old = before.amounts.find((b) => b.unit === a.unit);
		return !old || a.value > old.value * (1 + 1e-9) + 1e-9;
	});
	return more || now.texts.some((t) => !before.texts.includes(t)) || (now.toTaste && !before.toTaste);
}
