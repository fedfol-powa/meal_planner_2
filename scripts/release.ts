// Release in two steps (detail spec of the production launch, section 7), run by the coordinator after
// the user's "vai". Nothing is written to production by --preview; --apply repeats every check and the
// build before its first write.
// Usage: npm run release -- --preview [--migrations-only] [--credentials <file>]
//        npm run release -- --apply <confirmation> [--migrations-only] [--credentials <file>]
// The confirmation printed by the preview binds commit, scope, database endpoint and Cloudflare
// destination (review of PR #34, finding 6). Credentials are read from the file into an object, never
// into process.env, and never printed.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { checkTarget, dbUrlWithoutPassword, describeEndpoint, TargetError, type Checked } from './import/load/target.ts';

export type Run = (cmd: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }) => { status: number; stdout: string };
export interface Deps {
	run: Run; fetch: typeof fetch; readFile: (path: string) => string | null; distFiles: () => string[]; tmpDir: () => string;
	/** Files of supabase/migrations: a pending migration is one the dry run lists. */
	migrationFiles: () => string[];
	sleep: (ms: number) => Promise<void>;
}
export interface Problem { check: string; message: string }
export interface PublishedVersion { versionId: string; percentage: number; tag: string | null }
/** deployed: the versions of the current deployment (finding 12), null before the first release. */
export interface Preview {
	sha: string | null; problems: Problem[]; firstRelease: boolean; pendingMigrations: string[]; buildEnv: Record<string, string>;
	deployed: PublishedVersion[] | null; confirmation: string | null; productionUrl: string | null; workerName: string | null;
}
/** --migrations-only: git, CI, target, db push; nothing else (runbook, before app_server and Hyperdrive). */
export interface Scope { migrationsOnly?: boolean }

/** 48 hex characters, the format bring-page.ts sends to the database: the answer crosses Hyperdrive as anon. */
export const CHECK_TOKEN = '0'.repeat(48);
const DEFAULT_CREDENTIALS = '/Users/fedfol/Projects/meal_planner_2/.env.production.local';
/** Up to 60 s for the new version to answer at the edge. */
const SERVING_ATTEMPTS = 12;
const SERVING_PAUSE_MS = 5_000;

/** Variables that change what Wrangler deploys or where (CLOUDFLARE_ENV picks another Worker name). */
export const wranglerOverrides = (env: NodeJS.ProcessEnv) => Object.keys(env).filter((k) => k.startsWith('CLOUDFLARE_') || k.startsWith('WRANGLER_'));
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

/** The one way to call supabase db push: --db-url built from the checked fields, the password in PGPASSWORD. */
export function migrationCommand(checked: Checked, dryRun: boolean): { cmd: 'supabase'; args: string[]; env: Record<string, string> } {
	return { cmd: 'supabase', args: ['db', 'push', ...(dryRun ? ['--dry-run'] : []), '--db-url', dbUrlWithoutPassword(checked)], env: { PGPASSWORD: checked.fields.password } };
}

/** The migrations a dry run lists: the exit code and the file names, not the wording of the CLI. */
export const pendingIn = (output: string, files: string[]) => files.filter((f) => output.includes(f));

export const releaseConfirmation = (c: { sha: string; scope: 'full' | 'migrations-only'; database: string; account: string | null; worker: string | null }) =>
	createHash('sha256').update(JSON.stringify(c)).digest('hex');

const jsonOf = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

interface WorkerConfig {
	name?: string;
	env?: unknown;
	account_id?: string;
	vars?: Record<string, string>;
	hyperdrive?: { id?: string }[];
	r2_buckets?: { bucket_name: string; jurisdiction?: string }[];
}

export async function preview(deps: Deps, env: NodeJS.ProcessEnv, scope: Scope = {}): Promise<Preview> {
	const problems: Problem[] = [];
	const add = (check: string, message: string) => problems.push({ check, message });
	const result = (over: Partial<Preview> = {}): Preview => ({ sha: null, problems, firstRelease: false, pendingMigrations: [], buildEnv: {}, deployed: null, confirmation: null, productionUrl: null, workerName: null, ...over });

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
	let checked: Checked | null = null;
	try {
		checked = checkTarget('POSTGRES_DATABASE_URL', env.POSTGRES_DATABASE_URL, {
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
	else if (worker.env !== undefined) add('worker-env', 'server/wrangler.jsonc has env sections: the Worker name would depend on the environment');
	const webText = scope.migrationsOnly ? null : deps.readFile('web/.env.production');
	const web = webText === null ? {} : parseEnv(webText);
	if (!scope.migrationsOnly && web.VITE_SUPABASE_URL && web.VITE_SUPABASE_URL !== projectUrl) add('project-mismatch', `web/.env.production VITE_SUPABASE_URL is not ${projectUrl}`);
	// Nothing else runs against an uncertain destination.
	if (problems.some((p) => ['target', 'linked-project', 'project-mismatch', 'worker-config'].includes(p.check))) return result({ sha });

	let firstRelease = false;
	let deployed: PublishedVersion[] | null = null;
	const releaseConfig = jsonOf(deps.readFile('scripts/release.config.json') ?? '') as { productionUrl?: string | null; requiredSecrets?: string[] } | null;
	const productionUrl = releaseConfig?.productionUrl ?? null;
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
		const name = worker.name ?? '';
		if (!productionUrl || !new RegExp(`^https://${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-z0-9-]+\\.workers\\.dev$`).test(productionUrl))
			add('production-url', `productionUrl in scripts/release.config.json must be https://${name}.<subdomain>.workers.dev`);
		const deployments = deps.run('npx', ['wrangler', 'deployments', 'status', '--json'], server);
		if (deployments.status !== 0) {
			if (deployments.stdout.includes('10007') || deployments.stdout.includes('has no deployments')) firstRelease = true;
			else add('deployments', 'wrangler deployments status failed');
		} else {
			// The versions of the deployment, each with its traffic and tag: what a rollback needs.
			const current = jsonOf(deployments.stdout) as { versions?: { version_id: string; percentage: number }[] } | null;
			deployed = (current?.versions ?? []).map((v) => {
				const view = jsonOf(deps.run('npx', ['wrangler', 'versions', 'view', v.version_id, '--json'], server).stdout) as { annotations?: Record<string, string> } | null;
				return { versionId: v.version_id, percentage: v.percentage, tag: view?.annotations?.['workers/tag'] ?? null };
			});
		}
		if (!firstRelease && deployments.status === 0) {
			const required = releaseConfig?.requiredSecrets ?? [];
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
			// 5. Supabase Auth, read only: the key works, sign-ups are off, the OAuth server is on.
			const settings = await getJson(deps, `${projectUrl}/auth/v1/settings`, { apikey: key });
			if (settings.status !== 200) add('publishable-key', `the project answers ${settings.status} to the publishable key`);
			else if ((settings.body as { disable_signup?: unknown } | null)?.disable_signup !== true)
				add('signups', 'sign-ups are enabled: Authentication > Sign In / Providers, "Allow new users to sign up" off (runbook R3a)');
			const oauth = await getJson(deps, `${projectUrl}/.well-known/oauth-authorization-server/auth/v1`);
			if (oauth.status !== 200 || typeof (oauth.body as { registration_endpoint?: unknown } | null)?.registration_endpoint !== 'string')
				add('oauth-server', `Supabase OAuth server is not enabled with dynamic registration (answer ${oauth.status}; runbook R3b)`);
			const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')));
			if (deps.run('npm', ['run', 'build', '-w', 'web'], { env: { ...cleanEnv, ...buildEnv } }).status !== 0) add('build', 'npm run build -w web failed');
			else {
				const dist = deps.distFiles().join('\n');
				if (!dist.includes(url) || !dist.includes(key)) add('build', 'web/dist does not contain the exact URL and key');
			}
			if (deps.run('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', deps.tmpDir()], server).status !== 0) add('worker-build', 'the Worker bundle does not build');
		}
	}

	// 6. Migrations, only to the checked destination and only when everything else passed.
	let pendingMigrations: string[] = [];
	if (problems.length === 0 && checked) {
		const m = migrationCommand(checked, true);
		const pushed = deps.run(m.cmd, m.args, { env: { ...process.env, ...m.env } });
		if (pushed.status !== 0) add('migrations', 'supabase db push --dry-run failed');
		else pendingMigrations = pendingIn(pushed.stdout, deps.migrationFiles());
	}
	// 8. What the "vai" confirms.
	const confirmation = checked
		? releaseConfirmation({ sha, scope: scope.migrationsOnly ? 'migrations-only' : 'full', database: describeEndpoint(checked.endpoint), account: worker?.account_id ?? null, worker: worker?.name ?? null })
		: null;
	return result({ sha, firstRelease, pendingMigrations, buildEnv, deployed, confirmation, productionUrl, workerName: worker?.name ?? null });
}

async function getJson(deps: Deps, url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
	try {
		const response = await deps.fetch(url, { headers });
		return { status: response.status, body: jsonOf(await response.text()) };
	} catch {
		return { status: 0, body: null };
	}
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

export interface Applied { problems: Problem[]; url: string | null; firstRelease: boolean; versionId: string | null; pendingMigrations: string[] }

export async function apply(deps: Deps, env: NodeJS.ProcessEnv, confirmation: string, scope: Scope = {}): Promise<Applied> {
	const p = await preview(deps, env, scope);
	const done = (over: Partial<Applied>): Applied => ({ problems: [], url: null, firstRelease: p.firstRelease, versionId: null, pendingMigrations: p.pendingMigrations, ...over });
	const fail = (check: string, message: string) => done({ problems: [{ check, message }] });
	if (p.problems.length) return done({ problems: p.problems });
	if (p.confirmation !== confirmation) return fail('confirmation', 'the release changed since the preview (commit, scope, database or Worker): run --preview again');
	const checked = checkTarget('POSTGRES_DATABASE_URL', env.POSTGRES_DATABASE_URL, { role: 'postgres', target: 'production', ref: (jsonOf(deps.readFile('scripts/production-target.json') ?? '') as { supabaseRef: string }).supabaseRef, readCa: (path) => deps.readFile(path) ?? '' });

	if (p.pendingMigrations.length) {
		const m = migrationCommand(checked, false);
		if (deps.run(m.cmd, m.args, { env: { ...process.env, ...m.env } }).status !== 0) return fail('migrations', 'supabase db push failed');
	}
	if (scope.migrationsOnly) return done({});

	// The build in web/dist is the one this apply's preview just made and checked. Wrangler writes what it
	// deployed (Worker name, version, urls) in its output file: no parsing of the console.
	const output = join(deps.tmpDir(), 'wrangler-output.ndjson');
	const deployed = deps.run('npx', ['wrangler', 'deploy', '--tag', p.sha!, '--message', `release ${p.sha}`], { cwd: 'server', env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output } });
	if (deployed.status !== 0) return fail('deploy', 'wrangler deploy failed');
	const entry = (deps.readFile(output) ?? '').split('\n').map((l) => jsonOf(l) as { type?: string; worker_name?: string; version_id?: string; targets?: string[]; worker_name_overridden?: boolean } | null).find((e) => e?.type === 'deploy');
	const url = p.productionUrl!;
	if (!entry?.version_id || entry.worker_name !== p.workerName || entry.worker_name_overridden || !entry.targets?.includes(url))
		return fail('deploy-target', `the deploy did not publish ${p.workerName} at ${url}: check before anything else`);
	const versionId = entry.version_id;

	// The new version answers: the deployment serves only it, and the Worker says it is it.
	const status = jsonOf(deps.run('npx', ['wrangler', 'deployments', 'status', '--json'], { cwd: 'server' }).stdout) as { versions?: { version_id: string; percentage: number }[] } | null;
	if (status?.versions?.length !== 1 || status.versions[0]!.version_id !== versionId || status.versions[0]!.percentage !== 100)
		return done({ versionId, url, problems: [{ check: 'new-version', message: `the deployment does not serve ${versionId} at 100%` }] });
	let serving: unknown = null;
	for (let attempt = 0; attempt < SERVING_ATTEMPTS; attempt++) {
		serving = ((await getJson(deps, new URL('/api/openapi.json', url).toString())).body as { info?: { version?: unknown } } | null)?.info?.version;
		if (serving === versionId) break;
		await deps.sleep(SERVING_PAUSE_MS);
	}
	if (serving !== versionId) return done({ versionId, url, problems: [{ check: 'new-version', message: `the new version ${versionId} is not serving at ${url} after 60 s` }] });
	return done({ versionId, url, problems: await smokeChecks(url, deps.fetch) });
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
		migrationFiles: () => readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')),
		sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
	};
}

async function main(): Promise<number> {
	const usage = 'usage: npm run release -- (--preview | --apply <confirmation>) [--migrations-only] [--credentials <file>]';
	const overrides = wranglerOverrides(process.env);
	if (overrides.length) {
		console.error(`refused: ${overrides.join(', ')} in the environment would change what Wrangler deploys or where; unset them first`);
		return 1;
	}
	let values;
	try {
		({ values } = parseArgs({
			args: process.argv.slice(2), strict: true, allowPositionals: false,
			options: { preview: { type: 'boolean' }, apply: { type: 'string' }, 'migrations-only': { type: 'boolean' }, credentials: { type: 'string' } },
		}));
	} catch {
		console.error(usage);
		return 1;
	}
	if ((values.preview === true) === (values.apply !== undefined)) {
		console.error(usage);
		return 1;
	}
	const credentialsFile = values.credentials ?? DEFAULT_CREDENTIALS;
	if (!existsSync(credentialsFile)) {
		console.error(`credentials file not found: ${credentialsFile}`);
		return 1;
	}
	const credentials = parseEnv(readFileSync(credentialsFile, 'utf8'));
	const password = (() => {
		try {
			return decodeURIComponent(new URL(credentials.POSTGRES_DATABASE_URL ?? '').password);
		} catch {
			return '';
		}
	})();
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const deps = realDeps(root, [password].filter(Boolean));
	// VITE_* of the process count as overrides; credentials come only from the file.
	const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_'))), POSTGRES_DATABASE_URL: credentials.POSTGRES_DATABASE_URL };
	const scope = { migrationsOnly: values['migrations-only'] === true };
	const only = scope.migrationsOnly ? ' --migrations-only' : '';
	const report = (problems: Problem[]) => {
		for (const p of problems) console.error(`✗ ${p.check}: ${p.message}`);
	};

	if (values.preview) {
		const p = await preview(deps, env, scope);
		for (const v of p.deployed ?? []) console.log(`Published version: ${v.versionId} (${v.percentage}% of traffic, tag ${v.tag ?? 'none'}): the one for a rollback`);
		if (p.problems.length) {
			report(p.problems);
			return 1;
		}
		if (!scope.migrationsOnly && p.firstRelease) console.log('First release: no version published yet, Worker secrets cannot be checked before it.');
		console.log(p.pendingMigrations.length ? `Pending migrations: ${p.pendingMigrations.join(', ')}.` : 'No pending migrations: nothing to apply.');
		if (scope.migrationsOnly && !p.pendingMigrations.length) return 0;
		console.log(`Release preview OK for ${p.sha}${scope.migrationsOnly ? ' (migrations only)' : ` (Worker ${p.workerName} at ${p.productionUrl})`}.`);
		console.log(`Apply with: npm run release -- --apply ${p.confirmation}${only} --credentials ${credentialsFile}`);
		return 0;
	}
	const r = await apply(deps, env, values.apply!, scope);
	if (r.problems.length) {
		report(r.problems);
		if (r.versionId) console.error(`The deploy happened (version ${r.versionId}): roll back or fix forward (spec, section 8).`);
		return 1;
	}
	if (scope.migrationsOnly) {
		console.log(r.pendingMigrations.length ? `Migrations applied (${r.pendingMigrations.join(', ')}); no deploy.` : 'No pending migrations: nothing applied; no deploy.');
		return 0;
	}
	console.log(`Released version ${r.versionId} at ${r.url}; it answers, checks passed.`);
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
