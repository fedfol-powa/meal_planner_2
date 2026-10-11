import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runNightlyExportOn } from '../../src/backup/export.ts';
import { decodeExport, encodeExport, importKey } from '../../src/backup/format.ts';
import { readSnapshot, type Snapshot } from '../../src/backup/read.ts';
import { XID_MARKERS } from '../../src/backup/restore.ts';
import { migrationVersions } from '../../../scripts/backup/migrations-commit.ts';
import { type BackupFixtures, seedBackupFixtures } from '../support/backup.ts';
import { hasDatabase, setupDatabase } from '../support/db.ts';
import { MemoryBucket } from '../support/r2.ts';

const run = promisify(execFile);
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const cli = join(repoRoot, 'scripts', 'backup', 'restore.ts');
// Destructive: only in CI or when asked explicitly.
const enabled = hasDatabase && Boolean(process.env.CI || process.env.RESTORE_DRILL);
const databaseUrl = process.env.TEST_DATABASE_URL!;

/** Marker values are reset by design: compare the rest as text. */
const withoutMarkers = (text: string) =>
	Object.values(XID_MARKERS).flat().reduce((t, m) => t.replace(new RegExp(`"${m}":(null|"\\d+")`, 'g'), `"${m}":null`), text);

describe.skipIf(!enabled)('restore drill on a destination prepared like the procedure', () => {
	const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
	let dir: string;
	let file: string;
	let document: string;
	let before: Snapshot;
	let fx: BackupFixtures;
	let admin: postgres.Sql;

	const cliRun = async (args: string[]) => {
		const env = { ...process.env, BACKUP_ENCRYPTION_KEY: keyB64, DATABASE_URL: databaseUrl };
		try {
			const { stdout, stderr } = await run(process.execPath, [cli, ...args], { env, cwd: repoRoot });
			return { code: 0, out: stdout + stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, out: e.stdout + e.stderr };
		}
	};
	const writeExport = async (name: string, text: string) => {
		const { blob } = await encodeExport([text], await importKey(keyB64), 'k1');
		const path = join(dir, name);
		await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
		return path;
	};
	/** Only the untouched rows of the migrations: nothing loaded, nothing left behind. */
	const expectFresh = async () => {
		const [state] = await admin<{ users: number; families: number; catalogue: number }[]>`
			select (select count(*)::int from auth.users) as users, (select count(*)::int from app.families) as families,
				(select count(*)::int from app.catalogue_state where id and version = 1 and version_xid is null) as catalogue`;
		expect(state).toEqual({ users: 0, families: 0, catalogue: 1 });
	};

	beforeAll(async () => {
		const db = await setupDatabase();
		fx = await seedBackupFixtures(db);
		const sql = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		const bucket = new MemoryBucket();
		const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
		await runNightlyExportOn({ sql, bucket: bucket.asBucket(), key: await importKey(keyB64), keyId: 'k1', workerVersion: 'drill', limitBytes: 64 * 1024 * 1024 }, new Date());
		quiet.mockRestore();
		const [stored] = bucket.objects.values();
		document = await decodeExport(stored.body, { k1: await importKey(keyB64) });
		before = await db.admin.begin((tx) => readSnapshot(tx));
		await sql.end();
		await db.close();
		dir = await mkdtemp(join(tmpdir(), 'drill-'));
		file = await writeExport('export.bin', document);
		// The documented preparation: migrations applied, no seed.
		const workdir = process.env.SUPABASE_WORKDIR ?? repoRoot;
		await run('supabase', ['db', 'reset', '--no-seed', '--workdir', workdir], { cwd: repoRoot });
		admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	});
	afterAll(async () => {
		await admin?.end();
		if (dir) await rm(dir, { recursive: true });
	});

	it('inspect finds a commit with exactly the exported migrations', async () => {
		const { code, out } = await cliRun(['inspect', file, '--ref', 'HEAD']);
		expect(code).toBe(0);
		const commit = /commit: ([0-9a-f]{40})/.exec(out)?.[1];
		expect(commit).toBeDefined();
		expect(migrationVersions(repoRoot, commit!)).toEqual(JSON.parse(before.migrations));
	});

	it('refuses a destination with one more migration (an older archive)', async () => {
		await admin`insert into supabase_migrations.schema_migrations (version) values ('20991231000000')`;
		try {
			const { code, out } = await cliRun(['restore', file]);
			expect(code).toBe(1);
			expect(out).toContain('refused: migrations (extra 20991231000000)');
		} finally {
			await admin`delete from supabase_migrations.schema_migrations where version = '20991231000000'`;
		}
		await expectFresh();
	});

	it('fails after partial inserts without printing any value, leaving the destination untouched', async () => {
		const at = document.indexOf('"app.families":');
		const broken = await writeExport('broken.bin',
			document.slice(0, at) + document.slice(at).replace('"measurement_system":"metric"', '"measurement_system":"SENTINEL-4f1c"'));
		const { code, out } = await cliRun(['restore', broken]);
		expect(code).toBe(1);
		expect(out).toContain('refused: load_failed (app.families, 23514)');
		expect(out).not.toContain('SENTINEL');
		expect(out).not.toContain('@test.local');
		await expectFresh();
	});

	it('passes a dry run without writing', async () => {
		const { code, out } = await cliRun(['restore', file, '--dry-run']);
		expect(code).toBe(0);
		expect(out).toContain('dry run passed, nothing written');
		await expectFresh();
	});

	it('restores, reads back identical apart from reset markers, and keeps counting', async () => {
		const { code, out } = await cliRun(['restore', file]);
		expect(code).toBe(0);
		expect(out).toContain('restored:');
		const after = await admin.begin((tx) => readSnapshot(tx));
		expect(after.migrations).toBe(before.migrations);
		expect(after.auth).toBe(before.auth);
		for (const table of before.tables) {
			const restored = after.tables.find((t) => t.name === table.name)!;
			expect(withoutMarkers(restored.rows), table.name).toBe(withoutMarkers(table.rows));
		}
		expect(after.tables.find((t) => t.name === 'shopping_list_checks')!.rows).toContain('9007199254740992.000000001');
		const [{ v: v0 }] = await admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
		await admin`update app.families set name = 'Renamed after restore' where id = ${fx.familyId}`;
		const [{ v: v1 }] = await admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
		expect(BigInt(v1)).toBe(BigInt(v0) + 1n);
	});
});
