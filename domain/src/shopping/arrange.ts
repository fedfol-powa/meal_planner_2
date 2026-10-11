import { exceeds, type CombinedQuantity } from '../units/combined.ts';
import { formatCombined, formatQuantity } from '../units/format.ts';
import type { Locale, Localized } from '../units/locale.ts';
import type { MeasurementSystem } from '../units/present.ts';
import type { ConsolidatedItem, ConsolidatedList, Exclusion, MealType } from './consolidate.ts';
import { DEPARTMENTS, type Department } from './departments.ts';
import { itemKey } from './variety.ts';

/** A row of `shopping_list_checks`. */
export interface ShoppingCheck {
	ingredientId: string;
	varietyKey: string;
	quantityAtCheck: CombinedQuantity;
}

/** A row of `shopping_list_added_back`. */
export interface ShoppingItemRef {
	ingredientId: string;
	varietyKey: string;
}

export interface ArrangeOptions {
	checks: readonly ShoppingCheck[];
	addedBack: readonly ShoppingItemRef[];
	system: MeasurementSystem;
	locale: Locale;
}

export interface ShoppingSourceView {
	slotId: string;
	date: string;
	mealType: MealType;
	recipeName: string;
	quantity: string;
}

export interface ShoppingItemView {
	key: string;
	ingredientId: string;
	varietyKey: string;
	department: Department;
	/** Shown name: "Pomodori (Roma)". */
	name: string;
	/** Its parts in the viewer language, for the order of the list: "Pomodori", "Roma" (null without variety). */
	ingredientName: string;
	variety: string | null;
	quantity: string;
	/** Canonical sum shown now: the client keeps it and sends it as `quantity_at_check` when ticking. */
	combined: CombinedQuantity;
	isOptional: boolean;
	excluded: Exclusion | null;
	checked: boolean;
	/** The ticked quantity, when the item grew since and needs ticking again ("prima: 200 g"). */
	previousQuantity: string | null;
	sources: ShoppingSourceView[];
}

export interface ArrangedShoppingList {
	locale: Locale;
	mealCount: number;
	departments: { department: Department; items: ShoppingItemView[] }[];
	/** "Non in lista": pantry and avoided items not put back. */
	excluded: ShoppingItemView[];
	skipped: { slotId: string; recipeId: string; recipeName: string }[];
}

/**
 * Order of the items in a department and in «Non in lista» (coordinator, PR #24): ingredient name,
 * then variety, the item without variety first; both in the viewer language. Never the shown name,
 * so the brackets play no part. Also used by the web's pending layer.
 */
export const compareShoppingItems =
	(locale: Locale) =>
	(a: Pick<ShoppingItemView, 'ingredientName' | 'variety'>, b: Pick<ShoppingItemView, 'ingredientName' | 'variety'>): number =>
		a.ingredientName.localeCompare(b.ingredientName, locale) ||
		(a.variety === null ? (b.variety === null ? 0 : -1) : b.variety === null ? 1 : a.variety.localeCompare(b.variety, locale));

/**
 * "Pomodori (Roma)", "Onions (red)": the variety in brackets after the name, so a plural name and
 * a singular variety never read as one phrase (coordinator, 11 October 2026). Lists, exports and
 * the Bring! page all take the name from here.
 */
export const displayName = (name: Localized, variety: Localized | null, locale: Locale): string =>
	variety ? `${name[locale]} (${variety[locale]})` : name[locale];

function toView(item: ConsolidatedItem, checked: CombinedQuantity | undefined, system: MeasurementSystem, locale: Locale): ShoppingItemView {
	const options = { system, locale, rounding: 'shopping' as const };
	const grew = checked !== undefined && exceeds(item.combined, checked);
	return {
		key: item.key,
		ingredientId: item.ingredientId,
		varietyKey: item.varietyKey,
		department: item.department,
		name: displayName(item.name, item.variety, locale),
		ingredientName: item.name[locale],
		variety: item.variety?.[locale] ?? null,
		quantity: formatCombined(item.combined, options),
		combined: item.combined,
		isOptional: item.isOptional,
		excluded: item.excluded,
		checked: checked !== undefined && !grew,
		previousQuantity: grew ? formatCombined(checked, options) : null,
		sources: item.sources.map((s) => ({
			slotId: s.slotId,
			date: s.date,
			mealType: s.mealType,
			recipeName: s.recipeName[locale],
			quantity: formatQuantity(s.quantity, system, locale)
		}))
	};
}

/** Steps 7-8 of spec section 6: ticks, items put back, departments, family units and viewer language. */
export function arrangeShoppingList(list: ConsolidatedList, { checks, addedBack, system, locale }: ArrangeOptions): ArrangedShoppingList {
	const ticked = new Map(checks.map((c) => [itemKey(c.ingredientId, c.varietyKey), c.quantityAtCheck]));
	const putBack = new Set(addedBack.map((a) => itemKey(a.ingredientId, a.varietyKey)));
	const byName = compareShoppingItems(locale);
	const views = list.items.map((item) => toView(item, ticked.get(item.key), system, locale));
	const kept = views.filter((v) => v.excluded === null || putBack.has(v.key));
	return {
		locale,
		mealCount: list.mealCount,
		departments: DEPARTMENTS.map((department) => ({ department, items: kept.filter((v) => v.department === department).sort(byName) })).filter(
			(d) => d.items.length > 0
		),
		excluded: views.filter((v) => v.excluded !== null && !putBack.has(v.key)).sort(byName),
		skipped: list.skipped.map((s) => ({ slotId: s.slotId, recipeId: s.recipeId, recipeName: s.recipeName[locale] }))
	};
}
