import { describe, expect, it } from 'vitest';
import { defaultPlannerSettings } from './settings.ts';

describe('defaultPlannerSettings', () => {
	it('limits weekday lunches to 30 minutes and leaves weekends and dinners free (8 October 2026)', () => {
		const settings = defaultPlannerSettings();
		expect(settings.slots.lunch.map((s) => s.maxMinutes)).toEqual([30, 30, 30, 30, 30, null, null]);
		expect(settings.slots.dinner.every((s) => s.maxMinutes === null)).toBe(true);
		expect(settings.slots.lunch.every((s) => s.servings === 2 && s.fixedText === null)).toBe(true);
	});
});
