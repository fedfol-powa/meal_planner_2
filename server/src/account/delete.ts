import type { DeletionInput, DeletionPlan } from '@app/contract';
import { AccountServiceError, deleteAccount } from '../accounts/index.ts';
import { withDb, type Tx } from '../db.ts';
import type { Env } from '../env.ts';
import { appError } from '../errors.ts';
import { logEvent } from '../log.ts';
import { afterCommit, type OperationContext } from '../pipeline.ts';

/** Only a code in the row and the log: auth_admin_failed, auth_admin_key_missing, status_<n>. */
function failureCode(error: unknown): string {
	if (error instanceof AccountServiceError) return error.status ? `status_${error.status}` : error.reason;
	return 'auth_admin_failed';
}

/**
 * Second and third step of an account deletion (spec W11, section 4): the account leaves Auth, then
 * the row is closed as the job identity. A failure is recorded, not thrown: the hourly resume
 * retries it. True when completed.
 */
export async function finishAccountDeletion(env: Env, userId: string): Promise<boolean> {
	const record = (code: string | null) =>
		withDb(env.HYPERDRIVE.connectionString, { kind: 'job' }, async (tx) =>
			(await tx<{ attempts: number }[]>`select app.record_account_deletion_attempt(${userId}::uuid, ${code}) as attempts`)[0]!.attempts);
	try {
		await deleteAccount(env, userId);
	} catch (error) {
		const code = failureCode(error);
		const attempts = await record(code);
		logEvent('account_deletion_failed', { userId, code, attempts });
		return false;
	}
	await record(null);
	return true;
}

/** The plan of app.account_deletion_plan(); null for an unknown user (in a savepoint: the transaction goes on). */
export async function readDeletionPlan(tx: Tx, userId: string): Promise<DeletionPlan | null> {
	try {
		const [{ plan }] = await tx.savepoint((sp) => sp<{ plan: DeletionPlan }[]>`select app.account_deletion_plan(${userId}::uuid) as plan`);
		return plan;
	} catch (error) {
		if ((error as { code?: string }).code === 'P0A07') return null;
		return mapDeletionError(error, '');
	}
}

/** SQLSTATEs of the account deletion functions; `pageUrl` is the web page agents are sent to. */
export function mapDeletionError(error: unknown, pageUrl: string): never {
	switch ((error as { code?: unknown } | null)?.code) {
		case '42501': throw appError('forbidden');
		case 'P0A07': throw appError('not_found');
		case 'P0A08': throw appError('last_app_admin');
		case 'P0A11': throw appError('conflict');
		case 'P0A13': throw appError('invalid', { issues: [{ path: ['successors'], code: 'successor' }] });
		case 'P0A15': throw appError('web_only', { url: pageUrl });
		default: throw error;
	}
}

/**
 * First transaction (begin_account_deletion, which holds the real channel rule under its locks),
 * then Auth and the closing after the commit. An agent whose plan deletes a family gets the page
 * at once, as a shortcut. `pending`: the first transaction already ran, only Auth is repeated.
 */
export async function deleteUserAccount(
	context: OperationContext,
	userId: string,
	input: DeletionInput,
	pagePath: string,
	pending = false,
) {
	const pageUrl = new URL(pagePath, context.origin).toString();
	if (!pending) {
		const plan = await readDeletionPlan(context.tx, userId);
		if (plan && context.channel === 'mcp' && plan.families.some((family) => family.outcome === 'deleted')) {
			throw appError('web_only', { url: pageUrl });
		}
		// Arrays travel as jsonb: no text[] serializer without fetch_types (as for the roles of A).
		await context.tx`select app.begin_account_deletion(${userId}::uuid, ${context.tx.json(input.successors)}::jsonb,
			array(select jsonb_array_elements_text(${context.tx.json(input.deletedFamilies)}::jsonb))::uuid[])`
			.catch((error) => mapDeletionError(error, pageUrl));
	}
	const env = context.env;
	return afterCommit(async () => ({ completed: await finishAccountDeletion(env, userId) }));
}
