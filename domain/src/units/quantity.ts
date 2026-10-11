import { z } from 'zod';
import { DRAFT_ONLY_UNITS, UNIT_CODES } from './codes.ts';
import { localizedSchema } from './locale.ts';

export const unitCodeSchema = z.enum(UNIT_CODES);

/**
 * Quantity of a recipe line (interface with the recipe document, agreed on 11 October 2026).
 * Ranges, packs, glasses and other household measures are `text`; `sourceText` stays on the line.
 */
export const quantitySchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('amount'), value: z.number().positive(), unit: unitCodeSchema }),
	z.object({ kind: z.literal('to_taste') }),
	z.object({ kind: z.literal('text'), text: localizedSchema })
]);

export type Quantity = z.infer<typeof quantitySchema>;
export type Amount = Extract<Quantity, { kind: 'amount' }>;

/** Published level: US cups must be converted with a per-ingredient equivalence first. */
export const publishableQuantitySchema = quantitySchema.refine(
	(q) => q.kind !== 'amount' || !DRAFT_ONLY_UNITS.has(q.unit),
	{ message: 'draft_only_unit' }
);
