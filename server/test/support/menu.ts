import type { ProteinGroup } from '@app/domain/planner';
import type { Claims } from '../../src/auth.ts';
import { catalogueFixture } from '../recipes/fixtures.ts';
import type { TestDatabase } from './db.ts';

export interface MenuRecipeFixture {
	/** Italian name; the English one is the same with " (en)". */
	name: string;
	mealType: 'lunch' | 'dinner' | 'both';
	proteinGroup: ProteinGroup;
	durationMinutes: number;
	publishedAt: string;
	/** Lines of 100 g each; one new ingredient when not given. */
	ingredientIds: string[];
	bookId: string | null;
}

let counter = 0;

/** Menu rows on top of the catalogue fixtures of the recipe book (W6), written as the database owner. */
export function menuFixtures(db: TestDatabase) {
	const { admin } = db;
	const cat = catalogueFixture(db);
	const italianNames = new Map<string, string>();
	const ingredient = () => cat.ingredient('ing', { 'it-IT': 'Ingrediente', 'en-GB': 'Ingredient' });
	return {
		ingredient,
		book: (title = 'Libro di prova') => cat.book('book', title),
		/** Published, version 1. */
		async publishRecipe(over: Partial<MenuRecipeFixture> = {}): Promise<string> {
			const name = over.name ?? `Ricetta ${counter++}`;
			const ingredientIds = over.ingredientIds ?? [await ingredient()];
			const id = await cat.recipe({
				name: { 'it-IT': name, 'en-GB': `${name} (en)` },
				mealType: over.mealType ?? 'both',
				proteinGroup: over.proteinGroup ?? 'vegetarian',
				durationMinutes: over.durationMinutes ?? 20,
				bookId: over.bookId ?? null,
				baseServings: 2,
				createdAt: new Date(over.publishedAt ?? '2026-01-01T00:00:00Z'),
				lines: ingredientIds.map((ingredientId) => ({ ingredientId, quantity: { kind: 'amount', value: 100, unit: 'g' } })),
			});
			italianNames.set(id, name);
			return id;
		},
		/** A new version with a different Italian name (" vN"), made current. */
		async publishVersion(recipeId: string, publishedAt: string): Promise<number> {
			const [{ version }] = await admin<{ version: number }[]>`select version + 1 as version from app.recipes where id = ${recipeId}`;
			const base = italianNames.get(recipeId) ?? 'Ricetta';
			return cat.publishVersion(recipeId, { name: { 'it-IT': `${base} v${version}`, 'en-GB': `${base} (en)` } }, new Date(publishedAt));
		},
		/** Never published, with the Italian name only. */
		draftRecipe: (name: string) => cat.draft({ 'it-IT': name }),
		async insertWeek(familyId: string, startsOn: string): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, ${startsOn}, now()) returning id`;
			return id;
		},
		async insertSlot(weekId: string, s: { date: string; mealType: 'lunch' | 'dinner'; recipeId?: string; freeText?: string; servings?: number; updatedBy?: string }): Promise<string> {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings, updated_by)
				values (${weekId}, ${s.date}, ${s.mealType}, ${s.recipeId ?? null}, ${s.freeText ?? null}, ${s.servings ?? 2}, ${s.updatedBy ?? null}) returning id`;
			return id;
		},
		async setTimeZone(familyId: string, timeZone: string) {
			await admin`update app.families set time_zone = ${timeZone} where id = ${familyId}`;
		},
		/** Test families are born "now", after the fixed instants of the tests: the notice needs an older one (spec W24). */
		async setFamilyCreatedAt(familyId: string, at: string) {
			await admin`update app.families set created_at = ${at} where id = ${familyId}`;
		},
		/** A new user, member of a new family, with the claims of a verified web token. */
		async member(options: { locale?: 'it-IT' | 'en-GB' } = {}) {
			const { userId, sessionId } = await db.createUser(options);
			const familyId = await db.createFamily([{ userId, role: 'member' }]);
			const claims = { sub: userId, role: 'authenticated', session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 } as Claims;
			return { userId, sessionId, familyId, claims };
		},
	};
}
