import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { idSchema } from '../id.ts';
import { op } from '../op.ts';
import { mealActionResult, suggestionsView } from './views.ts';

const slot = z.object({ familyId: idSchema(), slotId: idSchema() });
/** Every write is an action whose id comes from the client. */
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
const notFound = { not_found: errorDefinitions.not_found };
const idHint = '`id` is a new UUID for this action; repeating the same request changes nothing';

export const mealsContract = {
	/** Not versioned: the ranking also uses the ratings of every family, which no counter follows. */
	getSuggestions: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
		.route({
			method: 'GET',
			path: '/families/{familyId}/meals/{slotId}/suggestions',
			summary:
				'Five recipes that fit a meal, best first, by the same rules as the weekly menu (ratings shown, not set here); call again with nextOffset for five more. Also the free-meal texts the family uses most',
		})
		.errors(notFound)
		.input(slot.extend({ offset: z.coerce.number().int().min(0).max(1000).default(0) }))
		.output(suggestionsView),
	setServings: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/servings', summary: `Set the servings of a meal (1-20). ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: idSchema(), servings: z.number().int().min(1).max(20) }))
		.output(mealActionResult),
	setRecipe: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/recipe', summary: `Put a published recipe in a meal, from the suggestions or a recipe search. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: idSchema(), recipeId: idSchema() }))
		.output(mealActionResult),
	setFree: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/free-text', summary: `Mark a meal as free (eating out, pizza...) with a short text, kept as written; the note stays. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: idSchema(), text: z.string().trim().min(1).max(60) }))
		.output(mealActionResult),
	setNote: write()
		.route({ method: 'PUT', path: '/families/{familyId}/meals/{slotId}/note', summary: `Write the note of a meal (up to 200 characters, kept as written, seen by the whole family) or remove it with null. ${idHint}` })
		.errors(notFound)
		.input(slot.extend({ id: idSchema(), note: z.string().trim().max(200).nullable() }))
		.output(mealActionResult),
	swap: write()
		.route({
			method: 'POST',
			path: '/families/{familyId}/meals/{slotId}/swap',
			summary: `Swap two meals of the same week: dish or free text and note move, servings stay. ${idHint}`,
		})
		.errors(notFound)
		.input(slot.extend({ id: idSchema(), otherSlotId: idSchema() }))
		.output(mealActionResult),
	undo: write()
		.route({
			method: 'POST',
			path: '/families/{familyId}/meals/undo',
			summary:
				'Undo your own last change of a meal: pass lastChange.actionId from menu_getWeek when lastChange.undoable is true (a swap comes back whole). `id` is a new UUID for the undo',
		})
		.errors({ ...notFound, not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ familyId: idSchema(), actionId: idSchema(), id: idSchema() }))
		.output(mealActionResult),
};
