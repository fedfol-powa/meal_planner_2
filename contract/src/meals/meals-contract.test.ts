import { describe, expect, it } from 'vitest';
import { contract } from '../contract.ts';

const valid = (schema: unknown, value: unknown) =>
	!('issues' in ((schema as { '~standard': { validate(v: unknown): object } })['~standard'].validate(value) as object));

describe('meals contract', () => {
	it('declares member writes that create an action with a client id', () => {
		for (const name of ['setServings', 'setRecipe', 'setFree', 'setNote'] as const) {
			expect(contract.meals[name]['~orpc'].meta).toEqual({ mcp: { readOnly: false }, offline: false, role: 'familyMember', creates: true });
		}
	});
	it('validates the inputs', () => {
		const base = { familyId: crypto.randomUUID(), slotId: crypto.randomUUID(), id: crypto.randomUUID() };
		const input = (name: 'setServings' | 'setFree' | 'setNote') => contract.meals[name]['~orpc'].inputSchema;
		expect(valid(input('setServings'), { ...base, servings: 0 })).toBe(false);
		expect(valid(input('setServings'), { ...base, servings: 21 })).toBe(false);
		expect(valid(input('setServings'), { ...base, servings: 20 })).toBe(true);
		expect(valid(input('setFree'), { ...base, text: '   ' })).toBe(false);
		expect(valid(input('setFree'), { ...base, text: 'x'.repeat(61) })).toBe(false);
		expect(valid(input('setNote'), { ...base, note: 'x'.repeat(201) })).toBe(false);
		expect(valid(input('setNote'), { ...base, note: null })).toBe(true);
	});
});
