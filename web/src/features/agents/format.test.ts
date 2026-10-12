import { describe, expect, it } from 'vitest';
import { formatRenewal } from './format';

describe('formatRenewal', () => {
  const now = new Date('2026-10-11T16:00:00+02:00');
  it('says today with the time, otherwise day, month and time, on the device clock', () => {
    expect(formatRenewal('it-IT', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('oggi alle 14:05');
    expect(formatRenewal('en-GB', '2026-10-11T12:05:00Z', now, 'Europe/Rome')).toBe('today at 14:05');
    expect(formatRenewal('it-IT', '2026-10-09T07:30:00Z', now, 'Europe/Rome')).toBe('9 ottobre, 09:30');
  });
});
