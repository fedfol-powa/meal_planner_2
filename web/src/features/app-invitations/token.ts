import type { MessageKey } from '../../i18n/messages';

/** The pages of the invitation links (app and family): the token in the fragment, the account form. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The fragment of the router's history, without `#` (the router state has it without). */
export const fragment = (hash: string) => hash.replace(/^#/, '');

export type AccountField = 'email' | 'name';
export interface AccountValues { email: string; name: string }

/** The checks before sending the account form. */
export function accountFormErrors(values: AccountValues): Partial<Record<AccountField, MessageKey>> {
  return values.name.trim() ? {} : { name: 'invite.nameMissing' };
}
