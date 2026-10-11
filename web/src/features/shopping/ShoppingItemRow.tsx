import type { ShoppingItemView } from '@app/contract';
import { useState } from 'react';
import { formatDayNumber, formatDayShort } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import styles from './ShoppingPage.module.css';

/** One item of a department: tick, name, quantity, «prima: …», and the meals it comes from. */
export function ShoppingItemRow({ item, pending, onToggle }: { item: ShoppingItemView; pending: boolean; onToggle: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <li className={item.checked ? styles.done : undefined}>
      <div className={styles.row}>
        <label className={styles.item}>
          <input type="checkbox" checked={item.checked} aria-label={t('shopping.check', { name: item.name })} onChange={onToggle} />
          <span className={styles.name}>
            {item.name}
            {item.isOptional && <small className={styles.hint}> · {t('shopping.optional')}</small>}
            {pending && <span className={styles.sync} role="img" aria-label={t('shopping.pendingItem')} />}
            {item.previousQuantity && <small className={styles.previous}>{t('shopping.previous', { quantity: item.previousQuantity })}</small>}
          </span>
          <span className={styles.quantity}>{item.quantity}</span>
        </label>
        <button type="button" className={styles.iconButton} aria-expanded={open} aria-label={t('shopping.sources', { name: item.name })} onClick={() => setOpen(!open)}>
          <span className={styles.chevron} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul className={styles.sources}>
          {item.sources.map((source) => (
            <li key={`${source.slotId}-${source.quantity}`}>
              <span>{`${formatDayShort(locale, source.date)} ${formatDayNumber(locale, source.date)} · ${t(`meal.${source.mealType}`)} · ${source.recipeName}`}</span>
              <span className={styles.sourceQuantity}>{source.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
