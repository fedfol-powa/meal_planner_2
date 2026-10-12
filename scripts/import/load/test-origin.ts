// Origin fixtures of the load tests (plan, Task 3): every call writes its own temporary origin and
// scripts/import with a unique prefix in every slug, so no test sees the rows of another and each
// one removes exactly what it created.
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type postgres from 'postgres';
import { stringify } from 'yaml';
import { approveText } from '../inputs.ts';

export interface LoadCase {
	prefix: string;
	dir: string;
}

const APPROVED_ON = '2026-10-11';

export function writeOriginFixture(variant: { pendingReview?: boolean; missingInMenu?: boolean } = {}): LoadCase {
	const prefix = `test-load-${randomBytes(4).toString('hex')}-`;
	const dir = mkdtempSync(join(tmpdir(), 'load-origin-'));
	const p = (name: string) => `${prefix}${name}`;
	for (const d of ['ricettario', 'menu/2026-10-12', 'scripts/import']) mkdirSync(join(dir, d), { recursive: true });

	const flour = { nome: p('farina'), quantita: '200 g' };
	const tomato = { nome: p('pomodoro'), quantita: '300 g' };
	const recipes = [
		{
			// Publishable, tried, with a history whose meal it shares with the book recipe.
			id: p('pubblicabile'), nome: `Pubblicabile ${prefix}`, descrizione: 'Impasta e cuoci.', tipo: 'web', url: 'https://example.org/ricetta', tempo: '20 min',
			libro: null, porzioni_base: 4, ingredienti: [flour, tomato], collaudata: true, feedback: 3, tag: [],
			storico: [{ settimana: '2026-09-28', pasto: 'mar-cena', cucinata: true }], note: 'Fonte per 4.',
		},
		{
			// No attributes: a draft, rated by the curator (its rating stays pending).
			id: p('bozza'), nome: `Bozza ${prefix}`, descrizione: 'Cuoci il pomodoro.', tipo: 'web', url: 'https://example.org/bozza', tempo: '15 min',
			libro: null, porzioni_base: 2, ingredienti: [tomato], collaudata: false, feedback: 2, tag: [], storico: [], note: null,
		},
		{
			// From the book, with a conditional preference in its note.
			id: p('libro'), nome: `Libro ricetta ${prefix}`, descrizione: 'Dal libro.', tipo: 'libro', url: null, tempo: '30 min',
			libro: { titolo: `Libro ${prefix}`, pagine: '12' }, porzioni_base: 4, ingredienti: [flour], collaudata: false, feedback: null, tag: [],
			storico: [{ settimana: '2026-09-28', pasto: 'mar-cena', cucinata: true }],
			note: 'Ai bambini non piace, non proporla nelle cene per 4 (solo per i 2 adulti).',
		},
	];
	writeFileSync(join(dir, 'ricettario/ricette.yaml'), stringify({ ricette: recipes }));

	const monday: Record<string, unknown> = { giorno: 'lun', data: '2026-10-12', pranzo: { ricetta: p('pubblicabile'), porzioni: 2, note: 'x2' } };
	if (variant.missingInMenu) monday.cena = { ricetta: p('assente'), porzioni: 2 };
	writeFileSync(join(dir, 'menu/2026-10-12/menu.yaml'), stringify({
		settimana: { inizio: '2026-10-12', fine: '2026-10-18' },
		giorni: [monday, { giorno: 'dom', data: '2026-10-18', pranzo: { libero: 'Pizza da asporto' } }],
	}));

	const attributes = (mealType: string) => ({
		meal_type: mealType, protein_group: 'vegetarian', fresh_fish: false, carbohydrate_group: 'pasta', category: 'other',
		has_vegetables: true, is_heavy: false, seasons: [], primary_ingredient: null, uncertain: [], note: null,
	});
	const importDir = join(dir, 'scripts/import');
	writeFileSync(join(importDir, 'recipe-attributes.yaml'), stringify({ recipes: { [p('pubblicabile')]: attributes('both'), [p('libro')]: attributes('dinner') } }));
	const ingredient = (it: string, en: string) => ({ name: { 'it-IT': it, 'en-GB': en }, synonyms: { 'it-IT': [], 'en-GB': [] }, department: 'other', pantry: false });
	const line = (ingredient: string) => ({ ingredient, variety: null, preparation: null, optional: false });
	const inputs: Record<string, unknown> = {
		'ingredients.yaml': { ingredients: { [p('farina')]: ingredient(`Farina ${prefix}`, `Flour ${prefix}`), [p('pomodoro')]: ingredient(`Pomodoro ${prefix}`, `Tomato ${prefix}`) } },
		'ingredient-lines.yaml': { lines: { [p('farina')]: line(p('farina')), [p('pomodoro')]: line(p('pomodoro')) } },
		'translations.en-GB.yaml': {
			recipes: Object.fromEntries(recipes.map((r) => [r.id, { name: `English ${r.id}`, description: 'Cook it.' }])),
			quantities: {},
		},
		'unit-equivalences.yaml': { equivalences: [{ ingredient: p('farina'), from: 'us_cup', to: 'g', factor: 120, preparation: null, source: 'Test source' }] },
	};
	for (const [file, content] of Object.entries(inputs)) {
		const text = stringify(content);
		const pending = variant.pendingReview && file === 'unit-equivalences.yaml';
		writeFileSync(join(importDir, file), pending ? text : approveText(text, APPROVED_ON));
	}
	return { prefix, dir };
}

/** Removes the families given and every catalogue row of the case, as the test's admin connection. */
export async function cleanupLoadCase(admin: postgres.Sql, c: LoadCase, familyIds: string[]): Promise<void> {
	const like = `${c.prefix}%`;
	await admin.begin(async (tx) => {
		if (familyIds.length) await tx`delete from app.families where id = any(${familyIds}::uuid[])`;
		const recipes = tx`select id from app.recipes where origin_slug like ${like}`;
		const drafts = tx`select id from app.recipe_drafts where recipe_id in (${recipes})`;
		await tx`delete from app.recipe_draft_requests where draft_id in (${drafts})`;
		await tx`delete from app.recipe_draft_saves where draft_id in (${drafts})`;
		await tx`delete from app.recipe_drafts where id in (${drafts})`;
		for (const table of ['recipe_versions', 'recipe_status_changes', 'recipe_exclusions', 'family_tried_recipes', 'meal_slots', 'ratings'])
			await tx.unsafe(`delete from app.${table} where recipe_id in (select id from app.recipes where origin_slug like $1)`, [like]);
		await tx`delete from app.recipes where origin_slug like ${like}`;
		for (const table of ['ingredient_versions', 'ingredient_unit_equivalences', 'family_ingredients', 'shopping_list_checks', 'shopping_list_added_back'])
			await tx.unsafe(`delete from app.${table} where ingredient_id in (select id from app.ingredients where slug like $1)`, [like]);
		await tx`delete from app.ingredients where slug like ${like}`;
		await tx`delete from app.family_books where book_id in (select id from app.books where title = ${`Libro ${c.prefix}`})`;
		await tx`delete from app.books where title = ${`Libro ${c.prefix}`}`;
	});
}
