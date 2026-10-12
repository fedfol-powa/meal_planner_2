// Helpers of the destructive tests (plan, Task 8 and Task 10): the real scripts/prod-sql.ts on the local
// stack, the bootstrap with its --set values, and the launch load. Only with CI or DESTRUCTIVE_TESTS=1:
// these tests empty schema app. The Vitest config has already refused any TEST_DATABASE_URL that is not
// the local stack (scripts/test-support/local-database.ts).
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type postgres from 'postgres';
import type { TestDatabase } from '../../server/test/support/db.ts';
import { loadAll, type LoadOptions } from '../import/load/run.ts';
import { writeOriginFixture } from '../import/load/test-origin.ts';

export const enabled = Boolean(process.env.CI || process.env.DESTRUCTIVE_TESTS);
export const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
const run = promisify(execFile);

let credentials: string | null = null;
export function credentialsFile() {
	if (!credentials) {
		credentials = join(mkdtempSync(join(tmpdir(), 'prod-sql-creds-')), 'local.env');
		writeFileSync(credentials, `POSTGRES_DATABASE_URL=${databaseUrl}\n`);
	}
	return credentials;
}

export interface ScriptResult {
	code: number;
	out: string;
}

/** Runs the real command; --apply gets the confirmation that the preview of exactly these arguments prints. */
export async function serviceSql(name: string, mode: '--preview' | '--apply', sets: Record<string, string> = {}, options: { launch?: boolean; target?: 'local' | 'production' } = {}): Promise<ScriptResult> {
	const args = [name, ...(options.launch ? ['--launch'] : []), ...Object.entries(sets).flatMap(([k, v]) => ['--set', `${k}=${v}`]), '--credentials', credentialsFile()];
	const env = { ...process.env, PROD_SQL_TARGET: options.target ?? 'local' };
	const exec = async (argv: string[]): Promise<ScriptResult> => {
		try {
			const { stdout, stderr } = await run(process.execPath, ['scripts/prod-sql.ts', ...argv], { env, maxBuffer: 16 * 1024 * 1024 });
			return { code: 0, out: stdout + stderr };
		} catch (error) {
			const e = error as { code: number; stdout: string; stderr: string };
			return { code: typeof e.code === 'number' ? e.code : 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
		}
	};
	if (mode === '--preview') return exec(['--preview', ...args]);
	const preview = await exec(['--preview', ...args]);
	const confirm = /--confirm ([0-9a-f]{64})/.exec(preview.out)?.[1];
	// A preview that fails (refused baseline, …) fails the same way as the apply would.
	if (!confirm) return preview;
	return exec(['--apply', ...args, '--confirm', confirm]);
}

/** The value under a column header in psql's aligned output. */
export function column(out: string, name: string): string | null {
	const match = new RegExp(`^\\s*${name}\\s*\\n-+\\s*\\n\\s*(\\S+)`, 'm').exec(out);
	return match ? match[1]! : null;
}

export async function fingerprint(): Promise<string> {
	const r = await serviceSql('show-fingerprint', '--preview');
	const value = column(r.out, 'fingerprint');
	if (r.code !== 0 || !value) throw new Error(`show-fingerprint failed: ${r.out}`);
	return value;
}

/** The initial state of the launch (detail spec, section 8): every table of app empty but the four that
 * accounts and migrations fill (the local seed and the other suites' rows go). */
export async function emptyApp(admin: postgres.Sql) {
	const tables = await admin<{ name: string }[]>`
		select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' and c.relname not in ('profiles', 'profile_preferences', 'user_roles', 'catalogue_state')`;
	await admin.unsafe(`truncate ${tables.map((t) => `app.${t.name}`).join(', ')} cascade`);
}

/** Rows of every table of schema app, to prove that a refused script removed nothing. */
export async function rowCounts(admin: postgres.Sql): Promise<Record<string, number>> {
	const tables = await admin<{ name: string }[]>`
		select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'app' and c.relkind = 'r' order by c.relname`;
	const counts: Record<string, number> = {};
	for (const { name } of tables) counts[name] = (await admin.unsafe(`select count(*)::int as n from app.${name}`))[0]!.n as number;
	return counts;
}

export interface Bootstrap {
	familyId: string;
	curatorId: string;
	baseline: string;
	out: string;
}

/** The --set values of the bootstrap, like the production ones (fresh family uuid, a real user). */
export function bootstrapSets(familyId: string, email: string): Record<string, string> {
	return {
		family_id: familyId, family_name: 'Famiglia di prova', measurement_system: 'metric', time_zone: 'Europe/Rome',
		people: JSON.stringify([{ email, display_name: 'Federico', locale: 'it-IT', family_role: 'family_admin', global_roles: ['app_admin', 'recipe_curator'] }]),
	};
}

/** bootstrap.sql applied with --launch through the real command. */
export async function bootstrap(db: TestDatabase): Promise<Bootstrap> {
	const { userId: curatorId } = await db.createUser();
	const familyId = crypto.randomUUID();
	const r = await serviceSql('bootstrap', '--apply', bootstrapSets(familyId, `${curatorId}@test.local`), { launch: true });
	const baseline = column(r.out, 'launch_baseline');
	if (r.code !== 0 || !baseline) throw new Error(`bootstrap failed: ${r.out}`);
	return { familyId, curatorId, baseline, out: r.out };
}

export function loadOptions(b: Pick<Bootstrap, 'familyId' | 'curatorId'>, variant: { pendingReview?: boolean; missingInMenu?: boolean } = {}): LoadOptions {
	const origin = writeOriginFixture(variant);
	return { today: '2026-10-13', familyId: b.familyId, curatorId: b.curatorId, root: origin.dir, originDirectory: origin.dir, dryRun: false };
}

export interface Fixture extends Bootstrap {
	bootstrapBaseline: string;
	recipeId: string;
	ingredientId: string;
}

/** bootstrap() followed by the launch load: baseline is the load's, the last launch baseline. */
export async function fixture(db: TestDatabase, sql: postgres.Sql): Promise<Fixture> {
	const b = await bootstrap(db);
	const result = await loadAll(sql, { ...loadOptions(b), launchFrom: b.baseline });
	const [recipe] = await db.admin<{ id: string }[]>`select id from app.recipes where status = 'published' order by origin_slug limit 1`;
	const [ingredient] = await db.admin<{ id: string }[]>`
		select i.id from app.ingredients i join app.ingredient_unit_equivalences e on e.ingredient_id = i.id limit 1`;
	return { ...b, bootstrapBaseline: b.baseline, baseline: result.baseline!, recipeId: recipe!.id, ingredientId: ingredient!.id };
}
