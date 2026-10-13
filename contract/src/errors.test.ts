import { describe, expect, it } from 'vitest';
import { conflictData, errorCodes, errorDefinitions, notAllowedData } from './errors.ts';

describe('catalogue errors', () => {
	it('declares not_allowed as a 409 with a reason', () => {
		expect(errorCodes).toContain('not_allowed');
		expect(errorDefinitions.not_allowed.status).toBe(409);
		expect(notAllowedData.parse({ reason: 'cited_by_meals' })).toEqual({ reason: 'cited_by_meals' });
		expect(() => notAllowedData.parse({ reason: 'other' })).toThrow();
	});

	it('not_allowed carries the reasons of the meal undo', () => {
		for (const reason of ['not_own_change', 'changed_since', 'draft_closed']) expect(notAllowedData.parse({ reason })).toEqual({ reason });
	});

	it('tells the three conflicts apart', () => {
		const at = '2026-10-11T10:00:00.000Z';
		const by = crypto.randomUUID();
		expect(conflictData.parse({ kind: 'draft', revision: 3, by, byName: 'Lucia', at, theirFields: ['name'], myFields: ['ingredients'], theirs: { schemaVersion: 1 } }).kind).toBe('draft');
		expect(conflictData.parse({ kind: 'version', version: 2, by: null, byName: null, at }).kind).toBe('version');
		expect(conflictData.parse({ kind: 'ingredient', version: 4, by, byName: null, at, fields: ['department'] }).kind).toBe('ingredient');
		expect(() => conflictData.parse({ by, at, fields: [] })).toThrow();
	});
});

describe('invitation errors', () => {
	it('has the invitation and rate-limit codes', () => {
		expect(errorDefinitions.invitation_unavailable.status).toBe(410);
		expect(errorDefinitions.rate_limited.status).toBe(429);
		expect(notAllowedData.parse({ reason: 'account_exists' })).toEqual({ reason: 'account_exists' });
		expect(notAllowedData.parse({ reason: 'already_accepted' })).toEqual({ reason: 'already_accepted' });
	});
});
