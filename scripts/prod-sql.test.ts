// scripts/prod-sql.ts without a database (detail spec, section 8; review of PR #34, findings 1, 4, 5):
// CONTAINER_CLI is a fake that records its arguments, its PGPASSWORD and its standard input.
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkOperation, composeInput, OperationError, operationFingerprint, parseCommand, SCRIPTS } from './prod-sql.ts';
import { checkSqlText } from './prod-sql/tokens.ts';

const uuidA = '7b3c8a52-5d0e-4f43-9a51-6c1f0e2a9b10';
const uuidB = '0c9d4e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f';
const fp = 'a'.repeat(32);
const people = JSON.stringify([{ email: 'fede@example.com', display_name: 'Federico', locale: 'it-IT', family_role: 'family_admin', global_roles: ['app_admin', 'recipe_curator'] }]);
const bootstrapSets = ['family_id=' + uuidA, 'family_name=Famiglia di prova', 'measurement_system=metric', 'time_zone=Europe/Rome', `people=${people}`];
const sets = (pairs: string[]) => pairs.flatMap((p) => ['--set', p]);
const refusal = (argv: string[]) => {
	try {
		checkOperation(parseCommand(argv));
	} catch (error) {
		expect(error).toBeInstanceOf(OperationError);
		return String(error);
	}
	throw new Error('accepted');
};

describe('the closed list', () => {
	it('declares exactly the variables each script interpolates, and --launch only for the bootstrap', () => {
		for (const [name, spec] of Object.entries(SCRIPTS)) {
			expect(checkSqlText(readFileSync(spec.file, 'utf8')).sort(), name).toEqual(Object.keys(spec.variables).sort());
			expect(spec.launch, name).toBe(name === 'bootstrap');
		}
		expect(Object.keys(SCRIPTS).sort()).toEqual(['bootstrap', 'check-first-generation', 'migrations-state', 'reset-app-data', 'show-fingerprint']);
	});
	it('accepts a declared operation', () => {
		expect(checkOperation(parseCommand(['--preview', 'bootstrap', '--launch', ...sets(bootstrapSets)])).file).toBe('supabase/scripts/bootstrap.sql');
		expect(checkOperation(parseCommand(['--apply', 'reset-app-data', '--set', `expected_fingerprint=${fp}`, '--confirm', 'x'])).readOnly).toBe(false);
	});
	it('refuses paths, unknown names, undeclared, missing, repeated or malformed variables', () => {
		expect(refusal(['--preview', 'supabase/scripts/show-fingerprint.sql'])).toMatch(/not a service script/);
		expect(refusal(['--preview', 'remove-family'])).toMatch(/not a service script/);
		expect(refusal(['--preview', 'show-fingerprint', '--set', 'x=1'])).toMatch(/not a variable of show-fingerprint/);
		expect(refusal(['--preview', 'check-first-generation', '--set', `family_id=${uuidA}`])).toMatch(/week_start is required/);
		expect(refusal(['--preview', 'reset-app-data', '--set', `expected_fingerprint=${fp}`, '--set', `expected_fingerprint=${fp}`])).toMatch(/twice/);
		expect(refusal(['--preview', 'reset-app-data', '--set', "expected_fingerprint=x';drop"])).toMatch(/expected_fingerprint/);
		expect(refusal(['--preview', 'check-first-generation', '--set', 'family_id=nope', '--set', 'week_start=2026-10-19'])).toMatch(/family_id/);
		expect(refusal(['--preview', 'check-first-generation', '--set', `family_id=${uuidA}`, '--set', 'week_start=2026-02-30'])).toMatch(/week_start/);
	});
	it('refuses --launch with any script but the bootstrap, and --apply of a read-only script', () => {
		expect(refusal(['--preview', 'reset-app-data', '--launch', '--set', `expected_fingerprint=${fp}`])).toMatch(/--launch/);
		expect(refusal(['--apply', 'show-fingerprint', '--confirm', 'x'])).toMatch(/read only/);
		expect(refusal(['--apply', 'reset-app-data', '--set', `expected_fingerprint=${fp}`])).toMatch(/--confirm/);
	});
	it('checks the people of the bootstrap before connecting', () => {
		const withPeople = (value: string) => refusal(['--preview', 'bootstrap', ...sets([...bootstrapSets.slice(0, 4), `people=${value}`])]);
		expect(withPeople('{}')).toMatch(/people/);
		expect(withPeople('[]')).toMatch(/people/);
		expect(withPeople(JSON.stringify([{ email: 'x@y', display_name: 'X', locale: 'fr-FR', family_role: 'member', global_roles: [] }]))).toMatch(/locale/);
		expect(withPeople(JSON.stringify([{ email: 'x@y', display_name: 'X', locale: 'it-IT', family_role: 'owner', global_roles: [] }]))).toMatch(/family_role/);
		expect(withPeople(JSON.stringify([{ email: 'x@y', display_name: 'X\u0007', locale: 'it-IT', family_role: 'member', global_roles: [] }]))).toMatch(/display_name/);
		expect(withPeople(JSON.stringify([{ email: 'x@y', display_name: 'X', locale: 'it-IT', family_role: 'member', global_roles: ['root'] }]))).toMatch(/global_roles/);
		expect(withPeople(JSON.stringify([{ email: 'x@y', display_name: 'X', locale: 'it-IT', family_role: 'member' }]))).toMatch(/people/);
	});
});

describe('operationFingerprint and the input', () => {
	const op = { commit: 'c1', fingerprintSql: 'f', script: 's', name: 'reset-app-data', launch: false, sets: { expected_fingerprint: fp }, endpoint: 'postgres@127.0.0.1:54322/postgres' };
	it('binds commit, bytes, name, --launch, values and destination', () => {
		const first = operationFingerprint(op);
		for (const other of [{ commit: 'c2' }, { fingerprintSql: 'g' }, { script: 's ' }, { name: 'show-fingerprint' }, { launch: true }, { sets: { expected_fingerprint: 'b'.repeat(32) } }, { endpoint: 'postgres@localhost:54322/postgres' }])
			expect(operationFingerprint({ ...op, ...other })).not.toBe(first);
	});
	it('the tool decides the transaction: begin … rollback for the preview, nothing for --single-transaction', () => {
		expect(composeInput({ fingerprintSql: 'F;', script: 'S;', launch: true, mode: 'preview' })).toBe(
			'begin;\nF;\nselect pg_temp.launch_start();\nS;\nselect pg_temp.app_fingerprint() as launch_baseline;\nrollback;\n');
		expect(composeInput({ fingerprintSql: 'F;', script: 'S;', launch: false, mode: 'apply' })).toBe('F;\nS;\n');
	});
});

/** A fake container CLI: argv, the PG* variables it passes on and stdin of each call, in files of `dir`. */
function fakeContainer(dir: string) {
	const fake = join(dir, 'container');
	const saved = ['PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT'].map((v) => `printf '%s' "\${${v}-unset}" > "${dir}/${v}"`).join('\n');
	writeFileSync(fake, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${dir}/args"\n${saved}\ncat > "${dir}/input"\necho " launch_baseline \n-----------------\n ${'b'.repeat(32)}"\n`);
	chmodSync(fake, 0o755);
	const variable = (name: string) => readFileSync(join(dir, name), 'utf8');
	return {
		path: fake,
		calls: () => (existsSync(join(dir, 'args')) ? readFileSync(join(dir, 'args'), 'utf8').split('\n').filter(Boolean) : []),
		input: () => readFileSync(join(dir, 'input'), 'utf8'),
		password: () => variable('PGPASSWORD'),
		variable,
	};
}
const run = promisify(execFile);
async function command(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
	try {
		const { stdout, stderr } = await run(process.execPath, ['scripts/prod-sql.ts', ...args], { cwd, env });
		return { code: 0, out: stdout + stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: e.code, out: e.stdout + e.stderr };
	}
}

describe('the real command on the local target', () => {
	let dir: string;
	let container: ReturnType<typeof fakeContainer>;
	let env: NodeJS.ProcessEnv;
	let credentials: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'prod-sql-'));
		container = fakeContainer(dir);
		credentials = join(dir, 'credentials.env');
		writeFileSync(credentials, 'POSTGRES_DATABASE_URL=postgresql://postgres:pw-s3cret@127.0.0.1:54322/postgres\n');
		env = { ...process.env, CONTAINER_CLI: container.path, PROD_SQL_TARGET: 'local' };
	});
	const local = (args: string[]) => command(process.cwd(), [...args, '--credentials', credentials], env);
	const confirmOf = (out: string) => /--confirm ([0-9a-f]{64})/.exec(out)?.[1];

	it('refuses, before starting any container, an apply whose only change is the family', async () => {
		const preview = await local(['--preview', 'check-first-generation', ...sets([`family_id=${uuidA}`, 'week_start=2026-10-19'])]);
		expect(preview.code).toBe(0);
		const resetPreview = await local(['--preview', 'bootstrap', ...sets(bootstrapSets)]);
		const confirm = confirmOf(resetPreview.out)!;
		const calls = container.calls().length;
		const other = bootstrapSets.map((s) => s.replace(uuidA, uuidB));
		const r = await local(['--apply', 'bootstrap', ...sets(other), '--confirm', confirm]);
		expect(r.code).toBe(1);
		expect(r.out).toContain('changed since the preview');
		expect(container.calls().length).toBe(calls);
	});
	it('refuses a path or an unknown script without starting a container', async () => {
		for (const args of [['--preview', 'supabase/scripts/show-fingerprint.sql'], ['--preview', 'remove-family', ...sets([`family_id=${uuidA}`, `expected_fingerprint=${fp}`])]]) {
			const r = await local(args);
			expect(r.code).toBe(1);
			expect(r.out).toContain('not a service script');
		}
		expect(container.calls()).toEqual([]);
	});
	it('previews in begin … rollback, with the password only in PGPASSWORD', async () => {
		const r = await local(['--preview', 'bootstrap', '--launch', ...sets(bootstrapSets)]);
		expect(r.code).toBe(0);
		const sent = container.input();
		expect(sent.startsWith('begin;\n')).toBe(true);
		expect(sent).toMatch(/^select pg_temp\.launch_start\(\);$/m);
		expect(sent.endsWith('select pg_temp.app_fingerprint() as launch_baseline;\nrollback;\n')).toBe(true);
		expect(sent).toContain(readFileSync('supabase/scripts/bootstrap.sql', 'utf8'));
		const args = container.calls();
		expect(args).toContain('host=127.0.0.1 port=54322 dbname=postgres user=postgres');
		expect(args).toEqual(expect.arrayContaining(['-e', 'PGPASSWORD', '-e', 'PGSSLMODE', '-v', 'ON_ERROR_STOP=1', '-v', `people=${people}`]));
		expect(args).not.toContain('PGSSLROOTCERT');
		expect(container.variable('PGSSLMODE')).toBe('disable');
		expect(args).not.toContain('--single-transaction');
		expect(args.join('\n')).not.toContain('pw-s3cret');
		expect(container.password()).toBe('pw-s3cret');
		expect(r.out).not.toContain('pw-s3cret');
		expect(r.out).toContain(`--apply bootstrap --launch --set family_id=${uuidA} --set 'family_name=Famiglia di prova'`);
	});
	it('applies the confirmed operation in one transaction decided by psql', async () => {
		const preview = await local(['--preview', 'reset-app-data', '--set', `expected_fingerprint=${fp}`]);
		const r = await local(['--apply', 'reset-app-data', '--set', `expected_fingerprint=${fp}`, '--confirm', confirmOf(preview.out)!]);
		expect(r.code).toBe(0);
		const args = container.calls();
		expect(args).toContain('--single-transaction');
		expect(container.input()).not.toMatch(/^(begin|commit|rollback);$/m);
		expect(args.join('\n')).not.toContain('pw-s3cret');
	});
	it('refuses the production target with a local url, without echoing it', async () => {
		env.PROD_SQL_TARGET = 'production';
		const r = await local(['--preview', 'show-fingerprint']);
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/the user is not postgres\.lronuqvtjdhfyychnscr|not clean/);
		expect(r.out).not.toContain('pw-s3cret');
		expect(container.calls()).toEqual([]);
	});
});

describe('the real command on the production target: bytes from the commit of a clean checkout', () => {
	const ref = 'lronuqvtjdhfyychnscr';
	const files = ['package.json', 'scripts/prod-sql.ts', 'scripts/prod-sql/tokens.ts', 'scripts/import/load/target.ts', 'scripts/production-target.json', 'supabase/scripts'];
	let repo: string;
	let home: string;
	let container: ReturnType<typeof fakeContainer>;
	let env: NodeJS.ProcessEnv;
	let credentials: string;
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), 'prod-sql-repo-'));
		for (const f of files) cpSync(resolve(f), join(repo, f), { recursive: true });
		symlinkSync(resolve('node_modules'), join(repo, 'node_modules'));
		writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
		git('init', '-q');
		git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'empty');
		git('add', '-A');
		git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'tools');
		home = mkdtempSync(join(tmpdir(), 'prod-sql-home-'));
		mkdirSync(join(home, '.config/cosasimangia'), { recursive: true });
		writeFileSync(join(home, '.config/cosasimangia/supabase-ca.crt'), 'CA');
		credentials = join(home, 'credentials.env');
		writeFileSync(credentials, `POSTGRES_DATABASE_URL=postgresql://postgres.${ref}:pw-s3cret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${home}/.config/cosasimangia/supabase-ca.crt\n`);
		container = fakeContainer(home);
		env = { ...process.env, HOME: home, CONTAINER_CLI: container.path, PROD_SQL_TARGET: '' };
	});
	const prod = (args: string[]) => command(repo, [...args, '--credentials', credentials], env);

	it('sends the bytes of HEAD with verified TLS and the certificate folder mounted read only', async () => {
		const r = await prod(['--preview', 'show-fingerprint']);
		expect(r.code, r.out).toBe(0);
		expect(r.out).toContain(`Target: postgres.${ref}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`);
		expect(container.input()).toContain(git('show', 'HEAD:supabase/scripts/show-fingerprint.sql'));
		const args = container.calls();
		expect(args).toContain(`host=aws-0-eu-central-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.${ref}`);
		expect(args).toEqual(expect.arrayContaining(['-e', 'PGSSLMODE', '-e', 'PGSSLROOTCERT']));
		expect(container.variable('PGSSLMODE')).toBe('verify-full');
		expect(container.variable('PGSSLROOTCERT')).toBe(`${home}/.config/cosasimangia/supabase-ca.crt`);
		expect(args).toContain(`${home}/.config/cosasimangia:${home}/.config/cosasimangia:ro`);
		expect(args.join('\n')).not.toContain('pw-s3cret');
		expect(container.password()).toBe('pw-s3cret');
	});
	it('refuses a checkout with local changes, even with the same HEAD, before any container', async () => {
		writeFileSync(join(repo, 'supabase/scripts/show-fingerprint.sql'), 'delete from app.families;\n');
		const r = await prod(['--preview', 'show-fingerprint']);
		expect(r.code).toBe(1);
		expect(r.out).toContain('not clean');
		expect(container.calls()).toEqual([]);
	});
	it('a script changed after the preview and committed changes the operation: refused before any container', async () => {
		const preview = await prod(['--preview', 'reset-app-data', '--set', `expected_fingerprint=${fp}`]);
		const confirm = /--confirm ([0-9a-f]{64})/.exec(preview.out)![1]!;
		const calls = container.calls().length;
		writeFileSync(join(repo, 'supabase/scripts/reset-app-data.sql'), readFileSync(join(repo, 'supabase/scripts/reset-app-data.sql'), 'utf8') + '-- changed\n');
		git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-am', 'changed');
		const r = await prod(['--apply', 'reset-app-data', '--set', `expected_fingerprint=${fp}`, '--confirm', confirm]);
		expect(r.code).toBe(1);
		expect(r.out).toContain('changed since the preview');
		expect(container.calls().length).toBe(calls);
	});
	it('a certificate path with spaces, quotes, a backslash or conninfo-like text stays one path (second review, finding 2)', async () => {
		// In the url + is a space: the file name is "ca 'x\\y sslmode=disable host=other.invalid".
		const name = "ca 'x\\y sslmode=disable host=other.invalid";
		writeFileSync(join(home, '.config/cosasimangia', name), 'CA');
		writeFileSync(credentials, readFileSync(credentials, 'utf8').replace('supabase-ca.crt', name.replaceAll(' ', '+')));
		const r = await prod(['--preview', 'show-fingerprint']);
		expect(r.code, r.out).toBe(0);
		expect(container.calls().join('\n')).not.toContain('other.invalid');
		expect(container.variable('PGSSLROOTCERT')).toBe(`${home}/.config/cosasimangia/${name}`);
		expect(container.variable('PGSSLMODE')).toBe('verify-full');
	});
	it('refuses a certificate outside the mounted folder', async () => {
		writeFileSync(join(home, 'elsewhere.crt'), 'CA');
		writeFileSync(credentials, readFileSync(credentials, 'utf8').replace(`${home}/.config/cosasimangia/supabase-ca.crt`, `${home}/elsewhere.crt`));
		const r = await prod(['--preview', 'show-fingerprint']);
		expect(r.code).toBe(1);
		expect(r.out).toContain('~/.config/cosasimangia');
		expect(container.calls()).toEqual([]);
	});
});
