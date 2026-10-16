import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';
import { displayNameSchema } from '../profile/index.ts';

export const globalRoleSchema = z.enum(['recipe_curator', 'app_admin']);
export type GlobalRole = z.infer<typeof globalRoleSchema>;
export const PASSWORD_MAX_BYTES = 72;
export const invitationEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** 8 characters as the web app; at most 72 bytes, bcrypt's limit (spec W9). */
export const invitationPasswordSchema = z
	.string()
	.min(8)
	.refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, { message: 'password_too_long' });

const rolesSchema = z.array(globalRoleSchema).max(2).refine((roles) => new Set(roles).size === roles.length, { message: 'duplicate' });

export const appInvitationViewSchema = z.object({
	id: z.uuid(),
	/** Null once the account it belongs to was deleted (the invitation stays, without the email). */
	email: z.string().nullable(),
	roles: z.array(globalRoleSchema),
	/** `expired`: still pending in the database, so it can be revoked (a reserved one can still be closed). */
	status: z.enum(['pending', 'expired', 'accepted', 'revoked']),
	createdBy: z.uuid().nullable(),
	createdByName: z.string().nullable(),
	createdAt: z.iso.datetime(),
	expiresAt: z.iso.datetime(),
	acceptedByName: z.string().nullable(),
	acceptedAt: z.iso.datetime().nullable(),
	revokedAt: z.iso.datetime().nullable(),
});
export type AppInvitationView = z.infer<typeof appInvitationViewSchema>;

const adminOp = (readOnly: boolean) => op({ mcp: { readOnly }, offline: false, role: 'appAdmin' });

export const appInvitationsContract = {
	create: op({ mcp: { readOnly: false }, offline: false, role: 'appAdmin', creates: true })
		.route({
			method: 'POST',
			path: '/app-invitations',
			summary:
				'Invite a person to the app by email, optionally as recipe curator or app administrator (app administrators). Returns the link once: send it yourself; a new invitation to the same email replaces the pending one',
		})
		.errors({ not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ id: z.uuid(), email: invitationEmailSchema, roles: rolesSchema }))
		.output(z.object({ invitation: appInvitationViewSchema, url: z.url() })),
	list: adminOp(true)
		.route({ method: 'GET', path: '/app-invitations', summary: 'App invitations with status and expiry, newest first (app administrators)' })
		.input(z.object({}))
		.output(z.object({ invitations: z.array(appInvitationViewSchema) })),
	revoke: adminOp(false)
		.route({ method: 'POST', path: '/app-invitations/{id}/revoke', summary: 'Revoke a pending or expired app invitation (app administrators)' })
		.errors({ not_found: errorDefinitions.not_found, not_allowed: errorDefinitions.not_allowed })
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ invitation: appInvitationViewSchema })),
	get: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
		.route({ method: 'POST', path: '/app-invitations/open', summary: 'Who invites and with which roles, from the link (no sign-in)' })
		.errors({ invitation_unavailable: errorDefinitions.invitation_unavailable, rate_limited: errorDefinitions.rate_limited })
		.input(z.object({ token: invitationTokenSchema }))
		.output(z.object({ invitedBy: z.string().nullable(), roles: z.array(globalRoleSchema) })),
	accept: op({ mcp: false, offline: false, role: 'public', rateLimit: 'accept' })
		.route({ method: 'POST', path: '/app-invitations/accept', summary: 'Accept an app invitation: creates the account (no sign-in)' })
		.errors({
			invitation_unavailable: errorDefinitions.invitation_unavailable,
			rate_limited: errorDefinitions.rate_limited,
			not_allowed: errorDefinitions.not_allowed,
		})
		.input(
			z.object({
				token: invitationTokenSchema,
				email: invitationEmailSchema,
				displayName: displayNameSchema,
				password: invitationPasswordSchema,
				locale: localeSchema,
			}),
		)
		.output(z.object({ email: z.string() })),
};
