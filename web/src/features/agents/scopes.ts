import type { MessageKey } from '../../i18n/translate';

/** OIDC scopes Supabase offers: what the agent receives at sign-in, not what it can do. */
const SCOPES: Record<string, MessageKey> = {
  openid: 'authorize.scope.openid',
  email: 'authorize.scope.email',
  profile: 'authorize.scope.profile',
  phone: 'authorize.scope.phone',
  offline_access: 'authorize.scope.offline_access'
};

/** The sentence for a requested scope; null for an unknown one, shown as it is. */
export function scopeKey(scope: string): MessageKey | null {
  return Object.hasOwn(SCOPES, scope) ? SCOPES[scope]! : null;
}
