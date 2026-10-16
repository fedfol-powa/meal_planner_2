import type { MessageKey } from '../../i18n/messages';

/** The pages of the invitation links (app and family): the token in the fragment, the account form. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The fragment of the router's history, without `#` (the router state has it without). */
export const fragment = (hash: string) => hash.replace(/^#/, '');

const PASSWORD_MIN = 8;
/** bcrypt's limit, in UTF-8 bytes (spec W9). */
const PASSWORD_MAX_BYTES = 72;
/** Codes of the password field from the server; any other one is the 72-byte limit. */
export const PASSWORD_ISSUES: Record<string, MessageKey> = { weak_password: 'invite.passwordWeak', password_too_long: 'invite.passwordLong', too_small: 'invite.passwordShort' };

export type AccountField = 'email' | 'name' | 'password' | 'again';
export interface AccountValues { email: string; name: string; password: string; again: string }

/** The checks before sending the account form. */
export function accountFormErrors(values: AccountValues): Partial<Record<AccountField, MessageKey>> {
  const errors: Partial<Record<AccountField, MessageKey>> = {};
  if (!values.name.trim()) errors.name = 'invite.nameMissing';
  if (values.password.length < PASSWORD_MIN) errors.password = 'invite.passwordShort';
  else if (new TextEncoder().encode(values.password).length > PASSWORD_MAX_BYTES) errors.password = 'invite.passwordLong';
  else if (values.password !== values.again) errors.again = 'invite.passwordMismatch';
  return errors;
}

/**
 * The account being closed from an invitation page with «Esci e continua», until its sign-out
 * ends: Supabase may report it once more meanwhile, which is not someone signing in; afterwards it
 * is. Module state: the page remounts when the identity changes.
 */
let closingAccount: string | null = null;

export const isClosingAccount = (userId: string) => userId === closingAccount;

/** «Esci e continua»: signs out the account open on this device, the link stays. */
export function signOutAndContinue(userId: string, signOut: () => Promise<void>): void {
  closingAccount = userId;
  void signOut().finally(() => {
    if (closingAccount === userId) closingAccount = null;
  });
}
