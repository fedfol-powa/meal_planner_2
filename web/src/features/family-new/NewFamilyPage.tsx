import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { errorKey } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { Icon } from '../../components/Icon';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import styles from './NewFamilyPage.module.css';

const route = getRouteApi('/_app/family/new');

type Units = 'metric' | 'uk_imperial';

/** The time zone of this browser; the server falls back to Europe/Rome when it is missing or unknown. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Minimal wizard of a new family (spec W9, round 4): name and units; the rest from the settings. */
export function NewFamilyPage() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const online = useOnline();
  const profile = useProfile();
  const navigate = useNavigate();
  const { granted } = route.useSearch();
  // Made at opening: a double tap or a repeat never creates two families.
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [units, setUnits] = useState<Units>(locale === 'en-GB' ? 'uk_imperial' : 'metric');
  const create = useAreaMutation('family.create', undefined, (input: { id: string; name: string; measurementSystem: Units; timeZone?: string }) =>
    deps.api.family.create(input)
  );
  const hasFamilies = (profile.data?.families.length ?? 0) > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !online) return;
    const timeZone = browserTimeZone();
    create.mutate(
      { id, name: name.trim(), measurementSystem: units, ...(timeZone ? { timeZone } : {}) },
      { onSuccess: () => void navigate({ to: '/menu', search: { welcome: true }, replace: true }) }
    );
  }

  const back = hasFamilies ? (
    <Link to="/profile" className="page-back"><Icon name="chevron-left" />{t('nav.profile')}</Link>
  ) : (
    <Link to="/menu" className="page-back"><Icon name="chevron-left" />{t('nav.menu')}</Link>
  );

  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={back} title={t('onboarding.title')} />
        {granted && <p className={styles.granted} role="status">{t('invite.rolesGranted', { roles: granted.map((role) => t(`role.${role}`)).join(', ') })}</p>}
        <form onSubmit={submit}>
          <label className="field">
            {t('onboarding.name')}
            <input type="text" maxLength={60} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className={styles.units}>
            <legend>{t('onboarding.units')}</legend>
            {(['metric', 'uk_imperial'] as const).map((option) => (
              <label key={option} className={styles.option}>
                <input type="radio" name="units" value={option} checked={units === option} onChange={() => setUnits(option)} />
                {t(option === 'metric' ? 'onboarding.metric' : 'onboarding.ukImperial')}
              </label>
            ))}
          </fieldset>
          <p className="meta-line">{t('onboarding.later')}</p>
          {create.isError && <p className="form-error" role="alert">{t(errorKey(create.error))}</p>}
          <button type="submit" className="text-button primary wide" disabled={!name.trim() || !online || create.isPending}>{t('onboarding.create')}</button>
        </form>
      </div>
    </section>
  );
}
