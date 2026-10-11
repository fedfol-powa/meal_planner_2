import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '../i18n/LocaleProvider';
import styles from './BottomSheet.module.css';

/** Modal sheet from the bottom of the screen (prototype, round 4), on <dialog> for focus trapping and Esc. */
export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // Without showModal (jsdom) the sheet is simply open.
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }
    if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={`${id}-title`}
      onClose={onClose}
      onCancel={onClose}
      // A tap on the backdrop lands on the dialog element itself.
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      {/* Focus lands on the sheet itself, not on the close button (iOS showed its focus ring on open). */}
      <div className={styles.body} tabIndex={-1} autoFocus>
        <header className={styles.header}>
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>×</button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
