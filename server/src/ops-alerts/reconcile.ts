import { isJobOverdue } from '@app/domain/planner';
import type postgres from 'postgres';
import { exportDayPrefix } from '../backup/export.ts';
import { withDbOn } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { localIn } from '../menu/time.ts';
import { insertAlert } from './index.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
/** The second export attempt runs at 04:30 UTC: today counts from 05:00. */
const EXPORT_SECOND_ATTEMPT_DONE_HOUR = 5;
/** The resume reports a deletion as overdue from its third failed attempt. */
const OVERDUE_DELETION_ATTEMPTS = 3;

type Rule = 'abandoned' | 'overdue' | 'export' | 'deletions';

/** SQLSTATE or error name only: messages can carry data. */
function codeOf(error: unknown): string {
	const e = error as { code?: unknown; name?: unknown } | null;
	if (typeof e?.code === 'string') return e.code;
	return typeof e?.name === 'string' ? e.name : 'unknown';
}

/**
 * The hourly reconciliation (spec W15, section 5): every alert recoverable from the persisted states
 * of the last 7 days, finished ones included, so an alert lost to an interruption comes back even
 * when the work that raised it has since ended. The primary key of `app.ops_alerts` keeps out
 * duplicates. Each rule runs alone; never throws. Delivery is the caller's next step.
 */
export async function reconcileAlerts(sql: postgres.Sql, env: Pick<Env, 'BACKUPS'>, now: Date): Promise<void> {
	const rules: [Rule, () => Promise<void>][] = [
		['abandoned', () => abandonedJobs(sql, now)],
		['overdue', () => overdueJobs(sql, now)],
		['export', () => missingExports(sql, env.BACKUPS, now)],
		['deletions', () => overdueDeletions(sql)],
	];
	for (const [rule, run] of rules) {
		try {
			await run();
		} catch (error) {
			logEvent('ops_alert_reconcile_failed', { rule, code: codeOf(error) }, 'error');
		}
	}
}

/** 1. Jobs abandoned in the last 7 days. */
async function abandonedJobs(sql: postgres.Sql, now: Date): Promise<void> {
	const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
	const rows = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ familyId: string; weekStart: string; attempts: number }[]>`
		select family_id as "familyId", target_week::text as "weekStart", attempts from app.weekly_jobs
		where status = 'abandoned' and updated_at > ${since.toISOString()}::timestamptz and updated_at <= ${now.toISOString()}::timestamptz`);
	for (const { familyId, weekStart, attempts } of rows)
		await insertAlert(sql, { event: 'weekly_job_abandoned', key: `${familyId}:${weekStart}`, details: { familyId, weekStart, attempts } });
}

/**
 * 2. Jobs whose overdue threshold (Thursday 08:00 in the family's zone) passed in the last 7 days
 * and that were still open at it: pending, failed or abandoned, or done after the threshold. The
 * threshold is the domain's, read in each family's zone at `now`, a week before, and at `updated_at`.
 */
async function overdueJobs(sql: postgres.Sql, now: Date): Promise<void> {
	const weekAgo = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
	// Thresholds fall 4 days before the week: a generous range of weeks, filtered exactly below.
	const from = new Date(now.getTime() - 5 * DAY_MS).toISOString().slice(0, 10);
	const to = new Date(now.getTime() + 6 * DAY_MS).toISOString().slice(0, 10);
	const rows = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ familyId: string; weekStart: string; status: string; updatedAt: Date; timeZone: string }[]>`
		select j.family_id as "familyId", j.target_week::text as "weekStart", j.status, j.updated_at as "updatedAt", f.time_zone as "timeZone"
		from app.weekly_jobs j join app.families f on f.id = j.family_id
		where j.target_week between ${from}::date and ${to}::date and j.status in ('pending', 'failed', 'abandoned', 'done')`);
	for (const { familyId, weekStart, status, updatedAt, timeZone } of rows) {
		const overdueAt = (at: Date) => isJobOverdue(localIn(familyId, timeZone, at), weekStart);
		if (!overdueAt(now) || overdueAt(weekAgo)) continue;
		if (status === 'done' && !overdueAt(new Date(updatedAt))) continue;
		await insertAlert(sql, { event: 'weekly_job_overdue', key: `${familyId}:${weekStart}`, details: { familyId, weekStart } });
	}
}

/**
 * 3. UTC dates of the last 7 days whose second attempt has passed (earlier days; today from 05:00)
 * without an export in R2. The export keeps the newest 7, so the window matches.
 */
async function missingExports(sql: postgres.Sql, bucket: R2Bucket | undefined, now: Date): Promise<void> {
	for (let daysAgo = WINDOW_DAYS - 1; daysAgo >= 0; daysAgo--) {
		if (daysAgo === 0 && now.getUTCHours() < EXPORT_SECOND_ATTEMPT_DONE_HOUR) continue;
		const date = new Date(now.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);
		let reason: 'missing' | 'not_configured';
		if (!bucket) reason = 'not_configured';
		else if ((await bucket.list({ prefix: exportDayPrefix(date), limit: 1 })).objects.length > 0) continue;
		else reason = 'missing';
		await insertAlert(sql, { event: 'backup_export_missing', key: date, details: { reason } });
	}
}

/** 4. Deletions requested in the last 7 days with at least 3 failed attempts, completed or not. */
async function overdueDeletions(sql: postgres.Sql): Promise<void> {
	const rows = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ userId: string; attempts: number }[]>`
		select user_id as "userId", attempts from app.overdue_account_deletions(${OVERDUE_DELETION_ATTEMPTS}, ${`${WINDOW_DAYS} days`}::interval)`);
	for (const { userId, attempts } of rows)
		await insertAlert(sql, { event: 'account_deletion_overdue', key: userId, details: { userId, attempts } });
}
