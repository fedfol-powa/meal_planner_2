import { isNextWeekDue, localDateTime, nextWeekStart } from '@app/domain/planner';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { newPhotoKey } from '../../src/catalogue/photos/key.ts';
import { withDbOn } from '../../src/db.ts';
import { ensureWeeks } from '../../src/menu/generation.ts';
import { announceMenus, type MenuEmailEnv } from '../../src/menu-emails/announce.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { menuFixtures } from '../support/menu.ts';

// The controlled point of the announcement: composing these families' emails fails, inside their transaction,
// with the error given (a plain one by default).
const failing = vi.hoisted(() => new Set<string>());
const failure = vi.hoisted(() => ({ error: null as unknown }));
vi.mock('../../src/menu-emails/content.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu-emails/content.ts')>();
	return {
		...actual,
		menuEmail: (input: Parameters<typeof actual.menuEmail>[0]) => {
			if ([...failing].some((familyId) => input.menuUrl.includes(familyId))) throw failure.error ?? new Error('compose failure');
			return actual.menuEmail(input);
		},
	};
});

// The thumbnails succeed only for these storage keys; the calls are recorded.
const thumbnails = vi.hoisted(() => ({ ready: new Set<string>(), calls: [] as string[] }));
vi.mock('../../src/menu-emails/thumbnails.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu-emails/thumbnails.ts')>();
	return {
		...actual,
		ensureEmailThumbnail: async (_env: unknown, key: string) => (thumbnails.calls.push(key), thumbnails.ready.has(key)),
	};
});

const ORIGIN = 'https://app.test';
const env: MenuEmailEnv = { APP_ORIGIN: ORIGIN };
const THURSDAY = new Date('2026-10-22T06:00:00Z');
const NEXT_THURSDAY = new Date('2026-10-29T06:00:00Z');

/** Each run serves only the families of its test: the shared test database holds many more. */
describe.skipIf(!hasDatabase)('menu announcement', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	let fx: ReturnType<typeof menuFixtures>;
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
		fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	afterAll(async () => {
		await sql.end();
		await db.close();
	});
	afterEach(() => {
		vi.restoreAllMocks();
		failing.clear();
		failure.error = null;
		thumbnails.ready.clear();
		thumbnails.calls.length = 0;
	});

	/** A family born before the fixed instants, with its members, and the week of 26 October when asked. */
	async function family(locales: ('it-IT' | 'en-GB')[], options: { week?: string | null; createdAt?: string } = {}) {
		const users: string[] = [];
		for (const locale of locales) users.push((await db.createUser({ locale })).userId);
		const familyId = await db.createFamily(users.map((userId) => ({ userId, role: 'member' as const })));
		await fx.setFamilyCreatedAt(familyId, options.createdAt ?? '2026-10-01T00:00:00Z');
		const week = options.week === undefined ? '2026-10-26' : options.week;
		const weekId = week ? await fx.insertWeek(familyId, week) : null;
		return { familyId, users, weekId };
	}
	const announcements = async (familyId: string) =>
		(await db.admin<{ week: string }[]>`select week_start::text as week from app.menu_announcements where family_id = ${familyId} order by 1`).map((r) => r.week);
	const emails = (familyId: string) =>
		db.admin<{ userId: string; week: string; subject: string; html: string; text: string }[]>`
			select user_id as "userId", week_start::text as week, subject, html, text from app.menu_emails where family_id = ${familyId} order by subject`;
	const quiet = () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	};

	it('announces once, one email per member in their language, also with two concurrent runs', async () => {
		quiet();
		const { familyId, users, weekId } = await family(['it-IT', 'en-GB']);
		const recipe = await fx.publishRecipe({ name: 'Risotto alla zucca' });
		await fx.insertSlot(weekId!, { date: '2026-10-26', mealType: 'lunch', recipeId: recipe });
		await fx.insertSlot(weekId!, { date: '2026-10-26', mealType: 'dinner' });
		await fx.insertSlot(weekId!, { date: '2026-10-27', mealType: 'dinner', freeText: 'Pizza fuori' });

		const results = await Promise.all([announceMenus(sql, env, THURSDAY, { families: [familyId] }), announceMenus(sql, env, THURSDAY, { families: [familyId] })]);
		expect(results.reduce((sum, r) => sum + r.announced, 0)).toBe(1);
		expect(results.reduce((sum, r) => sum + r.emails, 0)).toBe(2);
		expect(await announcements(familyId)).toEqual(['2026-10-26']);
		const rows = await emails(familyId);
		expect(rows.map((r) => [r.userId, r.week, r.subject])).toEqual([
			[users[0], '2026-10-26', 'Il menu della settimana 26 ottobre – 1 novembre è pronto'],
			[users[1], '2026-10-26', 'The menu for 26 October – 1 November is ready'],
		].sort((a, b) => a[2]!.localeCompare(b[2]!)));
		const italian = rows.find((r) => r.userId === users[0])!;
		const english = rows.find((r) => r.userId === users[1])!;
		expect(italian.text).toContain('Risotto alla zucca');
		expect(italian.text).toContain('Pizza fuori');
		expect(english.text).toContain('Risotto alla zucca (en)');
		expect(italian.text).toContain(`${ORIGIN}/menu?day=2026-10-26&family=${familyId}`);
		expect(italian.text).toContain(`${ORIGIN}/profile/preferences`);

		expect(await announceMenus(sql, env, THURSDAY, { families: [familyId] })).toEqual({ announced: 0, emails: 0 });
		expect(await emails(familyId)).toHaveLength(2);
	});

	it('logs the announcement with the family, the week and the recipients', async () => {
		const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { familyId } = await family(['it-IT', 'it-IT']);
		await announceMenus(sql, env, THURSDAY, { families: [familyId] });
		const lines = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(lines).toContainEqual({ event: 'menu_email_announced', familyId, weekStart: '2026-10-26', recipients: 2 });
	});

	it('names the recipe in the person language, else in the other one', async () => {
		quiet();
		const { familyId, weekId } = await family(['en-GB']);
		const draft = await fx.draftRecipe('Solo in italiano');
		await fx.insertSlot(weekId!, { date: '2026-10-28', mealType: 'lunch', recipeId: draft });
		await announceMenus(sql, env, THURSDAY, { families: [familyId] });
		const [row] = await emails(familyId);
		expect(row!.text).toContain('Solo in italiano');
	});

	it('writes no row for a member with the emails off', async () => {
		quiet();
		const { familyId, users } = await family(['it-IT', 'it-IT']);
		await db.admin`insert into app.profile_preferences (user_id, menu_emails) values (${users[1]!}, false)
			on conflict (user_id) do update set menu_emails = false`;
		expect(await announceMenus(sql, env, THURSDAY, { families: [familyId] })).toEqual({ announced: 1, emails: 1 });
		expect((await emails(familyId)).map((r) => r.userId)).toEqual([users[0]]);
	});

	it('skips the week a new family found ready, and announces the following one', async () => {
		quiet();
		const { familyId } = await family(['it-IT'], { createdAt: '2026-10-22T07:00:00Z' });
		expect(await announceMenus(sql, env, new Date('2026-10-22T08:00:00Z'), { families: [familyId] })).toEqual({ announced: 0, emails: 0 });
		expect(await announcements(familyId)).toEqual([]);
		await fx.insertWeek(familyId, '2026-11-02');
		expect(await announceMenus(sql, env, NEXT_THURSDAY, { families: [familyId] })).toEqual({ announced: 1, emails: 1 });
		expect(await announcements(familyId)).toEqual(['2026-11-02']);
	});

	it('announces on the next run a week the lazy generation created after the job failed', async () => {
		quiet();
		const { familyId } = await family(['it-IT'], { week: null });
		expect(await announceMenus(sql, env, THURSDAY, { families: [familyId] })).toEqual({ announced: 0, emails: 0 });
		await withDbOn(sql, { kind: 'job' }, (tx) => ensureWeeks(tx, familyId, THURSDAY));
		expect(await announceMenus(sql, env, new Date('2026-10-22T07:00:00Z'), { families: [familyId] })).toEqual({ announced: 1, emails: 1 });
		expect(await announcements(familyId)).toEqual(['2026-10-26']);
	});

	it('sends no late email to a member who joined after the announcement', async () => {
		quiet();
		const { familyId, users } = await family(['it-IT']);
		await announceMenus(sql, env, THURSDAY, { families: [familyId] });
		const { userId: late } = await db.createUser();
		await db.addMember(familyId, late, 'member');
		expect(await announceMenus(sql, env, new Date('2026-10-22T07:00:00Z'), { families: [familyId] })).toEqual({ announced: 0, emails: 0 });
		expect((await emails(familyId)).map((r) => r.userId)).toEqual([users[0]]);
	});

	it('isolates a family whose transaction fails and announces it on the next run', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const broken = await family(['it-IT']);
		const healthy = await family(['it-IT']);
		failing.add(broken.familyId);
		expect(await announceMenus(sql, env, THURSDAY, { families: [broken.familyId, healthy.familyId] })).toEqual({ announced: 1, emails: 1 });
		expect(await announcements(broken.familyId)).toEqual([]);
		expect(await announcements(healthy.familyId)).toEqual(['2026-10-26']);
		const lines = errors.mock.calls.map(([line]) => JSON.parse(String(line)));
		expect(lines).toContainEqual({ event: 'menu_email_announce_failed', familyId: broken.familyId, code: 'Error' });
		failing.clear();
		expect(await announceMenus(sql, env, THURSDAY, { families: [broken.familyId, healthy.familyId] })).toEqual({ announced: 1, emails: 1 });
		expect(await announcements(broken.familyId)).toEqual(['2026-10-26']);
	});

	it('calls the family gone only for the foreign key of the announcement to the family (final review, finding 5)', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const info = vi.spyOn(console, 'log').mockImplementation(() => {});
		const gone = await family(['it-IT']);
		const other = await family(['it-IT']);
		const violation = (constraint: string) => Object.assign(new Error('foreign key violation'), { code: '23503', constraint_name: constraint });
		failing.add(gone.familyId);
		failure.error = violation('menu_announcements_family_id_fkey');
		await announceMenus(sql, env, THURSDAY, { families: [gone.familyId] });
		failing.clear();
		failing.add(other.familyId);
		failure.error = violation('menu_emails_user_id_fkey');
		await announceMenus(sql, env, THURSDAY, { families: [other.familyId] });
		const lines = (spy: typeof info) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
		expect(lines(info)).toContainEqual({ event: 'menu_email_family_gone', familyId: gone.familyId });
		expect(lines(info)).not.toContainEqual({ event: 'menu_email_family_gone', familyId: other.familyId });
		expect(lines(errors)).toContainEqual({ event: 'menu_email_announce_failed', familyId: other.familyId, code: '23503' });
	});

	it('sends a person in two families one email for each, named and linked to its family', async () => {
		quiet();
		const first = await family(['it-IT']);
		const userId = first.users[0]!;
		const secondId = await db.createFamily([{ userId, role: 'member' }]);
		await fx.setFamilyCreatedAt(secondId, '2026-10-01T00:00:00Z');
		await fx.insertWeek(secondId, '2026-10-26');
		await db.admin`update app.families set name = 'Rossi' where id = ${first.familyId}`;
		await db.admin`update app.families set name = 'Bianchi' where id = ${secondId}`;
		expect(await announceMenus(sql, env, THURSDAY, { families: [first.familyId, secondId] })).toEqual({ announced: 2, emails: 2 });
		const [rossi] = await emails(first.familyId);
		const [bianchi] = await emails(secondId);
		expect(rossi!.subject).toBe('Il menu della settimana 26 ottobre – 1 novembre è pronto · Rossi');
		expect(bianchi!.subject).toBe('Il menu della settimana 26 ottobre – 1 novembre è pronto · Bianchi');
		expect(rossi!.text).toContain(`family=${first.familyId}`);
		expect(bianchi!.text).toContain(`family=${secondId}`);
	});

	it('links a thumbnail only for the photos whose thumbnail is ready', async () => {
		quiet();
		const { familyId, weekId } = await family(['it-IT']);
		const keys: string[] = [];
		for (const [date, ready] of [['2026-10-26', true], ['2026-10-27', false]] as const) {
			const recipe = await fx.publishRecipe();
			const key = newPhotoKey();
			await db.admin`
				insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel)
				values (${crypto.randomUUID()}, ${recipe}, ${key}, 'image/webp', 1600, 1067, 500, 'web')`;
			await fx.insertSlot(weekId!, { date, mealType: 'lunch', recipeId: recipe });
			if (ready) thumbnails.ready.add(key);
			keys.push(key);
		}
		await announceMenus(sql, env, THURSDAY, { families: [familyId] });
		expect(thumbnails.calls.sort()).toEqual([...keys].sort());
		const [row] = await emails(familyId);
		const id = (key: string) => key.slice('photos/'.length, -'.webp'.length);
		expect(row!.html).toContain(`src="${ORIGIN}/photos/email/${id(keys[0]!)}.jpg"`);
		expect(row!.html).not.toContain(id(keys[1]!));
	});

	it('announces nothing without APP_ORIGIN, with an error log', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { familyId } = await family(['it-IT']);
		expect(await announceMenus(sql, {}, THURSDAY, { families: [familyId] })).toEqual({ announced: 0, emails: 0 });
		expect(await announcements(familyId)).toEqual([]);
		expect(errors.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual({ event: 'menu_email_no_origin' });
	});

	describe('the week to announce matches the planner', () => {
		const MONDAYS = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
		// Wednesday 19:59 and 20:00, Sunday 23:59 and Monday 00:00 local, across each zone's change of time,
		// with the week written by hand: a check on the instants themselves.
		const BOUNDARIES: Record<string, [string, string | null][]> = {
			'Europe/Rome': [
				['2026-10-21T17:59:00Z', null], ['2026-10-21T18:00:00Z', '2026-10-26'], // Wednesday 21, summer time
				['2026-10-25T00:59:00Z', '2026-10-26'], ['2026-10-25T01:00:00Z', '2026-10-26'], // Sunday 25, the clocks go back
				['2026-10-25T22:59:00Z', '2026-10-26'], ['2026-10-25T23:00:00Z', null], // Sunday 23:59, Monday 26 00:00
				['2026-10-28T18:59:00Z', null], ['2026-10-28T19:00:00Z', '2026-11-02'], // Wednesday 28, winter time
			],
			'America/New_York': [
				['2026-10-28T23:59:00Z', null], ['2026-10-29T00:00:00Z', '2026-11-02'], // Wednesday 28, daylight time
				['2026-11-01T05:59:00Z', '2026-11-02'], ['2026-11-01T06:00:00Z', '2026-11-02'], // Sunday 1, the clocks go back
				['2026-11-02T04:59:00Z', '2026-11-02'], ['2026-11-02T05:00:00Z', null], // Sunday 23:59, Monday 2 00:00
				['2026-11-05T00:59:00Z', null], ['2026-11-05T01:00:00Z', '2026-11-09'], // Wednesday 4, standard time
			],
		};
		const expected = (instant: Date, timeZone: string) => {
			const local = localDateTime(instant, timeZone);
			return isNextWeekDue(local) ? nextWeekStart(local) : null;
		};
		const announcedAt = async (familyId: string, instants: Date[]) =>
			(await db.admin<{ week: string | null }[]>`
				select app.menu_week_to_announce(${familyId}::uuid, t)::text as week
				from unnest(${instants.map((i) => i.toISOString())}::timestamptz[]) with ordinality as u(t, n) order by n`).map((r) => r.week);

		for (const [timeZone, instants] of Object.entries(BOUNDARIES)) {
			it(`on the boundary instants in ${timeZone}`, async () => {
				const { familyId } = await family([], { week: null });
				await fx.setTimeZone(familyId, timeZone);
				for (const monday of MONDAYS) await fx.insertWeek(familyId, monday);
				const dates = instants.map(([i]) => new Date(i));
				const want = instants.map(([, week]) => week);
				expect(dates.map((d) => expected(d, timeZone))).toEqual(want);
				expect(await announcedAt(familyId, dates)).toEqual(want);
			});

			it(`hour by hour across October and November in ${timeZone}`, async () => {
				const { familyId } = await family([], { week: null });
				await fx.setTimeZone(familyId, timeZone);
				for (const monday of MONDAYS) await fx.insertWeek(familyId, monday);
				const dates = Array.from({ length: 24 * 21 }, (_, h) => new Date(Date.parse('2026-10-19T00:00:00Z') + h * 3_600_000));
				expect(await announcedAt(familyId, dates)).toEqual(dates.map((d) => expected(d, timeZone)));
			});
		}
	});
});
