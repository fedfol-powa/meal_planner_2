import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPORT_FORMAT } from '../src/backup/format.ts';
import { estimateExportBytes, exportParts, readSnapshot } from '../src/backup/read.ts';
import { withDbOn } from '../src/db.ts';
import { type BackupFixtures, seedBackupFixtures } from './support/backup.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';

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
});
