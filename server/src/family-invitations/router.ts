import { createInvitedAccount } from '../accounts/index.ts';
import { hashTokenHex, newToken } from '../app-invitations/tokens.ts';
import { appError } from '../errors.ts';
import { mapFamilyError } from '../family/db-errors.ts';
import { publicContext, type Implementer } from '../pipeline.ts';
import { invitationsView, joinsView } from './views.ts';

/** The token in the fragment: never sent to a server, never in a log or a Referer (spec W11). */
export function familyInvitationUrl(origin: string, token: string): string {
	return `${new URL('/invite', origin).toString()}#${token}`;
}

interface Claim {
	user_id: string | null;
	email: string;
	state: 'create' | 'joined' | 'closed' | 'unavailable';
	member: boolean;
}

export function familyInvitationsRouter(os: Implementer) {
	return {
		list: os.familyInvitations.list.handler(async ({ context, input }) => ({
			invitations: await invitationsView(context.tx, input.familyId).catch(mapFamilyError),
		})),
		create: os.familyInvitations.create.handler(async ({ context, input }) => {
			const token = newToken();
			await context.tx`select app.create_family_invitation(${input.familyId}::uuid, ${input.id}::uuid, decode(${await hashTokenHex(token)}, 'hex'))`
				.catch(mapFamilyError);
			const invitation = (await invitationsView(context.tx, input.familyId)).find((row) => row.id === input.id)!;
			return { invitation, url: familyInvitationUrl(context.origin, token) };
		}),
		revoke: os.familyInvitations.revoke.handler(async ({ context, input }) => {
			await context.tx`select app.revoke_family_invitation(${input.familyId}::uuid, ${input.id}::uuid)`.catch(mapFamilyError);
			return { invitations: await invitationsView(context.tx, input.familyId) };
		}),
		listJoins: os.familyInvitations.listJoins.handler(async ({ context, input }) => ({
			joins: await joinsView(context.tx, input.familyId).catch(mapFamilyError),
		})),
		get: os.familyInvitations.get.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const [row] = await ctx.anonDb((tx) => tx<{ family_name: string; invited_by_name: string | null; accounts_available: boolean }[]>`
				select * from app.family_invitation_by_token(decode(${hex}, 'hex'))`);
			if (!row) throw appError('invitation_unavailable');
			return { familyName: row.family_name, invitedBy: row.invited_by_name, accountsAvailable: row.accounts_available };
		}),
		status: os.familyInvitations.status.handler(async ({ context, input }) => {
			const [row] = await context.tx<{ family_id: string; family_name: string; invited_by_name: string | null; already_member: boolean }[]>`
				select * from app.family_invitation_status(decode(${await hashTokenHex(input.token)}, 'hex'))`;
			if (!row) throw appError('invitation_unavailable');
			return { familyId: row.family_id, familyName: row.family_name, invitedBy: row.invited_by_name, alreadyMember: row.already_member };
		}),

		/**
		 * Spec W11, section 2, following A: reserve (short anon transaction, committed), create the
		 * account with no connection held, join in a second short transaction. A terminal reservation
		 * never calls Auth nor writes: `joined` says whether the person is a member now.
		 */
		accept: os.familyInvitations.accept.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const claim = await ctx
				.anonDb(async (tx) => (await tx<Claim[]>`select * from app.claim_family_invitation(decode(${hex}, 'hex'), ${input.email})`)[0]!)
				.catch(mapFamilyError);
			if (claim.state === 'unavailable') throw appError('invitation_unavailable');
			if (claim.state !== 'create') return { email: claim.email, joined: claim.member };
			const userId = claim.user_id!;
			const outcome = await createInvitedAccount(
				ctx.env,
				{ id: userId, email: claim.email, password: input.password, displayName: input.displayName, locale: input.locale },
				{
					// An id deleted meanwhile is never created again (spec W11, «Ricreazione di un id cancellato»).
					beforeCreate: () => ctx.anonDb(async (tx) => (await tx<{ deleted: boolean }[]>`select app.account_id_deleted(${userId}::uuid) as deleted`)[0]!.deleted),
				},
			);
			if (outcome.status === 'skipped') throw appError('invitation_unavailable');
			if (outcome.status === 'email_taken') throw appError('not_allowed', { reason: 'account_exists' });
			// Nothing was created: the reservation stays, usable with another password.
			if (outcome.status === 'weak_password') throw appError('invalid', { issues: [{ path: ['password'], code: 'weak_password' }] });
			const done = await ctx
				.anonDb(async (tx) => (await tx<{ joined: boolean }[]>`select * from app.complete_family_invitation(${userId}::uuid)`)[0]!)
				.catch(mapFamilyError);
			return { email: claim.email, joined: done.joined };
		}),
	};
}
