import { z } from 'zod';
import { invitationEmailSchema, invitationPasswordSchema, invitationTokenSchema } from '../app-invitations/index.ts';
import { errorDefinitions } from '../errors.ts';
import { localeSchema } from '../locale.ts';
import { op } from '../op.ts';
import { displayNameSchema } from '../profile/index.ts';

/** New accounts a link can register (spec W11, decision 1): distinct emails that started to register. */
export const FAMILY_INVITATION_ACCOUNT_LIMIT = 10;

export const familyInvitationSchema = z.object({
	id: z.uuid(),
	createdBy: z.uuid().nullable(),
	/** null: the author is no longer a member ("ex membro"). */
	createdByName: z.string().nullable(),
	createdAt: z.iso.datetime({ offset: true }),
	expiresAt: z.iso.datetime({ offset: true }),
	registrations: z.number().int().min(0).max(FAMILY_INVITATION_ACCOUNT_LIMIT),
	pendingRegistrations: z.number().int().min(0),
	/** Expired but open: listed only while registrations are pending. */
	expired: z.boolean(),
});
export type FamilyInvitationView = z.infer<typeof familyInvitationSchema>;

export const familyJoinSchema = z.object({
	joinedAt: z.iso.datetime({ offset: true }),
	mode: z.enum(['new_account', 'existing_account']),
	/** null: no longer a member ("ex membro"). */
	userName: z.string().nullable(),
	invitationId: z.uuid(),
	invitationCreatedByName: z.string().nullable(),
	invitationCreatedAt: z.iso.datetime({ offset: true }),
});
export type FamilyJoinView = z.infer<typeof familyJoinSchema>;

const family = z.object({ familyId: z.uuid() });
const token = z.object({ token: invitationTokenSchema });
const unavailable = { invitation_unavailable: errorDefinitions.invitation_unavailable };

export const familyInvitationsContract = {
	list: op({ mcp: { readOnly: true }, offline: false, role: 'familyAdmin' })
		.route({
			method: 'GET',
			path: '/families/{familyId}/invitations',
			summary: 'Open invitation links of a family with author, expiry and people registered (family administrators); links are shown only when created',
		})
		.input(family)
		.output(z.object({ invitations: z.array(familyInvitationSchema) })),
	create: op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin', creates: true })
		.route({
			method: 'POST',
			path: '/families/{familyId}/invitations',
			summary:
				'Create an invitation link to the family, valid 7 days (family administrators). The link is shown only now: send it yourself. Whoever opens it joins as a member; at most 10 new accounts per link',
		})
		.input(family.extend({ id: z.uuid() }))
		.output(z.object({ invitation: familyInvitationSchema, url: z.url() })),
	revoke: op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' })
		.route({ method: 'DELETE', path: '/families/{familyId}/invitations/{id}', summary: 'Revoke an invitation link of the family (family administrators)' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(family.extend({ id: z.uuid() }))
		.output(z.object({ invitations: z.array(familyInvitationSchema) })),
	listJoins: op({ mcp: { readOnly: true }, offline: false, role: 'familyAdmin' })
		.route({
			method: 'GET',
			path: '/families/{familyId}/joins',
			summary: 'The last 50 people who joined the family with a link, with the link author and whether the account was new (family administrators)',
		})
		.input(family)
		.output(z.object({ joins: z.array(familyJoinSchema).max(50) })),
	get: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
		.route({ method: 'POST', path: '/family-invitations/read', summary: 'Family name and who invites, from the link (no sign-in)' })
		.errors({ ...unavailable, rate_limited: errorDefinitions.rate_limited })
		.input(token)
		.output(z.object({ familyName: z.string(), invitedBy: z.string().nullable(), accountsAvailable: z.boolean() })),
	status: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/family-invitations/status',
			summary: 'Which family a link invites you to and whether you already belong to it',
		})
		.errors(unavailable)
		.input(token)
		.output(z.object({ familyId: z.uuid(), familyName: z.string(), invitedBy: z.string().nullable(), alreadyMember: z.boolean() })),
	accept: op({ mcp: false, offline: false, role: 'public', rateLimit: 'accept' })
		.route({ method: 'POST', path: '/family-invitations/accept', summary: 'Create an account from a family link and join the family (no sign-in)' })
		.errors({ ...unavailable, rate_limited: errorDefinitions.rate_limited, not_allowed: errorDefinitions.not_allowed })
		.input(
			token.extend({
				email: invitationEmailSchema,
				displayName: displayNameSchema,
				password: invitationPasswordSchema,
				locale: localeSchema,
			}),
		)
		/** `joined: false`: the account is ready but the link no longer lets it in (spec W11, decision 17). */
		.output(z.object({ email: z.string(), joined: z.boolean() })),
};
