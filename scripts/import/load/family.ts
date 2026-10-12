import type { IsoDate } from '../../../domain/src/planner/index.ts';
import type { Tx } from '../../../server/src/db.ts';
import { writeSettingsKey } from '../../../server/src/family/settings-writes.ts';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { slug, type OriginRecipe } from '../../planner-data/origin.ts';
import { buildFamilyData, type HistoryFinding } from '../family.ts';
import type { Counted } from './catalogue.ts';
import type { OriginMenu } from './menus.ts';
import { conditionalPreferences, type ConditionalPreference } from './preferences.ts';
import { actAsJob, LoadRefused } from './run.ts';
import { settingsWrites } from './settings-plan.ts';
import { plannedWeeks, type WeeksPlan } from './weeks-plan.ts';

// Family writes of the production load (detail spec, section 6): only additions, never an overwrite.
export interface FamilyResult {
	settings: number;
	restrictions: Counted;
	books: Counted;
	tried: Counted;
	ratings: Counted & { pending: string[] };
	weeks: { created: number; present: number; slots: number };
	missingRecipes: string[];
	duplicates: WeeksPlan['duplicates'];
	notes: WeeksPlan['notes'];
	ownedBooks: string[];
	findings: HistoryFinding[];
	preferences: ConditionalPreference[];
}

export const emptyFamilyResult = (): FamilyResult => ({
	settings: 0,
	restrictions: { created: 0, present: 0 },
	books: { created: 0, present: 0 },
	tried: { created: 0, present: 0 },
	ratings: { created: 0, present: 0, pending: [] },
	weeks: { created: 0, present: 0, slots: 0 },
	missingRecipes: [],
	duplicates: [],
	notes: [],
	ownedBooks: [],
	findings: [],
	preferences: [],
});

const count = (c: Counted, rows: { length: number }) => {
	c[rows.length ? 'created' : 'present']++;
};

export async function loadFamily(tx: Tx, args: { familyId: string; curatorId: string; storedSettings: unknown; origin: OriginRecipe[]; today: IsoDate; menus: OriginMenu[] }): Promise<FamilyResult> {
	const r = emptyFamilyResult();
	const { familyId, curatorId } = args;
	// Under the lock taken by loadAll: no generation can slip in between this check and the writes.
	const firstLoad = !args.storedSettings || Object.keys(args.storedSettings as object).length === 0;
	const [{ generated }] = await tx<{ generated: number }[]>`select count(*)::int as generated from app.weeks where family_id = ${familyId} and generated_at is not null`;
	if (firstLoad && generated > 0) throw new LoadRefused(`Family ${familyId} already generated a week with the default settings`);

	// 4. settings, only keys still missing (the row is locked by loadAll)
	const settings = curatorFamilySettings();
	for (const w of settingsWrites(settings, args.storedSettings)) { await writeSettingsKey(tx, familyId, w.path, w.value); r.settings++; }
	// 5. cucumbers, limited to one a week
	const cucumbers = await tx<{ id: string }[]>`select id from app.ingredients where slug like 'cetriol%'`;
	for (const { id } of cucumbers) count(r.restrictions, await tx`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max)
		values (${familyId}, ${id}, 'limit', 1) on conflict do nothing returning 1`);
	// 6. owned books: every book of the origin recipe book
	const bookSlugs = [...new Set(args.origin.flatMap((o) => (o.libro ? [slug(o.libro.titolo)] : [])))];
	const books = bookSlugs.length ? await tx<{ id: string; title: string }[]>`select id, title from app.books where slug in ${tx(bookSlugs)}` : [];
	for (const b of books) count(r.books, await tx`insert into app.family_books (family_id, book_id) values (${familyId}, ${b.id}) on conflict do nothing returning 1`);
	r.ownedBooks = books.map((b) => b.title).sort();
	// 7–8. ratings and tried recipes, computed on the whole origin recipe book
	const { family: data, findings } = buildFamilyData(args.origin, args.today);
	r.findings = findings;
	r.preferences = conditionalPreferences(args.origin);
	const recipes = new Map((await tx<{ originSlug: string; id: string; status: string }[]>`
		select origin_slug as "originSlug", id, status from app.recipes where origin_slug is not null`).map((x) => [x.originSlug, x]));
	for (const rating of data.ratings) {
		const recipe = recipes.get(rating.originSlug);
		if (!recipe) continue;
		if (recipe.status === 'draft') { r.ratings.pending.push(rating.originSlug); continue; }
		count(r.ratings, await tx`insert into app.ratings (user_id, recipe_id, stars) values (${curatorId}, ${recipe.id}, ${rating.stars}) on conflict do nothing returning 1`);
	}
	const plan = plannedWeeks({ meals: data.meals, menus: args.menus, settings, today: args.today });
	r.duplicates = plan.duplicates;
	r.notes = plan.notes;
	// Two recipes in one past meal (decision of the coordinator): the other one was eaten too.
	const tried = new Set([...data.triedUndated, ...plan.duplicates.map((d) => d.originSlug)]);
	for (const originSlug of tried) {
		const recipe = recipes.get(originSlug);
		if (recipe) count(r.tried, await tx`insert into app.family_tried_recipes (family_id, recipe_id, source) values (${familyId}, ${recipe.id}, 'import') on conflict do nothing returning 1`);
	}
	// 9. history and current menu, as the app (drafts may be cited)
	await actAsJob(tx);
	for (const week of plan.weeks) {
		const [created] = await tx<{ id: string }[]>`insert into app.weeks (family_id, starts_on) values (${familyId}, ${week.weekStart})
			on conflict (family_id, starts_on) do nothing returning id`;
		if (!created) { r.weeks.present++; continue; }
		r.weeks.created++;
		for (const s of week.slots) {
			const recipeId = s.originSlug ? recipes.get(s.originSlug)?.id : null;
			if (s.originSlug && !recipeId) {
				if (week.source === 'current') throw new LoadRefused(`The current menu cites ${s.originSlug}, which is not in the app's recipe book`);
				r.missingRecipes.push(s.originSlug);
				continue;
			}
			await tx`insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings)
				values (${created.id}, ${s.date}, ${s.mealType}, ${recipeId ?? null}, ${s.freeText}, ${s.servings})`;
			r.weeks.slots++;
		}
	}
	return r;
}
