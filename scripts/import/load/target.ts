// Which database a connection string points to, checked before connecting (detail spec, section 2).
// Errors name the variable and the endpoint only: a password never reaches the console.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { destinationOf, DestinationError, type Destination } from '../../backup/cli.ts';

export type Role = 'postgres' | 'app_server';
export type Target = 'production' | 'local';
export interface Endpoint { user: string; host: string; port: string; database: string }
export class TargetError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'TargetError';
	}
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const TLS_PARAMETERS = new Set(['sslmode', 'sslrootcert']);

export const productionRef = (root: string): string =>
	(JSON.parse(readFileSync(resolve(root, 'scripts/production-target.json'), 'utf8')) as { supabaseRef: string }).supabaseRef;

export const describeEndpoint = (e: Endpoint) => `${e.user}@${e.host}:${e.port}/${e.database}`;

export function checkTarget(
	variable: string,
	url: string | undefined,
	options: { role: Role; target: Target; ref: string; readCa?: (path: string) => string },
): { endpoint: Endpoint; destination: Destination } {
	if (!url) throw new TargetError(`${variable} is not set`);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new TargetError(`${variable} is not a valid connection string`);
	}
	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new TargetError(`${variable} is not a postgres connection string`);
	const endpoint: Endpoint = { user: decodeURIComponent(parsed.username), host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.slice(1) };
	const where = `${variable} (${describeEndpoint(endpoint)})`;
	const keys = [...parsed.searchParams.keys()];
	if (options.target === 'local') {
		if (!LOCAL_HOSTS.has(endpoint.host)) throw new TargetError(`${where} is not local`);
		if (keys.length > 0) throw new TargetError(`${where}: no parameter is allowed with --local`);
		if (endpoint.user !== options.role) throw new TargetError(`${where}: the user is not ${options.role}`);
	} else {
		const expected = `${options.role}.${options.ref}`;
		if (endpoint.user !== expected) throw new TargetError(`${where}: the user is not ${expected}`);
		if (!endpoint.host.endsWith('.pooler.supabase.com') || endpoint.host.includes(',')) throw new TargetError(`${where}: not the Supabase session pooler`);
		if (endpoint.port !== '5432') throw new TargetError(`${where}: the session pooler port is 5432`);
		if (endpoint.database !== 'postgres') throw new TargetError(`${where}: the database is postgres`);
		if (keys.some((k) => !TLS_PARAMETERS.has(k)) || keys.length !== new Set(keys).size) throw new TargetError(`${where}: unexpected parameter`);
	}
	try {
		return { endpoint, destination: destinationOf(url, options.readCa) };
	} catch (error) {
		// destinationOf's message is a reason code (tls_required, sslrootcert…), never the URL.
		if (error instanceof DestinationError) throw new TargetError(`${where}: ${error.message}`);
		throw new TargetError(`${where}: invalid destination`);
	}
}

export const clientOptions = (destination: Destination) =>
	({ max: 1, ssl: destination.ssl, fetch_types: false, connect_timeout: 10, onnotice: () => {} }) as const;

export const connect = (destination: Destination, factory: typeof postgres = postgres) => factory(destination.url, clientOptions(destination));
