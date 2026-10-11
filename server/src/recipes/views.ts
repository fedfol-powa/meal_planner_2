import type { IngredientLineView, Locale, RatingSummaryView, RecipeSummaryView } from '@app/contract';
import { publishedRecipeSchema } from '@app/domain/recipe';
import type { Localized, MeasurementSystem } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { ingredientLinesView, type LineInput } from './lines.ts';

// Shared with the menu (W1): signatures fixed in section 1 of the spec of W6.
export { ingredientLinesView, type IngredientNames, type LineInput } from './lines.ts';

export interface RecipeRef {
	recipeId: string;
	/** A published version (also the current one), or null: the recipe as it is now. */
	version: number | null;
	/** Zero (allowed on a meal slot) shows the lines at the recipe's base servings. */
	servings: number;
}
export interface Viewer {
	familyId: string;
	userId: string;
	locale: Locale;
}
export interface RecipeView {
	summary: RecipeSummaryView;
	status: 'draft' | 'published' | 'archived';
	/** Version shown; 0 for a never-published recipe. */
	version: number;
	baseServings: number | null;
	ingredients: IngredientLineView[] | null;
	/** null for a never-published recipe: it cannot be rated (spec section 8). */
	rating: RatingSummaryView | null;
}

export const recipeViewKey = (ref: RecipeRef) => `${ref.recipeId}@${ref.version ?? 'now'}@${ref.servings}`;
export const contentKey = (ref: Pick<RecipeRef, 'recipeId' | 'version'>) => `${ref.recipeId}@${ref.version ?? 'now'}`;

/** Projections of a new draft may miss a language, or hold null. */
type PartialText = Partial<Record<Locale, string | null>> | null;
const OTHER: Record<Locale, Locale> = { 'it-IT': 'en-GB', 'en-GB': 'it-IT' };
/** The caller's language, else the other one. */
const pick = (text: PartialText, locale: Locale): string | null => text?.[locale] || text?.[OTHER[locale]] || null;

/** What a reference shows: the document of a published version, or a never-published recipe. */
export interface Content {
	recipeId: string;
	status: RecipeView['status'];
	version: number;
	name: PartialText;
	description: PartialText;
	durationMinutes: number | null;
	sourceType: RecipeSummaryView['sourceType'];
	sourceUrl: string | null;
	bookId: string | null;
	bookPages: string | null;
	mealType: RecipeSummaryView['mealType'];
	proteinGroup: RecipeSummaryView['proteinGroup'];
	baseServings: number | null;
	/** null for a never-published recipe. */
	lines: LineInput[] | null;
}

export async function loadFamily(tx: Tx, familyId: string): Promise<{ system: MeasurementSystem; timeZone: string }> {
	const [row] = await tx<{ system: MeasurementSystem; timeZone: string }[]>`
		select measurement_system as system, time_zone as "timeZone" from app.families where id = ${familyId}`;
	if (!row) throw appError('forbidden');
	return row;
}

/** Average of the family's current members, number of votes and userId's stars; keyed by recipe id. */
export async function ratingSummaries(tx: Tx, familyId: string, userId: string, recipeIds: string[]): Promise<Map<string, RatingSummaryView>> {
	const rows = await tx<{ recipeId: string; average: string | null; votes: number; mine: number | null }[]>`
		select w.id as "recipeId", s.average::text as average, coalesce(s.votes, 0)::int as votes, r.stars::int as mine
		from (select jsonb_array_elements_text(${JSON.stringify(recipeIds)}::text::jsonb)::uuid as id) w
		left join app.family_scores s on s.family_id = ${familyId} and s.recipe_id = w.id
		left join app.ratings r on r.user_id = ${userId} and r.recipe_id = w.id`;
	return new Map(
		rows.map((row) => [row.recipeId, { familyAverage: row.average === null ? null : Number(row.average), familyCount: row.votes, myStars: row.mine }]),
	);
}

const NEVER_PUBLISHED = {
	version: 0,
	durationMinutes: null,
	sourceType: null,
	sourceUrl: null,
	bookId: null,
	bookPages: null,
	mealType: null,
	proteinGroup: null,
	baseServings: null,
	lines: null,
} as const;

/**
 * Contents of the references, keyed by contentKey, from ONE statement: the recipe row and the
 * immutable document of the version asked (the current one for null). Read committed gives a
 * statement a single snapshot, so a concurrent publication cannot mix two versions (R1).
 * Recipes RLS hides, and versions that do not exist, are left out.
 */
export async function loadContents(tx: Tx, refs: Pick<RecipeRef, 'recipeId' | 'version'>[]): Promise<Map<string, Content>> {
	const wanted = [...new Map(refs.map((ref) => [contentKey(ref), ref])).values()];
	if (!wanted.length) return new Map();
	// Lists travel as JSON text: the connection does not fetch array types (fetch_types: false),
	// and a parameter typed jsonb would be encoded twice.
	const rows = await tx<
		{ recipeId: string; requested: number; status: RecipeView['status']; name: PartialText; description: PartialText; version: number | null; content: unknown }[]
	>`
		select r.id as "recipeId", coalesce(w.version, 0) as requested, r.status, r.name, r.description, v.version, v.content
		from jsonb_to_recordset(${JSON.stringify(wanted.map((ref) => ({ recipe_id: ref.recipeId, version: ref.version })))}::text::jsonb) as w(recipe_id uuid, version int)
		join app.recipes r on r.id = w.recipe_id
		left join app.recipe_versions v
			on v.recipe_id = r.id and v.version = coalesce(w.version, nullif(r.version, 0))`;
	const contents = new Map<string, Content>();
	for (const row of rows) {
		const key = contentKey({ recipeId: row.recipeId, version: row.requested || null });
		if (row.status === 'draft') {
			// Never published: name and description only; a draft has no version to ask for.
			if (!row.requested) contents.set(key, { recipeId: row.recipeId, status: 'draft', name: row.name, description: row.description, ...NEVER_PUBLISHED });
			continue;
		}
		if (row.version === null || row.content === null) continue;
		const d = publishedRecipeSchema.parse(row.content);
		contents.set(key, {
			recipeId: row.recipeId,
			status: row.status,
			version: row.version,
			name: d.name,
			description: d.description,
			durationMinutes: d.durationMinutes,
			sourceType: d.sourceType,
			sourceUrl: d.sourceUrl,
			bookId: d.bookId,
			bookPages: d.bookPages,
			mealType: d.mealType,
			proteinGroup: d.proteinGroup,
			baseServings: d.baseServings,
			lines: d.ingredients.map((l) => ({ ingredientId: l.ingredientId, variety: l.variety, preparation: l.preparation, quantity: l.quantity, isOptional: l.isOptional })),
		});
	}
	return contents;
}

export async function loadBookTitlesById(tx: Tx, ids: (string | null)[]): Promise<Map<string, string>> {
	const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
	if (!wanted.length) return new Map();
	const rows = await tx<{ id: string; title: string }[]>`select id, title from app.books where id in (select jsonb_array_elements_text(${JSON.stringify(wanted)}::text::jsonb)::uuid)`;
	return new Map(rows.map((row) => [row.id, row.title]));
}

export async function loadIngredientNamesById(tx: Tx, ids: string[]): Promise<Map<string, Localized>> {
	if (!ids.length) return new Map();
	const rows = await tx<{ id: string; name: Localized }[]>`select id, name from app.ingredients where id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb)::uuid)`;
	return new Map(rows.map((row) => [row.id, row.name]));
}

const ingredientIdsOf = (contents: Iterable<Content>) => {
	const ids = new Set<string>();
	for (const content of contents) for (const line of content.lines ?? []) ids.add(line.ingredientId);
	return [...ids];
};

/** Book title and ingredient names are shared catalogue entities, read as they are now (spec section 8). */
export const summaryOf = (c: Content, titles: Map<string, string>, locale: Locale): RecipeSummaryView => ({
	id: c.recipeId,
	name: pick(c.name, locale) ?? '',
	description: pick(c.description, locale),
	durationMinutes: c.durationMinutes,
	sourceType: c.sourceType,
	sourceUrl: c.sourceUrl,
	bookTitle: c.bookId ? (titles.get(c.bookId) ?? null) : null,
	bookPages: c.bookPages,
	mealType: c.mealType,
	proteinGroup: c.proteinGroup,
});

/** scaleQuantity never sees zero servings: the lines come at the base. */
function linesOf(c: Content, ref: RecipeRef, names: Map<string, Localized>, system: MeasurementSystem, locale: Locale): IngredientLineView[] | null {
	if (!c.lines || !c.baseServings) return null;
	const servings = ref.servings > 0 ? ref.servings : c.baseServings;
	return ingredientLinesView(c.lines, names, { servings, baseServings: c.baseServings, system, locale });
}

/** Summaries in bulk, keyed by recipeViewKey; recipes RLS hides are missing from the map. */
export async function recipeSummaries(tx: Tx, refs: RecipeRef[], locale: Locale): Promise<Map<string, RecipeSummaryView>> {
	const contents = await loadContents(tx, refs);
	const titles = await loadBookTitlesById(tx, [...contents.values()].map((c) => c.bookId));
	const result = new Map<string, RecipeSummaryView>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (content) result.set(recipeViewKey(ref), summaryOf(content, titles, locale));
	}
	return result;
}

/** Lines ready to show in bulk, keyed by recipeViewKey; null for a never-published recipe. */
export async function ingredientLines(
	tx: Tx,
	refs: RecipeRef[],
	options: { familyId: string; locale: Locale },
): Promise<Map<string, IngredientLineView[] | null>> {
	const [{ system }, contents] = await Promise.all([loadFamily(tx, options.familyId), loadContents(tx, refs)]);
	const names = await loadIngredientNamesById(tx, ingredientIdsOf(contents.values()));
	const result = new Map<string, IngredientLineView[] | null>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (content) result.set(recipeViewKey(ref), linesOf(content, ref, names, system, options.locale));
	}
	return result;
}

/** Everything a card or a recipe page shows, keyed by recipeViewKey. */
export async function recipeViews(tx: Tx, viewer: Viewer, refs: RecipeRef[]): Promise<Map<string, RecipeView>> {
	const [{ system }, contents, ratings] = await Promise.all([
		loadFamily(tx, viewer.familyId),
		loadContents(tx, refs),
		ratingSummaries(tx, viewer.familyId, viewer.userId, [...new Set(refs.map((ref) => ref.recipeId))]),
	]);
	const [titles, names] = await Promise.all([
		loadBookTitlesById(tx, [...contents.values()].map((c) => c.bookId)),
		loadIngredientNamesById(tx, ingredientIdsOf(contents.values())),
	]);
	const result = new Map<string, RecipeView>();
	for (const ref of refs) {
		const content = contents.get(contentKey(ref));
		if (!content) continue;
		result.set(recipeViewKey(ref), {
			summary: summaryOf(content, titles, viewer.locale),
			status: content.status,
			version: content.version,
			baseServings: content.baseServings,
			ingredients: linesOf(content, ref, names, system, viewer.locale),
			rating: content.status === 'draft' ? null : ratings.get(ref.recipeId)!,
		});
	}
	return result;
}
