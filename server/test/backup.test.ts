import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportKey, runNightlyExport, runNightlyExportOn, type ExportDeps } from '../src/backup/export.ts';
import { decodeExport, EXPORT_FORMAT, importKey, type BackupKey } from '../src/backup/format.ts';
import { estimateExportBytes, exportParts, readSnapshot } from '../src/backup/read.ts';
import { RestoreError, restoreExport, verifyRestored } from '../src/backup/restore.ts';
import { newPhotoKey } from '../src/catalogue/photos/key.ts';
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
		expect(JSON.parse(snapshot.migrations)).toContain('20261012110000');
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

	class Rollback extends Error {}

	/** Decrypted document of a fresh export of the test database. */
	const freshExport = async () => {
		const bucket = new MemoryBucket();
		quiet();
		await runNightlyExportOn(deps(bucket), night(20));
		vi.restoreAllMocks();
		const [stored] = bucket.objects.values();
		return decodeExport(stored.body, { k1: key });
	};

	/**
	 * Emulates a destination just prepared with the migrations, inside a rolled-back
	 * transaction of the shared test database. The real preparation (`supabase db reset
	 * --no-seed`) runs in the drill of Task 8.
	 */
	const emulateFreshDestination = async (tx: postgres.TransactionSql) => {
		const tables = await tx<{ ident: string }[]>`
			select quote_ident(relname) as ident from pg_class where relnamespace = 'app'::regnamespace and relkind = 'r'`;
		await tx.unsafe(`truncate ${[...tables.map((t) => `app.${t.ident}`), 'auth.identities', 'auth.users'].join(', ')} cascade`);
		await tx`insert into app.catalogue_state default values`;
	};

	/** Runs `fn` as the database owner, then rolls everything back: other test files keep their data. */
	const inRolledBack = async (fn: (tx: postgres.TransactionSql) => Promise<void>) => {
		await expect(db.admin.begin(async (tx) => {
			await fn(tx);
			throw new Rollback();
		})).rejects.toBeInstanceOf(Rollback);
	};

	const restoreReason = async (tx: postgres.TransactionSql, document: string) => {
		const error = await restoreExport(tx, document).then(() => null, (e: unknown) => e);
		expect(error).toBeInstanceOf(RestoreError);
		return (error as RestoreError).reason;
	};

	it('restores into a fresh destination, from a session in another time zone, with markers reset', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			await tx`set local time zone 'Europe/Rome'`;
			const result = await restoreExport(tx, document);
			expect(result.users).toBeGreaterThan(0);
			expect(await verifyRestored(tx)).toEqual([]);
			const [markers] = await tx<{ n: number }[]>`
				select (select count(*) from app.families where data_version_xid is not null)
					+ (select count(*) from app.catalogue_state where version_xid is not null) as n`;
			expect(Number(markers.n)).toBe(0);
		});
	});

	/** A recipe whose photo becomes A (exported), then B (W12): objects only ever added to the photo bucket. */
	async function photoReplacedAfterExport() {
		const photos = new MemoryBucket();
		const [{ id: recipeId }] = await db.admin<{ id: string }[]>`
			insert into app.recipes (slug, name) values (${`backup-photo-${crypto.randomUUID()}`}, '{"it-IT": "Con foto"}') returning id`;
		const insert = async (key: string) => {
			await db.admin`update app.recipe_photos set removed_at = clock_timestamp() where recipe_id = ${recipeId} and removed_at is null`;
			await db.admin`
				insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel)
				values (${crypto.randomUUID()}, ${recipeId}, ${key}, 'image/webp', 1600, 1067, 4, 'web')`;
			await photos.put(key, new Uint8Array([82, 73, 70, 70]));
		};
		const a = newPhotoKey();
		await insert(a);
		const document = await freshExport();
		const b = newPhotoKey();
		await insert(b);
		return { photos, document, a, b };
	}

	it('exports photo references without image bytes', async () => {
		const { document, a } = await photoReplacedAfterExport();
		const doc = JSON.parse(document);
		const rows = JSON.stringify(doc.tables['app.recipe_photos']);
		expect(rows).toContain(a);
		// Keys and sizes only: the bytes stay in the photo bucket, which the export never reads.
		expect(rows).not.toContain('RIFF');
		expect(document).not.toContain('UklGR');
	});

	it('a restored export finds its photo again', async () => {
		const { photos, document, a, b } = await photoReplacedAfterExport();
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			await restoreExport(tx, document);
			await tx`set local role anon`;
			expect(await tx`select content_type from app.served_photo(${a})`).toEqual([{ content_type: 'image/webp' }]);
			expect(await tx`select content_type from app.served_photo(${b})`).toEqual([]);
		});
		// Nothing deletes objects of the photo bucket: the restored reference has its image.
		expect(photos.objects.has(a)).toBe(true);
		expect(photos.objects.has(b)).toBe(true);
	});

	it('keeps bumping counters when an imported marker equals the restoring transaction', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			const [{ xid }] = await tx<{ xid: string }[]>`select pg_current_xact_id()::text as xid`;
			const coinciding = document.replace(
				new RegExp(`("id":"${fx.familyId}".*?"data_version_xid":)(null|"\\d+")`),
				`$1"${xid}"`,
			);
			expect(coinciding).not.toBe(document);
			await restoreExport(tx, coinciding);
			const [before] = await tx<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
			await tx`update app.families set name = 'Renamed after restore' where id = ${fx.familyId}`;
			const [after] = await tx<{ v: string }[]>`select data_version::text as v from app.families where id = ${fx.familyId}`;
			expect(BigInt(after.v)).toBe(BigInt(before.v) + 1n);
		});
	});

	it('detects any change after the load, beyond JavaScript precision and inside nested Auth metadata', async () => {
		const document = await freshExport();
		const mutations: [string, string][] = [
			[`update app.shopping_list_checks set quantity_at_check = '{"mass_g": 9007199254740994}' where shopping_list_id = '${fx.listId}' and variety_key = 'a'`, 'app.shopping_list_checks'],
			[`update app.families set data_version = data_version + 1 where id = '${fx.familyId}'`, 'app.families'],
			[`update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{tags,1}', '[2, 3, 4]') where id = '${fx.userId}'`, 'auth.users'],
		];
		for (const [mutation, table] of mutations) {
			await inRolledBack(async (tx) => {
				await emulateFreshDestination(tx);
				await restoreExport(tx, document);
				// Without triggers: a counter bump in families would add a second difference.
				await tx`set local session_replication_role = replica`;
				await tx.unsafe(mutation);
				await tx`set local session_replication_role = origin`;
				expect(await verifyRestored(tx)).toEqual([table]);
			});
		}
	});

	it('restores and verifies an export without identities (empty Auth table)', async () => {
		const document = await freshExport();
		// The auth text precedes "tables"; identities is its last key (jsonb orders keys by length).
		const noIdentities = document.replace(/"identities": \[.*?\]\},"tables":/s, '"identities": []},"tables":');
		expect(noIdentities).not.toBe(document);
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			const result = await restoreExport(tx, noIdentities);
			expect(result.identities).toBe(0);
			expect(await verifyRestored(tx)).toEqual([]);
		});
	});

	it('refuses a destination with data, even only a changed catalogue counter', async () => {
		const document = await freshExport();
		await inRolledBack(async (tx) => {
			expect(await restoreReason(tx, document)).toBe('not_empty');
		});
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			await tx`update app.catalogue_state set version = 7`;
			expect(await restoreReason(tx, document)).toBe('not_empty');
		});
	});

	it('refuses other migrations, other tables, unknown columns, another format and dangling references', async () => {
		const document = await freshExport();
		const doc = JSON.parse(document);
		const orphan = JSON.stringify({ ...doc.tables['app.ratings'][0], recipe_id: '00000000-0000-0000-0000-000000000000' });
		const cases: [string, string][] = [
			[document.replace('"migrations":[', '"migrations":["19990101000000",'), 'migrations'],
			[document.replace('"app.books":', '"app.bookz":'), 'tables'],
			[document.replace('"app.books":[{', '"app.books":[{"ghost":1,'), 'columns'],
			[document.replace('cosasimangia-export/1', 'cosasimangia-export/9'), 'format'],
			[document.replace('"app.ratings":[', `"app.ratings":[${orphan},`), 'orphans'],
		];
		for (const [variant, reason] of cases) {
			expect(variant, reason).not.toBe(document);
			await inRolledBack(async (tx) => {
				await emulateFreshDestination(tx);
				expect(await restoreReason(tx, variant)).toBe(reason);
			});
		}
	});

	it('reports a failing load with table and SQLSTATE only', async () => {
		const document = await freshExport();
		const at = document.indexOf('"app.families":');
		const broken = document.slice(0, at) + document.slice(at).replace('"measurement_system":"metric"', '"measurement_system":"SENTINEL-4f1c"');
		await inRolledBack(async (tx) => {
			await emulateFreshDestination(tx);
			const error = await restoreExport(tx, broken).then(() => null, (e: unknown) => e);
			expect(error).toMatchObject({ reason: 'load_failed', details: ['app.families', '23514'] });
			expect(String((error as Error).message)).not.toContain('SENTINEL');
		});
	});
});
