import { expect, it } from 'vitest';
import { hashTokenHex, invitationUrl, newToken } from './tokens.ts';

it('makes 43-character base64url tokens, different each time', () => {
	const a = newToken();
	expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	expect(newToken()).not.toBe(a);
});
it('hashes with SHA-256 to hex and builds the link with the token in the fragment', async () => {
	expect(await hashTokenHex('x')).toMatch(/^[0-9a-f]{64}$/);
	expect(invitationUrl('https://app.test', 'abc')).toBe('https://app.test/invite/app#abc');
});
