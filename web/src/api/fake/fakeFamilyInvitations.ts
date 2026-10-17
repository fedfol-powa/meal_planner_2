import { FAMILY_INVITATION_ACCOUNT_LIMIT, type FamilyInvitationView } from '@app/contract';
import { ApiError } from '../errors';
import type { Api, ProfileView } from '../types';
import { memberName, type FakeFamilyData, type FakeLink } from './family';

export { FAKE_FAMILY_EXPIRED_TOKEN, FAKE_FAMILY_INVITE_TOKEN, FAKE_FAMILY_REVOKED_TOKEN } from './family';

const DAY = 24 * 60 * 60 * 1000;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface Deps {
  data: FakeFamilyData;
  familyId: string;
  userId: string;
  displayName: () => string;
  profile: () => ProfileView;
  /** The family becomes the one shown. */
  show: (familyId: string) => void;
  accountExists: (email: string) => boolean;
  delayed: <T>(value: T) => Promise<T>;
  bump: () => void;
}

/** The family invitations of the fake mode (spec W11): the database's rules, in memory. */
export function createFakeFamilyInvitations(deps: Deps) {
  const { data } = deps;
  const self = { id: deps.userId, displayName: deps.displayName };
  const usable = (link: FakeLink | undefined): link is FakeLink => !!link && !link.revokedAt && Date.parse(link.expiresAt) > Date.now();
  const byToken = (token: string) => (data.deleted ? undefined : data.links.find((l) => l.token === token));
  const isMember = (userId: string) => data.members.some((m) => m.id === userId);
  const nameOf = (userId: string) => {
    const member = data.members.find((m) => m.id === userId);
    return member ? memberName(member, self) : null;
  };
  const removedAfter = (link: FakeLink, userId: string) => data.removals.some((r) => r.userId === userId && r.at >= link.createdAt);
  const admin = (familyId: string) => {
    if (familyId !== deps.familyId || data.deleted || data.members.find((m) => m.id === deps.userId)?.role !== 'family_admin') throw new ApiError('forbidden');
  };
  const view = (link: FakeLink): FamilyInvitationView => ({
    id: link.id, createdBy: link.createdBy, createdByName: nameOf(link.createdBy), createdAt: link.createdAt, expiresAt: link.expiresAt,
    registrations: link.registrations.length,
    pendingRegistrations: link.registrations.filter((r) => r.status === 'reserved').length,
    expired: Date.parse(link.expiresAt) <= Date.now()
  });
  const listed = () =>
    data.links
      .filter((l) => !l.revokedAt && (Date.parse(l.expiresAt) > Date.now() || l.registrations.some((r) => r.status === 'reserved')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(view);
  const addMember = (link: FakeLink, userId: string, mode: 'new_account' | 'existing_account', displayName?: string) => {
    const now = new Date().toISOString();
    data.members.push({ id: userId, role: 'member', joinedAt: now, ...(displayName ? { displayName } : {}) });
    data.known.add(userId);
    data.joins.push({ joinedAt: now, mode, userId, invitationId: link.id });
    deps.bump();
  };

  const area = {
    async list({ familyId }: { familyId: string }) {
      admin(familyId);
      return deps.delayed({ invitations: listed() });
    },
    async create({ familyId, id }: { familyId: string; id: string }) {
      admin(familyId);
      const token = newToken();
      const existing = data.links.find((l) => l.id === id);
      if (existing) {
        if (existing.revokedAt || existing.createdBy !== deps.userId) throw new ApiError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
        existing.token = token;
      } else {
        const now = Date.now();
        data.links.push({ id, token, createdBy: deps.userId, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * DAY).toISOString(), revokedAt: null, registrations: [] });
      }
      return deps.delayed({ invitation: view(data.links.find((l) => l.id === id)!), url: `${location.origin}/invite#${token}` });
    },
    async revoke({ familyId, id }: { familyId: string; id: string }) {
      admin(familyId);
      const link = data.links.find((l) => l.id === id);
      if (!link) throw new ApiError('not_found');
      link.revokedAt ??= new Date().toISOString();
      return deps.delayed({ invitations: listed() });
    },
    async listJoins({ familyId }: { familyId: string }) {
      admin(familyId);
      const joins = [...data.joins]
        .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
        .slice(0, 50)
        .map((j) => {
          const link = data.links.find((l) => l.id === j.invitationId)!;
          return { joinedAt: j.joinedAt, mode: j.mode, userName: nameOf(j.userId), invitationId: j.invitationId, invitationCreatedByName: nameOf(link.createdBy), invitationCreatedAt: link.createdAt };
        });
      return deps.delayed({ joins });
    },
    async get({ token }: { token: string }) {
      const link = byToken(token);
      if (!usable(link)) throw new ApiError('invitation_unavailable');
      return deps.delayed({ familyName: data.name, invitedBy: nameOf(link.createdBy), accountsAvailable: link.registrations.length < FAMILY_INVITATION_ACCOUNT_LIMIT });
    },
    async status({ token }: { token: string }) {
      const link = byToken(token);
      if (!link) throw new ApiError('invitation_unavailable');
      const alreadyMember = isMember(deps.userId);
      if (!alreadyMember && (!usable(link) || removedAfter(link, deps.userId))) throw new ApiError('invitation_unavailable');
      return deps.delayed({ familyId: deps.familyId, familyName: data.name, invitedBy: nameOf(link.createdBy), alreadyMember });
    },
    async accept({ token, email, displayName }: { token: string; email: string; displayName: string; locale: string }) {
      const normalized = email.trim().toLowerCase();
      const link = byToken(token);
      const reserved = link?.registrations.find((r) => r.email === normalized);
      // A terminal reservation answers as it is, without writing.
      if (reserved) return deps.delayed({ email: normalized, joined: reserved.status === 'joined', passwordEmail: 'not_sent' as const });
      if (!usable(link)) throw new ApiError('invitation_unavailable');
      if (deps.accountExists(normalized)) throw new ApiError('not_allowed', { reason: 'account_exists' });
      if (link.registrations.length >= FAMILY_INVITATION_ACCOUNT_LIMIT) throw new ApiError('invitation_unavailable');
      link.registrations.push({ email: normalized, status: 'joined' });
      addMember(link, `user-${crypto.randomUUID()}`, 'new_account', displayName.trim());
      return deps.delayed({ email: normalized, joined: true, passwordEmail: 'sent' as const });
    },
    /** The fake mode sends no email: «Rimanda l'email» always answers `sent` (spec W15). */
    async resendPasswordEmail(_input: { token: string; email: string; locale: string }) {
      return deps.delayed({ passwordEmail: 'sent' as const });
    }
  } as unknown as Api['familyInvitations'];

  /** family.join: with an existing account, the family becomes the one shown. */
  async function join({ token }: { token: string }) {
    const link = byToken(token);
    if (!link) throw new ApiError('invitation_unavailable');
    if (!isMember(deps.userId)) {
      if (!usable(link) || removedAfter(link, deps.userId)) throw new ApiError('invitation_unavailable');
      addMember(link, deps.userId, 'existing_account', deps.displayName());
    }
    deps.show(deps.familyId);
    return deps.delayed(deps.profile());
  }

  return { area, join };
}
