import { GROUP_MAX, knownNewSchema, mealRuleSchema, slotSettingSchema } from '@app/domain/family';
import { FOOD_GROUPS, MEAL_TYPES } from '@app/domain/planner';
import { z } from 'zod';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { measurementSystemSchema } from '../profile/index.ts';
import { familyViewSchema, ingredientMatchSchema, settingsViewSchema } from './views.ts';

export * from './views.ts';

const family = z.object({ familyId: z.uuid() });
/** min ≤ max is checked by the handler: inputs stay plain objects for OpenAPI and MCP. */
const groupBound = z.number().int().min(0).max(GROUP_MAX);
/** Family administrators only; the answer is the updated view, not versioned. */
const adminWrite = () => op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' });
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
};
