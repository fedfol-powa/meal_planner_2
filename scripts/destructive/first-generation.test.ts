// The first week of the app made by the Wednesday cron (detail spec, section 5, «Evidenza della prima
// generazione»; review of PR #34, finding 10), with the real job, the real lazy generation and the real
// check-first-generation through prod-sql.ts. The job creates the week and marks itself done in one
// transaction, so weeks.generated_at equals weekly_jobs.updated_at only when that transaction made the
// week. The database clock is today's: after each real flow the test moves both instants by the same
// interval to the evening it simulates, keeping their difference.
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withDbOn } from '../../server/src/db.ts';
import { ensureWeeks } from '../../server/src/menu/generation.ts';
import { runWeeklyJobOn } from '../../server/src/menu/job.ts';
import { setupDatabase, type TestDatabase } from '../../server/test/support/db.ts';
import { databaseUrl, emptyApp, enabled, fixture, serviceSql, type Fixture } from './support.ts';

const NEXT = '2026-10-19';
const WEDNESDAY_EVENING = new Date('2026-10-14T18:30:00Z'); // 20:30 in Rome, after the 20:00 due time

describe.skipIf(!enabled)('first generation by the cron', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let server: postgres.Sql;
	let f: Fixture;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(databaseUrl, { max: 1, fetch_types: false, onnotice: () => {} });
		server = postgres(db.appServerUrl, { max: 1, fetch_types: false, onnotice: () => {} });
	});
	beforeEach(async () => {
		await emptyApp(db.admin);
		f = await fixture(db, sql);
	});
	afterAll(async () => {
		await server?.end();
		await sql?.end();
		await db?.close();
	});

	/** Moves the job's instant to `at` and the week's by the same interval. */
	async function moveTo(at: string) {
		const [job] = await db.admin<{ updated: Date }[]>`select updated_at as updated from app.weekly_jobs where family_id = ${f.familyId} and target_week = ${NEXT}`;
		const base = job ? job.updated : (await db.admin<{ g: Date }[]>`select generated_at as g from app.weeks where family_id = ${f.familyId} and starts_on = ${NEXT}`)[0]!.g;
		const shift = `${(new Date(at).getTime() - base.getTime()) / 1000} seconds`;
		await db.admin`update app.weeks set generated_at = generated_at + ${shift}::interval where family_id = ${f.familyId} and starts_on = ${NEXT}`;
		await db.admin`update app.weekly_jobs set updated_at = updated_at + ${shift}::interval where family_id = ${f.familyId} and target_week = ${NEXT}`;
	}
	async function cronGenerated() {
		const r = await serviceSql('check-first-generation', '--preview', { family_id: f.familyId, week_start: NEXT });
		expect(r.code, r.out).toBe(0);
		const value = /\|\s*([tf])\s*$/m.exec(r.out)?.[1];
		return value === 't';
	}

	it('the cron made the week on Wednesday evening: t', async () => {
		expect((await runWeeklyJobOn(server, WEDNESDAY_EVENING, { families: [f.familyId] })).generated).toBe(1);
		await moveTo('2026-10-14T18:10:00Z');
		expect(await cronGenerated()).toBe(true);
	});

	it('the dispatcher made the job, a lazy generation made the week, then the job found it: f', async () => {
		await db.admin`insert into app.weekly_jobs (family_id, target_week) values (${f.familyId}, ${NEXT})`;
		await withDbOn(server, { kind: 'job' }, (tx) => ensureWeeks(tx, f.familyId, WEDNESDAY_EVENING));
		const result = await runWeeklyJobOn(server, WEDNESDAY_EVENING, { families: [f.familyId] });
		expect(result.generated).toBe(0);
		const [job] = await db.admin`select status from app.weekly_jobs where family_id = ${f.familyId} and target_week = ${NEXT}`;
		expect(job!.status).toBe('done');
		await moveTo('2026-10-14T18:10:05Z'); // within the hour: the old check said t
		expect(await cronGenerated()).toBe(false);
	});

	it('a catch-up on Thursday morning: f', async () => {
		await runWeeklyJobOn(server, WEDNESDAY_EVENING, { families: [f.familyId] });
		await moveTo('2026-10-15T08:00:00Z');
		expect(await cronGenerated()).toBe(false);
	});

	it('only a lazy generation, no job: f', async () => {
		await withDbOn(server, { kind: 'job' }, (tx) => ensureWeeks(tx, f.familyId, WEDNESDAY_EVENING));
		await moveTo('2026-10-14T18:10:00Z');
		expect(await cronGenerated()).toBe(false);
	});
});
