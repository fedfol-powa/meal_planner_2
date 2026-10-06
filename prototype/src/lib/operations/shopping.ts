import { addDays, isMealPast, mondayOf } from '#lib/domain/calendar.ts';
import { DEPARTMENTS, type DemoDatabase, type Department, type Family, type IsoDate, type Locale, type MealSlot, type MealType, type ShoppingListSlot } from '#lib/domain/types.ts';
import { translate } from '#lib/i18n/translate.ts';
import { addQuantity, emptyCombined, formatCombined, type CombinedQuantity } from '#lib/units/combine.ts';
import { formatQuantity } from '#lib/units/format.ts';
import { familyFor, localeOf, localized, recipeSummary, scaledIngredients } from './access';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { visibleWeeks } from './meals';

const MEAL_ORDER = { lunch: 0, dinner: 1 } as const;
const byDateAndMeal = (a: ShoppingListSlot, b: ShoppingListSlot) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType];

export type ShoppingShortcut = 'rest_of_week' | 'next_week';

export interface ShoppingMealOption {
	slotId: string;
	date: IsoDate;
	mealType: MealType;
	kind: 'recipe' | 'free' | 'empty';
	/** Recipe name or free text; null for an empty slot. */
	label: string | null;
	/** Only meals with a recipe and its ingredients go into a list. */
	selectable: boolean;
}

export interface ShoppingSelectionView {
	days: { date: IsoDate; meals: ShoppingMealOption[] }[];
	/** Starting selection: from now to Sunday, else the whole next week. */
	selected: string[];
	/** Slot ids per shortcut; a shortcut is missing when its week is not available. */
	shortcuts: Partial<Record<ShoppingShortcut, string[]>>;
}

/** Meals not yet past, from now to the end of the last visible week (spec section 6). */
export function getShoppingSelection(db: DemoDatabase, ctx: OperationContext): OpResult<ShoppingSelectionView> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	const weeks = visibleWeeks(db, family, ctx);
	const slots = weeks
		.flatMap((w) => w.slots)
		.filter((s) => !isMealPast(s.date, s.mealType, ctx.now))
		.sort(byDateAndMeal);

	const options = slots.map((slot): ShoppingMealOption => {
		const recipe = slot.recipeId ? db.recipes.find((r) => r.id === slot.recipeId) ?? null : null;
		return {
			slotId: slot.id,
			date: slot.date,
			mealType: slot.mealType,
			kind: recipe ? 'recipe' : slot.freeText ? 'free' : 'empty',
			label: recipe ? recipeSummary(db, recipe, locale).name : slot.freeText,
			selectable: !!recipe && scaledIngredients(db, recipe, slot.servings, locale) !== null
		};
	});

	const days: ShoppingSelectionView['days'] = [];
	for (const option of options) {
		const last = days[days.length - 1];
		if (last?.date === option.date) last.meals.push(option);
		else days.push({ date: option.date, meals: [option] });
	}

	const thisMonday = mondayOf(ctx.now.slice(0, 10));
	const nextMonday = addDays(thisMonday, 7);
	const selectableIn = (from: IsoDate, to: IsoDate) =>
		options.filter((o) => o.selectable && o.date >= from && o.date < to).map((o) => o.slotId);
	const shortcuts: ShoppingSelectionView['shortcuts'] = {};
	if (weeks.some((w) => w.startsOn === thisMonday)) shortcuts.rest_of_week = selectableIn(thisMonday, nextMonday);
	if (weeks.some((w) => w.startsOn === nextMonday)) shortcuts.next_week = selectableIn(nextMonday, addDays(nextMonday, 7));
	const selected = shortcuts.rest_of_week?.length ? shortcuts.rest_of_week : (shortcuts.next_week ?? []);

	return ok({ days, selected: [...selected], shortcuts });
}

export interface ShoppingSource {
	slotId: string;
	date: IsoDate;
	mealType: MealType;
	recipeName: string;
	quantity: string;
}

export interface ShoppingItem {
	/** Canonical ingredient id. */
	id: string;
	name: string;
	department: Department;
	quantity: string;
	/** The sum before conversion and rounding, kept to compare with a ticked quantity. */
	combined: CombinedQuantity;
	/** Every line that asks for it is optional. */
	isOptional: boolean;
	sources: ShoppingSource[];
	excluded: 'pantry' | 'avoid' | null;
}

export interface ShoppingListView {
	/** Language of the user who generated it (spec section 6). */
	locale: Locale;
	mealCount: number;
	items: ShoppingItem[];
	excluded: ShoppingItem[];
	/** Selected recipes whose ingredients are not available yet (drafts). */
	skipped: { slotId: string; recipeName: string }[];
}

/**
 * Ephemeral list for explicitly chosen slots (spec section 6): the same input works for MCP.
 * Sums in a common representation, converts and rounds only for presentation.
 */
export function buildShoppingList(db: DemoDatabase, ctx: OperationContext, slotIds: string[]): OpResult<ShoppingListView> {
	const family = familyFor(db, ctx);
	if (!family) return fail('not_found');
	const familySlots = familySlotMap(db, ctx, family);
	const slots: MealSlot[] = [];
	for (const id of new Set(slotIds)) {
		const slot = familySlots.get(id);
		if (!slot) return fail('not_found');
		slots.push(slot);
	}
	return ok(computeShoppingList(db, family, localeOf(db, ctx), slots));
}

export function familySlotMap(db: DemoDatabase, ctx: OperationContext, family: Family): Map<string, MealSlot> {
	return new Map(visibleWeeks(db, family, ctx).flatMap((w) => w.slots).map((s) => [s.id, s]));
}

/** The calculation itself, on current slots or on the copy kept by a closed list. */
export function computeShoppingList(db: DemoDatabase, family: Family, locale: Locale, input: ShoppingListSlot[]): ShoppingListView {
	const system = family.measurementSystem;
	const slots = [...input].sort(byDateAndMeal);

	const avoided = new Set(db.familyIngredients.filter((f) => f.familyId === family.id && f.restriction === 'avoid').map((f) => f.ingredientId));
	const entries = new Map<string, { combined: CombinedQuantity; optional: boolean; sources: ShoppingSource[]; avoid: boolean }>();
	const skipped: ShoppingListView['skipped'] = [];
	let mealCount = 0;

	for (const slot of slots) {
		const recipe = slot.recipeId ? db.recipes.find((r) => r.id === slot.recipeId) : undefined;
		if (!recipe) continue;
		const recipeName = recipeSummary(db, recipe, locale).name;
		const scaled = scaledIngredients(db, recipe, slot.servings, locale);
		if (!scaled) {
			skipped.push({ slotId: slot.id, recipeName });
			continue;
		}
		mealCount++;
		scaled.forEach((line, index) => {
			const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
			const id = ingredient?.canonicalId ?? line.ingredientId;
			const entry = entries.get(id) ?? { combined: emptyCombined(), optional: true, sources: [], avoid: false };
			entry.combined = addQuantity(entry.combined, line.quantity, line.sourceText);
			entry.optional &&= recipe.ingredients[index].isOptional;
			entry.avoid ||= avoided.has(line.ingredientId) || avoided.has(id);
			entry.sources.push({
				slotId: slot.id,
				date: slot.date,
				mealType: slot.mealType,
				recipeName,
				quantity: formatQuantity(line.quantity, line.sourceText, system, locale)
			});
			entries.set(id, entry);
		});
	}

	const items: ShoppingItem[] = [];
	const excluded: ShoppingItem[] = [];
	for (const [id, entry] of entries) {
		const ingredient = db.ingredients.find((i) => i.id === id);
		const item: ShoppingItem = {
			id,
			name: ingredient ? localized(ingredient.name, locale).text : id,
			department: ingredient?.department ?? 'other',
			quantity: formatCombined(entry.combined, system, locale),
			combined: entry.combined,
			isOptional: entry.optional,
			sources: entry.sources,
			excluded: entry.avoid ? 'avoid' : ingredient?.isPantry ? 'pantry' : null
		};
		(item.excluded ? excluded : items).push(item);
	}
	const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name, locale);
	return { locale, mealCount, items: items.sort(byName), excluded: excluded.sort(byName), skipped };
}

export interface ArrangedShoppingList {
	mealCount: number;
	departments: { department: Department; items: ShoppingItem[] }[];
	excluded: ShoppingItem[];
	skipped: ShoppingListView['skipped'];
}

/** Groups by department in the standard order; excluded items added back join their department. */
export function arrangeShoppingList(list: ShoppingListView, addedBack: Set<string>): ArrangedShoppingList {
	const kept = [...list.items, ...list.excluded.filter((i) => addedBack.has(i.id))];
	const departments = DEPARTMENTS.map((department) => ({
		department,
		items: kept.filter((i) => i.department === department).sort((a, b) => a.name.localeCompare(b.name, list.locale))
	})).filter((d) => d.items.length > 0);
	return { mealCount: list.mealCount, departments, excluded: list.excluded.filter((i) => !addedBack.has(i.id)), skipped: list.skipped };
}

/** What the exports contain: removed items ("already at home") are left out. */
export function shoppingExport(list: ArrangedShoppingList, removed: Set<string>, locale: Locale): { text: string; bringItems: string[] } {
	const line = (i: ShoppingItem) =>
		`${i.quantity} ${i.name}${i.isOptional ? ` (${translate(locale, 'shopping.optional')})` : ''}`;
	const groups = list.departments
		.map((d) => ({ department: d.department, items: d.items.filter((i) => !removed.has(i.id)) }))
		.filter((d) => d.items.length > 0);
	const title = translate(locale, list.mealCount === 1 ? 'shopping.export.titleOne' : 'shopping.export.title', { count: list.mealCount });
	const text = [title, ...groups.map((g) => [translate(locale, `department.${g.department}`), ...g.items.map((i) => `• ${line(i)}`)].join('\n'))].join('\n\n');
	return { text, bringItems: groups.flatMap((g) => g.items.map(line)) };
}
