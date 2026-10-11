import { describe, expect, it } from 'vitest';
import { catchUpTarget, firstOpenMeal, generationTargets, isJobOverdue, isMealPast, isNextWeekDue, localDateTime, mondayOf, nextWeekStart } from './local-time.ts';

const at = (date: string, time: string) => ({ date, time });

describe('localDateTime', () => {
	it('reads date and time in the family time zone', () => {
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/Rome')).toEqual(at('2026-10-14', '20:00'));
		expect(localDateTime(new Date('2026-10-14T18:00:00Z'), 'Europe/London')).toEqual(at('2026-10-14', '19:00'));
		expect(localDateTime(new Date('2026-10-15T01:30:00Z'), 'America/New_York')).toEqual(at('2026-10-14', '21:30'));
	});
	it('follows the European change of 25 October 2026 in Rome and London', () => {
		expect(localDateTime(new Date('2026-10-24T22:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-25', '00:30'));
		expect(localDateTime(new Date('2026-10-25T23:30:00Z'), 'Europe/Rome')).toEqual(at('2026-10-26', '00:30'));
		expect(localDateTime(new Date('2026-10-24T23:30:00Z'), 'Europe/London')).toEqual(at('2026-10-25', '00:30'));
		expect(localDateTime(new Date('2026-10-25T23:30:00Z'), 'Europe/London')).toEqual(at('2026-10-25', '23:30'));
	});
	it('follows the American change of 1 November 2026 in New York', () => {
		expect(localDateTime(new Date('2026-11-01T03:30:00Z'), 'America/New_York')).toEqual(at('2026-10-31', '23:30'));
		expect(localDateTime(new Date('2026-11-02T04:30:00Z'), 'America/New_York')).toEqual(at('2026-11-01', '23:30'));
	});
	it('writes midnight as 00:00', () => {
		expect(localDateTime(new Date('2026-10-13T22:00:00Z'), 'Europe/Rome')).toEqual(at('2026-10-14', '00:00'));
	});
	it('rejects an unknown time zone', () => {
		expect(() => localDateTime(new Date(), 'Mars/Olympus')).toThrow(RangeError);
	});
});

describe('meals and weeks', () => {
	it('passes lunch at 15:30 and dinner at 23:00', () => {
		expect(isMealPast('2026-10-14', 'lunch', at('2026-10-14', '15:29'))).toBe(false);
		expect(isMealPast('2026-10-14', 'lunch', at('2026-10-14', '15:30'))).toBe(true);
		expect(isMealPast('2026-10-14', 'dinner', at('2026-10-14', '22:59'))).toBe(false);
		expect(isMealPast('2026-10-13', 'dinner', at('2026-10-14', '00:00'))).toBe(true);
	});
	it('finds the first open meal', () => {
		expect(firstOpenMeal(at('2026-10-14', '09:00'))).toEqual({ date: '2026-10-14', mealType: 'lunch' });
		expect(firstOpenMeal(at('2026-10-14', '15:30'))).toEqual({ date: '2026-10-14', mealType: 'dinner' });
		expect(firstOpenMeal(at('2026-10-14', '20:00'))).toEqual({ date: '2026-10-14', mealType: 'dinner' });
		expect(firstOpenMeal(at('2026-10-14', '23:00'))).toEqual({ date: '2026-10-15', mealType: 'lunch' });
	});
	it('finds the Monday of a date and the next one', () => {
		expect(mondayOf('2026-10-12')).toBe('2026-10-12');
		expect(mondayOf('2026-10-18')).toBe('2026-10-12');
		expect(nextWeekStart(at('2026-10-18', '12:00'))).toBe('2026-10-19');
	});
	it('makes next week due from Wednesday 20:00', () => {
		expect(isNextWeekDue(at('2026-10-14', '19:59'))).toBe(false);
		expect(isNextWeekDue(at('2026-10-14', '20:00'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-18', '23:59'))).toBe(true);
		expect(isNextWeekDue(at('2026-10-12', '08:00'))).toBe(false);
	});
	it('makes a job overdue from the Thursday 08:00 before its week, whatever the current week', () => {
		expect(isJobOverdue(at('2026-10-15', '07:59'), '2026-10-19')).toBe(false);
		expect(isJobOverdue(at('2026-10-15', '08:00'), '2026-10-19')).toBe(true);
		expect(isJobOverdue(at('2026-10-19', '10:00'), '2026-10-19')).toBe(true);
		expect(isJobOverdue(at('2026-10-15', '08:00'), '2026-10-26')).toBe(false);
	});
});

describe('catchUpTarget', () => {
	it('generates a week not started yet whole, a started one from its open meals, a finished one never', () => {
		expect(catchUpTarget(at('2026-10-16', '10:00'), '2026-10-19')).toEqual({ weekStart: '2026-10-19' });
		expect(catchUpTarget(at('2026-10-19', '10:00'), '2026-10-19')).toEqual({ weekStart: '2026-10-19', from: { date: '2026-10-19', mealType: 'lunch' } });
		expect(catchUpTarget(at('2026-10-25', '23:30'), '2026-10-19')).toBeNull();
		expect(catchUpTarget(at('2026-10-28', '21:00'), '2026-10-19')).toBeNull();
	});
});

describe('generationTargets', () => {
	it('generates the rest of the current week for a family without weeks', () => {
		expect(generationTargets(at('2026-10-13', '16:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-13', mealType: 'dinner' } },
		]);
	});
	it('adds next week after Wednesday 20:00, the current week from Wednesday dinner', () => {
		expect(generationTargets(at('2026-10-14', '20:00'), [])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-14', mealType: 'dinner' } },
			{ weekStart: '2026-10-19' },
		]);
		expect(generationTargets(at('2026-10-14', '19:59'), ['2026-10-12'])).toEqual([]);
		expect(generationTargets(at('2026-10-14', '20:00'), ['2026-10-12'])).toEqual([{ weekStart: '2026-10-19' }]);
	});
	it('creates the current week when only the next exists (cron first)', () => {
		expect(generationTargets(at('2026-10-15', '09:00'), ['2026-10-19'])).toEqual([
			{ weekStart: '2026-10-12', from: { date: '2026-10-15', mealType: 'lunch' } },
		]);
	});
	it('does nothing when both weeks exist', () => {
		expect(generationTargets(at('2026-10-16', '10:00'), ['2026-10-12', '2026-10-19'])).toEqual([]);
	});
	it('skips the current week when no meal is left on Sunday night', () => {
		expect(generationTargets(at('2026-10-18', '23:30'), [])).toEqual([{ weekStart: '2026-10-19' }]);
	});
});
