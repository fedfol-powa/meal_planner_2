import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { versionedInput } from './versioned.ts';

describe('versionedInput', () => {
	it('keeps the type of the input fields next to knownVersion', () => {
		const schema = versionedInput(z.object({ familyId: z.uuid(), today: z.iso.date().optional() }));
		expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<{ familyId: string; today?: string | undefined; knownVersion?: string | undefined }>();
	});
});
