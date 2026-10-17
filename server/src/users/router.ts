import { USERS_LIST_LIMIT, type GlobalRole, type Locale, type UserDetail } from '@app/contract';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { deleteUserAccount, readDeletionPlan } from '../account/delete.ts';
import { mapUsersError } from './db-errors.ts';

interface UserRowDb { id: string; display_name: string; email: string; roles: GlobalRole[] }
type Deletions = Map<string, { requestedAt: string; attempts: number }>;

/** Deletions waiting for Auth (spec W11): one read, merged into the rows. */
async function pendingDeletions(tx: Tx): Promise<Deletions> {
	const rows = await tx<{ user_id: string; requested_at: Date; attempts: number }[]>`
		select user_id, requested_at, attempts from app.admin_account_deletions()`.catch(mapUsersError);
	return new Map(rows.map((row) => [row.user_id, { requestedAt: row.requested_at.toISOString(), attempts: row.attempts }]));
}

/**
 * Accounts from an invitation whose email is not confirmed yet (spec W15, section 2): one read for
 * the page. The ids travel as text: no array serializer without fetch_types.
 */
async function unconfirmedOf(tx: Tx, ids: string[]): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = await tx<{ user_id: string; unconfirmed: boolean }[]>`
		select user_id, unconfirmed from app.admin_email_unconfirmed(string_to_array(${ids.join(',')}, ',')::uuid[])`.catch(mapUsersError);
	return new Set(rows.filter((row) => row.unconfirmed).map((row) => row.user_id));
}

const rowView = (row: UserRowDb, deletions: Deletions, unconfirmed: Set<string>) => ({
	id: row.id, displayName: row.display_name, email: row.email, roles: row.roles, deletion: deletions.get(row.id) ?? null,
	emailUnconfirmed: unconfirmed.has(row.id),
});

/** One's own account is deleted from the preferences (spec W11, P0A12, raised here). */
function notOwn(context: { userId: string }, id: string) {
	if (id === context.userId) throw appError('not_allowed', { reason: 'own_account' });
}

/** One user, read in the caller's transaction (after a change, the changed state). */
async function detail(tx: Tx, id: string, locale: Locale): Promise<UserDetail> {
	const [row] = await tx<(UserRowDb & { last_app_admin: boolean })[]>`
		select id, display_name, email, roles, last_app_admin from app.admin_user(${id}::uuid)`.catch(mapUsersError);
	if (!row) throw appError('not_found');
	const families = await tx<{ name: string; role: 'family_admin' | 'member' }[]>`
		select name, role from app.admin_user_families(${id}::uuid)`.catch(mapUsersError);
	const collator = new Intl.Collator(locale);
	return {
		user: { ...rowView(row, await pendingDeletions(tx), await unconfirmedOf(tx, [row.id])), lastAppAdmin: row.last_app_admin },
		families: families.map(({ name, role }) => ({ name, role })).sort((a, b) => collator.compare(a.name, b.name)),
	};
}

/** App administration of users and global roles (spec W10). The database checks app_admin again. */
export function usersRouter(os: Implementer) {
	return {
		list: os.users.list.handler(async ({ context, input }) => {
			const rows = await context.tx<UserRowDb[]>`
				select id, display_name, email, roles from app.admin_users(${input.query ?? ''}, ${USERS_LIST_LIMIT})`.catch(mapUsersError);
			const page = rows.slice(0, USERS_LIST_LIMIT);
			const deletions = await pendingDeletions(context.tx);
			const unconfirmed = await unconfirmedOf(context.tx, page.map((row) => row.id));
			return { users: page.map((row) => rowView(row, deletions, unconfirmed)), more: rows.length > USERS_LIST_LIMIT };
		}),
		get: os.users.get.handler(({ context, input }) => detail(context.tx, input.id, context.locale)),
		setRole: os.users.setRole.handler(async ({ context, input }) => {
			// The detail first: after giving up one's own app_admin the reading functions refuse.
			const before = await detail(context.tx, input.id, context.locale);
			const [{ roles }] = await context.tx<{ roles: GlobalRole[] }[]>`
				select app.set_user_role(${input.id}::uuid, ${input.role}, ${input.granted}) as roles`.catch(mapUsersError);
			if (input.id === context.userId && input.role === 'app_admin' && !input.granted) {
				// Roles as left by the removal, under its lock (another administrator may have changed
				// curator meanwhile); name, email and families from just before, which roles do not touch.
				return { ...before, user: { ...before.user, roles, lastAppAdmin: false } };
			}
			return detail(context.tx, input.id, context.locale);
		}),
		getDeletionPlan: os.users.getDeletionPlan.handler(async ({ context, input }) => {
			notOwn(context, input.id);
			const plan = await readDeletionPlan(context.tx, input.id);
			if (!plan) throw appError('not_found');
			const { user } = await detail(context.tx, input.id, context.locale);
			return { ...plan, user: { id: user.id, displayName: user.displayName, email: user.email } };
		}),
		/** «Completa la cancellazione»: a pending row repeats only the Auth step. */
		delete: os.users.delete.handler(async ({ context, input }) => {
			notOwn(context, input.id);
			const { id, ...plan } = input;
			const pending = (await pendingDeletions(context.tx)).has(id);
			return deleteUserAccount(context, id, plan, `/admin/users/${id}/delete`, pending);
		}),
	};
}
