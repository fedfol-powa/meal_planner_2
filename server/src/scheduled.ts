import { resumeAccountDeletions } from './account/resume.ts';
import { runNightlyExport } from './backup/export.ts';
import { diagnosticOf } from './errors.ts';
import type { Env } from './env.ts';
import { logEvent } from './log.ts';
import { runWeeklyJob } from './menu/job.ts';

/** Must match `triggers.crons` of wrangler.jsonc character for character. */
export const HOURLY_CRON = '0 * * * *';
/** 02:30 UTC, and 04:30 UTC as a second attempt when the night has no export yet. */
export const NIGHTLY_EXPORT_CRON = '30 2,4 * * *';

/** Each cron gets its own invocation and limits: a slow export never delays the menus. */
export async function dispatchScheduled(cron: string, env: Env, time: Date): Promise<void> {
	switch (cron) {
		case HOURLY_CRON: {
			// Two independent parts: a failure of one never skips the other, and still fails the run.
			const failures: unknown[] = [];
			await runWeeklyJob(env.HYPERDRIVE.connectionString, time).catch((error: unknown) => {
				logEvent('weekly_job_crashed', { ...diagnosticOf(error) }, 'error');
				failures.push(error);
			});
			await resumeAccountDeletions(env, time).catch((error: unknown) => {
				logEvent('account_deletion_resume_crashed', { ...diagnosticOf(error) }, 'error');
				failures.push(error);
			});
			if (failures.length > 0) throw failures[0];
			return;
		}
		case NIGHTLY_EXPORT_CRON:
			await runNightlyExport(env, time);
			return;
		default:
			logEvent('scheduled_unknown_cron', { cron }, 'error');
	}
}
