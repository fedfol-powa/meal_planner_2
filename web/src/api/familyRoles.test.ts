import { contract } from '@app/contract';
import { describe, expect, it } from 'vitest';
import { FAMILY_ADMIN_OPERATIONS } from './familyRoles';

/** The operations of the contract whose role is `familyAdmin`, as `area.operation`. */
function adminOperations(): string[] {
  const names: string[] = [];
  for (const [area, operations] of Object.entries(contract)) {
    for (const [name, operation] of Object.entries(operations as Record<string, { '~orpc': { meta: { role?: string } } }>)) {
      if (operation['~orpc'].meta.role === 'familyAdmin') names.push(`${area}.${name}`);
    }
  }
  return names.sort();
}

describe('family administrator operations', () => {
  it('are the familyAdmin operations of the contract', () => {
    expect([...FAMILY_ADMIN_OPERATIONS].sort()).toEqual(adminOperations());
  });
});
