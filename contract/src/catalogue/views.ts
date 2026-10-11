import { MISSING_DATA, publishedRecipeSchema, recipeDraftSchema } from '@app/domain/recipe';
import { DEPARTMENTS } from '@app/domain/shopping';
import { quantitySchema, UNIT_CODES } from '@app/domain/units';
import { z } from 'zod';
import { ingredientLineView, recipeSummaryView } from '../recipes/views.ts';

/** Views of recipe-book management (curators; spec section 8). */
export const issueView = z.object({ path: z.array(z.union([z.string(), z.number()])), code: z.string() });
/** null: the person left the app. */
export const authorView = z.object({ userId: z.uuid().nullable(), name: z.string().nullable() });
const instant = z.iso.datetime();
const missing = z.array(z.enum(MISSING_DATA));
const draftKind = z.enum(['new', 'revision']);
/** Texts as stored: a missing English name is the empty string. */
const plainLocalized = z.object({ 'it-IT': z.string(), 'en-GB': z.string() });

export const conversionView = z.object({
	line: z.number().int().min(0),
	from: quantitySchema,
	to: quantitySchema,
	equivalence: z.object({ id: z.uuid(), factor: z.number().positive(), source: z.string(), preparation: z.string().nullable() }),
});

export const draftSummaryView = z.object({
	draftId: z.uuid(),
	recipeId: z.uuid(),
	kind: draftKind,
	name: z.string(),
	createdBy: authorView,
	updatedBy: authorView,
	updatedAt: instant,
	missing,
});
export const archivedSummaryView = z.object({ recipeId: z.uuid(), name: z.string(), archivedBy: authorView, archivedAt: instant });
export const overviewView = z.object({ drafts: z.array(draftSummaryView), archived: z.array(archivedSummaryView) });

export const draftView = z.object({
	draftId: z.uuid(),
	recipeId: z.uuid(),
	kind: draftKind,
	revision: z.number().int().min(1),
	/** As saved: an imported draft may not match the current schema, its problems say why. */
	content: recipeDraftSchema.or(z.record(z.string(), z.unknown())),
	createdBy: authorView,
	createdAt: instant,
	updatedBy: authorView,
	updatedAt: instant,
	/** Revision: the version it started from. */
	baseVersion: z.number().int().min(1).nullable(),
	/** The version published now (0: never). */
	currentVersion: z.number().int().min(0),
	recipeStatus: z.enum(['draft', 'published', 'archived']),
	/** Publication problems after the US-cup conversions. */
	issues: z.array(issueView),
	missing,
	conversions: z.array(conversionView),
	/** A closed draft: how it was closed. */
	outcome: z.enum(['published', 'discarded']).nullable(),
	canDiscard: z.boolean(),
	/** Names of the cited ingredients, in the caller's language. */
	ingredientNames: z.record(z.string(), z.string()),
	bookTitle: z.string().nullable(),
});
export const checkView = z.object({ revision: z.number().int().min(1), issues: z.array(issueView), missing, conversions: z.array(conversionView) });
export const publishedView = z.object({ recipeId: z.uuid(), version: z.number().int().min(1), conversions: z.array(conversionView) });

export const recipeMatchView = z.object({
	recipeId: z.uuid(),
	name: z.string(),
	status: z.enum(['published', 'archived']),
	version: z.number().int().min(1),
	updatedAt: instant,
});
export const statusView = z.object({ recipeId: z.uuid(), status: z.enum(['published', 'archived']), changedBy: authorView, changedAt: instant });
export const versionListView = z.object({
	recipeId: z.uuid(),
	name: z.string(),
	status: z.enum(['published', 'archived']),
	current: z.number().int().min(1),
	versions: z.array(
		z.object({
			version: z.number().int().min(1),
			publishedBy: authorView,
			publishedAt: instant,
			channel: z.enum(['web', 'mcp', 'import']),
			restoredFrom: z.number().int().nullable(),
		}),
	),
});
export const versionDetailView = z.object({
	recipeId: z.uuid(),
	version: z.number().int().min(1),
	current: z.number().int().min(1),
	publishedBy: authorView,
	publishedAt: instant,
	restoredFrom: z.number().int().nullable(),
	content: publishedRecipeSchema,
	summary: recipeSummaryView,
	ingredients: z.array(ingredientLineView),
	/** The problems a restore would meet today. */
	issues: z.array(issueView),
});
export const restoredView = z.object({ recipeId: z.uuid(), version: z.number().int().min(1), restoredFrom: z.number().int().min(1) });

export const synonymsSchema = z.object({
	'it-IT': z.array(z.string().trim().min(1).max(80)).max(20),
	'en-GB': z.array(z.string().trim().min(1).max(80)).max(20),
});
export const departmentSchema = z.enum(DEPARTMENTS);
export const unitCodeSchema = z.enum(UNIT_CODES);
export const equivalenceView = z.object({
	id: z.uuid(),
	fromUnit: unitCodeSchema,
	toUnit: unitCodeSchema,
	factor: z.number().positive(),
	preparation: z.string().nullable(),
	source: z.string(),
});
export const ingredientView = z.object({
	ingredientId: z.uuid(),
	slug: z.string(),
	name: plainLocalized,
	synonyms: z.object({ 'it-IT': z.array(z.string()), 'en-GB': z.array(z.string()) }),
	department: departmentSchema,
	isPantry: z.boolean(),
	version: z.number().int().min(1),
	/** Recipe equivalences only. */
	equivalences: z.array(equivalenceView),
});
export const ingredientMatchView = z.object({
	ingredientId: z.uuid(),
	name: z.string(),
	department: departmentSchema,
	isPantry: z.boolean(),
	variety: plainLocalized.nullable(),
	matched: z.enum(['name', 'synonym', 'variety']),
});
export const varietyHintView = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('existing_spelling'), suggestion: plainLocalized }),
	z.object({ kind: z.literal('repeats_ingredient'), suggestion: z.string() }),
	z.object({ kind: z.literal('preparation') }),
]);
export const bookView = z.object({ bookId: z.uuid(), slug: z.string(), title: z.string(), archived: z.boolean() });

export type AuthorView = z.infer<typeof authorView>;
export type DraftView = z.infer<typeof draftView>;
export type DraftSummaryView = z.infer<typeof draftSummaryView>;
export type ArchivedSummaryView = z.infer<typeof archivedSummaryView>;
export type OverviewView = z.infer<typeof overviewView>;
export type ConversionView = z.infer<typeof conversionView>;
export type CheckView = z.infer<typeof checkView>;
export type RecipeMatchView = z.infer<typeof recipeMatchView>;
export type StatusView = z.infer<typeof statusView>;
export type IngredientView = z.infer<typeof ingredientView>;
export type IngredientMatchView = z.infer<typeof ingredientMatchView>;
export type VersionListView = z.infer<typeof versionListView>;
export type VersionDetailView = z.infer<typeof versionDetailView>;
export type BookView = z.infer<typeof bookView>;
