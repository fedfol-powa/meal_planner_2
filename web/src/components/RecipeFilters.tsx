import { useEffect, useState } from 'react';
import { PROTEIN_GROUPS, type ProteinGroup, type RecipeQuery, type RecipeSort } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import type { MealType } from '../lib/calendar';
import { Icon } from './Icon';
import styles from './RecipeFilters.module.css';

const SORTS: RecipeSort[] = ['name', 'rating', 'added', 'lastEaten'];

export function RecipeFilters({ query, onChange }: { query: RecipeQuery; onChange: (query: RecipeQuery) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Local text keeps the caret steady while the address follows; external changes (clear) win.
  const [text, setText] = useState(query.text ?? '');
  useEffect(() => setText(query.text ?? ''), [query.text]);
  const set = (patch: Partial<RecipeQuery>) => onChange({ ...query, ...patch });
  const num = (value: string) => (value ? Number(value) : undefined);
  const active = !!(query.mealType || query.maxMinutes || query.proteinGroup || query.minStars || query.reversed || (query.sort && query.sort !== 'name'));

  return (
    <form className={styles.filters} role="search" onSubmit={(e) => e.preventDefault()}>
      <div className={styles.searchRow}>
        <label className={styles.search}>
          <span className="visually-hidden">{t('recipes.search')}</span>
          <input
            type="search"
            placeholder={t('recipes.search')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              set({ text: e.target.value || undefined });
            }}
          />
        </label>
        <button type="button" className={styles.toggle} data-active={active} aria-expanded={open} aria-controls="recipe-filters" aria-label={t('recipes.toggleFilters')} onClick={() => setOpen(!open)}>
          <Icon name="filter" />
        </button>
      </div>
      <fieldset id="recipe-filters" className={styles.fields} hidden={!open}>
        <legend className="visually-hidden">{t('recipes.filters')}</legend>
        <div className={styles.sort}>
          <label>
            {t('recipes.sort')}
            <select value={query.sort ?? 'name'} onChange={(e) => set({ sort: e.target.value === 'name' ? undefined : (e.target.value as RecipeSort) })}>
              {SORTS.map((sort) => <option key={sort} value={sort}>{t(`recipes.sort.${sort}`)}</option>)}
            </select>
          </label>
          <button type="button" className={styles.reverse} aria-pressed={!!query.reversed} aria-label={t('recipes.reverse')} onClick={() => set({ reversed: query.reversed ? undefined : true })}>
            <Icon name="sort" />
          </button>
        </div>
        <label>
          {t('recipes.filter.meal')}
          <select value={query.mealType ?? ''} onChange={(e) => set({ mealType: (e.target.value || undefined) as MealType | undefined })}>
            <option value="">{t('recipes.filter.any')}</option>
            <option value="lunch">{t('meal.lunch')}</option>
            <option value="dinner">{t('meal.dinner')}</option>
          </select>
        </label>
        <label>
          {t('recipes.filter.time')}
          <select value={String(query.maxMinutes ?? '')} onChange={(e) => set({ maxMinutes: num(e.target.value) })}>
            <option value="">{t('recipes.filter.any')}</option>
            {[15, 30, 45].map((minutes) => <option key={minutes} value={String(minutes)}>{t('recipes.filter.minutes', { count: minutes })}</option>)}
          </select>
        </label>
        <label>
          {t('recipes.filter.group')}
          <select value={query.proteinGroup ?? ''} onChange={(e) => set({ proteinGroup: (e.target.value || undefined) as ProteinGroup | undefined })}>
            <option value="">{t('recipes.filter.any')}</option>
            {PROTEIN_GROUPS.map((group) => <option key={group} value={group}>{t(`group.${group}`)}</option>)}
          </select>
        </label>
        <label>
          {t('recipes.filter.stars')}
          <select value={String(query.minStars ?? '')} onChange={(e) => set({ minStars: num(e.target.value) })}>
            <option value="">{t('recipes.filter.any')}</option>
            {[3, 4].map((stars) => <option key={stars} value={String(stars)}>{t('recipes.filter.starsAtLeast', { count: stars })}</option>)}
          </select>
        </label>
      </fieldset>
    </form>
  );
}
