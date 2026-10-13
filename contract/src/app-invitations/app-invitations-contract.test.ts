import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { invitationEmailSchema, invitationPasswordSchema } from './index.ts';

describe('appInvitations contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ appInvitations: contract.appInvitations })).toEqual([]);
	});
	it('counts the password limit in bytes', () => {
		expect(invitationPasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
		expect(invitationPasswordSchema.safeParse('a'.repeat(73)).success).toBe(false);
		expect(invitationPasswordSchema.safeParse('è'.repeat(37)).success).toBe(false); // 74 bytes
		expect(invitationPasswordSchema.safeParse('1234567').success).toBe(false);
	});
	it('normalises the email', () => {
		expect(invitationEmailSchema.parse('  New@X.it ')).toBe('new@x.it');
	});
});
