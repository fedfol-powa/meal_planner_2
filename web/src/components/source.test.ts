import { describe, expect, it } from 'vitest';
import type { RecipeSummary } from '../api/types';
import { translate } from '../i18n/translate';
import { safeSourceUrl, sourceLine } from './source';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('it-IT', key, params);
const recipe = (patch: Partial<RecipeSummary>) => ({ sourceType: 'web', sourceUrl: null, bookTitle: null, bookPages: null, ...patch }) as RecipeSummary;

describe('source', () => {
  it('accepts only web addresses', () => {
    expect(safeSourceUrl('https://www.giallozafferano.it/x')).toBe('https://www.giallozafferano.it/x');
    expect(safeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(safeSourceUrl('not a url')).toBeNull();
    expect(safeSourceUrl(null)).toBeNull();
  });
  it('names the source by kind', () => {
    expect(sourceLine(recipe({ sourceUrl: 'https://www.gnambox.com/r' }), t)).toBe('gnambox.com');
    expect(sourceLine(recipe({ sourceType: 'youtube', sourceUrl: 'https://youtu.be/x' }), t)).toBe('Video YouTube');
    expect(sourceLine(recipe({ sourceType: 'book', bookTitle: 'Basta un Wok', bookPages: '12' }), t)).toBe('Libro: Basta un Wok, pp. 12');
    expect(sourceLine(recipe({ sourceType: 'home' }), t)).toBe('Ricetta di casa');
    expect(sourceLine(recipe({ sourceType: 'web', sourceUrl: 'bad' }), t)).toBeNull();
  });
  it('names no source for a never-published recipe', () => {
    expect(sourceLine(recipe({ sourceType: null, sourceUrl: 'https://www.gnambox.com/r' }), t)).toBeNull();
  });
});
