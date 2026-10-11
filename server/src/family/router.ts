import { withInvalidOn } from '../db-errors.ts';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { fresh } from '../pipeline.ts';
import { groupRangeSchema, normalizeRules, resolveFamilySettings, sameRule } from '@app/domain/family';
import type { MealRule } from '@app/domain/planner';
import { writeSettingsKey } from './settings-writes.ts';
import { familyView, searchIngredients, settingsView } from './views.ts';

/** No row: the family is gone or the caller is no longer one of its administrators. */
async function updated(rows: PromiseLike<readonly unknown[]>): Promise<void> {
	if ((await rows).length === 0) throw appError('forbidden');
}

function identityHandlers(os: Implementer) {
	const update = (tx: Tx, familyId: string, column: 'name' | 'measurement_system' | 'time_zone', value: string) =>
		updated(tx`update app.families set ${tx({ [column]: value })} where id = ${familyId} returning id`);
	return {
		rename: os.family.rename.handler(async ({ context, input }) => {
			await update(context.tx, input.familyId, 'name', input.name);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setMeasurementSystem: os.family.setMeasurementSystem.handler(async ({ context, input }) => {
			await update(context.tx, input.familyId, 'measurement_system', input.measurementSystem);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setTimeZone: os.family.setTimeZone.handler(async ({ context, input }) => {
			// The database knows the IANA names (pg_timezone_names): an unknown one is the caller's input.
			await withInvalidOn(['timeZone'], () => update(context.tx, input.familyId, 'time_zone', input.timeZone));
			return familyView(context.tx, input.familyId, context.locale);
		}),
	};
}

/** Current rules, locking the row: two concurrent rule changes never lose one another. */
async function lockedRules(tx: Tx, familyId: string): Promise<MealRule[]> {
	const [row] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId} for update`;
	if (!row) throw appError('forbidden');
	return resolveFamilySettings(row.settings).rules;
}

function settingsHandlers(os: Implementer) {
	return {
		setMeal: os.family.setMeal.handler(async ({ context, input }) => {
			const { familyId, mealType, weekday, servings, fixedText, maxMinutes } = input;
			await writeSettingsKey(context.tx, familyId, ['slots', mealType, String(weekday)], { servings, fixedText, maxMinutes });
			return settingsView(context.tx, familyId, context.locale);
		}),
		addRule: os.family.addRule.handler(async ({ context, input }) => {
			const rules = await lockedRules(context.tx, input.familyId);
			await writeSettingsKey(context.tx, input.familyId, ['rules'], normalizeRules([...rules, input.rule]));
			return settingsView(context.tx, input.familyId, context.locale);
		}),
		removeRule: os.family.removeRule.handler(async ({ context, input }) => {
			const rules = await lockedRules(context.tx, input.familyId);
			await writeSettingsKey(context.tx, input.familyId, ['rules'], normalizeRules(rules.filter((rule) => !sameRule(rule, input.rule))));
			return settingsView(context.tx, input.familyId, context.locale);
		}),
		setKnownNew: os.family.setKnownNew.handler(async ({ context, input }) => {
			const { familyId, ...knownNew } = input;
			await writeSettingsKey(context.tx, familyId, ['knownNew'], knownNew);
			return settingsView(context.tx, familyId, context.locale);
		}),
		setGroupRange: os.family.setGroupRange.handler(async ({ context, input }) => {
			const range = groupRangeSchema.safeParse({ min: input.min, max: input.max });
			if (!range.success) throw appError('invalid', { issues: [{ path: ['min'], code: 'min_above_max' }] });
			await writeSettingsKey(context.tx, input.familyId, ['groupRanges', input.group], range.data);
			return settingsView(context.tx, input.familyId, context.locale);
		}),
	};
}

export function familyRouter(os: Implementer) {
	return {
		...identityHandlers(os),
		...settingsHandlers(os),
		get: os.family.get.handler(async ({ context, input }) => fresh(context, await familyView(context.tx, input.familyId, context.locale))),
		getSettings: os.family.getSettings.handler(async ({ context, input }) =>
			fresh(context, await settingsView(context.tx, input.familyId, context.locale)),
		),
		searchIngredients: os.family.searchIngredients.handler(({ context, input }) =>
			searchIngredients(context.tx, input.familyId, input.text, context.locale),
		),
	};
}
