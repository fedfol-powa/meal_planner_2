import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { apply, CHECK_TOKEN, parseJsonc, preview, realRun, redact, smokeChecks, wranglerArgs, wranglerOverrides, type Deps, type Run } from './release.ts';

const ref = 'lronuqvtjdhfyychnscr';
const ok = (stdout = '', stderr = '') => ({ status: 0, stdout, stderr });
const fail = (stderr = '') => ({ status: 1, stdout: '', stderr });
const WRANGLER = `{
	// comment with https://example.com
	"name": "cosasimangia",
	"account_id": "acc",
	"vars": { "SUPABASE_URL": "https://${ref}.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abc" },
	"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "abc123" }],
	"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }],
	"workers_dev": false,
	"routes": [{ "pattern": "cosasimangia.app", "custom_domain": true }]
}`;
const WEB_ENV = `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n`;
const env = { POSTGRES_DATABASE_URL: `postgresql://postgres.${ref}:pw-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt` };

const URL_OK = 'https://cosasimangia.app';
// Wrangler lists a custom domain as its bare host, without the scheme.
const TARGET_OK = 'cosasimangia.app';
const NEW_VERSION = '11111111-1111-4111-8111-111111111111';
const OLD_VERSION = '00000000-0000-4000-8000-000000000000';
const OUTPUT = '/tmp/release-test/wrangler-output.ndjson';
const DRY_RUN_OUTPUT = '/tmp/release-test/wrangler-dry-run.ndjson';
const EMPTY_ENV = '/tmp/release-test/empty.env';
const WRANGLER_BIN = resolve('node_modules/wrangler/bin/wrangler.js');

interface FakeOver {
	run?: Record<string, ReturnType<Run>>;
	files?: Record<string, string | null>;
	dist?: string;
	fetchStatus?: number;
	settings?: string;
	oauthStatus?: number;
	servingVersion?: string;
	deployOutput?: Record<string, unknown>;
	dryRunOutput?: Record<string, unknown>;
	statusAfter?: string;
}
function fakeDeps(over: FakeOver = {}) {
	const calls: string[] = [];
	const envs: (NodeJS.ProcessEnv | undefined)[] = [];
	let deployed = false;
	const files: Record<string, string | null> = { 'server/wrangler.jsonc': WRANGLER, 'web/.env.production': WEB_ENV, 'scripts/production-target.json': `{"supabaseRef":"${ref}"}`,
		'scripts/release.config.json': `{"productionUrl":"${URL_OK}","requiredSecrets":["BACKUP_ENCRYPTION_KEY"]}`, 'supabase/.temp/project-ref': null,
		'web/.env.local': null, 'web/.env.production.local': null, '/ca.crt': 'CA', ...over.files };
	const run: Run = (cmd, args, options) => {
		const key = `${cmd} ${args.join(' ')}`;
		calls.push(key);
		envs.push(options?.env);
		for (const [k, v] of Object.entries(over.run ?? {})) if (key.startsWith(k)) return v;
		if (key.startsWith('git rev-parse --abbrev-ref')) return ok('main\n');
		if (key.startsWith('git status --porcelain')) return ok('');
		if (key.startsWith('git rev-parse')) return ok('abc123\n');
		if (key.startsWith('gh run list')) return ok('[{"conclusion":"success"}]');
		if (key.startsWith('npx wrangler deployments status')) {
			const version = deployed ? (over.statusAfter ?? NEW_VERSION) : OLD_VERSION;
			return ok(JSON.stringify({ id: 'dep-1', versions: [{ version_id: version, percentage: 100 }] }));
		}
		if (key.startsWith('npx wrangler versions view')) return ok(JSON.stringify({ id: args[3], annotations: { 'workers/tag': 'oldsha' } }));
		if (key.startsWith('npx wrangler secret list')) return ok('[{"name":"BACKUP_ENCRYPTION_KEY"}]');
		// Like the real CLI: the list of the dry run on stderr (second review of PR #34, finding 1).
		if (key.startsWith('supabase db push --dry-run')) return ok('', 'Would push these migrations:\n • 20261012110000_backup.sql\n');
		if (key.startsWith('npx wrangler deploy --dry-run')) {
			const entry = { type: 'deploy', worker_name: 'cosasimangia', version_id: null, worker_name_overridden: false, ...over.dryRunOutput };
			files[DRY_RUN_OUTPUT] = `{"type":"wrangler-session"}\n${JSON.stringify(entry)}\n`;
			return ok('');
		}
		if (key.startsWith('npx wrangler deploy')) {
			deployed = true;
			const entry = { type: 'deploy', worker_name: 'cosasimangia', version_id: NEW_VERSION, targets: [TARGET_OK, 'schedule: 0 * * * *'], worker_name_overridden: false, ...over.deployOutput };
			files[OUTPUT] = `{"type":"wrangler-session"}\n${JSON.stringify(entry)}\n`;
			return ok(`${TARGET_OK}\n`);
		}
		return ok('');
	};
	const deps: Deps = {
		run,
		// The project answers the key check with fetchStatus; the published Worker answers like a healthy one.
		fetch: (async (url: string) => {
			const path = new URL(url).pathname;
			if (path === '/auth/v1/settings') return new Response(over.settings ?? '{"disable_signup":true}', { status: over.fetchStatus ?? 200 });
			if (path === '/.well-known/oauth-authorization-server/auth/v1')
				return new Response(`{"issuer":"x","registration_endpoint":"https://${ref}.supabase.co/auth/v1/oauth/clients/register"}`, { status: over.oauthStatus ?? 200 });
			if (path === '/api/openapi.json') return new Response(JSON.stringify({ info: { version: over.servingVersion ?? (deployed ? NEW_VERSION : OLD_VERSION) } }), { status: 200 });
			const healthy: Record<string, [number, string]> = {
				'/api/session/whoami': [401, ''], '/mcp': [401, ''], '/menu': [200, '<html>'],
				'/.well-known/oauth-protected-resource/mcp': [200, '{"resource":"https://x/mcp"}'],
			};
			const [status, body] = path.startsWith('/shopping-lists/') ? [404, ''] : (healthy[path] ?? [200, '{}']);
			return new Response(body, { status });
		}) as typeof fetch,
		readFile: (p) => (p in files ? files[p]! : null),
		distFiles: () => [over.dist ?? `x="https://${ref}.supabase.co";k="sb_publishable_abc"`],
		tmpDir: () => '/tmp/release-test',
		emptyEnvFile: () => EMPTY_ENV,
		migrationFiles: () => ['20261011100000_foundation.sql', '20261012110000_backup.sql'],
		sleep: async () => {},
	};
	return { deps, calls, envs };
}
/** The confirmation the preview prints for these fakes. */
const confirmationOf = async (o: FakeOver = {}, scope = {}) => (await preview(fakeDeps(o).deps, env, scope)).confirmation!;
const checks = async (o: Parameters<typeof fakeDeps>[0], e: NodeJS.ProcessEnv = env) => (await preview(fakeDeps(o).deps, e)).problems.map((p) => p.check);
const supabaseCalls = (calls: string[]) => calls.filter((c) => c.startsWith('supabase'));

describe('preview', () => {
	it('passes on a clean, green main, sending migrations only to the verified url', async () => {
		const { deps, calls } = fakeDeps();
		const p = await preview(deps, env);
		expect(p).toMatchObject({ sha: 'abc123', problems: [], firstRelease: false, pendingMigrations: ['20261012110000_backup.sql'] });
		expect(supabaseCalls(calls)).toHaveLength(1);
		expect(supabaseCalls(calls)[0]).toContain('--db-url');
		expect(calls.some((c) => c.includes('--linked'))).toBe(false);
		expect(calls.some((c) => c.includes('pw-secret'))).toBe(false); // the password goes in PGPASSWORD
	});
	it('refuses another branch, a dirty tree, a commit behind origin and a red CI', async () => {
		expect(await checks({ run: { 'git rev-parse --abbrev-ref': ok('feature\n') } })).toContain('branch');
		expect(await checks({ run: { 'git status --porcelain': ok(' M x\n') } })).toContain('clean');
		expect(await checks({ run: { 'git rev-parse origin/main': ok('def456\n') } })).toContain('pushed');
		expect(await checks({ run: { 'gh run list': ok('[{"conclusion":"failure"}]') } })).toContain('ci');
	});
	it('runs no supabase command when the url points elsewhere or a different project is linked', async () => {
		for (const [o, e] of [
			[{}, { POSTGRES_DATABASE_URL: env.POSTGRES_DATABASE_URL.replace(`postgres.${ref}`, 'postgres.abcdefghijklmnopqrst') }],
			[{ files: { 'supabase/.temp/project-ref': 'abcdefghijklmnopqrst' } }, env],
		] as const) {
			const { deps, calls } = fakeDeps(o);
			const p = await preview(deps, e);
			expect(p.problems.map((x) => x.check)).toEqual(expect.arrayContaining([expect.stringMatching(/target|linked-project/)]));
			expect(supabaseCalls(calls)).toEqual([]);
		}
	});
	it('refuses a SPA url or a Worker url of another project', async () => {
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace(ref, 'abcdefghijklmnopqrst') } })).toContain('project-mismatch');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace(`https://${ref}`, 'https://abcdefghijklmnopqrst') } })).toContain('project-mismatch');
	});
	it('refuses build overrides, a placeholder or empty key, a key the project rejects, and a build without the exact values', async () => {
		expect(await checks({ files: { 'web/.env.production.local': 'VITE_SUPABASE_URL=http://127.0.0.1:54321\n' } })).toContain('vite-override');
		expect(await checks({}, { ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'x' })).toContain('vite-override');
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace('sb_publishable_abc', '') } })).toContain('vite-env');
		expect(await checks({ files: { 'web/.env.production': WEB_ENV.replace('sb_publishable_abc', 'sb_publishable_REPLACE_ME') } })).toContain('vite-env');
		expect(await checks({ fetchStatus: 401 })).toContain('publishable-key');
		expect(await checks({ dist: `x="https://${ref}.supabase.co";k="sb_publishable_other"` })).toContain('build');
		expect(await checks({ run: { 'npm run build': fail() } })).toContain('build');
	});
	it('refuses a Worker key that is a placeholder or differs from the SPA key', async () => {
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"sb_publishable_abc"', '"sb_publishable_REPLACE_ME"') } })).toContain('worker-key');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"sb_publishable_abc"', '"sb_publishable_other"') } })).toContain('worker-key');
	});
	it('refuses the Worker prerequisites that are missing', async () => {
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('abc123', '00000000000000000000000000000000') } })).toContain('hyperdrive');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"account_id": "acc",', '') } })).toContain('account');
		expect(await checks({ run: { 'npx wrangler r2 bucket info': fail() } })).toContain('r2');
		expect(await checks({ run: { 'npx wrangler secret list': ok('[]') } })).toContain('secrets');
	});
	it('knows the first release: no secrets to check yet', async () => {
		const { deps } = fakeDeps({ run: { 'npx wrangler deployments status': fail('[code: 10007] This Worker does not exist') } });
		expect(await preview(deps, env)).toMatchObject({ problems: [], firstRelease: true });
	});
});

describe('migrations only', () => {
	// Before the app_server password and Hyperdrive (runbook R5): the roles come from the migrations.
	const early = { files: { 'web/.env.production': null, 'server/wrangler.jsonc': WRANGLER.replace('abc123', '00000000000000000000000000000000').replace('"sb_publishable_abc"', '"sb_publishable_REPLACE_ME"').replace('"account_id": "acc",', '') } };
	it('checks git, CI and target only, and pushes to the verified url without building or deploying', async () => {
		const { deps, calls } = fakeDeps(early);
		expect((await preview(deps, env, { migrationsOnly: true })).problems).toEqual([]);
		const r = await apply(deps, env, await confirmationOf(early, { migrationsOnly: true }), { migrationsOnly: true });
		expect(r.problems).toEqual([]);
		expect(supabaseCalls(calls).map((c) => c.split(' --db-url')[0])).toEqual(['supabase db push --dry-run', 'supabase db push --dry-run', 'supabase db push']);
		expect(calls.some((c) => c.startsWith('npm run build') || c.startsWith('npx wrangler'))).toBe(false);
	});
	it('still refuses another project', async () => {
		const { deps, calls } = fakeDeps({ files: { ...early.files, 'supabase/.temp/project-ref': 'abcdefghijklmnopqrst' } });
		expect((await preview(deps, env, { migrationsOnly: true })).problems.map((p) => p.check)).toContain('linked-project');
		expect(supabaseCalls(calls)).toEqual([]);
	});
});

describe('apply', () => {
	it('builds and checks before any production write, then pushes, deploys with the tag and checks', async () => {
		const { deps, calls } = fakeDeps();
		const r = await apply(deps, env, await confirmationOf());
		expect(r.problems).toEqual([]);
		expect(r.versionId).toBe(NEW_VERSION);
		const order = (prefix: string) => calls.findIndex((c) => c.startsWith(prefix));
		expect(order('npm run build')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('npx wrangler deploy --dry-run')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('supabase db push --db-url')).toBeLessThan(order('npx wrangler deploy --tag abc123'));
	});
	it('writes nothing when the confirmation differs or the build fails', async () => {
		const good = await confirmationOf();
		for (const [o, confirmation] of [[{}, 'other'], [{ run: { 'npm run build': fail() } }, good]] as const) {
			const { deps, calls } = fakeDeps(o);
			expect((await apply(deps, env, confirmation)).problems).not.toEqual([]);
			expect(calls.some((c) => c.startsWith('supabase db push --db-url'))).toBe(false);
			expect(calls.some((c) => c.startsWith('npx wrangler deploy --tag'))).toBe(false);
		}
	});
});

describe('the release confirmation (review of PR #34, finding 6)', () => {
	it('binds the scope: a migrations-only preview does not confirm a full release, nor the reverse', async () => {
		const early = { files: { 'web/.env.production': null } };
		const migrationsOnly = await confirmationOf(early, { migrationsOnly: true });
		const full = await confirmationOf();
		expect(migrationsOnly).not.toBe(full);
		const { deps, calls } = fakeDeps();
		expect((await apply(deps, env, migrationsOnly)).problems.map((p) => p.check)).toContain('confirmation');
		expect(calls.some((c) => c.startsWith('supabase db push --db-url') || c.startsWith('npx wrangler deploy --tag'))).toBe(false);
		const second = fakeDeps(early);
		expect((await apply(second.deps, env, full, { migrationsOnly: true })).problems.map((p) => p.check)).toContain('confirmation');
	});
	it('binds the database endpoint and the Cloudflare destination', async () => {
		const confirmation = await confirmationOf();
		const otherHost = { POSTGRES_DATABASE_URL: env.POSTGRES_DATABASE_URL.replace('aws-0-eu-central-1', 'aws-1-eu-west-1') };
		const a = fakeDeps();
		expect((await apply(a.deps, otherHost, confirmation)).problems.map((p) => p.check)).toContain('confirmation');
		const b = fakeDeps({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"acc"', '"other-account"') } });
		expect((await apply(b.deps, env, confirmation)).problems.map((p) => p.check)).toContain('confirmation');
		for (const { calls } of [a, b]) expect(calls.some((c) => c.startsWith('supabase db push --db-url'))).toBe(false);
	});
	it('refuses Wrangler overrides of the environment and env sections of the configuration', async () => {
		expect(wranglerOverrides({ CLOUDFLARE_ENV: 'review-other', PATH: '/bin' })).toEqual(['CLOUDFLARE_ENV']);
		expect(wranglerOverrides({ WRANGLER_LOG: 'debug', CLOUDFLARE_API_TOKEN: 'x' }).sort()).toEqual(['CLOUDFLARE_API_TOKEN', 'WRANGLER_LOG']);
		expect(wranglerOverrides({ PATH: '/bin' })).toEqual([]);
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"account_id": "acc",', '"account_id": "acc", "env": { "review-other": {} },') } })).toContain('worker-env');
	});
	it('prints the published versions with id, traffic and tag, not the deployment id (finding 12)', async () => {
		const { deps, calls } = fakeDeps();
		const p = await preview(deps, env);
		expect(p.deployed).toEqual([{ versionId: OLD_VERSION, percentage: 100, tag: 'oldsha' }]);
		expect(calls).toContain(`npx wrangler versions view ${OLD_VERSION} --json --env-file ${EMPTY_ENV}`);
	});
});

describe('Supabase Auth before the first release (finding 7, sign-ups off)', () => {
	it('lists a disabled OAuth server and enabled sign-ups as missing prerequisites, and applies nothing', async () => {
		expect(await checks({ oauthStatus: 500 })).toContain('oauth-server');
		expect(await checks({ oauthStatus: 404 })).toContain('oauth-server');
		expect(await checks({ settings: '{"disable_signup":false}' })).toContain('signups');
		const { deps, calls } = fakeDeps({ oauthStatus: 500 });
		expect((await apply(deps, env, 'whatever')).problems.map((p) => p.check)).toContain('oauth-server');
		expect(calls.some((c) => c.startsWith('supabase db push --db-url') || c.startsWith('npx wrangler deploy --tag'))).toBe(false);
	});
	it('the migrations alone do not need them (R5 comes before)', async () => {
		const { deps } = fakeDeps({ oauthStatus: 500, settings: '{"disable_signup":false}', files: { 'web/.env.production': null } });
		expect((await preview(deps, env, { migrationsOnly: true })).problems).toEqual([]);
	});
});

describe('after the deploy: the new version is the one answering (finding 6)', () => {
	it('reads the deploy result from the output file of Wrangler and checks name, url and version', async () => {
		const { deps, envs, calls } = fakeDeps();
		await apply(deps, env, await confirmationOf());
		const deployAt = calls.findIndex((c) => c.startsWith('npx wrangler deploy --tag'));
		expect(envs[deployAt]?.WRANGLER_OUTPUT_FILE_PATH).toBe(OUTPUT);
		for (const [over, check] of [
			[{ deployOutput: { worker_name: 'cosasimangia-review-other' } }, 'deploy-target'],
			[{ deployOutput: { worker_name_overridden: true } }, 'deploy-target'],
			[{ deployOutput: { targets: ['other.app'] } }, 'deploy-target'],
			[{ deployOutput: { targets: [URL_OK] } }, 'deploy-target'],
			[{ statusAfter: OLD_VERSION }, 'new-version'],
			[{ servingVersion: OLD_VERSION }, 'new-version'],
		] as const) {
			const f = fakeDeps(over);
			const r = await apply(f.deps, env, await confirmationOf(over));
			expect(r.problems.map((p) => p.check), JSON.stringify(over)).toContain(check);
		}
	});
	it('needs the production url in the configuration, with the Worker name', async () => {
		expect(await checks({ files: { 'scripts/release.config.json': '{"productionUrl":null,"requiredSecrets":[]}' } })).toContain('production-url');
		expect(await checks({ files: { 'scripts/release.config.json': '{"productionUrl":"https://other.powa.workers.dev","requiredSecrets":[]}' } })).toContain('production-url');
	});
	it('needs the production url to be a custom domain of the Worker, with workers.dev off', async () => {
		const config = (url: string) => ({ 'scripts/release.config.json': `{"productionUrl":"${url}","requiredSecrets":[]}` });
		expect(await checks({ files: config('https://cosasimangia.powa.workers.dev') })).toContain('production-url');
		expect(await checks({ files: config('https://other.app') })).toContain('production-url');
		expect(await checks({ files: config(URL_OK) })).not.toContain('production-url');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"workers_dev": false', '"workers_dev": true') } })).toContain('production-url');
		expect(await checks({ files: { 'server/wrangler.jsonc': WRANGLER.replace('"custom_domain": true', '"custom_domain": false') } })).toContain('production-url');
	});
});

describe('migrations, from the list and the exit code (finding 11, minor of --migrations-only)', () => {
	it('knows no pending migration whatever the wording of the CLI', async () => {
		for (const out of ['Remote database is up to date.\n', 'Local database is up to date.\n', 'Nothing to push.\n']) {
			const { deps } = fakeDeps({ run: { 'supabase db push --dry-run': ok(out) }, files: { 'web/.env.production': null } });
			expect((await preview(deps, env, { migrationsOnly: true })).pendingMigrations).toEqual([]);
		}
	});
	it('a failing dry run is a problem, not "up to date"', async () => {
		expect(await checks({ run: { 'supabase db push --dry-run': fail('Would push these migrations') } })).toContain('migrations');
	});
});

describe('migrations listed on stderr (second review of PR #34, finding 1)', () => {
	it('finds the pending migration of a dry run that writes its list on stderr, and applies it', async () => {
		const { deps, calls } = fakeDeps();
		expect((await preview(deps, env)).pendingMigrations).toEqual(['20261012110000_backup.sql']);
		expect((await apply(deps, env, await confirmationOf())).problems).toEqual([]);
		expect(calls.some((c) => c.startsWith('supabase db push --db-url'))).toBe(true);
	});
	it('through the real wrapper: a CLI that lists on stderr gets its migration applied', async () => {
		// A supabase on the PATH that, like 2.120.0, writes the dry run list on stderr and records each push.
		const dir = mkdtempSync(join(tmpdir(), 'release-supabase-'));
		writeFileSync(join(dir, 'supabase'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${dir}/calls"\nif [[ " $* " == *" --dry-run "* ]]; then echo 'Would push these migrations:' >&2; echo ' • 20261012110000_backup.sql' >&2; fi\n`);
		chmodSync(join(dir, 'supabase'), 0o755);
		const real = realRun(process.cwd(), ['pw-secret'], () => {});
		const fake = fakeDeps();
		const run: Run = (cmd, args, options) =>
			cmd === 'supabase' ? real(cmd, args, { ...options, env: { ...options?.env, PATH: `${dir}:${process.env.PATH}` } }) : fake.deps.run(cmd, args, options);
		const deps = { ...fake.deps, run };
		expect((await preview(deps, env)).pendingMigrations).toEqual(['20261012110000_backup.sql']);
		expect((await apply(deps, env, await confirmationOf())).problems).toEqual([]);
		const pushes = readFileSync(join(dir, 'calls'), 'utf8').split('\n').filter(Boolean);
		expect(pushes.filter((c) => !c.includes('--dry-run'))).toHaveLength(1);
	});
	it('the real wrapper keeps stdout and stderr apart, on success and on failure', () => {
		const real = realRun(process.cwd(), [], () => {});
		expect(real(process.execPath, ['-e', 'console.log("[1]"); console.error("note")'])).toEqual({ status: 0, stdout: '[1]\n', stderr: 'note\n' });
		expect(real(process.execPath, ['-e', 'console.error("[code: 10007]"); process.exit(1)'])).toEqual({ status: 1, stdout: '', stderr: '[code: 10007]\n' });
	});
});

describe('Wrangler reads no .env file (second review of PR #34, finding 3)', () => {
	it('passes the empty environment file to every Wrangler command', async () => {
		const { deps, calls } = fakeDeps();
		await apply(deps, env, await confirmationOf());
		const wrangler = calls.filter((c) => c.startsWith('npx wrangler'));
		expect(wrangler.length).toBeGreaterThan(5);
		for (const c of wrangler) expect(c, c).toMatch(new RegExp(`--env-file ${EMPTY_ENV}$`));
	});
	it('refuses before any write a dry run that would deploy another Worker name', async () => {
		for (const dryRunOutput of [{ worker_name: 'cosasimangia-review-other' }, { worker_name_overridden: true }]) {
			const { deps, calls } = fakeDeps({ dryRunOutput });
			expect((await preview(deps, env)).problems.map((p) => p.check)).toContain('deploy-target');
			expect((await apply(deps, env, await confirmationOf())).problems.map((p) => p.check)).toContain('deploy-target');
			expect(calls.some((c) => c.startsWith('supabase db push --db-url') || c.startsWith('npx wrangler deploy --tag'))).toBe(false);
		}
	});
	it('with the real Wrangler: an override in server/.env, parent environment clean, does not change the Worker', () => {
		const dir = mkdtempSync(join(tmpdir(), 'release-wrangler-'));
		writeFileSync(join(dir, 'wrangler.jsonc'), '{ "name": "probe-worker", "main": "index.js", "compatibility_date": "2026-01-01" }');
		writeFileSync(join(dir, 'index.js'), 'export default { fetch() { return new Response("x"); } };');
		writeFileSync(join(dir, '.env'), 'CLOUDFLARE_ENV=review-other\n');
		writeFileSync(join(dir, 'empty.env'), '');
		const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => wranglerOverrides({ [k]: '' }).length === 0));
		const real = realRun(dir, [], () => {});
		const workerOf = (args: string[], output: string) => {
			// The Wrangler of the lockfile, by absolute path: npx from a folder outside the repository could download another.
			const [, ...rest] = args;
			const r = real(process.execPath, [WRANGLER_BIN, ...rest], { env: { ...clean, WRANGLER_OUTPUT_FILE_PATH: join(dir, output) } });
			expect(r.status, r.stderr).toBe(0);
			return readFileSync(join(dir, output), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { type: string; worker_name?: string }).find((e) => e.type === 'deploy')?.worker_name;
		};
		// Without the flag the file wins: the test really exercises the override.
		expect(workerOf(['wrangler', 'deploy', '--dry-run', '--outdir', join(dir, 'a')], 'a.ndjson')).toBe('probe-worker-review-other');
		expect(workerOf(wranglerArgs(join(dir, 'empty.env'), 'deploy', '--dry-run', '--outdir', join(dir, 'b')), 'b.ndjson')).toBe('probe-worker');
		expect(existsSync(join(dir, 'b'))).toBe(true);
	}, 60_000);
});

describe('smokeChecks', () => {
	it('sends a well-formed absent token, so the database is really reached', async () => {
		expect(CHECK_TOKEN).toMatch(/^[0-9a-f]{48}$/);
		const answers: Record<string, [number, string]> = {
			'/api/openapi.json': [200, '{}'], '/api/session/whoami': [401, ''], '/mcp': [401, ''],
			'/.well-known/oauth-protected-resource/mcp': [200, '{"resource":"https://x/mcp"}'], '/menu': [200, '<html>'],
		};
		// Like bring-page.ts: only a 48-hex token reaches the database; here the database answers "absent".
		const fetchFn = (async (url: string) => {
			const path = new URL(url).pathname;
			if (path.startsWith('/shopping-lists/')) return new Response('', { status: /^\/shopping-lists\/[0-9a-f]{48}$/.test(path) ? 404 : 500 });
			const [status, body] = answers[path]!;
			return new Response(body, { status });
		}) as typeof fetch;
		expect(await smokeChecks('https://x', fetchFn)).toEqual([]);
	});
	it('reports a 500 on the page that touches the database', async () => {
		const fetchFn = (async (url: string) => new Response('', { status: new URL(url).pathname.startsWith('/shopping-lists/') ? 500 : 200 })) as typeof fetch;
		expect((await smokeChecks('https://x', fetchFn)).map((p) => p.check)).toContain('database');
	});
});

describe('helpers', () => {
	it('redacts every secret from child output', () => {
		expect(redact('connecting to postgresql://u:pw-secret@h', ['pw-secret'])).toBe('connecting to postgresql://u:***@h');
	});
	it('parses the Worker configuration with comment lines and urls in strings', () => {
		expect(parseJsonc(WRANGLER)).toMatchObject({ vars: { SUPABASE_URL: `https://${ref}.supabase.co` } });
	});
});

describe('the real command', () => {
	// The usage error proves that the whole module runs with strip-only TypeScript. The credentials go
	// with --credentials: Node 26 reads --env-file itself, even after the script name.
	it('refuses CLOUDFLARE_ENV before reading anything', async () => {
		const run = promisify(execFile);
		const failed = await run(process.execPath, ['scripts/release.ts', '--preview'], { env: { ...process.env, CLOUDFLARE_ENV: 'review-other' } }).then(
			() => null,
			(e: { code: number; stdout: string; stderr: string }) => e,
		);
		expect(failed?.code).toBe(1);
		expect(failed!.stderr).toContain('CLOUDFLARE_ENV');
		expect(failed!.stdout).toBe('');
	});
	it('starts with node and refuses a call without --preview or --apply', async () => {
		const run = promisify(execFile);
		for (const args of [[], ['--preview', '--apply', 'abc'], ['--unknown']]) {
			const failed = await run(process.execPath, ['scripts/release.ts', ...args]).then(
				() => null,
				(e: { code: number; stdout: string; stderr: string }) => e,
			);
			expect(failed?.code).toBe(1);
			expect(failed!.stdout + failed!.stderr).toContain('usage: npm run release');
		}
	});
});
