import { z } from 'zod';
import { weekView } from '../menu/views.ts';
import { ratingSummaryView, recipeSummaryView } from '../recipes/views.ts';

export const mealActionResult = z.object({
	week: weekView,
	/** The action of this request: the `id` sent. */
	actionId: z.uuid(),
	/** False when the request changed nothing (also when it repeats one that changed nothing). */
	changed: z.boolean(),
});
export type MealActionResult = z.infer<typeof mealActionResult>;

export const suggestionsView = z.object({
	recipes: z.array(z.object({ recipe: recipeSummaryView, rating: ratingSummaryView })).max(5),
	/** Offset of the next five; 0 when the ranking starts again. */
	nextOffset: z.number().int().min(0),
	/** Free-meal texts the family already used, most frequent first. */
	freeTexts: z.array(z.string()).max(4),
});
export type SuggestionsView = z.infer<typeof suggestionsView>;
