import { withDb } from '../db.ts';
import type { Env } from '../env.ts';
import { diagnosticOf } from '../errors.ts';
import { logEvent } from '../log.ts';
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
	for (const { user_id: userId } of rows) {
		try {
			const attempts = await attemptAccountDeletion(env, userId);
			if (attempts === null) logEvent('account_deletion_resumed', { userId });
			else if (attempts >= OVERDUE_ATTEMPTS) logEvent('account_deletion_overdue', { userId, attempts }, 'error');
		} catch (error) {
			// The database answering for this row: the others go on, the row stays for the next run.
			logEvent('account_deletion_resume_failed', { userId, code: diagnosticOf(error).code ?? diagnosticOf(error).name }, 'error');
		}
	}
}
