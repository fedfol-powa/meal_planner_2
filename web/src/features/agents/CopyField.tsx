import { useRef, useState } from 'react';
import { useT } from '../../i18n/LocaleProvider';
import styles from './AgentsPage.module.css';

/** A command or address to copy (round 6): monospace, scrolls on narrow screens, select-all fallback. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT();
  const code = useRef<HTMLElement>(null);
  // «Copiato» only after a copy that worked; without the clipboard the text is selected and the person copies it (PR review, finding 5).
  const [outcome, setOutcome] = useState<'copied' | 'selected' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copy() {
    let done: 'copied' | 'selected' = 'copied';
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const range = document.createRange();
      if (code.current) range.selectNodeContents(code.current);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      done = 'selected';
    }
    setOutcome(done);
    clearTimeout(timer.current);
    if (done === 'copied') timer.current = setTimeout(() => setOutcome(null), 2000);
  }

  return (
    <>
      <div className={styles.copy}>
        <code ref={code} aria-label={label}>{value}</code>
        <button type="button" className="text-button" onClick={() => void copy()}>{outcome === 'copied' ? t('copy.copied') : t('copy.copy')}</button>
      </div>
      {outcome === 'selected' && <p className={styles.copyNote} role="status">{t('copy.selected')}</p>}
    </>
  );
}
