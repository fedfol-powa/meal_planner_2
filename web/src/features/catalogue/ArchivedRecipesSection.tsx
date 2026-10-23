import { useState } from 'react';
import { errorKey, toApiError } from '../../api/errors';
import { Icon } from '../../components/Icon';
import { LoadingArea } from '../../components/Skeleton';
import { formatInstantShort } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import styles from './catalogue.module.css';
import { useBringBack, useCachedOverviewCounts, useIsCurator, useOverview } from './queries';

/**
 * «Archiviate» at the end of the recipe book, closed at first; a recipe comes back only after the server says so,
 * and a failure says why (a refusal is left to the revocation). A failed overview is said by the drafts section.
 * While the overview loads (W22) its closed title is a block, for curators only.
 */
export function ArchivedRecipesSection() {
  const t = useT();
  const { locale } = useLocale();
  const isCurator = useIsCurator();
  const [open, setOpen] = useState(false);
  const { query, data, blocked } = useOverview(isCurator);
  const cached = useCachedOverviewCounts();
  const bringBack = useBringBack();
  if (isCurator && query.isPending && !blocked) {
    if (cached?.archived === 0) return null;
    return (
      <LoadingArea
        loading
        paused={query.fetchStatus === 'paused'}
        skeleton={
          <section className={`${styles.section} ${styles.archived}`}>
            <h2 className={styles.heading}><span className={`${styles.toggle} skeleton-block`} style={{ width: '30%' }} /></h2>
          </section>
        }
      />
    );
  }
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
