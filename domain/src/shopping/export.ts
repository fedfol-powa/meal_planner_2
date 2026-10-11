import type { Locale } from '../units/locale.ts';
import type { ArrangedShoppingList, ShoppingItemView } from './arrange.ts';
import { DEPARTMENT_LABELS, type Department } from './departments.ts';

export interface ExportManualItem {
	text: string;
	checked: boolean;
}

export interface ShoppingExport {
	/** Plain text for sharing (Web Share, MCP). */
	text: string;
	/** "quantity name" lines for Bring! and the PDF. */
	lines: string[];
}

const OPTIONAL: Record<Locale, string> = { 'it-IT': 'facoltativo', 'en-GB': 'optional' };
const TITLE: Record<Locale, (count: number) => string> = {
	'it-IT': (count) => `Lista della spesa · ${count} ${count === 1 ? 'pasto' : 'pasti'}`,
	'en-GB': (count) => `Shopping list · ${count} ${count === 1 ? 'meal' : 'meals'}`
};

/** What exports contain (spec section 6): ticked items left out, free items included under "Altro". */
export function shoppingExport(list: ArrangedShoppingList, manualItems: readonly ExportManualItem[] = []): ShoppingExport {
	const { locale } = list;
	const line = (item: ShoppingItemView) => `${item.quantity} ${item.name}${item.isOptional ? ` (${OPTIONAL[locale]})` : ''}`;
	const groups: { department: Department; lines: string[] }[] = list.departments.map((d) => ({
		department: d.department,
		lines: d.items.filter((item) => !item.checked).map(line)
	}));
	const manual = manualItems.filter((m) => !m.checked).map((m) => m.text);
	if (manual.length > 0) {
		const other = groups.find((g) => g.department === 'other');
		if (other) other.lines.push(...manual);
		else groups.push({ department: 'other', lines: manual });
	}
	const filled = groups.filter((g) => g.lines.length > 0);
	const sections = filled.map((g) => [DEPARTMENT_LABELS[locale][g.department], ...g.lines.map((l) => `• ${l}`)].join('\n'));
	return { text: [TITLE[locale](list.mealCount), ...sections].join('\n\n'), lines: filled.flatMap((g) => g.lines) };
}
