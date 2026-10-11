import { departmentSchema } from '@app/domain/shopping';
import { combinedQuantitySchema, MEASUREMENT_SYSTEMS } from '@app/domain/units';
import { z } from 'zod';
import { localeSchema } from '../locale.ts';

export const isoDate = z.iso.date();
/** A Monday, as in the list route `/shopping/<monday>`. */
export const mondaySchema = isoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, { message: 'not_monday' });

const sourceView = z.object({
	slotId: z.uuid(),
	date: isoDate,
	mealType: z.enum(['lunch', 'dinner']),
	recipeName: z.string(),
	quantity: z.string(),
});

export const shoppingItemViewSchema = z.object({
	key: z.string(),
	ingredientId: z.uuid(),
	varietyKey: z.string(),
	department: departmentSchema,
	/** Shown name, «Pomodori (Roma)». */
	name: z.string(),
	/** Its parts, for the order of the list: ingredient name, then variety (none first). */
	ingredientName: z.string(),
	variety: z.string().nullable(),
	quantity: z.string(),
	/** Canonical sum shown now: sent back as `quantityAtCheck` when ticking. */
	combined: combinedQuantitySchema,
	isOptional: z.boolean(),
	excluded: z.enum(['avoid', 'pantry']).nullable(),
	checked: z.boolean(),
	previousQuantity: z.string().nullable(),
	sources: z.array(sourceView),
});

export const freeItemViewSchema = z.object({ id: z.uuid(), text: z.string(), checked: z.boolean() });

export const shoppingListViewSchema = z.object({
	weekStartsOn: isoDate,
	locale: localeSchema,
	/** The family's system: the web formats «prima: …» in the pending layer with it. */
	measurementSystem: z.enum(MEASUREMENT_SYSTEMS),
	mealCount: z.number().int().nonnegative(),
	departments: z.array(z.object({ department: departmentSchema, items: z.array(shoppingItemViewSchema) })),
	/** «Non in lista»: pantry and avoided items not put back. */
	excluded: z.array(shoppingItemViewSchema),
	/** Meals left out: recipes without ingredients and never-published recipes (name null when not readable). */
	skipped: z.array(z.object({ slotId: z.uuid(), recipeId: z.uuid(), recipeName: z.string().nullable() })),
	freeItems: z.array(freeItemViewSchema),
	/** name null: the author is no longer a member. */
	lastChange: z.object({ name: z.string().nullable(), at: z.iso.datetime({ offset: true }) }).nullable(),
});

export type ShoppingListView = z.infer<typeof shoppingListViewSchema>;
export type ShoppingItemView = z.infer<typeof shoppingItemViewSchema>;
export type FreeItemView = z.infer<typeof freeItemViewSchema>;

export const MAX_FREE_ITEM_TEXT = 60;

/** Trimmed, inner spaces collapsed; null when empty or too long. */
export function normalizeFreeItemText(text: string): string | null {
	const clean = text.trim().replace(/\s+/g, ' ');
	return clean.length >= 1 && clean.length <= MAX_FREE_ITEM_TEXT ? clean : null;
}
