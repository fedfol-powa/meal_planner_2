import type { ReactNode } from 'react';

/**
 * Secondary page header (round 3 pattern): back link with the destination name, then the title (text or link).
 * No title: only the back link (error states). `titleHidden`: the title is a skeleton block, not read (W20).
 */
export function PageHeader({ back, title, titleId, titleHidden }: { back: ReactNode; title?: ReactNode; titleId?: string; titleHidden?: boolean }) {
  return (
    <header className="page-header">
      {back}
      {title !== undefined && <h1 className="page-title" id={titleId} aria-hidden={titleHidden || undefined}>{title}</h1>}
    </header>
  );
}
