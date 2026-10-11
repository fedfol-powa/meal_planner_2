import type { ReactNode } from 'react';

/** Secondary page header (round 3 pattern): back link with the destination name, then the title (text or link). */
export function PageHeader({ back, title, titleId }: { back: ReactNode; title: ReactNode; titleId?: string }) {
  return (
    <header className="page-header">
      {back}
      <h1 className="page-title" id={titleId}>{title}</h1>
    </header>
  );
}
