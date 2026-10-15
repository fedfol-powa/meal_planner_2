import { z } from 'zod';
import { globalRoleSchema } from '../app-invitations/index.ts';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { familyRoleSchema } from '../profile/index.ts';

/** At most this many users per answer; `more` says there are others (spec W10, decision 1). */
export const USERS_LIST_LIMIT = 50;
/** The longest search accepted, after trimming; the web field stops typing here. */
export const USER_QUERY_MAX = 100;
export const userQuerySchema = z.string().trim().max(USER_QUERY_MAX);

export const userRowSchema = z.object({
	id: z.uuid(),
	displayName: z.string(),
	email: z.string(),
	roles: z.array(globalRoleSchema),
});
export type UserRow = z.infer<typeof userRowSchema>;

/** Families by name and role only: app admins never see family contents (spec, section 2). */
export const userDetailSchema = z.object({
	user: userRowSchema.extend({ lastAppAdmin: z.boolean() }),
	families: z.array(z.object({ name: z.string(), role: familyRoleSchema })),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

const adminOp = (readOnly: boolean) => op({ mcp: { readOnly }, offline: false, role: 'appAdmin' });

export const usersContract = {
	list: adminOp(true)
		.route({
			method: 'GET',
			path: '/users',
			summary: `Users with email and global roles, by name or email (case-insensitive, accents count), at most ${USERS_LIST_LIMIT}; \`more\` means narrow the search (app administrators)`,
		})
		.input(z.object({ query: userQuerySchema.optional() }))
		.output(z.object({ users: z.array(userRowSchema), more: z.boolean() })),
	get: adminOp(true)
		.route({ method: 'GET', path: '/users/{id}', summary: 'One user: email, global roles, whether they are the last app administrator, families by name and role only (app administrators)' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(z.object({ id: z.uuid() }))
		.output(userDetailSchema),
	setRole: adminOp(false)
		.route({
			method: 'POST',
			path: '/users/{id}/roles',
			summary:
				'Give (granted: true) or remove (granted: false) a global role; repeating it changes nothing. Before appointing an app administrator, and before removing app_admin from yourself, ask the user for explicit confirmation. Removing your own app_admin ends your administration tools from the next call. The last app administrator cannot lose the role (app administrators)',
		})
		.errors({ not_found: errorDefinitions.not_found, last_app_admin: errorDefinitions.last_app_admin })
		.input(z.object({ id: z.uuid(), role: globalRoleSchema, granted: z.boolean() }))
		.output(userDetailSchema),
};
