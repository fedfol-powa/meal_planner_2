import {
	BASE_FACTOR, G_PER_OZ, ML_PER_UK_FL_OZ, ML_PER_UK_TBSP, ML_PER_UK_TSP, OZ_PER_LB, UK_FL_OZ_PER_PINT,
	isMassUnit, isVolumeUnit, type CountedUnit, type UnitCode
} from './codes.ts';

export const MEASUREMENT_SYSTEMS = ['metric', 'uk_imperial'] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];
/** Recipes, meal cards and item sources keep halves; shopping lists buy whole pieces. */
export type CountRounding = 'recipe' | 'shopping';

export interface PresentedAmount {
	value: number;
	unit: UnitCode;
}

/** Fraction of a piece left by conversions and ignored when buying (2.06 lemons → 2). */
const PIECE_TOLERANCE = 0.1;
const HALF_OZ_IN_G = G_PER_OZ / 2;
const MAX_SPOON_ML = 3 * ML_PER_UK_TBSP;
const BOUGHT_WHOLE: ReadonlySet<CountedUnit> = new Set<CountedUnit>(['piece', 'bunch', 'slice']);

/**
 * Halfway points round up even when a conversion left them a hair below: 14.5 oz becomes
 * 14.499999999999998 through grams, and must show as 14 + 0.5 oz does.
 */
const round = (value: number) => Math.round(value + 1e-9);
const roundTo = (value: number, step: number) => round(value / step) * step;
const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step;

/** Grams or millilitres: whole below 5 (at least 1), to 5 below 50, then to 10. */
function roundMetric(value: number): number {
	if (value < 5) return Math.max(1, round(value));
	return roundTo(value, value < 50 ? 5 : 10);
}

function metric(base: number, small: 'g' | 'ml', large: 'kg' | 'l'): PresentedAmount {
	const rounded = roundMetric(base);
	return rounded < 1000 ? { value: rounded, unit: small } : { value: round(base / 100) / 10, unit: large };
}

/** Display only (spec section 6); the threshold is chosen on the rounded value. */
export function presentMass(grams: number, system: MeasurementSystem): PresentedAmount {
	// Below half an ounce an ounce figure would be several times off: UK recipes give grams.
	if (system === 'metric' || grams < HALF_OZ_IN_G) return metric(grams, 'g', 'kg');
	const ounces = grams / G_PER_OZ;
	if (ounces < 4) return { value: roundTo(ounces, 0.5), unit: 'oz' };
	const whole = round(ounces);
	return whole < OZ_PER_LB ? { value: whole, unit: 'oz' } : { value: roundTo(ounces / OZ_PER_LB, 0.25), unit: 'lb' };
}

export function presentVolume(millilitres: number, system: MeasurementSystem): PresentedAmount {
	if (system === 'metric') return metric(millilitres, 'ml', 'l');
	// Up to 3 tablespoons, UK measuring spoons (5 and 15 ml): a conversion between volumes.
	if (millilitres <= MAX_SPOON_ML) {
		return millilitres < ML_PER_UK_TBSP
			? { value: Math.max(0.5, roundTo(millilitres / ML_PER_UK_TSP, 0.5)), unit: 'tsp' }
			: { value: roundTo(millilitres / ML_PER_UK_TBSP, 0.5), unit: 'tbsp' };
	}
	const fluidOunces = millilitres / ML_PER_UK_FL_OZ;
	if (fluidOunces <= 4) return { value: roundTo(fluidOunces, 0.5), unit: 'uk_fl_oz' };
	const whole = round(fluidOunces);
	return whole < UK_FL_OZ_PER_PINT
		? { value: whole, unit: 'uk_fl_oz' }
		: { value: roundTo(fluidOunces / UK_FL_OZ_PER_PINT, 0.25), unit: 'uk_pint' };
}

export function presentCount(value: number, unit: CountedUnit, rounding: CountRounding): PresentedAmount {
	// Up to 0.1 left over is ignored, 0.1 included (1.1 → 1): the epsilon absorbs 1.1 - 0.1 = 1.0000000000000002.
	if (rounding === 'shopping' && BOUGHT_WHOLE.has(unit)) return { value: Math.max(1, Math.ceil(value - PIECE_TOLERANCE - 1e-9)), unit };
	switch (unit) {
		case 'tbsp':
		case 'tsp':
			return { value: Math.max(0.5, roundTo(value, 0.5)), unit };
		case 'slice':
			return { value: Math.max(1, Math.ceil(value - 1e-9)), unit };
		case 'us_cup':
			return { value: Math.max(0.25, roundTo(value, 0.25)), unit };
		default:
			return { value: ceilTo(value, 0.5), unit };
	}
}

export function presentAmount(value: number, unit: UnitCode, system: MeasurementSystem, rounding: CountRounding = 'recipe'): PresentedAmount {
	if (isMassUnit(unit)) return presentMass(value * BASE_FACTOR[unit], system);
	if (isVolumeUnit(unit)) return presentVolume(value * BASE_FACTOR[unit], system);
	return presentCount(value, unit, rounding);
}
