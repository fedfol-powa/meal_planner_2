import type { SuggestionsView } from '@app/contract';
import { rankSuggestions } from '@app/domain/planner';
import { loadPlannerInput } from '../menu/generation.ts';
import type { OperationContext } from '../pipeline.ts';
import { ratingSummaries, recipeSummaries, recipeViewKey } from '../recipes/views.ts';
import { readSlot } from './slots.ts';

export const SUGGESTION_PAGE = 5;
const FREE_TEXTS = 4;

/** Spec section 3, «Riuso durante la revisione»: one page of the ranking, from the planner's input. */
export async function suggestionsOf(context: OperationContext, familyId: string, slotId: string, offset: number): Promise<SuggestionsView> {
	const { tx } = context;
	const slot = await readSlot(tx, familyId, slotId);
	const input = await loadPlannerInput(tx, familyId, { weekStart: slot.startsOn });
	const others = await tx<{ date: string; mealType: 'lunch' | 'dinner'; recipeId: string }[]>`
		select date::text as date, meal_type as "mealType", recipe_id as "recipeId"
		from app.meal_slots where week_id = ${slot.weekId} and id <> ${slot.id} and recipe_id is not null`;
	const ranked = rankSuggestions(input, { date: slot.date, mealType: slot.mealType }, [...others], slot.recipeId);
	const start = offset < ranked.length ? offset : 0;
	const refs = ranked.slice(start, start + SUGGESTION_PAGE).map((recipeId) => ({ recipeId, version: null, servings: slot.servings }));
	const summaries = await recipeSummaries(tx, refs, context.locale);
	const ratings = await ratingSummaries(tx, familyId, context.userId, refs.map((r) => r.recipeId));
	const texts = await tx<{ text: string }[]>`
		select s.free_text as text from app.meal_slots s join app.weeks w on w.id = s.week_id
		where w.family_id = ${familyId} and s.free_text is not null
		group by s.free_text order by count(*) desc, s.free_text limit ${FREE_TEXTS}`;
	return {
		recipes: refs.flatMap((ref) => {
			const recipe = summaries.get(recipeViewKey(ref));
			const rating = ratings.get(ref.recipeId);
			return recipe && rating ? [{ recipe, rating }] : [];
		}),
		nextOffset: start + SUGGESTION_PAGE < ranked.length ? start + SUGGESTION_PAGE : 0,
		freeTexts: texts.map((t) => t.text),
	};
}
