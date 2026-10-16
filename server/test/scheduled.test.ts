import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';

const runWeeklyJob = vi.hoisted(() => vi.fn(async () => ({ generated: 0, failed: 0, abandoned: 0 })));
const runNightlyExport = vi.hoisted(() => vi.fn(async () => 'done' as const));
const resumeAccountDeletions = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../src/account/resume.ts', () => ({ resumeAccountDeletions }));
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
		expect(config.r2_buckets).toEqual([
			{ binding: 'BACKUPS', bucket_name: 'cosasimangia-backups', jurisdiction: 'eu' },
			// Recipe photos (W12): never touched by the export or a cron.
			{ binding: 'PHOTOS', bucket_name: 'cosasimangia-photos', jurisdiction: 'eu' },
		]);
		expect(config.images).toEqual({ binding: 'IMAGES' });
		expect(config.ratelimits).toContainEqual({ name: 'PHOTO_READ_LIMIT', namespace_id: '9103', simple: { limit: 300, period: 60 } });
		expect(config.vars.BACKUP_KEY_ID).toBe('k1');
	});

	it('the hourly cron runs the weekly job and the resume of account deletions, not the export', async () => {
		await dispatchScheduled(HOURLY_CRON, env, time);
		expect(runWeeklyJob).toHaveBeenCalledWith('postgres://unused', time);
		expect(resumeAccountDeletions).toHaveBeenCalledWith(env, time);
		expect(runNightlyExport).not.toHaveBeenCalled();
	});

	it('a failure in one does not stop the other, and the failure still reaches the Worker', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		runWeeklyJob.mockRejectedValueOnce(Object.assign(new Error('down'), { code: '57P01' }));
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).rejects.toThrow('down');
		expect(resumeAccountDeletions).toHaveBeenCalled();
		resumeAccountDeletions.mockRejectedValueOnce(new Error('auth down'));
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).rejects.toThrow('auth down');
		expect(runWeeklyJob).toHaveBeenCalledTimes(2);
		expect(spy.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toEqual(['weekly_job_crashed', 'account_deletion_resume_crashed']);
		spy.mockRestore();
	});

	it('runs only the export on the nightly cron', async () => {
		await dispatchScheduled(NIGHTLY_EXPORT_CRON, env, time);
		expect(runNightlyExport).toHaveBeenCalledWith(env, time);
		expect(runWeeklyJob).not.toHaveBeenCalled();
		expect(resumeAccountDeletions).not.toHaveBeenCalled();
	});

	it('logs an unknown cron without throwing', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await dispatchScheduled('* * * * *', env, time);
		expect(JSON.parse(String(spy.mock.calls[0][0]))).toEqual({ event: 'scheduled_unknown_cron', cron: '* * * * *' });
		expect(runWeeklyJob).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
