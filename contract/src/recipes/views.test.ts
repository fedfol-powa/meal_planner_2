import { describe, expect, it } from 'vitest';
import { ingredientLineView, mealOccurrenceView, proteinGroupSchema, ratingSummaryView, recipeSummaryView } from './views.ts';

describe('shared recipe views', () => {
	it('uses the planner vocabulary for protein groups', () => {
		expect(proteinGroupSchema.options).toEqual(['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian']);
	});

	it('accepts the summary of a never-published recipe: name only, description null', () => {
		const summary = {
			id: crypto.randomUUID(),
			name: 'Pasta',
			description: null,
			durationMinutes: null,
			sourceType: null,
			sourceUrl: null,
			bookTitle: null,
			bookPages: null,
			mealType: null,
			proteinGroup: null,
		};
		expect(recipeSummaryView.parse(summary)).toEqual(summary);
	});

	it('bounds stars and averages', () => {
		expect(() => ratingSummaryView.parse({ familyAverage: 5.5, familyCount: 1, myStars: null })).toThrow();
		expect(() => ratingSummaryView.parse({ familyAverage: null, familyCount: 0, myStars: 0 })).toThrow();
		expect(ratingSummaryView.parse({ familyAverage: 3.5, familyCount: 2, myStars: 4 })).toBeTruthy();
	});

	it('describes lines and meal occurrences', () => {
		const line = { ingredientId: crypto.randomUUID(), name: 'Pomodori Roma', amount: '200 g', preparation: 'a dadini', optional: false };
		expect(ingredientLineView.parse(line)).toEqual(line);
		expect(mealOccurrenceView.parse({ date: '2026-10-12', mealType: 'dinner', passesAt: '2026-10-12T21:00:00.000Z' })).toBeTruthy();
		expect(() => mealOccurrenceView.parse({ date: '12/10/2026', mealType: 'dinner', passesAt: '2026-10-12T21:00:00Z' })).toThrow();
	});
});
