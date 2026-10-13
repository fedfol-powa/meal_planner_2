import type { FreeItemView } from '@app/contract';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n/LocaleProvider';
import { useBusyCheck } from '../../pwa/busy';
import styles from './ShoppingPage.module.css';

/** Same rule as the server (contract `normalizeFreeItemText`): trimmed, inner spaces collapsed, 1-60 characters. */
export const MAX_FREE_ITEM_TEXT = 60;
export function cleanFreeItemText(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length >= 1 && clean.length <= MAX_FREE_ITEM_TEXT ? clean : null;
}

interface Props {
  items: FreeItemView[];
  pending: Set<string>;
  onToggle: (item: FreeItemView) => void;
  onRemove: (item: FreeItemView) => void;
  onAdd: (text: string) => void;
}

/** The free items under «Altro», and the last row that adds one. */
export function FreeItems({ items, pending, onToggle, onRemove, onAdd }: Props) {
  const t = useT();
  const [text, setText] = useState('');
  // A typed item not added yet is only in memory, also with the keyboard closed (spec W8).
  useBusyCheck(() => text.trim() !== '');
  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = cleanFreeItemText(text);
    if (!clean) return;
    onAdd(clean);
    setText('');
  }
  return (
    <>
      {items.map((item) => (
        <li key={item.id} className={item.checked ? styles.done : undefined}>
          <div className={styles.row}>
            <label className={styles.item}>
              <input type="checkbox" checked={item.checked} aria-label={t('shopping.check', { name: item.text })} onChange={() => onToggle(item)} />
              <span className={styles.name}>
                {item.text}
                {pending.has(item.id) && <span className={styles.sync} role="img" aria-label={t('shopping.pendingItem')} />}
              </span>
              <span />
            </label>
            <button type="button" className={`${styles.iconButton} ${styles.remove}`} aria-label={t('shopping.removeItem', { name: item.text })} onClick={() => onRemove(item)}>
              ×
            </button>
          </div>
        </li>
      ))}
      <li>
        <form className={styles.addItem} onSubmit={submit}>
          <span className={styles.plus} aria-hidden="true">+</span>
          <label className="visually-hidden" htmlFor="new-item">{t('shopping.addItem')}</label>
          <input
            id="new-item"
            type="text"
            value={text}
            maxLength={MAX_FREE_ITEM_TEXT}
            placeholder={t('shopping.addItemPlaceholder')}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => setText(event.target.value)}
          />
          {text.trim() && <button type="submit" className="text-button">{t('shopping.addItemButton')}</button>}
        </form>
      </li>
    </>
  );
}
