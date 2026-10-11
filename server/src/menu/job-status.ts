import type postgres from 'postgres';
import { withDbOn } from '../db.ts';

/** The status writes of the weekly job, each in its own app_job transaction; returns the attempts. */
export async function markAbandoned(sql: postgres.Sql, familyId: string, targetWeek: string): Promise<number | null> {
	const [row] = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ attempts: number }[]>`
		update app.weekly_jobs set status = 'abandoned', updated_at = now()
		where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
	return row?.attempts ?? null;
}

export async function markFailed(sql: postgres.Sql, familyId: string, targetWeek: string, code: string): Promise<number | null> {
	const [row] = await withDbOn(sql, { kind: 'job' }, (tx) => tx<{ attempts: number }[]>`
		update app.weekly_jobs set status = 'failed', attempts = attempts + 1, error = ${code}, updated_at = now()
		where family_id = ${familyId} and target_week = ${targetWeek} returning attempts`);
	return row?.attempts ?? null;
}
