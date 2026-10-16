import { queryOptions, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { FAMILY_INVITATION_ACCOUNT_LIMIT, type FamilyInvitationView } from '@app/contract';
import { errorKey, isBlocking, toApiError } from '../../api/errors';
import { familyQuery } from '../../api/family';
import { useAreaMutation } from '../../api/mutations';
import { queryKeys, useQueryDeps, type QueryDeps } from '../../api/queries';
import type { FamilyDetailView, FamilyRole, FamilyView, ProfileView } from '../../api/types';
import { BottomSheet } from '../../components/BottomSheet';
import { FamilyGate } from '../../components/FamilyGate';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { CopyField } from '../../features/agents/CopyField';
import { useSession } from '../../session/SessionScope';
import { BackToProfile } from './BackToProfile';
import danger from '../../components/Danger.module.css';
import styles from './MembersPage.module.css';

type Member = FamilyDetailView['members'][number];

/** Not versioned: read again after every creation, revocation, role change or removal (mutations.ts). */
const linksQuery = ({ api }: QueryDeps, familyId: string) =>
  queryOptions({ queryKey: ['familyInvitations', 'list', { familyId }] as const, queryFn: () => api.familyInvitations.list({ familyId }) });
const joinsQuery = ({ api }: QueryDeps, familyId: string) =>
  queryOptions({ queryKey: ['familyInvitations', 'listJoins', { familyId }] as const, queryFn: () => api.familyInvitations.listJoins({ familyId }) });

/**
 * Members, roles, invitation links and leaving (spec W11, «Membri e inviti»). No optimistic update:
 * every command waits for the server's answer, and every command is disabled offline.
 */
export function MembersPage() {
  // A new family shown (after leaving) is a new page: no sheet or choice carries over.
  return <FamilyGate>{(family) => <Members key={family.id} family={family} />}</FamilyGate>;
}

function Members({ family }: { family: FamilyView }) {
  const t = useT();
  const detail = useQuery(familyQuery(useQueryDeps(), family.id));
  let body;
  if (detail.isError && isBlocking(detail.error, !!detail.data)) body = <QueryError error={detail.error} onRetry={() => void detail.refetch()} />;
  else if (!detail.data) body = <Loading />;
  else body = <MembersContent view={detail.data} refetch={() => void detail.refetch()} />;
  return (
    <section className="secondary-view app-view" aria-labelledby="members-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('profile.members')} titleId="members-title" />
        {body}
      </div>
    </section>
  );
}

function MembersContent({ view, refetch }: { view: FamilyDetailView; refetch: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const online = useOnline();
  const isAdmin = view.myRole === 'family_admin';
  const links = useQuery({ ...linksQuery(deps, view.id), enabled: isAdmin });
  const [member, setMember] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Each opening of «Crea un link d'invito» is its own attempt with its own id.
  const [creating, setCreating] = useState<number | null>(null);
  const [revoking, setRevoking] = useState<FamilyInvitationView | null>(null);

  // Open links per author: only administrators read the list, and a member has no open links (decision 6).
  const counts = isAdmin ? (links.data ? countByAuthor(links.data.invitations) : null) : new Map<string, number>();
  const countOf = (userId: string) => counts?.get(userId) ?? 0;
  const me = view.members.find((m) => m.isMe);
  const admins = view.members.filter((m) => m.role === 'family_admin').map((m) => m.displayName);

  return (
    <>
      <section className="settings-card" aria-labelledby="list-title">
        <h2 id="list-title">{view.name}</h2>
        <ul className="row-list">
          {view.members.map((m) => (
            <li key={m.userId}>
              <span className="row-main">
                {m.isMe ? t('members.you', { name: m.displayName }) : m.displayName}
                <small>{t('members.since', { time: formatDayMonth(locale, m.joinedAt.slice(0, 10)) })}</small>
              </span>
              <span className={m.role === 'member' ? 'label-chip neutral' : 'label-chip'}>{t(`profile.role.${m.role}`)}</span>
              {isAdmin && !m.isMe && (
                <button type="button" className={styles.more} aria-label={t('members.actions', { name: m.displayName })} disabled={!online || counts === null} onClick={() => setMember(m)}>
                  <Icon name="more" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!isAdmin && <p className="meta-line">{t('members.askAdmin', { names: admins.join(', ') })}</p>}
      </section>

      {isAdmin && (
        <>
          <LinksCard view={view} links={links} onCreate={() => setCreating(Date.now())} onRevoke={setRevoking} />
          <JoinsCard view={view} />
        </>
      )}

      <div className={danger.dangerZone}>
        <button type="button" className={`text-button wide ${danger.dangerOutline}`} disabled={!online || counts === null} onClick={() => setLeaving(true)}>
          {t('members.leave')}
        </button>
      </div>

      {member && <MemberSheet familyId={view.id} member={member} links={countOf(member.userId)} onClose={() => setMember(null)} />}
      {leaving && <LeaveSheet view={view} myLinks={me ? countOf(me.userId) : 0} refetch={refetch} onClose={() => setLeaving(false)} />}
      {creating !== null && <CreateLinkSheet key={creating} familyId={view.id} familyName={view.name} onClose={() => setCreating(null)} />}
      {revoking && <RevokeSheet familyId={view.id} invitation={revoking} onClose={() => setRevoking(null)} />}
    </>
  );
}

function countByAuthor(invitations: FamilyInvitationView[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const invitation of invitations) if (invitation.createdBy) counts.set(invitation.createdBy, (counts.get(invitation.createdBy) ?? 0) + 1);
  return counts;
}

/** An instant in the family's time zone: «18 ottobre», or with the time for the joins. */
function useInstant(timeZone: string) {
  const { locale } = useLocale();
  return (iso: string, withTime = false) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone }).format(new Date(iso));
}

function LinksCard({ view, links, onCreate, onRevoke }: {
  view: FamilyDetailView;
  links: UseQueryResult<{ invitations: FamilyInvitationView[] }>;
  onCreate: () => void;
  onRevoke: (invitation: FamilyInvitationView) => void;
}) {
  const t = useT();
  const online = useOnline();
  const instant = useInstant(view.timeZone);
  return (
    <section className="settings-card" aria-labelledby="links-title">
      <h2 id="links-title">{t('familyLinks.title')}</h2>
      <p className="meta-line">{t('familyLinks.hint', { max: FAMILY_INVITATION_ACCOUNT_LIMIT })}</p>
      {links.isError && isBlocking(links.error, !!links.data) && <QueryError error={links.error} onRetry={() => void links.refetch()} />}
      {!links.data && !links.isError && <Loading />}
      {links.data && links.data.invitations.length > 0 && (
        <ul className="row-list">
          {links.data.invitations.map((invitation) => (
            <li key={invitation.id} className={styles.link}>
              <span className="row-main">
                {t('familyLinks.by', { name: invitation.createdByName ?? t('meal.formerMember') })}
                <small>
                  {invitation.expired
                    ? t('familyLinks.expiredPending', { count: invitation.pendingRegistrations })
                    : t('familyLinks.expires', { date: instant(invitation.expiresAt) })}
                </small>
                {invitation.registrations > 0 && <small>{t('familyLinks.registrations', { count: invitation.registrations })}</small>}
              </span>
              <button type="button" className={`text-button ${styles.small}`} disabled={!online} onClick={() => onRevoke(invitation)}>{t('familyLinks.revoke')}</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={`text-button primary ${styles.create}`} disabled={!online} onClick={onCreate}>
        <Icon name="link" />
        {t('familyLinks.create')}
      </button>
    </section>
  );
}

/** «Ingressi con i link» (decision 21): the latest joins, administrators only. */
function JoinsCard({ view }: { view: FamilyDetailView }) {
  const t = useT();
  const joins = useQuery(joinsQuery(useQueryDeps(), view.id));
  const instant = useInstant(view.timeZone);
  return (
    <section className="settings-card" aria-labelledby="joins-title">
      <h2 id="joins-title">{t('familyJoins.title')}</h2>
      {joins.isError && isBlocking(joins.error, !!joins.data) && <QueryError error={joins.error} onRetry={() => void joins.refetch()} />}
      {!joins.data && !joins.isError && <Loading />}
      {joins.data && joins.data.joins.length === 0 && <p className="meta-line">{t('familyJoins.empty')}</p>}
      {joins.data && joins.data.joins.length > 0 && (
        <ul className="row-list">
          {joins.data.joins.map((join) => (
            <li key={`${join.invitationId}:${join.joinedAt}`} className={styles.join}>
              <span className="row-main">
                {join.userName ?? t('meal.formerMember')}
                <small>{instant(join.joinedAt, true)}</small>
                <small>{t('familyJoins.via', { name: join.invitationCreatedByName ?? t('meal.formerMember'), date: instant(join.invitationCreatedAt) })}</small>
              </span>
              {join.mode === 'new_account' && <span className="label-chip">{t('familyJoins.newAccount')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** «Azioni per {nome}»: role and removal, with a confirmation when links stop or a person leaves. */
function MemberSheet({ familyId, member, links, onClose }: { familyId: string; member: Member; links: number; onClose: () => void }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const [step, setStep] = useState<'actions' | 'demote' | 'remove'>('actions');
  const setRole = useAreaMutation('family.setMemberRole', familyId, (role: FamilyRole) => api.family.setMemberRole({ familyId, userId: member.userId, role }));
  const remove = useAreaMutation('family.removeMember', familyId, (_: void) => api.family.removeMember({ familyId, userId: member.userId }));
  const busy = setRole.isPending || remove.isPending;
  const failure = setRole.error ?? remove.error;
  const name = member.displayName;
  const changeRole = (role: FamilyRole) => setRole.mutate(role, { onSuccess: onClose });
  const linksLine = links > 0 && <p>{t('members.linksStop', { count: links, name })}</p>;

  return (
    <BottomSheet open title={name} onClose={onClose}>
      {failure && (
        <p className="form-error" role="alert">
          {toApiError(failure).code === 'last_admin' ? t('members.lastAdmin') : t(errorKey(failure))}
        </p>
      )}
      {step === 'actions' && (
        <ul className="row-list">
          <li>
            {member.role === 'member' ? (
              <button type="button" className="row-link" disabled={!online || busy} onClick={() => changeRole('family_admin')}>{t('members.makeAdmin')}</button>
            ) : (
              // Demoting stops the person's links: then it asks first.
              <button type="button" className="row-link" disabled={!online || busy} onClick={() => (links > 0 ? setStep('demote') : changeRole('member'))}>{t('members.makeMember')}</button>
            )}
          </li>
          <li>
            <button type="button" className={`row-link ${styles.dangerText}`} disabled={!online || busy} onClick={() => setStep('remove')}>{t('members.remove')}</button>
          </li>
        </ul>
      )}
      {step === 'demote' && (
        <>
          {linksLine}
          <button type="button" className={`text-button primary wide ${styles.sheetButton}`} disabled={!online || busy} onClick={() => changeRole('member')}>{t('members.makeMember')}</button>
        </>
      )}
      {step === 'remove' && (
        <>
          <p>{t('members.removeBody', { name })}</p>
          {linksLine}
          <button type="button" className={`text-button wide ${danger.danger} ${styles.sheetButton}`} disabled={!online || busy} onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
            {t('members.removeConfirm', { name })}
          </button>
        </>
      )}
    </BottomSheet>
  );
}

/** «Esci da {famiglia}»: only member, last administrator with a successor, or plain leaving. */
function LeaveSheet({ view, myLinks, refetch, onClose }: { view: FamilyDetailView; myLinks: number; refetch: () => void; onClose: () => void }) {
  const t = useT();
  const ids = useId();
  const deps = useQueryDeps();
  const queryClient = useQueryClient();
  const online = useOnline();
  const navigate = useNavigate();
  const session = useSession();
  const [successor, setSuccessor] = useState<string | null>(null);
  // What the server said meanwhile: the family changed since this page was read.
  const [now, setNow] = useState<'alone' | 'successor' | null>(null);
  const leave = useAreaMutation('family.leave', view.id, (successorId: string | null) =>
    deps.api.family.leave(successorId ? { familyId: view.id, successorId } : { familyId: view.id })
  );
  const others = view.members.filter((m) => !m.isMe);
  const lastAdmin = view.myRole === 'family_admin' && !others.some((m) => m.role === 'family_admin');
  const mode = others.length === 0 || now === 'alone' ? 'alone' : now === 'successor' || lastAdmin ? 'successor' : 'plain';

  function leftTo(families: ProfileView['families']) {
    // The family's data leaves the device before the next page (spec W11, «Dati sul dispositivo»).
    session.revoke(view.id);
    void navigate({ to: families.some((f) => f.id !== view.id) ? '/profile' : '/menu' });
  }

  async function send() {
    try {
      const outcome = await leave.mutateAsync(mode === 'successor' ? successor : null);
      leftTo(outcome.view.families);
    } catch (error) {
      const failure = toApiError(error);
      const issues = (failure.data as { issues?: { path: (string | number)[] }[] } | undefined)?.issues ?? [];
      if (failure.code === 'invalid' && issues.some((issue) => issue.path[0] === 'successorId')) {
        // Another administrator left meanwhile: a successor is now needed (spec W11, finding 11).
        setNow('successor');
        setSuccessor(null);
        leave.reset();
        refetch();
      } else if (failure.code === 'sole_member') {
        setNow('alone');
        leave.reset();
        refetch();
      } else if (failure.code === 'forbidden') {
        // A repeat after a leaving whose answer was lost: no longer a member, so it is done.
        const profile = queryClient.getQueryData<ProfileView>(queryKeys.profile(deps.locale));
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
        leftTo(profile?.families ?? []);
      }
    }
  }

  const linksLine = myLinks > 0 && <p>{t('members.myLinksStop', { count: myLinks })}</p>;
  const failure = leave.error && toApiError(leave.error).code !== 'forbidden' ? leave.error : null;

  return (
    <BottomSheet open title={t('members.leaveTitle', { family: view.name })} onClose={onClose}>
      {failure && <p className="form-error" role="alert">{t(errorKey(failure))}</p>}
      {mode === 'alone' && (
        <>
          <p>{t('members.soleMember')}</p>
          <Link to="/profile/family/delete" search={{ family: view.id }} className={`text-button wide ${danger.dangerOutline}`}>
            {t('members.deleteFamily')}
          </Link>
        </>
      )}
      {mode === 'successor' && (
        <>
          <p>{t(now === 'successor' ? 'members.leaveSuccessorNow' : 'members.leaveSuccessor')}</p>
          {linksLine}
          <fieldset className={styles.successors}>
            <legend className="visually-hidden">{t('members.successor')}</legend>
            {others.map((m) => (
              <label key={m.userId} className="choice">
                <input type="radio" name={`${ids}-successor`} value={m.userId} checked={successor === m.userId} onChange={() => setSuccessor(m.userId)} />
                {m.displayName}
              </label>
            ))}
          </fieldset>
          <button type="button" className={`text-button wide ${danger.danger}`} disabled={!online || !successor || leave.isPending} onClick={() => void send()}>
            {t('members.leaveWithSuccessor')}
          </button>
        </>
      )}
      {mode === 'plain' && (
        <>
          <p>{t('members.leaveBody')}</p>
          {linksLine}
          <button type="button" className={`text-button wide ${danger.danger}`} disabled={!online || leave.isPending} onClick={() => void send()}>
            {t('members.leaveConfirm')}
          </button>
        </>
      )}
    </BottomSheet>
  );
}

/**
 * «Crea un link d'invito»: the id is born when the command opens, so a retry after a lost answer is
 * the same link (`create` is idempotent on the id). The link is shown only for this opening, as in A.
 */
function CreateLinkSheet({ familyId, familyName, onClose }: { familyId: string; familyName: string; onClose: () => void }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const id = useRef(crypto.randomUUID());
  const [link, setLink] = useState<string | null>(null);
  const create = useAreaMutation('familyInvitations.create', familyId, (_: void) => api.familyInvitations.create({ familyId, id: id.current }));
  const alive = useRef(true);
  const sent = useRef(false);

  async function send() {
    try {
      const outcome = await create.mutateAsync(undefined);
      if (outcome.applied && alive.current) setLink(outcome.view.url);
    } catch {
      // The error shows from the mutation's state, with «Riprova».
    }
  }

  useEffect(() => {
    alive.current = true;
    if (!sent.current) {
      sent.current = true;
      void send();
    }
    return () => {
      alive.current = false;
    };
    // Sent once per opening; the key of the sheet makes a new opening.
  }, []);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <BottomSheet open title={t('familyLinks.sheetTitle')} onClose={onClose}>
      {link ? (
        <>
          <CopyField value={link} label={t('familyLinks.sheetTitle')} />
          {canShare && (
            <button type="button" className="text-button wide" onClick={() => void navigator.share({ title: t('familyLinks.shareTitle', { family: familyName }), url: link }).catch(() => undefined)}>
              {t('familyLinks.share')}
            </button>
          )}
          <p className="meta-line">{t('familyLinks.once')}</p>
        </>
      ) : create.isError ? (
        <>
          <p className="form-error" role="alert">{t(errorKey(create.error))}</p>
          <button type="button" className="text-button primary wide" disabled={!online} onClick={() => void send()}>{t('familyLinks.retry')}</button>
        </>
      ) : (
        <Loading />
      )}
    </BottomSheet>
  );
}

function RevokeSheet({ familyId, invitation, onClose }: { familyId: string; invitation: FamilyInvitationView; onClose: () => void }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const revoke = useAreaMutation('familyInvitations.revoke', familyId, (_: void) => api.familyInvitations.revoke({ familyId, id: invitation.id }));
  return (
    <BottomSheet open title={t('familyLinks.revokeTitle')} onClose={onClose}>
      <p>{t('familyLinks.revokeBody')}</p>
      {revoke.isError && <p className="form-error" role="alert">{t(errorKey(revoke.error))}</p>}
      <button type="button" className={`text-button wide ${danger.danger}`} disabled={!online || revoke.isPending} onClick={() => revoke.mutate(undefined, { onSuccess: onClose })}>
        {t('familyLinks.revoke')}
      </button>
    </BottomSheet>
  );
}
