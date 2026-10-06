import { LOCALES, type DemoDatabase, type Locale, type RecipeContent } from './types';

// Shared recipe checks (spec section 8): the same rules for the web form, MCP and the import.
// Saving a draft checks only the data given; publishing applies every rule.

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 600;
export const QUANTITY_TEXT_MAX = 40;

export type IssueField = 'name' | 'description' | 'sourceUrl' | 'bookId' | 'bookPages' | 'durationMinutes' | 'baseServings' | 'ingredients';

/**
 * required: missing for publication; translation_missing: the English (or Italian) text is missing;
 * the other codes are invalid data, refused even in a draft.
 */
export type IssueCode =
	| 'required'
	| 'translation_missing'
	| 'too_long'
	| 'invalid_url'
	| 'not_positive_integer'
	| 'unknown_book'
	| 'unknown_ingredient'
	| 'duplicate_ingredient'
	| 'invalid_amount';

export interface ValidationIssue {
	field: IssueField;
	code: IssueCode;
	locale?: Locale;
	/** Ingredient line, from 0, and which part of it: the catalogue ingredient or the quantity. */
	line?: number;
	part?: 'ingredient' | 'quantity';
}

/** What a draft still lacks, in short (list of drafts, recipe card). */
export type MissingData = 'names' | 'source' | 'details' | 'baseServings' | 'ingredients' | 'translation' | 'invalid';

const filled = (text: string | null | undefined) => !!text && text.trim().length > 0;

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

const positiveInteger = (n: number | null) => n === null || (Number.isInteger(n) && n > 0);

/** Problems in the data present: they block even saving a draft. */
export function validateForSave(db: DemoDatabase, content: RecipeContent): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	if (!LOCALES.some((l) => filled(content.name[l]))) issues.push({ field: 'name', code: 'required' });
	for (const locale of LOCALES) {
		if ((content.name[locale]?.length ?? 0) > NAME_MAX) issues.push({ field: 'name', code: 'too_long', locale });
		if ((content.description[locale]?.length ?? 0) > DESCRIPTION_MAX) issues.push({ field: 'description', code: 'too_long', locale });
	}
	if (content.sourceUrl && !isHttpUrl(content.sourceUrl)) issues.push({ field: 'sourceUrl', code: 'invalid_url' });
	if (content.bookId && !db.books.some((b) => b.id === content.bookId)) issues.push({ field: 'bookId', code: 'unknown_book' });
	if (!positiveInteger(content.durationMinutes)) issues.push({ field: 'durationMinutes', code: 'not_positive_integer' });
	if (!positiveInteger(content.baseServings)) issues.push({ field: 'baseServings', code: 'not_positive_integer' });
	const seen = new Set<string>();
	content.ingredients.forEach((line, index) => {
		if (!db.ingredients.some((i) => i.id === line.ingredientId)) issues.push({ field: 'ingredients', code: 'unknown_ingredient', line: index, part: 'ingredient' });
		else if (seen.has(line.ingredientId)) issues.push({ field: 'ingredients', code: 'duplicate_ingredient', line: index, part: 'ingredient' });
		seen.add(line.ingredientId);
		// A draft may leave an amount empty (null); a number must be above zero.
		if (line.quantity.kind === 'amount' && line.quantity.value != null && !(Number.isFinite(line.quantity.value) && line.quantity.value > 0))
			issues.push({ field: 'ingredients', code: 'invalid_amount', line: index, part: 'quantity' });
		for (const locale of LOCALES)
			if ((line.text?.[locale]?.length ?? 0) > QUANTITY_TEXT_MAX) issues.push({ field: 'ingredients', code: 'too_long', line: index, part: 'quantity', locale });
	});
	return issues;
}

/** Every rule for entering the catalogue, checked again at publication. */
export function validateForPublish(db: DemoDatabase, content: RecipeContent): ValidationIssue[] {
	const issues = validateForSave(db, content).filter((i) => !(i.field === 'name' && i.code === 'required'));
	for (const locale of LOCALES) {
		const code = locale === 'it-IT' ? 'required' : 'translation_missing';
		if (!filled(content.name[locale])) issues.push({ field: 'name', code, locale });
		if (!filled(content.description[locale])) issues.push({ field: 'description', code, locale });
	}
	if ((content.sourceType === 'web' || content.sourceType === 'youtube') && !filled(content.sourceUrl)) issues.push({ field: 'sourceUrl', code: 'required' });
	if (content.sourceType === 'book') {
		if (!content.bookId) issues.push({ field: 'bookId', code: 'required' });
		if (!filled(content.bookPages)) issues.push({ field: 'bookPages', code: 'required' });
	}
	if (content.durationMinutes === null) issues.push({ field: 'durationMinutes', code: 'required' });
	if (content.baseServings === null) issues.push({ field: 'baseServings', code: 'required' });
	if (content.ingredients.length === 0) issues.push({ field: 'ingredients', code: 'required' });
	content.ingredients.forEach((line, index) => {
		const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
		if (ingredient && !filled(ingredient.name['en-GB'])) issues.push({ field: 'ingredients', code: 'translation_missing', line: index, part: 'ingredient', locale: 'en-GB' });
		if (line.quantity.kind === 'amount' && line.quantity.value == null) issues.push({ field: 'ingredients', code: 'required', line: index, part: 'quantity' });
		if (line.quantity.kind === 'text')
			for (const locale of LOCALES)
				if (!filled(line.text?.[locale])) issues.push({ field: 'ingredients', code: locale === 'it-IT' ? 'required' : 'translation_missing', line: index, part: 'quantity', locale });
	});
	return issues;
}

/** Short summary of the issues, in a stable order. */
export function summarize(issues: ValidationIssue[]): MissingData[] {
	const found = new Set<MissingData>();
	for (const issue of issues) {
		if (issue.code === 'translation_missing') found.add('translation');
		else if (issue.code !== 'required') found.add('invalid');
		else if (issue.field === 'name' || issue.field === 'description') found.add('names');
		else if (issue.field === 'sourceUrl' || issue.field === 'bookId' || issue.field === 'bookPages') found.add('source');
		else if (issue.field === 'durationMinutes') found.add('details');
		else if (issue.field === 'baseServings') found.add('baseServings');
		else found.add('ingredients');
	}
	const order: MissingData[] = ['names', 'source', 'details', 'baseServings', 'ingredients', 'translation', 'invalid'];
	return order.filter((m) => found.has(m));
}
