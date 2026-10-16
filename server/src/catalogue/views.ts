import type { ArchivedSummaryView, AuthorView, DraftSavesView, DraftSaveView, DraftSummaryView, DraftView, OverviewView, RecipeMatchView, VersionDetailView, VersionListView } from '@app/contract';
import { checkPublishable, missingData, publishedRecipeSchema, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Locale } from '@app/domain/units';
import { z } from 'zod';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { foldText } from '../family/views.ts';
import { ingredientLinesView, loadBookTitlesById, loadIngredientNamesById, summaryOf } from '../recipes/views.ts';
import { publicationCheck } from './check.ts';
import { isCited, loadAuthors, loadLookup, parseContent, type DraftRow } from './load.ts';
import { photoUrl } from './photos/key.ts';

export const authorOf = (authors: Map<string, string>, userId: string | null): AuthorView => ({
	userId,
	name: userId ? (authors.get(userId) ?? null) : null,
});

/** The caller's language, otherwise the other one (W6's rule for the names of drafts). */
export function localText(text: Partial<Record<Locale, string | null>> | null | undefined, locale: Locale): string {
	const other: Locale = locale === 'it-IT' ? 'en-GB' : 'it-IT';
	const pick = (l: Locale) => (typeof text?.[l] === 'string' ? (text[l] as string).trim() : '');
	return pick(locale) || pick(other);
}

/** Catalogue ids only: an imported draft may still hold slugs, which the checks report as unknown. */
const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;

const citedIngredients = (content: RecipeDraftDocument) =>
	[...new Set((Array.isArray(content.ingredients) ? content.ingredients : []).map((l) => l?.ingredientId).filter(isId))];

/** Storage keys of the current photos of the recipes (W12). */
async function currentPhotoKeys(tx: Tx, recipeIds: string[]): Promise<Map<string, string>> {
	if (!recipeIds.length) return new Map();
	const rows = await tx<{ recipe_id: string; storage_key: string }[]>`
		select recipe_id, storage_key from app.recipe_photos
		where removed_at is null and recipe_id in (select jsonb_array_elements_text(${JSON.stringify(recipeIds)}::text::jsonb)::uuid)`;
	return new Map(rows.map((row) => [row.recipe_id, row.storage_key]));
}

/** `origin`: absolute URLs for agents. */
export async function draftViewOf(tx: Tx, row: DraftRow, locale: Locale, origin?: string): Promise<DraftView> {
	const { issues, conversions } = await publicationCheck(tx, row.content);
	const authors = await loadAuthors(tx);
	const ingredientIds = citedIngredients(row.content);
	const names = await loadIngredientNamesById(tx, ingredientIds);
	const bookId = isId(row.content.bookId) ? row.content.bookId : null;
	const titles = await loadBookTitlesById(tx, [bookId]);
	const canDiscard = row.closedAt === null && (row.kind === 'revision' || !(await isCited(tx, row.recipeId)));
	return {
		draftId: row.id,
		recipeId: row.recipeId,
		kind: row.kind,
		revision: row.revision,
		content: row.content,
		createdBy: authorOf(authors, row.createdBy),
		createdAt: row.createdAt.toISOString(),
		updatedBy: authorOf(authors, row.updatedBy),
		updatedAt: row.updatedAt.toISOString(),
		baseVersion: row.baseVersion,
		currentVersion: row.recipeVersion,
		recipeStatus: row.recipeStatus,
		issues,
		missing: missingData(issues),
		conversions,
		outcome: row.outcome,
		canDiscard,
		ingredientNames: Object.fromEntries(ingredientIds.filter((id) => names.has(id)).map((id) => [id, localText(names.get(id), locale)])),
		bookTitle: bookId ? (titles.get(bookId) ?? null) : null,
		photoUrl: photoOf(await currentPhotoKeys(tx, [row.recipeId]), row.recipeId, origin),
	};
}

function photoOf(keys: Map<string, string>, recipeId: string, origin: string | undefined): string | null {
	const key = keys.get(recipeId);
	return key ? photoUrl(key, origin) : null;
}

interface SaveRecord {
	revision: number;
	content: unknown;
	saved_by: string | null;
	saved_at: Date;
	channel: 'web' | 'mcp' | 'import';
	overwritten: boolean;
}
const saveSummaryOf = (authors: Map<string, string>, s: SaveRecord) => ({
	revision: s.revision,
	savedBy: authorOf(authors, s.saved_by),
	savedAt: s.saved_at.toISOString(),
	channel: s.channel,
	overwritten: s.overwritten,
});

/** The saves of a draft, open or closed, newest first: where an overwritten save is found again. */
export async function draftSaves(tx: Tx, row: DraftRow): Promise<DraftSavesView> {
	const saves = await tx<SaveRecord[]>`
		select revision, saved_by, saved_at, channel, overwritten from app.recipe_draft_saves where draft_id = ${row.id} order by revision desc`;
	const authors = await loadAuthors(tx);
	return {
		draftId: row.id,
		recipeId: row.recipeId,
		kind: row.kind,
		revision: row.revision,
		outcome: row.outcome,
		saves: saves.map((s) => saveSummaryOf(authors, s)),
	};
}

export async function draftSave(tx: Tx, draftId: string, revision: number): Promise<DraftSaveView> {
	const [save] = await tx<SaveRecord[]>`
		select revision, content, saved_by, saved_at, channel, overwritten from app.recipe_draft_saves where draft_id = ${draftId} and revision = ${revision}`;
	if (!save) throw appError('not_found');
	return { draftId, ...saveSummaryOf(await loadAuthors(tx), save), content: parseContent(save.content) };
}

/** Open drafts, most recent first, and archived recipes by name: the curator's sections of the recipe book. */
export async function overview(tx: Tx, locale: Locale): Promise<OverviewView> {
	const drafts = await tx<{ id: string; recipe_id: string; kind: 'new' | 'revision'; content: RecipeDraftDocument; created_by: string | null; updated_by: string | null; updated_at: Date }[]>`
		select id, recipe_id, kind, content, created_by, updated_by, updated_at from app.recipe_drafts where closed_at is null`;
	const archived = await tx<{ id: string; name: Record<Locale, string>; archived_by: string | null; archived_at: Date | null; updated_at: Date }[]>`
		select id, name, archived_by, archived_at, updated_at from app.recipes where status = 'archived'`;
	const authors = await loadAuthors(tx);
	const draftViews: DraftSummaryView[] = [];
	for (const d of drafts) {
		const { issues } = await publicationCheck(tx, d.content);
		draftViews.push({
			draftId: d.id,
			recipeId: d.recipe_id,
			kind: d.kind,
			name: localText(d.content?.name, locale),
			createdBy: authorOf(authors, d.created_by),
			updatedBy: authorOf(authors, d.updated_by),
			updatedAt: d.updated_at.toISOString(),
			missing: missingData(issues),
		});
	}
	draftViews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, locale));
	const archivedViews: ArchivedSummaryView[] = archived
		.map((r) => ({
			recipeId: r.id,
			name: localText(r.name, locale),
			archivedBy: authorOf(authors, r.archived_by),
			archivedAt: (r.archived_at ?? r.updated_at).toISOString(),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, locale));
	return { drafts: draftViews, archived: archivedViews };
}

/** The curator's search of the whole catalogue (no family, no owned books): published and archived, never drafts. */
export async function searchCatalogueRecipes(
	tx: Tx,
	query: { text: string; status: 'published' | 'archived' | 'any' },
	locale: Locale,
	origin?: string,
): Promise<{ items: RecipeMatchView[] }> {
	const rows = await tx<{ id: string; name: Record<Locale, string>; description: Record<Locale, string> | null; status: 'published' | 'archived'; version: number; updated_at: Date }[]>`
		select id, name, description, status, version, updated_at from app.recipes
		where status <> 'draft' and (${query.status} = 'any' or status = ${query.status})`;
	const needle = foldText(query.text);
	const items = rows
		.map((r) => ({ row: r, name: localText(r.name, locale), description: localText(r.description, locale) }))
		.filter(({ name, description }) => !needle || foldText(name).includes(needle) || foldText(description).includes(needle))
		.sort((a, b) => a.name.localeCompare(b.name, locale))
		.slice(0, 50);
	const keys = await currentPhotoKeys(tx, items.map(({ row }) => row.id));
	return {
		items: items.map(({ row, name }) => ({
			recipeId: row.id,
			name,
			status: row.status,
			version: row.version,
			updatedAt: row.updated_at.toISOString(),
			photoUrl: photoOf(keys, row.id, origin),
		})),
	};
}

export async function versionList(tx: Tx, recipeId: string, locale: Locale): Promise<VersionListView> {
	const [recipe] = await tx<{ status: 'draft' | 'published' | 'archived'; version: number; name: Record<Locale, string> }[]>`
		select status, version, name from app.recipes where id = ${recipeId}`;
	if (!recipe || recipe.status === 'draft') throw appError('not_found');
	const rows = await tx<{ version: number; published_by: string | null; published_at: Date; channel: 'web' | 'mcp' | 'import'; restored_from: number | null }[]>`
		select version, published_by, published_at, channel, restored_from from app.recipe_versions where recipe_id = ${recipeId} order by version desc`;
	const authors = await loadAuthors(tx);
	return {
		recipeId,
		name: localText(recipe.name, locale),
		status: recipe.status,
		current: recipe.version,
		versions: rows.map((r) => ({
			version: r.version,
			publishedBy: authorOf(authors, r.published_by),
			publishedAt: r.published_at.toISOString(),
			channel: r.channel,
			restoredFrom: r.restored_from,
		})),
	};
}

/** A version as it was, at its base servings in metric, with the problems a restore would meet today. */
export async function versionDetail(tx: Tx, recipeId: string, version: number, locale: Locale): Promise<VersionDetailView> {
	const list = await versionList(tx, recipeId, locale);
	const item = list.versions.find((v) => v.version === version);
	const [row] = await tx<{ content: unknown }[]>`select content from app.recipe_versions where recipe_id = ${recipeId} and version = ${version}`;
	if (!item || !row) throw appError('not_found');
	const content = publishedRecipeSchema.parse(row.content);
	const issues = checkPublishable(content, await loadLookup(tx, content as RecipeDraftDocument));
	const names = await loadIngredientNamesById(tx, [...new Set(content.ingredients.map((l) => l.ingredientId))]);
	const titles = await loadBookTitlesById(tx, [content.bookId]);
	const summary = summaryOf(
		{
			recipeId,
			status: list.status,
			version,
			name: content.name,
			description: content.description,
			durationMinutes: content.durationMinutes,
			sourceType: content.sourceType,
			sourceUrl: content.sourceUrl,
			bookId: content.bookId,
			bookPages: content.bookPages,
			mealType: content.mealType,
			proteinGroup: content.proteinGroup,
			baseServings: content.baseServings,
			lines: content.ingredients,
			// A past version: the curator compares documents, the photo is not part of them.
			photoUrl: null,
		},
		titles,
		locale,
	);
	const ingredients = ingredientLinesView(content.ingredients, names, { servings: content.baseServings, baseServings: content.baseServings, system: 'metric', locale });
	return {
		recipeId,
		version,
		current: list.current,
		publishedBy: item.publishedBy,
		publishedAt: item.publishedAt,
		restoredFrom: item.restoredFrom,
		content,
		summary,
		ingredients,
		issues,
	};
}
