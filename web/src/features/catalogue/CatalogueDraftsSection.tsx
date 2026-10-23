import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toApiError } from '../../api/errors';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/QueryError';
import { LoadingArea } from '../../components/Skeleton';
import { formatInstantShort } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import styles from './catalogue.module.css';
import { useCachedOverviewCounts, useIsCurator, useOverview } from './queries';

/**
 * «Bozze» of the recipe book, for curators only, as cards (prototype DraftList): open at first.
 * A failed overview is said here, once for both sections, so it never looks like an empty catalogue;
 * a refusal is left to the revocation, which removes the sections. While the overview loads (W22) the
 * section is blocks, for curators only: as many cards as an overview in memory says (at most 3), else one.
 */
export function CatalogueDraftsSection() {
  const t = useT();
  const { locale } = useLocale();
  const isCurator = useIsCurator();
  const [open, setOpen] = useState(true);
  const { query, data, blocked } = useOverview(isCurator);
  const cached = useCachedOverviewCounts();
  if (!isCurator) return null;
  if (query.isPending && !blocked) {
    const cards = cached ? Math.min(3, cached.drafts) : 1;
    if (cards === 0) return null;
    return (
      <LoadingArea
        loading
        paused={query.fetchStatus === 'paused'}
        skeleton={
          <section className={styles.section}>
            <h2 className={styles.heading}><span className={`${styles.toggle} skeleton-block`} style={{ width: '30%' }} /></h2>
            <ul className={styles.cards}>
              {Array.from({ length: cards }, (_, i) => (
                <li key={i}>
                  <span className={`${styles.card} skeleton-card`}>
                    <span className={styles.top}><span className="skeleton-line" /></span>
                    <span className={styles.title}><span className="skeleton-line" /></span>
                    <span className={styles.state}><span className="skeleton-line" /></span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        }
      />
    );
  }
  if (blocked && toApiError(query.error).code !== 'forbidden') {
    return (
      <section className={styles.section} aria-labelledby="catalogue-drafts">
        <h2 className={styles.heading} id="catalogue-drafts">{t('catalogue.drafts')}</h2>
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </section>
    );
  }
  if (!data || data.drafts.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="catalogue-drafts">
      <h2 className={styles.heading} id="catalogue-drafts">
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
          {t('catalogue.drafts')} <span className={styles.count}>{data.drafts.length}</span>
          <Icon name="chevron-right" />
        </button>
      </h2>
      {open && (
        <ul className={styles.cards}>
          {data.drafts.map((d) => (
            <li key={d.draftId}>
              <Link to="/recipes/drafts/$draftId" params={{ draftId: d.draftId }} className={styles.card}>
                <span className={styles.top}>
                  <span className={d.kind === 'new' ? 'label-chip neutral' : 'label-chip'}>{t(`catalogue.kind.${d.kind}`)}</span>
                  <span className={styles.who}>{t('catalogue.byOn', { name: d.updatedBy.name ?? t('catalogue.someone'), date: formatInstantShort(locale, d.updatedAt) })}</span>
                </span>
                <span className={styles.title}>{d.name}</span>
                {d.missing.length > 0 && (
                  <span className={styles.state}>
                    <span className="visually-hidden">{t('catalogue.missingPrefix')}</span>
                    {d.missing.map((m) => <span key={m} className={styles.missing}>{t(`catalogue.missing.${m}`)}</span>)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
