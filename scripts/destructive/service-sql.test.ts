// Service SQL through the real scripts/prod-sql.ts on the local stack (detail spec, section 8): launch
// baselines only from the initial state, reset before use. Empties schema app.
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupDatabase, type TestDatabase } from '../../server/test/support/db.ts';
import { lockFamilyWeeks } from '../../server/src/menu/generation.ts';
import { FINGERPRINT_SQL, loadAll } from '../import/load/run.ts';
import { bootstrap, bootstrapSets, column, databaseUrl, emptyApp, enabled, fingerprint, fixture, loadOptions, rowCounts, serviceSql, type Fixture } from './support.ts';

const CHANGED = 'app data changed since the launch baseline';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled)('service SQL on the local stack', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let admin: postgres.Sql;
	beforeAll(async () => {
		db = await setupDatabase();
		admin = db.admin;
		// The load connects as postgres, on its own connection.
		sql = postgres(databaseUrl, { max: 1, fetch_types: false, onnotice: () => {} });
	});
	beforeEach(async () => {
		await emptyApp(admin);
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	/** Waits until `n` backends wait on a lock of this kind. */
	async function waitingOn(kind: 'advisory' | 'relation', n = 1) {
		for (let i = 0; i < 100; i++) {
			const [{ waiting }] = await admin<{ waiting: number }[]>`
				select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and wait_event = ${kind}`;
			if (waiting >= n) return waiting;
			await pause(100);
		}
		throw new Error(`no backend waiting on a ${kind} lock`);
	}

	it('refuses the production target with a local url', async () => {
		const r = await serviceSql('show-fingerprint', '--preview', {}, { target: 'production' });
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not postgres\.lronuqvtjdhfyychnscr|not clean/);
		expect(r.out).not.toContain(databaseUrl);
	});

	it('prints the same fingerprint as the launch load and as app_backup', async () => {
		const f = await fixture(db, sql);
		expect(await fingerprint()).toBe(f.baseline);
		const backup = postgres(db.appServerUrl, { max: 1, fetch_types: false, onnotice: () => {} });
		try {
			const asBackup = await backup.begin(async (tx) => {
				await tx`set local role app_backup`;
				await tx.unsafe(FINGERPRINT_SQL);
				const [row] = await tx<{ f: string }[]>`select pg_temp.app_fingerprint() as f`;
				return row!.f;
			});
			expect(asBackup).toBe(f.baseline);
		} finally {
			await backup.end();
		}
	});

	it('bootstrap with --launch: baseline printed from its own transaction; refused when not the initial state', async () => {
		const b = await bootstrap(db);
		expect(await fingerprint()).toBe(b.baseline);
		const again = bootstrapSets(b.familyId, `${b.curatorId}@test.local`);
		const before = await rowCounts(admin);
		const refused = await serviceSql('bootstrap', '--apply', again, { launch: true });
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain('not the initial state');
		expect(await rowCounts(admin)).toEqual(before);
		const rerun = await serviceSql('bootstrap', '--apply', again);
		expect(rerun.code).toBe(0);
		expect(rerun.out).toContain('family already exists as');
		expect(column(rerun.out, 'launch_baseline')).toBeNull();
	});

	it('a new --launch after a removal and a real catalogue write is refused (review of PR #34, finding 8)', async () => {
		const f = await fixture(db, sql);
		await admin`delete from app.families where id = ${f.familyId}`;
		await admin`update app.recipes set status = 'archived' where id = ${f.recipeId}`; // a curator's real write
		const before = await rowCounts(admin);
		const { userId } = await db.createUser();
		const r = await serviceSql('bootstrap', '--apply', bootstrapSets(crypto.randomUUID(), `${userId}@test.local`), { launch: true });
		expect(r.code).not.toBe(0);
		expect(r.out).toMatch(/not the initial state: app tables with rows: .*recipes/);
		expect(column(r.out, 'launch_baseline')).toBeNull();
		expect((await rowCounts(admin)).recipes).toBe(before.recipes);
	});

	it('the way to start again: reset with the last launch baseline, then --launch from the initial state', async () => {
		const f = await fixture(db, sql);
		const reset = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: f.baseline });
		expect(reset.code, reset.out).toBe(0);
		const b = await bootstrap(db);
		expect(b.baseline).toMatch(/^[0-9a-f]{32}$/);
	});

	it('bootstrap done, launch load failed: the reset works with the bootstrap baseline', async () => {
		// Decision 3 of the coordinator, simplified after the review of PR #34 (detail spec, section 5).
		const b = await bootstrap(db);
		await expect(loadAll(sql, { ...loadOptions(b, { missingInMenu: true }), launchFrom: b.baseline })).rejects.toThrow(/assente/);
		const r = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: b.baseline });
		expect(r.code, r.out).toBe(0);
		const [{ n }] = await admin`select count(*)::int as n from app.families`;
		expect(n).toBe(0);
	});

	const writes: [string, (a: postgres.Sql, f: Fixture) => Promise<unknown>][] = [
		['rating changed', (a, f) => a`update app.ratings set stars = 5 where user_id = ${f.curatorId}`],
		['free shopping item', async (a, f) => {
			const [week] = await a<{ id: string }[]>`select id from app.weeks where family_id = ${f.familyId} order by starts_on desc limit 1`;
			const [list] = await a<{ id: string }[]>`insert into app.shopping_lists (family_id, week_id) values (${f.familyId}, ${week!.id}) returning id`;
			return a`insert into app.shopping_list_items (shopping_list_id, text) values (${list!.id}, 'pane')`;
		}],
		['settings changed', (a, f) => a`update app.families set settings = jsonb_set(settings, '{rules}', '[]') where id = ${f.familyId}`],
		['owned book removed', (a, f) => a`delete from app.family_books where family_id = ${f.familyId}`],
		['exclusion added', (a, f) => a`insert into app.recipe_exclusions (family_id, recipe_id) values (${f.familyId}, ${f.recipeId})`],
		['ingredient renamed', (a, f) => a`update app.ingredients set synonyms = '{"it-IT":["x"],"en-GB":[]}' where id = ${f.ingredientId}`],
		['equivalence changed', (a, f) => a`update app.ingredient_unit_equivalences set factor = factor + 1 where ingredient_id = ${f.ingredientId}`],
		['recipe archived', (a, f) => a`update app.recipes set status = 'archived' where id = ${f.recipeId}`],
	];
	for (const [what, write] of writes)
		it(`refuses the reset after: ${what}`, async () => {
			const f = await fixture(db, sql);
			await write(admin, f);
			const afterWrite = await rowCounts(admin);
			const r = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: f.baseline });
			expect(r.code).not.toBe(0);
			expect(r.out).toContain(CHANGED);
			expect(await rowCounts(admin)).toEqual(afterWrite);
		});

	it('waits for a concurrent write, then refuses', async () => {
		const f = await fixture(db, sql);
		const other = postgres(databaseUrl, { max: 1, onnotice: () => {} });
		let release: (() => void) | undefined;
		try {
			const held = new Promise<void>((r) => {
				release = r;
			});
			const write = other.begin(async (tx) => {
				await tx`update app.ratings set stars = 5 where user_id = ${f.curatorId}`;
				await held;
			});
			await pause(200);
			const reset = serviceSql('reset-app-data', '--apply', { expected_fingerprint: f.baseline });
			await waitingOn('relation');
			release!();
			await write;
			const afterWrite = await rowCounts(admin);
			const r = await reset;
			expect(r.code).not.toBe(0);
			expect(r.out).toContain(CHANGED);
			expect(await rowCounts(admin)).toEqual(afterWrite);
		} finally {
			release?.();
			await other.end();
		}
	});

	it('a write that waits for the launch load lands after its baseline: the reset refuses', async () => {
		const b = await bootstrap(db);
		const holder = postgres(databaseUrl, { max: 1, onnotice: () => {} });
		const writer = postgres(databaseUrl, { max: 1, onnotice: () => {} });
		let release: (() => void) | undefined;
		try {
			const held = new Promise<void>((r) => {
				release = r;
			});
			const generation = holder.begin(async (tx) => {
				await lockFamilyWeeks(tx as never, b.familyId);
				await held;
			});
			await pause(200);
			const load = loadAll(sql, { ...loadOptions(b), launchFrom: b.baseline });
			await waitingOn('advisory'); // A holds every table and waits for C
			// execute(): a Postgres.js query starts only when awaited, and this one must start now.
			const write = writer`update app.families set name = 'Renamed while loading' where id = ${b.familyId}`.execute();
			await waitingOn('relation'); // B waits for A's table locks
			release!();
			await generation;
			const result = await load;
			await write;
			expect(await fingerprint()).not.toBe(result.baseline);
			const r = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: result.baseline! });
			expect(r.code).not.toBe(0);
			expect(r.out).toContain(CHANGED);
			const [{ name }] = await admin`select name from app.families where id = ${b.familyId}`;
			expect(name).toBe('Renamed while loading');
		} finally {
			release?.();
			await holder.end();
			await writer.end();
		}
	});

	it('a rerun after the start renews nothing', async () => {
		const f = await fixture(db, sql);
		await admin`update app.ratings set stars = 5 where user_id = ${f.curatorId}`;
		await expect(loadAll(sql, { ...loadOptions(f), launchFrom: f.baseline })).rejects.toThrow(/changed since the launch baseline/);
		expect((await loadAll(sql, loadOptions(f))).baseline).toBeNull();
		const r = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: f.baseline });
		expect(r.code).not.toBe(0);
		expect(r.out).toContain(CHANGED);
	});

	it('resets with the recorded fingerprint: catalogue and families empty, profiles and roles kept', async () => {
		const f = await fixture(db, sql);
		const before = await rowCounts(admin);
		const r = await serviceSql('reset-app-data', '--apply', { expected_fingerprint: f.baseline });
		expect(r.code).toBe(0);
		const after = await rowCounts(admin);
		for (const table of ['families', 'recipes', 'ingredients', 'books', 'weeks', 'meal_slots', 'ratings', 'recipe_versions', 'recipe_drafts', 'ingredient_versions'])
			expect(after[table], table).toBe(0);
		for (const table of ['profiles', 'user_roles']) expect(after[table], table).toBe(before[table]);
		expect(before.user_roles).toBeGreaterThan(0);
	});

	it('stops bootstrap.sql on the example uuid (ON_ERROR_STOP reaches psql)', async () => {
		const { userId } = await db.createUser();
		const r = await serviceSql('bootstrap', '--preview', bootstrapSets('00000000-0000-0000-0000-000000000000', `${userId}@test.local`));
		expect(r.code).not.toBe(0);
		expect(r.out).toContain('write the family id first');
		expect(r.out).not.toContain('Apply with');
	});
});
