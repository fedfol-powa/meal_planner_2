import { MAX_SERVINGS, TIME_LIMITS } from '@app/domain/family';
import { MEAL_TYPES } from '@app/domain/planner';
import { useState } from 'react';
import type { SettingsView } from '../api/types';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { BottomSheet } from './BottomSheet';
import styles from './DinersGrid.module.css';
import { Icon } from './Icon';
import { Stepper } from './Stepper';
import { weekdayName, WEEKDAYS } from './weekdays';

type Slots = SettingsView['settings']['slots'];
type MealType = keyof Slots;
export type SlotSetting = Slots['lunch'][number];
export interface SlotChange { mealType: MealType; weekday: number; slot: SlotSetting }
type Kind = 'recipe' | 'fixed' | 'none';

const kindOf = (slot: SlotSetting): Kind => (slot.servings === 0 ? 'none' : slot.fixedText !== null ? 'fixed' : 'recipe');

/**
 * «Chi mangia quando» (round 4): the week pattern of servings, fixed free meals and time limits.
 * A change being saved shows the value sent and keeps the controls disabled until the answer.
 */
export function DinersGrid({ slots, editable, pending, onChange }: { slots: Slots; editable: boolean; pending: SlotChange | null; onChange: (change: SlotChange) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [editing, setEditing] = useState<{ mealType: MealType; weekday: number } | null>(null);
  const [fixedDraft, setFixedDraft] = useState('');
  const shown = (mealType: MealType, weekday: number) =>
    pending && pending.mealType === mealType && pending.weekday === weekday ? pending.slot : slots[mealType][weekday]!;
  const current = editing ? shown(editing.mealType, editing.weekday) : null;
  const kind = current ? kindOf(current) : 'recipe';
  const busy = pending !== null;

  const open = (mealType: MealType, weekday: number) => {
    setEditing({ mealType, weekday });
    setFixedDraft(slots[mealType][weekday]!.fixedText ?? '');
  };
  const save = (change: Partial<SlotSetting>) => {
    if (!editing || !current) return;
    onChange({ ...editing, slot: { ...current, ...change } });
  };
  const setKind = (next: Kind) => {
    if (!current) return;
    const servings = current.servings || 2;
    if (next === 'none') save({ servings: 0, fixedText: null, maxMinutes: null });
    if (next === 'recipe') save({ servings, fixedText: null });
    if (next === 'fixed') {
      const text = fixedDraft.trim() || t('settings.slot.fixedDefault');
      setFixedDraft(text);
      save({ servings, fixedText: text, maxMinutes: null });
    }
  };
  const describe = (slot: SlotSetting) =>
    `${slot.servings === 0 ? t('settings.slot.none') : (slot.fixedText ?? t('meal.servings', { count: slot.servings }))}${slot.maxMinutes ? `, ${t('settings.slot.maxShort', { count: slot.maxMinutes })}` : ''}`;

  return (
    <>
      <table className={styles.diners}>
        <thead>
          <tr>
            <td />
            {MEAL_TYPES.map((meal) => <th key={meal} scope="col">{t(`meal.${meal}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((weekday) => (
            <tr key={weekday}>
              <th scope="row">{weekdayName(locale, weekday, 'short')}</th>
              {MEAL_TYPES.map((meal) => {
                const slot = shown(meal, weekday);
                const classes = [styles.cell, slot.fixedText !== null ? styles.fixed : '', slot.servings === 0 ? styles.off : ''].join(' ');
                return (
                  <td key={meal}>
                    <button
                      type="button"
                      className={classes}
                      disabled={!editable}
                      aria-busy={pending?.mealType === meal && pending.weekday === weekday}
                      aria-label={`${weekdayName(locale, weekday)} ${t(`meal.${meal}`)}: ${describe(slot)}`}
                      onClick={() => open(meal, weekday)}
                    >
                      {slot.servings === 0 ? (
                        <span>—</span>
                      ) : slot.fixedText !== null ? (
                        <span className={styles.fixedText}>{slot.fixedText}</span>
                      ) : (
                        <span className={styles.servings}><Icon name="user" />{slot.servings}</span>
                      )}
                      {slot.maxMinutes !== null && <span className={styles.limit}><Icon name="clock" />{slot.maxMinutes}′</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <BottomSheet
        open={editing !== null}
        title={editing ? `${weekdayName(locale, editing.weekday)} · ${t(`meal.${editing.mealType}`)}` : ''}
        onClose={() => setEditing(null)}
      >
        {current && (
          <>
            <fieldset className={styles.kinds} disabled={busy}>
              <legend className="visually-hidden">{t('settings.slot.kind')}</legend>
              {(['recipe', 'fixed', 'none'] as const).map((option) => (
                <label key={option} className="choice">
                  <input type="radio" name="slot-kind" checked={kind === option} onChange={() => setKind(option)} />
                  {t(`settings.slot.${option}`)}
                </label>
              ))}
            </fieldset>
            {kind === 'fixed' && (
              <label className="field">
                {t('settings.slot.fixedText')}
                <input
                  type="text"
                  maxLength={60}
                  value={fixedDraft}
                  disabled={busy}
                  onChange={(event) => setFixedDraft(event.target.value)}
                  onBlur={() => fixedDraft.trim() && fixedDraft.trim() !== current.fixedText && save({ fixedText: fixedDraft.trim() })}
                />
              </label>
            )}
            {kind !== 'none' && (
              <Stepper label={t('settings.slot.servings')} value={current.servings} min={1} max={MAX_SERVINGS} disabled={busy} onChange={(servings) => save({ servings })} />
            )}
            {kind === 'recipe' && (
              <label className={`field ${styles.limitField}`}>
                {t('settings.slot.maxMinutes')}
                <select
                  value={current.maxMinutes ?? ''}
                  disabled={busy}
                  onChange={(event) => save({ maxMinutes: event.target.value ? (Number(event.target.value) as SlotSetting['maxMinutes']) : null })}
                >
                  <option value="">{t('settings.slot.noLimit')}</option>
                  {TIME_LIMITS.map((minutes) => <option key={minutes} value={minutes}>{t('settings.slot.maxShort', { count: minutes })}</option>)}
                </select>
              </label>
            )}
            {busy && <p className="meta-line" role="status">{t('settings.saving')}</p>}
            <button type="button" className={`text-button primary wide ${styles.done}`} onClick={() => setEditing(null)}>{t('settings.done')}</button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
