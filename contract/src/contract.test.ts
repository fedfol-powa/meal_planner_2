import { describe, expect, it } from 'vitest';
import { checkContract } from './check.ts';
import { contract } from './contract.ts';
import { errorCodes, errorDefinitions } from './errors.ts';

describe('the published contract', () => {
	it('follows the conventions', () => {
		expect(checkContract(contract)).toEqual([]);
	});

	it('defines a status for every error code', () => {
		for (const code of errorCodes) expect(errorDefinitions[code].status).toBeGreaterThanOrEqual(400);
	});

	it('exposes session.whoami as a read-only tool for any user', () => {
		expect(contract.session.whoami['~orpc'].meta).toEqual({ mcp: { readOnly: true }, offline: false, role: 'user' });
	});
});
