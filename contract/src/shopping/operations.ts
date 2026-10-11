import { combinedQuantitySchema } from '@app/domain/units';
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { MAX_FREE_ITEM_TEXT, mondaySchema, shoppingListViewSchema } from './view.ts';

const week = z.object({ familyId: z.uuid(), weekStartsOn: mondaySchema });
/** Every queued change carries a client id (absolute state; for addFreeItem also the item id). */
const edit = week.extend({ id: z.uuid() });
const item = { ingredientId: z.uuid(), varietyKey: z.string().max(200) };
/** Mutations answer with the updated view and its version (the web mutation model). */
const updated = z.object({ version: z.string(), data: shoppingListViewSchema });
const found = { not_found: errorDefinitions.not_found };
const write = { mcp: { readOnly: false }, offline: true, role: 'familyMember' } as const;

export const shoppingContract = {
	shopping: {
		getWeekList: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
			.route({ method: 'GET', path: '/shopping/week-list', summary: 'Shopping list of a week, ready to show' })
			.errors(found)
			.input(versionedInput(week))
			.output(versionedOutput(shoppingListViewSchema)),
		setItemChecked: op(write)
			.route({
				method: 'POST',
				path: '/shopping/set-item-checked',
				summary: 'Tick or untick an item (absolute state); ticking sends the combined quantity shown by getWeekList',
			})
			.errors(found)
			.input(
				edit
					.extend({ ...item, checked: z.boolean(), quantityAtCheck: combinedQuantitySchema.optional() })
					// Ticking always carries the quantity seen: a repeated request saves the same content.
					.refine((v) => v.checked === (v.quantityAtCheck !== undefined), { path: ['quantityAtCheck'], message: 'quantity_at_check' }),
			)
			.output(updated),
		setAddedBack: op(write)
			.route({ method: 'POST', path: '/shopping/set-added-back', summary: 'Put a pantry or avoided item back on the list, or take it off' })
			.errors(found)
			.input(edit.extend({ ...item, addedBack: z.boolean() }))
			.output(updated),
		addFreeItem: op({ ...write, creates: true })
			.route({ method: 'POST', path: '/shopping/add-free-item', summary: 'Add a free item; id is the new item id' })
			.errors(found)
			.input(edit.extend({ text: z.string().max(MAX_FREE_ITEM_TEXT * 4) }))
			.output(updated),
		setFreeItemChecked: op(write)
			.route({ method: 'POST', path: '/shopping/set-free-item-checked', summary: 'Tick or untick a free item' })
			.errors(found)
			.input(edit.extend({ itemId: z.uuid(), checked: z.boolean() }))
			.output(updated),
		removeFreeItem: op(write)
			.route({ method: 'POST', path: '/shopping/remove-free-item', summary: 'Remove a free item; removing it twice is fine' })
			.errors(found)
			.input(edit.extend({ itemId: z.uuid() }))
			.output(updated),
		exportList: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
			.route({ method: 'GET', path: '/shopping/export', summary: 'Plain text of the list, ticked items left out' })
			.errors(found)
			.input(week)
			.output(z.object({ text: z.string(), lines: z.array(z.string()) })),
		createBringLink: op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' })
			.route({ method: 'POST', path: '/shopping/bring-link', summary: 'Link that opens the list in Bring! (valid 30 minutes)' })
			.errors(found)
			.input(week)
			.output(z.object({ url: z.url(), expiresAt: z.iso.datetime({ offset: true }) })),
	},
};
