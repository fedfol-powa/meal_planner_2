import { describe, expect, it } from 'vitest';
import { checkContract, contract } from '../index.ts';
import { userQuerySchema } from './index.ts';

describe('users contract', () => {
	it('follows the conventions', () => {
		expect(checkContract({ users: contract.users })).toEqual([]);
	});
	it('trims the query and keeps it short', () => {
		expect(userQuerySchema.parse('  Anna ')).toBe('Anna');
		expect(userQuerySchema.safeParse('a'.repeat(100)).success).toBe(true);
		expect(userQuerySchema.safeParse('a'.repeat(101)).success).toBe(false);
	});
	it('accepts only the two global roles', () => {
		const input = contract.users.setRole['~orpc'].inputSchema!;
		const id = crypto.randomUUID();
		expect(input['~standard'].validate({ id, role: 'recipe_curator', granted: true })).not.toHaveProperty('issues');
		expect(input['~standard'].validate({ id, role: 'root', granted: true })).toHaveProperty('issues');
	});
	it('marks reads and writes for MCP', () => {
		expect(contract.users.list['~orpc'].meta.mcp).toEqual({ readOnly: true });
		expect(contract.users.get['~orpc'].meta.mcp).toEqual({ readOnly: true });
		expect(contract.users.setRole['~orpc'].meta.mcp).toEqual({ readOnly: false });
	});
});
