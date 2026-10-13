import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, validatePasswordChange } from './passwordChange';

const valid = { current: 'old-password', next: 'new-password', confirm: 'new-password' };

describe('validatePasswordChange', () => {
  it('accepts a complete, different, confirmed password', () => {
    expect(validatePasswordChange(valid)).toEqual({});
  });
  it('asks for every field', () => {
    expect(validatePasswordChange({ current: '', next: '', confirm: '' })).toEqual({ current: 'required', next: 'required', confirm: 'required' });
  });
  it('needs at least 8 characters, counting code points', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePasswordChange({ ...valid, next: 'abcdefg', confirm: 'abcdefg' }).next).toBe('too_short');
    expect(validatePasswordChange({ ...valid, next: 'abcdefgh', confirm: 'abcdefgh' })).toEqual({});
    // Seven letters, one of them accented (two bytes in UTF-8): still seven characters.
    expect(validatePasswordChange({ ...valid, next: 'perché1', confirm: 'perché1' }).next).toBe('too_short');
  });
  it('refuses more than 72 bytes, bcrypt’s limit', () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    const at = 'a'.repeat(72);
    const over = 'a'.repeat(71) + 'è';
    expect(validatePasswordChange({ ...valid, next: at, confirm: at })).toEqual({});
    expect(validatePasswordChange({ ...valid, next: over, confirm: over }).next).toBe('too_long');
  });
  it('keeps spaces: they are part of the password', () => {
    const spaced = '  new-password  ';
    expect(validatePasswordChange({ ...valid, next: spaced, confirm: spaced })).toEqual({});
    expect(validatePasswordChange({ ...valid, next: spaced, confirm: 'new-password' }).confirm).toBe('mismatch');
    expect(validatePasswordChange({ current: 'secret-one ', next: 'secret-one', confirm: 'secret-one' })).toEqual({});
  });
  it('wants the confirmation equal to the new password', () => {
    expect(validatePasswordChange({ ...valid, confirm: 'new-passwork' })).toEqual({ confirm: 'mismatch' });
  });
  it('wants a new password different from the current one', () => {
    expect(validatePasswordChange({ current: 'same-password', next: 'same-password', confirm: 'same-password' })).toEqual({ next: 'same_as_current' });
  });
  it('reports several fields at once', () => {
    expect(validatePasswordChange({ current: '', next: 'short', confirm: 'other' })).toEqual({ current: 'required', next: 'too_short', confirm: 'mismatch' });
  });
});
