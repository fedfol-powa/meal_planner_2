// Authorization server metadata of Supabase Auth, mirrored for MCP discovery. Only the
// resolved document is cached: requests must not share in-flight fetches.
let cached: { url: string; metadata: unknown } | undefined;

export async function supabaseAuthMetadata(supabaseUrl: string): Promise<any> {
	if (cached?.url === supabaseUrl) return cached.metadata;
	let response = await fetch(`${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`);
	// The local stack's gateway does not route the RFC 8414 path; Auth serves the same document under its own.
	if (response.status === 404) response = await fetch(`${supabaseUrl}/auth/v1/.well-known/oauth-authorization-server`);
	if (!response.ok) throw new Error(`OAuth server metadata unavailable: ${response.status}`);
	const metadata = await response.json();
	cached = { url: supabaseUrl, metadata };
	return metadata;
}
