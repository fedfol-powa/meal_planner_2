import { describe, expect, it } from 'vitest';
import { contract } from '../contract.ts';
import type { OperationMeta } from '../op.ts';

type Procedure = { '~orpc': { meta: OperationMeta; errorMap: Record<string, unknown> } };
const procedure = (area: 'profile' | 'family', name: string) => (contract[area] as unknown as Record<string, Procedure>)[name]!['~orpc'];

describe('profile and family operations', () => {
	const expected: Record<string, [OperationMeta['role'], boolean]> = {
		'profile.get': ['user', true],
		'profile.update': ['user', false],
		'profile.setCurrentFamily': ['user', false],
		'family.create': ['user', false],
		'family.join': ['user', false],
		'family.setMemberRole': ['familyAdmin', false],
		'family.removeMember': ['familyAdmin', false],
		'family.leave': ['familyMember', false],
		'family.getDeletion': ['familyMember', true],
		'family.delete': ['familyAdmin', false],
		'family.get': ['familyMember', true],
		'family.getSettings': ['familyMember', true],
		'family.searchIngredients': ['familyMember', true],
		'family.listExclusions': ['familyMember', true],
		'family.addExclusion': ['familyMember', false],
		'family.removeExclusion': ['familyMember', false],
		'family.rename': ['familyAdmin', false],
		'family.setMeasurementSystem': ['familyAdmin', false],
		'family.setTimeZone': ['familyAdmin', false],
		'family.setMeal': ['familyAdmin', false],
		'family.addRule': ['familyAdmin', false],
		'family.removeRule': ['familyAdmin', false],
		'family.setKnownNew': ['familyAdmin', false],
		'family.setGroupRange': ['familyAdmin', false],
		'family.setBookOwned': ['familyAdmin', false],
		'family.setIngredientRestriction': ['familyAdmin', false],
	};

	it('are all listed here, each an MCP tool with the expected role, none offline, only delete web only', () => {
		const actual = [...Object.keys(contract.profile).map((n) => `profile.${n}`), ...Object.keys(contract.family).map((n) => `family.${n}`)];
		expect(actual.sort()).toEqual(Object.keys(expected).sort());
		for (const [name, [role, readOnly]] of Object.entries(expected)) {
			const [area, operation] = name.split('.') as ['profile' | 'family', string];
			const meta = procedure(area, operation).meta;
			expect(meta.role, name).toBe(role);
			expect(meta.mcp, name).toEqual({ readOnly });
			expect(meta.webOnly, name).toEqual(name === 'family.delete' ? { path: '/profile/family/delete?family=:familyId' } : undefined);
			expect(meta.offline, name).toBe(false);
		}
	});

	it('declare not_found exactly where a handler can answer it', () => {
		const withNotFound = Object.keys(expected).filter((name) => {
			const [area, operation] = name.split('.') as ['profile' | 'family', string];
			return 'not_found' in procedure(area, operation).errorMap;
		});
		expect(withNotFound.sort()).toEqual(['family.addExclusion', 'family.setBookOwned', 'family.setIngredientRestriction', 'family.setMemberRole']);
	});
});
