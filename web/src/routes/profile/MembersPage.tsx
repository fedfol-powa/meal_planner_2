import { useQuery } from '@tanstack/react-query';
import { isBlocking } from '../../api/errors';
import { familyQuery } from '../../api/family';
import { useQueryDeps } from '../../api/queries';
import type { FamilyView } from '../../api/types';
import { FamilyGate } from '../../components/FamilyGate';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from './BackToProfile';

/** Members of the family shown, read only: roles, removals and invitations arrive with wave 3. */
export function MembersPage() {
  return <FamilyGate>{(family) => <Members family={family} />}</FamilyGate>;
}

function Members({ family }: { family: FamilyView }) {
  const t = useT();
  return (
    <section className="secondary-view app-view" aria-labelledby="members-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('profile.members')} titleId="members-title" />
        <MemberList family={family} />
      </div>
    </section>
  );
}

function MemberList({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const detail = useQuery(familyQuery(useQueryDeps(), family.id));
  if (detail.isError && isBlocking(detail.error, !!detail.data)) return <QueryError error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data) return <Loading />;
  const { name, members, myRole } = detail.data;
  const admins = members.filter((m) => m.role === 'family_admin').map((m) => m.displayName);
  return (
    <section className="settings-card" aria-labelledby="list-title">
      <h2 id="list-title">{name}</h2>
      <ul className="row-list">
        {members.map((m) => (
          <li key={m.userId}>
            <span className="row-main">
              {m.isMe ? t('members.you', { name: m.displayName }) : m.displayName}
              <small>{t('members.since', { time: formatDayMonth(locale, m.joinedAt.slice(0, 10)) })}</small>
            </span>
            <span className={m.role === 'member' ? 'label-chip neutral' : 'label-chip'}>{t(`profile.role.${m.role}`)}</span>
          </li>
        ))}
      </ul>
      {myRole === 'member' && <p className="meta-line">{t('members.askAdmin', { names: admins.join(', ') })}</p>}
    </section>
  );
}
