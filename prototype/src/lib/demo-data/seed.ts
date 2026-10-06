import type { DemoDatabase, Rating } from '#lib/domain/types.ts';
import data from './generated.json';

// Demo people: Federico from the origin project, the others invented for the prototype.
export function createSeedDatabase(): DemoDatabase {
	const generated = structuredClone(data) as unknown as Omit<DemoDatabase, 'users' | 'families' | 'ratings' | 'exclusions' | 'mealChanges'> & {
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
	const thursdayLunch = current?.slots.find((s) => s.id === '2026-10-08-lunch');
	if (thursdayLunch) Object.assign(thursdayLunch, { updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30', note: 'Doppia dose, avanza per venerdì' });

	return {
		users: [
			{ id: 'user-federico', displayName: 'Federico', locale: 'it-IT', globalRoles: ['recipe_curator', 'app_admin'] },
			{ id: 'user-anna', displayName: 'Anna', locale: 'it-IT', globalRoles: [] },
			{ id: 'user-tom', displayName: 'Tom', locale: 'en-GB', globalRoles: [] },
			{ id: 'user-lucia', displayName: 'Lucia', locale: 'it-IT', globalRoles: [] }
		],
		families: [
			{
				id: 'family-main',
				name: 'Famiglia Folloni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-federico', role: 'family_admin' },
					{ userId: 'user-anna', role: 'member' },
					{ userId: 'user-tom', role: 'member' }
				],
				bookIds: generated.books.map((b) => b.id)
			},
			{
				id: 'family-grandparents',
				name: 'Nonni',
				measurementSystem: 'metric',
				timeZone: 'Europe/Rome',
				members: [
					{ userId: 'user-lucia', role: 'family_admin' },
					{ userId: 'user-federico', role: 'member' }
				],
				bookIds: []
			}
		],
		books: generated.books,
		ingredients: generated.ingredients,
		recipes: generated.recipes,
		weeks,
		ratings,
		exclusions: [],
		mealChanges: []
	};
}
