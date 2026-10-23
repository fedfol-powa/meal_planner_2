import type { DeletionFamily } from '@app/contract';
import { ButtonSkeleton } from '../../components/PageSkeletons';
import { useT } from '../../i18n/LocaleProvider';
import styles from './Deletion.module.css';

export interface DeletionFamiliesProps {
  title: string;
  families: readonly DeletionFamily[];
  /** The outcome told for one family: the own account and the administration speak differently. */
  outcomeText: (family: DeletionFamily) => string;
  /** familyId → userId of the chosen successor. */
  successors: Readonly<Record<string, string>>;
  onChange: (successors: Record<string, string>) => void;
}

/**
 * What happens to each family when an account is deleted (round 4 prototype), shared by the own
 * account page and the administration (round 6): the outcome and, for the only administrator, the
 * choice of the successor among the candidates.
 */
export function DeletionFamilies({ title, families, outcomeText, successors, onChange }: DeletionFamiliesProps) {
  const t = useT();
  if (families.length === 0) return null;
  return (
    <>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {families.map((family) => (
        <section key={family.familyId} className={`settings-card ${styles.card}`} aria-label={family.name}>
          <h3>{family.name}</h3>
          <p>{outcomeText(family)}</p>
          {family.outcome === 'needs_successor' && (
            <fieldset className={styles.successors}>
              <legend>{t('account.successor')}</legend>
              {family.candidates.map((candidate) => (
                <label key={candidate.userId} className="choice">
                  <input
                    type="radio"
                    name={`successor-${family.familyId}`}
                    value={candidate.userId}
                    checked={successors[family.familyId] === candidate.userId}
                    onChange={() => onChange({ ...successors, [family.familyId]: candidate.userId })}
                  />
                  {candidate.displayName}
                </label>
              ))}
            </fieldset>
          )}
        </section>
      ))}
    </>
  );
}

/** The choices still valid for a plan: a successor stays chosen while it is still a candidate of a family that needs one. */
export function validSuccessors(families: readonly DeletionFamily[], successors: Readonly<Record<string, string>>): Record<string, string> {
  const valid: Record<string, string> = {};
  for (const family of families) {
    const chosen = successors[family.familyId];
    if (family.outcome === 'needs_successor' && chosen && family.candidates.some((c) => c.userId === chosen)) valid[family.familyId] = chosen;
  }
  return valid;
}

/** Every family that needs a successor has one among its candidates. */
export function successorsComplete(families: readonly DeletionFamily[], successors: Readonly<Record<string, string>>): boolean {
  const valid = validSuccessors(families, successors);
  return families.every((family) => family.outcome !== 'needs_successor' || family.familyId in valid);
}

/** A family of the deletion while the plan loads (W22): name and outcome. */
export function DeletionFamilySkeleton() {
  return (
    <section className={`settings-card ${styles.card} skeleton-card`}>
      <h3 className="skeleton-line" />
      <p><span className="skeleton-line" /></p>
    </section>
  );
}

/** «Cosa sparisce» while the plan loads (W22): title, two lines, the note and the red button. */
export function WhatGoesSkeleton() {
  return (
    <section className={`settings-card ${styles.card} skeleton-card`}>
      <h2 className={`${styles.cardTitle} skeleton-line`} />
      <p><span className="skeleton-line" /><span className="skeleton-line" /></p>
      <p className="meta-line"><span className="skeleton-line" /></p>
      <ButtonSkeleton wide className={styles.confirm} />
    </section>
  );
}
