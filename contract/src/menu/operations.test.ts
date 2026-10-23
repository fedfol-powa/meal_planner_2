import { describe, expect, it } from 'vitest';
import { checkContract } from '../index.ts';
import { profileContract } from '../profile/index.ts';
import { menuContract } from './operations.ts';
import { weekView } from './views.ts';

describe('menu contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ menu: menuContract })).toEqual([]);
	});
	it('declares versioned, read-only family reads', () => {
		for (const operation of [menuContract.getOpening, menuContract.getWeek, menuContract.getDates]) {
			expect(operation['~orpc'].meta).toMatchObject({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] });
		}
	});
	it('accepts an empty week of seven days and rejects a non-Monday', async () => {
		const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${12 + i}`, meals: [] }));
		expect(weekView.safeParse({ startsOn: '2026-10-12', days }).success).toBe(true);
		const result = await menuContract.getWeek['~orpc'].inputSchema!['~standard'].validate({ familyId: crypto.randomUUID(), weekStartsOn: '2026-10-13' });
		expect(result.issues?.length).toBeGreaterThan(0);
	});
	it('keeps the notice operations out of MCP', () => {
		const meta = { mcp: false, offline: false, role: 'familyMember' };
		expect(menuContract.getNewWeek['~orpc'].meta).toEqual(meta);
		expect(menuContract.markWeekSeen['~orpc'].meta).toEqual(meta);
	});
	it('validates the notice operations', async () => {
		const familyId = crypto.randomUUID();
		const seen = menuContract.markWeekSeen['~orpc'].inputSchema!['~standard'];
		expect((await seen.validate({ familyId, weekStartsOn: '2026-10-26' })).issues).toBeUndefined();
		expect((await seen.validate({ familyId, weekStartsOn: '2026-10-27' })).issues?.length).toBeGreaterThan(0);
		const output = menuContract.getNewWeek['~orpc'].outputSchema!['~standard'];
		expect((await output.validate({ weekStartsOn: null })).issues).toBeUndefined();
		expect((await output.validate({ weekStartsOn: '2026-10-26' })).issues).toBeUndefined();
		expect((await menuContract.markWeekSeen['~orpc'].outputSchema!['~standard'].validate({ ok: true })).issues).toBeUndefined();
	});
});

describe('profile update', () => {
	it('accepts the menu email preference and rejects an empty change', async () => {
		const input = profileContract.update['~orpc'].inputSchema!['~standard'];
		expect((await input.validate({ menuEmails: false })).issues).toBeUndefined();
		expect((await input.validate({})).issues?.length).toBeGreaterThan(0);
	});
});
