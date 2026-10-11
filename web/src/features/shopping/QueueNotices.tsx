import { useT } from '../../i18n/LocaleProvider';
import type { QueueNotice } from './queue/ops';
import styles from './ShoppingPage.module.css';

/** Changes the server refused, shown until closed with «Ok». */
export function QueueNotices({ notices, onDismiss }: { notices: QueueNotice[]; onDismiss: (id: string) => void }) {
  const t = useT();
  if (notices.length === 0) return null;
  return (
    <ul className={styles.queueNotices} role="status">
      {notices.map((notice) => (
        <li key={notice.id}>
          <span>{t(notice.code === 'not_found' ? 'shopping.notice.not_found' : 'shopping.notice.invalid', { label: notice.label })}</span>
          <button type="button" className="text-button" onClick={() => onDismiss(notice.id)}>{t('shopping.notice.ok')}</button>
        </li>
      ))}
    </ul>
  );
}
