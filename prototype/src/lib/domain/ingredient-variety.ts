import type { DemoDatabase, Locale, RecipeContent, RecipeIngredient, Translated } from './types';

// Variety of an ingredient on a recipe line (round 5): free text ("Roma", "gialla senza semi"), no list to
// map in advance. The catalogue ingredient stays the structured part (aisle, pantry, conversions, avoided
// ingredients); the variety only tells what to buy, so the shopping list keeps different varieties apart.

export const VARIETY_MAX = 40;

/** Words that do not change the product: "tipo Roma" is "Roma". */
const FILLER = new Set(['tipo', 'varieta', 'var', 'qualita', 'type', 'variety']);

/** How the preparation is written: it belongs to how the ingredient is used, not to what is bought. */
const PREPARATION = [
	'tritat', 'a dadini', 'a cubetti', 'a fette', 'affettat', 'grattugiat', 'succo', 'scorza', 'schiacciat', 'tagliat', 'a pezzi',
	'sminuzzat', 'frullat', 'spezzettat', 'a julienne', 'a rondelle', 'chopped', 'diced', 'sliced', 'grated', 'juice', 'zest',
	'minced', 'crushed', 'shredded', 'cubed'
];

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Comparison key: case, accents, punctuation, extra spaces and filler words ignored. */
export function normalizeVariety(text: string | null | undefined): string {
	if (!text) return '';
	return plain(text)
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((word) => word && !FILLER.has(word))
		.join(' ');
}

/** Stored as written, only trimmed and with single spaces (proper names keep their capitals). */
export const cleanVariety = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Key of a recipe line: the same ingredient may appear twice with different varieties. */
export const lineKey = (line: Pick<RecipeIngredient, 'ingredientId' | 'variety'>) => `${line.ingredientId}~${normalizeVariety(line.variety?.['it-IT'])}`;

/** Name shown in recipes and lists: "Pomodori Roma", "Uva gialla senza semi". */
export const withVariety = (name: string, variety: string | null | undefined) => (variety ? `${name} ${variety}` : name);

/** Every recipe and draft content, where varieties already used are found. */
function contents(db: DemoDatabase): RecipeContent[] {
	return [...db.recipes, ...db.recipeDrafts.map((d) => d.content)];
}

export interface KnownVariety {
	variety: Translated;
	uses: number;
}

/** Varieties already written for an ingredient, one per comparison key, in the most used spelling. */
export function knownVarieties(db: DemoDatabase, ingredientId: string): KnownVariety[] {
	const groups = new Map<string, Map<string, { variety: Translated; uses: number }>>();
	for (const content of contents(db))
		for (const line of content.ingredients) {
			if (line.ingredientId !== ingredientId || !line.variety?.['it-IT']) continue;
			const key = normalizeVariety(line.variety['it-IT']);
			const spellings = groups.get(key) ?? new Map();
			const spelling = JSON.stringify(line.variety);
			const found = spellings.get(spelling) ?? { variety: { ...line.variety }, uses: 0 };
			found.uses++;
			spellings.set(spelling, found);
			groups.set(key, spellings);
		}
	return [...groups.values()]
		.map((spellings) => {
			const all = [...spellings.values()];
			const best = all.sort((a, b) => b.uses - a.uses)[0];
			return { variety: best.variety, uses: all.reduce((n, s) => n + s.uses, 0) };
		})
		.sort((a, b) => b.uses - a.uses || a.variety['it-IT'].localeCompare(b.variety['it-IT'], 'it-IT'));
}

/**
 * Advice on a variety being written (warnings, never blocks): an existing spelling of the same variety,
 * the ingredient name repeated, a preparation instead of a variety. Same rules for the form and MCP.
 */
export type VarietyHint =
	| { kind: 'existing_spelling'; suggestion: Translated }
	| { kind: 'repeats_ingredient'; suggestion: string }
	| { kind: 'preparation' };

export function varietyHints(db: DemoDatabase, ingredientId: string, text: string, locale: Locale): VarietyHint[] {
	const hints: VarietyHint[] = [];
	const cleaned = cleanVariety(text);
	if (!cleaned) return hints;
	const ingredient = db.ingredients.find((i) => i.id === ingredientId);
	const name = ingredient?.name[locale] ?? ingredient?.name['it-IT'] ?? '';
	// "Pomodoro tipo Roma" on Pomodori: drop the ingredient name (singular or plural stem) and filler words.
	const stem = plain(name).split(' ')[0]?.replace(/[aeio]$/, '') ?? '';
	const words = cleaned.split(' ');
	let start = stem.length >= 3 && words.length > 1 && plain(words[0]).startsWith(stem) ? 1 : 0;
	const repeats = start === 1;
	while (start < words.length - 1 && FILLER.has(plain(words[start]))) start++;
	const core = words.slice(start).join(' ');
	const spelling = (v: Translated) => v[locale] ?? v['it-IT'];
	const known = knownVarieties(db, ingredientId).find((k) => normalizeVariety(spelling(k.variety)) === normalizeVariety(core));
	if (repeats) hints.push({ kind: 'repeats_ingredient', suggestion: known ? spelling(known.variety) : core });
	else if (known && spelling(known.variety) !== cleaned) hints.push({ kind: 'existing_spelling', suggestion: known.variety });
	if (PREPARATION.some((p) => ` ${plain(cleaned)} `.includes(p))) hints.push({ kind: 'preparation' });
	return hints;
}
