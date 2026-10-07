import { LOCALES, type DemoDatabase, type Locale, type LocalDateTime } from '#lib/domain/types.ts';
import { createSeedDatabase } from '#lib/demo-data/seed.ts';

export const SCENARIOS = ['standard', 'new_family', 'empty_today', 'new_user'] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export interface PrototypeSettings {
	/** null when signed out (simulated sign-in, round 4). */
	userId: string | null;
	/** null when the user belongs to no family. */
	familyId: string | null;
	/** Language before signing in, detected from the browser. */
	guestLocale: Locale;
	now: LocalDateTime;
	offline: boolean;
	scenario: ScenarioId;
	/** Round 5 variants, chosen in the review: recipe form on one page or in steps, languages stacked or switched. */
	variants: PrototypeVariants;
}

export interface PrototypeVariants {
	recipeForm: 'sections' | 'steps';
	formLanguages: 'stacked' | 'switch';
	/** Added after the first review on iPhone; saved states without it get the default. */
	draftList: 'cards' | 'strip' | 'rows';
}

export const DEFAULT_VARIANTS: PrototypeVariants = { recipeForm: 'sections', formLanguages: 'stacked', draftList: 'cards' };

export interface Persisted {
	version: 21;
	db: DemoDatabase;
	settings: PrototypeSettings;
}

// Bump version and key whenever seed ids or settings change, so testers get fresh demo data.
export const STORAGE_KEY = 'app-famiglia-prototype-v21';

/** First language (round 4 default): Italian browsers get it-IT, every other browser en-GB. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
	return languages?.[0]?.toLowerCase().startsWith('it') ? 'it-IT' : 'en-GB';
}

function browserLanguages(): readonly string[] | undefined {
	return typeof navigator === 'undefined' ? undefined : navigator.languages;
}

export function createInitial(): Persisted {
	return {
		version: 21,
		db: createSeedDatabase(),
		settings: {
			userId: 'user-federico',
			familyId: 'family-main',
			guestLocale: detectLocale(browserLanguages()),
			now: '2026-10-06T12:00',
			offline: false,
			scenario: 'standard',
			variants: { ...DEFAULT_VARIANTS }
		}
	};
}

function isPersisted(value: unknown): value is Persisted {
	const v = value as Persisted | null;
	if (!v || v.version !== 21 || !Array.isArray(v.db?.users) || !Array.isArray(v.db?.families) || !Array.isArray(v.db?.weeks)) return false;
	const s = v.settings;
	return (
		!!s &&
		(s.userId === null || v.db.users.some((u) => u.id === s.userId)) &&
		(s.familyId === null || v.db.families.some((f) => f.id === s.familyId && f.members.some((m) => m.userId === s.userId))) &&
		(LOCALES as readonly string[]).includes(s.guestLocale) &&
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.now) &&
		(SCENARIOS as readonly string[]).includes(s.scenario) &&
		['sections', 'steps'].includes(s.variants?.recipeForm) &&
		['stacked', 'switch'].includes(s.variants?.formLanguages) &&
		Array.isArray(v.db.invitations) &&
		Array.isArray(v.db.removals) &&
		Array.isArray(v.db.recipeVersions) &&
		Array.isArray(v.db.recipeDrafts) &&
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
			if (isPersisted(parsed)) {
				parsed.settings.variants = { ...DEFAULT_VARIANTS, ...parsed.settings.variants };
				return parsed;
			}
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
