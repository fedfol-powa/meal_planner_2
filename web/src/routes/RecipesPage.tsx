import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { isBlocking } from '../api/errors';
import { keepPreviousWithin, searchQuery, useQueryDeps } from '../api/queries';
import type { FamilyView, RecipeQuery } from '../api/types';
import { FamilyGate } from '../components/FamilyGate';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeFilters } from '../components/RecipeFilters';
import { StateNotice } from '../components/StateNotice';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { resortByLastEaten } from '../lib/mealTime';
import { useMealClock } from '../lib/useMealClock';
import { toRecipeQuery, toRecipesSearch } from './search';

const route = getRouteApi('/_app/recipes');

export function RecipesPage() {
  return <FamilyGate>{(family) => <RecipesView family={family} />}</FamilyGate>;
}

function RecipesView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const query = toRecipeQuery(search);
  const deps = useQueryDeps();
  const options = searchQuery(deps, family.id, query);
  // Previous results only while filters or sorting change (second review, C7).
  const results = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale']) });
  const update = (next: RecipeQuery) => void navigate({ search: toRecipesSearch(next), replace: true });
  // Cached recipes stay visible only when the device is offline (review, finding 2).
  const blocked = results.isError && isBlocking(results.error, !!results.data);
  const read = blocked ? undefined : results.data?.items;
  // «Recently eaten» moves on with the clock: a planned meal that passes needs no new read (spec of W6, decision 7).
  const now = useMealClock(useMemo(() => (read ?? []).map((item) => item.upcoming), [read]));
  const items = read && query.sort === 'lastEaten' ? resortByLastEaten(read, now, !!query.reversed, locale) : read;

  return (
    <section className="secondary-view app-view">
      <div className="page-column wide">
        <header className="page-header">
          <h1 className="page-title">{t('recipes.title')}</h1>
        </header>
        <RecipeFilters query={query} onChange={update} />
        {blocked && <QueryError error={results.error} onRetry={() => void results.refetch()} />}
        {!blocked && results.isPending && <Loading />}
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
      </div>
    </section>
  );
}
