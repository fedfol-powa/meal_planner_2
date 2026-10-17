import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';

describe.skipIf(!hasDatabase)('profile', () => {
	let actors: Actors;
	let auth: ReturnType<typeof installFakeAuth>;
	beforeAll(async () => {
		actors = await setupActors();
		// profile.update calls Auth after the commit when the language changes (spec W15).
		auth = installFakeAuth(actors.db);
	});
	afterAll(async () => {
		auth?.restore();
		await actors?.close();
	});

	const versionOf = async (familyId: string) =>
		(await actors.db.admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${familyId}`)[0]!.v;

	it('shows the user, the families by name and the first one by default', async () => {
		const anna = await actors.user();
		const b = await actors.db.createFamily([{ userId: anna.userId, role: 'member' }]);
		const a = await actors.db.createFamily([{ userId: anna.userId, role: 'family_admin' }]);
		await actors.db.admin`update app.families set name = 'Beta' where id = ${b}`;
		await actors.db.admin`update app.families set name = 'Alfa', measurement_system = 'uk_imperial' where id = ${a}`;
		await actors.db.grantGlobalRole(anna.userId, 'recipe_curator');
		const view = await anna.client.profile.get({});
		expect(view.user).toMatchObject({ id: anna.userId, email: `${anna.userId}@test.local`, locale: 'it-IT', globalRoles: ['recipe_curator'] });
		expect(view.families).toEqual([
			{ id: a, name: 'Alfa', role: 'family_admin', timeZone: 'Europe/Rome', measurementSystem: 'uk_imperial' },
			{ id: b, name: 'Beta', role: 'member', timeZone: 'Europe/Rome', measurementSystem: 'metric' },
		]);
		expect(view.currentFamilyId).toBe(a);
	});

	it('has no current family without families', async () => {
		const solo = await actors.user();
		const view = await solo.client.profile.get({});
		expect(view.families).toEqual([]);
		expect(view.currentFamilyId).toBeNull();
	});

	it('saves name and language; the next request speaks the new language', async () => {
		const bruno = await actors.user();
		const view = await bruno.client.profile.update({ displayName: '  Bruno  ', locale: 'en-GB' });
		expect(view.user).toMatchObject({ displayName: 'Bruno', locale: 'en-GB' });
		expect((await bruno.client.session.whoami({})).locale).toBe('en-GB');
		expect((await bruno.client.profile.update({ locale: 'it-IT' })).user).toMatchObject({ displayName: 'Bruno', locale: 'it-IT' });
	});

	describe('the language of the Auth emails (spec W15, section 2)', () => {
		it('a change of language puts only the locale in Auth, after the commit', async () => {
			const dora = await actors.user();
			auth.metadata.length = 0;
			auth.openTransactionsAtPut.length = 0;
			await dora.client.profile.update({ displayName: 'Dora', locale: 'en-GB' });
			expect(auth.metadata).toEqual([{ id: dora.userId, body: { user_metadata: { locale: 'en-GB' } } }]);
			expect(auth.openTransactionsAtPut).toEqual([0]);
		});

		it('a change of the name only does not call Auth', async () => {
			const ezio = await actors.user();
			auth.metadata.length = 0;
			await ezio.client.profile.update({ displayName: 'Ezio' });
			expect(auth.metadata).toEqual([]);
		});

		it('a failure of Auth leaves the answer unchanged and is logged without data', async () => {
			const fede = await actors.user();
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			auth.failNextPut();
			const view = await fede.client.profile.update({ locale: 'en-GB' });
			expect(view.user.locale).toBe('en-GB');
			const lines = errors.mock.calls.map(([line]) => String(line));
			errors.mockRestore();
			expect(lines.map((line) => JSON.parse(line).event)).toContain('auth_locale_sync_failed');
			expect(lines.join('\n')).not.toContain('@');
		});
	});

	it('refuses an empty name, a long name or an empty change', async () => {
		const carla = await actors.user();
		for (const input of [{ displayName: '   ' }, { displayName: 'x'.repeat(61) }, {}, { locale: 'fr-FR' }]) {
			expect((await errorOf(carla.client.profile.update(input as never))).code, JSON.stringify(input)).toBe('invalid');
		}
	});

	it('remembers the shown family, only among own families', async () => {
		const dario = await actors.user();
		const mine = await actors.db.createFamily([{ userId: dario.userId, role: 'member' }]);
		const other = await actors.db.createFamily([]);
		const second = await actors.db.createFamily([{ userId: dario.userId, role: 'member' }]);
		await actors.db.admin`update app.families set name = 'A' where id = ${mine}`;
		await actors.db.admin`update app.families set name = 'B' where id = ${second}`;
		expect((await dario.client.profile.setCurrentFamily({ familyId: second })).currentFamilyId).toBe(second);
		expect((await dario.client.profile.get({})).currentFamilyId).toBe(second);
		expect((await dario.client.profile.setCurrentFamily({ familyId: second })).currentFamilyId).toBe(second);
		expect((await errorOf(dario.client.profile.setCurrentFamily({ familyId: other }))).code).toBe('forbidden');
		expect((await errorOf(dario.client.profile.setCurrentFamily({ familyId: crypto.randomUUID() }))).code).toBe('forbidden');
		await actors.db.admin`delete from app.family_members where family_id = ${second} and user_id = ${dario.userId}`;
		const view = await dario.client.profile.get({});
		expect(view.currentFamilyId).toBe(mine);
		expect(view.families.map((f) => f.id)).toEqual([mine]);
	});

	it('changes no family counter and stays private to the user', async () => {
		const elena = await actors.user();
		const fabio = await actors.user();
		const shared = await actors.db.createFamily([{ userId: elena.userId, role: 'member' }, { userId: fabio.userId, role: 'member' }]);
		const own = await actors.db.createFamily([{ userId: elena.userId, role: 'member' }]);
		await actors.db.admin`update app.families set name = 'Shared' where id = ${shared}`;
		await actors.db.admin`update app.families set name = 'Own' where id = ${own}`;
		const before = [await versionOf(shared), await versionOf(own)];
		await elena.client.profile.setCurrentFamily({ familyId: shared });
		await elena.client.profile.update({ locale: 'en-GB' });
		expect([await versionOf(shared), await versionOf(own)]).toEqual(before);
		// Fabio shares a family with Elena: his profile says nothing about her choice.
		expect((await fabio.client.profile.get({})).currentFamilyId).toBe(shared);
	});

	it('works the same for an agent', async () => {
		const agent = await actors.user({ agent: true });
		expect((await agent.client.profile.update({ locale: 'en-GB' })).user.locale).toBe('en-GB');
	});
});
