import { recipeDraftSchema, type CatalogueLookup, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import type { UnitEquivalenceRow } from './convert.ts';

export interface DraftRow {
	id: string;
	recipeId: string;
	kind: 'new' | 'revision';
	baseVersion: number | null;
	content: RecipeDraftDocument;
	revision: number;
	createdBy: string | null;
	createdAt: Date;
	updatedBy: string | null;
	updatedAt: Date;
	closedAt: Date | null;
	closedBy: string | null;
	outcome: 'published' | 'discarded' | null;
	recipeStatus: 'draft' | 'published' | 'archived';
	recipeVersion: number;
}

interface DraftRecord {
	id: string;
	recipe_id: string;
	kind: 'new' | 'revision';
	base_version: number | null;
	content: unknown;
	revision: number;
	created_by: string | null;
	created_at: Date;
	updated_by: string | null;
	updated_at: Date;
	closed_at: Date | null;
	closed_by: string | null;
	outcome: 'published' | 'discarded' | null;
	status: 'draft' | 'published' | 'archived';
	recipe_version: number;
}

/** A stored draft may come from the import or an older server: kept as it is, its problems come from the checks. */
const parseContent = (content: unknown): RecipeDraftDocument => {
	const parsed = recipeDraftSchema.safeParse(content);
	return parsed.success ? parsed.data : (content as RecipeDraftDocument);
};

/** The draft with its recipe's status and version; `lock` holds both rows until the end of the transaction. */
export async function loadDraftRow(tx: Tx, draftId: string, options: { lock?: boolean } = {}): Promise<DraftRow | null> {
	const rows = options.lock
		? await tx<DraftRecord[]>`
			select d.*, r.status, r.version as recipe_version from app.recipe_drafts d join app.recipes r on r.id = d.recipe_id
			where d.id = ${draftId} for update of d, r`
		: await tx<DraftRecord[]>`
			select d.*, r.status, r.version as recipe_version from app.recipe_drafts d join app.recipes r on r.id = d.recipe_id
			where d.id = ${draftId}`;
	const row = rows[0];
	if (!row) return null;
	return {
		id: row.id,
		recipeId: row.recipe_id,
		kind: row.kind,
		baseVersion: row.base_version,
		content: parseContent(row.content),
		revision: row.revision,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at,
		closedAt: row.closed_at,
		closedBy: row.closed_by,
		outcome: row.outcome,
		recipeStatus: row.status,
		recipeVersion: row.recipe_version,
	};
}

/** Lists travel as JSON text (fetch_types is off), as in the recipe views. */
export const idList = (values: readonly (string | null | undefined)[]) =>
	JSON.stringify([...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))]);

const linesOf = (document: RecipeDraftDocument) => (Array.isArray(document.ingredients) ? document.ingredients : []);

/** Facts the domain checks need about the ingredients and the book a document cites. */
export async function loadLookup(tx: Tx, document: RecipeDraftDocument): Promise<CatalogueLookup> {
	const ingredients = await tx<{ id: string; english: string }[]>`
		select i.id, coalesce(i.name ->> 'en-GB', '') as english from app.ingredients i
		where i.archived_at is null and i.id::text in (select jsonb_array_elements_text(${idList(linesOf(document).map((l) => l?.ingredientId))}::text::jsonb))`;
	const books = await tx<{ id: string }[]>`
		select b.id from app.books b
		where b.archived_at is null and b.id::text in (select jsonb_array_elements_text(${idList([typeof document.bookId === 'string' ? document.bookId : null])}::text::jsonb))`;
	const english = new Map(ingredients.map((i) => [i.id, i.english.trim() !== '']));
	const bookIds = new Set(books.map((b) => b.id));
	return {
		hasIngredient: (id) => english.has(id),
		ingredientHasEnglishName: (id) => english.get(id) === true,
		hasBook: (id) => bookIds.has(id),
	};
}

export async function loadRecipeEquivalences(tx: Tx, ingredientIds: readonly (string | null | undefined)[]): Promise<Map<string, UnitEquivalenceRow[]>> {
	const rows = await tx<{ id: string; ingredient_id: string; from_unit: string; to_unit: string; factor: string | number; preparation: string | null; source: string }[]>`
		select id, ingredient_id, from_unit, to_unit, factor, preparation, source from app.ingredient_unit_equivalences
		where scope = 'recipe' and ingredient_id::text in (select jsonb_array_elements_text(${idList(ingredientIds)}::text::jsonb))`;
	const map = new Map<string, UnitEquivalenceRow[]>();
	for (const r of rows) {
		const list = map.get(r.ingredient_id) ?? [];
		list.push({
			id: r.id,
			ingredientId: r.ingredient_id,
			fromUnit: r.from_unit as UnitEquivalenceRow['fromUnit'],
			toUnit: r.to_unit as UnitEquivalenceRow['toUnit'],
			factor: Number(r.factor),
			scope: 'recipe',
			preparation: r.preparation,
			source: r.source,
		});
		map.set(r.ingredient_id, list);
	}
	return map;
}

/** Display names of the catalogue's authors, readable by curators only. */
export async function loadAuthors(tx: Tx): Promise<Map<string, string>> {
	const rows = await tx<{ user_id: string; display_name: string }[]>`select user_id, display_name from app.catalogue_author_names()`;
	return new Map(rows.map((r) => [r.user_id, r.display_name]));
}

/** Whether a meal of any family cites the recipe (curators do not see other families' meals). */
export async function isCited(tx: Tx, recipeId: string): Promise<boolean> {
	const [row] = await tx<{ cited: boolean }[]>`select app.recipe_is_cited(${recipeId}) as cited`;
	return row?.cited ?? false;
}
