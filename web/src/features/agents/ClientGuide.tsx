import { Icon } from '../../components/Icon';
import { useT } from '../../i18n/LocaleProvider';
import { CLIENT_GUIDES, CLIENT_ORDER } from './clientGuides';
import { CopyField } from './CopyField';
import styles from './AgentsPage.module.css';

/** The four clients as an accordion (round 6 review), numbered steps with commands to copy. */
export function ClientGuide({ url }: { url: string }) {
  const t = useT();
  return (
    <div className={styles.accordion}>
      {CLIENT_ORDER.map((key) => {
        const guide = CLIENT_GUIDES[key];
        return (
          <details key={key}>
            <summary>{t(guide.name)}<Icon name="chevron-right" /></summary>
            <ol className={styles.steps}>
              {guide.steps.map((step) => (
                <li key={step.text}>
                  {t(step.text)}
                  {step.command && <CopyField value={step.command(url)} label={t(guide.name)} />}
                </li>
              ))}
            </ol>
            {guide.unverified && <p className={styles.note}>{t('agents.unverified')}</p>}
          </details>
        );
      })}
    </div>
  );
}
