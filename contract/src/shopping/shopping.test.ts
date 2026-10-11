import { describe, expect, it } from 'vitest';
import { checkContract } from '../check.ts';
import { isVersionedOutput } from '../versioned.ts';
import { normalizeFreeItemText, shoppingContract, shoppingListViewSchema } from './index.ts';

const contract = shoppingContract;
const valid = (schema: unknown, value: unknown) =>
	!('issues' in (schema as { '~standard': { validate(v: unknown): object } })['~standard'].validate(value));

describe('shopping contract', () => {
	it('follows the conventions', () => {
		expect(checkContract(shoppingContract)).toEqual([]);
	});

	it('keeps getWeekList a versioned read', () => {
		const def = contract.shopping.getWeekList['~orpc'];
		expect(isVersionedOutput(def.outputSchema)).toBe(true);
		const input = def.inputSchema!;
		const base = { familyId: crypto.randomUUID(), weekStartsOn: '2026-10-12' };
		expect(valid(input, base)).toBe(true);
		expect(valid(input, { ...base, knownVersion: 'v1' })).toBe(true);
		expect(valid(input, { ...base, knownVersion: 1 })).toBe(false);
	});

	it('requires quantityAtCheck exactly when ticking', () => {
		const input = contract.shopping.setItemChecked['~orpc'].inputSchema!;
		const base = {
			id: crypto.randomUUID(),
			familyId: crypto.randomUUID(),
			weekStartsOn: '2026-10-12',
			ingredientId: crypto.randomUUID(),
			varietyKey: '',
		};
		const q = { mass_g: 200, volume_ml: null, counts: {}, texts: [], to_taste: false };
		expect(valid(input, { ...base, checked: true, quantityAtCheck: q })).toBe(true);
		expect(valid(input, { ...base, checked: true })).toBe(false);
		expect(valid(input, { ...base, checked: false })).toBe(true);
		expect(valid(input, { ...base, checked: false, quantityAtCheck: q })).toBe(false);
	});

	it('queues only absolute-state operations with an id', () => {
		const offline = Object.entries(contract.shopping)
			.filter(([, p]) => p['~orpc'].meta.offline)
			.map(([n]) => n);
		expect(offline.sort()).toEqual(['addFreeItem', 'removeFreeItem', 'setAddedBack', 'setFreeItemChecked', 'setItemChecked']);
	});

	it('normalises free item text', () => {
		expect(normalizeFreeItemText('  Detersivo   per i piatti ')).toBe('Detersivo per i piatti');
		expect(normalizeFreeItemText('   ')).toBeNull();
		expect(normalizeFreeItemText('x'.repeat(60))).toBe('x'.repeat(60));
		expect(normalizeFreeItemText('x'.repeat(61))).toBeNull();
	});

	it('rejects a weekStartsOn that is not a Monday', () => {
		const input = contract.shopping.getWeekList['~orpc'].inputSchema!;
		const familyId = crypto.randomUUID();
		expect(valid(input, { familyId, weekStartsOn: '2026-10-12' })).toBe(true);
		expect(valid(input, { familyId, weekStartsOn: '2026-10-13' })).toBe(false);
		expect(valid(input, { familyId, weekStartsOn: 'not-a-date' })).toBe(false);
	});

	it('parses a minimal view, with a never-published recipe among the skipped meals', () => {
		const view = shoppingListViewSchema.parse({
			weekStartsOn: '2026-10-12',
			locale: 'it-IT',
			measurementSystem: 'metric',
			mealCount: 0,
			departments: [],
			excluded: [],
			skipped: [{ slotId: crypto.randomUUID(), recipeId: crypto.randomUUID(), recipeName: null }],
			freeItems: [],
			lastChange: null,
		});
		expect(view.skipped[0]!.recipeName).toBeNull();
	});
});
