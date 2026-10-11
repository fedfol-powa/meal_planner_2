import { resolveFamilySettings } from '@app/domain/family';
import { addDays, type GenerationTarget, type IngredientRestriction, type PastMeal, type PlannerInput } from '@app/domain/planner';
import { toPlannerRecipe, type RecipeDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { planWeek } from './plan.ts';

/** Serialises the generations of one family until the end of the transaction (spec section 2, concurrency). */
export async function lockFamilyWeeks(tx: Tx, familyId: string): Promise<void> {
	await tx`select pg_advisory_xact_lock(hashtextextended(${`app.weeks:${familyId}`}, 0))`;
}

/** Everything the planner reads, in the transaction's role (spec section 2). */
export async function loadPlannerInput(tx: Tx, familyId: string, target: GenerationTarget): Promise<PlannerInput> {
	const weekEnd = addDays(target.weekStart, 6);
	const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${familyId}`;
	if (!family) throw new Error('family not readable');
	const recipes = await tx<{ id: string; content: RecipeDocument }[]>`
		select r.id, v.content
		from app.recipes r join app.recipe_versions v on v.recipe_id = r.id and v.version = r.version
		where r.status = 'published'`;
	const books = await tx<{ bookId: string }[]>`select book_id as "bookId" from app.family_books where family_id = ${familyId}`;
	const exclusions = await tx<{ recipeId: string }[]>`select recipe_id as "recipeId" from app.recipe_exclusions where family_id = ${familyId}`;
	const restrictions = await tx<IngredientRestriction[]>`
		select ingredient_id as "ingredientId", restriction, weekly_max as "weeklyMax" from app.family_ingredients where family_id = ${familyId}`;
	const familyScores = await tx<{ recipeId: string; average: string }[]>`
		select recipe_id as "recipeId", average::text from app.family_scores where family_id = ${familyId}`;
	const globalScores = await tx<{ recipeId: string; average: string }[]>`select recipe_id as "recipeId", average::text from app.global_scores`;
	const meals = await tx<(PastMeal & { after: boolean })[]>`
		select s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId", s.date > ${weekEnd} as after
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.recipe_id is not null and (s.date < ${target.weekStart} or s.date > ${weekEnd})
		order by s.date, s.meal_type desc`;
	const scores = (rows: { recipeId: string; average: string }[]) => Object.fromEntries(rows.map((r) => [r.recipeId, Number(r.average)]));
	const meal = ({ date, mealType, recipeId }: PastMeal): PastMeal => ({ date, mealType, recipeId });
	return {
		familyId,
		weekStart: target.weekStart,
		settings: resolveFamilySettings(family.settings),
		recipes: recipes.map((r) => toPlannerRecipe(r.id, r.content)),
		ownedBookIds: books.map((b) => b.bookId),
		exclusions: exclusions.map((e) => e.recipeId),
		restrictions: [...restrictions],
		familyScores: scores(familyScores),
		globalScores: scores(globalScores),
		history: meals.filter((m) => !m.after).map(meal),
		upcoming: meals.filter((m) => m.after).map(meal),
		...(target.from ? { from: target.from } : {}),
	};
}

/** Creates the week if it does not exist yet (spec section 2); false when it already existed. */
export async function generateWeek(tx: Tx, familyId: string, target: GenerationTarget): Promise<boolean> {
	await lockFamilyWeeks(tx, familyId);
	const [week] = await tx<{ id: string }[]>`
		insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, ${target.weekStart}, now())
		on conflict (family_id, starts_on) do nothing returning id`;
	if (!week) return false;
	const planned = planWeek(await loadPlannerInput(tx, familyId, target));
	const rows = planned.slots.map((s) => ({
		week_id: week.id,
		date: s.date,
		meal_type: s.mealType,
		recipe_id: s.content.kind === 'recipe' ? s.content.recipeId : null,
		free_text: s.content.kind === 'free' ? s.content.text : null,
		servings: s.servings,
	}));
	if (rows.length > 0) await tx`insert into app.meal_slots ${tx(rows, 'week_id', 'date', 'meal_type', 'recipe_id', 'free_text', 'servings')}`;
	return true;
}

/** Postgres code or error class, never the message. */
export function errorCode(error: unknown): string {
	if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
	return error instanceof Error ? error.name : 'unknown';
}
