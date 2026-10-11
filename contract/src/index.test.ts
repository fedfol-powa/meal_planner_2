import { describe, expect, it } from 'vitest';
import { contract } from './index.ts';

describe('contract package', () => {
	it('exports the contract', () => {
		expect(contract).toBeTypeOf('object');
	});
});
