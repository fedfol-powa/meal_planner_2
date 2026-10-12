import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../../../server/test/support/db.ts';
import { cleanupLoadCase, writeOriginFixture, type LoadCase } from './test-origin.ts';
import { FINGERPRINT_SQL, LoadRefused, loadAll } from './run.ts';

describe.skipIf(!hasDatabase)('load into the database', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	const cases: { c: LoadCase; families: string[] }[] = [];
	beforeAll(async () => {
		db = await setupDatabase();
		// The load connects as postgres: only that role can lock every table of app for a launch load.
		sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, fetch_types: false, onnotice: () => {} });
	});
	afterEach(async () => {
		for (const { c, families } of cases.splice(0)) await cleanupLoadCase(db.admin, c, families);
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	/** A curator, its family and an origin of its own: no test sees another's rows. */
	async function freshCase(variant = {}) {
		const { userId: curator } = await db.createUser();
		await db.grantGlobalRole(curator, 'recipe_curator');
		const familyId = await db.createFamily([{ userId: curator, role: 'family_admin' }]);
		const c = writeOriginFixture(variant);
		cases.push({ c, families: [familyId] });
		const options = (over = {}) => ({ today: '2026-10-13', familyId, curatorId: curator, root: c.dir, originDirectory: c.dir, dryRun: false, ...over });
		return { c, curator, familyId, options };
	}
	const count = async (table: string, prefix: string) =>
		(await db.admin.unsafe(`select count(*)::int as n from app.${table} where ${table === 'recipes' ? 'origin_slug' : 'slug'} like $1`, [`${prefix}%`]))[0]!.n as number;
	const fingerprintNow = () =>
		db.admin.begin(async (tx) => {
			await tx.unsafe(FINGERPRINT_SQL);
			const [row] = await tx<{ f: string }[]>`select pg_temp.app_fingerprint() as f`;
			return row!.f;
		}) as Promise<string>;

	it('dry-run counts everything and leaves nothing', async () => {
		const { c, options } = await freshCase();
		const result = await loadAll(sql, options({ dryRun: true }));
		expect(result.mode).toBe('dry-run');
		expect(result.catalogue.recipes).toMatchObject({ published: 2, drafts: 1 });
		expect(await count('recipes', c.prefix)).toBe(0);
	});

	it('writes with channel import and origin slugs, and a rerun in the same test creates nothing', async () => {
		const { c, options } = await freshCase();
		await loadAll(sql, options());
		const rows = await db.admin`select v.channel from app.recipes r join app.recipe_versions v on v.recipe_id = r.id where r.origin_slug like ${`${c.prefix}%`}`;
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.channel === 'import')).toBe(true);
		const again = await loadAll(sql, options({ dryRun: true }));
		expect(again.catalogue.recipes).toEqual({ published: 0, drafts: 0, present: 3 });
		expect(again.catalogue.ingredients.created).toBe(0);
		expect(again.catalogue.equivalences.created).toBe(0);
	});

	it('keeps an equivalence a curator changed, and reports it', async () => {
		const { c, options } = await freshCase();
		await loadAll(sql, options());
		const [eq] = await db.admin`update app.ingredient_unit_equivalences e set factor = factor * 2 from app.ingredients i
			where i.id = e.ingredient_id and i.slug like ${`${c.prefix}%`} returning e.id, e.factor, i.version`;
		const again = await loadAll(sql, options());
		expect(again.catalogue.equivalences.diverging).toHaveLength(1);
		const [after] = await db.admin`select e.factor, i.version from app.ingredient_unit_equivalences e join app.ingredients i on i.id = e.ingredient_id where e.id = ${eq!.id}`;
		expect(after).toEqual({ factor: eq!.factor, version: eq!.version });
	});

	it('publishes nothing while a review file is pending, also when writing', async () => {
		const { c, options } = await freshCase({ pendingReview: true });
		const result = await loadAll(sql, options());
		expect(result.catalogue.recipes.published).toBe(0);
		expect(result.catalogue.publicationBlocked).not.toEqual([]);
		const statuses = await db.admin`select distinct status from app.recipes where origin_slug like ${`${c.prefix}%`}`;
		expect(statuses.map((s) => s.status)).toEqual(['draft']);
	});

	it('refuses a user who is not a curator, or not an admin of the family', async () => {
		const { options } = await freshCase();
		const { userId: plain } = await db.createUser();
		await expect(loadAll(sql, options({ curatorId: plain, dryRun: true }))).rejects.toThrow(LoadRefused);
		const { userId: otherCurator } = await db.createUser();
		await db.grantGlobalRole(otherCurator, 'recipe_curator');
		await expect(loadAll(sql, options({ curatorId: otherCurator, dryRun: true }))).rejects.toThrow(/not an admin/);
	});

	it('launch load: checks the baseline under the table locks and returns the new one, computed before the commit', async () => {
		const { options } = await freshCase();
		const start = await fingerprintNow();
		const result = await loadAll(sql, options({ launchFrom: start }));
		expect(result.baseline).toMatch(/^[0-9a-f]{32}$/);
		expect(await fingerprintNow()).toBe(result.baseline);
		// A rerun without launchFrom renews nothing; a dry run never gives a baseline.
		expect((await loadAll(sql, options())).baseline).toBeNull();
		expect((await loadAll(sql, options({ dryRun: true, launchFrom: await fingerprintNow() }))).baseline).toBeNull();
	});

	it('refuses a launch load from a stale baseline, writing nothing', async () => {
		const { c, options } = await freshCase();
		await expect(loadAll(sql, options({ launchFrom: '0'.repeat(32) }))).rejects.toThrow(/changed since the launch baseline/);
		expect(await count('recipes', c.prefix)).toBe(0);
	});

	it('leaves the previous baseline valid when the launch load fails', async () => {
		const { options } = await freshCase({ missingInMenu: true });
		const start = await fingerprintNow();
		await expect(loadAll(sql, options({ launchFrom: start }))).rejects.toThrow(/assente/);
		expect(await fingerprintNow()).toBe(start); // the removal of the family can still use it
	});
});
