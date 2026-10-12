import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputsFingerprint, snapshotInputs } from './inputs-fingerprint.ts';

describe('the snapshot of the inputs (review of PR #34, finding 5)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'fp-'));
	for (const d of ['origin/ricettario', 'origin/menu/2026-10-12', 'origin/altro', 'import/out']) mkdirSync(join(dir, d), { recursive: true });
	writeFileSync(join(dir, 'origin/ricettario/ricette.yaml'), 'a');
	writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.yaml'), 'b');
	writeFileSync(join(dir, 'origin/menu/2026-10-12/menu.pdf'), 'not read');
	writeFileSync(join(dir, 'origin/altro/x.yaml'), 'not read');
	writeFileSync(join(dir, 'import/ingredients.yaml'), 'c');
	writeFileSync(join(dir, 'import/out/report.yaml'), 'not read');
	const args = { head: 'abc', today: '2026-10-13', familyId: 'f', curatorId: 'c', launchFrom: null, endpoint: 'postgres.x@h:5432/postgres' };

	it('copies what the load reads into a private folder, and later changes of the origin do not reach it', () => {
		const snap = snapshotInputs(join(dir, 'origin'), join(dir, 'import'));
		try {
			expect(snap.files.map((f) => f.name).sort()).toEqual(['import/ingredients.yaml', 'origin/menu/2026-10-12/menu.yaml', 'origin/ricettario/ricette.yaml']);
			expect(statSync(snap.dir).mode & 0o777).toBe(0o700);
			const first = inputsFingerprint(snap.files, args);
			writeFileSync(join(dir, 'origin/ricettario/ricette.yaml'), 'changed while waiting for the locks');
			expect(readFileSync(join(snap.origin, 'ricettario/ricette.yaml'), 'utf8')).toBe('a');
			expect(readFileSync(join(snap.root, 'scripts/import/ingredients.yaml'), 'utf8')).toBe('c');
			expect(inputsFingerprint(snap.files, args)).toBe(first);
			const again = snapshotInputs(join(dir, 'origin'), join(dir, 'import'));
			expect(inputsFingerprint(again.files, args)).not.toBe(first);
			again.dispose();
		} finally {
			snap.dispose();
			writeFileSync(join(dir, 'origin/ricettario/ricette.yaml'), 'a');
		}
	});
	it('the fingerprint changes with any argument', () => {
		const snap = snapshotInputs(join(dir, 'origin'), join(dir, 'import'));
		const first = inputsFingerprint(snap.files, args);
		for (const other of [{ today: '2026-10-14' }, { endpoint: 'postgres.y@h:5432/postgres' }, { launchFrom: 'abc' }, { head: 'def' }])
			expect(inputsFingerprint(snap.files, { ...args, ...other })).not.toBe(first);
		snap.dispose();
	});
});
