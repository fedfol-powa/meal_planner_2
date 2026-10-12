// Production load of the recipe book and the family's data (detail spec, section 6).
// Usage: node scripts/import/load.ts --credentials <file> --today <YYYY-MM-DD> --family <uuid> --curator <uuid> [--launch-from <baseline>] (--dry-run | --confirm <inputs>) [--local]
//        node scripts/import/load.ts --credentials <file> --check-connection [--local]
// The load reads POSTGRES_DATABASE_URL, --check-connection APP_SERVER_DATABASE_URL; neither is ever printed.
// Exit codes: 0 done, 1 refused or failed (nothing written), 3 written but the report could not be written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { originDir } from '../planner-data/origin.ts';
import { isValidIsoDate } from './family.ts';
import { inputsFingerprint, snapshotInputs } from './load/inputs-fingerprint.ts';
import { loadSummary, renderLoadReport } from './load/report.ts';
import { actAsJob, LoadRefused, loadAll, LoadStepError, ownMessage, repositoryHead, type LoadResult } from './load/run.ts';
import { checkTarget, connect, describeEndpoint, productionRef, TargetError } from './load/target.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASELINE = /^[0-9a-f]{32}$/;
export class UsageError extends Error {}
export interface LoadArgs { mode: 'load' | 'check'; credentials: string; today?: string; familyId?: string; curatorId?: string; launchFrom?: string; dryRun: boolean; confirm?: string; local: boolean }

export function parseLoadArgs(argv: string[]): LoadArgs {
	let values;
	try {
		({ values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
			credentials: { type: 'string' }, today: { type: 'string' }, family: { type: 'string' }, curator: { type: 'string' },
			'dry-run': { type: 'boolean' }, confirm: { type: 'string' }, local: { type: 'boolean' }, 'check-connection': { type: 'boolean' },
			'launch-from': { type: 'string' },
		} }));
	} catch {
		throw new UsageError(argv.includes('--env-file') ? 'the credentials file is given with --credentials <file> (--env-file is an option of Node)' : 'unknown or malformed option');
	}
	if (!values.credentials) throw new UsageError('--credentials <file> is required');
	const local = values.local === true;
	if (values['check-connection']) return { mode: 'check', credentials: values.credentials, dryRun: true, local };
	if (!values.today || !isValidIsoDate(values.today)) throw new UsageError('--today <YYYY-MM-DD> is required');
	if (!values.family || !UUID.test(values.family)) throw new UsageError('--family <uuid> is required');
	if (!values.curator || !UUID.test(values.curator)) throw new UsageError('--curator must be the uuid of the curator (the UID column of Supabase Auth)');
	if (values['launch-from'] !== undefined && !BASELINE.test(values['launch-from'])) throw new UsageError('--launch-from takes the launch baseline written in the coordination log');
	if ((values['dry-run'] === true) === (values.confirm !== undefined)) throw new UsageError('give either --dry-run or --confirm <inputs>');
	return { mode: 'load', credentials: values.credentials, today: values.today, familyId: values.family, curatorId: values.curator, launchFrom: values['launch-from'], dryRun: values['dry-run'] === true, confirm: values.confirm, local };
}

const pgCode = (error: unknown) =>
	error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^([0-9A-Z]{5}|E[A-Z]+)$/.test(error.code) ? ` ${error.code}` : '';
/** A domain error of the curators' module: its code and the paths and codes of its issues, no value. */
function domainCodes(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string' || !/^[a-z_]+$/.test(error.code)) return null;
	const issues = (error as { data?: { issues?: { path?: unknown[]; code?: unknown }[] } }).data?.issues ?? [];
	const listed = issues.map((i) => `${(i.path ?? []).join('.')} ${String(i.code)}`).join(', ');
	return listed ? `${error.code} (${listed})` : error.code;
}

/** Our own refusals carry their reason; anything else the step, its name and codes (a Postgres message may quote values). */
export function describeError(error: unknown): string {
	if (error instanceof UsageError || error instanceof TargetError || error instanceof LoadRefused) return `refused: ${error.message}`;
	if (error instanceof LoadStepError) {
		const cause = error.cause;
		const own = ownMessage(cause);
		const what = own ?? domainCodes(cause) ?? `${cause instanceof Error ? cause.name : 'unknown'}${pgCode(cause)}`;
		return `failed at ${error.step}: ${what}`;
	}
	return `failed: ${error instanceof Error ? error.name : 'unknown'}${pgCode(error)}`;
}

/** After the commit: the new launch baseline first, then the report, an accessory step (review of PR #34, finding 9). */
export function finishLoad(result: LoadResult, header: { endpoint: string; inputs: string; dryRun: boolean }, deps: { log: (line: string) => void; writeReport: (text: string) => void }): number {
	if (!header.dryRun)
		deps.log(result.baseline
			? `Committed. Launch baseline after the load: ${result.baseline} (write it in the coordination log; it replaces the previous one)`
			: 'Committed. No launch baseline: not a launch load');
	deps.log(loadSummary(result));
	if (header.dryRun) deps.log(`Inputs ${header.inputs}. Load with: --confirm ${header.inputs}`);
	try {
		deps.writeReport(renderLoadReport(result, { endpoint: header.endpoint, inputs: header.inputs }));
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : error instanceof Error ? error.name : 'unknown';
		if (header.dryRun) throw error;
		deps.log(`data written, launch baseline B1 = ${result.baseline ?? 'none (not a launch load)'}; the report could not be written: ${code}`);
		return 3;
	}
	return 0;
}

export function assertCleanCheckout(root: string): void {
	if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '')
		throw new LoadRefused('the checkout is not clean: commit or remove the local changes first');
}

async function main(): Promise<number> {
	const args = parseLoadArgs(process.argv.slice(2));
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const env = parseEnv(readFileSync(args.credentials, 'utf8'));
	// The load runs as postgres (it locks every table of app for a launch load); the check proves the
	// app_server credentials that Hyperdrive uses.
	const [variable, role] = args.mode === 'check' ? (['APP_SERVER_DATABASE_URL', 'app_server'] as const) : (['POSTGRES_DATABASE_URL', 'postgres'] as const);
	const checked = checkTarget(variable, env[variable], { role, target: args.local ? 'local' : 'production', ref: productionRef(root) });
	const where = describeEndpoint(checked.endpoint);
	let inputs = '';
	let snapshot: ReturnType<typeof snapshotInputs> | null = null;
	if (args.mode === 'load') {
		// The code is the commit: with the production target a local change refuses (finding 5).
		if (!args.local) assertCleanCheckout(root);
		snapshot = snapshotInputs(originDir(root), join(root, 'scripts/import'));
		inputs = inputsFingerprint(snapshot.files, { head: repositoryHead(root), today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, launchFrom: args.launchFrom ?? null, endpoint: where });
		if (!args.dryRun && args.confirm !== inputs) {
			snapshot.dispose();
			throw new LoadRefused('inputs changed since the preview: run --dry-run again');
		}
	}
	const sql = connect(checked);
	try {
		if (args.mode === 'check') {
			const [row] = await sql.begin(async (tx) => {
				await actAsJob(tx);
				return tx<{ families: number; recipes: number }[]>`select (select count(*)::int from app.families) as families, (select count(*)::int from app.recipes) as recipes`;
			});
			console.log(`${where}: ${row!.families} families, ${row!.recipes} recipes visible to app_job`);
			return 0;
		}
		// Only the snapshot: root and origin of the load are its copies.
		const result = await loadAll(sql, { today: args.today!, familyId: args.familyId!, curatorId: args.curatorId!, root: snapshot!.root, originDirectory: snapshot!.origin, dryRun: args.dryRun, launchFrom: args.launchFrom });
		return finishLoad(result, { endpoint: where, inputs, dryRun: args.dryRun }, {
			log: (line) => console.log(line),
			writeReport: (text) => {
				const out = resolve(root, 'scripts/import/out');
				mkdirSync(out, { recursive: true });
				writeFileSync(resolve(out, 'load-report.md'), text);
			},
		});
	} finally {
		snapshot?.dispose();
		await sql.end().catch(() => {});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			console.error(describeError(error));
			process.exitCode = 1;
		},
	);
}
