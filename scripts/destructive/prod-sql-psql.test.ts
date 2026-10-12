// The text defence and the transaction of scripts/prod-sql.ts against the real psql of the local stack
// (review of PR #34, finding 1): refused texts never reach psql, and what reaches it is one transaction.
// The scripts here are a test list passed to main(), never the command's own list.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupDatabase, type TestDatabase } from '../../server/test/support/db.ts';
import { main, SCRIPTS, type ScriptSpec } from '../prod-sql.ts';
import { SqlTextError } from '../prod-sql/tokens.ts';
import postgres from 'postgres';
import { credentialsFile, databaseUrl, emptyApp, enabled, fingerprint, fixture, rowCounts } from './support.ts';

describe.skipIf(!enabled)('prod-sql.ts against the real psql', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	const dir = mkdtempSync(join(tmpdir(), 'prod-sql-psql-'));
	const scriptOf = (name: string, text: string): Record<string, ScriptSpec> => {
		const file = join(dir, `${name}.sql`);
		writeFileSync(file, text);
		return { ...SCRIPTS, [name]: { file, variables: {}, readOnly: false, launch: false } };
	};
	const env = { ...process.env, PROD_SQL_TARGET: 'local' };
	async function runTool(argv: string[], scripts: Record<string, ScriptSpec> = SCRIPTS) {
		let out = '';
		const io = { out: (t: string) => { out += t; }, err: (t: string) => { out += t; } };
		const code = await main([...argv, '--credentials', credentialsFile()], { root: process.cwd(), env, scripts, io });
		return { code, out };
	}
	async function applyConfirmed(name: string, scripts: Record<string, ScriptSpec>, sets: string[] = []) {
		const preview = await runTool(['--preview', name, ...sets], scripts);
		const confirm = /--confirm ([0-9a-f]{64})/.exec(preview.out)?.[1];
		if (!confirm) return preview;
		return runTool(['--apply', name, ...sets, '--confirm', confirm], scripts);
	}
	const probeRows = async () => (await db.admin<{ n: number }[]>`select count(*)::int as n from public.prod_sql_probe`)[0]!.n;

	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(databaseUrl, { max: 1, fetch_types: false, onnotice: () => {} });
		await db.admin`create table if not exists public.prod_sql_probe (n int)`;
	});
	beforeEach(async () => {
		await db.admin`truncate public.prod_sql_probe`;
	});
	afterAll(async () => {
		if (db) await db.admin`drop table if exists public.prod_sql_probe`;
		await sql?.end();
		await db?.close();
	});

	it('an error at the end of an applied script leaves nothing written (one transaction, ON_ERROR_STOP)', async () => {
		const r = await applyConfirmed('probe', scriptOf('probe', 'insert into public.prod_sql_probe values (1);\nselect 1 / 0;\n'));
		expect(r.code).not.toBe(0);
		expect(r.out).toContain('division by zero');
		expect(await probeRows()).toBe(0);
	});
	it('a commit inside a do body is refused by Postgres inside the transaction', async () => {
		const r = await applyConfirmed('probe', scriptOf('probe', 'do $$ begin insert into public.prod_sql_probe values (2); commit; end $$;\n'));
		expect(r.code).not.toBe(0);
		expect(r.out).toContain('invalid transaction termination');
		expect(await probeRows()).toBe(0);
	});
	it('the bypasses of the review never reach psql', async () => {
		const families = (await rowCounts(db.admin)).families;
		for (const text of [
			'insert into public.prod_sql_probe values (3); COMMIT;\ndelete from app.families;\n',
			'/* c */ COMMIT;\ninsert into public.prod_sql_probe values (3);\n',
			'select 1; \\connect postgres\ninsert into public.prod_sql_probe values (3);\n',
			// Second review of PR #34, finding 4: the ON of one statement does not excuse the COMMIT of the next.
			'insert into public.prod_sql_probe values (3);\nSET enable_seqscan = on;\nCOMMIT;\nDELETE FROM app.families;\n',
		]) {
			await expect(runTool(['--preview', 'probe'], scriptOf('probe', text)), text).rejects.toBeInstanceOf(SqlTextError);
		}
		expect(await probeRows()).toBe(0);
		expect((await rowCounts(db.admin)).families).toBe(families);
	});
	it('the preview of a reset counts the rows and leaves them', async () => {
		await emptyApp(db.admin);
		const f = await fixture(db, sql);
		const before = await rowCounts(db.admin);
		const r = await runTool(['--preview', 'reset-app-data', '--set', `expected_fingerprint=${f.baseline}`]);
		expect(r.code, r.out).toBe(0);
		expect(r.out).toMatch(/rows_removed/);
		expect(await rowCounts(db.admin)).toEqual(before);
		expect(await fingerprint()).toBe(f.baseline);
	});
});
