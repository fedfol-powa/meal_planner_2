import { describe, expect, it } from 'vitest';
import { buildFamilyData, isMonday, isValidIsoDate } from './family.ts';
import { originRecipe } from './test-fixtures.ts';

const week = '2026-09-28'; // Monday; Sunday is 2026-10-04

describe('dates', () => {
	it('accepts only existing YYYY-MM-DD dates', () => {
		expect(isValidIsoDate('2026-10-12')).toBe(true);
		expect(isValidIsoDate('2026-02-30')).toBe(false);
		expect(isValidIsoDate('2026-10-1')).toBe(false);
		expect(isValidIsoDate('domani')).toBe(false);
	});
	it('knows Mondays', () => {
		expect(isMonday('2026-09-28')).toBe(true);
		expect(isMonday('2026-09-29')).toBe(false);
	});
});

describe('family data', () => {
	it("converts B feedback to the curator's stars", () => {
		const { family } = buildFamilyData([originRecipe({ id: 'a', feedback: 4 }), originRecipe({ id: 'b', feedback: null })], '2026-10-12');
		expect(family.ratings).toEqual([{ originSlug: 'a', stars: 5 }]);
	});
	it('imports cooked meals and leaves out the ones not cooked (R4c)', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [{ settimana: week, pasto: 'lun-cena', cucinata: true }, { settimana: week, pasto: 'mar-pranzo', cucinata: false }] })], '2026-10-12');
		expect(family.meals).toEqual([{ date: '2026-09-28', mealType: 'dinner', originSlug: 'a' }]);
		expect(findings).toEqual([{ kind: 'not_cooked', originSlug: 'a', week, slot: 'mar-pranzo' }]);
	});
	it('counts a missing outcome as eaten only in a concluded week', () => {
		const entries = [{ settimana: week, pasto: 'gio-cena', cucinata: null }];
		const concluded = buildFamilyData([originRecipe({ id: 'a', storico: entries })], '2026-10-05');
		expect(concluded.family.meals).toEqual([{ date: '2026-10-01', mealType: 'dinner', originSlug: 'a' }]);
		expect(concluded.findings.map((f) => f.kind)).toEqual(['outcome_not_recorded']);
		const open = buildFamilyData([originRecipe({ id: 'a', storico: entries })], '2026-10-04');
		expect(open.family.meals).toEqual([]);
		expect(open.findings.map((f) => f.kind)).toEqual(['week_not_concluded']);
	});
	it('discards unrecognised days and meals', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [{ settimana: week, pasto: 'lunedi-cena', cucinata: true }, { settimana: week, pasto: 'mar-merenda', cucinata: true }] })], '2026-10-12');
		expect(family.meals).toEqual([]);
		expect(findings.map((f) => f.kind)).toEqual(['unrecognised_slot', 'unrecognised_slot']);
	});
	it('discards weeks that do not exist or do not start on Monday, without dating them', () => {
		const { family, findings } = buildFamilyData([originRecipe({ id: 'a', storico: [
			{ settimana: '2026-02-30', pasto: 'lun-cena', cucinata: true },
			{ settimana: '2026-09-29', pasto: 'lun-cena', cucinata: true },
			{ settimana: 'settembre', pasto: 'lun-cena', cucinata: true }
		] })], '2026-10-12');
		expect(family.meals).toEqual([]);
		expect(findings.map((f) => f.kind)).toEqual(['invalid_week', 'invalid_week', 'invalid_week']);
	});
	it('refuses an invalid import date', () => {
		expect(() => buildFamilyData([], '2026-13-01')).toThrow(/import date/);
	});
	it('records tried recipes without imported meals, without inventing meals (R4a)', () => {
		const { family } = buildFamilyData([originRecipe({ id: 'a', collaudata: true, storico: [] }), originRecipe({ id: 'b', collaudata: true, storico: [{ settimana: week, pasto: 'lun-cena', cucinata: true }] }), originRecipe({ id: 'c', collaudata: false })], '2026-10-12');
		expect(family.triedUndated).toEqual(['a']);
		expect(family.meals.map((m) => m.originSlug)).toEqual(['b']);
	});
});
