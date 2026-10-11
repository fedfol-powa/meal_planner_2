import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';

const runWeeklyJob = vi.hoisted(() => vi.fn(async () => ({ generated: 0, failed: 0, abandoned: 0 })));
const runNightlyExport = vi.hoisted(() => vi.fn(async () => 'done' as const));
vi.mock('../src/menu/job.ts', () => ({ runWeeklyJob }));
vi.mock('../src/backup/export.ts', () => ({ runNightlyExport }));

const { dispatchScheduled, HOURLY_CRON, NIGHTLY_EXPORT_CRON } = await import('../src/scheduled.ts');
const env = { HYPERDRIVE: { connectionString: 'postgres://unused' } } as unknown as Env;
const time = new Date('2026-10-12T02:30:00Z');

describe('scheduled dispatch', () => {
	afterEach(() => vi.clearAllMocks());

	it('matches the crons and the bucket of wrangler.jsonc', async () => {
		const text = await readFile(join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8');
		const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
		expect(config.triggers.crons).toEqual([HOURLY_CRON, NIGHTLY_EXPORT_CRON]);
		expect(config.r2_buckets).toEqual([{ binding: 'BACKUPS', bucket_name: 'cosasimangia-backups', jurisdiction: 'eu' }]);
		expect(config.vars.BACKUP_KEY_ID).toBe('k1');
	});

	it('runs only the weekly job on the hourly cron', async () => {
		await dispatchScheduled(HOURLY_CRON, env, time);
		expect(runWeeklyJob).toHaveBeenCalledWith('postgres://unused', time);
		expect(runNightlyExport).not.toHaveBeenCalled();
	});

	it('runs only the export on the nightly cron', async () => {
		await dispatchScheduled(NIGHTLY_EXPORT_CRON, env, time);
		expect(runNightlyExport).toHaveBeenCalledWith(env, time);
		expect(runWeeklyJob).not.toHaveBeenCalled();
	});

	it('logs an unknown cron without throwing', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await dispatchScheduled('* * * * *', env, time);
		expect(JSON.parse(String(spy.mock.calls[0][0]))).toEqual({ event: 'scheduled_unknown_cron', cron: '* * * * *' });
		expect(runWeeklyJob).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
