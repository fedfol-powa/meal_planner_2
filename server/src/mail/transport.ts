import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';

const TIMEOUT_MS = 10_000;
const SENDER = { name: 'Cosa si mangia', email: 'noreply@cosasimangia.app' };

export interface EmailMessage {
	to: string;
	subject: string;
	html?: string;
	text: string;
	/** Resend keeps it 24 hours; the same key with another payload answers 409. */
	idempotencyKey?: string;
}

/** `code`: the error name Resend answered (for example `invalid_idempotent_request`). */
export type SendResult = { ok: true } | { ok: false; status: number | null; code?: string };

/**
 * One email, one request (spec W15, sections 2 and 5): the Resend API in production, Mailpit's
 * send API when `MAILPIT_API_URL` is set (local stack and CI only). No retries here; never logs
 * addresses, subjects or bodies.
 */
export async function sendEmail(
	env: Pick<Env, 'RESEND_API_KEY' | 'MAILPIT_API_URL'>,
	message: EmailMessage,
	options: { fetch?: typeof fetch } = {},
): Promise<SendResult> {
	const request = env.MAILPIT_API_URL ? mailpitRequest(env.MAILPIT_API_URL, message) : env.RESEND_API_KEY ? resendRequest(env.RESEND_API_KEY, message) : null;
	if (!request) {
		logEvent('mail_not_configured', {}, 'error');
		return { ok: false, status: null };
	}
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(request.url, { ...request.init, signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch {
		return { ok: false, status: null };
	}
	if (response.ok) return { ok: true };
	const code = await errorName(response);
	return code ? { ok: false, status: response.status, code } : { ok: false, status: response.status };
}

function resendRequest(key: string, message: EmailMessage) {
	const headers: Record<string, string> = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
	if (message.idempotencyKey) headers['idempotency-key'] = message.idempotencyKey;
	return {
		url: 'https://api.resend.com/emails',
		init: {
			method: 'POST',
			headers,
			body: JSON.stringify({
				from: `${SENDER.name} <${SENDER.email}>`,
				to: [message.to],
				subject: message.subject,
				...(message.html === undefined ? {} : { html: message.html }),
				text: message.text,
			}),
		},
	};
}

function mailpitRequest(base: string, message: EmailMessage) {
	return {
		url: new URL('/api/v1/send', base).toString(),
		init: {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				From: { Name: SENDER.name, Email: SENDER.email },
				To: [{ Email: message.to }],
				Subject: message.subject,
				Text: message.text,
				...(message.html === undefined ? {} : { HTML: message.html }),
			}),
		},
	};
}

async function errorName(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as { name?: unknown } | null;
		return typeof body?.name === 'string' ? body.name : undefined;
	} catch {
		return undefined;
	}
}
