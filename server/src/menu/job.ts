import { catchUpTarget, isJobOverdue, isNextWeekDue, nextWeekStart } from '@app/domain/planner';
import postgres from 'postgres';
import { withDbOn } from '../db.ts';
import { logEvent } from '../log.ts';
import { errorCode, generateWeek } from './generation.ts';
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

	// 3. One job at a time, each in its own transactions.
	const result = { generated: 0, failed: 0, abandoned: 0 };
	for (const { familyId, targetWeek, timeZone } of open) {
		const local = localIn(familyId, timeZone, now);
		const target = catchUpTarget(local, targetWeek);
		if (!target) {
			const [row] = await job((tx) => tx<{ attempts: number }[]>`
				update app.weekly_jobs set status = 'abandoned', updated_at = now()
				where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
			logEvent('weekly_job_abandoned', { familyId, weekStart: targetWeek, attempts: row?.attempts ?? null }, 'error');
			result.abandoned++;
			continue;
		}
		try {
			await job(async (tx) => {
				if (await generateWeek(tx, familyId, target)) result.generated++;
				await tx`update app.weekly_jobs set status = 'done', attempts = attempts + 1, error = null, updated_at = now()
					where family_id = ${familyId} and target_week = ${targetWeek}`;
			});
		} catch (error) {
			result.failed++;
			const code = errorCode(error).slice(0, 500);
			const [row] = await job((tx) => tx<{ attempts: number }[]>`
				update app.weekly_jobs set status = 'failed', attempts = attempts + 1, error = ${code}, updated_at = now()
				where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
			const attempts = row?.attempts ?? null;
			logEvent('weekly_job_failed', { familyId, weekStart: targetWeek, attempts, code });
			if (isJobOverdue(local, targetWeek)) logEvent('weekly_job_overdue', { familyId, weekStart: targetWeek, attempts });
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
