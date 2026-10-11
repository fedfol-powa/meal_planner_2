import type { MealView, WeekView } from '@app/contract';
import { addDays } from '@app/domain/planner';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import { recipeViewKey, recipeViews, type RecipeRef } from '../recipes/views.ts';
import { mealRecipeVersionsAt } from './versions.ts';

interface SlotRow {
	id: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	/** Family local time, YYYY-MM-DDTHH:mm; null when the app wrote the slot. */
	changedAt: string | null;
	/** null when the author is not (or no longer) a member. */
	authorName: string | null;
}

/**
 * Spec section 5.3: the week's slots, the version of each meal (R1) and the recipe views of W6, in a
 * few queries. R1 uses the request's instant, the same one the version of getWeek counts past meals at.
 */
export async function weekViewOf(context: OperationContext, familyId: string, weekStartsOn: string): Promise<WeekView> {
	const { tx } = context;
	const [week] = await tx<{ id: string }[]>`select id from app.weeks where family_id = ${familyId} and starts_on = ${weekStartsOn}`;
	if (!week) throw appError('not_found');
	const slots = await tx<SlotRow[]>`
		select s.id, s.date::text as date, s.meal_type as "mealType", s.recipe_id as "recipeId", s.free_text as "freeText",
			s.servings, s.note,
			case when s.updated_by is not null then to_char(s.updated_at at time zone f.time_zone, 'YYYY-MM-DD"T"HH24:MI') end as "changedAt",
			case when m.user_id is not null then p.display_name end as "authorName"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		left join app.family_members m on m.family_id = w.family_id and m.user_id = s.updated_by
		left join app.profiles p on p.user_id = s.updated_by
		where s.week_id = ${week.id}
		order by s.date, s.meal_type desc`;
	const versions = new Map((await mealRecipeVersionsAt(tx, familyId, week.id, context.now)).map((v) => [v.slotId, v]));
	const refs = new Map<string, RecipeRef>();
	for (const slot of slots) {
		const v = versions.get(slot.id);
		if (v) refs.set(slot.id, { recipeId: v.recipeId, version: v.version, servings: slot.servings });
	}
	const views = await recipeViews(tx, { familyId, userId: context.userId, locale: context.locale }, [...refs.values()]);

	const meals: MealView[] = slots.map((slot) => {
		const ref = refs.get(slot.id);
		const view = ref ? views.get(recipeViewKey(ref)) : undefined;
		return {
			slotId: slot.id,
			date: slot.date,
			mealType: slot.mealType,
			kind: slot.recipeId ? 'recipe' : slot.freeText !== null ? 'free' : 'empty',
			recipe: view?.summary ?? null,
			freeText: slot.freeText,
			servings: slot.servings,
			ingredients: view?.ingredients ?? null,
			note: slot.note,
			rating: view?.rating ?? null,
			canOpenRecipe: view !== undefined && view.status !== 'draft',
			lastChange: slot.changedAt ? { userName: slot.authorName, at: slot.changedAt } : null,
		};
	});
	return {
		startsOn: weekStartsOn,
		days: Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekStartsOn, i);
			return { date, meals: meals.filter((m) => m.date === date) };
		}),
	};
}
