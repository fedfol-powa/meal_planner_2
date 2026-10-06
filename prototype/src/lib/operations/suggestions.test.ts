import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { getSuggestions, rankCandidates } from './suggestions';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const slotOf = (id: string) => db.weeks.flatMap((w) => w.slots).find((s) => s.id === id)!;
const recipeOf = (id: string) => db.recipes.find((r) => r.id === id)!;
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

// The ranking mechanics are tested on Wednesday dinner without its 20-minute limit (round 4 settings).
beforeEach(() => {
	db = createInitial().db;
	db.families.find((f) => f.id === 'family-main')!.settings.slots.dinner[2].maxMinutes = null;
});

describe('rankCandidates', () => {
	it('keeps only visible recipes suited to the meal, not used elsewhere this week or in the two weeks before', () => {
		const slot = slotOf('2026-10-07-dinner');
		const ranked = rankCandidates(db, ctx(), slot);
		expect(ranked.length).toBeGreaterThan(5);
		const usedNearby = new Set(
			db.weeks.filter((w) => w.startsOn >= '2026-09-21' && w.startsOn <= '2026-10-05').flatMap((w) => w.slots)
				.filter((s) => s.id !== slot.id).map((s) => s.recipeId)
		);
		for (const { recipeId } of ranked) {
			const recipe = recipeOf(recipeId);
			expect(recipe.status).toBe('published');
			expect(['dinner', 'both']).toContain(recipe.mealType);
			expect(usedNearby.has(recipeId)).toBe(false);
		}
	});

	it('ignores the slot\'s own recipe when filtering the week, so the order is stable while changing it', () => {
		const slot = slotOf('2026-10-07-dinner');
		const before = rankCandidates(db, ctx(), slot).map((c) => c.recipeId);
		slot.recipeId = before[2];
		expect(rankCandidates(db, ctx(), slot).map((c) => c.recipeId)).toEqual(before);
	});

	it('sorts by score, then by name', () => {
		const ranked = rankCandidates(db, ctx(), slotOf('2026-10-07-dinner'));
		for (let i = 1; i < ranked.length; i++) {
			const [a, b] = [ranked[i - 1], ranked[i]];
			expect(a.score > b.score || (a.score === b.score && a.name.localeCompare(b.name, 'it-IT') <= 0)).toBe(true);
		}
	});

	it('penalises the protein group of the meal before or after', () => {
		const slot = slotOf('2026-10-07-dinner');
		const ranked = rankCandidates(db, ctx(), slot);
		// Neighbours: Wednesday lunch (meat) and Thursday lunch (legumes).
		for (const c of ranked) {
			const group = recipeOf(c.recipeId).proteinGroup;
			expect(c.neighbourPenalty).toBe(group === 'meat' || group === 'legumes' ? 1 : 0);
		}
	});

	it('skips recipes the family excluded', () => {
		const slot = slotOf('2026-10-07-dinner');
		const top = rankCandidates(db, ctx(), slot)[0].recipeId;
		db.exclusions.push({ familyId: 'family-main', recipeId: top, createdBy: 'user-anna', createdAt: '2026-10-06T10:00' });
		expect(rankCandidates(db, ctx(), slot).map((c) => c.recipeId)).not.toContain(top);
	});
});

describe('family settings (round 4)', () => {
	it('respects the time limit, pasta only at lunch, no fish on Monday and avoided ingredients', () => {
		const main = db.families.find((f) => f.id === 'family-main')!;
		main.settings.slots.dinner[2].maxMinutes = 20;
		for (const c of rankCandidates(db, ctx(), slotOf('2026-10-07-dinner'))) {
			const recipe = recipeOf(c.recipeId);
			expect(recipe.durationMinutes).not.toBeNull();
			expect(recipe.durationMinutes!).toBeLessThanOrEqual(20);
			expect(recipe.tags).not.toContain('pasta');
		}
		for (const c of rankCandidates(db, ctx(), slotOf('2026-10-12-lunch'))) expect(recipeOf(c.recipeId).proteinGroup).not.toBe('fish');
		const withChilli = db.recipes.filter((r) => r.ingredients.some((l) => l.ingredientId === 'peperoncino-fresco')).map((r) => r.id);
		const ranked = rankCandidates(db, ctx(), slotOf('2026-10-08-dinner')).map((c) => c.recipeId);
		for (const id of withChilli) expect(ranked).not.toContain(id);
	});
});

describe('getSuggestions', () => {
	it('returns the best five without the current dish, with ratings', () => {
		const slot = slotOf('2026-10-07-dinner');
		const ranked = rankCandidates(db, ctx(), slot).map((c) => c.recipeId);
		slot.recipeId = ranked[0];
		const page = value(getSuggestions(db, ctx(), slot.id));
		expect(page.items.map((s) => s.recipe.id)).toEqual(ranked.slice(1, 6));
		expect(page.items[0].rating).toHaveProperty('familyCount');
	});

	it('pages through the next five ("Proponimene altri") and wraps to the first page', () => {
		const slot = slotOf('2026-10-07-dinner');
		const others = rankCandidates(db, ctx(), slot).map((c) => c.recipeId).filter((id) => id !== slot.recipeId);
		const first = value(getSuggestions(db, ctx(), slot.id));
		const second = value(getSuggestions(db, ctx(), slot.id, first.nextOffset));
		expect(second.items.map((s) => s.recipe.id)).toEqual(others.slice(5, 10));
		let offset = second.nextOffset;
		while (offset !== 0) offset = value(getSuggestions(db, ctx(), slot.id, offset)).nextOffset;
		expect(value(getSuggestions(db, ctx(), slot.id, offset)).items).toEqual(first.items);
	});

	it('treats an offset past the end as the first page', () => {
		const page = value(getSuggestions(db, ctx(), '2026-10-07-dinner', 999));
		expect(page.items).toEqual(value(getSuggestions(db, ctx(), '2026-10-07-dinner')).items);
	});

	it('works for free and empty slots, and returns nothing without candidates', () => {
		expect(value(getSuggestions(db, ctx(), '2026-10-10-dinner')).items).toHaveLength(5);
		for (const r of db.recipes) db.exclusions.push({ familyId: 'family-main', recipeId: r.id, createdBy: 'user-anna', createdAt: '2026-10-06T10:00' });
		expect(value(getSuggestions(db, ctx(), '2026-10-07-dinner'))).toEqual({ items: [], nextOffset: 0 });
	});

	it('refuses other families and unknown slots', () => {
		expect(getSuggestions(db, ctx({ userId: 'user-tom', familyId: 'family-grandparents' }), '2026-10-07-dinner')).toEqual({ ok: false, error: 'forbidden' });
		expect(getSuggestions(db, ctx(), 'nope')).toEqual({ ok: false, error: 'not_found' });
	});
});
