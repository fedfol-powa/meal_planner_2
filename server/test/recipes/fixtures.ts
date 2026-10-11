import type { ProteinGroup } from '@app/domain/planner';
import { publishedRecipeSchema } from '@app/domain/recipe';
import type { Locale, Localized, Quantity } from '@app/domain/units';
import type { TestDatabase } from '../support/db.ts';

export interface RecipeFixture {
	name: Localized;
	description?: Localized;
	durationMinutes?: number;
	baseServings?: number;
	mealType?: 'lunch' | 'dinner' | 'both';
	proteinGroup?: ProteinGroup;
	bookId?: string | null;
	bookPages?: string | null;
	sourceUrl?: string | null;
	createdAt?: Date;
	lines?: { ingredientId: string; quantity: Quantity; variety?: Localized; preparation?: Localized; isOptional?: boolean }[];
}

type PartialText = Partial<Record<Locale, string | null>>;

export interface CatalogueFixture {
	ingredient(slug: string, name: Localized, synonyms?: { 'it-IT': string[]; 'en-GB': string[] }): Promise<string>;
	book(slug: string, title: string): Promise<string>;
	/** Published, version 1. */
	recipe(options: RecipeFixture): Promise<string>;
	publishVersion(recipeId: string, changes: Partial<RecipeFixture>, publishedAt?: Date): Promise<number>;
	/** Never published: name and description only, as the projections of a new draft. */
	draft(name: PartialText, description?: PartialText | null): Promise<string>;
	archive(recipeId: string): Promise<void>;
	/** A meal slot of the family citing the recipe; returns the slot id. */
	meal(familyId: string, recipeId: string, date: string, mealType: 'lunch' | 'dinner', servings?: number): Promise<string>;
	rate(userId: string, recipeId: string, stars: number): Promise<void>;
}

/** Makes this test's recipes easy to find in the database shared by every test file. */
export const marker = () => `m${crypto.randomUUID().slice(0, 6)}`;
const unique = (slug: string) => `${slug}-${crypto.randomUUID().slice(0, 8)}`;

/** `defaultLine`: the ingredient of the line used when the fixture gives none (W3 publishes at least one). */
function documentOf(r: RecipeFixture, defaultLine: string) {
	const sourceType = r.bookId ? 'book' : r.sourceUrl ? 'web' : 'home';
	const lines = r.lines?.length ? r.lines : [{ ingredientId: defaultLine, quantity: { kind: 'to_taste' } as Quantity }];
	return {
		schemaVersion: 1,
		name: r.name,
		description: r.description ?? { 'it-IT': `${r.name['it-IT']}, descrizione`, 'en-GB': `${r.name['en-GB']}, description` },
		sourceType,
		sourceUrl: r.sourceUrl ?? null,
		bookId: r.bookId ?? null,
		bookPages: r.bookId ? (r.bookPages ?? '12') : null,
		durationMinutes: r.durationMinutes ?? 30,
		baseServings: r.baseServings ?? 2,
		mealType: r.mealType ?? 'both',
		proteinGroup: r.proteinGroup ?? 'vegetarian',
		isFreshFish: false,
		carbohydrateGroup: 'pasta',
		category: 'pan',
		hasVegetables: true,
		isHeavy: false,
		seasons: [],
		ingredients: lines.map((l) => ({
			ingredientId: l.ingredientId,
			variety: l.variety ?? null,
			preparation: l.preparation ?? null,
			quantity: l.quantity,
			sourceText: 'source line',
			isOptional: l.isOptional ?? false,
			isPrimary: false,
		})),
	};
}

/** Catalogue rows written as the database owner, like the import would. */
export function catalogueFixture(db: TestDatabase): CatalogueFixture {
	const { admin } = db;
	const current = new Map<string, RecipeFixture>();
	let salt: string | undefined;

	async function writeVersion(recipeId: string, r: RecipeFixture, version: number) {
		salt ??= (
			await admin<{ id: string }[]>`
				insert into app.ingredients (slug, name, department, is_pantry)
				values (${unique('salt')}, ${admin.json({ 'it-IT': 'Sale', 'en-GB': 'Salt' })}, 'condiments', true)
				returning id`
		)[0].id;
		// A fixture that W3 would refuse fails here, not in the code under test.
		const d = publishedRecipeSchema.parse(documentOf(r, salt));
		await admin`
			update app.recipes set status = 'published', version = ${version},
				name = ${admin.json(d.name)}, description = ${admin.json(d.description)}, source_type = ${d.sourceType},
				source_url = ${d.sourceUrl}, book_id = ${d.bookId}, book_pages = ${d.bookPages},
				duration_minutes = ${d.durationMinutes}, base_servings = ${d.baseServings}, protein_group = ${d.proteinGroup},
				is_fresh_fish = false, carbohydrate_group = 'pasta', has_vegetables = true, category = 'pan',
				meal_type = ${d.mealType}, is_heavy = false
			where id = ${recipeId}`;
		await admin`delete from app.recipe_ingredients where recipe_id = ${recipeId}`;
		for (const [position, line] of d.ingredients.entries()) {
			const q = line.quantity;
			await admin`
				insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key,
					quantity_kind, quantity, unit, quantity_text, source_text, preparation, is_optional)
				values (${recipeId}, ${position}, ${line.ingredientId}, ${line.variety ? admin.json(line.variety) : null},
					${line.variety?.['it-IT'].toLowerCase() ?? ''}, ${q.kind}, ${q.kind === 'amount' ? q.value : null},
					${q.kind === 'amount' ? q.unit : null}, ${q.kind === 'text' ? admin.json(q.text) : null},
					${line.sourceText}, ${line.preparation ? admin.json(line.preparation) : null}, ${line.isOptional})`;
		}
		await admin`
			insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
			values (${recipeId}, ${version}, ${admin.json(d)}, ${r.createdAt ?? new Date()}, 'import')`;
	}

	return {
		async ingredient(slug, name, synonyms = { 'it-IT': [], 'en-GB': [] }) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.ingredients (slug, name, synonyms, department)
				values (${unique(slug)}, ${admin.json(name)}, ${admin.json(synonyms)}, 'produce') returning id`;
			return id;
		},
		async book(slug, title) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.books (slug, title) values (${unique(slug)}, ${title}) returning id`;
			return id;
		},
		async recipe(r) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.recipes (slug, created_at) values (${unique('r')}, ${r.createdAt ?? new Date()}) returning id`;
			await writeVersion(id, r, 1);
			current.set(id, r);
			return id;
		},
		async publishVersion(recipeId, changes, publishedAt = new Date()) {
			const [{ version }] = await admin<{ version: number }[]>`
				select version + 1 as version from app.recipes where id = ${recipeId}`;
			const next = { ...current.get(recipeId)!, ...changes, createdAt: publishedAt };
			await writeVersion(recipeId, next, version);
			current.set(recipeId, next);
			return version;
		},
		async draft(name, description = null) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.recipes (slug, name, description)
				values (${unique('d')}, ${admin.json(name)}, ${description ? admin.json(description) : null}) returning id`;
			return id;
		},
		async archive(recipeId) {
			await admin`update app.recipes set status = 'archived', archived_at = now() where id = ${recipeId}`;
		},
		async meal(familyId, recipeId, date, mealType, servings = 2) {
			const monday = new Date(`${date}T12:00:00Z`);
			monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
			const startsOn = monday.toISOString().slice(0, 10);
			const [week] = await admin<{ id: string }[]>`
				insert into app.weeks (family_id, starts_on) values (${familyId}, ${startsOn})
				on conflict (family_id, starts_on) do update set starts_on = excluded.starts_on returning id`;
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
				values (${week.id}, ${date}, ${mealType}, ${recipeId}, ${servings}) returning id`;
			return id;
		},
		async rate(userId, recipeId, stars) {
			await admin`
				insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${recipeId}, ${stars})
				on conflict (user_id, recipe_id) do update set stars = excluded.stars`;
		},
	};
}
