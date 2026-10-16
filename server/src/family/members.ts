import { hashTokenHex } from '../app-invitations/tokens.ts';
import type { Implementer } from '../pipeline.ts';
import { profileView } from '../profile/views.ts';
import { mapFamilyError } from './db-errors.ts';

/** Members, roles, leaving and deletion of a family (spec W11, section 2). */
export function familyMembersRouter(os: Implementer) {
	return {
		/** With an existing account: the family becomes the one shown. */
		join: os.family.join.handler(async ({ context, input }) => {
			await context.tx`select app.join_family(decode(${await hashTokenHex(input.token)}, 'hex'))`.catch(mapFamilyError);
			return profileView(context.tx, context.locale);
		}),
	};
}
