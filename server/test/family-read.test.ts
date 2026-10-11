import { defaultPlannerSettings } from '@app/domain/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

/** Data of a fresh versioned answer; fails on `unchanged`. */
function fresh<T>(answer: { unchanged: true; version: string } | { unchanged: false; version: string; data: T }): T {
	if (answer.unchanged) throw new Error('expected a fresh answer');
	return answer.data;
}

describe.skipIf(!hasDatabase)('family reads', () => {
	let actors: Actors;
	let admin: Actor;
	let member: Actor;
	let stranger: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		member = await actors.user({ locale: 'en-GB' });
		stranger = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: member.userId, role: 'member' },
			{ userId: admin.userId, role: 'family_admin' },
		]);
		await actors.db.admin`update app.profiles set display_name = 'Zoe' where user_id = ${admin.userId}`;
		await actors.db.admin`update app.profiles set display_name = 'Aldo' where user_id = ${member.userId}`;
	});
	afterAll(() => actors?.close());

	it('lists members, admins first, with my role', async () => {
		const view = fresh(await member.client.family.get({ familyId }));
		expect(view).toMatchObject({ id: familyId, name: 'Test', measurementSystem: 'metric', timeZone: 'Europe/Rome', myRole: 'member' });
		expect(view.members.map((m) => [m.userId, m.displayName, m.role, m.isMe])).toEqual([
			[admin.userId, 'Zoe', 'family_admin', false],
			[member.userId, 'Aldo', 'member', true],
		]);
		expect(Date.parse(view.members[0]!.joinedAt)).not.toBeNaN();
	});

	it('answers unchanged for the same version and fresh after a change', async () => {
		const first = await member.client.family.get({ familyId });
		expect(await member.client.family.get({ familyId, knownVersion: first.version })).toEqual({ unchanged: true, version: first.version });
		await actors.db.admin`update app.families set name = 'Renamed' where id = ${familyId}`;
		expect(fresh(await member.client.family.get({ familyId, knownVersion: first.version })).name).toBe('Renamed');
	});

	it('refuses strangers and unknown families alike, also as an agent', async () => {
		const agent = await actors.user({ agent: true });
		for (const actor of [stranger, agent]) {
			expect((await errorOf(actor.client.family.get({ familyId }))).code).toBe('forbidden');
			expect((await errorOf(actor.client.family.getSettings({ familyId }))).code).toBe('forbidden');
			expect((await errorOf(actor.client.family.getSettings({ familyId: crypto.randomUUID() }))).code).toBe('forbidden');
			expect((await errorOf(actor.client.family.searchIngredients({ familyId, text: 'pomodoro' }))).code).toBe('forbidden');
		}
	});

	it('resolves settings without weights; only admins can edit', async () => {
		const { weights: _weights, ...visible } = defaultPlannerSettings();
		const asMember = fresh(await member.client.family.getSettings({ familyId }));
		expect(asMember.settings).toEqual(visible);
		expect(asMember.settings).not.toHaveProperty('weights');
		expect(asMember.canEdit).toBe(false);
		expect(fresh(await admin.client.family.getSettings({ familyId })).canEdit).toBe(true);
	});

	it('survives a hand-written jsonb', async () => {
		const broken = { slots: { lunch: { '9': 1, '0': { servings: 'x' } }, dinner: null }, rules: 'none', groupRanges: [1] };
		await actors.db.admin`update app.families set settings = ${actors.db.admin.json(broken)} where id = ${familyId}`;
		const { weights: _weights, ...visible } = defaultPlannerSettings();
		expect(fresh(await member.client.family.getSettings({ familyId })).settings).toEqual(visible);
		await actors.db.admin`update app.families set settings = '{}' where id = ${familyId}`;
	});

	it('shows owned and available books, and restrictions with names in the language', async () => {
		const tag = familyId.slice(0, 8);
		const [owned] = await actors.db.admin<{ id: string }[]>`insert into app.books (slug, title) values (${`w2-owned-${tag}`}, ${`A owned ${tag}`}) returning id`;
		const [archivedOwned] = await actors.db.admin<{ id: string }[]>`
			insert into app.books (slug, title, archived_at) values (${`w2-archived-owned-${tag}`}, ${`B archived owned ${tag}`}, now()) returning id`;
		const [archived] = await actors.db.admin<{ id: string }[]>`
			insert into app.books (slug, title, archived_at) values (${`w2-archived-${tag}`}, ${`C archived ${tag}`}, now()) returning id`;
		await actors.db.admin`insert into app.family_books (family_id, book_id) values (${familyId}, ${owned!.id}), (${familyId}, ${archivedOwned!.id})`;
		const [cucumber] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department) values (${`w2-cucumber-${tag}`}, '{"it-IT": "Cetrioli", "en-GB": "Cucumbers"}', 'produce') returning id`;
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max) values (${familyId}, ${cucumber!.id}, 'limit', 1)`;
		const view = fresh(await member.client.family.getSettings({ familyId }));
		const books = view.books.filter((b) => b.title.endsWith(tag));
		expect(books).toEqual([
			{ id: owned!.id, title: `A owned ${tag}`, owned: true },
			{ id: archivedOwned!.id, title: `B archived owned ${tag}`, owned: true },
		]);
		expect(view.books.map((b) => b.id)).not.toContain(archived!.id);
		expect(view.restrictions).toEqual([{ ingredientId: cucumber!.id, name: 'Cucumbers', restriction: 'limit', weeklyMax: 1 }]);
	});

	it('searches ingredients by name or synonym in the user language, without archived or restricted ones', async () => {
		const tag = crypto.randomUUID().slice(0, 8);
		const word = `pom${tag}`; // unique per run: the shared test database keeps growing
		const insert = (slug: string, name: Record<string, string>, synonyms: Record<string, string[]>, archived = false) => actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, synonyms, department, archived_at)
			values (${`w2-${slug}-${tag}`}, ${actors.db.admin.json(name)}, ${actors.db.admin.json(synonyms)}, 'produce', ${archived ? new Date() : null})
			returning id`;
		const [tomato] = await insert('tomato', { 'it-IT': `${word} rossi`, 'en-GB': `Tomatoes ${tag}` }, { 'it-IT': [], 'en-GB': [`tomato ${tag}`] });
		const [old] = await insert('old', { 'it-IT': `${word} vecchi`, 'en-GB': `Old ${tag}` }, { 'it-IT': [], 'en-GB': [] }, true);
		const [cherry] = await insert('cherry', { 'it-IT': `Ciliegie ${tag}`, 'en-GB': `Cherries ${tag}` }, { 'it-IT': [`piccoli ${word}`], 'en-GB': [] });
		// English user: synonym in English only.
		expect(await member.client.family.searchIngredients({ familyId, text: `tomato ${tag}` })).toEqual([{ id: tomato!.id, name: `Tomatoes ${tag}` }]);
		expect(await member.client.family.searchIngredients({ familyId, text: word })).toEqual([]);
		// Italian user, any case: names starting with the text first, then synonyms; archived never.
		expect(await admin.client.family.searchIngredients({ familyId, text: ` ${word.toUpperCase()} ` })).toEqual([
			{ id: tomato!.id, name: `${word} rossi` },
			{ id: cherry!.id, name: `Ciliegie ${tag}` },
		]);
		expect(old).toBeDefined();
		expect(await admin.client.family.searchIngredients({ familyId, text: ' p ' })).toEqual([]);
		expect((await admin.client.family.searchIngredients({ familyId, text: 'a' })).length).toBe(0);
		expect((await admin.client.family.searchIngredients({ familyId, text: 'er' })).length).toBeLessThanOrEqual(8);
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction) values (${familyId}, ${tomato!.id}, 'avoid')`;
		expect(await admin.client.family.searchIngredients({ familyId, text: word })).toEqual([{ id: cherry!.id, name: `Ciliegie ${tag}` }]);
	});

	it('ignores accents in the search', async () => {
		const tag = crypto.randomUUID().slice(0, 8);
		const [celery] = await actors.db.admin<{ id: string }[]>`
			insert into app.ingredients (slug, name, department) values (${`w2-celery-${tag}`}, ${actors.db.admin.json({ 'it-IT': `Sedano rapa è ${tag}`, 'en-GB': `Celeriac ${tag}` })}, 'produce')
			returning id`;
		expect((await admin.client.family.searchIngredients({ familyId, text: `RAPA E ${tag}` })).map((i) => i.id)).toEqual([celery!.id]);
	});
});
