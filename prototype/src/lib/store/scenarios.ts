import type { DemoDatabase } from '#lib/domain/types.ts';
import { createInitial, type Persisted, type ScenarioId } from './persistence';

/** Family to show after switching user: the current one if the user belongs to it, null without families. */
export function familyForUser(db: DemoDatabase, userId: string | null, currentFamilyId: string | null): string | null {
	if (!userId) return null;
	const families = db.families.filter((f) => f.members.some((m) => m.userId === userId));
	return (families.find((f) => f.id === currentFamilyId) ?? families[0])?.id ?? null;
}

export function applyScenario(id: ScenarioId, keep?: Pick<Persisted['settings'], 'variants' | 'guestLocale'>): Persisted {
	const state = createInitial();
	state.settings.scenario = id;
	if (keep) Object.assign(state.settings, keep);
	if (id === 'new_family') {
		state.settings.familyId = 'family-grandparents';
	}
	if (id === 'empty_today') {
		const today = state.settings.now.slice(0, 10);
		for (const week of state.db.weeks) week.slots = week.slots.filter((slot) => slot.date !== today);
	}
	// Signed out, as someone opening the app for the first time (round 4).
	if (id === 'new_user') {
		state.settings.userId = null;
		state.settings.familyId = null;
	}
	return state;
}
