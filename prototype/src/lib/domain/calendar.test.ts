import { describe, expect, it } from 'vitest';
import { addDays, automaticCloseAt, isMealPast, isWeekVisible, mondayOf, weekDates, weekStatus } from './calendar';

const week = (closedAt: string | null = null) => ({ startsOn: '2026-10-05', closedAt, generatedAt: '2026-09-30T20:00' });

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

describe('weekStatus', () => {
	it('is draft before Monday', () => {
		expect(weekStatus(week(), '2026-10-04T23:59')).toBe('draft');
	});
	it('is in progress from Monday 00:00 to Sunday', () => {
		expect(weekStatus(week(), '2026-10-05T00:00')).toBe('in_progress');
		expect(weekStatus(week(), '2026-10-11T23:59')).toBe('in_progress');
	});
	it('is pending close from the next Monday until Wednesday 20:00', () => {
		expect(weekStatus(week(), '2026-10-12T00:00')).toBe('pending_close');
		expect(weekStatus(week(), '2026-10-14T19:59')).toBe('pending_close');
		expect(automaticCloseAt('2026-10-05')).toBe('2026-10-14T20:00');
		expect(weekStatus(week(), '2026-10-14T20:00')).toBe('closed');
	});
	it('is closed once closedAt has passed', () => {
		expect(weekStatus(week('2026-10-12T10:00'), '2026-10-12T10:00')).toBe('closed');
	});
});

describe('isWeekVisible', () => {
	it('hides weeks generated in the future', () => {
		const draft = { startsOn: '2026-10-12', closedAt: null, generatedAt: '2026-10-07T20:00' };
		expect(isWeekVisible(draft, '2026-10-07T19:59')).toBe(false);
		expect(isWeekVisible(draft, '2026-10-07T20:00')).toBe(true);
	});
});
