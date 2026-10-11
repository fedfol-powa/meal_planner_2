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
    expect(formatAmount({ kind: 'amount', value: 0.25, unit: 'clove' }, '', null, 'it-IT')).toBe('¼ spicchio');
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'slice' }, '', null, 'en-GB')).toBe('½ slice');
    expect(formatAmount({ kind: 'amount', value: 0.1, unit: 'piece' }, '', null, 'en-GB')).toBe('0.1');
    expect(formatAmount({ kind: 'amount', value: 1.2, unit: 'clove' }, '', null, 'it-IT')).toBe('1,2 spicchi');
  });
  it('writes scaled cloves, pinches, sprigs, leaves, bunches and slices whole and pieces in halves, like the domain (option 1)', () => {
    const scaled = [
      ['clove', '5 spicchi', '5 cloves'], ['pinch', '5 pizzichi', '5 pinches'], ['sprig', '5 rametti', '5 sprigs'],
      ['leaf', '5 foglie', '5 leaves'], ['bunch', '5 mazzetti', '5 bunches'], ['slice', '5 fette', '5 slices']
    ] as const;
    for (const [unit, italian, english] of scaled) {
      expect(formatAmount({ kind: 'amount', value: 4.5, unit }, '', null, 'it-IT', true)).toBe(italian);
      expect(formatAmount({ kind: 'amount', value: 4.5, unit }, '', null, 'en-GB', true)).toBe(english);
    }
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'pinch' }, '', null, 'it-IT', true)).toBe('1 pizzico');
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'leaf' }, '', null, 'en-GB', true)).toBe('1 leaf');
    expect(formatAmount({ kind: 'amount', value: 1 / 3, unit: 'piece' }, '', null, 'it-IT', true)).toBe('½');
    expect(formatAmount({ kind: 'amount', value: 0.5, unit: 'tsp' }, '', null, 'it-IT', true)).toBe('½ cucchiaino');
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
