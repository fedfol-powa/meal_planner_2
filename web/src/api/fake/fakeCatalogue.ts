import type { ArchivedSummaryView, DraftSummaryView, DraftView, StatusView } from '@app/contract';
import type { Locale } from '../../i18n/translate';
import { ApiError } from '../errors';
import type { Api } from '../types';
import type { Translated } from './quantity';
import { DEMO_PEOPLE } from './seed';

// FAKE catalogue area for the fake mode: the drafts and archived recipes the curator sections show.
interface DemoRecipe {
  id: string; status: string; name: Translated; description: Translated; sourceType: string; sourceUrl: string | null;
  durationMinutes: number | null; baseServings: number | null; mealType: string; proteinGroup: string | null;
  ingredients: { ingredientId: string; sourceText: string }[];
}

/** The archived recipes of the session, shared by the clients of both languages (in FakeData). */
export interface FakeCatalogueData {
  archived: { recipeId: string; archivedBy: string; archivedAt: string }[];
}

/** A published demo recipe on no menu starts archived, so bringing it back puts it in the recipe book. */
const ARCHIVED_DEMO_RECIPE = 'riso-curry-giappone';

export function createFakeCatalogueData(recipes: { id: string; status: string }[]): FakeCatalogueData {
  const recipe = recipes.find((r) => r.id === ARCHIVED_DEMO_RECIPE && r.status === 'published');
  if (!recipe) return { archived: [] };
  recipe.status = 'archived';
  return { archived: [{ recipeId: recipe.id, archivedBy: 'user-federico', archivedAt: '2026-10-05T10:00:00.000Z' }] };
}

export interface FakeCatalogueDeps {
  getLocale: () => Locale;
  latencyMs?: number;
  recipes: DemoRecipe[];
  data: FakeCatalogueData;
  ingredientName: (ingredientId: string, locale: Locale) => string | null;
}

const person = (id: string) => ({ userId: id, name: DEMO_PEOPLE.find((p) => p.id === id)?.displayName ?? null });
const text = (value: Translated, locale: Locale) => value[locale] || value['it-IT'] || value['en-GB'] || '';

interface FakeDraft { draftId: string; recipe: DemoRecipe; kind: 'new' | 'revision'; updatedBy: string; updatedAt: string; missing: DraftSummaryView['missing'] }

export function createFakeCatalogue(deps: FakeCatalogueDeps): Api['catalogue'] {
  const newRecipe = deps.recipes.find((r) => r.status === 'draft');
  const revised = deps.recipes.find((r) => r.status === 'published');
  const drafts: FakeDraft[] = [
    ...(newRecipe ? [{ draftId: `draft-${newRecipe.id}`, recipe: newRecipe, kind: 'new' as const, updatedBy: 'user-anna', updatedAt: '2026-10-06T16:00:00.000Z', missing: ['attributes', 'baseServings', 'ingredients', 'translation'] as DraftSummaryView['missing'] }] : []),
    ...(revised ? [{ draftId: `draft-${revised.id}`, recipe: revised, kind: 'revision' as const, updatedBy: 'user-federico', updatedAt: '2026-10-08T09:30:00.000Z', missing: [] }] : [])
  ];

  async function delayed<T>(value: T): Promise<T> {
    if (deps.latencyMs) await new Promise((resolve) => setTimeout(resolve, deps.latencyMs));
    return structuredClone(value);
  }
  const notServed = async (): Promise<never> => {
    throw new ApiError('not_found');
  };

  function draftView(d: FakeDraft, locale: Locale): DraftView {
    const r = d.recipe;
    const lines = r.ingredients.map((l) => ({
      ingredientId: l.ingredientId, variety: null, preparation: null, quantity: { kind: 'to_taste' as const }, sourceText: l.sourceText, isOptional: false, isPrimary: false
    }));
    return {
      draftId: d.draftId, recipeId: r.id, kind: d.kind, revision: 2,
      content: {
        schemaVersion: 1, name: { 'it-IT': r.name['it-IT'] ?? '', 'en-GB': r.name['en-GB'] }, description: { 'it-IT': r.description['it-IT'] ?? '', 'en-GB': r.description['en-GB'] },
        sourceType: r.sourceType as 'web', sourceUrl: r.sourceUrl, durationMinutes: r.durationMinutes, baseServings: r.baseServings, ingredients: lines,
        mealType: r.mealType as 'lunch', proteinGroup: r.proteinGroup as 'fish' | null,
        // The revision is ready to publish: the attributes the demo recipes do not carry, chosen for the demo.
        ...(d.kind === 'revision' ? { carbohydrateGroup: 'rice' as const, category: 'wok' as const, isFreshFish: false, hasVegetables: true, isHeavy: false, seasons: [] } : {})
      },
      createdBy: person(d.updatedBy), createdAt: d.updatedAt, updatedBy: person(d.updatedBy), updatedAt: d.updatedAt,
      baseVersion: d.kind === 'revision' ? 1 : null, currentVersion: d.kind === 'revision' ? 1 : 0, recipeStatus: d.kind === 'revision' ? 'published' : 'draft',
      issues: d.kind === 'new' ? [{ path: ['baseServings'], code: 'required' }, { path: ['name', 'en-GB'], code: 'translation_missing' }] : [],
      missing: d.missing, conversions: [], outcome: null, canDiscard: true,
      ingredientNames: Object.fromEntries(r.ingredients.map((l) => [l.ingredientId, deps.ingredientName(l.ingredientId, locale) ?? l.ingredientId])),
      bookTitle: null
    };
  }

  return {
    getGuide: notServed, listDraftSaves: notServed, getDraftSave: notServed, createDraft: notServed, startRevision: notServed, saveDraft: notServed,
    checkDraft: notServed, publish: notServed, discardDraft: notServed, searchRecipes: notServed, listVersions: notServed, getVersion: notServed,
    restoreVersion: notServed, searchIngredients: notServed, getIngredient: notServed, listVarieties: notServed, checkVariety: notServed,
    createIngredient: notServed, updateIngredient: notServed, setEquivalence: notServed, removeEquivalence: notServed, listBooks: notServed, createBook: notServed,
    async overview() {
      const locale = deps.getLocale();
      return delayed({
        drafts: drafts.map((d) => ({
          draftId: d.draftId, recipeId: d.recipe.id, kind: d.kind, name: text(d.recipe.name, locale),
          createdBy: person(d.updatedBy), updatedBy: person(d.updatedBy), updatedAt: d.updatedAt, missing: d.missing
        })),
        archived: deps.data.archived.flatMap((a): ArchivedSummaryView[] => {
          const recipe = deps.recipes.find((r) => r.id === a.recipeId);
          return recipe ? [{ recipeId: a.recipeId, name: text(recipe.name, locale), archivedBy: person(a.archivedBy), archivedAt: a.archivedAt }] : [];
        })
      });
    },
    async getDraft({ draftId }) {
      const draft = drafts.find((d) => d.draftId === draftId);
      if (!draft) throw new ApiError('not_found');
      return delayed(draftView(draft, deps.getLocale()));
    },
    async setArchived({ recipeId, archived: wanted }) {
      const recipe = deps.recipes.find((r) => r.id === recipeId && r.status === 'archived');
      if (wanted || !recipe) throw new ApiError('not_found');
      deps.data.archived = deps.data.archived.filter((a) => a.recipeId !== recipeId);
      recipe.status = 'published';
      const answer: StatusView = { recipeId, status: 'published', changedBy: person('user-federico'), changedAt: new Date().toISOString() };
      return delayed(answer);
    }
  };
}
