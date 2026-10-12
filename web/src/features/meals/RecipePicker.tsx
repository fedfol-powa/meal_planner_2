import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useAreaMutation } from '../../api/mutations';
import { searchQuery, useQueryDeps } from '../../api/queries';
import type { MealView, RecipeQuery, RecipeSummary } from '../../api/types';
import { Icon } from '../../components/Icon';
import { RatingStars } from '../../components/RatingStars';
import { RecipeFilters } from '../../components/RecipeFilters';
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
  const { message, handle } = useMealErrors(familyId, weekStartsOn);
  const [offset, setOffset] = useState(0);
  const suggestionsSection = useRef<HTMLElement>(null);
  // Starts on the slot's meal; results appear once the user types or changes a filter (prototype).
  const [query, setQuery] = useState<RecipeQuery>({ mealType: meal.mealType });
  const searching =
    !!query.text || query.mealType !== meal.mealType || !!query.maxMinutes || !!query.proteinGroup || !!query.minStars || !!query.sort || !!query.reversed;
  const [excluded, setExcluded] = useState<{ id: string; name: string } | null>(null);
  const suggestions = useQuery(suggestionsQuery(deps, familyId, meal.slotId, offset));
  const search = useQuery({ ...searchQuery(deps, familyId, query), enabled: searching });
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
          <button type="button" disabled={include.isPending} onClick={() => include.mutate(excluded.id, { onSuccess: () => setExcluded(null), onError: (error) => handle(error, onDone) })}>
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
            <button type="button" disabled={exclude.isPending} onClick={() => exclude.mutate(current.id, { onSuccess: () => setExcluded({ id: current.id, name: current.name }), onError: (error) => handle(error, onDone) })}>
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
        {suggestions.data?.recipes.length === 0 && <p className="meta-line">{t('meals.noSuggestions')}</p>}
        {suggestions.isError && <p className="meta-line" role="alert">{message(suggestions.error)}</p>}
        <ul className={styles.cards}>
          {suggestions.data?.recipes.map(({ recipe, rating }) => (
            <li key={recipe.id} className={styles.card}>
              <button type="button" aria-label={t('meals.pick', { recipe: recipe.name })} disabled={setRecipe.isPending} onClick={() => choose(recipe.id)}>
                <span className={styles.name}>{recipe.name}</span>
                {recipe.description && <span className={styles.description}>{recipe.description}</span>}
                <span className={styles.meta}>{meta(recipe)}</span>
              </button>
              <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} readOnly />
            </li>
          ))}
        </ul>
        {!!suggestions.data?.recipes.length && (suggestions.data.nextOffset !== 0 || offset !== 0) && (
          <button type="button" className={`text-button ${styles.more}`} onClick={() => more(suggestions.data!.nextOffset)}>
            <Icon name="shuffle" />{t('meals.more')}
          </button>
        )}
      </section>
      <section className={styles.search} aria-labelledby={`${meal.slotId}-search`}>
        <h3 id={`${meal.slotId}-search`} className={styles.title}>{t('meals.search')}</h3>
        <RecipeFilters query={query} onChange={setQuery} />
        {searching &&
          (results.length > 0 ? (
            <ul className={styles.rows} aria-label={t('meals.results')}>
              {results.map((item) => (
                <li key={item.recipe.id}>
                  <button type="button" aria-label={t('meals.pick', { recipe: item.recipe.name })} disabled={setRecipe.isPending} onClick={() => choose(item.recipe.id)}>
                    <span className={styles.name}>{item.recipe.name}</span>
                    <span className={styles.meta}>{meta(item.recipe)}</span>
                  </button>
                  <RatingStars summary={item.rating} recipeId={item.recipe.id} recipeName={item.recipe.name} familyId={familyId} readOnly />
                </li>
              ))}
            </ul>
          ) : search.isSuccess ? (
            <p className="meta-line">{t('meals.noResults')}</p>
          ) : null)}
      </section>
    </div>
  );
}
