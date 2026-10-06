import type { DemoDatabase, FamilySettings, Rating, SlotSetting } from '#lib/domain/types.ts';
import { defaultSettings } from '#lib/domain/settings.ts';
import type { OperationContext } from '#lib/operations/context.ts';
import { addManualItem, getWeekShoppingList, toggleShoppingItem } from '#lib/operations/shopping-lists.ts';
import data from './generated.json';

// Demo people: Federico from the origin project, the others invented for the prototype.
export function createSeedDatabase(): DemoDatabase {
	const generated = structuredClone(data) as unknown as Omit<DemoDatabase, 'users' | 'families' | 'ratings' | 'exclusions' | 'mealChanges' | 'familyIngredients' | 'shoppingLists' | 'invitations' | 'removals'> & {
		federicoRatings: { recipeId: string; stars: number }[];
	};
	const ratings: Rating[] = generated.federicoRatings.map((r) => ({ userId: 'user-federico', ...r }));
	// Deterministic invented ratings so averages differ from Federico's own.
	generated.federicoRatings.forEach((r, index) => {
		if (index % 2 === 0) ratings.push({ userId: 'user-anna', recipeId: r.recipeId, stars: Math.max(1, r.stars - 1) });
		if (index % 3 === 0) ratings.push({ userId: 'user-tom', recipeId: r.recipeId, stars: Math.min(5, r.stars + 1) });
	});

	const weeks = generated.weeks;
	const current = weeks.find((w) => w.startsOn === '2026-10-05');
	const mondayDinner = current?.slots.find((s) => s.id === '2026-10-05-dinner');
	if (mondayDinner) Object.assign(mondayDinner, { updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10' });
	// Marco changed a meal before being removed: it now shows "ex membro".
	const wednesdayLunch = current?.slots.find((s) => s.id === '2026-10-07-lunch');
	if (wednesdayLunch) Object.assign(wednesdayLunch, { updatedBy: 'user-marco', updatedAt: '2026-10-01T20:40' });
	const thursdayLunch = current?.slots.find((s) => s.id === '2026-10-08-lunch');
	if (thursdayLunch) Object.assign(thursdayLunch, { updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30', note: 'Doppia dose, avanza per venerdì' });

	const db: DemoDatabase = {
		users: [
			{ id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT', globalRoles: ['recipe_curator', 'app_admin'] },
			{ id: 'user-anna', displayName: 'Anna', email: 'anna@example.com', locale: 'it-IT', globalRoles: [] },
			{ id: 'user-tom', displayName: 'Tom', email: 'tom@example.com', locale: 'en-GB', globalRoles: [] },
			{ id: 'user-lucia', displayName: 'Lucia', email: 'lucia@example.com', locale: 'it-IT', globalRoles: [] },
			// Round 4: removed from the Folloni family after receiving a link still valid (review R2).
			{ id: 'user-marco', displayName: 'Marco', email: 'marco@example.com', locale: 'it-IT', globalRoles: [] },
			// Round 4: new user without families.
			{ id: 'user-giulia', displayName: 'Giulia', email: 'giulia@example.com', locale: 'it-IT', globalRoles: [] }
		],
		families: [
			{
				id: 'family-main',
				name: 'Famiglia Folloni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-federico', role: 'family_admin', joinedAt: '2026-09-14T21:00' },
					{ userId: 'user-anna', role: 'member', joinedAt: '2026-09-15T08:10' },
					{ userId: 'user-tom', role: 'member', joinedAt: '2026-09-18T19:30' }
				],
				bookIds: generated.books.map((b) => b.id),
				settings: folloniSettings(),
				createdAt: '2026-09-14T21:00',
				showSetupCard: false
			},
			{
				id: 'family-grandparents',
				name: 'Nonni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-lucia', role: 'family_admin', joinedAt: '2026-09-20T10:00' },
					{ userId: 'user-federico', role: 'member', joinedAt: '2026-09-20T10:30' }
				],
				bookIds: [],
				settings: defaultSettings(),
				createdAt: '2026-09-20T10:00',
				showSetupCard: false
			}
		],
		books: generated.books,
		ingredients: generated.ingredients,
		recipes: generated.recipes,
		weeks,
		ratings,
		exclusions: [],
		mealChanges: [],
		// Invented for the prototype: shows the "avoided" part of the shopping list.
		familyIngredients: [{ familyId: 'family-main', ingredientId: 'peperoncino-fresco', restriction: 'avoid', weeklyMax: null }],
		shoppingLists: [],
		// Invented for round 4: one valid link created before Marco's removal, one expired, one revoked.
		invitations: [
			{ token: 'folloni-k7m2q', familyId: 'family-main', createdBy: 'user-federico', createdAt: '2026-10-01T21:15', expiresAt: '2026-10-08T21:15', revokedAt: null },
			{ token: 'folloni-old9x', familyId: 'family-main', createdBy: 'user-federico', createdAt: '2026-09-15T08:00', expiresAt: '2026-09-22T08:00', revokedAt: null },
			{ token: 'folloni-rev4t', familyId: 'family-main', createdBy: 'user-federico', createdAt: '2026-10-02T09:00', expiresAt: '2026-10-09T09:00', revokedAt: '2026-10-02T18:00' }
		],
		removals: [{ familyId: 'family-main', userId: 'user-marco', removedBy: 'user-federico', removedAt: '2026-10-03T10:00' }]
	};
	addDemoShoppingLists(db);
	return db;
}

const slot = (servings: number, fixedText: string | null = null, maxMinutes: number | null = null): SlotSetting => ({ servings, fixedText, maxMinutes });

// From the origin project's rules (../meal_planner/progetto/REGOLE.md, read only): diners matrix, Saturday
// dinner free, Sunday lunch pizza, quick Monday and Wednesday dinners, pasta only at lunch, fish on Friday,
// no fresh fish on Monday, 7 known and 5 new recipes ± 1.
function folloniSettings(): FamilySettings {
	const settings = defaultSettings();
	settings.slots.lunch = [slot(2), slot(3), slot(3), slot(3), slot(3), slot(4), slot(4, 'Pizza')];
	settings.slots.dinner = [slot(2, null, 20), slot(4), slot(2, null, 20), slot(4), slot(4), slot(4, 'Cena libera'), slot(4)];
	settings.rules = [
		{ id: 'rule-pasta-lunch', kind: 'only_lunch', dish: 'pasta' },
		{ id: 'rule-friday-fish', kind: 'at_least_one', group: 'fish', weekday: 4 },
		{ id: 'rule-monday-fish', kind: 'never_on', group: 'fish', weekday: 0 }
	];
	return settings;
}

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(`Demo shopping list: ${r.error}`);
	return r.value;
};

// Built with the same operations the app uses: the list of the week of 28 September all ticked by
// Federico, the list of this week partly ticked by Anna with a free item.
function addDemoShoppingLists(db: DemoDatabase) {
	const at = (userId: string, now: string): OperationContext => ({ userId, familyId: 'family-main', channel: 'web', now, offline: false });
	const federico = at('user-federico', '2026-09-26T11:20');
	for (const group of value(getWeekShoppingList(db, federico, '2026-09-28')).departments)
		for (const item of group.items) value(toggleShoppingItem(db, federico, '2026-09-28', item.id));

	const anna = at('user-anna', '2026-10-05T19:05');
	for (const id of ['fusilloni', 'speck-da-tagliare-a-cubetti', 'panini-per-hamburger']) value(toggleShoppingItem(db, anna, '2026-10-05', id));
	value(addManualItem(db, at('user-anna', '2026-10-05T19:10'), '2026-10-05', 'Detersivo per i piatti'));
}
