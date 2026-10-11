import { z } from 'zod';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import {
	ingredientLineView,
	isoDateSchema,
	mealOccurrenceView,
	mealTypeSchema,
	proteinGroupSchema,
	ratingSummaryView,
	recipeSummaryView,
} from './views.ts';

export const recipeQuerySchema = z.object({
	text: z.string().max(100).optional(),
	mealType: mealTypeSchema.optional(),
	maxMinutes: z.number().int().positive().max(1440).optional(),
	proteinGroup: proteinGroupSchema.optional(),
	minStars: z.number().int().min(1).max(5).optional(),
	sort: z.enum(['name', 'rating', 'added', 'lastEaten']).optional(),
	reversed: z.boolean().optional(),
});

export const recipeListItemView = z.object({
	recipe: recipeSummaryView,
	rating: ratingSummaryView,
	baseServings: z.number().int().positive(),
	/** At the base servings. */
	ingredients: z.array(ingredientLineView),
	addedOn: isoDateSchema,
	/** As of the server's clock; the device moves it forward with `upcoming`. */
	lastEatenOn: isoDateSchema.nullable(),
	/** Every planned meal not yet past, soonest first: the device derives what has passed since. */
	upcoming: z.array(mealOccurrenceView),
});

export const recipesContract = {
	search: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
		.route({
			method: 'POST',
			path: '/families/{familyId}/recipes/search',
			summary:
				"Search the family's recipe book in the caller's language (names, descriptions, ingredients and their synonyms), with filters and sorting",
		})
		.input(versionedInput(z.object({ familyId: z.uuid(), query: recipeQuerySchema })))
		.output(versionedOutput(z.object({ items: z.array(recipeListItemView) }))),
};
