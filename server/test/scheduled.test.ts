import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.ts';

/** The steps of the hourly run, in the order they ran. */
const steps = vi.hoisted(() => [] as string[]);
const runWeeklyJob = vi.hoisted(() => vi.fn(async () => (steps.push('job'), { generated: 0, failed: 0, abandoned: 0 })));
const runNightlyExport = vi.hoisted(() => vi.fn(async () => 'done' as const));
const resumeAccountDeletions = vi.hoisted(() => vi.fn(async () => void steps.push('resume')));
const reconcileAlerts = vi.hoisted(() => vi.fn(async () => void steps.push('reconcile')));
const deliverAlerts = vi.hoisted(() => vi.fn(async () => void steps.push('deliver')));
/** The database of the alert steps: each transaction records its statement. */
const fakeSql = vi.hoisted(() => ({ end: vi.fn(async () => {}) }));
const withDbOn = vi.hoisted(() =>
	vi.fn(async (_sql: unknown, identity: { kind: string }, fn: (tx: unknown) => Promise<unknown>) =>
		fn((strings: TemplateStringsArray) => (steps.push(`${identity.kind}: ${strings.join('?').trim()}`), Promise.resolve([{ prune_password_emails: 0 }])))),
);
const connect = vi.hoisted(() => vi.fn(() => fakeSql));
vi.mock('postgres', () => ({ default: connect }));
vi.mock('../src/db.ts', () => ({ withDbOn }));
vi.mock('../src/account/resume.ts', () => ({ resumeAccountDeletions }));
vi.mock('../src/menu/job.ts', () => ({ runWeeklyJob }));
vi.mock('../src/backup/export.ts', () => ({ runNightlyExport }));
vi.mock('../src/ops-alerts/reconcile.ts', () => ({ reconcileAlerts }));
vi.mock('../src/ops-alerts/index.ts', () => ({ deliverAlerts }));

const { dispatchScheduled, HOURLY_CRON, NIGHTLY_EXPORT_CRON } = await import('../src/scheduled.ts');
const env = { HYPERDRIVE: { connectionString: 'postgres://unused' } } as unknown as Env;
const time = new Date('2026-10-12T02:30:00Z');

describe('scheduled dispatch', () => {
	afterEach(() => {
		vi.clearAllMocks();
		steps.length = 0;
	});

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

	it('the hourly cron runs job, resume, reconciliation, delivery and the password-email pruning, in order, not the export', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await dispatchScheduled(HOURLY_CRON, env, time);
		expect(steps).toEqual(['job', 'resume', 'reconcile', 'deliver', 'job: select app.prune_password_emails()']);
		expect(runWeeklyJob).toHaveBeenCalledWith('postgres://unused', time, { env });
		expect(resumeAccountDeletions).toHaveBeenCalledWith(env, time);
		expect(connect).toHaveBeenCalledWith('postgres://unused', expect.objectContaining({ max: 1, fetch_types: false }));
		expect(reconcileAlerts).toHaveBeenCalledWith(fakeSql, env, time);
		expect(deliverAlerts).toHaveBeenCalledWith(fakeSql, env);
		expect(fakeSql.end).toHaveBeenCalled();
		expect(runNightlyExport).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('the alert steps run after a failing job or resume, and their own failures only log', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		runWeeklyJob.mockRejectedValueOnce(new Error('down'));
		resumeAccountDeletions.mockRejectedValueOnce(new Error('auth down'));
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).rejects.toThrow('down');
		expect(steps).toEqual(['reconcile', 'deliver', 'job: select app.prune_password_emails()']);
		steps.length = 0;
		errors.mockClear();
		reconcileAlerts.mockRejectedValueOnce(new Error('x'));
		deliverAlerts.mockRejectedValueOnce(new Error('y'));
		withDbOn.mockRejectedValueOnce(Object.assign(new Error('z'), { code: '57P01' }));
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).resolves.toBeUndefined();
		expect(steps).toEqual(['job', 'resume']);
		expect(errors.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toEqual(['ops_alert_reconcile_crashed', 'ops_alert_delivery_crashed', 'password_emails_prune_failed']);
		vi.restoreAllMocks();
	});

	it('a synchronous throw of the alert steps is logged and never hides the job failure', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		runWeeklyJob.mockRejectedValueOnce(new Error('down'));
		connect.mockImplementationOnce(() => {
			throw new Error('bad connection string');
		});
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).rejects.toThrow('down');
		expect(errors.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toEqual(['weekly_job_crashed', 'ops_alert_steps_crashed']);
		connect.mockImplementationOnce(() => {
			throw new Error('bad connection string');
		});
		await expect(dispatchScheduled(HOURLY_CRON, env, time)).resolves.toBeUndefined();
		vi.restoreAllMocks();
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
		expect(deliverAlerts).toHaveBeenCalledTimes(2);
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
