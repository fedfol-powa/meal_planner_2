import postgres from 'postgres';
import { withDb } from '../db.ts';
import type { Env } from '../env.ts';
import { diagnosticOf } from '../errors.ts';
import { logEvent } from '../log.ts';
import { raiseAlert } from '../ops-alerts/raise.ts';
import { attemptAccountDeletion } from './delete.ts';

/** Idle rows only: a request still running its own Auth step is never overtaken. */
const IDLE = '5 minutes';
/** From the third failed attempt (about three hours) the row is reported as overdue, at every run. */
const OVERDUE_ATTEMPTS = 3;

/**
 * Hourly resume of the account deletions waiting for Auth (spec W11, section 2): no giving up, the
 * app data is already gone and the account must close. Logs carry ids, codes and numbers only.
 */
export async function resumeAccountDeletions(env: Env, _now: Date): Promise<void> {
	const rows = await withDb(env.HYPERDRIVE.connectionString, { kind: 'job' }, (tx) =>
		tx<{ user_id: string }[]>`select user_id from app.pending_account_deletions(${IDLE}::interval)`);
	// Opened only if an alert is raised: postgres.js connects at the first query.
	let alerts: postgres.Sql | null = null;
	try {
		for (const { user_id: userId } of rows) {
			let attempts: number | null;
			try {
				attempts = await attemptAccountDeletion(env, userId);
				if (attempts === null) logEvent('account_deletion_resumed', { userId });
				else if (attempts >= OVERDUE_ATTEMPTS) logEvent('account_deletion_overdue', { userId, attempts }, 'error');
			} catch (error) {
				// The database answering for this row: the others go on, the row stays for the next run.
				logEvent('account_deletion_resume_failed', { userId, code: diagnosticOf(error).code ?? diagnosticOf(error).name }, 'error');
				continue;
			}
			if (attempts !== null && attempts >= OVERDUE_ATTEMPTS) {
				alerts ??= postgres(env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
				// Own transaction, never throws: the resume goes on whatever happens to the alert.
				await raiseAlert(alerts, { event: 'account_deletion_overdue', key: userId, details: { userId, attempts } }, { env });
			}
		}
	} finally {
		await alerts?.end().catch(() => {});
	}
}
