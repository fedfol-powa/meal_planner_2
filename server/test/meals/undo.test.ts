import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { discardDraft } from '../../src/catalogue/write.ts';
import { withDbOn } from '../../src/db.ts';
import { errorOf, setupActors, type Actor, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { agentClient, mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal undo', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();
	const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

	it('restores the content with an undo action; repeated, nothing new', async () => {
		const changed = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 6 });
		const undoId = id();
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: undoId });
		expect(undone).toMatchObject({ actionId: undoId, changed: true });
		expect(mealOf(undone.week, s.slots.monLunch).servings).toBe(2);
		expect(await s.action(undoId)).toMatchObject({ kind: 'undo', slot_ids: [s.slots.monLunch] });
		await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: undoId });
		expect((await s.changes(s.slots.monLunch)).filter((r) => r.action_id === undoId)).toHaveLength(1);
	});

	it('an agent in a new conversation undoes from menu_getWeek alone', async () => {
		await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		const agent = await agentClient(actors, s.anna);
		const read = await agent.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		if (read.unchanged) throw new Error('expected data');
		const last = mealOf(read.data, s.slots.monDinner).lastChange!;
		expect(last.undoable).toBe(true);
		expect([...last.slotIds].sort()).toEqual([s.slots.monLunch, s.slots.monDinner].sort());
		const undone = await agent.meals.undo({ familyId: s.familyId, actionId: last.actionId!, id: id() });
		expect(mealOf(undone.week, s.slots.monDinner)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		expect(mealOf(undone.week, s.slots.monLunch)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[0] } });
	});

	it('undoes a swap whole, and the undo of the undo whole again', async () => {
		const swapped = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: swapped.actionId, id: id() });
		const redone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: undone.actionId, id: id() });
		expect(mealOf(redone.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		expect(mealOf(redone.week, s.slots.monDinner)).toMatchObject({ recipe: { id: s.recipes[0] } });
	});

	it('changed_since when another member changed one of the two swapped meals; nothing written', async () => {
		const swapped = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: id() });
		await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), note: 'Bruno' });
		const before = await s.week(s.anna);
		expect(mealOf(before, s.slots.monLunch).lastChange?.undoable).toBe(false);
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: swapped.actionId, id: id() }))).data).toEqual({ reason: 'changed_since' });
		expect(await s.week(s.anna)).toEqual(before);
	});

	it('not_own_change for another member’s action', async () => {
		const changed = await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'Bruno' });
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: id() }))).data).toEqual({ reason: 'not_own_change' });
	});

	it('restores the last citation of an imported draft (Anna is not a curator)', async () => {
		const draft = await s.importedDraft('Bozza importata');
		await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.monDinner}`;
		const freed = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: freed.actionId, id: id() });
		expect(mealOf(undone.week, s.slots.monDinner).recipe?.id).toBe(draft);
	});

	it('draft_closed over RPC once the draft was discarded, and nothing is written', async () => {
		const draft = await s.importedDraft('Bozza importata');
		await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.monDinner}`;
		const freed = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
		await s.discardDraft(draft);
		const before = await s.week(s.anna);
		const undoId = id();
		const error = await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: freed.actionId, id: undoId }));
		expect(error.code).toBe('not_allowed');
		expect(error.data).toEqual({ reason: 'draft_closed' });
		expect(await s.week(s.anna)).toEqual(before);
		expect(await s.action(undoId)).toBeUndefined();
	});

	it('a draft published in the meantime comes back as the published recipe, same id (coordinator, 12 October)', async () => {
		const draft = await s.importedDraft('Bozza importata');
		await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.monDinner}`;
		const freed = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
		await s.publishDraft(draft, s.recipes[1]!);
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: freed.actionId, id: id() });
		const meal = mealOf(undone.week, s.slots.monDinner);
		expect(meal.recipe?.id).toBe(draft);
		expect(meal.canOpenRecipe).toBe(true);
	});

	it('an action without effect undoes to nothing', async () => {
		const same = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 2 });
		expect((await s.anna.client.meals.undo({ familyId: s.familyId, actionId: same.actionId, id: id() })).changed).toBe(false);
	});

	it('works on a past meal', async () => {
		const pastWeek = await s.fx.insertWeek(s.familyId, '2026-01-05');
		const past = await s.fx.insertSlot(pastWeek, { date: '2026-01-05', mealType: 'lunch', recipeId: s.recipes[1] });
		const changed = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: past, id: id(), servings: 4 });
		expect(mealOf((await s.anna.client.meals.undo({ familyId: s.familyId, actionId: changed.actionId, id: id() })).week, past).servings).toBe(2);
	});

	it('not_found for an unknown action or one of another family, without writing', async () => {
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: crypto.randomUUID(), id: id() }))).code).toBe('not_found');
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		const strangerWeek = await s.fx.insertWeek(family, '2026-10-12');
		const slot = await s.fx.insertSlot(strangerWeek, { date: '2026-10-12', mealType: 'lunch', freeText: 'x' });
		const theirs = await stranger.client.meals.setNote({ familyId: family, slotId: slot, id: id(), note: 'mine' });
		const undoId = id();
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: theirs.actionId, id: undoId }))).code).toBe('not_found');
		expect(await s.action(undoId)).toBeUndefined();
	});

	it('a transaction started first but blocked on the lock saves last, and the pointer follows', async () => {
		const [first, second] = [s.slots.monLunch, s.slots.monDinner].sort();
		const swapId = id();
		const noteId = id();
		let swap: Promise<unknown> | undefined;
		await actors.db.admin.begin(async (hold) => {
			await hold`select 1 from app.meal_slots where id = ${first!} for update`;
			// The swap begins now and waits on `first` before locking `second`.
			swap = s.anna.client.meals.swap({ familyId: s.familyId, slotId: first!, otherSlotId: second!, id: swapId });
			await new Promise((r) => setTimeout(r, 300));
			// Bruno's note starts later, locks `second` at once and commits first.
			await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: second!, id: noteId, note: 'Bruno' });
		});
		await swap;
		expect((await s.slotRow(second!)).last_action_id).toBe(swapId);
		expect(mealOf(await s.week(s.anna), second!).lastChange).toMatchObject({ actionId: swapId, undoable: true });
		expect((await s.changes(second!)).at(-1)!.action_id).toBe(swapId);
		expect((await errorOf(s.bruno.client.meals.undo({ familyId: s.familyId, actionId: noteId, id: id() }))).data).toEqual({ reason: 'changed_since' });
	});

	it('not_own_change also for another member’s action without effect, and nothing recorded', async () => {
		const same = await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 2 });
		expect(same.changed).toBe(false);
		const undoId = id();
		expect((await errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId: same.actionId, id: undoId }))).data).toEqual({ reason: 'not_own_change' });
		expect(await s.action(undoId)).toBeUndefined();
	});

	it('takes identifiers in any case: write, repeat, swap, undo and its repeat', async () => {
		const upper = (x: string) => x.toUpperCase();
		const mixed = (x: string) => x.slice(0, 18).toUpperCase() + x.slice(18);
		const writeId = id();
		const written = await s.anna.client.meals.setServings({ familyId: upper(s.familyId), slotId: upper(s.slots.monLunch), id: upper(writeId), servings: 4 });
		expect(written).toMatchObject({ actionId: writeId, changed: true });
		const repeated = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: mixed(s.slots.monLunch), id: mixed(writeId), servings: 4 });
		expect(repeated).toMatchObject({ actionId: writeId, changed: true });
		const swapId = id();
		const swapped = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: upper(s.slots.monDinner), otherSlotId: mixed(s.slots.monLunch), id: upper(swapId) });
		expect(mealOf(swapped.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		const undoId = id();
		const undone = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: upper(swapId), id: upper(undoId) });
		expect(undone).toMatchObject({ actionId: undoId, changed: true });
		expect(mealOf(undone.week, s.slots.monDinner)).toMatchObject({ kind: 'free', freeText: 'Pizza' });
		const again = await s.anna.client.meals.undo({ familyId: s.familyId, actionId: mixed(swapId), id: mixed(undoId) });
		expect(again).toMatchObject({ actionId: undoId, changed: true });
		expect((await s.changes(s.slots.monLunch)).filter((r) => r.action_id === undoId)).toHaveLength(1);
		expect((await s.changes(s.slots.monLunch)).filter((r) => r.action_id === writeId)).toHaveLength(1);
	});

	describe('undo and a curator discarding the draft, at the same time', () => {
		let watch: postgres.Sql;
		let curator: Actor;
		beforeAll(async () => {
			watch = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
			curator = await actors.user();
			await actors.db.grantGlobalRole(curator.userId, 'recipe_curator');
		});
		afterAll(() => watch?.end());

		/** The backend waiting on a lock of `pid`, or null after two seconds (no wait: the bug). */
		const blockedBy = async (pid: number): Promise<number | null> => {
			for (let i = 0; i < 100; i++) {
				const [row] = await watch<{ pid: number }[]>`select pid from pg_stat_activity where ${pid}::int = any (pg_blocking_pids(pid))`;
				if (row) return row.pid;
				await pause(20);
			}
			return null;
		};
		/** Anna freed the last meal citing an imported draft: undoing her action would bring it back. */
		const freedDraft = async () => {
			const draft = await s.importedDraft('Bozza importata');
			await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${s.slots.monDinner}`;
			const freed = await s.anna.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.monDinner, id: id(), text: 'Fuori' });
			const [{ draftId }] = await actors.db.admin<{ draftId: string }[]>`select id as "draftId" from app.recipe_drafts where recipe_id = ${draft}`;
			return { draft, draftId: draftId!, actionId: freed.actionId };
		};
		const draftOutcome = async (draftId: string) =>
			(await actors.db.admin<{ outcome: string | null }[]>`select outcome from app.recipe_drafts where id = ${draftId}`)[0]!.outcome;

		it('the discard locks first: the undo waits, then answers draft_closed and writes nothing', async () => {
			const { draftId, actionId } = await freedDraft();
			const undoId = id();
			let undo: Promise<Awaited<ReturnType<typeof errorOf>>> | undefined;
			const claims = { sub: curator.userId, role: 'authenticated' as const, session_id: curator.sessionId, exp: Math.floor(Date.now() / 1000) + 600 };
			const curatorDb = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
			try {
				await withDbOn(curatorDb, { kind: 'user', claims }, async (tx) => {
					// The real discard, kept open: it holds the draft and its recipe until the commit.
					await discardDraft(tx, { userId: curator.userId, channel: 'web' }, { draftId });
					const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
					undo = errorOf(s.anna.client.meals.undo({ familyId: s.familyId, actionId, id: undoId }));
					undo.catch(() => {});
					expect(await blockedBy(pid!)).not.toBeNull();
				});
			} finally {
				await curatorDb.end();
			}
			expect((await undo!).data).toEqual({ reason: 'draft_closed' });
			expect(await draftOutcome(draftId)).toBe('discarded');
			expect(mealOf(await s.week(s.anna), s.slots.monDinner)).toMatchObject({ kind: 'free', freeText: 'Fuori' });
			expect(await s.action(undoId)).toBeUndefined();
		});

		it('the undo locks first: the discard waits, then answers cited_by_meals and closes nothing', async () => {
			const { draft, draftId, actionId } = await freedDraft();
			let undo: Promise<unknown> | undefined;
			let discard: Promise<Awaited<ReturnType<typeof errorOf>>> | undefined;
			await actors.db.admin.begin(async (hold) => {
				// The undo locks slots and recipe, then waits here on the week (key of its action).
				await hold`select 1 from app.weeks where id = ${s.weekId} for update`;
				const [{ pid }] = await hold<{ pid: number }[]>`select pg_backend_pid() as pid`;
				undo = s.anna.client.meals.undo({ familyId: s.familyId, actionId, id: id() });
				undo.catch(() => {});
				const undoPid = await blockedBy(pid!);
				expect(undoPid).not.toBeNull();
				discard = errorOf(curator.client.catalogue.discardDraft({ draftId }));
				discard.catch(() => {});
				expect(await blockedBy(undoPid!)).not.toBeNull();
			});
			await undo;
			expect(mealOf(await s.week(s.anna), s.slots.monDinner).recipe?.id).toBe(draft);
			const refused = await discard!;
			expect(refused.code).toBe('not_allowed');
			expect(refused.data).toEqual({ reason: 'cited_by_meals' });
			expect(await draftOutcome(draftId)).toBeNull();
		});
	});
});
