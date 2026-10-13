import { GROUP_MAX, knownNewSchema, mealRuleSchema, slotSettingSchema, WEEKLY_MAX } from '@app/domain/family';
import { FOOD_GROUPS, MEAL_TYPES } from '@app/domain/planner';
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { measurementSystemSchema, profileViewSchema } from '../profile/index.ts';
import { exclusionsViewSchema, familyViewSchema, ingredientMatchSchema, settingsViewSchema } from './views.ts';

export * from './views.ts';

const family = z.object({ familyId: z.uuid() });
/** Declared where a handler can answer not_found: clients and OpenAPI see it. */
const notFound = { not_found: errorDefinitions.not_found };
/** min ≤ max is checked by the handler: inputs stay plain objects for OpenAPI and MCP. */
const groupBound = z.number().int().min(0).max(GROUP_MAX);
/** Family administrators only; the answer is the updated view, not versioned. */
const adminWrite = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' });
/** Any member of the family. */
const memberWrite = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' });
const memberRead = (reads?: ('family' | 'catalogue')[]) =>
	op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', ...(reads ? { reads } : {}) });

export const familyContract = {
	create: op({ mcp: { readOnly: false }, offline: false, role: 'user', creates: true })
		.route({
			method: 'POST',
			path: '/families',
			summary:
				'Create a family you will administer: name, metric or UK imperial units and an IANA time zone (default Europe/Rome). The menu is prepared at the first menu read. Returns your profile with the new family shown',
		})
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().trim().min(1).max(60),
				measurementSystem: measurementSystemSchema,
				timeZone: z.string().max(64).optional(),
			}),
		)
		.output(profileViewSchema),
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

	rename: adminWrite()
		.route({ method: 'PUT', path: '/families/{familyId}/name', summary: 'Rename a family (family administrators)' })
		.input(family.extend({ name: z.string().trim().min(1).max(60) }))
		.output(familyViewSchema),
	setMeasurementSystem: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/measurement-system',
			summary: 'Use metric or UK imperial units for meals, shopping and exports (family administrators)',
		})
		.input(family.extend({ measurementSystem: measurementSystemSchema }))
		.output(familyViewSchema),
	setTimeZone: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/time-zone',
			summary: 'Set the family time zone, an IANA name such as Europe/Rome (family administrators)',
		})
		.input(family.extend({ timeZone: z.string().min(1).max(64) }))
		.output(familyViewSchema),

	setMeal: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/settings/meals/{mealType}/{weekday}',
			summary:
				'Plan one meal of the weekly pattern (weekday 0 = Monday): servings (0 = not planned), a fixed free-meal text or null, a time limit of 15, 20, 30, 45 or 60 minutes or null',
		})
		.input(family.extend({ mealType: z.enum(MEAL_TYPES), weekday: z.number().int().min(0).max(6), ...slotSettingSchema.shape }))
		.output(settingsViewSchema),
	addRule: adminWrite()
		.route({
			method: 'POST',
			path: '/families/{familyId}/settings/rules',
			summary:
				'Add a meal rule from the four templates (only_lunch for a dish, at_least_one or never_on for a protein group on a weekday, never_fresh_fish on a weekday); adding an existing rule changes nothing',
		})
		.input(family.extend({ rule: mealRuleSchema }))
		.output(settingsViewSchema),
	removeRule: adminWrite()
		.route({ method: 'POST', path: '/families/{familyId}/settings/rules/remove', summary: 'Remove a meal rule, given by its value; a missing rule changes nothing' })
		.input(family.extend({ rule: mealRuleSchema }))
		.output(settingsViewSchema),
	setKnownNew: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/settings/known-new',
			summary: 'Weekly quota of known and new recipes, with its tolerance (0-14 each)',
		})
		.input(family.extend(knownNewSchema.shape))
		.output(settingsViewSchema),
	setGroupRange: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/settings/group-ranges/{group}',
			summary: 'Weekly minimum and maximum of a food group (0-14, min not above max)',
		})
		.input(family.extend({ group: z.enum(FOOD_GROUPS), min: groupBound, max: groupBound }))
		.output(settingsViewSchema),

	setBookOwned: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/books/{bookId}',
			summary: 'Mark a cookbook as owned or not: recipes from books the family does not own are never planned',
		})
		.errors(notFound)
		.input(family.extend({ bookId: z.uuid(), owned: z.boolean() }))
		.output(settingsViewSchema),
	setIngredientRestriction: adminWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/ingredients/{ingredientId}',
			summary: 'Avoid an ingredient, limit it to a weekly maximum (1-7, only with limit), or clear the restriction with null',
		})
		.errors(notFound)
		.input(
			family.extend({
				ingredientId: z.uuid(),
				restriction: z.enum(['avoid', 'limit']).nullable(),
				weeklyMax: z.number().int().min(1).max(WEEKLY_MAX).nullable(),
			}),
		)
		.output(settingsViewSchema),

	listExclusions: memberRead(['family', 'catalogue'])
		.route({ method: 'GET', path: '/families/{familyId}/exclusions', summary: 'Recipes this family asked never to be proposed again, newest first' })
		.input(versionedInput(family))
		.output(versionedOutput(exclusionsViewSchema)),
	addExclusion: memberWrite()
		.route({
			method: 'PUT',
			path: '/families/{familyId}/exclusions/{recipeId}',
			summary: 'Stop proposing a recipe to this family, with an optional reason; repeating it changes nothing',
		})
		.errors(notFound)
		.input(family.extend({ recipeId: z.uuid(), reason: z.string().trim().min(1).max(200).optional() }))
		.output(exclusionsViewSchema),
	removeExclusion: memberWrite()
		.route({ method: 'DELETE', path: '/families/{familyId}/exclusions/{recipeId}', summary: 'Let a recipe be proposed again to this family' })
		.input(family.extend({ recipeId: z.uuid() }))
		.output(exclusionsViewSchema),
};
