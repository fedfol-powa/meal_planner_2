import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useAreaMutation } from '../../api/mutations';
import { keepPreviousWithin, searchQuery, useQueryDeps } from '../../api/queries';
import type { MealView, RecipeQuery, RecipeSummary } from '../../api/types';
import { Icon } from '../../components/Icon';
import { useOnline } from '../../components/OfflineBanner';
import { RatingStars } from '../../components/RatingStars';
import { RecipeFilters } from '../../components/RecipeFilters';
import { RecipePhoto, usePhotoLoad } from '../../components/RecipePhoto';
import { LoadingArea } from '../../components/Skeleton';
import ratingStyles from '../../components/RatingStars.module.css';
import { useT } from '../../i18n/LocaleProvider';
import type { EditorStage } from './MealEditor';
import { suggestionsQuery } from './queries';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

const MAX_RESULTS = 30;

/** «Cambia ricetta» (round 2 review): free, exclude and swap first, then suggestions, then search. */
export function RecipePicker({ familyId, weekStartsOn, meal, onStage, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onStage: (stage: EditorStage) => void; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const deps = useQueryDeps();
  const undo = useUndo();
  // Writes go off without network; reading, «Proponimene altri» and closing stay (PR #33 review, 4).
  const online = useOnline();
  const { message, handle } = useMealErrors(familyId, weekStartsOn);
  const [offset, setOffset] = useState(0);
  const suggestionsSection = useRef<HTMLElement>(null);
  // Starts on the slot's meal; results appear once the user types or changes a filter (prototype).
  const [query, setQuery] = useState<RecipeQuery>({ mealType: meal.mealType });
  const searching =
    !!query.text || query.mealType !== meal.mealType || !!query.maxMinutes || !!query.proteinGroup || !!query.minStars || !!query.sort || !!query.reversed;
  const [excluded, setExcluded] = useState<{ id: string; name: string } | null>(null);
  const suggestions = useQuery(suggestionsQuery(deps, familyId, meal.slotId, offset));
  const searchOptions = searchQuery(deps, familyId, query);
  // The previous results stay while the next search loads: the list does not collapse at each key (W20).
  const search = useQuery({ ...searchOptions, enabled: searching, placeholderData: keepPreviousWithin(searchOptions.queryKey, ['familyId', 'locale']) });
  const setRecipe = useMealMutation<{ recipeId: string }>('meals.setRecipe', familyId, weekStartsOn, ({ recipeId, id }) =>
    api.meals.setRecipe({ familyId, slotId: meal.slotId, recipeId, id })
  );
  const exclude = useAreaMutation('family.addExclusion', familyId, (recipeId: string) => api.family.addExclusion({ familyId, recipeId }));
  const include = useAreaMutation('family.removeExclusion', familyId, (recipeId: string) => api.family.removeExclusion({ familyId, recipeId }));
  const choose = (recipeId: string) =>
    setRecipe.mutate(
      { recipeId },
      {
        onSuccess: ({ view }) => {
          if (view.changed) undo.offer(view.actionId, weekStartsOn);
          onDone();
        },
        onError: (error) => handle(error, onDone)
      }
    );
  // A slot gone meanwhile: handled once per failed read, not on each render.
  useEffect(() => {
    if (suggestions.isError) handle(suggestions.error, onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.errorUpdatedAt]);
  const more = (nextOffset: number) => {
    setOffset(nextOffset);
    suggestionsSection.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  const meta = (recipe: RecipeSummary) =>
    [recipe.durationMinutes ? t('meal.minutes', { count: recipe.durationMinutes }) : null, recipe.proteinGroup ? t(`group.${recipe.proteinGroup}`) : null]
      .filter(Boolean)
      .join(' · ');
  const results = (search.data?.items ?? []).filter((item) => item.recipe.id !== meal.recipe?.id).slice(0, MAX_RESULTS);
  const current = meal.kind === 'recipe' && meal.rating ? meal.recipe : null;
  const failure = setRecipe.error ?? exclude.error ?? include.error;
  return (
    <div className={styles.picker}>
      {excluded && (
        <p className={styles.notice} role="status">
          <span>{t('meals.excluded', { name: excluded.name })}</span>
          <button type="button" disabled={include.isPending || !online} onClick={() => include.mutate(excluded.id, { onSuccess: () => setExcluded(null), onError: (error) => handle(error, onDone) })}>
            {t('meals.undoExclusion')}
          </button>
        </p>
      )}
      <ul className={styles.actions}>
        <li>
          <button type="button" onClick={() => onStage('free')}>
            <Icon name="free" />{t('meals.markFree')}
          </button>
        </li>
        {current && !excluded && (
          <li>
            <button type="button" disabled={exclude.isPending || !online} onClick={() => exclude.mutate(current.id, { onSuccess: () => setExcluded({ id: current.id, name: current.name }), onError: (error) => handle(error, onDone) })}>
              <Icon name="ban" />{t('meals.exclude')}
            </button>
          </li>
        )}
        <li>
          <button type="button" onClick={() => onStage('swap')}>
            <Icon name="swap" />{t('meals.swap')}
          </button>
        </li>
      </ul>
      {failure != null && <p className="meta-line" role="alert">{message(failure)}</p>}
      <section className={styles.suggestions} aria-labelledby={`${meal.slotId}-suggestions`} ref={suggestionsSection}>
        <h3 id={`${meal.slotId}-suggestions`} className={styles.title}>{t('meals.suggestions')}</h3>
        {/* Until the suggestions arrive, blocks of their shape (W20); an empty or failed read keeps their space. */}
        <LoadingArea loading={suggestions.isPending} paused={suggestions.fetchStatus === 'paused'} skeleton={<SuggestionsSkeleton />}>
          {(suggestions.isError || suggestions.data?.recipes.length === 0) && (
            <div className={styles.reserve} data-reserve>
              <div className={styles.reserved} aria-hidden="true"><SuggestionsSkeleton /></div>
              {suggestions.isError ? <p className="meta-line" role="alert">{message(suggestions.error)}</p> : <p className="meta-line">{t('meals.noSuggestions')}</p>}
            </div>
          )}
          {!!suggestions.data?.recipes.length && (
            <ul className={styles.cards}>
              {suggestions.data.recipes.map(({ recipe, rating }) => (
                <li key={recipe.id} className={styles.card}>
                  <button type="button" className={styles.cardBody} aria-label={t('meals.pick', { recipe: recipe.name })} disabled={setRecipe.isPending || !online} onClick={() => choose(recipe.id)}>
                    {recipe.photoUrl && <SuggestionPhoto url={recipe.photoUrl} />}
                    <span className={styles.name}>{recipe.name}</span>
                    {recipe.description && <span className={styles.description}>{recipe.description}</span>}
                    <span className={styles.meta}>{meta(recipe)}</span>
                  </button>
                  <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} readOnly />
                </li>
              ))}
            </ul>
          )}
          {!!suggestions.data?.recipes.length && (suggestions.data.nextOffset !== 0 || offset !== 0) && (
            <button type="button" className={`text-button ${styles.more}`} onClick={() => more(suggestions.data!.nextOffset)}>
              <Icon name="shuffle" />{t('meals.more')}
            </button>
          )}
        </LoadingArea>
      </section>
      <section className={styles.search} aria-labelledby={`${meal.slotId}-search`}>
        <h3 id={`${meal.slotId}-search`} className={styles.title}>{t('meals.search')}</h3>
        <RecipeFilters query={query} onChange={setQuery} />
        {/* The error and «Riprova» also show over results still in the cache, which stay readable. */}
        {searching && search.isError && (
          <p className="meta-line" role="alert">
            {message(search.error)}{' '}
            <button type="button" className="text-button" onClick={() => void search.refetch()}>{t('common.retry')}</button>
          </p>
        )}
        {searching && (
          <LoadingArea loading={search.isPending} paused={search.fetchStatus === 'paused'} skeleton={<SearchSkeleton />}>
            {results.length > 0 ? (
              <ul className={styles.rows} aria-label={t('meals.results')}>
                {results.map((item) => (
                  <li key={item.recipe.id}>
                    <button type="button" className={styles.rowBody} aria-label={t('meals.pick', { recipe: item.recipe.name })} disabled={setRecipe.isPending || !online} onClick={() => choose(item.recipe.id)}>
                      <span className={styles.name}>{item.recipe.name}</span>
                      <span className={styles.meta}>{meta(item.recipe)}</span>
                    </button>
                    <RatingStars summary={item.rating} recipeId={item.recipe.id} recipeName={item.recipe.name} familyId={familyId} readOnly />
                  </li>
                ))}
              </ul>
            ) : search.isSuccess ? (
              <p className="meta-line">{t('meals.noResults')}</p>
            ) : null}
          </LoadingArea>
        )}
      </section>
    </div>
  );
}

/**
 * Three suggestion cards of the common case (photo, one-line name, two-line description, meta, rating) and
 * the «Proponimene altri» button, built with the cards' own classes so the heights match.
 */
function SuggestionsSkeleton() {
  return (
    <>
      <ul className={styles.cards}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.card} skeleton-card`}>
            <span className={styles.cardBody}>
              <span className={`meal-media ${styles.photo}`} style={{ aspectRatio: '3 / 1' }} />
              <span className={`${styles.name} skeleton-line`} />
              <span className={styles.description}>
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </span>
              <span className={`${styles.meta} skeleton-line`} />
            </span>
            <div className={`${ratingStyles.rating} ${ratingStyles.readOnly}`}>
              <div className={ratingStyles.row}><span className="skeleton-line" /></div>
            </div>
          </li>
        ))}
      </ul>
      <span className={`skeleton-block ${styles.more}`} style={{ height: 44 }} />
    </>
  );
}

/** Three result rows (name, meta, rating) for the first search, with the rows' own classes. */
function SearchSkeleton() {
  return (
    <ul className={styles.rows}>
      {[0, 1, 2].map((i) => (
        <li key={i} className={`skeleton-card ${styles.rowSkeleton}`}>
          <span className={styles.rowBody}>
            <span className={`${styles.name} skeleton-line`} />
            <span className={`${styles.meta} skeleton-line`} />
          </span>
          <div className={`${ratingStyles.rating} ${ratingStyles.readOnly}`}>
            <div className={ratingStyles.row}><span className="skeleton-line" /></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The 3:1 banner of a suggestion (design, «Revisione dei pasti»); gone when the image does not load. */
function SuggestionPhoto({ url }: { url: string }) {
  const photo = usePhotoLoad(url);
  return photo.url ? <RecipePhoto as="span" url={photo.url} ratio="3 / 1" className={styles.photo} onFail={photo.fail} /> : null;
}
