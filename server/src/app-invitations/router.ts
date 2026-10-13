import type { Tx } from '../db.ts';
import type { Implementer } from '../pipeline.ts';
import { mapInvitationError } from './db-errors.ts';
import { hashTokenHex, invitationUrl, newToken } from './tokens.ts';
import { invitationView, type InvitationRow } from './views.ts';

async function viewOf(tx: Tx, id: string, now: Date) {
	const [row] = await tx<InvitationRow[]>`select * from app.app_invitations_view() where id = ${id}`;
	return invitationView(row!, now);
}

export function appInvitationsRouter(os: Implementer) {
	return {
		create: os.appInvitations.create.handler(async ({ context, input }) => {
			const token = newToken();
			try {
				await context.tx`select app.create_app_invitation(
					${input.id}::uuid, decode(${await hashTokenHex(token)}, 'hex'), ${input.email}, ${context.tx.json(input.roles)})`;
			} catch (error) {
				mapInvitationError(error);
			}
			return { invitation: await viewOf(context.tx, input.id, context.now), url: invitationUrl(context.origin, token) };
		}),
		list: os.appInvitations.list.handler(async ({ context }) => {
			const rows = await context.tx<InvitationRow[]>`select * from app.app_invitations_view()`.catch(mapInvitationError);
			return { invitations: rows.map((row) => invitationView(row, context.now)) };
		}),
		revoke: os.appInvitations.revoke.handler(async ({ context, input }) => {
			await context.tx`select app.revoke_app_invitation(${input.id}::uuid)`.catch(mapInvitationError);
			return { invitation: await viewOf(context.tx, input.id, context.now) };
		}),
		get: os.appInvitations.get.handler(async () => {
			throw new Error('appInvitations.get: written in task 6');
		}),
		accept: os.appInvitations.accept.handler(async () => {
			throw new Error('appInvitations.accept: written in task 6');
		}),
	};
}
