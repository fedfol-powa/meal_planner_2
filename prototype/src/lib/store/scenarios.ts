import { createInitial, type Persisted, type ScenarioId } from './persistence';

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
