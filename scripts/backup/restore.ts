/**
 * Nightly export tools (procedure in supabase/README.md, spec 2026-10-11-esportazione-r2).
 *
 *   node scripts/backup/restore.ts inspect <file> [--ref <ref>]
 *   node scripts/backup/restore.ts restore <file> [--dry-run] [--accept-unknown-migrations]
 *
 * Key from BACKUP_ENCRYPTION_KEY; destination from DATABASE_URL, password from PGPASSWORD.
 * Output never carries data: only outcome, reason, structural names and codes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { decodeExport, ExportFormatError, parseKeyList } from '../../server/src/backup/format.ts';
import { RestoreError, type RestoreResult, restoreExport } from '../../server/src/backup/restore.ts';
import { findMigrationsCommit } from './migrations-commit.ts';

class DryRun extends Error {}

/** A missing environment variable: its name is the whole message. */
class MissingVariable extends Error {
	constructor(name: string) {
		super(name);
		this.name = 'MissingVariable';
	}
}

const USAGE = 'usage: node scripts/backup/restore.ts inspect <file> [--ref <ref>] | restore <file> [--dry-run] [--accept-unknown-migrations]';

/** Outcome without data: error objects, messages and details of Postgres may quote values. */
function describeError(error: unknown): string {
	if (error instanceof RestoreError) return `refused: ${error.reason}${error.details.length > 0 ? ` (${error.details.join(', ')})` : ''}`;
	if (error instanceof ExportFormatError) return `refused: ${error.reason}`;
	if (error instanceof MissingVariable) return `failed: missing ${error.message}`;
	const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
		&& /^([0-9A-Z]{5}|E[A-Z]+)$/.test(error.code) ? ` ${error.code}` : '';
	return `failed: ${error instanceof Error ? error.name : 'unknown'}${code}`;
}

async function readExport(file: string): Promise<string> {
	const keyList = process.env.BACKUP_ENCRYPTION_KEY;
	if (!keyList) throw new MissingVariable('BACKUP_ENCRYPTION_KEY');
	return decodeExport(new Uint8Array(await readFile(file)), await parseKeyList(keyList));
}

async function inspect(file: string, ref: string): Promise<void> {
	const doc = JSON.parse(await readExport(file)) as { createdAt: string; workerVersion: string; migrations: string[] | null };
	console.log(`created at: ${doc.createdAt}`);
	console.log(`worker version: ${doc.workerVersion}`);
	if (!doc.migrations) {
		console.log('migrations: unknown');
		return;
	}
	console.log(`migrations: ${doc.migrations.length}, last ${doc.migrations.at(-1)}`);
	const commit = findMigrationsCommit(join(import.meta.dirname, '..', '..'), ref, doc.migrations);
	console.log(commit ? `commit: ${commit}` : `commit: none on ${ref} has exactly these migrations`);
}

async function restore(file: string, dryRun: boolean, acceptUnknownMigrations: boolean): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new MissingVariable('DATABASE_URL');
	const document = await readExport(file);
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		let result: RestoreResult | undefined;
		try {
			await sql.begin(async (tx) => {
				result = await restoreExport(tx, document, { acceptUnknownMigrations });
				if (dryRun) throw new DryRun();
			});
		} catch (error) {
			if (!(error instanceof DryRun)) throw error;
		}
		if (acceptUnknownMigrations) console.log('warning: migrations not compared');
		console.log(`${dryRun ? 'dry run passed, nothing written' : 'restored'}: ${result!.tables} tables, ${result!.rows} rows, ${result!.users} users, ${result!.identities} identities`);
	} finally {
		await sql.end().catch(() => {});
	}
}

const [command, file, ...flags] = process.argv.slice(2);
const refAt = flags.indexOf('--ref');
if (!file || (command !== 'inspect' && command !== 'restore')) {
	console.error(USAGE);
	process.exit(2);
}
try {
	if (command === 'inspect') await inspect(file, refAt >= 0 ? flags[refAt + 1] : 'origin/main');
	else await restore(file, flags.includes('--dry-run'), flags.includes('--accept-unknown-migrations'));
} catch (error) {
	console.error(describeError(error));
	process.exitCode = 1;
}
