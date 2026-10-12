import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputsFingerprint } from './inputs-fingerprint.ts';

describe('inputsFingerprint', () => {
	const dir = mkdtempSync(join(tmpdir(), 'fp-'));
	for (const d of ['origin/ricettario', 'origin/menu/2026-10-12', 'import']) mkdirSync(join(dir, d), { recursive: true });
	writeFileSync(join(dir, 'origin/ricettario/ricette.yaml'), 'a');
	writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.yaml'), 'b');
	writeFileSync(join(dir, 'import/ingredients.yaml'), 'c');
	const args = { originDirectory: join(dir, 'origin'), importDirectory: join(dir, 'import'), head: 'abc', today: '2026-10-13', familyId: 'f', curatorId: 'c', launchFrom: null, endpoint: 'postgres.x@h:5432/postgres' };

	it('is stable for the same inputs and changes with any file or argument', () => {
		const first = inputsFingerprint(args);
		expect(inputsFingerprint(args)).toBe(first);
		expect(inputsFingerprint({ ...args, today: '2026-10-14' })).not.toBe(first);
		expect(inputsFingerprint({ ...args, endpoint: 'postgres.y@h:5432/postgres' })).not.toBe(first);
		expect(inputsFingerprint({ ...args, launchFrom: 'abc' })).not.toBe(first);
		writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.yaml'), 'b2');
		expect(inputsFingerprint(args)).not.toBe(first);
	});
});
