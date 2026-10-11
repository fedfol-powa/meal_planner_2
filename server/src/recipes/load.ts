import type { MealOccurrenceView } from '@app/contract';
import type { Tx } from '../db.ts';

/** A meal of the family citing a recipe; `past` as of the server's clock. */
export interface MealOccurrence {
	recipeId: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	passesAt: string;
	past: boolean;
}

// Lists travel as JSON text: the connection does not fetch array types (see views.ts).
const idList = (ids: string[]) => JSON.stringify(ids);

/** Published recipes the family may see in the book: those from a book only if it owns it. */
export async function loadCandidateIds(tx: Tx, familyId: string): Promise<string[]> {
	const rows = await tx<{ id: string }[]>`
		select r.id from app.recipes r
		where r.status = 'published'
			and (r.book_id is null
				or exists (select 1 from app.family_books fb where fb.family_id = ${familyId} and fb.book_id = r.book_id))`;
	return rows.map((row) => row.id);
}

/** Date each recipe was added, in the family's time zone ("recently added"). */
export async function loadAddedOn(tx: Tx, familyId: string, recipeIds: string[]): Promise<Map<string, string>> {
	const rows = await tx<{ id: string; addedOn: string }[]>`
		select r.id, to_char(r.created_at at time zone f.time_zone, 'YYYY-MM-DD') as "addedOn"
		from app.recipes r cross join app.families f
		where f.id = ${familyId} and r.id in (select jsonb_array_elements_text(${idList(recipeIds)}::text::jsonb)::uuid)`;
	return new Map(rows.map((row) => [row.id, row.addedOn]));
}

/** Meals of the family citing these recipes, most recent first by the instant they pass. */
export async function loadMealOccurrences(tx: Tx, familyId: string, recipeIds: string[]): Promise<MealOccurrence[]> {
	return tx<MealOccurrence[]>`
		select s.recipe_id as "recipeId", to_char(s.date, 'YYYY-MM-DD') as date, s.meal_type as "mealType",
			to_char(p.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "passesAt", p.at <= now() as past
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
		where w.family_id = ${familyId}
			and s.recipe_id in (select jsonb_array_elements_text(${idList(recipeIds)}::text::jsonb)::uuid)
		order by p.at desc`;
}

export async function loadSynonyms(tx: Tx, ingredientIds: string[]): Promise<Map<string, { 'it-IT': string[]; 'en-GB': string[] }>> {
	if (!ingredientIds.length) return new Map();
	const rows = await tx<{ id: string; synonyms: { 'it-IT': string[]; 'en-GB': string[] } }[]>`
		select id, synonyms from app.ingredients
		where id in (select jsonb_array_elements_text(${idList(ingredientIds)}::text::jsonb)::uuid)`;
	return new Map(rows.map((row) => [row.id, row.synonyms]));
}

/** Every meal of the recipe not yet past, soonest first. */
export const upcomingOf = (meals: MealOccurrence[], recipeId: string): MealOccurrenceView[] =>
	meals
		.filter((meal) => meal.recipeId === recipeId && !meal.past)
		.reverse()
		.map(({ date, mealType, passesAt }) => ({ date, mealType, passesAt }));
