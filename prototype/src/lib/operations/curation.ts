import { cleanVariety, knownVarieties, lineKey, normalizeVariety, varietyHints, withVariety, type VarietyHint } from '#lib/domain/ingredient-variety.ts';
import { changedFields, contentOf, plainCopy } from '#lib/domain/recipe-content.ts';
import { summarize, validateForPublish, validateForSave, type MissingData, type ValidationIssue } from '#lib/domain/recipe-validation.ts';
import {
	DEPARTMENTS,
	type DemoDatabase,
	type Department,
	type LocalDateTime,
	type Locale,
	type Recipe,
	type RecipeContent,
	type RecipeContentField,
	type RecipeDraft,
	type Translated
} from '#lib/domain/types.ts';
import { translate } from '#lib/i18n/translate.ts';
import { formatQuantity } from '#lib/units/format.ts';
import { isCurator, localeOf, localized } from './access';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { normalizeForSearch } from './recipes';

// Curation (round 5, spec section 8): shared drafts, revisions of published recipes, versions, restore and
// archive. Same operations for the web form and, later, MCP; every curator may change every recipe.

const userName = (db: DemoDatabase, id: string) => db.users.find((u) => u.id === id)?.displayName ?? id;
const nameOf = (content: Pick<RecipeContent, 'name'>, locale: Locale) => localized(content.name, locale).text || content.name['en-GB'] || '';

function guard(db: DemoDatabase, ctx: OperationContext, write: boolean): OpResult<null> {
	if (!isCurator(db, ctx)) return fail('forbidden');
	if (write && ctx.offline) return fail('offline');
	return ok(null);
}

function findDraft(db: DemoDatabase, ctx: OperationContext, draftId: string, write: boolean): OpResult<RecipeDraft> {
	const allowed = guard(db, ctx, write);
	if (!allowed.ok) return fail(allowed.error);
	const draft = db.recipeDrafts.find((d) => d.id === draftId);
	return draft ? ok(draft) : fail('not_found');
}

// ---- Overview -------------------------------------------------------------------------------------------

export interface DraftSummary {
	id: string;
	recipeId: string;
	kind: RecipeDraft['kind'];
	name: string;
	createdByName: string;
	updatedByName: string;
	updatedAt: LocalDateTime;
	missing: MissingData[];
	verified: boolean;
}

export interface ArchivedSummary {
	recipeId: string;
	name: string;
	archivedByName: string;
	archivedAt: LocalDateTime;
}

/** Drafts (most recent first) and archived recipes, for the section at the top of the catalogue. */
export function getCurationOverview(db: DemoDatabase, ctx: OperationContext, text = ''): OpResult<{ drafts: DraftSummary[]; archived: ArchivedSummary[] }> {
	const allowed = guard(db, ctx, false);
	if (!allowed.ok) return fail(allowed.error);
	const locale = localeOf(db, ctx);
	const needle = normalizeForSearch(text);
	const matches = (name: string) => !needle || normalizeForSearch(name).includes(needle);
	const drafts = db.recipeDrafts
		.map((d) => ({
			id: d.id,
			recipeId: d.recipeId,
			kind: d.kind,
			name: nameOf(d.content, locale),
			createdByName: userName(db, d.createdBy),
			updatedByName: userName(db, d.updatedBy),
			updatedAt: d.updatedAt,
			missing: summarize(validateForPublish(db, d.content)),
			verified: d.verifiedRevision === d.revision
		}))
		.filter((d) => matches(d.name))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, locale));
	const archived = db.recipes
		.filter((r) => r.status === 'archived')
		.map((r) => ({ recipeId: r.id, name: nameOf(r, locale), archivedByName: userName(db, r.archivedBy ?? ''), archivedAt: r.archivedAt ?? '' }))
		.filter((r) => matches(r.name))
		.sort((a, b) => a.name.localeCompare(b.name, locale));
	return ok({ drafts, archived });
}

// ---- Drafts ---------------------------------------------------------------------------------------------

export interface DraftDetail {
	draft: RecipeDraft;
	createdByName: string;
	updatedByName: string;
	/** Published version a revision works on (it may have moved on since the revision started). */
	publishedVersion: number | null;
	verified: boolean;
	/** A new recipe already cited by meals cannot be deleted. */
	canDiscard: boolean;
}

const usedByMeals = (db: DemoDatabase, recipeId: string) => db.weeks.some((w) => w.slots.some((s) => s.recipeId === recipeId));

export function getDraft(db: DemoDatabase, ctx: OperationContext, draftId: string): OpResult<DraftDetail> {
	const found = findDraft(db, ctx, draftId, false);
	if (!found.ok) return fail(found.error);
	const draft = found.value;
	const recipe = db.recipes.find((r) => r.id === draft.recipeId);
	return ok({
		draft: plainCopy(draft),
		createdByName: userName(db, draft.createdBy),
		updatedByName: userName(db, draft.updatedBy),
		publishedVersion: draft.kind === 'revision' ? recipe?.version ?? null : null,
		verified: draft.verifiedRevision === draft.revision,
		canDiscard: draft.kind === 'revision' || !usedByMeals(db, draft.recipeId)
	});
}

/** The draft of a recipe, when there is one (a published recipe has at most one revision at a time). */
export const draftOfRecipe = (db: DemoDatabase, recipeId: string) => db.recipeDrafts.find((d) => d.recipeId === recipeId) ?? null;

export function emptyContent(): RecipeContent {
	return {
		name: { 'it-IT': '', 'en-GB': null },
		description: { 'it-IT': '', 'en-GB': null },
		sourceType: 'home',
		sourceUrl: null,
		bookId: null,
		bookPages: null,
		durationMinutes: null,
		baseServings: null,
		mealType: 'both',
		proteinGroup: null,
		ingredients: []
	};
}

function slug(text: string): string {
	return normalizeForSearch(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ricetta';
}

function uniqueId(base: string, taken: (id: string) => boolean): string {
	let id = base;
	for (let n = 2; taken(id); n++) id = `${base}-${n}`;
	return id;
}

/** Server-side tidying, the same for the form and MCP: varieties trimmed, empty ones removed. */
function tidy(content: RecipeContent): RecipeContent {
	const copy = contentOf(content);
	for (const line of copy.ingredients) {
		if (!line.variety) continue;
		const it = cleanVariety(line.variety['it-IT'] ?? '');
		const en = cleanVariety(line.variety['en-GB'] ?? '');
		line.variety = it || en ? { 'it-IT': it, 'en-GB': en || null } : null;
	}
	return copy;
}

export type CreateOutcome = { status: 'created'; draftId: string } | { status: 'invalid'; issues: ValidationIssue[] };

/** First save of a new recipe: a draft and a recipe in draft status, kept out of the catalogue. */
export function createDraft(db: DemoDatabase, ctx: OperationContext, input: RecipeContent): OpResult<CreateOutcome> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	const content = tidy(input);
	const issues = validateForSave(db, content);
	if (issues.length) return ok({ status: 'invalid', issues });
	const recipeId = uniqueId(slug(content.name['it-IT'] || content.name['en-GB'] || ''), (id) => db.recipes.some((r) => r.id === id));
	const copy = contentOf(content);
	db.recipes.push({
		id: recipeId, status: 'draft', ...contentOf(copy), tags: [], photo: null, addedOn: ctx.now.slice(0, 10),
		createdBy: ctx.userId, version: 0, archivedBy: null, archivedAt: null
	});
	const draftId = `draft-${recipeId}`;
	db.recipeDrafts.push({
		id: draftId, recipeId, kind: 'new', baseVersion: null, content: copy, createdBy: ctx.userId, createdAt: ctx.now,
		updatedBy: ctx.userId, updatedAt: ctx.now, revision: 1, verifiedRevision: null,
		history: [{ revision: 1, content: contentOf(copy), savedBy: ctx.userId, savedAt: ctx.now }]
	});
	return ok({ status: 'created', draftId });
}

/** "Modifica" on a published recipe: a revision draft, or the one already open. */
export function startRevision(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<{ draftId: string }> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe) return fail('not_found');
	const existing = draftOfRecipe(db, recipeId);
	if (existing) return ok({ draftId: existing.id });
	if (recipe.status !== 'published') return fail('not_allowed');
	const content = contentOf(recipe);
	const draftId = uniqueId(`revision-${recipeId}`, (id) => db.recipeDrafts.some((d) => d.id === id));
	db.recipeDrafts.push({
		id: draftId, recipeId, kind: 'revision', baseVersion: recipe.version, content, createdBy: ctx.userId, createdAt: ctx.now,
		updatedBy: ctx.userId, updatedAt: ctx.now, revision: 1, verifiedRevision: null,
		history: [{ revision: 1, content: contentOf(content), savedBy: ctx.userId, savedAt: ctx.now }]
	});
	return ok({ draftId });
}

export type SaveOutcome =
	| { status: 'saved'; revision: number }
	| { status: 'invalid'; issues: ValidationIssue[] }
	/** Someone saved after the revision this save started from (round 5: refuse, show, let choose). */
	| { status: 'conflict'; byName: string; at: LocalDateTime; revision: number; theirs: RecipeContent; theirFields: RecipeContentField[]; myFields: RecipeContentField[] };

/**
 * Saves a draft started from `baseRevision`. A newer save by someone else is a conflict unless
 * `overwrite` is set; overwritten contents stay in the draft history.
 */
export function saveDraft(db: DemoDatabase, ctx: OperationContext, draftId: string, input: RecipeContent, baseRevision: number, overwrite = false): OpResult<SaveOutcome> {
	const found = findDraft(db, ctx, draftId, true);
	if (!found.ok) return fail(found.error);
	const content = tidy(input);
	const draft = found.value;
	const issues = validateForSave(db, content);
	if (issues.length) return ok({ status: 'invalid', issues });
	if (baseRevision !== draft.revision && !overwrite) {
		const base = draft.history.find((h) => h.revision === baseRevision)?.content ?? draft.content;
		return ok({
			status: 'conflict',
			byName: userName(db, draft.updatedBy),
			at: draft.updatedAt,
			revision: draft.revision,
			theirs: contentOf(draft.content),
			theirFields: changedFields(base, draft.content),
			myFields: changedFields(base, content)
		});
	}
	if (changedFields(draft.content, content).length === 0) return ok({ status: 'saved', revision: draft.revision });
	draft.revision++;
	draft.content = contentOf(content);
	draft.updatedBy = ctx.userId;
	draft.updatedAt = ctx.now;
	draft.history.push({ revision: draft.revision, content: contentOf(content), savedBy: ctx.userId, savedAt: ctx.now });
	// A new recipe shows its draft wherever it is cited (past meals of the import).
	if (draft.kind === 'new') {
		const recipe = db.recipes.find((r) => r.id === draft.recipeId);
		if (recipe) Object.assign(recipe, contentOf(content));
	}
	return ok({ status: 'saved', revision: draft.revision });
}

/** Full check of the saved revision; when it passes, the revision can be published. */
export function verifyDraft(db: DemoDatabase, ctx: OperationContext, draftId: string): OpResult<{ issues: ValidationIssue[]; revision: number }> {
	const found = findDraft(db, ctx, draftId, true);
	if (!found.ok) return fail(found.error);
	const draft = found.value;
	const issues = validateForPublish(db, draft.content);
	draft.verifiedRevision = issues.length ? null : draft.revision;
	return ok({ issues, revision: draft.revision });
}

export type PublishOutcome =
	| { status: 'published'; recipeId: string; version: number }
	| { status: 'invalid'; issues: ValidationIssue[] }
	/** The recipe got a newer version after the revision started: publishing would silently replace it. */
	| { status: 'stale'; byName: string; at: LocalDateTime; version: number };

/** Publishes a verified draft: the checks run again; a revision becomes the next version. */
export function publishDraft(db: DemoDatabase, ctx: OperationContext, draftId: string, overwrite = false): OpResult<PublishOutcome> {
	const found = findDraft(db, ctx, draftId, true);
	if (!found.ok) return fail(found.error);
	const draft = found.value;
	if (draft.verifiedRevision !== draft.revision) return fail('not_allowed');
	const issues = validateForPublish(db, draft.content);
	if (issues.length) {
		draft.verifiedRevision = null;
		return ok({ status: 'invalid', issues });
	}
	const recipe = db.recipes.find((r) => r.id === draft.recipeId);
	if (!recipe) return fail('not_found');
	if (draft.kind === 'revision' && recipe.version !== draft.baseVersion && !overwrite) {
		const latest = db.recipeVersions.find((v) => v.recipeId === recipe.id && v.version === recipe.version);
		return ok({ status: 'stale', byName: userName(db, latest?.publishedBy ?? ''), at: latest?.publishedAt ?? '', version: recipe.version });
	}
	publishContent(db, ctx, recipe, draft.content, null);
	if (draft.kind === 'new') recipe.addedOn = ctx.now.slice(0, 10);
	db.recipeDrafts.splice(db.recipeDrafts.indexOf(draft), 1);
	return ok({ status: 'published', recipeId: recipe.id, version: recipe.version });
}

function publishContent(db: DemoDatabase, ctx: OperationContext, recipe: Recipe, content: RecipeContent, restoredFrom: number | null) {
	Object.assign(recipe, contentOf(content));
	recipe.version++;
	if (recipe.status === 'draft') recipe.status = 'published';
	db.recipeVersions.push({ recipeId: recipe.id, version: recipe.version, content: contentOf(content), publishedBy: ctx.userId, publishedAt: ctx.now, restoredFrom });
}

/** Drops a revision, or deletes a new recipe never published and never cited by a meal. */
export function discardDraft(db: DemoDatabase, ctx: OperationContext, draftId: string): OpResult<{ kind: RecipeDraft['kind']; recipeId: string }> {
	const found = findDraft(db, ctx, draftId, true);
	if (!found.ok) return fail(found.error);
	const draft = found.value;
	if (draft.kind === 'new') {
		if (usedByMeals(db, draft.recipeId)) return fail('not_allowed');
		db.recipes.splice(db.recipes.findIndex((r) => r.id === draft.recipeId), 1);
	}
	db.recipeDrafts.splice(db.recipeDrafts.indexOf(draft), 1);
	return ok({ kind: draft.kind, recipeId: draft.recipeId });
}

// ---- Ingredients ----------------------------------------------------------------------------------------

export interface IngredientMatch {
	id: string;
	name: string;
	/** Set when the text matched a variety already used for this ingredient ("perino" → Pomodorini › perini). */
	variety: Translated | null;
}

/** Catalogue ingredients for a recipe line (canonical ones only), and varieties already written. */
export function searchCatalogueIngredients(db: DemoDatabase, ctx: OperationContext, text: string): OpResult<IngredientMatch[]> {
	const allowed = guard(db, ctx, false);
	if (!allowed.ok) return fail(allowed.error);
	const locale = localeOf(db, ctx);
	const needle = normalizeForSearch(text);
	if (needle.length < 2) return ok([]);
	const ingredients = db.ingredients.filter((i) => !i.canonicalId).map((i) => ({ id: i.id, name: localized(i.name, locale).text, variety: null }));
	const byName = ingredients.filter((i) => normalizeForSearch(i.name).includes(needle));
	const byVariety = ingredients.flatMap((i) =>
		knownVarieties(db, i.id)
			.filter((k) => normalizeVariety(localized(k.variety, locale).text).includes(normalizeVariety(text)))
			.map((k) => ({ ...i, variety: k.variety }))
	);
	return ok([...byName.sort((a, b) => a.name.localeCompare(b.name, locale)), ...byVariety].slice(0, 10));
}

/** Varieties already written for an ingredient, most used first: what the form and the agent suggest. */
export function getIngredientVarieties(db: DemoDatabase, ctx: OperationContext, ingredientId: string): OpResult<Translated[]> {
	const allowed = guard(db, ctx, false);
	if (!allowed.ok) return fail(allowed.error);
	if (!db.ingredients.some((i) => i.id === ingredientId)) return fail('not_found');
	return ok(knownVarieties(db, ingredientId).map((k) => k.variety));
}

/** Advice on a variety being written (never blocking), for the form and for the agent's questions. */
export function checkVariety(db: DemoDatabase, ctx: OperationContext, ingredientId: string, text: string, locale: Locale): OpResult<VarietyHint[]> {
	const allowed = guard(db, ctx, false);
	if (!allowed.ok) return fail(allowed.error);
	if (!db.ingredients.some((i) => i.id === ingredientId)) return fail('not_found');
	return ok(varietyHints(db, ingredientId, text, locale));
}

/** A catalogue ingredient added by a curator; the English name is checked at publication. */
export function createIngredient(db: DemoDatabase, ctx: OperationContext, name: Translated, department: Department): OpResult<{ id: string }> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	// Same capitalisation as the catalogue ("Lenticchie rosse").
	const capital = (t: string) => t.charAt(0).toLocaleUpperCase() + t.slice(1);
	const it = capital(name['it-IT'].trim());
	if (!it || it.length > 80 || !DEPARTMENTS.includes(department)) return fail('invalid');
	const id = uniqueId(slug(it), (candidate) => db.ingredients.some((i) => i.id === candidate));
	db.ingredients.push({ id, name: { 'it-IT': it, 'en-GB': name['en-GB']?.trim() ? capital(name['en-GB'].trim()) : null }, department, isPantry: false, canonicalId: null, purchase: null });
	return ok({ id });
}

// ---- Versions, restore, archive -------------------------------------------------------------------------

export interface VersionItem {
	version: number;
	byName: string;
	at: LocalDateTime;
	restoredFrom: number | null;
}

export interface RecipeVersions {
	recipeId: string;
	name: string;
	current: number;
	versions: VersionItem[];
}

export function getRecipeVersions(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<RecipeVersions> {
	const allowed = guard(db, ctx, false);
	if (!allowed.ok) return fail(allowed.error);
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe || recipe.status === 'draft') return fail('not_found');
	return ok({
		recipeId,
		name: nameOf(recipe, localeOf(db, ctx)),
		current: recipe.version,
		versions: db.recipeVersions
			.filter((v) => v.recipeId === recipeId)
			.sort((a, b) => b.version - a.version)
			.map((v) => ({ version: v.version, byName: userName(db, v.publishedBy), at: v.publishedAt, restoredFrom: v.restoredFrom }))
	});
}

export interface FieldChange {
	field: Exclude<RecipeContentField, 'ingredients'>;
	locale: Locale | null;
	before: string;
	after: string;
}

export interface IngredientChange {
	name: string;
	/** null when the line is not in that version. */
	before: string | null;
	after: string | null;
}

export interface VersionComparison extends VersionItem {
	name: string;
	current: number;
	/** From the chosen version to the current one. */
	fields: FieldChange[];
	ingredients: IngredientChange[];
	/** Today's publication check on the chosen version: a restore needs it empty. */
	issues: ValidationIssue[];
}

function describe(content: RecipeContent, field: Exclude<RecipeContentField, 'ingredients' | 'name' | 'description'>, db: DemoDatabase, locale: Locale): string {
	const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(locale, key, params);
	switch (field) {
		case 'sourceType': return t(`curation.source.${content.sourceType}`);
		case 'sourceUrl': return content.sourceUrl ?? '—';
		case 'bookId': return db.books.find((b) => b.id === content.bookId)?.title ?? '—';
		case 'bookPages': return content.bookPages ?? '—';
		case 'durationMinutes': return content.durationMinutes ? t('meal.minutes', { count: content.durationMinutes }) : '—';
		case 'baseServings': return content.baseServings ? String(content.baseServings) : '—';
		case 'mealType': return t(`curation.mealType.${content.mealType}`);
		case 'proteinGroup': return content.proteinGroup ? t(`group.${content.proteinGroup}`) : '—';
	}
}

function lineText(db: DemoDatabase, line: RecipeContent['ingredients'][number], locale: Locale): string {
	const text = line.quantity.kind === 'text' && line.text ? localized(line.text, locale).text : line.sourceText;
	const quantity = formatQuantity(line.quantity, text, 'metric', locale);
	return line.isOptional ? `${quantity} (${translate(locale, 'curation.optional')})` : quantity;
}

/** Changes from a version to the current one, field by field and line by line. */
export function compareVersions(db: DemoDatabase, ctx: OperationContext, recipeId: string, version: number): OpResult<VersionComparison> {
	const listed = getRecipeVersions(db, ctx, recipeId);
	if (!listed.ok) return fail(listed.error);
	const chosen = db.recipeVersions.find((v) => v.recipeId === recipeId && v.version === version);
	const recipe = db.recipes.find((r) => r.id === recipeId)!;
	if (!chosen) return fail('not_found');
	const locale = localeOf(db, ctx);
	const before = chosen.content;
	const after = contentOf(recipe);
	const fields: FieldChange[] = [];
	for (const field of changedFields(before, after)) {
		if (field === 'ingredients') continue;
		if (field === 'name' || field === 'description') {
			for (const l of ['it-IT', 'en-GB'] as const)
				if ((before[field][l] ?? '') !== (after[field][l] ?? '')) fields.push({ field, locale: l, before: before[field][l] || '—', after: after[field][l] || '—' });
		} else fields.push({ field, locale: null, before: describe(before, field, db, locale), after: describe(after, field, db, locale) });
	}
	const lineName = (line: RecipeContent['ingredients'][number]) => {
		const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
		return withVariety(ingredient ? localized(ingredient.name, locale).text : line.ingredientId, line.variety ? localized(line.variety, locale).text : null);
	};
	const keys = [...new Set([...before.ingredients, ...after.ingredients].map(lineKey))];
	const ingredients = keys
		.map((key) => {
			const b = before.ingredients.find((l) => lineKey(l) === key);
			const a = after.ingredients.find((l) => lineKey(l) === key);
			return { name: lineName((a ?? b)!), before: b ? lineText(db, b, locale) : null, after: a ? lineText(db, a, locale) : null };
		})
		.filter((c) => c.before !== c.after);
	const item = listed.value.versions.find((v) => v.version === version)!;
	return ok({ ...item, name: listed.value.name, current: recipe.version, fields, ingredients, issues: validateForPublish(db, before) });
}

export type RestoreOutcome = { status: 'restored'; version: number } | { status: 'invalid'; issues: ValidationIssue[] };

/**
 * Publishes an older version again as a new one (round 5): the history stays whole, other recipes and
 * shared catalogue ingredients are untouched; refused when the old content no longer passes today's check.
 */
export function restoreVersion(db: DemoDatabase, ctx: OperationContext, recipeId: string, version: number): OpResult<RestoreOutcome> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	const recipe = db.recipes.find((r) => r.id === recipeId);
	const chosen = db.recipeVersions.find((v) => v.recipeId === recipeId && v.version === version);
	if (!recipe || recipe.status === 'draft' || !chosen) return fail('not_found');
	if (version === recipe.version) return fail('not_allowed');
	const issues = validateForPublish(db, chosen.content);
	if (issues.length) return ok({ status: 'invalid', issues });
	publishContent(db, ctx, recipe, chosen.content, version);
	return ok({ status: 'restored', version: recipe.version });
}

/** Out of the catalogue and suggestions; meals keep showing it (round 5, reversible). */
export function archiveRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<null> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe) return fail('not_found');
	if (recipe.status !== 'published') return fail('not_allowed');
	Object.assign(recipe, { status: 'archived', archivedBy: ctx.userId, archivedAt: ctx.now });
	return ok(null);
}

export function unarchiveRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<null> {
	const allowed = guard(db, ctx, true);
	if (!allowed.ok) return fail(allowed.error);
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe) return fail('not_found');
	if (recipe.status !== 'archived') return fail('not_allowed');
	Object.assign(recipe, { status: 'published', archivedBy: null, archivedAt: null });
	return ok(null);
}
