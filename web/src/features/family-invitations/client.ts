import { createFakeFamilyInvitations } from '../../api/fake/fakeFamilyInvitations';
import { createFakeFamilyData } from '../../api/fake/family';
import { DEMO_FAMILY } from '../../api/fake/seed';
import { createRpcClient } from '../../api/rpc';
import type { Api } from '../../api/types';
import { env } from '../../env';

type Public = Pick<Api['familyInvitations'], 'get' | 'accept'>;

/** The fake mode's link without a session: the demo family's links, in memory. */
function fakeClient(): Public {
  const anonymous = 'anonymous';
  const { area } = createFakeFamilyInvitations({
    data: createFakeFamilyData(),
    familyId: DEMO_FAMILY.id,
    userId: anonymous,
    displayName: () => '',
    profile: () => {
      throw new Error('no profile without a session');
    },
    show: () => undefined,
    accountExists: () => false,
    delayed: async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return structuredClone(value);
    },
    bump: () => undefined
  });
  return { get: area.get, accept: area.accept };
}

/** The link's operations without a session (spec W11): no token is ever sent. */
function defaultClient(): Public {
  if (!env.supabase) return fakeClient();
  return createRpcClient({ getCredentials: async () => null }).familyInvitations;
}

export let familyInvitationClient: Public = defaultClient();
/** Tests replace it, like the client of the app invitations. */
export function setFamilyInvitationClient(client: Public): void {
  familyInvitationClient = client;
}
