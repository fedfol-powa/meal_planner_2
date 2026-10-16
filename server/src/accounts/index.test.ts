import { describe, expect, it, vi } from 'vitest';
import { AccountServiceError, createInvitedAccount, deleteAccount } from './index.ts';

const env = { SUPABASE_URL: 'https://auth.test', SUPABASE_SECRET_KEY: 'sb_secret_x' };
const account = { id: '11111111-1111-4111-8111-111111111111', email: 'new@x.it', password: 'segreta123', displayName: 'Nuova', locale: 'it-IT' as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sameUser = () => json(200, { id: account.id, email: 'new@x.it' });
const methods = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([, init]) => (init as RequestInit).method);

describe('createInvitedAccount', () => {
	it('creates a confirmed user with the reserved id, the secret key in apikey and no bearer', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'created' });
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe('https://auth.test/auth/v1/admin/users');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({
			id: account.id, email: 'new@x.it', password: 'segreta123', email_confirm: true,
			user_metadata: { display_name: 'Nuova', locale: 'it-IT' },
		});
	});

	it('email_exists with the reserved id and the invitation email is the earlier creation: existing, never a PUT', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'email_exists' })).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'existing' });
		expect(fetch.mock.calls[1]![0]).toBe(`https://auth.test/auth/v1/admin/users/${account.id}`);
		expect(methods(fetch)).toEqual(['POST', 'GET']);
	});

	it('an ambiguous answer (500, timeout) is reconciled by reading the reserved id', async () => {
		const after500 = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch: after500 })).toEqual({ status: 'existing' });
		const afterTimeout = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch: afterTimeout })).toEqual({ status: 'existing' });
		expect(methods(afterTimeout)).toEqual(['POST', 'GET']);
	});

	it('email_taken: email_exists and no user with the id, or the id with another email', async () => {
		const missing = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'email_exists' })).mockResolvedValueOnce(json(404, { error_code: 'user_not_found' }));
		expect(await createInvitedAccount(env, account, { fetch: missing })).toEqual({ status: 'email_taken' });
		const other = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(200, { id: account.id, email: 'else@x.it' }));
		expect(await createInvitedAccount(env, account, { fetch: other })).toEqual({ status: 'email_taken' });
	});

	it('a service error when the creation did not happen or cannot be checked', async () => {
		const notCreated = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(404, {}));
		await expect(createInvitedAccount(env, account, { fetch: notCreated })).rejects.toBeInstanceOf(AccountServiceError);
		const unreadable = vi.fn().mockResolvedValueOnce(json(500, {})).mockRejectedValueOnce(new TypeError('down'));
		await expect(createInvitedAccount(env, account, { fetch: unreadable })).rejects.toBeInstanceOf(AccountServiceError);
		await expect(createInvitedAccount({ SUPABASE_URL: env.SUPABASE_URL }, account)).rejects.toThrow('auth_admin_key_missing');
	});

	it('never puts the password in the error', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(500, { msg: 'segreta123' })).mockResolvedValueOnce(json(404, {}));
		const error = await createInvitedAccount(env, account, { fetch }).catch((e) => e);
		expect(String(error.message)).not.toContain('segreta123');
	});
});

describe('createInvitedAccount and the password policy of Auth', () => {
	it('a password refused as weak creates nothing and says so', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'weak_password' })).mockResolvedValueOnce(json(404, { error_code: 'user_not_found' }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'weak_password' });
	});
});

describe('createInvitedAccount with beforeCreate', () => {
	it('skips the POST when beforeCreate answers true', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch, beforeCreate: async () => true })).toEqual({ status: 'skipped' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('creates when beforeCreate answers false', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch, beforeCreate: async () => false })).toEqual({ status: 'created' });
		expect(methods(fetch)).toEqual(['POST']);
	});
});

describe('deleteAccount', () => {
	const id = account.id;

	it('deletes with the apikey header and no Authorization', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, {}));
		expect(await deleteAccount(env, id, { fetch })).toBe('deleted');
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe(`https://auth.test/auth/v1/admin/users/${id}`);
		expect(init.method).toBe('DELETE');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		// A hard delete: no should_soft_delete in the body.
		expect(init.body).toBeUndefined();
	});

	it('treats 204 as deleted', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
		expect(await deleteAccount(env, id, { fetch })).toBe('deleted');
	});

	it('treats 404 user_not_found as absent', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(404, { error_code: 'user_not_found' }));
		expect(await deleteAccount(env, id, { fetch })).toBe('absent');
	});

	it('throws auth_admin_failed with the status on 500', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(500, {}));
		const error = await deleteAccount(env, id, { fetch }).catch((e) => e);
		expect(error).toBeInstanceOf(AccountServiceError);
		expect(error.reason).toBe('auth_admin_failed');
		expect(error.status).toBe(500);
	});

	it('throws auth_admin_failed on a 404 that is not user_not_found', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('not found', { status: 404 }));
		await expect(deleteAccount(env, id, { fetch })).rejects.toThrow('auth_admin_failed');
	});

	it('throws auth_admin_failed on network failure', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new TypeError('down'); });
		const error = await deleteAccount(env, id, { fetch }).catch((e) => e);
		expect(error.reason).toBe('auth_admin_failed');
		expect(error.status).toBeNull();
	});

	it('throws auth_admin_key_missing without a key', async () => {
		await expect(deleteAccount({ SUPABASE_URL: env.SUPABASE_URL }, id)).rejects.toThrow('auth_admin_key_missing');
	});
});
