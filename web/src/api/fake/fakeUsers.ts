import { USERS_LIST_LIMIT, type GlobalRole, type UserDetail, type UserRow } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';
import { DEMO_PEOPLE } from './seed';

type Area = Api['users'];
type FamilyRole = 'family_admin' | 'member';
interface Person { id: string; displayName: () => string; email: string; roles: GlobalRole[]; family: FamilyRole | null }

/** The account born from an invitation revoked after the reservation: no roles, no family (delivery of A). */
export const FAKE_GUEST_ID = '00000000-0000-4000-8000-00000000a5e1';
/** The server's order: jsonb_agg(role order by role). */
const ROLE_ORDER: GlobalRole[] = ['app_admin', 'recipe_curator'];
const sorted = (roles: Iterable<GlobalRole>) => ROLE_ORDER.filter((role) => [...roles].includes(role));

/** Users and global roles of the fake mode (spec W10): the server's rules, in memory. */
export function createFakeUsers(options: {
  self: { id: string; displayName: () => string; email: string; roles: GlobalRole[]; family: FamilyRole };
  familyName: () => string;
  latencyMs?: number;
}) {
  const people: Person[] = [
    { ...options.self, roles: sorted(options.self.roles) },
    ...DEMO_PEOPLE.filter((p) => p.id !== options.self.id).map((p) => ({ id: p.id, displayName: () => p.displayName, email: p.email, roles: [] as GlobalRole[], family: p.role })),
    { id: FAKE_GUEST_ID, displayName: () => 'Ospite', email: 'ospite@example.com', roles: [], family: null }
  ];
  const delayed = async <T,>(value: T): Promise<T> => {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return structuredClone(value);
  };
  const self = people[0]!;
  /** As the database functions: the signed-in person must be an app admin at the moment of the call. */
  const guard = () => {
    if (!self.roles.includes('app_admin')) throw new ApiError('forbidden');
  };
  const row = (p: Person): UserRow => ({ id: p.id, displayName: p.displayName(), email: p.email, roles: [...p.roles], deletion: null });
  const find = (id: string) => {
    const person = people.find((p) => p.id === id);
    if (!person) throw new ApiError('not_found');
    return person;
  };
  const admins = () => people.filter((p) => p.roles.includes('app_admin'));
  const detail = (p: Person): UserDetail => ({
    user: { ...row(p), lastAppAdmin: p.roles.includes('app_admin') && admins().length === 1 },
    families: p.family ? [{ name: options.familyName(), role: p.family }] : []
  });
  const area = {
    async list({ query }: { query?: string }) {
      guard();
      const text = (query ?? '').trim().toLowerCase();
      const found = people
        .filter((p) => !text || p.displayName().toLowerCase().includes(text) || p.email.toLowerCase().includes(text))
        .sort((a, b) => a.displayName().toLowerCase().localeCompare(b.displayName().toLowerCase()) || a.id.localeCompare(b.id));
      return delayed({ users: found.slice(0, USERS_LIST_LIMIT).map(row), more: found.length > USERS_LIST_LIMIT });
    },
    async get({ id }: { id: string }) {
      guard();
      return delayed(detail(find(id)));
    },
    async setRole({ id, role, granted }: { id: string; role: GlobalRole; granted: boolean }) {
      guard();
      const person = find(id);
      if (!granted && role === 'app_admin' && person.roles.includes('app_admin') && admins().length === 1) throw new ApiError('last_app_admin');
      person.roles = sorted(granted ? [...person.roles, role] : person.roles.filter((r) => r !== role));
      return delayed(detail(person));
    }
  } as unknown as Area;
  return {
    area,
    rolesOf: (id: string) => [...(people.find((p) => p.id === id)?.roles ?? [])],
    hasEmail: (email: string) => people.some((p) => p.email.toLowerCase() === email.trim().toLowerCase())
  };
}
