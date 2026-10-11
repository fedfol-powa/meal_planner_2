import { useId } from 'react';
import { errorKey } from '../api/errors';
import { useRateRecipe } from '../api/ratings';
import type { RatingSummary } from '../api/types';
import { formatAverage } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { Icon } from './Icon';
import styles from './RatingStars.module.css';

interface Props {
  summary: RatingSummary;
  recipeId: string;
  recipeName: string;
  familyId: string;
  /** Shown, not set (suggestions of «Cambia ricetta», spec section 5). */
  readOnly?: boolean;
}

/** Family average and own stars on one row, no labels (round 1 review). Tapping the chosen star removes it. */
export function RatingStars({ summary, recipeId, recipeName, familyId, readOnly }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const name = useId();
  const rate = useRateRecipe(familyId);
  const average = summary.familyAverage === null ? null : formatAverage(locale, summary.familyAverage);
  const choose = (value: number) => rate.mutate({ recipeId, stars: summary.myStars === value ? null : value });

  return (
    <div className={readOnly ? `${styles.rating} ${styles.readOnly}` : styles.rating}>
      <div className={styles.row}>
        <p
          className={styles.average}
          aria-label={average === null ? t('rating.none') : t('rating.averageLabel', { value: average, votes: t('rating.votes', { count: summary.familyCount }) })}
        >
          {average === null ? (
            <span className={`${styles.value} ${styles.muted}`} aria-hidden="true">–</span>
          ) : (
            <>
              <span className={styles.value} aria-hidden="true">{average}</span>
              <span className={styles.count} aria-hidden="true">({summary.familyCount})</span>
            </>
          )}
        </p>
        {readOnly ? (
          <p className={styles.mine}>{summary.myStars === null ? t('meals.notRated') : t('meals.myStars', { count: summary.myStars })}</p>
        ) : (
          <fieldset className={styles.stars} disabled={rate.isPending} aria-busy={rate.isPending}>
            <legend className="visually-hidden">{t('rating.mine')}</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className={styles.star} data-filled={summary.myStars !== null && value <= summary.myStars}>
                <input className="visually-hidden" type="radio" name={name} value={value} checked={summary.myStars === value} onChange={() => undefined} onClick={() => choose(value)} />
                <Icon name="star" />
                <span className="visually-hidden">
                  {summary.myStars === value ? t('rating.removeStars', { count: value }) : t('rating.give', { count: value, recipe: recipeName })}
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
      {!readOnly && rate.isPending && <p className="meta-line" role="status">{t('rating.sending')}</p>}
      {!readOnly && rate.isError && <p className="meta-line" role="alert">{t(errorKey(rate.error))}</p>}
    </div>
  );
}
