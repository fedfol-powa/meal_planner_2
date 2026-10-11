import { describe, expect, it } from 'vitest';
import { formatAmount, scaleQuantity } from './quantity';

describe('fake quantities', () => {
  it('formats metric amounts per locale', () => {
    expect(formatAmount({ kind: 'amount', value: 150, unit: 'g' }, '150 g', null, 'it-IT')).toBe('150 g');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'l' }, '1,5 l', null, 'it-IT')).toBe('1,5 l');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'l' }, '1,5 l', null, 'en-GB')).toBe('1.5 l');
  });
  it('writes countable units with fractions and plurals', () => {
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'clove' }, '1/2', null, 'it-IT')).toBe('½ spicchio');
    expect(formatAmount({ kind: 'amount', value: 1.5, unit: 'clove' }, '', null, 'it-IT')).toBe('1½ spicchi');
    expect(formatAmount({ kind: 'amount', value: 2, unit: 'piece' }, '2', null, 'en-GB')).toBe('2');
    expect(formatAmount({ kind: 'amount', value: 0.1, unit: 'piece' }, '', null, 'en-GB')).toBe('¼');
  });
  it('shows to-taste and text quantities in the user language', () => {
    expect(formatAmount({ kind: 'to_taste' }, 'q.b.', null, 'en-GB')).toBe('to taste');
    const text = { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' };
    expect(formatAmount({ kind: 'text' }, '1 mazzetto', text, 'en-GB')).toBe('1 bunch');
    expect(formatAmount({ kind: 'text' }, '3 matasse', null, 'en-GB')).toBe('3 matasse');
  });
  it('scales only numeric amounts', () => {
    expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 0.5)).toEqual({ kind: 'amount', value: 150, unit: 'g' });
    expect(scaleQuantity({ kind: 'text' }, 2)).toEqual({ kind: 'text' });
  });
});
