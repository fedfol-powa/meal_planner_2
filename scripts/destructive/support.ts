// Helpers of the destructive tests (plan, Task 8): the real scripts/prod-sql.sh on the local stack, a
// bootstrap compiled like the production one, and the launch load. Only with CI or DESTRUCTIVE_TESTS=1:
// these tests empty schema app.
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type postgres from 'postgres';
import type { TestDatabase } from '../../server/test/support/db.ts';
import { loadAll, type LoadOptions } from '../import/load/run.ts';
import { checkTarget, describeEndpoint } from '../import/load/target.ts';
import { writeOriginFixture } from '../import/load/test-origin.ts';
import { operationFingerprint } from '../prod-sql-plan.ts';

export const enabled = Boolean(process.env.CI || process.env.DESTRUCTIVE_TESTS);
export const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
const run = promisify(execFile);

let credentials: string | null = null;
function credentialsFile() {
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

/** Runs the real script; --apply gets the confirmation of exactly these arguments. */
export async function sqlFile(file: string, mode: '--preview' | '--apply', sets: Record<string, string> = {}, options: { launch?: boolean; target?: 'local' | 'production' } = {}): Promise<ScriptResult> {
	const pairs = Object.entries(sets).map(([k, v]) => `${k}=${v}`);
	const args = [mode, file, ...(options.launch ? ['--launch'] : []), ...pairs.flatMap((p) => ['--set', p])];
	if (mode === '--apply') {
		const endpoint = describeEndpoint(checkTarget('POSTGRES_DATABASE_URL', databaseUrl, { role: 'postgres', target: 'local', ref: 'unused' }).endpoint);
		args.push('--confirm', operationFingerprint({ file: readFileSync(file, 'utf8'), fingerprintSql: readFileSync('supabase/scripts/app-fingerprint.sql', 'utf8'), launch: options.launch === true, sets: pairs, endpoint }));
	}
	const env = { ...process.env, PROD_CREDENTIALS: credentialsFile(), PROD_SQL_TARGET: options.target ?? 'local' };
	try {
		const { stdout, stderr } = await run('scripts/prod-sql.sh', args, { env, maxBuffer: 16 * 1024 * 1024 });
		return { code: 0, out: stdout + stderr };
	} catch (error) {
		const e = error as { code: number; stdout: string; stderr: string };
		return { code: typeof e.code === 'number' ? e.code : 1, out: (e.stdout ?? '') + (e.stderr ?? '') };
	}
}

/** The value under a column header in psql's aligned output. */
export function column(out: string, name: string): string | null {
	const match = new RegExp(`^\\s*${name}\\s*\\n-+\\s*\\n\\s*(\\S+)`, 'm').exec(out);
	return match ? match[1]! : null;
}

export async function fingerprint(): Promise<string> {
	const r = await sqlFile('supabase/scripts/show-fingerprint.sql', '--preview');
	const value = column(r.out, 'fingerprint');
	if (r.code !== 0 || !value) throw new Error(`show-fingerprint failed: ${r.out}`);
	return value;
}

/** Like before the launch: no family, no catalogue (the local seed and the other suites' rows go). */
export async function emptyApp(admin: postgres.Sql) {
	await admin`truncate app.families, app.recipes, app.ingredients, app.books cascade`;
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

/** A copy of bootstrap.sql compiled like the production one (fresh family uuid, a real user), applied with --launch. */
export async function bootstrap(db: TestDatabase): Promise<Bootstrap> {
	const { userId: curatorId } = await db.createUser();
	const familyId = crypto.randomUUID();
	const file = compiledBootstrap(familyId, `${curatorId}@test.local`);
	const r = await sqlFile(file, '--apply', {}, { launch: true });
	const baseline = column(r.out, 'launch_baseline');
	if (r.code !== 0 || !baseline) throw new Error(`bootstrap failed: ${r.out}`);
	return { familyId, curatorId, baseline, out: r.out };
}

export function compiledBootstrap(familyId: string, email: string): string {
	const text = readFileSync('supabase/scripts/bootstrap.sql', 'utf8')
		.replace("('00000000-0000-0000-0000-000000000000', 'Family name',", `('${familyId}', 'Famiglia di prova',`)
		.replace("('person@example.com', 'Name',", `('${email}', 'Federico',`);
	const file = join(mkdtempSync(join(tmpdir(), 'bootstrap-')), 'bootstrap.production.sql');
	writeFileSync(file, text);
	return file;
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
