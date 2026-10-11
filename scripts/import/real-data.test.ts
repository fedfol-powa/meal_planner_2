import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkDraft } from '../../domain/src/recipe/index.ts';
import type { BundleResult } from './bundle.ts';
import { runImport } from './import-recipes.ts';
import { bundleLookup } from './test-fixtures.ts';

const root = resolve(import.meta.dirname, '../..');
const hasOrigin = !!process.env.MEAL_PLANNER_ORIGIN || [resolve(root, '../meal_planner'), resolve(root, '../../../meal_planner')].some((d) => existsSync(d));

// The import runs in beforeAll: without the origin (CI) the suite is skipped without errors.
describe.skipIf(!hasOrigin)('import of the real origin recipe book', () => {
	let result: BundleResult;
	let report: string;
	beforeAll(() => {
		const run = runImport({ root, today: '2026-10-12', now: new Date('2026-10-12T10:00:00Z') });
		result = run.result;
		report = run.files['report.md'];
	});
	it('imports every origin card as a valid draft at least', () => {
		expect(result.bundle.recipes).toHaveLength(56);
		for (const r of result.bundle.recipes) expect(checkDraft(r.document, bundleLookup(result.bundle))).toEqual([]);
	});
	it('gives every draft a reason in the document and in the report', () => {
		for (const r of result.bundle.recipes.filter((x) => x.status === 'draft')) {
			expect(r.issues.length).toBeGreaterThan(0);
			expect(report).toContain(`\`${r.origin.slug}\``);
		}
	});
	it('applies the R4 decisions to the known cases', () => {
		const bySlug = new Map(result.bundle.recipes.map((r) => [r.origin.slug, r]));
		for (const s of ['penne-baffo', 'pasta-zucca-salsiccia-robiola', 'pasta-crema-peperoni', 'lenticchie-comidista']) expect(bySlug.get(s)?.document.sourceType).toBe('web');
		for (const s of ['pasta-tonno', 'lenticchie-comidista']) expect(result.bundle.family.triedUndated).toContain(s);
	});
});
