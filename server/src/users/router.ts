import { USERS_LIST_LIMIT, type GlobalRole, type Locale, type UserDetail } from '@app/contract';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { mapUsersError } from './db-errors.ts';

interface UserRowDb { id: string; display_name: string; email: string; roles: GlobalRole[] }

const rowView = (row: UserRowDb) => ({ id: row.id, displayName: row.display_name, email: row.email, roles: row.roles });

/** One user, read in the caller's transaction (after a change, the changed state). */
async function detail(tx: Tx, id: string, locale: Locale): Promise<UserDetail> {
	const [row] = await tx<(UserRowDb & { last_app_admin: boolean })[]>`
		select id, display_name, email, roles, last_app_admin from app.admin_user(${id}::uuid)`.catch(mapUsersError);
	if (!row) throw appError('not_found');
	const families = await tx<{ name: string; role: 'family_admin' | 'member' }[]>`
		select name, role from app.admin_user_families(${id}::uuid)`.catch(mapUsersError);
	const collator = new Intl.Collator(locale);
	return {
		user: { ...rowView(row), lastAppAdmin: row.last_app_admin },
		families: families.map(({ name, role }) => ({ name, role })).sort((a, b) => collator.compare(a.name, b.name)),
	};
}

/** App administration of users and global roles (spec W10). The database checks app_admin again. */
export function usersRouter(os: Implementer) {
	return {
		list: os.users.list.handler(async ({ context, input }) => {
			const rows = await context.tx<UserRowDb[]>`
				select id, display_name, email, roles from app.admin_users(${input.query ?? ''}, ${USERS_LIST_LIMIT})`.catch(mapUsersError);
			return { users: rows.slice(0, USERS_LIST_LIMIT).map(rowView), more: rows.length > USERS_LIST_LIMIT };
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
	};
}
