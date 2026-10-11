import type { DraftView } from '@app/contract';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, SEASONS } from '@app/domain/planner';
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
type Fields = Record<string, unknown>;

// The content is shown as saved: an imported draft may not match the current schema (contract, draftView),
// so every field is checked before use and a value of the wrong type counts as missing.
const record = (value: unknown): Fields | null => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : null);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
const known = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);

/** The reader's language, otherwise the other one (names of drafts, W6's rule). */
function localText(text: unknown, locale: Locale): string {
  const other: Locale = locale === 'it-IT' ? 'en-GB' : 'it-IT';
  const texts = record(text);
  return str(texts?.[locale])?.trim() || str(texts?.[other])?.trim() || '';
}

const ATTRIBUTES = ['mealType', 'proteinGroup', 'carbohydrateGroup', 'category', 'isFreshFish', 'hasVegetables', 'isHeavy', 'seasons'] as const;
type Attribute = (typeof ATTRIBUTES)[number];
const SOURCE_FIELDS = new Set(['sourceType', 'sourceUrl', 'bookId', 'bookPages']);
const RECIPE_MEAL_TYPES = ['lunch', 'dinner', 'both'] as const;
const isAttribute = (field: unknown): field is Attribute => known(ATTRIBUTES, field);

/** Where a problem is, in words: «Nome (inglese)», «Ingredienti, riga 2», «Tipo di piatto». */
function placeOf(path: readonly (string | number)[], t: Translate): string {
  const [field, second] = path;
  const language = (value: unknown) => (value === 'it-IT' || value === 'en-GB' ? ` (${t(`catalogue.lang.${value}`)})` : '');
  if (field === 'name' || field === 'description') return `${t(`catalogue.field.${field}`)}${language(second)}`;
  if (field === 'ingredients') return typeof second === 'number' ? t('catalogue.field.line', { count: second + 1 }) : t('catalogue.field.ingredients');
  if (typeof field === 'string' && SOURCE_FIELDS.has(field)) return t('catalogue.field.source');
  if (isAttribute(field)) return t(`catalogue.attr.${field}`);
  if (field === 'durationMinutes' || field === 'baseServings') return t(`catalogue.field.${field}`);
  return t('catalogue.field.elsewhere');
}

/** An attribute as saved: «—» when missing, the raw text when it is not one of today's values. */
function attributeValue(field: Attribute, value: unknown, t: Translate): string {
  if (field === 'isFreshFish' || field === 'hasVegetables' || field === 'isHeavy') return typeof value === 'boolean' ? t(value ? 'catalogue.yes' : 'catalogue.no') : '—';
  if (field === 'seasons') {
    if (!Array.isArray(value)) return '—';
    return value.length === 0 ? t('catalogue.allYear') : value.map((season) => (known(SEASONS, season) ? t(`catalogue.season.${season}`) : String(season))).join(', ');
  }
  if (field === 'mealType' && known(RECIPE_MEAL_TYPES, value)) return t(`catalogue.mealType.${value}`);
  if (field === 'proteinGroup' && known(PROTEIN_GROUPS, value)) return t(`group.${value}`);
  if (field === 'carbohydrateGroup' && known(CARBOHYDRATE_GROUPS, value)) return t(`catalogue.carbohydrate.${value}`);
  // «.other» is a plural form in the dictionaries, hence otherDish.
  if (field === 'category' && known(CATEGORIES, value)) return t(value === 'other' ? 'catalogue.category.otherDish' : `catalogue.category.${value}`);
  return str(value) || '—';
}

function sourceOf(content: Fields, bookTitle: string | null, t: Translate): ReactNode {
  if (content.sourceType === 'book') return t('source.book', { title: bookTitle ?? '—', pages: str(content.bookPages) ?? '—' });
  if (content.sourceType === 'home') return t('source.home');
  const url = safeSourceUrl(str(content.sourceUrl));
  if (!url) return content.sourceType === 'youtube' ? t('source.youtube') : null;
  const label = content.sourceType === 'youtube' ? t('source.youtube') : new URL(url).hostname.replace(/^www\./, '');
  return <a className="link-inline" href={url} target="_blank" rel="noopener noreferrer">{label}</a>;
}

/** A draft as saved, read-only (spec of W3, section 5): editing and publishing come with wave 3. */
export function DraftPage() {
  const t = useT();
  const { draftId } = route.useParams();
  const profile = useProfileRead();
  const isCurator = useIsCurator();
  const { query, data, blocked } = useDraft(draftId, isCurator);
  const back = <Link to="/recipes" className="page-back"><Icon name="chevron-left" />{t('nav.recipes')}</Link>;
  const page = (content: ReactNode) => (
    <section className="secondary-view app-view"><div className="page-column"><header className="page-header">{back}</header>{content}</div></section>
  );
  const unavailable = <StateNotice title={t('catalogue.draft.unavailable')} body={t('catalogue.draft.unavailableBody')} />;

  if (profile.data === undefined) {
    return page(profile.isError ? <QueryError error={profile.error} onRetry={() => void profile.refetch()} /> : <Loading />);
  }
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
  const content: Fields = draft.content;
  const lines = (Array.isArray(content.ingredients) ? content.ingredients : []).flatMap((line: unknown, index) => {
    const fields = record(line);
    return fields ? [{ index, fields }] : [];
  });
  const source = sourceOf(content, draft.bookTitle, t);
  const description = localText(content.description, locale);
  const duration = positive(content.durationMinutes);
  const baseServings = positive(content.baseServings);
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
        {duration && <p className="meal-meta"><Icon name="clock" />{t('meal.minutes', { count: duration })}</p>}
        {baseServings && <p className="meta-line">{t('recipe.baseServings', { count: baseServings })}</p>}

        {lines.length > 0 && (
          <section className={styles.block} aria-labelledby="draft-ingredients">
            <h2 id="draft-ingredients" className={styles.blockHeading}>{t('meal.ingredients')}</h2>
            <ul className={styles.lines}>
              {lines.map(({ index, fields: line }) => {
                const ingredientId = str(line.ingredientId);
                const name = ingredientId ? draft.ingredientNames[ingredientId] : undefined;
                const variety = localText(line.variety, locale);
                const sourceText = str(line.sourceText);
                return (
                  <li key={index}>
                    <span className={styles.lineName}>
                      {name ?? <span className={styles.unresolved}>{t('catalogue.draft.unresolved')}</span>}
                    </span>
                    {variety && <> · <span>{variety}</span></>}
                    {sourceText && <span className={styles.lineSource}>{sourceText}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.block} aria-labelledby="draft-attributes">
          <h2 id="draft-attributes" className={styles.blockHeading}>{t('catalogue.field.attributes')}</h2>
          <dl className={styles.attributes}>
            {ATTRIBUTES.map((field) => (
              <div key={field}>
                <dt>{t(`catalogue.attr.${field}`)}</dt>
                <dd>{attributeValue(field, content[field], t)}</dd>
              </div>
            ))}
          </dl>
        </section>

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
