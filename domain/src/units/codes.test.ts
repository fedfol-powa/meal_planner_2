import { describe, expect, it } from 'vitest';
import { BASE_FACTOR, COUNTED_UNITS, UNIT_CODES, UNIT_DIMENSION, isMassUnit, isVolumeUnit } from './codes.ts';

describe('unit codes', () => {
	it('gives every code a dimension', () => {
		for (const unit of UNIT_CODES) expect(UNIT_DIMENSION[unit]).toBeDefined();
		expect(UNIT_DIMENSION.tbsp).toBe('spoon');
		expect(UNIT_DIMENSION.bunch).toBe('count');
		expect(UNIT_DIMENSION.us_cup).toBe('us_cup');
	});
	it('uses the legal UK factors for base units', () => {
		expect(BASE_FACTOR.lb).toBeCloseTo(453.59237, 9);
		expect(BASE_FACTOR.uk_pint).toBeCloseTo(568.26125, 9);
		expect(BASE_FACTOR.kg).toBe(1000);
	});
	it('splits measured and counted units', () => {
		expect(isMassUnit('oz')).toBe(true);
		expect(isVolumeUnit('uk_fl_oz')).toBe(true);
		expect(isVolumeUnit('tbsp')).toBe(false);
		expect(COUNTED_UNITS).toEqual(['tbsp', 'tsp', 'piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf', 'us_cup']);
	});
});
