import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountServiceError, createInvitedAccount, deleteAccount, generatePasswordLink, sendPasswordEmail, updateAccountLocale } from './index.ts';

const env = { SUPABASE_URL: 'https://auth.test', SUPABASE_SECRET_KEY: 'sb_secret_x' };
const account = { id: '11111111-1111-4111-8111-111111111111', email: 'new@x.it', displayName: 'Nuova', locale: 'it-IT' as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sameUser = (confirmed = false) => json(200, { id: account.id, email: 'new@x.it', email_confirmed_at: confirmed ? '2026-10-17T08:00:00Z' : null });
const methods = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(([, init]) => (init as RequestInit).method);

describe('createInvitedAccount', () => {
	it('creates a user with the email to confirm, no password, the reserved id, the secret key in apikey and no bearer', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id }));
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'created' });
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe('https://auth.test/auth/v1/admin/users');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({
			id: account.id, email: 'new@x.it', email_confirm: false,
			user_metadata: { display_name: 'Nuova', locale: 'it-IT' },
		});
	});

	it('email_exists with the reserved id and the invitation email is the earlier creation: existing, never a PUT', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'email_exists' })).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch })).toEqual({ status: 'existing', confirmed: false });
		expect(fetch.mock.calls[1]![0]).toBe(`https://auth.test/auth/v1/admin/users/${account.id}`);
		expect(methods(fetch)).toEqual(['POST', 'GET']);
	});

	it('an ambiguous answer (500, timeout) is reconciled by reading the reserved id', async () => {
		const after500 = vi.fn().mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(sameUser());
		expect(await createInvitedAccount(env, account, { fetch: after500 })).toEqual({ status: 'existing', confirmed: false });
		const afterTimeout = vi.fn().mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(sameUser(true));
		expect(await createInvitedAccount(env, account, { fetch: afterTimeout })).toEqual({ status: 'existing', confirmed: true });
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

	it('never puts the email in the error', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(500, { msg: 'new@x.it' })).mockResolvedValueOnce(json(404, {}));
		const error = await createInvitedAccount(env, account, { fetch }).catch((e) => e);
		expect(String(error.message)).not.toContain('new@x.it');
	});

	it('a 422 that is not email_exists, without the user, is a service error (no weak_password any more)', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json(422, { error_code: 'weak_password' })).mockResolvedValueOnce(json(404, { error_code: 'user_not_found' }));
		await expect(createInvitedAccount(env, account, { fetch })).rejects.toBeInstanceOf(AccountServiceError);
	});
});

const logLines = () => vi.mocked(console.log).mock.calls.concat(vi.mocked(console.error).mock.calls).map(([line]) => String(line));
const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); };

describe('generatePasswordLink (spec W15, section 2)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('asks Auth for a recovery link with the secret key and builds the app link with the hashed token in the fragment', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id, hashed_token: 'h4sh', action_link: 'https://auth.test/verify?token=x' }));
		expect(await generatePasswordLink(env, 'new@x.it', 'https://cosasimangia.app', { fetch })).toEqual({
			status: 'ok', url: 'https://cosasimangia.app/password#token_hash=h4sh&type=recovery',
		});
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe('https://auth.test/auth/v1/admin/generate_link');
		expect(init.method).toBe('POST');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({ type: 'recovery', email: 'new@x.it' });
	});

	it('404: absent, the account is gone', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(404, { error_code: 'user_not_found' }));
		expect(await generatePasswordLink(env, 'new@x.it', 'https://cosasimangia.app', { fetch })).toEqual({ status: 'absent' });
	});

	it('500, network or no token: failed, logged with the status only', async () => {
		quiet();
		const broken = vi.fn<typeof globalThis.fetch>(async () => json(500, { msg: 'new@x.it' }));
		expect(await generatePasswordLink(env, 'new@x.it', 'https://cosasimangia.app', { fetch: broken })).toEqual({ status: 'failed' });
		const down = vi.fn<typeof globalThis.fetch>(async () => { throw new TypeError('down'); });
		expect(await generatePasswordLink(env, 'new@x.it', 'https://cosasimangia.app', { fetch: down })).toEqual({ status: 'failed' });
		const empty = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: account.id }));
		expect(await generatePasswordLink(env, 'new@x.it', 'https://cosasimangia.app', { fetch: empty })).toEqual({ status: 'failed' });
		const lines = logLines();
		expect(lines.map((l) => JSON.parse(l).event)).toEqual(['auth_generate_link_failed', 'auth_generate_link_failed', 'auth_generate_link_failed']);
		expect(JSON.parse(lines[0]!).status).toBe(500);
		expect(lines.join('\n')).not.toMatch(/@|h4sh|token/);
	});

	it('throws auth_admin_key_missing without a key', async () => {
		await expect(generatePasswordLink({ SUPABASE_URL: env.SUPABASE_URL }, 'new@x.it', 'https://x')).rejects.toThrow('auth_admin_key_missing');
	});
});

describe('sendPasswordEmail', () => {
	afterEach(() => vi.restoreAllMocks());
	const mailEnv = { ...env, MAILPIT_API_URL: 'http://mailpit.test' };
	const route = (link: Response, mail: Response | 'down') =>
		vi.fn<typeof globalThis.fetch>(async (input) => {
			if (String(input).includes('generate_link')) return link.clone();
			if (mail === 'down') throw new TypeError('down');
			return mail.clone();
		});

	it('generates the link and sends one email with it, in the language given, with the family name', async () => {
		const fetch = route(json(200, { hashed_token: 'h4sh' }), json(200, { ID: 'm' }));
		expect(await sendPasswordEmail(mailEnv, { email: 'new@x.it', locale: 'en-GB', familyName: 'Smith' }, 'https://cosasimangia.app', { fetch })).toBe('sent');
		expect(fetch).toHaveBeenCalledTimes(2);
		const body = JSON.parse((fetch.mock.calls[1]![1] as RequestInit).body as string);
		expect(body.To).toEqual([{ Email: 'new@x.it' }]);
		expect(body.Subject).toBe('Choose your password for Cosa si mangia');
		expect(body.Text).toContain('https://cosasimangia.app/password#token_hash=h4sh&type=recovery');
		expect(body.Text).toContain('Smith');
	});

	it('absent when the account is gone: no email', async () => {
		const fetch = route(json(404, {}), json(200, {}));
		expect(await sendPasswordEmail(mailEnv, { email: 'new@x.it', locale: 'it-IT', familyName: null }, 'https://x', { fetch })).toBe('absent');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('failed when the link or the sending fail, without retries', async () => {
		quiet();
		const noLink = route(json(500, {}), json(200, {}));
		expect(await sendPasswordEmail(mailEnv, { email: 'new@x.it', locale: 'it-IT', familyName: null }, 'https://x', { fetch: noLink })).toBe('failed');
		expect(noLink).toHaveBeenCalledTimes(1);
		const noMail = route(json(200, { hashed_token: 'h' }), 'down');
		expect(await sendPasswordEmail(mailEnv, { email: 'new@x.it', locale: 'it-IT', familyName: null }, 'https://x', { fetch: noMail })).toBe('failed');
		expect(noMail).toHaveBeenCalledTimes(2);
	});
});

describe('updateAccountLocale', () => {
	afterEach(() => vi.restoreAllMocks());

	it('puts only the locale in the user metadata, with the secret key', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, {}));
		await updateAccountLocale(env, account.id, 'en-GB', { fetch });
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe(`https://auth.test/auth/v1/admin/users/${account.id}`);
		expect(init.method).toBe('PUT');
		expect(new Headers(init.headers).get('apikey')).toBe('sb_secret_x');
		expect(JSON.parse(init.body as string)).toEqual({ user_metadata: { locale: 'en-GB' } });
	});

	it('throws a service error on a failure', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(500, {}));
		await expect(updateAccountLocale(env, account.id, 'en-GB', { fetch })).rejects.toBeInstanceOf(AccountServiceError);
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
