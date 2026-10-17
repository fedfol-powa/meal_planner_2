import { DEMO_USER } from '../../auth/backend';
import { env } from '../../env';
import { trackBusy } from '../../pwa/busy';
import { savePassword, verifyLink, type LinkDeps, type SavePasswordResult, type VerifiedLink, type VerifyLinkResult } from './passwordLinkRequests';

/** The two requests of /password, direct to Auth (spec W15, «/password», points 4 and 6). */
export interface PasswordLinkClient {
  verify(tokenHash: string): Promise<VerifyLinkResult>;
  save(link: VerifiedLink, password: string): Promise<SavePasswordResult>;
}

export function createLinkClient(deps: LinkDeps): PasswordLinkClient {
  return { verify: (tokenHash) => verifyLink(deps, tokenHash), save: (link, password) => savePassword(deps, link, password) };
}

/** Fake mode (spec W15, «Testi e modalità finta»): `token_hash=demo` verifies and saves, nothing else does. */
export function createDemoLinkClient(): PasswordLinkClient {
  return {
    verify: async (tokenHash) => (tokenHash === 'demo' ? { ok: true, link: { email: DEMO_USER.email, accessToken: 'demo' } } : { ok: false, reason: 'invalid_link' }),
    save: async () => ({ ok: true })
  };
}

function defaultClient(): PasswordLinkClient {
  if (!env.supabase) return createDemoLinkClient();
  return createLinkClient({ url: env.supabase.url, publishableKey: env.supabase.publishableKey, fetch: (input, init) => fetch(input, init) });
}

export let linkClient: PasswordLinkClient = defaultClient();
/** Tests replace it, like the invitation pages' client. */
export function setLinkClient(client: PasswordLinkClient): void {
  linkClient = client;
}

/** Why the last save did not go through, while the token stays usable. */
export type SaveFailure = Exclude<SavePasswordResult, { ok: true }>['reason'];

/**
 * Where the page is with one link. In memory only, outside the component: a change of person on
 * this device (another tab signing in) remounts every page, and the code can be used once.
 */
export type LinkState =
  | { status: 'verifying'; tokenHash: string }
  | { status: 'verified'; tokenHash: string; link: VerifiedLink; saving: boolean; failure: SaveFailure | null }
  | { status: 'unverified'; tokenHash: string }
  | { status: 'invalid'; tokenHash: string | null }
  | { status: 'done'; tokenHash: string; email: string };

let current: LinkState | null = null;
const listeners = new Set<() => void>();

export const readLink = (): LinkState | null => current;
export function subscribeLink(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
function setLink(next: LinkState | null): void {
  current = next;
  listeners.forEach((listener) => listener());
}
/** Leaving the page, or tests: the token goes with it. */
export function forgetLink(): void {
  if (current) setLink(null);
}
export function markInvalid(tokenHash: string | null): void {
  setLink({ status: 'invalid', tokenHash });
}

/** One verification per code: busy from the request until its answer is handled (spec W8). */
export function startVerification(tokenHash: string): void {
  setLink({ status: 'verifying', tokenHash });
  void trackBusy(
    linkClient.verify(tokenHash).then((result) => {
      // Left the page meanwhile: the answer is dropped with the code.
      if (current?.status !== 'verifying' || current.tokenHash !== tokenHash) return;
      if (result.ok) setLink({ status: 'verified', tokenHash, link: result.link, saving: false, failure: null });
      // Network, a lost answer or anything unexpected: Auth may have used the code already.
      else setLink(result.reason === 'invalid_link' ? { status: 'invalid', tokenHash } : { status: 'unverified', tokenHash });
    })
  );
}

/** One save with the verified token; a recoverable failure keeps it for a new attempt. */
export async function saveWithLink(password: string): Promise<void> {
  const state = current;
  if (state?.status !== 'verified' || state.saving) return;
  setLink({ ...state, saving: true, failure: null });
  const result = await trackBusy(linkClient.save(state.link, password));
  const now = current;
  if (now?.status !== 'verified' || now.link !== state.link) return;
  if (result.ok) setLink({ status: 'done', tokenHash: state.tokenHash, email: state.link.email });
  else if (result.reason === 'invalid_link' || result.reason === 'session_expired') setLink({ status: 'invalid', tokenHash: state.tokenHash });
  else setLink({ ...now, saving: false, failure: result.reason });
}
