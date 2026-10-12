// scripts/prod-sql.sh without a database: CONTAINER_CLI is a fake that records its arguments and input.
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkTransaction, normalizeSets, operationFingerprint, PlanError } from './prod-sql-plan.ts';

describe('operationFingerprint', () => {
	const op = { file: 'begin;\nselect 1;\ncommit;\n', fingerprintSql: 'f', launch: false, sets: ['family_id=a', 'expected_fingerprint=x'], endpoint: 'postgres@127.0.0.1:54322/postgres' };
	it('binds file, parameters, --launch and destination, not the order of --set', () => {
		const first = operationFingerprint(op);
		expect(operationFingerprint({ ...op, sets: ['expected_fingerprint=x', 'family_id=a'] })).toBe(first);
		for (const other of [{ sets: ['family_id=b', 'expected_fingerprint=x'] }, { launch: true }, { endpoint: 'postgres@localhost:54322/postgres' }, { fingerprintSql: 'g' }, { file: op.file + '-- x\n' }])
			expect(operationFingerprint({ ...op, ...other })).not.toBe(first);
	});
	it('refuses a --set given twice or with other characters', () => {
		expect(() => normalizeSets(['family_id=a', 'family_id=b'])).toThrow(/twice/);
		expect(() => normalizeSets(["family_id=a';drop"])).toThrow(PlanError);
	});
});

describe('checkTransaction', () => {
	it('accepts the service files and the bootstrap, with plpgsql bodies ending in end;', () => {
		for (const f of ['bootstrap', 'remove-family', 'reset-app-data', 'show-fingerprint', 'check-first-generation'])
			expect(() => checkTransaction(readFileSync(`supabase/scripts/${f}.sql`, 'utf8'))).not.toThrow();
	});
	it('refuses anything that would run outside the one transaction', () => {
		for (const text of [
			'select 1;\nbegin;\nselect 2;\ncommit;\n', // before begin: autocommit
			'begin;\nselect 1;\ncommit;\ndelete from app.families;\n', // after commit
			'begin;\nCOMMIT;\ndelete from app.families;\nbegin;\ncommit;\n',
			'begin;\nend;\ndelete from app.families;\ncommit;\n',
			'begin;\ncommit; -- done\n',
			'begin;\nrollback; begin;\ncommit;\n',
			'begin;\n\\! rm -rf /tmp/x\ncommit;\n',
			'begin;\nsavepoint a;\ncommit;\n',
		])
			expect(() => checkTransaction(text), text).toThrow(PlanError);
	});
});

describe('the real prod-sql.sh', () => {
	const run = promisify(execFile);
	const uuidA = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
	const uuidB = '0c9d4e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f';
	const fp = 'a'.repeat(32);
	const endpoint = 'postgres@127.0.0.1:54322/postgres';
	let dir: string;
	let env: NodeJS.ProcessEnv;
	let bootstrapCopy: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'prod-sql-'));
		const fake = join(dir, 'container');
		writeFileSync(fake, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${dir}/args"\ncat > "${dir}/input"\n`);
		chmodSync(fake, 0o755);
		const credentials = join(dir, 'credentials.env');
		writeFileSync(credentials, 'POSTGRES_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n');
		bootstrapCopy = join(dir, 'bootstrap.sql');
		writeFileSync(bootstrapCopy, readFileSync('supabase/scripts/bootstrap.sql', 'utf8'));
		env = { ...process.env, CONTAINER_CLI: fake, PROD_CREDENTIALS: credentials, PROD_SQL_TARGET: 'local' };
	});

	const confirmFor = (file: string, sets: string[], launch = false) =>
		operationFingerprint({ file: readFileSync(file, 'utf8'), fingerprintSql: readFileSync('supabase/scripts/app-fingerprint.sql', 'utf8'), launch, sets, endpoint });
	const script = async (args: string[]) => {
		try {
			const { stdout, stderr } = await run('scripts/prod-sql.sh', args, { env });
			return { code: 0, out: stdout + stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: e.code, out: e.stdout + e.stderr };
		}
	};
	const containerCalls = () => (existsSync(join(dir, 'args')) ? readFileSync(join(dir, 'args'), 'utf8').split('\n').filter(Boolean) : []);
	const containerInput = () => readFileSync(join(dir, 'input'), 'utf8');

	it('refuses, before starting any container, an apply whose only change is the family', async () => {
		const confirmA = confirmFor('supabase/scripts/remove-family.sql', ['family_id=' + uuidA, 'expected_fingerprint=' + fp]);
		const r = await script(['--apply', 'supabase/scripts/remove-family.sql', '--set', `family_id=${uuidB}`, '--set', `expected_fingerprint=${fp}`, '--confirm', confirmA]);
		expect(r.code).toBe(1);
		expect(r.out).toContain('changed since the preview');
		expect(containerCalls()).toEqual([]);
	});
	it('previews with a rollback, the launch lines and the confirmation to repeat', async () => {
		const r = await script(['--preview', bootstrapCopy, '--launch']);
		expect(r.code).toBe(0);
		expect(r.out).toContain(`--confirm ${confirmFor(bootstrapCopy, [], true)}`);
		const sent = containerInput();
		expect(sent).toMatch(/^begin;\nselect pg_temp\.launch_start\(\);$/m);
		expect(sent).toMatch(/select pg_temp\.app_fingerprint\(\) as launch_baseline;\nrollback;$/m);
		expect(sent).not.toContain('postgres:postgres'); // the url travels only in the container environment
		expect(containerCalls()).not.toContain('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
	});
	it('applies the confirmed operation with the --set values as psql variables', async () => {
		const sets = [`family_id=${uuidA}`, `expected_fingerprint=${fp}`];
		const r = await script(['--apply', 'supabase/scripts/remove-family.sql', ...sets.flatMap((s) => ['--set', s]), '--confirm', confirmFor('supabase/scripts/remove-family.sql', sets)]);
		expect(r.code).toBe(0);
		expect(containerCalls()).toEqual(expect.arrayContaining(['-v', `family_id=${uuidA}`, `expected_fingerprint=${fp}`]));
		expect(containerInput()).toMatch(/^commit;$/m);
	});
	it('refuses a file without exactly one begin and one commit, and the production target with a local url', async () => {
		const loose = join(dir, 'loose.sql');
		writeFileSync(loose, 'select 1;\n');
		expect((await script(['--preview', loose])).out).toContain("exactly one 'begin;'");
		env.PROD_SQL_TARGET = 'production';
		const r = await script(['--preview', 'supabase/scripts/show-fingerprint.sql']);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not postgres\.lronuqvtjdhfyychnscr/);
		expect(r.out).not.toContain('postgres:postgres');
		expect(containerCalls()).toEqual([]);
	});
});
