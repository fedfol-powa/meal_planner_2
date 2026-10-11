import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family books and ingredients', () => {
	let actors: Actors;
	let admin: Actor;
	let member: Actor;
	let familyId: string;
	let bookId: string;
	let archivedBookId: string;
	let ingredientId: string;
	let archivedIngredientId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		member = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: admin.userId, role: 'family_admin' },
			{ userId: member.userId, role: 'member' },
		]);
		const tag = familyId.slice(0, 8);
		[{ id: bookId }] = await actors.db.admin<{ id: string }[]>`insert into app.books (slug, title) values (${`w2-book-${tag}`}, 'Libro') returning id`;
		[{ id: archivedBookId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.books (slug, title, archived_at) values (${`w2-old-book-${tag}`}, 'Vecchio', now()) returning id`;
		[{ id: ingredientId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department) values (${`w2-cucumber-${tag}`}, '{"it-IT": "Cetrioli", "en-GB": "Cucumbers"}', 'produce') returning id`;
		[{ id: archivedIngredientId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department, archived_at)
			values (${`w2-old-ingredient-${tag}`}, '{"it-IT": "Vecchio", "en-GB": "Old"}', 'produce', now()) returning id`;
	});
	afterAll(() => actors?.close());

	it('owns and drops a book, idempotently', async () => {
		await admin.client.family.setBookOwned({ familyId, bookId, owned: true });
		expect((await admin.client.family.setBookOwned({ familyId, bookId, owned: true })).books).toContainEqual({ id: bookId, title: 'Libro', owned: true });
		expect((await admin.client.family.setBookOwned({ familyId, bookId, owned: false })).books).toContainEqual({ id: bookId, title: 'Libro', owned: false });
		expect((await admin.client.family.setBookOwned({ familyId, bookId, owned: false })).books).toContainEqual({ id: bookId, title: 'Libro', owned: false });
	});

	it('refuses unknown books either way and archived ones as new, but lets them go', async () => {
		for (const owned of [true, false]) {
			const error = await errorOf(admin.client.family.setBookOwned({ familyId, bookId: crypto.randomUUID(), owned }));
			expect(error.code).toBe('not_found');
			expect(error.status).toBe(404);
		}
		expect((await errorOf(admin.client.family.setBookOwned({ familyId, bookId: archivedBookId, owned: true }))).code).toBe('not_found');
		await actors.db.admin`insert into app.family_books (family_id, book_id) values (${familyId}, ${archivedBookId})`;
		const dropped = await admin.client.family.setBookOwned({ familyId, bookId: archivedBookId, owned: false });
		expect(dropped.books.map((b) => b.id)).not.toContain(archivedBookId);
	});

	it('limits, avoids and clears an ingredient', async () => {
		const limited = await admin.client.family.setIngredientRestriction({ familyId, ingredientId, restriction: 'limit', weeklyMax: 1 });
		expect(limited.restrictions).toEqual([{ ingredientId, name: 'Cetrioli', restriction: 'limit', weeklyMax: 1 }]);
		const avoided = await admin.client.family.setIngredientRestriction({ familyId, ingredientId, restriction: 'avoid', weeklyMax: null });
		expect(avoided.restrictions).toEqual([{ ingredientId, name: 'Cetrioli', restriction: 'avoid', weeklyMax: null }]);
		for (let i = 0; i < 2; i++) {
			expect((await admin.client.family.setIngredientRestriction({ familyId, ingredientId, restriction: null, weeklyMax: null })).restrictions).toEqual([]);
		}
	});

	it('needs weeklyMax exactly with limit, within 1-7', async () => {
		for (const input of [
			{ restriction: 'limit' as const, weeklyMax: null },
			{ restriction: 'avoid' as const, weeklyMax: 2 },
			{ restriction: null, weeklyMax: 2 },
			{ restriction: 'limit' as const, weeklyMax: 8 },
		]) {
			expect((await errorOf(admin.client.family.setIngredientRestriction({ familyId, ingredientId, ...input }))).code, JSON.stringify(input)).toBe('invalid');
		}
	});

	it('refuses unknown ingredients, and archived ones unless clearing', async () => {
		const unknown = await errorOf(admin.client.family.setIngredientRestriction({ familyId, ingredientId: crypto.randomUUID(), restriction: 'avoid', weeklyMax: null }));
		expect(unknown.code).toBe('not_found');
		expect((await errorOf(admin.client.family.setIngredientRestriction({ familyId, ingredientId: archivedIngredientId, restriction: 'avoid', weeklyMax: null }))).code).toBe('not_found');
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction) values (${familyId}, ${archivedIngredientId}, 'avoid')`;
		const cleared = await admin.client.family.setIngredientRestriction({ familyId, ingredientId: archivedIngredientId, restriction: null, weeklyMax: null });
		expect(cleared.restrictions.map((r) => r.ingredientId)).not.toContain(archivedIngredientId);
	});

	it('is for administrators only', async () => {
		expect((await errorOf(member.client.family.setBookOwned({ familyId, bookId, owned: true }))).code).toBe('forbidden');
		expect((await errorOf(member.client.family.setIngredientRestriction({ familyId, ingredientId, restriction: 'avoid', weeklyMax: null }))).code).toBe('forbidden');
	});
});
