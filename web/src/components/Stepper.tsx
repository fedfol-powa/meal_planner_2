import { useT } from '../i18n/LocaleProvider';
import styles from './Stepper.module.css';

/** Generic − value + with a visible label (prototype, round 4); same look as ServingsStepper. */
export function Stepper({ label, value, min = 0, max, disabled = false, onChange }: { label: string; value: number; min?: number; max: number; disabled?: boolean; onChange: (value: number) => void }) {
  const t = useT();
  return (
    <div className={`stepper ${styles.stepper}`} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <button type="button" className="stepper-button" aria-label={t('settings.less', { label })} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className={styles.value} aria-live="polite">{value}</output>
      <button type="button" className="stepper-button" aria-label={t('settings.more', { label })} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
