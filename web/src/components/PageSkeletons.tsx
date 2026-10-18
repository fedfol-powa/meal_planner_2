import cardStyles from './RecipeCard.module.css';
import { LoadingArea } from './Skeleton';

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
