import { beforeEach, describe, expect, it } from 'vitest';
import { contentOf } from '#lib/domain/recipe-content.ts';
import type { DemoDatabase, RecipeContent } from '#lib/domain/types.ts';
import { createInitial } from '#lib/store/persistence.ts';
import type { OperationContext } from './context';
import {
	archiveRecipe,
	checkVariety,
	createDraft,
	createIngredient,
	discardDraft,
	emptyContent,
	getCurationOverview,
	getDraft,
	getIngredientVarieties,
	getRecipeVersion,
	getRecipeVersions,
	publishDraft,
	restoreVersion,
	saveDraft,
	searchCatalogueIngredients,
	startRevision,
	unarchiveRecipe,
	checkDraft
} from './curation';
import { getWeekView } from './meals';
import { getRecipeDetail, searchRecipes } from './recipes';
import { getWeekShoppingList } from './shopping-lists';
import { getSuggestions } from './suggestions';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const lucia = (over: Partial<OperationContext> = {}) => ctx({ userId: 'user-lucia', familyId: 'family-grandparents', ...over });
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

beforeEach(() => { db = createInitial().db; });

const soup = (): RecipeContent => ({
	...emptyContent(),
	name: { 'it-IT': 'Zuppa di lenticchie', 'en-GB': 'Lentil soup' },
	description: { 'it-IT': 'Lenticchie e brodo.', 'en-GB': 'Lentils and stock.' },
	durationMinutes: 40,
	baseServings: 4,
	mealType: 'dinner',
	proteinGroup: 'legumes',
	ingredients: [{ ingredientId: 'brodo-vegetale', quantity: { kind: 'amount', value: 1, unit: 'l' }, sourceText: '1 l', text: null, variety: null, isOptional: false }]
});

describe('permissions', () => {
	it('is for curators only, and read-only offline', () => {
		expect(getCurationOverview(db, ctx({ userId: 'user-anna' })).ok).toBe(false);
		expect(getCurationOverview(db, ctx({ offline: true })).ok).toBe(true);
		expect(createDraft(db, ctx({ offline: true }), soup())).toEqual({ ok: false, error: 'offline' });
	});
});

describe('overview', () => {
	it('lists drafts, most recent first, with author and what is missing', () => {
		const { drafts, archived } = value(getCurationOverview(db, ctx()));
		expect(drafts.map((d) => d.id).slice(0, 2)).toEqual(['revision-omelette-spinaci-montasio', 'draft-vellutata-zucca-ceci']);
		expect(drafts[0]).toMatchObject({ kind: 'revision', createdByName: 'Lucia', missing: [] });
		expect(drafts[1].missing).toEqual(['baseServings', 'translation']);
		expect(drafts).toHaveLength(6);
		expect(archived.map((a) => a.recipeId)).toEqual(['riso-curry-giappone']);
	});
	it('filters with the catalogue search text', () => {
		expect(value(getCurationOverview(db, ctx(), 'TACCHINO')).drafts.map((d) => d.recipeId)).toEqual(['polpettine-tacchino-skottle']);
	});
});

describe('new recipe', () => {
	it('saves an incomplete draft and publishes it only when the full check passes', () => {
		const partial = { ...soup(), baseServings: null };
		const created = value(createDraft(db, ctx(), partial));
		if (created.status !== 'created') throw new Error('not created');
		expect(searchRecipes(db, ctx(), { text: 'zuppa di lenticchie' })).toEqual({ ok: true, value: [] });

		expect(value(checkDraft(db, ctx(), created.draftId)).issues).toEqual([{ field: 'baseServings', code: 'required' }]);
		expect(value(publishDraft(db, ctx(), created.draftId))).toEqual({ status: 'invalid', issues: [{ field: 'baseServings', code: 'required' }] });

		expect(value(saveDraft(db, ctx(), created.draftId, soup(), 1))).toEqual({ status: 'saved', revision: 2 });
		const published = value(publishDraft(db, ctx(), created.draftId));
		expect(published).toEqual({ status: 'published', recipeId: 'zuppa-di-lenticchie', version: 1 });
		expect(value(searchRecipes(db, ctx(), { text: 'zuppa di lenticchie' })).map((i) => i.recipe.id)).toEqual(['zuppa-di-lenticchie']);
		expect(db.recipeDrafts.some((d) => d.id === created.draftId)).toBe(false);
		expect(db.recipes.find((r) => r.id === 'zuppa-di-lenticchie')?.addedOn).toBe('2026-10-06');
	});
	it('checks a draft without publishing it', () => {
		expect(value(checkDraft(db, lucia(), 'draft-vellutata-zucca-ceci')).issues.length).toBeGreaterThan(0);
		expect(db.recipeDrafts.some((d) => d.id === 'draft-vellutata-zucca-ceci')).toBe(true);
	});
	it('refuses invalid data even in a draft', () => {
		const outcome = value(createDraft(db, ctx(), { ...soup(), sourceUrl: 'nope' }));
		expect(outcome).toEqual({ status: 'invalid', issues: [{ field: 'sourceUrl', code: 'invalid_url' }] });
	});
	it('deletes a new draft unless meals cite it', () => {
		db.weeks[0].slots[0].recipeId = 'salmone-skottle-fagiolini-patate';
		expect(value(getDraft(db, ctx(), 'draft-salmone-skottle-fagiolini-patate')).canDiscard).toBe(false);
		expect(discardDraft(db, ctx(), 'draft-salmone-skottle-fagiolini-patate')).toEqual({ ok: false, error: 'not_allowed' });
		value(discardDraft(db, ctx(), 'draft-vellutata-zucca-ceci'));
		expect(db.recipes.some((r) => r.id === 'vellutata-zucca-ceci')).toBe(false);
	});
});

describe('conflicts between curators', () => {
	it('refuses a save based on an older revision, then overwrites on purpose keeping the history', () => {
		const draftId = 'draft-vellutata-zucca-ceci';
		const mine = contentOf(value(getDraft(db, ctx(), draftId)).draft.content);
		const theirs = contentOf(mine);
		theirs.durationMinutes = 45;
		value(saveDraft(db, lucia({ now: '2026-10-06T18:42' }), draftId, theirs, 1));

		mine.baseServings = 4;
		const conflict = value(saveDraft(db, ctx(), draftId, mine, 1));
		expect(conflict).toMatchObject({ status: 'conflict', byName: 'Lucia', at: '2026-10-06T18:42', revision: 2, theirFields: ['durationMinutes'], myFields: ['baseServings'] });

		expect(value(saveDraft(db, ctx(), draftId, mine, 1, true))).toEqual({ status: 'saved', revision: 3 });
		const draft = db.recipeDrafts.find((d) => d.id === draftId)!;
		expect(draft.history.map((h) => h.content.durationMinutes)).toEqual([35, 45, 35]);
	});
});

describe('revision of a published recipe', () => {
	it('keeps families on the published version until the revision is published', () => {
		const draftId = value(startRevision(db, ctx(), 'pasta-tonno')).draftId;
		expect(value(startRevision(db, lucia(), 'pasta-tonno')).draftId).toBe(draftId);
		const content = contentOf(value(getDraft(db, ctx(), draftId)).draft.content);
		content.name['it-IT'] = 'Pasta al tonno e limone';
		value(saveDraft(db, ctx(), draftId, content, 1));
		expect(value(getRecipeDetail(db, ctx(), 'pasta-tonno')).recipe.name).not.toBe('Pasta al tonno e limone');
		expect(value(publishDraft(db, ctx(), draftId))).toMatchObject({ status: 'published', version: 2 });
		expect(value(getRecipeDetail(db, ctx(), 'pasta-tonno')).recipe.name).toBe('Pasta al tonno e limone');
	});
	it('warns when the recipe got a newer version after the revision started', () => {
		const draftId = 'revision-omelette-spinaci-montasio';
		// Someone publishes another version of the omelette meanwhile.
		db.recipes.find((r) => r.id === 'omelette-spinaci-montasio')!.version = 2;
		db.recipeVersions.push({ recipeId: 'omelette-spinaci-montasio', version: 2, content: contentOf(db.recipes.find((r) => r.id === 'omelette-spinaci-montasio')!), publishedBy: 'user-federico', publishedAt: '2026-10-06T11:00', restoredFrom: null });
		expect(value(publishDraft(db, lucia(), draftId))).toEqual({ status: 'stale', byName: 'Federico', at: '2026-10-06T11:00', version: 2 });
		expect(value(publishDraft(db, lucia(), draftId, true))).toMatchObject({ status: 'published', version: 3 });
	});
});

describe('versions in meals (review R1)', () => {
	it('shows past meals with the version they were eaten with, today and later with the current one', () => {
		const past = value(getWeekView(db, ctx(), '2026-09-21')).days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-09-23-dinner')!;
		const future = value(getWeekView(db, ctx(), '2026-10-05')).days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-07-dinner')!;
		expect(past.ingredients?.map((i) => i.ingredientId)).toEqual(['hamburger-di-cavallo', 'panini-per-hamburger']);
		expect(future.ingredients?.map((i) => i.ingredientId)).toContain('pomodori');
	});
	it('builds the shopping list of the current week with the new version', () => {
		const list = value(getWeekShoppingList(db, ctx(), '2026-10-05'));
		expect(list.departments.flatMap((d) => d.items.map((i) => i.id))).toContain('pomodori');
		const old = value(getWeekShoppingList(db, ctx(), '2026-09-21'));
		expect(old.departments.flatMap((d) => d.items.map((i) => i.id))).not.toContain('pomodori');
	});
	it('opens the recipe from a past meal on that version, saying it was updated since', () => {
		const detail = value(getRecipeDetail(db, ctx(), 'hamburger-cavallo', undefined, '2026-09-23-dinner'));
		expect(detail.ingredients.map((i) => i.ingredientId)).not.toContain('pomodori');
		expect(detail.shownVersion).toEqual({ version: 1, current: 2 });
		expect(value(getRecipeDetail(db, ctx(), 'hamburger-cavallo')).shownVersion).toBeNull();
		const member = value(getRecipeDetail(db, ctx({ userId: 'user-anna' }), 'hamburger-cavallo', undefined, '2026-09-23-dinner'));
		expect(member.shownVersion).toBeNull();
		expect(member.ingredients.map((i) => i.ingredientId)).not.toContain('pomodori');
	});
});

describe('versions and restore', () => {
	it('lists versions, opens an older one as it was and restores it as a new version', () => {
		expect(value(getRecipeVersions(db, ctx(), 'hamburger-cavallo')).versions.map((v) => [v.version, v.byName])).toEqual([[2, 'Lucia'], [1, 'Federico']]);
		const old = value(getRecipeVersion(db, ctx(), 'hamburger-cavallo', 1));
		expect(old).toMatchObject({ version: 1, current: 2, issues: [] });
		expect(old.ingredients.map((i) => i.ingredientId)).toEqual(['hamburger-di-cavallo', 'panini-per-hamburger']);
		expect(value(restoreVersion(db, ctx(), 'hamburger-cavallo', 1))).toEqual({ status: 'restored', version: 3 });
		expect(value(getRecipeVersions(db, ctx(), 'hamburger-cavallo')).versions[0]).toMatchObject({ version: 3, restoredFrom: 1, byName: 'Federico' });
		expect(db.recipes.find((r) => r.id === 'hamburger-cavallo')!.ingredients).toHaveLength(2);
	});
	it('refuses a version that no longer passes today\'s check', () => {
		db.ingredients.find((i) => i.id === 'panini-per-hamburger')!.name['en-GB'] = null;
		expect(value(restoreVersion(db, ctx(), 'hamburger-cavallo', 1))).toEqual({
			status: 'invalid', issues: [{ field: 'ingredients', code: 'translation_missing', line: 1, part: 'ingredient', locale: 'en-GB' }]
		});
		expect(db.recipes.find((r) => r.id === 'hamburger-cavallo')!.version).toBe(2);
	});
	it('does not restore the current version', () => {
		expect(restoreVersion(db, ctx(), 'hamburger-cavallo', 2)).toEqual({ ok: false, error: 'not_allowed' });
	});
});

describe('archive', () => {
	it('takes the recipe out of search and suggestions, keeps meals readable, restores', () => {
		value(archiveRecipe(db, ctx(), 'hamburger-cavallo'));
		expect(value(searchRecipes(db, ctx(), { text: 'hamburger di cavallo' }))).toEqual([]);
		const meal = value(getWeekView(db, ctx(), '2026-10-05')).days.flatMap((d) => d.meals).find((m) => m.slotId === '2026-10-07-dinner')!;
		expect(meal).toMatchObject({ kind: 'recipe', canOpenRecipe: true, canRate: true });
		const suggestions = value(getSuggestions(db, ctx(), '2026-10-09-dinner', 0));
		expect(suggestions.items.map((s) => s.recipe.id)).not.toContain('hamburger-cavallo');
		value(unarchiveRecipe(db, ctx(), 'hamburger-cavallo'));
		expect(value(searchRecipes(db, ctx(), { text: 'hamburger di cavallo' }))).toHaveLength(1);
	});
});

describe('ingredients', () => {
	it('adds a catalogue ingredient, with the English name checked at publication', () => {
		const { id } = value(createIngredient(db, ctx(), { 'it-IT': 'Lenticchie rosse', 'en-GB': '' }, 'pasta_grains'));
		expect(id).toBe('lenticchie-rosse');
		expect(db.ingredients.find((i) => i.id === id)?.name['en-GB']).toBeNull();
		expect(createIngredient(db, ctx(), { 'it-IT': ' ', 'en-GB': null }, 'produce')).toEqual({ ok: false, error: 'invalid' });
	});
});

describe('varieties', () => {
	const line = (variety: { 'it-IT': string; 'en-GB': string | null } | null) => ({
		ingredientId: 'pomodori', quantity: { kind: 'amount' as const, value: 2, unit: 'piece' as const }, sourceText: '2', text: null, variety, isOptional: false
	});
	it('turns the demo tomato varieties into Pomodori with a variety', () => {
		expect(db.ingredients.some((i) => i.id === 'pomodoro-cuore-di-bue')).toBe(false);
		expect(value(getIngredientVarieties(db, ctx(), 'pomodori')).map((v) => v['it-IT']).sort()).toEqual(['Roma', 'cuore di bue', 'ramati']);
	});
	it('allows the same ingredient twice only with different varieties, and needs both languages', () => {
		const content = { ...soup(), ingredients: [line({ 'it-IT': 'Roma', 'en-GB': null }), line({ 'it-IT': 'tipo roma', 'en-GB': null })] };
		const issues = value(createDraft(db, ctx(), content));
		expect(issues).toEqual({ status: 'invalid', issues: [{ field: 'ingredients', code: 'duplicate_ingredient', line: 1, part: 'ingredient' }] });
		content.ingredients[1] = line({ 'it-IT': '  cuore   di bue ', 'en-GB': '' });
		const created = value(createDraft(db, ctx(), content));
		if (created.status !== 'created') throw new Error('not created');
		const saved = value(getDraft(db, ctx(), created.draftId)).draft.content.ingredients[1].variety;
		expect(saved).toEqual({ 'it-IT': 'cuore di bue', 'en-GB': null });
		expect(value(checkDraft(db, ctx(), created.draftId)).issues).toEqual([
			{ field: 'ingredients', code: 'translation_missing', line: 0, part: 'variety', locale: 'en-GB' },
			{ field: 'ingredients', code: 'translation_missing', line: 1, part: 'variety', locale: 'en-GB' }
		]);
	});
	it('advises on spelling, a repeated ingredient name and a preparation, without blocking', () => {
		const hints = (text: string) => value(checkVariety(db, ctx(), 'pomodori', text, 'it-IT')).map((h) => h.kind);
		expect(hints('tipo ROMA')).toEqual(['existing_spelling']);
		expect(hints('Pomodoro Roma')).toEqual(['repeats_ingredient']);
		expect(hints('a dadini')).toEqual(['preparation']);
		expect(hints('Roma')).toEqual([]);
		expect(value(checkVariety(db, ctx(), 'pomodori', 'Pomodoro tipo roma', 'it-IT'))).toEqual([{ kind: 'repeats_ingredient', suggestion: 'Roma' }]);
	});
	it('finds an ingredient by a variety already used', () => {
		expect(value(searchCatalogueIngredients(db, ctx(), 'cuore di')).map((m) => [m.id, m.variety?.['it-IT']])).toEqual([['pomodori', 'cuore di bue']]);
	});
	it('sums the spellings of a variety in the shopping list and keeps varieties apart', () => {
		const recipe = db.recipes.find((r) => r.id === 'riso-ceci-spinaci-mandorle')!;
		recipe.ingredients.push({ ...line({ 'it-IT': 'Roma', 'en-GB': 'Roma' }) });
		const week = db.weeks.find((w) => w.slots.some((s) => s.recipeId === recipe.id))!;
		const list = value(getWeekShoppingList(db, ctx(), week.startsOn));
		const names = list.departments.flatMap((d) => d.items.map((i) => i.name)).filter((n) => n.startsWith('Pomodori'));
		expect(names).toContain('Pomodori Roma');
		expect(names).toContain('Pomodori');
	});
});
