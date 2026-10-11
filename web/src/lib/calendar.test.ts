import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, isMealPast, localNow, mondayOf, weekDates } from './calendar';

describe('calendar', () => {
  it('accepts only real calendar dates', () => {
    expect(isIsoDate('2026-10-11')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(isIsoDate('oggi')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate(20261011)).toBe(false);
  });
  it('moves across months and finds Mondays', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(weekDates('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(daysBetween('2026-10-05', '2026-10-19')).toBe(14);
    expect(daysBetween('2026-10-19', '2026-10-05')).toBe(-14);
  });
  it('marks lunch past from 15:30 and dinner from 23:00', () => {
    expect(isMealPast('2026-10-11', 'lunch', '2026-10-11T15:29')).toBe(false);
    expect(isMealPast('2026-10-11', 'lunch', '2026-10-11T15:30')).toBe(true);
    expect(isMealPast('2026-10-11', 'dinner', '2026-10-11T22:59')).toBe(false);
    expect(isMealPast('2026-10-11', 'dinner', '2026-10-12T00:10')).toBe(true);
  });
  it('reads the wall clock in the family time zone', () => {
    const at = new Date('2026-10-11T21:30:00Z');
    expect(localNow('Europe/Rome', at)).toBe('2026-10-11T23:30');
    expect(localNow('Europe/London', at)).toBe('2026-10-11T22:30');
    expect(localNow('America/New_York', new Date('2026-10-12T02:00:00Z'))).toBe('2026-10-11T22:00');
  });
});
