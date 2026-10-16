import { catchUpTarget, isJobOverdue, isNextWeekDue, nextWeekStart } from '@app/domain/planner';
import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import { logEvent } from '../log.ts';
import { errorCode, generateWeek } from './generation.ts';
import { markAbandoned, markFailed } from './job-status.ts';
import { localIn } from './time.ts';

interface OpenJob {
	familyId: string;
	targetWeek: string;
	timeZone: string;
}

export interface WeeklyJobOptions {
	/** Only these families; tests use it, the hourly job serves them all. */
	families?: readonly string[];
}

/** The hourly job (spec section 4.2): dispatch new targets, then every open job, one at a time. */
export async function runWeeklyJobOn(sql: postgres.Sql, now: Date, options: WeeklyJobOptions = {}): Promise<{ generated: number; failed: number; abandoned: number }> {
	// As text: the server's connections do not fetch the array types.
	const families = options.families ? options.families.join(',') : null;
	const job = <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);

	// 1. New targets: families past their Wednesday 20:00 without next week.
	await job(async (tx) => {
		const rows = await tx<{ id: string; timeZone: string }[]>`
			select id, time_zone as "timeZone" from app.families where ${families}::text is null or id = any(string_to_array(${families}, ',')::uuid[])`;
		for (const family of rows) {
			const local = localIn(family.id, family.timeZone, now);
			if (!isNextWeekDue(local)) continue;
			const weekStart = nextWeekStart(local);
			const [week] = await tx`select 1 from app.weeks where family_id = ${family.id} and starts_on = ${weekStart}`;
			if (!week) await tx`insert into app.weekly_jobs (family_id, target_week) values (${family.id}, ${weekStart}) on conflict do nothing`;
		}
	});

	// 2. Open jobs, whatever their week.
	const open = await job((tx) => tx<OpenJob[]>`
		select j.family_id as "familyId", j.target_week::text as "targetWeek", f.time_zone as "timeZone"
		from app.weekly_jobs j join app.families f on f.id = j.family_id
		where j.status in ('pending', 'failed') and (${families}::text is null or j.family_id = any(string_to_array(${families}, ',')::uuid[]))
		order by j.target_week, j.family_id`);

	// 3. One job at a time, each in its own transactions. Nothing one job does, its status writes
	// included, stops the others: a job whose status could not be saved stays open for the next run.
	const result = { generated: 0, failed: 0, abandoned: 0 };
	for (const { familyId, targetWeek, timeZone } of open) {
		const local = localIn(familyId, timeZone, now);
		const target = catchUpTarget(local, targetWeek);
		if (!target) {
			try {
				const attempts = await markAbandoned(sql, familyId, targetWeek);
				logEvent('weekly_job_abandoned', { familyId, weekStart: targetWeek, attempts }, 'error');
				result.abandoned++;
			} catch (error) {
				logEvent('weekly_job_status_failed', { familyId, weekStart: targetWeek, status: 'abandoned', code: errorCode(error) }, 'error');
			}
			continue;
		}
		try {
			await job(async (tx) => {
				if (await generateWeek(tx, familyId, target)) result.generated++;
				await tx`update app.weekly_jobs set status = 'done', attempts = attempts + 1, error = null, updated_at = now()
					where family_id = ${familyId} and target_week = ${targetWeek}`;
			});
		} catch (error) {
			// The family was deleted after the selection: its job row went with it (spec W11, section 2).
			if (errorCode(error) === '23503') {
				logEvent('weekly_job_family_gone', { familyId, weekStart: targetWeek });
				continue;
			}
			result.failed++;
			const code = errorCode(error).slice(0, 500);
			try {
				const attempts = await markFailed(sql, familyId, targetWeek, code);
				logEvent('weekly_job_failed', { familyId, weekStart: targetWeek, attempts, code });
				if (isJobOverdue(local, targetWeek)) logEvent('weekly_job_overdue', { familyId, weekStart: targetWeek, attempts });
			} catch (saveError) {
				logEvent('weekly_job_status_failed', { familyId, weekStart: targetWeek, status: 'failed', code: errorCode(saveError) }, 'error');
			}
		}
	}
	return result;
}

export async function runWeeklyJob(connectionString: string, now: Date) {
	const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
	try {
		return await runWeeklyJobOn(sql, now);
	} finally {
		await sql.end().catch(() => {});
	}
}
