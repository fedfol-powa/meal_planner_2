import { describe, expect, it } from 'vitest';
import { ApiError, errorKey, isBlocking, toApiError } from './errors';

describe('api errors', () => {
  it('keeps API errors and wraps everything else', () => {
    const notFound = new ApiError('not_found');
    expect(toApiError(notFound)).toBe(notFound);
    expect(toApiError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toApiError('boom').code).toBe('unknown');
  });
  it('maps codes to message keys', () => {
    expect(errorKey(new ApiError('forbidden'))).toBe('errors.forbidden');
    expect(errorKey(new Error('x'))).toBe('errors.unknown');
  });
  it('lets only network errors keep cached data on screen', () => {
    expect(isBlocking(new ApiError('network'), true)).toBe(false);
    expect(isBlocking(new ApiError('network'), false)).toBe(true);
    expect(isBlocking(new ApiError('forbidden'), true)).toBe(true);
  });
});
