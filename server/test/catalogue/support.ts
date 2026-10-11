import type { RecipeDraftDocument } from '@app/domain/recipe';
import { setupActors, type Actor, type Actors } from '../support/actors.ts';
import { seedIngredient } from '../support/shopping-fixtures.ts';

/** Curators and members over RPC, as the web app and agents call the catalogue area. */
export interface CatalogueActors {
	actors: Actors;
	curator(options?: { locale?: 'it-IT' | 'en-GB'; agent?: boolean }): Promise<Actor>;
	member(): Promise<Actor>;
	revoke(userId: string): Promise<void>;
	/** A catalogue ingredient; `en: null` leaves the English name empty. */
	ingredient(name: string, en?: string | null): Promise<string>;
}

export async function catalogueActors(): Promise<CatalogueActors> {
	const actors = await setupActors();
	return {
		actors,
		async curator(options = {}) {
			const actor = await actors.user(options);
			await actors.db.grantGlobalRole(actor.userId, 'recipe_curator');
			return actor;
		},
		member: () => actors.user(),
		revoke: async (userId) => {
			await actors.db.admin`delete from app.user_roles where user_id = ${userId} and role = 'recipe_curator'`;
		},
		ingredient: (name, en = `${name} (en)`) => seedIngredient(actors.db, { name: { 'it-IT': name, 'en-GB': en ?? '' } }),
	};
}

export const draftContent = (name: string, over: Partial<RecipeDraftDocument> = {}): RecipeDraftDocument =>
	({ schemaVersion: 1, name: { 'it-IT': name }, ...over }) as RecipeDraftDocument;

/** A draft that passes the publication check with one line of the given ingredient. */
export const completeContent = (name: string, ingredientId: string, over: Partial<RecipeDraftDocument> = {}): RecipeDraftDocument =>
	({
		schemaVersion: 1,
		name: { 'it-IT': name, 'en-GB': `${name} (en)` },
		description: { 'it-IT': 'Descrizione', 'en-GB': 'Description' },
		sourceType: 'home',
		sourceUrl: null,
		bookId: null,
		bookPages: null,
		durationMinutes: 20,
		baseServings: 2,
		mealType: 'both',
		proteinGroup: 'vegetarian',
		isFreshFish: false,
		carbohydrateGroup: 'none',
		category: 'pan',
		hasVegetables: true,
		isHeavy: false,
		seasons: [],
		ingredients: [
			{ ingredientId, variety: null, preparation: null, quantity: { kind: 'amount', value: 200, unit: 'g' }, sourceText: '200 g', isOptional: false, isPrimary: false },
		],
		...over,
	}) as RecipeDraftDocument;

/** The data of a versioned read, failing the test on «unchanged». */
export function dataOf<T>(read: { unchanged: true } | { unchanged: false; data: T }): T {
	if (read.unchanged) throw new Error('expected data, got unchanged');
	return read.data;
}
