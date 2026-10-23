import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { isBlocking } from '../api/errors';
import { keepPreviousWithin, searchQuery, useQueryDeps } from '../api/queries';
import type { FamilyView, RecipeQuery } from '../api/types';
import { FamilyNotice } from '../components/FamilyGate';
import { RecipeListSkeleton } from '../components/PageSkeletons';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeFilters } from '../components/RecipeFilters';
import { LoadingArea, LoadingScope } from '../components/Skeleton';
import { StateNotice } from '../components/StateNotice';
import { ArchivedRecipesSection } from '../features/catalogue/ArchivedRecipesSection';
import { CatalogueDraftsSection } from '../features/catalogue/CatalogueDraftsSection';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { resortByLastEaten } from '../lib/mealTime';
import { useMealClock } from '../lib/useMealClock';
import { useFamily } from '../session/useFamily';
import { toRecipeQuery, toRecipesSearch } from './search';

const route = getRouteApi('/_app/recipes');

export function RecipesPage() {
  const t = useT();
  const state = useFamily();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const query = toRecipeQuery(search);
  const update = (next: RecipeQuery) => void navigate({ search: toRecipesSearch(next), replace: true });
  // One tree in every state (W20): title, filters and the curator's sections never remount while the
  // profile and the results load, so an open filter panel and a field being typed in stay as they are.
  // The curator's sections do not depend on the family (spec of W3, section 1): also next to «no family».
  // Results and sections are one wait (W22): one announcement, each part shown when its data arrives.
  const waitingOrReady = state.status === 'loading' || state.status === 'ready';
  return (
    <section className="secondary-view app-view">
      <div className="page-column wide">
        <header className="page-header">
          <h1 className="page-title">{t('recipes.title')}</h1>
        </header>
        {waitingOrReady && <RecipeFilters query={query} onChange={update} />}
        <LoadingScope gather>
          <CatalogueDraftsSection />
          {state.status === 'ready' ? (
            <RecipesResults family={state.family} query={query} update={update} />
          ) : state.status === 'loading' ? (
            <LoadingArea loading paused={state.paused} skeleton={<RecipeListSkeleton />} />
          ) : (
            <FamilyNotice state={state} />
          )}
          <ArchivedRecipesSection />
        </LoadingScope>
      </div>
    </section>
  );
}

/** The results of the recipe book for the family: the only part that changes with the reads. */
function RecipesResults({ family, query, update }: { family: FamilyView; query: RecipeQuery; update: (next: RecipeQuery) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const options = searchQuery(deps, family.id, query);
  // Previous results only while filters or sorting change (second review, C7).
  const results = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale']) });
  // Cached recipes stay visible only when the device is offline (review, finding 2).
  const blocked = results.isError && isBlocking(results.error, !!results.data);
  const read = blocked ? undefined : results.data?.items;
  // «Recently eaten» moves on with the clock: a planned meal that passes needs no new read (spec of W6, decision 7).
  const now = useMealClock(useMemo(() => (read ?? []).map((item) => item.upcoming), [read]));
  const items = read && query.sort === 'lastEaten' ? resortByLastEaten(read, now, !!query.reversed, locale) : read;

  return (
    <>
      {blocked && <QueryError error={results.error} onRetry={() => void results.refetch()} />}
      <LoadingArea loading={!blocked && results.isPending} paused={results.fetchStatus === 'paused'} skeleton={<RecipeListSkeleton />}>
        {items?.length === 0 && (
          <StateNotice title={t('recipes.noResults.title')} body={t('recipes.noResults.body')}>
            <button type="button" className="text-button" onClick={() => update({})}>{t('recipes.reset')}</button>
          </StateNotice>
        )}
        {!!items?.length && <p className="meta-line" role="status">{t('recipes.count', { count: items.length })}</p>}
        {!!items?.length && (
          <div className="recipe-grid">
            {items.map((item) => (
              <RecipeCard
                key={item.recipe.id}
                cardKey={item.recipe.id}
                label={item.recipe.proteinGroup ? t(`group.${item.recipe.proteinGroup}`) : null}
                kind="recipe"
                recipe={item.recipe}
                freeText={null}
                servings={item.baseServings}
                ingredients={item.ingredients}
                note={null}
                rating={item.rating}
                lastChange={null}
                detailSearch={{ from: 'recipes' }}
                familyId={family.id}
              />
            ))}
          </div>
        )}
      </LoadingArea>
    </>
  );
}
