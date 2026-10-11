import { LOCALES } from '../units/index.ts';
import { LIMITS, PLANNER_ATTRIBUTES, publishedRecipeSchema, recipeDraftSchema, type RecipeDocument, type RecipeDraftDocument } from './document.ts';
import { issuesFromZod, type IssueCode, type IssuePath, type ValidationIssue } from './issues.ts';
import { filled, textOrNull, type DraftTranslated } from './localized.ts';
import { comparableVariety, lineKey } from './variety.ts';

// Shared recipe checks (spec section 8): the same rules for MCP, the curators' form and the import.

/** Catalogue facts the checks need, given by the caller so that domain/ stays pure. */
export interface CatalogueLookup {
	hasIngredient(id: string): boolean;
	ingredientHasEnglishName(id: string): boolean;
	hasBook(id: string): boolean;
}

export type Add = (code: IssueCode, ...path: IssuePath) => void;

/** Host of an http(s) address, lower case; null otherwise. No URL global: domain/ has no DOM or Node types. */
export function httpUrlHost(value: string): string | null {
	const match = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#][^\s]*)?$/i.exec(value.trim());
	return match ? match[1].toLowerCase() : null;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function checkLength(add: Add, value: DraftTranslated | null | undefined, max: number, ...path: IssuePath) {
	for (const locale of LOCALES) if ((value?.[locale]?.length ?? 0) > max) add('too_long', ...path, locale);
}

function checkWholeNumber(add: Add, value: number | null | undefined, max: number, field: string) {
	if (value != null && !(Number.isInteger(value) && value > 0 && value <= max)) add('not_positive_integer', field);
}

/** Wrong data in what is present; also the base of the publication check. */
export function draftIssues(document: RecipeDraftDocument, lookup: CatalogueLookup): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const add: Add = (code, ...path) => issues.push({ code, path });
	if (!LOCALES.some((l) => filled(document.name[l]))) add('required', 'name');
	checkLength(add, document.name, LIMITS.name, 'name');
	checkLength(add, document.description, LIMITS.description, 'description');
	if (filled(document.sourceUrl)) {
		const host = httpUrlHost(document.sourceUrl);
		if (!host || (document.sourceType === 'youtube' && !YOUTUBE_HOSTS.has(host))) add('invalid_url', 'sourceUrl');
	}
	if (filled(document.bookId) && !lookup.hasBook(document.bookId)) add('unknown_book', 'bookId');
	if ((document.bookPages?.length ?? 0) > LIMITS.bookPages) add('too_long', 'bookPages');
	checkWholeNumber(add, document.durationMinutes, LIMITS.durationMinutes, 'durationMinutes');
	checkWholeNumber(add, document.baseServings, LIMITS.baseServings, 'baseServings');

	let primaries = 0;
	(document.ingredients ?? []).forEach((line, index) => {
		if (line.ingredientId !== null && !lookup.hasIngredient(line.ingredientId)) add('unknown_ingredient', 'ingredients', index, 'ingredientId');
		if (line.isPrimary && ++primaries > 1) add('multiple_primary', 'ingredients', index, 'isPrimary');
		const q = line.quantity;
		if (q.kind === 'amount' && q.value !== null && !(Number.isFinite(q.value) && q.value > 0)) add('invalid_amount', 'ingredients', index, 'quantity', 'value');
		if (q.kind === 'text') checkLength(add, q.text, LIMITS.quantityText, 'ingredients', index, 'quantity', 'text');
		checkLength(add, line.variety, LIMITS.variety, 'ingredients', index, 'variety');
		checkLength(add, line.preparation, LIMITS.preparation, 'ingredients', index, 'preparation');
		if (line.sourceText.length > LIMITS.sourceText) add('too_long', 'ingredients', index, 'sourceText');
	});
	return issues;
}

/** Saving a draft (spec section 8): refuses wrong data, accepts what is still missing. */
export function checkDraft(input: unknown, lookup: CatalogueLookup): ValidationIssue[] {
	const parsed = recipeDraftSchema.safeParse(input);
	return parsed.success ? draftIssues(parsed.data, lookup) : issuesFromZod(parsed.error);
}

/** Both languages present, or nothing: `required` without any text, `translation_missing` for the missing one. */
function checkTranslated(add: Add, value: DraftTranslated | null | undefined, optional: boolean, ...path: IssuePath) {
	const present = LOCALES.filter((l) => filled(value?.[l]));
	if (present.length === LOCALES.length) return;
	if (present.length === 0) {
		if (!optional) add('required', ...path);
		return;
	}
	for (const locale of LOCALES) if (!present.includes(locale)) add('translation_missing', ...path, locale);
}

function checkSource(add: Add, d: RecipeDraftDocument) {
	const notApplicable = (field: 'sourceUrl' | 'bookId' | 'bookPages') => {
		if (filled(d[field])) add('not_applicable', field);
	};
	if (!d.sourceType) {
		add('required', 'sourceType');
		return;
	}
	if (d.sourceType === 'web' || d.sourceType === 'youtube') {
		if (!filled(d.sourceUrl)) add('required', 'sourceUrl');
		notApplicable('bookId');
		notApplicable('bookPages');
	} else if (d.sourceType === 'book') {
		if (!filled(d.bookId)) add('required', 'bookId');
		if (!filled(d.bookPages)) add('required', 'bookPages');
		notApplicable('sourceUrl');
	} else {
		notApplicable('sourceUrl');
		notApplicable('bookId');
		notApplicable('bookPages');
	}
}

/** Publication (spec section 8): every rule, checked again by the server in every channel. */
export function checkPublishable(input: unknown, lookup: CatalogueLookup): ValidationIssue[] {
	const parsed = recipeDraftSchema.safeParse(input);
	if (!parsed.success) return issuesFromZod(parsed.error);
	const d = parsed.data;
	const issues = draftIssues(d, lookup).filter((i) => !(i.code === 'required' && i.path.length === 1 && i.path[0] === 'name'));
	const add: Add = (code, ...path) => issues.push({ code, path });
	checkTranslated(add, d.name, false, 'name');
	checkTranslated(add, d.description, false, 'description');
	checkSource(add, d);
	if (d.durationMinutes == null) add('required', 'durationMinutes');
	if (d.baseServings == null) add('required', 'baseServings');
	for (const field of PLANNER_ATTRIBUTES) if (d[field] == null) add('required', field);
	if (d.isFreshFish === true && d.proteinGroup != null && d.proteinGroup !== 'fish') add('invalid_value', 'isFreshFish');
	const lines = d.ingredients ?? [];
	if (lines.length === 0) add('required', 'ingredients');
	const seen = new Set<string>();
	lines.forEach((line, index) => {
		if (line.ingredientId === null) add('required', 'ingredients', index, 'ingredientId');
		else {
			if (lookup.hasIngredient(line.ingredientId) && !lookup.ingredientHasEnglishName(line.ingredientId))
				add('translation_missing', 'ingredients', index, 'ingredientId');
			// Duplicates only among lines whose variety identity is known (review of 11 October 2026).
			if (comparableVariety(line.variety)) {
				const key = lineKey({ ingredientId: line.ingredientId, variety: line.variety });
				if (seen.has(key)) add('duplicate_ingredient', 'ingredients', index, 'ingredientId');
				seen.add(key);
			}
		}
		if (!filled(line.sourceText)) add('required', 'ingredients', index, 'sourceText');
		const q = line.quantity;
		if (q.kind === 'amount' && q.value === null) add('required', 'ingredients', index, 'quantity', 'value');
		if (q.kind === 'amount' && q.unit === 'us_cup') add('unit_not_publishable', 'ingredients', index, 'quantity', 'unit');
		if (q.kind === 'text') checkTranslated(add, q.text, false, 'ingredients', index, 'quantity', 'text');
		checkTranslated(add, line.variety, true, 'ingredients', index, 'variety');
		checkTranslated(add, line.preparation, true, 'ingredients', index, 'preparation');
	});
	return issues;
}

const emptyToNull = (v: DraftTranslated | null | undefined) => (v && LOCALES.some((l) => filled(v[l])) ? v : null);

/**
 * Narrows a document that passed checkPublishable. Absent fields become their published form first
 * (blank or missing source fields null, seasons empty, empty varieties and preparations null), so the invariant holds:
 * no publication problem ⇒ conversion succeeds.
 */
export function toPublished(input: unknown): RecipeDocument {
	const d = recipeDraftSchema.parse(input);
	return publishedRecipeSchema.parse({
		...d,
		sourceUrl: textOrNull(d.sourceUrl),
		bookId: textOrNull(d.bookId),
		bookPages: textOrNull(d.bookPages),
		seasons: d.seasons ?? [],
		ingredients: (d.ingredients ?? []).map((l) => ({ ...l, variety: emptyToNull(l.variety), preparation: emptyToNull(l.preparation) }))
	});
}
