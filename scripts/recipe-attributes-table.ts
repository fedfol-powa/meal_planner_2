// Italian table of the recipe attributes, for the user's review (planner experiment M0).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAttributes } from './planner-data/attributes.ts';
import { durationOf, originDir, publishable, readOriginRecipes } from './planner-data/origin.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recipes = readOriginRecipes(originDir(root)).filter(publishable);
const { attributes, errors } = parseAttributes(readFileSync(resolve(root, 'scripts/import/recipe-attributes.yaml'), 'utf8'), recipes);
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}

const label: Record<string, string> = {
	lunch: 'pranzo', dinner: 'cena', both: 'entrambi',
	fish: 'pesce', white_meat: 'carne bianca', red_meat: 'carne rossa', cured_meat: 'salumi', legumes: 'legumi', eggs: 'uova', cheese: 'formaggi', vegetarian: 'vegetariano',
	pasta: 'pasta', rice: 'riso', potatoes: 'patate', bread: 'pane o wrap', cereals: 'cereali', none: 'nessuno',
	wok: 'wok', skottle: 'skottle', oven_bake: 'al forno', grill: 'griglia', pan: 'in padella', soup: 'zuppa', salad: 'insalata', savoury_pie: 'torta salata', wrap_sandwich: 'wrap o panino', burger: 'burger', other: 'altro',
	spring: 'primavera', summer: 'estate', autumn: 'autunno', winter: 'inverno'
};
const yes = (v: boolean) => (v ? 'sì' : 'no');
const rows = recipes.map((r) => {
	const a = attributes.get(r.id)!;
	const doubt = a.uncertain.length ? ` ⚠ ${a.uncertain.join(', ')}` : '';
	return `| ${r.nome}${doubt} | ${a.durationMinutes ?? durationOf(r.tempo) ?? '?'} | ${label[a.mealType]} | ${label[a.proteinGroup]}${a.freshFish ? ' (pescheria)' : ''} | ${label[a.carbohydrateGroup]} | ${label[a.category]} | ${yes(a.hasVegetables)} | ${yes(a.isHeavy)} | ${a.seasons.map((s) => label[s]).join(', ') || 'tutto l’anno'} | ${a.primaryIngredient ?? '—'} | ${a.note ?? ''} |`;
});
const table = [
	'# Attributi delle ricette per il pianificatore',
	'',
	`Generato da \`npm run recipe-attributes-table\` da \`scripts/import/recipe-attributes.yaml\`: ${recipes.length} ricette pubblicabili. ⚠ indica i campi incerti da controllare.`,
	'',
	'| Ricetta | Minuti | Pasto | Proteina | Carboidrato | Tipo di piatto | Verdure | Pesante | Stagioni | Ingrediente principale | Nota |',
	'|---|---|---|---|---|---|---|---|---|---|---|',
	...rows,
	''
].join('\n');
const output = resolve(root, 'progetto/reports/recipe-attributes.md');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, table);
console.log(`Scritto ${output}`);
