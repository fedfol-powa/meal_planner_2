import { resolveFamilySettings, normalizeRules } from '../../../domain/src/family/settings.ts';
import type { PlannerSettings } from '../../../domain/src/planner/index.ts';

// Keys of families.settings the load writes (detail spec, section 6): the stored jsonb keeps only
// changed values, so a key equal to the default is not written, and a key already saved is the
// family's own choice and is left alone. Weights are never written (scope of milestone A).
export interface SettingsWrite { path: string[]; value: unknown }

const at = (value: unknown, path: string[]): unknown =>
	path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function settingsWrites(wanted: PlannerSettings, stored: unknown): SettingsWrite[] {
	const defaults = resolveFamilySettings({});
	const candidates: SettingsWrite[] = [];
	for (const mealType of ['lunch', 'dinner'] as const)
		wanted.slots[mealType].forEach((slot, day) => {
			if (!same(slot, defaults.slots[mealType][day])) candidates.push({ path: ['slots', mealType, String(day)], value: slot });
		});
	const rules = normalizeRules(wanted.rules);
	if (!same(rules, defaults.rules)) candidates.push({ path: ['rules'], value: rules });
	if (!same(wanted.knownNew, defaults.knownNew)) candidates.push({ path: ['knownNew'], value: wanted.knownNew });
	for (const [group, range] of Object.entries(wanted.groupRanges))
		if (!same(range, defaults.groupRanges[group as keyof typeof defaults.groupRanges])) candidates.push({ path: ['groupRanges', group], value: range });
	return candidates.filter((w) => at(stored, w.path) === undefined);
}
