import { createContext, useContext, useEffect, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { useT } from '../i18n/LocaleProvider';

/**
 * Skeletons while data loads (W20, issue #49): blocks of the content's shape, so the page does not move
 * when the data arrives. Styles in global.css (.skeleton, .skeleton-card, .skeleton-line, .skeleton-block).
 */

/** Below this wait nothing shows: the space is reserved at once, the blocks only after it (no grey flash). */
export const SKELETON_DELAY_MS = 200;

/** True once `active` has lasted `delayMs`; false as soon as it ends. Each new wait starts again. */
export function useShowAfter(active: boolean, delayMs = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!active) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && shown;
}

interface ScopeState { loading: boolean; shown: boolean; paused: boolean }

const ScopeContext = createContext<ScopeState>({ loading: false, shown: false, paused: false });

export function useLoadingScope(): ScopeState {
  return useContext(ScopeContext);
}

/**
 * One wait for a page or an area: every Skeleton inside shares its delay and its pause, and the scope
 * renders the only announcement. `paused`: the read waits for the network (offline), the blocks stand still.
 */
export function LoadingScope({ loading, paused = false, children }: { loading: boolean; paused?: boolean; children: ReactNode }) {
  const t = useT();
  const shown = useShowAfter(loading);
  return (
    <ScopeContext.Provider value={{ loading, shown, paused: loading && paused }}>
      <span role="status" className="visually-hidden">{shown ? t('common.loading') : ''}</span>
      {children}
    </ScopeContext.Provider>
  );
}

/** Blocks of the scope, hidden from screen readers; anywhere in the page (data area or header). */
export function Skeleton({ as: Tag = 'div', className, style, children }: { as?: ElementType; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const { shown, paused } = useLoadingScope();
  return (
    <Tag className={className ? `skeleton ${className}` : 'skeleton'} style={style} data-visible={shown} data-paused={paused || undefined} aria-hidden="true">
      {children}
    </Tag>
  );
}

/** The data area of a page that uses LoadingScope directly: busy while the scope waits. */
export function BusyArea({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className} aria-busy={useLoadingScope().loading || undefined}>{children}</div>;
}

/** A single area: the skeleton while loading, then the children. */
export function LoadingArea({ loading, paused, skeleton, children, className }: { loading: boolean; paused?: boolean; skeleton: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <LoadingScope loading={loading} paused={paused}>
      <BusyArea className={className}>{loading ? <Skeleton>{skeleton}</Skeleton> : children}</BusyArea>
    </LoadingScope>
  );
}
