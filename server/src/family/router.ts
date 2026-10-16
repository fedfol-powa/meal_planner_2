import { withInvalidOn } from '../db-errors.ts';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { fresh } from '../pipeline.ts';
import { groupRangeSchema, normalizeRules, resolveFamilySettings, sameRule } from '@app/domain/family';
import type { MealRule } from '@app/domain/planner';
import { profileView } from '../profile/views.ts';
import { familyMembersRouter } from './members.ts';
import { writeSettingsKey } from './settings-writes.ts';
import { resolveTimeZone } from './time-zone.ts';
import { exclusionsView, familyView, searchIngredients, settingsView } from './views.ts';

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

function catalogueHandlers(os: Implementer) {
	return {
		setBookOwned: os.family.setBookOwned.handler(async ({ context, input }) => {
			const { tx } = context;
			const [book] = await tx<{ archived: boolean }[]>`select archived_at is not null as archived from app.books where id = ${input.bookId}`;
			// Unknown book: not_found either way; an archived one can still be dropped, not added.
			if (!book || (input.owned && book.archived)) throw appError('not_found');
			if (input.owned) {
				await tx`insert into app.family_books (family_id, book_id) values (${input.familyId}, ${input.bookId}) on conflict do nothing`;
			} else {
				await tx`delete from app.family_books where family_id = ${input.familyId} and book_id = ${input.bookId}`;
			}
			return settingsView(tx, input.familyId, context.locale);
		}),
		setIngredientRestriction: os.family.setIngredientRestriction.handler(async ({ context, input }) => {
			const { tx } = context;
			if ((input.restriction === 'limit') !== (input.weeklyMax !== null)) {
				throw appError('invalid', { issues: [{ path: ['weeklyMax'], code: 'weekly_max_with_limit_only' }] });
			}
			const [ingredient] = await tx<{ archived: boolean }[]>`
				select archived_at is not null as archived from app.ingredients where id = ${input.ingredientId}`;
			// Unknown ingredient: not_found; an archived one can still be cleared, not restricted.
			if (!ingredient || (input.restriction !== null && ingredient.archived)) throw appError('not_found');
			if (input.restriction === null) {
				await tx`delete from app.family_ingredients where family_id = ${input.familyId} and ingredient_id = ${input.ingredientId}`;
			} else {
				await tx`
					insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max)
					values (${input.familyId}, ${input.ingredientId}, ${input.restriction}, ${input.weeklyMax})
					on conflict (family_id, ingredient_id) do update set restriction = excluded.restriction, weekly_max = excluded.weekly_max`;
			}
			return settingsView(tx, input.familyId, context.locale);
		}),
	};
}

function exclusionHandlers(os: Implementer) {
	return {
		listExclusions: os.family.listExclusions.handler(async ({ context, input }) =>
			fresh(context, await exclusionsView(context.tx, input.familyId, context.locale)),
		),
		/** Published or archived recipes; the first author, reason and date stay when repeated. */
		addExclusion: os.family.addExclusion.handler(async ({ context, input }) => {
			const { tx } = context;
			const [recipe] = await tx`select 1 from app.recipes where id = ${input.recipeId} and status <> 'draft'`;
			if (!recipe) throw appError('not_found');
			await tx`
				insert into app.recipe_exclusions (family_id, recipe_id, reason, created_by)
				values (${input.familyId}, ${input.recipeId}, ${input.reason ?? null}, auth.uid())
				on conflict (family_id, recipe_id) do nothing`;
			return exclusionsView(tx, input.familyId, context.locale);
		}),
		removeExclusion: os.family.removeExclusion.handler(async ({ context, input }) => {
			await context.tx`delete from app.recipe_exclusions where family_id = ${input.familyId} and recipe_id = ${input.recipeId}`;
			return exclusionsView(context.tx, input.familyId, context.locale);
		}),
	};
}

export function familyRouter(os: Implementer) {
	return {
		/** Spec W9: the creator becomes family_admin and the family is shown; no week is generated here. */
		create: os.family.create.handler(async ({ context, input }) => {
			try {
				await context.tx`select app.create_family(${input.id}::uuid, ${input.name}, ${input.measurementSystem}, ${resolveTimeZone(input.timeZone)})`;
			} catch (error) {
				if ((error as { code?: string }).code === 'P0A05') throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
				throw error;
			}
			return profileView(context.tx, context.locale);
		}),
		...identityHandlers(os),
		...settingsHandlers(os),
		...catalogueHandlers(os),
		...exclusionHandlers(os),
		...familyMembersRouter(os),
		get: os.family.get.handler(async ({ context, input }) => fresh(context, await familyView(context.tx, input.familyId, context.locale))),
		getSettings: os.family.getSettings.handler(async ({ context, input }) =>
			fresh(context, await settingsView(context.tx, input.familyId, context.locale)),
		),
		searchIngredients: os.family.searchIngredients.handler(({ context, input }) =>
			searchIngredients(context.tx, input.familyId, input.text, context.locale),
		),
	};
}
