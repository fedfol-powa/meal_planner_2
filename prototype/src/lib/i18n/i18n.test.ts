import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { translate } from './translate';
import { formatAverage, formatChangeTime, formatDayMonth, formatDayShort, formatWeekRange } from './dates';

describe('messages', () => {
	it('has the same keys in both locales', () => {
		expect(Object.keys(messages['en-GB']).sort()).toEqual(Object.keys(messages['it-IT']).sort());
	});
	it('has no empty strings', () => {
		for (const dict of Object.values(messages)) {
			for (const value of Object.values(dict)) expect(value.trim()).not.toBe('');
		}
	});
});

describe('translate', () => {
	it('fills parameters', () => {
		expect(translate('it-IT', 'meal.servings', { count: 4 })).toBe('4 porzioni');
		expect(translate('en-GB', 'meal.servings', { count: 4 })).toBe('4 servings');
	});
});

describe('dates', () => {
	it('formats short weekday per locale', () => {
		expect(formatDayShort('it-IT', '2026-10-06')).toBe('MAR');
		expect(formatDayShort('en-GB', '2026-10-06')).toBe('TUE');
	});
	it('formats week ranges', () => {
		expect(formatWeekRange('it-IT', '2026-10-05')).toBe('5–11 ott');
		expect(formatWeekRange('en-GB', '2026-09-28')).toBe('28 Sept–4 Oct');
	});
	it('formats change time with weekday', () => {
		expect(formatChangeTime('it-IT', '2026-10-02T21:30')).toBe('venerdì 21:30');
		expect(formatChangeTime('en-GB', '2026-10-02T21:30')).toBe('Friday 21:30');
	});
	it('formats day and month without weekday, for hints that already name the weekday', () => {
		expect(formatDayMonth('it-IT', '2026-10-07')).toBe('7 ottobre');
		expect(formatDayMonth('en-GB', '2026-10-11')).toBe('11 October');
	});
	it('formats averages with one decimal', () => {
		expect(formatAverage('it-IT', 4.333)).toBe('4,3');
		expect(formatAverage('en-GB', 4)).toBe('4.0');
	});
});
