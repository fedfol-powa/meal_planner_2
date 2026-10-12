import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import type { Tx } from '../../../server/src/db.ts';
import type { Actor } from '../../../server/src/catalogue/write.ts';
import { lockFamilyWeeks } from '../../../server/src/menu/generation.ts';
import { originDir, readOriginRecipes } from '../../planner-data/origin.ts';
import { runImport } from '../import-recipes.ts';
import { readInputs } from '../inputs.ts';
import { existingCatalogue, loadCatalogue, type CatalogueResult } from './catalogue.ts';
import { loadFamily, type FamilyResult } from './family.ts';
import { readOriginMenus } from './menus.ts';

// The production load as one transaction (detail spec, section 6): all or nothing, and the dry run is
// the same code ending in a rollback, so the preview counts are the real ones.
export interface LoadOptions { today: string; familyId: string; curatorId: string; root: string; originDirectory?: string; dryRun: boolean; launchFrom?: string }
export interface LoadResult { mode: 'dry-run' | 'written'; catalogue: CatalogueResult; family: FamilyResult; importReport: string; baseline: string | null }

export const FINGERPRINT_SQL = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/scripts/app-fingerprint.sql'), 'utf8');

async function fingerprintNow(tx: Tx) {
	const [row] = await tx<{ f: string }[]>`select pg_temp.app_fingerprint() as f`;
	return row!.f;
}

/** Which step failed (detail spec, section 6). The message of our own plain errors is kept (slugs and
 * reasons); Postgres and domain errors keep only name and codes, printed by describeError. */
export const ownMessage = (error: unknown) => (error instanceof Error && error.constructor === Error && error.name === 'Error' ? error.message : null);
export class LoadStepError extends Error {
	step: string;
	constructor(step: string, cause: unknown) {
		const own = ownMessage(cause);
		super(own ? `failed at ${step}: ${own}` : `failed at ${step}`, { cause });
		this.name = 'LoadStepError';
		this.step = step;
	}
}

export class LoadRefused extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'LoadRefused';
	}
}

/** Carries the result out of the transaction it rolls back (no parameter property: erasable syntax only). */
class DryRun extends Error {
	result: LoadResult;
	constructor(result: LoadResult) {
		super('dry run');
		this.result = result;
	}
}

export async function actAsCurator(tx: Tx, curatorId: string) {
	const claims = { sub: curatorId, role: 'authenticated', session_id: randomUUID(), exp: Math.floor(Date.now() / 1000) + 3600 };
	await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
	await tx`set local role authenticated`;
}
export async function actAsJob(tx: Tx) {
	await tx`reset role`;
	await tx`set local role app_job`;
}

async function checkCurator(tx: Tx, familyId: string, curatorId: string) {
	const [row] = await tx<{ curator: boolean; admin: boolean }[]>`
		select app.has_role('recipe_curator') as curator, app.is_family_admin(${familyId}) as admin`;
	if (!row?.curator) throw new LoadRefused(`User ${curatorId} is not a recipe curator`);
	if (!row.admin) throw new LoadRefused(`User ${curatorId} is not an admin of family ${familyId}`);
}

export async function loadAll(sql: postgres.Sql, options: LoadOptions): Promise<LoadResult> {
	const actor: Actor = { userId: options.curatorId, channel: 'import' };
	const origin = options.originDirectory ?? originDir(options.root);
	let step = 'inputs';
	const at = <T>(name: string, fn: () => Promise<T>) => {
		step = name;
		return fn();
	};
	// Everything that reads files is parsed before the transaction opens: waiting for the locks leaves no
	// file to read (review of PR #34, finding 5). Only the import itself needs the catalogue in the
	// database; it reads the same snapshot.
	const inputs = readInputs(join(options.root, 'scripts/import'));
	const originRecipes = readOriginRecipes(origin);
	const menus = readOriginMenus(origin);
	try {
		return (await sql.begin(async (tx) => {
			if (options.launchFrom !== undefined) {
				// Launch load (detail spec, section 8): every table of app locked before anything else, so a
				// concurrent write waits for the commit and the baseline below holds only bootstrap and load.
				step = 'launch baseline';
				await tx.unsafe(FINGERPRINT_SQL);
				await tx`select pg_temp.lock_app_tables('exclusive')`;
				if ((await fingerprintNow(tx)) !== options.launchFrom) throw new LoadRefused('app data changed since the launch baseline: no launch load');
			}
			step = 'curator';
			await actAsCurator(tx, options.curatorId);
			await checkCurator(tx, options.familyId, options.curatorId);
			// Same lock as the generation, then the family row: a generation or a settings write waits
			// for the commit, and nothing the checks below read can change before the writes.
			step = 'locks';
			await lockFamilyWeeks(tx, options.familyId);
			const [family] = await tx<{ settings: unknown }[]>`select settings from app.families where id = ${options.familyId} for update`;
			if (!family) throw new LoadRefused(`Family ${options.familyId} is not readable`);
			step = 'import';
			const existingFile = join(mkdtempSync(join(tmpdir(), 'load-existing-')), 'existing.json');
			writeFileSync(existingFile, JSON.stringify(await existingCatalogue(tx)));
			const { result: imported, files } = runImport({ root: options.root, originDirectory: origin, existingFile, today: options.today });
			const catalogue = await loadCatalogue(tx, actor, imported.bundle, inputs.equivalences, (s) => {
				step = s;
			});
			catalogue.recipes.present += imported.skipped.length;
			const familyResult = await at('family data', () => loadFamily(tx, {
				familyId: options.familyId, curatorId: options.curatorId, storedSettings: family.settings,
				origin: originRecipes, today: options.today, menus,
			}));
			let baseline: string | null = null;
			if (options.launchFrom !== undefined && !options.dryRun) {
				step = 'launch baseline';
				await tx`reset role`; // back to postgres, which reads every row
				baseline = await fingerprintNow(tx);
			}
			const result: LoadResult = { mode: options.dryRun ? 'dry-run' : 'written', catalogue, family: familyResult, importReport: files['report.md']!, baseline };
			if (options.dryRun) throw new DryRun(result);
			step = 'commit';
			return result;
		})) as LoadResult;
	} catch (error) {
		if (error instanceof DryRun) return error.result;
		if (error instanceof LoadRefused) throw error;
		throw new LoadStepError(step, error);
	}
}

export const repositoryHead = (root: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
