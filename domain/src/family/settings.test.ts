import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, defaultPlannerSettings } from '../planner/index.ts';
import { normalizeRules, resolveFamilySettings, sameRule, storedSettingsSchema, WEIGHT_KEYS } from './settings.ts';

describe('resolveFamilySettings', () => {
	it('gives the defaults for an empty object', () => {
		expect(resolveFamilySettings({})).toEqual(defaultPlannerSettings());
	});

	it('overlays single meals, keeping the other days', () => {
		const settings = resolveFamilySettings({ slots: { lunch: { '6': { servings: 4, fixedText: 'Pizza', maxMinutes: null } } } });
		expect(settings.slots.lunch[6]).toEqual({ servings: 4, fixedText: 'Pizza', maxMinutes: null });
		expect(settings.slots.lunch[0]).toEqual(defaultPlannerSettings().slots.lunch[0]);
		expect(settings.slots.dinner).toEqual(defaultPlannerSettings().slots.dinner);
	});

	it('trims fixed texts', () => {
		const settings = resolveFamilySettings({ slots: { dinner: { '5': { servings: 4, fixedText: ' Cena libera ', maxMinutes: null } } } });
		expect(settings.slots.dinner[5]!.fixedText).toBe('Cena libera');
	});

	it('drops invalid pieces one by one and never throws', () => {
		const settings = resolveFamilySettings({
			slots: { lunch: { '9': { servings: 2, fixedText: null, maxMinutes: null }, '1': { servings: 'three' } }, dinner: 'broken' },
			rules: [{ kind: 'only_lunch', dish: 'pasta' }, { kind: 'never_on', group: 'fish', weekday: 12 }],
			knownNew: { known: 99, new: 5, tolerance: 1 },
			groupRanges: { fish: { min: 3, max: 1 }, eggs: { min: 0, max: 2 } },
			surprise: true,
		});
		const defaults = defaultPlannerSettings();
		expect(settings.slots).toEqual(defaults.slots);
		expect(settings.rules).toEqual([{ kind: 'only_lunch', dish: 'pasta' }]);
		expect(settings.knownNew).toEqual(defaults.knownNew);
		expect(settings.groupRanges.fish).toEqual(defaults.groupRanges.fish);
		expect(settings.groupRanges.eggs).toEqual({ min: 0, max: 2 });
	});

	it('accepts anything that is not an object as empty', () => {
		for (const value of [null, undefined, 'x', 3, []]) expect(resolveFamilySettings(value)).toEqual(defaultPlannerSettings());
	});

	it('treats malformed parents as missing', () => {
		for (const value of [{ slots: null }, { slots: [] }, { groupRanges: [1, 2] }, { rules: 'none' }, { weights: 'heavy' }]) {
			expect(resolveFamilySettings(value)).toEqual(defaultPlannerSettings());
		}
	});

	it('overlays known weights for the planner, ignoring unknown or non-numeric ones', () => {
		const weights = resolveFamilySettings({ weights: { liking: 5, season: 'x', invented: 9 } }).weights;
		expect(weights.liking).toBe(5);
		expect(weights.season).toBe(defaultPlannerSettings().weights.season);
		expect(weights).not.toHaveProperty('invented');
	});

	it('returns fresh objects: changing the result does not change the defaults', () => {
		const first = resolveFamilySettings({});
		first.slots.lunch[0]!.servings = 9;
		first.groupRanges.fish.min = 9;
		expect(resolveFamilySettings({})).toEqual(defaultPlannerSettings());
	});
});

describe('normalizeRules', () => {
	it('removes duplicates whatever the field order, and sorts stably', () => {
		const rules = normalizeRules([
			{ kind: 'never_fresh_fish', weekday: 0 },
			{ kind: 'only_lunch', dish: 'pasta' },
			{ weekday: 0, kind: 'never_fresh_fish' } as never,
		]);
		expect(rules).toEqual([{ kind: 'only_lunch', dish: 'pasta' }, { kind: 'never_fresh_fish', weekday: 0 }]);
		expect(normalizeRules([...rules].reverse())).toEqual(rules);
	});
});

describe('sameRule', () => {
	it('compares by value', () => {
		expect(sameRule({ kind: 'at_least_one', group: 'fish', weekday: 4 }, { weekday: 4, group: 'fish', kind: 'at_least_one' } as never)).toBe(true);
		expect(sameRule({ kind: 'at_least_one', group: 'fish', weekday: 4 }, { kind: 'at_least_one', group: 'fish', weekday: 3 })).toBe(false);
	});
});

describe('storedSettingsSchema', () => {
	const slot = (overrides: object) => ({ slots: { lunch: { '0': { servings: 2, fixedText: null, maxMinutes: null, ...overrides } } } });

	it('accepts the limits', () => {
		expect(storedSettingsSchema.safeParse(slot({ servings: 0 })).success).toBe(true);
		expect(storedSettingsSchema.safeParse(slot({ servings: 12, maxMinutes: 60, fixedText: 'x'.repeat(60) })).success).toBe(true);
		expect(storedSettingsSchema.safeParse({ groupRanges: { fish: { min: 14, max: 14 } }, knownNew: { known: 14, new: 0, tolerance: 0 } }).success).toBe(true);
	});

	it('accepts only the known score weights, each optional', () => {
		expect(storedSettingsSchema.safeParse({ weights: { liking: 5 } }).success).toBe(true);
		expect(storedSettingsSchema.safeParse({ weights: {} }).success).toBe(true);
		expect(storedSettingsSchema.safeParse({ weights: { likng: 5 } }).success).toBe(false);
		expect(storedSettingsSchema.safeParse({ weights: { liking: 'high' } }).success).toBe(false);
	});

	it('names every weight of the planner', () => {
		expect([...WEIGHT_KEYS].sort()).toEqual(Object.keys(DEFAULT_WEIGHTS).sort());
	});

	it('rejects out-of-range values', () => {
		for (const bad of [
			slot({ servings: 13 }),
			slot({ servings: 1.5 }),
			slot({ fixedText: '   ' }),
			slot({ fixedText: 'x'.repeat(61) }),
			slot({ maxMinutes: 25 }),
			{ slots: { lunch: { '7': { servings: 2, fixedText: null, maxMinutes: null } } } },
			{ groupRanges: { fish: { min: 3, max: 2 } } },
			{ knownNew: { known: 15, new: 5, tolerance: 1 } },
			{ rules: [{ kind: 'only_lunch', dish: 'soup' }] },
		]) {
			expect(storedSettingsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
		}
	});
});
