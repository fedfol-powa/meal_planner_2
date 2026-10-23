import { describe, expect, it } from 'vitest';
import { toRecipeQuery, toRecipesSearch, validateLoginSearch, validateMenuSearch, validateRecipeSearch, validateRecipesSearch, validateShoppingSearch } from './search';

describe('search params', () => {
  it('keeps only real days for the menu', () => {
    expect(validateMenuSearch({ day: '2026-10-06' })).toEqual({ day: '2026-10-06' });
    expect(validateMenuSearch({ day: '2026-02-30' })).toEqual({});
    expect(validateMenuSearch({ day: 20261006 })).toEqual({});
  });
  it('keeps the family of the email link for the menu only when it is a uuid', () => {
    const family = '0b0e5f0e-6f3e-4a55-9d1a-3f7f9a1c2b4d';
    expect(validateMenuSearch({ day: '2026-10-26', family })).toEqual({ day: '2026-10-26', family });
    expect(validateMenuSearch({ day: '2026-10-26', family: 'casa' }).family).toBeUndefined();
    expect(validateMenuSearch({ family: 42 }).family).toBeUndefined();
    expect(validateShoppingSearch({ day: '2026-10-26', family })).toEqual({ day: '2026-10-26' });
    expect('family' in validateShoppingSearch({ family })).toBe(false);
  });
  it('validates catalogue filters, accepting numbers parsed as text or numbers', () => {
    expect(validateRecipesSearch({ q: ' riso ', meal: 'lunch', time: '30', group: 'fish', rating: 4, sort: 'rating', dir: 'reverse' }))
      .toEqual({ q: ' riso ', meal: 'lunch', time: 30, group: 'fish', rating: 4, sort: 'rating', dir: 'reverse' });
    expect(validateRecipesSearch({ meal: 'brunch', time: -5, group: 'pizza', rating: 9, sort: 'price', dir: 'up', q: '' })).toEqual({});
  });
  it('maps between URL and query', () => {
    const search = { q: 'riso', time: 30, sort: 'added', dir: 'reverse' } as const;
    expect(toRecipeQuery(search)).toEqual({ text: 'riso', maxMinutes: 30, sort: 'added', reversed: true });
    expect(toRecipesSearch(toRecipeQuery(search))).toEqual(search);
  });
  it('validates the recipe page', () => {
    expect(validateRecipeSearch({ servings: '3', from: 'menu', day: '2026-10-06', slot: '2026-10-06-dinner' }))
      .toEqual({ servings: 3, from: 'menu', day: '2026-10-06', slot: '2026-10-06-dinner' });
    expect(validateRecipeSearch({ servings: 0, from: 'elsewhere', day: 'x', slot: '<script>' })).toEqual({});
    expect(validateRecipeSearch({ servings: 51 })).toEqual({});
  });
  it('accepts only local redirects after sign-in', () => {
    expect(validateLoginSearch({ redirect: '/recipes?q=riso' })).toEqual({ redirect: '/recipes?q=riso' });
    expect(validateLoginSearch({ redirect: '//evil.example' })).toEqual({});
    expect(validateLoginSearch({ redirect: 'https://evil.example' })).toEqual({});
    expect(validateLoginSearch({ redirect: '/login' })).toEqual({});
  });
});
