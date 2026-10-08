import { beforeEach, describe, expect, it } from 'vitest';
import type { DemoDatabase } from '#lib/domain/types.ts';
import { validateForPublish } from '#lib/domain/recipe-validation.ts';
import { createInitial } from '#lib/store/persistence.ts';
import type { OperationContext } from './context';
import { archiveRecipe } from './curation';
import { catalogueAt, listCatalogueRestores, minuteBefore, previewCatalogueRestore, restoreCatalogue } from './catalogue-restore';
import { getWeekView } from './meals';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};
const AT = '2026-10-05T03:00';

beforeEach(() => {
	db = createInitial().db;
});

describe('catalogue at a moment', () => {
	it('rebuilds versions and archive state from the history, without copies', () => {
		const then = catalogueAt(db, '2026-10-03T12:00');
		expect(then.find((e) => e.recipeId === 'riso-curry-giappone')?.status).toBe('published');
		expect(catalogueAt(db, '2026-10-05T12:00').find((e) => e.recipeId === 'riso-curry-giappone')?.status).toBe('archived');
		for (const entry of then) expect(db.recipeVersions.some((v) => v.recipeId === entry.recipeId && v.version === entry.version)).toBe(true);
	});

	it('only previews versions that pass today’s checks, or reports them', () => {
		const preview = value(previewCatalogueRestore(db, ctx(), AT));
		for (const r of preview.reverted) {
			const v = db.recipeVersions.find((x) => x.recipeId === r.recipeId && x.version === r.toVersion)!;
			expect(validateForPublish(db, v.content)).toEqual([]);
		}
	});

	it('refuses a moment in the future or malformed', () => {
		expect(previewCatalogueRestore(db, ctx(), '2026-10-07T12:00')).toEqual({ ok: false, error: 'invalid' });
		expect(previewCatalogueRestore(db, ctx(), 'yesterday')).toEqual({ ok: false, error: 'invalid' });
	});

	it('is reserved to app administrators', () => {
		const as = ctx({ userId: 'user-lucia', familyId: 'family-grandparents' });
		expect(listCatalogueRestores(db, as)).toEqual({ ok: false, error: 'forbidden' });
		expect(restoreCatalogue(db, as, AT)).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('restoring the catalogue', () => {
	it('previews what goes back, what gets archived and what comes back to the catalogue', () => {
		const preview = value(previewCatalogueRestore(db, ctx(), AT));
		expect(preview.reverted.map((r) => r.recipeId)).toContain('hamburger-cavallo');
		expect(preview.archived.length).toBeGreaterThan(0);
		expect(preview.unarchived.map((r) => r.recipeId)).toEqual([]);
		expect(preview.unchanged).toBeGreaterThan(0);
		expect(preview.drafts).toBe(db.recipeDrafts.length);
	});

	it('brings back recipes archived after that moment', () => {
		expect(value(previewCatalogueRestore(db, ctx(), '2026-10-03T12:00')).unarchived.map((r) => r.recipeId)).toContain('riso-curry-giappone');
	});

	it('republishes as new versions, archives recipes born after and records the restore', () => {
		const burgers = db.recipes.find((r) => r.id === 'hamburger-cavallo')!;
		const preview = value(previewCatalogueRestore(db, ctx(), AT));
		const drafts = structuredClone(db.recipeDrafts);
		const ratings = structuredClone(db.ratings);
		const result = value(restoreCatalogue(db, ctx(), AT));

		expect(result).toEqual({ reverted: preview.reverted.length, archived: preview.archived.length, unarchived: 0 });
		expect(burgers.version).toBe(3);
		expect(db.recipeVersions.find((v) => v.recipeId === burgers.id && v.version === 3)).toMatchObject({ restoredFrom: 1, restoredFromInstant: AT, publishedBy: 'user-federico' });
		for (const a of preview.archived) expect(db.recipes.find((r) => r.id === a.recipeId)!.status).toBe('archived');
		expect(value(listCatalogueRestores(db, ctx()))).toEqual([{ at: '2026-10-06T12:00', restoredTo: AT, byName: 'Federico', undoAt: '2026-10-06T11:59' }]);
		expect(db.recipeDrafts).toEqual(drafts);
		expect(db.ratings).toEqual(ratings);
	});

	it('can be undone by restoring the minute before it, archive state included', () => {
		value(restoreCatalogue(db, ctx({ now: '2026-10-06T11:00' }), '2026-10-03T12:00'));
		expect(db.recipes.find((r) => r.id === 'riso-curry-giappone')!.status).toBe('published');
		const archived = db.recipes.filter((r) => r.status === 'archived').map((r) => r.id);
		const undoAt = value(listCatalogueRestores(db, ctx()))[0].undoAt;
		value(restoreCatalogue(db, ctx({ now: '2026-10-06T12:05' }), undoAt));
		expect(db.recipes.find((r) => r.id === 'riso-curry-giappone')!.status).toBe('archived');
		expect(db.recipes.find((r) => r.id === 'hamburger-cavallo')!.ingredients.some((i) => i.ingredientId === 'pomodori')).toBe(true);
		for (const id of archived.filter((id) => id !== 'riso-curry-giappone')) expect(db.recipes.find((r) => r.id === id)!.status).toBe('published');
	});

	it('follows archives done by curators', () => {
		value(archiveRecipe(db, ctx({ now: '2026-10-06T09:00' }), 'hamburger-cavallo'));
		expect(catalogueAt(db, '2026-10-06T08:59').find((e) => e.recipeId === 'hamburger-cavallo')?.status).toBe('published');
		expect(catalogueAt(db, '2026-10-06T09:00').find((e) => e.recipeId === 'hamburger-cavallo')?.status).toBe('archived');
	});

	it('leaves meals readable', () => {
		value(restoreCatalogue(db, ctx(), AT));
		const week = value(getWeekView(db, ctx(), '2026-10-06'));
		expect(week.days.flatMap((d) => d.meals).some((m) => m.recipe)).toBe(true);
	});

	it('is not possible offline', () => {
		expect(restoreCatalogue(db, ctx({ offline: true }), AT)).toEqual({ ok: false, error: 'offline' });
	});
});

describe('minuteBefore', () => {
	it('crosses the hour and the day', () => {
		expect(minuteBefore('2026-10-06T00:00')).toBe('2026-10-05T23:59');
	});
});
