// Builds the prototype demo data from the origin project, read only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseQuantity } from '../src/lib/units/parse.ts';
import type { Book, Ingredient, MealSlot, MealType, Recipe, RecipeMealType, Week } from '../src/lib/domain/types.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = resolve(root, '../../meal_planner');
const imagesDir = resolve(root, '../design/assets/recipe-images');
const output = resolve(root, 'src/lib/demo-data/generated.json');
const translations = JSON.parse(readFileSync(resolve(root, 'scripts/demo-translations.en-GB.json'), 'utf8')) as {
	recipes: Record<string, { name: string; description: string }>;
	ingredients: Record<string, string>;
};
const reportMissing = process.argv.includes('--report-missing');

type OriginRecipe = {
	id: string; nome: string; descrizione: string; tipo: 'web' | 'youtube' | 'libro' | 'casa';
	url?: string | null; libro?: { titolo: string; pagine: string } | null; tempo?: string | null;
	porzioni_base: number | null; ingredienti: { nome: string; quantita: string | number }[] | null;
	feedback: number | null; tag: string[];
	storico: { settimana: string; pasto: string; cucinata: boolean | null }[];
};
type OriginSlot = { ricetta?: string; libero?: string; porzioni?: number };
type OriginMenu = { settimana: { inizio: string }; giorni: ({ data: string } & Record<'pranzo' | 'cena', OriginSlot | undefined>)[] };

const slug = (text: string) =>
	text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const addDays = (date: string, days: number) => {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
};

const MEAL_KEYS: Record<'pranzo' | 'cena', MealType> = { pranzo: 'lunch', cena: 'dinner' };
const DAY_KEYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const SOURCE: Record<OriginRecipe['tipo'], Recipe['sourceType']> = { web: 'web', youtube: 'youtube', libro: 'book', casa: 'home' };
const PROTEIN_TAGS: [string, NonNullable<Recipe['proteinGroup']>][] = [
	['pesce', 'fish'], ['pollo', 'white_meat'], ['carne', 'meat'], ['legumi', 'legumes'], ['uova', 'eggs'], ['vegetariano', 'vegetarian']
];
const FEEDBACK_TO_STARS: Record<number, number> = { 1: 1, 2: 3, 3: 4, 4: 5 };

const originRecipes = (parse(readFileSync(resolve(origin, 'ricettario/ricette.yaml'), 'utf8')) as { ricette: OriginRecipe[] }).ricette;
const missing: { recipes: Record<string, { name: string; description: string }>; ingredients: Record<string, string> } = { recipes: {}, ingredients: {} };

const books = new Map<string, Book>();
const ingredients = new Map<string, Ingredient>();

function mealTypeOf(r: OriginRecipe): RecipeMealType {
	const kinds = new Set(r.storico.map((s) => (s.pasto.endsWith('pranzo') ? 'lunch' : 'dinner')));
	return kinds.size === 1 ? ([...kinds][0] as MealType) : 'both';
}

function durationOf(text: string | null | undefined): number | null {
	const numbers = (text ?? '').match(/\d+/g)?.map(Number);
	return numbers?.length ? Math.max(...numbers) : null;
}

const recipes: Recipe[] = originRecipes.map((r) => {
	const en = translations.recipes[r.id];
	const lines = (r.ingredienti ?? []).map((line) => {
		const id = slug(line.nome);
		const enName = translations.ingredients[line.nome] ?? null;
		if (!ingredients.has(id)) ingredients.set(id, { id, name: { 'it-IT': line.nome, 'en-GB': enName } });
		return { ingredientId: id, quantity: parseQuantity(String(line.quantita)), sourceText: String(line.quantita), enName, name: line.nome };
	});
	const hasData = lines.length > 0 && !!r.porzioni_base;
	if (hasData) {
		if (!en) missing.recipes[r.id] = { name: r.nome, description: r.descrizione };
		for (const line of lines) if (!line.enName) missing.ingredients[line.name] = '';
	}
	const complete = hasData && !!en && lines.every((l) => l.enName);
	let bookId: string | null = null;
	if (r.libro) {
		bookId = slug(r.libro.titolo);
		books.set(bookId, { id: bookId, title: r.libro.titolo });
	}
	return {
		id: r.id,
		status: complete ? 'published' : 'draft',
		name: { 'it-IT': r.nome, 'en-GB': en?.name ?? null },
		description: { 'it-IT': r.descrizione, 'en-GB': en?.description ?? null },
		sourceType: SOURCE[r.tipo],
		sourceUrl: r.url ?? null,
		bookId,
		bookPages: r.libro?.pagine ?? null,
		durationMinutes: durationOf(r.tempo),
		baseServings: r.porzioni_base,
		ingredients: lines.map(({ ingredientId, quantity, sourceText }) => ({ ingredientId, quantity, sourceText })),
		mealType: mealTypeOf(r),
		proteinGroup: PROTEIN_TAGS.find(([tag]) => r.tag.includes(tag))?.[1] ?? null,
		tags: r.tag,
		photo: existsSync(resolve(imagesDir, `${r.id}.jpg`)) ? `/assets/recipe-images/${r.id}.jpg` : null
	};
});

if (reportMissing) {
	console.log(JSON.stringify(missing, null, 2));
	process.exit(0);
}
if (Object.keys(missing.recipes).length || Object.keys(missing.ingredients).length) {
	console.error('Missing en-GB translations. Run with --report-missing and complete scripts/demo-translations.en-GB.json');
	process.exit(1);
}

const byId = new Map(recipes.map((r) => [r.id, r]));
const cookedOf = (recipeId: string, startsOn: string, dayIndex: number, meal: 'pranzo' | 'cena') =>
	originRecipes.find((r) => r.id === recipeId)?.storico.find((s) => s.settimana === startsOn && s.pasto === `${DAY_KEYS[dayIndex]}-${meal}`)?.cucinata ?? null;

function weekFromMenu(startsOn: string): Week {
	const menu = parse(readFileSync(resolve(origin, `menu/${startsOn}/menu.yaml`), 'utf8')) as OriginMenu;
	const slots: MealSlot[] = [];
	menu.giorni.forEach((day, dayIndex) => {
		for (const key of ['pranzo', 'cena'] as const) {
			const s = day[key];
			if (!s) continue;
			const mealType = MEAL_KEYS[key];
			slots.push({
				id: `${day.data}-${mealType}`,
				date: day.data,
				mealType,
				recipeId: s.ricetta ?? null,
				freeText: s.libero ?? null,
				servings: s.porzioni ?? 4,
				note: null,
				cooked: s.ricetta ? cookedOf(s.ricetta, startsOn, dayIndex, key) : null,
				updatedBy: null,
				updatedAt: null
			});
		}
	});
	return { id: `week-${startsOn}`, familyId: 'family-main', startsOn, generatedAt: `${addDays(startsOn, -5)}T20:00`, slots };
}

const weeks = [
	weekFromMenu('2026-09-21'),
	weekFromMenu('2026-09-28'),
	weekFromMenu('2026-10-05')
];

function draftWeek(template: Week, recent: Week[]): Week {
	const startsOn = '2026-10-12';
	const used = new Set(recent.flatMap((w) => w.slots.map((s) => s.recipeId)).filter(Boolean));
	const candidates = recipes.filter((r) => r.status === 'published').sort((a, b) => a.id.localeCompare(b.id));
	const slots = template.slots.map((slot): MealSlot => {
		const date = addDays(startsOn, (new Date(`${slot.date}T00:00:00Z`).getUTCDay() + 6) % 7);
		const base = { ...slot, id: `${date}-${slot.mealType}`, date, cooked: null, updatedBy: null, updatedAt: null, note: null };
		if (slot.freeText) return base;
		if (date === '2026-10-14' && slot.mealType === 'dinner') return { ...base, recipeId: null };
		const pick = candidates.find((r) => !used.has(r.id) && (r.mealType === 'both' || r.mealType === slot.mealType));
		if (pick) used.add(pick.id);
		return { ...base, recipeId: pick?.id ?? null };
	});
	return { id: `week-${startsOn}`, familyId: 'family-main', startsOn, generatedAt: '2026-10-07T20:00', slots };
}

weeks.push(draftWeek(weeks[2], weeks.slice(1)));

for (const week of weeks) for (const slot of week.slots) if (slot.recipeId && !byId.has(slot.recipeId)) throw new Error(`Unknown recipe ${slot.recipeId}`);

const federicoRatings = originRecipes
	.filter((r) => r.feedback && FEEDBACK_TO_STARS[r.feedback])
	.map((r) => ({ recipeId: r.id, stars: FEEDBACK_TO_STARS[r.feedback as number] }));

writeFileSync(
	output,
	JSON.stringify({ books: [...books.values()], ingredients: [...ingredients.values()], recipes, weeks, federicoRatings }, null, '\t') + '\n'
);
console.log(`Wrote ${recipes.length} recipes, ${ingredients.size} ingredients, ${weeks.length} weeks`);
