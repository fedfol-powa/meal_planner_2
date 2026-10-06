import type { DemoDatabase, LocalDateTime } from '#lib/domain/types.ts';
import { createSeedDatabase } from '#lib/demo-data/seed.ts';

export type ScenarioId = 'standard' | 'new_family' | 'empty_today';

export interface PrototypeSettings {
	userId: string;
	familyId: string;
	now: LocalDateTime;
	offline: boolean;
	scenario: ScenarioId;
}

export interface Persisted {
	version: 15;
	db: DemoDatabase;
	settings: PrototypeSettings;
}

// Bump version and key whenever seed ids or settings change, so testers get fresh demo data.
export const STORAGE_KEY = 'app-famiglia-prototype-v15';

export function createInitial(): Persisted {
	return {
		version: 15,
		db: createSeedDatabase(),
		settings: {
			userId: 'user-federico',
			familyId: 'family-main',
			now: '2026-10-06T12:00',
			offline: false,
			scenario: 'standard'
		}
	};
}

function isPersisted(value: unknown): value is Persisted {
	const v = value as Persisted | null;
	if (!v || v.version !== 15 || !Array.isArray(v.db?.users) || !Array.isArray(v.db?.families) || !Array.isArray(v.db?.weeks)) return false;
	const s = v.settings;
	return (
		!!s &&
		v.db.users.some((u) => u.id === s.userId) &&
		v.db.families.some((f) => f.id === s.familyId && f.members.some((m) => m.userId === s.userId)) &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.now) &&
		['standard', 'new_family', 'empty_today'].includes(s.scenario) &&
		Array.isArray(v.db.exclusions) &&
		Array.isArray(v.db.mealChanges) &&
		Array.isArray(v.db.familyIngredients) &&
		Array.isArray(v.db.shoppingLists)
	);
}

export function loadPersisted(storage: Pick<Storage, 'getItem'> | null): Persisted {
	try {
		const raw = storage?.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (isPersisted(parsed)) return parsed;
		}
	} catch {
		// Private browsing, blocked storage or corrupt data: start from the seed.
	}
	return createInitial();
}

export function savePersisted(storage: Pick<Storage, 'setItem'> | null, value: Persisted): void {
	try {
		storage?.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// The prototype keeps working in memory when storage is unavailable.
	}
}
