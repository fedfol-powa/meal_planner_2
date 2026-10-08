import { changedFields, contentOf } from '#lib/domain/recipe-content.ts';
import { validateForPublish, type ValidationIssue } from '#lib/domain/recipe-validation.ts';
import type { DemoDatabase, Locale, LocalDateTime, Recipe } from '#lib/domain/types.ts';
import { localized } from './access';
import { adminGuard } from './admin';
import { fail, ok, type OperationContext, type OpResult } from './context';

/**
 * Whole catalogue restore to a point in time (spec section 8, decided 8 October 2026): the catalogue at
 * any instant is rebuilt from the append-only history (recipe_versions, recipe_status_changes), so there
 * are no periodic copies to list. Catalogue ingredients have no history in the prototype: the real app
 * restores them from ingredient_versions.
 */

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** The minute before `at`, used to undo a restore (it only writes new versions and status changes). */
export function minuteBefore(at: LocalDateTime): LocalDateTime {
	return new Date(Date.parse(`${at}:00Z`) - 60_000).toISOString().slice(0, 16);
}

interface CatalogueEntry {
	recipeId: string;
	version: number;
	status: 'published' | 'archived';
}

/** Recipes published by `at`, with the version in force and whether they were archived then. */
export function catalogueAt(db: DemoDatabase, at: LocalDateTime): CatalogueEntry[] {
	const entries: CatalogueEntry[] = [];
	for (const recipe of db.recipes) {
		const versions = db.recipeVersions.filter((v) => v.recipeId === recipe.id && v.publishedAt <= at);
		if (!versions.length) continue;
		const version = Math.max(...versions.map((v) => v.version));
		const change = db.recipeStatusChanges.filter((c) => c.recipeId === recipe.id && c.at <= at).at(-1);
		entries.push({ recipeId: recipe.id, version, status: change?.status ?? 'published' });
	}
	return entries;
}

export interface RestoreRow {
	at: LocalDateTime;
	restoredTo: LocalDateTime;
	byName: string;
	/** The instant to restore to undo it. */
	undoAt: LocalDateTime;
}

/** Restores done so far, newest first: each can be undone by restoring the minute before it. */
export function listCatalogueRestores(db: DemoDatabase, ctx: OperationContext): OpResult<RestoreRow[]> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	return ok(
		db.catalogueRestores
			.map((r) => ({ at: r.at, restoredTo: r.restoredTo, byName: db.users.find((u) => u.id === r.by)?.displayName ?? '', undoAt: minuteBefore(r.at) }))
			.sort((a, b) => b.at.localeCompare(a.at))
	);
}

export interface RecipeChange {
	recipeId: string;
	name: string;
}

export interface RestorePreview {
	at: LocalDateTime;
	/** Content goes back to the version in force then, as a new version. */
	reverted: (RecipeChange & { fromVersion: number; toVersion: number })[];
	/** Born after that instant, or archived then: out of the catalogue, meals still readable. */
	archived: RecipeChange[];
	/** Archived now, published then: back in the catalogue. */
	unarchived: RecipeChange[];
	/** The version in force then fails today's checks: the recipe stays as it is. */
	blocked: (RecipeChange & { issues: ValidationIssue[] })[];
	unchanged: number;
	/** Drafts are not touched. */
	drafts: number;
}

const nameOf = (recipe: Pick<Recipe, 'name'>, locale: Locale) => localized(recipe.name, locale).text;

function plan(db: DemoDatabase, ctx: OperationContext, at: LocalDateTime): OpResult<RestorePreview> {
	if (!LOCAL_DATE_TIME.test(at) || at >= ctx.now) return fail('invalid');
	const locale = db.users.find((u) => u.id === ctx.userId)?.locale ?? 'it-IT';
	const then = catalogueAt(db, at);
	const preview: RestorePreview = { at, reverted: [], archived: [], unarchived: [], blocked: [], unchanged: 0, drafts: db.recipeDrafts.length };
	for (const recipe of db.recipes.filter((r) => r.status !== 'draft')) {
		const change = { recipeId: recipe.id, name: nameOf(recipe, locale) };
		const entry = then.find((e) => e.recipeId === recipe.id);
		if (!entry) {
			if (recipe.status === 'published') preview.archived.push(change);
			else preview.unchanged++;
			continue;
		}
		const version = db.recipeVersions.find((v) => v.recipeId === recipe.id && v.version === entry.version);
		let touched = false;
		if (version && changedFields(contentOf(recipe), version.content).length > 0) {
			const issues = validateForPublish(db, version.content);
			if (issues.length) preview.blocked.push({ ...change, issues });
			else preview.reverted.push({ ...change, fromVersion: recipe.version, toVersion: entry.version });
			touched = true;
		}
		if (entry.status !== recipe.status) {
			(entry.status === 'archived' ? preview.archived : preview.unarchived).push(change);
			touched = true;
		}
		if (!touched) preview.unchanged++;
	}
	return ok(preview);
}

export function previewCatalogueRestore(db: DemoDatabase, ctx: OperationContext, at: LocalDateTime): OpResult<RestorePreview> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	return plan(db, ctx, at);
}

/**
 * Takes the whole catalogue back to `at`: recipes republished as new versions (history kept), recipes
 * born after archived, archived ones published then brought back. Menus, ratings, drafts, families and
 * users are not touched; past meals keep the version eaten (review R1).
 */
export function restoreCatalogue(db: DemoDatabase, ctx: OperationContext, at: LocalDateTime): OpResult<{ reverted: number; archived: number; unarchived: number }> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	const planned = plan(db, ctx, at);
	if (!planned.ok) return planned;
	const preview = planned.value;

	const recipe = (id: string) => db.recipes.find((r) => r.id === id)!;
	for (const item of preview.reverted) {
		const target = recipe(item.recipeId);
		const content = db.recipeVersions.find((v) => v.recipeId === target.id && v.version === item.toVersion)!.content;
		Object.assign(target, contentOf(content));
		target.version++;
		db.recipeVersions.push({
			recipeId: target.id, version: target.version, content: contentOf(content), publishedBy: ctx.userId, publishedAt: ctx.now,
			restoredFrom: item.toVersion, restoredFromInstant: at
		});
	}
	for (const item of preview.archived) {
		Object.assign(recipe(item.recipeId), { status: 'archived', archivedBy: ctx.userId, archivedAt: ctx.now });
		db.recipeStatusChanges.push({ recipeId: item.recipeId, status: 'archived', by: ctx.userId, at: ctx.now });
	}
	for (const item of preview.unarchived) {
		Object.assign(recipe(item.recipeId), { status: 'published', archivedBy: null, archivedAt: null });
		db.recipeStatusChanges.push({ recipeId: item.recipeId, status: 'published', by: ctx.userId, at: ctx.now });
	}
	db.catalogueRestores.push({ at: ctx.now, restoredTo: at, by: ctx.userId });
	return ok({ reverted: preview.reverted.length, archived: preview.archived.length, unarchived: preview.unarchived.length });
}
