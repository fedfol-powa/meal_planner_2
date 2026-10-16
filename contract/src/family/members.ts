import { z } from 'zod';
import { invitationTokenSchema } from '../app-invitations/index.ts';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { profileViewSchema } from '../profile/index.ts';

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
};
