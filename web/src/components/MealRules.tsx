import { DISH_KINDS } from '@app/domain/family';
import { PROTEIN_GROUPS } from '@app/domain/planner';
import { useState } from 'react';
import type { SettingsView } from '../api/types';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import styles from './MealRules.module.css';
import { weekdayName, WEEKDAYS } from './weekdays';

export type MealRule = SettingsView['settings']['rules'][number];
type Kind = MealRule['kind'];
type Dish = (typeof DISH_KINDS)[number];
type Group = (typeof PROTEIN_GROUPS)[number];

const TEMPLATES: Kind[] = ['at_least_one', 'never_on', 'never_fresh_fish', 'only_lunch'];
const ruleKey = (rule: MealRule) => JSON.stringify(Object.entries(rule).sort(([a], [b]) => a.localeCompare(b)));

/** Meal rules from the four templates of the contract (round 4): no free-text rules, removed by value. */
export function MealRules({ rules, editable, busy, onAdd, onRemove }: { rules: MealRule[]; editable: boolean; busy: boolean; onAdd: (rule: MealRule) => void; onRemove: (rule: MealRule) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>('at_least_one');
  const [dish, setDish] = useState<Dish>('pasta');
  const [group, setGroup] = useState<Group>('fish');
  const [weekday, setWeekday] = useState(4);

  const describe = (rule: MealRule): string => {
    if (rule.kind === 'only_lunch') return t('rule.only_lunch', { dish: t(`dish.${rule.dish}`) });
    if (rule.kind === 'never_fresh_fish') return t('rule.never_fresh_fish', { day: weekdayName(locale, rule.weekday) });
    return t(`rule.${rule.kind}`, { group: t(`group.${rule.group}`), day: weekdayName(locale, rule.weekday) });
  };
  const draft = (): MealRule =>
    kind === 'only_lunch' ? { kind, dish } : kind === 'never_fresh_fish' ? { kind, weekday } : { kind, group, weekday };

  return (
    <>
      {rules.length ? (
        <ul className="row-list">
          {rules.map((rule) => (
            <li key={ruleKey(rule)}>
              <span className="row-main">{describe(rule)}</span>
              {editable && (
                <button type="button" className={styles.remove} aria-label={t('settings.rules.remove', { rule: describe(rule) })} disabled={busy} onClick={() => onRemove(rule)}>×</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta-line">{t('settings.rules.none')}</p>
      )}
      {editable && (
        <button type="button" className={`row-link ${styles.add}`} disabled={busy} onClick={() => setAdding(true)}>
          <Icon name="plus" />{t('settings.rules.add')}
        </button>
      )}

      <BottomSheet open={adding} title={t('settings.rules.add')} onClose={() => setAdding(false)}>
        <fieldset className={styles.kinds}>
          <legend className="visually-hidden">{t('settings.rules.template')}</legend>
          {TEMPLATES.map((option) => (
            <label key={option} className="choice">
              <input type="radio" name="rule-kind" checked={kind === option} onChange={() => setKind(option)} />
              {t(`settings.rules.template.${option}`)}
            </label>
          ))}
        </fieldset>
        {kind === 'only_lunch' ? (
          <label className="field">
            {t('settings.rules.dish')}
            <select value={dish} onChange={(event) => setDish(event.target.value as Dish)}>
              {DISH_KINDS.map((d) => <option key={d} value={d}>{t(`dish.${d}`)}</option>)}
            </select>
          </label>
        ) : (
          <div className={styles.pair}>
            {kind !== 'never_fresh_fish' && (
              <label className="field">
                {t('settings.rules.group')}
                <select value={group} onChange={(event) => setGroup(event.target.value as Group)}>
                  {PROTEIN_GROUPS.map((g) => <option key={g} value={g}>{t(`group.${g}`)}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              {t('settings.rules.day')}
              <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {WEEKDAYS.map((d) => <option key={d} value={d}>{weekdayName(locale, d)}</option>)}
              </select>
            </label>
          </div>
        )}
        <p className={styles.preview}>{describe(draft())}</p>
        <button
          type="button"
          className="text-button primary wide"
          onClick={() => {
            onAdd(draft());
            setAdding(false);
          }}
        >
          {t('settings.rules.addButton')}
        </button>
      </BottomSheet>
    </>
  );
}
