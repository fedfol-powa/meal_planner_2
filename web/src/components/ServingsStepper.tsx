import { useT } from '../i18n/LocaleProvider';

/** − value + with 44 px buttons (round 2 and 4 pattern). */
export function ServingsStepper({ value, min = 1, max = 50, onChange }: { value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  const t = useT();
  return (
    <div className="stepper" role="group" aria-label={t('recipe.servingsLabel')}>
      <button type="button" className="stepper-button" aria-label={t('recipe.lessServings')} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className="stepper-value" aria-live="polite">{t('meal.servings', { count: value })}</output>
      <button type="button" className="stepper-button" aria-label={t('recipe.moreServings')} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
