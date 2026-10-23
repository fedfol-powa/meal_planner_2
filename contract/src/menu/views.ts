import { z } from 'zod';
import { ingredientLineView, isoDateSchema, mealTypeSchema, ratingSummaryView, recipeSummaryView } from '../recipes/views.ts';

/** Family local time, YYYY-MM-DDTHH:mm. */
export const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const monday = isoDateSchema.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, { message: 'not_monday' });

export const mealView = z.object({
	slotId: z.uuid(),
	date: isoDateSchema,
	mealType: mealTypeSchema,
	kind: z.enum(['recipe', 'free', 'empty']),
	recipe: recipeSummaryView.nullable(),
	freeText: z.string().nullable(),
	servings: z.number().int().min(0),
	/** null for a recipe never published (R1): name and description only. */
	ingredients: z.array(ingredientLineView).nullable(),
	note: z.string().nullable(),
	rating: ratingSummaryView.nullable(),
	canOpenRecipe: z.boolean(),
	/** userName null: the author is no longer a member. */
	/** userName null: the author is no longer a member. actionId: the action that made the change (null before actions existed). */
	lastChange: z
		.object({
			userName: z.string().nullable(),
			at: localDateTimeSchema,
			actionId: z.uuid().nullable(),
			/** For the reader: their own action, still the last one of every slot it changed (meals.undo). */
			undoable: z.boolean(),
			/** Slots the action changed: two for a swap. */
			slotIds: z.array(z.uuid()),
		})
		.nullable(),
});

export const dayView = z.object({ date: isoDateSchema, meals: z.array(mealView) });
export const weekView = z.object({ startsOn: monday, days: z.array(dayView).length(7) });
export const openingView = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('no_weeks') }),
	z.object({ kind: z.literal('day'), date: isoDateSchema, weekStartsOn: monday }),
]);

export type MealView = z.infer<typeof mealView>;
export type WeekView = z.infer<typeof weekView>;
export type OpeningView = z.infer<typeof openingView>;

/** The week to announce to the caller (spec W24): null when there is nothing new. */
export const newWeekView = z.object({ weekStartsOn: monday.nullable() });
