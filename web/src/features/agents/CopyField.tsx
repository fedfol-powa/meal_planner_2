import { useRef, useState } from 'react';
import { useT } from '../../i18n/LocaleProvider';
import styles from './AgentsPage.module.css';

/** A command or address to copy (round 6): monospace, scrolls on narrow screens, select-all fallback. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT();
  const code = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const range = document.createRange();
      if (code.current) range.selectNodeContents(code.current);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.copy}>
      <code ref={code} aria-label={label}>{value}</code>
      <button type="button" className="text-button" onClick={() => void copy()}>{copied ? t('copy.copied') : t('copy.copy')}</button>
    </div>
  );
}
