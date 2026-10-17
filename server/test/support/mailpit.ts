/**
 * Mailpit of the local stack (spec W15, section 8): the emails of Supabase Auth and, with
 * `MAILPIT_API_URL` in the Worker's environment, those of the server. Stack tests only.
 */
export const MAILPIT_API_URL = process.env.MAILPIT_API_URL || 'http://127.0.0.1:54324';

export interface ReceivedEmail {
	id: string;
	subject: string;
	html: string;
	text: string;
	/** The first link to the app's /password page, from the HTML (else the text); null without one. */
	link: string | null;
}

interface Summary {
	messages: { ID: string; Created: string; To: { Address: string }[] | null }[];
}

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(new URL(path, MAILPIT_API_URL));
	if (!response.ok) throw new Error(`mailpit ${path.split('?')[0]}: ${response.status}`);
	return (await response.json()) as T;
}

const decodeEntities = (value: string) =>
	value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function passwordLink(html: string, text: string): string | null {
	const href = /href="([^"]*\/password#[^"]*)"/.exec(html)?.[1];
	if (href) return decodeEntities(href);
	return /(https?:\/\/\S*\/password#\S+)/.exec(text)?.[1] ?? null;
}

/** IDs of the emails to `address`, newest first, received at or after `after`. */
export async function emailIdsTo(address: string, after?: Date): Promise<string[]> {
	const query = new URLSearchParams({ query: `to:"${address}"`, limit: '50' });
	const { messages } = await getJson<Summary>(`/api/v1/search?${query}`);
	return messages
		.filter((m) => (m.To ?? []).some((to) => to.Address.toLowerCase() === address.toLowerCase()))
		.filter((m) => !after || Date.parse(m.Created) >= after.getTime())
		.map((m) => m.ID);
}

/**
 * The newest email to `address` (received at or after `after`), waiting up to `timeoutMs`
 * for it to arrive; throws when none comes.
 */
export async function latestEmailTo(address: string, options: { after?: Date; timeoutMs?: number } = {}): Promise<ReceivedEmail> {
	const deadline = Date.now() + (options.timeoutMs ?? 10_000);
	for (;;) {
		const [id] = await emailIdsTo(address, options.after);
		if (id) {
			const message = await getJson<{ ID: string; Subject: string; HTML: string; Text: string }>(`/api/v1/message/${id}`);
			return { id: message.ID, subject: message.Subject, html: message.HTML, text: message.Text, link: passwordLink(message.HTML, message.Text) };
		}
		if (Date.now() > deadline) throw new Error('mailpit: no email arrived');
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
}

/** The `token_hash` in the fragment of a /password link. */
export function tokenHashOf(link: string): string {
	const hash = new URLSearchParams(new URL(link).hash.slice(1)).get('token_hash');
	if (!hash) throw new Error('no token_hash in the link');
	return hash;
}

/**
 * What the /password page does with a link (spec W15, section 3): `POST /verify` with the
 * `token_hash`, then `PUT /user` with the verification's own token. `auth` is Auth's base URL
 * (`<stack>/auth/v1`, or the root of a second Auth service); `apikey` only through the gateway.
 */
export async function choosePassword(auth: string, apikey: string | null, link: string, password: string): Promise<{ verified: number; saved: number }> {
	const headers: Record<string, string> = { 'content-type': 'application/json', ...(apikey ? { apikey } : {}) };
	const verify = await fetch(`${auth}/verify`, { method: 'POST', headers, body: JSON.stringify({ type: 'recovery', token_hash: tokenHashOf(link) }) });
	if (!verify.ok) return { verified: verify.status, saved: 0 };
	const { access_token: token } = (await verify.json()) as { access_token: string };
	const save = await fetch(`${auth}/user`, { method: 'PUT', headers: { ...headers, authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
	return { verified: verify.status, saved: save.status };
}
