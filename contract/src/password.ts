import { z } from 'zod';

export const PASSWORD_MAX_BYTES = 72;
/** 8 characters as the web app; at most 72 bytes, bcrypt's limit (spec W9). */
export const passwordSchema = z
	.string()
	.min(8)
	.refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, { message: 'password_too_long' });

/**
 * The "choose your password" email after an acceptance (spec W15, section 2): `not_sent` when the
 * family link was already used with this email, `unavailable` when the account is gone.
 */
export const passwordEmailSchema = z.enum(['sent', 'failed', 'too_soon', 'not_needed', 'not_sent', 'unavailable']);
export type PasswordEmailOutcome = z.infer<typeof passwordEmailSchema>;
/** The outcome of "Rimanda l'email" from the invitation page. */
export const resendOutcomeSchema = z.enum(['sent', 'failed', 'too_soon', 'not_needed', 'unavailable']);
export type ResendOutcome = z.infer<typeof resendOutcomeSchema>;
