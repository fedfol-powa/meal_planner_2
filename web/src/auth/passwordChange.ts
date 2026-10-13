/** Checks of the password form before anything is sent (spec «Validazione del modulo»). */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads at most 72 bytes: Supabase refuses longer passwords (`validation_failed`). */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordField = 'current' | 'next' | 'confirm';
export type PasswordFieldError = 'required' | 'too_short' | 'too_long' | 'mismatch' | 'same_as_current';
export type PasswordFieldErrors = Partial<Record<PasswordField, PasswordFieldError>>;

/** Passwords are taken as typed: no trimming, spaces count. */
export function validatePasswordChange({ current, next, confirm }: Record<PasswordField, string>): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  if (!current) errors.current = 'required';
  if (!next) errors.next = 'required';
  else if ([...next].length < PASSWORD_MIN_LENGTH) errors.next = 'too_short';
  else if (new TextEncoder().encode(next).length > PASSWORD_MAX_BYTES) errors.next = 'too_long';
  else if (next === current) errors.next = 'same_as_current';
  if (!confirm) errors.confirm = 'required';
  else if (next && confirm !== next) errors.confirm = 'mismatch';
  return errors;
}
