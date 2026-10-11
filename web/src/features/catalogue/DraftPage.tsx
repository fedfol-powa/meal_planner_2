import type { DraftView } from '@app/contract';
import type { RecipeDraftDocument } from '@app/domain/recipe';
import { getRouteApi, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { toApiError } from '../../api/errors';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { safeSourceUrl } from '../../components/source';
import { formatInstantShort } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import type { Locale, MessageKey, MessageParams } from '../../i18n/translate';
import styles from './catalogue.module.css';
import { useDraft, useIsCurator, useProfileRead } from './queries';

const route = getRouteApi('/_app/recipes/drafts/$draftId');

type Translate = (key: MessageKey, params?: MessageParams) => string;
type Texts = Partial<Record<Locale, string | null>> | null | undefined;

/** The reader's language, otherwise the other one (names of drafts, W6's rule). */
function localText(text: Texts, locale: Locale): string {
  const other: Locale = locale === 'it-IT' ? 'en-GB' : 'it-IT';
  return text?.[locale]?.trim() || text?.[other]?.trim() || '';
}

const SOURCE_FIELDS = new Set(['sourceType', 'sourceUrl', 'bookId', 'bookPages']);
const ATTRIBUTE_FIELDS = new Set(['mealType', 'proteinGroup', 'isFreshFish', 'carbohydrateGroup', 'category', 'hasVegetables', 'isHeavy', 'seasons']);

/** Where a problem is, in words: «Nome (inglese)», «Ingredienti, riga 2». */
function placeOf(path: readonly (string | number)[], t: Translate): string {
  const [field, second] = path;
  const language = (value: unknown) => (value === 'it-IT' || value === 'en-GB' ? ` (${t(`catalogue.lang.${value}`)})` : '');
  if (field === 'name' || field === 'description') return `${t(`catalogue.field.${field}`)}${language(second)}`;
  if (field === 'ingredients') return typeof second === 'number' ? t('catalogue.field.line', { count: second + 1 }) : t('catalogue.field.ingredients');
  if (typeof field === 'string' && SOURCE_FIELDS.has(field)) return t('catalogue.field.source');
  if (typeof field === 'string' && ATTRIBUTE_FIELDS.has(field)) return t('catalogue.field.attributes');
  if (field === 'durationMinutes' || field === 'baseServings') return t(`catalogue.field.${field}`);
  return t('catalogue.field.elsewhere');
}

function sourceOf(content: Partial<RecipeDraftDocument>, bookTitle: string | null, t: Translate): ReactNode {
  if (content.sourceType === 'book') return t('source.book', { title: bookTitle ?? '—', pages: content.bookPages ?? '—' });
  if (content.sourceType === 'home') return t('source.home');
  const url = safeSourceUrl(content.sourceUrl ?? null);
  if (!url) return content.sourceType === 'youtube' ? t('source.youtube') : null;
  const label = content.sourceType === 'youtube' ? t('source.youtube') : new URL(url).hostname.replace(/^www\./, '');
  return <a className="link-inline" href={url} target="_blank" rel="noopener noreferrer">{label}</a>;
}

/** A draft as saved, read-only (spec of W3, section 5): editing and publishing come with wave 3. */
export function DraftPage() {
  const t = useT();
  const { draftId } = route.useParams();
  const profileRead = useProfileRead();
  const isCurator = useIsCurator();
  const { query, data, blocked } = useDraft(draftId, isCurator);
  const back = <Link to="/recipes" className="page-back"><Icon name="chevron-left" />{t('nav.recipes')}</Link>;
  const page = (content: ReactNode) => (
    <section className="secondary-view app-view"><div className="page-column"><header className="page-header">{back}</header>{content}</div></section>
  );
  const unavailable = <StateNotice title={t('catalogue.draft.unavailable')} body={t('catalogue.draft.unavailableBody')} />;

  if (!profileRead) return page(<Loading />);
  if (!isCurator) return page(unavailable);
  if (blocked) {
    const code = toApiError(query.error).code;
    if (code === 'not_found') return page(unavailable);
    if (code === 'forbidden') return page(<StateNotice title={t('catalogue.forbidden')} />);
    return page(<QueryError error={query.error} onRetry={() => void query.refetch()} />);
  }
  if (!data) return page(<Loading />);
  return <DraftView draft={data} back={back} />;
}

function DraftView({ draft, back }: { draft: DraftView; back: ReactNode }) {
  const t = useT();
  const { locale } = useLocale();
  const content = draft.content as Partial<RecipeDraftDocument>;
  const lines = Array.isArray(content.ingredients) ? content.ingredients : [];
  const source = sourceOf(content, draft.bookTitle, t);
  const description = localText(content.description, locale);
  const meta = [
    content.durationMinutes ? t('meal.minutes', { count: content.durationMinutes }) : null,
    content.proteinGroup ? t(`group.${content.proteinGroup}`) : null
  ].filter(Boolean);
  return (
    <section className="secondary-view app-view">
      <article className="page-column">
        <PageHeader back={back} title={localText(content.name, locale) || '—'} />
        <p className={styles.kind}>
          <span className={draft.kind === 'new' ? 'label-chip neutral' : 'label-chip'}>{t(`catalogue.kind.${draft.kind}`)}</span>
        </p>
        {draft.outcome && <StateNotice title={t(`catalogue.draft.closed.${draft.outcome}`)} />}
        {source && <p className="meal-source">{source}</p>}
        {description && <p className="description">{description}</p>}
        {meta.length > 0 && <p className="meal-meta"><Icon name="clock" />{meta.join(' · ')}</p>}
        {content.baseServings ? <p className="meta-line">{t('recipe.baseServings', { count: content.baseServings })}</p> : null}

        {lines.length > 0 && (
          <section className={styles.block} aria-labelledby="draft-ingredients">
            <h2 id="draft-ingredients" className={styles.blockHeading}>{t('meal.ingredients')}</h2>
            <ul className={styles.lines}>
              {lines.map((line, index) => {
                const name = line.ingredientId ? draft.ingredientNames[line.ingredientId] : undefined;
                const variety = localText(line.variety, locale);
                return (
                  <li key={index}>
                    <span className={styles.lineName}>
                      {name ?? <span className={styles.unresolved}>{t('catalogue.draft.unresolved')}</span>}
                    </span>
                    {variety && <> · <span>{variety}</span></>}
                    {line.sourceText && <span className={styles.lineSource}>{line.sourceText}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.block} aria-labelledby="draft-problems">
          <h2 id="draft-problems" className={styles.blockHeading}>{t('catalogue.draft.problems')}</h2>
          {draft.issues.length === 0 ? (
            <p className="meta-line">{t('catalogue.draft.complete')}</p>
          ) : (
            <ul className={styles.problems}>
              {draft.issues.map((issue, index) => (
                <li key={index}>
                  <span>{t(`catalogue.issue.${issue.code}` as MessageKey)}</span>
                  <span className={styles.where}>{placeOf(issue.path, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className={`meta-line ${styles.updated}`}>
          {t('catalogue.draft.updated', { name: draft.updatedBy.name ?? t('catalogue.someone'), date: formatInstantShort(locale, draft.updatedAt) })}
        </p>
        <p className="meta-line">{t('catalogue.draft.formLater')}</p>
      </article>
    </section>
  );
}
