import { GROUP_MAX, KNOWN_NEW_MAX } from '@app/domain/family';
import { CREA_RANGES, FOOD_GROUPS } from '@app/domain/planner';
import { useQuery, type UseMutationResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { errorKey, isBlocking } from '../../api/errors';
import { familyQuery, settingsQuery } from '../../api/family';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import type { FamilyDetailView, FamilyView, SettingsView } from '../../api/types';
import danger from '../../components/Danger.module.css';
import { DinersGrid, type SlotChange } from '../../components/DinersGrid';
import dinersStyles from '../../components/DinersGrid.module.css';
import { FamilyGate } from '../../components/FamilyGate';
import { IngredientRestrictions, type RestrictionChange } from '../../components/IngredientRestrictions';
import { MealRules, type MealRule } from '../../components/MealRules';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { FieldSkeleton, SettingsCardSkeleton, SkeletonRows, TextSkeleton } from '../../components/PageSkeletons';
import { QueryError } from '../../components/QueryError';
import { BusyArea, LoadingScope, Skeleton } from '../../components/Skeleton';
import { Stepper } from '../../components/Stepper';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from './BackToProfile';
import styles from './SettingsPage.module.css';

const NAME_MAX = 60;
type KnownNew = SettingsView['settings']['knownNew'];
type FoodGroup = (typeof FOOD_GROUPS)[number];

/**
 * Family settings (round 4): saved at every change, administrators edit, members read. What each
 * write updates and makes stale is decided by INVALIDATIONS, never by the page.
 */
export function SettingsPage() {
  return <FamilyGate waiting={(paused) => <SettingsLayout loading paused={paused} />}>{(family) => <Settings family={family} />}</FamilyGate>;
}

/**
 * The page around its content. While loading (profile, family or settings, W22): the intro line and the
 * name, diners and rules cards, the first screen of the phone; what follows arrives below it.
 */
function SettingsLayout({ loading = false, paused = false, children }: { loading?: boolean; paused?: boolean; children?: ReactNode }) {
  const t = useT();
  return (
    <section className="secondary-view app-view" aria-labelledby="settings-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('profile.settings')} titleId="settings-title" />
        {loading ? (
          <LoadingScope loading paused={paused}>
            <BusyArea>
              <Skeleton>
                {/* Intro and diners hint take two lines on a phone. */}
                <p className={`meta-line ${styles.intro} skeleton-block`} style={{ width: '90%', height: '2lh' }} />
                <SettingsCardSkeleton title={false}>
                  <FieldSkeleton />
                </SettingsCardSkeleton>
                <SettingsCardSkeleton>
                  <TextSkeleton className="meta-line" lines={2} />
                  <table className={dinersStyles.diners}>
                    <thead>
                      <tr><td /><th>{'\u00a0'}</th><th>{'\u00a0'}</th></tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 7 }, (_, row) => (
                        <tr key={row}>
                          <th />
                          <td><span className={dinersStyles.cell} /></td>
                          <td><span className={dinersStyles.cell} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SettingsCardSkeleton>
                <SettingsCardSkeleton>
                  <SkeletonRows count={2} small={0} />
                </SettingsCardSkeleton>
              </Skeleton>
            </BusyArea>
          </LoadingScope>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** The error of a write, next to the control that sent it. */
function WriteError({ mutation }: { mutation: Pick<UseMutationResult<unknown, unknown, never>, 'isError' | 'error'> }) {
  const t = useT();
  return mutation.isError ? <p className="meta-line" role="alert">{t(errorKey(mutation.error))}</p> : null;
}

function Settings({ family }: { family: FamilyView }) {
  const t = useT();
  const deps = useQueryDeps();
  const online = useOnline();
  const detail = useQuery(familyQuery(deps, family.id));
  const settings = useQuery(settingsQuery(deps, family.id));
  const failed = [detail, settings].find((read) => read.isError && isBlocking(read.error, !!read.data));
  const editable = !!settings.data?.canEdit && online;

  const waiting = [detail, settings].filter((read) => !read.data);
  if (!failed && waiting.length > 0) return <SettingsLayout loading paused={waiting.every((read) => read.fetchStatus === 'paused')} />;

  return (
    <SettingsLayout>
      {failed ? (
        <QueryError error={failed.error} onRetry={() => void Promise.all([detail.refetch(), settings.refetch()])} />
      ) : (
        detail.data &&
        settings.data && (
          <>
            <p className={`meta-line ${styles.intro}`}>
              {t(!online ? 'settings.offline' : settings.data.canEdit ? 'settings.intro' : 'settings.readOnly')}
            </p>
            <FamilyName family={detail.data} editable={editable} />
            <SettingsSections familyId={family.id} view={settings.data} editable={editable} />
            <Units family={detail.data} editable={editable} />
            <Advanced familyId={family.id} view={settings.data} editable={editable} />
            {family.role === 'family_admin' && (
              <div className={danger.dangerZone}>
                <Link to="/profile/family/delete" search={{ family: family.id }} className={`text-button wide ${danger.dangerOutline}`}>
                  {t('settings.deleteFamily')}
                </Link>
              </div>
            )}
          </>
        )
      )}
    </SettingsLayout>
  );
}

function FamilyName({ family, editable }: { family: FamilyDetailView; editable: boolean }) {
  const t = useT();
  const { api } = useQueryDeps();
  const [name, setName] = useState(family.name);
  const rename = useAreaMutation('family.rename', family.id, (value: string) => api.family.rename({ familyId: family.id, name: value }));
  useEffect(() => {
    if (!rename.isPending) setName(family.name);
  }, [family.name, rename.isPending]);
  const save = () => {
    if (!name.trim() || name.trim() === family.name) return setName(family.name);
    rename.mutate(name, { onError: () => setName(family.name) });
  };
  return (
    <section className="settings-card">
      <label className="field">
        {t('settings.name')}
        <input type="text" maxLength={NAME_MAX} value={name} disabled={!editable || rename.isPending} onChange={(event) => setName(event.target.value)} onBlur={save} />
      </label>
      <WriteError mutation={rename} />
    </section>
  );
}

function SettingsSections({ familyId, view, editable }: { familyId: string; view: SettingsView; editable: boolean }) {
  const t = useT();
  const { api } = useQueryDeps();
  const setMeal = useAreaMutation('family.setMeal', familyId, ({ mealType, weekday, slot }: SlotChange) => api.family.setMeal({ familyId, mealType, weekday, ...slot }));
  const addRule = useAreaMutation('family.addRule', familyId, (rule: MealRule) => api.family.addRule({ familyId, rule }));
  const removeRule = useAreaMutation('family.removeRule', familyId, (rule: MealRule) => api.family.removeRule({ familyId, rule }));
  const restrict = useAreaMutation('family.setIngredientRestriction', familyId, (change: RestrictionChange) => api.family.setIngredientRestriction({ familyId, ...change }));
  const setBook = useAreaMutation('family.setBookOwned', familyId, (input: { bookId: string; owned: boolean }) => api.family.setBookOwned({ familyId, ...input }));
  const rulesBusy = addRule.isPending || removeRule.isPending;

  return (
    <>
      <section className="settings-card" aria-labelledby="diners-title">
        <h2 id="diners-title">{t('settings.diners')}</h2>
        <p className="meta-line">{t('settings.dinersHint')}</p>
        <DinersGrid
          slots={view.settings.slots}
          editable={editable}
          pending={setMeal.isPending ? setMeal.variables : null}
          error={setMeal.isError ? setMeal.error : null}
          onChange={(change) => setMeal.mutate(change)}
        />
        <WriteError mutation={setMeal} />
      </section>

      <section className="settings-card" aria-labelledby="rules-title">
        <h2 id="rules-title">{t('settings.rules')}</h2>
        <MealRules rules={view.settings.rules} editable={editable} busy={rulesBusy} onAdd={(rule) => addRule.mutate(rule)} onRemove={(rule) => removeRule.mutate(rule)} />
        {rulesBusy && <p className="meta-line" role="status">{t('settings.saving')}</p>}
        <WriteError mutation={addRule} />
        <WriteError mutation={removeRule} />
      </section>

      <section className="settings-card" aria-labelledby="ingredients-title">
        <h2 id="ingredients-title">{t('settings.ingredients')}</h2>
        <IngredientRestrictions familyId={familyId} rows={view.restrictions} editable={editable} pending={restrict.isPending ? restrict.variables : null} onChange={(change) => restrict.mutate(change)} />
        <WriteError mutation={restrict} />
      </section>

      <section className="settings-card" aria-labelledby="books-title">
        <h2 id="books-title">{t('settings.books')}</h2>
        <p className="meta-line">{t('settings.booksHint')}</p>
        {view.books.map((book) => {
          const sending = setBook.isPending && setBook.variables.bookId === book.id;
          return (
            <label key={book.id} className="choice">
              <input
                type="checkbox"
                checked={sending ? setBook.variables.owned : book.owned}
                disabled={!editable || setBook.isPending}
                onChange={(event) => setBook.mutate({ bookId: book.id, owned: event.target.checked })}
              />
              {book.title}
            </label>
          );
        })}
        <WriteError mutation={setBook} />
      </section>
    </>
  );
}

function Units({ family, editable }: { family: FamilyDetailView; editable: boolean }) {
  const t = useT();
  const { api } = useQueryDeps();
  const setSystem = useAreaMutation('family.setMeasurementSystem', family.id, (measurementSystem: FamilyDetailView['measurementSystem']) =>
    api.family.setMeasurementSystem({ familyId: family.id, measurementSystem })
  );
  const setZone = useAreaMutation('family.setTimeZone', family.id, (timeZone: string) => api.family.setTimeZone({ familyId: family.id, timeZone }));
  const system = setSystem.isPending ? setSystem.variables : family.measurementSystem;
  const zone = setZone.isPending ? setZone.variables : family.timeZone;
  const zones = timeZones(zone);
  return (
    <section className="settings-card" aria-labelledby="units-title">
      <h2 id="units-title">{t('settings.units')}</h2>
      {(['metric', 'uk_imperial'] as const).map((option) => (
        <label key={option} className="choice">
          <input type="radio" name="units" checked={system === option} disabled={!editable || setSystem.isPending} onChange={() => setSystem.mutate(option)} />
          {t(`settings.units.${option}`)}
        </label>
      ))}
      <WriteError mutation={setSystem} />
      <label className={`field ${styles.zone}`}>
        {t('settings.timeZone')}
        <select value={zone} disabled={!editable || setZone.isPending} onChange={(event) => setZone.mutate(event.target.value)}>
          {zones.map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}
        </select>
      </label>
      <WriteError mutation={setZone} />
    </section>
  );
}

/** The IANA zones of the browser, with the family's one even if the browser does not list it. */
function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return all.includes(current) ? all : [current, ...all];
}

function Advanced({ familyId, view, editable }: { familyId: string; view: SettingsView; editable: boolean }) {
  const t = useT();
  const { api } = useQueryDeps();
  const setKnownNew = useAreaMutation('family.setKnownNew', familyId, (value: KnownNew) => api.family.setKnownNew({ familyId, ...value }));
  const setRange = useAreaMutation('family.setGroupRange', familyId, (input: { group: FoodGroup; min: number; max: number }) => api.family.setGroupRange({ familyId, ...input }));
  const knownNew = setKnownNew.isPending ? setKnownNew.variables : view.settings.knownNew;
  const change = (patch: Partial<KnownNew>) => setKnownNew.mutate({ ...knownNew, ...patch });
  const quotaBusy = !editable || setKnownNew.isPending;

  return (
    <details className={`settings-card ${styles.advanced}`}>
      <summary><h2>{t('settings.advanced')}</h2></summary>
      <h3>{t('settings.knownNew')}</h3>
      <p className="meta-line">{t('settings.knownNewHint')}</p>
      <Stepper label={t('settings.known')} value={knownNew.known} max={KNOWN_NEW_MAX} disabled={quotaBusy} onChange={(known) => change({ known })} />
      <Stepper label={t('settings.new')} value={knownNew.new} max={KNOWN_NEW_MAX} disabled={quotaBusy} onChange={(fresh) => change({ new: fresh })} />
      <Stepper label={t('settings.tolerance')} value={knownNew.tolerance} max={KNOWN_NEW_MAX} disabled={quotaBusy} onChange={(tolerance) => change({ tolerance })} />
      <WriteError mutation={setKnownNew} />
      <h3>{t('settings.groups')}</h3>
      <p className="meta-line">{t('settings.groupsHint')}</p>
      <ul className={`row-list ${styles.groups}`}>
        {FOOD_GROUPS.map((group) => {
          const range = setRange.isPending && setRange.variables.group === group ? setRange.variables : view.settings.groupRanges[group];
          const busy = !editable || setRange.isPending;
          return (
            <li key={group}>
              <span className="row-main">
                {t(`food.${group}`)}
                <small>{t('settings.groupDefault', { min: CREA_RANGES[group].min, max: CREA_RANGES[group].max })}</small>
              </span>
              <div className={styles.range}>
                <Stepper label={t('settings.min')} value={range.min} max={range.max} disabled={busy} onChange={(min) => setRange.mutate({ group, min, max: range.max })} />
                <Stepper label={t('settings.max')} value={range.max} min={range.min} max={GROUP_MAX} disabled={busy} onChange={(max) => setRange.mutate({ group, min: range.min, max })} />
              </div>
            </li>
          );
        })}
      </ul>
      <WriteError mutation={setRange} />
    </details>
  );
}
