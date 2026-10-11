import type { Locale, ShoppingListView } from '@app/contract';
import {
	arrangeShoppingList,
	consolidateShoppingList,
	type ConsolidatedList,
	type Department,
	type MealType,
	type ShoppingCheck,
	type ShoppingIngredient,
	type ShoppingItemRef,
	type ShoppingMeal,
} from '@app/domain/shopping';
import { combinedQuantitySchema, type Localized, type MeasurementSystem, type UnitCode, type UnitEquivalence } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { ShoppingDeps } from './deps.ts';
import { loadRecipes, versionKey } from './recipes.ts';

export interface ListInput {
	familyId: string;
	weekStartsOn: string;
	locale: Locale;
}

/** The week of the family starting on that Monday; not_found when it was never generated. */
export async function findWeek(tx: Tx, familyId: string, weekStartsOn: string): Promise<{ weekId: string }> {
	const rows = await tx<{ id: string }[]>`select id from app.weeks where family_id = ${familyId} and starts_on = ${weekStartsOn}`;
	if (!rows[0]) throw appError('not_found');
	return { weekId: rows[0].id };
}

interface Consolidated {
	list: ConsolidatedList;
	/** Meals whose recipe was never published: no ingredients, reported with the name if readable. */
	unpublished: { slotId: string; recipeId: string }[];
}

/** Steps 1-6 of spec section 6 for one week: meals, versions (R1), catalogue, family exclusions. */
async function consolidate(tx: Tx, deps: ShoppingDeps, familyId: string, weekId: string): Promise<Consolidated> {
	const slots = await tx<{ id: string; date: string; mealType: MealType; servings: number }[]>`
		select id, to_char(date, 'YYYY-MM-DD') as date, meal_type as "mealType", servings
		from app.meal_slots where week_id = ${weekId}`;
	const versions = new Map((await deps.mealRecipeVersions(tx, familyId, weekId)).map((v) => [v.slotId, v]));
	const published = [...versions.values()].filter((v) => v.version !== null).map((v) => ({ recipeId: v.recipeId, version: v.version! }));
	const recipes = await loadRecipes(tx, published);

	const meals: ShoppingMeal[] = slots.map((slot) => {
		const v = versions.get(slot.id);
		const recipe = v && v.version !== null ? (recipes.get(versionKey(v.recipeId, v.version)) ?? null) : null;
		return { slotId: slot.id, date: slot.date, mealType: slot.mealType, servings: slot.servings, recipe };
	});
	const unpublished = [...versions.values()].filter((v) => v.version === null).map(({ slotId, recipeId }) => ({ slotId, recipeId }));

	const ingredientIds = [...new Set([...recipes.values()].flatMap((r) => r.lines.map((l) => l.ingredientId)))];
	const ingredients = new Map<string, ShoppingIngredient>();
	const equivalences: UnitEquivalence[] = [];
	if (ingredientIds.length > 0) {
		const rows = await tx<{ id: string; name: Localized; department: Department; isPantry: boolean }[]>`
			select id, name, department, is_pantry as "isPantry" from app.ingredients where id in (select jsonb_array_elements_text(${tx.json(ingredientIds)})::uuid)`;
		for (const row of rows) ingredients.set(row.id, { name: row.name, department: row.department, isPantry: row.isPantry });
		const eqs = await tx<{ ingredientId: string; fromUnit: UnitCode; toUnit: UnitCode; factor: string; preparation: string | null; source: string }[]>`
			select ingredient_id as "ingredientId", from_unit as "fromUnit", to_unit as "toUnit", factor::text as factor, preparation, source
			from app.ingredient_unit_equivalences where scope = 'shopping' and ingredient_id in (select jsonb_array_elements_text(${tx.json(ingredientIds)})::uuid)`;
		for (const eq of eqs) equivalences.push({ ...eq, factor: Number(eq.factor), scope: 'shopping' });
	}
	const avoided = await tx<{ ingredientId: string }[]>`
		select ingredient_id as "ingredientId" from app.family_ingredients where family_id = ${familyId} and restriction = 'avoid'`;

	const list = consolidateShoppingList({ meals, ingredients, equivalences, avoided: new Set(avoided.map((a) => a.ingredientId)) });
	return { list, unpublished };
}

/** The family's list of that week, if somebody already changed it. */
export async function listRow(tx: Tx, familyId: string, weekId: string) {
	const rows = await tx<{ id: string; updatedBy: string | null; updatedAt: Date }[]>`
		select id, updated_by as "updatedBy", updated_at as "updatedAt"
		from app.shopping_lists where family_id = ${familyId} and week_id = ${weekId}`;
	return rows[0] ?? null;
}

async function listState(tx: Tx, listId: string) {
	const checks = await tx<{ ingredientId: string; varietyKey: string; quantity: unknown }[]>`
		select ingredient_id as "ingredientId", variety_key as "varietyKey", quantity_at_check as quantity
		from app.shopping_list_checks where shopping_list_id = ${listId}`;
	const addedBack = await tx<ShoppingItemRef[]>`
		select ingredient_id as "ingredientId", variety_key as "varietyKey"
		from app.shopping_list_added_back where shopping_list_id = ${listId}`;
	const freeItems = await tx<{ id: string; text: string; checked: boolean }[]>`
		select id, text, checked from app.shopping_list_items where shopping_list_id = ${listId} order by created_at, id`;
	const parsed: ShoppingCheck[] = checks.map((c) => ({
		ingredientId: c.ingredientId,
		varietyKey: c.varietyKey,
		quantityAtCheck: combinedQuantitySchema.parse(c.quantity),
	}));
	return { checks: parsed, addedBack: [...addedBack], freeItems: [...freeItems] };
}

/** Display name of the last author, only while still a member (as in the prototype). */
async function memberName(tx: Tx, familyId: string, userId: string | null): Promise<string | null> {
	if (!userId) return null;
	const rows = await tx<{ name: string }[]>`
		select p.display_name as name from app.profiles p
		join app.family_members m on m.user_id = p.user_id and m.family_id = ${familyId}
		where p.user_id = ${userId}`;
	return rows[0]?.name ?? null;
}

/** Names of never-published recipes the user can read; drafts hidden by the policy stay null. */
async function recipeNames(tx: Tx, recipeIds: string[], locale: Locale): Promise<Map<string, string>> {
	if (recipeIds.length === 0) return new Map();
	const rows = await tx<{ id: string; name: Localized | null }[]>`select id, name from app.recipes where id in (select jsonb_array_elements_text(${tx.json(recipeIds)})::uuid)`;
	return new Map(rows.filter((r) => r.name).map((r) => [r.id, r.name![locale]]));
}

/** The ready view of spec section 6, in the viewer's language and the family's system. */
export async function readListView(tx: Tx, deps: ShoppingDeps, input: ListInput): Promise<ShoppingListView> {
	const { weekId } = await findWeek(tx, input.familyId, input.weekStartsOn);
	const { list: consolidated, unpublished } = await consolidate(tx, deps, input.familyId, weekId);
	const list = await listRow(tx, input.familyId, weekId);
	const state = list ? await listState(tx, list.id) : { checks: [], addedBack: [], freeItems: [] };
	const [family] = await tx<{ system: MeasurementSystem }[]>`select measurement_system as system from app.families where id = ${input.familyId}`;
	const system = family!.system;
	const arranged = arrangeShoppingList(consolidated, { checks: state.checks, addedBack: state.addedBack, system, locale: input.locale });
	const names = await recipeNames(tx, [...new Set(unpublished.map((u) => u.recipeId))], input.locale);
	return {
		...arranged,
		weekStartsOn: input.weekStartsOn,
		measurementSystem: system,
		skipped: [...arranged.skipped, ...unpublished.map((u) => ({ ...u, recipeName: names.get(u.recipeId) ?? null }))],
		freeItems: state.freeItems,
		lastChange: list ? { name: await memberName(tx, input.familyId, list.updatedBy), at: list.updatedAt.toISOString() } : null,
	};
}
