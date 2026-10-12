import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { apply, CHECK_TOKEN, parseJsonc, preview, redact, smokeChecks, type Deps, type Run } from './release.ts';

const ref = 'lronuqvtjdhfyychnscr';
const ok = (stdout = '') => ({ status: 0, stdout });
const fail = (stdout = '') => ({ status: 1, stdout });
const WRANGLER = `{
	// comment with https://example.com
	"name": "cosasimangia",
	"account_id": "acc",
	"vars": { "SUPABASE_URL": "https://${ref}.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_abc" },
	"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "abc123" }],
	"r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "cosasimangia-backups", "jurisdiction": "eu" }]
}`;
const WEB_ENV = `VITE_SUPABASE_URL=https://${ref}.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n`;
const env = { POSTGRES_DATABASE_URL: `postgresql://postgres.${ref}:pw-secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt` };

function fakeDeps(over: { run?: Record<string, ReturnType<Run>>; files?: Record<string, string | null>; dist?: string; fetchStatus?: number } = {}) {
	const calls: string[] = [];
	const files: Record<string, string | null> = { 'server/wrangler.jsonc': WRANGLER, 'web/.env.production': WEB_ENV, 'scripts/production-target.json': `{"supabaseRef":"${ref}"}`,
		'scripts/release.config.json': '{"productionUrl":null,"requiredSecrets":["BACKUP_ENCRYPTION_KEY"]}', 'supabase/.temp/project-ref': null,
		'web/.env.local': null, 'web/.env.production.local': null, '/ca.crt': 'CA', ...over.files };
	const run: Run = (cmd, args) => {
		const key = `${cmd} ${args.join(' ')}`;
		calls.push(key);
		for (const [k, v] of Object.entries(over.run ?? {})) if (key.startsWith(k)) return v;
		if (key.startsWith('git rev-parse --abbrev-ref')) return ok('main\n');
		if (key.startsWith('git status --porcelain')) return ok('');
		if (key.startsWith('git rev-parse')) return ok('abc123\n');
		if (key.startsWith('gh run list')) return ok('[{"conclusion":"success"}]');
		if (key.startsWith('npx wrangler deployments list')) return ok('[{"id":"v1"}]');
		if (key.startsWith('npx wrangler secret list')) return ok('[{"name":"BACKUP_ENCRYPTION_KEY"}]');
		if (key.startsWith('supabase db push --dry-run')) return ok('Would push these migrations:\n • 20261012110000_backup.sql\n');
		if (key.startsWith('npx wrangler deploy') && !key.includes('--dry-run')) return ok('https://cosasimangia.powa.workers.dev\n');
		return ok('');
	};
	const deps: Deps = {
		run,
		// The project answers the key check with fetchStatus; the published Worker answers like a healthy one.
		fetch: (async (url: string) => {
			const path = new URL(url).pathname;
			if (path === '/auth/v1/settings') return new Response('{}', { status: over.fetchStatus ?? 200 });
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
	};
	return { deps, calls };
}
const checks = async (o: Parameters<typeof fakeDeps>[0], e: NodeJS.ProcessEnv = env) => (await preview(fakeDeps(o).deps, e)).problems.map((p) => p.check);
const supabaseCalls = (calls: string[]) => calls.filter((c) => c.startsWith('supabase'));

describe('preview', () => {
	it('passes on a clean, green main, sending migrations only to the verified url', async () => {
		const { deps, calls } = fakeDeps();
		const p = await preview(deps, env);
		expect(p).toMatchObject({ sha: 'abc123', problems: [], firstRelease: false, migrationsPending: true });
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
		const { deps } = fakeDeps({ run: { 'npx wrangler deployments list': fail('[code: 10007] This Worker does not exist') } });
		expect(await preview(deps, env)).toMatchObject({ problems: [], firstRelease: true });
	});
});

describe('migrations only', () => {
	// Before the app_server password and Hyperdrive (runbook R5): the roles come from the migrations.
	const early = { files: { 'web/.env.production': null, 'server/wrangler.jsonc': WRANGLER.replace('abc123', '00000000000000000000000000000000').replace('"sb_publishable_abc"', '"sb_publishable_REPLACE_ME"').replace('"account_id": "acc",', '') } };
	it('checks git, CI and target only, and pushes to the verified url without building or deploying', async () => {
		const { deps, calls } = fakeDeps(early);
		expect((await preview(deps, env, { migrationsOnly: true })).problems).toEqual([]);
		const r = await apply(deps, env, 'abc123', { migrationsOnly: true });
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
		const r = await apply(deps, env, 'abc123');
		expect(r.problems).toEqual([]);
		const order = (prefix: string) => calls.findIndex((c) => c.startsWith(prefix));
		expect(order('npm run build')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('npx wrangler deploy --dry-run')).toBeLessThan(order('supabase db push --db-url'));
		expect(order('supabase db push --db-url')).toBeLessThan(order('npx wrangler deploy --tag abc123'));
	});
	it('writes nothing when the commit differs or the build fails', async () => {
		for (const [o, sha] of [[{}, 'other'], [{ run: { 'npm run build': fail() } }, 'abc123']] as const) {
			const { deps, calls } = fakeDeps(o);
			expect((await apply(deps, env, sha)).problems).not.toEqual([]);
			expect(calls.some((c) => c.startsWith('supabase db push --db-url'))).toBe(false);
			expect(calls.some((c) => c.startsWith('npx wrangler deploy --tag'))).toBe(false);
		}
	});
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
	// Node 26 itself checks that an --env-file path exists, even after the script (exit 9, before the
	// module loads): the usage error is what proves the whole module runs with strip-only TypeScript.
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
