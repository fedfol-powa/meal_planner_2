import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkContract } from './check.ts';
import { op } from './op.ts';
import { versionedInput, versionedOutput } from './versioned.ts';

const route = { method: 'POST', path: '/x', summary: 'X' } as const;

describe('checkContract', () => {
	it('accepts a well-formed operation', () => {
		const contract = {
			ok: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
				.route(route)
				.input(z.object({}))
				.output(z.object({})),
		};
		expect(checkContract(contract)).toEqual([]);
	});

	it('reports missing metadata', () => {
		const base = op({ mcp: false, offline: false, role: 'user' });
		const broken = { ...base, '~orpc': { ...base['~orpc'], meta: {} } };
		const contract = { broken: Object.assign(Object.create(Object.getPrototypeOf(base)), broken) };
		expect(checkContract(contract)).toEqual(
			expect.arrayContaining([
				'broken: missing mcp',
				'broken: missing offline',
				'broken: missing role',
			]),
		);
	});

	it('requires an MCP tool for webOnly operations', () => {
		const contract = {
			remove: op({ mcp: false, webOnly: { path: '/family/:familyId/delete' }, offline: false, role: 'familyAdmin' })
				.route(route)
				.input(z.object({ familyId: z.uuid() }))
				.output(z.object({})),
		};
		expect(checkContract(contract)).toContain('remove: webOnly needs mcp exposure to answer web_only');
	});

	it('requires familyId for family roles', () => {
		const contract = {
			member: op({ mcp: false, offline: false, role: 'familyMember' }).route(route).input(z.object({})).output(z.object({})),
		};
		expect(checkContract(contract)).toContain('member: family role needs a uuid familyId input');
	});

	it('requires a client id for offline and creating operations', () => {
		const contract = {
			queue: op({ mcp: false, offline: true, role: 'user' }).route(route).input(z.object({})).output(z.object({})),
			create: op({ mcp: false, offline: false, role: 'user', creates: true }).route(route).input(z.object({ id: z.string() })).output(z.object({})),
		};
		const problems = checkContract(contract);
		expect(problems).toContain('queue: offline or creating operation needs a uuid id input');
		expect(problems).toContain('create: offline or creating operation needs a uuid id input');
	});

	it('rejects optional or nullable identifiers', () => {
		const contract = {
			optionalFamily: op({ mcp: false, offline: false, role: 'familyMember' })
				.route(route).input(z.object({ familyId: z.uuid().optional() })).output(z.object({})),
			nullableFamily: op({ mcp: false, offline: false, role: 'familyAdmin' })
				.route(route).input(z.object({ familyId: z.uuid().nullable() })).output(z.object({})),
			optionalId: op({ mcp: false, offline: true, role: 'user' })
				.route(route).input(z.object({ id: z.uuid().optional() })).output(z.object({})),
		};
		expect(checkContract(contract)).toEqual([
			'optionalFamily: family role needs a uuid familyId input',
			'nullableFamily: family role needs a uuid familyId input',
			'optionalId: offline or creating operation needs a uuid id input',
		]);
	});

	it('rejects a knownVersion that is not an optional string', () => {
		const numeric = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({ knownVersion: z.number().optional() }))
				.output(versionedOutput(z.object({}))),
		};
		expect(checkContract(numeric)).toEqual(['view: versioned read needs an optional string knownVersion input']);
		const required = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({ knownVersion: z.string() }))
				.output(versionedOutput(z.object({}))),
		};
		expect(checkContract(required)).toEqual(['view: versioned read needs an optional string knownVersion input']);
	});

	it('requires the versioned shape for reads', () => {
		const good = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(versionedInput(z.object({})))
				.output(versionedOutput(z.object({ n: z.number() }))),
		};
		expect(checkContract(good)).toEqual([]);
		const bad = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(z.object({}))
				.output(z.object({})),
		};
		expect(checkContract(bad)).toEqual([
			'view: versioned read needs an optional string knownVersion input',
			'view: versioned read needs versionedOutput',
		]);
	});

	it('requires familyId for family versioned reads', () => {
		const contract = {
			view: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['family'] })
				.route(route)
				.input(versionedInput(z.object({ familyId: z.uuid().optional() })))
				.output(versionedOutput(z.object({}))),
			catalogue: op({ mcp: { readOnly: true }, offline: false, role: 'user', reads: ['catalogue'] })
				.route(route)
				.input(versionedInput(z.object({})))
				.output(versionedOutput(z.object({}))),
		};
		expect(checkContract(contract)).toEqual(['view: family version needs a uuid familyId input']);
	});

	it('requires method, path and summary', () => {
		const contract = {
			bare: op({ mcp: false, offline: false, role: 'user' }).input(z.object({})).output(z.object({})),
		};
		expect(checkContract(contract)).toContain('bare: route needs method, path and summary');
	});

	it('walks nested routers', () => {
		const contract = {
			area: { inner: op({ mcp: false, offline: true, role: 'user' }).route(route).input(z.object({})).output(z.object({})) },
		};
		expect(checkContract(contract)).toEqual(['area.inner: offline or creating operation needs a uuid id input']);
	});
});
