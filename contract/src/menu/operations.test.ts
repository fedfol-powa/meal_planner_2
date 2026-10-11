import { describe, expect, it } from 'vitest';
import { checkContract } from '../index.ts';
import { menuContract } from './operations.ts';
import { weekView } from './views.ts';

describe('menu contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ menu: menuContract })).toEqual([]);
	});
	it('declares versioned, read-only family reads', () => {
		for (const operation of Object.values(menuContract)) {
			expect(operation['~orpc'].meta).toMatchObject({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] });
		}
	});
	it('accepts an empty week of seven days and rejects a non-Monday', async () => {
		const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${12 + i}`, meals: [] }));
		expect(weekView.safeParse({ startsOn: '2026-10-12', days }).success).toBe(true);
		const result = await menuContract.getWeek['~orpc'].inputSchema!['~standard'].validate({ familyId: crypto.randomUUID(), weekStartsOn: '2026-10-13' });
		expect(result.issues?.length).toBeGreaterThan(0);
	});
});
