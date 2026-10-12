import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readOriginRecipes, originDir } from '../../planner-data/origin.ts';
import { conditionalPreferences } from './preferences.ts';

const originDirExists = () => {
	try {
		return existsSync(originDir(process.cwd()));
	} catch {
		return false;
	}
};
const card = (id: string, note: string | null) => ({ id, nome: id, note }) as never;

describe('conditionalPreferences', () => {
	it('finds preference phrases in the notes, with recipe and text', () => {
		const found = conditionalPreferences([card('a', 'Ai bambini non piacciono, non proporla nelle cene per 4 (solo per i 2 adulti).'), card('b', 'Fonte per 4.'), card('c', null)]);
		expect(found).toEqual([{ originSlug: 'a', name: 'a', note: 'Ai bambini non piacciono, non proporla nelle cene per 4 (solo per i 2 adulti).' }]);
	});
	it.skipIf(!process.env.MEAL_PLANNER_ORIGIN && !originDirExists())('lists the known case of the real recipe book', () => {
		const slugs = conditionalPreferences(readOriginRecipes(originDir(process.cwd()))).map((p) => p.originSlug);
		expect(slugs).toContain('gamberi-zucchine-skottle'); // ricette.yaml, note of 27 September 2026
	});
});
