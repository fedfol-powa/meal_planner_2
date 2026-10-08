import { describe, expect, it } from 'vitest';
import { CREA_RANGES, creaRanges, defaultPlannerSettings } from './settings.ts';

describe('creaRanges', () => {
	it('returns a copy that can be edited without touching the defaults', () => {
		const copy = creaRanges();
		copy.fish.min = 0;
		expect(CREA_RANGES.fish.min).toBe(2);
		expect(creaRanges()).toEqual(CREA_RANGES);
	});
});

describe('defaultPlannerSettings', () => {
	it('limits weekday lunches to 30 minutes and leaves weekends and dinners free (8 October 2026)', () => {
		const settings = defaultPlannerSettings();
		expect(settings.slots.lunch.map((s) => s.maxMinutes)).toEqual([30, 30, 30, 30, 30, null, null]);
		expect(settings.slots.dinner.every((s) => s.maxMinutes === null)).toBe(true);
		expect(settings.slots.lunch.every((s) => s.servings === 2 && s.fixedText === null)).toBe(true);
	});
});
