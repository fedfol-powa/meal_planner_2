import type { Locale, ResendOutcome } from '@app/contract';
import { sendPasswordEmail } from '../accounts/index.ts';
import type { Tx } from '../db.ts';
import type { PublicOperationContext } from '../pipeline.ts';

/** Answer of app.app_invitation_password_email / app.family_invitation_password_email. */
export interface PasswordEmailGrant {
	user_id: string | null;
	email: string | null;
	family_name?: string | null;
	state: 'send' | 'too_soon' | 'not_needed' | 'unavailable';
}

/**
 * The "choose your password" email of an invitation (spec W15, section 2): the SQL function
 * authorises it with link and email and spaces the sends (a short anon transaction), then, with
 * no transaction open, Auth gives the link and Resend sends it. An account gone at either step is
 * `unavailable`; nothing is ever created again.
 */
export async function deliverPasswordEmail(
	ctx: PublicOperationContext,
	authorise: (tx: Tx) => Promise<PasswordEmailGrant[]>,
	locale: Locale,
): Promise<ResendOutcome> {
	const [grant] = await ctx.anonDb(authorise);
	if (!grant || grant.state === 'unavailable') return 'unavailable';
	if (grant.state !== 'send') return grant.state;
	const sent = await sendPasswordEmail(ctx.env, { email: grant.email!, locale, familyName: grant.family_name ?? null }, ctx.origin);
	return sent === 'absent' ? 'unavailable' : sent;
}
