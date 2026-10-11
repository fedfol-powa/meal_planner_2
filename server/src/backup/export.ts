import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { errorCode } from '../menu/generation.ts';
import { type BackupKey, EXPORT_FORMAT, encodeExport, importKey } from './format.ts';
import { estimateExportBytes, exportParts, readSnapshot } from './read.ts';

export const KEEP_EXPORTS = 7;
/** Largest document whose measured peak stays under 64 MB in workerd (spec, «Dimensioni, memoria e tempi»). */
export const EXPORT_LIMIT_BYTES = 8 * 1024 * 1024;
export const EXPORT_PREFIX = 'exports/';

export interface ExportDeps {
	sql: postgres.Sql;
	bucket: R2Bucket;
	key: BackupKey;
	keyId: string;
	workerVersion: string;
	limitBytes: number;
}

export type ExportOutcome = 'done' | 'skipped' | 'too_large' | 'failed';

class ExportTooLargeError extends Error {
	readonly estimatedBytes: number;
	constructor(estimatedBytes: number) {
		super('export too large');
		this.name = 'ExportTooLargeError';
		this.estimatedBytes = estimatedBytes;
	}
}

/** exports/2026-10-12T02-30Z.json.gz.enc: names sort in time order. */
export function exportKey(scheduled: Date): string {
	const iso = scheduled.toISOString();
	return `${EXPORT_PREFIX}${iso.slice(0, 10)}T${iso.slice(11, 13)}-${iso.slice(14, 16)}Z.json.gz.enc`;
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix, cursor });
		keys.push(...page.objects.map((o) => o.key));
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return keys;
}

/** One night: skip if done, check the size, snapshot, encrypt, write, keep the newest 7. Never throws. */
export async function runNightlyExportOn(deps: ExportDeps, scheduled: Date): Promise<ExportOutcome> {
	const started = Date.now();
	const key = exportKey(scheduled);
	let phase = 'list';
	let summary: Record<string, number> = {};
	try {
		const existing = await deps.bucket.list({ prefix: key.slice(0, EXPORT_PREFIX.length + 11), limit: 1 }); // exports/2026-10-12T
		if (existing.objects.length > 0) {
			logEvent('backup_export_skipped', { key: existing.objects[0].key });
			return 'skipped';
		}
		phase = 'read';
		const { estimatedBytes, snapshot } = await withDbOn(deps.sql, { kind: 'backup' }, async (tx) => {
			// Before any row reaches the Worker: memory is the limit (spec, section 3).
			const estimate = await estimateExportBytes(tx);
			if (estimate > deps.limitBytes) throw new ExportTooLargeError(estimate);
			return { estimatedBytes: estimate, snapshot: await readSnapshot(tx) };
		});
		if (estimatedBytes > deps.limitBytes / 2) logEvent('backup_export_near_limit', { key, estimatedBytes, limitBytes: deps.limitBytes }, 'error');
		phase = 'encode';
		const rows = snapshot.tables.reduce((sum, t) => sum + t.count, 0);
		const { blob, uncompressedBytes, storedBytes } = await encodeExport(exportParts(snapshot, new Date().toISOString(), deps.workerVersion), deps.key, deps.keyId);
		summary = { estimatedBytes, uncompressedBytes, storedBytes, tables: snapshot.tables.length, rows, users: snapshot.users };
		phase = 'put';
		await deps.bucket.put(key, blob, {
			customMetadata: {
				format: EXPORT_FORMAT,
				keyId: deps.keyId,
				createdAt: new Date().toISOString(),
				...Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
			},
		});
	} catch (error) {
		if (error instanceof ExportTooLargeError) {
			logEvent('backup_export_too_large', { key, estimatedBytes: error.estimatedBytes, limitBytes: deps.limitBytes }, 'error');
			return 'too_large';
		}
		logEvent('backup_export_failed', { key, phase, code: errorCode(error) }, 'error');
		return 'failed';
	}
	// Only after a successful write: a failed night never costs a good copy.
	let pruned = 0;
	try {
		const keys = (await listAll(deps.bucket, EXPORT_PREFIX)).sort();
		const old = keys.slice(0, Math.max(0, keys.length - KEEP_EXPORTS));
		if (old.length > 0) await deps.bucket.delete(old);
		pruned = old.length;
	} catch (error) {
		logEvent('backup_export_failed', { key, phase: 'prune', code: errorCode(error) }, 'error');
	}
	logEvent('backup_export_done', { key, ...summary, pruned, ms: Date.now() - started });
	return 'done';
}

export async function runNightlyExport(env: Env, scheduled: Date): Promise<ExportOutcome> {
	let key: BackupKey;
	try {
		if (!env.BACKUPS || !env.BACKUP_ENCRYPTION_KEY) throw new Error('missing');
		key = await importKey(env.BACKUP_ENCRYPTION_KEY);
	} catch {
		logEvent('backup_export_not_configured', {}, 'error');
		return 'failed';
	}
	const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await runNightlyExportOn(
			{ sql, bucket: env.BACKUPS, key, keyId: env.BACKUP_KEY_ID || 'k1', workerVersion: env.CF_VERSION_METADATA?.id ?? 'dev', limitBytes: EXPORT_LIMIT_BYTES },
			scheduled,
		);
	} finally {
		await sql.end().catch(() => {});
	}
}
