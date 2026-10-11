import { describe, expect, it } from 'vitest';
import { catalogueIngredientSchema } from './ingredient.ts';

const tomatoes = { slug: 'pomodori', name: { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, synonyms: { 'it-IT': ['pomodoro'], 'en-GB': ['tomato'] }, department: 'produce', isPantry: false };

describe('catalogue ingredient', () => {
	it('accepts a generic product with both names', () => {
		expect(catalogueIngredientSchema.safeParse(tomatoes).success).toBe(true);
	});
	it('refuses a bad slug, a blank name or an unknown department', () => {
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, slug: 'Pomodori Roma' }).success).toBe(false);
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, name: { 'it-IT': 'Pomodori', 'en-GB': ' ' } }).success).toBe(false);
		expect(catalogueIngredientSchema.safeParse({ ...tomatoes, department: 'greengrocer' }).success).toBe(false);
	});
});
