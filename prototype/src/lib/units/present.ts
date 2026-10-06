import type { MeasurementSystem, UnitCode } from '#lib/domain/types.ts';

// Provisional factors: the verified list is still open (spec section 15, "Misure").
const G_PER_OZ = 28.349523125;
const OZ_PER_LB = 16;
const ML_PER_UK_FL_OZ = 28.4130625;
const UK_FL_OZ_PER_PINT = 20;
// US customary cup (NIST: 8 US fl oz = 236.5882365 ml); provisional like the others.
export const ML_PER_US_CUP = 236.5882365;

export type PresentedUnit = UnitCode | 'lb' | 'fl_oz' | 'pint';
export interface PresentedAmount {
	value: number;
	unit: PresentedUnit;
}

export function presentAmount(value: number, unit: UnitCode, system: MeasurementSystem): PresentedAmount {
	if (unit === 'us_cup') return presentAmount(value * ML_PER_US_CUP, 'ml', system);
	if (system === 'metric') {
		if (unit === 'oz') return { value: value * G_PER_OZ, unit: 'g' };
		// Below one kilo or litre the gram/millilitre rounding of spec section 6 applies.
		if (unit === 'kg' && value < 1) return { value: value * 1000, unit: 'g' };
		if (unit === 'l' && value < 1) return { value: value * 1000, unit: 'ml' };
		return { value, unit };
	}
	let grams: number | null = null;
	let millilitres: number | null = null;
	if (unit === 'g') grams = value;
	else if (unit === 'kg') grams = value * 1000;
	else if (unit === 'ml') millilitres = value;
	else if (unit === 'l') millilitres = value * 1000;
	else return { value, unit };

	if (grams !== null) {
		const ounces = grams / G_PER_OZ;
		return ounces >= OZ_PER_LB ? { value: ounces / OZ_PER_LB, unit: 'lb' } : { value: ounces, unit: 'oz' };
	}
	const fluidOunces = (millilitres as number) / ML_PER_UK_FL_OZ;
	return fluidOunces >= UK_FL_OZ_PER_PINT
		? { value: fluidOunces / UK_FL_OZ_PER_PINT, unit: 'pint' }
		: { value: fluidOunces, unit: 'fl_oz' };
}

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

function ceilTo(value: number, step: number): number {
	return Math.ceil(value / step - 1e-9) * step;
}

/** Display rounding only (spec section 6); never applied to values that are summed. */
export function roundForDisplay({ value, unit }: PresentedAmount): PresentedAmount {
	let rounded: number;
	switch (unit) {
		case 'g':
		case 'ml':
			rounded = value < 5 ? Math.max(1, Math.round(value)) : roundTo(value, value < 50 ? 5 : 10);
			break;
		case 'kg':
		case 'l':
			rounded = Math.max(0.1, roundTo(value, 0.1));
			break;
		case 'piece':
		case 'clove':
			rounded = ceilTo(value, 0.5);
			break;
		case 'tbsp':
		case 'tsp':
			rounded = Math.max(0.5, roundTo(value, 0.5));
			break;
		case 'slice':
		case 'pinch':
			rounded = Math.max(1, Math.ceil(value - 1e-9));
			break;
		case 'oz':
			rounded = value < 4 ? Math.max(0.5, roundTo(value, 0.5)) : Math.round(value);
			break;
		case 'fl_oz':
			rounded = Math.max(0.5, value < 4 ? roundTo(value, 0.5) : Math.round(value));
			break;
		case 'lb':
		case 'pint':
		case 'us_cup': // never presented: converted to ml first
			rounded = Math.max(0.25, roundTo(value, 0.25));
			break;
	}
	return { value: rounded || 0, unit };
}
