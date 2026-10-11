import type { ReactNode } from 'react';

export function StateNotice({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <section className="state-notice" role="status">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {children}
    </section>
  );
}
