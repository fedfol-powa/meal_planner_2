import { describe, expect, it } from 'vitest';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { settingsWrites } from './settings-plan.ts';

describe('settingsWrites', () => {
	it('writes only what differs from the defaults, never weights', () => {
		const paths = settingsWrites(curatorFamilySettings(), {}).map((w) => w.path.join('.'));
		expect(paths).toContain('slots.lunch.6'); // Sunday pizza
		expect(paths).toContain('slots.dinner.5'); // Saturday free dinner
		expect(paths).toContain('rules');
		expect(paths).not.toContain('knownNew'); // same as the default
		expect(paths.some((p) => p.startsWith('groupRanges'))).toBe(false);
		expect(paths.some((p) => p.startsWith('weights'))).toBe(false);
	});
	it('leaves alone every key already saved', () => {
		const stored = { slots: { lunch: { '6': { servings: 5, fixedText: null, maxMinutes: null } } }, rules: [] };
		const paths = settingsWrites(curatorFamilySettings(), stored).map((w) => w.path.join('.'));
		expect(paths).not.toContain('slots.lunch.6');
		expect(paths).not.toContain('rules');
		expect(paths).toContain('slots.dinner.5');
	});
});
