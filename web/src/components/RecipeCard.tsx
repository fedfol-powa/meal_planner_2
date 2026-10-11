import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { IngredientLine, MealView, RatingSummary, RecipeSummary } from '../api/types';
import { formatAverage, formatChangeTime } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { truncate } from '../i18n/text';
import type { RecipeSearch } from '../routes/search';
import { Icon } from './Icon';
import { IngredientList } from './IngredientList';
import { RatingStars } from './RatingStars';
import styles from './RecipeCard.module.css';
import { safeSourceUrl, SOURCE_MAX_CHARS, sourceLine } from './source';

export interface RecipeCardProps {
  cardKey: string;
  /** Chip above the title: meal type in the menu, food group in the catalogue. */
  label: string | null;
  kind: 'recipe' | 'free' | 'empty';
  recipe: RecipeSummary | null;
  freeText: string | null;
  servings: number | null;
  ingredients: IngredientLine[] | null;
  note: string | null;
  rating: RatingSummary | null;
  lastChange: MealView['lastChange'];
  detailSearch: RecipeSearch | null;
  familyId: string;
  isPast?: boolean;
}

/** One card for menu meals and catalogue recipes (round 1). Footer: details, rating, ingredients. */
export function RecipeCard(props: RecipeCardProps) {
  const { cardKey, label, kind, recipe, freeText, servings, ingredients, note, rating, lastChange, detailSearch, familyId, isPast } = props;
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState<'rating' | 'ingredients' | null>(null);
  const toggle = (section: 'rating' | 'ingredients') => setOpen((current) => (current === section ? null : section));
  const headingId = `card-${cardKey}`;
  const source = recipe ? sourceLine(recipe, t) : null;
  const sourceUrl = recipe ? safeSourceUrl(recipe.sourceUrl) : null;
  const averageText = rating?.familyAverage != null ? formatAverage(locale, rating.familyAverage) : '–';
  const chip = label ? <span className="meal-label">{label}</span> : null;

  return (
    <article className={`meal${kind !== 'recipe' ? ' meal-free' : ''}${isPast ? ` ${styles.past}` : ''}`} aria-labelledby={headingId}>
      <div className="meal-heading">{chip}</div>

      <div className={`meal-content ${styles.content}`}>
        {kind === 'free' && (
          <>
            <span className="free-mark">{t('meal.free')}</span>
            <h3 id={headingId}>{freeText}</h3>
          </>
        )}
        {kind === 'empty' && (
          <>
            <h3 id={headingId}>{t('meal.empty.title')}</h3>
            <p className="description">{t('meal.empty.body')}</p>
          </>
        )}
        {kind === 'recipe' && recipe && (
          <>
            <h3 id={headingId}>
              {sourceUrl ? (
                <a className="recipe-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  {recipe.name} <Icon name="arrow" /><span className="visually-hidden">({t('source.open')})</span>
                </a>
              ) : (
                recipe.name
              )}
            </h3>
            {recipe.description && <p className="description">{recipe.description}</p>}
            <div className={styles.metaRow}>
              <p className="meal-meta">
                {recipe.durationMinutes ? <><Icon name="clock" />{t('meal.minutes', { count: recipe.durationMinutes })}</> : null}
                {recipe.durationMinutes && servings ? ' · ' : null}
                {servings ? t('meal.servings', { count: servings }) : null}
              </p>
              {source && (
                <p className={`meal-source ${styles.source}`} title={source}>
                  <span aria-hidden="true">{truncate(source, SOURCE_MAX_CHARS)}</span>
                  <span className="visually-hidden">{source}</span>
                </p>
              )}
            </div>
          </>
        )}
        {lastChange && (
          <p className="meta-line">
            {t('meal.changedBy', { name: lastChange.userName ?? t('meal.formerMember'), time: formatChangeTime(locale, lastChange.at) })}
          </p>
        )}
        {note && <p className="meta-line"><strong>{t('meal.note')}:</strong> {note}</p>}
      </div>

      {kind === 'recipe' && recipe && (
        <>
          <div className={styles.footer}>
            {detailSearch && (
              <Link to="/recipes/$recipeId" params={{ recipeId: recipe.id }} search={detailSearch} className={styles.action} aria-label={t('meal.details')}>
                <Icon name="recipe" />
              </Link>
            )}
            {rating && (
              <button type="button" className={styles.action} aria-expanded={open === 'rating'} aria-label={t('meal.ratingAction', { value: averageText })} onClick={() => toggle('rating')}>
                <Icon name="star" className={rating.myStars != null ? styles.mine : undefined} />
                <span aria-hidden="true">{averageText}</span>
              </button>
            )}
            <button type="button" className={styles.action} aria-expanded={open === 'ingredients'} aria-label={t('meal.ingredientsAction', { count: ingredients?.length ?? 0 })} onClick={() => toggle('ingredients')}>
              <Icon name="list" />
              <span aria-hidden="true">{ingredients?.length ?? '–'}</span>
            </button>
          </div>
          {open === 'rating' && rating && (
            <div className={styles.panel}>
              <RatingStars summary={rating} recipeId={recipe.id} recipeName={recipe.name} familyId={familyId} />
            </div>
          )}
          {open === 'ingredients' && (
            <div className={styles.panel}>
              {ingredients ? <IngredientList ingredients={ingredients} /> : <p className="meta-line">{t('meal.ingredientsMissing')}</p>}
            </div>
          )}
        </>
      )}
    </article>
  );
}
