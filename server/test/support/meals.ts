import type { Contract, MealView, WeekView } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type { Actor, Actors } from './actors.ts';
import { menuFixtures } from './menu.ts';
import { rpcClient } from './requests.ts';

export function mealOf(week: WeekView, slotId: string): MealView {
	const meal = week.days.flatMap((d) => d.meals).find((m) => m.slotId === slotId);
	if (!meal) throw new Error(`no meal ${slotId}`);
	return meal;
}

/** The same person through an agent: a token with client_id, so the channel is mcp. */
export async function agentClient(actors: Actors, actor: Actor): Promise<ContractRouterClient<Contract>> {
	const token = await actors.keys.sign({ sub: actor.userId, session_id: actor.sessionId, client_id: 'test-agent' });
	return rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token);
}

/** A family of two members with one week: a recipe lunch, a free dinner, an empty Tuesday lunch. */
export async function mealsSetup(actors: Actors) {
	const fx = menuFixtures(actors.db);
	const anna = await actors.user();
	const bruno = await actors.user();
	const familyId = await actors.db.createFamily([
		{ userId: anna.userId, role: 'family_admin' },
		{ userId: bruno.userId, role: 'member' },
	]);
	await actors.db.admin`update app.profiles set display_name = 'Anna' where user_id = ${anna.userId}`;
	await actors.db.admin`update app.profiles set display_name = 'Bruno' where user_id = ${bruno.userId}`;
	const recipes: string[] = [];
	for (let i = 0; i < 12; i++) recipes.push(await fx.publishRecipe());
	const weekStartsOn = '2026-10-12';
	const weekId = await fx.insertWeek(familyId, weekStartsOn);
	const slots = {
		monLunch: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId: recipes[0] }),
		monDinner: await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'dinner', freeText: 'Pizza' }),
		tueLunch: await fx.insertSlot(weekId, { date: '2026-10-13', mealType: 'lunch' }),
	};
	const changes = (slotId: string) =>
		actors.db.admin<{ actor_id: string; channel: string; before: Record<string, unknown>; after: Record<string, unknown>; undoes: string | null; action_id: string | null }[]>`
			select actor_id, channel, before, after, undoes, action_id from app.meal_changes where meal_slot_id = ${slotId} order by created_at, id`;
	const slotRow = async (slotId: string) =>
		(await actors.db.admin<{ servings: number; note: string | null; recipe_id: string | null; free_text: string | null; last_action_id: string | null; updated_by: string | null }[]>`
			select servings, note, recipe_id, free_text, last_action_id, updated_by from app.meal_slots where id = ${slotId}`)[0]!;
	const action = async (id: string) =>
		(await actors.db.admin<{ kind: string; slot_ids: string[]; actor_id: string; channel: string }[]>`
			select kind, slot_ids::text[] as slot_ids, actor_id, channel from app.meal_actions where id = ${id}`)[0];
	const week = async (actor: Actor) => {
		const read = await actor.client.menu.getWeek({ familyId, weekStartsOn });
		if (read.unchanged) throw new Error('expected data');
		return read.data;
	};
	/** A never-published recipe with its open draft, as the import leaves it (draftRecipe alone has no draft row). */
	const importedDraft = async (name: string) => {
		const recipeId = await fx.draftRecipe(name);
		await actors.db.admin`insert into app.recipe_drafts (recipe_id, kind, content, revision) values (${recipeId}, 'new', '{}', 1)`;
		return recipeId;
	};
	/** A curator discards the open draft; fails when there was none to close. */
	const discardDraft = async (recipeId: string) => {
		const closed = await actors.db.admin`
			update app.recipe_drafts set closed_at = now(), outcome = 'discarded' where recipe_id = ${recipeId} and closed_at is null returning id`;
		if (closed.length !== 1) throw new Error(`no open draft for ${recipeId}`);
	};
	/** A curator publishes the draft as version 1 (same id), with the document and projections of a published recipe. */
	const publishDraft = async (recipeId: string, from: string) => {
		await actors.db.admin.begin(async (sql) => {
			await sql`
				insert into app.recipe_versions (recipe_id, version, content, published_at, channel)
				select ${recipeId}, 1, content, now(), 'import' from app.recipe_versions where recipe_id = ${from} and version = 1`;
			await sql`
				update app.recipes r set status = 'published', version = 1, description = o.description, source_type = o.source_type,
					duration_minutes = o.duration_minutes, base_servings = o.base_servings, protein_group = o.protein_group,
					is_fresh_fish = o.is_fresh_fish, carbohydrate_group = o.carbohydrate_group, has_vegetables = o.has_vegetables,
					category = o.category, meal_type = o.meal_type, is_heavy = o.is_heavy
				from app.recipes o where r.id = ${recipeId} and o.id = ${from}`;
			const closed = await sql`
				update app.recipe_drafts set closed_at = now(), outcome = 'published' where recipe_id = ${recipeId} and closed_at is null returning id`;
			if (closed.length !== 1) throw new Error(`no open draft for ${recipeId}`);
		});
	};
	return { fx, anna, bruno, familyId, recipes, weekStartsOn, weekId, slots, changes, slotRow, action, week, importedDraft, discardDraft, publishDraft };
}
