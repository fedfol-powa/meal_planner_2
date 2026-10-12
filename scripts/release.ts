// Release in two steps (detail spec of the production launch, section 7), run by the coordinator after
// the user's "vai". Nothing is written to production by --preview; --apply repeats every check and the
// build before its first write.
// Usage: npm run release -- --preview [--migrations-only] [--env-file <file>]
//        npm run release -- --apply <sha> [--migrations-only] [--env-file <file>]
// Credentials are read from the file into an object, never into process.env, and never printed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { checkTarget, TargetError } from './import/load/target.ts';

export type Run = (cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => { status: number; stdout: string };
export interface Deps { run: Run; fetch: typeof fetch; readFile: (path: string) => string | null; distFiles: () => string[]; tmpDir: () => string }
export interface Problem { check: string; message: string }
/** deployed: the last version published (id, tag, date), null before the first release. */
export interface Preview { sha: string | null; problems: Problem[]; firstRelease: boolean; migrationsPending: boolean; buildEnv: Record<string, string>; deployed: string | null }
/** --migrations-only: git, CI, target, db push; nothing else (runbook, before app_server and Hyperdrive). */
export interface Scope { migrationsOnly?: boolean }

/** 48 hex characters, the format bring-page.ts sends to the database: the answer crosses Hyperdrive as anon. */
export const CHECK_TOKEN = '0'.repeat(48);
const DEFAULT_ENV_FILE = '/Users/fedfol/Projects/meal_planner_2/.env.production.local';
const ZERO_ID = /^0+$/;
const PLACEHOLDER = /REPLACE_ME/;

export function redact(text: string, secrets: string[]): string {
	let out = text;
	for (const secret of secrets.filter((s) => s.length > 0))
		for (const form of new Set([secret, encodeURIComponent(secret)])) out = out.split(form).join('***');
	return out;
}

/** JSON with whole-line // comments, as in server/wrangler.jsonc (a // inside a string is kept). */
export function parseJsonc(text: string): unknown {
	return JSON.parse(text.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n'));
}

/** The one way to call supabase db push: --db-url without the password, which goes in PGPASSWORD. */
export function migrationCommand(checkedUrl: string, dryRun: boolean): { cmd: 'supabase'; args: string[]; env: Record<string, string> } {
	const url = new URL(checkedUrl);
	const password = decodeURIComponent(url.password);
	url.password = '';
	return { cmd: 'supabase', args: ['db', 'push', ...(dryRun ? ['--dry-run'] : []), '--db-url', url.toString()], env: { PGPASSWORD: password } };
}

const jsonOf = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

interface WorkerConfig {
	account_id?: string;
	vars?: Record<string, string>;
	hyperdrive?: { id?: string }[];
	r2_buckets?: { bucket_name: string; jurisdiction?: string }[];
}

export async function preview(deps: Deps, env: NodeJS.ProcessEnv, scope: Scope = {}): Promise<Preview> {
	const problems: Problem[] = [];
	const add = (check: string, message: string) => problems.push({ check, message });
	const result = (over: Partial<Preview> = {}): Preview => ({ sha: null, problems, firstRelease: false, migrationsPending: false, buildEnv: {}, deployed: null, ...over });

	// 1. Repository: main, clean, pushed, green.
	if (deps.run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim() !== 'main') add('branch', 'not on main');
	if (deps.run('git', ['status', '--porcelain']).stdout.trim() !== '') add('clean', 'the working tree has changes');
	if (deps.run('git', ['fetch', 'origin', 'main']).status !== 0) add('pushed', 'git fetch origin main failed');
	const sha = deps.run('git', ['rev-parse', 'HEAD']).stdout.trim();
	if (deps.run('git', ['rev-parse', 'origin/main']).stdout.trim() !== sha) add('pushed', 'HEAD is not origin/main');
	const ci = jsonOf(deps.run('gh', ['run', 'list', '--commit', sha, '--workflow', 'ci.yml', '--json', 'conclusion', '--limit', '1']).stdout) as { conclusion?: string }[] | null;
	if (ci?.[0]?.conclusion !== 'success') add('ci', `CI is not green on ${sha}`);

	// 2. One project for everything.
	const target = jsonOf(deps.readFile('scripts/production-target.json') ?? '') as { supabaseRef?: string } | null;
	const ref = target?.supabaseRef;
	if (!ref) {
		add('target', 'scripts/production-target.json has no supabaseRef');
		return result({ sha });
	}
	const projectUrl = `https://${ref}.supabase.co`;
	const databaseUrl = env.POSTGRES_DATABASE_URL;
	try {
		checkTarget('POSTGRES_DATABASE_URL', databaseUrl, {
			role: 'postgres', target: 'production', ref,
			readCa: (path) => {
				const ca = deps.readFile(path);
				if (ca === null) throw new Error('missing');
				return ca;
			},
		});
	} catch (error) {
		add('target', error instanceof TargetError ? error.message : 'POSTGRES_DATABASE_URL is not usable');
	}
	const linked = deps.readFile('supabase/.temp/project-ref');
	if (linked !== null && linked.trim() !== ref) add('linked-project', `supabase link points to ${linked.trim()}, not ${ref}: run supabase unlink`);
	const workerText = deps.readFile('server/wrangler.jsonc');
	let worker: WorkerConfig | null = null;
	try {
		worker = workerText ? (parseJsonc(workerText) as WorkerConfig) : null;
	} catch {
		worker = null;
	}
	if (!worker) add('worker-config', 'server/wrangler.jsonc is missing or not valid');
	else if (worker.vars?.SUPABASE_URL !== projectUrl) add('project-mismatch', `server/wrangler.jsonc SUPABASE_URL is not ${projectUrl}`);
	const webText = scope.migrationsOnly ? null : deps.readFile('web/.env.production');
	const web = webText === null ? {} : parseEnv(webText);
	if (!scope.migrationsOnly && web.VITE_SUPABASE_URL && web.VITE_SUPABASE_URL !== projectUrl) add('project-mismatch', `web/.env.production VITE_SUPABASE_URL is not ${projectUrl}`);
	// Nothing else runs against an uncertain destination.
	if (problems.some((p) => ['target', 'linked-project', 'project-mismatch', 'worker-config'].includes(p.check))) return result({ sha });

	let firstRelease = false;
	let deployed: string | null = null;
	const url = web.VITE_SUPABASE_URL ?? '';
	const key = web.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
	const buildEnv = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key };
	if (!scope.migrationsOnly && worker) {
		// 3. Worker configuration and its prerequisites.
		const server = { cwd: 'server' };
		if (!worker.account_id) add('account', 'account_id is missing in server/wrangler.jsonc');
		if (!worker.hyperdrive?.length || worker.hyperdrive.some((h) => !h.id || ZERO_ID.test(h.id))) add('hyperdrive', 'the Hyperdrive id is still the placeholder');
		for (const bucket of worker.r2_buckets ?? []) {
			const args = ['wrangler', 'r2', 'bucket', 'info', bucket.bucket_name, ...(bucket.jurisdiction ? ['--jurisdiction', bucket.jurisdiction] : [])];
			if (deps.run('npx', args, server).status !== 0) add('r2', `bucket ${bucket.bucket_name} not found`);
		}
		const deployments = deps.run('npx', ['wrangler', 'deployments', 'list', '--json'], server);
		if (deployments.status !== 0) {
			if (deployments.stdout.includes('10007')) firstRelease = true;
			else add('deployments', 'wrangler deployments list failed');
		} else {
			const list = jsonOf(deployments.stdout) as { id?: string; created_on?: string; annotations?: Record<string, string> }[] | null;
			const last = list?.at(-1);
			if (last) deployed = `${last.id ?? '?'} ${last.annotations?.['workers/tag'] ?? ''} ${last.created_on ?? ''}`.replace(/\s+/g, ' ').trim();
		}
		if (!firstRelease && deployments.status === 0) {
			const required = (jsonOf(deps.readFile('scripts/release.config.json') ?? '') as { requiredSecrets?: string[] } | null)?.requiredSecrets ?? [];
			const secrets = jsonOf(deps.run('npx', ['wrangler', 'secret', 'list', '--format', 'json'], server).stdout) as { name: string }[] | null;
			const missing = required.filter((name) => !secrets?.some((s) => s.name === name));
			if (missing.length) add('secrets', `missing Worker secrets: ${missing.join(', ')}`);
		}
		const workerKey = worker.vars?.SUPABASE_PUBLISHABLE_KEY ?? '';
		if (!workerKey || PLACEHOLDER.test(workerKey) || workerKey !== key) add('worker-key', 'SUPABASE_PUBLISHABLE_KEY of the Worker is a placeholder or differs from the SPA key');

		// 4. SPA build with fixed values.
		const viteInEnv = Object.keys(env).some((k) => k.startsWith('VITE_'));
		if (deps.readFile('web/.env.local') !== null || deps.readFile('web/.env.production.local') !== null || viteInEnv)
			add('vite-override', 'web/.env.local, web/.env.production.local or VITE_* in the environment would override the release values');
		if (url !== projectUrl || !key.startsWith('sb_publishable_') || key === 'sb_publishable_' || PLACEHOLDER.test(key))
			add('vite-env', 'web/.env.production needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY of the project');
		if (!problems.some((p) => p.check === 'vite-override' || p.check === 'vite-env')) {
			let status = 0;
			try {
				status = (await deps.fetch(`${projectUrl}/auth/v1/settings`, { headers: { apikey: key } })).status;
			} catch {
				status = 0;
			}
			if (status !== 200) add('publishable-key', `the project answers ${status} to the publishable key`);
			const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')));
			if (deps.run('npm', ['run', 'build', '-w', 'web'], { env: { ...cleanEnv, ...buildEnv } }).status !== 0) add('build', 'npm run build -w web failed');
			else {
				const dist = deps.distFiles().join('\n');
				if (!dist.includes(url) || !dist.includes(key)) add('build', 'web/dist does not contain the exact URL and key');
			}
			if (deps.run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', deps.tmpDir()], server).status !== 0) add('worker-build', 'the Worker bundle does not build');
		}
	}

	// 5. Migrations, only to the verified url and only when everything else passed.
	let migrationsPending = false;
	if (problems.length === 0) {
		const m = migrationCommand(databaseUrl!, true);
		const pushed = deps.run(m.cmd, m.args, { env: { ...process.env, ...m.env } });
		if (pushed.status !== 0) add('migrations', 'supabase db push --dry-run failed');
		else migrationsPending = !pushed.stdout.includes('Remote database is up to date');
	}
	return result({ sha, firstRelease, migrationsPending, buildEnv, deployed });
}

export async function smokeChecks(baseUrl: string, fetchFn: typeof fetch): Promise<Problem[]> {
	const problems: Problem[] = [];
	const get = async (path: string, method = 'GET') => {
		try {
			const response = await fetchFn(new URL(path, baseUrl).toString(), { method, redirect: 'manual' });
			return { status: response.status, body: await response.text() };
		} catch {
			return { status: 0, body: '' };
		}
	};
	const expectStatus = async (check: string, path: string, status: number, method = 'GET') => {
		const r = await get(path, method);
		if (r.status !== status) problems.push({ check, message: `${method} ${path} answered ${r.status}, expected ${status}` });
		return r;
	};
	await expectStatus('openapi', '/api/openapi.json', 200);
	await expectStatus('auth', '/api/session/whoami', 401);
	await expectStatus('mcp', '/mcp', 401, 'POST');
	const metadata = await expectStatus('oauth-metadata', '/.well-known/oauth-protected-resource/mcp', 200);
	const resource = (jsonOf(metadata.body) as { resource?: string } | null)?.resource;
	if (metadata.status === 200 && !resource?.endsWith('/mcp')) problems.push({ check: 'oauth-metadata', message: 'resource does not end in /mcp' });
	const menu = await expectStatus('spa', '/menu', 200);
	if (menu.status === 200 && !/<html/i.test(menu.body)) problems.push({ check: 'spa', message: '/menu is not HTML' });
	await expectStatus('database', `/shopping-lists/${CHECK_TOKEN}`, 404);
	return problems;
}

export async function apply(deps: Deps, env: NodeJS.ProcessEnv, sha: string, scope: Scope = {}): Promise<{ problems: Problem[]; url: string | null; firstRelease: boolean }> {
	const p = await preview(deps, env, scope);
	if (p.problems.length) return { problems: p.problems, url: null, firstRelease: p.firstRelease };
	if (p.sha !== sha) return { problems: [{ check: 'commit', message: `HEAD is ${p.sha}, not ${sha}: run --preview again` }], url: null, firstRelease: p.firstRelease };
	const fail = (check: string, message: string) => ({ problems: [{ check, message }], url: null, firstRelease: p.firstRelease });

	if (p.migrationsPending) {
		const m = migrationCommand(env.POSTGRES_DATABASE_URL!, false);
		if (deps.run(m.cmd, m.args, { env: { ...process.env, ...m.env } }).status !== 0) return fail('migrations', 'supabase db push failed');
	}
	if (scope.migrationsOnly) return { problems: [], url: null, firstRelease: false };

	// The build in web/dist is the one this apply's preview just made and checked.
	const deployed = deps.run('npx', ['wrangler', 'deploy', '--tag', sha, '--message', `release ${sha}`], { cwd: 'server' });
	if (deployed.status !== 0) return fail('deploy', 'wrangler deploy failed');
	const configured = (jsonOf(deps.readFile('scripts/release.config.json') ?? '') as { productionUrl?: string | null } | null)?.productionUrl ?? null;
	const url = configured ?? deployed.stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/)?.[0] ?? null;
	if (!url) return fail('url', 'no production url: none in scripts/release.config.json and none in the deploy output');
	return { problems: await smokeChecks(url, deps.fetch), url, firstRelease: p.firstRelease };
}

function realDeps(root: string, secrets: string[]): Deps {
	const run: Run = (cmd, args, options = {}) => {
		const child = spawnSync(cmd, args, { cwd: resolve(root, options.cwd ?? '.'), env: options.env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		const status = child.status ?? 1;
		// stderr joins the output only on failure: JSON answers stay parsable.
		const stdout = status === 0 ? child.stdout : `${child.stdout}\n${child.stderr}`;
		const shown = redact(`$ ${cmd} ${args.join(' ')}\n${stdout}`, secrets).trimEnd();
		console.log(shown);
		return { status, stdout };
	};
	const files = (dir: string): string[] =>
		existsSync(dir) ? readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)])) : [];
	return {
		run,
		fetch,
		readFile: (path) => {
			const full = resolve(root, path);
			return existsSync(full) ? readFileSync(full, 'utf8') : null;
		},
		distFiles: () => files(resolve(root, 'web/dist')).filter((f) => /\.(js|html)$/.test(f)).map((f) => readFileSync(f, 'utf8')),
		tmpDir: () => mkdtempSync(join(tmpdir(), 'release-worker-')),
	};
}

async function main(): Promise<number> {
	const usage = 'usage: npm run release -- (--preview | --apply <sha>) [--migrations-only] [--env-file <file>]';
	let values;
	try {
		({ values } = parseArgs({
			args: process.argv.slice(2), strict: true, allowPositionals: false,
			options: { preview: { type: 'boolean' }, apply: { type: 'string' }, 'migrations-only': { type: 'boolean' }, 'env-file': { type: 'string' } },
		}));
	} catch {
		console.error(usage);
		return 1;
	}
	if ((values.preview === true) === (values.apply !== undefined)) {
		console.error(usage);
		return 1;
	}
	const envFile = values['env-file'] ?? DEFAULT_ENV_FILE;
	if (!existsSync(envFile)) {
		console.error(`credentials file not found: ${envFile}`);
		return 1;
	}
	const credentials = parseEnv(readFileSync(envFile, 'utf8'));
	const password = (() => {
		try {
			return decodeURIComponent(new URL(credentials.POSTGRES_DATABASE_URL ?? '').password);
		} catch {
			return '';
		}
	})();
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const deps = realDeps(root, [password, credentials.APP_SERVER_PASSWORD ?? ''].filter(Boolean));
	// VITE_* of the process count as overrides; credentials come only from the file.
	const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_'))), POSTGRES_DATABASE_URL: credentials.POSTGRES_DATABASE_URL };
	const scope = { migrationsOnly: values['migrations-only'] === true };
	const only = scope.migrationsOnly ? ' --migrations-only' : '';
	const report = (problems: Problem[]) => {
		for (const p of problems) console.error(`✗ ${p.check}: ${p.message}`);
	};

	if (values.preview) {
		const p = await preview(deps, env, scope);
		if (p.deployed) console.log(`Published version: ${p.deployed}`);
		if (p.problems.length) {
			report(p.problems);
			return 1;
		}
		if (!scope.migrationsOnly && p.firstRelease) console.log('First release: no version published yet, Worker secrets cannot be checked before it.');
		console.log(`Migrations: ${p.migrationsPending ? 'pending (see the list above)' : 'up to date'}.`);
		console.log(`Release preview OK for ${p.sha}. Apply with: npm run release -- --apply ${p.sha}${only}`);
		return 0;
	}
	const r = await apply(deps, env, values.apply!, scope);
	if (r.problems.length) {
		report(r.problems);
		return 1;
	}
	if (scope.migrationsOnly) {
		console.log('Migrations applied; no deploy.');
		return 0;
	}
	console.log(`Released ${values.apply} at ${r.url}; checks passed.`);
	const configured = (jsonOf(deps.readFile('scripts/release.config.json') ?? '') as { productionUrl?: string | null } | null)?.productionUrl;
	if (!configured) console.log(`Write ${r.url} as productionUrl in scripts/release.config.json with a pull request.`);
	if (r.firstRelease) console.log('Required now, before 02:30: ! npx wrangler secret put BACKUP_ENCRYPTION_KEY (from server/).');
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			console.error(`release failed: ${error instanceof Error ? error.name : 'unknown'}`);
			process.exitCode = 1;
		},
	);
}
