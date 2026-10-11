import type { ShoppingItemView } from '@app/contract';
import { useT } from '../../i18n/LocaleProvider';
import styles from './ShoppingPage.module.css';

/** «Non in lista»: pantry and avoided items, each can be put back. */
export function ExcludedItems({ items, onPutBack }: { items: ShoppingItemView[]; onPutBack: (item: ShoppingItemView) => void }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <details className={`${styles.group} ${styles.excluded}`}>
      <summary>{t('shopping.excluded.title', { count: items.length })}</summary>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.key} className={styles.excludedRow}>
            <span className={styles.name}>
              {item.name} <small>· {t(item.excluded === 'avoid' ? 'shopping.excluded.avoid' : 'shopping.excluded.pantry')}</small>
            </span>
            <span className={styles.quantity}>{item.quantity}</span>
            <button type="button" className={styles.add} aria-label={t('shopping.addBack', { name: item.name })} onClick={() => onPutBack(item)}>
              +
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
