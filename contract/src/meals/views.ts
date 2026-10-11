import { z } from 'zod';
import { weekView } from '../menu/views.ts';

export const mealActionResult = z.object({
	week: weekView,
	/** The action of this request: the `id` sent. */
	actionId: z.uuid(),
	/** False when the request changed nothing (also when it repeats one that changed nothing). */
	changed: z.boolean(),
});
export type MealActionResult = z.infer<typeof mealActionResult>;
