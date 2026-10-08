import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, mealIndex, seasonOf, weekdayOf } from './calendar.ts';

describe('calendar', () => {
	it('adds days across months and years', () => {
		expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
	});
	it('counts days between dates', () => {
		expect(daysBetween('2026-10-12', '2026-10-26')).toBe(14);
		expect(daysBetween('2026-10-26', '2026-10-12')).toBe(-14);
	});
	it('numbers weekdays from Monday', () => {
		expect(weekdayOf('2026-10-12')).toBe(0);
		expect(weekdayOf('2026-10-18')).toBe(6);
	});
	it('maps months to seasons', () => {
		expect(seasonOf('2026-03-01')).toBe('spring');
		expect(seasonOf('2026-08-31')).toBe('summer');
		expect(seasonOf('2026-10-12')).toBe('autumn');
		expect(seasonOf('2026-12-01')).toBe('winter');
		expect(seasonOf('2027-02-28')).toBe('winter');
	});
	it('puts Sunday dinner right before Monday lunch', () => {
		expect(mealIndex('2026-10-19', 'lunch') - mealIndex('2026-10-18', 'dinner')).toBe(1);
		expect(mealIndex('2026-10-12', 'dinner') - mealIndex('2026-10-12', 'lunch')).toBe(1);
	});
});
