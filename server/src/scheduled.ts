import postgres from 'postgres';
import { resumeAccountDeletions } from './account/resume.ts';
import { runNightlyExport } from './backup/export.ts';
import { withDbOn } from './db.ts';
import { diagnosticOf } from './errors.ts';
import type { Env } from './env.ts';
import { logEvent } from './log.ts';
import { runWeeklyJob } from './menu/job.ts';
import { deliverAlerts } from './ops-alerts/index.ts';
import { reconcileAlerts } from './ops-alerts/reconcile.ts';

/** Must match `triggers.crons` of wrangler.jsonc character for character. */
export const HOURLY_CRON = '0 * * * *';
/** 02:30 UTC, and 04:30 UTC as a second attempt when the night has no export yet. */
export const NIGHTLY_EXPORT_CRON = '30 2,4 * * *';

/** Each cron gets its own invocation and limits: a slow export never delays the menus. */
export async function dispatchScheduled(cron: string, env: Env, time: Date): Promise<void> {
	switch (cron) {
		case HOURLY_CRON: {
			// Independent parts: a failure of one never skips the others. Job and resume still fail the
			// run; the alert steps after them (spec W15, section 5) only log.
			const failures: unknown[] = [];
			await runWeeklyJob(env.HYPERDRIVE.connectionString, time, { env }).catch((error: unknown) => {
				logEvent('weekly_job_crashed', { ...diagnosticOf(error) }, 'error');
				failures.push(error);
			});
			await resumeAccountDeletions(env, time).catch((error: unknown) => {
				logEvent('account_deletion_resume_crashed', { ...diagnosticOf(error) }, 'error');
				failures.push(error);
			});
			await runAlertSteps(env, time);
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

/** Reconciliation, delivery and the pruning of the password emails, each in its own try. */
async function runAlertSteps(env: Env, time: Date): Promise<void> {
	const sql = postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		await reconcileAlerts(sql, env, time).catch((error: unknown) => logEvent('ops_alert_reconcile_crashed', { ...diagnosticOf(error) }, 'error'));
		await deliverAlerts(sql, env).catch((error: unknown) => logEvent('ops_alert_delivery_crashed', { ...diagnosticOf(error) }, 'error'));
		try {
			const [row] = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ prune_password_emails: number }[]>`select app.prune_password_emails()`);
			if (row && row.prune_password_emails > 0) logEvent('password_emails_pruned', { count: row.prune_password_emails });
		} catch (error) {
			logEvent('password_emails_prune_failed', { ...diagnosticOf(error) }, 'error');
		}
	} finally {
		await sql.end().catch(() => {});
	}
}
