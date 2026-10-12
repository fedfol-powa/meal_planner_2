// Service SQL through the real scripts/prod-sql.sh on the local stack (detail spec, section 8): launch
// baselines, removal of an unused family, reset before use, first generation check. Empties schema app.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupDatabase, type TestDatabase } from '../../server/test/support/db.ts';
import { lockFamilyWeeks } from '../../server/src/menu/generation.ts';
import { FINGERPRINT_SQL, loadAll } from '../import/load/run.ts';
import { bootstrap, column, compiledBootstrap, databaseUrl, emptyApp, enabled, fingerprint, fixture, loadOptions, rowCounts, sqlFile, type Fixture } from './support.ts';

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

	it('refuses a file without a single begin/commit before connecting', async () => {
		const file = join(mkdtempSync(join(tmpdir(), 'loose-')), 'loose.sql');
		writeFileSync(file, 'begin;\nselect 1;\ncommit;\ncommit;\n');
		const r = await sqlFile(file, '--preview');
		expect(r.code).toBe(1);
		expect(r.out).toContain("exactly one 'begin;' and one 'commit;'");
		expect(r.out).not.toMatch(/\(1 row\)/);
	});

	it('refuses the production target with a local url', async () => {
		const r = await sqlFile('supabase/scripts/show-fingerprint.sql', '--preview', {}, { target: 'production' });
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not postgres\.lronuqvtjdhfyychnscr/);
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

	it('bootstrap with --launch: baseline printed from its own transaction; refused when a family exists', async () => {
		const b = await bootstrap(db);
		expect(await fingerprint()).toBe(b.baseline);
		const again = compiledBootstrap(b.familyId, `${b.curatorId}@test.local`);
		const before = await rowCounts(admin);
		const refused = await sqlFile(again, '--apply', {}, { launch: true });
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain('a family already exists');
		expect(await rowCounts(admin)).toEqual(before);
		const rerun = await sqlFile(again, '--apply');
		expect(rerun.code).toBe(0);
		expect(rerun.out).toContain('family already exists as');
		expect(column(rerun.out, 'launch_baseline')).toBeNull();
	});

	it('bootstrap done, launch load failed: the family is removed with the bootstrap baseline', async () => {
		// Decision 3 of the coordinator (detail spec, section 5).
		const b = await bootstrap(db);
		await expect(loadAll(sql, { ...loadOptions(b, { missingInMenu: true }), launchFrom: b.baseline })).rejects.toThrow(/assente/);
		const r = await sqlFile('supabase/scripts/remove-family.sql', '--apply', { family_id: b.familyId, expected_fingerprint: b.baseline });
		expect(r.code).toBe(0);
		const [{ n }] = await admin`select count(*)::int as n from app.families where id = ${b.familyId}`;
		expect(n).toBe(0);
	});

	it('removes an unused family only with the last launch baseline, keeping the catalogue', async () => {
		const f = await fixture(db, sql);
		const refused = await sqlFile('supabase/scripts/remove-family.sql', '--apply', { family_id: f.familyId, expected_fingerprint: f.bootstrapBaseline });
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain(CHANGED);
		const removed = await sqlFile('supabase/scripts/remove-family.sql', '--apply', { family_id: f.familyId, expected_fingerprint: f.baseline });
		expect(removed.code).toBe(0);
		const [{ families, recipes }] = await admin`select (select count(*)::int from app.families) as families, (select count(*)::int from app.recipes) as recipes`;
		expect(families).toBe(0);
		expect(recipes).toBeGreaterThan(0);
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
		it(`refuses reset and removal after: ${what}`, async () => {
			const f = await fixture(db, sql);
			await write(admin, f);
			const afterWrite = await rowCounts(admin);
			for (const file of ['supabase/scripts/reset-app-data.sql', 'supabase/scripts/remove-family.sql']) {
				const sets: Record<string, string> = file.includes('remove') ? { family_id: f.familyId, expected_fingerprint: f.baseline } : { expected_fingerprint: f.baseline };
				const r = await sqlFile(file, '--apply', sets);
				expect(r.code).not.toBe(0);
				expect(r.out).toContain(CHANGED);
			}
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
			const reset = sqlFile('supabase/scripts/reset-app-data.sql', '--apply', { expected_fingerprint: f.baseline });
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

	it('a write that waits for the launch load lands after its baseline: reset and removal refuse', async () => {
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
			for (const file of ['supabase/scripts/reset-app-data.sql', 'supabase/scripts/remove-family.sql']) {
				const r = await sqlFile(file, '--apply', { family_id: b.familyId, expected_fingerprint: result.baseline! });
				expect(r.code).not.toBe(0);
				expect(r.out).toContain(CHANGED);
			}
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
		const r = await sqlFile('supabase/scripts/reset-app-data.sql', '--apply', { expected_fingerprint: f.baseline });
		expect(r.code).not.toBe(0);
		expect(r.out).toContain(CHANGED);
	});

	it('resets with the recorded fingerprint: catalogue and families empty, profiles and roles kept', async () => {
		const f = await fixture(db, sql);
		const before = await rowCounts(admin);
		const r = await sqlFile('supabase/scripts/reset-app-data.sql', '--apply', { expected_fingerprint: f.baseline });
		expect(r.code).toBe(0);
		const after = await rowCounts(admin);
		for (const table of ['families', 'recipes', 'ingredients', 'books', 'weeks', 'meal_slots', 'ratings', 'recipe_versions', 'recipe_drafts', 'ingredient_versions'])
			expect(after[table], table).toBe(0);
		for (const table of ['profiles', 'user_roles']) expect(after[table], table).toBe(before[table]);
		expect(before.user_roles).toBeGreaterThan(0);
	});

	it('reports the first generation of the cron', async () => {
		const f = await fixture(db, sql);
		await admin`insert into app.weeks (family_id, starts_on, generated_at) values (${f.familyId}, '2026-10-19', '2026-10-14 18:10:00+00')`;
		await admin`insert into app.weekly_jobs (family_id, target_week, status, attempts, updated_at) values (${f.familyId}, '2026-10-19', 'done', 1, '2026-10-14 18:10:05+00')`;
		await admin`insert into app.weeks (family_id, starts_on, generated_at) values (${f.familyId}, '2026-10-26', '2026-10-21 08:00:00+00')`;
		const byCron = await sqlFile('supabase/scripts/check-first-generation.sql', '--preview', { family_id: f.familyId, week_start: '2026-10-19' });
		expect(byCron.code).toBe(0);
		expect(byCron.out).toMatch(/\|\s*t\s*$/m);
		const lazy = await sqlFile('supabase/scripts/check-first-generation.sql', '--preview', { family_id: f.familyId, week_start: '2026-10-26' });
		expect(lazy.code).toBe(0);
		expect(lazy.out).toMatch(/\|\s*f\s*$/m);
	});

	it('stops bootstrap.sql on the example uuid (ON_ERROR_STOP reaches psql)', async () => {
		const r = await sqlFile('supabase/scripts/bootstrap.sql', '--preview');
		expect(r.code).not.toBe(0);
		expect(r.out).toContain('write the family id first');
		expect(r.out).not.toContain('Apply with');
	});
});
