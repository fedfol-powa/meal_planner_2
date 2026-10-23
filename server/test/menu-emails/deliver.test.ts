import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceMenus } from '../../src/menu-emails/announce.ts';
import { deliverMenuEmails, MENU_EMAILS_PER_UTC_DAY, sendCheck } from '../../src/menu-emails/deliver.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { menuFixtures } from '../support/menu.ts';

// The final check of the spec (W24, section 5.5): time passes while the address is read.
const address = vi.hoisted(() => ({ before: null as null | (() => void) }));
vi.mock('../../src/menu-emails/address.ts', async (original) => {
	const actual = await original<typeof import('../../src/menu-emails/address.ts')>();
	return {
		emailAddressOf: async (...args: Parameters<typeof actual.emailAddressOf>) => {
			const found = await actual.emailAddressOf(...args);
			address.before?.();
			return found;
		},
	};
});

// The outcome transaction: when armed, the next transaction fails before it starts.
const outcome = vi.hoisted(() => ({ failNext: false }));
vi.mock('../../src/db.ts', async (original) => {
	const actual = await original<typeof import('../../src/db.ts')>();
	const withDbOn: typeof actual.withDbOn = (sql, identity, fn) => {
		if (!outcome.failNext) return actual.withDbOn(sql, identity, fn);
		outcome.failNext = false;
		return Promise.reject(Object.assign(new Error('outcome failure'), { code: '08006' }));
	};
	return { ...actual, withDbOn };
});

describe('sendCheck', () => {
	const row = { firstAttemptAt: new Date('2026-10-22T10:00:00Z'), weekStart: '2026-10-26', timeZone: 'Europe/Rome', reservedDay: '2026-10-22' };

	it('expires 23 hours after the first attempt', () => {
		const first = { ...row, firstAttemptAt: new Date('2026-10-21T12:00:00Z') };
		expect(sendCheck(first, new Date('2026-10-22T10:59:00Z'))).toBe('send');
		expect(sendCheck(first, new Date('2026-10-22T11:00:00Z'))).toBe('expired');
	});

	it('expires in the last minute before the local Monday midnight (winter time in Rome)', () => {
		const sunday = { ...row, firstAttemptAt: new Date('2026-10-25T20:00:00Z'), reservedDay: '2026-10-25' };
		expect(sendCheck(sunday, new Date('2026-10-25T22:58:59Z'))).toBe('send');
		expect(sendCheck(sunday, new Date('2026-10-25T22:59:00Z'))).toBe('expired');
	});

	it('defers when the UTC day of the reservation is over or in its last minute', () => {
		expect(sendCheck(row, new Date('2026-10-22T23:58:59Z'))).toBe('send');
		expect(sendCheck(row, new Date('2026-10-22T23:59:00Z'))).toBe('defer');
		expect(sendCheck(row, new Date('2026-10-23T00:00:00Z'))).toBe('defer');
	});

	it('follows the Los Angeles midnight, not the UTC one', () => {
		const la = { ...row, timeZone: 'America/Los_Angeles', firstAttemptAt: new Date('2026-10-26T00:00:00Z'), reservedDay: '2026-10-26' };
		// Monday in UTC, still Sunday 23:58:59 in Los Angeles (daylight time).
		expect(sendCheck(la, new Date('2026-10-26T06:58:59Z'))).toBe('send');
		expect(sendCheck(la, new Date('2026-10-26T06:59:00Z'))).toBe('expired');
	});
});

const ENV = { RESEND_API_KEY: 're_test' };
const WEEK = '2026-10-26';
const NOW = new Date('2026-10-22T10:00:00Z');

type Request = { key: string; to: string; subject: string; text: string; html: string };
type Reply = { status: number; name?: string; lost?: boolean };

/**
 * Fake Resend: every request is counted, and one email is accepted per idempotency key, the first
 * answered with a success (also when the answer is lost on the way back).
 */
function fakeResend(reply: (request: Request) => Reply | Promise<Reply> = () => ({ status: 200 })) {
	const requests: Request[] = [];
	const accepted = new Map<string, Request>();
	const impl = (async (url: string | URL | Request, init?: RequestInit) => {
		expect(String(url)).toBe('https://api.resend.com/emails');
		const headers = init!.headers as Record<string, string>;
		const body = JSON.parse(String(init!.body)) as { to: string[]; subject: string; text: string; html: string };
		const request: Request = { key: headers['idempotency-key']!, to: body.to[0]!, subject: body.subject, text: body.text, html: body.html };
		requests.push(request);
		const { status, name, lost } = await reply(request);
		if (status === 200 && !accepted.has(request.key)) accepted.set(request.key, request);
		if (lost) throw new TypeError('network connection lost');
		return new Response(JSON.stringify(name ? { name } : { id: 'e' }), { status });
	}) as typeof fetch;
	return { requests, accepted, fetch: impl };
}

/** Each run serves only the families of its test; time is the injected clock only, never Postgres's. */
describe.skipIf(!hasDatabase)('menu email delivery', () => {
	let db: TestDatabase;
	let sql: postgres.Sql;
	const clock = { now: NOW };
	beforeAll(async () => {
		db = await setupDatabase();
		sql = postgres(db.appServerUrl, { max: 4, fetch_types: false });
	});
	afterAll(async () => {
		await sql?.end();
		await db?.close();
	});
	beforeEach(async () => {
		clock.now = NOW;
		// The budget is one per UTC day for the whole database: each test starts from none.
		await db.admin`delete from app.menu_email_budget`;
	});
	afterEach(() => {
		vi.restoreAllMocks();
		address.before = null;
		outcome.failNext = false;
	});

	const logs = () => ({
		info: vi.spyOn(console, 'log').mockImplementation(() => {}),
		warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
		error: vi.spyOn(console, 'error').mockImplementation(() => {}),
	});
	const events = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
	const deliver = (families: string[], resend: { fetch: typeof fetch } | null, env: Parameters<typeof deliverMenuEmails>[1] = ENV) =>
		deliverMenuEmails(sql, env, { fetch: resend?.fetch, families, clock: () => clock.now });
	const at = (iso: string) => {
		clock.now = new Date(iso);
	};

	/** A family with its announcement and one email row per member, in creation order. */
	async function seed(members = 1, options: { timeZone?: string; week?: string } = {}) {
		const users: string[] = [];
		for (let i = 0; i < members; i++) users.push((await db.createUser()).userId);
		const familyId = await db.createFamily(users.map((userId) => ({ userId, role: 'member' as const })));
		if (options.timeZone) await db.admin`update app.families set time_zone = ${options.timeZone} where id = ${familyId}`;
		const week = options.week ?? WEEK;
		await db.admin`insert into app.menu_announcements (family_id, week_start) values (${familyId}, ${week})`;
		for (const [i, userId] of users.entries()) {
			await db.admin`
				insert into app.menu_emails (family_id, week_start, user_id, subject, html, text, created_at)
				values (${familyId}, ${week}, ${userId}, ${`Subject ${userId}`}, ${`<p>${userId}</p>`}, ${`Text ${userId}`},
					${new Date(Date.parse('2026-10-22T06:00:00Z') + i * 1000).toISOString()}::timestamptz)`;
		}
		return { familyId, users, week };
	}
	const key = (familyId: string, userId: string, week = WEEK) => `menu-email/${familyId}/${week}/${userId}`;
	const row = async (familyId: string, userId: string) =>
		(await db.admin<{ sentAt: Date | null; claimedAt: Date | null; closedAt: Date | null; closedReason: string | null; attempts: number; firstAttemptAt: Date | null }[]>`
			select sent_at as "sentAt", claimed_at as "claimedAt", closed_at as "closedAt", closed_reason as "closedReason", attempts, first_attempt_at as "firstAttemptAt"
			from app.menu_emails where family_id = ${familyId} and user_id = ${userId}`)[0]!;
	const reserved = async (day: string) => (await db.admin<{ reserved: number }[]>`select reserved from app.menu_email_budget where day = ${day}`)[0]?.reserved ?? null;
	const setRow = (familyId: string, userId: string, column: 'first_attempt_at' | 'claimed_at', iso: string) =>
		db.admin.unsafe(`update app.menu_emails set ${column} = $3::timestamptz where family_id = $1 and user_id = $2`, [familyId, userId, iso]);
	const open = (r: Awaited<ReturnType<typeof row>>) => r.sentAt === null && r.closedAt === null;

	it('sends an announced email once, with its key, its saved content and the address of menu_email_address', async () => {
		const log = logs();
		const fx = menuFixtures(db);
		const { userId } = await db.createUser();
		const familyId = await db.createFamily([{ userId, role: 'member' }]);
		await fx.setFamilyCreatedAt(familyId, '2026-10-01T00:00:00Z');
		const weekId = await fx.insertWeek(familyId, WEEK);
		await fx.insertSlot(weekId, { date: WEEK, mealType: 'dinner', freeText: 'Pizza fuori' });
		await announceMenus(sql, { APP_ORIGIN: 'https://app.test' }, new Date('2026-10-22T06:00:00Z'), { families: [familyId] });
		const [saved] = await db.admin<{ subject: string; html: string; text: string }[]>`select subject, html, text from app.menu_emails where family_id = ${familyId}`;

		const resend = fakeResend();
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(resend.requests).toEqual([{ key: key(familyId, userId), to: `${userId}@test.local`, subject: saved!.subject, text: saved!.text, html: saved!.html }]);
		const r = await row(familyId, userId);
		expect(r).toMatchObject({ sentAt: NOW, firstAttemptAt: NOW, attempts: 1, closedAt: null });
		expect(await reserved('2026-10-22')).toBe(1);
		expect(events(log.info)).toContainEqual({ event: 'menu_email_sent', familyId, weekStart: WEEK, userId });

		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(resend.requests).toHaveLength(1);
	});

	it('two concurrent deliveries make one request per row', async () => {
		logs();
		const { familyId, users } = await seed(2);
		const resend = fakeResend(async () => (await new Promise((r) => setTimeout(r, 100)), { status: 200 }));
		const results = await Promise.all([deliver([familyId], resend), deliver([familyId], resend)]);
		expect(results[0]!.sent + results[1]!.sent).toBe(2);
		expect(resend.requests.map((r) => r.key).sort()).toEqual(users.map((u) => key(familyId, u)).sort());
		for (const userId of users) expect((await row(familyId, userId)).attempts).toBe(1);
		// The losing claims rolled back their reservations.
		expect(await reserved('2026-10-22')).toBe(2);
	});

	it('closes as skipped, without a request, the email of a member who turned the option off or left', async () => {
		const log = logs();
		const { familyId, users } = await seed(3);
		const [off, gone, kept] = users as [string, string, string];
		await db.admin`insert into app.profile_preferences (user_id, menu_emails) values (${off}, false) on conflict (user_id) do update set menu_emails = false`;
		await db.admin`delete from app.family_members where family_id = ${familyId} and user_id = ${gone}`;
		const resend = fakeResend();
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(resend.requests.map((r) => r.key)).toEqual([key(familyId, kept)]);
		for (const userId of [off, gone]) expect(await row(familyId, userId)).toMatchObject({ closedReason: 'skipped', closedAt: NOW, sentAt: null });
		expect(events(log.info).filter((e) => e.event === 'menu_email_skipped')).toHaveLength(2);
		// Each claim consumed its reservation (prudence).
		expect(await reserved('2026-10-22')).toBe(3);
	});

	it('closes as ambiguous on an idempotency 409, and retries after a concurrent-request 409', async () => {
		const log = logs();
		const { familyId, users } = await seed(2);
		const [ambiguous, concurrent] = users as [string, string];
		const replies = new Map<string, Reply>([
			[key(familyId, ambiguous), { status: 409, name: 'invalid_idempotent_request' }],
			[key(familyId, concurrent), { status: 409, name: 'concurrent_idempotent_requests' }],
		]);
		const resend = fakeResend((r) => replies.get(r.key) ?? { status: 200 });
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(await row(familyId, ambiguous)).toMatchObject({ closedReason: 'ambiguous', sentAt: null });
		expect(await row(familyId, concurrent)).toMatchObject({ claimedAt: null, closedAt: null, attempts: 1 });
		expect(events(log.error)).toContainEqual({ event: 'menu_email_ambiguous', familyId, weekStart: WEEK, userId: ambiguous });

		replies.clear();
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(resend.requests.map((r) => r.key)).toEqual([key(familyId, ambiguous), key(familyId, concurrent), key(familyId, concurrent)]);
		expect((await row(familyId, concurrent)).sentAt).toEqual(NOW);
	});

	it('stops the round at a 429 and leaves every row open', async () => {
		logs();
		const { familyId, users } = await seed(3);
		const resend = fakeResend(() => ({ status: 429, name: 'rate_limit_exceeded' }));
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(resend.requests.map((r) => r.key)).toEqual([key(familyId, users[0]!)]);
		for (const userId of users) {
			const r = await row(familyId, userId);
			expect(open(r)).toBe(true);
			expect(r.claimedAt).toBeNull();
		}
		expect(await reserved('2026-10-22')).toBe(1);
	});

	it('releases the claim after a 500 and keeps the first attempt', async () => {
		const log = logs();
		const { familyId, users } = await seed();
		const resend = fakeResend(() => ({ status: 500 }));
		await deliver([familyId], resend);
		expect(await row(familyId, users[0]!)).toMatchObject({ claimedAt: null, attempts: 1, firstAttemptAt: NOW, sentAt: null, closedAt: null });
		expect(events(log.error)).toContainEqual({ event: 'menu_email_failed', familyId, weekStart: WEEK, userId: users[0], status: 500 });
	});

	it('expires on the local Monday and 23 hours after the first attempt, with a warning', async () => {
		const log = logs();
		const monday = await seed(1, { timeZone: 'Europe/Rome' });
		const resend = fakeResend();
		// Monday 26 at 00:00 in Rome: the week has begun.
		at('2026-10-25T23:00:00Z');
		expect(await deliver([monday.familyId], resend)).toEqual({ sent: 0 });
		expect(await row(monday.familyId, monday.users[0]!)).toMatchObject({ closedReason: 'expired', closedAt: clock.now, attempts: 0 });
		expect(events(log.warn)).toContainEqual({ event: 'menu_email_expired', familyId: monday.familyId, weekStart: WEEK, userId: monday.users[0] });

		// 25 hours after the first attempt, well before Monday.
		at('2026-10-22T10:00:00Z');
		const old = await seed();
		await setRow(old.familyId, old.users[0]!, 'first_attempt_at', '2026-10-21T09:00:00Z');
		await deliver([old.familyId], resend);
		expect(await row(old.familyId, old.users[0]!)).toMatchObject({ closedReason: 'expired', closedAt: NOW });
		expect(resend.requests).toEqual([]);
		expect(await reserved('2026-10-22')).toBeNull();
	});

	it('stops at a spent daily budget, and sends on the next UTC day', async () => {
		logs();
		const { familyId, users } = await seed(2);
		await db.admin`insert into app.menu_email_budget (day, reserved) values ('2026-10-22', ${MENU_EMAILS_PER_UTC_DAY})`;
		const resend = fakeResend();
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(resend.requests).toEqual([]);
		for (const userId of users) expect(await row(familyId, userId)).toMatchObject({ attempts: 0, claimedAt: null, sentAt: null, closedAt: null });
		expect(await reserved('2026-10-22')).toBe(60);

		at('2026-10-23T00:30:00Z');
		expect(await deliver([familyId], resend)).toEqual({ sent: 2 });
		expect(await reserved('2026-10-23')).toBe(2);
	});

	it('with 59 reservations two concurrent deliveries send one email', async () => {
		logs();
		const first = await seed();
		const second = await seed();
		await db.admin`insert into app.menu_email_budget (day, reserved) values ('2026-10-22', 59)`;
		const resend = fakeResend(async () => (await new Promise((r) => setTimeout(r, 50)), { status: 200 }));
		const results = await Promise.all([deliver([first.familyId], resend), deliver([second.familyId], resend)]);
		expect(results[0]!.sent + results[1]!.sent).toBe(1);
		expect(resend.requests).toHaveLength(1);
		expect(await reserved('2026-10-22')).toBe(60);
	});

	it('a lost answer consumes the reservation, and the retry sends the same key and content once', async () => {
		logs();
		const { familyId, users } = await seed();
		const userId = users[0]!;
		let lose = true;
		const resend = fakeResend(() => ({ status: 200, lost: lose }));
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(await row(familyId, userId)).toMatchObject({ claimedAt: null, sentAt: null, closedAt: null, attempts: 1 });
		expect(await reserved('2026-10-22')).toBe(1);

		lose = false;
		at('2026-10-22T11:00:00Z');
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(resend.requests).toHaveLength(2);
		expect(resend.requests[1]).toEqual(resend.requests[0]);
		expect(resend.accepted.size).toBe(1);
		expect(await reserved('2026-10-22')).toBe(2);
	});

	it('keeps the claim when saving sent_at fails, and another round takes it back after 15 minutes', async () => {
		const log = logs();
		const { familyId, users } = await seed();
		const userId = users[0]!;
		const resend = fakeResend(() => ((outcome.failNext = true), { status: 200 }));
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(await row(familyId, userId)).toMatchObject({ claimedAt: NOW, sentAt: null, closedAt: null, attempts: 1 });
		expect(events(log.error)).toContainEqual({ event: 'menu_email_failed', familyId, weekStart: WEEK, userId, code: '08006' });

		// A recent claim is not taken again.
		const quiet = fakeResend();
		await deliver([familyId], quiet);
		expect(quiet.requests).toEqual([]);

		await setRow(familyId, userId, 'claimed_at', new Date(NOW.getTime() - 16 * 60_000).toISOString());
		const again = fakeResend();
		expect(await deliver([familyId], again)).toEqual({ sent: 1 });
		expect(again.requests).toEqual(resend.requests);
		expect(new Set([...resend.accepted.keys(), ...again.accepted.keys()]).size).toBe(1);
		expect(await row(familyId, userId)).toMatchObject({ sentAt: NOW, attempts: 2 });
		expect(await reserved('2026-10-22')).toBe(2);
	});

	it('does not claim a row that left its window while the round sent the one before', async () => {
		logs();
		const { familyId, users } = await seed(2);
		const [first, second] = users as [string, string];
		const resend = fakeResend(async (r) => {
			if (r.key === key(familyId, first)) await setRow(familyId, second, 'first_attempt_at', new Date(NOW.getTime() - (23 * 60 + 1) * 60_000).toISOString());
			return { status: 200 };
		});
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(resend.requests.map((r) => r.key)).toEqual([key(familyId, first)]);
		expect(await row(familyId, second)).toMatchObject({ attempts: 0, claimedAt: null, sentAt: null, closedAt: null });
		// Its reservation went back with the claim.
		expect(await reserved('2026-10-22')).toBe(1);

		await deliver([familyId], resend);
		expect(await row(familyId, second)).toMatchObject({ closedReason: 'expired' });
		expect(resend.requests).toHaveLength(1);
	});

	describe('the final check, across each boundary between the claim and the request', () => {
		it('(a) 23 hours from the first attempt: expired, no request, reservation consumed', async () => {
			logs();
			const { familyId, users } = await seed();
			const userId = users[0]!;
			await setRow(familyId, userId, 'first_attempt_at', new Date(NOW.getTime() - (22 * 60 + 50) * 60_000).toISOString());
			address.before = () => at('2026-10-22T10:11:00Z');
			const resend = fakeResend();
			expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
			expect(resend.requests).toEqual([]);
			expect(await row(familyId, userId)).toMatchObject({ closedReason: 'expired', closedAt: new Date('2026-10-22T10:11:00Z'), attempts: 1 });
			expect(await reserved('2026-10-22')).toBe(1);
		});

		it('(b) the last minute before the local Monday: expired, no request', async () => {
			logs();
			const { familyId, users } = await seed(1, { timeZone: 'Europe/Rome' });
			at('2026-10-25T22:50:00Z');
			address.before = () => at('2026-10-25T22:59:00Z');
			const resend = fakeResend();
			await deliver([familyId], resend);
			expect(resend.requests).toEqual([]);
			expect(await row(familyId, users[0]!)).toMatchObject({ closedReason: 'expired', sentAt: null });
			expect(await reserved('2026-10-25')).toBe(1);
		});

		for (const [label, crossed] of [
			['(c) the UTC midnight', '2026-10-23T00:05:00Z'],
			['(d) the last minute of the UTC day', '2026-10-22T23:59:30Z'],
		] as const) {
			it(`${label}: no request, claim released, a new reservation on the new day sends one email`, async () => {
				const log = logs();
				const { familyId, users } = await seed();
				const userId = users[0]!;
				at('2026-10-22T23:50:00Z');
				address.before = () => at(crossed);
				const resend = fakeResend();
				expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
				expect(resend.requests).toEqual([]);
				expect(await row(familyId, userId)).toMatchObject({ claimedAt: null, sentAt: null, closedAt: null, attempts: 1 });
				expect(await reserved('2026-10-22')).toBe(1);
				expect(events(log.info)).toContainEqual({ event: 'menu_email_deferred', familyId, weekStart: WEEK, userId, day: '2026-10-22' });

				address.before = null;
				at('2026-10-23T00:10:00Z');
				expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
				expect(resend.requests).toHaveLength(1);
				expect(resend.accepted.size).toBe(1);
				expect(await reserved('2026-10-23')).toBe(1);
				expect(await reserved('2026-10-22')).toBe(1);
			});
		}
	});

	it('neither reserves nor claims in the last minute of the UTC day', async () => {
		logs();
		const { familyId, users } = await seed(2);
		at('2026-10-22T23:59:00Z');
		const resend = fakeResend();
		expect(await deliver([familyId], resend)).toEqual({ sent: 0 });
		expect(resend.requests).toEqual([]);
		for (const userId of users) expect(await row(familyId, userId)).toMatchObject({ attempts: 0, claimedAt: null, closedAt: null });
		expect(await reserved('2026-10-22')).toBeNull();
		expect(await reserved('2026-10-23')).toBeNull();
	});

	it('sends in Los Angeles only while the local date precedes the Monday', async () => {
		logs();
		const sunday = await seed(1, { timeZone: 'America/Los_Angeles' });
		const midnight = await seed(1, { timeZone: 'America/Los_Angeles' });
		const monday = await seed(1, { timeZone: 'America/Los_Angeles' });
		const resend = fakeResend();
		// Monday in UTC, Sunday 23:58:59 in Los Angeles: still valid.
		at('2026-10-26T06:58:59Z');
		expect(await deliver([sunday.familyId], resend)).toEqual({ sent: 1 });
		// The last minute before the local midnight.
		at('2026-10-26T06:59:00Z');
		await deliver([midnight.familyId], resend);
		expect(await row(midnight.familyId, midnight.users[0]!)).toMatchObject({ closedReason: 'expired' });
		// Tuesday in UTC, Monday 20:00 in Los Angeles.
		at('2026-10-27T03:00:00Z');
		await deliver([monday.familyId], resend);
		expect(await row(monday.familyId, monday.users[0]!)).toMatchObject({ closedReason: 'expired' });
		expect(resend.requests.map((r) => r.key)).toEqual([key(sunday.familyId, sunday.users[0]!)]);
	});

	it('a retry after the UTC midnight reserves on the new day', async () => {
		logs();
		const { familyId, users } = await seed();
		at('2026-10-22T23:30:00Z');
		let status = 500;
		const resend = fakeResend(() => ({ status }));
		await deliver([familyId], resend);
		expect(await reserved('2026-10-22')).toBe(1);
		status = 200;
		at('2026-10-23T00:30:00Z');
		expect(await deliver([familyId], resend)).toEqual({ sent: 1 });
		expect(await reserved('2026-10-22')).toBe(1);
		expect(await reserved('2026-10-23')).toBe(1);
		expect(await row(familyId, users[0]!)).toMatchObject({ attempts: 2, firstAttemptAt: new Date('2026-10-22T23:30:00Z'), sentAt: new Date('2026-10-23T00:30:00Z') });
	});

	it('claims nothing without RESEND_API_KEY or MAILPIT_API_URL', async () => {
		const log = logs();
		const { familyId, users } = await seed();
		const resend = fakeResend();
		expect(await deliver([familyId], resend, {})).toEqual({ sent: 0 });
		expect(resend.requests).toEqual([]);
		expect(await row(familyId, users[0]!)).toMatchObject({ attempts: 0, claimedAt: null });
		expect(await reserved('2026-10-22')).toBeNull();
		expect(events(log.error)).toContainEqual({ event: 'menu_email_not_configured' });
	});

	it('never throws', async () => {
		const log = logs();
		const broken = postgres(db.appServerUrl, { max: 1, fetch_types: false });
		await broken.end();
		expect(await deliverMenuEmails(broken, ENV, { fetch: fakeResend().fetch, clock: () => clock.now })).toEqual({ sent: 0 });
		expect(log.error).toHaveBeenCalled();
	});
});
