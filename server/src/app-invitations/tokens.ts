/** 32 random bytes, base64url without padding (43 characters). */
export function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 as hex: sent as `decode(hex, 'hex')`, so no bytea serializer is needed. */
export async function hashTokenHex(token: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The token in the fragment: never sent to a server, never in a log or a Referer (spec W9). */
export function invitationUrl(origin: string, token: string): string {
	return `${new URL('/invite/app', origin).toString()}#${token}`;
}
