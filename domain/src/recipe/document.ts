import * as z from 'zod';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, SEASONS } from '../planner/index.ts';
import { localizedSchema, publishableQuantitySchema, unitCodeSchema } from '../units/index.ts';
import { draftTranslatedSchema } from './localized.ts';

export const SOURCE_TYPES = ['web', 'youtube', 'book', 'home'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const RECIPE_MEAL_TYPES = ['lunch', 'dinner', 'both'] as const;

export const LIMITS = {
	name: 120,
	description: 600,
	variety: 40,
	quantityText: 40,
	preparation: 60,
	sourceText: 200,
	bookPages: 20,
	durationMinutes: 1440,
	baseServings: 100
} as const;

/** Planner attributes required to publish (user, 11 October 2026); seasons may stay empty. */
export const PLANNER_ATTRIBUTES = ['mealType', 'proteinGroup', 'isFreshFish', 'carbohydrateGroup', 'category', 'hasVegetables', 'isHeavy'] as const;

const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

/** W4's quantity, with the value still to be written and US cups allowed. */
const draftQuantitySchema = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('amount'), value: z.number().nullable(), unit: unitCodeSchema }),
	z.strictObject({ kind: z.literal('to_taste') }),
	z.strictObject({ kind: z.literal('text'), text: draftTranslatedSchema })
]);
export type DraftQuantity = z.infer<typeof draftQuantitySchema>;

const draftLineSchema = z.strictObject({
	/** null: unresolved line, kept with its source text until a curator picks the ingredient. */
	ingredientId: z.string().min(1).nullable(),
	variety: optional(draftTranslatedSchema),
	preparation: optional(draftTranslatedSchema),
	quantity: draftQuantitySchema,
	sourceText: z.string(),
	isOptional: z.boolean(),
	isPrimary: z.boolean()
});

export const recipeDraftSchema = z.strictObject({
	schemaVersion: z.literal(1),
	name: draftTranslatedSchema,
	description: optional(draftTranslatedSchema),
	sourceType: optional(z.enum(SOURCE_TYPES)),
	sourceUrl: optional(z.string()),
	bookId: optional(z.string()),
	bookPages: optional(z.string()),
	durationMinutes: optional(z.number()),
	baseServings: optional(z.number()),
	mealType: optional(z.enum(RECIPE_MEAL_TYPES)),
	proteinGroup: optional(z.enum(PROTEIN_GROUPS)),
	isFreshFish: optional(z.boolean()),
	carbohydrateGroup: optional(z.enum(CARBOHYDRATE_GROUPS)),
	category: optional(z.enum(CATEGORIES)),
	hasVegetables: optional(z.boolean()),
	isHeavy: optional(z.boolean()),
	seasons: z.array(z.enum(SEASONS)).optional(),
	ingredients: z.array(draftLineSchema).optional()
});

const lineSchema = z.strictObject({
	ingredientId: z.string().min(1),
	variety: localizedSchema.nullable(),
	preparation: localizedSchema.nullable(),
	quantity: publishableQuantitySchema,
	sourceText: z.string().trim().min(1),
	isOptional: z.boolean(),
	isPrimary: z.boolean()
});

export const publishedRecipeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	name: localizedSchema,
	description: localizedSchema,
	sourceType: z.enum(SOURCE_TYPES),
	sourceUrl: z.string().nullable(),
	bookId: z.string().nullable(),
	bookPages: z.string().nullable(),
	durationMinutes: z.number().int().positive(),
	baseServings: z.number().int().positive(),
	mealType: z.enum(RECIPE_MEAL_TYPES),
	proteinGroup: z.enum(PROTEIN_GROUPS),
	isFreshFish: z.boolean(),
	carbohydrateGroup: z.enum(CARBOHYDRATE_GROUPS),
	category: z.enum(CATEGORIES),
	hasVegetables: z.boolean(),
	isHeavy: z.boolean(),
	seasons: z.array(z.enum(SEASONS)),
	ingredients: z.array(lineSchema).min(1)
});

export type RecipeDraftDocument = z.infer<typeof recipeDraftSchema>;
export type RecipeDocument = z.infer<typeof publishedRecipeSchema>;
export type DraftIngredientLine = z.infer<typeof draftLineSchema>;
export type IngredientLine = z.infer<typeof lineSchema>;

export function emptyDraft(): RecipeDraftDocument {
	return { schemaVersion: 1, name: {}, ingredients: [], seasons: [] };
}
