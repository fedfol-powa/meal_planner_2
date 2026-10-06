import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { getSuggestions, nextSuggestion, rankCandidates } from './suggestions';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const slotOf = (id: string) => db.weeks.flatMap((w) => w.slots).find((s) => s.id === id)!;
const recipeOf = (id: string) => db.recipes.find((r) => r.id === id)!;

beforeEach(() => { db = createInitial().db; });

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

describe('getSuggestions', () => {
	it('returns the best five without the current dish, with ratings', () => {
		const slot = slotOf('2026-10-07-dinner');
		const ranked = rankCandidates(db, ctx(), slot).map((c) => c.recipeId);
		slot.recipeId = ranked[0];
		const result = getSuggestions(db, ctx(), slot.id);
		if (!result.ok) throw new Error(result.error);
		expect(result.value.map((s) => s.recipe.id)).toEqual(ranked.slice(1, 6));
		expect(result.value[0].rating).toHaveProperty('familyCount');
	});

	it('works for free and empty slots', () => {
		const result = getSuggestions(db, ctx(), '2026-10-10-dinner');
		expect(result.ok && result.value.length).toBe(5);
	});

	it('refuses other families and unknown slots', () => {
		expect(getSuggestions(db, ctx({ userId: 'user-tom', familyId: 'family-grandparents' }), '2026-10-07-dinner')).toEqual({ ok: false, error: 'forbidden' });
		expect(getSuggestions(db, ctx(), 'nope')).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('nextSuggestion', () => {
	it('takes the candidate after the current dish, the first one when the dish is not ranked, and wraps around', () => {
		const slot = slotOf('2026-10-07-dinner');
		const ranked = rankCandidates(db, ctx(), slot).map((c) => c.recipeId);
		expect(nextSuggestion(db, ctx(), slot.id)).toEqual({ ok: true, value: ranked[0] });
		slot.recipeId = ranked[1];
		expect(nextSuggestion(db, ctx(), slot.id)).toEqual({ ok: true, value: ranked[2] });
		slot.recipeId = ranked.at(-1)!;
		expect(nextSuggestion(db, ctx(), slot.id)).toEqual({ ok: true, value: ranked[0] });
	});

	it('returns null without candidates', () => {
		for (const r of db.recipes) db.exclusions.push({ familyId: 'family-main', recipeId: r.id, createdBy: 'user-anna', createdAt: '2026-10-06T10:00' });
		expect(nextSuggestion(db, ctx(), '2026-10-07-dinner')).toEqual({ ok: true, value: null });
	});
});
