import { runNightlyExport } from './backup/export.ts';
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
		case HOURLY_CRON:
			await runWeeklyJob(env.HYPERDRIVE.connectionString, time);
			return;
		case NIGHTLY_EXPORT_CRON:
			await runNightlyExport(env, time);
			return;
		default:
			logEvent('scheduled_unknown_cron', { cron }, 'error');
	}
}
