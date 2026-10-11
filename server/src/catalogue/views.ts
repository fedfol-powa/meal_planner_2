import type { ArchivedSummaryView, AuthorView, DraftSummaryView, DraftView, OverviewView } from '@app/contract';
import { missingData, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Locale } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { loadBookTitlesById, loadIngredientNamesById } from '../recipes/views.ts';
import { publicationCheck } from './check.ts';
import { isCited, loadAuthors, type DraftRow } from './load.ts';

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

const citedIngredients = (content: RecipeDraftDocument) =>
	[...new Set((Array.isArray(content.ingredients) ? content.ingredients : []).map((l) => l?.ingredientId).filter((id): id is string => typeof id === 'string'))];

export async function draftViewOf(tx: Tx, row: DraftRow, locale: Locale): Promise<DraftView> {
	const { issues, conversions } = await publicationCheck(tx, row.content);
	const authors = await loadAuthors(tx);
	const ingredientIds = citedIngredients(row.content);
	const names = await loadIngredientNamesById(tx, ingredientIds);
	const bookId = typeof row.content.bookId === 'string' ? row.content.bookId : null;
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
	};
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
