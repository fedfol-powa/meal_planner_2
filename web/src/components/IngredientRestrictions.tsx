import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useQueryDeps } from '../api/queries';
import type { SettingsView } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import { Icon } from './Icon';
import styles from './IngredientRestrictions.module.css';

type Row = SettingsView['restrictions'][number];
export interface RestrictionChange { ingredientId: string; restriction: 'avoid' | 'limit' | null; weeklyMax: number | null }

const LIMITS = [1, 2, 3] as const;
const SEARCH_MIN = 2;

/** Ingredients to avoid (out of menus and shopping lists) or to limit to a weekly maximum (spec section 3). */
export function IngredientRestrictions({ familyId, rows, editable, pending, onChange }: { familyId: string; rows: Row[]; editable: boolean; pending: RestrictionChange | null; onChange: (change: RestrictionChange) => void }) {
  const t = useT();
  const { api, locale } = useQueryDeps();
  const [text, setText] = useState('');
  const needle = text.trim();
  // Not versioned: a lookup of the catalogue while typing, from two letters.
  const results = useQuery({
    queryKey: ['family', 'searchIngredients', { familyId, text: needle, locale }],
    queryFn: () => api.family.searchIngredients({ familyId, text: needle }),
    enabled: editable && needle.length >= SEARCH_MIN
  });
  const label = (row: Pick<Row, 'restriction' | 'weeklyMax'>) =>
    row.restriction === 'avoid' ? t('settings.ingredients.avoid') : t('settings.ingredients.limit', { count: row.weeklyMax ?? 1 });
  const shown = (row: Row): Row =>
    pending?.ingredientId === row.ingredientId && pending.restriction ? { ...row, restriction: pending.restriction, weeklyMax: pending.weeklyMax } : row;

  return (
    <>
      {rows.length ? (
        <ul className="row-list">
          {rows.map((original) => {
            const row = shown(original);
            const busy = pending !== null;
            return (
              <li key={row.ingredientId} aria-busy={pending?.ingredientId === row.ingredientId}>
                <span className="row-main">{row.name}</span>
                {editable ? (
                  <>
                    <select
                      className={styles.select}
                      aria-label={t('settings.ingredients.restriction', { name: row.name })}
                      value={row.restriction === 'avoid' ? 'avoid' : String(row.weeklyMax)}
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.target.value;
                        onChange(value === 'avoid' ? { ingredientId: row.ingredientId, restriction: 'avoid', weeklyMax: null } : { ingredientId: row.ingredientId, restriction: 'limit', weeklyMax: Number(value) });
                      }}
                    >
                      <option value="avoid">{t('settings.ingredients.avoid')}</option>
                      {LIMITS.map((n) => <option key={n} value={String(n)}>{t('settings.ingredients.limit', { count: n })}</option>)}
                    </select>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={t('settings.ingredients.remove', { name: row.name })}
                      disabled={busy}
                      onClick={() => onChange({ ingredientId: row.ingredientId, restriction: null, weeklyMax: null })}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span className="label-chip neutral">{label(row)}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="meta-line">{t('settings.ingredients.none')}</p>
      )}
      {editable && (
        <>
          <label className={`field ${styles.search}`}>
            <span className="visually-hidden">{t('settings.ingredients.search')}</span>
            <input type="text" placeholder={t('settings.ingredients.search')} value={text} autoComplete="off" maxLength={60} onChange={(event) => setText(event.target.value)} />
          </label>
          {needle.length >= SEARCH_MIN && results.data && (
            results.data.length ? (
              <ul className={styles.results}>
                {results.data.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="row-link"
                      disabled={pending !== null}
                      onClick={() => {
                        onChange({ ingredientId: item.id, restriction: 'avoid', weeklyMax: null });
                        setText('');
                      }}
                    >
                      <Icon name="plus" />{item.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta-line">{t('settings.ingredients.noResults')}</p>
            )
          )}
        </>
      )}
    </>
  );
}
