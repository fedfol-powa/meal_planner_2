import type { Localized, Quantity } from '@app/domain/units';
import type { TestDatabase } from './db.ts';

export interface TestLine {
	ingredientId: string;
	quantity: Quantity;
	variety?: Localized;
	preparation?: Localized;
	isOptional?: boolean;
}

const slug = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/** A complete published document, as W3's publishedRecipeSchema expects it. */
export const recipeDocument = (name: string, baseServings: number, lines: TestLine[]) => ({
	schemaVersion: 1,
	name: { 'it-IT': name, 'en-GB': `${name} (en)` },
	description: { 'it-IT': 'Prova', 'en-GB': 'Test' },
	sourceType: 'home',
	sourceUrl: null,
	bookId: null,
	bookPages: null,
	durationMinutes: 20,
	baseServings,
	mealType: 'both',
	proteinGroup: 'vegetarian',
	isFreshFish: false,
	carbohydrateGroup: 'none',
	category: 'pan',
	hasVegetables: true,
	isHeavy: false,
	seasons: [],
	ingredients: lines.map((l) => ({
		ingredientId: l.ingredientId,
		variety: l.variety ?? null,
		preparation: l.preparation ?? null,
		quantity: l.quantity,
		sourceText: 'test',
		isOptional: l.isOptional ?? false,
		isPrimary: false,
	})),
});

export async function seedIngredient(
	db: TestDatabase,
	options: { name: Localized | string; department?: string; isPantry?: boolean },
): Promise<string> {
	const name = typeof options.name === 'string' ? { 'it-IT': options.name, 'en-GB': `${options.name} (en)` } : options.name;
	const [{ id }] = await db.admin<{ id: string }[]>`
		insert into app.ingredients (slug, name, department, is_pantry)
		values (${slug('ing')}, ${db.admin.json(name)}, ${options.department ?? 'produce'}, ${options.isPantry ?? false})
		returning id`;
	return id;
}

export async function seedPublishedRecipe(
	db: TestDatabase,
	options: { name: string; baseServings: number; lines: TestLine[]; publishedAt?: Date },
): Promise<{ recipeId: string; version: number }> {
	const doc = recipeDocument(options.name, options.baseServings, options.lines);
	const [{ id }] = await db.admin<{ id: string }[]>`
		insert into app.recipes (slug, status, version, name, description, source_type, duration_minutes, base_servings,
			protein_group, is_fresh_fish, carbohydrate_group, has_vegetables, category, meal_type, is_heavy)
		values (${slug('recipe')}, 'published', 1, ${db.admin.json(doc.name)}, ${db.admin.json(doc.description)}, 'home', 20,
			${options.baseServings}, 'vegetarian', false, 'none', true, 'pan', 'both', false)
		returning id`;
	await db.admin`
		insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
		values (${id}, 1, ${db.admin.json(doc as never)}, ${options.publishedAt ?? new Date('2026-01-01T00:00:00Z')}, 'import')`;
	return { recipeId: id, version: 1 };
}

/** A new version of the recipe, current from `publishedAt`. */
export async function republish(db: TestDatabase, recipeId: string, name: string, baseServings: number, lines: TestLine[], publishedAt: Date): Promise<number> {
	const [{ version }] = await db.admin<{ version: number }[]>`select version + 1 as version from app.recipes where id = ${recipeId}`;
	const doc = recipeDocument(name, baseServings, lines);
	await db.admin`
		insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
		values (${recipeId}, ${version}, ${db.admin.json(doc as never)}, ${publishedAt}, 'import')`;
	await db.admin`update app.recipes set version = ${version}, base_servings = ${baseServings} where id = ${recipeId}`;
	return version;
}

/** An imported recipe never published: only name and description, status draft. */
export async function seedDraftRecipe(db: TestDatabase, name: string): Promise<string> {
	const [{ id }] = await db.admin<{ id: string }[]>`
		insert into app.recipes (slug, name, description)
		values (${slug('draft')}, ${db.admin.json({ 'it-IT': name, 'en-GB': `${name} (en)` })}, ${db.admin.json({ 'it-IT': 'Bozza', 'en-GB': 'Draft' })})
		returning id`;
	return id;
}

export interface TestSlot {
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId?: string;
	freeText?: string;
	servings: number;
}

export async function seedWeek(db: TestDatabase, familyId: string, startsOn: string, slots: TestSlot[]): Promise<{ weekId: string; slotIds: string[] }> {
	const [{ id: weekId }] = await db.admin<{ id: string }[]>`
		insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, ${startsOn}, now()) returning id`;
	const slotIds: string[] = [];
	for (const slot of slots) {
		const [{ id }] = await db.admin<{ id: string }[]>`
			insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings)
			values (${weekId}, ${slot.date}, ${slot.mealType}, ${slot.recipeId ?? null}, ${slot.freeText ?? null}, ${slot.servings})
			returning id`;
		slotIds.push(id);
	}
	return { weekId, slotIds };
}

export async function seedShoppingEquivalence(
	db: TestDatabase,
	options: { ingredientId: string; fromUnit: string; toUnit: string; factor: number; preparation?: string },
): Promise<void> {
	await db.admin`
		insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source)
		values (${options.ingredientId}, ${options.fromUnit}, ${options.toUnit}, ${options.factor}, 'shopping', ${options.preparation ?? null}, 'test')`;
}

export async function avoidIngredient(db: TestDatabase, familyId: string, ingredientId: string): Promise<void> {
	await db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction) values (${familyId}, ${ingredientId}, 'avoid')`;
}

export const grams = (value: number): Quantity => ({ kind: 'amount', value, unit: 'g' });
export const pieces = (value: number): Quantity => ({ kind: 'amount', value, unit: 'piece' });
