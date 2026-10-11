import { projectRecipe, type RecipeDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { writeInstant, type Actor } from './actor.ts';
import { loadAuthors } from './load.ts';

/**
 * A new published version (publication or restore): projections, lines, then the instant read
 * after every wait, then the immutable version and the first status change.
 */
export async function writeVersion(
	tx: Tx,
	actor: Actor,
	input: { recipeId: string; document: RecipeDocument; restoredFrom: number | null },
): Promise<{ version: number; at: Date }> {
	const [recipe] = await tx<{ status: string; version: number }[]>`select status, version from app.recipes where id = ${input.recipeId} for no key update`;
	if (!recipe) throw appError('not_found');
	const version = recipe.version + 1;
	const { recipe: p, ingredients } = projectRecipe(input.document);
	const status = recipe.status === 'draft' ? 'published' : recipe.status;
	// The projections bump catalogue_state through its trigger: this may wait for another writer.
	await tx`update app.recipes set
		status = ${status}, version = ${version}, name = ${tx.json(p.name)}, description = ${tx.json(p.description)},
		source_type = ${p.sourceType}, source_url = ${p.sourceUrl}, book_id = ${p.bookId}, book_pages = ${p.bookPages},
		duration_minutes = ${p.durationMinutes}, base_servings = ${p.baseServings}, meal_type = ${p.mealType},
		protein_group = ${p.proteinGroup}, is_fresh_fish = ${p.isFreshFish}, carbohydrate_group = ${p.carbohydrateGroup},
		category = ${p.category}, has_vegetables = ${p.hasVegetables}, is_heavy = ${p.isHeavy}, seasons = array(select jsonb_array_elements_text(${JSON.stringify(p.seasons)}::text::jsonb)),
		updated_by = ${actor.userId}, updated_at = clock_timestamp()
		where id = ${input.recipeId}`;
	await tx`delete from app.recipe_ingredients where recipe_id = ${input.recipeId}`;
	for (const l of ingredients) {
		await tx`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit,
			quantity_text, source_text, preparation, is_optional, is_primary)
			values (${input.recipeId}, ${l.position}, ${l.ingredientId}, ${l.variety ? tx.json(l.variety) : null}, ${l.varietyKey}, ${l.quantityKind},
				${l.quantity}, ${l.unit}, ${l.quantityText ? tx.json(l.quantityText) : null}, ${l.sourceText}, ${l.preparation ? tx.json(l.preparation) : null},
				${l.isOptional}, ${l.isPrimary})`;
	}
	// After every wait (locks, catalogue counter): the instant R1 compares with meals (spec section 3).
	const at = await writeInstant(tx);
	await tx`insert into app.recipe_versions (recipe_id, version, content, published_by, published_at, channel, restored_from)
		values (${input.recipeId}, ${version}, ${tx.json(input.document as never)}, ${actor.userId}, ${at}, ${actor.channel}, ${input.restoredFrom})`;
	if (recipe.status === 'draft') {
		await tx`insert into app.recipe_status_changes (recipe_id, status, changed_by, changed_at, channel)
			values (${input.recipeId}, 'published', ${actor.userId}, ${at}, ${actor.channel})`;
	}
	return { version, at };
}

/** The current version was published after the one the curator saw: they confirm before going on. */
export async function versionConflict(tx: Tx, recipeId: string, version: number): Promise<never> {
	const [v] = await tx<{ published_by: string | null; published_at: Date }[]>`
		select published_by, published_at from app.recipe_versions where recipe_id = ${recipeId} and version = ${version}`;
	const authors = await loadAuthors(tx);
	throw appError('conflict', {
		kind: 'version',
		version,
		by: v?.published_by ?? null,
		byName: v?.published_by ? (authors.get(v.published_by) ?? null) : null,
		at: (v?.published_at ?? new Date(0)).toISOString(),
	});
}
