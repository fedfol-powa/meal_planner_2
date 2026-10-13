import type { AppInvitationView, GlobalRole } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';

type Area = Api['appInvitations'];
type Stored = Omit<AppInvitationView, 'status'> & { status: 'pending' | 'accepted' | 'revoked'; token: string };

/** A valid link of the fake mode: /invite/app#ddd…x shows the page without the stack. */
export const FAKE_INVITE_TOKEN = 'demo'.padEnd(43, 'x');
const DEMO_EMAIL = 'ospite@example.com';
const DAY = 24 * 60 * 60 * 1000;

const stores = new WeakMap<object, Map<string, Stored>>();

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const view = ({ token: _token, ...row }: Stored): AppInvitationView => ({
  ...row,
  status: row.status === 'pending' && Date.parse(row.expiresAt) <= Date.now() ? 'expired' : row.status
});
const usable = (row: Stored | undefined): row is Stored => row !== undefined && view(row).status === 'pending';

/** The app invitations of the fake mode (spec W9): the server's rules, in memory. */
export function createFakeAppInvitations(latencyMs = 0) {
  const rows = new Map<string, Stored>();
  const now = new Date();
  rows.set('demo', {
    id: '00000000-0000-4000-8000-00000000d0e1', email: DEMO_EMAIL, roles: [], status: 'pending', token: FAKE_INVITE_TOKEN,
    createdBy: 'user-federico', createdByName: 'Federico', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * DAY).toISOString(),
    acceptedByName: null, acceptedAt: null, revokedAt: null
  });
  const delayed = async <T,>(value: T): Promise<T> => {
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    return structuredClone(value);
  };
  const byId = (id: string) => [...rows.values()].find((row) => row.id === id);
  const byToken = (value: string) => [...rows.values()].find((row) => row.token === value);
  const area = {
    async create({ id, email, roles }: { id: string; email: string; roles: GlobalRole[] }) {
      const normalized = email.trim().toLowerCase();
      const existing = byId(id);
      const link = token();
      if (existing) {
        if (existing.status !== 'pending' || existing.email !== normalized) throw new ApiError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
        existing.token = link;
      } else {
        for (const row of rows.values()) if (row.email === normalized && row.status === 'pending') Object.assign(row, { status: 'revoked', revokedAt: new Date().toISOString() });
        const created = new Date();
        rows.set(id, {
          id, email: normalized, roles: [...roles], status: 'pending', token: link, createdBy: 'user-federico', createdByName: 'Federico',
          createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + 7 * DAY).toISOString(), acceptedByName: null, acceptedAt: null, revokedAt: null
        });
      }
      return delayed({ invitation: view(byId(id)!), url: `${location.origin}/invite/app#${link}` });
    },
    async list(_input: Record<string, never>) {
      return delayed({ invitations: [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view) });
    },
    async revoke({ id }: { id: string }) {
      const row = byId(id);
      if (!row) throw new ApiError('not_found');
      if (row.status === 'accepted') throw new ApiError('not_allowed', { reason: 'already_accepted' });
      if (row.status === 'pending') Object.assign(row, { status: 'revoked', revokedAt: new Date().toISOString() });
      return delayed({ invitation: view(row) });
    },
    async get({ token: value }: { token: string }) {
      const row = byToken(value);
      if (!usable(row)) throw new ApiError('invitation_unavailable');
      return delayed({ invitedBy: row.createdByName, roles: row.roles });
    },
    async accept({ token: value, email, displayName }: { token: string; email: string; displayName: string; password: string; locale: string }) {
      const row = byToken(value);
      if (!usable(row)) throw new ApiError('invitation_unavailable');
      if (row.email !== email.trim().toLowerCase()) throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] });
      Object.assign(row, { status: 'accepted', acceptedAt: new Date().toISOString(), acceptedByName: displayName });
      return delayed({ email: row.email });
    }
  };
  stores.set(area, rows);
  return area;
}

type FakeArea = ReturnType<typeof createFakeAppInvitations>;
/** Tests: moves the expiry of an invitation into the past. */
export function expireFakeInvitation(area: FakeArea | Area, id: string): void {
  const row = [...(stores.get(area)?.values() ?? [])].find((r) => r.id === id);
  if (row) row.expiresAt = new Date(Date.now() - 1000).toISOString();
}
/** Tests: the valid link token of an invitation. */
export function fakeTokenOf(area: FakeArea | Area, id: string): string {
  const row = [...(stores.get(area)?.values() ?? [])].find((r) => r.id === id);
  if (!row) throw new Error(`no fake invitation ${id}`);
  return row.token;
}
