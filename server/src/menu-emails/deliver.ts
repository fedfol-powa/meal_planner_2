import { localDateTime } from '@app/domain/planner';
import type postgres from 'postgres';
import { withDbOn, type Tx } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { sendEmail } from '../mail/transport.ts';
import { errorCode } from '../menu/generation.ts';
import { emailAddressOf } from './address.ts';

export type DeliveryEnv = Pick<Env, 'RESEND_API_KEY' | 'MAILPIT_API_URL'>;

export interface DeliveryOptions {
	fetch?: typeof fetch;
	/** Only these families; tests use it, the hourly run serves them all. */
	families?: readonly string[];
	/** Read at each phase; every query gets its instant as a parameter, never Postgres's `now()`. */
	clock?: () => Date;
}

/**
 * Menu emails reserved per UTC day. Resend's free plan gives 100 emails a UTC day (3,000 a month),
 * shared with the "choose a password" emails and the operational alerts: 60 leave them at least 40.
 */
export const MENU_EMAILS_PER_UTC_DAY = 60;

const MINUTE = 60_000;
/** Resend keeps an idempotency key 24 hours: one hour of margin. */
const ATTEMPT_WINDOW = 23 * 60 * MINUTE;

const utcDay = (at: Date) => at.toISOString().slice(0, 10);
/** One minute of margin before each midnight: it covers the 10-second timeout of the transport. */
const withMargin = (at: Date) => new Date(at.getTime() + MINUTE);

/**
 * The final check before the request (spec W24, section 5.5), in code at the instant `at`: the row
 * must still be in its window (23 hours from the first attempt, the local Monday with its minute of
 * margin), and `at` in the UTC day of the reservation and not in its last minute.
 */
export function sendCheck(row: { firstAttemptAt: Date; weekStart: string; timeZone: string; reservedDay: string }, at: Date): 'send' | 'expired' | 'defer' {
	if (at.getTime() >= row.firstAttemptAt.getTime() + ATTEMPT_WINDOW) return 'expired';
	if (localDateTime(withMargin(at), row.timeZone).date >= row.weekStart) return 'expired';
	if (utcDay(withMargin(at)) !== row.reservedDay) return 'defer';
	return 'send';
}

interface EmailRow {
	familyId: string;
	weekStart: string;
	userId: string;
}

interface Claim {
	subject: string;
	html: string;
	text: string;
	firstAttemptAt: Date;
	timeZone: string;
	claimedAt: string;
	/** The UTC day of the reservation. */
	day: string;
}

/** Ends a claim transaction with a rollback, its reservation included. */
class Rollback extends Error {
	readonly outcome: 'stop' | 'next';
	constructor(outcome: 'stop' | 'next') {
		super(outcome);
		this.outcome = outcome;
	}
}

/** The send window of email `m` of family `f` at the instant `at` (section 5.5). */
const isValid = (tx: Tx, at: string) => tx`
	m.sent_at is null and m.closed_at is null
	and ((${at}::timestamptz + interval '1 minute') at time zone f.time_zone)::date < m.week_start
	and (m.first_attempt_at is null or m.first_attempt_at > ${at}::timestamptz - interval '23 hours')`;

/** As text: the server's connections do not fetch the array types. */
const inFamilies = (tx: Tx, families: string | null) => tx`
	(${families}::text is null or m.family_id = any(string_to_array(${families}, ',')::uuid[]))`;

const isOpen = (tx: Tx, row: EmailRow) => tx`
	family_id = ${row.familyId} and week_start = ${row.weekStart} and user_id = ${row.userId} and sent_at is null and closed_at is null`;

const ids = (row: EmailRow) => ({ familyId: row.familyId, weekStart: row.weekStart, userId: row.userId });

/**
 * One delivery round (spec W24, section 5.5), on the model of the operational alerts: each row is
 * reserved on the daily budget and claimed atomically in a short transaction, checked again right
 * before the request, sent with no transaction open, and its outcome recorded in another one.
 * Better no email than a duplicate. Never throws.
 */
export async function deliverMenuEmails(sql: postgres.Sql, env: DeliveryEnv, options: DeliveryOptions = {}): Promise<{ sent: number }> {
	const result = { sent: 0 };
	const clock = options.clock ?? (() => new Date());
	const families = options.families ? options.families.join(',') : null;
	const job = <T>(fn: (tx: Tx) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);
	try {
		await prune(job, clock());
		await expire(job, clock(), families);
		if (!(env.RESEND_API_KEY || env.MAILPIT_API_URL)) {
			logEvent('menu_email_not_configured', {}, 'error');
			return result;
		}
		const at = clock().toISOString();
		const candidates = await job((tx) => tx<EmailRow[]>`
			select m.family_id as "familyId", m.week_start::text as "weekStart", m.user_id as "userId"
			from app.menu_emails m join app.families f on f.id = m.family_id
			where ${isValid(tx, at)} and ${inFamilies(tx, families)}
				and (m.claimed_at is null or m.claimed_at < ${at}::timestamptz - interval '15 minutes')
			order by m.created_at, m.family_id, m.user_id`);
		for (const row of candidates) {
			try {
				const outcome = await deliverOne(sql, env, row, clock, options.fetch);
				if (outcome === 'sent') result.sent++;
				if (outcome === 'stop') break;
			} catch (error) {
				logEvent('menu_email_failed', { ...ids(row), code: errorCode(error) }, 'error');
			}
		}
	} catch (error) {
		logEvent('menu_email_delivery_failed', { code: errorCode(error) }, 'error');
	}
	return result;
}

type Job = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** The announcements (with their emails) and the budget days older than 90 days. */
async function prune(job: Job, now: Date): Promise<void> {
	const at = now.toISOString();
	await job(async (tx) => {
		await tx`delete from app.menu_announcements where created_at < ${at}::timestamptz - interval '90 days'`;
		await tx`delete from app.menu_email_budget where day < (${at}::timestamptz at time zone 'UTC')::date - 90`;
	});
}

/** Closes the open rows out of their window before the round. */
async function expire(job: Job, now: Date, families: string | null): Promise<void> {
	const at = now.toISOString();
	const rows = await job((tx) => tx<EmailRow[]>`
		update app.menu_emails m set closed_at = ${at}::timestamptz, closed_reason = 'expired'
		from app.families f
		where f.id = m.family_id and m.sent_at is null and m.closed_at is null
			and not (${isValid(tx, at)}) and ${inFamilies(tx, families)}
		returning m.family_id as "familyId", m.week_start::text as "weekStart", m.user_id as "userId"`);
	for (const row of rows) logEvent('menu_email_expired', ids(row), 'warn');
}

/**
 * Reserves one email on the budget of the UTC day and claims the row, in one transaction: a spent
 * budget or the last minute of the day stops the round, a row no longer valid rolls back its
 * reservation and the round goes on. The conflict on the budget day serializes concurrent rounds.
 */
async function claim(sql: postgres.Sql, row: EmailRow, now: Date): Promise<Claim | 'stop' | 'next'> {
	const day = utcDay(now);
	// The last minute of the UTC day: no reservation, the next hour resumes.
	if (utcDay(withMargin(now)) !== day) return 'stop';
	const at = now.toISOString();
	try {
		return await withDbOn(sql, { kind: 'job' }, async (tx) => {
			const reserved = await tx`
				insert into app.menu_email_budget (day, reserved) values (${day}::date, 1)
				on conflict (day) do update set reserved = menu_email_budget.reserved + 1
				where menu_email_budget.reserved < ${MENU_EMAILS_PER_UTC_DAY}
				returning reserved`;
			if (reserved.length === 0) {
				logEvent('menu_email_budget_spent', { day });
				throw new Rollback('stop');
			}
			const [claimed] = await tx<Omit<Claim, 'claimedAt' | 'day'>[]>`
				update app.menu_emails m
				set claimed_at = ${at}::timestamptz, attempts = m.attempts + 1, first_attempt_at = coalesce(m.first_attempt_at, ${at}::timestamptz)
				from app.families f
				where f.id = m.family_id and m.family_id = ${row.familyId} and m.week_start = ${row.weekStart} and m.user_id = ${row.userId}
					and ${isValid(tx, at)}
					and (m.claimed_at is null or m.claimed_at < ${at}::timestamptz - interval '15 minutes')
				returning m.subject, m.html, m.text, m.first_attempt_at as "firstAttemptAt", f.time_zone as "timeZone"`;
			if (!claimed) throw new Rollback('next');
			return { ...claimed, claimedAt: at, day };
		});
	} catch (error) {
		if (error instanceof Rollback) return error.outcome;
		throw error;
	}
}

async function deliverOne(
	sql: postgres.Sql,
	env: DeliveryEnv,
	row: EmailRow,
	clock: () => Date,
	fetchImpl: typeof fetch | undefined,
): Promise<'sent' | 'stop' | 'next'> {
	const job = <T>(fn: (tx: Tx) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);
	const close = (reason: 'expired' | 'ambiguous' | 'skipped') => {
		const at = clock().toISOString();
		return job((tx) => tx`update app.menu_emails set closed_at = ${at}::timestamptz, closed_reason = ${reason} where ${isOpen(tx, row)}`);
	};
	// Only our own claim: one taken back by another round after 15 minutes stays its own.
	const release = (claimedAt: string) =>
		job((tx) => tx`update app.menu_emails set claimed_at = null where ${isOpen(tx, row)} and claimed_at = ${claimedAt}::timestamptz`);

	const claimed = await claim(sql, row, clock());
	if (claimed === 'stop' || claimed === 'next') return claimed;

	// The person left, turned the option off or has no confirmed email: the reservation stays spent.
	const to = await emailAddressOf(sql, row.familyId, row.userId);
	if (!to) {
		await close('skipped');
		logEvent('menu_email_skipped', ids(row));
		return 'next';
	}

	// Time may have crossed a boundary since the claim: the clock is read again, with no query.
	const check = sendCheck({ firstAttemptAt: claimed.firstAttemptAt, weekStart: row.weekStart, timeZone: claimed.timeZone, reservedDay: claimed.day }, clock());
	if (check === 'expired') {
		await close('expired');
		logEvent('menu_email_expired', ids(row), 'warn');
		return 'next';
	}
	if (check === 'defer') {
		// The reservation of the past day is not used; a later round reserves on its own day.
		await release(claimed.claimedAt);
		logEvent('menu_email_deferred', { ...ids(row), day: claimed.day });
		return 'next';
	}

	const result = await sendEmail(
		env,
		{ to, subject: claimed.subject, html: claimed.html, text: claimed.text, idempotencyKey: `menu-email/${row.familyId}/${row.weekStart}/${row.userId}` },
		{ fetch: fetchImpl },
	);
	if (result.ok) {
		const at = clock().toISOString();
		const saved = await job((tx) => tx`update app.menu_emails set sent_at = ${at}::timestamptz where ${isOpen(tx, row)} returning 1`);
		if (saved.length === 0) {
			// Closed by another round while the request was in flight: the email left, the row stays as it was closed.
			logEvent('menu_email_sent_after_close', ids(row));
			return 'next';
		}
		logEvent('menu_email_sent', ids(row));
		return 'sent';
	}
	if (result.status === 409 && result.code !== 'concurrent_idempotent_requests') {
		await close('ambiguous');
		logEvent('menu_email_ambiguous', ids(row), 'error');
		return 'next';
	}
	// A lost answer, a network error, a 5xx: the row retries within its window with the same key.
	await release(claimed.claimedAt);
	logEvent('menu_email_failed', { ...ids(row), status: result.status }, 'error');
	// Quota or rate: the other rows wait for the next hour.
	return result.status === 429 ? 'stop' : 'next';
}
