import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../../src/db.ts';
import { generateWeek, loadPlannerInput } from '../../src/menu/generation.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { menuFixtures } from '../support/menu.ts';

describe.skipIf(!hasDatabase)('week generation', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	afterAll(async () => {
		await sql.end();
		await db.close();
	});

	const asJob = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);
	const slotsOf = (familyId: string, startsOn: string) => db.admin<{ date: string; meal_type: string; recipe_id: string | null; free_text: string | null; servings: number; updated_by: string | null }[]>`
		select s.date::text, s.meal_type, s.recipe_id, s.free_text, s.servings, s.updated_by from app.meal_slots s
		join app.weeks w on w.id = s.week_id where w.family_id = ${familyId} and w.starts_on = ${startsOn} order by s.date, s.meal_type desc`;
	const recipeIds = async (familyId: string, startsOn: string) => (await slotsOf(familyId, startsOn)).flatMap((s) => (s.recipe_id ? [s.recipe_id] : []));

	it('loads the published catalogue, the history before and the meals planned after the week', async () => {
		const fx = menuFixtures(db);
		const familyId = await db.createFamily([]);
		const archived = await fx.publishRecipe();
		await db.admin`update app.recipes set status = 'archived', archived_at = now() where id = ${archived}`;
		const draft = await fx.draftRecipe('Bozza');
		const eaten = await fx.publishRecipe();
		const planned = await fx.publishRecipe();
		await fx.insertSlot(await fx.insertWeek(familyId, '2026-10-05'), { date: '2026-10-06', mealType: 'dinner', recipeId: eaten });
		await fx.insertSlot(await fx.insertWeek(familyId, '2026-10-19'), { date: '2026-10-20', mealType: 'lunch', recipeId: planned });
		const input = await asJob((tx) => loadPlannerInput(tx, familyId, { weekStart: '2026-10-12' }));
		const ids = input.recipes.map((r) => r.id);
		expect(ids).toContain(eaten);
		expect(ids).not.toContain(archived);
		expect(ids).not.toContain(draft);
		expect(input.history).toEqual([{ date: '2026-10-06', mealType: 'dinner', recipeId: eaten }]);
		expect(input.upcoming).toEqual([{ date: '2026-10-20', mealType: 'lunch', recipeId: planned }]);
		expect(input.settings.slots.lunch).toHaveLength(7);
	});

	it('creates the week once, with app-authored slots, and the same week for the same input', async () => {
		const familyId = await db.createFamily([]);
		expect(await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-12' }))).toBe(true);
		const slots = await slotsOf(familyId, '2026-10-12');
		expect(slots).toHaveLength(14);
		expect(slots.every((s) => s.updated_by === null && s.servings === 2)).toBe(true);
		expect(await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-12' }))).toBe(false);
		expect(await slotsOf(familyId, '2026-10-12')).toEqual(slots);
	});

	it('creates one week when two requests generate it at the same time', async () => {
		const familyId = await db.createFamily([]);
		const results = await Promise.all([1, 2].map(() => asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-19' }))));
		expect(results.sort()).toEqual([false, true]);
		expect(await slotsOf(familyId, '2026-10-19')).toHaveLength(14);
	});

	it('generates from the first open meal', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-10-26', from: { date: '2026-10-30', mealType: 'dinner' } }));
		const slots = await slotsOf(familyId, '2026-10-26');
		expect(slots[0]).toMatchObject({ date: '2026-10-30', meal_type: 'dinner' });
		expect(slots).toHaveLength(5);
	});

	it('creates the current week after the next one without repeating its recipes, and never changes the next one', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-09' }));
		const next = await slotsOf(familyId, '2026-11-09');
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-02', from: { date: '2026-11-04', mealType: 'dinner' } }));
		const nextIds = new Set(await recipeIds(familyId, '2026-11-09'));
		expect((await recipeIds(familyId, '2026-11-02')).filter((id) => nextIds.has(id))).toEqual([]);
		expect(await slotsOf(familyId, '2026-11-09')).toEqual(next);
	});

	it('fills a missing week between two planned ones, consistent with both', async () => {
		const familyId = await db.createFamily([]);
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-16' }));
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-30' }));
		await asJob((tx) => generateWeek(tx, familyId, { weekStart: '2026-11-23' }));
		const middle = await recipeIds(familyId, '2026-11-23');
		const around = new Set([...(await recipeIds(familyId, '2026-11-16')), ...(await recipeIds(familyId, '2026-11-30'))]);
		expect(middle.filter((id) => around.has(id))).toEqual([]);
	});

	it('uses the book from the document: never a recipe of a book the family does not own', async () => {
		const fx = menuFixtures(db);
		const bookId = await fx.book();
		const bookRecipe = await fx.publishRecipe({ bookId });
		const without = await db.createFamily([]);
		const owner = await db.createFamily([]);
		await db.admin`insert into app.family_books (family_id, book_id) values (${owner}, ${bookId})`;
		const input = await asJob((tx) => loadPlannerInput(tx, without, { weekStart: '2026-12-07' }));
		expect(input.recipes.find((r) => r.id === bookRecipe)?.bookId).toBe(bookId);
		await asJob((tx) => generateWeek(tx, without, { weekStart: '2026-12-07' }));
		expect(await recipeIds(without, '2026-12-07')).not.toContain(bookRecipe);
		expect((await asJob((tx) => loadPlannerInput(tx, owner, { weekStart: '2026-12-07' }))).ownedBookIds).toContain(bookId);
	});

	it('generates in the member role for their own family only, with no new privileges', async () => {
		const fx = menuFixtures(db);
		const { familyId, claims } = await fx.member();
		const other = await db.createFamily([]);
		expect(await withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, familyId, { weekStart: '2026-12-14' }))).toBe(true);
		await expect(withDbOn(sql, { kind: 'user', claims }, (tx) => generateWeek(tx, other, { weekStart: '2026-12-14' }))).rejects.toThrow();
		expect(await slotsOf(other, '2026-12-14')).toHaveLength(0);
	});
});
