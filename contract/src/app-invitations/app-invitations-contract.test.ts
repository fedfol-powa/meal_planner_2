import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { passwordSchema } from '../password.ts';
import { userRowSchema } from '../users/index.ts';
import { invitationEmailSchema } from './index.ts';

type Procedure = { '~orpc': { meta: Record<string, unknown>; inputSchema: { safeParse(v: unknown): { success: boolean; data?: unknown } }; outputSchema: { safeParse(v: unknown): { success: boolean } } } };
const def = (p: unknown) => (p as Procedure)['~orpc'];

const token = 'a'.repeat(43);

describe('appInvitations contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ appInvitations: contract.appInvitations, familyInvitations: contract.familyInvitations })).toEqual([]);
	});
	it('counts the password limit in bytes', () => {
		expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
		expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
		expect(passwordSchema.safeParse('è'.repeat(37)).success).toBe(false); // 74 bytes
		expect(passwordSchema.safeParse('1234567').success).toBe(false);
	});
	it('normalises the email', () => {
		expect(invitationEmailSchema.parse('  New@X.it ')).toBe('new@x.it');
	});
});

describe('acceptance without a password (spec W15, section 7)', () => {
	const input = { token, email: 'new@x.it', displayName: 'Nuova', locale: 'it-IT' };
	for (const area of ['appInvitations', 'familyInvitations'] as const) {
		it(`${area}.accept needs no password and drops one sent by an old client`, () => {
			const accept = def(contract[area].accept);
			expect(accept.inputSchema.safeParse(input).success).toBe(true);
			const old = accept.inputSchema.safeParse({ ...input, password: 'secret-password' });
			expect(old.success).toBe(true);
			expect(old.data).not.toHaveProperty('password');
		});
		it(`${area}.resendPasswordEmail is public, not an MCP tool, rate limited`, () => {
			const resend = def(contract[area].resendPasswordEmail);
			expect(resend.meta).toMatchObject({ role: 'public', mcp: false, offline: false, rateLimit: 'accept' });
			expect(resend.inputSchema.safeParse({ token, email: 'new@x.it', locale: 'en-GB' }).success).toBe(true);
			expect(resend.outputSchema.safeParse({ passwordEmail: 'sent' }).success).toBe(true);
			expect(resend.outputSchema.safeParse({ passwordEmail: 'not_sent' }).success).toBe(false);
		});
	}
	it('answers the outcome of the first email', () => {
		const app = def(contract.appInvitations.accept).outputSchema;
		const family = def(contract.familyInvitations.accept).outputSchema;
		for (const outcome of ['sent', 'failed', 'too_soon', 'not_needed', 'not_sent', 'unavailable']) {
			expect(app.safeParse({ email: 'a@x.it', passwordEmail: outcome }).success, outcome).toBe(true);
			expect(family.safeParse({ email: 'a@x.it', joined: true, passwordEmail: outcome }).success, outcome).toBe(true);
		}
		expect(app.safeParse({ email: 'a@x.it', passwordEmail: 'lost' }).success).toBe(false);
		expect(app.safeParse({ email: 'a@x.it' }).success).toBe(false);
		expect(family.safeParse({ email: 'a@x.it', joined: true }).success).toBe(false);
	});
});

describe('emailUnconfirmed (spec W15, section 2)', () => {
	it('is required in user rows and family members', () => {
		const row = { id: crypto.randomUUID(), displayName: 'A', email: 'a@x.it', roles: [], deletion: null };
		expect(userRowSchema.safeParse(row).success).toBe(false);
		expect(userRowSchema.safeParse({ ...row, emailUnconfirmed: true }).success).toBe(true);
	});
	it('is a version scope of family.get only', () => {
		expect(def(contract.family.get).meta.reads).toEqual(['family', 'emailUnconfirmed']);
	});
});
