import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportKey, runNightlyExport, runNightlyExportOn, type ExportDeps } from '../src/backup/export.ts';
import { decodeExport, EXPORT_FORMAT, importKey, type BackupKey } from '../src/backup/format.ts';
import { estimateExportBytes, exportParts, readSnapshot } from '../src/backup/read.ts';
import { withDbOn } from '../src/db.ts';
import type { Env } from '../src/env.ts';
import { type BackupFixtures, seedBackupFixtures } from './support/backup.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { MemoryBucket } from './support/r2.ts';

// Over the limit, rows must not be read: count the calls.
const readCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/backup/read.ts', async (original) => {
	const actual = await original<typeof import('../src/backup/read.ts')>();
	return { ...actual, readSnapshot: (tx: Parameters<typeof actual.readSnapshot>[0]) => (readCalls.count++, actual.readSnapshot(tx)) };
});

describe.skipIf(!hasDatabase)('nightly export', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let fx: BackupFixtures;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 2, fetch_types: false });
		fx = await seedBackupFixtures(db);
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});

	it('reads every app table, the users and the migrations, bypassing RLS', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const [{ tables }] = await db.admin<{ tables: number }[]>`
			select count(*)::int as tables from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		expect(snapshot.tables).toHaveLength(tables);
		for (const table of snapshot.tables) {
			const [{ count }] = await db.admin.unsafe<{ count: number }[]>(`select count(*)::int as count from app.${table.ident}`);
			expect(table.count, table.name).toBe(count);
		}
		expect(snapshot.tables.find((t) => t.name === 'families')!.rows).toContain(fx.familyId);
		expect(snapshot.tables.find((t) => t.name === 'shopping_list_checks')!.rows).toContain('9007199254740993');
		expect(snapshot.tables.find((t) => t.name === 'ingredient_unit_equivalences')!.rows).toContain('"from_dimension"');
		expect(snapshot.identities).toBeGreaterThan(0);
		expect(JSON.parse(snapshot.migrations)).toContain('20261012100000');
	});

	it('reads one snapshot even when another connection commits between two reads', async () => {
		let concurrentId = '';
		const snapshot = await withDbOn(sql, { kind: 'backup' }, async (tx) => {
			await tx`select count(*) from app.families`; // the snapshot starts here
			[{ id: concurrentId }] = await db.admin<{ id: string }[]>`insert into app.families (name) values ('Concurrent') returning id`;
			return readSnapshot(tx);
		});
		expect(concurrentId).not.toBe('');
		expect(snapshot.tables.find((t) => t.name === 'families')!.rows).not.toContain(concurrentId);
	});

	it('cannot write in the backup identity', async () => {
		await expect(withDbOn(sql, { kind: 'backup' }, (tx) => tx`update app.families set name = name`)).rejects.toMatchObject({ code: '25006' });
	});

	it('estimates the size from the database, close to the real document', async () => {
		const { estimate, snapshot } = await withDbOn(sql, { kind: 'backup' }, async (tx) => ({
			estimate: await estimateExportBytes(tx),
			snapshot: await readSnapshot(tx),
		}));
		const real = new TextEncoder().encode(exportParts(snapshot, '2026-10-12T02:30:00.000Z', 'test').join('')).length;
		expect(estimate).toBeGreaterThan(real * 0.9);
		expect(estimate).toBeLessThan(real * 1.1);
	});

	it('composes a valid document from parts, without parsing rows', async () => {
		const snapshot = await withDbOn(sql, { kind: 'backup' }, readSnapshot);
		const doc = JSON.parse(exportParts(snapshot, '2026-10-12T02:30:00.000Z', 'test').join(''));
		expect(doc.format).toBe(EXPORT_FORMAT);
		expect(Object.keys(doc.tables)).toEqual(snapshot.tables.map((t) => `app.${t.name}`));
		expect(doc.auth.users.length).toBe(snapshot.users);
	});

	const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
	let key: BackupKey;
	beforeAll(async () => {
		key = await importKey(keyB64);
	});
	const deps = (bucket: MemoryBucket, limitBytes = 64 * 1024 * 1024): ExportDeps =>
		({ sql, bucket: bucket.asBucket(), key, keyId: 'k1', workerVersion: 'test', limitBytes });
	const night = (day: number, hour = 2) => new Date(Date.UTC(2026, 9, day, hour, 30));
	const quiet = () => ({ info: vi.spyOn(console, 'log').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}) });
	const events = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)));
	afterEach(() => vi.restoreAllMocks());

	it('names exports by the scheduled UTC minute', () => {
		expect(exportKey(night(12))).toBe('exports/2026-10-12T02-30Z.json.gz.enc');
	});

	it('writes an encrypted export with metadata, readable with the key', async () => {
		const bucket = new MemoryBucket();
		const { info } = quiet();
		expect(await runNightlyExportOn(deps(bucket), night(12))).toBe('done');
		const stored = bucket.objects.get('exports/2026-10-12T02-30Z.json.gz.enc')!;
		expect(stored.customMetadata).toMatchObject({ format: 'cosasimangia-export/1', keyId: 'k1' });
		const doc = JSON.parse(await decodeExport(stored.body, { k1: key }));
		expect(Object.keys(doc.tables)).toContain('app.families');
		expect(events(info).find((e) => e.event === 'backup_export_done')).toMatchObject({ key: 'exports/2026-10-12T02-30Z.json.gz.enc' });
	});

	it('does not read rows nor write when the estimate exceeds the limit', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		readCalls.count = 0;
		expect(await runNightlyExportOn(deps(bucket, 1000), night(12))).toBe('too_large');
		expect(readCalls.count).toBe(0);
		expect(bucket.objects.size).toBe(0);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_too_large', limitBytes: 1000 }));
	});

	it('warns above half of the limit and still exports', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		const estimate = await withDbOn(sql, { kind: 'backup' }, estimateExportBytes);
		expect(await runNightlyExportOn(deps(bucket, Math.ceil(estimate * 1.5)), night(12))).toBe('done');
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_near_limit' }));
	});

	it('skips the 04:30 run when the night already has an export', async () => {
		const bucket = new MemoryBucket();
		quiet();
		await runNightlyExportOn(deps(bucket), night(12));
		expect(await runNightlyExportOn(deps(bucket), night(12, 4))).toBe('skipped');
		expect([...bucket.objects.keys()]).toEqual(['exports/2026-10-12T02-30Z.json.gz.enc']);
	});

	it('keeps the 7 most recent exports, across list pages', async () => {
		const bucket = new MemoryBucket();
		quiet();
		for (let day = 1; day <= 9; day++) await runNightlyExportOn(deps(bucket), night(day));
		expect([...bucket.objects.keys()].sort()).toEqual([3, 4, 5, 6, 7, 8, 9].map((d) => `exports/2026-10-0${d}T02-30Z.json.gz.enc`));
	});

	it('deletes nothing when the write fails', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failPut = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('failed');
		expect(bucket.objects.size).toBe(7);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'put' }));
	});

	it('keeps a written export when pruning fails', async () => {
		const bucket = new MemoryBucket();
		const { error } = quiet();
		for (let day = 1; day <= 7; day++) await runNightlyExportOn(deps(bucket), night(day));
		bucket.failDelete = true;
		expect(await runNightlyExportOn(deps(bucket), night(8))).toBe('done');
		expect(bucket.objects.has('exports/2026-10-08T02-30Z.json.gz.enc')).toBe(true);
		expect(events(error)).toContainEqual(expect.objectContaining({ event: 'backup_export_failed', phase: 'prune' }));
	});

	it('logs and returns when the bucket or the key are missing', async () => {
		const { error } = quiet();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUP_ENCRYPTION_KEY: keyB64 } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('failed');
		expect(await runNightlyExport({ ...env, BACKUPS: new MemoryBucket().asBucket(), BACKUP_ENCRYPTION_KEY: 'c2hvcnQ=' }, night(12))).toBe('failed');
		expect(events(error).filter((e) => e.event === 'backup_export_not_configured')).toHaveLength(2);
	});

	it('runs end to end from the Worker env', async () => {
		const bucket = new MemoryBucket();
		quiet();
		const env = { HYPERDRIVE: { connectionString: db.appServerUrl }, BACKUPS: bucket.asBucket(), BACKUP_ENCRYPTION_KEY: keyB64, BACKUP_KEY_ID: 'k1' } as unknown as Env;
		expect(await runNightlyExport(env, night(12))).toBe('done');
		expect(bucket.objects.size).toBe(1);
	});
});
