import type { DeletionFamily, DeletionInput, DeletionPlan } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';
import { memberName, openLinksOf, revokeLinksOf, type FakeFamilyData } from './family';

interface Deps {
  data: FakeFamilyData;
  familyId: string;
  userId: string;
  displayName: () => string;
  /** Families created in this session: the person is their only member. */
  createdFamilies: () => { id: string; name: string }[];
  removeCreatedFamily: (id: string) => void;
  isLastAppAdmin: () => boolean;
  connectedAgents: () => number;
  delayed: <T>(value: T) => Promise<T>;
  bump: () => void;
}

/** The plan of app.account_deletion_plan for the demo family and the families created in the session. */
export function fakeDeletionPlan(deps: Deps): DeletionPlan {
  const { data } = deps;
  const families: DeletionFamily[] = [];
  const me = data.members.find((m) => m.id === deps.userId);
  if (me && !data.deleted) {
    const others = data.members.filter((m) => m.id !== deps.userId);
    const outcome = others.length === 0 ? 'deleted' : me.role === 'family_admin' && !others.some((m) => m.role === 'family_admin') ? 'needs_successor' : 'stays';
    const self = { id: deps.userId, displayName: deps.displayName };
    const candidates = outcome === 'needs_successor'
      ? others.map((m) => ({ userId: m.id, displayName: memberName(m, self) })).sort((a, b) => a.displayName.localeCompare(b.displayName))
      : [];
    families.push({ familyId: deps.familyId, name: data.name, outcome, candidates });
  }
  for (const created of deps.createdFamilies()) families.push({ familyId: created.id, name: created.name, outcome: 'deleted', candidates: [] });
  return { families, lastAppAdmin: deps.isLastAppAdmin(), openInvitations: openLinksOf(data, deps.userId), pending: false };
}

/** Deleting one's own account in the fake mode (spec W11): the rules of begin_account_deletion. */
export function createFakeAccount(deps: Deps): Api['account'] {
  return {
    async getDeletionPlan() {
      return deps.delayed({ ...fakeDeletionPlan(deps), connectedAgents: deps.connectedAgents() });
    },
    async delete({ successors, deletedFamilies }: DeletionInput) {
      const plan = fakeDeletionPlan(deps);
      if (plan.lastAppAdmin) throw new ApiError('last_app_admin');
      const deleted = plan.families.filter((f) => f.outcome === 'deleted').map((f) => f.familyId).sort();
      if (JSON.stringify(deleted) !== JSON.stringify([...new Set(deletedFamilies)].sort())) throw new ApiError('conflict');
      for (const family of plan.families.filter((f) => f.outcome === 'needs_successor')) {
        if (!family.candidates.some((c) => c.userId === successors[family.familyId])) {
          throw new ApiError('invalid', { issues: [{ path: ['successors'], code: 'successor' }] });
        }
      }
      const { data } = deps;
      for (const family of plan.families) {
        if (family.familyId === deps.familyId) {
          if (family.outcome === 'deleted') data.deleted = true;
          const successor = data.members.find((m) => m.id === successors[family.familyId]);
          if (family.outcome === 'needs_successor' && successor) successor.role = 'family_admin';
          revokeLinksOf(data, deps.userId);
          data.members = data.members.filter((m) => m.id !== deps.userId);
        } else deps.removeCreatedFamily(family.familyId);
      }
      deps.bump();
      return deps.delayed({ completed: true });
    }
  } as Api['account'];
}
