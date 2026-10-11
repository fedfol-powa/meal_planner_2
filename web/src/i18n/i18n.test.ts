import { describe, expect, it } from 'vitest';
import { formatAverage, formatChangeTime, formatDayMonth, formatDayShort, formatMonthYear } from './dates';
import { messages } from './messages';
import { truncate } from './text';
import { initialLocale, translate } from './translate';

describe('messages', () => {
  it('has the same keys in both locales', () => {
    expect(Object.keys(messages['en-GB']).sort()).toEqual(Object.keys(messages['it-IT']).sort());
  });
  it('has no empty texts', () => {
    for (const dict of Object.values(messages)) for (const text of Object.values(dict)) expect(text.trim()).not.toBe('');
  });
  it('gives every plural both forms', () => {
    for (const dict of Object.values(messages)) {
      for (const key of Object.keys(dict)) {
        if (key.endsWith('.one')) expect(dict[key.replace(/\.one$/, '.other')]).toBeDefined();
        if (key.endsWith('.other')) expect(dict[key.replace(/\.other$/, '.one')]).toBeDefined();
      }
    }
  });
});

describe('translate', () => {
  it('fills parameters', () => {
    expect(translate('it-IT', 'meal.changedBy', { name: 'Anna', time: 'giovedì 21:30' })).toBe('Cambiato da Anna, giovedì 21:30');
  });
  it('chooses plural forms with Intl.PluralRules', () => {
    expect(translate('it-IT', 'meal.servings', { count: 1 })).toBe('1 porzione');
    expect(translate('it-IT', 'meal.servings', { count: 4 })).toBe('4 porzioni');
    expect(translate('en-GB', 'meal.servings', { count: 1 })).toBe('1 serving');
    expect(translate('en-GB', 'meal.servings', { count: 0 })).toBe('0 servings');
  });
  it('says one star in the singular (real-stack test)', () => {
    expect(translate('it-IT', 'rating.give', { count: 1, recipe: 'Wok' })).toBe('Dai 1 stella a Wok');
    expect(translate('it-IT', 'rating.give', { count: 3, recipe: 'Wok' })).toBe('Dai 3 stelle a Wok');
    expect(translate('en-GB', 'rating.give', { count: 1, recipe: 'Wok' })).toBe('Give Wok 1 star');
    expect(translate('en-GB', 'rating.removeStars', { count: 1 })).toBe('Your rating: 1 star. Tap again to remove it');
    expect(translate('it-IT', 'rating.removeStars', { count: 4 })).toBe('Il tuo voto: 4 stelle. Tocca di nuovo per toglierlo');
  });
  it('leaves unknown placeholders visible', () => {
    expect(translate('en-GB', 'meal.changedBy', { name: 'Tom' })).toBe('Changed by Tom, {time}');
  });
  it('picks the starting language from the browser', () => {
    expect(initialLocale(['en-US', 'it'])).toBe('en-GB');
    expect(initialLocale(['it-IT'])).toBe('it-IT');
    expect(initialLocale(['fr-FR', 'en'])).toBe('it-IT');
    expect(initialLocale([])).toBe('it-IT');
  });
});

describe('dates and numbers', () => {
  it('formats per locale', () => {
    expect(formatDayShort('it-IT', '2026-10-06')).toBe('MAR');
    expect(formatDayShort('en-GB', '2026-10-06')).toBe('TUE');
    expect(formatDayMonth('it-IT', '2026-10-07')).toBe('7 ottobre');
    expect(formatMonthYear('en-GB', '2026-10-07')).toBe('October 2026');
    expect(formatChangeTime('it-IT', '2026-10-02T21:30')).toBe('venerdì 21:30');
    expect(formatAverage('it-IT', 4.333)).toBe('4,3');
    expect(formatAverage('en-GB', 4)).toBe('4.0');
  });
  it('truncates without a dangling space', () => {
    expect(truncate('gnambox.com', 22)).toBe('gnambox.com');
    expect(truncate('Libro: Panini e tramezzini, pp. 110-111', 22)).toBe('Libro: Panini e trame…');
    expect(truncate('Libro: Panini e tramezzini', 17)).toBe('Libro: Panini e…');
  });
});
