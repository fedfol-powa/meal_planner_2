import * as z from 'zod';
import { DEPARTMENTS } from '../shopping/index.ts';
import { localizedSchema } from '../units/index.ts';

const synonym = z.string().trim().min(1);

/** A catalogue ingredient: the generic product, without variety, size or preparation (spec section 8). */
export const catalogueIngredientSchema = z.strictObject({
	slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
	name: localizedSchema,
	synonyms: z.strictObject({ 'it-IT': z.array(synonym), 'en-GB': z.array(synonym) }),
	department: z.enum(DEPARTMENTS),
	isPantry: z.boolean()
});
export type CatalogueIngredient = z.infer<typeof catalogueIngredientSchema>;
