import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../../../server/test/support/db.ts';
import { cleanupLoadCase, writeOriginFixture, type LoadCase } from './test-origin.ts';
import { lockFamilyWeeks } from '../../../server/src/menu/generation.ts';
import { FINGERPRINT_SQL, LoadRefused, loadAll } from './run.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotInputs } from './inputs-fingerprint.ts';
import { command } from './test-command.ts';

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

	it('writes settings, restrictions, owned books, ratings, tried recipes, weeks and preferences', async () => {
		const { c, options } = await freshCase();
		const result = await loadAll(sql, options({ dryRun: true }));
		expect(result.family.settings).toBeGreaterThan(0);
		expect(result.family.ownedBooks).toEqual([`Libro ${c.prefix}`]);
		expect(result.family.ratings.pending).toEqual([`${c.prefix}bozza`]); // rating of a draft
		expect(result.family.weeks.created).toBe(2); // one of history, one current
		expect(result.family.duplicates).toHaveLength(1);
		expect(result.family.tried.created).toBeGreaterThanOrEqual(1); // the duplicate became a tried recipe
		expect(result.family.preferences.map((p) => p.originSlug)).toEqual([`${c.prefix}libro`]);
	});

	it('never overwrites what the family changed, and skips existing weeks (rerun in the same test)', async () => {
		const { familyId, curator, options } = await freshCase();
		await loadAll(sql, options());
		await db.admin`update app.ratings set stars = 1 where user_id = ${curator}`;
		await db.admin`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${familyId}`;
		const again = await loadAll(sql, options());
		expect(again.family).toMatchObject({ settings: 0, weeks: { created: 0 }, ratings: { created: 0 } });
		const stars = await db.admin`select distinct stars from app.ratings where user_id = ${curator}`;
		expect(stars.map((s) => s.stars)).toEqual([1]);
		const [{ rules }] = await db.admin`select settings->'rules' as rules from app.families where id = ${familyId}`;
		expect(rules).toEqual([]);
	});

	it('writes history and current meals as the app, with free text and no generation mark', async () => {
		const { familyId, options } = await freshCase();
		await loadAll(sql, options());
		const slots = await db.admin`select w.generated_at, s.free_text, s.servings, s.updated_by from app.meal_slots s
			join app.weeks w on w.id = s.week_id where w.family_id = ${familyId}`;
		expect(slots.length).toBeGreaterThan(0);
		expect(slots.every((s) => s.generated_at === null && s.updated_by === null)).toBe(true);
		expect(slots.some((s) => s.free_text === 'Pizza da asporto' && s.servings === 4)).toBe(true);
	});

	it('refuses a first load when the app already generated a week', async () => {
		const { familyId, options } = await freshCase();
		await db.admin`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, '2026-10-19', now())`;
		await expect(loadAll(sql, options({ dryRun: true }))).rejects.toThrow(/already generated/);
	});

	it('stops when the current menu cites a missing recipe, rolling back the catalogue already written', async () => {
		const { c, familyId, options } = await freshCase({ missingInMenu: true });
		await expect(loadAll(sql, options())).rejects.toThrow(new RegExp(`${c.prefix}assente`));
		expect(await count('recipes', c.prefix)).toBe(0); // written before the error, then rolled back
		expect(await count('ingredients', c.prefix)).toBe(0);
		const [{ n }] = await db.admin`select count(*)::int as n from app.weeks where family_id = ${familyId}`;
		expect(n).toBe(0);
	});

	it('waits for a generation holding the lock, then refuses because the week it made came first', async () => {
		const { familyId, options } = await freshCase();
		const other = postgres(db.appServerUrl.replace('app_server:app_server_test', 'postgres:postgres'), { max: 1, onnotice: () => {} });
		try {
			let release!: () => void;
			const held = new Promise<void>((r) => { release = r; });
			const generation = other.begin(async (tx) => {
				await lockFamilyWeeks(tx as never, familyId);
				await held;
				await tx`insert into app.weeks (family_id, starts_on, generated_at) values (${familyId}, '2026-10-19', now())`;
			});
			await new Promise((r) => setTimeout(r, 200));
			const load = loadAll(sql, options());
			await new Promise((r) => setTimeout(r, 300));
			const [{ waiting }] = await db.admin`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'`;
			expect(waiting).toBe(1);
			release();
			await generation;
			await expect(load).rejects.toThrow(/already generated/);
		} finally {
			await other.end();
		}
	});

	it('writes the snapshot: a card changed while the load waits for the lock changes nothing (review of PR #34, finding 5)', async () => {
		const { c, familyId, options } = await freshCase();
		const snap = snapshotInputs(c.dir, join(c.dir, 'scripts/import'));
		const other = postgres(db.appServerUrl.replace('app_server:app_server_test', 'postgres:postgres'), { max: 1, onnotice: () => {} });
		try {
			let release!: () => void;
			const held = new Promise<void>((r) => { release = r; });
			const generation = other.begin(async (tx) => {
				await lockFamilyWeeks(tx as never, familyId);
				await held;
			});
			await new Promise((r) => setTimeout(r, 200));
			const load = loadAll(sql, options({ root: snap.root, originDirectory: snap.origin }));
			for (let i = 0; i < 50; i++) {
				const [{ waiting }] = await db.admin`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'`;
				if (waiting === 1) break;
				await new Promise((r) => setTimeout(r, 100));
			}
			const cards = join(c.dir, 'ricettario/ricette.yaml');
			writeFileSync(cards, readFileSync(cards, 'utf8').replaceAll(`Pubblicabile ${c.prefix}`, 'Changed while waiting'));
			release();
			await generation;
			await load;
			const [recipe] = await db.admin<{ name: Record<string, string> }[]>`select name from app.recipes where origin_slug = ${`${c.prefix}pubblicabile`}`;
			expect(recipe!.name['it-IT']).toBe(`Pubblicabile ${c.prefix}`);
		} finally {
			snap.dispose();
			await other.end();
		}
	});

	it('waits for a concurrent settings write, then keeps it', async () => {
		const { familyId, options } = await freshCase();
		const other = postgres(db.appServerUrl.replace('app_server:app_server_test', 'postgres:postgres'), { max: 1, onnotice: () => {} });
		try {
			let release!: () => void;
			const held = new Promise<void>((r) => { release = r; });
			const write = other.begin(async (tx) => {
				await tx`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${familyId}`;
				await held;
			});
			await new Promise((r) => setTimeout(r, 200));
			const load = loadAll(sql, options());
			await new Promise((r) => setTimeout(r, 300));
			release();
			await write;
			await load;
			const [{ rules }] = await db.admin`select settings->'rules' as rules from app.families where id = ${familyId}`;
			expect(rules).toEqual([]);
		} finally {
			await other.end();
		}
	});

	it('runs --check-connection with node against the local database', async () => {
		const r = await command(['--credentials', '<env>', '--check-connection', '--local'], `APP_SERVER_DATABASE_URL=${db.appServerUrl}\n`);
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/families, \d+ recipes visible to app_job/);
	});
	it('reports a wrong password as a code, without the password', async () => {
		const r = await command(['--credentials', '<env>', '--check-connection', '--local'], `APP_SERVER_DATABASE_URL=${db.appServerUrl.replace('app_server_test', 's3cr3t-wrong')}\n`);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/failed: \w+ 28P01/);
		expect(r.out).not.toContain('s3cr3t');
	});
});
