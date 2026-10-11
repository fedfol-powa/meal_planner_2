import { useState } from 'react';
import { errorKey, toApiError } from '../../api/errors';
import { Icon } from '../../components/Icon';
import { formatInstantShort } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import styles from './catalogue.module.css';
import { useBringBack, useIsCurator, useOverview } from './queries';

/**
 * «Archiviate» at the end of the recipe book, closed at first; a recipe comes back only after the server says so,
 * and a failure says why (a refusal is left to the revocation). A failed overview is said by the drafts section.
 */
export function ArchivedRecipesSection() {
  const t = useT();
  const { locale } = useLocale();
  const isCurator = useIsCurator();
  const [open, setOpen] = useState(false);
  const { data } = useOverview(isCurator);
  const bringBack = useBringBack();
  if (!isCurator || !data || data.archived.length === 0) return null;
  const failed = bringBack.isError && toApiError(bringBack.error).code !== 'forbidden';
  return (
    <section className={`${styles.section} ${styles.archived}`} aria-labelledby="catalogue-archived">
      <h2 className={styles.heading} id="catalogue-archived">
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          {t('catalogue.archived')} <span className={styles.count}>{data.archived.length}</span>
          <Icon name="chevron-right" />
        </button>
      </h2>
      {open && (
        <ul className={`row-list settings-card ${styles.rows}`}>
          {data.archived.map((a) => (
            <li key={a.recipeId}>
              <span className="row-main">
                {a.name}
                <small>{t('catalogue.byOn', { name: a.archivedBy.name ?? t('catalogue.someone'), date: formatInstantShort(locale, a.archivedAt) })}</small>
              </span>
              <button type="button" className="text-button" disabled={bringBack.isPending} onClick={() => bringBack.mutate(a.recipeId)}>
                {t('catalogue.restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && failed && <p className="meta-line" role="alert">{t(errorKey(bringBack.error))}</p>}
    </section>
  );
}
