import type { DemoDatabase } from '#lib/domain/types.ts';
import { createInitial, type Persisted, type ScenarioId } from './persistence';

/** Family to show after switching user: the current one if the user belongs to it. */
export function familyForUser(db: DemoDatabase, userId: string, currentFamilyId: string): string {
	const families = db.families.filter((f) => f.members.some((m) => m.userId === userId));
	return (families.find((f) => f.id === currentFamilyId) ?? families[0])?.id ?? currentFamilyId;
}

export function applyScenario(id: ScenarioId): Persisted {
	const state = createInitial();
	state.settings.scenario = id;
	if (id === 'new_family') {
		state.settings.familyId = 'family-grandparents';
	}
	if (id === 'empty_today') {
		const today = state.settings.now.slice(0, 10);
		for (const week of state.db.weeks) week.slots = week.slots.filter((slot) => slot.date !== today);
	}
	return state;
}
