// The first collaudo is read only (detail spec, section 5): Federico's reads through the real app must
// not change the fingerprint of schema app, or the removal of the family would be refused afterwards.
// If a read writes, this test names it: it leaves the first collaudo (spec and runbook), the server stays.
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupActors, type Actors } from '../../server/test/support/actors.ts';
import { FINGERPRINT_SQL, loadAll } from '../import/load/run.ts';
import { databaseUrl, emptyApp, enabled, loadOptions } from './support.ts';

describe.skipIf(!enabled)('first collaudo reads', () => {
	let actors: Actors;
	let sql: postgres.Sql;
	beforeAll(async () => {
		actors = await setupActors();
		sql = postgres(databaseUrl, { max: 1, fetch_types: false, onnotice: () => {} });
		await emptyApp(actors.db.admin);
	});
	afterAll(async () => {
		vi.useRealTimers();
		await sql?.end();
		await actors?.close();
	});

	const fingerprintNow = () =>
		actors.db.admin.begin(async (tx) => {
			await tx.unsafe(FINGERPRINT_SQL);
			const [row] = await tx<{ f: string }[]>`select pg_temp.app_fingerprint() as f`;
			return row!.f;
		}) as Promise<string>;

	it('leaves the fingerprint unchanged after every read of the first collaudo', async () => {
		// Inside the launch window: Tuesday of the imported current week, 10:00 in Rome.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
		const { userId, client } = await actors.user();
		await actors.db.grantGlobalRole(userId, 'recipe_curator');
		await actors.db.grantGlobalRole(userId, 'app_admin');
		const familyId = await actors.db.createFamily([{ userId, role: 'family_admin' }]);
		await loadAll(sql, loadOptions({ familyId, curatorId: userId }));

		const reads: [string, () => Promise<unknown>][] = [
			['session', () => client.session.whoami({})],
			['family', () => client.family.get({ familyId })],
			['menu of the current week', () => client.menu.getWeek({ familyId, weekStartsOn: '2026-10-12' })],
			['recipe book', () => client.recipes.search({ familyId, query: {} })],
			['drafts', () => client.catalogue.overview({})],
			['settings', () => client.family.getSettings({ familyId })],
		];
		for (const [what, read] of reads) {
			const before = await fingerprintNow();
			await read();
			expect(await fingerprintNow(), `the read "${what}" wrote to schema app`).toBe(before);
		}
	});
});
