import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
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

export const recipeDetailView = z.object({
	recipe: recipeSummaryView,
	status: z.enum(['published', 'archived']),
	baseServings: z.number().int().positive(),
	servings: z.number().int().positive(),
	ingredients: z.array(ingredientLineView),
	rating: ratingSummaryView,
	/** Last five past meals, most recent first, as of the server's clock. */
	history: z.array(z.object({ date: isoDateSchema, mealType: mealTypeSchema })),
	/** Every planned meal not yet past, soonest first. */
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
	get: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
		.route({
			method: 'POST',
			path: '/families/{familyId}/recipes/{recipeId}/view',
			summary:
				'Read a recipe with ingredients scaled to the servings asked, the family rating and its meals; slotId shows the version eaten in that past meal',
		})
		.errors({ not_found: errorDefinitions.not_found })
		.input(
			versionedInput(
				z.object({
					familyId: z.uuid(),
					recipeId: z.uuid(),
					servings: z.number().int().min(1).max(100).optional(),
					slotId: z.uuid().optional(),
				}),
			),
		)
		.output(versionedOutput(recipeDetailView)),
};
