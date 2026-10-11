import { z } from 'zod';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { familyViewSchema, ingredientMatchSchema, settingsViewSchema } from './views.ts';

export * from './views.ts';

const family = z.object({ familyId: z.uuid() });
const memberRead = (reads?: ('family' | 'catalogue')[]) =>
	op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', ...(reads ? { reads } : {}) });

export const familyContract = {
	get: memberRead(['family'])
		.route({
			method: 'GET',
			path: '/families/{familyId}',
			summary: 'A family you belong to: name, measurement system, time zone, your role and the members with their roles',
		})
		.input(versionedInput(family))
		.output(versionedOutput(familyViewSchema)),
	getSettings: memberRead(['family', 'catalogue'])
		.route({
			method: 'GET',
			path: '/families/{familyId}/settings',
			summary:
				'Planning settings of a family: servings, fixed meals and time limits per day and meal, meal rules, ingredients to avoid or limit, owned books, known/new quota and weekly food-group ranges',
		})
		.input(versionedInput(family))
		.output(versionedOutput(settingsViewSchema)),
	searchIngredients: memberRead()
		.route({
			method: 'GET',
			path: '/families/{familyId}/ingredient-search',
			summary: 'Find catalogue ingredients by name or synonym in your language (at least 2 letters), to avoid or limit them in this family',
		})
		.input(family.extend({ text: z.string().max(60) }))
		.output(z.array(ingredientMatchSchema)),
};
