import type { Tx } from '../db.ts';

/**
 * What a family may open and rate (spec of W6): published or archived recipes; those from a
 * book only when the family owns it or one of its meals cites the recipe. Drafts: never here.
 */
export async function canSeeRecipe(tx: Tx, familyId: string, recipeId: string): Promise<'published' | 'archived' | null> {
	const [row] = await tx<{ status: 'published' | 'archived' }[]>`
		select r.status from app.recipes r
		where r.id = ${recipeId} and r.status <> 'draft'
			and (r.book_id is null
				or exists (select 1 from app.family_books fb where fb.family_id = ${familyId} and fb.book_id = r.book_id)
				or exists (
					select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id
					where w.family_id = ${familyId} and s.recipe_id = r.id
				))`;
	return row?.status ?? null;
}
