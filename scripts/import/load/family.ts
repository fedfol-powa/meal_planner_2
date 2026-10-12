import type { IsoDate } from '../../../domain/src/planner/index.ts';
import type { Tx } from '../../../server/src/db.ts';
import type { HistoryFinding } from '../family.ts';
import type { OriginRecipe } from '../../planner-data/origin.ts';
import type { Counted } from './catalogue.ts';
import type { OriginMenu } from './menus.ts';
import type { ConditionalPreference } from './preferences.ts';
import type { WeeksPlan } from './weeks-plan.ts';

// Family writes of the production load (detail spec, section 6): only additions, never an overwrite.
export interface FamilyResult {
	settings: number;
	restrictions: Counted;
	books: Counted;
	tried: Counted;
	ratings: Counted & { pending: string[] };
	weeks: { created: number; present: number; slots: number };
	missingRecipes: string[];
	duplicates: WeeksPlan['duplicates'];
	notes: WeeksPlan['notes'];
	ownedBooks: string[];
	findings: HistoryFinding[];
	preferences: ConditionalPreference[];
}

export const emptyFamilyResult = (): FamilyResult => ({
	settings: 0,
	restrictions: { created: 0, present: 0 },
	books: { created: 0, present: 0 },
	tried: { created: 0, present: 0 },
	ratings: { created: 0, present: 0, pending: [] },
	weeks: { created: 0, present: 0, slots: 0 },
	missingRecipes: [],
	duplicates: [],
	notes: [],
	ownedBooks: [],
	findings: [],
	preferences: [],
});

export async function loadFamily(
	_tx: Tx,
	_args: { familyId: string; curatorId: string; storedSettings: unknown; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] },
): Promise<FamilyResult> {
	return emptyFamilyResult();
}
