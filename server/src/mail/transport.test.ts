import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from './transport.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const message = { to: 'ops@x.it', subject: 'Oggetto', html: '<p>Ciao</p>', text: 'Ciao' };
const logs = () => vi.mocked(console.log).mock.calls.concat(vi.mocked(console.error).mock.calls).map(([line]) => String(line));

describe('sendEmail', () => {
	afterEach(() => vi.restoreAllMocks());
	const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); };

	it('posts to Resend with the bearer key, the fixed sender and no idempotency key unless given', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: 'e1' }));
		expect(await sendEmail({ RESEND_API_KEY: 're_x' }, message, { fetch })).toEqual({ ok: true });
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		const headers = new Headers(init.headers);
		expect(headers.get('authorization')).toBe('Bearer re_x');
		expect(headers.get('idempotency-key')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({
			from: 'Cosa si mangia <noreply@cosasimangia.app>', to: ['ops@x.it'], subject: 'Oggetto', html: '<p>Ciao</p>', text: 'Ciao',
		});
	});

	it('sends the idempotency key when given', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { id: 'e1' }));
		await sendEmail({ RESEND_API_KEY: 're_x' }, { ...message, idempotencyKey: 'weekly_job_overdue/f:2026-10-12' }, { fetch });
		const [, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(new Headers(init.headers).get('idempotency-key')).toBe('weekly_job_overdue/f:2026-10-12');
	});

	it('answers the status and the error name of a refusal, null without an answer', async () => {
		quiet();
		const conflict = vi.fn<typeof globalThis.fetch>(async () => json(409, { name: 'invalid_idempotent_request', message: 'x' }));
		expect(await sendEmail({ RESEND_API_KEY: 're_x' }, message, { fetch: conflict })).toEqual({ ok: false, status: 409, code: 'invalid_idempotent_request' });
		const down = vi.fn<typeof globalThis.fetch>(async () => { throw new TypeError('down'); });
		expect(await sendEmail({ RESEND_API_KEY: 're_x' }, message, { fetch: down })).toEqual({ ok: false, status: null });
		expect(logs().join('\n')).not.toContain('@');
	});

	it('uses Mailpit when MAILPIT_API_URL is set, even with a Resend key', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { ID: 'm1' }));
		expect(await sendEmail({ RESEND_API_KEY: 're_x', MAILPIT_API_URL: 'http://127.0.0.1:54324' }, message, { fetch })).toEqual({ ok: true });
		const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:54324/api/v1/send');
		expect(new Headers(init.headers).get('authorization')).toBeNull();
		expect(JSON.parse(init.body as string)).toEqual({
			From: { Name: 'Cosa si mangia', Email: 'noreply@cosasimangia.app' }, To: [{ Email: 'ops@x.it' }], Subject: 'Oggetto', Text: 'Ciao', HTML: '<p>Ciao</p>',
		});
	});

	it('without Resend nor Mailpit: no request, mail_not_configured', async () => {
		quiet();
		const fetch = vi.fn<typeof globalThis.fetch>();
		expect(await sendEmail({}, message, { fetch })).toEqual({ ok: false, status: null });
		expect(fetch).not.toHaveBeenCalled();
		expect(logs().some((line) => JSON.parse(line).event === 'mail_not_configured')).toBe(true);
	});
});
