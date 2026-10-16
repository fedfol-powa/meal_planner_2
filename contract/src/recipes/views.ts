import { MEAL_TYPES, PROTEIN_GROUPS } from '@app/domain/planner';
import { z } from 'zod';

/** Views shared by the recipe book and the menu; owned by the recipes area (W6). */
export const isoDateSchema = z.iso.date();
export const proteinGroupSchema = z.enum(PROTEIN_GROUPS);
export const mealTypeSchema = z.enum(MEAL_TYPES);
export const recipeMealTypeSchema = z.enum([...MEAL_TYPES, 'both']);
export const sourceTypeSchema = z.enum(['web', 'youtube', 'book', 'home']);

/**
 * Texts in the caller's language. A never-published recipe has only id, name (the other
 * language when the caller's is missing) and maybe a description: everything else is null.
 */
export const recipeSummaryView = z.object({
	id: z.uuid(),
	name: z.string(),
	description: z.string().nullable(),
	durationMinutes: z.number().int().positive().nullable(),
	sourceType: sourceTypeSchema.nullable(),
	sourceUrl: z.string().nullable(),
	bookTitle: z.string().nullable(),
	bookPages: z.string().nullable(),
	mealType: recipeMealTypeSchema.nullable(),
	proteinGroup: proteinGroupSchema.nullable(),
	/**
	 * URL of the current photo (W12), null without one or for a never-published recipe. Optional:
	 * copies on the device and answers from before do not have it; the web reads absence as null.
	 */
	photoUrl: z.string().nullable().optional(),
});

/** Average of the family's current members and the caller's own stars. */
export const ratingSummaryView = z.object({
	familyAverage: z.number().min(1).max(5).nullable(),
	familyCount: z.number().int().min(0),
	myStars: z.number().int().min(1).max(5).nullable(),
});

/** A recipe line ready to show: scaled, in the family's measurement system and the caller's language. */
export const ingredientLineView = z.object({
	ingredientId: z.uuid(),
	name: z.string(),
	amount: z.string(),
	preparation: z.string().nullable(),
	optional: z.boolean(),
});

/** A meal of the family; the client decides whether it is past from `passesAt`. */
export const mealOccurrenceView = z.object({
	date: isoDateSchema,
	mealType: mealTypeSchema,
	passesAt: z.iso.datetime({ offset: true }),
});

export type RecipeSummaryView = z.infer<typeof recipeSummaryView>;
export type RatingSummaryView = z.infer<typeof ratingSummaryView>;
export type IngredientLineView = z.infer<typeof ingredientLineView>;
export type MealOccurrenceView = z.infer<typeof mealOccurrenceView>;
