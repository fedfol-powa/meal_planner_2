import type { ShoppingListView } from '@app/contract';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { toApiError } from '../../api/errors';
import { Icon } from '../../components/Icon';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import { listExport } from './exportText';
import styles from './ShoppingPage.module.css';

/** A ready link belongs to the confirmed view and the list it was made from. */
type Bring = { kind: 'idle' } | { kind: 'creating' } | { kind: 'ready'; url: string; base: ShoppingListView; list: string } | { kind: 'failed'; empty: boolean };

interface Props {
  /** The list as shown, pending changes included. */
  view: ShoppingListView;
  /** The confirmed view: a new one while Bring! is prepared means the link may be old. */
  base: ShoppingListView;
  familyId: string;
  weekStartsOn: string;
  /** Changes still in the queue, and refused changes not closed yet, for this list. */
  unsynced: number;
  flush: () => void;
}

const isEmptyList = (error: unknown) => {
  const data = toApiError(error).data as { issues?: { code?: string }[] } | undefined;
  return toApiError(error).code === 'invalid' && !!data?.issues?.some((issue) => issue.code === 'empty_list');
};

/**
 * The «…» menu of the list: «Condividi» (text computed here, offline too) and Bring! (needs the
 * network and a synced list). Bring! opens in two steps, as Safari on iOS requires: the link
 * appears once ready and the person taps it; no window opened after a wait.
 */
export function ShareMenu({ view, base, familyId, weekStartsOn, unsynced, flush }: Props) {
  const t = useT();
  const api = useApi();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);
  const [bring, setBring] = useState<Bring>({ kind: 'idle' });
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef({ base, unsynced });
  latest.current = { base, unsynced };
  const exported = listExport(view);
  const nothingLeft = exported.lines.length === 0;
  const listId = `${familyId}/${weekStartsOn}`;
  // A newer confirmed view (also from another phone) or another list: the link shows an old list (PR #22 review, finding 4).
  const link = bring.kind === 'ready' && bring.base === base && bring.list === listId ? bring.url : null;
  const bringBlocked = !online ? 'offline' : unsynced > 0 ? 'pending' : null;

  // A change after the link was made: the link shows the old list, so it goes.
  useEffect(() => {
    if (unsynced > 0) setBring((current) => (current.kind === 'idle' ? current : { kind: 'idle' }));
  }, [unsynced]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !toggle.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function share() {
    setOpen(false);
    setCopied(null);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: exported.text });
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
        // Not allowed here (e.g. http on the LAN): copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(exported.text);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  }

  async function createLink() {
    setOpen(false);
    if (bringBlocked === 'pending') return flush();
    if (bringBlocked) return;
    const startedWith = latest.current.base;
    setBring({ kind: 'creating' });
    try {
      const { url } = await api.shopping.createBringLink({ familyId, weekStartsOn });
      // Changed meanwhile, here or confirmed from another phone: the link would show the old list.
      if (latest.current.unsynced > 0 || latest.current.base !== startedWith) return setBring({ kind: 'idle' });
      setBring({ kind: 'ready', url, base: startedWith, list: listId });
    } catch (error) {
      setBring({ kind: 'failed', empty: isEmptyList(error) });
    }
  }

  const bringNote = bringBlocked === 'offline' ? t('shopping.bringOffline') : bringBlocked === 'pending' ? t('shopping.bringPending') : null;
  return (
    <>
      <div className={styles.menuWrap}>
        <button ref={toggle} type="button" className={styles.menuToggle} aria-haspopup="menu" aria-expanded={open} aria-label={t('shopping.actions')} onClick={() => setOpen(!open)}>
          <Icon name="more" />
        </button>
        {open && (
          <div ref={panel} className={styles.menu} role="menu">
            <button type="button" role="menuitem" disabled={nothingLeft} onClick={() => void share()}>
              {t('shopping.share')}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={nothingLeft || bringBlocked === 'offline'}
              aria-disabled={bringBlocked === 'pending' || undefined}
              onClick={() => void createLink()}
            >
              {t('shopping.bring')}
              {bringNote && <small> · {bringNote}</small>}
            </button>
          </div>
        )}
      </div>
      <div className={styles.shareStatus} role="status">
        {copied === 'copied' && <p>{t('shopping.copied')}</p>}
        {copied === 'failed' && <p>{t('shopping.copyFailed')}</p>}
        {bring.kind === 'creating' && <p>{t('shopping.bringPreparing')}</p>}
        {link && (
          <a className="text-button primary" href={link} target="_blank" rel="noopener" onClick={() => setBring({ kind: 'idle' })}>
            {t('shopping.bringOpen')}
          </a>
        )}
        {bring.kind === 'failed' && (
          <p>
            {t(bring.empty ? 'shopping.bringEmpty' : 'shopping.bringFailed')}{' '}
            {!bring.empty && (
              <button type="button" className="text-button" onClick={() => void createLink()}>
                {t('common.retry')}
              </button>
            )}
          </p>
        )}
      </div>
    </>
  );
}
