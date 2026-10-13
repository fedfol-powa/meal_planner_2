import { createFakeAppInvitations } from '../../api/fake/fakeAppInvitations';
import { createRpcClient } from '../../api/rpc';
import { env } from '../../env';

type Public = Pick<ReturnType<typeof createFakeAppInvitations>, 'get' | 'accept'>;

/** The link's operations, without a session (spec W9): no token is ever sent. */
function defaultClient(): Public {
  if (!env.supabase) return createFakeAppInvitations(150);
  return createRpcClient({ getCredentials: async () => null }).appInvitations;
}

export let invitationClient: Public = defaultClient();
/** Tests replace it, like `leavePage` in the agents' feature. */
export function setInvitationClient(client: Public): void {
  invitationClient = client;
}
