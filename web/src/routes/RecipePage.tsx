import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { isBlocking, toApiError } from '../api/errors';
import { keepPreviousWithin, recipeQuery, useQueryDeps } from '../api/queries';
import type { FamilyView } from '../api/types';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { IngredientList } from '../components/IngredientList';
import { PageHeader } from '../components/PageHeader';
import ratingStyles from '../components/RatingStars.module.css';
import { QueryError } from '../components/QueryError';
import { RatingStars } from '../components/RatingStars';
import { ServingsStepper } from '../components/ServingsStepper';
import { BusyArea, LoadingScope, Skeleton } from '../components/Skeleton';
import { StateNotice } from '../components/StateNotice';
import { safeSourceUrl, sourceLine } from '../components/source';
import { PhotoControls } from '../features/catalogue/photo/PhotoControls';
import photoStyles from '../features/catalogue/photo/photo.module.css';
import { formatDayLong } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { pastMeals } from '../lib/mealTime';
import { useMealClock } from '../lib/useMealClock';
import styles from './RecipePage.module.css';

const route = getRouteApi('/_app/recipes/$recipeId');

export function RecipePage() {
  return (
    <FamilyGate waiting={(paused) => <RecipeLayout loading paused={paused} />}>
      {(family) => <RecipeView family={family} />}
    </FamilyGate>
  );
}

/** Back to the menu day, or to the catalogue with its filters (history) when we came from there. */
function BackLink() {
  const t = useT();
  const router = useRouter();
  const search = route.useSearch();
  return search.from === 'menu' ? (
    <Link to="/menu" search={search.day ? { day: search.day } : {}} className="page-back">
      <Icon name="chevron-left" />{t('nav.menu')}
    </Link>
  ) : (
    <Link
      to="/recipes"
      className="page-back"
      onClick={(event) => {
        if (search.from === 'recipes' && router.history.canGoBack()) {
          event.preventDefault();
          router.history.back();
        }
      }}
    >
      <Icon name="chevron-left" />{t('nav.recipes')}
    </Link>
  );
}

/**
 * The page in every state (W20): the same column and the same header (back link, then the title) while the
 * family and the recipe load, on errors and with the recipe, so nothing moves when the data arrives.
 * `loading`: the title is a block and the content the recipe skeleton; `title` absent on errors.
 */
function RecipeLayout({ loading = false, paused, title, children }: { loading?: boolean; paused?: boolean; title?: ReactNode; children?: ReactNode }) {
  return (
    <LoadingScope loading={loading} paused={paused}>
      <section className="secondary-view app-view">
        <article className="page-column">
          <PageHeader
            back={<BackLink />}
            title={loading ? <Skeleton as="span" className="skeleton-block" style={{ width: '70%', height: '1lh' }} /> : title}
            titleHidden={loading}
          />
          {loading ? (
            <BusyArea>
              <Skeleton><RecipeSkeleton /></Skeleton>
            </BusyArea>
          ) : (
            children
          )}
        </article>
      </section>
    </LoadingScope>
  );
}

/** Photo, rating, description, meta and ingredients of the common case, with the page's own classes. */
function RecipeSkeleton() {
  return (
    <>
      <span className={`meal-media ${photoStyles.media} skeleton-card`} style={{ aspectRatio: '16 / 9' }} />
      <div className={ratingStyles.rating}>
        {/* As tall as the average and the five 44px stars. */}
        <div className={ratingStyles.row}><span className="skeleton-block" style={{ width: 'calc(3.5ch + 5 * 44px + 8px)', height: 44 }} /></div>
      </div>
      <p className="description skeleton-card">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
      </p>
      <p className="meal-meta skeleton-card"><span className="skeleton-line" /></p>
      <section className={`${styles.section} skeleton-card`}>
        <h2 className={`${styles.heading} skeleton-line`} />
        <span className="stepper skeleton-line" style={{ height: 44 }} />
        <p className="meta-line skeleton-line" />
        <ul className="ingredient-list">
          {[0, 1, 2, 3, 4].map((i) => <li key={i}><span className="skeleton-line" /></li>)}
        </ul>
      </section>
    </>
  );
}

function RecipeView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const { recipeId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // The meal reference travels with the read: wave 2 shows the version that meal was eaten with.
  const options = recipeQuery(useQueryDeps(), family.id, recipeId, search.servings, search.slot);
  // Previous data only while the servings change (second review, C7).
  const detail = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale', 'recipeId', 'slotId']) });
  // The last times move on with the clock: a planned meal that passes needs no new read (spec of W6, decision 7).
  const view = detail.data;
  const now = useMealClock(useMemo(() => (view ? [view.upcoming] : []), [view]));

  if (detail.isError && isBlocking(detail.error, !!view)) {
    // A draft, a recipe of a book the family does not own or one that never existed.
    const notice = toApiError(detail.error).code === 'not_found'
      ? <StateNotice title={t('recipe.unavailable.title')} body={t('recipe.unavailable.body')} />
      : <QueryError error={detail.error} onRetry={() => void detail.refetch()} />;
    return <RecipeLayout>{notice}</RecipeLayout>;
  }
  if (!view) return <RecipeLayout loading paused={detail.fetchStatus === 'paused'} />;

  const { recipe, rating, servings: shownServings, baseServings, ingredients } = view;
  const history = pastMeals(view, now);
  // Only the servings changed: the stepper shows the request, the ingredients are being updated.
  const updating = detail.isPlaceholderData;
  const servings = updating ? (search.servings ?? shownServings) : shownServings;
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  // Books, home recipes and videos are named under the title (review, finding 12).
  const source = recipe.sourceType === 'web' ? null : sourceLine(recipe, t);
  return (
    <RecipeLayout
      // The title is always the link to the source when there is one (spec section 14).
      title={
        sourceUrl ? (
          <a className="recipe-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
            {recipe.name} <Icon name="arrow" /><span className="visually-hidden">({t('source.open')})</span>
          </a>
        ) : (
          recipe.name
        )
      }
    >
      {/* The photo (16:9) and, for curators, its commands (W12). */}
      <PhotoControls recipe={recipe} />
      {source && <p className="meal-source">{source}</p>}
      <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={family.id} />
      {recipe.description && <p className="description">{recipe.description}</p>}
      {(recipe.durationMinutes || recipe.proteinGroup) && (
        <p className="meal-meta">
          {recipe.durationMinutes ? <><Icon name="clock" />{t('meal.minutes', { count: recipe.durationMinutes })}</> : null}
          {recipe.durationMinutes && recipe.proteinGroup ? ' · ' : null}
          {recipe.proteinGroup ? t(`group.${recipe.proteinGroup}`) : null}
        </p>
      )}
      <section className={styles.section} aria-labelledby="ingredients-title" aria-busy={updating}>
        <h2 id="ingredients-title" className={styles.heading}>{t('meal.ingredients')}</h2>
        <ServingsStepper value={servings} onChange={(value) => void navigate({ search: { ...search, servings: value }, replace: true })} />
        <p className="meta-line">{t('recipe.baseServings', { count: baseServings })}</p>
        <div className={updating ? styles.updating : undefined}>
          <IngredientList ingredients={ingredients} />
        </div>
      </section>
      <section className={styles.section} aria-labelledby="history-title">
        <h2 id="history-title" className={styles.heading}>{t('recipe.history')}</h2>
        {history.length === 0 ? (
          <p className="meta-line">{t('recipe.historyEmpty')}</p>
        ) : (
          <ul className="row-list">
            {history.map((h) => (
              <li key={`${h.date}-${h.mealType}`}>{t('recipe.historyItem', { day: formatDayLong(locale, h.date), meal: t(`meal.${h.mealType}`) })}</li>
            ))}
          </ul>
        )}
      </section>
    </RecipeLayout>
  );
}
