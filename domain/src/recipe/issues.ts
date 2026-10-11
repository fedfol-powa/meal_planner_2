import type * as z from 'zod';
import { PLANNER_ATTRIBUTES } from './document.ts';

export const ISSUE_CODES = [
	'invalid_value', 'too_long', 'invalid_url', 'not_positive_integer', 'invalid_amount', 'unknown_ingredient', 'unknown_book',
	'duplicate_ingredient', 'multiple_primary', 'required', 'translation_missing', 'not_applicable', 'unit_not_publishable'
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];
export type IssuePath = (string | number)[];

/** One problem of a recipe document, with the path of the field (contract error `invalid`). */
export interface ValidationIssue {
	path: IssuePath;
	code: IssueCode;
}

/** Wrong data, refused even when saving a draft; every other code only blocks publication. */
export const DRAFT_BLOCKING_CODES: readonly IssueCode[] = [
	'invalid_value', 'too_long', 'invalid_url', 'not_positive_integer', 'invalid_amount', 'unknown_ingredient', 'unknown_book', 'multiple_primary'
];

export const blocksDraft = (issue: ValidationIssue) => DRAFT_BLOCKING_CODES.includes(issue.code);

export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
	return error.issues.map((issue) => ({
		path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
		code: 'invalid_value'
	}));
}

/** What a draft still lacks, in short (draft cards, spec section 8). */
export const MISSING_DATA = ['names', 'source', 'details', 'attributes', 'baseServings', 'ingredients', 'translation', 'invalid'] as const;
export type MissingData = (typeof MISSING_DATA)[number];

const SOURCE_FIELDS = new Set(['sourceType', 'sourceUrl', 'bookId', 'bookPages']);
const ATTRIBUTE_FIELDS = new Set<string>([...PLANNER_ATTRIBUTES, 'seasons']);

function summaryOf(issue: ValidationIssue): MissingData {
	const field = String(issue.path[0] ?? '');
	if (issue.code === 'translation_missing') return 'translation';
	if (blocksDraft(issue)) return 'invalid';
	if (field === 'name' || field === 'description') return 'names';
	if (SOURCE_FIELDS.has(field)) return 'source';
	if (field === 'durationMinutes') return 'details';
	if (ATTRIBUTE_FIELDS.has(field)) return 'attributes';
	if (field === 'baseServings') return 'baseServings';
	return 'ingredients';
}

export function missingData(issues: ValidationIssue[]): MissingData[] {
	const found = new Set(issues.map(summaryOf));
	return MISSING_DATA.filter((m) => found.has(m));
}
