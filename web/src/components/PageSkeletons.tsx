import type { ElementType, ReactNode } from 'react';
import cardStyles from './RecipeCard.module.css';
import { LoadingArea, Skeleton } from './Skeleton';

/**
 * Page skeletons (W20): the content's own elements and classes with empty lines, so the heights match the
 * common case. They go inside a LoadingScope (through LoadingArea or Skeleton), which hides them from screen readers.
 */

/** A recipe card of the common case: 3:1 photo, one-line title, three-line description, meta row, footer. */
export function RecipeCardSkeleton({ photo = true }: { photo?: boolean }) {
  return (
    <article className="meal skeleton-card">
      {photo ? <div className="meal-media" style={{ aspectRatio: '3 / 1' }} /> : <div className="meal-heading" />}
      <div className={`meal-content ${cardStyles.content}`}>
        <h3 className="skeleton-line" />
        <p className="description">
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
        </p>
        {/* Time (clock icon first) and source share a baseline, as in the card: an empty icon and an invisible
            space give the row the card's height. */}
        <div className={cardStyles.metaRow}>
          <p className="meal-meta"><svg className="icon" />{'\u00a0'}</p>
          <p className={`meal-source ${cardStyles.source}`}>{'\u00a0'}</p>
        </div>
      </div>
      <div className={cardStyles.footer}>
        <span className={cardStyles.action} />
        <span className={cardStyles.action} />
        <span className={cardStyles.action} />
      </div>
    </article>
  );
}

/** The recipe book's results: the count line and three cards. */
export function RecipeListSkeleton() {
  return (
    <>
      <p className="meta-line skeleton-block" style={{ width: '30%', height: '1lh' }} />
      <div className="recipe-grid">
        <RecipeCardSkeleton />
        <RecipeCardSkeleton />
        <RecipeCardSkeleton />
      </div>
    </>
  );
}

/** A page whose route is not known yet (startup, while the access is checked): a title and two cards. */
export function GenericPageSkeleton() {
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <LoadingArea
          loading
          skeleton={
            <>
              <header className="page-header">
                <span className="page-title skeleton-block" style={{ width: '40%', height: '1lh' }} />
              </header>
              <div className="recipe-grid">
                <RecipeCardSkeleton />
                <RecipeCardSkeleton />
              </div>
            </>
          }
        />
      </div>
    </section>
  );
}

/**
 * Rows of a `row-list` (W22). Inside a card made of blocks they stay empty (the card is the block); inside a
 * real card `filled` gives each row its own block (the text part, and `action`, which is a ButtonSkeleton).
 * `link`: the structure of the link rows (profile, users), with optional `lead` and `trail` icons.
 * `small`: secondary lines under the text. `chip`: a role label after the text.
 */
export function SkeletonRows({ count, small = 1, chip = false, link = false, lead = false, trail = false, filled = false, action, className }: { count: number; small?: number; chip?: boolean; link?: boolean; lead?: boolean; trail?: boolean; filled?: boolean; action?: ReactNode; className?: string }) {
  const text = (
    <span className={filled ? 'row-main skeleton-block' : 'row-main'}>
      <span className="skeleton-line" />
      {Array.from({ length: small }, (_, i) => <small key={i} className="skeleton-line" />)}
    </span>
  );
  const body = (
    <>
      {text}
      {chip && <span className="label-chip">{'\u00a0'}</span>}
      {action}
    </>
  );
  return (
    <ul className="row-list">
      {Array.from({ length: count }, (_, i) =>
        link ? (
          <li key={i}>
            <span className={className ? `row-link ${className}` : 'row-link'}>
              {lead && <svg className="icon" />}
              {body}
              {trail && <svg className="icon" />}
            </span>
          </li>
        ) : (
          <li key={i} className={className}>{body}</li>
        )
      )}
    </ul>
  );
}

/** A settings card made of blocks: an optional title line, then the children in the order of the real card. */
export function SettingsCardSkeleton({ title = true, className, children }: { title?: boolean; className?: string; children?: ReactNode }) {
  return (
    <section className={className ? `settings-card skeleton-card ${className}` : 'settings-card skeleton-card'}>
      {title && <h2 className="skeleton-line" />}
      {children}
    </section>
  );
}

/** A static text (hint, note) inside a card of blocks, with the class of the real text. */
export function TextSkeleton({ as: Tag = 'p', className, lines = 1 }: { as?: ElementType; className?: string; lines?: number }) {
  return (
    <Tag className={className}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton-line" />)}
    </Tag>
  );
}

/** A form field: the label line and the 44 px input; `hint`: the class of the hint line under it. */
export function FieldSkeleton({ hint }: { hint?: string } = {}) {
  return (
    <div className="field">
      <span className="skeleton-line" />
      <span className="skeleton-block" style={{ height: 44 }} />
      {hint && <span className={`${hint} skeleton-line`} />}
    </div>
  );
}

/** A button with the measures and margins of the real one (`text-button` and the page's class). */
export function ButtonSkeleton({ wide = false, className }: { wide?: boolean; className?: string }) {
  return <span className={['text-button skeleton-block', wide && 'wide', className].filter(Boolean).join(' ')}>{' '}</span>;
}

/**
 * A title that comes from the data: a block of the page's wait (same delay and pause as the body), inside
 * the real heading, which is hidden from screen readers meanwhile. The back link stays outside the heading.
 */
export function TitleSkeleton({ width = '60%', height = '1lh', className = 'skeleton-block' }: { width?: string; height?: string; className?: string }) {
  return <Skeleton as="span" className={className} style={{ width, height }} />;
}
