import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { isBlocking } from '../api/errors';
import { keepPreviousWithin, recipeQuery, useQueryDeps } from '../api/queries';
import type { FamilyView } from '../api/types';
import { FamilyGate } from '../components/FamilyGate';
import { Icon } from '../components/Icon';
import { IngredientList } from '../components/IngredientList';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { QueryError } from '../components/QueryError';
import { RatingStars } from '../components/RatingStars';
import { ServingsStepper } from '../components/ServingsStepper';
import { safeSourceUrl, sourceLine } from '../components/source';
import { formatDayLong } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import styles from './RecipePage.module.css';

const route = getRouteApi('/_app/recipes/$recipeId');

export function RecipePage() {
  return <FamilyGate>{(family) => <RecipeView family={family} />}</FamilyGate>;
}

function RecipeView({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { recipeId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  // The meal reference travels with the read: wave 2 shows the version that meal was eaten with.
  const options = recipeQuery(useQueryDeps(), family.id, recipeId, search.servings, search.slot);
  // Previous data only while the servings change (second review, C7).
  const detail = useQuery({ ...options, placeholderData: keepPreviousWithin(options.queryKey, ['familyId', 'locale', 'recipeId', 'slotId']) });

  // Back to the menu day, or to the catalogue with its filters (history) when we came from there.
  const back =
    search.from === 'menu' ? (
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
  const page = (content: ReactNode) => (
    <section className="secondary-view app-view"><div className="page-column">{content}</div></section>
  );

  if (detail.isError && isBlocking(detail.error, !!detail.data)) {
    return page(<><header className="page-header">{back}</header><QueryError error={detail.error} onRetry={() => void detail.refetch()} /></>);
  }
  if (!detail.data) return page(<Loading />);

  const { recipe, rating, servings: shownServings, baseServings, ingredients, history } = detail.data;
  // Only the servings changed: the stepper shows the request, the ingredients are being updated.
  const updating = detail.isPlaceholderData;
  const servings = updating ? (search.servings ?? shownServings) : shownServings;
  const sourceUrl = safeSourceUrl(recipe.sourceUrl);
  // Books, home recipes and videos are named under the title (review, finding 12).
  const source = recipe.sourceType === 'web' ? null : sourceLine(recipe, t);
  return (
    <section className="secondary-view app-view">
      <article className="page-column">
        {/* The title is always the link to the source when there is one (spec section 14). */}
        <PageHeader
          back={back}
          title={
            sourceUrl ? (
              <a className="recipe-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {recipe.name} <Icon name="arrow" /><span className="visually-hidden">({t('source.open')})</span>
              </a>
            ) : (
              recipe.name
            )
          }
        />
        {source && <p className="meal-source">{source}</p>}
        <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={family.id} />
        {recipe.description && <p className="description">{recipe.description}</p>}
        {recipe.durationMinutes && <p className="meal-meta"><Icon name="clock" />{t('meal.minutes', { count: recipe.durationMinutes })}</p>}
        <section className={styles.section} aria-labelledby="ingredients-title" aria-busy={updating}>
          <h2 id="ingredients-title" className={styles.heading}>{t('meal.ingredients')}</h2>
          <ServingsStepper value={servings} onChange={(value) => void navigate({ search: { ...search, servings: value }, replace: true })} />
          {baseServings && <p className="meta-line">{t('recipe.baseServings', { count: baseServings })}</p>}
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
      </article>
    </section>
  );
}
