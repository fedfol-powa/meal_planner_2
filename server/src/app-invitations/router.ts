import type { GlobalRole, Locale } from '@app/contract';
import { createInvitedAccount } from '../accounts/index.ts';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { publicContext, type Implementer, type PublicOperationContext } from '../pipeline.ts';
import { mapInvitationError } from './db-errors.ts';
import { deliverPasswordEmail, deliverPasswordEmailSafely, type PasswordEmailGrant } from './password-email.ts';
import { hashTokenHex, invitationUrl, newToken } from './tokens.ts';
import { invitationView, type InvitationRow } from './views.ts';

async function viewOf(tx: Tx, id: string, now: Date) {
	const [row] = await tx<InvitationRow[]>`select * from app.app_invitations_view() where id = ${id}`;
	return invitationView(row!, now);
}

const passwordEmailOf = (ctx: PublicOperationContext, hex: string, email: string, locale: Locale, deliver = deliverPasswordEmail) =>
	deliver(ctx, (tx) => tx<PasswordEmailGrant[]>`
		select * from app.app_invitation_password_email(decode(${hex}, 'hex'), ${email})`, locale);

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
		get: os.appInvitations.get.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const [row] = await ctx.anonDb((tx) => tx<{ invited_by_name: string | null; roles: GlobalRole[] }[]>`
				select invited_by_name, roles from app.app_invitation_by_token(decode(${hex}, 'hex'))`);
			if (!row) throw appError('invitation_unavailable');
			return { invitedBy: row.invited_by_name, roles: row.roles };
		}),

		/**
		 * Spec W9, «Accettazione»: reserve the id (short anon transaction, committed), create the
		 * account with no connection held, close in a second short transaction. Each step repeats;
		 * an existing account is never rewritten. Spec W15: the account has the email to confirm;
		 * after the closing, the email to choose the password. A failing email never undoes the
		 * acceptance.
		 */
		accept: os.appInvitations.accept.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const hex = await hashTokenHex(input.token);
			const reserved = await ctx
				.anonDb(async (tx) => {
					const [row] = await tx<{ user_id: string; email: string }[]>`
						select user_id, email from app.claim_app_invitation(decode(${hex}, 'hex'), ${input.email})`;
					return row!;
				})
				.catch(mapInvitationError);
			const outcome = await createInvitedAccount(ctx.env, {
				id: reserved.user_id,
				email: reserved.email,
				displayName: input.displayName,
				locale: input.locale,
			});
			if (outcome.status === 'email_taken') throw appError('not_allowed', { reason: 'account_exists' });
			await ctx
				.anonDb((tx) => tx`select app.complete_app_invitation(decode(${hex}, 'hex'), ${reserved.user_id}::uuid)`)
				.catch(mapInvitationError);
			const passwordEmail = await passwordEmailOf(ctx, hex, reserved.email, input.locale, deliverPasswordEmailSafely);
			return { email: reserved.email, passwordEmail };
		}),
		resendPasswordEmail: os.appInvitations.resendPasswordEmail.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			return { passwordEmail: await passwordEmailOf(ctx, await hashTokenHex(input.token), input.email, input.locale) };
		}),
	};
}
