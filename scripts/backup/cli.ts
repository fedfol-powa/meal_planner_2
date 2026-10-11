/**
 * Arguments and destination of the restore CLI, checked before anything is read or connected:
 * a mistyped flag must never turn a dry run into a restore, and a remote destination must never
 * receive the decrypted export without a verified TLS connection.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

export type Command =
	| { command: 'inspect'; file: string; ref: string }
	| { command: 'restore'; file: string; dryRun: boolean; acceptUnknownMigrations: boolean };

/** Invalid command line: the CLI prints the usage and exits with 2. */
export class UsageError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'UsageError';
	}
}

/** Destination refused before connecting: the reason is the whole message, never the URL. */
export class DestinationError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'DestinationError';
	}
}

export const USAGE = 'usage: node scripts/backup/restore.ts inspect <file> [--ref <ref>] | restore <file> [--dry-run] [--accept-unknown-migrations]';

const OPTIONS = {
	inspect: { ref: { type: 'string' } },
	restore: { 'dry-run': { type: 'boolean' }, 'accept-unknown-migrations': { type: 'boolean' } },
} as const;

/** Strict: unknown options, values given to flags and extra arguments are all refused. */
export function parseCommand(argv: string[]): Command {
	const [command, ...rest] = argv;
	if (command !== 'inspect' && command !== 'restore') throw new UsageError('command');
	let parsed;
	try {
		parsed = parseArgs({ args: rest, options: OPTIONS[command], strict: true, allowPositionals: true, allowNegative: false });
	} catch {
		throw new UsageError('options');
	}
	const { values, positionals } = parsed as { values: Record<string, string | boolean | undefined>; positionals: string[] };
	if (positionals.length !== 1 || positionals[0] === '') throw new UsageError('file');
	const [file] = positionals;
	if (command === 'inspect') {
		const ref = values.ref ?? 'origin/main';
		if (typeof ref !== 'string' || ref === '' || ref.startsWith('-')) throw new UsageError('ref');
		return { command, file, ref };
	}
	return { command, file, dryRun: values['dry-run'] === true, acceptUnknownMigrations: values['accept-unknown-migrations'] === true };
}

/** The local Supabase stack serves Postgres without TLS: the only destinations exempted. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type Destination = { url: string; ssl: false | { rejectUnauthorized: true; ca?: string } };

/**
 * Connection of the destination. Remote: `sslmode=verify-full` is required (certificate chain
 * and host name checked), with `sslrootcert=<file>` for a private CA such as Supabase's, or
 * `sslrootcert=system` for the system store. Both parameters are consumed here and never left
 * to the client, whose own reading of them would also accept unverified modes.
 */
export function destinationOf(databaseUrl: string, readCa: (path: string) => string = (path) => readFileSync(path, 'utf8')): Destination {
	let url: URL;
	try {
		url = new URL(databaseUrl);
	} catch {
		throw new DestinationError('url');
	}
	if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new DestinationError('url');
	if (url.hostname === '' || url.hostname.includes(',')) throw new DestinationError('host');
	if (url.searchParams.has('ssl')) throw new DestinationError('ssl_parameter');
	const mode = url.searchParams.get('sslmode');
	const rootCert = url.searchParams.get('sslrootcert');
	url.searchParams.delete('sslmode');
	url.searchParams.delete('sslrootcert');

	if (LOCAL_HOSTS.has(url.hostname) && mode === null && rootCert === null) return { url: url.toString(), ssl: false };
	if (mode !== 'verify-full') throw new DestinationError('tls_required');
	if (rootCert === null || rootCert === 'system') return { url: url.toString(), ssl: { rejectUnauthorized: true } };
	let ca: string;
	try {
		ca = readCa(rootCert);
	} catch {
		throw new DestinationError('sslrootcert');
	}
	return { url: url.toString(), ssl: { rejectUnauthorized: true, ca } };
}
