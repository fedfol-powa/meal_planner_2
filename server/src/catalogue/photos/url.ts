/** Addresses an agent may pass to `setPhotoFromUrl` (spec section 5). */
const MAX_LENGTH = 2048;
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa', '.workers.dev', '.supabase.co'];
const BLOCKED_HOSTS = new Set(['localhost', 'workers.dev', 'supabase.co']);

/**
 * The URL when it is a public https address, otherwise null. Workers do not reach private
 * networks, but the check stays explicit: no IP literals, no internal names, not the app.
 */
export function allowedImageUrl(raw: string, appHost: string): URL | null {
	if (raw.length > MAX_LENGTH) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
	// The parser turns hexadecimal, octal and integer IPv4 forms into dotted decimals.
	// One trailing dot is the absolute form of a name; empty labels (`localhost..`, `a..b`) are refused.
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	if (host.startsWith('[') || /^[\d.]+$/.test(host) || host.split('.').includes('')) return null;
	if (!host.includes('.') || BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
	if (host === appHost.toLowerCase()) return null;
	return url;
}
