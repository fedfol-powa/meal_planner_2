import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { useT } from '../i18n/LocaleProvider';

/**
 * Skeletons while data loads (W20, issue #49): blocks of the content's shape, so the page does not move
 * when the data arrives. Styles in global.css (.skeleton, .skeleton-card, .skeleton-line, .skeleton-block).
 * A page with several reads (W22) wraps them in `<LoadingScope gather>`: the inner scopes join its wait, so
 * the page has one delay, one pause and one announcement, while each area shows its content when it arrives.
 */

/** Below this wait nothing shows: the space is reserved at once, the blocks only after it (no grey flash). */
export const SKELETON_DELAY_MS = 200;

/**
 * A visible wait unmounted while still waiting, in the commit being applied (W22): its layout gave way to
 * the next layout of the same wait (FamilyGate or AdminAccessGate to the page, the profile to the detail).
 * A wait starting in the same commit shows its blocks at once instead of hiding them for another delay.
 */
let handingOff = false;

/**
 * True once `active` has lasted `delayMs`; false as soon as it ends. Each new wait starts again, except one
 * that takes over from a visible wait unmounted in the same commit.
 */
export function useShowAfter(active: boolean, delayMs = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!active) return;
    if (handingOff) return setShown(true);
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  const visible = active && shown;
  const last = useRef(visible);
  last.current = visible;
  useEffect(
    () => () => {
      if (!last.current) return;
      handingOff = true;
      queueMicrotask(() => (handingOff = false));
    },
    []
  );
  return visible;
}

interface ScopeState { loading: boolean; shown: boolean; paused: boolean }

const ScopeContext = createContext<ScopeState>({ loading: false, shown: false, paused: false });

export function useLoadingScope(): ScopeState {
  return useContext(ScopeContext);
}

interface Wait { loading: boolean; paused: boolean }

interface Gather { join: (id: string, wait: Wait | null) => void; shown: boolean; paused: boolean }

const GatherContext = createContext<Gather | null>(null);

/**
 * One wait for a page or an area: every Skeleton inside shares its delay and its pause, and the scope
 * renders the only announcement (`label`, «Caricamento…» by default). `paused`: the read waits for the
 * network (offline), the blocks stand still. `gather`: the scopes inside join this wait instead of having
 * their own; it pauses only when every active wait is paused. A scope inside a gathering one renders no
 * announcement and keeps only its own `loading` (its BusyArea is busy only while it waits).
 */
export function LoadingScope({ loading = false, paused = false, gather = false, label, children }: { loading?: boolean; paused?: boolean; gather?: boolean; label?: string; children: ReactNode }) {
  const t = useT();
  const root = useContext(GatherContext);
  const id = useId();
  const [waits, setWaits] = useState<ReadonlyMap<string, Wait>>(() => new Map());
  const join = useCallback((key: string, wait: Wait | null) =>
    setWaits((current) => {
      const before = current.get(key);
      if (wait ? before?.loading === wait.loading && before.paused === wait.paused : !before) return current;
      const next = new Map(current);
      if (wait) next.set(key, wait);
      else next.delete(key);
      return next;
    }), []);
  const rootJoin = root?.join;
  // In the commit of the area: the gathered wait starts with it (and takes over a handoff, see above).
  useLayoutEffect(() => {
    if (!rootJoin) return;
    rootJoin(id, { loading, paused });
    return () => rootJoin(id, null);
  }, [rootJoin, id, loading, paused]);
  const active = [...(loading ? [{ loading, paused }] : []), ...[...waits.values()].filter((w) => w.loading)];
  const shownRoot = useShowAfter(!root && active.length > 0);
  if (root) {
    return (
      <ScopeContext.Provider value={{ loading, shown: root.shown && loading, paused: root.paused && loading }}>
        {children}
      </ScopeContext.Provider>
    );
  }
  const pausedAll = active.length > 0 && active.every((w) => w.paused);
  const scope = <ScopeContext.Provider value={{ loading, shown: shownRoot && loading, paused: pausedAll && loading }}>{children}</ScopeContext.Provider>;
  return (
    <>
      <span role="status" className="visually-hidden">{shownRoot ? label ?? t('common.loading') : ''}</span>
      {gather ? <GatherContext.Provider value={{ join, shown: shownRoot, paused: pausedAll }}>{scope}</GatherContext.Provider> : scope}
    </>
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
export function LoadingArea({ loading, paused, label, skeleton, children, className }: { loading: boolean; paused?: boolean; label?: string; skeleton: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <LoadingScope loading={loading} paused={paused} label={label}>
      <BusyArea className={className}>{loading ? <Skeleton>{skeleton}</Skeleton> : children}</BusyArea>
    </LoadingScope>
  );
}
