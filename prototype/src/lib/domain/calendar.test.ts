import { describe, expect, it } from 'vitest';
import { addDays, isMealPast, isWeekVisible, mondayOf, weekDates } from './calendar';


describe('dates', () => {
	it('adds days across months and finds Mondays', () => {
		expect(addDays('2026-09-28', 6)).toBe('2026-10-04');
		expect(mondayOf('2026-10-11')).toBe('2026-10-05');
		expect(mondayOf('2026-10-05')).toBe('2026-10-05');
		expect(weekDates('2026-10-05')).toHaveLength(7);
	});
});

describe('isMealPast', () => {
	it('lunch becomes past at 15:30 exactly', () => {
		expect(isMealPast('2026-10-06', 'lunch', '2026-10-06T15:29')).toBe(false);
		expect(isMealPast('2026-10-06', 'lunch', '2026-10-06T15:30')).toBe(true);
	});
	it('dinner becomes past at 23:00 exactly', () => {
		expect(isMealPast('2026-10-06', 'dinner', '2026-10-06T22:59')).toBe(false);
		expect(isMealPast('2026-10-06', 'dinner', '2026-10-06T23:00')).toBe(true);
	});
});

describe('isWeekVisible', () => {
	it('hides weeks generated in the future', () => {
		const draft = { generatedAt: '2026-10-07T20:00' };
		expect(isWeekVisible(draft, '2026-10-07T19:59')).toBe(false);
		expect(isWeekVisible(draft, '2026-10-07T20:00')).toBe(true);
	});
});
