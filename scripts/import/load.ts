// Production load of the recipe book and the family's data (detail spec, section 6).
// Usage: node scripts/import/load.ts --env-file <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--launch-from <baseline>] (--dry-run | --confirm <inputs>) [--local]
//        node scripts/import/load.ts --env-file <file> --check-connection [--local]
// The load reads POSTGRES_DATABASE_URL, --check-connection APP_SERVER_DATABASE_URL; neither is ever printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { originDir } from '../planner-data/origin.ts';
import { isValidIsoDate } from './family.ts';
import { inputsFingerprint } from './load/inputs-fingerprint.ts';
import { loadSummary, renderLoadReport } from './load/report.ts';
import { actAsJob, LoadRefused, loadAll, repositoryHead } from './load/run.ts';
import { checkTarget, connect, describeEndpoint, productionRef, TargetError } from './load/target.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASELINE = /^[0-9a-f]{32}$/;
export class UsageError extends Error {}
export interface LoadArgs { mode: 'load' | 'check'; envFile: string; today?: string; familyId?: string; curatorId?: string; launchFrom?: string; dryRun: boolean; confirm?: string; local: boolean }

export function parseLoadArgs(argv: string[]): LoadArgs {
	let values;
	try {
		({ values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
			'env-file': { type: 'string' }, today: { type: 'string' }, family: { type: 'string' }, curator: { type: 'string' },
			'dry-run': { type: 'boolean' }, confirm: { type: 'string' }, local: { type: 'boolean' }, 'check-connection': { type: 'boolean' },
			'launch-from': { type: 'string' },
		} }));
	} catch {
		throw new UsageError('unknown or malformed option');
	}
	if (!values['env-file']) throw new UsageError('--env-file <file> is required');
	const local = values.local === true;
	if (values['check-connection']) return { mode: 'check', envFile: values['env-file'], dryRun: true, local };
	if (!values.today || !isValidIsoDate(values.today)) throw new UsageError('--today <YYYY-MM-DD> is required');
	if (!values.family || !UUID.test(values.family)) throw new UsageError('--family <uuid> is required');
	if (!values.curator || !UUID.test(values.curator)) throw new UsageError('--curator must be the uuid of the curator (the UID column of Supabase Auth)');
	if (values['launch-from'] !== undefined && !BASELINE.test(values['launch-from'])) throw new UsageError('--launch-from takes the launch baseline written in the coordination log');
	if ((values['dry-run'] === true) === (values.confirm !== undefined)) throw new UsageError('give either --dry-run or --confirm <inputs>');
	return { mode: 'load', envFile: values['env-file'], today: values.today, familyId: values.family, curatorId: values.curator, launchFrom: values['launch-from'], dryRun: values['dry-run'] === true, confirm: values.confirm, local };
}

/** Our own refusals carry their reason; anything else only its name and code (a Postgres message may quote values). */
export function describeError(error: unknown): string {
	if (error instanceof UsageError || error instanceof TargetError || error instanceof LoadRefused) return `refused: ${error.message}`;
	const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^([0-9A-Z]{5}|E[A-Z]+)$/.test(error.code) ? ` ${error.code}` : '';
	return `failed: ${error instanceof Error ? error.name : 'unknown'}${code}`;
}

async function main() {
	const args = parseLoadArgs(process.argv.slice(2));
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const env = parseEnv(readFileSync(args.envFile, 'utf8'));
	// The load runs as postgres (it locks every table of app for a launch load); the check proves the
	// app_server credentials that Hyperdrive uses.
	const [variable, role] = args.mode === 'check' ? (['APP_SERVER_DATABASE_URL', 'app_server'] as const) : (['POSTGRES_DATABASE_URL', 'postgres'] as const);
	const checked = checkTarget(variable, env[variable], { role, target: args.local ? 'local' : 'production', ref: productionRef(root) });
	const where = describeEndpoint(checked.endpoint);
	let inputs = '';
	if (args.mode === 'load') {
		inputs = inputsFingerprint({ originDirectory: originDir(root), importDirectory: join(root, 'scripts/import'), head: repositoryHead(root), today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, launchFrom: args.launchFrom ?? null, endpoint: where });
		if (!args.dryRun && args.confirm !== inputs) throw new LoadRefused('inputs changed since the preview: run --dry-run again');
	}
	const sql = connect(checked);
	try {
		if (args.mode === 'check') {
			const [row] = await sql.begin(async (tx) => {
				await actAsJob(tx);
				return tx<{ families: number; recipes: number }[]>`select (select count(*)::int from app.families) as families, (select count(*)::int from app.recipes) as recipes`;
			});
			console.log(`${where}: ${row!.families} families, ${row!.recipes} recipes visible to app_job`);
			return;
		}
		const result = await loadAll(sql, { today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, root, dryRun: args.dryRun, launchFrom: args.launchFrom });
		const out = resolve(root, 'scripts/import/out');
		mkdirSync(out, { recursive: true });
		writeFileSync(resolve(out, 'load-report.md'), renderLoadReport(result, { endpoint: where, inputs }));
		console.log(loadSummary(result));
		if (args.dryRun) console.log(`Inputs ${inputs}. Load with: --confirm ${inputs}`);
		else if (result.baseline) console.log(`Launch baseline after the load: ${result.baseline} (write it in the coordination log; it replaces the previous one)`);
		else console.log('No launch baseline: not a launch load');
	} finally {
		await sql.end().catch(() => {});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		console.error(describeError(error));
		process.exitCode = 1;
	});
}
