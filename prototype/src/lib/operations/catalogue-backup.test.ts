import { beforeEach, describe, expect, it } from 'vitest';
import type { DemoDatabase } from '#lib/domain/types.ts';
import { validateForPublish } from '#lib/domain/recipe-validation.ts';
import { createInitial } from '#lib/store/persistence.ts';
import type { OperationContext } from './context';
import { listCatalogueBackups, previewCatalogueRestore, restoreCatalogue } from './catalogue-backup';
import { getWeekView } from './meals';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};
const backupOn = (day: string) => db.catalogueBackups.find((b) => b.takenAt.startsWith(day))!;

beforeEach(() => {
	db = createInitial().db;
});

describe('demo backups', () => {
	it('keeps daily copies of the last 7 days and weekly ones before, newest first', () => {
		const list = value(listCatalogueBackups(db, ctx()));
		expect(list.filter((b) => b.kind === 'daily')).toHaveLength(7);
		expect(list.filter((b) => b.kind === 'weekly')).toHaveLength(4);
		expect(list[0].takenAt > list[1].takenAt).toBe(true);
	});

	it('points to versions that exist, and every version it would restore passes today’s checks or is reported', () => {
		for (const backup of db.catalogueBackups)
			for (const entry of backup.recipes) expect(db.recipeVersions.some((v) => v.recipeId === entry.recipeId && v.version === entry.version)).toBe(true);
		const preview = value(previewCatalogueRestore(db, ctx(), backupOn('2026-10-05').id));
		for (const r of preview.reverted) {
			const v = db.recipeVersions.find((x) => x.recipeId === r.recipeId && x.version === r.toVersion)!;
			expect(validateForPublish(db, v.content)).toEqual([]);
		}
	});

	it('is reserved to app administrators', () => {
		const as = ctx({ userId: 'user-lucia', familyId: 'family-grandparents' });
		expect(listCatalogueBackups(db, as)).toEqual({ ok: false, error: 'forbidden' });
		expect(restoreCatalogue(db, as, backupOn('2026-10-05').id)).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('restoring the catalogue', () => {
	it('previews what goes back, what gets archived and what comes back to the catalogue', () => {
		const preview = value(previewCatalogueRestore(db, ctx(), backupOn('2026-10-05').id));
		expect(preview.reverted.map((r) => r.recipeId)).toContain('hamburger-cavallo');
		expect(preview.archived.length).toBeGreaterThan(0);
		expect(preview.unarchived.map((r) => r.recipeId)).toEqual([]);
		expect(preview.unchanged).toBeGreaterThan(0);
		expect(preview.drafts).toBe(db.recipeDrafts.length);
	});

	it('republishes as new versions, archives recipes born after, keeps a copy first', () => {
		const before = db.catalogueBackups.length;
		const burgers = db.recipes.find((r) => r.id === 'hamburger-cavallo')!;
		const preview = value(previewCatalogueRestore(db, ctx(), backupOn('2026-10-05').id));
		const drafts = structuredClone(db.recipeDrafts);
		const ratings = structuredClone(db.ratings);
		const result = value(restoreCatalogue(db, ctx(), backupOn('2026-10-05').id));

		expect(result).toEqual({ reverted: preview.reverted.length, archived: preview.archived.length, unarchived: 0 });
		expect(burgers.version).toBe(3);
		expect(db.recipeVersions.find((v) => v.recipeId === burgers.id && v.version === 3)).toMatchObject({ restoredFrom: 1, publishedBy: 'user-federico' });
		for (const a of preview.archived) expect(db.recipes.find((r) => r.id === a.recipeId)!.status).toBe('archived');
		expect(db.catalogueBackups).toHaveLength(before + 1);
		expect(db.catalogueBackups.find((b) => b.kind === 'pre_restore')!.recipes.find((r) => r.recipeId === burgers.id)!.version).toBe(2);
		expect(db.recipeDrafts).toEqual(drafts);
		expect(db.ratings).toEqual(ratings);
	});

	it('can be undone with the copy taken before the restore', () => {
		const archived = value(previewCatalogueRestore(db, ctx(), backupOn('2026-10-05').id)).archived;
		value(restoreCatalogue(db, ctx(), backupOn('2026-10-05').id));
		const copy = db.catalogueBackups.find((b) => b.kind === 'pre_restore')!;
		const back = value(previewCatalogueRestore(db, ctx({ now: '2026-10-06T12:05' }), copy.id));
		expect(back.unarchived.map((r) => r.recipeId).sort()).toEqual(archived.map((r) => r.recipeId).sort());
		value(restoreCatalogue(db, ctx({ now: '2026-10-06T12:05' }), copy.id));
		expect(db.recipes.find((r) => r.id === 'hamburger-cavallo')!.ingredients.some((i) => i.ingredientId === 'pomodori')).toBe(true);
		for (const a of archived) expect(db.recipes.find((r) => r.id === a.recipeId)!.status).toBe('published');
	});

	it('leaves meals readable', () => {
		value(restoreCatalogue(db, ctx(), backupOn('2026-10-05').id));
		const week = value(getWeekView(db, ctx(), '2026-10-06'));
		expect(week.days.flatMap((d) => d.meals).some((m) => m.recipe)).toBe(true);
	});

	it('is not possible offline', () => {
		expect(restoreCatalogue(db, ctx({ offline: true }), backupOn('2026-10-05').id)).toEqual({ ok: false, error: 'offline' });
	});
});
