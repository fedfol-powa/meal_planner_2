// Which database a connection string points to, checked before connecting (detail spec, section 2).
// The check returns the fields of the destination and every client is built from them, never from the
// url: a driver must not read in the url something the check did not see (an encoded comma is a second
// host for Postgres.js). Errors name the variable and the endpoint only: a password never reaches the console.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

export type Role = 'postgres' | 'app_server';
export type Target = 'production' | 'local';
export interface Endpoint { user: string; host: string; port: string; database: string }
export interface Fields { host: string; port: number; database: string; user: string; password: string; caPath: string | null }
export type Ssl = false | { rejectUnauthorized: true; ca: string; servername: string };
export interface Checked { endpoint: Endpoint; fields: Fields; ssl: Ssl }
export class TargetError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'TargetError';
	}
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const DNS_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const POOLER = '.pooler.supabase.com';

export const productionRef = (root: string): string =>
	(JSON.parse(readFileSync(resolve(root, 'scripts/production-target.json'), 'utf8')) as { supabaseRef: string }).supabaseRef;

export const describeEndpoint = (e: Endpoint) => `${e.user}@${e.host}:${e.port}/${e.database}`;

export function checkTarget(
	variable: string,
	url: string | undefined,
	options: { role: Role; target: Target; ref: string; readCa?: (path: string) => string },
): Checked {
	if (!url) throw new TargetError(`${variable} is not set`);
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new TargetError(`${variable} is not a valid connection string`);
	}
	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new TargetError(`${variable} is not a postgres connection string`);
	// Raw parts: for a postgres: url the parser decodes nothing, so what is checked is what is used.
	const endpoint: Endpoint = { user: parsed.username, host: parsed.hostname, port: parsed.port || '5432', database: parsed.pathname.slice(1) };
	const where = `${variable} (${describeEndpoint(endpoint)})`;
	if ([endpoint.user, endpoint.host, endpoint.database, parsed.search].some((part) => part.includes('%'))) throw new TargetError(`${where}: encoded characters outside the password`);
	const keys = [...parsed.searchParams.keys()];
	let password: string;
	try {
		password = decodeURIComponent(parsed.password);
	} catch {
		throw new TargetError(`${variable}: the password is not valid url encoding`);
	}
	const fields: Fields = { host: endpoint.host, port: Number(endpoint.port), database: endpoint.database, user: endpoint.user, password, caPath: null };
	if (options.target === 'local') {
		if (!LOCAL_HOSTS.has(endpoint.host)) throw new TargetError(`${where} is not local`);
		if (keys.length > 0) throw new TargetError(`${where}: no parameter is allowed with --local`);
		if (endpoint.user !== options.role) throw new TargetError(`${where}: the user is not ${options.role}`);
		return { endpoint, fields, ssl: false };
	}
	const expected = `${options.role}.${options.ref}`;
	if (endpoint.user !== expected) throw new TargetError(`${where}: the user is not ${expected}`);
	if (!DNS_NAME.test(endpoint.host)) throw new TargetError(`${where}: the host is not one lowercase DNS name`);
	if (!endpoint.host.endsWith(POOLER)) throw new TargetError(`${where}: not the Supabase session pooler`);
	if (endpoint.port !== '5432') throw new TargetError(`${where}: the session pooler port is 5432`);
	if (endpoint.database !== 'postgres') throw new TargetError(`${where}: the database is postgres`);
	if (keys.some((k) => k !== 'sslmode' && k !== 'sslrootcert') || keys.length !== new Set(keys).size) throw new TargetError(`${where}: unexpected parameter`);
	if (parsed.searchParams.get('sslmode') !== 'verify-full') throw new TargetError(`${where}: tls_required (sslmode=verify-full)`);
	const caPath = parsed.searchParams.get('sslrootcert');
	if (!caPath) throw new TargetError(`${where}: sslrootcert is required`);
	let ca: string;
	try {
		ca = (options.readCa ?? ((path: string) => readFileSync(path, 'utf8')))(caPath);
	} catch {
		throw new TargetError(`${where}: sslrootcert is not readable`);
	}
	return { endpoint, fields: { ...fields, caPath }, ssl: { rejectUnauthorized: true, ca, servername: endpoint.host } };
}

export const clientOptions = (checked: Checked) =>
	({ max: 1, ssl: checked.ssl, fetch_types: false, connect_timeout: 10, onnotice: () => {} }) as const;

export const connect = (checked: Checked, factory: typeof postgres = postgres) => {
	const { host, port, database, user, password } = checked.fields;
	return factory({ host, port, database, username: user, password, ...clientOptions(checked) });
};

/** psql's connection string, without the password (it goes in PGPASSWORD) and without TLS (psqlTlsEnv).
 * Only checked fields: lowercase DNS name, number, fixed database and user, nothing to quote. */
export function psqlConninfo(checked: Checked): string {
	const { host, port, database, user } = checked.fields;
	return `host=${host} port=${port} dbname=${database} user=${user}`;
}

/** psql's TLS, in its environment like the password: a certificate path never becomes conninfo text,
 * where a space or a quote would start another parameter (second review of PR #34, finding 2). */
export function psqlTlsEnv(checked: Checked): Record<string, string> {
	return checked.ssl ? { PGSSLMODE: 'verify-full', PGSSLROOTCERT: checked.fields.caPath! } : { PGSSLMODE: 'disable' };
}

/** The --db-url of the Supabase CLI, without the password (it goes in PGPASSWORD). */
export function dbUrlWithoutPassword(checked: Checked): string {
	const { host, port, database, user, caPath } = checked.fields;
	const query = `?${new URLSearchParams(checked.ssl ? { sslmode: 'verify-full', sslrootcert: caPath! } : { sslmode: 'disable' })}`;
	return `postgresql://${user}@${host}:${port}/${database}${query}`;
}
