import { changedFields, contentOf, plainCopy } from '#lib/domain/recipe-content.ts';
import { validateForPublish, type ValidationIssue } from '#lib/domain/recipe-validation.ts';
import type { CatalogueBackup, DemoDatabase, Locale, LocalDateTime, Recipe } from '#lib/domain/types.ts';
import { localized } from './access';
import { adminGuard } from './admin';
import { fail, ok, type OperationContext, type OpResult } from './context';

/** A copy of the catalogue as it is now: published and archived recipes, all ingredients. */
export function snapshotCatalogue(db: DemoDatabase, id: string, takenAt: LocalDateTime, kind: CatalogueBackup['kind']): CatalogueBackup {
	return {
		id, takenAt, kind,
		recipes: db.recipes.filter((r) => r.status !== 'draft').map((r) => ({ recipeId: r.id, version: r.version, status: r.status as 'published' | 'archived' })),
		ingredients: plainCopy(db.ingredients)
	};
}

/**
 * The copy the catalogue would have had at `takenAt`, rebuilt from the version history (demo backups):
 * the last version published by then and whether the recipe was already archived.
 */
export function catalogueAt(db: DemoDatabase, id: string, takenAt: LocalDateTime, kind: CatalogueBackup['kind']): CatalogueBackup {
	const recipes: CatalogueBackup['recipes'] = [];
	for (const recipe of db.recipes) {
		const versions = db.recipeVersions.filter((v) => v.recipeId === recipe.id && v.publishedAt <= takenAt);
		if (!versions.length) continue;
		const version = Math.max(...versions.map((v) => v.version));
		recipes.push({ recipeId: recipe.id, version, status: recipe.archivedAt !== null && recipe.archivedAt <= takenAt ? 'archived' : 'published' });
	}
	return { id, takenAt, kind, recipes, ingredients: plainCopy(db.ingredients) };
}

export interface BackupRow {
	id: string;
	takenAt: LocalDateTime;
	kind: CatalogueBackup['kind'];
	recipes: number;
}

export function listCatalogueBackups(db: DemoDatabase, ctx: OperationContext): OpResult<BackupRow[]> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	return ok(
		db.catalogueBackups
			.map((b) => ({ id: b.id, takenAt: b.takenAt, kind: b.kind, recipes: b.recipes.filter((r) => r.status === 'published').length }))
			.sort((a, b) => b.takenAt.localeCompare(a.takenAt))
	);
}

export interface RecipeChange {
	recipeId: string;
	name: string;
}

export interface RestorePreview {
	backup: BackupRow;
	/** Content goes back to the version of the backup, as a new version. */
	reverted: (RecipeChange & { fromVersion: number; toVersion: number })[];
	/** Born after the backup, or archived in it: out of the catalogue, meals still readable. */
	archived: RecipeChange[];
	/** Archived now, published in the backup: back in the catalogue. */
	unarchived: RecipeChange[];
	/** The version of the backup fails today's checks: the recipe stays as it is. */
	blocked: (RecipeChange & { issues: ValidationIssue[] })[];
	unchanged: number;
	/** Catalogue ingredients whose name, department or pantry flag go back. */
	ingredients: number;
	/** Drafts are not touched. */
	drafts: number;
}

interface Plan {
	preview: RestorePreview;
	backup: CatalogueBackup;
}

const nameOf = (recipe: Pick<Recipe, 'name'>, locale: Locale) => localized(recipe.name, locale).text;

function plan(db: DemoDatabase, ctx: OperationContext, backupId: string): OpResult<Plan> {
	const backup = db.catalogueBackups.find((b) => b.id === backupId);
	if (!backup) return fail('not_found');
	const locale = db.users.find((u) => u.id === ctx.userId)?.locale ?? 'it-IT';
	const preview: RestorePreview = {
		backup: { id: backup.id, takenAt: backup.takenAt, kind: backup.kind, recipes: backup.recipes.filter((r) => r.status === 'published').length },
		reverted: [], archived: [], unarchived: [], blocked: [], unchanged: 0, ingredients: 0, drafts: db.recipeDrafts.length
	};
	for (const recipe of db.recipes.filter((r) => r.status !== 'draft')) {
		const change = { recipeId: recipe.id, name: nameOf(recipe, locale) };
		const entry = backup.recipes.find((e) => e.recipeId === recipe.id);
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
	preview.ingredients = backup.ingredients.filter((saved) => {
		const current = db.ingredients.find((i) => i.id === saved.id);
		return !current || JSON.stringify(current) !== JSON.stringify(saved);
	}).length;
	return ok({ preview, backup });
}

export function previewCatalogueRestore(db: DemoDatabase, ctx: OperationContext, backupId: string): OpResult<RestorePreview> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	const planned = plan(db, ctx, backupId);
	return planned.ok ? ok(planned.value.preview) : planned;
}

/**
 * Restores the whole catalogue (round 6, provisional): a copy "before the restore" first; recipes of the
 * backup republished as new versions (history kept), recipes born after archived, ingredients of the
 * backup put back (newer ones stay). Menus, ratings, drafts, families and users are not touched; past
 * meals keep the version eaten (review R1).
 */
export function restoreCatalogue(db: DemoDatabase, ctx: OperationContext, backupId: string): OpResult<{ reverted: number; archived: number; unarchived: number }> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	const planned = plan(db, ctx, backupId);
	if (!planned.ok) return planned;
	const { preview, backup } = planned.value;

	db.catalogueBackups.push(snapshotCatalogue(db, `backup-before-${ctx.now.replace(/\D/g, '')}`, ctx.now, 'pre_restore'));
	const recipe = (id: string) => db.recipes.find((r) => r.id === id)!;
	for (const item of preview.reverted) {
		const target = recipe(item.recipeId);
		const content = db.recipeVersions.find((v) => v.recipeId === target.id && v.version === item.toVersion)!.content;
		Object.assign(target, contentOf(content));
		target.version++;
		db.recipeVersions.push({
			recipeId: target.id, version: target.version, content: contentOf(content), publishedBy: ctx.userId, publishedAt: ctx.now,
			restoredFrom: item.toVersion, restoredFromBackup: backup.id
		});
	}
	for (const item of preview.archived) Object.assign(recipe(item.recipeId), { status: 'archived', archivedBy: ctx.userId, archivedAt: ctx.now });
	for (const item of preview.unarchived) Object.assign(recipe(item.recipeId), { status: 'published', archivedBy: null, archivedAt: null });
	for (const saved of backup.ingredients) {
		const current = db.ingredients.find((i) => i.id === saved.id);
		if (current) Object.assign(current, plainCopy(saved));
		else db.ingredients.push(plainCopy(saved));
	}
	return ok({ reverted: preview.reverted.length, archived: preview.archived.length, unarchived: preview.unarchived.length });
}
