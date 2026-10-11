import { describe, expect, it } from 'vitest';
import { contract } from '../contract.ts';
import { connectedAgentSchema } from './operations.ts';

describe('agents contract', () => {
	it('exposes list as a read-only tool and disconnect as a tool, for any user, never offline', () => {
		expect(contract.agents.list['~orpc'].meta).toEqual({ mcp: { readOnly: true }, offline: false, role: 'user' });
		expect(contract.agents.disconnect['~orpc'].meta).toEqual({ mcp: { readOnly: false }, offline: false, role: 'user' });
	});

	it('accepts an agent without sessions and an empty name', () => {
		const agent = {
			clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
			name: '',
			connectedAt: '2026-10-11T16:53:33.041Z',
			lastRenewedAt: null,
			current: false,
		};
		expect(connectedAgentSchema.parse(agent)).toEqual(agent);
	});

	it('tells the agent what disconnecting does and does not end', () => {
		const summary = contract.agents.disconnect['~orpc'].route.summary ?? '';
		expect(summary).toMatch(/revokes its authorisation and ends its sessions/);
		expect(summary).toMatch(/changed password/);
		expect(contract.agents.list['~orpc'].route.summary).toMatch(/not their last use/);
	});

	it('refuses a client id that is not a UUID', () => {
		const input = contract.agents.disconnect['~orpc'].inputSchema!;
		expect(input['~standard'].validate({ clientId: 'claude' })).toMatchObject({ issues: expect.any(Array) });
		expect(input['~standard'].validate({ clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' })).toMatchObject({ value: { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7' } });
	});
});
