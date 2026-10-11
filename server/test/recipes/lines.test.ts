import { describe, expect, it } from 'vitest';
import { ingredientLinesView, type LineInput } from '../../src/recipes/lines.ts';

const tomato = '00000000-0000-4000-8000-000000000001';
const oil = '00000000-0000-4000-8000-000000000002';
const names = new Map([
	[tomato, { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }],
	[oil, { 'it-IT': 'Olio extravergine', 'en-GB': 'Extra virgin olive oil' }],
]);
const lines: LineInput[] = [
	{
		ingredientId: tomato,
		variety: { 'it-IT': 'Roma', 'en-GB': 'Roma' },
		preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' },
		quantity: { kind: 'amount', value: 200, unit: 'g' },
		isOptional: false,
	},
	{ ingredientId: oil, variety: null, preparation: null, quantity: { kind: 'to_taste' }, isOptional: true },
];

describe('ingredientLinesView', () => {
	it('scales, keeps the source order and writes in the language', () => {
		expect(ingredientLinesView(lines, names, { servings: 4, baseServings: 2, system: 'metric', locale: 'it-IT' })).toEqual([
			{ ingredientId: tomato, name: 'Pomodori Roma', amount: '400 g', preparation: 'a dadini', optional: false },
			{ ingredientId: oil, name: 'Olio extravergine', amount: 'q.b.', preparation: null, optional: true },
		]);
	});

	it('converts to the family system', () => {
		const [line] = ingredientLinesView(lines, names, { servings: 2, baseServings: 2, system: 'uk_imperial', locale: 'en-GB' });
		expect(line).toMatchObject({ name: 'Tomatoes Roma', preparation: 'diced' });
		expect(line.amount).toMatch(/oz$/);
	});

	it('shows text quantities in the language', () => {
		const text: LineInput = {
			ingredientId: tomato,
			variety: null,
			preparation: null,
			isOptional: false,
			quantity: { kind: 'text', text: { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' } },
		};
		expect(ingredientLinesView([text], names, { servings: 3, baseServings: 2, system: 'metric', locale: 'en-GB' })[0].amount).toBe('1 bunch');
	});

	it('fails loudly on an ingredient missing from the names', () => {
		expect(() => ingredientLinesView(lines, new Map(), { servings: 2, baseServings: 2, system: 'metric', locale: 'it-IT' })).toThrow(/ingredient/);
	});
});
