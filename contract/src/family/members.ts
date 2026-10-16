import { z } from 'zod';
import { invitationTokenSchema } from '../app-invitations/index.ts';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { familyRoleSchema, profileViewSchema } from '../profile/index.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { familyViewSchema } from './views.ts';

const family = z.object({ familyId: z.uuid() });

export const familyDeletionViewSchema = z.object({
	name: z.string(),
	memberNames: z.array(z.string()),
	weekCount: z.number().int().min(0),
	/** Only family administrators delete the family. */
	canDelete: z.boolean(),
});
export type FamilyDeletionView = z.infer<typeof familyDeletionViewSchema>;

/** Members, roles, leaving and deletion of a family (spec W11, section 2). */
export const familyMembersContract = {
	join: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/family-invitations/join',
			summary:
				'Join a family with an invitation link, as a member; the family becomes the one shown. Ask the person to confirm before joining. Returns your profile',
		})
		.errors({ invitation_unavailable: errorDefinitions.invitation_unavailable })
		.input(z.object({ token: invitationTokenSchema }))
		.output(profileViewSchema),
	setMemberRole: op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' })
		.route({
			method: 'PUT',
			path: '/families/{familyId}/members/{userId}/role',
			summary:
				'Make a member a family administrator or a plain member (family administrators). The family keeps at least one administrator; the invitation links of a demoted person stop working',
		})
		.errors({ not_found: errorDefinitions.not_found, last_admin: errorDefinitions.last_admin })
		.input(family.extend({ userId: z.uuid(), role: familyRoleSchema }))
		.output(familyViewSchema),
	removeMember: op({ mcp: { readOnly: false }, offline: false, role: 'familyAdmin' })
		.route({
			method: 'DELETE',
			path: '/families/{familyId}/members/{userId}',
			summary:
				'Remove someone from the family (family administrators). Their ratings leave the family average, their changes stay as "former member", their invitation links stop working; coming back needs a new link',
		})
		.input(family.extend({ userId: z.uuid() }))
		.output(familyViewSchema),
	leave: op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' })
		.route({
			method: 'POST',
			path: '/families/{familyId}/leave',
			summary:
				'Leave the family. The last administrator names a successor among the members (successorId); the only member must delete the family instead. Your ratings leave the family average and your invitation links stop working. Returns your profile',
		})
		.errors({ sole_member: errorDefinitions.sole_member })
		.input(family.extend({ successorId: z.uuid().optional() }))
		.output(profileViewSchema),
	getDeletion: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family'] })
		.route({
			method: 'GET',
			path: '/families/{familyId}/deletion',
			summary: 'What deleting the family removes: name, members and weeks of menus; whether you can delete it',
		})
		.input(versionedInput(family))
		.output(versionedOutput(familyDeletionViewSchema)),
	delete: op({ mcp: { readOnly: false }, webOnly: { path: '/profile/family/delete?family=:familyId' }, offline: false, role: 'familyAdmin' })
		.route({
			method: 'DELETE',
			path: '/families/{familyId}',
			summary:
				'Delete the family and all its data for every member (family administrators, web app only: agents get the page link). Accounts, personal ratings, other families and the recipe book stay',
		})
		.input(family)
		.output(profileViewSchema),
};
